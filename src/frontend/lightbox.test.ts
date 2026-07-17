import { describe, expect, test } from "bun:test";
import { resolveInlayPrompt } from "./lightbox.js";

describe("Inlay prompt lightbox", () => {
  test("prefers the prompt stored on the clicked image", () => {
    expect(resolveInlayPrompt("  image prompt\n\nwith sections  ", "fallback prompt")).toBe(
      "image prompt\n\nwith sections"
    );
  });

  test("uses the hidden prompt node for legacy rendered images", () => {
    expect(resolveInlayPrompt(null, "  legacy prompt  ")).toBe("legacy prompt");
  });

  test("handles images with no recorded prompt", () => {
    expect(resolveInlayPrompt(null, null)).toBe("");
  });
});
