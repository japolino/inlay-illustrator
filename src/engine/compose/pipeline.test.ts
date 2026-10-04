// Fixtures: bun C:/Users/eme4/asset-maid-port/scratch/engine/compose/gen-pipeline.mjs  (runs the ORIGINAL bundle)
// End-to-end v4-5 compose parity: validated plan -> continuity apply -> frames -> prompt plan -> provider prompt
// -> NSFW policy -> seed/size -> ImageRequest captured at the provider adapter boundary.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as core from "../core/asset-maid-core";
import { setEngineEnv } from "../core/env";
import { seededEnv } from "../testing/env";
import { runV45ComposeScenario, type V45ComposeCoreFns, type V45ComposeScenario } from "./testing/v45-scenario";

const fns: V45ComposeCoreFns = {
  createV45Orchestrator: core.createV45Orchestrator,
  createPromptCompiler: core.createPromptCompiler,
  createGenerationSessions: core.createGenerationSessions,
  createGenerationBatchExecutor: core.createGenerationBatchExecutor,
  createImageGenerationDispatcher: core.createImageGenerationDispatcher,
  createProviderQueues: core.createProviderQueues,
  createV45RuleRuntime: core.createV45RuleRuntime,
  compileCustomV45Catalog: core.compileCustomV45Catalog,
  NOVELAI_V45_RAW_CATALOG: core.NOVELAI_V45_RAW_CATALOG,
  NOVELAI_DEFAULTS: core.NOVELAI_DEFAULTS,
};

const dir = join(import.meta.dir, "../__fixtures__/compose");
const files = readdirSync(dir).filter((f) => f.startsWith("v45-pipeline-")).sort();
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

describe("compose v4-5 pipeline parity", () => {
  for (const file of files) {
    const fx = JSON.parse(readFileSync(join(dir, file), "utf8")) as { cases: { scenario: V45ComposeScenario; expected: unknown }[] };
    for (const c of fx.cases) {
      test(c.scenario.name, async () => {
        setEngineEnv(seededEnv(c.scenario.seed));
        try {
          const outcome = await runV45ComposeScenario(fns, c.scenario);
          expect(plain(outcome)).toEqual(c.expected);
        } finally {
          setEngineEnv(null);
        }
      });
    }
  }
});
