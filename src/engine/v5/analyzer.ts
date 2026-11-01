/**
 * NovelAI V5 analyzer: directing modes (user directions), request building, messages / cache partition,
 * structured output schema, response recovery, the analyzer run (`Egt`) over an injected LLM client, and the
 * split-analysis helpers.
 *
 * `buildV5AnalyzerRequest` composes the verbatim core builders in the same order as `c0e.run` (0.9.90 @161195):
 * `o0e` → `kbt` → `wbt` → continuity projections (`hbt`, `BE`, `V3e`, `W3e`, `J3e`, `Fre`, `q3e`) →
 * `rt.buildAnalyzerRequest` (`p3e`) → `qOe` schema (+ split `sbt` / `lbt` / `pbt`). Parity with the messages that
 * `c0e` actually sends is tested.
 */
import {
  buildV5ActorCandidates,
  resolveV5ImageCount,
  buildV5SceneSlots,
  hbt as buildLayoutContinuity,
  createV5ContinuityBasis,
  V3e as buildActorModifierContinuity,
  W3e as buildSceneModifierContinuity,
  J3e as buildInteractionModifierContinuity,
  Fre as buildNaturalLanguageContinuity,
  q3e as buildReferenceExclusions,
  buildV5StructuredOutputSchema,
  sbt as toInitialPhaseSchema,
  lbt as toDetailPhaseSchema,
  pbt as toDetailPhasePayload,
  buildV5AnalyzerMessages as coreBuildV5AnalyzerMessages,
  toV5AnalyzerWirePayload,
  resolveV5UserDirections as coreResolveV5UserDirections,
  createDefaultV5UserDirectionSettings,
  selectV5DirectionPreset as coreSelectV5DirectionPreset,
  NOVELAI_V5_RAW_CONFIG,
  createDefaultAnalysisDocument as coreCreateDefaultAnalysisDocument,
  resolveStoredAnalysisDocument as coreResolveStoredAnalysisDocument,
  resolveAnalysisDocument as coreResolveAnalysisDocument,
  validateAnalysisDocument as coreValidateAnalysisDocument,
  resolveAnalysisExecution as coreResolveAnalysisExecution,
  resolveAnalysisDirections as coreResolveAnalysisDirections,
  assertDirectingRules as coreAssertDirectingRules,
  applyAnalysisToRunInput as coreApplyAnalysisToRunInput,
  createV5Analyzer as coreCreateV5Analyzer,
  createV5SplitAnalysisRunner as coreCreateV5SplitAnalysisRunner,
  renderV5SplitPhaseSystemInstruction as coreRenderV5SplitPhaseSystemInstruction,
  renderV5AnalyzerSystemInstruction as coreRenderV5AnalyzerSystemInstruction,
  buildV5InstructionModules as coreBuildV5InstructionModules,
  Rbt as planSplitBatchSizes,
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

/** Resolved user directions handed to the analyzer request (`Kbt` @162561). */
export interface V5UserDirections {
  readonly freeGenerationInstructions?: Readonly<Record<string, unknown>>;
  readonly freeGenerationDesignInstructions?: Readonly<Record<string, unknown>>;
  /** System execution settings of the directing document (`fAe`), rendered as the analyzer system direction. */
  readonly systemExecution?: unknown;
  readonly customInstruction?: string;
  readonly scenePresetId?: string;
  readonly scenePresetControlOverrides?: Readonly<Record<string, boolean | number>>;
  readonly sceneDirection?: string;
  readonly sceneDirectionSource?: "preset" | "supplemental";
  readonly imageRatioDirection?: unknown;
  /** Size ids the analyzer may choose (presets 1..5, custom sizes >= 1e9). Not set for the comic preset. */
  readonly imageRatioAllowedSizeIds?: readonly number[];
  readonly imageRatioCustomSizes?: readonly { readonly id: number; readonly sizeId: number; readonly width: number; readonly height: number }[];
}

/**
 * Built-in analysis presets: scene default/pov/ensemble/comic, image ratio default/unspecified. In 0.9.90 they are
 * inline in the raw config (`Gl.analysisPresets`); read-only.
 */
export const V5_ANALYSIS_PRESETS = (NOVELAI_V5_RAW_CONFIG as { analysisPresets: unknown }).analysisPresets as Readonly<Record<string, unknown>>;

/**
 * Default legacy `novelai.v5UserDirections` settings (scene-default + image-ratio-default). 0.9.90 reads them only as the
 * fallback when no directing document is stored. Original: `CV` @2771.
 */
export function createDefaultV5DirectionSettings(): V5DirectionSettings {
  return createDefaultV5UserDirectionSettings() as V5DirectionSettings;
}

/**
 * Select a preset in a direction list (falls back to the first preset). Original: `Hv` (selectV5DirectionPreset) @2760.
 */
export function selectV5DirectionPreset(list: Partial<V5DirectionList>, presetId: string | undefined, mode: string = "preset"): V5DirectionList {
  return coreSelectV5DirectionPreset(list, presetId, mode) as V5DirectionList;
}

/**
 * Resolve the analyzer user directions from the run input (`novelAIConfig.v5UserDirections`, which 0.9.90 fills from
 * the directing document via `applyAnalysisToRunInput`). Outside the comic preset it also sets
 * `imageRatioAllowedSizeIds` (the fixed `requestedSize` id, else the selected ratio preset's `allowedSizeIds`) and
 * `imageRatioCustomSizes` (allowed custom sizes from `customImageSizes` + a custom `requestedSize`). Copies
 * `freeGenerationInstructions`, `freeGenerationDesignInstructions` and `systemExecution`.
 * Original: `Kbt` (resolveV5UserDirections) @162561.
 */
export function resolveV5UserDirections(input: {
  readonly novelAIConfig: { readonly v5UserDirections?: V5DirectionSettings | unknown };
  readonly requestedSizeId?: number;
  readonly requestedSize?: { readonly id: number; readonly width: number; readonly height: number };
  readonly customImageSizes?: readonly unknown[];
}): V5UserDirections {
  return coreResolveV5UserDirections(input) as V5UserDirections;
}

/** `resolveV5UserDirections({novelAIConfig: {v5UserDirections: settings}})`. */
export function resolveV5Directions(settings: V5DirectionSettings | undefined): V5UserDirections {
  return resolveV5UserDirections({ novelAIConfig: { v5UserDirections: settings } });
}

/* ----------------------------------------------------------------------------------- directing document (0.9.90) */

/**
 * Directing document: `{migration, scene: {selected, items}, imageRatio: {selected, items}}`. It lives in
 * `config.runtime.instructionChanges` as a diff over the default document, merged with the active Atelier preset's
 * `analysis.scene.rules`. Shape is owned by the core; typed loosely here.
 */
export type V5AnalysisDocument = {
  readonly scene: { readonly selected: string; readonly items: Readonly<Record<string, unknown>> };
  readonly imageRatio: { readonly selected: string; readonly items: Readonly<Record<string, unknown>> };
  readonly [key: string]: unknown;
};

/** Analysis execution settings (`qv`): `{execution: {mode: "default"|"comic", resolution, aiCoordinates, ...}, customSizes}`. */
export type V5AnalysisExecution = { readonly execution: { readonly mode: string; readonly [key: string]: unknown }; readonly customSizes: readonly unknown[] };

/** `{directions, customSizes, execution}` resolved from the config (`yAe`), the `analysis` of a prepared run. */
export interface V5ResolvedAnalysis {
  readonly directions: Readonly<Record<string, unknown>>;
  readonly customSizes: readonly unknown[];
  readonly execution: V5AnalysisExecution["execution"];
}

/** The built-in default directing document. Original: `L0` (createDefaultAnalysisDocument) @4393. */
export function createDefaultAnalysisDocument(): V5AnalysisDocument {
  return coreCreateDefaultAnalysisDocument() as V5AnalysisDocument;
}

/** Stored directing document of a config (default + `runtime.instructionChanges`). Original: `w8` @4136. */
export function resolveStoredAnalysisDocument(config: unknown): V5AnalysisDocument {
  return coreResolveStoredAnalysisDocument(config) as V5AnalysisDocument;
}

/** Effective directing document (stored + active preset's scene rules). Original: `zc` (resolveAnalysisDocument) @4147. */
export function resolveAnalysisDocument(config: unknown): V5AnalysisDocument {
  return coreResolveAnalysisDocument(config, undefined) as V5AnalysisDocument;
}

/** Validate a directing document; throws on invalid input. Original: `mC` (validateAnalysisDocument) @3605. */
export function validateAnalysisDocument(document: unknown): unknown {
  return coreValidateAnalysisDocument(document);
}

/** Analysis execution settings of a config. Original: `qv` (resolveAnalysisExecution) @3534. */
export function resolveAnalysisExecution(config: unknown): V5AnalysisExecution {
  return coreResolveAnalysisExecution(config) as V5AnalysisExecution;
}

/** Analyzer directions resolved from a config. Original: `yAe` (resolveAnalysisDirections) @3741. */
export function resolveAnalysisDirections(config: unknown): V5ResolvedAnalysis {
  return coreResolveAnalysisDirections(config) as V5ResolvedAnalysis;
}

/**
 * Check the directing rules of a document against a compiled catalog (throws Korean errors).
 * Original: `C8` (assertDirectingRules) @4466.
 */
export function assertDirectingRules(document: unknown, catalog: unknown, selected?: unknown): void {
  (coreAssertDirectingRules as AnyFn)(document, catalog, selected);
}

/**
 * Apply a resolved analysis to an orchestrator run input: `novelAIConfig.v5UserDirections = analysis.directions`,
 * `customImageSizes`, `forceAiChoiceCoordinates`, `requestedSize[Id]` from the execution resolution (not for comic).
 * Original: `qbt` (applyAnalysisToRunInput) @162696.
 */
export function applyAnalysisToRunInput<T extends object>(runInput: T, analysis: V5ResolvedAnalysis | undefined): T {
  return (coreApplyAnalysisToRunInput as AnyFn)(runInput, analysis) as T;
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
  /** Forwarded to the request context; 0.9.90's chat flow no longer fills it (known identities were removed). */
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

/** Candidate bindings (`o0e`). */
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

/**
 * Candidate bindings of one analyzer context, as `buildV5AnalyzerRequest` builds them. Each `response` entry maps a wire
 * `candidateKey` to its source key (`identityReferences[0]`) and lists `appearanceForms[{formRef, formId, outfits[{outfitRef,
 * outfitId}]}]`, where `outfitRef` is the outfit id the analyzer sees. Original: `o0e` (buildV5ActorCandidates).
 */
export function buildV5CandidateBindings(context: V5AnalyzerContext, continuitySnapshot?: V5ContinuitySnapshot | null): V5CandidateBindings {
  return buildV5ActorCandidates(context, continuitySnapshot ?? null) as unknown as V5CandidateBindings;
}

/** Result of `buildV5AnalyzerRequest`. */
export interface V5AnalyzerRequestBuild {
  readonly runtime: V5RuleRuntime;
  readonly candidates: V5CandidateBindings;
  readonly imageCount: number | { readonly min: number; readonly max: number };
  readonly scene: { readonly scene: string; readonly slotHints?: Readonly<Record<string, readonly string[]>> };
  /** Context handed to `rt.buildAnalyzerRequest` (the `A` object of `c0e.run`). */
  readonly requestContext: Record<string, unknown>;
  readonly request: V5AnalyzerRequest;
  /** Structured output schema passed to `client.complete` (`structuredOutputSchema`). */
  readonly structuredOutputSchema: Record<string, unknown>;
  readonly slotNumbers: readonly number[];
}

/**
 * Build the V5 analyzer request for one message exactly as `c0e.run` does before the LLM call (no JEV roster pass).
 * Reads context fields: candidateSlots, targetImageCount, imageCountConstraint, actorCandidates, personaCandidates,
 * v5PersonaCatalogCandidates, v5OutfitCatalogCandidates, personaPromptKey, freeCharacterGenerationEnabled,
 * freeOutfitGenerationEnabled, knownCharacterIdentities, replayGeneratedOutfits.
 * Originals: `o0e`, `kbt`, `wbt`, `hbt`, `BE`, `V3e`, `W3e`, `J3e`, `Fre`, `q3e`, `Hne().buildAnalyzerRequest` (`p3e`),
 * `qOe`, `sbt`/`lbt`/`pbt` (split phases).
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
  const im = buildInteractionModifierContinuity(v, u.response, runtime.catalog) as readonly unknown[];
  const nl = buildNaturalLanguageContinuity(v, u.response) as unknown;
  const requestContext: Record<string, unknown> = {
    referenceExclusions: buildReferenceExclusions(v, u.response, runtime.catalog),
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
    ...(im.length ? { interactionModifierContinuity: im } : {}),
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

/** Messages + cache partition (`s0e`). */
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
 * Original: `s0e` (buildV5AnalyzerMessages) @161028.
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

/** Compact wire payload (`KE` toV5AnalyzerWirePayload). */
export function toV5WirePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return toV5AnalyzerWirePayload(payload) as Record<string, unknown>;
}

/** Structured output JSON schema (`qOe`). */
export function buildV5ResponseSchema(input: { slotNumbers: readonly number[]; imageCount: unknown; requestPayload: unknown }): Record<string, unknown> {
  return buildV5StructuredOutputSchema(input) as Record<string, unknown>;
}

/** System instruction text from instruction modules (`uZ`) and the module builder (`dZ`). */
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
 * Original: `Hne().recoverAnalyzerResponse` → `ZTe` (recoverV5AnalyzerResponseCore); `systemDirection` from the
 * local recovery is copied onto every illustration.
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

/** Analyzer result (`c0e.run` return). */
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

/** Input of `analyzer.run` (fields read by `c0e.run`). */
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

/** The V5 analyzer (`c0e`). */
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
 * Original: `c0e` (createV5Analyzer) @161195.
 */
export function createV5Analyzer(client: V5AnalyzerClient, runtime?: V5RuleRuntime, jev?: unknown): V5Analyzer {
  return (coreCreateV5Analyzer as AnyFn)(client, runtime ?? undefined, jev) as V5Analyzer;
}

/* ------------------------------------------------------------------------------------------------ split analysis */

/**
 * Batch sizes for split analysis: `r = max(1, floor(total/min(batch,10)), ceil(total/10))` batches (at most 4096), sizes
 * as even as possible. Throws for non-positive inputs. Original: `Rbt` @162062.
 */
export function planV5SplitBatches(totalCount: number, batchSize: number): number[] {
  return planSplitBatchSizes(totalCount, batchSize) as number[];
}

/** System instruction of a split phase ("initial" | "detail"). Original: `mbt` @160391. */
export function renderV5SplitPhaseSystemInstruction(request: V5AnalyzerRequest, phase: "initial" | "detail"): string {
  return coreRenderV5SplitPhaseSystemInstruction(request, phase) as string;
}

/** Split runner (`Lbt`): initial call → preparation callback → parallel detail batches. */
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
 * drive it. `onResumeState(responseKey, message)` receives resume hints. Original: `Lbt` @162200.
 */
export function createV5SplitAnalysisRunner(
  analyzer: Pick<V5Analyzer, "run"> & { readonly runtime?: { readonly catalogFingerprint?: string }; captureSelectionSettings?: () => unknown },
  onResumeState?: (responseKey: string, message: string) => void,
): V5SplitAnalysisRunner {
  return coreCreateV5SplitAnalysisRunner(analyzer, onResumeState) as V5SplitAnalysisRunner;
}
