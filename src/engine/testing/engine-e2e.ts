/**
 * End-to-end parity driver for the engine factory (analyzer LLM call -> plan -> compose -> image requests).
 *
 * The SAME driver runs against (a) the ORIGINAL bundle objects wired exactly like Asset Maid's boot code
 * (pretty 180731-180783; see the generator scratch/engine/engine/gen-e2e.mjs) and (b) `createAssetMaidEngine`.
 * A scripted analyzer client returns canned raw responses; capturing provider adapters record every ImageRequest.
 */
import { toPlain } from "./plain";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface EngineE2EScenario {
  name: string;
  seed: number;
  /** Raw analyzer replies, consumed in order (the last one repeats). */
  responses: string[];
  /** Function-free part of OrchestratorRunInput. */
  runInput: Record<string, any>;
  promptInputs?: Record<string, unknown>;
  v5PromptContext?: Record<string, unknown>;
  seedSetting?: { key?: string; seed: string; fixed: boolean };
}

export interface EngineFactoryDeps {
  analyzerClient: { complete(config: any, messages: any[], options?: any): Promise<any> };
  imageProviders: Record<string, any>;
  comfyUIReferences: { prepare(reference: any): Promise<any> };
}

export type EngineFactory = (deps: EngineFactoryDeps) => { run(input: any): Promise<any> };

const omit = (o: any, keys: string[]) => {
  if (!o || typeof o !== "object") return o;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!keys.includes(k)) out[k] = v;
  return out;
};

export async function runEngineScenario(factory: EngineFactory, scenario: EngineE2EScenario) {
  const sent: unknown[] = [];
  const requests: unknown[] = [];
  const events: unknown[] = [];
  const persisted: unknown[] = [];
  let continuity: unknown;
  const queue = [...scenario.responses];
  let counter = 0;
  const analyzerClient = {
    async complete(config: any, messages: any[], options?: any) {
      sent.push(toPlain({ config, messages, options: omit(options, ["signal", "onRequestProgress", "onProgress"]) }));
      const raw = queue.length > 1 ? queue.shift()! : queue[0];
      return { raw, parsed: JSON.parse(raw) };
    },
  };
  const adapter = (provider: string) => ({
    provider,
    serializesRequests: provider === "novelai",
    async generate(request: any) {
      requests.push(toPlain(omit(request, ["signal", "session"])));
      counter += 1;
      return {
        provider,
        bytes: new Uint8Array([counter]),
        mimeType: "image/png",
        extension: "png",
        seed: request.seed,
        width: request.width,
        height: request.height,
        requestId: `req-${counter}`,
        providerMetadata: {},
      };
    },
  });
  const engine = factory({
    analyzerClient,
    imageProviders: { novelai: adapter("novelai"), "chan-server": adapter("chan-server"), "comfy-ui": adapter("comfy-ui") },
    comfyUIReferences: { prepare: async () => ({ bytes: new Uint8Array([7]), mimeType: "image/png", extension: "png" }) },
  });
  const input = {
    ...JSON.parse(JSON.stringify(scenario.runInput)),
    promptInputs: () => JSON.parse(JSON.stringify(scenario.promptInputs ?? {})),
    v5PromptContext: () => JSON.parse(JSON.stringify(scenario.v5PromptContext ?? {})),
    seedSetting: () => scenario.seedSetting ?? { key: "", seed: "", fixed: false },
    references: () => [],
    outfitReference: () => null,
    characterReference: () => null,
    onEvent: (e: any) => events.push(toPlain(omit(e, ["session", "analyzerProgress"]))),
    persistGeneratedImage: async (image: any, index: number, count: number) => {
      persisted.push({ index, count, sourceImageToken: image.sourceImageToken });
    },
    applyContinuity: async (c: unknown) => {
      continuity = toPlain(c);
    },
    applyV5Continuity: async (c: unknown) => {
      continuity = toPlain(c);
    },
    signal: new AbortController().signal,
  };
  try {
    const result = await engine.run(input);
    return {
      sent,
      requests,
      events,
      persisted,
      continuity,
      images: toPlain(
        result.images.map((image: any) => {
          const { generation, ...rest } = image;
          return { ...rest, generation: omit(generation, ["bytes"]) };
        }),
      ),
      session: toPlain(omit(result.session, ["signal", "controller"])),
    };
  } catch (error) {
    const e = error as { name?: string; message?: string; code?: string };
    return { sent, requests, events, persisted, error: { name: e?.name, message: e?.message, code: e?.code } };
  }
}
