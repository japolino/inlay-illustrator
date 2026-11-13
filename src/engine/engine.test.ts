// Generator: bun tmp-audit/upstream/harness/rec-engine.mjs (AM_VER=990 reproduces the previous 0.9.90 fixtures exactly)
// (runs the ORIGINAL 0.9.91 bundle wired like Asset Maid's boot code, n90.p120 @187600-187642, with the same driver).
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createAssetMaidEngine } from "./engine";
import { setEngineEnv } from "./core/env";
import { seededEnv } from "./testing/env";
import { runEngineScenario, type EngineE2EScenario } from "./testing/engine-e2e";

const dir = path.join(import.meta.dir, "__fixtures__", "engine");
const names: string[] = JSON.parse(fs.readFileSync(path.join(dir, "e2e.index.json"), "utf8"));

describe("createAssetMaidEngine end to end (analyzer -> compose -> image requests)", () => {
  for (const name of names) {
    test(name, async () => {
      const { scenario, expected } = JSON.parse(fs.readFileSync(path.join(dir, `e2e.${name}.json`), "utf8")) as {
        scenario: EngineE2EScenario;
        expected: Record<string, unknown>;
      };
      setEngineEnv(seededEnv(scenario.seed));
      try {
        const actual = await runEngineScenario(
          (deps) => createAssetMaidEngine({ ...deps, getRetryCount: () => 5, getIntervalMs: () => 0 }),
          scenario,
        );
        expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
      } finally {
        setEngineEnv(null);
      }
    });
  }
});
