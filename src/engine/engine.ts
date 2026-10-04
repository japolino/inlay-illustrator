/**
 * Engine factory: the same object graph Asset Maid 0.9.88 wires at boot (LOt, pretty lines 180714-180783),
 * minus the RisuAI-specific transports. Every host effect is injected:
 *
 *   ke = catalogSource.resolve(rawCatalogJson)          hlt  105876   (default rule-IR runtime or a custom V4.5 raw catalog)
 *   Ne = createPromptCompiler(ruleRuntime | catalog, Ns) pyt  119794
 *   ge = createV45AnalyzerEngine(catalog, Ns, {ruleRuntime})  Ttt
 *   ot = createV45AnalyzerRunner(ge, analyzerClient, {onDiagnostic})  VQe 82079
 *   Ie = createGenerationSessions()                      nht  113736
 *   ye = createImageGenerationDispatcher(providers, createProviderQueues({getIntervalMs}), getRetryCount)  Iyt 120220
 *   nt = createGenerationBatchExecutor(ye, Ie, comfyUIReferences)   lht 113992
 *   Ze = createV45Orchestrator(ot, Ne, Ie, nt)           Tht  114878
 *   st = createV5Orchestrator(createV5Analyzer(analyzerClient), Ie, nt, undefined, {onSplitResumeState})  Ygt/Egt
 *   Ct = createProfileOrchestrator({v45: Ze, v5: st, resolveProfile})   Lht 115023
 *
 * Dropped from the original wiring: the NovelAI HTTP client + its queue (xAt/Pyt/kyt), Chan Server (jft), ComfyUI
 * transport (rmt/Rft) and the JEV "TypeSafe" roster pre-pass network (Egt 3rd argument). The backend supplies
 * provider adapters with the dispatcher contract instead (see README "Image providers").
 */
import {
  createCatalogSourceResolver,
  createPromptCompiler,
  createV45AnalyzerEngine,
  createV45AnalyzerRunner,
  createGenerationSessions,
  createImageGenerationDispatcher,
  createProviderQueues,
  createGenerationBatchExecutor,
  createV45Orchestrator,
  createV5Orchestrator,
  createV5Analyzer,
  createProfileOrchestrator,
  NOVELAI_DEFAULTS,
} from "./core/asset-maid-core";

/** Analyzer LLM message as built by the analyzer layouts (abe / KQe / BQe). */
export interface AnalyzerMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * The analyzer transport (`C = nP(network, storage)` in the original; `CQe(...).complete`, spec/llm.md §1.4).
 * Must resolve `{ raw, parsed }` where `parsed = options.responseMode === "text" ? raw : parseLenientJson(raw)`
 * and throw an error with `code` (ANALYZER_JSON_PARSE, ANALYZER_EMPTY_RESPONSE, ANALYZER_REFUSAL, ...) on failure.
 */
export interface AnalyzerClient {
  complete(
    config: Record<string, unknown>,
    messages: AnalyzerMessage[],
    options?: Record<string, unknown>,
  ): Promise<{ raw: string; parsed: unknown; [key: string]: unknown }>;
}

export type ImageProviderId = "novelai" | "chan-server" | "comfy-ui";

/** Provider adapter registered in the dispatcher (`Iyt({novelai, "chan-server", "comfy-ui"})`). */
export interface ImageProviderAdapter {
  provider: ImageProviderId;
  /** true: the adapter queues requests itself (original NovelAI client); false/undefined: dispatcher FIFO per queueScopeKey. */
  serializesRequests?: boolean;
  generate(
    request: Record<string, unknown> & { provider: ImageProviderId },
    options?: { signal?: AbortSignal; onEvent?: (event: Record<string, unknown>) => void; [key: string]: unknown },
  ): Promise<Record<string, unknown> & { provider: ImageProviderId }>;
  dispose?(reason?: string): void;
}

/** ComfyUI reference preparation (`yt = smt(assetReader, referenceCrops)`): returns image bytes for a reference asset. */
export interface ComfyUIReferencePreparer {
  prepare(
    reference: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<{ bytes: Uint8Array; mimeType: string; extension: string }>;
}

export interface AssetMaidEngineOptions {
  analyzerClient: AnalyzerClient;
  imageProviders: Partial<Record<ImageProviderId, ImageProviderAdapter>>;
  comfyUIReferences?: ComfyUIReferencePreparer;
  /** runtime.generationAutoRetryCount (default 5, clamped 0..10 by the dispatcher). */
  getRetryCount?: () => number;
  /** runtime.novelaiParallelIntervalSec * 1000 (min gap between jobs of one queue). */
  getIntervalMs?: () => number;
  /** config.novelai.presetCatalog.rawJson: "" = built-in rule-IR catalog; otherwise a custom V4.5 raw catalog JSON. */
  rawCatalogJson?: string;
  onAnalyzerDiagnostic?: (event: { event: string; detail?: unknown; [key: string]: unknown }) => void;
  onSplitResumeState?: (key: unknown, state: unknown) => void;
  /** Profile switch; default: `input.novelAIConfig.analysisProfile === "v5-hybrid" ? "v5-hybrid" : "v4-5"`. */
  resolveProfile?: (input: OrchestratorRunInputLike) => "v4-5" | "v5-hybrid";
}

/** Minimal structural view of `OrchestratorRunInput` (spec/pipeline.md §3.2). The full shape is documented in README.md. */
export interface OrchestratorRunInputLike {
  generationType: string;
  sessionContext: Record<string, unknown>;
  novelAIConfig: Record<string, unknown> & { analysisProfile?: string };
  analyzerInput: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OrchestratorRunResult {
  session: Record<string, unknown>;
  analyzer: unknown;
  continuity: unknown;
  images: Array<Record<string, unknown>>;
}

export interface AssetMaidEngine {
  /** Analyze + compose + generate one message (Lht.run). */
  run(input: OrchestratorRunInputLike): Promise<OrchestratorRunResult>;
  cancel(session: unknown, reason?: string): boolean;
  /** Raw building blocks (verbatim core objects). */
  readonly parts: {
    catalogSource: ReturnType<typeof createCatalogSourceResolver>;
    catalogState: { catalog: unknown; source: "default" | "custom" | string; warning: string; ruleRuntime: unknown };
    promptCompiler: unknown;
    v45AnalyzerEngine: unknown;
    v45Analyzer: unknown;
    v5Analyzer: unknown;
    sessions: unknown;
    dispatcher: unknown;
    executor: unknown;
    v45: unknown;
    v5: unknown;
  };
  dispose(): void;
}

export function createAssetMaidEngine(options: AssetMaidEngineOptions): AssetMaidEngine {
  const catalogSource = createCatalogSourceResolver();
  const catalogState = catalogSource.resolve(options.rawCatalogJson ?? "");
  const ruleRuntime = catalogState.ruleRuntime;
  const promptCompiler = createPromptCompiler(catalogState.source === "default" ? ruleRuntime : catalogState.catalog, NOVELAI_DEFAULTS);
  const v45AnalyzerEngine = createV45AnalyzerEngine(catalogState.catalog, NOVELAI_DEFAULTS, {
    ...(ruleRuntime ? { ruleRuntime } : {}),
  });
  const v45Analyzer = createV45AnalyzerRunner(v45AnalyzerEngine, options.analyzerClient, {
    onDiagnostic(event: { event: string; detail?: unknown }) {
      options.onAnalyzerDiagnostic?.(event);
    },
  });
  const sessions = createGenerationSessions();
  const getIntervalMs = options.getIntervalMs ?? (() => 0);
  const dispatcher = createImageGenerationDispatcher(
    { ...options.imageProviders },
    createProviderQueues({ getIntervalMs }),
    options.getRetryCount ?? (() => 5),
  );
  const executor = createGenerationBatchExecutor(dispatcher, sessions, options.comfyUIReferences);
  const v45 = createV45Orchestrator(v45Analyzer, promptCompiler, sessions, executor);
  // Egt(C, void 0, {network, getConfig}) in the original: default rule runtime, JEV pre-pass disabled (no connection).
  const v5Analyzer = createV5Analyzer(options.analyzerClient, undefined, undefined);
  const v5 = createV5Orchestrator(v5Analyzer, sessions, executor, undefined, {
    onSplitResumeState: (key: unknown, state: unknown) => options.onSplitResumeState?.(key, state),
  });
  const orchestrator = createProfileOrchestrator({
    v45,
    v5,
    resolveProfile:
      options.resolveProfile ??
      ((input: OrchestratorRunInputLike) => (input.novelAIConfig.analysisProfile === "v5-hybrid" ? "v5-hybrid" : "v4-5")),
  });
  return {
    run: (input) => orchestrator.run(input),
    cancel: (session, reason) => orchestrator.cancel(session, reason),
    parts: {
      catalogSource,
      catalogState,
      promptCompiler,
      v45AnalyzerEngine,
      v45Analyzer,
      v5Analyzer,
      sessions,
      dispatcher,
      executor,
      v45,
      v5,
    },
    dispose() {
      v5.dispose?.();
      dispatcher.dispose?.();
    },
  };
}
