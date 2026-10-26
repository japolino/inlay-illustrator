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
import { OutfitIndexRegistry, withOutfitAwareness, type RunOutfitIndex } from "./outfit-awareness.js";
import { repairBatchItems } from "./outfit-visibility.js";
import { withPersonaIdentity } from "./persona-identity.js";

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
  dispatch(
    request: Record<string, unknown> & { provider: ImageProviderId },
    context: EngineRunContext,
    config: InlayConfig,
    options?: { signal?: AbortSignal; onRetry?: (retry: { attempt: number; total: number } | undefined, errors: readonly unknown[]) => void },
  ): Promise<Record<string, unknown>>;
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
  // Outfit parts of the runs in flight (outfit-awareness.ts): read by the analyzer wrapper and the batch repair.
  const outfitRuns = new OutfitIndexRegistry();
  const repairItems = (input: Record<string, unknown>, items: readonly unknown[]): unknown[] => {
    try {
      return repairBatchItems(items, input.outfitIndex as RunOutfitIndex | undefined, (log) =>
        services.log.append("info", "pipeline", `Outfit repair ${log.actorId} (${log.sourceImageToken}): ${log.changes.join("; ")}`),
      );
    } catch (e) {
      services.log.append("warn", "pipeline", `Outfit repair skipped: ${e instanceof Error ? e.message : String(e)}`);
      return [...items];
    }
  };

  const engineFor = (config: InlayConfig): AssetMaidEngine => {
    const raw = String(config.presetCatalog?.rawJson ?? "");
    if (current && current.raw === raw) return current.engine;
    current?.engine.dispose();
    const engine = createAssetMaidEngine({
      analyzerClient: withOutfitAwareness(withPersonaIdentity(services.llm.analyzerClient({ purpose: "analyzer" })), outfitRuns, (n) =>
        services.log.append("info", "pipeline", `Analyzer request: outfit parts of ${n} registered outfit(s) added.`),
      ) as never,
      imageProviders: adapters,
      comfyUIReferences: references,
      getRetryCount: () => snapshot?.runtime.generationAutoRetryCount ?? 5,
      getIntervalMs: () => Math.max(0, Math.min(30, Number(snapshot?.runtime.novelaiParallelIntervalSec) || 0)) * 1000,
      rawCatalogJson: raw,
      jev: services.decisions ? services.decisions.createJevAdapter(() => snapshot?.jevConnection ?? { rosterSelectionDefault: false, model: "jev-latest" }, { userId: services.userId }) : undefined,
      onAnalyzerDiagnostic: (event) => options.onAnalyzerDiagnostic?.(event),
      prepareBatchItems: repairItems,
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
      const outfitIndex = (input as { outfitIndex?: RunOutfitIndex }).outfitIndex;
      const releaseOutfits = outfitIndex ? outfitRuns.register(outfitIndex) : undefined;
      // JEV roster progress and retry errors only update the generation session (AM setPhase(..., {jevSelection}),
      // {imageRetry, retryErrors}, {splitAnalysis}); they emit no run event. Forward each change of this run's session.
      const sessions = engine.parts.sessions as { subscribe(listener: () => void): () => void };
      const onEvent = (input as { onEvent?: (e: Record<string, unknown>) => void }).onEvent;
      let session: { progress?: Record<string, unknown> } | undefined;
      let lastJev: unknown;
      let lastRetry = JSON.stringify({ retryErrors: [] });
      const unsubscribe = sessions.subscribe(() => {
        const progress = session?.progress;
        const jev = progress?.jevSelection;
        if (jev && jev !== lastJev) {
          lastJev = jev;
          onEvent?.({ type: "jev-selection", jevSelection: jev });
        }
        if (!progress) return;
        const retry = { imageRetry: progress.imageRetry, retryErrors: sessionRetryErrors(progress) };
        const key = JSON.stringify(retry);
        if (key === lastRetry) return;
        lastRetry = key;
        onEvent?.({ type: "retry-errors", ...retry });
      });
      try {
        return await engine.run({
          ...input,
          onEvent: (e: Record<string, unknown>) => {
            if (e?.session) session = e.session as typeof session;
            onEvent?.(e);
          },
          generationProviderForImage: () => ref,
        });
      } finally {
        unsubscribe();
        releaseOutfits?.();
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
        return await dispatcher.generate({ ...request, providerRef, ...(opts.signal ? { signal: opts.signal } : {}) }, { retryCount: config.runtime.generationAutoRetryCount, ...(opts.onRetry ? { onRetry: opts.onRetry } : {}) });
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

/**
 * Retry errors of a generation session as AM shows them (0.9.89.5 toast `OOt` 178970, split rows 177426-177435):
 * without split analysis `progress.retryErrors` (image request retries); with split analysis the errors of the steps
 * that are not finished (the step's image generation errors while it generates, else its analysis errors).
 */
function sessionRetryErrors(progress: Record<string, unknown>): unknown[] {
  const split = progress.splitAnalysis as { steps?: Array<Record<string, any>> } | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!split) return Array.isArray(progress.retryErrors) ? progress.retryErrors : [];
  return (split.steps ?? []).flatMap((step) => {
    const generation = step.generation as { status?: string; retryErrors?: unknown[] } | undefined;
    if (generation) return generation.status === "completed" || generation.status === "cancelled" ? [] : (generation.retryErrors ?? []);
    return ["completed", "reused", "cancelled"].includes(String(step.status)) ? [] : (step.retryErrors ?? []);
  }).slice(-20);
}
