/**
 * One message run (AM `generateMessageIllustrations` = E1t `z` 170478-170693 + `D` 169305-170208, illustration path):
 * Lumiverse data -> analyzer context (MAt, identity evidence, candidate slots) -> orchestrator input -> engine run ->
 * persisted entries (one per generated image, host image-gen results) + a deferred continuity commit.
 *
 * Lumiverse mapping (PORT-PLAN): source = `SourcesService.buildSource` (group chats: union of the members' sources and
 * documents, primary = speaking character), custom characters appended (`rI`), runtime config =
 * `buildRuntimeConfig(global, document)`, personas from Lumiverse, chat messages before the target (stripped of our
 * markup), continuity rebuilt from the chat data checkpoints at the target message + the current actor state.
 */
import {
  buildRuntimeConfig,
  chatKeyForChat,
  createGeneratedAssetName,
  imageResultUrl,
  jsonClone,
  type AttemptKind,
  type CharacterDocument,
  type ChatDataDocument,
  type ChatImageGenerationSettings,
  type CountPolicy,
  type CurrentActorState,
  type GenerationOrigin,
  type IllustrationPlanAssetHint,
  type IllustrationPlanEntry,
  type InlayConfig,
} from "../../shared/contract/index.js";
import {
  assembleAnalyzerInput,
  buildAnalyzerContextInputs,
  buildCandidateSlots,
  previousGlobalModifierRefs,
  resolveIdentityEvidence,
  resolveNovelAIRunConfig,
  resolveSourceGenerationSettings,
  toPlannerImageToken,
  withCustomCharacterMembers,
  type AssetMaidConfig,
  type CharacterSource,
  type ContinuityState as ContextContinuityState,
  type PersonaRecord,
} from "../../engine/context/index.js";
import { BUNDLED_COMFY_WORKFLOW_PROFILE, resolveImageCountConstraint, resolveImageSize } from "../../engine/compose/index.js";
import {
  computeDeferredVisualContinuity,
  createEmptyContinuityState,
  createMemoryContinuityController,
  getLatestContinuityCheckpointSnapshot,
  mergeLocalLoreActorState,
  readContinuityFromChat,
  readLocalLoreActorState,
  rebuildContinuityAtMessage,
  serializeContinuityState,
  writeContinuityToChat,
  writeLocalLoreActorState,
  type ContinuityChat,
  type ContinuityChatStore,
  type ContinuityState,
  type VisualContinuityResult,
} from "../../engine/continuity/index.js";
import { buildCharxAssetRegexDetectors, detectImageTokens, detectNativeAssetMarkups, type NativeAssetDetector } from "../../engine/text/index.js";
import { persistV5ContinuityState } from "../../engine/core/asset-maid-core";
import type { ImageProviderId } from "../../engine/index.js";
import type { BackendServices, ChatInfo, PersonaInfo, ResolvedImageTarget } from "../services/types.js";
import type { EnginePort } from "./engine-port.js";
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
  actors: Array<{ identityKey: string; identityName: string; kind: string; actorIndex: number }>;
  promptKey: string;
  presetId: string;
  analyzerText: string;
  sentParameters: Rec;
  generationOrigin: GenerationOrigin;
  parentEntryId?: string;
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

/** Engine provider id for a resolved Lumiverse image target ("generic" -> "chan-server", anima-flat, no references). */
export function engineProviderFor(target: Pick<ResolvedImageTarget, "generationProvider">): ImageProviderId {
  return target.generationProvider === "novelai" ? "novelai" : target.generationProvider === "comfy-ui" ? "comfy-ui" : "chan-server";
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

/** Chat object for the engine's continuity storage adapter (AM risu chat: `message[]` + `localLore[]`). */
export function continuityChat(messages: readonly ChatMessageView[], target: { index: number; historyId: string } | null, actorState: CurrentActorState): ContinuityChat {
  const chat: ContinuityChat = {
    message: messages.map((m, i) => ({
      role: m.role === "assistant" ? "char" : "user",
      data: m.content,
      chatId: target && i === target.index ? target.historyId : `${m.id}@${m.swipeId}`,
    })),
    localLore: [],
  };
  if (actorState.revision >= 1) writeLocalLoreActorState(chat, actorState as never);
  return chat;
}

/* ------------------------------------------------------------------------------------------------
 * Run
 * ---------------------------------------------------------------------------------------------- */

export interface GeneratorDeps {
  services: BackendServices;
  engine: EnginePort;
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

  // Runtime config (AM merged Y0 shape) + engine provider.
  const runtime = buildRuntimeConfig(config, primaryDoc, { resolvedImageModel: imageTarget.model }) as unknown as Rec;
  const otherPrompts = memberIds.slice(1).map((id) => rec(docs.get(id)?.characterPrompt));
  runtime.characterPrompt = mergeCharacterPrompts(rec(runtime.characterPrompt), otherPrompts);
  runtime.runtime = { ...rec(runtime.runtime), generationProvider: engineProvider };
  runtime.chatImageGenerationSettings = jsonClone(req.settings);
  const amConfig = runtime as unknown as AssetMaidConfig;
  const sourceId = primaryId;
  const ne = resolveSourceGenerationSettings(amConfig, sourceId);

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

  // Continuity basis at the target message (AM 169508-169524: `ooe` + current actor state `Lne`).
  const chatKey = chatKeyForChat(req.chatId);
  const liveIds = req.messages.map((m, i) => (i === req.target ? req.historyId : `${m.id}@${m.swipeId}`));
  const store = req.chatData.store as unknown as ContinuityChatStore;
  const hr: ContinuityState = rebuildContinuityAtMessage(store, chatKey, liveIds, req.historyId);
  hr.characters[chatKey] = mergeLocalLoreActorState((hr.characters[chatKey] ?? {}) as never, req.chatData.actorState as never) as never;

  // Image tokens + asset hints (AM 169527-169530).
  const detectors = nativeDetectorsFor(primaryId, character.name, primaryDoc, memberIds);
  const tokens = detectImageTokens(req.clean, { customImageTokenDetectors: detectors });
  const markups = detectNativeAssetMarkups(req.clean, { customImageTokenDetectors: detectors });
  const assetHints = assetHintsFrom(tokens, markups);

  const sourceWithCustom = withCustomCharacterMembers(source, customCharacters as unknown[]);
  const ft = buildAnalyzerContextInputs({
    config: amConfig,
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

  // Readiness (AM d1t 168807). Free character generation needs the auto-character hook (not wired: off).
  const profile = str(rec(runtime.novelai).analysisProfile);
  if (!(profile === "v5-hybrid" || ft.analyzerIdentityCandidates.length > 0 || ft.analyzerPersonaCandidates.length > 0))
    return { ...empty(PIPELINE_TEXT.noCandidates), assetHints };

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
  const assembled = assembleAnalyzerInput({
    config: amConfig,
    sourceId,
    inputs: ft,
    candidateSlots,
    targetImageCount: W.max,
    imageCountConstraint: W,
    checkpoint: { chatKey, messageIndex: targetMessage?.index ?? req.target, messageId: req.historyId },
    modelType: "illustration-generation",
    ...(req.splitAnalysis ? { splitAnalysis: req.splitAnalysis as never } : {}),
    ...(req.revision ? { revisionDirection: req.revision.direction, revisionPromptChannels: req.revision.currentPrompt as never, revisionEvidenceKey: req.revision.evidenceKey } : {}),
  });
  assembled.context.freeCharacterGenerationEnabled = false;
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

  const commitWith = (apply: (controller: ReturnType<typeof createMemoryContinuityController>, info: { historyRevisionId: string; historyRevisionOrder: number }) => Promise<void>): ContinuityCommit =>
    async (doc, info) => {
      if (!persistContinuity) return;
      const chatObj = continuityChat(req.messages, { index: req.target, historyId: req.historyId }, doc.actorState);
      const current = readContinuityFromChat(doc.store as unknown as ContinuityChatStore, chatObj, chatKey) ?? createEmptyContinuityState();
      const controller = createMemoryContinuityController(current);
      await apply(controller, info);
      // The storage adapter takes the serialized document (AM pKe persists `Ete(state)`; `gDe` reads the string form).
      writeContinuityToChat(doc.store as unknown as ContinuityChatStore, chatObj, serializeContinuityState(controller.state), chatKey);
      const actorState = readLocalLoreActorState(chatObj);
      doc.actorState = { revision: actorState.revision, actors: actorState.actors } as unknown as CurrentActorState;
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
    analysisConfig: config.analysis,
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
    ...(ne.fixedResolution.enabled
      ? { requestedSizeId: ne.fixedResolution.sizeId, requestedSize: resolveImageSize(ne.fixedResolution.sizeId, (config.runtime.customImageSizes ?? []) as never) }
      : {}),
    forceAiChoiceCoordinates: ne.forceAiChoiceCoordinates,
    forceNsfwPrefix: ne.nsfwAlwaysEnabled,
    stateAccumulationEnabled: ne.stateAccumulationEnabled,
    comfyUI: {
      transport: "direct-workflow",
      chanServerRequestUrl: "",
      chanServerApiKey: "",
      endpoint: "",
      workflowProfileId: BUNDLED_COMFY_WORKFLOW_PROFILE.id,
      completionTimeoutMs: comfyTimeout,
      animaPositivePrefix: ne.animaPositivePrompt,
      animaNegativePrefix: ne.animaNegativePrompt,
    },
    analyzerInput: {
      executionMode: engine.executionMode(config),
      checkpointPolicy: checkpointPolicyFor(req.attemptKind),
      ...assembled,
      ...(revisionImage.length ? { imageParts: revisionImage } : {}),
    },
    promptInputs: ft.promptInputs,
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
    applyContinuity: async (result: VisualContinuityResult) => {
      await req.assertTarget();
      const outfitReferences = ft.outfitContinuityReferences(result.plan.images);
      commitContinuity = commitWith(async (controller, info) => {
        await computeDeferredVisualContinuity({
          controller,
          basisState: hr,
          continuity: result,
          chatKey,
          chatIndex: 0,
          messageIndex,
          messageId: continuityMessageId,
          historyRevisionId: info.historyRevisionId,
          historyRevisionOrder: info.historyRevisionOrder,
          outfitReferences,
        });
      });
    },
    applyV5Continuity: async (state: unknown) => {
      await req.assertTarget();
      commitContinuity = commitWith(async (controller, info) => {
        await persistV5ContinuityState({
          controller,
          basisState: hr,
          continuity: state,
          chatKey,
          chatIndex: 0,
          messageIndex,
          messageId: continuityMessageId,
          historyRevisionId: info.historyRevisionId,
          historyRevisionOrder: info.historyRevisionOrder,
        });
      });
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
        actors: actors.map((a) => ({ identityKey: str(a.identityKey), identityName: str(a.identityName), kind: str(a.kind), actorIndex: Number(a.actorIndex) || 0 })),
        promptKey: key,
        presetId: str(decision.preset_id ?? decision.composition_id),
        analyzerText: str(decision.reason ?? decision.body_action),
        sentParameters: rec(meta.sentParameters),
        generationOrigin: origin,
        ...(entry.parentEntryId ? { parentEntryId: entry.parentEntryId } : {}),
      });
      entries.push(entry);
    },
    skipSlotNumbers: skipSlotIndexes,
    cancelPrevious: true,
    signal: req.signal,
    onEvent(e: Rec) {
      const imageCount = Number.isFinite(Number(e.imageCount)) ? Number(e.imageCount) + skipSlotIndexes.length : undefined;
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
      forceNsfwPrefix: () => ne.nsfwAlwaysEnabled,
    }, config);
    await req.assertTarget();
  } catch (e) {
    if (isCancellation(e) || req.signal.aborted) cancelled = true;
    else {
      error = e instanceof Error ? e.message : String(e);
      failure = e;
    }
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
    ...(cancelled ? { cancelled: true } : {}),
    ...(commitContinuity ? { commitContinuity } : {}),
  };
}
