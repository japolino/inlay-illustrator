import { describe, expect, test } from "bun:test";
import { NOVELAI_RESOLUTION_PRESETS } from "../../shared/config.js";
import { novelAiResolutionPatch } from "./generation.js";

describe("NovelAI canvas size selector", () => {
  test("sends the chosen size as resolution, width, and height", () => {
    const preset = NOVELAI_RESOLUTION_PRESETS.find((entry) => entry.value === "1216x832");
    expect(preset).toBeDefined();

    const patch = novelAiResolutionPatch({ steps: 28 }, preset!.value);

    expect(patch).toEqual({
      imageParameters: { steps: 28, width: 1216, height: 832, resolution: "1216x832" }
    });
  });

  test("never changes the in-chat display aspect", () => {
    for (const preset of NOVELAI_RESOLUTION_PRESETS) {
      const patch = novelAiResolutionPatch({}, preset.value);
      expect(patch).not.toBeNull();
      expect("inlayImageAspect" in (patch as Record<string, unknown>)).toBe(false);
      expect("inlayImageMaxHeightVh" in (patch as Record<string, unknown>)).toBe(false);
    }
  });

  test("ignores an unknown preset id without dropping stored parameters", () => {
    expect(novelAiResolutionPatch({ width: 832, height: 1216 }, "not-a-preset")).toBeNull();
  });
});
