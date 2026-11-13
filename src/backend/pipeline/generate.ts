/**
 * One message run (AM `generateMessageIllustrations` = E1t `z` 170478-170693 + `D` 169305-170208, illustration path):
 * Lumiverse data -> analyzer context (MAt, identity evidence, candidate slots) -> orchestrator input -> engine run ->
 * persisted entries (one per generated image, host image-gen results) + a deferred continuity commit.
 *
 * Lumiverse mapping (PORT-PLAN): source = `SourcesService.buildSource` (group chats: union of the members' sources and
 * documents, primary = speaking character), custom characters appended (`rI`), runtime config =
 * `buildRuntimeConfig(global, document)`, personas from Lumiverse, chat messages before the target (stripped of our
 * markup), continuity rebuilt from the chat data checkpoints at the target message (AM 0.9.90: no accumulated actor state).
 */
import type { RequestGround } from "./providers.js";
import type { Infill } from "./scene-infill.js";
import {
  applyAtelierOverlay,
  buildRuntimeConfig,
  type AtelierRuntimeOverlay,
  type GenerationAnalysisRecord,
  chatKeyForChat,
  effectiveAnalysisExecution,
  createGeneratedAssetName,
  imageResultUrl,
  jsonClone,
  type AttemptKind,
  type CharacterDocument,
  type ChatDataDocument,
  type ChatImageGenerationSettings,
  type CountPolicy,
  type EffectiveCharxSettings,
  type NovelAISampling,
  type GenerationOrigin,
  type IllustrationPlanAssetHint,
  type IllustrationPlanEntry,
  type InlayConfig,
  type GenerationRetryError,
  type JevSelectionProgress,
} from "../../shared/contract/index.js";
import {
  assembleAnalyzerInput,
  buildAnalyzerContextInputs,
  buildCandidateSlots,
  previousGlobalModifierRefs,
  resolveIdentityEvidence,
  resolveNovelAIRunConfig,
  resolveOutfitCreationMode,
  resolveSourceFixedRating,
  resolveSourceGenerationSettings,
  toPlannerImageToken,
  withCustomCharacterMembers,
  type AssetMaidConfig,
  type CharacterSource,
  type ContinuityState as ContextContinuityState,
  type PersonaRecord,
} from "../../engine/context/index.js";
import { atelierServiceOf } from "../services/atelier.js";
import { engineAnalysisConfig } from "../services/llm.js";
import { analysisRecordOf } from "./selection-summary.js";
import { BUNDLED_COMFY_WORKFLOW_PROFILE, resolveImageCountConstraint, resolveImageSize } from "../../engine/compose/index.js";
import {
  commitContinuityCheckpoint,
  getLatestContinuityCheckpointSnapshot,
  persistV5ContinuityState,
  rebuildContinuityAtMessage,
  type ContinuityChatStore,
  type ContinuityState,
} from "../../engine/continuity/index.js";
import { buildCharxAssetRegexDetectors, detectImageTokens, detectNativeAssetMarkups, type NativeAssetDetector } from "../../engine/text/index.js";
import type { ImageProviderId } from "../../engine/index.js";
import type { BackendServices, ChatInfo, PersonaInfo, ResolvedImageTarget } from "../services/types.js";
import type { BackendModules } from "../rpc/types.js";
import type { EnginePort } from "./engine-port.js";
import { createRunOutfitIndex, recordPreparedOutfits, reuseSameOutfits, withoutAbsenceProposals } from "./outfit-awareness.js";
import { openAutoGeneration, type AutoGeneration } from "./auto.js";
import type { ChatMessageView } from "./host-chat.js";
import { cleanMessageContent } from "./markup.js";
import { formatLabel, PIPELINE_TEXT } from "./labels.js";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/* ------------------------------------------------------------------------------------------------
 * Inputs / outputs
 * ---------------------------------------------------------------------------------------------- */

export interface ParagraphSlot {
  slotId: string;
  sourceImageToken: string;
  index: number;
  beforeText: string;
  afterText: string;
}

/** AI prompt edit / single-slot revision (AM `Fr` 173977 `pe`, E1t `revision*` fields). */
export interface RevisionInput {
  slotId: string;
  revisionId: string;
  sourceEntryId: string;
  direction: string;
  currentPrompt: Array<{ id: string; kind: string; label: string; actorIndex?: number; positive: string; negative: string }>;
  seed: string;
  seedFixed: boolean;
  evidenceKey: string;
  /** Vision image of the viewed entry (only sent when the analyzer supports images). */
  image?: () => Promise<{ type: "image"; data: string; mimeType: string }>;
  /** NovelAI img2img source (base64). */
  imageToImage?: () => Promise<string>;
  imageToImageStrength?: number;
  imageToImageNoise?: number;
}

/** Stored per generated entry (zoom details, regeneration). Sidecar `chats/<chatId>/pipeline.json`. */
export interface GenerationRecord {
  entryId: string;
  imageId: string;
  assetName: string;
  messageKey: string;
  slotId: string;
  revisionId: string;
  createdAt: number;
  engineProvider: string;
  lumiverseProvider: string;
  model: string;
  seed: string;
  seedFixed: boolean;
  width: number;
  height: number;
  sizeId: number;
  positivePrompt: string;
  negativePrompt: string;
  characters: Array<{ prompt: string; negativePrompt: string; actorIndex?: number; centerX?: number; centerY?: number; coordinateMode?: string }>;
  /** Per-image NovelAI config (apiKey placeholder removed), needed to re-send through the NovelAI adapter. */
  novelAIConfig?: Rec;
  /** NovelAI sampling actually used (AM 0.9.90 `analyzerDecision.novelaiSampling`): a Medium image rerolls as Medium. */
  novelaiSampling?: NovelAISampling;
  actors: Array<{ identityKey: string; identityName: string; kind: string; actorIndex: number; selectedFormId?: string; selectedOutfitId?: string }>;
  /** Artist preset of the prompt plan (NovelAI `selectedArtistId` / Anima artist id). */
  artistId?: string;
  promptKey: string;
  presetId: string;
  analyzerText: string;
  sentParameters: Rec;
  generationOrigin: GenerationOrigin;
  parentEntryId?: string;
  /** AI selection history (AM 0.9.90 compact analyzer record), shown by the zoom viewer. */
  analysis?: GenerationAnalysisRecord;
}

export interface GenerateMessageRequest {
  chatId: string;
  chat: ChatInfo;
  messages: ChatMessageView[];
  /** Index into `messages`. */
  target: number;
  swipeIndex: number;
  historyId: string;
  planKey: string;
  /** Clean text of the target swipe. */
  clean: string;
  slots: ParagraphSlot[];
  countPolicy: CountPolicy;
  attemptKind: AttemptKind;
  automatic: boolean;
  revisionId: string;
  existingEntries: IllustrationPlanEntry[];
  deletedSlotIndices: number[];
  splitAnalysis?: Rec;
  revision?: RevisionInput;
  jobId: string;
  activityLabel: string;
  config: InlayConfig;
  settings: ChatImageGenerationSettings;
  /** Chat data at job start (continuity basis). */
  chatData: ChatDataDocument;
  signal: AbortSignal;
  /** Throws when the target message/swipe is no longer current (AM `Ze` 169476). */
  assertTarget: () => Promise<void>;
  onPhase?: (phase: string, detail: { imageIndex?: number; imageCount?: number; providerStage?: string }) => void;
  onResolvedCount?: (count: number) => void;
  onJevSelection?: (selection: JevSelectionProgress) => void;
  /** Engine retry state: image request retry counter + retry errors (AM session `imageRetry` / `retryErrors`). */
  onRetryErrors?: (errors: GenerationRetryError[], imageRetry: { attempt: number; total: number } | undefined) => void;
  /**
   * Last word on the run's directing (pictures for other extensions, shared-pictures.ts): gets the runtime config with
   * the Atelier overlay applied and returns the one the run uses (another scene guideline selected). Not stored.
   */
  directing?: (runtime: Rec) => Rec;
  /** The ground the picture stands on, for one that gets cut out. */
  ground?: RequestGround;
  /** Drawn into another picture's setting (NovelAI). */
  infill?: Infill;
  /**
   * Analyzer preparation snapshot of the run being retried or restarted (a previous result's `analysisConfig`): the run
   * prepares its analyzer from it instead of this run's config (AM 0.9.91 restart passes the original run's
   * `prepareAnalysis` 179676; a retry reuses it since 0.9.90, `Sr` 179620). Everything else uses current data.
   */
  analysisConfig?: unknown;
}

/** AM session `progress.jevSelection` -> job snapshot shape. */
function jevSelectionProgress(s: Rec): JevSelectionProgress {
  const status = s.status === "completed" || s.status === "failed" || s.status === "cancelled" ? s.status : "running";
  const total = Math.max(0, Number(s.total) || 0);
  const actors = Number(rec(s.counts).actors);
  return {
    status,
    completed: Math.min(total, Math.max(0, Number(s.completed) || 0)),
    total,
    ...(Number.isFinite(actors) ? { selectedActors: actors } : {}),
    ...(str(s.error) ? { error: str(s.error) } : {}),
  };
}

/** Deferred continuity commit (AM `deferContinuityPersistence` 170594), applied inside the chat data write. */
export type ContinuityCommit = (doc: ChatDataDocument, info: { historyRevisionId: string; historyRevisionOrder: number }) => Promise<void>;

export interface GenerateMessageResult {
  entries: IllustrationPlanEntry[];
  records: GenerationRecord[];
  assetHints: IllustrationPlanAssetHint[];
  resolvedCount: number;
  error: string;
  errorKo?: string;
  failure?: unknown;
  analyzerCompleted?: boolean;
  /** The snapshot the run's analyzer was prepared from (AM `prepareAnalysis` of the run), for a retry or restart. */
  analysisConfig?: unknown;
  cancelled?: boolean;
  commitContinuity?: ContinuityCommit;
}

/* ------------------------------------------------------------------------------------------------
 * Small ports of AM helpers
 * ---------------------------------------------------------------------------------------------- */

/** AM `m1t` 168854. */
export function originForAttempt(kind: AttemptKind): GenerationOrigin {
  return kind === "automatic" ? "initial" : kind;
}
/** AM `u1t` 168814. */
export function checkpointPolicyFor(kind: AttemptKind): "restart-analysis" | "reuse-plan" | "resume" {
  return kind === "automatic" || kind === "initial" || kind === "reroll" ? "restart-analysis" : kind === "regenerate" ? "reuse-plan" : "resume";
}
/** AM `f1t` 168821. */
export function generationTypeFor(origin: GenerationOrigin, forced: boolean, revision: boolean): string {
  return revision ? "ai-prompt-edit" : origin === "retry" ? "illustration-retry" : forced ? "manual-all" : "chat-auto";
}
/** AM `Id` 113714: cancellation test (follows `cause`). */
export function isCancellation(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 4) return false;
  const e = error as { name?: unknown; code?: unknown; reason?: unknown; cause?: unknown; error?: unknown };
  if (e.name === "AbortError") return true;
  if (["AM_GENERATION_SESSION_CANCELLED", "AM_ANALYZER_ABORT_PENDING_NOVELAI", "REQUEST_ABORTED", "cancelled"].includes(String(e.code ?? ""))) return true;
  if (e.reason === "stale-queue-job") return true;
  if ((error as { error?: { code?: unknown } }).error?.code === "cancelled") return true;
  return isCancellation(e.cause, depth + 1) || isCancellation(e.error, depth + 1);
}
/** AM `y1t` 168885: asset hints from image tokens + native markups. */
function assetHintsFrom(tokens: ReturnType<typeof detectImageTokens>, markups: ReturnType<typeof detectNativeAssetMarkups>): IllustrationPlanAssetHint[] {
  const byOffset = new Map<number, Map<string, (typeof tokens)[number]>>();
  for (const t of tokens) {
    const m = byOffset.get(t.offset) ?? new Map();
    if (!m.has(t.full)) m.set(t.full, t);
    byOffset.set(t.offset, m);
  }
  return markups.map((n, i) => {
    const a = byOffset.get(n.sourceOffset)?.get(n.sourceMarkup);
    return {
      occurrenceId: a ? `occ:${a.index}:${a.offset}:${fnv(a.tokenName || a.full)}` : `native:${i}:${n.sourceOffset}`,
      tokenName: a?.tokenName ?? "",
      characterName: a?.characterName ?? "",
      sourceMarkup: n.sourceMarkup,
      markupType: a?.markupType ?? "charx_regex",
      detectorName: a?.detectorName ?? n.detectorName,
      sourceOffset: n.sourceOffset,
    };
  });
}
function fnv(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Engine provider id for a resolved Lumiverse image target (only NovelAI and ComfyUI targets exist since AM 0.9.90). */
export function engineProviderFor(target: Pick<ResolvedImageTarget, "generationProvider">): ImageProviderId {
  return target.generationProvider === "comfy-ui" ? "comfy-ui" : "novelai";
}

/**
 * Engine providers whose stored generation records can be regenerated. Records of the removed providers ("chan-server",
 * the port's former "generic" Lumiverse providers) stay viewable but cannot be regenerated (AM 0.9.90 parity).
 */
export function isRegenerableEngineProvider(provider: unknown): provider is "novelai" | "comfy-ui" {
  return provider === "novelai" || provider === "comfy-ui";
}

/** Native asset detectors for a character (AM `sH` 120727 over `charxAssetRegexAnalysis`). */
export function nativeDetectorsFor(characterId: string, name: string, document: CharacterDocument | null, memberIds: string[] = [characterId]): NativeAssetDetector[] {
  try {
    return buildCharxAssetRegexDetectors({
      character: { chaId: characterId, id: characterId, name, type: "character", customscript: [] },
      analysisMap: document?.characterPrompt.charxAssetRegexAnalysis ?? {},
      characterIds: memberIds,
    } as never) as NativeAssetDetector[];
  } catch {
    return [];
  }
}

/** Speaking character of a message (group chats: member whose name matches the message speaker). */
export async function speakingCharacterId(services: BackendServices, chat: ChatInfo, message: ChatMessageView | undefined): Promise<string> {
  const members = chat.groupCharacterIds.length ? chat.groupCharacterIds : [chat.characterId];
  if (members.length > 1 && message?.name) {
    for (const id of members) {
      try {
        const info = await services.sources.getCharacter(id);
        if (info.name.trim() && info.name.trim() === message.name.trim()) return id;
      } catch {
        /* missing member */
      }
    }
  }
  return chat.characterId || members[0] || "";
}

function mergeCharacterPrompts(primary: Rec, others: Rec[]): Rec {
  const out = { ...primary };
  for (const other of others)
    for (const [k, v] of Object.entries(other)) {
      if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) out[k] = { ...(v as Rec), ...(out[k] as Rec) };
      else if (!(k in out)) out[k] = v;
    }
  return out;
}

function personaRecord(p: PersonaInfo): PersonaRecord {
  return { key: p.personaId, id: p.personaId, name: p.name, ...(p.avatarImageId ? { imageAsset: { key: p.avatarImageId, name: p.name, sourceType: "persona" } } : {}) };
}

/**
 * Message ids for the continuity lookback (AM `cPt` 209396): only assistant messages carry an id, others are "",
 * so the 3-message lookback counts assistant replies.
 */
export function continuityLookbackIds(messages: readonly ChatMessageView[], target: number, historyId: string): string[] {
  return messages.map((m, i) => (i === target ? historyId : m.role === "assistant" ? `${m.id}@${m.swipeId}` : ""));
}

/* ------------------------------------------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------------------------------------- */

export interface GeneratorDeps {
  services: BackendServices;
  engine: EnginePort;
  /** Feature modules (the analysis module supplies the outfit image generator for free outfit generation). */
  getModules?: () => BackendModules;
  /** AM E1t `_`: outfits allocated per (character, chat message), replayed into later analyzer runs. */
  replayOutfits?: Map<string, Map<string, unknown>>;
}

export async function generateMessageIllustrations(deps: GeneratorDeps, req: GenerateMessageRequest): Promise<GenerateMessageResult> {
  const { services, engine } = deps;
  const W = resolveImageCountConstraint(req.countPolicy, req.slots.length);
  let resolvedCount = W.max;
  const empty = (error: { en: string; ko: string }): GenerateMessageResult => ({ entries: [], records: [], assetHints: [], resolvedCount, error: error.en, errorKo: error.ko });
  if (!req.slots.length) return empty(PIPELINE_TEXT.noInsertableSlot);
  if (!req.clean.trim()) return empty(PIPELINE_TEXT.emptyContent);
  if (req.signal.aborted) throw new DOMException("Image generation preparation was cancelled.", "AbortError");

  const config = req.config;
  const targetMessage = req.messages[req.target];
  const primaryId = await speakingCharacterId(services, req.chat, targetMessage);
  const memberIds = [...new Set([primaryId, ...req.chat.groupCharacterIds].filter(Boolean))];
  const imageTarget = await services.images.resolveTarget();
  const engineProvider = engineProviderFor(imageTarget);

  // Documents + sources (group chats: union, primary = speaking character).
  const docs = new Map<string, CharacterDocument>();
  for (const id of memberIds) docs.set(id, await services.storage.loadCharacterDocument(id));
  const primaryDoc = docs.get(primaryId) ?? null;
  const character = await services.sources.getCharacter(primaryId);
  const rawSources: CharacterSource[] = [];
  for (const id of memberIds) rawSources.push((await services.sources.buildSource(id, docs.get(id)!, { chatId: req.chatId })) as unknown as CharacterSource);
  const primarySource = rawSources[0]!;
  const seenMembers = new Set<string>();
  const source: CharacterSource = {
    ...primarySource,
    members: rawSources.flatMap((s) => s.members).filter((m) => (seenMembers.has(m.key) ? false : (seenMembers.add(m.key), true))),
  };
  const customCharacters = [...docs.values()].flatMap((d) => d.customCharacters);

  // Free character / outfit generation stores (AM autoCharacter / autoOutfit over the AM config store of the primary
  // character). The config store also backs `getConfig`, so outfits / forms generated during the run are visible.
  let auto: AutoGeneration | null = null;
  try {
    auto = await openAutoGeneration(services, deps.getModules, primaryId);
  } catch (e) {
    try {
      services.log.append("warn", "pipeline", "Free character/outfit generation is unavailable for this run.", { error: e instanceof Error ? e.message : String(e) });
    } catch {
      /* ignore */
    }
  }
  try {
    /** Characters generated in this run (AM E1t `jt` 169540): merged into `characterForms` of the live config. */
    let generatedForms: Rec = {};

    // Atelier snapshot taken at job start (AM `rW` reads the settings snapshot once per run).
    let atelier: AtelierRuntimeOverlay | null = null;
    try {
      atelier = await atelierServiceOf(services).runtimeOverlay(config);
    } catch (e) {
      services.log.append("warn", "pipeline", "The Maid Atelier settings could not be read; this run uses the built-in preset.", { error: e instanceof Error ? e.message : String(e) });
    }
    // Runtime config (AM merged Y0 shape) + engine provider.
    const otherPrompts = memberIds.slice(1).map((id) => rec(docs.get(id)?.characterPrompt));
    const decorate = (base: Rec): Rec => {
      const runtime = jsonClone(base);
      const novelai = rec(runtime.novelai);
      runtime.novelai = { ...novelai, naiModel: imageTarget.model, characterReferenceEnabled: imageTarget.isNovelAIV5 ? false : novelai.characterReferenceEnabled };
      const cp = mergeCharacterPrompts(rec(runtime.characterPrompt), otherPrompts);
      runtime.characterPrompt = { ...cp, characterForms: { ...rec(cp.characterForms), ...generatedForms } };
      runtime.runtime = { ...rec(runtime.runtime), generationProvider: engineProvider };
      runtime.chatImageGenerationSettings = jsonClone(req.settings);
      // Maid Atelier (config/atelier.json): active preset, guideline library, free-generation guidelines, execution.
      if (atelier) applyAtelierOverlay(runtime as Rec & { runtime: unknown }, atelier, resolveSourceGenerationSettings(runtime as unknown as AssetMaidConfig, primaryId) as Pick<EffectiveCharxSettings, "fixedResolution" | "forceAiChoiceCoordinates">);
      return req.directing ? req.directing(runtime) : runtime;
    };
    const runtime = decorate(auto ? (auto.store.getCurrentSnapshot() as Rec) : (buildRuntimeConfig(config, primaryDoc, { resolvedImageModel: imageTarget.model }) as unknown as Rec));
    const getConfig = () => (auto ? decorate(auto.store.getCurrentSnapshot() as Rec) : runtime) as unknown as AssetMaidConfig;
    const amConfig = runtime as unknown as AssetMaidConfig;
    const analysisConfig: unknown = req.analysisConfig ?? amConfig;
    const sourceId = primaryId;
    const ne = resolveSourceGenerationSettings(amConfig, sourceId);
    const fixedRating = resolveSourceFixedRating(amConfig, sourceId);
    const execution = effectiveAnalysisExecution(config.runtime, ne as Pick<EffectiveCharxSettings, "fixedResolution" | "forceAiChoiceCoordinates">);

    // Persona.
    const personas = await services.sources.listPersonas();
    const active = await services.sources.getActivePersona(req.chatId);
    const personaRecords = personas.map(personaRecord);
    const activePersona = active ? personaRecord(active) : null;

    // Request messages before the target (AM `dq` 169008), stripped of our markup.
    const requestMessages = req.messages.slice(0, req.target).flatMap((m) => {
      if (m.role === "system") return [];
      const content = cleanMessageContent(m.content);
      return content.trim() ? [{ role: m.role === "assistant" ? "assistant" : "user", content, ...(m.name ? { name: m.name } : {}) }] : [];
    });

    // Continuity basis at the target message (AM 169508-169524 `ooe`; 0.9.90 no longer merges the actor state `Lne`).
    const chatKey = chatKeyForChat(req.chatId);
    const liveIds = continuityLookbackIds(req.messages, req.target, req.historyId);
    const store = req.chatData.store as unknown as ContinuityChatStore;
    const hr: ContinuityState = rebuildContinuityAtMessage(store, chatKey, liveIds, req.historyId);

    // Image tokens + asset hints (AM 169527-169530).
    const detectors = nativeDetectorsFor(primaryId, character.name, primaryDoc, memberIds);
    const tokens = detectImageTokens(req.clean, { customImageTokenDetectors: detectors });
    const markups = detectNativeAssetMarkups(req.clean, { customImageTokenDetectors: detectors });
    const assetHints = assetHintsFrom(tokens, markups);

    const sourceWithCustom = withCustomCharacterMembers(source, customCharacters as unknown[]);
    const ft = buildAnalyzerContextInputs({
      config: amConfig,
      getConfig,
      continuity: hr as unknown as ContextContinuityState,
      chatKey,
      messages: requestMessages,
      content: req.clean,
      imageTokens: tokens.map((t) => toPlannerImageToken(t)),
      character: { name: character.name, description: character.description },
      source: sourceWithCustom,
      activePersona,
      personaRecords,
    });

    // Free character generation: per-character setting + the store (E1t 169564). The readiness check (AM d1t 168807)
    // always passes with V5, the only analysis profile since AM 0.9.90.
    const freeCharacters = ne.freeCharacterGenerationEnabled && !!auto;

    const evidence = await resolveIdentityEvidence({
      candidates: ft.analyzerIdentityCandidates,
      slots: req.slots,
      originalAssetTokens: tokens as never,
      source,
      previousMessageParticipantKeys: [
        ...(ft.visualContinuity.previous_message_participants?.character_keys ?? []),
        ...(ft.visualContinuity.previous_message_participants?.persona_keys ?? []),
      ],
      signal: req.signal,
    });
    const candidateSlots = buildCandidateSlots(req.slots, evidence);
    // Outfits allocated by earlier runs of the same message (AM E1t `_` map, 169534-169536 / 169791-169794).
    const operationKey = `${chatKey}:${req.historyId}`;
    const replayKey = JSON.stringify([primaryId, operationKey]);
    const replayOutfits = [...(deps.replayOutfits?.get(replayKey)?.values() ?? [])];
    const assembled = assembleAnalyzerInput({
      config: amConfig,
      sourceId,
      inputs: ft,
      candidateSlots,
      targetImageCount: W.max,
      imageCountConstraint: W,
      checkpoint: { chatKey, messageId: req.historyId },
      modelType: "illustration-generation",
      replayGeneratedOutfits: replayOutfits as never,
      ...(req.splitAnalysis ? { splitAnalysis: req.splitAnalysis as never } : {}),
      ...(req.revision ? { revisionDirection: req.revision.direction, revisionPromptChannels: req.revision.currentPrompt as never, revisionEvidenceKey: req.revision.evidenceKey } : {}),
    });
    assembled.context.freeCharacterGenerationEnabled = freeCharacters;
    // Inlay outfit layer: registered outfit parts for the analyzer request and the image-prompt repair.
    const outfitIndex = config.runtime.outfitAwarenessDisabled ? undefined : createRunOutfitIndex(assembled.context);
    const revisionImage = req.revision?.image && (await services.llm.supportsVision().catch(() => false)) ? [await req.revision.image()] : [];
    if (req.signal.aborted) throw new DOMException("Image generation preparation was cancelled.", "AbortError");

    // Results collected by the callbacks.
    const origin = originForAttempt(req.attemptKind);
    const entries: IllustrationPlanEntry[] = [];
    const records: GenerationRecord[] = [];
    let error = "";
    let errorKo: string | undefined;
    let failure: unknown;
    let cancelled = false;
    let analyzerCompleted = false;
    let commitContinuity: ContinuityCommit | undefined;
    const skipSlotIndexes = req.attemptKind === "retry" ? [...new Set([...req.existingEntries.map((e) => e.slotIndex), ...req.deletedSlotIndices])] : [];
    // AM 170590: continuity is persisted for automatic runs and for manual runs on the latest assistant message.
    const lastAssistant = req.messages.map((m, i) => (m.role === "assistant" ? i : -1)).filter((i) => i >= 0).at(-1) ?? -1;
    const persistContinuity = req.automatic || !(req.target >= 0 && req.target < lastAssistant);
    const continuityMessageId = `id:${req.historyId}`;
    const messageIndex = targetMessage?.index ?? req.target;

    const commitWith = (apply: (info: { historyRevisionId: string; historyRevisionOrder: number }) => ContinuityState): ContinuityCommit =>
      async (doc, info) => {
        if (!persistContinuity) return;
        // AM 0.9.90 computes the next state from the basis (`G3e`) and the history save stores only this revision's
        // checkpoint (`bwe` @171608-171614); checkpoints of other messages and revisions stay as they are.
        commitContinuityCheckpoint(doc.store as unknown as ContinuityChatStore, apply(info), chatKey, req.historyId, info.historyRevisionId);
      };

    const idLabel = (key: string): string => {
      if (key.startsWith("persona::")) return personas.find((p) => p.personaId === key.slice(9))?.name ?? "";
      for (const m of sourceWithCustom?.members ?? []) {
        if (m.key === key) return m.name;
        for (const l of m.lorebooks) if ((l.runtimePromptKey || `${m.key}::lore::${l.id}`) === key) return l.title;
      }
      return "";
    };

    const comfyTimeout = Number(rec(runtime.runtime).comfyuiCompletionTimeoutMs) || 600000;

    // Free outfit generation (AM 0.9.90 Vxt @173621-173638): per actor (V5; the V4.5 route-plan hooks are gone).
    const creationMode = auto?.imagesAvailable ? resolveOutfitCreationMode(amConfig) : "tags-only";
    const prepareOutfits = auto
      ? async ({ actors, signal }: { actors: unknown[]; signal?: AbortSignal }) => {
          const requested = outfitIndex
            ? reuseSameOutfits(outfitIndex, withoutAbsenceProposals(actors), (r) =>
                services.log.append("info", "pipeline", `Outfit reuse: proposal "${r.proposal}" for ${r.identityKey} matches "${r.reused}"; no new outfit.`),
              )
            : actors;
          const prepared = await auto!.autoOutfit.prepareActors({
            actors: requested,
            source: sourceWithCustom,
            sourceId,
            signal,
            creationMode,
            onOutfitAllocated: (o: Rec) => {
              if (!deps.replayOutfits) return;
              const map = deps.replayOutfits.get(replayKey) ?? new Map<string, unknown>();
              map.set(JSON.stringify([o.promptKey, o.formId, o.outfitId]), o);
              deps.replayOutfits.set(replayKey, map);
              while (deps.replayOutfits.size > 64) deps.replayOutfits.delete(deps.replayOutfits.keys().next().value!);
            },
          });
          if (outfitIndex) recordPreparedOutfits(outfitIndex, requested, prepared.preparedOutfits);
          return prepared;
        }
      : undefined;
    // Free character generation (AM 0.9.90 Vxt @173614-173620): generated forms join the live config (`De`).
    // AM keys the allocations and the save attempts by the request object (`requestOwner`); here that is `req`.
    // 0.9.90 no longer sends known identities.
    const prepareCharacters = freeCharacters
      ? async (input: Rec) => {
          const prepared = await auto!.autoCharacter.prepare({ ...input, sourceId, owner: req });
          generatedForms = Object.fromEntries(prepared.flatMap((p) => (p.forms ? [[p.identityKey, p.forms]] : [])));
          return prepared;
        }
      : undefined;
    const input: Rec = {
      automaticRetryManaged: true,
      imageRetryCount: config.runtime.generationAutoRetryCount,
      generationType: generationTypeFor(origin, !req.automatic, !!req.revision),
      sessionContext: {
        chatKey,
        responseKey: req.jobId,
        messageIndex,
        messageId: continuityMessageId,
        displayName: req.activityLabel,
        slotIds: req.slots.map((s) => s.slotId),
        targetImageCount: W.max,
        matchedAssetCount: W.min,
        totalAssetCount: W.max,
      },
      // Gemini 4 Argon on a Vertex connection gets the compact response contract (AM 0.9.91 `c0e`); an unreadable connection
      // leaves the config as it is and fails later, in the analyzer call, with its own message.
      analysisConfig: engineAnalysisConfig(config.analysis, await services.llm.analyzerTarget().catch(() => null)),
      novelAIConfig: { ...resolveNovelAIRunConfig(amConfig, { sourceId }), apiKey: "lumiverse-connection" },
      ...(req.revision
        ? {
            revisionDirection: req.revision.direction,
            revisionPromptChannels: req.revision.currentPrompt,
            revisionEvidenceKey: req.revision.evidenceKey,
            ...(req.revision.imageToImage
              ? { novelAIImageToImage: req.revision.imageToImage, novelAIImageToImageStrength: req.revision.imageToImageStrength, novelAIImageToImageNoise: req.revision.imageToImageNoise }
              : {}),
          }
        : {}),
      generationProvider: engineProvider,
      // AM 0.9.90 `qbt$990`: the chat toolbar's global resolution / AI coordinates (seeded from this CharX's old values).
      ...(execution.resolution
        ? { requestedSizeId: execution.resolution.id, requestedSize: resolveImageSize(execution.resolution.id, (config.runtime.customImageSizes ?? []) as never) ?? { ...execution.resolution } }
        : {}),
      // AM 0.9.89.3+: custom sizes are image-ratio candidates (resolveV5UserDirections `xbt`).
      customImageSizes: config.runtime.customImageSizes ?? [],
      forceAiChoiceCoordinates: execution.aiCoordinates !== true,
      // AM 0.9.90 `forceRating: yS(ge)` (fixed rating of the source; replaces the NSFW prefix).
      forceRating: fixedRating,
      comfyUI: {
        endpoint: "",
        workflowProfileId: BUNDLED_COMFY_WORKFLOW_PROFILE.id,
        completionTimeoutMs: comfyTimeout,
        animaPositivePrefix: ne.animaPositivePrompt,
        animaNegativePrefix: ne.animaNegativePrompt,
      },
      analyzerInput: {
        checkpointPolicy: checkpointPolicyFor(req.attemptKind),
        ...assembled,
        ...(revisionImage.length ? { imageParts: revisionImage } : {}),
      },
      ...(prepareCharacters ? { prepareCharacters } : {}),
      ...(prepareOutfits ? { prepareOutfits } : {}),
      ...(outfitIndex ? { outfitIndex } : {}),
      v5PromptContext: ft.v5PromptContext,
      references: ft.references,
      outfitReference: ft.outfitReference,
      characterReference: ft.characterReference,
      seedSetting: req.revision ? () => ({ seed: str(req.revision!.seed), fixed: !!(req.revision!.seedFixed && str(req.revision!.seed)) }) : ft.seedSetting,
      previousCharacterStateMap: ft.previousCharacterStateMap,
      previousContinuitySnapshot: getLatestContinuityCheckpointSnapshot(hr, chatKey, "novelai-v5"),
      previousGlobalModifierRefs: previousGlobalModifierRefs(ft.visualContinuity),
      advanceContinuityTurn: !req.revision,
      assertAssetPersistenceAvailable: async () => undefined,
      applyV5Continuity: async (state: unknown) => {
        await req.assertTarget();
        commitContinuity = commitWith((info) =>
          persistV5ContinuityState({
            basisState: hr,
            continuity: state,
            chatKey,
            chatIndex: 0,
            messageIndex,
            messageId: continuityMessageId,
            historyRevisionId: info.historyRevisionId,
            historyRevisionOrder: info.historyRevisionOrder,
          }),
        );
      },
      persistGeneratedImage: async (image: Rec) => {
        await req.assertTarget();
        const decision = rec(image.decision);
        const slotNumber = Number(decision.slot_number ?? decision.slotNumber);
        const slot = Number.isInteger(slotNumber) ? req.slots.find((s) => s.index === slotNumber) : undefined;
        if (!slot) throw new Error(PIPELINE_TEXT.slotMismatch.en);
        const generation = rec(image.generation);
        const meta = rec(generation.providerMetadata);
        const imageId = str(meta.imageId) || str(generation.requestId);
        if (!imageId) throw new Error("The image provider returned no image id.");
        const actors = (Array.isArray(image.actors) ? image.actors : []).map(rec);
        const key = str(actors.find((a) => str(a.identityKey))?.identityKey) || str(decision.lorebook_prompt_key);
        const label = idLabel(key) || str(actors[0]?.identityName) || character.name;
        const assetName = createGeneratedAssetName({ label, kind: "chat", ...(UUID_RE.test(imageId) ? { id: imageId } : {}) });
        const width = Math.max(0, Math.round(Number(generation.width) || 0));
        const height = Math.max(0, Math.round(Number(generation.height) || 0));
        const entry: IllustrationPlanEntry = {
          slotId: slot.slotId,
          sourceImageToken: slot.sourceImageToken,
          slotIndex: slot.index,
          assetName,
          savedPath: imageResultUrl(imageId),
          extension: str(generation.extension) || "png",
          entryId: `generated:${assetName}`,
          ...(width ? { width } : {}),
          ...(height ? { height } : {}),
          generationOrigin: origin,
          ...(req.revision?.sourceEntryId ? { parentEntryId: req.revision.sourceEntryId } : {}),
        };
        const providerPrompt = rec(image.providerPrompt);
        const record = rec(image.generationRecord);
        const recordRequest = rec(record.request);
        const plan = rec(image.promptPlan);
        const novelAIConfig = image.novelAIConfig ? { ...rec(image.novelAIConfig) } : undefined;
        if (novelAIConfig) delete novelAIConfig.apiKey;
        const analysis = analysisRecordOf(image);
        records.push({
          entryId: entry.entryId,
          imageId,
          assetName,
          messageKey: req.planKey,
          slotId: slot.slotId,
          revisionId: req.revisionId,
          createdAt: Date.now(),
          engineProvider,
          lumiverseProvider: str(meta.lumiverseProvider) || imageTarget.lumiverseProvider,
          model: str(meta.model) || imageTarget.model,
          seed: str(generation.seed),
          seedFixed: image.seedFixed === true,
          width,
          height,
          sizeId: Number(plan.sizeId) || 0,
          positivePrompt: str(recordRequest.positive) || str(providerPrompt.positivePrompt),
          negativePrompt: str(recordRequest.negative) || str(providerPrompt.negativePrompt),
          characters: (Array.isArray(recordRequest.characters) ? recordRequest.characters : Array.isArray(providerPrompt.characterPrompts) ? providerPrompt.characterPrompts : []).map((c) => {
            const r = rec(c);
            return {
              prompt: str(r.prompt),
              negativePrompt: str(r.negativePrompt ?? r.uc),
              ...(Number.isFinite(Number(r.actorIndex)) ? { actorIndex: Number(r.actorIndex) } : {}),
              ...(Number.isFinite(Number(r.centerX)) ? { centerX: Number(r.centerX), centerY: Number(r.centerY) } : {}),
            };
          }),
          ...(novelAIConfig ? { novelAIConfig } : {}),
          ...(meta.novelaiSampling ? { novelaiSampling: meta.novelaiSampling as NovelAISampling } : {}),
          actors: actors.map((a) => ({
            identityKey: str(a.identityKey),
            identityName: str(a.identityName),
            kind: str(a.kind),
            actorIndex: Number(a.actorIndex) || 0,
            ...(str(a.selectedFormId) ? { selectedFormId: str(a.selectedFormId) } : {}),
            ...(str(a.selectedOutfitId) ? { selectedOutfitId: str(a.selectedOutfitId) } : {}),
          })),
          ...(str(plan.artistId) ? { artistId: str(plan.artistId) } : {}),
          promptKey: key,
          presetId: str(decision.preset_id ?? decision.composition_id),
          analyzerText: str(decision.reason ?? decision.body_action),
          sentParameters: rec(meta.sentParameters),
          generationOrigin: origin,
          ...(entry.parentEntryId ? { parentEntryId: entry.parentEntryId } : {}),
          ...(analysis ? { analysis } : {}),
        });
        entries.push(entry);
      },
      skipSlotNumbers: skipSlotIndexes,
      cancelPrevious: true,
      signal: req.signal,
      onEvent(e: Rec) {
        if (e.type === "jev-selection") {
          req.onJevSelection?.(jevSelectionProgress(rec(e.jevSelection)));
          return;
        }
        if (e.type === "retry-errors") {
          const retry = rec(e.imageRetry);
          const imageRetry = Number(retry.attempt) > 0 ? { attempt: Number(retry.attempt), total: Number(retry.total) || 0 } : undefined;
          req.onRetryErrors?.((Array.isArray(e.retryErrors) ? e.retryErrors : []) as GenerationRetryError[], imageRetry);
          return;
        }
        // The engine counts the slots it will generate: its plan minus the skipped slots in that plan. Adding all our
        // skipped slots is safe at "planning" (a skipped slot outside the plan is also in `done` below). The split core's
        // early count (first detail batch, AM `eI(..., "analyzing-preset")`) subtracts only that batch's skipped slots,
        // so with ours added it can exceed the plan; the plan never exceeds the run's count ceiling, so neither may it.
        const counted = Number.isFinite(Number(e.imageCount)) ? Number(e.imageCount) + skipSlotIndexes.length : undefined;
        const imageCount = counted === undefined || e.phase === "planning" ? counted : Math.min(counted, Math.max(W.max, 1));
        if (imageCount !== undefined && (e.phase === "planning" || (e.analysisComplete === false && e.phase === "analyzing-preset"))) {
          resolvedCount = imageCount;
          req.onResolvedCount?.(imageCount);
        }
        const phase =
          e.analysisComplete === false || e.phase === "analyzing-preset"
            ? "analyzing-preset"
            : e.phase === "analyzing-modifiers"
              ? "analyzing-modifiers"
              : e.phase === "planning"
                ? "planning"
                : e.phase === "generating" || e.phase === "saving"
                  ? "generating"
                  : e.phase === "applying-continuity" || e.phase === "complete"
                    ? "committing"
                    : null;
        if (phase === "planning" || phase === "generating" || phase === "committing") analyzerCompleted = true;
        const session = rec(e.session);
        const progress = rec(session.progress);
        if (phase)
          req.onPhase?.(phase, {
            imageIndex: Number.isFinite(Number(e.imageIndex)) ? Number(e.imageIndex) : undefined,
            imageCount: imageCount ?? (Number.isFinite(Number(progress.imageCount)) ? Number(progress.imageCount) : undefined),
            providerStage: str(progress.providerStage) || undefined,
          });
      },
    };

    try {
      await engine.run(input as never, {
        engineProvider,
        purpose: req.revision ? "regenerate" : "chat",
        connectionId: imageTarget.connectionId,
        model: imageTarget.model,
        ownerChatId: req.chatId,
        ownerCharacterId: primaryId,
        comfyuiWorkflowId: imageTarget.comfyuiWorkflowId,
        forceRating: () => fixedRating,
        ...(req.ground ? { ground: req.ground } : {}),
        ...(req.infill ? { infill: req.infill } : {}),
        // AM `rW`: the analyzer of the active Atelier preset, prepared from the job-start config snapshot, or from the
        // original run's snapshot on a retry / restart.
        analysisConfig,
      }, config);
      await req.assertTarget();
    } catch (e) {
      if (isCancellation(e) || req.signal.aborted) cancelled = true;
      else {
        error = e instanceof Error ? e.message : String(e);
        failure = e;
      }
    }

    if (auto) {
      // Pending document writes of generated characters / outfits finish before the job commits (AM `settle`).
      await auto.autoCharacter.settle().catch(() => undefined);
      await auto.store.settle().catch(() => undefined);
    }

    const done = new Set([...(req.attemptKind === "retry" ? req.existingEntries : []), ...entries].map((e) => e.slotId));
    const missing = Math.max(0, resolvedCount - done.size - (req.attemptKind === "retry" ? req.deletedSlotIndices.length : 0));
    if (!cancelled && !error && missing) {
      const label = formatLabel(PIPELINE_TEXT.failedCount, { n: missing });
      error = label.en;
      errorKo = label.ko;
    }
    return {
      entries,
      records,
      assetHints,
      resolvedCount,
      error: cancelled ? "" : error,
      ...(errorKo && !cancelled ? { errorKo } : {}),
      ...(failure ? { failure } : {}),
      ...(analyzerCompleted ? { analyzerCompleted: true } : {}),
      analysisConfig,
      ...(cancelled ? { cancelled: true } : {}),
      ...(commitContinuity ? { commitContinuity } : {}),
    };
  } finally {
    // Every exit (early result, cancellation, failure) releases this run's share of the character's free-generation stores.
    auto?.dispose();
  }
}
