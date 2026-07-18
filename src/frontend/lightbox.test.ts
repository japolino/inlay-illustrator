import { describe, expect, test } from "bun:test";
import { disableNativeInlayLightboxes, resolveInlayDetails, resolveInlayPrompt } from "./lightbox.js";

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

  test("resolves exact positive and negative prompts with perspective metadata", () => {
    expect(resolveInlayDetails(
      " positive ",
      "legacy positive",
      " negative ",
      "legacy negative",
      "Creative",
      "Adaptive"
    )).toEqual({
      prompt: "positive",
      negativePrompt: "negative",
      perspectiveMode: "creative",
      perspectiveSource: "adaptive"
    });
  });

  test("keeps legacy inlays usable when metadata is absent", () => {
    expect(resolveInlayDetails(null, "legacy positive", null, null, null, null)).toEqual({
      prompt: "legacy positive",
      negativePrompt: "",
      perspectiveMode: null,
      perspectiveSource: null
    });
  });

  test("removes the host image-only lightbox trigger from existing Inlay images", () => {
    const removed: string[] = [];
    const root = {
      querySelectorAll: () => [{ removeAttribute: (name: string) => removed.push(name) }]
    } as unknown as ParentNode;

    disableNativeInlayLightboxes(root);
    expect(removed).toEqual(["data-lightbox"]);
  });
});
