/**
 * Engine factory: the same object graph Asset Maid 0.9.90 wires at boot (`S` @185030-185085 of the p120 bundle),
 * minus the RisuAI-specific transports. Every host effect is injected:
 *
 *   Ce = createGenerationSessions()                                         fht
 *   Ie = createImageGenerationDispatcher(providers, createProviderQueues({getIntervalMs}), getRetryCount)   Oht / Lxe
 *   ie = createGenerationBatchExecutor(Ie, Ce, comfyUIReferences)           vht @158121
 *   nt = createV5Analyzer(analyzerClient, undefined, jev)                   c0e @161195 (bundled catalog `uz()`)
 *   ne(config) = analyzer of the active Atelier preset: compiles `aZ(nZ(config.presetCatalog))` when `kind + json`
 *                changed, rebuilds `c0e(client, Hne({catalog}), jev)`, then checks `C8(zc(config), catalog, selected)`
 *   tt = createV5Orchestrator(nt, Ce, ie, undefined, {prepareAnalysis: () => rW(config, ne)(), onSplitResumeState})  Ubt
 *
 * `rW` snapshots the config and returns `{analysis: yAe(snapshot), analyzer: ne(snapshot)}`; here the snapshot comes
 * from `options.getConfig()` (no automatic-save flush). There is no V4.5 path and no profile orchestrator any more.
 *
 * Dropped from the original wiring: the NovelAI HTTP client + its queue and rating wrapper (`zht`/`Rht`/`Mht`), the
 * ComfyUI transport (`Emt`/`ogt`). The backend supplies provider adapters with the dispatcher contract instead (see
 * README "Image providers"). The JEV roster pre-pass (`c0e` 3rd argument) gets `options.jev`.
 */
import {
  createGenerationSessions,
  createImageGenerationDispatcher,
  createProviderQueues,
  createGenerationBatchExecutor,
  createV5Orchestrator,
  createV5Analyzer,
  createNovelAIV5RuleRuntime,
  selectActiveAtelierPreset,
  compileActiveAtelierPreset,
  resolveAnalysisDocument,
  resolveAnalysisDirections,
  assertDirectingRules,
} from "./core/asset-maid-core";

/** Analyzer LLM message as built by the V5 analyzer (`s0e`). */
export interface AnalyzerMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * The analyzer transport (`C = nP(network, storage)` in the original; `.complete`, spec/llm.md §1.4).
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

/** Image providers of 0.9.90 (`F0` @4653). Chan Server was removed. */
export type ImageProviderId = "novelai" | "comfy-ui";

/** Provider adapter registered in the dispatcher (`Oht({novelai, "comfy-ui"})`). */
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

/** ComfyUI reference preparation (`dt` in the boot code): returns image bytes for a reference asset. */
export interface ComfyUIReferencePreparer {
  prepare(
    reference: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<{ bytes: Uint8Array; mimeType: string; extension: string }>;
}

/** Analysis prepared per run (`rW`): directing analysis applied to the run input (`qbt`) and the analyzer to use. */
export interface PreparedAnalysis {
  analysis?: unknown;
  analyzer?: unknown;
}

export interface AssetMaidEngineOptions {
  analyzerClient: AnalyzerClient;
  imageProviders: Partial<Record<ImageProviderId, ImageProviderAdapter>>;
  comfyUIReferences?: ComfyUIReferencePreparer;
  /** runtime.generationAutoRetryCount (default 5, clamped 0..10 by the dispatcher). */
  getRetryCount?: () => number;
  /** runtime.novelaiParallelIntervalSec * 1000 (min gap between jobs of one queue). */
  getIntervalMs?: () => number;
  /**
   * Current Asset Maid config snapshot. When given, every run is prepared like AM's `rW`: the active Atelier preset
   * (`config.presetCatalog`) selects the analyzer (compiled catalog cached by `kind + json`), the directing rules are
   * checked (`C8`), and `yAe(config)` (directions, custom sizes, execution) is applied to the run input (`qbt`).
   * Without it the bundled catalog and the run input's own `novelAIConfig.v5UserDirections` are used.
   */
  getConfig?: () => unknown;
  /** Overrides the `getConfig`-based preparation (a run input's own `prepareAnalysis` still wins). */
  prepareAnalysis?: () => Promise<PreparedAnalysis | undefined> | PreparedAnalysis | undefined;
  /** JEV pre-pass: `network.fetch(url, init)` (AM TypeSafe systemone request) and `getConfig()` (`{model, apiKey, ...}`). */
  jev?: { network: unknown; getConfig: () => unknown };
  /** Kept for API compatibility; 0.9.90 has no V4.5 analyzer runner, so nothing reports through it. */
  onAnalyzerDiagnostic?: (event: { event: string; detail?: unknown; [key: string]: unknown }) => void;
  onSplitResumeState?: (key: unknown, state: unknown) => void;
  /**
   * Inlay addition (not in AM): rewrites the composed items of each executor batch (`reservation.execute(input, items)`)
   * before they are dispatched. `input` is the executor input (the run input plus orchestrator callbacks).
   */
  prepareBatchItems?: (input: Record<string, unknown>, items: readonly unknown[]) => unknown[];
}

type BatchExecutor = ReturnType<typeof createGenerationBatchExecutor>;

/** The core executor with `prepare` applied to every batch's items; reservation lifecycle is the core's. */
function withPreparedBatchItems(executor: BatchExecutor, prepare: NonNullable<AssetMaidEngineOptions["prepareBatchItems"]>): BatchExecutor {
  const core = executor as unknown as {
    providerRef(provider: unknown, scope: unknown): unknown;
    reserve(session: unknown): { release(): void; execute(input: Record<string, unknown>, items: readonly unknown[], resume?: unknown): Promise<unknown> };
  };
  return Object.freeze({
    providerRef: (provider: unknown, scope: unknown) => core.providerRef(provider, scope),
    reserve(session: unknown) {
      const reservation = core.reserve(session);
      return Object.freeze({
        release: () => reservation.release(),
        execute: (input: Record<string, unknown>, items: readonly unknown[], resume?: unknown) => reservation.execute(input, items.length ? prepare(input, items) : items, resume),
      });
    },
  }) as unknown as BatchExecutor;
}

/** Minimal structural view of the V5 orchestrator run input (`Ubt.run`). The full shape is documented in README.md. */
export interface OrchestratorRunInputLike {
  generationType: string;
  sessionContext: Record<string, unknown>;
  novelAIConfig: Record<string, unknown>;
  analyzerInput: Record<string, unknown>;
  /** Fixed rating of the source (`yS(sourceSettings)`): "sfw" | "nsfw" | false. Replaces `forceNsfwPrefix`. */
  forceRating?: "sfw" | "nsfw" | false;
  prepareAnalysis?: () => Promise<PreparedAnalysis | undefined> | PreparedAnalysis | undefined;
  [key: string]: unknown;
}

export interface OrchestratorRunResult {
  session: Record<string, unknown>;
  analyzer: unknown;
  continuity: unknown;
  images: Array<Record<string, unknown>>;
}

/** The active Atelier preset as last compiled by the engine (`{json, catalog}`; `undefined` before the first run). */
export interface ActiveAtelierPresetState {
  readonly key: string;
  readonly json: string;
  readonly catalog: unknown;
  readonly diagnostics: readonly unknown[];
}

export interface AssetMaidEngine {
  /** Analyze + compose + generate one message (`Ubt.run`). */
  run(input: OrchestratorRunInputLike): Promise<OrchestratorRunResult>;
  cancel(session: unknown, reason?: string): boolean;
  /** `{analysis, analyzer}` for a config, exactly as the engine prepares a run (`rW` without the save flush). */
  prepareAnalysisFor(config: unknown): PreparedAnalysis;
  /** Raw building blocks (verbatim core objects). */
  readonly parts: {
    /** Analyzer over the bundled catalog (`nt`). */
    v5Analyzer: unknown;
    sessions: unknown;
    dispatcher: unknown;
    executor: unknown;
    v5: unknown;
    /** Active preset compiled by the last prepared run. */
    readonly activePreset: ActiveAtelierPresetState | undefined;
  };
  dispose(): void;
}

export function createAssetMaidEngine(options: AssetMaidEngineOptions): AssetMaidEngine {
  const sessions = createGenerationSessions();
  const getIntervalMs = options.getIntervalMs ?? (() => 0);
  const dispatcher = createImageGenerationDispatcher(
    { ...options.imageProviders },
    createProviderQueues({ getIntervalMs }),
    options.getRetryCount ?? (() => 5),
  );
  const coreExecutor = createGenerationBatchExecutor(dispatcher, sessions, options.comfyUIReferences);
  const executor = options.prepareBatchItems ? withPreparedBatchItems(coreExecutor, options.prepareBatchItems) : coreExecutor;
  // nt = c0e(C, void 0, {network, getConfig}): JEV pre-pass adapter injected.
  const v5Analyzer = (createV5Analyzer as any)(options.analyzerClient, undefined, options.jev);
  let analyzer = v5Analyzer;
  let activePreset: ActiveAtelierPresetState | undefined;
  /** `ne(config)`: analyzer of the active Atelier preset, rebuilt when the preset JSON changes. */
  const analyzerFor = (config: any): unknown => {
    const selected = selectActiveAtelierPreset(config.presetCatalog ?? {}) as { kind: string; json: string };
    const key = selected.kind + ":" + selected.json;
    if (key !== activePreset?.key) {
      const compiled = compileActiveAtelierPreset(selected) as { catalog: unknown; diagnostics: readonly unknown[] };
      analyzer = (createV5Analyzer as any)(options.analyzerClient, createNovelAIV5RuleRuntime({ catalog: compiled.catalog }), options.jev);
      activePreset = Object.freeze({ key, json: selected.json, catalog: compiled.catalog, diagnostics: compiled.diagnostics });
    }
    const document = resolveAnalysisDocument(config, undefined) as { scene: { selected: string } };
    assertDirectingRules(document, activePreset!.catalog, document.scene.selected);
    return analyzer;
  };
  const prepareAnalysisFor = (config: unknown): PreparedAnalysis => {
    const snapshot = structuredClone(config);
    return { analysis: resolveAnalysisDirections(snapshot), analyzer: analyzerFor(snapshot) };
  };
  const prepareAnalysis =
    options.prepareAnalysis ?? (options.getConfig ? async () => prepareAnalysisFor(options.getConfig!()) : undefined);
  const v5 = createV5Orchestrator(v5Analyzer, sessions, executor, undefined, {
    ...(prepareAnalysis ? { prepareAnalysis } : {}),
    onSplitResumeState: (key: unknown, state: unknown) => options.onSplitResumeState?.(key, state),
  });
  return {
    run: (input) => v5.run(input),
    cancel: (session, reason) => v5.cancel(session, reason),
    prepareAnalysisFor,
    parts: {
      v5Analyzer,
      sessions,
      dispatcher,
      executor,
      v5,
      get activePreset() {
        return activePreset;
      },
    },
    dispose() {
      v5.dispose?.();
      dispatcher.dispose?.();
    },
  };
}
