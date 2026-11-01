// Parity fixtures: src/engine/__fixtures__/v5/runtime.{cases-a,cases-b,errors}.json (+ inputs.json)
// Generator: bun S/engine-build/gen/v5/inputs.mjs && bun S/engine-build/gen/v5/runtime.mjs (ORIGINAL 0.9.90 bundle,
// default Atelier preset catalog)
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import casesA from "../__fixtures__/v5/runtime.cases-a.json";
import casesB from "../__fixtures__/v5/runtime.cases-b.json";
import errors from "../__fixtures__/v5/runtime.errors.json";
import inputs from "../__fixtures__/v5/inputs.json";
import { setEngineEnv } from "../core/env";
import { seededEnv } from "../testing/env";
import { toPlain } from "../testing/plain";
import { buildV5PromptContext, type V5PromptContextSource } from "./compose";
import { compileActiveAtelierPresetCatalog } from "./catalog";
import { compileV5Scene, createV5RuleRuntime, planV5Scene, toV5ContinuitySnapshot, type V5ContinuityState } from "./runtime";
import type { V5RuleContext, V5SceneGraph } from "./types";

const plain = (v: unknown) => JSON.parse(JSON.stringify(toPlain(v)));

interface Case {
  name: string;
  input: {
    graph: V5SceneGraph;
    sourceKeys: Record<string, string>;
    provider: V5RuleContext["provider"];
    stateIn: V5ContinuityState;
    previousState: V5ContinuityState | null;
    token: string;
    index: number;
    requestedSizeId?: number;
    allowedSizeIds?: number[];
    scenePresetId?: string;
  };
  expected: Record<string, unknown>;
}

beforeAll(() => setEngineEnv(seededEnv(31)));
afterAll(() => setEngineEnv(null));

const catalog = compileActiveAtelierPresetCatalog(null).catalog;

describe("v5 rule runtime / scene compiler / prompt projection", () => {
  test("runtime exposes the catalog and fingerprint", () => {
    const rt = createV5RuleRuntime();
    expect(rt.catalog.compilerVersion).toBe("novelai-v5-catalog-v3");
    expect(rt.catalogFingerprint.startsWith("v5.fnv1a64-")).toBe(true);
    const preset = createV5RuleRuntime({ catalog });
    expect(preset.catalog).toBe(catalog);
    expect(preset.catalogFingerprint).not.toBe(rt.catalogFingerprint);
  });

  for (const c of [...casesA, ...casesB] as unknown as Case[]) {
    test(`plan scene: ${c.name}`, () => {
      const i = c.input;
      const promptContext = buildV5PromptContext({
        graph: i.graph,
        candidateSourceKeys: i.sourceKeys,
        context: inputs.promptContext as unknown as V5PromptContextSource,
        scenePresetId: i.scenePresetId,
        selectedOutfitIds: {},
        preparedOutfits: {},
        selectedOutfitIdsByOccurrence: {},
        preparedOutfitsByOccurrence: {},
      });
      expect(plain(promptContext)).toEqual(c.expected.promptContext);
      const out = planV5Scene({
        graph: i.graph,
        promptContext,
        selectionKey: `msg-1:${i.token}:${i.index}`,
        provider: i.provider,
        state: i.stateIn,
        previousState: i.previousState ?? undefined,
        eventScopeId: `session-1:${i.token}`,
        requestedSizeId: i.requestedSizeId,
        allowedSizeIds: i.allowedSizeIds,
        advanceTurn: true,
        catalog,
      });
      expect(plain(out.ruleContext)).toEqual(c.expected.ruleContext);
      expect(plain(out.draft)).toEqual(c.expected.draft);
      expect(plain(out.applied)).toEqual(c.expected.applied);
      expect(plain(out.reconciled)).toEqual(c.expected.reconciled);
      expect(plain(out.promptPlan)).toEqual(c.expected.promptPlan);
      expect(plain(out.state)).toEqual(c.expected.state);
      expect(plain(toV5ContinuitySnapshot(out.state))).toEqual(c.expected.snapshot);
    });
  }

  for (const e of errors as unknown as { name: string; graph: V5SceneGraph; ruleContext: V5RuleContext; result: unknown; error: { message: string } | null }[]) {
    test(`compile edge case: ${e.name}`, () => {
      if (e.error) {
        expect(() => compileV5Scene(e.graph, e.ruleContext, catalog)).toThrow(e.error.message);
      } else {
        expect(plain(compileV5Scene(e.graph, e.ruleContext, catalog))).toEqual(e.result);
      }
    });
  }
});
