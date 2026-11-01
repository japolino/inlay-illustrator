import { describe, expect, test } from "bun:test";
import * as core from "./asset-maid-core";
import rawConfigJson from "./data/v5-raw-config.json";
import normalizedRawConfigJson from "./data/v5-normalized-raw-config.json";
import defaultPresetJson from "./data/default-preset.json";
import expected from "../__fixtures__/core/v5-catalog-hashes.json";
import { setEngineEnv } from "./env";
import { seededEnv } from "../testing/env";

describe("generated Asset Maid 0.9.90 core", () => {
  test("bundled V5 raw config (Gl) and its normalized copy (Od) equal the shipped dumps", () => {
    expect(JSON.parse(JSON.stringify(core.NOVELAI_V5_RAW_CONFIG))).toEqual(rawConfigJson);
    expect(JSON.parse(JSON.stringify(core.NOVELAI_V5_NORMALIZED_RAW_CONFIG))).toEqual(normalizedRawConfigJson);
  });

  test("built-in Atelier preset list (r2) and bundled default preset document (nw)", () => {
    expect(JSON.parse(JSON.stringify(core.BUILTIN_ATELIER_PRESETS))).toEqual(defaultPresetJson.builtin);
    expect(JSON.parse(JSON.stringify(core.DEFAULT_ATELIER_PRESET_DOCUMENT))).toEqual(defaultPresetJson.document);
  });

  test("compiled bundled catalog and default preset catalog reproduce the original hashes", () => {
    const catalog = core.getDefaultNovelAIV5Catalog();
    expect(catalog.compilerVersion).toBe(expected.compilerVersion);
    expect(catalog.hashes).toEqual(expected.bundled);
    expect(core.computeCatalogFingerprint(catalog)).toBe(expected.bundledFingerprint);
    const preset = core.compileActiveAtelierPreset(core.selectActiveAtelierPreset({}));
    expect(preset.catalog.hashes).toEqual(expected.defaultPreset);
    expect(core.computeCatalogFingerprint(preset.catalog)).toBe(expected.defaultPresetFingerprint);
  });

  test("compiling the shipped normalized JSON gives the bundled hashes", () => {
    expect(core.compileNovelAIV5Catalog(normalizedRawConfigJson).hashes).toEqual(expected.bundled);
  });

  test("amEnv routes randomness through the injected source", () => {
    setEngineEnv(seededEnv(7));
    try {
      const a = core.randomSeed();
      setEngineEnv(seededEnv(7));
      expect(core.randomSeed()).toBe(a);
    } finally {
      setEngineEnv(null);
    }
  });
});
