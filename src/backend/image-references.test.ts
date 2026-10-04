import { describe, expect, test } from "bun:test";
import {
  characterTagsParameter,
  hostWorkflowParameters,
  mergeReferenceParameters,
  parseImageDataUrl,
  referenceParameters,
  sharedNegativeWithCharacterNegatives
} from "./image-references.js";
import type { ImageConnection } from "./types.js";

const nai: ImageConnection = { id: "nai", name: "NovelAI", provider: "novelai", model: "nai-diffusion-4-5-full", default_parameters: {} };
const workflow = {
  workflow_api_json: { "1": { class_type: "LoadImage", inputs: { image: "embedded.png" } }, "2": { inputs: { denoise: 0.8 } } },
  field_mappings: [
    { nodeId: "1", fieldName: "image", mappedAs: "init_image" },
    { nodeId: "2", fieldName: "denoise", mappedAs: "denoise" },
    { nodeId: "3", fieldName: "text", mappedAs: "positive_prompt" }
  ]
};
const comfy: ImageConnection = { id: "comfy", name: "Comfy", provider: "comfyui", model: "workflow", metadata: { comfyui: workflow } };
const plainComfy: ImageConnection = { ...comfy, metadata: {} };
const swarm: ImageConnection = { id: "swarm", name: "Swarm", provider: "swarmui", model: "x" };
const image = { data: "QUJD", mimeType: "image/png" };

describe("parseImageDataUrl", () => {
  test("accepts png/jpeg/webp data URLs", () => {
    expect(parseImageDataUrl("data:image/png;base64,QUJD")).toEqual({ data: "QUJD", mimeType: "image/png" });
    expect(parseImageDataUrl("data:image/webp;base64,QUJD")?.mimeType).toBe("image/webp");
  });
  test("rejects other values", () => {
    expect(parseImageDataUrl("data:image/gif;base64,QUJD")).toBeNull();
    expect(parseImageDataUrl("https://example.com/a.png")).toBeNull();
    expect(parseImageDataUrl(undefined)).toBeNull();
  });
});

describe("referenceParameters", () => {
  test("NovelAI uses resolvedReferenceImages with strength and character type", () => {
    const patch = referenceParameters(nai, [image], { enabled: true, strength: 0.6 });
    expect(patch.resolvedReferenceImages).toEqual([{ data: "QUJD", strength: 0.6, infoExtracted: 1, refType: "character" }]);
    expect(patch.resolvedSourceImages).toEqual([]);
  });
  test("NovelAI disabled or zero strength sends an explicit empty list", () => {
    expect(referenceParameters(nai, [image], { enabled: false, strength: 0.6 }).resolvedReferenceImages).toEqual([]);
    expect(referenceParameters(nai, [image], { enabled: true, strength: 0 }).resolvedReferenceImages).toEqual([]);
    expect(referenceParameters(nai, [], { enabled: true, strength: 0.6 }).resolvedReferenceImages).toEqual([]);
  });
  test("ComfyUI maps references to source images and denoise", () => {
    const patch = referenceParameters(comfy, [image], { enabled: true, strength: 0.6 });
    expect(patch).toEqual({
      resolvedSourceImages: [{ data: "QUJD", mimeType: "image/png" }],
      resolvedReferenceImages: [],
      denoise: 0.6,
      comfyui_field_values: { denoise: 0.6 }
    });
    const off = referenceParameters(comfy, [image], { enabled: false, strength: 0.6 });
    expect(off.denoise).toBe(0);
    expect(off.resolvedSourceImages).toEqual([]);
  });
  test("ComfyUI without init_image fails when enabled and is a no-op otherwise", () => {
    expect(() => referenceParameters(plainComfy, [image], { enabled: true, strength: 0.6 })).toThrow("init_image");
    expect(referenceParameters(plainComfy, [image], { enabled: false, strength: 0.6 })).toEqual({});
  });
  test("SwarmUI uses source images, other providers get nothing", () => {
    expect(referenceParameters(swarm, [image], { enabled: true, strength: 1 })).toEqual({ resolvedSourceImages: [image] });
    expect(referenceParameters({ ...swarm, provider: "openai" }, [image], { enabled: true, strength: 1 })).toEqual({});
    expect(referenceParameters(null, [image], { enabled: true, strength: 1 })).toEqual({});
  });
});

describe("parameter merging", () => {
  test("comfyui_field_values merge key by key", () => {
    const merged = mergeReferenceParameters(
      { denoise: 0.9, resolvedSourceImages: [{ data: "OLD" }], comfyui_field_values: { width: 1000, denoise: 0.9 } },
      referenceParameters(comfy, [], { enabled: false, strength: 0.6 })
    );
    expect(merged.denoise).toBe(0);
    expect(merged.resolvedSourceImages).toEqual([]);
    expect(merged.comfyui_field_values).toEqual({ width: 1000, denoise: 0 });
  });
  test("host-mapped ComfyUI workflows drop the inline graph", () => {
    const params = { workflow: { a: 1 }, workflowFormat: "api_prompt", preserveImportedWorkflow: true, seed: 3 };
    expect(hostWorkflowParameters(params, comfy)).toEqual({ seed: 3 });
    expect(hostWorkflowParameters(params, plainComfy)).toBe(params);
    expect(hostWorkflowParameters(params, nai)).toBe(params);
  });
});

describe("NovelAI per-character helpers", () => {
  test("folds unique character negatives into the shared negative", () => {
    expect(sharedNegativeWithCharacterNegatives("blurry", [{ negative: "hat" }, { negative: "hat" }, { negative: "" }, {}]))
      .toBe("blurry, hat");
    expect(sharedNegativeWithCharacterNegatives("", undefined)).toBe("");
  });
  test("maps characters to characterTags", () => {
    expect(characterTagsParameter([{ prompt: "girl, black hair" }])).toEqual([{ tags: "girl, black hair" }]);
  });
});
