/**
 * Webtoon runs under concurrent use: swipe deletion, reroll busy checks, a lost target mid-run, restart recovery.
 */
import { describe, expect, test } from "bun:test";
import { createPipelineModule } from "../pipeline/index.js";
import { CHAT_ID, createFakeEngine, createPipelineFixture, finished, STORY, waitFor } from "../pipeline/testing/fixtures.js";
import { createStripDocument, readStrip, updateStrip } from "./store.js";

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
    shot(2, { text: [{ type: "speech", speaker: "Alice", text: "You're late again!", anchor: "top-left" }] }),
    shot(3, { size: "1472x704", layout: "wide_band", beat: "insert", nai: { base: "close-up, hand, sleeve", characters: [] } }),
    shot(5, { beat: "action", text: [{ type: "sfx", text: "tug", anchor: "bottom-left" }] }),
    shot(6, { layout: "inset_right" }),
    shot(7, { layout: "fade_white" }),
  ],
};

type Messages = Parameters<typeof createPipelineFixture>[0] extends infer O ? (O extends { messages?: infer M } ? M : never) : never;

async function setup(messages?: Messages) {
  const fx = createPipelineFixture({
    config: { image: { provider: "novelai", model: "nai-diffusion-5-full", connectionId: "img-1" }, novelai: { analysisProfile: "v5-hybrid" }, runtime: { generationAutoRetryCount: 0 } },
    ...(messages ? { messages } : {}),
  });
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

describe("webtoon: races and recovery", () => {
  test("swipe deletion re-keys webtoon strips: the swipe that moves into the deleted index shows its own strip", async () => {
    const { fx, pipeline } = await setup([
      { id: "u1", content: "I run to the school gate.", is_user: true },
      { id: "m1", swipes: [STORY, `${STORY}\n\nSecond swipe.`], swipe_id: 1 },
    ]);
    const strip = (historyId: string, status: "error" | "complete") =>
      updateStrip(fx.services.storage, CHAT_ID, historyId, () => ({
        ...createStripDocument({ chatId: CHAT_ID, messageKey: `illustration:${historyId}`, historyId, characterId: "char-1", sourceLength: 1, now: 1 }),
        status,
      }));
    await strip("m1@0", "error"); // swipe 0: a failed strip
    await strip("m1@1", "complete"); // swipe 1: a finished strip
    // The user deletes swipe 0; the host moves swipe 1 to index 0.
    const host = fx.fakeHost!.messages.get(CHAT_ID)!.find((m) => m.id === "m1")!;
    host.swipes.splice(0, 1);
    host.swipe_id = 0;
    host.content = host.swipes[0]!;
    await pipeline.handleHostEvent("MESSAGE_SWIPED", { chatId: CHAT_ID, action: "deleted", swipeId: 0, message: { id: "m1", chat_id: CHAT_ID } });
    // The remaining swipe (old swipe 1) must show its own (complete) strip, not the deleted swipe's failed one.
    const [state] = (await pipeline.getMessageStates(CHAT_ID, ["m1"])).messages;
    expect(state!.webtoon?.status).toBe("complete");
    expect((await pipeline.getWebtoon(CHAT_ID, "illustration:m1@0")).strip?.status).toBe("complete");
    pipeline.dispose();
  });

  test("two webtoon.rerollPanel calls for the same panel (double click): the second is refused as busy", async () => {
    const { fx, engine, pipeline } = await setup();
    fx.llmReplies.push(STORYBOARD);
    const run = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, run.jobId).length > 0);
    const before = engine.dispatches.length;
    const results = await Promise.allSettled([
      pipeline.rerollWebtoonPanel(CHAT_ID, "illustration:m1@0", "2"),
      pipeline.rerollWebtoonPanel(CHAT_ID, "illustration:m1@0", "2"),
    ]);
    await new Promise((r) => setTimeout(r, 50));
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    expect(engine.dispatches.length - before).toBe(1);
    pipeline.dispose();
  });

  test("a lost target inside the panel loop ends the run instead of drawing every remaining panel", async () => {
    const { fx, engine, pipeline } = await setup();
    fx.llmReplies.push(STORYBOARD);
    const dispatch = engine.dispatch.bind(engine);
    engine.dispatch = async (...args) => {
      const result = await dispatch(...args);
      // The chat / message disappears while the first panel draws (e.g. the chat is deleted: the host sends no event for that).
      if (engine.dispatches.length === 1) fx.fakeHost!.messages.set(CHAT_ID, fx.fakeHost!.messages.get(CHAT_ID)!.filter((m) => m.id !== "m1"));
      return result;
    };
    const run = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, run.jobId).length > 0);
    // No more NovelAI generations for a message that no longer exists.
    expect(engine.dispatches.length).toBe(1);
    pipeline.dispose();
  });

  test("the reroll busy key is per message: panel 2 of another strip in the chat can be rerolled meanwhile", async () => {
    const { fx, engine, pipeline } = await setup([
      { id: "u1", content: "I run to the school gate.", is_user: true },
      { id: "m1", content: STORY },
      { id: "u2", content: "Again.", is_user: true },
      { id: "m2", content: STORY },
    ]);
    for (const messageId of ["m1", "m2"]) {
      fx.llmReplies.push(STORYBOARD);
      const run = await pipeline.start({ chatId: CHAT_ID, messageId, swipeIndex: 0 });
      await waitFor(() => finished(fx, run.jobId).length > 0);
    }
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const dispatch = engine.dispatch.bind(engine);
    engine.dispatch = async (...args) => {
      await gate;
      return dispatch(...args);
    };
    await pipeline.rerollWebtoonPanel(CHAT_ID, "illustration:m1@0", "2");
    // A different message's strip: its panel 2 is not being redrawn.
    const other = await pipeline.rerollWebtoonPanel(CHAT_ID, "illustration:m2@0", "2").then(() => "started", (e: { error?: { code?: string } }) => e.error?.code ?? "error");
    release();
    expect(other).toBe("started");
    pipeline.dispose();
  });

  test("a re-plan that fails before its storyboard is saved puts the previous strip back", async () => {
    const { fx, pipeline } = await setup();
    fx.llmReplies.push(STORYBOARD);
    const first = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, first.jobId).length > 0);
    const before = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!;
    expect(before.storyboard).not.toBeNull();
    for (let i = 0; i < 5; i += 1) fx.llmReplies.push(Object.assign(new Error("Planner unavailable"), { retryable: false }));
    const second = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, second.jobId).length > 0);
    expect(finished(fx, second.jobId)[0]!.result).toBe("failed");
    const after = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!;
    expect(after.status).toBe(before.status);
    expect(after.storyboard).toEqual(before.storyboard);
    expect(after.panels).toEqual(before.panels);
    pipeline.dispose();
  });

  test("a re-plan cancelled while planning puts the previous strip back", async () => {
    const { fx, pipeline } = await setup();
    fx.llmReplies.push(STORYBOARD);
    const first = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, first.jobId).length > 0);
    const before = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!;
    // The user cancels while the planner call is out.
    fx.llmReplies.push(() => {
      pipeline.cancel({ chatId: CHAT_ID });
      return Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    const second = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, second.jobId).length > 0);
    expect(finished(fx, second.jobId)[0]!.result).toBe("cancelled");
    const after = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!;
    expect(after.status).toBe(before.status);
    expect(after.storyboard).toEqual(before.storyboard);
    expect(after.panels).toEqual(before.panels);
    pipeline.dispose();
  });

  test("a new plan starts from a fresh document: a stored manga strip's format and mono do not carry over into a webtoon plan", async () => {
    const { fx, pipeline } = await setup();
    await updateStrip(fx.services.storage, CHAT_ID, "m1@0", () => ({ ...createStripDocument({ chatId: CHAT_ID, messageKey: "illustration:m1@0", historyId: "m1@0", characterId: "char-1", sourceLength: 1, now: 1 }), format: "manga", mono: true }));
    fx.llmReplies.push(STORYBOARD);
    const run = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, run.jobId).length > 0);
    const strip = (await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!;
    expect(strip.status).toBe("complete");
    expect({ format: strip.format, mono: strip.mono }).toEqual({ format: undefined, mono: undefined });
    pipeline.dispose();
  });

  test("recover() turns an interrupted webtoon strip into an error instead of planning forever", async () => {
    const { fx, pipeline } = await setup();
    await updateStrip(fx.services.storage, CHAT_ID, "m1@0", () => createStripDocument({ chatId: CHAT_ID, messageKey: "illustration:m1@0", historyId: "m1@0", characterId: "char-1", sourceLength: 1, now: 1 }));
    fx.json.set("chats/chat-1/chat-data.json", {});
    await pipeline.recover();
    // Like interrupted plans (status error, "interrupted"), a strip without a running job should not stay in planning / generating.
    expect((await readStrip(fx.services.storage, CHAT_ID, "m1@0"))!.status).not.toBe("planning");
    pipeline.dispose();
  });
});
