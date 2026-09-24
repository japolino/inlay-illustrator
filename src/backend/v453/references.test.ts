import { afterEach, beforeEach, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../../shared/config.js";
import { generateWithSnapshots, referenceParameters } from "./references.js";
import { buildImageParameters } from "../images.js";
import type { ImageConnection } from "../types.js";

const root = globalThis as typeof globalThis & { spindle: unknown };
const original = root.spindle;
let calls: Array<Record<string, any>>;
let files: Map<string, unknown>;
const descriptor = { slot: 0, cast: "1girl", camera: "from above, upper body", scene: "library",
  characters: [{ name: "Mira", positive: "girl on the left, adult, black hair", negative: "hat", description: "Reaching for a book." }] };
const rawShot = { paragraph: 1, characters: [], lightboard: descriptor };
const nai: ImageConnection = { id: "snap-nai", name: "NovelAI", provider: "novelai", model: "nai-diffusion-4-5-full", default_parameters: {} };
const config = { ...DEFAULT_CONFIG, referenceSnapshots: true, promptSyntax: "nai" as const };
const workflow = { workflow_api_json: { "1": { class_type: "LoadImage", inputs: { image: "embedded.png" } }, "2": { inputs: { denoise: 0.8 } } },
  field_mappings: [{ nodeId: "1", fieldName: "image", mappedAs: "init_image" }, { nodeId: "2", fieldName: "denoise", mappedAs: "denoise" },
    { nodeId: "3", fieldName: "text", mappedAs: "positive_prompt" }] };
const comfy: ImageConnection = { ...nai, id: "snap-comfy", name: "Comfy", provider: "comfyui", model: "workflow", metadata: { comfyui: workflow } };
const request = { prompt: "chat scene", parameters: {}, owner_chat_id: "chat", userId: "user", includeDataUrl: false };

beforeEach(() => {
  calls = []; files = new Map();
  root.spindle = {
    imageGen: { generate: async (r: Record<string, any>) => {
      calls.push(r);
      return { imageId: `image-${calls.length}`, imageUrl: `/image-${calls.length}.png`, imageDataUrl: "data:image/png;base64,QUJD" };
    } },
    userStorage: {
      getJson: async (p: string, o: { fallback: unknown; userId?: string }) => files.get(`${o.userId}:${p}`) ?? o.fallback,
      setJson: async (p: string, value: unknown, o: { userId?: string }) => { files.set(`${o.userId}:${p}`, structuredClone(value)); }
    }, log: { info() {}, warn() {}, error() {} }
  };
});
afterEach(() => { root.spindle = original; });

test("generates a dedicated snapshot before the illustration and reuses it", async () => {
  await generateWithSnapshots(request, rawShot, config, nai);
  expect(calls).toHaveLength(2);
  expect(calls[0]!.includeDataUrl).toBe(true);
  expect(calls[0]!.prompt).toContain("character reference portrait");
  expect(calls[0]!.parameters.characterTags[0].tags).toContain("black hair");
  expect(calls[0]!.parameters.resolvedReferenceImages).toEqual([]);
  expect(calls[1]!.includeDataUrl).toBe(false);
  expect(calls[1]!.parameters.resolvedReferenceImages[0]).toMatchObject({ data: "QUJD", refType: "character", strength: 0.6 });
  expect(calls[1]!.parameters.characterTags[0].tags).toContain("black hair");
  expect(calls[1]!.negativePrompt).toContain("hat");
  await generateWithSnapshots(request, rawShot, config, nai);
  expect(calls).toHaveLength(3);
  expect([...files.keys()]).toHaveLength(1);
  expect([...files.keys()][0]).toContain("snapshots/");
  expect([...files.keys()].some(k => k.includes("records/"))).toBe(false);
});

test("coalesces simultaneous snapshots and isolates chats, users, styles, and refreshes", async () => {
  await Promise.all([generateWithSnapshots(request, rawShot, config, nai), generateWithSnapshots(request, rawShot, config, nai)]);
  expect(calls.filter(c => c.includeDataUrl)).toHaveLength(1);
  await generateWithSnapshots({ ...request, owner_chat_id: "other" }, rawShot, config, nai);
  await generateWithSnapshots({ ...request, userId: "other" }, rawShot, config, nai);
  await generateWithSnapshots(request, rawShot, { ...config, customPositivePrefix: "oil painting" }, nai);
  await generateWithSnapshots(request, rawShot, { ...config, referenceRevision: 1 }, nai);
  expect(calls.filter(c => c.includeDataUrl)).toHaveLength(5);
});

test("ComfyUI reference conditioning is zero for snapshots and disabled references", async () => {
  const cfg = { ...config, promptSyntax: "comfyui" as const };
  await generateWithSnapshots({ ...request, parameters: { workflow: workflow.workflow_api_json } }, rawShot, cfg, comfy);
  expect(calls[0]!.parameters.workflow).toBeUndefined();
  expect(calls[1]!.parameters.workflow).toBeUndefined();
  expect(calls[0]!.parameters.denoise).toBe(0);
  expect(calls[0]!.parameters.comfyui_field_values.denoise).toBe(0);
  expect(calls[1]!.parameters.denoise).toBe(0.6);
  expect(calls[1]!.parameters.resolvedSourceImages).toEqual([{ data: "QUJD", mimeType: "image/png" }]);
  await generateWithSnapshots({ ...request, parameters: { denoise: 0.9, resolvedSourceImages: [{ data: "OLD" }], comfyui_field_values: { width: 1000, denoise: 0.9 } } }, rawShot, { ...cfg, referenceSnapshots: false }, comfy);
  expect(calls[2]!.parameters.denoise).toBe(0);
  expect(calls[2]!.parameters.resolvedSourceImages).toEqual([]);
  expect(calls[2]!.parameters.comfyui_field_values).toEqual({ width: 1000, denoise: 0 });
  expect(calls.filter(c => c.includeDataUrl)).toHaveLength(1);
});

test("plain txt2img workflows retain embedded sampling and invalid reference setup fails before billing", async () => {
  const plain = { ...comfy, metadata: {} };
  expect(referenceParameters(plain, [], DEFAULT_CONFIG)).toEqual({});
  await expect(generateWithSnapshots(request, rawShot, config, plain)).rejects.toThrow("init_image");
  expect(calls).toHaveLength(0);
});

test("ComfyUI creates a separate cast sheet, NovelAI creates individual portraits", async () => {
  const pair = { ...rawShot, lightboard: { ...descriptor, cast: "2girls", characters: [...descriptor.characters, { ...descriptor.characters[0]!, name: "Lena", positive: "girl on the right, adult, red hair" }] } };
  await generateWithSnapshots(request, pair, { ...config, promptSyntax: "comfyui" }, comfy);
  expect(calls.filter(c => c.includeDataUrl)).toHaveLength(1);
  expect(calls[0]!.prompt).toContain("2 distinct characters");
  expect(calls[0]!.prompt).toContain("red hair");
  calls.length = 0;
  await generateWithSnapshots(request, pair, config, nai);
  expect(calls.filter(c => c.includeDataUrl)).toHaveLength(2);
  expect(calls[2]!.parameters.resolvedReferenceImages).toHaveLength(2);
});

test("zero strength makes no snapshot request; cancelled generation commits no snapshot", async () => {
  await generateWithSnapshots(request, rawShot, { ...config, referenceStrength: 0 }, nai);
  expect(calls).toHaveLength(1);
  expect(files.size).toBe(0);
  const controller = new AbortController(); controller.abort();
  await expect(generateWithSnapshots(request, rawShot, config, nai, controller.signal)).rejects.toThrow();
  expect(calls).toHaveLength(1);
  expect(files.size).toBe(0);
});

test("NovelAI parameters honor host names and extension overrides", async () => {
  const connection = { ...nai, default_parameters: { resolution: "1216x832", guidance: 7.5, sampler: "k_euler" } };
  const inherited = await buildImageParameters(DEFAULT_CONFIG, connection, "scene", "blur");
  expect(inherited).toMatchObject({ resolution: "1216x832", width: 1216, height: 832, guidance: 7.5, negativePrompt: "blur" });
  const override = await buildImageParameters({ ...DEFAULT_CONFIG, imageParameters: { scale: 4, resolution: "1024x1024" } }, connection, "scene", "blur");
  expect(override).toMatchObject({ guidance: 4, resolution: "1024x1024" });
});


test("older NovelAI models keep characters in the main prompt and unnamed characters do not create snapshots", async () => {
  await generateWithSnapshots(request, rawShot, { ...config, referenceSnapshots: false }, { ...nai, model: "nai-diffusion-3" });
  expect(calls[0]!.prompt).toContain("black hair");
  expect(calls[0]!.parameters.characterTags).toEqual([]);
  await generateWithSnapshots(request, { ...rawShot, lightboard: { ...descriptor, characters: [{ ...descriptor.characters[0]!, name: "" }] } }, config, nai);
  expect(calls).toHaveLength(2);
  expect(calls[1]!.parameters.characterTags[0].tags).toContain("black hair");
  expect(calls[1]!.parameters.resolvedReferenceImages).toEqual([]);
});
