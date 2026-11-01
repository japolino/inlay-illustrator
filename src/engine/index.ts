/**
 * Inlay Illustrator engine: a faithful port of Asset Maid 0.9.90's pure core (no host calls).
 *
 * Layout (see README.md):
 * - core/      GENERATED verbatim slice of the original bundle + injectable clock/RNG (env.ts).
 * - engine.ts  createAssetMaidEngine(): the original boot object graph with injected analyzer client + image providers.
 * - context/   analyzer context building (`gxt`) from config, characters, personas, chat.
 * - v5/        NovelAI V5 ("v5-hybrid"): raw config, catalog, Maid Atelier presets, directing document, rule runtime,
 *              analyzer request/recovery, composition.
 * - compose/   provider prompt codecs (novelai / anima-flat), weights, fixed rating, coordinates, size/count/seed,
 *              batch executor and retry records.
 * - continuity/ V5 continuity state, checkpoints, chat-store adapter.
 * - text/      paragraph slots, native markup detection, lenient JSON.
 *
 * Every area is also exported as a namespace (`v5`, `compose`, ...) with its full typed API. 0.9.90 removed V4.5, so
 * there is no `v45` namespace any more.
 */

// Engine factory (main entry point for the backend).
export {
  createAssetMaidEngine,
  type AssetMaidEngine,
  type AssetMaidEngineOptions,
  type AnalyzerClient,
  type AnalyzerMessage,
  type ImageProviderAdapter,
  type ImageProviderId,
  type ComfyUIReferencePreparer,
  type OrchestratorRunInputLike,
  type OrchestratorRunResult,
  type PreparedAnalysis,
  type ActiveAtelierPresetState,
} from "./engine";

// Deterministic clock / RNG injection.
export { setEngineEnv, withEngineEnv, getEngineEnv, defaultEngineEnv, type EngineEnvSource } from "./core/env";

// Full area APIs.
export * as context from "./context";
export * as v5 from "./v5";
export * as compose from "./compose";
export * as continuity from "./continuity";
export * as text from "./text";

// Convenience re-exports of the most used entry points.
/** Analyzer context (`gxt`) + analyzerInput assembly (`Vxt` glue). */
export { buildAnalyzerContextInputs, assembleAnalyzerInput } from "./context";
/** V5: analyzer request (`c0e` pre-call), messages (`s0e`), recovery (`ZTe`), post-analysis composition (`Ubt`). */
export {
  buildV5AnalyzerRequest,
  buildV5AnalyzerMessages,
  recoverV5AnalyzerResponse,
  composeV5Images,
  compileAtelierPreset,
  compileActiveAtelierPresetCatalog,
  resolveAnalysisDirections,
} from "./v5";
/** Provider prompt codecs and policies. */
export {
  formatProviderPrompt,
  applyRatingPolicy,
  prependRatingTag,
  resolveFixedRating,
  normalizeImageCountPolicy,
  resolveImageCountConstraint,
  resolveImageSize,
  retryErrorRecord,
  appendRetryError,
} from "./compose";
/** Visual continuity. */
export {
  createEmptyContinuityState,
  getLatestContinuityCheckpointSnapshot,
  persistV5ContinuityState,
  rebuildContinuityAtMessage,
  commitContinuityCheckpoint,
} from "./continuity";
/** Text helpers. */
export { splitParagraphSlots, buildIllustrationSlots, illustrationSlotId, parseLenientJson } from "./text";
