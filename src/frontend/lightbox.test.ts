import { describe, expect, test } from "bun:test";
import { imageIdFromResultUrl, resolveInlayDetails } from "./lightbox.js";

describe("Inlay prompt lightbox", () => {
  test("resolves exact stored prompts and the restored quote", () => {
    expect(resolveInlayDetails(" positive ", "legacy", " negative ", "legacy negative", "A quiet promise."))
      .toEqual({ prompt: "positive", negativePrompt: "negative", quote: "A quiet promise." });
  });

  test("keeps legacy inlays usable when metadata is absent", () => {
    expect(resolveInlayDetails(null, "legacy positive", null, null, null))
      .toEqual({ prompt: "legacy positive", negativePrompt: "", quote: "" });
  });

  test("recovers image IDs from result URLs for rerolls", () => {
    expect(imageIdFromResultUrl("/api/v1/image-gen/results/image%201")).toBe("image 1");
  });
});
