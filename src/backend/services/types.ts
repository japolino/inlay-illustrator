/**
 * Backend service interfaces (Asset Maid port). Written first so the services, pipeline and analysis modules can be built
 * in parallel. Implementations: src/backend/services/* (factory `createServices`), the chat pipeline in
 * src/backend/pipeline/*, asset analysis in src/backend/analysis/*. Everything host-facing goes through `SpindleHost`
 * (injected, so tests use a fake host; see src/backend/testing/fake-host.ts).
 *
 * Error convention: services throw `RpcFailure` (src/backend/rpc/errors.ts) for typed failures; aborts surface as an
 * `AbortError` DOMException. The router maps everything else to `internal`.
 */
import type { SpindleAPI } from "lumiverse-spindle-types";
import type {
  AnalyzerSettings,
  AssetKind,
  AssetRef,
  CharacterDocument,
  CharacterReferenceType,
  CharacterSummary,
  ChatDataDocument,
  ChatImageGenerationSettings,
  GenerationProvider,
  ImageConnectionSummary,
  InlayConfig,
  LlmConnectionSummary,
  ModelOption,
  ProgressInfo,
  PromptCodecId,
  RosterSource,
  RpcError,
  RpcEventName,
  RpcEvents,
  RuntimeLogEntry,
  UiState,
} from "../../shared/contract/index.js";

/** The Spindle backend API (global `spindle` in production, a fake in tests). */
export type SpindleHost = SpindleAPI;

/* ------------------------------------------------------------------------------------------------
 * Storage (userStorage, contract layout: src/shared/contract/storage.ts)
 * ---------------------------------------------------------------------------------------------- */

export interface StorageService {
  /** Raw JSON (missing file -> fallback; corrupt JSON -> RpcFailure storage-error). */
  readJson<T>(path: string, fallback: T): Promise<T>;
  writeJson(path: string, value: unknown): Promise<void>;
  /** Serialized read-modify-write (one FIFO per path). The mutator may return the same object. */
  updateJson<T>(path: string, fallback: T, mutate: (current: T) => T | Promise<T>): Promise<T>;
  readBinary(path: string): Promise<Uint8Array | null>;
  writeBinary(path: string, data: Uint8Array): Promise<void>;
  /** Missing path is not an error. */
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;

  /** Global settings: merge of config/model.json + settings.json + artists-global.json + anima-artists.json, normalized. */
  loadConfig(): Promise<InlayConfig>;
  /** Serialized; writes only the changed split files as diffs vs defaults. Files from a newer build are never overwritten (storage-error). */
  updateConfig(mutate: (config: InlayConfig) => InlayConfig | Promise<InlayConfig>): Promise<InlayConfig>;
  loadChatImageGenerationSettings(): Promise<ChatImageGenerationSettings>;
  saveChatImageGenerationSettings(settings: ChatImageGenerationSettings): Promise<{ settings: ChatImageGenerationSettings; notice: string }>;
  loadUiState(): Promise<UiState>;
  saveUiState(state: UiState): Promise<void>;

  /** `characters/<id>/asset-maid.json`, normalized (empty document when missing). */
  loadCharacterDocument(characterId: string): Promise<CharacterDocument>;
  hasCharacterDocument(characterId: string): Promise<boolean>;
  /**
   * Serialized per character. `expectedUpdatedAt` = revision guard (AM ASSET_MAID_CHARX_EXTERNAL_CHANGE): mismatch ->
   * RpcFailure `conflict`. Sets `updatedAt`, emits `document.changed`.
   */
  updateCharacterDocument(
    characterId: string,
    mutate: (doc: CharacterDocument) => CharacterDocument | Promise<CharacterDocument>,
    options?: { expectedUpdatedAt?: string; reason?: string },
  ): Promise<CharacterDocument>;

  /** `chats/<chatId>/chat-data.json` via `normalizeChatData` (repairs are logged). */
  loadChatData(chatId: string): Promise<ChatDataDocument>;
  /** Serialized per chat; sets `updatedAt`. Does NOT emit events (the pipeline emits chatData.changed with message keys). */
  updateChatData(chatId: string, mutate: (doc: ChatDataDocument) => ChatDataDocument | Promise<ChatDataDocument>): Promise<ChatDataDocument>;

  /** Delete STORAGE_RESET_PREFIXES (AM factory reset). */
  factoryReset(): Promise<void>;
  /** Delete `characterResetPaths(characterId)` (chats and images stay). */
  resetCharacter(characterId: string): Promise<void>;
}

/* ------------------------------------------------------------------------------------------------
 * LLM (connection profiles; spec/llm.md)
 * ---------------------------------------------------------------------------------------------- */

export type LlmTextPart = { type: "text"; text: string };
/** Base64 without the data: prefix. */
export type LlmImagePart = { type: "image"; data: string; mime_type: string };
export interface LlmMessage { role: "system" | "user" | "assistant"; content: string | Array<LlmTextPart | LlmImagePart> }

export interface LlmCompleteRequest {
  /** Log scope / diagnostics label, e.g. "analyzer", "character-analysis", "artist-extraction". */
  purpose: string;
  messages: LlmMessage[];
  /** json: JSON-mode injection when supported (+ 400 fallback) and lenient JSON extraction into `parsed`. */
  responseMode: "json" | "text";
  /** Optional JSON schema (passed to providers that accept one; the prompt text stays authoritative). */
  schema?: Record<string, unknown>;
  /** Overrides of `config.analysis` for this call. */
  settings?: Partial<AnalyzerSettings>;
  maxTokens?: number;
  temperature?: number;
  /** Extra provider parameters (copied, never mutated). */
  parameters?: Record<string, unknown>;
  /** Retry count override; default `runtime.generationAutoRetryCount` (0..10). 100 ms fixed delay. */
  retries?: number;
  /** What to do when the model cannot read images: drop image parts and retry text-only (default) or fail `unsupported`. */
  visionFallback?: "drop-images" | "fail";
}

export interface LlmCompleteResult {
  raw: string;
  /** `responseMode: "json"` -> lenient JSON value (throws ANALYZER_JSON_PARSE when none); "text" -> raw. */
  parsed: unknown;
  connectionId: string;
  model: string;
  attempts: number;
  usage: Record<string, number>;
  finishReason: string;
  jsonMode: boolean;
  imagesDropped: boolean;
  latencyMs: number;
}

export interface LlmCallOptions {
  signal?: AbortSignal;
  /** Called before each retry (attempt is 1-based for the retry about to run). */
  onRetry?: (info: { attempt: number; total: number; error: RpcError }) => void;
}

/** Engine-compatible analyzer transport (`AnalyzerClient` of src/engine/engine.ts). */
export interface AnalyzerClientLike {
  complete(
    config: Record<string, unknown>,
    messages: Array<{ role: "system" | "user" | "assistant"; content: unknown; [key: string]: unknown }>,
    options?: Record<string, unknown>,
  ): Promise<{ raw: string; parsed: unknown; [key: string]: unknown }>;
}

export interface LlmService {
  /** One logical call: retries (408/429/5xx/timeout/empty/parse) with a fixed 100 ms delay, own timeout, abort. */
  complete(request: LlmCompleteRequest, options?: LlmCallOptions): Promise<LlmCompleteResult>;
  /** Adapter for the engine analyzer (`options.signal`, `options.responseMode`, `options.maxOutputTokens` honoured). */
  analyzerClient(options?: LlmCallOptions & { purpose?: string }): AnalyzerClientLike;
  /** `analysis.vision` auto/supported/unsupported + connection metadata (spec/llm.md §2). */
  supportsVision(settings?: Partial<AnalyzerSettings>): Promise<boolean>;
  listConnections(): Promise<LlmConnectionSummary[]>;
  listModels(connectionId: string): Promise<ModelOption[]>;
  /** Settings "message test" (AM T0t). */
  testMessage(text?: string): Promise<{ ok: boolean; latencyMs: number; reply?: string; error?: RpcError }>;
}

/* ------------------------------------------------------------------------------------------------
 * Images (spindle.imageGen; spec/novelai.md §9)
 * ---------------------------------------------------------------------------------------------- */

export interface ResolvedImageTarget {
  connectionId: string;
  connectionName: string;
  /** Lumiverse provider id of the connection ("novelai", "comfyui", ...). */
  lumiverseProvider: string;
  generationProvider: GenerationProvider;
  promptCodec: PromptCodecId;
  /** `config.image.model` || connection model. */
  model: string;
  isNovelAIV5: boolean;
  comfyuiWorkflowId: string;
}

export interface ImageBytes { data: string; mimeType: string }

export interface NovelAIImageOptions {
  sampler?: string;
  noiseSchedule?: string;
  steps?: number;
  scale?: number;
  cfgRescale?: number;
  qualityToggle?: boolean;
  /** Coordinates on (characters carry centers) -> rawRequestOverride `use_coords:true`. */
  useCoords?: boolean;
  useOrder?: boolean;
  /** Per-character prompts (V4+). Negative per character + center go through `rawRequestOverride`. */
  characters?: Array<{ prompt: string; negativePrompt: string; center?: { x: number; y: number } }>;
  /** Director (character) reference, V4.5 models only (dropped with a log line on V5). */
  characterReferences?: Array<ImageBytes & { strength: number; fidelity: number; type: CharacterReferenceType }>;
  /** img2img through rawRequestOverride `{action:"img2img", parameters:{image, strength, noise}}`. */
  imageToImage?: ImageBytes & { strength: number; noise: number };
  /** Already-final body fields to merge into rawRequestOverride (escape hatch). */
  rawOverride?: Record<string, unknown>;
}

export interface ComfyImageOptions {
  /** img2img / reference source through `resolvedSourceImages` (+ denoise) when the workflow maps `init_image`. */
  sourceImage?: ImageBytes;
  denoise?: number;
  workflowId?: string;
}

export interface ImageGenerateRequest {
  purpose: "chat" | "regenerate" | "outfit" | "reference" | "test";
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  /** "" / undefined = random (NovelAI: non-negative safe integer). */
  seed?: string | number;
  novelai?: NovelAIImageOptions;
  comfy?: ComfyImageOptions;
  ownerCharacterId?: string;
  ownerChatId?: string;
  connectionId?: string;
  model?: string;
  /** Default `runtime.generationAutoRetryCount`; pass 0 when an outer dispatcher (engine) already retries. */
  retries?: number;
  /** Default true: NovelAI requests run one at a time with `runtime.novelaiParallelIntervalSec` between them. */
  queue?: boolean;
  /** Keep the base64 of the result in `dataBase64` (default false). */
  includeData?: boolean;
}

export interface ImageGenerateResult {
  imageId: string;
  url: string;
  width: number;
  height: number;
  seed: string;
  provider: GenerationProvider;
  lumiverseProvider: string;
  model: string;
  mimeType: string;
  dataBase64?: string;
  /** Parameters actually sent (for the zoom view / regeneration). */
  sentParameters: Record<string, unknown>;
  attempts: number;
}

export interface ImageService {
  resolveTarget(overrides?: { connectionId?: string; model?: string }): Promise<ResolvedImageTarget>;
  generate(
    request: ImageGenerateRequest,
    options?: { signal?: AbortSignal; onProgress?: (progress: ProgressInfo) => void },
  ): Promise<ImageGenerateResult>;
  /** Deletes generated images (spindle.images.delete); unknown ids -> "unknown". */
  deleteImages(imageIds: string[]): Promise<Array<{ imageId: string; status: "removed" | "unknown" | "failed" }>>;
  listConnections(): Promise<ImageConnectionSummary[]>;
  listModels(connectionId: string): Promise<ModelOption[]>;
  testConnection(connectionId?: string): Promise<{ ok: boolean; latencyMs: number; error?: RpcError }>;
}

/* ------------------------------------------------------------------------------------------------
 * Image bytes / frontend fetch bridge (src/shared/contract/bridge.ts)
 * ---------------------------------------------------------------------------------------------- */

export interface ImageBytesService {
  /** Bytes of a Lumiverse image id (spindle.images.get -> url) or an `/api/` URL, fetched by the frontend. */
  getImage(ref: { imageId?: string; url?: string }, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<ImageBytes>;
  /** Bytes for an asset reference (gallery / expressions / risu asset / avatar / generated / upload / crop). */
  getAsset(asset: AssetRef, options?: { signal?: AbortSignal }): Promise<ImageBytes>;
  /** JSON of a same-origin REST endpoint through the frontend (e.g. `/api/v1/characters/<id>/gallery`). */
  getJson<T = unknown>(url: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<T>;
  /** Feed frontend messages; true when consumed (fetch-bridge or legacy avatar response). */
  acceptFrontendMessage(message: Record<string, unknown>): boolean;
}

/* ------------------------------------------------------------------------------------------------
 * Sources (Lumiverse character -> Asset Maid Source; spec/data.md §1.1)
 * ---------------------------------------------------------------------------------------------- */

export interface CharacterInfo {
  characterId: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  creatorNotes: string;
  tags: string[];
  avatarImageId: string | null;
  worldBookIds: string[];
  extensions: Record<string, unknown>;
}

export interface WorldBookEntryInfo {
  worldBookId: string;
  entryId: string;
  comment: string;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  disabled: boolean;
  constant: boolean;
  selective: boolean;
  useRegex: boolean;
  order: number;
}
export interface WorldBookInfo { worldBookId: string; name: string; scope: RosterSource["scope"]; entries: WorldBookEntryInfo[] }

/** AM `LoreRecord` (Bue 86140) with Lumiverse ids: id = selectionId = `<worldBookId>:<entryId>`. */
export interface AmLoreRecord {
  kind: "lorebook" | "character-description";
  id: string;
  selectionId: string;
  title: string;
  keys: string[];
  primaryKeys: string[];
  secondaryKeys: string[];
  selective: boolean;
  useRegex: boolean;
  content: string;
  score: number;
  alwaysActive: boolean;
  sourceType: "character" | "module";
  sourceName: string;
  worldBookId?: string;
  entryId?: string;
  runtimePromptKey?: string;
  runtimeOrigin?: { kind: "custom-character"; id: string; origin?: "ai-auto" };
  runtimeSelected?: boolean;
  runtimeBasePrompt?: string;
}
/** AM `Member` (Xue 86398). key = characterId (port mapping). */
export interface AmMember {
  sourceId: string;
  id: string;
  key: string;
  name: string;
  aliases: string[];
  sourceSummary: string;
  lorebooks: AmLoreRecord[];
  originalAssets: AssetRef[];
  outfitGeneratedAssets: AssetRef[];
  chatGeneratedAssets: AssetRef[];
  assetCount: number;
  previewAsset: AssetRef | null;
  characterIndex: number;
  characterTarget: { chaId: string; indexHint?: number };
  assetScope?: "source";
}
/** AM `Source` (Krt 86600) for one Lumiverse character (group chats: one source per member character). */
export interface AmSource {
  id: string;
  index: number;
  characterTarget: { chaId: string; indexHint?: number };
  name: string;
  type: "character" | "group";
  chatCount: number;
  attachedModuleIds: string[];
  activeModuleIds: string[];
  sharedModuleAssets: AssetRef[];
  chatGeneratedAssets: AssetRef[];
  previewAsset: AssetRef | null;
  assetGeneration: string;
  members: AmMember[];
}

export interface PersonaInfo {
  personaId: string;
  name: string;
  description: string;
  avatarImageId: string | null;
  isDefault: boolean;
  attachedWorldBookId: string | null;
  metadata: Record<string, unknown>;
}

export type CharacterImageOrigin = "gallery" | "expression" | "risu-asset" | "avatar" | "generated" | "upload" | "persona";
export interface CharacterImageAsset {
  asset: AssetRef;
  kind: AssetKind;
  origin: CharacterImageOrigin;
  imageId: string;
  /** Display name (gallery caption / expression label / risu asset name / file name). */
  name: string;
  url: string;
  thumbnailUrl: string;
  width?: number;
  height?: number;
}

export interface ChatInfo {
  chatId: string;
  characterId: string;
  /** Group members (empty for single chats). */
  groupCharacterIds: string[];
  personaId: string | null;
  metadata: Record<string, unknown>;
}

export interface SourcesService {
  listCharacters(): Promise<CharacterSummary[]>;
  /** RpcFailure not-found when missing. */
  getCharacter(characterId: string): Promise<CharacterInfo>;
  getActiveChat(): Promise<ChatInfo | null>;
  getChat(chatId: string): Promise<ChatInfo>;
  /**
   * World books usable as roster sources for a character: attached (`world_book_ids`), extra connected
   * (`document.characterPrompt.activeModules[characterId]`), persona-attached, chat-attached, global. With entries.
   */
  loadWorldBooks(characterId: string, document: CharacterDocument, options?: { chatId?: string }): Promise<WorldBookInfo[]>;
  rosterSources(characterId: string, document: CharacterDocument, options?: { chatId?: string }): Promise<RosterSource[]>;
  /** AM Source for the character (lorebook records from connected books + description pseudo lore, assets). */
  buildSource(characterId: string, document: CharacterDocument, options?: { chatId?: string }): Promise<AmSource>;
  listPersonas(): Promise<PersonaInfo[]>;
  getActivePersona(chatId?: string): Promise<PersonaInfo | null>;
  /** Gallery (REST via bridge) + extensions.expressions + extensions.risu_asset_map + avatar + generated (owner_character_id). */
  listCharacterImages(characterId: string, options?: { includeGenerated?: boolean }): Promise<CharacterImageAsset[]>;
  /** Drop cached host data (after CHARACTER_EDITED etc.). */
  invalidate(characterId?: string): void;
}

/* ------------------------------------------------------------------------------------------------
 * Events, status, run log
 * ---------------------------------------------------------------------------------------------- */

export interface EventBus {
  emit<E extends RpcEventName>(event: E, payload: RpcEvents[E]): void;
}

export interface RunLog {
  /** Ring of 250 entries; emits `log.appended`. Also mirrors warn/error to spindle.log. */
  append(level: RuntimeLogEntry["level"], scope: string, message: string, details?: unknown): RuntimeLogEntry;
  list(options?: { sinceSeq?: number; limit?: number }): RuntimeLogEntry[];
  clear(): void;
}

/** Everything per user. Created by `createServices(host, userId)` (src/backend/services/index.ts). */
export interface BackendServices {
  host: SpindleHost;
  userId: string | undefined;
  storage: StorageService;
  llm: LlmService;
  images: ImageService;
  imageBytes: ImageBytesService;
  sources: SourcesService;
  events: EventBus;
  log: RunLog;
}
