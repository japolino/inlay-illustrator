import { describe, expect, test } from "bun:test";
import { normalizeFormCollection, type OutfitImageDraft } from "../../shared/contract/index.js";
import { buildOutfitImageRequest, createOutfitImageController, OUTFIT_HISTORY_LIMIT } from "./outfit.js";
import { ALICE, CHAR, createAnalysisFixture } from "./testing/fixtures.js";

const draft = (over: Partial<OutfitImageDraft> = {}): OutfitImageDraft => ({
  label: "School", head: "", top: "sailor shirt", bottom: "pleated skirt", legs: "", feet: "loafers", seed: "42", seedFixed: true, useCharacterReference: false, ...over,
});

async function withForms(fx: ReturnType<typeof createAnalysisFixture>, humanlike = true) {
  const collection = normalizeFormCollection({
    forms: [{ id: "form_default", label: "기본", gender: "female", humanlike, negativePrompt: "bad hands", basePromptGroups: { "hair.color": ["red hair"] }, reference: { enabled: true, defaultAsset: { name: "alice_smile.png", key: "img-alice_smile.png", ext: "png" } } }],
  });
  await fx.services.storage.updateCharacterDocument(CHAR, (d) => ({ ...d, characterPrompt: { ...d.characterPrompt, characterForms: { [ALICE]: collection }, outfitPartFramingWeights: { ...d.characterPrompt.outfitPartFramingWeights, top: { "cowboy shot": 0.5 } } } }));
}

const target = { kind: "character" as const, characterId: CHAR, promptKey: ALICE };

describe("outfit image prompt (AM fOt)", () => {
  test("novelai: artist + 1girl + humanlike pose + main prompt + weighted parts; negative = charx + artist", async () => {
    const fx = createAnalysisFixture();
    fx.config.value = { ...fx.config.value, image: { ...fx.config.value.image, provider: "novelai", model: "nai-diffusion-4-5-full" } };
    await withForms(fx);
    const { request, plan } = await buildOutfitImageRequest(fx.services, target, "form_default", draft({ nsfw: true }));
    expect(request).toMatchObject({ purpose: "outfit", width: 832, height: 1216, seed: "42", ownerCharacterId: CHAR });
    expect(plan.positivePrompt).toContain("1girl, 3::solo::, 2::standing::, 2::cowboy shot::");
    expect(plan.positivePrompt).toContain("nsfw, red hair");
    expect(plan.positivePrompt).toContain("sailor shirt");
    expect(plan.positivePrompt).toMatch(/0\.5::sailor shirt ?::/);
    // feet weight at "cowboy shot" is 0 by default (AM Sje) -> the part is dropped
    expect(plan.positivePrompt).not.toContain("loafers");
    expect(request.novelai?.useCoords).toBe(false);
    expect(request.novelai?.characters?.[0]).toMatchObject({ center: { x: 0.5, y: 0.5 } });
    expect(request.novelai?.characters?.[0]?.negativePrompt).toBe("bad hands");
    expect(request.novelai?.characterReferences).toBeUndefined();
  });

  test("freeform forms use the freeform pose tags and unweighted parts; reference when asked (V4.5)", async () => {
    const fx = createAnalysisFixture();
    fx.config.value = { ...fx.config.value, image: { ...fx.config.value.image, provider: "novelai", model: "nai-diffusion-4-5-full" }, novelai: { ...fx.config.value.novelai, characterReferenceEnabled: true } };
    await withForms(fx, false);
    const { plan, request } = await buildOutfitImageRequest(fx.services, target, "form_default", draft({ useCharacterReference: true, seedFixed: false }));
    expect(plan.positivePrompt).toContain("2::entire subject visible::");
    expect(plan.positivePrompt).not.toContain("0.5::sailor");
    expect(plan.positivePrompt).toContain("loafers");
    expect(request.seed).toBe("");
    expect(request.novelai?.characterReferences?.[0]).toMatchObject({ mimeType: "image/png", type: "character" });
  });

  test("dock gender and reference settings override the form / config defaults", async () => {
    const fx = createAnalysisFixture();
    fx.config.value = { ...fx.config.value, image: { ...fx.config.value.image, provider: "novelai", model: "nai-diffusion-4-5-full" }, novelai: { ...fx.config.value.novelai, characterReferenceEnabled: true } };
    await withForms(fx);
    const { plan, request, context } = await buildOutfitImageRequest(fx.services, target, "form_default", draft({ useCharacterReference: true, gender: "male", referenceType: "style", referenceStrength: 0.3, referenceFidelity: 0.8 }));
    expect(context.gender).toBe("male");
    expect(plan.positivePrompt).toContain("1boy");
    expect(plan.positivePrompt).not.toContain("1girl");
    expect(request.novelai?.characterReferences?.[0]).toMatchObject({ type: "style", strength: 0.3, fidelity: 0.8 });
  });

  test("anima providers: empty negative, anima prefixes from the codec", async () => {
    const fx = createAnalysisFixture();
    fx.config.value = { ...fx.config.value, image: { ...fx.config.value.image, provider: "comfyui" } };
    await withForms(fx);
    const { request, plan } = await buildOutfitImageRequest(fx.services, target, "form_default", draft());
    expect(plan.anima).toBe(true);
    expect(plan.negativePrompt).toBe("");
    expect(request.prompt).toContain("masterpiece");
    expect(request.novelai).toBeUndefined();
  });

  test("empty prompt is rejected with the AM message", async () => {
    const fx = createAnalysisFixture();
    const { AM } = await import("./core/index.js");
    expect(AM.Cq(["", " "])).toBe("");
    await withForms(fx);
    const r = await buildOutfitImageRequest(fx.services, target, "form_default", draft()).catch((e) => e);
    expect(r.request.prompt.length).toBeGreaterThan(0);
  });
});

describe("outfit image controller", () => {
  test("generate -> events + history (cap 8) -> save add / replace", async () => {
    const fx = createAnalysisFixture();
    fx.config.value = { ...fx.config.value, image: { ...fx.config.value.image, provider: "novelai", model: "nai-diffusion-4-5-full" } };
    await withForms(fx);
    const controller = createOutfitImageController(fx.services);
    for (let i = 0; i < OUTFIT_HISTORY_LIMIT + 1; i += 1) {
      const { jobId } = await controller.generate({ target, formId: "form_default", draft: draft() });
      for (let k = 0; k < 50 && !fx.events.some((e) => e.event === "outfitImage.finished" && (e.payload as { jobId: string }).jobId === jobId); k += 1) await new Promise((r) => setTimeout(r, 5));
    }
    const finished = fx.events.filter((e) => e.event === "outfitImage.finished");
    expect(finished).toHaveLength(OUTFIT_HISTORY_LIMIT + 1);
    expect((finished[0]!.payload as { result: { imageId: string } }).result.imageId).toBe("fake-image-1");
    const { results } = await controller.history({ target, formId: "form_default" });
    expect(results).toHaveLength(OUTFIT_HISTORY_LIMIT);
    expect(results[0]!.imageId).toBe(`fake-image-${OUTFIT_HISTORY_LIMIT + 1}`);
    const added = await controller.save({ target, formId: "form_default", resultIds: [results[0]!.resultId], mode: "add", draft: draft() });
    const outfit = added.collection.forms[0]!.outfits.find((o) => o.top === "sailor shirt")!;
    expect(outfit.referenceAsset?.key).toBe(results[0]!.imageId);
    expect(outfit.referenceAsset?.name).toMatch(/^School\.__am__\.outfit\./);
    const replaced = await controller.save({ target, formId: "form_default", outfitId: "outfit_default", resultIds: [results[1]!.resultId], mode: "replace", draft: draft({ top: "hoodie" }) });
    const def = replaced.collection.forms[0]!.outfits.find((o) => o.id === "outfit_default")!;
    expect(def.top).toBe("hoodie");
    expect(def.referenceAsset?.key).toBe(results[1]!.imageId);
  });

  test("cancel emits a cancelled finish", async () => {
    const fx = createAnalysisFixture({ images: { generate: (_r, o) => new Promise((_res, rej) => o?.signal?.addEventListener("abort", () => rej(new DOMException("x", "AbortError")))) } });
    await withForms(fx);
    const controller = createOutfitImageController(fx.services);
    const { jobId } = await controller.generate({ target, formId: "form_default", draft: draft() });
    await new Promise((r) => setTimeout(r, 20));
    controller.cancelAll();
    await new Promise((r) => setTimeout(r, 20));
    const fin = fx.events.find((e) => e.event === "outfitImage.finished")!.payload as { jobId: string; error: { code: string } };
    expect(fin).toMatchObject({ jobId, error: { code: "cancelled" } });
  });
});

describe("AM outfit generator for the chat pipeline (fOt generate/save)", () => {
  test("generate builds the fOt request; save returns a generated outfit asset ref", async () => {
    const fx = createAnalysisFixture();
    fx.config.value = { ...fx.config.value, image: { ...fx.config.value.image, provider: "novelai", model: "nai-diffusion-4-5-full" }, novelai: { ...fx.config.value.novelai, characterReferenceEnabled: true } };
    const gen = createOutfitImageController(fx.services).amGenerator(CHAR);
    const generated = await gen.generate({
      promptKey: ALICE, characterName: "Alice", mainPrompt: "red hair", characterNegativePrompt: "bad hands", gender: "female", humanlike: true,
      outfitId: "outfit_x", label: "Maid", head: "maid headdress", top: "maid apron", bottom: "", legs: "", feet: "",
      characterReference: { name: "alice_smile.png", key: "img-alice_smile.png", extension: "png" }, referenceEnabled: true, referenceType: "character&style", referenceStrength: 0.4, referenceFidelity: 0.9, seed: "",
    });
    const request = fx.imageRequests.at(-1)!;
    expect(request).toMatchObject({ purpose: "outfit", width: 832, height: 1216, seed: "", ownerCharacterId: CHAR });
    expect(request.prompt).toContain("1girl, 3::solo::");
    expect(request.prompt).toContain("red hair");
    expect(request.prompt).toContain("maid apron");
    expect(request.novelai?.characters?.[0]?.negativePrompt).toBe("bad hands");
    expect(request.novelai?.characterReferences?.[0]).toMatchObject({ type: "character&style", strength: 0.4, fidelity: 0.9 });
    expect(generated.imageId).toBe("fake-image-1");
    let checked = false;
    const asset = await gen.save({ assertCurrent: () => { checked = true; }, characterName: "Alice", label: "Maid", characterTarget: { chaId: CHAR } }, generated);
    expect(checked).toBe(true);
    expect(asset).toMatchObject({ key: "fake-image-1", sourceType: "generated", extension: "png", characterTarget: { chaId: CHAR } });
    expect(asset.name).toMatch(/^Alice · Maid\.__am__\.outfit\./);
  });
});
