// Fixture generator: bun C:/Users/eme4/asset-maid-port/scratch/engine/v45/gen-analyzer.mjs
// (runs the same scenarios through the ORIGINAL bundle with src/engine/v45/testing/analyzer-replay.ts)
import { afterEach, describe, expect, test } from "bun:test";
import { setEngineEnv } from "../core/env";
import { seededEnv } from "../testing/env";
import index from "../__fixtures__/v45/analyzer.index.json";
import {
  AnalyzerClientError,
  assertAnalyzerReady,
  buildV45SingleStageRequest,
  createV45AnalyzerEngine,
  createV45AnalyzerRunner,
  findV45ResponseIllustrations,
  renderV45SystemPrompt,
  resolveAnalyzerExecutionMode,
  resolveCheckpointPolicy,
  resolveGenerationType,
  toV45CandidateKey,
  analyzerCheckpointKey,
  type V45AnalyzerClient,
} from "./analyzer";
import { replayScenario, type RecordedRun, type ReplayKit, type ReplayScenario } from "./testing/analyzer-replay";
import type { AnalyzerContext } from "../context/types";

interface ScenarioFixture {
  scenario: ReplayScenario;
  recorded: RecordedRun[];
}

const load = (name: string): ScenarioFixture => require(`../__fixtures__/v45/analyzer.${name}.json`) as ScenarioFixture;

const kit: ReplayKit = {
  createEngine: () => createV45AnalyzerEngine() as never,
  createRunner: (engine, client) => createV45AnalyzerRunner(engine as never, client as V45AnalyzerClient) as never,
  makeClientError: (message, options) => new AnalyzerClientError(message, options),
};

afterEach(() => {
  setEngineEnv(null);
});

describe("v45 analyzer runner parity (fake client)", () => {
  for (const name of index.scenarios) {
    test(`scenario ${name}`, async () => {
      const fx = load(name);
      setEngineEnv(seededEnv(index.seed));
      const recorded = await replayScenario(kit, fx.scenario);
      expect(recorded.length).toBe(fx.recorded.length);
      for (let i = 0; i < recorded.length; i++) {
        const got = recorded[i]!;
        const want = fx.recorded[i]!;
        expect(got.label).toBe(want.label);
        // exact prompt texts first (clear diff on failure), then everything
        expect(got.calls.length).toBe(want.calls.length);
        for (let c = 0; c < got.calls.length; c++) expect(JSON.stringify(got.calls[c])).toBe(JSON.stringify(want.calls[c]));
        expect(got.error).toEqual(want.error);
        expect(got.result).toEqual(want.result);
        expect(got.events).toEqual(want.events);
        expect(got.progress).toEqual(want.progress);
        expect(got.hooks).toEqual(want.hooks);
        expect(got.scriptLeft).toBe(want.scriptLeft);
      }
    }, 20000);
  }
});

describe("v45 analyzer builders and helpers", () => {
  const fx = load("single-stage");
  const firstCall = fx.recorded[0]!.calls[0] as { messages: { role: string; content: string }[] };
  const context = (fx.scenario.baseInput as { context: AnalyzerContext }).context;

  test("system prompt and single-stage request equal the recorded illustration call", () => {
    expect(renderV45SystemPrompt("illustration")).toBe(firstCall.messages[0]!.content);
    const request = buildV45SingleStageRequest(JSON.parse(JSON.stringify(context)));
    expect(JSON.stringify(request)).toBe(firstCall.messages[1]!.content);
  });

  test("candidate keys and lenient illustration lookup", () => {
    expect(toV45CandidateKey("lore:alice")).toBe("actor.g00nx3.1d3zc2v");
    const fenced = "```json\n" + JSON.stringify({ data: { illustrations: [{ slot_number: 0, modifiers: {} }] } }) + "\n```";
    expect(findV45ResponseIllustrations(fenced).length).toBe(1);
    expect(analyzerCheckpointKey({ generationProvider: "novelai", chatKey: "c", messageId: "m" })).toBe("novelai:c:m");
  });

  test("policy helpers", () => {
    expect(resolveAnalyzerExecutionMode({ catalogSource: "default", requestedMode: "single-stage" })).toBe("single-stage");
    expect(resolveAnalyzerExecutionMode({ catalogSource: "custom", requestedMode: "single-stage" })).toBe("two-stage");
    expect(resolveCheckpointPolicy("automatic")).toBe("restart-analysis");
    expect(resolveCheckpointPolicy("regenerate")).toBe("reuse-plan");
    expect(resolveCheckpointPolicy("retry")).toBe("resume");
    expect(resolveGenerationType("retry", false)).toBe("illustration-retry");
    expect(resolveGenerationType("initial", true, true)).toBe("ai-prompt-edit");
    expect(
      assertAnalyzerReady({ analysisProfile: "v4-5", freeCharacterGenerationEnabled: false, requiresSourceReadiness: false, analyzerIdentityCandidates: [], analyzerPersonaCandidates: [] }),
    ).toBe("no-candidates");
    expect(
      assertAnalyzerReady({ analysisProfile: "v5-hybrid", freeCharacterGenerationEnabled: false, requiresSourceReadiness: false, analyzerIdentityCandidates: [] }),
    ).toBe("ready");
  });
});
