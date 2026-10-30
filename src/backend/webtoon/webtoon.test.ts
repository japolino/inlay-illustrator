import { describe, expect, test } from "bun:test";
import { createPipelineModule } from "../pipeline/index.js";
import { CHAT_ID, createFakeEngine, createPipelineFixture, finished, STORY, waitFor } from "../pipeline/testing/fixtures.js";
import { bytesToBase64 } from "../pipeline/providers.js";
import { encodePng } from "./cutout.js";
import { cutoutPose } from "./panel-request.js";
import { rerollWebtoonPanel } from "./run.js";
import { readStrip, relayout, webtoonPath } from "./store.js";
import { checkPanel, visionConnection } from "./vision.js";
import { createFakeServices } from "../testing/fake-services.js";
import { base64ToBytes } from "../pipeline/providers.js";
import { decodePng } from "./cutout.js";
import type { ImagePanel } from "./storyboard-schema.js";

const shot = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "image",
  beat: "dialogue",
  size: "832x1216",
  layout: "full_width",
  nai: { base: "upper body, school gate, morning\nShe waves.", characters: [{ name: "Shouta", x: 0.7, y: 0.7, framing: "cowboy shot", prompt: "running, looking at viewer\nHe runs." }] },
  text: [],
  ...extra,
});

const STORYBOARD = {
  title: "Chapter 1: Late Again",
  outfits: [{ name: "Shouta", outfit_id: "o2" }],
  panels: [
    shot(1, { layout: "title", beat: "title" }),
    shot(2, { text: [{ type: "speech", speaker: "Alice", text: "You're late again!", anchor: "top-left" }, { type: "speech", speaker: "Shouta", text: "I overslept, sorry.", anchor: "top-right" }] }),
    shot(3, { size: "1472x704", layout: "wide_band", beat: "insert", nai: { base: "close-up, hand, sleeve", characters: [] } }),
    { id: 4, kind: "text_beat", beat: "quiet", text: [{ type: "narration", text: "Mr. Bob watched them from the window." }] },
    shot(5, { beat: "action", text: [{ type: "sfx", text: "tug", anchor: "bottom-left" }] }),
    shot(6, { layout: "inset_right" }),
    shot(7, { layout: "fade_white" }),
  ],
};

async function setup() {
  const fx = createPipelineFixture({ config: { image: { provider: "novelai", model: "nai-diffusion-5-full", connectionId: "img-1" }, novelai: { analysisProfile: "v5-hybrid" }, runtime: { generationAutoRetryCount: 0 } } });
  await fx.services.storage.updateConfig((config) => {
    const profiles = { ...config.characterPrompt.personaSettings.profiles } as Record<string, unknown>;
    profiles["persona-1"] = {
      forms: {
        defaultFormId: "form_default",
        forms: [
          {
            id: "form_default", label: "black hair, tall", description: "", humanlike: true, gender: "male", basePromptGroups: { "hair.color": ["black hair"] }, negativePrompt: "", reference: null, defaultOutfitId: "o1",
            outfits: [
              { id: "o1", label: "Hoodie", description: "", candidateEnabled: true, head: "", top: "grey hoodie", bottom: "jeans", legs: "", feet: "" },
              { id: "o2", label: "Uniform", description: "", candidateEnabled: true, head: "", top: "gakuran", bottom: "black pants", legs: "", feet: "loafers" },
            ],
          },
        ],
      },
    };
    return { ...config, characterPrompt: { ...config.characterPrompt, personaSettings: { ...config.characterPrompt.personaSettings, profiles } } } as typeof config;
  });
  const settings = await fx.services.storage.loadChatImageGenerationSettings();
  await fx.services.storage.saveChatImageGenerationSettings({ ...settings, webtoonMode: true });
  const engine = createFakeEngine();
  const { pipeline } = createPipelineModule(fx.services, undefined, { engine });
  return { fx, engine, pipeline };
}

describe("webtoon mode (controller over a fake engine)", () => {
  test("planner -> validated storyboard -> one coordinate request per image panel -> stored strip, no inline bake", async () => {
    const { fx, engine, pipeline } = await setup();
    fx.llmReplies.push(STORYBOARD);
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, jobId).length > 0);
    expect(finished(fx, jobId)[0]!.result).toBe("completed");
    expect(engine.runs.length).toBe(0);
    const planner = fx.llmRequests[0]!;
    expect(planner.purpose).toBe("webtoon-planner");
    const prompt = String(planner.messages[0]!.content);
    expect(prompt).toContain('- Shouta (man/boy): black hair, tall; wardrobe: o1 (current) = "Hoodie" (items: top: grey hoodie; bottom: jeans); o2 = "Uniform" (items: top: gakuran; bottom: black pants; feet: loafers).');
    expect(prompt).not.toContain("black hair, male");
    expect(engine.dispatches.length).toBe(6);
    expect(fx.imageRequests.length).toBe(0); // the frame-break panel (5) is drawn plain: the fake connection's saved parameters are not readable
    const first = engine.dispatches[1]!.request as Record<string, any>;
    expect(first.prompt).toMatch(/^1boy, /u);
    expect(first.config.useCoords).toBe(true);
    expect(first.config.forceCharacterCoordinates).toBe(true);
    expect(first.config.characterPrompts).toEqual([{ prompt: "male, 1.1::black hair::, running, looking at viewer, 1.2::gakuran::, black pants\nHe runs.", uc: "", centerX: 0.7, centerY: 0.7, coordinateMode: "fixed" }]);
    expect(String(first.negativePrompt)).toContain("speech bubble, text");
    expect((engine.dispatches[2]!.request as Record<string, any>).prompt).toMatch(/^no humans, /u);

    const strip = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!;
    expect(fx.json.has(webtoonPath(CHAT_ID, "m1@0"))).toBe(true);
    expect(strip.status).toBe("complete");
    expect(strip.cast).toEqual([{ name: "Shouta", key: "persona::persona-1", outfitId: "o2", gender: "male", identity: "male, black hair" }]);
    expect(Object.values(strip.panels).map((p) => [p.status, p.takes.length, p.selected])).toEqual(Array(6).fill(["done", 1, 0]));
    const layout = (await pipeline.getWebtoon(CHAT_ID, "illustration:m1@0")).strip!.layout!;
    expect([layout.width, layout.panels.length]).toEqual([690, 6]);
    expect(layout.items.map((i) => (i.kind === "title" ? `title:${i.big}` : i.text))).toEqual(["title:Late Again", "You're late again!", "Mr. Bob watched them from the window.", "tug"]);
    expect(strip.validation!.log.some((l) => l.includes("I overslept"))).toBe(true);
    expect(fx.message("m1").content).toBe(STORY);

    const [state] = (await pipeline.getMessageStates(CHAT_ID, ["m1"])).messages;
    expect(state!.webtoon).toEqual({ revision: strip.revision, status: "complete" });
    pipeline.dispose();
  });

  test("reroll adds a take as a regenerate job; older takes can be shown again; text edits re-lay out the strip", async () => {
    const { fx, engine, pipeline } = await setup();
    fx.llmReplies.push(STORYBOARD);
    const run = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, run.jobId).length > 0);
    const { jobId } = await pipeline.rerollWebtoonPanel(CHAT_ID, "illustration:m1@0", "2");
    await waitFor(() => finished(fx, jobId).length > 0);
    expect(finished(fx, jobId)[0]!.result).toBe("completed");
    expect(engine.dispatches.length).toBe(7);
    const progress = fx.events.find((e) => e.event === "generation.progress" && (e.payload as { jobId: string }).jobId === jobId)!.payload as { slotId?: string; attemptKind: string };
    expect([progress.slotId, progress.attemptKind]).toEqual(["webtoon:2", "regenerate"]);
    const view = (await pipeline.getWebtoon(CHAT_ID, "illustration:m1@0")).strip!;
    expect(view.panels["2"]!.takes.length).toBe(2);
    expect(view.panels["2"]!.selected).toBe(1);
    const back = (await pipeline.selectWebtoonTake({ chatId: CHAT_ID, messageKey: "illustration:m1@0", panelId: "2", take: 0, width: 450 })).strip;
    expect([back.panels["2"]!.selected, back.layout!.width]).toEqual([0, 450]);
    expect((await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!.panels["2"]!.selected).toBe(0);
    await expect(pipeline.selectWebtoonTake({ chatId: CHAT_ID, messageKey: "illustration:m1@0", panelId: "2", take: 2 })).rejects.toThrow();

    const edited = (await pipeline.editWebtoonText({ chatId: CHAT_ID, messageKey: "illustration:m1@0", panelId: "2", textIndex: 0, text: "Late. Again." })).strip;
    const balloon = (s: typeof edited) => s.layout!.items.flatMap((i) => (i.kind === "speech" ? [i.text] : []))[0];
    expect(balloon(edited)).toBe("Late. Again.");
    expect(edited.revision).toBeGreaterThan(back.revision);
    const reverted = (await pipeline.editWebtoonText({ chatId: CHAT_ID, messageKey: "illustration:m1@0", panelId: "2", textIndex: 0, text: "You're late again!" })).strip;
    expect(balloon(reverted)).toBe("You're late again!");
    expect((await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!.textOverrides).toEqual({});
    pipeline.dispose();
  });

  test("frame-break panel: transparent cut-out, inpainted background, both uploaded; a failed cut-out falls back to the plain panel", async () => {
    const { fx, engine, pipeline } = await setup();
    const resolveTarget = fx.services.images.resolveTarget.bind(fx.services.images);
    fx.services.images.resolveTarget = async (o) => ({ ...(await resolveTarget(o)), connectionDefaultsReadable: true });
    const image = (alpha: (y: number, x: number) => number) => {
      const data = new Uint8Array(64 * 96 * 4);
      for (let y = 0; y < 96; y += 1) for (let x = 0; x < 64; x += 1) data.set([200, 60, 60, alpha(y, x)], (y * 64 + x) * 4);
      return encodePng({ width: 64, height: 96, data }).then(bytesToBase64);
    };
    const cut = await image((y, x) => (y >= 2 && x >= 16 && x < 48 ? 255 : 0));
    fx.imageReplies.push({ imageId: "raw-cut", dataBase64: cut }, { imageId: "raw-bg", dataBase64: await image(() => 255) });
    fx.llmReplies.push(STORYBOARD);
    const run = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, run.jobId).length > 0);

    expect(engine.dispatches.length).toBe(5);
    const [cutReq, fillReq] = fx.imageRequests as Array<Record<string, any>>;
    expect(cutReq!.prompt).toMatch(/^1boy, .*upper body, transparent background, has alpha$/u);
    expect(cutReq!.prompt).not.toContain("school gate");
    expect(cutReq!.novelai.characters[0].prompt).toBe("male, 1.1::black hair::, running, looking at viewer, 1.2::gakuran::, black pants");
    expect([fillReq!.model, fillReq!.prompt]).toEqual(["nai-diffusion-5-full-inpainting", expect.stringContaining("school gate")]);
    expect(fillReq!.novelai.rawOverride).toMatchObject({ action: "infill", parameters: { mask: expect.any(String), image: expect.any(String), add_original_image: true, inpaintImg2ImgStrength: 1 } });
    expect(fx.deletedImageIds).toEqual(["raw-cut", "raw-bg"]);
    const take = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!.panels["5"]!.takes[0]!;
    expect([take.url, take.cutout?.url, take.cutout?.bbox.top]).toEqual([`/api/v1/images/${take.imageId}`, `/api/v1/images/${take.cutout?.imageId}`, 10 / 96]);
    const panel = (await pipeline.getWebtoon(CHAT_ID, "illustration:m1@0")).strip!.layout!.panels.find((p) => p.id === 5)!;
    expect([panel.frameBreak, panel.cutout?.src]).toEqual(["top", take.cutout!.url]);

    fx.imageReplies.push({ imageId: "raw-opaque", dataBase64: await image(() => 255) });
    const reroll = await pipeline.rerollWebtoonPanel(CHAT_ID, "illustration:m1@0", "5");
    await waitFor(() => finished(fx, reroll.jobId).length > 0);
    expect([engine.dispatches.length, fx.imageRequests.length]).toEqual([6, 3]);
    const second = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!.panels["5"]!.takes[1]!;
    expect(second.cutout).toBeUndefined();
    pipeline.dispose();
  });

  test("cut-out pose: scene objects and place tags dropped, postures, held items and body-relative poses kept", () => {
    const place = ["indoors", "japanese apartment", "hallway", "shoji screen", "tatami room"];
    expect(cutoutPose("from behind, looking over shoulder, sliding door closed, hand on shoji screen", place)).toBe("from behind, looking over shoulder");
    expect(cutoutPose("sitting on bed, holding bag, hand on hip, leaning against wall, holding door handle", place)).toBe("sitting, holding bag, hand on hip, leaning");
  });

  test("a panel waits while NovelAI reports a concurrent generation (429 lock)", async () => {
    const { fx, engine, pipeline } = await setup();
    fx.llmReplies.push(STORYBOARD);
    const run = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, run.jobId).length > 0);
    const dispatch = engine.dispatch.bind(engine);
    let locked = 2;
    engine.dispatch = async (...args) => {
      if (locked-- > 0) throw new Error("NovelAI image generate failed (429): Concurrent generation is locked");
      return dispatch(...args);
    };
    const config = await fx.services.storage.loadConfig();
    const view = await rerollWebtoonPanel({ services: fx.services, engine, lockWaitMs: 1 }, { chatId: CHAT_ID, historyId: "m1@0", panelId: "3", config, signal: new AbortController().signal, onChanged: () => {} });
    expect(view.panels["3"]!.takes.length).toBe(2);
    expect(locked).toBe(-1);
    pipeline.dispose();
  });

  test("a cancel during the 429 lock wait ends the draw at once, not when the wait runs out", async () => {
    const { fx, engine, pipeline } = await setup();
    fx.llmReplies.push(STORYBOARD);
    const run = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, run.jobId).length > 0);
    const controller = new AbortController();
    engine.dispatch = async () => {
      setTimeout(() => controller.abort(), 10);
      throw new Error("NovelAI image generate failed (429): Concurrent generation is locked");
    };
    const config = await fx.services.storage.loadConfig();
    const started = Date.now();
    const reroll = rerollWebtoonPanel({ services: fx.services, engine, lockWaitMs: 60_000 }, { chatId: CHAT_ID, historyId: "m1@0", panelId: "3", config, signal: controller.signal, onChanged: () => {} });
    await expect(reroll).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - started).toBeLessThan(1000);
    pipeline.dispose();
  });

  test("a planner without a usable storyboard fails the job after 3 calls", async () => {
    const { fx, engine, pipeline } = await setup();
    fx.llmReplies.push({ panels: [] }, { panels: [] }, new Error("boom"));
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, jobId).length > 0);
    expect(finished(fx, jobId)[0]!.result).toBe("failed");
    expect(fx.llmRequests.length).toBe(3);
    expect(engine.dispatches.length).toBe(0);
    const strip = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!;
    expect(strip.status).toBe("error");
    expect(strip.planner!.calls.map((c) => c.hardOk)).toEqual([false, false, false]);
    pipeline.dispose();
  });
});

describe("webtoon vision check (Jev 1.14 face boxes + identity redraw)", () => {
  const typesafe = (id: string, isDefault = false, provider = "typesafe") =>
    ({ id, name: id, provider, api_url: "", model: "jev-latest", is_default: isDefault, has_api_key: true, default_parameters: {}, metadata: {}, created_at: 0, updated_at: 0 });

  /** Capability on, a TypeSafe connection as the extension's Decision connection, scripted answers per image id. */
  async function visionSetup(answer: (imageId: string, dispatch: Record<string, any>) => Record<string, unknown> | Error) {
    const ctx = await setup();
    const { fx, engine } = ctx;
    (fx.services.host as { host: unknown }).host = { descriptorVersion: 1, lumiverseVersion: "test", capabilities: { "decisions-v1": 1, "decision-images-v1": 1 }, extensionInstallationId: "fake" };
    fx.fakeHost!.decisionConnections.push(typesafe("ts-1"));
    await fx.services.storage.updateConfig((c) => ({ ...c, jevConnection: { ...c.jevConnection, connectionId: "ts-1" } }));
    const calls: Array<Record<string, any>> = [];
    fx.services.decisions.evaluateImages = async (input) => {
      calls.push(input as Record<string, any>);
      const imageId = (input.assets!.panel as { image_id: string }).image_id;
      const result = answer(imageId, engine.dispatches[Number(imageId.split("-")[1]) - 1]!.request as Record<string, any>);
      if (result instanceof Error) throw result;
      return { model: "jev-1.14.0", answers: result as never };
    };
    return { ...ctx, calls };
  }
  const face = (confidence: number) => ({ type: "box", box: { left: 0.4, top: 0.1, right: 0.6, bottom: 0.3 }, confidence });
  const noul = (v: number) => ({ type: "noul", noul: v });
  const boosted = (dispatch: Record<string, any>) => String(dispatch.config.characterPrompts[0]?.prompt ?? "").startsWith("male, 1.35::black hair::");

  test("turned on only with the decision-images-v1 capability and a TypeSafe connection (the extension's, else the default)", async () => {
    const { fx, pipeline } = await setup();
    const config = await fx.services.storage.loadConfig();
    const pick = (jev: string) => visionConnection(fx.services, { ...config, jevConnection: { ...config.jevConnection, connectionId: jev } });
    fx.fakeHost!.decisionConnections.push(typesafe("or-1", true, "openrouter"), typesafe("ts-1"));
    expect(await pick("ts-1")).toBeNull(); // no capability
    (fx.services.host as { host: unknown }).host = { descriptorVersion: 1, lumiverseVersion: "test", capabilities: { "decision-images-v1": 1 }, extensionInstallationId: "fake" };
    expect(await pick("ts-1")).toBe("ts-1");
    expect(await pick("")).toBeNull(); // the default is OpenRouter
    fx.fakeHost!.decisionConnections.splice(0, 2, typesafe("or-1", false, "openrouter"), typesafe("ts-1", true));
    expect(await pick("or-1")).toBe("ts-1");
    pipeline.dispose();
  });

  test("one request per character panel by image id (jev-1.14.0, face Box + identity noul); confident faces go into the layout", async () => {
    const { fx, engine, pipeline, calls } = await visionSetup((imageId) => ({ present0: noul(0.9), face0: face(imageId === "regen-6" ? 0.1 : 0.7), id0_0: noul(0.9) }));
    fx.llmReplies.push(STORYBOARD);
    const run = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, run.jobId).length > 0);
    expect(engine.dispatches.length).toBe(6); // no redraw
    expect(calls.length).toBe(5); // the insert panel has no character
    expect(calls[0]).toMatchObject({ connection_id: "ts-1", model: "jev-1.14.0", state: { image: "panel" }, assets: { panel: { image_id: "regen-1" } } });
    expect(calls[0]!.questions).toEqual({
      present0: { type: "noul", instructions: "Is there a man (Shouta) with black hair in `image`?" },
      face0: { type: "box", instructions: "the face of the man (Shouta) with black hair in `image`" },
      id0_0: { type: "noul", instructions: "Does the man in `image` have black hair?" },
    });
    const strip = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!;
    expect(strip.panels["2"]!.takes[0]!.check).toMatchObject({ faces: { Shouta: { left: 0.4, top: 0.1, right: 0.6, bottom: 0.3 } }, failed: [] });
    expect(strip.panels["7"]!.takes[0]!.check!.faces).toEqual({}); // below the confidence gate: coordinates
    const withFaces = relayout(strip)!.panels.find((p) => p.id === 2)!.faces.Shouta!;
    const coords = relayout({ ...strip, panels: { ...strip.panels, "2": { ...strip.panels["2"]!, takes: [{ ...strip.panels["2"]!.takes[0]!, check: undefined }] } } })!.panels.find((p) => p.id === 2)!.faces.Shouta!;
    expect(withFaces).not.toEqual(coords);
    pipeline.dispose();
  });

  test("a panel over TypeSafe's size limit (manga 1600x640) is sent as a downscaled PNG; boxes are fractions, so they apply unchanged", async () => {
    const fx = createFakeServices({});
    const wide = { width: 1600, height: 640, data: new Uint8Array(1600 * 640 * 4).fill(200) };
    fx.services.imageBytes.getImage = async () => ({ data: bytesToBase64(await encodePng(wide)), mimeType: "image/png" });
    const assets: Array<Record<string, any>> = [];
    fx.services.decisions.evaluateImages = async (input) => {
      assets.push(input.assets!.panel as Record<string, any>);
      return { model: "jev-1.14.0", answers: { present0: { type: "noul", noul: 0.9 }, face0: { type: "box", box: { left: 0.4, top: 0.1, right: 0.6, bottom: 0.3 }, confidence: 0.8 } } as never };
    };
    const panel = shot(1, { size: "1600x640" }) as unknown as ImagePanel;
    const check = (width: number, height: number) =>
      checkPanel(fx.services, { connectionId: "ts-1", imageId: "img-1", width, height, panel, cast: [{ name: "Shouta", gender: "male" }], signal: new AbortController().signal });
    expect((await check(1600, 640))!.faces).toEqual({ Shouta: { left: 0.4, top: 0.1, right: 0.6, bottom: 0.3 } });
    expect(assets[0]!.format).toBe("png");
    const sent = await decodePng(base64ToBytes(assets[0]!.data_base64));
    expect([sent.width, sent.height, sent.data[0]]).toEqual([1568, 627, 200]);
    await check(1216, 832);
    expect(assets[1]).toEqual({ image_id: "img-1" });
  });

  test("a Decision error leaves the strip on coordinates", async () => {
    const { fx, engine, pipeline, calls } = await visionSetup(() => new Error("TypeSafe decision evaluation failed (400): Invalid image request."));
    fx.llmReplies.push(STORYBOARD);
    const run = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, run.jobId).length > 0);
    expect(finished(fx, run.jobId)[0]!.result).toBe("completed");
    expect([engine.dispatches.length, calls.length]).toEqual([6, 5]);
    const strip = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!;
    expect(strip.status).toBe("complete");
    expect(Object.values(strip.panels).flatMap((p) => p.takes).some((t) => t.check)).toBe(false);
    expect(fx.services.log.list().some((e) => e.level === "warn" && e.message.includes("vision check failed"))).toBe(true);
    pipeline.dispose();
  });

  test("failed identity check: one redraw (new seed, boosted identity tags); the better-scoring take is shown, both are kept", async () => {
    // First takes: wrong hair (0.1). Redraws: right hair (0.8), except panel 7's (0.05, worse than its first take).
    const { fx, engine, pipeline } = await visionSetup((_id, d) => ({
      present0: noul(0.9), face0: face(0.7),
      id0_0: noul(!boosted(d) ? 0.1 : d.queueMeta.sourceImageToken === "webtoon:panel:7" ? 0.05 : 0.8),
    }));
    fx.llmReplies.push(STORYBOARD);
    const run = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, run.jobId).length > 0);
    expect(engine.dispatches.length).toBe(11); // 6 panels + 5 redraws, no second redraw
    const redraws = engine.dispatches.filter((d) => boosted(d.request));
    expect(redraws.length).toBe(5);
    expect(redraws.map((d) => d.request.seed)).toEqual(Array(5).fill(""));
    const strip = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!;
    expect(strip.status).toBe("complete");
    const p2 = strip.panels["2"]!, p7 = strip.panels["7"]!;
    expect([p2.takes.length, p2.selected, p2.takes[0]!.check!.failed, p2.takes[1]!.check!.redraw]).toEqual([2, 1, ["Shouta: hair:black hair (0.10)"], true]);
    expect([p7.takes.length, p7.selected]).toEqual([2, 0]);
    expect(strip.panels["3"]!.takes.length).toBe(1);
    pipeline.dispose();
  });
});
