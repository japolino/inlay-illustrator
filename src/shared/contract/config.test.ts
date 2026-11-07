import { describe, expect, test } from "bun:test";
import parity from "./fixtures/config-parity.json" with { type: "json" };
import {
  analysisExecutionNeedsSeed,
  buildRuntimeConfig,
  effectiveAnalysisExecution,
  normalizeAnalysisExecution,
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
  SPLIT_ANALYSIS_MAX_TOTAL,
  splitConfigForStorage,
  type CharxScopeConfig,
  type CharxSettingsPatch,
} from "./config.js";
import { createEmptyCharacterDocument, normalizeCharacterDocument } from "./character.js";
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
    const c = normalizeConfig({ ui: { language: "ko" }, analysis: { connectionId: "conn", model: "m", temperature: 1 }, image: { connectionId: "img", provider: "NovelAI", model: "nai-diffusion-4-5-full" }, novelai: { negativePrompt: "neg", steps: 30 }, characterPrompt: { artistPrompts: [{ id: "artist_1", title: "A", prompt: "p" }], defaultArtistId: "artist_1", fixedPositivePrompt: "fp" }, animaArtists: { entries: [{ id: "x", title: "X", text: "t" }], selection: { defaultId: "x" } } });
    const parts = splitConfigForStorage(c);
    expect(parts.model).not.toHaveProperty("novelai.negativePrompt");
    expect(JSON.stringify(splitConfigForStorage(createDefaultConfig()).model)).toBe("{}");
    expect(mergeStoredConfig(JSON.parse(JSON.stringify(parts)))).toEqual(c);
  });
  test("a cleared JEV model survives save and reload; an absent one is jev-latest", () => {
    const cleared = normalizeConfig({ jevConnection: { connectionId: "inception", model: "  " } });
    expect(cleared.jevConnection.model).toBe("");
    expect(mergeStoredConfig(JSON.parse(JSON.stringify(splitConfigForStorage(cleared)))).jevConnection.model).toBe("");
    expect(normalizeConfig({ jevConnection: { connectionId: "inception" } }).jevConnection.model).toBe("jev-latest");
  });
});

describe("Lumiverse mapping", () => {
  test("provider kind and codec", () => {
    expect(generationProviderFromLumiverse("novelai")).toBe("novelai");
    expect(generationProviderFromLumiverse("comfyui")).toBe("comfy-ui");
    expect(generationProviderFromLumiverse("swarmui")).toBeNull();
    expect(promptCodecForProvider("novelai")).toBe("novelai-structured");
    expect(promptCodecForProvider("comfy-ui")).toBe("anima-flat");
    expect(normalizeConfig({ image: { provider: "comfyui" } }).runtime.generationProvider).toBe("comfy-ui");
  });
  test("removed providers normalize to NovelAI (AM 0.9.90 aN): stored generic / chan-server and unsupported connections", () => {
    expect(normalizeConfig({}).runtime.generationProvider).toBe("novelai");
    expect(normalizeConfig({ runtime: { generationProvider: "generic" } }).runtime.generationProvider).toBe("novelai");
    expect(normalizeConfig({ runtime: { generationProvider: "chan-server", comfyuiTransport: "chan-server-nai", chanServerRequestUrl: "u" } }).runtime.generationProvider).toBe("novelai");
    const stored = normalizeConfig({ image: { provider: "swarmui", connectionId: "sw" }, runtime: { generationProvider: "generic" } });
    expect(stored.runtime.generationProvider).toBe("novelai");
    expect(stored.image).toMatchObject({ provider: "swarmui", connectionId: "sw" });
    expect(stored.runtime).not.toHaveProperty("chanServerRequestUrl");
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
    expect(normalizeConfig({ novelai: { sampler: "k_dpmpp_2m_sde" } }).novelai.sampler).toBe("k_dpmpp_2m_sde");
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
  test("buildRuntimeConfig resolves the NovelAI artist: own artist if it exists, else the global preset", () => {
    // AM 0.9.90 `mW$990`: the default art style is "none" (the built-in styles are gone).
    expect(normalizeConfig({}).characterPrompt.defaultArtistId).toBe("none");
    const g = normalizeConfig({ characterPrompt: { artistPrompts: [{ id: "artist_1", title: "A", prompt: "p" }], defaultArtistId: "artist_1" } });
    const doc = createEmptyCharacterDocument("char1");
    const artist = (ownId: string) => buildRuntimeConfig(g, { ...doc, characterPrompt: { ...doc.characterPrompt, selectedArtistId: ownId } }).characterPrompt.selectedArtistId;
    expect([artist(""), artist("none"), artist("deleted")]).toEqual(["artist_1", "none", "artist_1"]);
    expect(buildRuntimeConfig(g, null).characterPrompt.selectedArtistId).toBe("artist_1");
    expect(buildRuntimeConfig(normalizeConfig({ characterPrompt: { defaultArtistId: "deleted" } }), doc).characterPrompt.selectedArtistId).toBe("none");
  });
});

/** Removes the per-charx field AM 0.9.90 dropped from a 0.9.89.6 fixture object (values, revisions, dirty lists). */
function withoutStateAccumulation(value: any): any {
  if (Array.isArray(value)) return value.filter((v) => v !== "stateAccumulationEnabled").map(withoutStateAccumulation);
  if (!value || typeof value !== "object") return value;
  const out: AnyRec = {};
  for (const [k, v] of Object.entries(value)) if (k !== "stateAccumulationEnabled") out[k] = withoutStateAccumulation(v);
  for (const k of ["revisionByField", "dirtyFieldsBySourceId"]) if (out[k] && typeof out[k] === "object" && !Object.keys(out[k]).length) delete out[k];
  if (out.dirtyFieldsBySourceId) for (const [k, v] of Object.entries(out.dirtyFieldsBySourceId)) if (Array.isArray(v) && !v.length) delete out.dirtyFieldsBySourceId[k];
  return out;
}

/**
 * The fixtures are AM 0.9.89.6 output. Apply the 0.9.90 deltas the port follows: V4.5 analysis normalizes to V5,
 * `stateAccumulationEnabled` is gone, and an unset native asset visibility is "shown" unless a revision or dirty entry
 * shows the user chose the old "hidden" default (port migration, see `withLegacyAssetVisibility`).
 */
function am990(output: AnyRec, input: AnyRec): AnyRec {
  const o = JSON.parse(JSON.stringify(output));
  o.novelai.analysisProfile = "v5-hybrid";
  const defaults = withoutStateAccumulation(o.characterPrompt.charxGenerationDefaults);
  const stored = input?.characterPrompt?.charxGenerationDefaults;
  if (!stored || typeof stored !== "object" || Array.isArray(stored) || !Object.hasOwn(stored, "nativeAssetVisibility")) {
    const revision = Number(stored?.revisionByField?.nativeAssetVisibility);
    const dirty = Object.values(stored?.dirtyFieldsBySourceId ?? {}).some((v) => Array.isArray(v) && v.includes("nativeAssetVisibility"));
    defaults.nativeAssetVisibility = (Number.isFinite(revision) && revision > 0) || dirty ? "hidden" : "shown";
  }
  o.characterPrompt.charxGenerationDefaults = defaults;
  // Port deviation: a cleared JEV model is kept (= the Lumiverse decision connection's model); AM only talked to TypeSafe.
  const jevModel = input?.jevConnection?.model;
  if (typeof jevModel === "string") o.jevConnection.model = jevModel.trim();
  return o;
}

/** AM 0.9.89.6 default native asset visibility, so the override-resolution fixtures resolve as recorded. */
function withAmAssetDefault(raw: AnyRec): AnyRec {
  const r = JSON.parse(JSON.stringify(raw ?? {}));
  const d = r.characterPrompt?.charxGenerationDefaults;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    if (!Object.hasOwn(d, "nativeAssetVisibility")) d.nativeAssetVisibility = "hidden";
  } else r.characterPrompt = { ...(r.characterPrompt ?? {}), charxGenerationDefaults: { nativeAssetVisibility: "hidden" } };
  return r;
}

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
      const expected = projectAm(am990(item.output, item.input));
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
  test("image ratio presets keep custom size ids (AM 0.9.89.3 y5e)", () => {
    const custom = 1e9 + 5;
    const d = normalizeV5UserDirections({ imageRatio: { mode: "preset", selectedPresetId: "image-ratio-x", presets: [{ id: "image-ratio-x", name: "Mine", instruction: "", allowedSizeIds: [2, custom, 7, 1e9 + 0.5, custom] }] } });
    expect(d.imageRatio.presets.find((p) => p.id === "image-ratio-x")?.allowedSizeIds).toEqual([2, custom]);
  });
});

describe("per-character override resolution parity (ki/xE/ONe/jNe/NNe/ENe/RNe)", () => {
  for (const [i, item] of (parity.charxOps as AnyRec[]).entries()) {
    test(`ops case ${i}`, () => {
      const base = normalizeConfig(withAmAssetDefault(item.raw));
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
      const result = withoutStateAccumulation(item.result);
      expect(withoutStateAccumulation(got.characterPrompt)).toEqual(result.scope.characterPrompt);
      expect(got.novelai.negativePrompt).toEqual(result.scope.novelai.negativePrompt);
      expect(got.runtime.nsfwAlwaysEnabled).toEqual(result.scope.runtime.nsfwAlwaysEnabled);
      expect(resolveAllCharxSettings(scope)).toEqual(result.all);
      for (const id of ["c1", "c2", "c3"]) expect(resolveEffectiveCharxSettings(scope, id)).toEqual(result[id]);
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
      // `maxDefault`: AM `Km` default cap (10 since 0.9.89.6).
      expect(normalizeChatImageGenerationSettings(item.input)).toEqual(item.maxDefault);
      expect(normalizeChatImageGenerationSettings(item.input, undefined, UNLIMITED_IMAGE_COUNT)).toEqual(item.unlimited);
    });
  }
  test("legacy migration", () => {
    expect(loadChatImageGenerationSettings(undefined, { chatImageCount: "3" })).toMatchObject({ migrated: true, settings: { countPolicy: { mode: "fixed", min: 3, max: 3 } } });
    expect(loadChatImageGenerationSettings(undefined, { legacySettings: { runtime: { imageAutoGenerationEnabled: false } } }).settings.autoGenerationEnabled).toBe(false);
    expect(loadChatImageGenerationSettings({ analysisMode: "bogus" }).notice).toContain("Unknown analysis mode");
  });
  test("the split total is capped at SPLIT_ANALYSIS_MAX_TOTAL in the backend too", () => {
    const settings = normalizeChatImageGenerationSettings({ analysisMode: "split", splitAnalysis: { totalCount: 500, batchSize: 10 } }, undefined, UNLIMITED_IMAGE_COUNT);
    expect(settings.splitAnalysis).toEqual({ totalCount: SPLIT_ANALYSIS_MAX_TOTAL, batchSize: 10 });
    expect(settings.analysisMode).toBe("split");
  });
});

describe("AM 0.9.90 stored-data migrations", () => {
  test("a stored V4.5 analysis profile loads as V5 and is written as V5", () => {
    for (const stored of ["v4-5", "v5-hybrid-preview", "bogus", undefined]) expect(normalizeConfig({ novelai: { analysisProfile: stored } }).novelai.analysisProfile).toBe("v5-hybrid");
    const loaded = mergeStoredConfig({ model: { novelai: { analysisProfile: "v4-5" } }, settings: {} });
    expect(loaded.novelai.analysisProfile).toBe("v5-hybrid");
  });
  test("stateAccumulationEnabled is dropped from charx defaults, revisions and dirty lists", () => {
    const c = normalizeConfig({
      characterPrompt: {
        charxGenerationDefaults: {
          stateAccumulationEnabled: true,
          nsfwAlwaysEnabled: true,
          revisionByField: { stateAccumulationEnabled: 2, nsfwAlwaysEnabled: 1 },
          dirtyFieldsBySourceId: { c1: ["stateAccumulationEnabled"], c2: ["stateAccumulationEnabled", "nsfwAlwaysEnabled"] },
        },
      },
    });
    const d = c.characterPrompt.charxGenerationDefaults as unknown as AnyRec;
    expect(d).not.toHaveProperty("stateAccumulationEnabled");
    expect(d.revisionByField).toEqual({ nsfwAlwaysEnabled: 1 });
    expect(d.dirtyFieldsBySourceId).toEqual({ c2: ["nsfwAlwaysEnabled"] });
    expect(resolveAllCharxSettings({ ...c, characterPrompt: { ...c.characterPrompt, charxSettings: { overrides: {} } } })).not.toHaveProperty("stateAccumulationEnabled");
    const parts = splitConfigForStorage(c);
    expect(JSON.stringify(parts.settings)).not.toContain("stateAccumulationEnabled");
  });
  test("stateAccumulationEnabled is dropped from per-character overrides in character documents", () => {
    const doc = createEmptyCharacterDocument("c1") as unknown as AnyRec;
    doc.characterPrompt.charxSettings.overrides = {
      c1: { stateAccumulationEnabled: true, nsfwAlwaysEnabled: true, revisionByField: { stateAccumulationEnabled: 3, nsfwAlwaysEnabled: 1 } },
      c2: { stateAccumulationEnabled: false, revisionByField: { stateAccumulationEnabled: 1 } },
    };
    const overrides = normalizeCharacterDocument(JSON.parse(JSON.stringify(doc)), "c1").value.characterPrompt.charxSettings.overrides;
    expect(overrides).toEqual({ c1: { nsfwAlwaysEnabled: true, revisionByField: { nsfwAlwaysEnabled: 1 } }, c2: {} });
  });
  test("native CharX assets: stored value wins, a saved old default stays hidden, otherwise shown; always written", () => {
    const visibility = (charxGenerationDefaults: unknown) => mergeStoredConfig({ settings: { characterPrompt: { charxGenerationDefaults } } }).characterPrompt.charxGenerationDefaults.nativeAssetVisibility;
    expect(normalizeConfig({}).characterPrompt.charxGenerationDefaults.nativeAssetVisibility).toBe("shown");
    expect(visibility(undefined)).toBe("shown");
    expect(visibility({ nsfwAlwaysEnabled: true })).toBe("shown");
    expect(visibility({ nativeAssetVisibility: "hidden" })).toBe("hidden");
    expect(visibility({ nativeAssetVisibility: "shown", revisionByField: { nativeAssetVisibility: 2 } })).toBe("shown");
    // Saved as "hidden" while that was the default: only the revision (or a dirty entry) was written.
    expect(visibility({ revisionByField: { nativeAssetVisibility: 1 } })).toBe("hidden");
    expect(visibility({ dirtyFieldsBySourceId: { c1: ["nativeAssetVisibility"] } })).toBe("hidden");
    expect(visibility({ revisionByField: { nativeAssetVisibility: 0 } })).toBe("shown");
    // The resolver: an own value wins, otherwise "shown" (AM 0.9.90 nR).
    const scope = (defaults: AnyRec) => ({ jevConnection: { rosterSelectionDefault: false }, runtime: { customImageSizes: [] }, novelai: {}, characterPrompt: { charxGenerationDefaults: defaults, charxSettings: { overrides: {} } } });
    expect(resolveAllCharxSettings(scope({})).nativeAssetVisibility).toBe("shown");
    expect(resolveAllCharxSettings(scope({ nativeAssetVisibility: "hidden" })).nativeAssetVisibility).toBe("hidden");
    // Always persisted, also when it equals the default, so the choice survives later default changes.
    for (const value of ["hidden", "shown"] as const) {
      const c = normalizeConfig({ characterPrompt: { charxGenerationDefaults: { nativeAssetVisibility: value } } });
      const parts = splitConfigForStorage(c);
      expect((parts.settings.characterPrompt as AnyRec).charxGenerationDefaults.nativeAssetVisibility).toBe(value);
      expect(mergeStoredConfig(JSON.parse(JSON.stringify(parts))).characterPrompt.charxGenerationDefaults.nativeAssetVisibility).toBe(value);
    }
  });
  test("chat image settings of the removed webtoon / manga mode are ignored and dropped", () => {
    const loaded = loadChatImageGenerationSettings({ autoGenerationEnabled: false, countPolicy: { mode: "fixed", min: 3, max: 3 }, analysisMode: "single", splitAnalysis: { totalCount: null, batchSize: 3 }, webtoonMode: true, comicFormat: "manga" });
    expect(loaded.notice).toBe("");
    expect(loaded.settings).not.toHaveProperty("webtoonMode");
    expect(loaded.settings).not.toHaveProperty("comicFormat");
    expect(loaded.settings.countPolicy).toMatchObject({ mode: "fixed", min: 3, max: 3 });
    expect(loaded.settings.autoGenerationEnabled).toBe(false);
  });
  test("a saved unique-tag search pane reopens as the closed asset picker (AM 0.9.90 oSt)", () => {
    const s = normalizeUiState({ bySourceId: { c: { activeTab: "prompts", secondaryOpen: true, secondaryMode: "character-tags" }, d: { secondaryOpen: true, secondaryMode: "outfit" } } });
    expect(s.bySourceId.c).toMatchObject({ activeTab: "prompts", secondaryOpen: false, secondaryMode: "asset-picker" });
    expect(s.bySourceId.d).toMatchObject({ secondaryOpen: true, secondaryMode: "outfit" });
  });
});

describe("chat toolbar analysis execution (AM 0.9.90 M0$990 / CPe$990)", () => {
  test("normalizer keeps preset or valid custom sizes, null (auto) and boolean aiCoordinates", () => {
    expect(normalizeAnalysisExecution({ resolution: { id: 2, width: 1216, height: 832 }, aiCoordinates: true })).toEqual({ resolution: { id: 2, width: 1216, height: 832 }, aiCoordinates: true });
    expect(normalizeAnalysisExecution({ resolution: { id: 2, width: 832, height: 1216 } })).toBeUndefined();
    expect(normalizeAnalysisExecution({ resolution: { id: 1e9, width: 640, height: 960 } })).toEqual({ resolution: { id: 1e9, width: 640, height: 960 } });
    expect(normalizeAnalysisExecution({ resolution: null, aiCoordinates: "yes" })).toEqual({ resolution: null });
    const config = normalizeConfig({ runtime: { analysisExecution: { resolution: { id: 5, width: 1, height: 1 }, aiCoordinates: false } } });
    expect(config.runtime.analysisExecution).toEqual({ aiCoordinates: false });
    expect(normalizeConfig({}).runtime).not.toHaveProperty("analysisExecution");
  });
  test("seed fallback: fixed resolution enabled -> its size, disabled -> auto; aiCoordinates = !forceAiChoiceCoordinates", () => {
    const runtime = { customImageSizes: [] };
    expect(effectiveAnalysisExecution(runtime, { fixedResolution: { enabled: true, sizeId: 2 }, forceAiChoiceCoordinates: false })).toEqual({ resolution: { id: 2, width: 1216, height: 832 }, aiCoordinates: true });
    expect(effectiveAnalysisExecution(runtime, { fixedResolution: { enabled: false, sizeId: 2 }, forceAiChoiceCoordinates: true })).toEqual({ resolution: null, aiCoordinates: false });
    expect(effectiveAnalysisExecution({ ...runtime, analysisExecution: { resolution: null, aiCoordinates: true } }, { fixedResolution: { enabled: true, sizeId: 2 }, forceAiChoiceCoordinates: true })).toEqual({ resolution: null, aiCoordinates: true });
    expect(analysisExecutionNeedsSeed({ analysisExecution: { aiCoordinates: true } })).toBe(true);
    expect(analysisExecutionNeedsSeed({ analysisExecution: { resolution: null, aiCoordinates: true } })).toBe(false);
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
