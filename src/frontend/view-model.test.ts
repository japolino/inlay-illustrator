import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import {
  generationSummary,
  isBusyStatus,
  outputSummary,
  parserSummary,
  promptSummary,
  statusTone
} from "./view-model.js";

describe("settings view model", () => {
  test("classifies operation feedback for accessible status styling", () => {
    expect(statusTone("Generating illustrations 2/4…")).toBe("active");
    expect(statusTone("Generation complete.")).toBe("success");
    expect(statusTone("Parser parameters must be valid JSON.")).toBe("error");
    expect(statusTone("Generation cancelled.")).toBe("warning");
    expect(isBusyStatus("Loading chat context…")).toBe(true);
    expect(isBusyStatus("Loading…")).toBe(false);
    expect(isBusyStatus("Ready")).toBe(false);
  });

  test("builds compact section summaries from current configuration", () => {
    const config = {
      ...DEFAULT_CONFIG,
      adaptiveMode: true,
      minImages: 2,
      maxImages: 5,
      promptStyle: "anima" as const,
      promptSyntax: "nai" as const,
      inlayImageAspect: "vertical" as const,
      inlayImageMaxHeightVh: 80
    };
    expect(generationSummary(config)).toBe("Adaptive · 2–5 images");
    expect(parserSummary(config, [])).toBe("Not configured");
    expect(promptSummary(config)).toBe("Anima · NovelAI");
    expect(outputSummary(config)).toBe("Vertical 9:16 · 80vh");
  });
});
