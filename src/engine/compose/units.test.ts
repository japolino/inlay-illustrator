// Fixtures: bun C:/Users/eme4/asset-maid-port/scratch/engine/compose/gen-units.mjs  (runs the ORIGINAL bundle)
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toPlain } from "../testing/plain";
import { setEngineEnv } from "../core/env";
import { seededEnv } from "../testing/env";
import weightsFx from "../__fixtures__/compose/weights.json";
import nsfwFx from "../__fixtures__/compose/nsfw.json";
import coordFx from "../__fixtures__/compose/coordinates.json";
import sizeFx from "../__fixtures__/compose/size-count-seed.json";
import fmtFx from "../__fixtures__/compose/formatters.json";
import {
  applyAiChoiceCoordinates,
  applyNonArtistWeightToPrompt,
  applyNonArtistWeightToRequest,
  applyNovelAIPromptWeight,
  applyNsfwPrefixPolicy,
  applyRequestedSizeToPlan,
  attachActorIdsToCharacterPrompts,
  BUNDLED_COMFY_WORKFLOW_PROFILE,
  createDefaultPromptCompiler,
  createSeedResolver,
  createV45NovelAIConfig,
  formatAnimaFlatPrompt,
  formatProviderPrompt,
  normalizeImageCountPolicy,
  parseAnimaPromptNodes,
  prependNsfwTag,
  randomSeed,
  resolveImageCountConstraint,
  resolveImageSize,
  toNovelAICharacterCaptions,
  type PromptBuildSpec,
  type PromptInputs,
  type ProviderPromptInput,
} from "./index";

/* eslint-disable @typescript-eslint/no-explicit-any */
function capture(fn: () => unknown): unknown {
  try {
    return { ok: toPlain(fn()) };
  } catch (e) {
    const err = e as { name?: string; message?: string; code?: string };
    return { error: { name: err?.name, message: err?.message, code: err?.code } };
  }
}
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const nul = (v: unknown) => (v === null ? undefined : v);

describe("compose/weights", () => {
  test("applyNovelAIPromptWeight (s2)", () => {
    for (const c of weightsFx.weight as any[]) expect(plain(capture(() => applyNovelAIPromptWeight(c.input[0], c.input[1])))).toEqual(c.expected);
  });
  test("applyNonArtistWeightToPrompt (Put)", () => {
    for (const c of weightsFx.nonArtist as any[])
      expect(plain(capture(() => applyNonArtistWeightToPrompt(clone(c.input.prompt), clone(c.input.config), c.input.segments)))).toEqual(c.expected);
  });
  test("applyNonArtistWeightToRequest (Cut)", () => {
    for (const c of weightsFx.requestWeight as any[]) expect(plain(capture(() => applyNonArtistWeightToRequest(clone(c.input.body), clone(c.input.config))))).toEqual(c.expected);
  });
});

describe("compose/nsfw", () => {
  test("applyNsfwPrefixPolicy (C7)", () => {
    for (const c of nsfwFx.nsfw as any[]) expect(plain(capture(() => applyNsfwPrefixPolicy(clone(c.input.prompt), c.input.force, c.input.actorCount)))).toEqual(c.expected);
  });
  test("prependNsfwTag (d7)", () => {
    for (const c of nsfwFx.prepend as any[]) expect(plain(capture(() => prependNsfwTag(c.input)))).toEqual(c.expected);
  });
});

describe("compose/coordinates", () => {
  test("createV45NovelAIConfig (Mht)", () => {
    for (const c of coordFx.coords as any[])
      expect(plain(capture(() => createV45NovelAIConfig(clone(c.input.config), c.input.plan, c.input.actors, c.input.seed, c.input.force)))).toEqual(c.expected);
  });
  test("toNovelAICharacterCaptions (hge)", () => {
    for (const c of coordFx.captions as any[]) expect(plain(capture(() => toNovelAICharacterCaptions(c.input.chars, c.input.key, c.input.v5)))).toEqual(c.expected);
  });
  test("applyAiChoiceCoordinates (c7)", () => {
    for (const c of coordFx.aiChoice as any[]) expect(plain(capture(() => applyAiChoiceCoordinates(clone(c.input[0]), c.input[1])))).toEqual(c.expected);
  });
  test("attachActorIdsToCharacterPrompts (cht)", () => {
    for (const c of coordFx.attach as any[]) expect(plain(capture(() => attachActorIdsToCharacterPrompts(clone(c.input[0]), c.input[1])))).toEqual(c.expected);
  });
});

describe("compose/size-count-seed", () => {
  test("resolveImageSize (cE)", () => {
    for (const c of sizeFx.sizes as any[]) expect(plain(capture(() => resolveImageSize(c.input[0], c.input[1])))).toEqual(c.expected);
  });
  test("applyRequestedSizeToPlan (zye)", () => {
    for (const c of sizeFx.requestedSize as any[]) expect(plain(capture(() => applyRequestedSizeToPlan(clone(c.input[0]), nul(c.input[1]))))).toEqual(c.expected);
  });
  test("normalizeImageCountPolicy (Gf)", () => {
    for (const c of sizeFx.countPolicies as any[]) {
      const [v, f, m] = c.input;
      const actual = f === null ? capture(() => normalizeImageCountPolicy(nul(v))) : capture(() => normalizeImageCountPolicy(nul(v), f, m));
      expect(plain(actual)).toEqual(c.expected);
    }
  });
  test("resolveImageCountConstraint (SW)", () => {
    for (const c of sizeFx.countConstraints as any[]) expect(plain(capture(() => resolveImageCountConstraint(nul(c.input[0]), c.input[1])))).toEqual(c.expected);
  });
  test("createSeedResolver (Pye) with seeded env", () => {
    for (const c of sizeFx.seeds as any[]) {
      setEngineEnv(seededEnv(c.input.envSeed));
      try {
        expect(plain(capture(() => createSeedResolver().resolve(c.input.items)))).toEqual(c.expected);
      } finally {
        setEngineEnv(null);
      }
    }
  });
  test("randomSeed (c2) with seeded env", () => {
    for (const c of sizeFx.randomSeeds as any[]) {
      setEngineEnv(seededEnv(c.envSeed));
      try {
        expect([randomSeed(), randomSeed(), randomSeed()]).toEqual(c.expected);
      } finally {
        setEngineEnv(null);
      }
    }
  });
});

describe("compose/provider prompt formatters", () => {
  const profiles: Record<string, unknown> = {
    "@bundled": BUNDLED_COMFY_WORKFLOW_PROFILE,
    "@restyler": {
      ...BUNDLED_COMFY_WORKFLOW_PROFILE,
      id: "restyler-test",
      revision: 3,
      metadata: { ...BUNDLED_COMFY_WORKFLOW_PROFILE.metadata, reference: { mode: "outfit-restyler", positivePrefix: "outfit restyle, " } },
    },
  };
  test("bundled profile equals the original", () => {
    expect(plain(toPlain(BUNDLED_COMFY_WORKFLOW_PROFILE))).toEqual(fmtFx.bundledProfile);
  });
  test("formatProviderPrompt (g2)", () => {
    for (const c of fmtFx.formatter as any[]) {
      const input = { ...clone(c.input) } as ProviderPromptInput & { comfyUIProfile?: any };
      if (typeof input.comfyUIProfile === "string") input.comfyUIProfile = profiles[input.comfyUIProfile] as any;
      expect(plain(capture(() => formatProviderPrompt(input)))).toEqual(c.expected);
    }
  });
  test("parseAnimaPromptNodes (Oge)", () => {
    for (const c of fmtFx.anima as any[]) expect(plain(capture(() => parseAnimaPromptNodes(c.input[0], c.input[1], c.input[2])))).toEqual(c.expected);
  });
  test("formatAnimaFlatPrompt (p7)", () => {
    for (const c of fmtFx.animaFlat as any[]) expect(plain(capture(() => formatAnimaFlatPrompt(clone(c.input))))).toEqual(c.expected);
  });
});

describe("compose/prompt compiler build (rule-IR)", () => {
  const dir = join(import.meta.dir, "../__fixtures__/compose");
  const files = readdirSync(dir).filter((f) => f.startsWith("prompt-plans-")).sort();
  const compiler = createDefaultPromptCompiler();
  for (const file of files) {
    const fx = JSON.parse(readFileSync(join(dir, file), "utf8")) as { cases: { name?: string; spec: PromptBuildSpec; inputs: PromptInputs; expected: unknown }[] };
    fx.cases.forEach((c, i) => {
      test(`${file} #${i} ${c.name ?? c.spec.presetId}`, () => {
        expect(plain(capture(() => compiler.build(clone(c.spec), clone(c.inputs))))).toEqual(c.expected);
      });
    });
  }
});
