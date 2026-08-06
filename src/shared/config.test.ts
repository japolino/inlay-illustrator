import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, effectiveGenerationConfig, normalizeConfig, normalizePromptPresets } from "./config.js";

describe("shared configuration", () => {
  test("normalizes an empty persisted record to independent defaults", () => {
    const first = normalizeConfig({});
    const second = normalizeConfig({});

    expect(first).toEqual(DEFAULT_CONFIG);
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
      imageParameters: { steps: 24 }
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
      imageParameters: { cfg: 6 }
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
