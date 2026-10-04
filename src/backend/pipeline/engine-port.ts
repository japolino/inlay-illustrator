/**
 * EnginePort: the small surface the chat pipeline codes against (one message run = analyzer -> compose -> dispatch ->
 * persist callbacks -> continuity callbacks), plus the real implementation over `src/engine` (read-only) and a fake.
 *
 * Real port (`createEnginePort`): one shared `createAssetMaidEngine` graph (AM boot LOt 180714-180783), rebuilt only
 * when `presetCatalog.rawJson` changes; analyzer client = `LlmService.analyzerClient()`; image providers = the adapters
 * of ./providers.ts (ImageService with `retries: 0`; the engine dispatcher retries `runtime.generationAutoRetryCount`
 * times); ComfyUI references through `ImageBytesService`. Per-run context reaches the adapters through
 * `generationProviderForImage` -> `providerRef.queueScopeKey` (see ProviderRunRegistry).
 */
import type { InlayConfig } from "../../shared/contract/index.js";
import { createAssetMaidEngine, type AssetMaidEngine, type ImageProviderId, type OrchestratorRunInputLike, type OrchestratorRunResult } from "../../engine/index.js";
import type { BackendServices } from "../services/types.js";
import { createComfyReferencePreparer, createImageProviderAdapters, ProviderRunRegistry, type ProviderRunContext } from "./providers.js";

export type { OrchestratorRunInputLike, OrchestratorRunResult } from "../../engine/index.js";

export interface EngineRunContext extends ProviderRunContext {
  /** Engine provider id of the run ("generic" Lumiverse providers run as "chan-server", anima-flat). */
  engineProvider: ImageProviderId;
}

export interface EnginePort {
  /** Analyzer execution mode for the active catalog (AM `M_e` 168762: default catalog -> "single-stage"). */
  executionMode(config: InlayConfig): "single-stage" | "two-stage";
  /** Run one message (`Lht.run`). The port adds `generationProviderForImage` (run routing) to the input. */
  run(input: OrchestratorRunInputLike, context: EngineRunContext, config: InlayConfig): Promise<OrchestratorRunResult>;
  /**
   * One image request through the engine dispatcher (AM `ye.generate` with `runtime.generationAutoRetryCount` retries,
   * used by single-slot regeneration `$bt` 122319). `request` is an engine `ImageRequest` without `providerRef`.
   */
  dispatch(request: Record<string, unknown> & { provider: ImageProviderId }, context: EngineRunContext, config: InlayConfig, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  dispose(): void;
}

export interface EnginePortOptions {
  /** Diagnostics sink (analyzer events). */
  onAnalyzerDiagnostic?: (event: { event: string; detail?: unknown }) => void;
}

export function createEnginePort(services: BackendServices, options: EnginePortOptions = {}): EnginePort {
  const registry = new ProviderRunRegistry();
  const adapters = createImageProviderAdapters(services, registry);
  const references = createComfyReferencePreparer(services);
  let current: { raw: string; engine: AssetMaidEngine } | null = null;
  let snapshot: InlayConfig | null = null;

  const engineFor = (config: InlayConfig): AssetMaidEngine => {
    const raw = String(config.presetCatalog?.rawJson ?? "");
    if (current && current.raw === raw) return current.engine;
    current?.engine.dispose();
    const engine = createAssetMaidEngine({
      analyzerClient: services.llm.analyzerClient({ purpose: "analyzer" }) as never,
      imageProviders: adapters,
      comfyUIReferences: references,
      getRetryCount: () => snapshot?.runtime.generationAutoRetryCount ?? 5,
      getIntervalMs: () => Math.max(0, Math.min(30, Number(snapshot?.runtime.novelaiParallelIntervalSec) || 0)) * 1000,
      rawCatalogJson: raw,
      onAnalyzerDiagnostic: (event) => options.onAnalyzerDiagnostic?.(event),
    });
    current = { raw, engine };
    return engine;
  };

  return {
    executionMode(config) {
      return engineFor(config).parts.catalogState.source === "default" ? "single-stage" : "two-stage";
    },
    async run(input, context, config) {
      snapshot = config;
      const engine = engineFor(config);
      const runId = registry.register(context);
      const ref = { providerId: context.engineProvider, queueScopeKey: registry.queueScopeKey(runId) };
      try {
        return await engine.run({ ...input, generationProviderForImage: () => ref });
      } finally {
        registry.release(runId);
      }
    },
    async dispatch(request, context, config, opts = {}) {
      snapshot = config;
      const engine = engineFor(config);
      const runId = registry.register(context);
      const providerRef = { providerId: request.provider, queueScopeKey: registry.queueScopeKey(runId) };
      const dispatcher = engine.parts.dispatcher as { generate(r: unknown, o?: unknown): Promise<Record<string, unknown>> };
      try {
        return await dispatcher.generate({ ...request, providerRef, ...(opts.signal ? { signal: opts.signal } : {}) }, { retryCount: config.runtime.generationAutoRetryCount });
      } finally {
        registry.release(runId);
      }
    },
    dispose() {
      current?.engine.dispose();
      current = null;
    },
  };
}
