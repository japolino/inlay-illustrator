/**
 * EnginePort: the small surface the chat pipeline codes against (one message run = analyzer -> compose -> dispatch ->
 * persist callbacks -> continuity callbacks), plus the real implementation over `src/engine` (read-only) and a fake.
 *
 * Real port (`createEnginePort`): one shared `createAssetMaidEngine` graph (AM 0.9.90 boot `S` @185030-185085), built
 * once. The analyzer of a run is the one of the active Atelier preset (AM `ne(config)`: the engine compiles the preset
 * of `presetCatalog.atelier` (bundled default preset when absent) and caches it by `kind + json`), supplied through the
 * run input's `prepareAnalysis` from the job-start config snapshot (AM `rW`, see {@link preparedAnalysisFor});
 * analyzer client = `LlmService.analyzerClient()`; image providers = the adapters
 * of ./providers.ts (ImageService with `retries: 0`; the engine dispatcher retries `runtime.generationAutoRetryCount`
 * times); ComfyUI references through `ImageBytesService`. Per-run context reaches the adapters through
 * `generationProviderForImage` -> `providerRef.queueScopeKey` (see ProviderRunRegistry).
 */
import type { InlayConfig } from "../../shared/contract/index.js";
import { createAssetMaidEngine, type AssetMaidEngine, type ImageProviderId, type OrchestratorRunInputLike, type OrchestratorRunResult, type PreparedAnalysis } from "../../engine/index.js";
import type { BackendServices } from "../services/types.js";
import { createComfyReferencePreparer, createImageProviderAdapters, ProviderRunRegistry, type ProviderRunContext } from "./providers.js";
import { OutfitIndexRegistry, withOutfitAwareness, type RunOutfitIndex } from "./outfit-awareness.js";
import { FormWatchRegistry, withFormAwareness, type RunFormWatch } from "./form-awareness.js";
import { repairBatchItems } from "./outfit-visibility.js";

export type { OrchestratorRunInputLike, OrchestratorRunResult } from "../../engine/index.js";

export interface EngineRunContext extends ProviderRunContext {
  /** Engine provider id of the run ("novelai" or "comfy-ui"). */
  engineProvider: ImageProviderId;
  /**
   * AM-shaped config snapshot of the run, taken at job start (AM `captureAnalysisPreparation` / `rW`). When given, the
   * run is prepared with the analyzer of its active Atelier preset (see {@link preparedAnalysisFor}).
   */
  analysisConfig?: unknown;
}

type EngineLike = Pick<AssetMaidEngine, "prepareAnalysisFor">;

/**
 * `prepareAnalysis` result for a config snapshot (AM 0.9.90 `rW`): the analyzer of the active Atelier preset, checked
 * against the directing rules (`C8`). The directing analysis (`yAe`: directions, custom sizes, execution, applied by the
 * engine with `qbt`) is only used when the snapshot carries Atelier data (`presetCatalog.atelier` or
 * `runtime.instructionChanges`). Without it the run keeps its own `novelAIConfig.v5UserDirections`, requested size and
 * coordinates (the port's legacy directions and chat toolbar settings), which AM 0.9.90 also reads as the fallback when
 * no Atelier document is active.
 */
export function preparedAnalysisFor(engine: EngineLike, snapshot: unknown): PreparedAnalysis {
  const prepared = engine.prepareAnalysisFor(snapshot);
  const config = (snapshot ?? {}) as { presetCatalog?: { atelier?: unknown }; runtime?: { instructionChanges?: unknown } };
  const atelier = config.presetCatalog?.atelier !== undefined || config.runtime?.instructionChanges !== undefined;
  return atelier ? prepared : { analyzer: prepared.analyzer };
}

export interface EnginePort {
  /**
   * Run one message (`Ubt.run`). The port adds `generationProviderForImage` (run routing) and, with
   * `context.analysisConfig`, `prepareAnalysis` to the input.
   */
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
  /** Engine factory (tests); default `createAssetMaidEngine`. */
  createEngine?: typeof createAssetMaidEngine;
}

export function createEnginePort(services: BackendServices, options: EnginePortOptions = {}): EnginePort {
  const registry = new ProviderRunRegistry();
  const adapters = createImageProviderAdapters(services, registry);
  const references = createComfyReferencePreparer(services);
  let current: AssetMaidEngine | null = null;
  /**
   * Config of the latest run / dispatch: the fallback for engine callbacks that get no run context (`getRetryCount`,
   * only used when a request has no `retryCount`, which runs and dispatches always pass; the JEV adapter's `getConfig`).
   */
  let snapshot: InlayConfig | null = null;
  /** Config per run, by `providerRef.queueScopeKey`: the provider queues ask `getIntervalMs(providerRef)` per request. */
  const runConfigs = new Map<string, InlayConfig>();
  // Outfit parts of the runs in flight (outfit-awareness.ts): read by the analyzer wrapper and the batch repair.
  const outfitRuns = new OutfitIndexRegistry();
  // Form state of the runs in flight (form-awareness.ts): read by the analyzer wrapper.
  const formRuns = new FormWatchRegistry();
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

  const engineFor = (): AssetMaidEngine => {
    if (current) return current;
    const engine = (options.createEngine ?? createAssetMaidEngine)({
      analyzerClient: withFormAwareness(
        withOutfitAwareness(
          services.llm.analyzerClient({ purpose: "analyzer" }),
          outfitRuns,
          (n) => services.log.append("info", "pipeline", `Analyzer request: outfit parts of ${n} registered outfit(s) added.`),
          (repairs) =>
            services.log.append(
              "warn",
              "pipeline",
              `Analyzer reply: ${repairs.length} outfit proposal problem(s) repaired instead of failing the analysis.`,
              repairs.map((r) => `${r.proposalKey || "inline proposal"} for ${r.candidateKey || "(no character)"}: ${r.action}, ${r.reason}`).join("; "),
            ),
        ),
        formRuns,
        (proposals, rejected) =>
          services.log.append(
            "info",
            "pipeline",
            `Analyzer reply: ${proposals.length} new appearance form(s) proposed for a lasting body change; the analysis starts again with them.`,
            [...proposals.map((p) => `${p.candidateKey}: "${p.label}"${p.copyFrom ? ` (look of ${p.copyFrom.candidateKey})` : ""}${p.evidence ? `, ${p.evidence}` : ""}`), ...rejected.map((r) => `not used, ${r}`)].join("; "),
          ),
      ) as never,
      imageProviders: adapters,
      comfyUIReferences: references,
      getRetryCount: () => snapshot?.runtime.generationAutoRetryCount ?? 5,
      getIntervalMs: (ref?: { queueScopeKey?: unknown }) => {
        const config = (typeof ref?.queueScopeKey === "string" ? runConfigs.get(ref.queueScopeKey) : undefined) ?? snapshot;
        return Math.max(0, Math.min(30, Number(config?.runtime.novelaiParallelIntervalSec) || 0)) * 1000;
      },
      jev: services.decisions ? services.decisions.createJevAdapter(() => snapshot?.jevConnection ?? { rosterSelectionDefault: false, model: "jev-latest" }, { userId: services.userId }) : undefined,
      onAnalyzerDiagnostic: (event) => options.onAnalyzerDiagnostic?.(event),
      prepareBatchItems: repairItems,
    });
    current = engine;
    return engine;
  };

  return {
    async run(input, context, config) {
      snapshot = config;
      const engine = engineFor();
      const runId = registry.register(context);
      const ref = { providerId: context.engineProvider, queueScopeKey: registry.queueScopeKey(runId) };
      runConfigs.set(ref.queueScopeKey, config);
      const outfitIndex = (input as { outfitIndex?: RunOutfitIndex }).outfitIndex;
      const releaseOutfits = outfitIndex ? outfitRuns.register(outfitIndex) : undefined;
      const formWatch = (input as { formWatch?: RunFormWatch }).formWatch;
      const releaseForms = formWatch ? formRuns.register(formWatch) : undefined;
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
          ...(context.analysisConfig !== undefined && !input.prepareAnalysis ? { prepareAnalysis: () => preparedAnalysisFor(engine, context.analysisConfig) } : {}),
          onEvent: (e: Record<string, unknown>) => {
            if (e?.session) session = e.session as typeof session;
            onEvent?.(e);
          },
          generationProviderForImage: () => ref,
        });
      } finally {
        unsubscribe();
        releaseOutfits?.();
        releaseForms?.();
        runConfigs.delete(ref.queueScopeKey);
        registry.release(runId);
      }
    },
    async dispatch(request, context, config, opts = {}) {
      snapshot = config;
      const engine = engineFor();
      const runId = registry.register(context);
      const providerRef = { providerId: request.provider, queueScopeKey: registry.queueScopeKey(runId) };
      runConfigs.set(providerRef.queueScopeKey, config);
      const dispatcher = engine.parts.dispatcher as { generate(r: unknown, o?: unknown): Promise<Record<string, unknown>> };
      try {
        return await dispatcher.generate({ ...request, providerRef, ...(opts.signal ? { signal: opts.signal } : {}) }, { retryCount: config.runtime.generationAutoRetryCount, ...(opts.onRetry ? { onRetry: opts.onRetry } : {}) });
      } finally {
        runConfigs.delete(providerRef.queueScopeKey);
        registry.release(runId);
      }
    },
    dispose() {
      current?.dispose();
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
