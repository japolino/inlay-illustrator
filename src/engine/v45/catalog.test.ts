// Fixture generator: bun C:/Users/eme4/asset-maid-port/scratch/engine/v45/gen-catalog.mjs
import { describe, expect, test } from "bun:test";
import fixture from "../__fixtures__/v45/catalog.json";
import { Lp as shortHash, nd as stableStringify } from "../core/asset-maid-core";
import {
  NOVELAI_V45_RAW_CATALOG,
  compileV45Catalog,
  createCatalogSourceResolver,
  createV45RuleRuntime,
  getDefaultV45Catalog,
  getV45AnalyzerProjection,
  getV45AnalyzerProjectionFingerprint,
  listV45SizePresets,
  summarizeV45Catalog,
} from "./catalog";
import { v45Plain } from "./plain";

const fp = (v: unknown): string => shortHash(stableStringify(v45Plain(v)));

describe("v45 catalog parity", () => {
  const rt = createV45RuleRuntime();
  const cat = rt.catalog;

  test("compiler version, hashes, stats", () => {
    expect(cat.compilerVersion).toBe(fixture.compilerVersion);
    expect(v45Plain(cat.hashes)).toEqual(fixture.hashes);
    expect(v45Plain(cat.stats)).toEqual(fixture.stats);
    expect(cat.diagnostics.length).toBe(fixture.diagnosticsCount);
  });

  test("State loaded summary + analyzer projection fingerprints", () => {
    const s = summarizeV45Catalog();
    expect(s.presets).toBe(fixture.stateLoaded.presets);
    expect(s.modifiers).toBe(fixture.stateLoaded.modifiers);
    expect(v45Plain(s.analyzer)).toEqual(fixture.summary);
    expect(getV45AnalyzerProjectionFingerprint("all")).toBe(fixture.analyzerProjectionFingerprints.all);
    expect(getV45AnalyzerProjectionFingerprint("solo-reference")).toBe(fixture.analyzerProjectionFingerprints["solo-reference"]);
    expect(rt.wireIds.complete).toBe(fixture.wireIdsComplete);
  });

  test("table fingerprints and counts", () => {
    expect({
      wireIds: fp(rt.wireIds),
      analyzerProjection: fp(getV45AnalyzerProjection(rt)),
      sizes: fp(cat.sizes),
      definitions: fp(cat.definitions),
      options: fp(cat.options),
      presetNodes: fp(cat.presetNodes),
      continuity: fp(cat.continuity),
      rulesByPhase: fp(cat.rulesByPhase),
      weights: fp(cat.weights),
    }).toEqual(fixture.fingerprints);
    expect({
      sizes: cat.sizes.size,
      definitions: cat.definitions.size,
      options: cat.options.size,
      presetNodes: cat.presetNodes.size,
      presetPaths: cat.presetPaths.length,
    }).toEqual(fixture.counts);
    expect(fp(cat.presetPaths)).toBe(fixture.presetPathsFingerprint);
    expect(cat.presetPaths.map((p) => p.key)).toEqual(fixture.presetPathKeys);
  });

  test("spot checks: sizes, continuity groups, definitions", () => {
    expect(v45Plain(cat.sizes)).toEqual(fixture.sizes);
    expect(listV45SizePresets().map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
    expect(v45Plain(cat.continuity)).toEqual(fixture.continuity);
    expect([...cat.definitions.keys()].slice(0, 40)).toEqual(fixture.spot.definitionIds);
    expect(v45Plain([...cat.definitions.values()][0])).toEqual(fixture.spot.firstDefinition);
  });

  test("recompiling the raw literal reproduces the source hash; default catalog is memoised", () => {
    expect(getDefaultV45Catalog()).toBe(cat);
    const again = compileV45Catalog(structuredClone(NOVELAI_V45_RAW_CATALOG));
    expect(v45Plain(again.hashes)).toEqual(fixture.hashes);
  });

  test("catalog source resolver: empty -> default, invalid JSON -> default + warning", () => {
    const resolver = createCatalogSourceResolver();
    const d = resolver.resolve("");
    expect(d.source).toBe("default");
    expect(d.ruleRuntime).toBe(rt);
    const bad = resolver.resolve("{not json");
    expect(bad.source).toBe("default");
    expect(bad.warning.length).toBeGreaterThan(0);
  });
});
