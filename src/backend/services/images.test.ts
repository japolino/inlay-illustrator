import { describe, expect, test } from "bun:test";
import { normalizeConfig, type InlayConfig } from "../../shared/contract/index.js";
import { createFakeHost, TINY_PNG_BASE64 } from "../testing/fake-host.js";
import { buildNovelAIParameters, createImageService, isRetryableImageError, normalizeNovelAiSampler, parseSeed, readComfyConfig } from "./images.js";

const comfyMeta = {
  comfyui_workflows: [
    {
      id: "wf-img2img",
      config: {
        workflow_api_json: { "1": { inputs: { image: "x.png" } } },
        field_mappings: [
          { nodeId: "1", fieldName: "image", mappedAs: "init_image" },
          { nodeId: "3", fieldName: "text", mappedAs: "positive_prompt" },
        ],
      },
    },
  ],
  comfyui: { workflow_api_json: { "3": { inputs: {} } }, field_mappings: [{ nodeId: "3", fieldName: "text", mappedAs: "positive_prompt" }] },
};

function conn(id: string, provider: string, model: string, extra: Record<string, unknown> = {}) {
  return { id, name: id, provider, api_url: "", model, is_default: false, has_api_key: true, default_parameters: {}, metadata: {}, created_at: 0, updated_at: 0, ...extra };
}

function setup(configPatch: Record<string, unknown> = {}) {
  const fake = createFakeHost();
  fake.imageConnections.push(conn("nai", "novelai", "nai-diffusion-4-5-full", { is_default: true, default_parameters: { rawRequestOverride: '{"parameters":{"dynamic_thresholding":true}}' } }), conn("nai5", "novelai", "nai-diffusion-5-full"), conn("comfy", "comfyui", "wf", { metadata: comfyMeta }), conn("oa", "openai", "gpt-image-1"));
  let config: InlayConfig = normalizeConfig(configPatch);
  const sleeps: number[] = [];
  let clock = 1_000_000;
  let seeds = 1000;
  const images = createImageService({ host: fake.host, userId: fake.userId, loadConfig: async () => config, sleep: async (ms) => void sleeps.push(ms), now: () => clock, seedSource: () => ++seeds });
  return { fake, images, sleeps, advance: (ms: number) => (clock += ms), setConfig: (c: Record<string, unknown>) => (config = normalizeConfig(c)) };
}

describe("image helpers", () => {
  test("sampler normalization, seeds, comfy workflow lookup, retryable errors", () => {
    expect(normalizeNovelAiSampler("euler_ancestral")).toBe("k_euler_ancestral");
    expect(normalizeNovelAiSampler("DDIM")).toBe("ddim_v3");
    expect(normalizeNovelAiSampler({ id: "dpmpp_2m" })).toBe("k_dpmpp_2m");
    expect(normalizeNovelAiSampler("weird")).toBeUndefined();
    expect(parseSeed("123")).toBe(123);
    expect(parseSeed("-1")).toBeNull();
    expect(parseSeed("")).toBeNull();
    expect(parseSeed(4294967296)).toBeNull();
    expect(readComfyConfig(comfyMeta, "wf-img2img")?.field_mappings?.[0]?.mappedAs).toBe("init_image");
    expect(readComfyConfig(comfyMeta)?.field_mappings?.[0]?.mappedAs).toBe("positive_prompt");
    expect(readComfyConfig({})).toBeNull();
    expect(isRetryableImageError(new Error("NovelAI image generate failed (429): busy"))).toBe(true);
    expect(isRetryableImageError(new Error("Concurrent generation is locked"))).toBe(true);
    expect(isRetryableImageError(new Error("NovelAI image generate failed (401): key"))).toBe(false);
    expect(isRetryableImageError(new DOMException("x", "AbortError"))).toBe(false);
  });

  test("NovelAI V4.5 body: host params, rawRequestOverride with coords / per-character negatives / img2img, director refs", () => {
    const config = normalizeConfig({ novelai: { steps: 30, scale: 5.5, cfgRescale: 0.2, noiseSchedule: "native", qualityToggle: true, useOrder: true } });
    const built = buildNovelAIParameters(
      {
        purpose: "chat",
        prompt: "scene",
        negativePrompt: "bad",
        width: 832,
        height: 1216,
        seed: "42",
        novelai: {
          useCoords: true,
          characters: [
            { prompt: "girl", negativePrompt: "male", center: { x: 0.3, y: 0.5 } },
            { prompt: "boy", negativePrompt: "" },
          ],
          characterReferences: [{ data: "data:image/png;base64,QUJD", mimeType: "image/png", strength: 0.7, fidelity: 0.8, type: "character" }],
          imageToImage: { data: "SU1H", mimeType: "image/png", strength: 0.1, noise: 0.2 },
        },
      },
      config,
      { model: "nai-diffusion-4-5-full", isNovelAIV5: false },
      { rawRequestOverride: '{"parameters":{"dynamic_thresholding":true}}' },
      () => 7,
    );
    const p = built.parameters;
    expect(p).toMatchObject({ resolution: "832x1216", sampler: "k_euler_ancestral", steps: 30, guidance: 5.5, seed: 42, negativePrompt: "bad", characterTags: [{ tags: "girl" }, { tags: "boy" }], referenceFidelity: 0.8 });
    expect(p.resolvedReferenceImages).toEqual([{ data: "QUJD", strength: 0.7, infoExtracted: 1, refType: "character" }]);
    const raw = JSON.parse(p.rawRequestOverride as string);
    expect(raw.action).toBe("img2img");
    expect(raw.parameters).toMatchObject({
      dynamic_thresholding: true,
      noise_schedule: "native",
      cfg_rescale: 0.2,
      qualityToggle: true,
      add_original_image: false,
      extra_noise_seed: 7,
      use_coords: false,
      skip_cfg_above_sigma: null,
      image: "SU1H",
      strength: 0.4,
      noise: 0.2,
      characterPrompts: [
        { prompt: "girl", uc: "male", center: { x: 0.3, y: 0.5 }, enabled: true },
        { prompt: "boy", uc: "", center: { x: 0, y: 0 }, enabled: true },
      ],
      v4_prompt: { caption: { base_caption: "scene", char_captions: [{ char_caption: "girl", centers: [{ x: 0.3, y: 0.5 }] }, { char_caption: "boy", centers: [{ x: 0, y: 0 }] }] }, use_coords: true, use_order: true },
      v4_negative_prompt: { caption: { base_caption: "bad", char_captions: [{ char_caption: "male", centers: [{ x: 0.3, y: 0.5 }] }, { char_caption: "", centers: [{ x: 0, y: 0 }] }] }, legacy_uc: false },
    });
  });

  test("NovelAI V5: no director reference, random seed when empty, skip_cfg only for 4.5", () => {
    const config = normalizeConfig({});
    const built = buildNovelAIParameters(
      { purpose: "chat", prompt: "x", negativePrompt: "", width: 1024, height: 1024, novelai: { characterReferences: [{ data: "QQ==", mimeType: "image/png", strength: 1, fidelity: 1, type: "style" }] } },
      config,
      { model: "nai-diffusion-5-full", isNovelAIV5: true },
      {},
      () => 99,
    );
    expect(built.parameters.resolvedReferenceImages).toBeUndefined();
    expect(built.parameters.seed).toBe(99);
    expect(built.notes[0]).toContain("Character reference skipped");
    expect(JSON.parse(built.parameters.rawRequestOverride as string).parameters).toMatchObject({ params_version: 4, skip_cfg_above_sigma: null });
    const v45 = buildNovelAIParameters({ purpose: "chat", prompt: "x", negativePrompt: "", width: 1024, height: 1024 }, config, { model: "nai-diffusion-4-5-curated", isNovelAIV5: false });
    expect(JSON.parse(v45.parameters.rawRequestOverride as string).parameters.skip_cfg_above_sigma).toBe(59.04722600415217);
  });
});

describe("image service", () => {
  test("resolveTarget uses config connection/model; NovelAI generate calls the host and returns the stored image", async () => {
    const { fake, images } = setup({ image: { connectionId: "nai" } });
    const target = await images.resolveTarget();
    expect(target).toMatchObject({ connectionId: "nai", lumiverseProvider: "novelai", generationProvider: "novelai", promptCodec: "novelai-structured", model: "nai-diffusion-4-5-full", isNovelAIV5: false });
    expect((await images.resolveTarget({ connectionId: "nai5" })).isNovelAIV5).toBe(true);
    const result = await images.generate({ purpose: "chat", prompt: "scene", negativePrompt: "bad", width: 832, height: 1216, seed: 5, ownerCharacterId: "c1", ownerChatId: "chat1", includeData: true });
    expect(result).toMatchObject({ width: 832, height: 1216, seed: "5", provider: "novelai", lumiverseProvider: "novelai", attempts: 1, dataBase64: TINY_PNG_BASE64, mimeType: "image/png" });
    expect(result.url).toBe(`/api/v1/image-gen/results/${result.imageId}`);
    const call = fake.imageGenCalls[0]!.input;
    expect(call).toMatchObject({ connection_id: "nai", prompt: "scene", model: "nai-diffusion-4-5-full", owner_character_id: "c1", owner_chat_id: "chat1", includeDataUrl: true });
    expect((call.parameters as Record<string, unknown>).negativePrompt).toBe("bad");
    expect(JSON.parse((call.parameters as Record<string, string>).rawRequestOverride).parameters.dynamic_thresholding).toBe(true);
  });

  test("retries transient errors with 100 ms and reports exhaustion", async () => {
    const { fake, images, sleeps } = setup({ runtime: { generationAutoRetryCount: 2 } });
    fake.scriptImageGen(new Error("NovelAI image generate failed (500): oops"), new Error("NovelAI image generate failed (503): busy"), new Error("NovelAI image generate failed (502): x"));
    await expect(images.generate({ purpose: "chat", prompt: "p", negativePrompt: "", width: 512, height: 512 })).rejects.toMatchObject({ error: { code: "provider-error", detailCode: "IMAGE_REQUEST_RETRY_EXHAUSTED", retryable: false } });
    expect(fake.imageGenCalls).toHaveLength(3);
    expect(sleeps).toEqual([100, 100]);
    fake.scriptImageGen(new Error("failed (500): x"));
    await expect(images.generate({ purpose: "chat", prompt: "p", negativePrompt: "", width: 512, height: 512, retries: 0 })).rejects.toMatchObject({ error: { code: "provider-error" } });
    expect(fake.imageGenCalls).toHaveLength(4);
  });

  test("serial queue with the configured gap; abort while queued discards", async () => {
    const { fake, images, sleeps } = setup({ runtime: { novelaiParallelIntervalSec: 3 } });
    let release!: () => void;
    fake.scriptImageGen(() => new Promise((resolve) => (release = () => resolve({ imageDataUrl: "", model: "m", provider: "novelai", imageId: "a1", imageUrl: "/api/v1/image-gen/results/a1" }))));
    const queued: Array<{ position: number; depth: number }> = [];
    const first = images.generate({ purpose: "chat", prompt: "1", negativePrompt: "", width: 512, height: 512 });
    await new Promise((r) => setTimeout(r, 5));
    const second = images.generate({ purpose: "chat", prompt: "2", negativePrompt: "", width: 512, height: 512 }, { onProgress: (p) => p.queue && queued.push(p.queue) });
    const controller = new AbortController();
    const third = images.generate({ purpose: "chat", prompt: "3", negativePrompt: "", width: 512, height: 512 }, { signal: controller.signal });
    await new Promise((r) => setTimeout(r, 5));
    expect(fake.imageGenCalls).toHaveLength(1);
    controller.abort();
    await expect(third).rejects.toMatchObject({ name: "AbortError" });
    release();
    await first;
    await second;
    expect(fake.imageGenCalls.map((c) => c.input.prompt)).toEqual(["1", "2"]);
    expect(queued[0]).toEqual({ position: 1, depth: 2 });
    expect(sleeps).toEqual([3000]);
  });

  test("abort during the request deletes the late result", async () => {
    const { fake, images } = setup();
    let release!: () => void;
    fake.scriptImageGen(() => new Promise((resolve) => (release = () => resolve({ imageDataUrl: "", model: "m", provider: "novelai", imageId: "late", imageUrl: "/x" }))));
    fake.addImage({ id: "late" });
    const controller = new AbortController();
    const pending = images.generate({ purpose: "chat", prompt: "p", negativePrompt: "", width: 512, height: 512 }, { signal: controller.signal });
    await new Promise((r) => setTimeout(r, 5));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    release();
    await new Promise((r) => setTimeout(r, 5));
    expect(fake.deletedImageIds).toEqual(["late"]);
  });

  test("ComfyUI: workflow id, source image + denoise when init_image is mapped, unsupported otherwise; generic providers", async () => {
    const { fake, images } = setup({ image: { connectionId: "comfy", comfyuiWorkflowId: "wf-img2img" } });
    await images.generate({ purpose: "outfit", prompt: "p", negativePrompt: "n", width: 832, height: 1216, seed: "9", comfy: { sourceImage: { data: "QQ==", mimeType: "image/png" }, denoise: 0.45 } });
    expect(fake.imageGenCalls[0]!.input.parameters).toMatchObject({ workflow_id: "wf-img2img", width: 832, height: 1216, seed: 9, negativePrompt: "n", resolvedSourceImages: [{ data: "QQ==", mimeType: "image/png" }], denoise: 0.45, comfyui_field_values: { denoise: 0.45 } });
    const s2 = setup({ image: { connectionId: "comfy" } });
    await expect(s2.images.generate({ purpose: "outfit", prompt: "p", negativePrompt: "", width: 512, height: 512, comfy: { sourceImage: { data: "QQ==", mimeType: "image/png" } } })).rejects.toMatchObject({ error: { code: "unsupported" } });
    expect(s2.fake.imageGenCalls).toHaveLength(0);
    const s3 = setup({ image: { connectionId: "oa" } });
    const r = await s3.images.generate({ purpose: "test", prompt: "p", negativePrompt: "n", width: 1024, height: 1024 });
    expect(r.provider).toBe("generic");
    expect(r.seed).toBe("");
    expect(s3.fake.imageGenCalls[0]!.input.parameters).toEqual({ width: 1024, height: 1024, negativePrompt: "n" });
  });

  test("delete, connection list, models, connection test", async () => {
    const { fake, images } = setup();
    fake.addImage({ id: "x" });
    expect(await images.deleteImages(["x", "y"])).toEqual([{ imageId: "x", status: "removed" }, { imageId: "y", status: "unknown" }]);
    const list = await images.listConnections();
    expect(list.find((c) => c.id === "comfy")).toMatchObject({ generationProvider: "comfy-ui", promptCodec: "anima-flat" });
    expect(list.find((c) => c.id === "nai")).toMatchObject({ isDefault: true, generationProvider: "novelai" });
    fake.imageModels.nai = [{ id: "nai-diffusion-5-full", label: "V5" }];
    expect((await images.listModels("nai")).map((m) => m.id)).toEqual(["nai-diffusion-4-5-full", "nai-diffusion-5-full"]);
    expect(await images.testConnection("nai")).toMatchObject({ ok: true });
    expect(await images.testConnection("missing")).toMatchObject({ ok: false, error: { code: "bad-request" } });
  });
});
