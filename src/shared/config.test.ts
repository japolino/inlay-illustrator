import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, normalizeConfig, normalizePromptPresets } from "./config.js";

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
      inlayImageMaxHeightVh: DEFAULT_CONFIG.inlayImageMaxHeightVh
    });
  });

  test("uses an automatic parser token budget by default and clamps explicit budgets", () => {
    expect(normalizeConfig({}).parserMaxTokens).toBe(0);
    expect(normalizeConfig({ parserMaxTokens: -5 }).parserMaxTokens).toBe(0);
    expect(normalizeConfig({ parserMaxTokens: 9_000.4 }).parserMaxTokens).toBe(9_000);
  });

  test("normalizes perspective settings and migrates removed modes without retaining their keys", () => {
    expect(normalizeConfig({ perspectiveMode: "creative", adaptiveMode: true })).toMatchObject({
      perspectiveMode: "creative",
      adaptiveMode: true
    });
    expect(normalizeConfig({ mode: "asset" }).perspectiveMode).toBe("static");
    expect(normalizeConfig({ mode: "experimental" }).perspectiveMode).toBe("dynamic");
    expect(normalizeConfig({ mode: "illustration" }).perspectiveMode).toBe("dynamic");
    expect(normalizeConfig({ perspectiveMode: "invalid" as never }).perspectiveMode).toBe("dynamic");
    const migrated = normalizeConfig({ mode: "asset", assetImageWidth: 812 });
    expect("mode" in migrated).toBe(false);
    expect("assetImageWidth" in migrated).toBe(false);
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
