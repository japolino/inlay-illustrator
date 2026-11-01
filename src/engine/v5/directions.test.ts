// Fixtures: bun S/engine-build/gen/v5/directions.mjs (ORIGINAL 0.9.90 bundle; S = the am990 scratch dir)
import { describe, expect, test } from "bun:test";
import fixture from "../__fixtures__/v5/directions.json";
import inputs from "../__fixtures__/v5/inputs.json";
import {
  applyAnalysisToRunInput,
  assertDirectingRules,
  buildV5AnalyzerRequest,
  createDefaultAnalysisDocument,
  resolveAnalysisDirections,
  resolveAnalysisDocument,
  resolveAnalysisExecution,
  resolveStoredAnalysisDocument,
  resolveV5UserDirections,
  validateAnalysisDocument,
} from "./analyzer";
import { compileActiveAtelierPresetCatalog } from "./catalog";
import { createV5RuleRuntime } from "./runtime";

/* eslint-disable @typescript-eslint/no-explicit-any */
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const catalog = compileActiveAtelierPresetCatalog(null).catalog;
const runtime = createV5RuleRuntime({ catalog });

describe("v5 image-ratio candidates (allowedSizeIds, custom sizes, fixed size)", () => {
  for (const c of fixture.cases as any[]) {
    test(c.name, () => {
      const directions = resolveV5UserDirections(c.run);
      expect(plain(directions)).toEqual(c.expected.directions);
      let request: unknown;
      try {
        const build = buildV5AnalyzerRequest({ runtime, context: inputs.context as any, userDirections: directions });
        const payload = build.request.payload as any;
        request = { ok: { sizes: payload.analyzer_catalog?.sizes, imageRatio: payload.user_directions?.image_ratio ?? null } };
      } catch (e) {
        request = { error: { message: (e as Error).message } };
      }
      expect(plain(request)).toEqual(c.expected.request);
    });
  }
});

const attempt = (f: () => unknown) => {
  try {
    return plain(f());
  } catch (e) {
    return { error: (e as Error).message };
  }
};

describe("v5 directing document (0.9.90)", () => {
  test("default document", () => {
    expect(plain(createDefaultAnalysisDocument())).toEqual(fixture.defaultDocument);
  });

  for (const [name, d] of Object.entries(fixture.documents as Record<string, any>)) {
    test(`stored config: ${name}`, () => {
      const cfg = d.config;
      expect(attempt(() => resolveStoredAnalysisDocument(cfg))).toEqual(d.stored);
      expect(attempt(() => resolveAnalysisDocument(cfg))).toEqual(d.effective);
      expect(attempt(() => resolveAnalysisExecution(cfg))).toEqual(d.execution);
      expect(attempt(() => resolveAnalysisDirections(cfg))).toEqual(d.analysis);
      expect(attempt(() => applyAnalysisToRunInput({ novelAIConfig: { model: "x" }, requestedSizeId: 1 }, resolveAnalysisDirections(cfg)))).toEqual(d.applied);
      const doc = resolveAnalysisDocument(cfg);
      let rules: unknown = "ok";
      try {
        assertDirectingRules(doc, catalog, doc.scene.selected);
      } catch (e) {
        rules = { error: (e as Error).message };
      }
      expect(rules).toEqual(d.rules);
    });
  }

  test("invalid document", () => {
    expect(() => validateAnalysisDocument({ scene: 1 })).toThrow((fixture.invalidDocument as { error: string }).error);
  });
});
