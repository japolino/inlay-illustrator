// Fixtures: S/engine-build/gen/compose-units.mjs (runs the ORIGINAL 0.9.90 bundle; S = the am990 scratch dir)
import { describe, expect, test } from "bun:test";
import { toPlain } from "../testing/plain";
import { setEngineEnv } from "../core/env";
import { seededEnv } from "../testing/env";
import weightsFx from "../__fixtures__/compose/weights.json";
import ratingFx from "../__fixtures__/compose/rating.json";
import coordFx from "../__fixtures__/compose/coordinates.json";
import sizeFx from "../__fixtures__/compose/size-count-seed.json";
import fmtFx from "../__fixtures__/compose/formatters.json";
import {
  applyAiChoiceCoordinates,
  applyNonArtistWeightToPrompt,
  applyNonArtistWeightToRequest,
  applyNovelAIPromptWeight,
  applyRatingPolicy,
  attachActorIdsToCharacterPrompts,
  BUNDLED_COMFY_WORKFLOW_PROFILE,
  createSeedResolver,
  formatAnimaFlatPrompt,
  formatProviderPrompt,
  IMAGE_PROVIDER_TABLE,
  normalizeImageCountPolicy,
  normalizeRatingTag,
  parseAnimaPromptNodes,
  prependRatingTag,
  randomSeed,
  RATING_TAGS,
  resolveFixedRating,
  resolveImageCountConstraint,
  resolveImageSize,
  toNovelAICharacterCaptions,
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
  test("applyNovelAIPromptWeight (x4)", () => {
    for (const c of weightsFx.weight as any[]) expect(plain(capture(() => applyNovelAIPromptWeight(c.input[0], c.input[1])))).toEqual(c.expected);
  });
  test("applyNonArtistWeightToPrompt (Bft)", () => {
    for (const c of weightsFx.nonArtist as any[])
      expect(plain(capture(() => applyNonArtistWeightToPrompt(clone(c.input.prompt), clone(c.input.config), c.input.segments)))).toEqual(c.expected);
  });
  test("applyNonArtistWeightToRequest (Hft)", () => {
    for (const c of weightsFx.requestWeight as any[]) expect(plain(capture(() => applyNonArtistWeightToRequest(clone(c.input.body), clone(c.input.config))))).toEqual(c.expected);
  });
});

describe("compose/rating", () => {
  test("applyRatingPolicy (XG)", () => {
    for (const c of ratingFx.policy as any[]) expect(plain(capture(() => applyRatingPolicy(clone(c.input.prompt), c.input.rating, c.input.actorCount)))).toEqual(c.expected);
  });
  test("prependRatingTag (OG)", () => {
    for (const c of ratingFx.prepend as any[]) expect(plain(capture(() => prependRatingTag(c.input[0], c.input[1])))).toEqual(c.expected);
  });
  test("resolveFixedRating (yS) / normalizeRatingTag (O8) / RATING_TAGS (vC)", () => {
    for (const c of ratingFx.fixed as any[]) expect(plain(capture(() => resolveFixedRating(c.input)))).toEqual(c.expected);
    for (const c of ratingFx.normalize as any[]) expect(plain(capture(() => normalizeRatingTag(c.input)))).toEqual(c.expected);
    expect([...RATING_TAGS]).toEqual(ratingFx.ratingTags);
  });
});

describe("compose/coordinates", () => {
  test("toNovelAICharacterCaptions (Wye)", () => {
    for (const c of coordFx.captions as any[]) expect(plain(capture(() => toNovelAICharacterCaptions(c.input.chars, c.input.key, c.input.v5)))).toEqual(c.expected);
  });
  test("applyAiChoiceCoordinates (Vye)", () => {
    for (const c of coordFx.aiChoice as any[]) expect(plain(capture(() => applyAiChoiceCoordinates(clone(c.input[0]), c.input[1])))).toEqual(c.expected);
  });
  test("attachActorIdsToCharacterPrompts (bht)", () => {
    for (const c of coordFx.attach as any[]) expect(plain(capture(() => attachActorIdsToCharacterPrompts(clone(c.input[0]), c.input[1])))).toEqual(c.expected);
  });
});

describe("compose/size-count-seed", () => {
  test("resolveImageSize (aC)", () => {
    for (const c of sizeFx.sizes as any[]) expect(plain(capture(() => resolveImageSize(c.input[0], c.input[1])))).toEqual(c.expected);
  });
  test("normalizeImageCountPolicy (Uf)", () => {
    for (const c of sizeFx.countPolicies as any[]) {
      const [v, f, m] = c.input;
      const actual = f === null ? capture(() => normalizeImageCountPolicy(nul(v))) : capture(() => normalizeImageCountPolicy(nul(v), f, m));
      expect(plain(actual)).toEqual(c.expected);
    }
  });
  test("resolveImageCountConstraint ($Ae)", () => {
    for (const c of sizeFx.countConstraints as any[]) expect(plain(capture(() => resolveImageCountConstraint(nul(c.input[0]), c.input[1])))).toEqual(c.expected);
  });
  test("createSeedResolver (Oxe) with seeded env", () => {
    for (const c of sizeFx.seeds as any[]) {
      setEngineEnv(seededEnv(c.input.envSeed));
      try {
        expect(plain(capture(() => createSeedResolver().resolve(c.input.items)))).toEqual(c.expected);
      } finally {
        setEngineEnv(null);
      }
    }
  });
  test("randomSeed (w4) with seeded env", () => {
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
  test("bundled profile and provider table equal the original", () => {
    expect(plain(toPlain(BUNDLED_COMFY_WORKFLOW_PROFILE))).toEqual(fmtFx.bundledProfile);
    expect(plain(toPlain(IMAGE_PROVIDER_TABLE))).toEqual(fmtFx.providerTable);
  });
  test("formatProviderPrompt (UG)", () => {
    for (const c of fmtFx.formatter as any[]) {
      const input = { ...clone(c.input) } as ProviderPromptInput & { comfyUIProfile?: any };
      if (typeof input.comfyUIProfile === "string") input.comfyUIProfile = profiles[input.comfyUIProfile] as any;
      expect(plain(capture(() => formatProviderPrompt(input)))).toEqual(c.expected);
    }
  });
  test("parseAnimaPromptNodes (fxe)", () => {
    for (const c of fmtFx.anima as any[]) expect(plain(capture(() => parseAnimaPromptNodes(c.input[0], c.input[1], c.input[2])))).toEqual(c.expected);
  });
  test("formatAnimaFlatPrompt (MG)", () => {
    for (const c of fmtFx.animaFlat as any[]) expect(plain(capture(() => formatAnimaFlatPrompt(clone(c.input))))).toEqual(c.expected);
  });
});
