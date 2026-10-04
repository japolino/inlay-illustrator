/**
 * Frontend <-> backend protocol of the port (overlay app + chat-side UI <-> Spindle backend).
 * Transport: `ctx.sendToBackend` / `spindle.sendToFrontend` messages carrying {@link RpcEnvelope} objects.
 * Every request has a `requestId`; the backend answers with exactly one response with the same `requestId`
 * and `method`. Events are pushed without a request. Covers the action lists of spec/ui.md
 * (roster, assets/analysis, prompts, artists, persona, settings pages, logs, generation, history, zoom, outfit images).
 */
import type {
  AnimaArtistEntry,
  AnimaArtistList,
  ArtistEntry,
  AssetKind,
  AssetRef,
  CharacterDocument,
  CropReference,
  CustomCharacter,
  CustomCharacterInput,
  EvidenceMode,
  FormCollection,
  MetadataAvailability,
  MetadataSummary,
  PersonaProfile,
  ResolvedNovelAIArtist,
  StoredAssetRef,
} from "./character.js";
import type { CountPolicy, CurrentActorState, IllustrationPlan } from "./chat.js";
import type { ChatImageGenerationSettings, CharxSettingsPatch, EffectiveCharxSettings, GenerationProvider, InlayConfig, PromptCodecId, UiState } from "./config.js";
import type { CharxSettingField } from "./character.js";
import type { GenerationOrigin, HistoryTree } from "./history.js";
import type { ChatMessageUiState } from "./chat-dom.js";

export const RPC_PROTOCOL_VERSION = 1;
/** Message `type` used on the Spindle frontend/backend channel. */
export const RPC_MESSAGE_TYPE = "inlay-illustrator:rpc";

/* ------------------------------------------------------------------------------------------------
 * Shared DTOs
 * ---------------------------------------------------------------------------------------------- */

export type DeepPartial<T> = T extends readonly (infer _U)[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export interface LlmConnectionSummary { id: string; name: string; provider: string; model: string; isDefault: boolean; hasApiKey: boolean }
export interface ImageConnectionSummary { id: string; name: string; provider: string; model: string; isDefault: boolean; generationProvider: GenerationProvider; promptCodec: PromptCodecId }
export interface ModelOption { id: string; label: string }

export interface BackendStatus {
  ready: boolean;
  extensionVersion: string;
  activeChatId: string | null;
  activeCharacterId: string | null;
  /** Group chat member character ids (empty for single chats). */
  activeGroupCharacterIds: string[];
  /** Missing permissions (e.g. "image_gen", "generation", "chat_mutation"). */
  missingPermissions: string[];
  generationProvider: GenerationProvider;
}

/** Charx rail entry (AM `Source`, one per Lumiverse character). */
export interface CharacterSummary { characterId: string; name: string; avatarUrl: string | null; hasDocument: boolean; chatCount: number; worldBookIds: string[] }

/** One roster row (AM `FT`/`R6` projection). */
export interface RosterItem {
  promptKey: string;
  kind: "lore" | "description" | "custom";
  /** AM memberKey (= characterId) for lore rows; virtual member key for custom rows. */
  memberKey: string;
  /** World book entry selection id `<worldBookId>:<entryId>` (lore rows), custom id (custom rows). */
  selectionId: string;
  title: string;
  worldBookId?: string;
  worldBookName?: string;
  entryId?: string;
  keys: string[];
  primaryKeys: string[];
  secondaryKeys: string[];
  /** Effective recognition keys (custom/replace keys applied). */
  recognitionKeys: string[];
  content: string;
  score: number;
  registered: boolean;
  workspaceEnabled: boolean;
  origin?: "ai-auto";
  /** Compiled default-form main prompt (empty = "not analysed"). */
  mainPrompt: string;
  analyzeEnabled: boolean;
  selectedAssetCount: number;
  /** Row thumbnail (AM priorityAssets.getLorebookThumbnailAsset: first selected asset, else best candidate; custom: default form/outfit reference). */
  thumbnailUrl?: string | null;
}

/** A world book usable as roster source (AM module / globalLore). */
export interface RosterSource {
  worldBookId: string;
  name: string;
  attached: boolean;
  connected: boolean;
  entryCount: number;
  scope: "character" | "persona" | "chat" | "global" | "extra";
  /** Images owned by the source (AM module asset count). */
  assetCount?: number;
  /** Module metadata badge (AM §1.6.6). */
  metadata?: MetadataAvailability;
}

export interface WorkspaceSnapshot {
  characterId: string;
  characterName: string;
  document: CharacterDocument;
  roster: RosterItem[];
  sources: RosterSource[];
  /** Effective per-character generation settings (AM `ki`). */
  charxSettings: EffectiveCharxSettings;
  /** Per-character metadata check cache (AM metadata-cache domain). */
  metadataAvailability: Record<string, MetadataAvailability>;
}

export interface PersonaSummary { personaId: string; name: string; avatarUrl: string | null; description: string; isActive: boolean; isBound: boolean; profile: PersonaProfile | null; forms: FormCollection }

export type AssetFilter = "all" | "candidate" | "chat" | "outfit" | "original" | "generated";
export interface AssetListItem { asset: AssetRef; kind: AssetKind; url: string; thumbnailUrl: string; width?: number; height?: number; hasMetadata?: boolean; selected: boolean; candidate: boolean }
export interface AssetPage { items: AssetListItem[]; nextCursor: string | null; total: number }

export type AnalysisKind =
  | "character-prompts" // AM iwt.analyzePrompts (Assets tab)
  | "references" // AM Awt.analyzeReferences (Prompts tab)
  | "persona" // AM bwt.analyze
  | "asset-matching" // AM Uwt.analyzeMatching (asset classification)
  | "metadata-check" // AM analyzeMetadata
  | "artist-extraction" // AM Mvt.extractArtistPrompt
  | "reclassification" // AM prompt partitions (ope session)
  | "unique-tag-search" // AM Oct session (Danbooru character tag)
  | "representative-pick"; // AM sve (no LLM)
export type JobStatus = "queued" | "running" | "success" | "partial" | "no-evidence" | "error" | "cancelled";

export interface AnalysisStartParams {
  kind: AnalysisKind;
  characterId: string;
  evidenceMode?: EvidenceMode;
  /** Explicit targets in UI order (AM `promptKeys`/`promptOrder`). */
  promptKeys?: string[];
  personaIds?: string[];
  /** asset-matching: re-run even when signatures are unchanged. */
  force?: boolean;
  /** reclassification: checked areas `{promptKey|personaId, formId, groups/parts}`. */
  selection?: unknown;
  /** artist-extraction: image to read. */
  asset?: AssetRef;
}

export interface ProgressInfo {
  /** English label (Korean original in `labelKo` when the AM text exists). */
  label: string;
  labelKo?: string;
  done?: number;
  total?: number;
  /** 0..1 */
  fraction?: number;
  retry?: { attempt: number; total: number };
  queue?: { position: number; depth: number };
}

export interface RowNotice { promptKey: string; status: "idle" | "running" | "success" | "no_evidence" | "error" | "cancelled"; outfitCount?: number; message?: string }

/** Outfit / reference image generation (AM `fOt`/`hOt`). */
export type OutfitImageTarget = { kind: "character"; characterId: string; promptKey: string } | { kind: "persona"; personaId: string; characterId?: string };
export interface OutfitImageDraft { label: string; description?: string; head: string; top: string; bottom: string; legs: string; feet: string; nsfw?: boolean; seed: string; seedFixed: boolean; useCharacterReference: boolean }
export interface OutfitImageResult { resultId: string; imageId: string; url: string; seed: string; width: number; height: number; positivePrompt: string; negativePrompt: string; createdAt: string }

/** Chat-side generation attempt kinds (AM `attemptKind`). */
export type AttemptKind = "automatic" | "initial" | "retry" | "reroll" | "regenerate";
export type GenerationPhase = "planned" | "analyzing-preset" | "analyzing-modifiers" | "planning" | "generating" | "committing";
export type GenerationResultKind = "completed" | "failed" | "blocked" | "cancelled" | "presentation-deferred";

/** Message identity in Lumiverse terms. */
export interface MessageTarget { chatId: string; messageId: string; swipeIndex: number }

export interface GenerationJobSnapshot {
  jobId: string;
  chatId: string;
  messageKey: string;
  attemptKind: AttemptKind;
  status: JobStatus;
  phase: GenerationPhase;
  progress: ProgressInfo;
  requestedCount: number;
  completedSlots: number;
  failedSlots: number;
  canRetry: boolean;
  canRestart: boolean;
  error?: RpcError;
}

/** Regeneration overrides edited in the zoom view (AM regeneration plan + prompt draft). */
export interface RegenerationOverrides {
  seed?: string;
  seedFixed?: boolean;
  sizeId?: number;
  positivePrompt?: string;
  negativePrompt?: string;
  /** Structured (NovelAI) prompts: main + per-actor sections. */
  sections?: { id: string; value: string; negativeValue?: string }[];
  /** Actor centers (null = AI choice). */
  centers?: ({ x: number; y: number } | null)[];
  excludedCharacterIndexes?: number[];
  artistId?: string;
  outfitByActor?: Record<string, string>;
}

export interface ZoomPromptSection { id: string; target: "provider" | "main" | "actor"; actorIndex?: number; label: string; value: string; negativeValue: string; centerX?: number; centerY?: number }
export interface ZoomDetails {
  chatId: string;
  messageKey: string;
  revisionId: string;
  slotId: string;
  entryId: string;
  kind: "original" | "generated";
  origin?: GenerationOrigin;
  assetName: string;
  url: string;
  width: number;
  height: number;
  sizeId: number;
  seed: string;
  seedFixed: boolean;
  generationProvider: GenerationProvider | "original";
  promptCodec: PromptCodecId | null;
  positivePrompt: string;
  negativePrompt: string;
  sections: ZoomPromptSection[];
  coordinateGrid: "v4-5" | "v5" | null;
  excludedCharacterIndexes: number[];
  promptDraftActive: boolean;
  coordinateDraftActive: boolean;
  /** Analyzer output shown in developer mode. */
  analyzerText: string;
  canEdit: boolean;
  canDelete: boolean;
  canRegenerate: boolean;
  canDeleteSlot: boolean;
  /** Other entries of the slot (history strip). */
  history: { entryId: string; kind: "original" | "generated"; assetName: string; url: string; createdAt: number; selected: boolean }[];
}

export interface AiPromptEditRequest { instruction: string; imageToImage: boolean; strength?: number; noise?: number }
export interface AiPromptEditProposal { proposalId: string; positivePrompt: string; negativePrompt: string; sections: ZoomPromptSection[]; explanation: string }

export interface SlotDeletionPreview { previewToken: string; chatId: string; messageKey: string; slotId: string; imageCount: number; revisionNumber: number; lastSlot: boolean }
export interface AssetCleanupResult { assetName: string; status: "removed" | "shared" | "unknown" | "failed" }

export interface RuntimeLogEntry { seq: number; at: string; level: "debug" | "info" | "warn" | "error"; scope: string; message: string; details?: unknown }

/* ------------------------------------------------------------------------------------------------
 * Errors
 * ---------------------------------------------------------------------------------------------- */

export type RpcErrorCode =
  | "bad-request"
  | "unknown-method"
  | "not-found"
  | "conflict" // revision/base mismatch (AM `ASSET_MAID_CHARX_EXTERNAL_CHANGE`, draft base changed ...)
  | "busy" // another job holds the lock
  | "cancelled"
  | "timeout"
  | "permission-denied"
  | "unsupported" // provider/model lacks the feature
  | "provider-error" // LLM or image provider failure
  | "storage-error" // userStorage read/write failed or result indeterminate
  | "protocol-mismatch"
  | "internal";

export interface RpcError {
  code: RpcErrorCode;
  /** English message for the UI. */
  message: string;
  /** Korean original when the message comes from Asset Maid. */
  messageKo?: string;
  retryable?: boolean;
  /** AM-style machine codes, e.g. ANALYZER_TIMEOUT, IMAGE_REQUEST_RETRY_EXHAUSTED. */
  detailCode?: string;
  details?: unknown;
}

/* ------------------------------------------------------------------------------------------------
 * Methods: name -> { params, result }
 * ---------------------------------------------------------------------------------------------- */

type Empty = Record<string, never>;
type Ok = { ok: true };

export interface RpcMethods {
  /* session / status */
  "session.hello": { params: { protocol: number; clientId: string; surface: "overlay" | "drawer" | "chat" }; result: { protocol: number; status: BackendStatus } };
  "session.getStatus": { params: Empty; result: BackendStatus };

  /* settings (analysis-profile, model, image-model, system pages) */
  "config.get": { params: Empty; result: { config: InlayConfig; chatImageGeneration: ChatImageGenerationSettings; uiState: UiState } };
  /** Deep-merge patch then normalize (AM `config.update`). */
  "config.update": { params: { patch: DeepPartial<InlayConfig> }; result: { config: InlayConfig } };
  "config.factoryReset": { params: { confirm: true }; result: Ok };
  "chatImageGeneration.set": { params: { settings: ChatImageGenerationSettings }; result: { settings: ChatImageGenerationSettings; notice: string } };
  "uiState.set": { params: { uiState: UiState }; result: Ok };

  /* connections */
  "connections.listLlm": { params: Empty; result: { connections: LlmConnectionSummary[] } };
  "connections.listImage": { params: Empty; result: { connections: ImageConnectionSummary[] } };
  "connections.listImageModels": { params: { connectionId: string }; result: { models: ModelOption[] } };
  "connections.listLlmModels": { params: { connectionId: string }; result: { models: ModelOption[] } };
  /** Settings "message test" (AM `T0t`). */
  "analyzer.testMessage": { params: { text?: string }; result: { ok: boolean; latencyMs: number; reply?: string; error?: RpcError } };
  "image.testConnection": { params: { connectionId?: string }; result: { ok: boolean; latencyMs: number; error?: RpcError } };

  /* charx rail / workspace / roster */
  "workspace.listCharacters": { params: Empty; result: { characters: CharacterSummary[] } };
  "workspace.load": { params: { characterId: string; reload?: boolean }; result: WorkspaceSnapshot };
  "roster.setRegistered": { params: { characterId: string; items: { memberKey: string; selectionId: string }[]; registered: boolean }; result: WorkspaceSnapshot };
  "roster.setActive": { params: { characterId: string; items: { memberKey: string; selectionId: string }[]; active: boolean }; result: WorkspaceSnapshot };
  /** AM module connect/disconnect -> extra world books as roster sources. */
  "roster.setSourceConnected": { params: { characterId: string; worldBookId: string; connected: boolean }; result: WorkspaceSnapshot };
  "recognitionKeys.set": { params: { characterId: string; promptKey: string; keys: string[] }; result: WorkspaceSnapshot };

  /* custom characters */
  "customCharacters.create": { params: { characterId: string; input: CustomCharacterInput }; result: { character: CustomCharacter; snapshot: WorkspaceSnapshot } };
  "customCharacters.update": { params: { characterId: string; customId: string; input: CustomCharacterInput }; result: { character: CustomCharacter; snapshot: WorkspaceSnapshot } };
  "customCharacters.remove": { params: { characterId: string; customId: string }; result: WorkspaceSnapshot };
  "customCharacters.setRosterRegistered": { params: { characterId: string; customIds: string[] | "all"; registered: boolean }; result: WorkspaceSnapshot };
  "customCharacters.setWorkspaceEnabled": { params: { characterId: string; customIds: string[] | "all"; enabled: boolean }; result: WorkspaceSnapshot };
  "customCharacters.promote": { params: { characterId: string; customIds: string[] | "all" }; result: WorkspaceSnapshot };

  /* prompts tab (forms, outfits, references, seeds) */
  /** Save a whole FormCollection edited client-side with the pure form ops; `baseRevision` = formCollectionRevision of the edited base. */
  "prompts.saveForms": { params: { characterId: string; promptKey: string; collection: FormCollection; baseRevision: string }; result: { collection: FormCollection; revision: string } };
  "prompts.setReferenceEnabled": { params: { characterId: string; promptKeys: string[]; formId?: string; enabled: boolean }; result: WorkspaceSnapshot };
  "prompts.setAnalyzeEnabled": { params: { characterId: string; promptKeys: string[]; enabled: boolean }; result: WorkspaceSnapshot };
  "prompts.setSeed": { params: { characterId: string; promptKey: string; seed: string; fixed: boolean }; result: Ok };
  "prompts.setFramingWeights": { params: { characterId: string; weights: Record<string, Record<string, number>> }; result: Ok };

  /* assets tab / picker */
  "assets.list": { params: { characterId: string; promptKey?: string; memberKey?: string; filter: AssetFilter; metadataOnly?: boolean; cursor?: string | null; limit?: number }; result: AssetPage };
  "assets.setSelection": { params: { characterId: string; promptKey: string; assets: StoredAssetRef[] }; result: Ok };
  "assets.clearSelections": { params: { characterId: string; promptKeys?: string[] }; result: Ok };
  /** Set a form / outfit / persona reference from the picker. */
  "assets.setReference": { params: { target: { kind: "character-form"; characterId: string; promptKey: string; formId: string } | { kind: "character-outfit"; characterId: string; promptKey: string; formId: string; outfitId: string } | { kind: "persona"; personaId: string; formId?: string; outfitId?: string } | { kind: "artist-extraction"; characterId: string }; asset: StoredAssetRef | null }; result: Ok };
  "assets.inspectMetadata": { params: { characterId: string; asset: AssetRef }; result: { hasMetadata: boolean; summary: MetadataSummary | null; raw?: unknown } };
  "assets.clearMetadataRecords": { params: { characterId: string; assetNames?: string[] }; result: Ok };
  /** Upload an image (base64 without data: prefix) as a reference asset. */
  "assets.upload": { params: { characterId?: string; personaId?: string; fileName: string; mimeType: string; dataBase64: string }; result: { asset: AssetRef } };
  "assets.saveCrop": { params: { characterId: string; asset: AssetRef; cropRect: CropReference["cropRect"]; sourceSize: CropReference["sourceSize"]; dataBase64: string }; result: { asset: AssetRef } };
  /** Image bytes for analysis/preview where the frontend cannot read the URL itself. */
  "assets.getUrl": { params: { asset: AssetRef }; result: { url: string } };

  /* analysis controllers */
  "analysis.start": { params: AnalysisStartParams; result: { jobId: string } };
  "analysis.cancel": { params: { jobId?: string; kind?: AnalysisKind }; result: Ok };
  "analysis.listActive": { params: Empty; result: { jobs: { jobId: string; kind: AnalysisKind; characterId: string; status: JobStatus; progress: ProgressInfo }[] } };
  /** Unique tag search: write the chosen Danbooru tag into `identity.character_tag`. */
  "uniqueTags.apply": { params: { characterId: string; choices: { promptKey: string; formId: string; tag: string }[] }; result: Ok };

  /* artists tab */
  "artists.list": { params: { characterId?: string }; result: { novelai: ResolvedNovelAIArtist[]; anima: AnimaArtistList; selectedNovelAIId: string; selectedAnimaId: string } };
  "artists.upsertNovelAI": { params: { entry: ArtistEntry }; result: { entry: ArtistEntry } };
  "artists.deleteNovelAI": { params: { id: string }; result: Ok };
  "artists.upsertAnima": { params: { entry: AnimaArtistEntry }; result: { entry: AnimaArtistEntry } };
  "artists.deleteAnima": { params: { id: string }; result: Ok };
  /** Select for a character (`characterId`) or the global default (Anima only). */
  "artists.select": { params: { list: "novelai" | "anima"; artistId: string; characterId?: string }; result: Ok };

  /* persona tab */
  "personas.list": { params: { characterId?: string }; result: { personas: PersonaSummary[] } };
  "personas.saveForms": { params: { personaId: string; collection: FormCollection; baseRevision: string }; result: { collection: FormCollection; revision: string } };
  "personas.setSettings": { params: { personaGender?: "male" | "female"; malePersonaPrompt?: string; malePersonaNegativePrompt?: string; selectedPersonaKey?: string }; result: Ok };

  /* outfit / reference image generation */
  "outfitImage.generate": { params: { target: OutfitImageTarget; formId: string; outfitId?: string; draft: OutfitImageDraft }; result: { jobId: string } };
  "outfitImage.history": { params: { target: OutfitImageTarget; formId: string; outfitId?: string }; result: { results: OutfitImageResult[] } };
  /** Save chosen results: add as new outfits or replace the current outfit's reference. */
  "outfitImage.save": { params: { target: OutfitImageTarget; formId: string; outfitId?: string; resultIds: string[]; mode: "add" | "replace"; draft: OutfitImageDraft }; result: { collection: FormCollection } };

  /* current / all charx settings + data management */
  "charxSettings.get": { params: { characterId: string }; result: { effective: EffectiveCharxSettings; all: EffectiveCharxSettings; dirtyFields: CharxSettingField[] } };
  "charxSettings.setOverride": { params: { characterId: string; patch: CharxSettingsPatch }; result: { effective: EffectiveCharxSettings; dirtyFields: CharxSettingField[] } };
  "charxSettings.setDefaults": { params: { patch: CharxSettingsPatch }; result: { all: EffectiveCharxSettings } };
  "charxSettings.clearOverrides": { params: { characterId: string }; result: { effective: EffectiveCharxSettings } };
  /** Reset this character's Asset Maid data (chats and generated images stay). */
  "character.reset": { params: { characterId: string; confirm: true }; result: Ok };

  /* logs (developer mode) */
  "logs.list": { params: { sinceSeq?: number; limit?: number }; result: { entries: RuntimeLogEntry[] } };
  "logs.clear": { params: Empty; result: Ok };

  /* chat-side generation (footer, pending cards, count panel) */
  "generation.start": { params: MessageTarget & { attemptKind?: Exclude<AttemptKind, "automatic" | "regenerate">; countPolicy?: CountPolicy }; result: { jobId: string; messageKey: string } };
  "generation.cancel": { params: { jobId?: string; chatId?: string; messageKey?: string }; result: Ok };
  "generation.retry": { params: { jobId: string }; result: { jobId: string } };
  /** Split analysis: restart from the initial decision. */
  "generation.restart": { params: { jobId: string }; result: { jobId: string } };
  "generation.dismiss": { params: { jobId: string }; result: Ok };
  "generation.listActive": { params: { chatId?: string }; result: { jobs: GenerationJobSnapshot[] } };
  /** Single-slot regeneration (chat ⟳ or zoom "regenerate"). */
  "generation.regenerateSlot": { params: { chatId: string; messageKey: string; slotId: string; entryId?: string; overrides?: RegenerationOverrides }; result: { jobId: string } };

  /* image history (chat ‹ ›, revision < >, zoom delete) */
  "history.get": { params: { chatId: string; messageKeys?: string[] }; result: { tree: HistoryTree; plans: Record<string, IllustrationPlan> } };
  /** Persist the chosen entry of a slot (port fix: AM kept it in the DOM only). */
  "history.selectEntry": { params: { chatId: string; slotId: string; entryId: string }; result: Ok };
  "history.selectRevision": { params: { chatId: string; messageKey: string; revisionId: string }; result: Ok };
  "history.deleteEntry": { params: { chatId: string; entryId: string }; result: { fallbackEntryId: string | null; cleanup: AssetCleanupResult[] } };
  "history.prepareSlotDeletion": { params: { chatId: string; messageKey: string; slotId: string }; result: SlotDeletionPreview };
  "history.deleteSlot": { params: { previewToken: string }; result: { cleanup: AssetCleanupResult[]; cleanupId: string; projectionWarning?: string } };
  "history.retryCleanup": { params: { cleanupId: string }; result: { cleanup: AssetCleanupResult[] } };

  /* zoom viewer */
  "zoom.getDetails": { params: { chatId: string; slotId: string; entryId?: string }; result: ZoomDetails };
  "zoom.saveDraft": { params: { chatId: string; slotId: string; overrides: RegenerationOverrides }; result: ZoomDetails };
  "zoom.clearDraft": { params: { chatId: string; slotId: string; part: "prompts" | "coordinates" | "all" }; result: ZoomDetails };
  /** Adopt the viewed entry's prompts / seed as the slot draft. */
  "zoom.importViewed": { params: { chatId: string; slotId: string; entryId: string; what: "prompts" | "seed" }; result: ZoomDetails };
  "zoom.requestAiPromptEdit": { params: { chatId: string; slotId: string; entryId: string; request: AiPromptEditRequest }; result: AiPromptEditProposal };
  "zoom.applyAiPromptEdit": { params: { chatId: string; slotId: string; proposalId: string }; result: { jobId: string } };

  /* chat state window (AM "accumulated state of the current chat") */
  "chatState.get": { params: { chatId: string }; result: { actorState: CurrentActorState } };
  "chatState.clear": { params: { chatId: string; actorKeys?: string[] }; result: { actorState: CurrentActorState } };

  /* chat DOM (footers / edge controls, see chat-dom.ts) */
  /** Per-message UI state for the injected chat controls. `messageIds` = Lumiverse message ids (all swipes' active one); empty = every message with data. */
  "chatDom.getMessageStates": { params: { chatId: string; messageIds?: string[] }; result: { messages: ChatMessageUiState[] } };
}

export type RpcMethod = keyof RpcMethods;
export type RpcParams<M extends RpcMethod> = RpcMethods[M]["params"];
export type RpcResult<M extends RpcMethod> = RpcMethods[M]["result"];

/* ------------------------------------------------------------------------------------------------
 * Events (backend -> frontend)
 * ---------------------------------------------------------------------------------------------- */

export interface RpcEvents {
  "status.changed": BackendStatus;
  "config.changed": { config: InlayConfig };
  "chatImageGeneration.changed": { settings: ChatImageGenerationSettings };
  "document.changed": { characterId: string; updatedAt: string; reason: string };
  "chatData.changed": { chatId: string; messageKeys: string[] };
  "generation.progress": GenerationJobSnapshot;
  "generation.finished": { jobId: string; chatId: string; messageKey: string; result: GenerationResultKind; error?: RpcError };
  "analysis.progress": { jobId: string; kind: AnalysisKind; characterId: string; status: JobStatus; progress: ProgressInfo; rows?: RowNotice[] };
  "analysis.finished": { jobId: string; kind: AnalysisKind; characterId: string; status: JobStatus; message: string; error?: RpcError };
  "outfitImage.progress": { jobId: string; progress: ProgressInfo };
  "outfitImage.finished": { jobId: string; result?: OutfitImageResult; error?: RpcError };
  "log.appended": { entry: RuntimeLogEntry };
  /** Non-fatal notice / toast (AM runtime toast). */
  notice: { tone: "info" | "success" | "warning" | "danger"; message: string; messageKo?: string; key?: string };
  error: { error: RpcError; context?: string };
}
export type RpcEventName = keyof RpcEvents;

/* ------------------------------------------------------------------------------------------------
 * Envelopes
 * ---------------------------------------------------------------------------------------------- */

export interface RpcRequestEnvelope<M extends RpcMethod = RpcMethod> {
  type: typeof RPC_MESSAGE_TYPE;
  kind: "request";
  protocol: typeof RPC_PROTOCOL_VERSION;
  requestId: string;
  method: M;
  params: RpcParams<M>;
}
export type RpcResponseEnvelope<M extends RpcMethod = RpcMethod> =
  | { type: typeof RPC_MESSAGE_TYPE; kind: "response"; protocol: typeof RPC_PROTOCOL_VERSION; requestId: string; method: M; ok: true; result: RpcResult<M> }
  | { type: typeof RPC_MESSAGE_TYPE; kind: "response"; protocol: typeof RPC_PROTOCOL_VERSION; requestId: string; method: M; ok: false; error: RpcError };
export interface RpcEventEnvelope<E extends RpcEventName = RpcEventName> {
  type: typeof RPC_MESSAGE_TYPE;
  kind: "event";
  protocol: typeof RPC_PROTOCOL_VERSION;
  event: E;
  payload: RpcEvents[E];
  /** Monotonic per backend start. */
  seq: number;
}

/** Discriminated unions over all methods / events. */
export type RpcRequest = { [M in RpcMethod]: RpcRequestEnvelope<M> }[RpcMethod];
export type RpcResponse = { [M in RpcMethod]: RpcResponseEnvelope<M> }[RpcMethod];
export type RpcEvent = { [E in RpcEventName]: RpcEventEnvelope<E> }[RpcEventName];
export type RpcEnvelope = RpcRequest | RpcResponse | RpcEvent;

/** Runtime list of methods (for validation / routing tables). */
export const RPC_METHODS = [
  "session.hello", "session.getStatus",
  "config.get", "config.update", "config.factoryReset", "chatImageGeneration.set", "uiState.set",
  "connections.listLlm", "connections.listImage", "connections.listImageModels", "connections.listLlmModels", "analyzer.testMessage", "image.testConnection",
  "workspace.listCharacters", "workspace.load", "roster.setRegistered", "roster.setActive", "roster.setSourceConnected", "recognitionKeys.set",
  "customCharacters.create", "customCharacters.update", "customCharacters.remove", "customCharacters.setRosterRegistered", "customCharacters.setWorkspaceEnabled", "customCharacters.promote",
  "prompts.saveForms", "prompts.setReferenceEnabled", "prompts.setAnalyzeEnabled", "prompts.setSeed", "prompts.setFramingWeights",
  "assets.list", "assets.setSelection", "assets.clearSelections", "assets.setReference", "assets.inspectMetadata", "assets.clearMetadataRecords", "assets.upload", "assets.saveCrop", "assets.getUrl",
  "analysis.start", "analysis.cancel", "analysis.listActive", "uniqueTags.apply",
  "artists.list", "artists.upsertNovelAI", "artists.deleteNovelAI", "artists.upsertAnima", "artists.deleteAnima", "artists.select",
  "personas.list", "personas.saveForms", "personas.setSettings",
  "outfitImage.generate", "outfitImage.history", "outfitImage.save",
  "charxSettings.get", "charxSettings.setOverride", "charxSettings.setDefaults", "charxSettings.clearOverrides", "character.reset",
  "logs.list", "logs.clear",
  "generation.start", "generation.cancel", "generation.retry", "generation.restart", "generation.dismiss", "generation.listActive", "generation.regenerateSlot",
  "history.get", "history.selectEntry", "history.selectRevision", "history.deleteEntry", "history.prepareSlotDeletion", "history.deleteSlot", "history.retryCleanup",
  "zoom.getDetails", "zoom.saveDraft", "zoom.clearDraft", "zoom.importViewed", "zoom.requestAiPromptEdit", "zoom.applyAiPromptEdit",
  "chatState.get", "chatState.clear",
  "chatDom.getMessageStates",
] as const satisfies readonly RpcMethod[];

export const RPC_EVENTS = [
  "status.changed", "config.changed", "chatImageGeneration.changed", "document.changed", "chatData.changed",
  "generation.progress", "generation.finished", "analysis.progress", "analysis.finished", "outfitImage.progress", "outfitImage.finished",
  "log.appended", "notice", "error",
] as const satisfies readonly RpcEventName[];

// Compile-time completeness checks: every method / event is listed exactly in the runtime arrays.
type MissingMethods = Exclude<RpcMethod, (typeof RPC_METHODS)[number]>;
type MissingEvents = Exclude<RpcEventName, (typeof RPC_EVENTS)[number]>;
const _methodsComplete: MissingMethods extends never ? true : MissingMethods = true;
const _eventsComplete: MissingEvents extends never ? true : MissingEvents = true;
void _methodsComplete;
void _eventsComplete;

const METHOD_SET = new Set<string>(RPC_METHODS);
const EVENT_SET = new Set<string>(RPC_EVENTS);

export function isRpcMethod(value: unknown): value is RpcMethod {
  return typeof value === "string" && METHOD_SET.has(value);
}
export function isRpcEventName(value: unknown): value is RpcEventName {
  return typeof value === "string" && EVENT_SET.has(value);
}

function envelopeBase(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return v.type === RPC_MESSAGE_TYPE ? v : null;
}
/** Structural guard (params are validated by each handler). */
export function isRpcRequest(value: unknown): value is RpcRequest {
  const v = envelopeBase(value);
  return !!v && v.kind === "request" && typeof v.requestId === "string" && v.requestId !== "" && isRpcMethod(v.method) && typeof v.params === "object" && v.params !== null;
}
export function isRpcResponse(value: unknown): value is RpcResponse {
  const v = envelopeBase(value);
  return !!v && v.kind === "response" && typeof v.requestId === "string" && isRpcMethod(v.method) && typeof v.ok === "boolean";
}
export function isRpcEvent(value: unknown): value is RpcEvent {
  const v = envelopeBase(value);
  return !!v && v.kind === "event" && isRpcEventName(v.event) && typeof v.seq === "number";
}

let requestCounter = 0;
/** Request id: `<clientId>:<base36 time>:<counter>`. */
export function createRequestId(clientId = "ui"): string {
  requestCounter = (requestCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${clientId}:${Date.now().toString(36)}:${requestCounter.toString(36)}`;
}
export function createRequest<M extends RpcMethod>(method: M, params: RpcParams<M>, requestId: string = createRequestId()): RpcRequestEnvelope<M> {
  return { type: RPC_MESSAGE_TYPE, kind: "request", protocol: RPC_PROTOCOL_VERSION, requestId, method, params };
}
export function okResponse<M extends RpcMethod>(request: Pick<RpcRequestEnvelope<M>, "requestId" | "method">, result: RpcResult<M>): RpcResponseEnvelope<M> {
  return { type: RPC_MESSAGE_TYPE, kind: "response", protocol: RPC_PROTOCOL_VERSION, requestId: request.requestId, method: request.method, ok: true, result };
}
export function errorResponse<M extends RpcMethod>(request: Pick<RpcRequestEnvelope<M>, "requestId" | "method">, error: RpcError): RpcResponseEnvelope<M> {
  return { type: RPC_MESSAGE_TYPE, kind: "response", protocol: RPC_PROTOCOL_VERSION, requestId: request.requestId, method: request.method, ok: false, error };
}
export function createEvent<E extends RpcEventName>(event: E, payload: RpcEvents[E], seq: number): RpcEventEnvelope<E> {
  return { type: RPC_MESSAGE_TYPE, kind: "event", protocol: RPC_PROTOCOL_VERSION, event, payload, seq };
}
export function rpcError(code: RpcErrorCode, message: string, extra: Omit<RpcError, "code" | "message"> = {}): RpcError {
  return { code, message, ...extra };
}

/** Handler table type for the backend router. */
export type RpcHandlers<Ctx = unknown> = { [M in RpcMethod]: (params: RpcParams<M>, ctx: Ctx) => Promise<RpcResult<M>> | RpcResult<M> };
