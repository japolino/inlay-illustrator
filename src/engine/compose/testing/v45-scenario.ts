/**
 * Parity driver for the v4-5 compose path (analysis result -> image requests).
 *
 * The SAME driver runs in the fixture generator (with the ORIGINAL bundle's functions, obtained through
 * `__AM_eval`) and in the bun tests (with the port's core exports), so both sides wire identical objects:
 *   Ne = createPromptCompiler(ruleRuntime | compileCustomV45Catalog(raw), NOVELAI_DEFAULTS)   pyt / n$e
 *   Ie = createGenerationSessions()                                                          nht
 *   ye = createImageGenerationDispatcher(capturing adapters, createProviderQueues(), () => 0) Iyt / Sbe
 *   nt = createGenerationBatchExecutor(ye, Ie, fakeComfyReferences)                          lht
 *   createV45Orchestrator(fakeAnalyzer, Ne, Ie, nt).run(input)                               Tht
 * The fake analyzer returns the scenario's validated plan; adapters record every ImageRequest.
 */
import { toPlain } from "../../testing/plain";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fn = (...args: any[]) => any;

/** Core functions the driver needs (original minified name in brackets). */
export interface V45ComposeCoreFns {
  createV45Orchestrator: Fn; // Tht
  createPromptCompiler: Fn; // pyt
  createGenerationSessions: Fn; // nht
  createGenerationBatchExecutor: Fn; // lht
  createImageGenerationDispatcher: Fn; // Iyt
  createProviderQueues: Fn; // Sbe
  createV45RuleRuntime: Fn; // DLe
  compileCustomV45Catalog: Fn; // n$e
  NOVELAI_V45_RAW_CATALOG: unknown; // vW
  NOVELAI_DEFAULTS: unknown; // Ns
}

/** JSON-serializable scenario (stored in the fixtures). */
export interface V45ComposeScenario {
  name: string;
  seed: number;
  catalog: "rule-ir" | "legacy";
  plan: { images: Array<Record<string, unknown>>; [key: string]: unknown };
  promptInputs: Record<string, unknown>;
  /** Plain (function-free) part of OrchestratorRunInput. */
  runInput: Record<string, unknown>;
  /** seedSetting result for every call (omit = no seedSetting). */
  seedSetting?: { seed: string; fixed: boolean } | null;
  /** references(actors) result for NovelAI (director references). */
  references?: unknown[];
  /** outfitReference(actors) / characterReference(actors) result for ComfyUI. */
  outfitReference?: Record<string, unknown> | null;
  characterReference?: Record<string, unknown> | null;
  /** Provider adapters to register (default: all three). */
  providers?: Array<"novelai" | "chan-server" | "comfy-ui">;
  /** Fake provider result tweaks. */
  effectivePromptSuffix?: string;
}

export interface V45ComposeOutcome {
  requests: unknown[];
  analyzerInput: unknown;
  events: unknown[];
  persisted: unknown[];
  result?: unknown;
  error?: { name?: string; message?: string; code?: string };
}

function projectRequest(request: Record<string, any>): Record<string, unknown> {
  const { signal: _signal, session, ...rest } = request;
  return { ...rest, ...(session ? { session: { sessionId: session.sessionId, sessionKey: session.sessionKey } } : {}) };
}

function projectImage(image: Record<string, any>): Record<string, unknown> {
  const { generation, ...rest } = image;
  const { bytes, ...gen } = generation ?? {};
  return { ...rest, generation: { ...gen, byteLength: bytes?.length ?? 0 } };
}

function projectSession(session: Record<string, any> | undefined): unknown {
  if (!session) return session;
  const { signal: _s, controller: _c, ...rest } = session;
  return rest;
}

/** Run one scenario. Install the seeded env (globals or `setEngineEnv`) BEFORE calling. */
export async function runV45ComposeScenario(fns: V45ComposeCoreFns, scenario: V45ComposeScenario): Promise<V45ComposeOutcome> {
  const source =
    scenario.catalog === "legacy"
      ? fns.compileCustomV45Catalog(JSON.parse(JSON.stringify(fns.NOVELAI_V45_RAW_CATALOG)))
      : fns.createV45RuleRuntime();
  const compiler = fns.createPromptCompiler(source, fns.NOVELAI_DEFAULTS);
  const sessions = fns.createGenerationSessions();
  const requests: unknown[] = [];
  let counter = 0;
  const adapter = (provider: "novelai" | "chan-server" | "comfy-ui") => ({
    provider,
    serializesRequests: provider === "novelai",
    async generate(request: Record<string, any>) {
      requests.push(projectRequest(request));
      counter += 1;
      return {
        provider,
        bytes: new Uint8Array([counter]),
        mimeType: "image/png",
        extension: "png",
        seed: request.seed,
        width: request.width,
        height: request.height,
        ...(scenario.effectivePromptSuffix ? { effectivePrompt: `${request.prompt}${scenario.effectivePromptSuffix}` } : {}),
        requestId: `req-${counter}`,
        providerMetadata: { fake: true },
      };
    },
  });
  const providers = scenario.providers ?? ["novelai", "chan-server", "comfy-ui"];
  const dispatcher = fns.createImageGenerationDispatcher(
    Object.fromEntries(providers.map((p) => [p, adapter(p)])),
    fns.createProviderQueues({ getIntervalMs: () => 0 }),
    () => 0,
  );
  const comfyReferences = {
    async prepare(reference: Record<string, any>) {
      return { bytes: new Uint8Array([7]), mimeType: "image/png", extension: "png", name: String(reference?.assetName ?? "") };
    },
  };
  const executor = fns.createGenerationBatchExecutor(dispatcher, sessions, comfyReferences);
  let analyzerInput: unknown;
  const analyzer = {
    async run(input: Record<string, any>) {
      const { signal: _s, onProgress: _p, onRequestProgress: _r, ...rest } = input;
      analyzerInput = toPlain(rest);
      return { plan: JSON.parse(JSON.stringify(scenario.plan)), executionMode: "single-stage", status: "validated" };
    },
  };
  const orchestrator = fns.createV45Orchestrator(analyzer, compiler, sessions, executor);
  const events: unknown[] = [];
  const persisted: unknown[] = [];
  const input: Record<string, unknown> = {
    ...JSON.parse(JSON.stringify(scenario.runInput)),
    promptInputs: () => JSON.parse(JSON.stringify(scenario.promptInputs)),
    ...(scenario.seedSetting !== undefined ? { seedSetting: () => scenario.seedSetting } : {}),
    references: () => scenario.references ?? [],
    outfitReference: () => scenario.outfitReference ?? null,
    characterReference: () => scenario.characterReference ?? null,
    onEvent: (e: Record<string, any>) =>
      events.push({
        phase: e.phase,
        imageIndex: e.imageIndex,
        imageCount: e.imageCount,
        sourceImageToken: e.sourceImageToken,
      }),
    persistGeneratedImage: async (image: Record<string, any>, index: number, count: number) => {
      persisted.push({ index, count, sourceImageToken: image.sourceImageToken });
    },
    applyContinuity: async () => undefined,
    signal: new AbortController().signal,
  };
  try {
    const result = await orchestrator.run(input);
    return {
      requests: toPlain(requests) as unknown[],
      analyzerInput,
      events,
      persisted,
      result: toPlain({
        session: projectSession(result.session),
        continuity: result.continuity,
        images: result.images.map(projectImage),
      }),
    };
  } catch (error) {
    const e = error as { name?: string; message?: string; code?: string };
    return { requests: toPlain(requests) as unknown[], analyzerInput, events, persisted, error: { name: e?.name, message: e?.message, code: e?.code } };
  }
}
