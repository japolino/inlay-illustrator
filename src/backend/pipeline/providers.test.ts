import { describe, expect, test } from "bun:test";
import { rpcError } from "../../shared/contract/index.js";
import { RpcFailure } from "../rpc/errors.js";
import { createFakeServices } from "../testing/fake-services.js";
import { buildNovelAIRequest, onGround, createComfyReferencePreparer, createImageProviderAdapters, ProviderRunRegistry, toProviderError } from "./providers.js";

const ctx = { purpose: "chat" as const, connectionId: "img-1", model: "nai-diffusion-4-5-full", ownerChatId: "c1", ownerCharacterId: "ch1", forceRating: () => false as const };

describe("NovelAI request (AM jut / gge / Cut; 0.9.90 rating wrapper Mht)", () => {
  test("v4 captions with per-character negatives and coordinates, fixed rating tag, retries 0 + queue", () => {
    const build = buildNovelAIRequest(
      {
        prompt: "1girl, 1boy, classroom",
        negativePrompt: "lowres",
        seed: "123",
        width: 1216,
        height: 832,
        config: {
          naiModel: "nai-diffusion-4-5-full",
          steps: 99,
          useCoords: true,
          characterPrompts: [
            { prompt: "girl, red hair, rating:explicit", uc: "bad hands", centerX: 0.3, centerY: 0.5, coordinateMode: "fixed" },
            { prompt: "boy, black hair", uc: "", centerX: 0.7, centerY: 0.5, coordinateMode: "fixed" },
            { prompt: "", uc: "" },
          ],
        },
      },
      { ...ctx, forceRating: () => "nsfw" as const },
    );
    const r = build.request;
    // AM 0.9.90 `Mht`: the fixed rating replaces the prompt's rating tags; character prompts lose theirs.
    expect(r.prompt.startsWith("nsfw, ")).toBe(true);
    expect(r.negativePrompt).toBe("lowres");
    expect(r.seed).toBe(123);
    expect(r.width).toBe(1216);
    expect(r.retries).toBe(0);
    expect(r.queue).toBe(true);
    expect(r.ownerChatId).toBe("c1");
    expect(r.novelai?.steps).toBe(50);
    expect(r.novelai?.useCoords).toBe(true);
    expect(r.novelai?.characters).toEqual([
      { prompt: "girl, red hair", negativePrompt: "bad hands", center: { x: 0.3, y: 0.5 } },
      { prompt: "boy, black hair", negativePrompt: "", center: { x: 0.7, y: 0.5 } },
    ]);
  });

  test("a fixed \"sfw\" rating replaces an nsfw tag of the prompt (AM OG)", () => {
    const r = buildNovelAIRequest({ prompt: "nsfw, 1girl, rating:explicit, beach", negativePrompt: "", seed: "1", width: 832, height: 1216, config: {} }, { ...ctx, forceRating: () => "sfw" as const }).request;
    expect(r.prompt).toBe("sfw, 1girl, beach");
  });

  test("request.forceRating false wins over the source's fixed rating; automatic coordinates send no centers", () => {
    const r = buildNovelAIRequest(
      { prompt: "landscape", negativePrompt: "", seed: "", width: 832, height: 1216, forceRating: false, config: { useCoords: false, characterPrompts: [{ prompt: "a", uc: "", coordinateMode: "automatic" }] } },
      { ...ctx, forceRating: () => "nsfw" as const },
    ).request;
    expect(r.prompt).toBe("landscape");
    expect(r.novelai?.useCoords).toBe(false);
    expect(r.novelai?.characters).toEqual([{ prompt: "a", negativePrompt: "" }]);
    expect(typeof r.seed).toBe("number");
  });

  test("the run config's NovelAI effort reaches the image request (AM 0.9.90 High / Medium)", () => {
    const base = { prompt: "landscape", negativePrompt: "", seed: "", width: 832, height: 1216 };
    expect(buildNovelAIRequest({ ...base, config: { effort: "medium" } }, { ...ctx, model: "nai-diffusion-5-full" }).request.novelai?.effort).toBe("medium");
    expect(buildNovelAIRequest({ ...base, config: { effort: "high" } }, ctx).request.novelai?.effort).toBe("high");
    expect(buildNovelAIRequest({ ...base, config: {} }, ctx).request.novelai).not.toHaveProperty("effort");
  });

  test("non-artist weight rescales everything outside the artist segment", () => {
    const build = buildNovelAIRequest(
      {
        prompt: "1girl, smile, artist:foo",
        negativePrompt: "lowres",
        seed: "1",
        width: 832,
        height: 1216,
        config: { nonArtistPromptWeight: { enabled: true, multiplier: 0.5 }, nonArtistPromptWeightArtist: { id: "a", name: "A", positive: "artist:foo", negative: "" }, characterPrompts: [] },
      },
      ctx,
    );
    expect(build.request.prompt).toContain("artist:foo");
    expect(build.request.prompt).not.toBe("1girl, smile, artist:foo");
    expect((build.finalizedPrompt.weight as { status: string }).status).toBe("applied");
  });

  test("empty prompt fails without retry", () => {
    expect(() => buildNovelAIRequest({ prompt: "  ", negativePrompt: "", seed: "", width: 1, height: 1, config: {} }, ctx)).toThrow("NovelAI prompt is empty.");
  });
});

describe("adapters over ImageService", () => {
  test("run context is routed through providerRef.queueScopeKey; references only for V4.5 models", async () => {
    const fx = createFakeServices();
    const registry = new ProviderRunRegistry();
    const adapters = createImageProviderAdapters(fx.services, registry);
    const runId = registry.register({ ...ctx, model: "nai-diffusion-4-5-full" });
    const providerRef = { providerId: "novelai", queueScopeKey: registry.queueScopeKey(runId) };
    const result = await adapters.novelai!.generate({
      provider: "novelai",
      providerRef,
      prompt: "1girl",
      negativePrompt: "",
      seed: "5",
      width: 832,
      height: 1216,
      config: { characterReferenceEnabled: true, characterPrompts: [] },
      references: [{ asset: { key: "img-ref", name: "ref", extension: "png" }, strength: 0.5, fidelity: 1, type: "character" }],
    });
    expect(fx.imageRequests[0]!.connectionId).toBe("img-1");
    expect(fx.imageRequests[0]!.novelai?.characterReferences?.length).toBe(1);
    expect((result.providerMetadata as { imageId: string }).imageId).toBe("fake-image-1");
    expect(result.seed).toBe("5");
    const r2 = registry.register({ ...ctx, model: "nai-diffusion-5-full" });
    await adapters.novelai!.generate({ provider: "novelai", providerRef: { providerId: "novelai", queueScopeKey: registry.queueScopeKey(r2) }, prompt: "x", negativePrompt: "", seed: "", width: 832, height: 1216, config: { characterReferenceEnabled: true }, references: [{ asset: { key: "img-ref" } }] });
    expect(fx.imageRequests[1]!.novelai?.characterReferences).toBeUndefined();
  });

  test("references keep their crop for the bytes service (NovelAI and ComfyUI)", async () => {
    const seen: unknown[] = [];
    const fx = createFakeServices({ imageBytes: { getAsset: async (asset: unknown) => (seen.push(asset), { data: "AA==", mimeType: "image/png" }) } });
    const registry = new ProviderRunRegistry();
    const adapters = createImageProviderAdapters(fx.services, registry);
    const cropReference = { version: 1, assetKey: "storage:characters/ch1/reference-crops/c.png" };
    const runId = registry.register({ ...ctx, model: "nai-diffusion-4-5-full" });
    await adapters.novelai!.generate({
      provider: "novelai",
      providerRef: { providerId: "novelai", queueScopeKey: registry.queueScopeKey(runId) },
      prompt: "1girl",
      negativePrompt: "",
      seed: "5",
      width: 832,
      height: 1216,
      config: { characterReferenceEnabled: true, characterPrompts: [] },
      references: [{ asset: { key: "img-ref", name: "ref", extension: "png" }, cropReference, strength: 0.5, fidelity: 1, type: "character" }],
    });
    await createComfyReferencePreparer(fx.services).prepare({ asset: { key: "img-ref", name: "ref", extension: "png" }, cropReference });
    expect(seen).toEqual([
      { key: "img-ref", name: "ref", extension: "png", cropReference },
      { key: "img-ref", name: "ref", extension: "png", cropReference },
    ]);
  });

  test("AM request checks: V5 profile needs a V4+ model, empty img2img source, references read only when sent", async () => {
    expect(() => buildNovelAIRequest({ prompt: "1girl", negativePrompt: "", seed: "1", width: 832, height: 1216, config: { analysisProfile: "v5-hybrid" } }, { ...ctx, model: "nai-diffusion-3" })).toThrow(/V4 or later/);
    const seen: unknown[] = [];
    const fx = createFakeServices({ imageBytes: { getAsset: async (asset: unknown) => (seen.push(asset), { data: "AA==", mimeType: "image/png" }) } });
    const registry = new ProviderRunRegistry();
    const adapters = createImageProviderAdapters(fx.services, registry);
    const run = (model: string, config: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
      const runId = registry.register({ ...ctx, model });
      return adapters.novelai!.generate({ provider: "novelai", providerRef: { providerId: "novelai", queueScopeKey: registry.queueScopeKey(runId) }, prompt: "1girl", negativePrompt: "", seed: "5", width: 832, height: 1216, config, references: [{ asset: { key: "img-ref" } }], ...extra });
    };
    await run("nai-diffusion-4-5-full", { characterReferenceEnabled: false });
    await run("nai-diffusion-5-full", { characterReferenceEnabled: true });
    expect(seen).toEqual([]);
    await expect(run("nai-diffusion-4-5-full", {}, { imageToImage: { image: "" } })).rejects.toThrow(/img2img source image is empty/);
  });

  test("ImageService failures map to dispatcher-classifiable errors", () => {
    const e = toProviderError(new RpcFailure(rpcError("provider-error", "HTTP 503", { retryable: true, details: { status: 503 } }))) as { retryable: boolean; status: number; code: string };
    expect(e.retryable).toBe(true);
    expect(e.status).toBe(503);
    const t = toProviderError(new RpcFailure(rpcError("timeout", "slow"))) as { code: string; retryable: boolean };
    expect(t.code).toBe("REQUEST_TIMEOUT");
    expect(t.retryable).toBe(true);
  });
});

describe("a picture that gets cut out", () => {
  const ground = { add: "white background", negative: "room", drop: ["vignette", "blank page"] };
  test("is told its ground, and the preset's tags against it go; everything else stays", () => {
    const got = onGround({ prompt: "1girl, 1.8::artist:someone ::, vignette, rim light", negativePrompt: "lowres, blank page", seed: 1 }, ground);
    expect(got).toEqual({ prompt: "1girl, 1.8::artist:someone ::, rim light, white background", negativePrompt: "lowres, room", seed: 1 });
  });
  test("any other picture is left as it is", () => {
    const request = { prompt: "1girl, vignette", negativePrompt: "lowres" };
    expect(onGround(request, undefined)).toBe(request);
  });
});
