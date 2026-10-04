import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CONFIG,
  isNovelAiConnection,
  normalizeConfig,
  normalizeFabCorner,
  normalizeInlayImageAspect,
  resolveInlayImageAspect
} from "./config.js";

describe("interim host configuration", () => {
  test("normalizes an empty record to independent defaults", () => {
    const first = normalizeConfig({});
    const second = normalizeConfig(undefined);
    expect(first).toEqual(DEFAULT_CONFIG);
    expect(second).toEqual(DEFAULT_CONFIG);
    expect(first.parserParameters).not.toBe(DEFAULT_CONFIG.parserParameters);
    expect(first.imageParameters).not.toBe(second.imageParameters);
  });

  test("drops settings of the retired Lightboard pipeline", () => {
    const config = normalizeConfig({ moduleMode: "comic", lightboardJailbreak: "memoir", maxImages: 4 } as never);
    expect(Object.keys(config).sort()).toEqual(Object.keys(DEFAULT_CONFIG).sort());
  });

  test("migrates legacy app-level image-generation settings", () => {
    const config = normalizeConfig({
      imageGeneration: {
        promptParserConnectionId: " legacy-parser ",
        promptParserModel: " legacy-model ",
        promptParserParameters: { temperature: 0.4 },
        activeImageGenConnectionId: " legacy-image ",
        model: " legacy-image-model ",
        parameters: { steps: 24 }
      }
    });
    expect(config).toMatchObject({
      parserConnectionId: "legacy-parser",
      parserModel: "legacy-model",
      parserParameters: { temperature: 0.4 },
      imageConnectionId: "legacy-image",
      imageModel: "legacy-image-model",
      imageParameters: { steps: 24 }
    });
  });

  test("explicit settings win over legacy values", () => {
    const config = normalizeConfig({
      parserConnectionId: "current",
      imageParameters: { cfg: 6 },
      imageGeneration: { promptParserConnectionId: "old", parameters: { steps: 1 } }
    });
    expect(config.parserConnectionId).toBe("current");
    expect(config.imageParameters).toEqual({ cfg: 6 });
  });

  test("clamps display geometry", () => {
    const config = normalizeConfig({ inlayImageMaxHeightVh: 500, coverImageWidth: 1, coverImageMaxHeightVh: 0 });
    expect(config.inlayImageMaxHeightVh).toBe(100);
    expect(config.coverImageWidth).toBe(120);
    expect(config.coverImageMaxHeightVh).toBe(10);
  });

  test("normalizes aspect presets and resolves their ratios", () => {
    expect(normalizeInlayImageAspect("WIDE")).toBe("wide");
    expect(normalizeInlayImageAspect("bogus")).toBe("auto");
    expect(resolveInlayImageAspect("portrait")).toEqual({ w: 3, h: 4 });
    expect(resolveInlayImageAspect("auto", { width: 832, height: 1216 })).toEqual({ w: 832, h: 1216 });
    expect(resolveInlayImageAspect("auto")).toEqual({ w: 16, h: 9 });
  });

  test("normalizes the FAB corner", () => {
    expect(normalizeFabCorner("top-left")).toBe("top-left");
    expect(normalizeFabCorner("middle")).toBe("bottom-right");
  });

  test("detects NovelAI connections", () => {
    expect(isNovelAiConnection({ provider: "novelai" })).toBe(true);
    expect(isNovelAiConnection({ provider: "custom", model: "nai-diffusion-4-5-full" })).toBe(true);
    expect(isNovelAiConnection({ provider: "comfyui", name: "NovelAI-like" })).toBe(false);
    expect(isNovelAiConnection(null)).toBe(false);
  });
});
