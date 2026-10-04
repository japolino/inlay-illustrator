/**
 * NovelAI V5 analyzer: directing modes (user directions), request building, messages / cache partition,
 * structured output schema, response recovery, the analyzer run (`Egt`) over an injected LLM client, and the
 * split-analysis helpers.
 *
 * `buildV5AnalyzerRequest` composes the verbatim core builders in the same order as `Egt.run` (117383-117489):
 * `nbe` → `Cgt` → `Pgt` → continuity projections (`_gt`, `vN`, `UDe`, `qDe`, `XDe`) → `rt.buildAnalyzerRequest`
 * (`tMe`) → `eje` schema (+ split `mgt` / `hgt`). Parity with the messages that `Egt` actually sends is tested.
 */
import {
  buildV5ActorCandidates,
  resolveV5ImageCount,
  buildV5SceneSlots,
  _gt as buildLayoutContinuity,
  createV5ContinuityBasis,
  UDe as buildActorModifierContinuity,
  qDe as buildSceneModifierContinuity,
  XDe as buildNaturalLanguageContinuity,
  buildV5StructuredOutputSchema,
  mgt as toInitialPhaseSchema,
  hgt as toDetailPhaseSchema,
  vgt as toDetailPhasePayload,
  buildV5AnalyzerMessages as coreBuildV5AnalyzerMessages,
  toV5AnalyzerWirePayload,
  resolveV5UserDirections as coreResolveV5UserDirections,
  createDefaultV5UserDirectionSettings,
  selectV5DirectionPreset as coreSelectV5DirectionPreset,
  V5_ANALYSIS_PRESETS as CORE_V5_ANALYSIS_PRESETS,
  createV5Analyzer as coreCreateV5Analyzer,
  createV5SplitAnalysisRunner as coreCreateV5SplitAnalysisRunner,
  renderV5SplitPhaseSystemInstruction as coreRenderV5SplitPhaseSystemInstruction,
  renderV5AnalyzerSystemInstruction as coreRenderV5AnalyzerSystemInstruction,
  buildV5InstructionModules as coreBuildV5InstructionModules,
  Dgt as planSplitBatchSizes,
} from "../core/asset-maid-core";
import { getSharedV5RuleRuntime, type V5AnalyzerRequest, type V5ContinuitySnapshot, type V5RecoveryMode, type V5RuleRuntime } from "./runtime";
import type { V5RecoveredResponse } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

/* ------------------------------------------------------------------------------------------------ directions */

/** One directing preset in the settings (`novelai.v5UserDirections.scene.presets[]`, `RPe` 6060). */
export interface V5DirectionPreset {
  readonly id: string;
  readonly name: string;
  readonly instruction: string;
  readonly scenePresetId?: "pov" | "ensemble" | "comic" | string;
  readonly controlOverrides?: Readonly<Record<string, boolean | number>>;
  readonly customInstruction?: { readonly enabled: boolean; readonly text: string };
  readonly allowedSizeIds?: readonly number[];
  readonly [key: string]: unknown;
}

/** One direction list (`scene` or `imageRatio`) after `Td`. */
export interface V5DirectionList {
  readonly mode: "preset" | "custom" | string;
  readonly selectedPresetId?: string;
  readonly presets: readonly V5DirectionPreset[];
  readonly presetId?: string;
  readonly controlOverrides?: Readonly<Record<string, boolean | number>>;
  readonly customText: string;
}

/** `novelai.v5UserDirections` settings. */
export interface V5DirectionSettings {
  readonly scene: V5DirectionList;
  readonly imageRatio: V5DirectionList;
}

/** Resolved user directions handed to the analyzer request (`qgt` 118641). */
export interface V5UserDirections {
  readonly customInstruction?: string;
  readonly scenePresetId?: string;
  readonly scenePresetControlOverrides?: Readonly<Record<string, boolean | number>>;
  readonly sceneDirection?: string;
  readonly sceneDirectionSource?: "preset" | "supplemental";
  readonly imageRatioDirection?: unknown;
}

/** Built-in analysis presets (`bPe` @3459 = `dg.analysisPresets`): scene default/pov/ensemble/comic, image ratio default/unspecified. */
export const V5_ANALYSIS_PRESETS = CORE_V5_ANALYSIS_PRESETS as Readonly<Record<string, unknown>>;

/** Default `v5UserDirections` settings (scene-default + image-ratio-default). Original: `RPe` @6060. */
export function createDefaultV5DirectionSettings(): V5DirectionSettings {
  return createDefaultV5UserDirectionSettings() as V5DirectionSettings;
}

/**
 * Select a preset in a direction list (falls back to the first preset). Original: `Td` (selectV5DirectionPreset) @6049.
 */
export function selectV5DirectionPreset(list: Partial<V5DirectionList>, presetId: string | undefined, mode: string = "preset"): V5DirectionList {
  return coreSelectV5DirectionPreset(list, presetId, mode) as V5DirectionList;
}

/**
 * Resolve the analyzer user directions from `{novelAIConfig: {v5UserDirections}}`.
 * Original: `qgt` (resolveV5UserDirections) @118641.
 */
export function resolveV5UserDirections(input: { readonly novelAIConfig: { readonly v5UserDirections?: V5DirectionSettings | unknown } }): V5UserDirections {
  return coreResolveV5UserDirections(input) as V5UserDirections;
}

/** `resolveV5UserDirections({novelAIConfig: {v5UserDirections: settings}})`. */
export function resolveV5Directions(settings: V5DirectionSettings | undefined): V5UserDirections {
  return resolveV5UserDirections({ novelAIConfig: { v5UserDirections: settings } });
}

/* ------------------------------------------------------------------------------------------------ request */

/** Analyzer context (`o.analyzerInput.context`, pipeline spec §2.2). Only the fields read by V5 are typed. */
export interface V5AnalyzerContext {
  readonly cacheSourceId: string;
  readonly scope: "paragraph-slot-illustration" | string;
  readonly candidateSlots: readonly { readonly slot_id: string; readonly slot_number: number; readonly before: string; readonly after: string; readonly actor_hints?: readonly string[] }[];
  readonly targetImageCount: number;
  readonly imageCountConstraint: { readonly mode: string; readonly min: number; readonly max: number };
  readonly actorCandidates: readonly unknown[];
  readonly personaCandidates: readonly unknown[];
  readonly v5PersonaCatalogCandidates?: readonly unknown[];
  readonly v5OutfitCatalogCandidates?: readonly unknown[];
  readonly personaPromptKey?: string;
  readonly freeCharacterGenerationEnabled: boolean;
  readonly freeOutfitGenerationEnabled: boolean;
  readonly knownCharacterIdentities?: readonly { readonly name: string; readonly keys: readonly string[] }[];
  readonly replayGeneratedOutfits?: readonly unknown[];
  readonly rosterSelectionEnabled?: boolean;
  readonly splitAnalysis?: { readonly totalCount: number; readonly batchSize: number; readonly retries: number; readonly revision?: unknown };
  readonly [key: string]: unknown;
}

/** Split stage passed to the analyzer (`Bgt` → `Egt`). */
export interface V5SplitStage {
  readonly phase: "initial" | "detail";
  readonly plan?: unknown;
  readonly assignedSlots?: readonly number[];
  readonly validationFeedback?: string;
}

/** Input of `buildV5AnalyzerRequest`. */
export interface V5AnalyzerRequestInput {
  readonly context: V5AnalyzerContext;
  readonly continuitySnapshot?: V5ContinuitySnapshot | null;
  /** Analysis LLM config; `provider` "ollama_local" / "ollama_cloud" switches to the slot-map envelope. */
  readonly config?: { readonly provider?: string; readonly [key: string]: unknown };
  readonly userDirections?: V5UserDirections;
  readonly splitStage?: V5SplitStage;
  readonly runtime?: V5RuleRuntime;
}

/** Candidate bindings (`nbe` 116899). */
export interface V5CandidateBindings {
  readonly request: readonly unknown[];
  readonly response: readonly unknown[];
  readonly overlay: readonly unknown[];
  readonly activePersonaCandidateKey?: string;
  readonly sourceKeyByCandidateKey: Readonly<Record<string, string>>;
  readonly candidateKeyByHint: Readonly<Record<string, string>>;
  readonly outfitCatalog: readonly unknown[];
  readonly generatedOutfitCandidates: readonly unknown[];
  readonly outfitContinuity: readonly unknown[];
  readonly [key: string]: unknown;
}

/** Result of `buildV5AnalyzerRequest`. */
export interface V5AnalyzerRequestBuild {
  readonly runtime: V5RuleRuntime;
  readonly candidates: V5CandidateBindings;
  readonly imageCount: number | { readonly min: number; readonly max: number };
  readonly scene: { readonly scene: string; readonly slotHints?: Readonly<Record<string, readonly string[]>> };
  /** Context handed to `rt.buildAnalyzerRequest` (the `I` object of Egt). */
  readonly requestContext: Record<string, unknown>;
  readonly request: V5AnalyzerRequest;
  /** Structured output schema passed to `client.complete` (`structuredOutputSchema`). */
  readonly structuredOutputSchema: Record<string, unknown>;
  readonly slotNumbers: readonly number[];
}

/**
 * Build the V5 analyzer request for one message exactly as `Egt.run` does before the LLM call (no JEV roster pass).
 * Reads context fields: candidateSlots, targetImageCount, imageCountConstraint, actorCandidates, personaCandidates,
 * v5PersonaCatalogCandidates, v5OutfitCatalogCandidates, personaPromptKey, freeCharacterGenerationEnabled,
 * freeOutfitGenerationEnabled, knownCharacterIdentities, replayGeneratedOutfits.
 * Originals: `nbe` @116899, `Cgt` @117183, `Pgt` @117160, `_gt` @116748, `vN` @38066, `UDe` @43833, `qDe` @43870,
 * `XDe` @43965, `tMe` via `_re().buildAnalyzerRequest` @48543, `eje` @11083, `mgt`/`hgt`/`vgt` (split phases).
 */
export function buildV5AnalyzerRequest(input: V5AnalyzerRequestInput): V5AnalyzerRequestBuild {
  const runtime = input.runtime ?? getSharedV5RuleRuntime();
  const { context, splitStage } = input;
  const snapshot = input.continuitySnapshot ?? null;
  const userDirections = input.userDirections ?? {};
  const provider = input.config?.provider;
  const u = buildV5ActorCandidates(context, snapshot) as unknown as V5CandidateBindings;
  const slotMap = !splitStage && (provider === "ollama_local" || provider === "ollama_cloud");
  const m = resolveV5ImageCount(context) as V5AnalyzerRequestBuild["imageCount"];
  const h = buildV5SceneSlots(context, u.candidateKeyByHint) as V5AnalyzerRequestBuild["scene"];
  const y = buildLayoutContinuity(snapshot, u) as readonly unknown[];
  const v = createV5ContinuityBasis(snapshot);
  const w = buildActorModifierContinuity(v, u.response, runtime.catalog) as readonly unknown[];
  const x = buildSceneModifierContinuity(v, runtime.catalog) as unknown;
  const nl = buildNaturalLanguageContinuity(v, u.response, { excludePersona: userDirections.scenePresetId === "pov" }) as unknown;
  const requestContext: Record<string, unknown> = {
    freeCharacterGenerationEnabled: context.freeCharacterGenerationEnabled,
    freeOutfitGenerationEnabled: context.freeOutfitGenerationEnabled,
    knownCharacterIdentities: context.knownCharacterIdentities,
    scene: h.scene,
    imageCount: m,
    actorCandidates: u.request,
    actorCandidateOverlay: u.overlay,
    ...(u.activePersonaCandidateKey ? { activePersonaCandidateKey: u.activePersonaCandidateKey } : {}),
    outfitCatalog: u.outfitCatalog,
    generatedOutfitCandidates: u.generatedOutfitCandidates,
    outfitContinuity: u.outfitContinuity,
    ...(y.length ? { layoutContinuity: y } : {}),
    ...(w.length ? { actorModifierContinuity: w } : {}),
    ...(x ? { sceneModifierContinuity: x } : {}),
    ...(nl ? { naturalLanguageContinuity: nl } : {}),
    ...(h.slotHints ? { slotHints: h.slotHints } : {}),
    ...(slotMap ? { responseEnvelopeMode: "slot-map" } : {}),
  };
  const request = runtime.buildAnalyzerRequest(requestContext, userDirections as Record<string, unknown>);
  const slotNumbers =
    splitStage?.assignedSlots ?? (context.candidateSlots.length ? context.candidateSlots.map(({ slot_number }) => slot_number) : [0]);
  const schema = buildV5StructuredOutputSchema({
    slotNumbers,
    imageCount: splitStage?.assignedSlots?.length ?? m,
    requestPayload: splitStage?.phase === "detail" ? toDetailPhasePayload(request.payload, splitStage.plan) : request.payload,
  });
  const structuredOutputSchema =
    splitStage?.phase === "initial" ? toInitialPhaseSchema(schema) : splitStage?.phase === "detail" ? toDetailPhaseSchema(schema, splitStage.plan) : schema;
  return { runtime, candidates: u, imageCount: m, scene: h, requestContext, request, structuredOutputSchema, slotNumbers };
}

/** Revision prompt channel (`revision_request.current_prompt[]`). */
export interface V5RevisionPromptChannel {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly actorIndex?: number;
  readonly positive?: string;
  readonly negative?: string;
}

/** Chat message sent to the analysis LLM. */
export interface V5ChatMessage {
  readonly role: "system" | "user";
  readonly content: string | readonly unknown[];
}

/** Messages + cache partition (`abe` 117190). */
export interface V5AnalyzerMessages {
  readonly payload: Record<string, unknown>;
  readonly wirePayload: Record<string, unknown>;
  readonly messages: readonly V5ChatMessage[];
  readonly cachePartition: Record<string, unknown>;
}

/**
 * Render the analyzer messages: `[system, user(JSON wire payload [+ revision_request / split fields])]` and the
 * cache partition (app-static / config-static / character-static / outfit-static + live input).
 * @param request `build.request` (or `rt.buildAnalyzerRequest` result).
 * @param options.imageParts Image parts appended to the user message (revision images).
 * Original: `abe` (buildV5AnalyzerMessages) @117190.
 */
export function buildV5AnalyzerMessages(
  request: V5AnalyzerRequest,
  options: {
    readonly imageParts?: readonly unknown[];
    readonly revisionDirection?: string;
    readonly revisionPromptChannels?: readonly V5RevisionPromptChannel[];
    readonly splitStage?: V5SplitStage;
    readonly rosterSnapshot?: unknown;
    readonly rosterDetail?: boolean;
  } = {},
): V5AnalyzerMessages {
  return (coreBuildV5AnalyzerMessages as AnyFn)(
    request,
    options.imageParts ?? [],
    options.revisionDirection ?? "",
    options.revisionPromptChannels ?? [],
    options.splitStage,
    options.rosterSnapshot,
    options.rosterDetail ?? false,
  ) as V5AnalyzerMessages;
}

/** Compact wire payload (`KE` toV5AnalyzerWirePayload @28901). */
export function toV5WirePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return toV5AnalyzerWirePayload(payload) as Record<string, unknown>;
}

/** Structured output JSON schema (`eje` @11083). */
export function buildV5ResponseSchema(input: { slotNumbers: readonly number[]; imageCount: unknown; requestPayload: unknown }): Record<string, unknown> {
  return buildV5StructuredOutputSchema(input) as Record<string, unknown>;
}

/** System instruction text from instruction modules (`nX` @6244) and the module builder (`rX` @6207). */
export function renderV5AnalyzerSystemInstruction(modules: unknown): string {
  return coreRenderV5AnalyzerSystemInstruction(modules) as string;
}
export function buildV5InstructionModules(input: unknown): unknown {
  return coreBuildV5InstructionModules(input);
}

/* ------------------------------------------------------------------------------------------------ recovery */

/**
 * Recover a raw analyzer response (string or object) against a request build, with the same arguments `Egt` uses:
 * candidates, enabled modifier refs, source scene, local recovery, slot hints, requested slot numbers.
 * @param options.mode "complete-from-request" (normal) or "preserve-response-membership" (split / revision).
 * Original: `_re().recoverAnalyzerResponse` → `KRe` @28260 (`nje` envelope + `FRe` normalisation).
 */
export function recoverV5AnalyzerResponse(
  response: unknown,
  build: V5AnalyzerRequestBuild,
  options: { readonly mode?: V5RecoveryMode; readonly freeCharacterGenerationEnabled?: boolean } = {},
): V5RecoveredResponse {
  return build.runtime.recoverAnalyzerResponse(
    response,
    build.candidates.response,
    build.request.enabledModifierRefs,
    build.request.payload.scene,
    build.request.localRecovery,
    build.request.payload.slot_hints,
    build.slotNumbers,
    options.mode ?? "complete-from-request",
    options.freeCharacterGenerationEnabled ?? build.requestContext.freeCharacterGenerationEnabled === true,
  );
}

/* ------------------------------------------------------------------------------------------------ analyzer run */

/** Options passed to `client.complete` by the analyzer. */
export interface V5CompleteOptions {
  readonly purpose: "image-generation";
  readonly signal?: AbortSignal;
  readonly onRequestProgress?: (progress: unknown) => void;
  readonly beforeRequest?: () => void;
  readonly cachePartition: Record<string, unknown>;
  readonly cacheSourceId: string;
  readonly structuredOutputSchema: Record<string, unknown>;
  readonly diagnostic: { readonly sessionId?: string; readonly analysisKind: string; readonly phase: string };
}

/** LLM client contract used by the analyzer (`e.complete(config, messages, options)`). */
export interface V5AnalyzerClient {
  complete(
    config: Readonly<Record<string, unknown>>,
    messages: readonly V5ChatMessage[],
    options: V5CompleteOptions,
  ): Promise<{ readonly raw?: string; readonly parsed?: unknown; readonly transportDiagnostic?: unknown; readonly [key: string]: unknown }>;
}

/** Analyzer result (`Egt.run` return, 117690-117703). */
export interface V5AnalyzerResult {
  readonly profile: "v5-hybrid";
  readonly response: V5RecoveredResponse;
  readonly attempts: number;
  readonly resumedFromCheckpoint: boolean;
  readonly candidateBindings: readonly unknown[];
  readonly candidateSourceKeys: Readonly<Record<string, string>>;
  readonly requestPayload: Record<string, unknown>;
  readonly localProjection: V5AnalyzerRequest["localProjection"];
  readonly catalogFingerprint: string;
  readonly splitPlan?: unknown;
  readonly cacheNotice?: unknown;
  readonly transportDiagnostic?: unknown;
}

/** Input of `analyzer.run` (fields read by `Egt.run`). */
export interface V5AnalyzerRunInput {
  readonly context: V5AnalyzerContext;
  readonly config: Readonly<Record<string, unknown>>;
  readonly continuitySnapshot?: V5ContinuitySnapshot | null;
  readonly userDirections?: V5UserDirections;
  readonly checkpointContext: { readonly chatKey: string; readonly messageId: string; readonly pendingKey?: string };
  readonly checkpointPolicy?: "restart-analysis" | "reuse-plan" | "resume" | string;
  readonly imageParts?: readonly unknown[];
  readonly revisionDirection?: string;
  readonly revisionPromptChannels?: readonly V5RevisionPromptChannel[];
  readonly revisionEvidenceKey?: string;
  readonly splitStage?: V5SplitStage;
  readonly signal?: AbortSignal;
  readonly beforeRequest?: () => void;
  readonly onEvent?: (event: { kind: string; detail?: unknown }) => void;
  readonly diagnostic?: { readonly sessionId?: string; readonly analysisKind?: string };
  readonly [key: string]: unknown;
}

/** The V5 analyzer (`Egt`). */
export interface V5Analyzer {
  readonly runtime: V5RuleRuntime;
  captureSelectionSettings(): unknown;
  run(input: V5AnalyzerRunInput): Promise<V5AnalyzerResult>;
}

/**
 * Create the V5 analyzer over an LLM client. Throws `NovelAIV5AnalyzerResultError`
 * (code `V5_ANALYZER_NO_USABLE_ILLUSTRATION`, `diagnostics`) when nothing usable is recovered.
 * The JEV roster pre-pass is disabled (no JEV dependencies are passed); with `rosterSelectionEnabled` the run
 * fails with `JEV_UNAVAILABLE`, as in Asset Maid without a JEV connection.
 * Original: `Egt` (createV5Analyzer) @117357.
 */
export function createV5Analyzer(client: V5AnalyzerClient, runtime?: V5RuleRuntime): V5Analyzer {
  return (coreCreateV5Analyzer as AnyFn)(client, runtime ?? undefined) as V5Analyzer;
}

/* ------------------------------------------------------------------------------------------------ split analysis */

/**
 * Batch sizes for split analysis: `r = max(1, floor(total/min(batch,7)), ceil(total/7))` batches, sizes as even
 * as possible. Throws for non-positive inputs. Original: `Dgt` @118145.
 */
export function planV5SplitBatches(totalCount: number, batchSize: number): number[] {
  return planSplitBatchSizes(totalCount, batchSize) as number[];
}

/** System instruction of a split phase ("initial" | "detail"). Original: `wgt` @116617. */
export function renderV5SplitPhaseSystemInstruction(request: V5AnalyzerRequest, phase: "initial" | "detail"): string {
  return coreRenderV5SplitPhaseSystemInstruction(request, phase) as string;
}

/** Split runner (`Bgt`): initial call → preparation callback → parallel detail batches. */
export interface V5SplitAnalysisRunner {
  dispose(): void;
  run(
    input: V5AnalyzerRunInput,
    prepare: (initial: V5AnalyzerResult, cached: <T>(key: string, compute: () => Promise<T>) => Promise<T>) => Promise<unknown>,
    onStage?: (completed: number, total: number, label: string) => void,
    onProgress?: (progress: { phase: string; steps: readonly Record<string, unknown>[] }) => void,
    control?: { ready?: (batch: unknown) => void; stop?: () => void; drain?: () => Promise<void>; requireRetainedPlan?: boolean },
  ): Promise<{ prepared: unknown; result: V5AnalyzerResult }>;
}

/**
 * Create the split-analysis runner over an analyzer (`run` is called with `splitStage`), so a fake analyzer can
 * drive it. `onResumeState(responseKey, message)` receives resume hints. Original: `Bgt` @118287.
 */
export function createV5SplitAnalysisRunner(
  analyzer: Pick<V5Analyzer, "run"> & { readonly runtime?: { readonly catalogFingerprint?: string }; captureSelectionSettings?: () => unknown },
  onResumeState?: (responseKey: string, message: string) => void,
): V5SplitAnalysisRunner {
  return coreCreateV5SplitAnalysisRunner(analyzer, onResumeState) as V5SplitAnalysisRunner;
}
