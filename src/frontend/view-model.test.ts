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
      moduleMode: "illustration" as const,
      minImages: 2,
      maxImages: 5,
      promptSyntax: "nai" as const,
      promptSeparator: "pipe" as const,
      inlayImageAspect: "vertical" as const,
      inlayImageMaxHeightVh: 80
    };
    expect(generationSummary(config)).toBe("Illustration · 2–5 images");
    expect(parserSummary(config, [])).toBe("Not configured");
    expect(promptSummary(config)).toBe("NovelAI · Pipe");
    expect(outputSummary(config)).toBe("Vertical 9:16 · 80vh");

    const comicConfig = {
      ...DEFAULT_CONFIG,
      moduleMode: "comic" as const,
      comicMinPanels: 4,
      minImages: 3,
      maxImages: 3,
      promptSyntax: "comfyui" as const,
      promptSeparator: "native" as const,
      encodingMode: "base64" as const
    };
    expect(generationSummary(comicConfig)).toBe("Comic (4+ panels) · 3 images");
    expect(promptSummary(comicConfig)).toBe("ComfyUI · Native");
    expect(parserSummary(comicConfig, [{ id: "p1", name: "Claude Sonnet", provider: "openrouter", model: "claude-sonnet" }])).toBe("Not configured · [Base64]");
  });
});
