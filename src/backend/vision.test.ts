import { describe, expect, test } from "bun:test";
import { declaredVisionSupport, unsupportedVisionError, visionUserMessage } from "./vision.js";

describe("vision helpers", () => {
  test("recognizes explicit capability metadata without guessing when absent", () => {
    expect(declaredVisionSupport({ supportsVision: true })).toBe(true);
    expect(declaredVisionSupport({ input_modalities: ["text"] })).toBe(false);
    expect(declaredVisionSupport({ capabilities: { inputModalities: ["text", "image"] } })).toBe(true);
    expect(declaredVisionSupport({ providerQuirk: true })).toBeNull();
    expect(declaredVisionSupport(undefined)).toBeNull();
  });

  test("classifies image-rejection errors", () => {
    expect(unsupportedVisionError(new Error("This model does not support image input"))).toBe(true);
    expect(unsupportedVisionError("text-only model")).toBe(true);
    expect(unsupportedVisionError(new Error("429 rate limit"))).toBe(false);
  });

  test("builds a multimodal user message", () => {
    expect(visionUserMessage("describe", [{ data: "QUJD", mimeType: "image/png" }])).toEqual({
      role: "user",
      content: [{ type: "text", text: "describe" }, { type: "image", data: "QUJD", mime_type: "image/png" }]
    });
  });
});
