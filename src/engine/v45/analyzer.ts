/**
 * NovelAI V4.5 analyzer ("v4-5" profile): engine state machine, LLM runner, request/message builders,
 * error classes, checkpoint store and the small policy helpers used by the chat pipeline.
 *
 * All behaviour comes from the verbatim core. This module only adds types and defaults.
 * Flow (spec/pipeline.md §2.3): `createV45AnalyzerRunner(engine, client).run(input)` ->
 * `engine.start` -> [illustration | preset-selection -> modifier-selection | modifier-repair] ->
 * `{plan, routePlan, ...}`.
 */
import {
  createV45AnalyzerEngine as coreCreateV45AnalyzerEngine,
  createV45AnalyzerRunner as coreCreateV45AnalyzerRunner,
  buildV45StageMessages as coreBuildV45StageMessages,
  buildV45RevisionStageMessages as coreBuildV45IllustrationMessages,
  buildV45SingleStageRequest as coreBuildV45SingleStageRequest,
  resolveAnalyzerExecutionMode as coreResolveAnalyzerExecutionMode,
  resolveCheckpointPolicy as coreResolveCheckpointPolicy,
  assertAnalyzerReady as coreAssertAnalyzerReady,
  resolveGenerationType as coreResolveGenerationType,
  NOVELAI_DEFAULTS,
  on as CoreAnalyzerClientError,
  K_ as CoreAnalyzerStageError,
  YQe as coreCreateCheckpointStore,
  K9 as coreCheckpointKey,
  WQe as coreCheckpointFingerprints,
  vm as coreCandidateKey,
  mP as coreFindResponseIllustrations,
  Tde as coreIsRetryable,
  oP as coreIsImageUnsupported,
  qet as coreBuildPresetSelectionRequest,
  Jet as coreBuildRuleIRAnalyzerCatalog,
  Fde as coreWithRevisionInstructions,
  iPe as coreStageSystemPrompt,
  sPe as coreIllustrationSystemPrompt,
  Dde as CORE_CACHE_BOUNDARY_NOTE,
  ude as CORE_PROTOCOL_VERSIONS,
  Mre as PRESET_REQUEST_SCHEMA,
  hKe as PRESET_RESPONSE_SCHEMA,
  mF as MODIFIER_REQUEST_SCHEMA,
  rR as MODIFIER_RESPONSE_SCHEMA,
  zre as ILLUSTRATION_REQUEST_SCHEMA,
  pF as ILLUSTRATION_RESPONSE_SCHEMA,
} from "../core/asset-maid-core";
import { createV45RuleRuntime, getV45AnalyzerProjection, type V45AnalyzerProjection, type V45RuleRuntime } from "./catalog";
import type {
  AnalyzerCheckpointContext,
  AnalyzerContext,
  AnalyzerFingerprintInput,
  AnalyzerValidationOptions,
  IdentityCandidate,
  RevisionPromptChannel,
} from "../context/types";

export type V45ExecutionMode = "single-stage" | "two-stage";
/** `restart-modifiers` is accepted by the engine (AM `Ttt.start`) but not produced by the chat pipeline. */
export type V45CheckpointPolicy = "restart-analysis" | "reuse-plan" | "resume" | "restart-modifiers";
export type V45AnalyzerStageName = "illustration" | "preset-selection" | "modifier-selection" | "modifier-repair";

/** Schema ids (AM @49115-49120). */
export const V45_SCHEMA_IDS = Object.freeze({
  presetRequest: PRESET_REQUEST_SCHEMA as string,
  presetResponse: PRESET_RESPONSE_SCHEMA as string,
  modifierRequest: MODIFIER_REQUEST_SCHEMA as string,
  modifierResponse: MODIFIER_RESPONSE_SCHEMA as string,
  illustrationRequest: ILLUSTRATION_REQUEST_SCHEMA as string,
  illustrationResponse: ILLUSTRATION_RESPONSE_SCHEMA as string,
});

/** Cache protocol versions per namespace (AM `ude` @79221). */
export const V45_PROTOCOL_VERSIONS = CORE_PROTOCOL_VERSIONS as Readonly<Record<"preset-selection" | "modifier-selection" | "illustration", number>>;

/** Note appended to the first cached system segment (AM `Dde` @81660). */
export const V45_CACHE_BOUNDARY_NOTE = CORE_CACHE_BOUNDARY_NOTE as string;

// ---------------------------------------------------------------------------------------------
// Messages / client contract
// ---------------------------------------------------------------------------------------------

export type V45ContentPart = { type: "text"; text: string } | { type: string; [extra: string]: unknown };
export interface V45ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | V45ContentPart[];
}

/** Cache-partitioned form of the same request (transport picks one; see spec/pipeline.md §2.3.2). */
export interface V45CachePartition {
  namespace: "illustration" | "preset-selection" | "modifier-selection";
  protocolVersion: number;
  layout: { prefixRoutingSegmentCount: number; resourceCachedSegmentCount: number };
  diagnostic: unknown;
  cacheSegments: { kind: string; messages: V45ChatMessage[] }[];
  liveMessages: V45ChatMessage[];
}

export interface V45StageMessages {
  fullMessages: V45ChatMessage[];
  cachePartition: V45CachePartition;
}

/** Options passed to `client.complete` by the runner (AM `Fz` @82005). */
export interface V45CompleteOptions {
  purpose: "image-generation";
  onRequestProgress?: (progress: unknown) => void;
  beforeRequest?: () => void;
  signal?: AbortSignal;
  cachePartition: V45CachePartition;
  cacheSourceId: string;
  diagnostic: { sessionId?: string; analysisKind?: string; phase: V45AnalyzerStageName };
}

/** Transport result. `parsed` is the JSON value (or the raw text after a lenient-parse failure). */
export interface V45Completion {
  raw: string;
  parsed: unknown;
  cacheUsage?: { status?: string; inputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  requestObservation?: unknown;
}

/**
 * LLM client contract. Throw `AnalyzerClientError` with codes `ANALYZER_JSON_PARSE` /
 * `ANALYZER_EMPTY_RESPONSE` / `ANALYZER_REFUSAL` (+ `analyzerRaw`) to let the lenient validator try
 * the raw text (illustration and preset stages), `ANALYZER_HTTP` + `httpStatus` for HTTP failures
 * (408/429/5xx retryable), `ANALYZER_TIMEOUT` (retryable), `REQUEST_ABORTED`.
 */
export interface V45AnalyzerClient<C = Record<string, unknown>> {
  complete(config: C, messages: V45ChatMessage[], options: V45CompleteOptions): Promise<V45Completion>;
}

export interface AnalyzerClientErrorOptions {
  code?: string;
  httpStatus?: number;
  retryAfterMs?: number;
  analyzerRaw?: string;
  responseText?: string;
  context?: unknown;
  cause?: unknown;
}

/** Transport error class (AM `on` @79248, name "AnalyzerClientError"). */
export const AnalyzerClientError = CoreAnalyzerClientError as unknown as new (message: string, options?: AnalyzerClientErrorOptions) => Error & {
  code: string;
  httpStatus: number;
  retryAfterMs: number;
  analyzerRaw?: string;
  responseText?: string;
  context?: unknown;
};

/** Stage error class (AM `K_` @81580, name "AnalyzerStageError"). */
export const AnalyzerStageError = CoreAnalyzerStageError as unknown as new (message: string, options: Record<string, unknown>) => Error & {
  analyzerStage: V45AnalyzerStageName;
  analyzerStageNumber: 1 | 2;
  analyzerAttempts: number;
  analyzerUnifiedAttempts: number;
  analyzerRepairAttempts: number;
  analyzerCheckpointAvailable: boolean;
  code: string;
  retryable: boolean;
  analyzerRaw?: string;
};

/** Retryable transport error? timeout, HTTP 408/429/5xx, TypeError (AM `Tde` @81611). */
export function isRetryableAnalyzerError(error: unknown): boolean {
  return coreIsRetryable(error) as boolean;
}

/** HTTP 400/415/422 whose text says images are unsupported (AM `oP` @81557). */
export function isImageUnsupportedError(error: unknown): boolean {
  return coreIsImageUnsupported(error) as boolean;
}

// ---------------------------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------------------------

export interface V45PlanActor {
  source: "lorebook" | "persona";
  lorebook_prompt_key: string;
  outfit_id: string;
  outfit_proposal_id: string;
  character_name: string;
  gender: string;
  form_id: string;
  [extra: string]: unknown;
}

/** Route-plan image (after route validation, AM `Xde` @83658). */
export interface V45RouteImage {
  slot_id: string;
  slot_number: number;
  source_image_token: string;
  lorebook_prompt_key: string;
  outfit_id: string;
  composition_id: string;
  preset_id: string;
  size_id: number;
  actors: { primary: V45PlanActor | null; secondary: V45PlanActor | null; persona: V45PlanActor | null };
  modifier_feature_ids: string[];
  [extra: string]: unknown;
}

/** Final plan image (route + modifiers, AM `wue` @85223). */
export interface V45PlanImage extends V45RouteImage {
  selected_variant_id: string;
  selected_frame_id?: string;
  selected_frame_size_id?: number;
  frame_roll?: unknown;
  body_action: string;
  modifiers: { global: Record<string, unknown>; actors: Record<string, Record<string, unknown>> };
  visual_continuity_clear: unknown;
  visual_continuity_counts: unknown;
  reason: string;
}

export interface V45OutfitProposal {
  id: string;
  candidate_key?: string;
  lorebook_prompt_key?: string;
  form_ref?: string;
  name: string;
  head: string;
  top: string;
  bottom: string;
  legs: string;
  feet: string;
  reason?: string;
  confidence?: number;
  [extra: string]: unknown;
}

export interface V45RoutePlan {
  images: V45RouteImage[];
  outfit_proposals: V45OutfitProposal[];
  diagnostics: unknown[];
}

export interface V45Plan {
  images: V45PlanImage[];
  diagnostics: unknown[];
}

// ---------------------------------------------------------------------------------------------
// Engine (Ttt)
// ---------------------------------------------------------------------------------------------

export interface V45AnalyzerSession {
  requestContext: AnalyzerContext;
  checkpointContext: AnalyzerCheckpointContext;
  fingerprint: { fingerprint: string; continuityFingerprint: string };
}

/** Stage object returned by `engine.start` / `accept*` (AM `Ttt` @85304-85391). */
export interface V45AnalyzerStage {
  stage: V45AnalyzerStageName;
  resumed: boolean;
  /** "not-found" | "hit" | "fingerprint-changed" | "continuity-changed" | "policy-restart" | "policy-restart-modifiers" */
  checkpointReason: string;
  session: V45AnalyzerSession;
  /** Stage request JSON (illustration: AM `$et`; preset: `qet`; modifier/repair: `nue`). */
  request: Record<string, unknown>;
  routePlan?: V45RoutePlan;
  cachedPlan?: V45Plan | null;
  cacheContext?: unknown;
  allowOutfitCreation?: boolean;
  repair?: { required: boolean; code: string; message: string } | null;
}

export type V45IllustrationAcceptance =
  | { status: "validated"; routePlan: V45RoutePlan; plan: V45Plan }
  | { status: "modifier-repair"; routePlan: V45RoutePlan; stage: V45AnalyzerStage; repair: { required: true; code: string; message: string } };

export interface V45AnalyzerEngine {
  start(
    context: AnalyzerContext,
    checkpointContext: AnalyzerCheckpointContext,
    fingerprintInput?: AnalyzerFingerprintInput | Record<string, unknown>,
    policy?: V45CheckpointPolicy,
    executionMode?: V45ExecutionMode,
  ): V45AnalyzerStage;
  acceptPresetResponse(stage: V45AnalyzerStage, parsed: unknown, options?: Partial<AnalyzerValidationOptions>): V45AnalyzerStage;
  acceptModifierResponse(stage: V45AnalyzerStage, parsed: unknown): V45Plan;
  acceptIllustrationResponse(stage: V45AnalyzerStage, parsed: unknown, options?: Partial<AnalyzerValidationOptions>): V45IllustrationAcceptance;
  acceptModifierRepairResponse(stage: V45AnalyzerStage, parsed: unknown): V45Plan;
  commitSingleStageResult(stage: V45AnalyzerStage, routePlan: V45RoutePlan, plan: V45Plan): void;
  clearCheckpoint(checkpointContext: AnalyzerCheckpointContext): boolean;
  clearAllCheckpoints(): void;
  summary(): import("./catalog").V45AnalyzerSummary;
}

/** In-memory checkpoint store (AM `YQe` @82611): TTL 600 000 ms, LRU limit 120. */
export interface V45CheckpointStore {
  store(ctx: AnalyzerCheckpointContext, routePlan: unknown, continuitySnapshot: unknown, fingerprint: unknown): unknown;
  storeResult(ctx: AnalyzerCheckpointContext, routePlan: unknown, plan: unknown, continuitySnapshot: unknown, fingerprint: unknown): unknown;
  find(ctx: AnalyzerCheckpointContext, fingerprint: unknown): { checkpoint: unknown; reason: string };
  clear(ctx: AnalyzerCheckpointContext): boolean;
  clearAll(): void;
  size(): number;
}

export interface V45EngineOptions {
  /** Built-in Rule IR runtime (default `createV45RuleRuntime()`); `null` with a legacy catalog = custom-catalog engine. */
  ruleRuntime?: V45RuleRuntime | null;
  /** Legacy (custom raw) catalog compiled by `compileCustomV45Catalog` (AM `n$e`). Two-stage only. */
  legacyCatalog?: unknown;
  checkpoints?: V45CheckpointStore;
}

/**
 * Create the analyzer engine (AM `Ttt` @85289 = `Ttt(legacyCatalog, NOVELAI_DEFAULTS, {ruleRuntime, checkpoints})`).
 * The engine owns the checkpoint store; reuse one engine per process so resume works.
 */
export function createV45AnalyzerEngine(options: V45EngineOptions = {}): V45AnalyzerEngine {
  const ruleRuntime = options.ruleRuntime === undefined ? createV45RuleRuntime() : options.ruleRuntime;
  return coreCreateV45AnalyzerEngine(options.legacyCatalog ?? null, NOVELAI_DEFAULTS, {
    ...(ruleRuntime ? { ruleRuntime } : {}),
    ...(options.checkpoints ? { checkpoints: options.checkpoints } : {}),
  }) as unknown as V45AnalyzerEngine;
}

/** Create a checkpoint store (AM `YQe` @82611). `now` defaults to the engine clock. */
export function createAnalyzerCheckpointStore(options: { ttlMs?: number; limit?: number; now?: () => number } = {}): V45CheckpointStore {
  return coreCreateCheckpointStore(options) as unknown as V45CheckpointStore;
}

/** Checkpoint key `generationProvider:chatKey:messageId|pendingKey` (AM `K9` @82601). Throws without an id. */
export function analyzerCheckpointKey(ctx: Partial<AnalyzerCheckpointContext>): string {
  return coreCheckpointKey(ctx) as string;
}

/** `{fingerprint, continuityFingerprint}` = short hashes of the stable JSON of both inputs (AM `WQe` @82608). */
export function analyzerCheckpointFingerprints(input: unknown, continuity: unknown): { fingerprint: string; continuityFingerprint: string } {
  return coreCheckpointFingerprints(input, continuity) as { fingerprint: string; continuityFingerprint: string };
}

// ---------------------------------------------------------------------------------------------
// Runner (VQe)
// ---------------------------------------------------------------------------------------------

export interface V45AnalyzerDiagnosticEvent {
  event: string;
  stage: V45AnalyzerStageName;
  attempt: number;
  detail: unknown;
  sessionId: string;
  analysisKind: string;
  imageGenerationProvider: string;
  checkpointContext: AnalyzerCheckpointContext;
}

export interface V45AnalyzerProgress {
  phase: "analyzing-illustration" | "repairing-modifiers" | "analyzing-preset" | "analyzing-modifiers" | "complete";
  stage: V45AnalyzerStageName;
  completedStages: number;
  totalStages: number;
  attempt: number;
  cacheNotice?: unknown;
}

/** `runner.run` input = orchestrator `analyzerInput` + `config` (= `config.analysis`) (spec §2.2). */
export interface V45AnalyzerRunInput<C = Record<string, unknown>> {
  config: C;
  executionMode: V45ExecutionMode;
  checkpointPolicy?: V45CheckpointPolicy;
  context: AnalyzerContext;
  checkpointContext: AnalyzerCheckpointContext;
  fingerprintInput?: AnalyzerFingerprintInput;
  validationOptions?: AnalyzerValidationOptions;
  /** 1 when the caller manages retries (`automaticRetryManaged`); else 2 attempts (100 ms delay). */
  maxAttempts?: number;
  revisionDirection?: string;
  revisionPromptChannels?: RevisionPromptChannel[];
  imageParts?: V45ContentPart[];
  signal?: AbortSignal;
  beforeRequest?: () => void;
  onRequestProgress?: (progress: unknown) => void;
  onDiagnostic?: (event: V45AnalyzerDiagnosticEvent) => void;
  onProgress?: (progress: V45AnalyzerProgress) => void;
  diagnostic?: { sessionId?: string; analysisKind?: string; imageGenerationProvider?: string };
  afterPresetValidated?: (routePlan: V45RoutePlan, signal?: AbortSignal) => unknown;
  afterAnalysisValidated?: (
    arg: { source: string; routePlan: V45RoutePlan; plan: V45Plan; resumedFromCheckpoint: boolean },
    signal?: AbortSignal,
  ) => unknown;
}

export interface V45AnalyzerRunResult {
  plan: V45Plan;
  routePlan: V45RoutePlan;
  resumedFromCheckpoint: boolean;
  attempts: { preset: number; modifiers: number; unified?: number; repair?: number };
  executionMode?: V45ExecutionMode;
  timings?: {
    unifiedAnalyzerMs: number;
    repairAnalyzerMs: number;
    localValidationMs: number;
    postAnalysisMs: number;
    totalToPromptPlanningMs: number;
  };
}

export interface V45AnalyzerRunner<C = Record<string, unknown>> {
  run(input: V45AnalyzerRunInput<C>): Promise<V45AnalyzerRunResult>;
}

/**
 * Create the analyzer runner (AM `VQe` @82079). Throws `AnalyzerStageError` on failure:
 * `ANALYZER_ILLUSTRATION_MODIFIER_STRUCTURE_UNUSABLE` (stage modifier-repair; resume to repair),
 * `ANALYZER_*_RESPONSE_UNUSABLE`, `ANALYZER_POST_ANALYSIS_FAILED`, `ANALYZER_POST_ANALYSIS_OUTFIT_UNRESOLVED`,
 * transport codes (`ANALYZER_HTTP`, ...), `REQUEST_ABORTED`.
 * @param options.maxConcurrentRequests default 8 (AM `HQe`)
 */
export function createV45AnalyzerRunner<C = Record<string, unknown>>(
  engine: V45AnalyzerEngine,
  client: V45AnalyzerClient<C>,
  options: { maxConcurrentRequests?: number; onDiagnostic?: (event: V45AnalyzerDiagnosticEvent) => void } = {},
): V45AnalyzerRunner<C> {
  return coreCreateV45AnalyzerRunner(engine, client, options) as unknown as V45AnalyzerRunner<C>;
}

// ---------------------------------------------------------------------------------------------
// Request / message builders
// ---------------------------------------------------------------------------------------------

/**
 * Messages for any stage object (AM `KQe` @81693). `illustration` delegates to `buildV45IllustrationMessages`.
 * Non-illustration system prompt = stage prompt (`iPe`) + "\n\n" + revision instructions (`D1e`).
 */
export function buildV45StageMessages(
  stage: V45AnalyzerStage,
  imageParts: V45ContentPart[] = [],
  revisionDirection = "",
  revisionPromptChannels: RevisionPromptChannel[] = [],
): V45StageMessages {
  return coreBuildV45StageMessages(stage, imageParts as never[], revisionDirection, revisionPromptChannels as never[]) as V45StageMessages;
}

/**
 * Illustration (single-stage) messages from a request (AM `BQe` @81762): system `L1e + "\n\n" + D1e`,
 * user = JSON request (+ `revision_request` when a direction is given) (+ image parts).
 */
export function buildV45IllustrationMessages(
  request: Record<string, unknown>,
  imageParts: V45ContentPart[] = [],
  revisionDirection = "",
  revisionPromptChannels: RevisionPromptChannel[] = [],
): V45StageMessages {
  return coreBuildV45IllustrationMessages(request, imageParts as never[], revisionDirection, revisionPromptChannels as never[]) as V45StageMessages;
}

/**
 * Single-stage request JSON (AM `$et` @83875; schema `asset_maid_analyzer_illustration_request_v2`).
 * Uses the Rule IR analyzer projection (default runtime). `context` is used as-is (the engine JSON-clones it first).
 */
export function buildV45SingleStageRequest(
  context: AnalyzerContext,
  projection: V45AnalyzerProjection = getV45AnalyzerProjection(),
): Record<string, unknown> {
  return coreBuildV45SingleStageRequest(context, coreBuildRuleIRAnalyzerCatalog(projection), NOVELAI_DEFAULTS, projection) as Record<string, unknown>;
}

/** Two-stage preset-selection request JSON (AM `qet` @84073) over the Rule IR projection. */
export function buildV45PresetSelectionRequest(
  context: AnalyzerContext,
  projection: V45AnalyzerProjection = getV45AnalyzerProjection(),
): Record<string, unknown> {
  return coreBuildPresetSelectionRequest(context, coreBuildRuleIRAnalyzerCatalog(projection), NOVELAI_DEFAULTS, projection) as Record<string, unknown>;
}

/**
 * System prompt for a stage, exactly as sent (AM `Fde(iPe(...))` / `Fde(sPe())`).
 * @param options.allowOutfitCreation preset-selection only: any candidate has allowOutfitCreation
 * @param options.imageCountInstruction preset-selection only: `request.image_count_instruction`
 */
export function renderV45SystemPrompt(
  stage: V45AnalyzerStageName,
  options: { allowOutfitCreation?: boolean; imageCountInstruction?: string } = {},
): string {
  if (stage === "illustration") return coreWithRevisionInstructions(coreIllustrationSystemPrompt()) as string;
  const s = stage === "modifier-repair" ? "modifier-selection" : stage;
  return coreWithRevisionInstructions(coreStageSystemPrompt(s, options)) as string;
}

/** Opaque wire candidate key `actor.<hash>.<hash(reversed)>` for a prompt key (AM `vm` @82547). */
export function toV45CandidateKey(promptKey: string): string {
  return coreCandidateKey(promptKey) as string;
}

/**
 * Lenient illustration lookup used by modifier validation (AM `mP` @85136): accepts a JSON string
 * (``` fences stripped), arrays, or objects nested up to depth 4 under illustrations/result/data/output/response.
 */
export function findV45ResponseIllustrations(response: unknown): Record<string, unknown>[] {
  return coreFindResponseIllustrations(response) as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------------------------
// Chat-pipeline policy helpers (E1t area)
// ---------------------------------------------------------------------------------------------

/** single-stage only for the default catalog with requested single-stage (AM `M_e` @168762). */
export function resolveAnalyzerExecutionMode(input: { requestedMode?: V45ExecutionMode; catalogSource?: "default" | "custom" } = {}): V45ExecutionMode {
  return coreResolveAnalyzerExecutionMode(input) as V45ExecutionMode;
}

/** automatic|initial|reroll -> restart-analysis; regenerate -> reuse-plan; else resume (AM `u1t` @168814). */
export function resolveCheckpointPolicy(attemptKind: string | undefined): "restart-analysis" | "reuse-plan" | "resume" {
  return coreResolveCheckpointPolicy(attemptKind) as "restart-analysis" | "reuse-plan" | "resume";
}

export interface AnalyzerReadinessInput {
  analysisProfile: string;
  freeCharacterGenerationEnabled: boolean;
  /** true when a source catalog exists; then `readiness` must match (AM `l1t` @168793). */
  requiresSourceReadiness: boolean;
  readiness?: { sourceId?: string; characterIndex?: number; chatIndex?: number; hydrationRevision?: number } | null;
  characterIndex?: number;
  chatIndex?: number;
  sourceSnapshot?: { currentSourceId?: string; sources: { id: string }[] } | null;
  analyzerIdentityCandidates: IdentityCandidate[];
  analyzerPersonaCandidates?: IdentityCandidate[];
}

/**
 * Readiness gate (AM `d1t` @168807): "source-unavailable" | "ready" | "no-candidates".
 * v5-hybrid is always ready; v4-5 needs >= 1 identity or persona candidate (or free character generation).
 * On "no-candidates" Asset Maid shows "생성에 사용할 캐릭터 후보가 없습니다." and makes no LLM call.
 */
export function assertAnalyzerReady(input: AnalyzerReadinessInput): "source-unavailable" | "ready" | "no-candidates" {
  return coreAssertAnalyzerReady(input) as "source-unavailable" | "ready" | "no-candidates";
}

/** revision -> ai-prompt-edit; retry -> illustration-retry; forced -> manual-all; else chat-auto (AM `f1t` @168821). */
export function resolveGenerationType(
  origin: string | undefined,
  forced: boolean,
  revision = false,
): "ai-prompt-edit" | "illustration-retry" | "manual-all" | "chat-auto" {
  return coreResolveGenerationType(origin, forced, revision) as "ai-prompt-edit" | "illustration-retry" | "manual-all" | "chat-auto";
}
