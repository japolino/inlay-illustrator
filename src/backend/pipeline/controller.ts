/**
 * Chat illustration pipeline controller (AM `hPt` 171771-174545 + E1t glue, spec/pipeline.md §1, §4, §5).
 *
 * - Triggers: GENERATION_ENDED (normal / swipe / regenerate, when `autoGenerationEnabled`), manual start / reroll / retry
 *   / restart, single-slot regeneration, AI prompt edit (revision run).
 * - Jobs: one message job per illustration message (AM `y`), one regeneration per slot (AM `$bt` lock), AbortController
 *   per job, auto retry loop (AM `ur` 173361), snapshots + `generation.progress` / `generation.finished` events.
 * - Job flow (AM `Or` 173414-173904): paragraph slots -> plan -> engine run -> plan revision -> ONE chat data write
 *   (plan + History `commitRevision` + store fold + deferred continuity) -> publish (re-bake the message swipe).
 *   Asset Maid published first and committed History after; the port commits first because the bake is derived from
 *   the persisted History and is idempotent, so a failed publish is simply retried.
 * - History / zoom / chat state / chat DOM operations used by rpc/handlers/chat.ts.
 */
import {
  appendGeneratedEntry,
  chatKeyForChat,
  createEmptyActorState,
  createGeneratedAssetName,
  deleteGeneratedEntry,
  filterActorStateRecord,
  fixedCountPolicy,
  illustrationMessageKey,
  imageIdFromResultUrl,
  imageResultUrl,
  jsonClone,
  listRevisionSlots,
  mutateHistoryTree,
  nextIllustrationAttempt,
  parseHistoryMessageId,
  promptCodecForProvider,
  reconcilePlanWithTree,
  resolveEffectiveConfig,
  resolveHistorySlot,
  rpcError,
  toHistoryMessageId,
  validateCurrentActorState,
  listNovelAIArtists,
  resolveFormCollection,
  resolvePersonaForms,
  type AiPromptEditProposal,
  type AiPromptEditRequest,
  type AssetCleanupResult,
  type AttemptKind,
  type ChatDataDocument,
  type ChatImageGenerationSettings,
  type ChatMessageUiState,
  type CountPolicy,
  type CurrentActorState,
  type GenerationJobSnapshot,
  type GenerationPhase,
  type GenerationResultKind,
  type HistoryEntry,
  type HistoryTree,
  type IllustrationPlan,
  type IllustrationPlanRevision,
  type InlayConfig,
  type JobStatus,
  type MessageTarget,
  type RegenerationOverrides,
  type RpcError,
  type SlotDeletionPreview,
  type ZoomDetails,
  type ZoomPromptSection,
} from "../../shared/contract/index.js";
import { resolveImageSize } from "../../engine/compose/index.js";
import { fail, isAbortLike, RpcFailure, toRpcError } from "../rpc/errors.js";
import type { BackendModules } from "../rpc/types.js";
import type { BackendServices, ChatInfo } from "../services/types.js";
import {
  bakeSelection,
  commitPlanToTree,
  distinctSlotCount,
  ensurePlan,
  expectedSlotCount,
  findPlan,
  mergeEntries,
  messageUiState,
  parentRevisionFor,
  storePlanAndTree,
} from "./chat-data.js";
import type { EnginePort } from "./engine-port.js";
import {
  engineProviderFor,
  generateMessageIllustrations,
  isCancellation,
  nativeDetectorsFor,
  speakingCharacterId,
  type GenerateMessageResult,
  type GenerationRecord,
  type RevisionInput,
} from "./generate.js";
import { HostGenerationTracker, isIllustratableMessage, loadMessages, swipeContent, writeSwipeContent, type ChatMessageView } from "./host-chat.js";
import { formatLabel, labelError, phaseProgress, PIPELINE_TEXT, type Label } from "./labels.js";
import { bakeMessage, messageSlots, stripForInterceptor, type InterceptorMessage } from "./markup.js";
import { readSidecar, sidecarPath, updateSidecar } from "./records.js";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });

/** AM `$5` 171236 streaming retry delays, then every 2 s. */
const PUBLISH_RETRY_DELAYS = [120, 400, 1000, 2000];
const PUBLISH_MAX_ATTEMPTS = 40;
const MAX_RETAINED_JOBS = 64;
const MAX_SETTINGS_SNAPSHOTS = 16;
/** AM auto-retry delay between attempts (`ur` 173382). */
const AUTO_RETRY_DELAY_MS = 100;
/** Host generation types that start automatic illustration (Lumiverse: normal, swipe, regenerate; not continue/impersonate/quiet). */
const AUTO_GENERATION_TYPES = new Set(["", "normal", "swipe", "regenerate"]);

export interface ChatPipeline {
  handleGenerationEnded(payload: unknown): Promise<void>;
  handleHostEvent(event: string, payload: unknown): Promise<void>;
  stripForInterceptor<T extends InterceptorMessage>(messages: readonly T[]): T[];
  recover(): Promise<void>;
  dispose(): void;

  /* generation.* */
  start(params: MessageTarget & { attemptKind?: "initial" | "retry" | "reroll"; countPolicy?: CountPolicy }): Promise<{ jobId: string; messageKey: string }>;
  cancel(params: { jobId?: string; chatId?: string; messageKey?: string }): void;
  retry(jobId: string): Promise<{ jobId: string }>;
  restart(jobId: string): Promise<{ jobId: string }>;
  dismiss(jobId: string): void;
  listActive(chatId?: string): GenerationJobSnapshot[];
  regenerateSlot(params: { chatId: string; messageKey: string; slotId: string; entryId?: string; overrides?: RegenerationOverrides }): Promise<{ jobId: string }>;

  /* history.* */
  getHistory(chatId: string, messageKeys?: string[]): Promise<{ tree: HistoryTree; plans: Record<string, IllustrationPlan> }>;
  selectEntry(chatId: string, slotId: string, entryId: string): Promise<void>;
  selectRevision(chatId: string, messageKey: string, revisionId: string): Promise<void>;
  deleteEntry(chatId: string, entryId: string): Promise<{ fallbackEntryId: string | null; cleanup: AssetCleanupResult[] }>;
  prepareSlotDeletion(chatId: string, messageKey: string, slotId: string): Promise<SlotDeletionPreview>;
  deleteSlot(previewToken: string): Promise<{ cleanup: AssetCleanupResult[]; cleanupId: string; projectionWarning?: string }>;
  retryCleanup(cleanupId: string): Promise<{ cleanup: AssetCleanupResult[] }>;

  /* zoom.* */
  getZoomDetails(chatId: string, slotId: string, entryId?: string): Promise<ZoomDetails>;
  saveDraft(chatId: string, slotId: string, overrides: RegenerationOverrides): Promise<ZoomDetails>;
  clearDraft(chatId: string, slotId: string, part: "prompts" | "coordinates" | "all"): Promise<ZoomDetails>;
  importViewed(chatId: string, slotId: string, entryId: string, what: "prompts" | "seed"): Promise<ZoomDetails>;
  requestAiPromptEdit(chatId: string, slotId: string, entryId: string, request: AiPromptEditRequest): Promise<AiPromptEditProposal>;
  applyAiPromptEdit(chatId: string, slotId: string, proposalId: string): Promise<{ jobId: string }>;

  /* chatState.* / chatDom.* */
  getChatState(chatId: string): Promise<{ actorState: CurrentActorState }>;
  clearChatState(chatId: string, actorKeys?: string[]): Promise<{ actorState: CurrentActorState }>;
  setChatState(chatId: string, actorState: CurrentActorState, baseRevision: number): Promise<{ actorState: CurrentActorState }>;
  getMessageStates(chatId: string, messageIds?: string[]): Promise<{ messages: ChatMessageUiState[] }>;

  /** Re-bake one message from its History (publish). */
  publish(chatId: string, messageKey: string): Promise<PublishResult>;
}

export type PublishResult = "published" | "missing" | "streaming";

interface JobRecord {
  snapshot: GenerationJobSnapshot;
  target: MessageTarget;
  planKey: string;
  kind: "message" | "regenerate" | "revision";
  controller: AbortController;
  slotId?: string;
  /** Re-run inputs (retry / restart). */
  regenerate?: { entryId?: string; overrides?: RegenerationOverrides };
  revision?: RevisionInput;
  done: Promise<void>;
  dismissed?: boolean;
}

interface CleanupRecord {
  chatId: string;
  imageIds: Array<{ assetName: string; imageId: string }>;
}

interface DeletionPreviewRecord {
  chatId: string;
  messageKey: string;
  slotId: string;
  revisionId: string;
  slotIndex: number;
  membership: string;
  createdAt: number;
}

interface ProposalRecord {
  chatId: string;
  slotId: string;
  entryId: string;
  request: AiPromptEditRequest;
  createdAt: number;
}

export interface ControllerOptions {
  /** Clock / ids for tests. */
  now?: () => number;
  /** Feature modules (analysis: outfit image generator for free outfit generation). */
  getModules?: () => BackendModules;
}

export function createChatPipelineController(services: BackendServices, engine: EnginePort, options: ControllerOptions = {}): ChatPipeline {
  const now = options.now ?? (() => Date.now());
  const tracker = new HostGenerationTracker();
  const jobs = new Map<string, JobRecord>();
  /** chatId \0 planKey -> running message job. */
  const messageJobs = new Map<string, JobRecord>();
  /** chatId \0 slotId -> running regeneration. */
  const slotJobs = new Map<string, JobRecord>();
  /** AM `ee`: chat image settings snapshot per message for retries (<= 16). */
  const settingsSnapshots = new Map<string, ChatImageGenerationSettings>();
  /** AM `_`: analyzer completed in a failed run (retry keeps the count policy). */
  const analyzerCompleted = new Set<string>();
  /** AM `z`: split analysis revision per message. */
  const splitRevisions = new Map<string, string>();
  const publishChains = new Map<string, Promise<unknown>>();
  const publishTimers = new Set<ReturnType<typeof setTimeout>>();
  const previews = new Map<string, DeletionPreviewRecord>();
  const deletionLocks = new Set<string>();
  const cleanups = new Map<string, CleanupRecord>();
  const proposals = new Map<string, ProposalRecord>();
  const lastErrors = new Map<string, RpcError>();
  const replayOutfits = new Map<string, Map<string, unknown>>();
  let disposed = false;
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}:${now().toString(36)}:${(++seq).toString(36)}`;
  const k = (chatId: string, key: string) => `${chatId}\u0000${key}`;

  /* ---------------------------------------------------------------- events / snapshots */

  const emitProgress = (job: JobRecord) => services.events.emit("generation.progress", jsonClone(job.snapshot));
  const emitChanged = (chatId: string, messageKeys: string[]) => services.events.emit("chatData.changed", { chatId, messageKeys: [...new Set(messageKeys)] });
  const log = (level: "info" | "warn" | "error", message: string, details?: unknown) => {
    try {
      services.log.append(level, "pipeline", message, details);
    } catch {
      /* logging never fails a job */
    }
  };

  const retainJobs = () => {
    if (jobs.size <= MAX_RETAINED_JOBS) return;
    for (const [id, job] of jobs) {
      if (jobs.size <= MAX_RETAINED_JOBS) break;
      if (job.snapshot.status !== "queued" && job.snapshot.status !== "running") jobs.delete(id);
    }
  };

  const createJob = (input: { target: MessageTarget; planKey: string; kind: JobRecord["kind"]; attemptKind: AttemptKind; slotId?: string; requestedCount?: number }): JobRecord => {
    const jobId = nextId("job");
    const job: JobRecord = {
      snapshot: {
        jobId,
        chatId: input.target.chatId,
        messageKey: input.planKey,
        attemptKind: input.attemptKind,
        status: "queued",
        phase: "planned",
        progress: phaseProgress("queued", { regenerate: input.kind !== "message" }),
        requestedCount: input.requestedCount ?? 1,
        completedSlots: 0,
        failedSlots: 0,
        canRetry: false,
        canRestart: false,
        ...(input.slotId ? { slotId: input.slotId } : {}),
      },
      target: input.target,
      planKey: input.planKey,
      kind: input.kind,
      controller: new AbortController(),
      ...(input.slotId ? { slotId: input.slotId } : {}),
      done: Promise.resolve(),
    };
    jobs.set(jobId, job);
    retainJobs();
    return job;
  };

  const setPhase = (job: JobRecord, phase: GenerationPhase, detail: Parameters<typeof phaseProgress>[1] = {}) => {
    job.snapshot.status = "running";
    job.snapshot.phase = phase;
    job.snapshot.progress = phaseProgress(phase, { ...detail, regenerate: job.kind !== "message" });
    emitProgress(job);
  };

  const finishJob = (job: JobRecord, result: GenerationResultKind, status: JobStatus, error?: RpcError) => {
    job.snapshot.status = status;
    job.snapshot.progress = phaseProgress(result === "completed" ? "completed" : result === "cancelled" ? "cancelled" : "failed");
    job.snapshot.canRetry = status === "error" || status === "partial";
    job.snapshot.canRestart = job.snapshot.canRetry && job.kind === "message" && settingsSnapshots.get(k(job.target.chatId, job.planKey))?.analysisMode === "split";
    if (error) job.snapshot.error = error;
    else delete job.snapshot.error;
    if (error) lastErrors.set(k(job.target.chatId, job.planKey), error);
    else if (result === "completed") lastErrors.delete(k(job.target.chatId, job.planKey));
    emitProgress(job);
    log(result === "failed" || result === "blocked" ? "warn" : "info", `Illustration ${job.kind} ${result}: ${job.planKey}`, {
      jobId: job.snapshot.jobId,
      chatId: job.target.chatId,
      attemptKind: job.snapshot.attemptKind,
      ...(error ? { error } : {}),
    });
    services.events.emit("generation.finished", { jobId: job.snapshot.jobId, chatId: job.target.chatId, messageKey: job.planKey, result, ...(error ? { error } : {}) });
  };

  /* ---------------------------------------------------------------- host / data access */

  const getChat = async (chatId: string): Promise<ChatInfo> => services.sources.getChat(chatId);

  const findMessage = (messages: ChatMessageView[], messageId: string) => {
    const index = messages.findIndex((m) => m.id === messageId);
    return { index, view: index >= 0 ? messages[index] : undefined };
  };

  /** AM `Ze` 169476: the target message and swipe must still exist. */
  const targetGuard = (target: MessageTarget) => async () => {
    const messages = await loadMessages(services.host, target.chatId);
    const { view } = findMessage(messages, target.messageId);
    if (!view || swipeContent(view, target.swipeIndex) === null) throw Object.assign(new Error(PIPELINE_TEXT.targetChanged.en), { name: "ChatResponseTargetChangedError", retryable: false });
  };

  const nativeVisibility = async (config: InlayConfig, characterId: string) => {
    const document = await services.storage.loadCharacterDocument(characterId);
    return { visibility: resolveEffectiveConfig(config, { characterId, document }).nativeAssetVisibility, document };
  };

  /* ---------------------------------------------------------------- publish (AM `ce` 172533, `ye`/`xe` retries) */

  const publishOnce = async (chatId: string, planKey: string): Promise<PublishResult> => {
    const historyId = planKey.replace(/^illustration:/u, "");
    const parsed = parseHistoryMessageId(historyId);
    if (!parsed) return "missing";
    if (tracker.isStreaming(chatId, parsed.messageId)) return "streaming";
    const messages = await loadMessages(services.host, chatId);
    const { view } = findMessage(messages, parsed.messageId);
    const content = view ? swipeContent(view, parsed.swipeIndex) : null;
    if (!view || view.role !== "assistant" || content === null) return "missing";
    const [doc, config, chat] = await Promise.all([services.storage.loadChatData(chatId), services.storage.loadConfig(), getChat(chatId)]);
    const characterId = await speakingCharacterId(services, chat, view);
    const { visibility, document } = await nativeVisibility(config, characterId);
    const selection = bakeSelection(doc, planKey, { chatId, messageId: parsed.messageId, swipeIndex: parsed.swipeIndex, widthPercent: config.runtime.chatImageWidthPercent });
    const result = bakeMessage({
      content,
      messageKey: planKey,
      blocks: selection.blocks,
      suppressNative: visibility === "hidden" && selection.entryCount > 0,
      nativeAssetDetectors: nativeDetectorsFor(characterId, "", document),
    });
    if (!result.changed) return "published";
    // Identity re-check right before the write (AM Wf 23015): same message, same swipe text, no host generation.
    const fresh = findMessage(await loadMessages(services.host, chatId), parsed.messageId).view;
    if (!fresh || swipeContent(fresh, parsed.swipeIndex) !== content) return tracker.isStreaming(chatId, parsed.messageId) ? "streaming" : "missing";
    if (tracker.isStreaming(chatId, parsed.messageId)) return "streaming";
    await writeSwipeContent(services.host, chatId, fresh, parsed.swipeIndex, result.text);
    return "published";
  };

  /** Serialized per message; "streaming" schedules background retries (120/400/1000/2000 ms, then every 2 s). */
  const publish = (chatId: string, planKey: string, attempt = 0): Promise<PublishResult> => {
    const key = k(chatId, planKey);
    const run = (publishChains.get(key) ?? Promise.resolve()).then(
      () => publishOnce(chatId, planKey),
      () => publishOnce(chatId, planKey),
    );
    publishChains.set(key, run.catch(() => undefined));
    return run.then((result) => {
      if (result === "streaming" && !disposed && attempt < PUBLISH_MAX_ATTEMPTS) {
        const timer = setTimeout(() => {
          publishTimers.delete(timer);
          void publish(chatId, planKey, attempt + 1)
            .then((r) => r === "published" && emitChanged(chatId, [planKey]))
            .catch((e) => log("warn", "Illustration publish retry failed", toRpcError(e)));
        }, PUBLISH_RETRY_DELAYS[attempt] ?? PUBLISH_RETRY_DELAYS.at(-1)!);
        publishTimers.add(timer);
      }
      return result;
    });
  };

  /* ---------------------------------------------------------------- message job (AM `Or` 173414 + `ur` 173361) */

  interface RunOptions {
    automatic: boolean;
    attemptKind?: AttemptKind;
    countPolicy?: CountPolicy;
    /** Restart: the saved settings snapshot (AM `mt`). */
    settings?: ChatImageGenerationSettings;
    revision?: RevisionInput;
  }
  type Outcome =
    | { kind: "completed" }
    | { kind: "failed"; error: RpcError; autoRetryable: boolean; partial: boolean }
    | { kind: "cancelled" }
    | { kind: "blocked"; error: RpcError };

  /** AM `xr` 173248: auto-retryable failure. */
  const autoRetryable = (error: unknown): boolean => {
    if (!error || isCancellation(error)) return false;
    const r = rec(error);
    const inner = error instanceof RpcFailure ? rec(error.error) : rec(r.rpcError);
    const retryable = r.retryable ?? inner.retryable;
    if (retryable === false) return false;
    const status = Number(r.httpStatus ?? r.status ?? rec(inner.details).status);
    const code = str(r.code) || str(inner.detailCode);
    return (
      retryable === true ||
      error instanceof TypeError ||
      status === 408 ||
      status === 429 ||
      (status >= 500 && status < 600) ||
      ["ANALYZER_JSON_PARSE", "ANALYZER_EMPTY_RESPONSE", "ANALYZER_TIMEOUT", "REQUEST_TIMEOUT", "CHAN_SERVER_TIMEOUT", "CHAN_SERVER_NETWORK", "V5_ANALYZER_NO_USABLE_ILLUSTRATION"].includes(code) ||
      (error instanceof RpcFailure && error.error.code === "timeout")
    );
  };

  const errorOf = (e: unknown, label?: Label): RpcError => {
    if (label) return labelError("provider-error", label, { retryable: true });
    const base = toRpcError(e);
    return base.code === "internal" ? { ...base, code: "provider-error", retryable: base.retryable ?? true } : base;
  };

  const savePlan = async (chatId: string, plan: IllustrationPlan) => {
    await services.storage.updateChatData(chatId, (doc) => {
      storePlanAndTree(doc, plan);
      return doc;
    });
  };

  const runMessageOnce = async (job: JobRecord, opts: RunOptions): Promise<Outcome> => {
    const { chatId, messageId, swipeIndex } = job.target;
    const historyId = toHistoryMessageId(messageId, swipeIndex);
    const planKey = job.planKey;
    const skey = k(chatId, planKey);
    const signal = job.controller.signal;
    const config = await services.storage.loadConfig();
    const chat = await getChat(chatId);
    const messages = await loadMessages(services.host, chatId);
    const { index: target, view } = findMessage(messages, messageId);
    const content = view ? swipeContent(view, swipeIndex) : null;
    if (!view || view.role !== "assistant" || content === null) return { kind: "blocked", error: labelError("not-found", PIPELINE_TEXT.messageMissing) };
    if (!content.trim()) return { kind: "blocked", error: labelError("bad-request", PIPELINE_TEXT.emptyContent) };
    if (tracker.isStreaming(chatId, messageId)) return { kind: "blocked", error: labelError("busy", PIPELINE_TEXT.busy, { retryable: true }) };

    const doc0 = await services.storage.loadChatData(chatId);
    let plan = ensurePlan(doc0, historyId, view.index);
    const previous = { status: plan.status, error: plan.error };
    const attemptKind: AttemptKind = opts.automatic ? "automatic" : (opts.attemptKind ?? nextIllustrationAttempt(plan));
    job.snapshot.attemptKind = attemptKind;
    const analyzerDone = attemptKind === "retry" && analyzerCompleted.has(skey);
    if (attemptKind !== "retry" && !opts.revision) {
      settingsSnapshots.delete(skey);
      splitRevisions.delete(skey);
    }
    const settings =
      opts.settings ?? (attemptKind === "retry" && settingsSnapshots.has(skey) ? settingsSnapshots.get(skey)! : await services.storage.loadChatImageGenerationSettings());
    const runSettings: ChatImageGenerationSettings = opts.countPolicy ? { ...settings, countPolicy: opts.countPolicy } : settings;
    const split = runSettings.analysisMode === "split" && !opts.revision;
    const countPolicy = split ? fixedCountPolicy(runSettings.splitAnalysis.totalCount ?? 1) : runSettings.countPolicy;
    if (attemptKind !== "retry") analyzerCompleted.delete(skey);

    const errorRevision =
      attemptKind === "retry"
        ? plan.revisions.find(
            (r) => r.revisionId === plan.activeRevisionId && r.status === "error" && (distinctSlotCount(r.entries) < expectedSlotCount(plan) || !!r.deletedSlotIndices?.length),
          )
        : undefined;
    const revisionTarget = opts.revision
      ? plan.revisions.find((r) => r.revisionId === opts.revision!.revisionId && r.entries.some((e) => e.slotId === opts.revision!.slotId))
      : undefined;
    if (opts.revision && !revisionTarget) return { kind: "blocked", error: labelError("not-found", PIPELINE_TEXT.messageMissing) };
    const existingEntries = errorRevision?.entries ?? [];
    const revisionId =
      (attemptKind === "retry" && !opts.revision ? splitRevisions.get(skey) : "") ||
      errorRevision?.revisionId ||
      revisionTarget?.revisionId ||
      ["revision", now().toString(36), (++seq).toString(36)].join(":");
    const parentRevisionId = parentRevisionFor(plan, plan.activeRevisionId);
    if (!opts.revision && !(attemptKind === "retry" && settingsSnapshots.has(skey))) {
      settingsSnapshots.set(skey, jsonClone(runSettings));
      while (settingsSnapshots.size > MAX_SETTINGS_SNAPSHOTS) {
        const victim = [...settingsSnapshots.keys()].find((key) => key !== skey && !messageJobs.has(key));
        if (!victim) break;
        settingsSnapshots.delete(victim);
        splitRevisions.delete(victim);
      }
    }
    if (split) splitRevisions.set(skey, revisionId);

    try {
      if (split && config.novelai.analysisProfile !== "v5-hybrid") throw new RpcFailure(labelError("bad-request", PIPELINE_TEXT.splitNeedsV5, { retryable: false }));
      const characterId = await speakingCharacterId(services, chat, view);
      const document = await services.storage.loadCharacterDocument(characterId);
      const visibility = resolveEffectiveConfig(config, { characterId, document }).nativeAssetVisibility;
      const built = messageSlots(planKey, content, nativeDetectorsFor(characterId, "", document));
      const slots = built.slots.map((s) => ({ ...s }));
      const revisionSlot = opts.revision ? slots.find((s) => s.slotId === opts.revision!.slotId) : undefined;
      if (opts.revision && !revisionSlot) throw new RpcFailure(labelError("conflict", PIPELINE_TEXT.noSlots));
      const updateCount = opts.automatic || attemptKind === "initial" || attemptKind === "reroll" || (attemptKind === "retry" && !analyzerDone);
      plan = { ...plan, slots, ...(updateCount ? { countPolicy, requestedCount: Math.max(1, countPolicy.max) } : {}), status: "generating", error: "" };
      await savePlan(chatId, plan);
      if (!slots.length) throw new RpcFailure(labelError("bad-request", PIPELINE_TEXT.noSlots, { retryable: false }));
      const requestedCount = opts.revision ? 1 : plan.requestedCount;
      job.snapshot.requestedCount = requestedCount;
      setPhase(job, "analyzing-preset", { imageCount: requestedCount });
      const hasEntries = plan.entries.length > 0 || plan.revisions.some((r) => r.entries.length > 0);
      const activityLabel = opts.automatic ? (hasEntries ? "Regenerate" : "Chat") : attemptKind === "initial" ? "Previous" : "Regenerate";
      const result: GenerateMessageResult = await generateMessageIllustrations(
        { services, engine, ...(options.getModules ? { getModules: options.getModules } : {}), replayOutfits },
        {
          chatId,
          chat,
          messages,
          target,
          swipeIndex,
          historyId,
          planKey,
          clean: built.clean,
          slots: revisionSlot ? [revisionSlot] : slots,
          countPolicy: opts.revision ? fixedCountPolicy(1) : plan.countPolicy,
          attemptKind,
          automatic: opts.automatic,
          revisionId,
          existingEntries,
          deletedSlotIndices: attemptKind === "retry" ? (plan.revisions.find((r) => r.revisionId === revisionId)?.deletedSlotIndices ?? []) : [],
          ...(split
            ? { splitAnalysis: { totalCount: countPolicy.max, batchSize: runSettings.splitAnalysis.batchSize, retries: config.runtime.generationAutoRetryCount, revision: revisionId } }
            : {}),
          ...(opts.revision ? { revision: opts.revision } : {}),
          jobId: job.snapshot.jobId,
          activityLabel,
          config,
          settings: runSettings,
          chatData: doc0,
          signal,
          assertTarget: targetGuard(job.target),
          onPhase: (phase, detail) => setPhase(job, phase as GenerationPhase, { imageIndex: detail.imageIndex, imageCount: detail.imageCount ?? requestedCount, providerStage: detail.providerStage }),
          onResolvedCount: (n) => {
            job.snapshot.requestedCount = n;
          },
        },
      );
      if (result.error && result.analyzerCompleted) analyzerCompleted.add(skey);
      else analyzerCompleted.delete(skey);
      if (result.cancelled || signal.aborted) {
        await savePlan(chatId, { ...plan, status: previous.status, error: previous.error });
        return { kind: "cancelled" };
      }
      if (result.error && !result.entries.length) throw result.failure ?? new RpcFailure(rpcError("provider-error", result.error, { ...(result.errorKo ? { messageKo: result.errorKo } : {}), retryable: true }));
      if (opts.revision && !result.entries.some((e) => e.slotId === opts.revision!.slotId)) throw new RpcFailure(labelError("provider-error", PIPELINE_TEXT.revisionMissing));

      job.snapshot.completedSlots = result.entries.length;
      setPhase(job, "committing", { imageCount: requestedCount, imageIndex: requestedCount });
      const merged = revisionTarget ? mergeEntries(revisionTarget.entries, result.entries) : attemptKind === "retry" ? mergeEntries(existingEntries, result.entries) : result.entries;
      const assetHints = result.assetHints.length ? result.assetHints : plan.assetHints;
      let finalPlan = plan;
      let errorText = "";
      let errorKo: string | undefined;
      const written = await services.storage.updateChatData(chatId, async (doc) => {
        const base = reconcilePlanWithTree(plan, doc.history);
        const resolved = revisionTarget ? Math.min(base.slots.length, distinctSlotCount(merged)) : Math.min(base.slots.length, Math.max(1, result.resolvedCount));
        const missing = Math.max(0, resolved - distinctSlotCount(merged));
        const status = missing > 0 || result.error ? "error" : "complete";
        if (missing > 0 || result.error) {
          if (result.error) {
            errorText = result.error;
            errorKo = result.errorKo;
          } else {
            const l = formatLabel(PIPELINE_TEXT.failedCount, { n: missing });
            errorText = l.en;
            errorKo = l.ko;
          }
        }
        const createdAt = now();
        let next: IllustrationPlan;
        const patchRevision = (id: string, patch: Partial<IllustrationPlanRevision>) => base.revisions.map((r) => (r.revisionId === id ? { ...r, ...patch } : r));
        if (attemptKind === "retry" && errorRevision && base.revisions.some((r) => r.revisionId === errorRevision.revisionId)) {
          next = { ...base, status, requestedCount: resolved, entries: merged, assetHints, revisions: patchRevision(errorRevision.revisionId, { requestedCount: resolved, status, entries: merged, error: errorText }), error: errorText };
        } else if (revisionTarget && base.revisions.some((r) => r.revisionId === revisionTarget.revisionId)) {
          next = { ...base, status, entries: merged, assetHints, revisions: patchRevision(revisionTarget.revisionId, { status, entries: merged, error: errorText }), activeRevisionId: revisionTarget.revisionId, error: errorText };
        } else if (!merged.length) {
          next = { ...base, status, requestedCount: resolved, assetHints, error: errorText };
        } else {
          next = {
            ...base,
            status,
            requestedCount: resolved,
            entries: merged,
            assetHints,
            revisions: [...base.revisions, { revisionId, parentRevisionId, requestedCount: Math.max(1, resolved), status, entries: merged, error: errorText, createdAt }],
            activeRevisionId: revisionId,
            error: errorText,
          };
        }
        next = { ...next, nativeAssetSuppressed: visibility === "hidden" && next.entries.length > 0, updatedAt: createdAt };
        const tree = merged.length ? commitPlanToTree(doc.history, next) : doc.history;
        storePlanAndTree(doc, next, tree);
        finalPlan = next;
        const order = next.revisions.findIndex((r) => r.revisionId === next.activeRevisionId);
        if (status === "complete" && result.commitContinuity && next.activeRevisionId && order >= 0) {
          try {
            await result.commitContinuity(doc, { historyRevisionId: next.activeRevisionId, historyRevisionOrder: order });
          } catch (e) {
            log("warn", "Illustration continuity commit skipped", toRpcError(e));
          }
        }
        return doc;
      });
      if (result.records.length)
        await updateSidecar(services.storage, chatId, (s) => {
          for (const r of result.records) s.records[r.entryId] = r;
        }, written.history).catch((e) => log("warn", "Generation records could not be saved", toRpcError(e)));
      const published = await publish(chatId, planKey);
      if (published === "missing") log("warn", "The illustrated message could not be resolved for publishing.", { chatId, planKey });
      emitChanged(chatId, [planKey]);
      if (finalPlan.status === "complete") return { kind: "completed" };
      job.snapshot.failedSlots = Math.max(0, expectedSlotCount(finalPlan) - distinctSlotCount(finalPlan.entries));
      return {
        kind: "failed",
        error: rpcError("provider-error", errorText || PIPELINE_TEXT.generationIncomplete.en, { ...(errorKo ? { messageKo: errorKo } : {}), retryable: true }),
        autoRetryable: autoRetryable(result.failure),
        partial: finalPlan.entries.length > 0,
      };
    } catch (e) {
      if (signal.aborted || isCancellation(e)) {
        await savePlan(chatId, { ...plan, status: previous.status, error: previous.error }).catch(() => undefined);
        return { kind: "cancelled" };
      }
      const error = errorOf(e);
      await services.storage
        .updateChatData(chatId, (doc) => {
          const current = reconcilePlanWithTree(plan, doc.history);
          storePlanAndTree(doc, { ...current, status: "error", error: error.message });
          return doc;
        })
        .catch((err) => log("error", "Illustration plan persistence failed", toRpcError(err)));
      emitChanged(chatId, [planKey]);
      return { kind: "failed", error, autoRetryable: autoRetryable(e), partial: false };
    }
  };

  const runMessageJob = async (job: JobRecord, opts: RunOptions): Promise<void> => {
    const key = k(job.target.chatId, job.planKey);
    let current = opts;
    try {
      const retries = Math.max(0, Math.min(10, (await services.storage.loadConfig()).runtime.generationAutoRetryCount));
      for (let attempt = 0; ; attempt += 1) {
        if (job.controller.signal.aborted) return finishJob(job, "cancelled", "cancelled");
        const outcome = await runMessageOnce(job, current);
        if (outcome.kind === "completed") return finishJob(job, "completed", "success");
        if (outcome.kind === "cancelled") return finishJob(job, "cancelled", "cancelled");
        if (outcome.kind === "blocked") return finishJob(job, "blocked", "error", outcome.error);
        if (!outcome.autoRetryable || attempt >= retries) return finishJob(job, "failed", outcome.partial ? "partial" : "error", outcome.error);
        job.snapshot.progress = phaseProgress("planned", { retry: { attempt: attempt + 1, total: retries } });
        emitProgress(job);
        await sleep(AUTO_RETRY_DELAY_MS, job.controller.signal);
        // AM ur 173403: further attempts are manual retries of the same message.
        current = { ...current, automatic: false, attemptKind: current.revision ? current.attemptKind : "retry", settings: undefined };
      }
    } catch (e) {
      finishJob(job, isAbortLike(e) ? "cancelled" : "failed", isAbortLike(e) ? "cancelled" : "error", isAbortLike(e) ? undefined : errorOf(e));
      if (!isAbortLike(e)) log("error", "Illustration generation failed", toRpcError(e));
    } finally {
      if (messageJobs.get(key) === job) messageJobs.delete(key);
    }
  };

  const messageBusy = (chatId: string, planKey: string) => {
    if (messageJobs.has(k(chatId, planKey))) return true;
    for (const job of slotJobs.values()) if (job.target.chatId === chatId && job.planKey === planKey) return true;
    return false;
  };

  const startMessageJob = (target: MessageTarget, planKey: string, opts: RunOptions, kind: JobRecord["kind"] = "message"): JobRecord => {
    const job = createJob({ target, planKey, kind, attemptKind: opts.automatic ? "automatic" : (opts.attemptKind ?? "initial"), ...(opts.revision ? { slotId: opts.revision.slotId } : {}) });
    if (opts.revision) job.revision = opts.revision;
    messageJobs.set(k(target.chatId, planKey), job);
    emitProgress(job);
    job.done = runMessageJob(job, opts);
    return job;
  };

  const targetOfKey = (chatId: string, planKey: string): MessageTarget => {
    const parsed = parseHistoryMessageId(planKey.replace(/^illustration:/u, ""));
    if (!parsed || !planKey.startsWith("illustration:")) fail("bad-request", `Not an illustration message key: ${planKey}`);
    return { chatId, messageId: parsed.messageId, swipeIndex: parsed.swipeIndex };
  };

  /* ---------------------------------------------------------------- single-slot regeneration (AM `$bt` 122319) */

  const recordFor = async (chatId: string, entryId: string): Promise<GenerationRecord | null> => (await readSidecar(services.storage, chatId)).records[entryId] ?? null;

  const charactersOf = (record: GenerationRecord) => {
    const configChars = Array.isArray(record.novelAIConfig?.characterPrompts) ? (record.novelAIConfig!.characterPrompts as Rec[]) : [];
    return record.characters.map((c, i) => {
      const cfg = rec(configChars[i]);
      return {
        prompt: c.prompt,
        uc: c.negativePrompt,
        centerX: Number.isFinite(Number(c.centerX)) ? Number(c.centerX) : Number(cfg.centerX ?? 0.5),
        centerY: Number.isFinite(Number(c.centerY)) ? Number(c.centerY) : Number(cfg.centerY ?? 0.5),
        coordinateMode: cfg.coordinateMode === "fixed" ? "fixed" : c.coordinateMode === "fixed" ? "fixed" : "automatic",
        ...(cfg.actorId ? { actorId: cfg.actorId } : {}),
        actorIndex: c.actorIndex ?? i,
      };
    });
  };

  /** Engine ImageRequest for a stored record + zoom overrides (AM `$bt` 122394-122520, prompts already finalized). */
  /** Split prompt tags at top-level commas and compare them without NovelAI weight syntax (`1.2::tag ::`, `{}`/`[]`). */
  const bareTag = (tag: string) => tag.trim().replace(/^-?\d+(?:\.\d+)?::/u, "").replace(/::$/u, "").replace(/^[{[]+|[}\]]+$/gu, "").trim().toLocaleLowerCase();
  const outfitTags = (outfit: Rec | undefined) =>
    ["head", "top", "bottom", "legs", "feet"].flatMap((p) => String(outfit?.[p] ?? "").split(",")).map((t) => t.trim()).filter(Boolean);
  /** Replace the old outfit's part tags in a prompt by the new outfit's tags (in place of the first removed tag). */
  const swapOutfitTags = (prompt: string, oldTags: string[], newTags: string[]) => {
    const old = new Set(oldTags.map(bareTag));
    const parts = prompt.split(",");
    let insertAt = -1;
    const kept: string[] = [];
    for (const part of parts) {
      if (part.trim() && old.has(bareTag(part))) {
        if (insertAt < 0) insertAt = kept.length;
        continue;
      }
      kept.push(part);
    }
    const added = newTags.map((t) => ` ${t}`);
    if (insertAt < 0) kept.push(...added);
    else kept.splice(insertAt, 0, ...added);
    return kept.join(",").replace(/^\s*,\s*/u, "").replace(/\s+,/gu, ",").trim();
  };
  const ARTIST_SEGMENT_LOST = {
    en: "Editing made the artist prompt segment undetectable. Edit the artist part and the rest separately in the original.",
    ko: "편집으로 작가 프롬프트 구간을 확인할 수 없습니다. 원본에서 작가 구간과 나머지 내용을 나누어 편집해 주세요.",
  };
  const replaceSegment = (text: string, oldSegment: string, nextSegment: string): string => {
    const from = oldSegment.trim();
    if (!from) return nextSegment.trim() ? (text.trim() ? `${text.trim()}, ${nextSegment.trim()}` : nextSegment.trim()) : text;
    const index = text.indexOf(from);
    if (index < 0) throw new RpcFailure(labelError("conflict", ARTIST_SEGMENT_LOST));
    const next = `${text.slice(0, index)}${nextSegment.trim()}${text.slice(index + from.length)}`;
    return next.replace(/,\s*,/gu, ",").replace(/^\s*,\s*|\s*,\s*$/gu, "").trim();
  };

  /**
   * Zoom artist / outfit selection (AM zoom `saveEditedPrompt` 160908-160928 + `$bt` 122319): the artist segment of the
   * main/negative prompt is swapped for the selected artist (NovelAI presets also carry steps/scale/cfgRescale
   * overrides, AM `jY`), and each actor's outfit part tags are swapped for the selected outfit's tags.
   */
  const applyArtistAndOutfits = async (chatId: string, record: GenerationRecord, overrides: RegenerationOverrides | undefined) => {
    const out = { positive: record.positivePrompt, negative: record.negativePrompt, characters: charactersOf(record), configPatch: {} as Rec, artistId: record.artistId, actors: record.actors.map((a) => ({ ...a })) };
    if (!overrides) return out;
    const config = await services.storage.loadConfig();
    if (overrides.artistId && overrides.artistId !== record.artistId) {
      if (record.engineProvider === "novelai") {
        const list = listNovelAIArtists(config.characterPrompt.artistPrompts);
        const next = list.find((a) => a.id === overrides.artistId) ?? fail("not-found", `Artist not found: ${overrides.artistId}`);
        const old = list.find((a) => a.id === record.artistId);
        const tracked = rec(rec(record.novelAIConfig).nonArtistPromptWeightArtist);
        out.positive = replaceSegment(out.positive, str(tracked.positive) || str(old?.prompt), str(next.prompt));
        out.negative = replaceSegment(out.negative, str(tracked.negative) || str(old?.negativePrompt), str(next.negativePrompt));
        const o = rec(next.novelAIOverrides);
        for (const key of ["steps", "scale", "cfgRescale"]) if (Number.isFinite(Number(o[key]))) out.configPatch[key] = Number(o[key]);
      } else {
        const entries = config.animaArtists.entries;
        const next = entries.find((a) => a.id === overrides.artistId) ?? fail("not-found", `Artist not found: ${overrides.artistId}`);
        out.positive = replaceSegment(out.positive, str(entries.find((a) => a.id === record.artistId)?.text), str(next.text));
      }
      out.artistId = overrides.artistId;
    }
    const choices: Awaited<ReturnType<typeof formsByActor>> = overrides.outfitByActor && Object.keys(overrides.outfitByActor).length ? await formsByActor(record, chatId, config) : new Map();
    for (const [key, outfitId] of Object.entries(overrides.outfitByActor ?? {})) {
      const actor = out.actors.find((a) => a.identityKey === key);
      if (!actor || !outfitId || actor.selectedOutfitId === outfitId) continue;
      const form = choices.get(actor.actorIndex);
      const next = form?.outfits.find((x) => x.id === outfitId);
      if (!next) fail("not-found", `Outfit not found: ${outfitId}`);
      const oldTags = outfitTags(form?.outfits.find((x) => x.id === actor.selectedOutfitId) as Rec | undefined);
      const newTags = outfitTags(next as unknown as Rec);
      const ch = out.characters.find((c) => c.actorIndex === actor.actorIndex);
      if (record.engineProvider === "novelai" && ch) ch.prompt = swapOutfitTags(ch.prompt, oldTags, newTags);
      else out.positive = swapOutfitTags(out.positive, oldTags, newTags);
      actor.selectedOutfitId = outfitId;
    }
    return out;
  };

  const regenerationRequest = (record: GenerationRecord, overrides: RegenerationOverrides | undefined, keepSeed: boolean, config: InlayConfig, slotId: string, rebuilt?: Awaited<ReturnType<typeof applyArtistAndOutfits>>) => {
    const o = overrides ?? {};
    const sections = new Map((o.sections ?? []).map((s) => [s.id, s] as const));
    const main = sections.get("main") ?? sections.get("provider");
    const size = o.sizeId ? resolveImageSize(o.sizeId, (config.runtime.customImageSizes ?? []) as never) : undefined;
    const width = size?.width ?? record.width;
    const height = size?.height ?? record.height;
    const positive = o.positivePrompt ?? main?.value ?? rebuilt?.positive ?? record.positivePrompt;
    const negative = o.negativePrompt ?? main?.negativeValue ?? rebuilt?.negative ?? record.negativePrompt;
    const excluded = new Set(o.excludedCharacterIndexes ?? []);
    let anyCenter = false;
    const characters = (rebuilt?.characters ?? charactersOf(record))
      .map((c, i) => {
        const s = sections.get(`actor:${i}`);
        const center = o.centers?.[i];
        if (center) anyCenter = true;
        return {
          ...c,
          prompt: s?.value ?? c.prompt,
          uc: s?.negativeValue ?? c.uc,
          ...(center ? { centerX: center.x, centerY: center.y, coordinateMode: "fixed" } : o.centers && o.centers[i] === null ? { coordinateMode: "automatic" } : {}),
        };
      })
      .filter((_c, i) => !excluded.has(i));
    const seed = keepSeed ? str(o.seed) || record.seed : "";
    const provider = record.engineProvider === "comfy-ui" ? "comfy-ui" : record.engineProvider === "chan-server" ? "chan-server" : "novelai";
    if (provider !== "novelai") return { provider, prompt: positive, negativePrompt: negative, seed, width, height } as Rec & { provider: "comfy-ui" | "chan-server" };
    const cfg = { ...rec(record.novelAIConfig) };
    // Prompts in the record are already finalized (non-artist weight applied once by the adapter).
    delete cfg.nonArtistPromptWeight;
    delete cfg.nonArtistPromptSource;
    delete cfg.nonArtistPromptWeightArtist;
    return {
      provider,
      prompt: positive,
      negativePrompt: negative,
      seed,
      width,
      height,
      forceNsfwPrefix: false,
      config: {
        ...cfg,
        ...(rebuilt?.configPatch ?? {}),
        width,
        height,
        characterPrompts: characters,
        ...(anyCenter ? { useCoords: true, forceCharacterCoordinates: true } : {}),
      },
      references: [],
      queueMeta: { kind: "generation", source: "regenerate", sourceImageToken: `slot:${slotId}` },
    } as Rec & { provider: "novelai" };
  };

  const runRegenerate = async (job: JobRecord): Promise<void> => {
    const { chatId } = job.target;
    const slotId = job.slotId!;
    const signal = job.controller.signal;
    try {
      setPhase(job, "generating", { imageIndex: 0, imageCount: 1 });
      const [doc, config, sidecar] = await Promise.all([services.storage.loadChatData(chatId), services.storage.loadConfig(), readSidecar(services.storage, chatId)]);
      const resolved = resolveHistorySlot(doc.history, { slotId, messageKey: job.planKey });
      if (!resolved) throw new RpcFailure(labelError("not-found", PIPELINE_TEXT.messageMissing));
      const source = resolved.entries.find((e) => e.entryId === job.regenerate?.entryId) ?? resolved.defaultEntry;
      const record = sidecar.records[source.entryId] ?? [...resolved.entries].reverse().map((e) => sidecar.records[e.entryId]).find(Boolean) ?? null;
      if (!record)
        throw new RpcFailure(rpcError("unsupported", "Could not load the regeneration settings of the selected image.", { messageKo: "선택한 이미지의 재생성 설정을 불러오지 못했습니다.", retryable: false }));
      const target = await services.images.resolveTarget();
      if (engineProviderFor(target) !== record.engineProvider)
        throw new RpcFailure(rpcError("unsupported", "The image provider changed since this image was generated. Regenerate the whole message instead.", { retryable: false }));
      const overrides = job.regenerate?.overrides ?? sidecar.drafts[slotId]?.overrides;
      const keepSeed = !!job.regenerate?.overrides && !!overrides?.seedFixed;
      const rebuilt = await applyArtistAndOutfits(chatId, record, overrides);
      const request = regenerationRequest(record, overrides, keepSeed, config, slotId, rebuilt);
      const chat = await getChat(chatId);
      const messages = await loadMessages(services.host, chatId);
      const characterId = await speakingCharacterId(services, chat, findMessage(messages, job.target.messageId).view);
      const document = await services.storage.loadCharacterDocument(characterId);
      const nsfw = resolveEffectiveConfig(config, { characterId, document }).nsfwAlwaysEnabled;
      const result = await engine.dispatch(request, {
        engineProvider: record.engineProvider as "novelai",
        purpose: "regenerate",
        connectionId: target.connectionId,
        model: target.model,
        ownerChatId: chatId,
        ownerCharacterId: characterId,
        comfyuiWorkflowId: target.comfyuiWorkflowId,
        forceNsfwPrefix: () => nsfw,
        onProgress: (p) => {
          job.snapshot.progress = { ...phaseProgress("generating", { regenerate: true, imageIndex: 0, imageCount: 1 }), ...(p.queue ? { queue: p.queue } : {}) };
          emitProgress(job);
        },
      }, config, { signal });
      if (signal.aborted) throw new DOMException("Regeneration was cancelled.", "AbortError");
      await targetGuard(job.target)();
      const meta = rec(result.providerMetadata);
      const imageId = str(meta.imageId) || str(result.requestId);
      if (!imageId) throw new Error("The image provider returned no image id.");
      const label = record.actors.find((a) => a.kind !== "persona")?.identityName || record.actors[0]?.identityName || "Character";
      const assetName = createGeneratedAssetName({ label, kind: "chat", ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(imageId) ? { id: imageId } : {}) });
      const width = Math.max(0, Math.round(Number(result.width) || 0));
      const height = Math.max(0, Math.round(Number(result.height) || 0));
      const entry: HistoryEntry = {
        entryId: `generated:${assetName}`,
        slotId,
        kind: "generated",
        assetName,
        savedPath: imageResultUrl(imageId),
        extension: str(result.extension) || "png",
        createdAt: now(),
        width,
        height,
        generationOrigin: "regenerate",
        parentEntryId: source.entryId,
      };
      setPhase(job, "committing");
      const written = await services.storage.updateChatData(chatId, (d) => {
        const tree = appendGeneratedEntry(d.history, { slotId, messageKey: job.planKey, revisionId: resolved.revision.revisionId, entry, selectAsDefault: true });
        const plan = findPlan(d, job.planKey);
        storePlanAndTree(d, plan, tree);
        return d;
      });
      const finalized = rec(result.finalizedPrompt);
      await updateSidecar(services.storage, chatId, (s) => {
        s.records[entry.entryId] = {
          ...record,
          entryId: entry.entryId,
          imageId,
          assetName,
          createdAt: entry.createdAt,
          seed: str(result.seed),
          seedFixed: keepSeed,
          width,
          height,
          sizeId: overrides?.sizeId ?? record.sizeId,
          positivePrompt: str(result.effectivePrompt) || str(finalized.positivePrompt) || String(request.prompt ?? ""),
          negativePrompt: String(request.negativePrompt ?? ""),
          sentParameters: rec(meta.sentParameters),
          generationOrigin: "regenerate",
          parentEntryId: source.entryId,
          actors: rebuilt.actors,
          ...(rebuilt.artistId ? { artistId: rebuilt.artistId } : {}),
          characters: (request.config && Array.isArray((request.config as Rec).characterPrompts) ? ((request.config as Rec).characterPrompts as Rec[]) : []).map((ch, i) => ({
            prompt: str(ch.prompt),
            negativePrompt: str(ch.uc),
            actorIndex: Number.isFinite(Number(ch.actorIndex)) ? Number(ch.actorIndex) : i,
            centerX: Number(ch.centerX ?? 0.5),
            centerY: Number(ch.centerY ?? 0.5),
            ...(ch.coordinateMode ? { coordinateMode: String(ch.coordinateMode) } : {}),
          })),
        };
      }, written.history);
      job.snapshot.completedSlots = 1;
      await publish(chatId, job.planKey);
      emitChanged(chatId, [job.planKey]);
      finishJob(job, "completed", "success");
    } catch (e) {
      if (signal.aborted || isCancellation(e)) finishJob(job, "cancelled", "cancelled");
      else {
        const error = errorOf(e);
        finishJob(job, "failed", "error", { ...error, ...(error.messageKo ? {} : {}) });
        log("warn", "Image regeneration failed", error);
      }
    } finally {
      const key = k(chatId, slotId);
      if (slotJobs.get(key) === job) slotJobs.delete(key);
      emitChanged(chatId, [job.planKey]);
    }
  };

  /* ---------------------------------------------------------------- cleanup (generated images of removed entries) */

  const cleanupImages = async (chatId: string, removed: Array<{ assetName: string; imageId: string }>, tree: HistoryTree): Promise<{ cleanup: AssetCleanupResult[]; failed: Array<{ assetName: string; imageId: string }> }> => {
    const referenced = new Set(Object.values(tree.entriesById).map((e) => imageIdFromResultUrl(e.savedPath) ?? ""));
    const cleanup: AssetCleanupResult[] = [];
    const toDelete = removed.filter((r) => {
      if (!r.imageId) {
        cleanup.push({ assetName: r.assetName, status: "unknown" });
        return false;
      }
      if (referenced.has(r.imageId)) {
        cleanup.push({ assetName: r.assetName, status: "shared" });
        return false;
      }
      return true;
    });
    const failed: Array<{ assetName: string; imageId: string }> = [];
    if (toDelete.length) {
      let statuses: Array<{ imageId: string; status: "removed" | "unknown" | "failed" }>;
      try {
        statuses = await services.images.deleteImages(toDelete.map((r) => r.imageId));
      } catch {
        statuses = toDelete.map((r) => ({ imageId: r.imageId, status: "failed" as const }));
      }
      for (const r of toDelete) {
        const status = statuses.find((s) => s.imageId === r.imageId)?.status ?? "failed";
        cleanup.push({ assetName: r.assetName, status });
        if (status === "failed") failed.push(r);
      }
    }
    return { cleanup, failed };
  };

  const removedFrom = (before: HistoryTree, after: HistoryTree, entryIds: string[]) =>
    entryIds.flatMap((id) => {
      const e = before.entriesById[id];
      return e && e.kind === "generated" && !after.entriesById[id] ? [{ assetName: e.assetName, imageId: imageIdFromResultUrl(e.savedPath) ?? "" }] : [];
    });

  /* ---------------------------------------------------------------- zoom */

  const providerOf = (record: GenerationRecord | null): ZoomDetails["generationProvider"] =>
    !record ? "novelai" : record.engineProvider === "comfy-ui" ? "comfy-ui" : record.engineProvider === "chan-server" ? "generic" : "novelai";

  interface SectionChoices {
    artists?: { id: string; label: string }[];
    outfitsByActor?: Map<number, { key: string; choices: { id: string; label: string }[] }>;
  }

  /** Form (with outfits) of each record actor: persona forms from the global persona settings, else the owner's document. */
  const formsByActor = async (record: GenerationRecord, chatId: string, config: InlayConfig) => {
    const out = new Map<number, { id: string; outfits: Array<{ id: string; label: string } & Rec> }>();
    const chat = await getChat(chatId).catch(() => null);
    for (const actor of record.actors) {
      if (!actor.identityKey) continue;
      try {
        let forms;
        if (actor.identityKey.startsWith("persona::"))
          forms = resolvePersonaForms(config.characterPrompt.personaSettings, config.characterPrompt.personaGender, actor.identityKey.slice(9));
        else {
          const owner = actor.identityKey.includes("::") ? actor.identityKey.split("::")[0]! : (chat?.characterId ?? "");
          const document = owner ? await services.storage.loadCharacterDocument(owner) : null;
          forms = resolveFormCollection(document?.characterPrompt.characterForms ?? {}, actor.identityKey, {} as never);
        }
        const form = forms.forms.find((f) => f.id === actor.selectedFormId) ?? forms.forms.find((f) => f.id === forms.defaultFormId) ?? forms.forms[0];
        if (form) out.set(actor.actorIndex, form as never);
      } catch {
        /* no forms for this actor */
      }
    }
    return out;
  };

  /** Artist list per codec (NovelAI presets + user artists / Anima list) and each actor's form outfits (zoom selects). */
  const choicesFor = async (record: GenerationRecord | null, chatId: string): Promise<SectionChoices> => {
    if (!record) return {};
    const config = await services.storage.loadConfig();
    const artists =
      record.engineProvider === "novelai"
        ? listNovelAIArtists(config.characterPrompt.artistPrompts).map((a) => ({ id: a.id, label: a.displayTitle || a.id }))
        : config.animaArtists.entries.map((a) => ({ id: a.id, label: a.title || a.id }));
    const outfitsByActor = new Map<number, { key: string; choices: { id: string; label: string }[] }>();
    const forms = await formsByActor(record, chatId, config);
    for (const actor of record.actors) {
      const form = forms.get(actor.actorIndex);
      if (form) outfitsByActor.set(actor.actorIndex, { key: actor.identityKey, choices: form.outfits.map((o) => ({ id: o.id, label: o.label || o.id })) });
    }
    return { artists, outfitsByActor };
  };

  const sectionsOf = (record: GenerationRecord | null, draft: RegenerationOverrides | undefined, choices: SectionChoices = {}): ZoomPromptSection[] => {
    if (!record) return [];
    const artist = choices.artists ? { artistChoices: choices.artists, selectedArtistId: draft?.artistId ?? record.artistId ?? "" } : {};
    const outfitOf = (i: number) => {
      const o = choices.outfitsByActor?.get(i);
      if (!o) return {};
      const actor = record.actors.find((a) => a.actorIndex === i);
      return { outfitChoices: o.choices, selectedOutfitId: draft?.outfitByActor?.[o.key] ?? actor?.selectedOutfitId ?? "" };
    };
    const overrides = new Map((draft?.sections ?? []).map((s) => [s.id, s] as const));
    const pick = (id: string, value: string, negativeValue: string) => {
      const o = overrides.get(id);
      return { value: o?.value ?? value, negativeValue: o?.negativeValue ?? negativeValue };
    };
    if (record.engineProvider !== "novelai") return [{ id: "provider", target: "provider", label: "Prompt", ...pick("provider", draft?.positivePrompt ?? record.positivePrompt, draft?.negativePrompt ?? record.negativePrompt), ...artist }];
    const chars = charactersOf(record);
    return [
      { id: "main", target: "main", label: "Main prompt", ...pick("main", draft?.positivePrompt ?? record.positivePrompt, draft?.negativePrompt ?? record.negativePrompt), ...artist },
      ...chars.map((c, i): ZoomPromptSection => {
        const center = draft?.centers?.[i];
        return {
          id: `actor:${i}`,
          target: "actor",
          actorIndex: i,
          label: record.actors.find((a) => a.actorIndex === i)?.identityName || `Character ${i + 1}`,
          ...pick(`actor:${i}`, c.prompt, c.uc),
          centerX: center ? center.x : c.centerX,
          centerY: center ? center.y : c.centerY,
          ...outfitOf(i),
        };
      }),
    ];
  };

  const zoomDetails = async (chatId: string, slotId: string, entryId?: string): Promise<ZoomDetails> => {
    const [doc, sidecar] = await Promise.all([services.storage.loadChatData(chatId), readSidecar(services.storage, chatId)]);
    const resolved = resolveHistorySlot(doc.history, { slotId });
    if (!resolved) fail("not-found", `Image History slot not found: ${slotId}`);
    const entry = entryId ? resolved.entries.find((e) => e.entryId === entryId) : resolved.defaultEntry;
    if (!entry) fail("not-found", `Image History entry not found: ${entryId}`);
    const record = sidecar.records[entry.entryId] ?? null;
    const draft = sidecar.drafts[slotId]?.overrides;
    const provider = record ? providerOf(record) : entry.kind === "original" ? "original" : "novelai";
    const imageId = imageIdFromResultUrl(entry.savedPath) ?? "";
    const isNovelAI = record?.engineProvider === "novelai";
    const v5 = isNovelAI && (rec(record?.novelAIConfig).analysisProfile === "v5-hybrid" || /^nai-diffusion-5/u.test(record?.model ?? ""));
    const busy = messageBusy(chatId, resolved.message.messageKey);
    return {
      chatId,
      messageKey: resolved.message.messageKey,
      revisionId: resolved.revision.revisionId,
      slotId,
      entryId: entry.entryId,
      kind: entry.kind,
      ...(entry.generationOrigin ? { origin: entry.generationOrigin } : {}),
      assetName: entry.assetName,
      url: entry.savedPath || (imageId ? imageResultUrl(imageId) : ""),
      width: entry.width,
      height: entry.height,
      sizeId: draft?.sizeId ?? record?.sizeId ?? 0,
      seed: draft?.seed ?? record?.seed ?? "",
      seedFixed: draft?.seedFixed ?? false,
      generationProvider: provider,
      promptCodec: provider === "original" ? null : promptCodecForProvider(provider),
      positivePrompt: draft?.positivePrompt ?? record?.positivePrompt ?? "",
      negativePrompt: draft?.negativePrompt ?? record?.negativePrompt ?? "",
      sections: sectionsOf(record, draft, await choicesFor(record, chatId)),
      coordinateGrid: isNovelAI ? (v5 ? "v5" : "v4-5") : null,
      excludedCharacterIndexes: [...(draft?.excludedCharacterIndexes ?? [])],
      promptDraftActive: !!draft && (draft.positivePrompt !== undefined || draft.negativePrompt !== undefined || !!draft.sections?.length),
      coordinateDraftActive: !!draft && (!!draft.centers?.length || !!draft.excludedCharacterIndexes?.length),
      analyzerText: record?.analyzerText ?? "",
      canEdit: !!record && !busy,
      canDelete: entry.kind === "generated" && !busy,
      canRegenerate: !!record && entry.kind === "generated" && !busy,
      canDeleteSlot: resolved.message.mode === "illustration" && resolved.revision.revisionId === resolved.message.activeRevisionId && !busy,
      history: [...resolved.entries].map((e) => {
        const id = imageIdFromResultUrl(e.savedPath) ?? "";
        return { entryId: e.entryId, kind: e.kind, assetName: e.assetName, url: e.savedPath || (id ? imageResultUrl(id) : ""), createdAt: e.createdAt, selected: e.entryId === resolved.defaultEntry.entryId };
      }),
    };
  };

  const updateDraft = async (chatId: string, slotId: string, change: (current: RegenerationOverrides | undefined) => RegenerationOverrides | undefined) => {
    const doc = await services.storage.loadChatData(chatId);
    if (!doc.history.slotsById[slotId]) fail("not-found", `Image History slot not found: ${slotId}`);
    await updateSidecar(services.storage, chatId, (s) => {
      const next = change(s.drafts[slotId]?.overrides);
      if (next && Object.keys(next).length) s.drafts[slotId] = { overrides: next, updatedAt: now() };
      else delete s.drafts[slotId];
    });
  };

  const channelsOf = (record: GenerationRecord) => [
    { id: "main", kind: "main", label: "Main prompt", positive: record.positivePrompt, negative: record.negativePrompt },
    ...charactersOf(record).map((c, i) => ({ id: `actor:${i}`, kind: "actor", label: record.actors.find((a) => a.actorIndex === i)?.identityName || `Character ${i + 1}`, actorIndex: i, positive: c.prompt, negative: c.uc })),
  ];

  /* ---------------------------------------------------------------- host events */

  const dropMessageData = async (chatId: string, messageId: string, swipe?: number) => {
    const matches = (historyId: string) => {
      const p = parseHistoryMessageId(historyId);
      return !!p && p.messageId === messageId && (swipe === undefined || p.swipeIndex === swipe);
    };
    for (const job of [...messageJobs.values(), ...slotJobs.values()])
      if (job.target.chatId === chatId && job.target.messageId === messageId && (swipe === undefined || job.target.swipeIndex >= swipe)) job.controller.abort("message-removed");
    await services.storage.updateChatData(chatId, (doc) => {
      const keys = Object.values(doc.history.messagesByKey).filter((m) => matches(m.messageId)).map((m) => m.messageKey);
      let tree = doc.history;
      if (keys.length) tree = mutateHistoryTree(tree, keys.map((messageKey) => ({ type: "delete-message" as const, messageKey })));
      for (const key of Object.keys(doc.plans)) if (matches(doc.plans[key]!.messageId)) delete doc.plans[key];
      for (const key of Object.keys(doc.store.messages)) if (matches(key)) delete doc.store.messages[key];
      storePlanAndTree(doc, null, tree);
      if (swipe === undefined) return doc;
      // Later swipes shift down by one (`<id>@<n>` -> `<id>@<n-1>` in every key / id / checkpoint).
      const pattern = new RegExp(`${messageId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}@(\\d+)(?![0-9])`, "gu");
      const json = JSON.stringify(doc).replace(pattern, (m, n: string) => (Number(n) > swipe ? `${messageId}@${Number(n) - 1}` : m));
      return JSON.parse(json) as ChatDataDocument;
    });
    if (swipe !== undefined) {
      const pattern = new RegExp(`${messageId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}@(\\d+)(?![0-9])`, "gu");
      await services.storage
        .updateJson(sidecarPath(chatId), null as unknown, (current) =>
          current ? JSON.parse(JSON.stringify(current).replace(pattern, (m, n: string) => (Number(n) > swipe ? `${messageId}@${Number(n) - 1}` : m))) : current,
        )
        .catch(() => undefined);
    }
    emitChanged(chatId, []);
  };

  const handleGenerationEnded = async (raw: unknown): Promise<void> => {
    const payload = rec(raw);
    tracker.ended(payload);
    if (disposed || payload.error) return;
    const chatId = str(payload.chatId);
    const messageId = str(payload.messageId);
    if (!chatId || !messageId) return;
    if (!AUTO_GENERATION_TYPES.has(str(payload.generationType).toLowerCase())) return;
    try {
      const [settings, config] = await Promise.all([services.storage.loadChatImageGenerationSettings(), services.storage.loadConfig()]);
      if (!settings.autoGenerationEnabled || (config as { enabled?: boolean }).enabled === false) return;
      const messages = await loadMessages(services.host, chatId);
      const { view } = findMessage(messages, messageId);
      if (!view || !isIllustratableMessage(view)) return;
      const target = { chatId, messageId, swipeIndex: view.swipeId };
      const planKey = illustrationMessageKey(toHistoryMessageId(messageId, view.swipeId));
      if (messageBusy(chatId, planKey)) return;
      startMessageJob(target, planKey, { automatic: true });
    } catch (e) {
      log("error", "Automatic illustration generation failed", toRpcError(e));
    }
  };

  const handleHostEvent = async (event: string, raw: unknown): Promise<void> => {
    const payload = rec(raw);
    const chatId = str(payload.chatId) || str(rec(payload.message).chat_id);
    switch (event) {
      case "GENERATION_STARTED":
        tracker.started(payload);
        return;
      case "GENERATION_STOPPED":
        tracker.ended(payload);
        return;
      case "GENERATION_ENDED":
        return handleGenerationEnded(raw);
      case "MESSAGE_DELETED": {
        const ids = [str(payload.messageId), str(rec(payload.message).id), ...(Array.isArray(payload.messageIds) ? payload.messageIds.map(str) : [])].filter(Boolean);
        for (const id of ids) if (chatId) await dropMessageData(chatId, id).catch((e) => log("warn", "Message data cleanup failed", toRpcError(e)));
        return;
      }
      case "MESSAGE_SWIPED": {
        const message = rec(payload.message);
        if (payload.action === "deleted" && chatId && str(message.id) && Number.isSafeInteger(payload.swipeId))
          await dropMessageData(chatId, str(message.id), Number(payload.swipeId)).catch((e) => log("warn", "Swipe data cleanup failed", toRpcError(e)));
        else if (chatId) emitChanged(chatId, []);
        return;
      }
      case "CHARACTER_EDITED": {
        const id = str(payload.characterId) || str(payload.id) || str(rec(payload.character).id);
        services.sources.invalidate(id || undefined);
        return;
      }
      default:
        return;
    }
  };

  /* ---------------------------------------------------------------- public API */

  const api: ChatPipeline = {
    handleGenerationEnded,
    handleHostEvent,
    stripForInterceptor: (messages) => stripForInterceptor(messages),
    publish: (chatId, messageKey) => publish(chatId, messageKey),

    async recover() {
      let files: string[] = [];
      try {
        files = await services.storage.list("chats/");
      } catch {
        return;
      }
      const chatIds = [...new Set(files.flatMap((f) => {
        const m = /(?:^|\/)([^/]+)\/chat-data\.json$/u.exec(f.replace(/\\/gu, "/"));
        if (!m) return [];
        try {
          return [decodeURIComponent(m[1]!)];
        } catch {
          return [m[1]!];
        }
      }))];
      for (const chatId of chatIds) {
        try {
          const doc = await services.storage.loadChatData(chatId);
          const stale = Object.values(doc.plans).filter((p) => p.status === "generating" && !messageJobs.has(k(chatId, p.key)));
          if (!stale.length) continue;
          await services.storage.updateChatData(chatId, (d) => {
            for (const p of Object.values(d.plans))
              if (p.status === "generating" && !messageJobs.has(k(chatId, p.key))) d.plans[p.key] = { ...p, status: "error", error: PIPELINE_TEXT.interrupted.en };
            return d;
          });
          emitChanged(chatId, stale.map((p) => p.key));
        } catch (e) {
          log("warn", "Interrupted job recovery failed", { chatId, error: toRpcError(e) });
        }
      }
    },

    dispose() {
      disposed = true;
      for (const job of jobs.values()) if (!job.controller.signal.aborted) job.controller.abort("pipeline-disposed");
      for (const t of publishTimers) clearTimeout(t);
      publishTimers.clear();
      tracker.clear();
      engine.dispose();
    },

    async start(params) {
      if (disposed) fail("unsupported", "The pipeline was disposed.");
      const chatId = str(params.chatId);
      const messageId = str(params.messageId);
      const swipeIndex = Number(params.swipeIndex);
      if (!chatId || !messageId || !Number.isSafeInteger(swipeIndex) || swipeIndex < 0) fail("bad-request", "chatId, messageId and swipeIndex are required.");
      const planKey = illustrationMessageKey(toHistoryMessageId(messageId, swipeIndex));
      if (messageBusy(chatId, planKey)) throw new RpcFailure(labelError("busy", PIPELINE_TEXT.busy));
      const messages = await loadMessages(services.host, chatId);
      if (!isIllustratableMessage(findMessage(messages, messageId).view, swipeIndex)) throw new RpcFailure(labelError("not-found", PIPELINE_TEXT.messageMissing));
      const job = startMessageJob({ chatId, messageId, swipeIndex }, planKey, {
        automatic: false,
        ...(params.attemptKind ? { attemptKind: params.attemptKind } : {}),
        ...(params.countPolicy ? { countPolicy: params.countPolicy } : {}),
      });
      return { jobId: job.snapshot.jobId, messageKey: planKey };
    },

    cancel(params) {
      const list = [...jobs.values()].filter(
        (j) =>
          (j.snapshot.status === "queued" || j.snapshot.status === "running") &&
          (params.jobId ? j.snapshot.jobId === params.jobId : (!params.chatId || j.target.chatId === params.chatId) && (!params.messageKey || j.planKey === params.messageKey)),
      );
      if (!params.jobId && !params.chatId && !params.messageKey) fail("bad-request", "jobId, chatId or messageKey is required.");
      for (const job of list) job.controller.abort("user-cancelled");
    },

    async retry(jobId) {
      const job = jobs.get(jobId) ?? fail("not-found", `Job not found: ${jobId}`);
      if (job.snapshot.status === "queued" || job.snapshot.status === "running") throw new RpcFailure(labelError("busy", PIPELINE_TEXT.busy));
      job.dismissed = true;
      if (job.kind === "regenerate") return api.regenerateSlot({ chatId: job.target.chatId, messageKey: job.planKey, slotId: job.slotId!, ...(job.regenerate?.entryId ? { entryId: job.regenerate.entryId } : {}), ...(job.regenerate?.overrides ? { overrides: job.regenerate.overrides } : {}) });
      if (messageBusy(job.target.chatId, job.planKey)) throw new RpcFailure(labelError("busy", PIPELINE_TEXT.busy));
      const next = job.kind === "revision" && job.revision
        ? startMessageJob(job.target, job.planKey, { automatic: false, attemptKind: "regenerate", revision: job.revision }, "revision")
        : startMessageJob(job.target, job.planKey, { automatic: false, attemptKind: "retry" });
      return { jobId: next.snapshot.jobId };
    },

    async restart(jobId) {
      const job = jobs.get(jobId) ?? fail("not-found", `Job not found: ${jobId}`);
      if (messageBusy(job.target.chatId, job.planKey)) throw new RpcFailure(labelError("busy", PIPELINE_TEXT.busy));
      const snapshot = settingsSnapshots.get(k(job.target.chatId, job.planKey));
      if (!snapshot) throw new RpcFailure(labelError("conflict", PIPELINE_TEXT.noRestartSnapshot));
      job.dismissed = true;
      const next = startMessageJob(job.target, job.planKey, { automatic: false, attemptKind: "reroll", settings: snapshot });
      return { jobId: next.snapshot.jobId };
    },

    dismiss(jobId) {
      const job = jobs.get(jobId);
      if (!job) return;
      if (job.snapshot.status === "queued" || job.snapshot.status === "running") job.dismissed = true;
      else jobs.delete(jobId);
    },

    listActive(chatId) {
      return [...jobs.values()]
        .filter((j) => !j.dismissed && (!chatId || j.target.chatId === chatId) && (j.snapshot.status === "queued" || j.snapshot.status === "running" || j.snapshot.canRetry))
        .map((j) => jsonClone(j.snapshot));
    },

    async regenerateSlot(params) {
      const chatId = str(params.chatId);
      const doc = await services.storage.loadChatData(chatId);
      const resolved = resolveHistorySlot(doc.history, { slotId: params.slotId, messageKey: params.messageKey });
      if (!resolved) fail("not-found", `Image History slot not found: ${params.slotId}`);
      if (params.entryId && !resolved.entries.some((e) => e.entryId === params.entryId)) fail("not-found", `Image History entry not found: ${params.entryId}`);
      const target = resolved.message.mode === "illustration" ? targetOfKey(chatId, resolved.message.messageKey) : (() => {
        const p = parseHistoryMessageId(resolved.message.messageId) ?? fail("bad-request", "Invalid message id.");
        return { chatId, messageId: p.messageId, swipeIndex: p.swipeIndex };
      })();
      const slotKey = k(chatId, params.slotId);
      if (slotJobs.has(slotKey)) throw new RpcFailure(labelError("busy", PIPELINE_TEXT.regenerationRunning));
      if (messageJobs.has(k(chatId, resolved.message.messageKey))) throw new RpcFailure(labelError("busy", PIPELINE_TEXT.busy));
      const job = createJob({ target, planKey: resolved.message.messageKey, kind: "regenerate", attemptKind: "regenerate", slotId: params.slotId, requestedCount: 1 });
      job.regenerate = { ...(params.entryId ? { entryId: params.entryId } : {}), ...(params.overrides ? { overrides: params.overrides } : {}) };
      slotJobs.set(slotKey, job);
      emitProgress(job);
      job.done = runRegenerate(job);
      return { jobId: job.snapshot.jobId };
    },

    async getHistory(chatId, messageKeys) {
      const doc = await services.storage.loadChatData(chatId);
      const plans: Record<string, IllustrationPlan> = {};
      const keys = new Set([...Object.keys(doc.plans), ...Object.values(doc.history.messagesByKey).filter((m) => m.mode === "illustration").map((m) => m.messageKey)]);
      for (const key of keys) {
        if (messageKeys?.length && !messageKeys.includes(key)) continue;
        const plan = findPlan(doc, key);
        if (plan) plans[key] = plan;
      }
      if (!messageKeys?.length) return { tree: doc.history, plans };
      const wanted = new Set(messageKeys);
      const slotsById = Object.fromEntries(Object.entries(doc.history.slotsById).filter(([, s]) => wanted.has(s.messageKey)));
      return {
        tree: {
          chatKey: doc.history.chatKey,
          messagesByKey: Object.fromEntries(Object.entries(doc.history.messagesByKey).filter(([key]) => wanted.has(key))),
          slotsById,
          entriesById: Object.fromEntries(Object.entries(doc.history.entriesById).filter(([, e]) => !!slotsById[e.slotId])),
        },
        plans,
      };
    },

    async selectEntry(chatId, slotId, entryId) {
      let messageKey = "";
      await services.storage.updateChatData(chatId, (doc) => {
        const resolved = resolveHistorySlot(doc.history, { slotId });
        if (!resolved) fail("not-found", `Image History slot not found: ${slotId}`);
        if (!resolved.entries.some((e) => e.entryId === entryId)) fail("not-found", `Image History entry not found: ${entryId}`);
        messageKey = resolved.message.messageKey;
        if (resolved.defaultEntry.entryId === entryId) return doc;
        const tree = mutateHistoryTree(doc.history, [{ type: "set-default-entry", messageKey, revisionId: resolved.revision.revisionId, slotId, entryId }]);
        storePlanAndTree(doc, findPlan({ ...doc, history: tree }, messageKey), tree);
        return doc;
      });
      if (messageKey.startsWith("illustration:")) await publish(chatId, messageKey);
      emitChanged(chatId, [messageKey]);
    },

    async selectRevision(chatId, messageKey, revisionId) {
      await services.storage.updateChatData(chatId, (doc) => {
        const message = doc.history.messagesByKey[messageKey];
        if (!message || !message.revisions.some((r) => r.revisionId === revisionId)) fail("not-found", `Image History revision not found: ${revisionId}`);
        if (message.activeRevisionId === revisionId) return doc;
        const tree = mutateHistoryTree(doc.history, [{ type: "set-active-revision", messageKey, revisionId }]);
        storePlanAndTree(doc, findPlan({ ...doc, history: tree }, messageKey), tree);
        return doc;
      });
      if (messageKey.startsWith("illustration:")) await publish(chatId, messageKey);
      emitChanged(chatId, [messageKey]);
    },

    async deleteEntry(chatId, entryId) {
      let before: HistoryTree | null = null;
      let messageKey = "";
      let fallbackEntryId: string | null = null;
      const written = await services.storage.updateChatData(chatId, (doc) => {
        const entry = doc.history.entriesById[entryId];
        if (!entry) fail("not-found", `Image History entry not found: ${entryId}`);
        if (entry.kind !== "generated") fail("bad-request", "Image History original entries cannot be deleted.");
        const slot = doc.history.slotsById[entry.slotId];
        messageKey = slot?.messageKey ?? "";
        if (slotJobs.has(k(chatId, entry.slotId)) || messageJobs.has(k(chatId, messageKey))) throw new RpcFailure(labelError("busy", PIPELINE_TEXT.deleteBusy));
        before = doc.history;
        const tree = deleteGeneratedEntry(doc.history, entryId);
        fallbackEntryId = resolveHistorySlot(tree, { slotId: entry.slotId })?.defaultEntry.entryId ?? null;
        storePlanAndTree(doc, findPlan({ ...doc, history: tree }, messageKey), tree);
        return doc;
      });
      const removed = removedFrom(before!, written.history, [entryId]);
      await updateSidecar(services.storage, chatId, () => undefined, written.history).catch(() => undefined);
      if (messageKey.startsWith("illustration:")) await publish(chatId, messageKey);
      const { cleanup } = await cleanupImages(chatId, removed, written.history);
      emitChanged(chatId, [messageKey]);
      return { fallbackEntryId, cleanup };
    },

    async prepareSlotDeletion(chatId, messageKey, slotId) {
      if (messageBusy(chatId, messageKey) || deletionLocks.has(k(chatId, messageKey))) throw new RpcFailure(labelError("busy", PIPELINE_TEXT.deleteBusy));
      const target = targetOfKey(chatId, messageKey);
      if (tracker.isStreaming(chatId, target.messageId)) throw new RpcFailure(labelError("busy", PIPELINE_TEXT.deleteBusy));
      const doc = await services.storage.loadChatData(chatId);
      const message = doc.history.messagesByKey[messageKey];
      const resolved = message ? resolveHistorySlot(doc.history, { slotId, messageKey, revisionId: message.activeRevisionId }) : null;
      if (!message || !resolved) fail("not-found", `Image History slot not found: ${slotId}`);
      const previewToken = nextId("slot-delete");
      previews.set(previewToken, {
        chatId,
        messageKey,
        slotId,
        revisionId: resolved.revision.revisionId,
        slotIndex: resolved.slot.slotIndex,
        membership: JSON.stringify(resolved.revisionSlot.entryIds),
        createdAt: now(),
      });
      for (const [token, p] of previews) if (now() - p.createdAt > 10 * 60_000) previews.delete(token);
      return {
        previewToken,
        chatId,
        messageKey,
        slotId,
        imageCount: resolved.entries.length,
        revisionNumber: message.revisions.findIndex((r) => r.revisionId === resolved.revision.revisionId) + 1,
        lastSlot: Object.keys(resolved.revision.slotsById).length === 1,
      };
    },

    async deleteSlot(previewToken) {
      const preview = previews.get(previewToken) ?? fail("not-found", "The slot deletion preview expired. Open the dialog again.");
      const lockKey = k(preview.chatId, preview.messageKey);
      if (deletionLocks.has(lockKey)) throw new RpcFailure(labelError("busy", PIPELINE_TEXT.deleteRunning));
      if (messageBusy(preview.chatId, preview.messageKey)) throw new RpcFailure(labelError("busy", PIPELINE_TEXT.deleteBusy));
      deletionLocks.add(lockKey);
      try {
        let before: HistoryTree | null = null;
        let entryIds: string[] = [];
        const written = await services.storage.updateChatData(preview.chatId, (doc) => {
          const resolved = resolveHistorySlot(doc.history, { slotId: preview.slotId, messageKey: preview.messageKey, revisionId: preview.revisionId });
          if (!resolved || JSON.stringify(resolved.revisionSlot.entryIds) !== preview.membership)
            fail("conflict", "The slot changed after the deletion preview. Open the dialog again.");
          before = doc.history;
          entryIds = [...resolved.revisionSlot.entryIds];
          const tree = mutateHistoryTree(doc.history, [{ type: "delete-slot", messageKey: preview.messageKey, revisionId: preview.revisionId, slotIndex: preview.slotIndex }]);
          storePlanAndTree(doc, findPlan({ ...doc, history: tree }, preview.messageKey), tree);
          return doc;
        });
        previews.delete(previewToken);
        await updateSidecar(services.storage, preview.chatId, () => undefined, written.history).catch(() => undefined);
        const published = await publish(preview.chatId, preview.messageKey).catch(() => "missing" as const);
        const { cleanup, failed } = await cleanupImages(preview.chatId, removedFrom(before!, written.history, entryIds), written.history);
        const cleanupId = nextId("cleanup");
        if (failed.length) cleanups.set(cleanupId, { chatId: preview.chatId, imageIds: failed });
        emitChanged(preview.chatId, [preview.messageKey]);
        return { cleanup, cleanupId, ...(published !== "published" ? { projectionWarning: "The message text could not be updated yet (the message is missing or still streaming)." } : {}) };
      } finally {
        deletionLocks.delete(lockKey);
      }
    },

    async retryCleanup(cleanupId) {
      const record = cleanups.get(cleanupId) ?? fail("not-found", "No pending image cleanup for this id.");
      const doc = await services.storage.loadChatData(record.chatId);
      const { cleanup, failed } = await cleanupImages(record.chatId, record.imageIds, doc.history);
      if (failed.length) cleanups.set(cleanupId, { ...record, imageIds: failed });
      else cleanups.delete(cleanupId);
      return { cleanup };
    },

    getZoomDetails: (chatId, slotId, entryId) => zoomDetails(chatId, slotId, entryId),

    async saveDraft(chatId, slotId, overrides) {
      await updateDraft(chatId, slotId, (current) => ({ ...(current ?? {}), ...jsonClone(overrides) }));
      return zoomDetails(chatId, slotId);
    },

    async clearDraft(chatId, slotId, part) {
      await updateDraft(chatId, slotId, (current) => {
        if (!current || part === "all") return undefined;
        const next = { ...current };
        if (part === "prompts") {
          delete next.positivePrompt;
          delete next.negativePrompt;
          delete next.sections;
        } else {
          delete next.centers;
          delete next.excludedCharacterIndexes;
        }
        return next;
      });
      return zoomDetails(chatId, slotId);
    },

    async importViewed(chatId, slotId, entryId, what) {
      const record = (await recordFor(chatId, entryId)) ?? fail("not-found", "The viewed image has no stored generation record.");
      await updateDraft(chatId, slotId, (current) => {
        const next: RegenerationOverrides = { ...(current ?? {}) };
        if (what === "seed") Object.assign(next, { seed: record.seed, seedFixed: true });
        else
          Object.assign(next, {
            positivePrompt: record.positivePrompt,
            negativePrompt: record.negativePrompt,
            sections: sectionsOf(record, undefined).map((s) => ({ id: s.id, value: s.value, negativeValue: s.negativeValue })),
          });
        return next;
      });
      return zoomDetails(chatId, slotId);
    },

    async requestAiPromptEdit(chatId, slotId, entryId, request) {
      const instruction = str(request.instruction);
      if (!instruction) throw new RpcFailure(labelError("bad-request", PIPELINE_TEXT.editInstructionEmpty));
      if (instruction.length > 2000) throw new RpcFailure(rpcError("bad-request", "The AI image edit request must be 2,000 characters or less.", { messageKo: "AI 이미지 수정 요청은 2,000자 이하여야 합니다." }));
      const doc = await services.storage.loadChatData(chatId);
      const resolved = resolveHistorySlot(doc.history, { slotId });
      if (!resolved || !resolved.entries.some((e) => e.entryId === entryId)) fail("not-found", `Image History entry not found: ${entryId}`);
      if (resolved.message.mode !== "illustration") fail("unsupported", "AI prompt edit is available for illustration messages only.");
      const record = await recordFor(chatId, entryId);
      if (!record) throw new RpcFailure(rpcError("unsupported", "Could not load the regeneration settings of the selected image.", { messageKo: "선택한 이미지의 재생성 설정을 불러오지 못했습니다." }));
      if (request.imageToImage && record.engineProvider !== "novelai")
        throw new RpcFailure(rpcError("unsupported", "i2i is available for NovelAI images only.", { messageKo: "i2i는 NovelAI 이미지에서만 사용할 수 있습니다." }));
      const proposalId = nextId("ai-edit");
      proposals.set(proposalId, { chatId, slotId, entryId, request: { ...request, instruction }, createdAt: now() });
      while (proposals.size > 32) proposals.delete(proposals.keys().next().value!);
      // Asset Maid's proposal (zxe `Dt` 162148) is the instruction + seed + i2i options; the analyzer revises the prompts
      // when the proposal is applied (revision run, AM `Fr` 173977).
      return {
        proposalId,
        positivePrompt: record.positivePrompt,
        negativePrompt: record.negativePrompt,
        sections: sectionsOf(record, undefined),
        explanation: `The analyzer will revise this image with the instruction: "${instruction}".`,
      };
    },

    async applyAiPromptEdit(chatId, slotId, proposalId) {
      const proposal = proposals.get(proposalId);
      if (!proposal || proposal.chatId !== chatId || proposal.slotId !== slotId) fail("not-found", "The AI edit proposal expired. Create it again.");
      const doc = await services.storage.loadChatData(chatId);
      const resolved = resolveHistorySlot(doc.history, { slotId });
      if (!resolved || !resolved.entries.some((e) => e.entryId === proposal.entryId))
        throw new RpcFailure(rpcError("conflict", "The image or prompt target changed before the AI edit was applied.", { messageKo: "AI 수정 요청을 적용하기 전에 이미지 또는 prompt 대상이 변경되었습니다." }));
      const planKey = resolved.message.messageKey;
      if (messageBusy(chatId, planKey)) throw new RpcFailure(rpcError("busy", "Another image operation is running.", { messageKo: "다른 이미지 작업이 진행 중입니다." }));
      const target = targetOfKey(chatId, planKey);
      const record = await recordFor(chatId, proposal.entryId);
      if (!record) throw new RpcFailure(rpcError("unsupported", "Could not load the regeneration settings of the selected image."));
      const entry = resolved.entries.find((e) => e.entryId === proposal.entryId)!;
      const imageId = imageIdFromResultUrl(entry.savedPath) ?? record.imageId;
      const draft = (await readSidecar(services.storage, chatId)).drafts[slotId]?.overrides;
      const req = proposal.request;
      const revision: RevisionInput = {
        slotId,
        revisionId: resolved.revision.revisionId,
        sourceEntryId: proposal.entryId,
        direction: req.instruction,
        currentPrompt: channelsOf(record),
        seed: record.seed,
        seedFixed: !!draft?.seedFixed,
        evidenceKey: [proposal.entryId, entry.assetName, record.positivePrompt.length.toString(36)].join(":"),
        image: async () => ({ type: "image" as const, ...(await services.imageBytes.getImage({ imageId })) }),
        ...(req.imageToImage
          ? {
              imageToImage: async () => (await services.imageBytes.getImage({ imageId })).data,
              imageToImageStrength: Math.min(1, Math.max(0.4, Number(req.strength) || 0.4)),
              imageToImageNoise: Math.min(1, Math.max(0, Number(req.noise) || 0)),
            }
          : {}),
      };
      proposals.delete(proposalId);
      const job = startMessageJob(target, planKey, { automatic: false, attemptKind: "regenerate", revision }, "revision");
      return { jobId: job.snapshot.jobId };
    },

    async getChatState(chatId) {
      const doc = await services.storage.loadChatData(chatId);
      return { actorState: doc.actorState };
    },

    async clearChatState(chatId, actorKeys) {
      const written = await services.storage.updateChatData(chatId, (doc) => {
        const actors = { ...doc.actorState.actors };
        if (actorKeys?.length) for (const key of actorKeys) delete actors[key];
        else for (const key of Object.keys(actors)) delete actors[key];
        doc.actorState = Object.keys(actors).length || doc.actorState.revision > 0 ? { revision: doc.actorState.revision + 1, actors } : createEmptyActorState();
        return doc;
      });
      emitChanged(chatId, []);
      return { actorState: written.actorState };
    },

    async setChatState(chatId, actorState, baseRevision) {
      const checked = validateCurrentActorState(actorState);
      if (!checked.ok) fail("bad-request", `Invalid actor state: ${checked.issues[0]?.message ?? "unknown issue"}`, { details: checked.issues });
      const written = await services.storage.updateChatData(chatId, (doc) => {
        if (doc.actorState.revision !== baseRevision)
          fail("conflict", "The chat state changed since it was opened. Reload it and try again.", { details: { revision: doc.actorState.revision, baseRevision } });
        doc.actorState = { revision: doc.actorState.revision + 1, actors: checked.state.actors };
        return doc;
      });
      emitChanged(chatId, []);
      return { actorState: written.actorState };
    },

    async getMessageStates(chatId, messageIds) {
      const [messages, doc] = await Promise.all([loadMessages(services.host, chatId), services.storage.loadChatData(chatId)]);
      const wanted = messageIds?.length ? new Set(messageIds) : null;
      const regenerating = new Set([...slotJobs.values()].filter((j) => j.target.chatId === chatId).map((j) => j.slotId!));
      const out: ChatMessageUiState[] = [];
      for (const m of messages) {
        if (m.role !== "assistant") continue;
        if (wanted ? !wanted.has(m.id) : !isIllustratableMessage(m)) continue;
        const planKey = illustrationMessageKey(toHistoryMessageId(m.id, m.swipeId));
        const running = messageJobs.get(k(chatId, planKey)) ?? [...slotJobs.values()].find((j) => j.target.chatId === chatId && j.planKey === planKey);
        const latest = running ?? [...jobs.values()].reverse().find((j) => j.target.chatId === chatId && j.planKey === planKey && !j.dismissed);
        const lastError = lastErrors.get(k(chatId, planKey));
        out.push(
          messageUiState(doc, {
            chatId,
            messageId: m.id,
            swipeIndex: m.swipeId,
            eligible: isIllustratableMessage(m),
            ...(latest ? { job: jsonClone(latest.snapshot) } : {}),
            regeneratingSlotIds: regenerating,
            ...(lastError ? { lastError } : {}),
          }),
        );
      }
      return { messages: out };
    },
  };
  return api;
}
