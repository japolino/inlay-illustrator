import { describe, expect, test } from "bun:test";
import parity from "./fixtures/config-parity.json" with { type: "json" };
import {
  buildRuntimeConfig,
  clearCharxOverrides,
  createDefaultConfig,
  DEFAULT_CONFIG,
  generationProviderFromLumiverse,
  loadChatImageGenerationSettings,
  mergeStoredConfig,
  normalizeChatImageGenerationSettings,
  normalizeConfig,
  normalizeConfigWithIssues,
  normalizeUiState,
  normalizeV5UserDirections,
  promptCodecForProvider,
  refreshCharxDirtyFields,
  resetAllCharxOverrides,
  resolveAllCharxSettings,
  resolveEffectiveCharxSettings,
  resolveEffectiveConfig,
  setCharxDefaults,
  setCharxOverride,
  splitConfigForStorage,
  type CharxScopeConfig,
  type CharxSettingsPatch,
} from "./config.js";
import { createEmptyCharacterDocument } from "./character.js";
import { UNLIMITED_IMAGE_COUNT } from "./chat.js";

type AnyRec = Record<string, any>;

describe("config defaults", () => {
  test("normalize({}) equals DEFAULT_CONFIG and is idempotent", () => {
    const c = normalizeConfig({});
    expect(c).toEqual(createDefaultConfig());
    expect(normalizeConfig(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG as any);
  });
  test("non-object input reports an issue", () => {
    expect(normalizeConfigWithIssues("x").issues[0]?.code).toBe("not-an-object");
  });
  test("storage split/merge round-trips", () => {
    const c = normalizeConfig({ ui: { language: "ko" }, analysis: { connectionId: "conn", model: "m", temperature: 1 }, image: { connectionId: "img", provider: "NovelAI", model: "nai-diffusion-4-5-full" }, novelai: { negativePrompt: "neg", steps: 30 }, characterPrompt: { artistPrompts: [{ id: "artist_1", title: "A", prompt: "p" }], fixedPositivePrompt: "fp" }, animaArtists: { entries: [{ id: "x", title: "X", text: "t" }], selection: { defaultId: "x" } } });
    const parts = splitConfigForStorage(c);
    expect(parts.model).not.toHaveProperty("novelai.negativePrompt");
    expect(JSON.stringify(splitConfigForStorage(createDefaultConfig()).model)).toBe("{}");
    expect(mergeStoredConfig(JSON.parse(JSON.stringify(parts)))).toEqual(c);
  });
});

describe("Lumiverse mapping", () => {
  test("provider kind and codec", () => {
    expect(generationProviderFromLumiverse("novelai")).toBe("novelai");
    expect(generationProviderFromLumiverse("comfyui")).toBe("comfy-ui");
    expect(generationProviderFromLumiverse("swarmui")).toBe("generic");
    expect(promptCodecForProvider("novelai")).toBe("novelai-structured");
    expect(promptCodecForProvider("comfy-ui")).toBe("anima-flat");
    expect(normalizeConfig({ image: { provider: "comfyui" } }).runtime.generationProvider).toBe("comfy-ui");
  });
  test("legacy AM analyzer fields map to reasoning, clamped", () => {
    const a = normalizeConfig({ analysis: { provider: "openai", thinkingMode: "on", thinkingLevel: "HIGH", temperature: 9, timeoutMs: 5 } }).analysis;
    expect(a.reasoning).toEqual({ mode: "custom", effort: "high" });
    expect(a.temperature).toBe(2);
    expect(a.timeoutMs).toBe(1000);
    expect(normalizeConfig({ analysis: { thinkingMode: "default" } }).analysis.reasoning.mode).toBe("inherit");
    expect(normalizeConfig({ analysis: { thinkingEnabled: true } }).analysis.reasoning.mode).toBe("custom");
  });
  test("legacy naiModel becomes the image model; V5 disables director reference", () => {
    const c = normalizeConfig({ novelai: { naiModel: "nai-diffusion-5-full", characterReferenceEnabled: true }, runtime: { generationProvider: "novelai" } });
    expect(c.image.model).toBe("nai-diffusion-5-full");
    expect(c.image.provider).toBe("novelai");
    expect(c.novelai.characterReferenceEnabled).toBe(false);
  });
  test("port clamps NovelAI parameters", () => {
    const n = normalizeConfig({ novelai: { steps: 99, scale: -1, cfgRescale: 3, sampler: "nope", noiseSchedule: "x", width: 10 } }).novelai;
    expect([n.steps, n.scale, n.cfgRescale, n.sampler, n.noiseSchedule, n.width]).toEqual([50, 0, 1, "k_euler_ancestral", "karras", 64]);
  });
  test("buildRuntimeConfig merges the character document", () => {
    const g = normalizeConfig({ image: { provider: "novelai" }, novelai: { characterReferenceEnabled: true } });
    const doc = createEmptyCharacterDocument("char1");
    doc.animaArtistId = "a1";
    const rc = buildRuntimeConfig(g, doc, { resolvedImageModel: "nai-diffusion-4-5-full" });
    expect(rc.novelai.naiModel).toBe("nai-diffusion-4-5-full");
    expect(rc.novelai.characterReferenceEnabled).toBe(true);
    expect(rc.characterPrompt.selectedSourceId).toBe("char1");
    expect(rc.characterPrompt.malePersonaPrompt).toBe("kazehaya shouta");
    expect(rc.animaArtists.selection.bySourceId.char1).toBe("a1");
    expect(buildRuntimeConfig(g, doc).novelai.characterReferenceEnabled).toBe(false);
  });
});

/** Fields shared between AM fEe output and the port config. */
function projectAm(c: AnyRec) {
  return {
    enabled: c.enabled,
    ui: { developerModeEnabled: c.ui.developerModeEnabled, floatingGenerationCountEnabled: c.ui.floatingGenerationCountEnabled, floatingGenerationCountPosition: c.ui.floatingGenerationCountPosition },
    analysis: { temperature: c.analysis.temperature, timeoutMs: c.analysis.timeoutMs },
    jevConnection: { rosterSelectionDefault: c.jevConnection.rosterSelectionDefault, model: c.jevConnection.model },
    novelai: { analysisProfile: c.novelai.analysisProfile, v5UserDirections: c.novelai.v5UserDirections, characterReferenceEnabled: c.novelai.characterReferenceEnabled, characterReferenceType: c.novelai.characterReferenceType, characterReferenceStrength: c.novelai.characterReferenceStrength },
    animaArtists: c.animaArtists,
    runtime: Object.fromEntries(["customImageSizes", "generationAutoRetryCount", "nsfwAlwaysEnabled", "novelaiParallelIntervalSec", "chatImageWidthPercent", "comfyuiCompletionTimeoutMs", "comfyuiCharacterReferenceEnabled", "comfyuiOutfitReferenceEnabled"].map((k) => [k, c.runtime[k]])),
    charxGenerationDefaults: c.characterPrompt.charxGenerationDefaults,
  };
}

describe("parity with Asset Maid fEe", () => {
  for (const [i, item] of (parity.configNormalize as AnyRec[]).entries()) {
    test(`case ${i}`, () => {
      const ours = normalizeConfig(item.input) as unknown as AnyRec;
      const expected = projectAm(item.output);
      const actual = projectAm(ours);
      // AM keeps raw (uncoerced) ui flags; the port coerces to booleans.
      expected.ui.developerModeEnabled = expected.ui.developerModeEnabled === true;
      expect(actual).toEqual(expected);
    });
  }
  for (const [i, item] of (parity.v5Directions as AnyRec[]).entries()) {
    test(`zPe case ${i}`, () => {
      expect(normalizeV5UserDirections(item.input ?? undefined)).toEqual(item.output);
    });
  }
});

describe("per-character override resolution parity (ki/xE/ONe/jNe/NNe/ENe/RNe)", () => {
  for (const [i, item] of (parity.charxOps as AnyRec[]).entries()) {
    test(`ops case ${i}`, () => {
      const base = normalizeConfig(item.raw);
      // AM stores overrides in the same config object; the port keeps them in the character document.
      let scope: CharxScopeConfig = {
        jevConnection: base.jevConnection,
        runtime: { customImageSizes: base.runtime.customImageSizes, nsfwAlwaysEnabled: base.runtime.nsfwAlwaysEnabled },
        novelai: { negativePrompt: base.novelai.negativePrompt },
        characterPrompt: { fixedPositivePrompt: base.characterPrompt.fixedPositivePrompt, charxGenerationDefaults: base.characterPrompt.charxGenerationDefaults, charxSettings: { overrides: JSON.parse(JSON.stringify(item.raw.characterPrompt?.charxSettings?.overrides ?? {})) } },
      };
      for (const op of item.ops as [string, ...any[]][]) {
        if (op[0] === "setOverride") scope = setCharxOverride(scope, op[1], op[2] as CharxSettingsPatch);
        else if (op[0] === "setDefaults") scope = setCharxDefaults(scope, op[1] as CharxSettingsPatch);
        else if (op[0] === "clear") scope = clearCharxOverrides(scope, op[1]);
        else if (op[0] === "resetAll") scope = resetAllCharxOverrides(scope);
        else if (op[0] === "refresh") scope = refreshCharxDirtyFields(scope, op[1]);
      }
      const got = JSON.parse(JSON.stringify(scope));
      expect(got.characterPrompt).toEqual(item.result.scope.characterPrompt);
      expect(got.novelai.negativePrompt).toEqual(item.result.scope.novelai.negativePrompt);
      expect(got.runtime.nsfwAlwaysEnabled).toEqual(item.result.scope.runtime.nsfwAlwaysEnabled);
      expect(resolveAllCharxSettings(scope)).toEqual(item.result.all);
      for (const id of ["c1", "c2", "c3"]) expect(resolveEffectiveCharxSettings(scope, id)).toEqual(item.result[id]);
    });
  }
  test("resolveEffectiveConfig with a document override", () => {
    const g = normalizeConfig({ characterPrompt: { charxGenerationDefaults: { negativePrompt: "global" } } });
    expect(resolveEffectiveConfig(g, { characterId: "c" }).negativePrompt).toBe("global");
    expect(resolveEffectiveConfig(g, { characterId: "c", override: { negativePrompt: "mine" } }).negativePrompt).toBe("mine");
  });
});

describe("chat image generation settings (Km parity)", () => {
  for (const [i, item] of (parity.chatImageSettings as AnyRec[]).entries()) {
    test(`case ${i}`, () => {
      expect(normalizeChatImageGenerationSettings(item.input)).toEqual(item.max7);
      expect(normalizeChatImageGenerationSettings(item.input, undefined, UNLIMITED_IMAGE_COUNT)).toEqual(item.unlimited);
    });
  }
  test("legacy migration", () => {
    expect(loadChatImageGenerationSettings(undefined, { chatImageCount: "3" })).toMatchObject({ migrated: true, settings: { countPolicy: { mode: "fixed", min: 3, max: 3 } } });
    expect(loadChatImageGenerationSettings(undefined, { legacySettings: { runtime: { imageAutoGenerationEnabled: false } } }).settings.autoGenerationEnabled).toBe(false);
    expect(loadChatImageGenerationSettings({ analysisMode: "bogus" }).notice).toContain("Unknown analysis mode");
  });
});

describe("ui state", () => {
  test("defaults and clamping", () => {
    const s = normalizeUiState({ navigationLayout: "list", splitRatio: 0.9, bySourceId: { c: { activeTab: "persona", secondaryMode: "persona-reference" } } });
    expect(s.global.navigationLayout).toBe("list");
    expect(s.global.splitRatio).toBe(0.65);
    expect(s.bySourceId.c?.secondaryMode).toBe("outfit");
    expect(normalizeUiState(null).global.splitRatio).toBe(0.5);
  });
});
