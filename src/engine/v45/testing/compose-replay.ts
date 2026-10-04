/**
 * Shared driver for V4.5 compose parity. The generator passes the ORIGINAL bundle's core functions
 * (`core`) and context builder; the tests pass the port's. Same glue (src/engine/v45/compose.ts) on both sides.
 */
import { v45Plain } from "../plain";
import {
  composeV45Images,
  createV45ComposeRuntime,
  executeV45Images,
  type V45ComposeCore,
  type V45ComposeInput,
  type V45ImageRequest,
} from "../compose";

export interface ComposeScenario {
  name: string;
  seed: string;
  contextInput: Record<string, unknown>;
  analyzerContext: Record<string, unknown>;
  analyzerResult: Record<string, unknown>;
  settings: Record<string, unknown>;
  previousCharacterStateMap: Record<string, unknown>;
  previousGlobalModifierRefs: Record<string, unknown>;
}

export interface ComposeKit {
  core: V45ComposeCore;
  buildAnalyzerContextInputs(input: unknown): Record<string, unknown> & {
    promptInputs: (...a: unknown[]) => unknown;
    references: (...a: unknown[]) => unknown;
    outfitReference: (...a: unknown[]) => unknown;
    characterReference: (...a: unknown[]) => unknown;
    seedSetting: (...a: unknown[]) => unknown;
  };
}

function projectItem(item: Record<string, unknown>): unknown {
  const { createNovelAIConfig: _c, prepareProviderPrompt: _p, ...rest } = item;
  return v45Plain(rest);
}

function projectRequest(request: Record<string, unknown>): unknown {
  const { signal: _s, session, ...rest } = request;
  const config = rest.config as Record<string, unknown> | undefined;
  return v45Plain({ ...rest, ...(session ? { session: (session as { sessionId?: string }).sessionId } : {}), ...(config ? { config } : {}) });
}

function projectImage(image: Record<string, unknown>): unknown {
  return v45Plain(image);
}

export async function replayComposeScenario(kit: ComposeKit, sc: ComposeScenario): Promise<Record<string, unknown>> {
  const makeInput = (): V45ComposeInput => {
    const m = kit.buildAnalyzerContextInputs(structuredClone(sc.contextInput));
    return {
      ...(structuredClone(sc.settings) as Partial<V45ComposeInput>),
      analyzerResult: structuredClone(sc.analyzerResult) as never,
      analyzerContext: structuredClone(sc.analyzerContext) as never,
      promptInputs: m.promptInputs as never,
      references: m.references as never,
      outfitReference: m.outfitReference as never,
      characterReference: m.characterReference as never,
      seedSetting: m.seedSetting as never,
      previousCharacterStateMap: structuredClone(sc.previousCharacterStateMap) as never,
      previousGlobalModifierRefs: structuredClone(sc.previousGlobalModifierRefs) as never,
    } as V45ComposeInput;
  };
  const out: Record<string, unknown> = {};
  const composed = await composeV45Images(makeInput(), { seed: sc.seed }, createV45ComposeRuntime(kit.core));
  out.plan = {
    analyzerInput: v45Plain(composed.plan.analyzerInput),
    continuity: v45Plain(composed.plan.continuity),
    events: v45Plain(composed.plan.events.map(({ session: _s, ...e }) => e)),
    items: composed.plan.items.map((i) => projectItem(i as unknown as Record<string, unknown>)),
  };
  out.images = v45Plain(composed.images);

  const requests: unknown[] = [];
  const executed = await executeV45Images(
    makeInput(),
    {
      async generate(request: V45ImageRequest) {
        requests.push(projectRequest(request));
        return {
          provider: request.provider,
          bytes: new Uint8Array([137, 80, 78, 71]),
          mimeType: "image/png",
          extension: "png",
          seed: request.seed,
          width: request.width,
          height: request.height,
          requestId: `fake-${requests.length}`,
          providerMetadata: {},
          providerRef: request.providerRef,
        };
      },
    },
    { prepare: async (ref) => ({ prepared: ref }) },
    createV45ComposeRuntime(kit.core),
  );
  out.execute = {
    requests,
    images: (executed.result.images as Record<string, unknown>[]).map(projectImage),
    events: v45Plain(executed.events.map(({ session: _s, ...e }) => e)),
  };
  return out;
}
