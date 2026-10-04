import { describe, expect, test } from "bun:test";
import * as core from "./asset-maid-core";
import rawConfigJson from "./data/v5-raw-config.json";
import expectedHashes from "../__fixtures__/core/v5-catalog-hashes.json";
import { setEngineEnv } from "./env";
import { seededEnv } from "../testing/env";

describe("generated Asset Maid core", () => {
  test("built-in V5 raw config equals the shipped extract (extract/novelai/v5-raw-config.json)", () => {
    expect(JSON.parse(JSON.stringify(core.NOVELAI_V5_RAW_CONFIG))).toEqual(rawConfigJson);
  });

  test("compiled default V5 catalog reproduces the original hashes", () => {
    const catalog = core.getDefaultNovelAIV5Catalog();
    expect(catalog.compilerVersion).toBe("novelai-v5-catalog-v1");
    expect(catalog.hashes).toEqual(expectedHashes);
  });

  test("compiling the shipped JSON gives the same hashes as the built-in literal", () => {
    const catalog = core.compileNovelAIV5Catalog(rawConfigJson);
    expect(catalog.hashes).toEqual(expectedHashes);
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
