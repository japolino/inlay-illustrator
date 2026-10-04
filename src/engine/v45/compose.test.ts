// Fixture generator: bun C:/Users/eme4/asset-maid-port/scratch/engine/v45/gen-compose.mjs
// (the generator runs the same glue, src/engine/v45/compose.ts, with the ORIGINAL bundle's core injected;
//  plans come from the original analyzer engine over the context sample)
import { afterEach, describe, expect, test } from "bun:test";
import { setEngineEnv } from "../core/env";
import { seededEnv } from "../testing/env";
import index from "../__fixtures__/v45/compose.index.json";
import { PORT_COMPOSE_CORE, composeV45Images, planV45Images, type V45ComposeInput } from "./compose";
import { buildAnalyzerContextInputs } from "../context/context";
import { replayComposeScenario, type ComposeKit, type ComposeScenario } from "./testing/compose-replay";

const kit: ComposeKit = { core: PORT_COMPOSE_CORE, buildAnalyzerContextInputs: buildAnalyzerContextInputs as never };
const load = (name: string) => require(`../__fixtures__/v45/compose.${name}.json`) as { scenario: ComposeScenario; expected: Record<string, any> };

afterEach(() => {
  setEngineEnv(null);
});

describe("v45 compose parity (Tht + prompt compiler + executor)", () => {
  for (const name of index.scenarios) {
    test(name, async () => {
      const { scenario, expected } = load(name);
      setEngineEnv(seededEnv(index.seed));
      const got = (await replayComposeScenario(kit, scenario)) as Record<string, any>;
      // exact provider prompt strings first (readable diffs)
      for (let i = 0; i < expected.images.length; i++) {
        for (const provider of Object.keys(expected.images[i].providerPrompts)) {
          expect(got.images[i].providerPrompts[provider].positivePrompt).toBe(expected.images[i].providerPrompts[provider].positivePrompt);
          expect(got.images[i].providerPrompts[provider].negativePrompt).toBe(expected.images[i].providerPrompts[provider].negativePrompt);
        }
      }
      expect(got.plan).toEqual(expected.plan);
      expect(got.images).toEqual(expected.images);
      expect(got.execute.requests).toEqual(expected.execute.requests);
      expect(got.execute.images).toEqual(expected.execute.images);
      expect(got.execute.events).toEqual(expected.execute.events);
    }, 20000);
  }
});

describe("v45 compose behaviour", () => {
  const { scenario } = load(index.scenarios[0]!);
  const makeInput = (patch: Partial<V45ComposeInput> = {}): V45ComposeInput => {
    const m = buildAnalyzerContextInputs(structuredClone(scenario.contextInput) as never);
    return {
      ...(structuredClone(scenario.settings) as unknown as V45ComposeInput),
      analyzerResult: structuredClone(scenario.analyzerResult) as never,
      analyzerContext: structuredClone(scenario.analyzerContext) as never,
      promptInputs: m.promptInputs as never,
      previousCharacterStateMap: structuredClone(scenario.previousCharacterStateMap) as never,
      ...patch,
    };
  };

  test("novelai provider requires an API key (NOVELAI_API_KEY_REQUIRED)", async () => {
    const input = makeInput();
    input.novelAIConfig = { ...input.novelAIConfig, apiKey: "" };
    await expect(planV45Images(input)).rejects.toMatchObject({ code: "NOVELAI_API_KEY_REQUIRED" });
  });

  test("skipSourceImageTokens removes images; analyzer gets maxAttempts 1 and TA-stripped context", async () => {
    setEngineEnv(seededEnv(1));
    const r = await planV45Images(makeInput({ skipSourceImageTokens: ["slot:s2"], stateAccumulationEnabled: false }));
    expect(r.items.map((i) => i.sourceImageToken)).toEqual(["slot:s1"]);
    expect(r.analyzerInput.maxAttempts).toBe(1);
    expect(r.events.map((e) => e.phase)).toEqual(["planning", "generating", "applying-continuity", "complete"]);
  });

  test("composeV45Images: coordinates are automatic when forceAiChoiceCoordinates", async () => {
    setEngineEnv(seededEnv(2));
    const { images } = await composeV45Images(makeInput({ forceAiChoiceCoordinates: true }), { seed: 42, providers: ["novelai"] });
    const cfg = images[0]!.novelAIConfig as { seed: string; useCoords: boolean; characterPrompts: { coordinateMode?: string }[] };
    expect(cfg.seed).toBe("42");
    expect(cfg.useCoords).toBe(false);
    expect(cfg.characterPrompts.every((c) => c.coordinateMode === "automatic")).toBe(true);
    expect(Object.keys(images[0]!.providerPrompts)).toEqual(["novelai"]);
  });
});
