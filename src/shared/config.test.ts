import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CONFIG,
  effectiveGenerationConfig,
  normalizeCharacterContextDepth,
  normalizeComicMinPanels,
  normalizeConfig,
  normalizeEncodingMode,
  normalizeModuleMode,
  normalizePromptPresets,
  normalizePromptSeparator,
  normalizeTextLanguage,
  resolveInlayImageAspect,
  v376OptionsFromConfig
} from "./config.js";

describe("shared configuration", () => {
  test("normalizes an empty persisted record to independent defaults", () => {
    const first = normalizeConfig({});
    const second = normalizeConfig({});

    // Normalization records the one-time image-parameter profile migration.
    expect(first).toEqual({ ...DEFAULT_CONFIG, imageParameterProfileMigration: true });
    expect(first.parserParameters).not.toBe(DEFAULT_CONFIG.parserParameters);
    expect(first.imageParameters).not.toBe(DEFAULT_CONFIG.imageParameters);
    expect(first.promptPresets).not.toBe(DEFAULT_CONFIG.promptPresets);
    expect(second.parserParameters).not.toBe(first.parserParameters);
    expect(second.imageParameters).not.toBe(first.imageParameters);
    expect(second.promptPresets).not.toBe(first.promptPresets);
  });

  test("migrates legacy image-generation parser and image settings", () => {
    const config = normalizeConfig({
      imageGeneration: {
        promptParserConnectionId: " legacy-parser ",
        promptParserModel: " legacy-parser-model ",
        promptParserParameters: { temperature: 0.4 },
        activeImageGenConnectionId: " legacy-image ",
        model: " legacy-image-model ",
        parameters: { steps: 24 }
      }
    });

    expect(config).toMatchObject({
      parserConnectionId: "legacy-parser",
      parserModel: "legacy-parser-model",
      parserParameters: { temperature: 0.4 },
      imageConnectionId: "legacy-image",
      imageModel: "legacy-image-model",
      // The legacy global blob's inherited parameter bag is dropped so the image
      // connection profile's own resolution, steps, guidance, and seed apply.
      imageParameters: {}
    });
  });

  test("keeps explicit non-empty parser and image settings authoritative over legacy values", () => {
    const config = normalizeConfig({
      parserConnectionId: "current-parser",
      parserModel: "current-parser-model",
      parserParameters: { top_p: 0.8 },
      imageConnectionId: "current-image",
      imageModel: "current-image-model",
      imageParameters: { cfg: 6 },
      imageGeneration: {
        promptParserConnectionId: "legacy-parser",
        promptParserModel: "legacy-parser-model",
        promptParserParameters: { temperature: 0.4 },
        activeImageGenConnectionId: "legacy-image",
        model: "legacy-image-model",
        parameters: { steps: 24 }
      }
    });

    expect(config).toMatchObject({
      parserConnectionId: "current-parser",
      parserModel: "current-parser-model",
      parserParameters: { top_p: 0.8 },
      imageConnectionId: "current-image",
      imageModel: "current-image-model",
      // The inherited "cfg" value is purged once by the profile migration.
      imageParameters: {}
    });
  });

  test("clamps and orders persisted numeric ranges", () => {
    const config = normalizeConfig({
      minImages: 99,
      maxImages: -1,
      includeMinMessages: 30,
      includeMaxMessages: 2,
      maxCharacters: 0,
      parserRetries: 2.6,
      parserMaxTokens: 99_999,
      inlayImageWidth: 100,
      assetImageWidth: 99_999,
      inlayImageMaxHeightVh: Number.NaN
    });

    expect(config).toMatchObject({
      minImages: 1,
      maxImages: 12,
      includeMinMessages: 2,
      includeMaxMessages: 30,
      maxCharacters: 1,
      parserRetries: 3,
      parserMaxTokens: 32_768,
      inlayImageWidth: 120,
      assetImageWidth: 2400,
      inlayImageMaxHeightVh: DEFAULT_CONFIG.inlayImageMaxHeightVh
    });
  });

  test("normalizes the Legacy in-chat aspect presets and resolves their ratios", () => {
    expect(DEFAULT_CONFIG.inlayImageAspect).toBe("wide");
    expect(normalizeConfig({ inlayImageAspect: "vertical" }).inlayImageAspect).toBe("vertical");
    expect(normalizeConfig({ inlayImageAspect: "invalid" as never }).inlayImageAspect).toBe("wide");
    expect(resolveInlayImageAspect("classic")).toEqual({ w: 2, h: 3 });
    expect(resolveInlayImageAspect("invalid")).toEqual({ w: 16, h: 9 });
  });

  test("uses an automatic parser token budget by default and clamps explicit budgets", () => {
    expect(normalizeConfig({}).parserMaxTokens).toBe(0);
    expect(normalizeConfig({ parserMaxTokens: -5 }).parserMaxTokens).toBe(0);
    expect(normalizeConfig({ parserMaxTokens: 9_000.4 }).parserMaxTokens).toBe(9_000);
  });

  test("normalizes all manual perspectives and restores the legacy Asset selection", () => {
    expect(normalizeConfig({ perspectiveMode: "creative", adaptiveMode: true })).toMatchObject({
      perspectiveMode: "creative",
      adaptiveMode: true
    });
    expect(normalizeConfig({ perspectiveMode: "asset" }).perspectiveMode).toBe("asset");
    expect(normalizeConfig({ mode: "asset" }).perspectiveMode).toBe("asset");
    expect(normalizeConfig({ mode: "experimental" }).perspectiveMode).toBe("dynamic");
    expect(normalizeConfig({ mode: "illustration" }).perspectiveMode).toBe("dynamic");
    expect(normalizeConfig({ perspectiveMode: "invalid" as never }).perspectiveMode).toBe("dynamic");
    const migrated = normalizeConfig({ mode: "asset", assetImageWidth: 812 });
    expect("mode" in migrated).toBe(false);
    expect(migrated.assetImageWidth).toBe(812);
  });

  test("keeps cover images opt-in and accepts only an explicit true value", () => {
    expect(DEFAULT_CONFIG.coverImageEnabled).toBe(false);
    expect(normalizeConfig({ coverImageEnabled: true }).coverImageEnabled).toBe(true);
    expect(normalizeConfig({ coverImageEnabled: false }).coverImageEnabled).toBe(false);
    expect(normalizeConfig({ coverImageEnabled: "true" as never }).coverImageEnabled).toBe(false);
  });

  test("uses dedicated display size defaults for cover images and clamps persisted values", () => {
    expect(DEFAULT_CONFIG.coverImageWidth).toBe(1200);
    expect(DEFAULT_CONFIG.coverImageMaxHeightVh).toBe(80);
    expect(normalizeConfig({ coverImageWidth: 960, coverImageMaxHeightVh: 55 })).toMatchObject({
      coverImageWidth: 960,
      coverImageMaxHeightVh: 55
    });
    expect(normalizeConfig({ coverImageWidth: 10, coverImageMaxHeightVh: 999 })).toMatchObject({
      coverImageWidth: 120,
      coverImageMaxHeightVh: 100
    });
  });

  test("enables previous visual state by default and preserves an explicit opt-out", () => {
    expect(normalizeConfig({}).previousVisualStateEnabled).toBe(true);
    expect(normalizeConfig({ previousVisualStateEnabled: false }).previousVisualStateEnabled).toBe(false);
  });

  test("trims presets, drops malformed or duplicate IDs, and keeps only a valid active selection", () => {
    const presets = normalizePromptPresets([
      { id: " cinematic ", name: " Cinematic ", positivePrefix: " quality ", negativePrefix: " lowres " },
      { id: "cinematic", name: "Duplicate", positivePrefix: "", negativePrefix: "" },
      { id: "", name: "Missing ID", positivePrefix: "", negativePrefix: "" },
      null
    ]);

    expect(presets).toEqual([{
      id: "cinematic",
      name: "Cinematic",
      positivePrefix: "quality",
      negativePrefix: "lowres"
    }]);
    expect(normalizeConfig({ promptPresets: presets, activePromptPresetId: " cinematic " }).activePromptPresetId).toBe("cinematic");
    expect(normalizeConfig({ promptPresets: presets, activePromptPresetId: "missing" }).activePromptPresetId).toBeNull();
  });
});

describe("V3.7.6 configuration schema and normalization", () => {
  test("faithful V3.7.6 defaults in DEFAULT_CONFIG", () => {
    expect(DEFAULT_CONFIG.moduleMode).toBe("illustration");
    expect(DEFAULT_CONFIG.nsfwInstructions).toBe(false);
    expect(DEFAULT_CONFIG.promptSeparator).toBe("pipe");
    expect(DEFAULT_CONFIG.imageTextLanguage).toBe("off");
    expect(DEFAULT_CONFIG.comicMinPanels).toBe(3);
    expect(DEFAULT_CONFIG.includeUserMessage).toBe(false);
    expect(DEFAULT_CONFIG.characterContextDepth).toBe(5);
    expect(DEFAULT_CONFIG.quoteEnabled).toBe(false);
    expect(DEFAULT_CONFIG.encodingMode).toBe("plain");
    expect(DEFAULT_CONFIG.prefillEnabled).toBe(false);
  });

  test("normalizes moduleMode faithfully from strings, numbers, and Korean tokens", () => {
    expect(normalizeModuleMode("illustration")).toBe("illustration");
    expect(normalizeModuleMode("0")).toBe("illustration");
    expect(normalizeModuleMode("삽화")).toBe("illustration");
    expect(normalizeModuleMode("asset")).toBe("asset");
    expect(normalizeModuleMode("1")).toBe("asset");
    expect(normalizeModuleMode("에셋")).toBe("asset");
    expect(normalizeModuleMode("comic")).toBe("comic");
    expect(normalizeModuleMode("2")).toBe("comic");
    expect(normalizeModuleMode("만화")).toBe("comic");
    expect(normalizeModuleMode("unknown")).toBe("illustration");
    expect(normalizeModuleMode(null)).toBe("illustration");

    // Legacy migration: legacy mode === "asset" sets moduleMode to asset
    expect(normalizeConfig({ mode: "asset" }).moduleMode).toBe("asset");
    expect(normalizeConfig({ perspectiveMode: "asset" }).moduleMode).toBe("asset");
    expect(normalizeConfig({ moduleMode: "comic", mode: "asset" }).moduleMode).toBe("comic");
  });

  test("normalizes promptSeparator faithfully including NovelAI native mode", () => {
    expect(normalizePromptSeparator("pipe")).toBe("pipe");
    expect(normalizePromptSeparator("0")).toBe("pipe");
    expect(normalizePromptSeparator("파이프")).toBe("pipe");
    expect(normalizePromptSeparator("newline")).toBe("newline");
    expect(normalizePromptSeparator("1")).toBe("newline");
    expect(normalizePromptSeparator("줄바꿈")).toBe("newline");
    expect(normalizePromptSeparator("native")).toBe("native");
    expect(normalizePromptSeparator("2")).toBe("native");
    expect(normalizePromptSeparator("novelai")).toBe("native");
    expect(normalizePromptSeparator("invalid")).toBe("pipe");
  });

  test("normalizes imageTextLanguage across all supported languages", () => {
    expect(normalizeTextLanguage("off")).toBe("off");
    expect(normalizeTextLanguage("0")).toBe("off");
    expect(normalizeTextLanguage("사용 안함")).toBe("off");
    expect(normalizeTextLanguage("free")).toBe("free");
    expect(normalizeTextLanguage("1")).toBe("free");
    expect(normalizeTextLanguage("english")).toBe("english");
    expect(normalizeTextLanguage("2")).toBe("english");
    expect(normalizeTextLanguage("korean")).toBe("korean");
    expect(normalizeTextLanguage("3")).toBe("korean");
    expect(normalizeTextLanguage("japanese")).toBe("japanese");
    expect(normalizeTextLanguage("4")).toBe("japanese");
    expect(normalizeTextLanguage("chinese")).toBe("chinese");
    expect(normalizeTextLanguage("5")).toBe("chinese");
    expect(normalizeTextLanguage("invalid")).toBe("off");
  });

  test("normalizes encodingMode across bypass protocols", () => {
    expect(normalizeEncodingMode("plain")).toBe("plain");
    expect(normalizeEncodingMode("0")).toBe("plain");
    expect(normalizeEncodingMode("placeholder")).toBe("placeholder");
    expect(normalizeEncodingMode("1")).toBe("placeholder");
    expect(normalizeEncodingMode("base64")).toBe("base64");
    expect(normalizeEncodingMode("2")).toBe("base64");
    expect(normalizeEncodingMode("atbash")).toBe("atbash");
    expect(normalizeEncodingMode("3")).toBe("atbash");
    expect(normalizeEncodingMode("invalid")).toBe("plain");
  });

  test("normalizes characterContextDepth source semantics without arbitrary clamps", () => {
    // Default fallback
    expect(normalizeCharacterContextDepth(undefined)).toBe(5);
    expect(normalizeCharacterContextDepth(null)).toBe(5);
    expect(normalizeCharacterContextDepth("")).toBe(5);
    expect(normalizeCharacterContextDepth("invalid")).toBe(5);
    // Source Lua line 711: legacy -1 converts to defaultDepth (5)
    expect(normalizeCharacterContextDepth(-1)).toBe(5);
    expect(normalizeCharacterContextDepth("-1")).toBe(5);
    // 0 is valid (immediate expiration)
    expect(normalizeCharacterContextDepth(0)).toBe(0);
    expect(normalizeCharacterContextDepth("0")).toBe(0);
    // Negative below -1 falls back to default 5
    expect(normalizeCharacterContextDepth(-5)).toBe(5);
    // Large values preserved without 32 clamp
    expect(normalizeCharacterContextDepth(50)).toBe(50);
    expect(normalizeCharacterContextDepth(365)).toBe(365);
  });

  test("normalizes comicMinPanels without arbitrary upper clamp", () => {
    expect(normalizeComicMinPanels(undefined)).toBe(3);
    expect(normalizeComicMinPanels(null)).toBe(3);
    expect(normalizeComicMinPanels(0)).toBe(1); // minimum 1 panel
    expect(normalizeComicMinPanels(-2)).toBe(1);
    expect(normalizeComicMinPanels(4)).toBe(4);
    expect(normalizeComicMinPanels(20)).toBe(20); // above arbitrary 12 clamp
  });

  test("preserves boolean switches faithfully without falsy confusion", () => {
    const config = normalizeConfig({
      nsfwInstructions: true,
      includeUserMessage: true,
      quoteEnabled: true,
      prefillEnabled: true
    });
    expect(config.nsfwInstructions).toBe(true);
    expect(config.includeUserMessage).toBe(true);
    expect(config.quoteEnabled).toBe(true);
    expect(config.prefillEnabled).toBe(true);

    const falsyConfig = normalizeConfig({
      nsfwInstructions: false,
      includeUserMessage: false,
      quoteEnabled: false,
      prefillEnabled: false
    });
    expect(falsyConfig.nsfwInstructions).toBe(false);
    expect(falsyConfig.includeUserMessage).toBe(false);
    expect(falsyConfig.quoteEnabled).toBe(false);
    expect(falsyConfig.prefillEnabled).toBe(false);
  });
});

describe("V3.7.6 Options Mapper (v376OptionsFromConfig)", () => {
  test("faithfully maps Config to V376Options per CONTRACT.md", () => {
    const config = normalizeConfig({
      moduleMode: "comic",
      nsfwInstructions: true,
      supplement: true,
      imageTextLanguage: "japanese",
      quoteEnabled: true,
      promptSyntax: "nai",
      promptSeparator: "native",
      minImages: 2,
      maxImages: 4,
      maxCharacters: 3,
      comicMinPanels: 4,
      originalReference: true,
      originalCreationName: "Original Series",
      encodingMode: "base64",
      prefillEnabled: true,
      characterTagContextEnabled: true,
      characterContextDepth: 8,
      customParserInstructions: "Focus on expressions.",
      includeUserMessage: true,
      customPositivePrefix: "artist:teshima nari",
      customPositiveSuffix: "year 2025",
      customNegative: "watermark, logo"
    });

    const options = v376OptionsFromConfig(config);

    expect(options).toEqual({
      mode: "comic",
      nsfw: true,
      supplement: true,
      text: "japanese",
      quote: true,
      syntax: "nai",
      separator: "native",
      imageMin: 2,
      imageMax: 4,
      characterMax: 3,
      panelMin: 4,
      originalReference: true,
      originalCreationName: "Original Series",
      encodingMode: "base64",
      prefillEnabled: true,
      characterContext: true,
      characterContextDepth: 8,
      customInstruction: "Focus on expressions.",
      includeUserMessage: true,
      customPos: "artist:teshima nari",
      customNeg: "year 2025"
    });
  });

  test("explicitly preserves customPos/customNeg positive prefix/suffix semantics and does not relabel negative", () => {
    const config = normalizeConfig({
      customPositivePrefix: "prefix_author_tag",
      customPositiveSuffix: "suffix_quality_tag",
      customNegative: "negative_bad_anatomy"
    });

    const options = v376OptionsFromConfig(config);

    // In V3.7.6 source Lua:
    // - customPos is prepended to [Positive] prompt
    // - customNeg is appended to [Positive] prompt (NOT negative prompt!)
    expect(options.customPos).toBe("prefix_author_tag");
    expect(options.customNeg).toBe("suffix_quality_tag");
    // Ensure customNeg is NOT assigned to negative prompt in options
    expect((options as Record<string, unknown>).negative).toBeUndefined();
    expect(config.customNegative).toBe("negative_bad_anatomy");
  });

  test("maps NSFW toggle as instruction strength booster, NOT content filter", () => {
    const nsfwOn = normalizeConfig({ nsfwInstructions: true });
    expect(v376OptionsFromConfig(nsfwOn).nsfw).toBe(true);

    const nsfwOff = normalizeConfig({ nsfwInstructions: false });
    expect(v376OptionsFromConfig(nsfwOff).nsfw).toBe(false);
  });
});

describe("Fast Mode configuration", () => {
  test("fastMode defaults to false", () => {
    expect(normalizeConfig({}).fastMode).toBe(false);
  });

  test("normalizeConfig preserves the fastMode boolean", () => {
    expect(normalizeConfig({ fastMode: true }).fastMode).toBe(true);
    expect(normalizeConfig({ fastMode: false }).fastMode).toBe(false);
  });

  test("effectiveGenerationConfig leaves Normal Mode unchanged", () => {
    const config = normalizeConfig({
      minImages: 2,
      maxImages: 4,
      preprocessingEnabled: true,
      parserRetries: 3,
      includeLorebook: true
    });
    expect(effectiveGenerationConfig(config)).toBe(config);
  });

  test("Fast Mode disables preprocessing, retries, and lorebook without changing image counts", () => {
    const config = normalizeConfig({
      fastMode: true,
      minImages: 2,
      maxImages: 4,
      preprocessingEnabled: true,
      parserRetries: 3,
      includeLorebook: true
    });
    const effective = effectiveGenerationConfig(config);
    expect(effective.fastMode).toBe(true);
    expect(effective.minImages).toBe(2);
    expect(effective.maxImages).toBe(4);
    expect(effective.preprocessingEnabled).toBe(false);
    expect(effective.parserRetries).toBe(0);
    expect(effective.includeLorebook).toBe(false);
  });

  test("Fast Mode preserves a configured maximum of one image", () => {
    const config = normalizeConfig({ fastMode: true, minImages: 1, maxImages: 1 });
    const effective = effectiveGenerationConfig(config);
    expect(effective.minImages).toBe(1);
    expect(effective.maxImages).toBe(1);
  });
});
