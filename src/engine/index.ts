/**
 * Inlay Illustrator engine: a faithful port of Asset Maid 0.9.88's pure core (no host calls).
 *
 * Layout (see README.md):
 * - core/      GENERATED verbatim slice of the original bundle + injectable clock/RNG (env.ts).
 * - engine.ts  createAssetMaidEngine(): the original boot object graph with injected analyzer client + image providers.
 * - context/   analyzer context building (MAt) from config, characters, personas, chat.
 * - v5/        NovelAI V5 ("v5-hybrid"): raw config, catalog, rule runtime, analyzer request/recovery, composition.
 * - v45/       NovelAI V4.5 ("v4-5"): catalog, staged analyzer, composition.
 * - compose/   prompt plans, provider prompt codecs (novelai-structured / anima-flat), weights, NSFW, coordinates, size/count/seed.
 * - continuity/ visual continuity apply/update/checkpoints/storage adapter.
 * - text/      paragraph slots, native markup detection, lenient JSON.
 *
 * Every area is also exported as a namespace (`v5`, `v45`, ...) with its full typed API.
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
} from "./engine";

// Deterministic clock / RNG injection.
export { setEngineEnv, withEngineEnv, getEngineEnv, defaultEngineEnv, type EngineEnvSource } from "./core/env";

// Full area APIs.
export * as context from "./context";
export * as v5 from "./v5";
export * as v45 from "./v45";
export * as compose from "./compose";
export * as continuity from "./continuity";
export * as text from "./text";

// Convenience re-exports of the most used entry points.
/** Analyzer context (MAt) + analyzerInput assembly (E1t glue). */
export { buildAnalyzerContextInputs, assembleAnalyzerInput } from "./context";
/** V5: analyzer request (Egt pre-call), messages (abe), recovery (KRe), post-analysis composition (Ygt). */
export { buildV5AnalyzerRequest, buildV5AnalyzerMessages, recoverV5AnalyzerResponse, composeV5Images } from "./v5";
/** V4.5: request JSON ($et / qet), messages (BQe / KQe), composition (Tht). */
export {
  buildV45SingleStageRequest,
  buildV45PresetSelectionRequest,
  buildV45IllustrationMessages,
  buildV45StageMessages,
  composeV45Images,
  planV45Images,
} from "./v45";
/** Provider prompt codecs and policies. */
export {
  formatProviderPrompt,
  applyNsfwPrefixPolicy,
  createV45NovelAIConfig,
  normalizeImageCountPolicy,
  resolveImageCountConstraint,
  resolveImageSize,
} from "./compose";
/** Visual continuity. */
export {
  applyVisualContinuityToPlan,
  updateVisualContinuity,
  computeDeferredVisualContinuity,
  createEmptyContinuityState,
  reconcileContinuityCheckpoints,
  readContinuityFromChat,
  writeContinuityToChat,
} from "./continuity";
/** Text helpers. */
export { splitParagraphSlots, buildIllustrationSlots, illustrationSlotId, parseLenientJson } from "./text";
