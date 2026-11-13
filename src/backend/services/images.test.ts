import { describe, expect, test } from "bun:test";
import { normalizeConfig, type InlayConfig } from "../../shared/contract/index.js";
import { createFakeHost, TINY_PNG_BASE64 } from "../testing/fake-host.js";
import {
  ABANDONED_REQUEST_HOLD_MS,
  buildNovelAIParameters,
  createImageService,
  imageRequestTimeoutMs,
  isConcurrentLockError,
  isRetryableImageError,
  normalizeNovelAiSampler,
  NOVELAI_REQUEST_TIMEOUT_MS,
  parseSeed,
  readComfyConfig,
} from "./images.js";

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
    expect(normalizeNovelAiSampler("dpmpp_2m_sde")).toBe("k_dpmpp_2m_sde");
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

  test("per-attempt timeouts: NovelAI 120 s (AM kmt), ComfyUI from settings, others none", () => {
    const config = normalizeConfig({ runtime: { comfyuiCompletionTimeoutMs: 5000 } });
    expect(imageRequestTimeoutMs("novelai", config)).toBe(NOVELAI_REQUEST_TIMEOUT_MS);
    expect(NOVELAI_REQUEST_TIMEOUT_MS).toBe(120_000);
    expect(imageRequestTimeoutMs("comfy-ui", config)).toBe(5000);
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
    expect(JSON.parse(built.parameters.rawRequestOverride as string).parameters).toMatchObject({ params_version: 4, skip_cfg_above_sigma: null, negative_prompt: "" });
    const v45 = buildNovelAIParameters({ purpose: "chat", prompt: "x", negativePrompt: "", width: 1024, height: 1024 }, config, { model: "nai-diffusion-4-5-curated", isNovelAIV5: false });
    expect(JSON.parse(v45.parameters.rawRequestOverride as string).parameters.skip_cfg_above_sigma).toBe(59.04722600415217);
  });
});

describe("NovelAI V5 High / Medium (AM 0.9.90 effort)", () => {
  const request = (extra: Record<string, unknown> = {}) => ({
    purpose: "chat" as const,
    prompt: "scene",
    negativePrompt: "bad",
    width: 832,
    height: 1216,
    seed: 3,
    novelai: { characters: [{ prompt: "girl", negativePrompt: "male", center: { x: 0.3, y: 0.5 } }], useCoords: true, steps: 40, scale: 7, cfgRescale: 0.4, sampler: "k_dpmpp_2m" },
    ...extra,
  });
  const v5 = { model: "nai-diffusion-5-full", isNovelAIV5: true };
  test("Medium on V5 Full: medium model, 14 steps, Euler Ancestral, empty negatives and NovelAI's Medium fields", () => {
    const config = normalizeConfig({ novelai: { effort: "medium", steps: 30, sampler: "k_euler", cfgRescale: 0.3, negativePrompt: "global bad" } });
    const built = buildNovelAIParameters(request(), config, v5, {}, () => 9);
    expect(built.model).toBe("nai-diffusion-5-full-medium");
    expect(built.parameters).toMatchObject({ steps: 14, sampler: "k_euler_ancestral", guidance: 7, negativePrompt: "" });
    const inner = JSON.parse(built.parameters.rawRequestOverride as string).parameters;
    expect(inner).toMatchObject({ params_version: 4, negative_prompt: "", ucPresetId: "heavy", qualityPresetId: "standard", tag_hint_qt: 1, tag_hint_uc_preset: 2, normalize_reference_strength_multiple: true, straight_alpha: true, image_format: "png", inpaintImg2ImgStrength: 1, noise_schedule: "karras" });
    for (const key of ["cfg_rescale", "qualityToggle", "skip_cfg_above_sigma"]) expect(Object.hasOwn(inner, key)).toBe(false);
    expect(inner.v4_negative_prompt.caption.base_caption).toBe("");
    expect(inner.v4_negative_prompt.caption.char_captions.map((c: { char_caption: string }) => c.char_caption)).toEqual([""]);
    expect(inner.characterPrompts).toEqual([{ prompt: "girl", uc: "", center: { x: 0.3, y: 0.5 }, enabled: true }]);
    expect(inner.v4_prompt.caption.char_captions[0].centers).toEqual([{ x: 0.3, y: 0.5 }]);
    expect(built.sampling).toEqual({ model: "nai-diffusion-5-full-medium", effort: "medium", steps: 14, sampler: "k_euler_ancestral", scale: 7, cfgRescale: 0.4, noiseSchedule: "karras" });
    // The stored settings are untouched (High uses them again).
    expect(config.novelai).toMatchObject({ steps: 30, sampler: "k_euler", cfgRescale: 0.3, negativePrompt: "global bad", effort: "medium" });
  });
  test("High on the same model is unchanged; Medium is ignored on V5 Curated and 4.5; a request can force the effort", () => {
    const high = buildNovelAIParameters(request(), normalizeConfig({}), v5, {}, () => 9);
    expect(high.model).toBeUndefined();
    expect(high.parameters).toMatchObject({ steps: 40, sampler: "k_dpmpp_2m", negativePrompt: "bad" });
    const highInner = JSON.parse(high.parameters.rawRequestOverride as string).parameters;
    expect(highInner).toMatchObject({ cfg_rescale: 0.4, qualityToggle: true, negative_prompt: "bad" });
    expect(highInner).not.toHaveProperty("ucPresetId");
    expect(high.sampling).toMatchObject({ model: "nai-diffusion-5-full", effort: "high", steps: 40 });
    const medium = normalizeConfig({ novelai: { effort: "medium" } });
    for (const model of ["nai-diffusion-5-curated", "nai-diffusion-4-5-full"]) {
      const built = buildNovelAIParameters(request(), medium, { model, isNovelAIV5: model.startsWith("nai-diffusion-5") }, {}, () => 9);
      expect(built.model).toBeUndefined();
      expect(built.parameters.steps).toBe(40);
    }
    const forced = buildNovelAIParameters(request({ novelai: { ...request().novelai, effort: "medium" } }), normalizeConfig({}), v5, {}, () => 9);
    expect(forced.model).toBe("nai-diffusion-5-full-medium");
  });
  test("an unknown effort normalizes to high; the service sends the medium model as the host model", async () => {
    expect(normalizeConfig({ novelai: { effort: "ultra" } }).novelai.effort).toBe("high");
    expect(normalizeConfig({}).novelai.effort).toBe("high");
    const { fake, images } = setup({ image: { connectionId: "nai5" }, novelai: { effort: "medium" } });
    const result = await images.generate({ purpose: "chat", prompt: "scene", negativePrompt: "bad", width: 832, height: 1216, seed: 5 });
    expect(fake.imageGenCalls[0]!.input).toMatchObject({ model: "nai-diffusion-5-full-medium", negativePrompt: "" });
    expect(result.sampling).toMatchObject({ effort: "medium", steps: 14 });
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

  test("NovelAI's account lock is retried after 2, 4, 6 ... s; other errors keep 100 ms", async () => {
    const { fake, images, sleeps } = setup({ runtime: { generationAutoRetryCount: 5 } });
    const locked = () => new Error("NovelAI image generate failed (429): Concurrent generation is locked");
    expect(isConcurrentLockError(locked())).toBe(true);
    expect(isConcurrentLockError(new Error("NovelAI image generate failed (429): Too many requests"))).toBe(false);
    fake.scriptImageGen(locked(), new Error("NovelAI image generate failed (500): oops"), locked(), locked(), { imageDataUrl: "", model: "m", provider: "novelai", imageId: "ok", imageUrl: "/x" } as never);
    const labels: string[] = [];
    const result = await images.generate({ purpose: "chat", prompt: "p", negativePrompt: "", width: 512, height: 512 }, { onProgress: (p) => labels.push(p.label) });
    expect(result.imageId).toBe("ok");
    expect(sleeps).toEqual([2000, 100, 6000, 8000]);
    expect(labels).toContain("NovelAI is busy with another image, waiting");
  });

  /** NovelAI service whose 60 s hold cap only ends when the test says so; other waits are instant. */
  function holdSetup() {
    const fake = createFakeHost();
    fake.imageConnections.push(conn("nai", "novelai", "nai-diffusion-4-5-full", { is_default: true }));
    const config = normalizeConfig({});
    let endCap: () => void = () => undefined;
    const sleep = (ms: number) => (ms === ABANDONED_REQUEST_HOLD_MS ? new Promise<void>((resolve) => (endCap = resolve)) : Promise.resolve());
    const images = createImageService({ host: fake.host, userId: fake.userId, loadConfig: async () => config, sleep });
    const request = (prompt: string) => ({ purpose: "chat" as const, prompt, negativePrompt: "", width: 512, height: 512 });
    return { fake, images, request, endCap: () => endCap() };
  }
  const settle = (ms = 10) => new Promise((r) => setTimeout(r, ms));

  test("a NovelAI image we stopped waiting for keeps the queue closed until NovelAI finishes it", async () => {
    const { fake, images, request } = holdSetup();
    let finishFirst!: () => void;
    fake.scriptImageGen(() => new Promise((resolve) => (finishFirst = () => resolve({ imageDataUrl: "", model: "m", provider: "novelai", imageId: "late", imageUrl: "/x" } as never))));
    fake.addImage({ id: "late" });
    const controller = new AbortController();
    const first = images.generate(request("1"), { signal: controller.signal });
    await settle();
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = images.generate(request("2"));
    await settle(30);
    // NovelAI is still drawing image 1: image 2 is not sent into the account lock.
    expect(fake.imageGenCalls).toHaveLength(1);
    finishFirst();
    await second;
    expect(fake.imageGenCalls.map((c) => c.input.prompt)).toEqual(["1", "2"]);
    expect(fake.deletedImageIds).toEqual(["late"]);
  });

  test("queue: false skips the order but still waits for an abandoned NovelAI request", async () => {
    const { fake, images, request } = holdSetup();
    let finishFirst!: () => void;
    fake.scriptImageGen(() => new Promise((resolve) => (finishFirst = () => resolve({ imageDataUrl: "", model: "m", provider: "novelai", imageId: "late", imageUrl: "/x" } as never))));
    fake.addImage({ id: "late" });
    const controller = new AbortController();
    const first = images.generate({ ...request("1"), queue: false }, { signal: controller.signal });
    await settle();
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = images.generate({ ...request("2"), queue: false });
    await settle(30);
    expect(fake.imageGenCalls).toHaveLength(1);
    finishFirst();
    await second;
    expect(fake.imageGenCalls.map((c) => c.input.prompt)).toEqual(["1", "2"]);
  });

  test("the hold ends after 60 s when the abandoned NovelAI request never settles", async () => {
    const { fake, images, request, endCap } = holdSetup();
    fake.scriptImageGen(() => new Promise(() => undefined));
    const controller = new AbortController();
    const first = images.generate(request("1"), { signal: controller.signal });
    await settle();
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = images.generate(request("2"));
    await settle(30);
    expect(fake.imageGenCalls).toHaveLength(1);
    endCap();
    await second;
    expect(fake.imageGenCalls).toHaveLength(2);
  });

  test("ComfyUI: workflow id, source image + denoise when init_image is mapped, unsupported otherwise; other providers are refused", async () => {
    const { fake, images } = setup({ image: { connectionId: "comfy", comfyuiWorkflowId: "wf-img2img" } });
    await images.generate({ purpose: "outfit", prompt: "p", negativePrompt: "n", width: 832, height: 1216, seed: "9", comfy: { sourceImage: { data: "QQ==", mimeType: "image/png" }, denoise: 0.45 } });
    expect(fake.imageGenCalls[0]!.input.parameters).toMatchObject({ workflow_id: "wf-img2img", width: 832, height: 1216, seed: 9, negativePrompt: "n", resolvedSourceImages: [{ data: "QQ==", mimeType: "image/png" }], denoise: 0.45, comfyui_field_values: { denoise: 0.45 } });
    const s2 = setup({ image: { connectionId: "comfy" } });
    await expect(s2.images.generate({ purpose: "outfit", prompt: "p", negativePrompt: "", width: 512, height: 512, comfy: { sourceImage: { data: "QQ==", mimeType: "image/png" } } })).rejects.toMatchObject({ error: { code: "unsupported" } });
    expect(s2.fake.imageGenCalls).toHaveLength(0);
    // The port's former "generic" providers were removed: a connection of another provider is refused clearly.
    const s3 = setup({ image: { connectionId: "oa" } });
    await expect(s3.images.generate({ purpose: "test", prompt: "p", negativePrompt: "n", width: 1024, height: 1024 })).rejects.toMatchObject({ error: { code: "unsupported", detailCode: "IMAGE_PROVIDER_UNSUPPORTED" } });
    await expect(s3.images.resolveTarget()).rejects.toMatchObject({ error: { code: "unsupported" } });
    expect(s3.fake.imageGenCalls).toHaveLength(0);
  });

  test("delete, connection list, models, connection test", async () => {
    const { fake, images } = setup();
    fake.addImage({ id: "x" });
    expect(await images.deleteImages(["x", "y"])).toEqual([{ imageId: "x", status: "removed" }, { imageId: "y", status: "unknown" }]);
    const list = await images.listConnections();
    expect(list.find((c) => c.id === "comfy")).toMatchObject({ generationProvider: "comfy-ui", promptCodec: "anima-flat" });
    expect(list.find((c) => c.id === "nai")).toMatchObject({ isDefault: true, generationProvider: "novelai" });
    // Other providers are listed but marked unsupported (the settings page does not offer them).
    expect(list.find((c) => c.id === "oa")).toMatchObject({ generationProvider: null, promptCodec: null });
    fake.imageModels.nai = [{ id: "nai-diffusion-5-full", label: "V5" }];
    expect((await images.listModels("nai")).map((m) => m.id)).toEqual(["nai-diffusion-4-5-full", "nai-diffusion-5-full"]);
    expect(await images.testConnection("nai")).toMatchObject({ ok: true });
    expect(await images.testConnection("missing")).toMatchObject({ ok: false, error: { code: "bad-request" } });
  });
});
