import { describe, expect, test } from "bun:test";
import { cleanMessageContent } from "./markup.js";
import { createPipelineModule } from "./index.js";
import { CHAT_ID, createFakeEngine, createPipelineFixture, finished, STORY, waitFor } from "./testing/fixtures.js";

function setup(options: Parameters<typeof createPipelineFixture>[0] = {}) {
  const fx = createPipelineFixture(options);
  const engine = createFakeEngine();
  const { pipeline } = createPipelineModule(fx.services, undefined, { engine });
  return { fx, engine, pipeline };
}

describe("automatic generation (GENERATION_ENDED)", () => {
  test("normal reply -> analyzer run -> chat data + baked message", async () => {
    const { fx, engine, pipeline } = setup();
    await pipeline.handleGenerationEnded({ generationId: "g1", chatId: CHAT_ID, messageId: "m1", content: STORY, generationType: "normal" });
    await waitFor(() => finished(fx).length > 0);
    expect(finished(fx)[0]!.result).toBe("completed");
    expect(engine.runs.length).toBe(1);
    const input = engine.runs[0]!.input as Record<string, any>;
    expect(input.generationType).toBe("chat-auto");
    expect(input.analyzerInput.context.candidateSlots.map((s: any) => s.slot_id)).toEqual(["illustration:m1@0:slot:0", "illustration:m1@0:slot:1"]);
    expect(input.analyzerInput.context.personaCandidates.length).toBe(1);
    const doc = fx.chatData.get(CHAT_ID)!;
    const plan = doc.plans["illustration:m1@0"]!;
    expect(plan.status).toBe("complete");
    expect(plan.revisions.length).toBe(1);
    const message = doc.history.messagesByKey["illustration:m1@0"]!;
    expect(message.mode).toBe("illustration");
    const entries = Object.values(doc.history.entriesById);
    expect(entries.length).toBe(1);
    expect(entries[0]!.savedPath).toBe("/api/v1/image-gen/results/img-1");
    expect(entries[0]!.assetName).toMatch(/^Shouta\.__am__\.chat\./);
    expect(Object.keys(doc.store.messages)).toEqual(["m1@0"]);
    const content = fx.message("m1").content;
    expect(content).toContain('data-inlay-illustrator-image-id="img-1"');
    expect(content.indexOf("img-1")).toBeGreaterThan(content.indexOf("morning light."));
    expect(content.indexOf("img-1")).toBeLessThan(content.indexOf("You're late"));
    expect(cleanMessageContent(content)).toBe(STORY);
    expect(fx.events.some((e) => e.event === "chatData.changed")).toBe(true);
    // re-publish is idempotent (no host write)
    const writes = fx.fakeHost!.messageUpdates.length;
    expect(await pipeline.publish(CHAT_ID, "illustration:m1@0")).toBe("published");
    expect(fx.fakeHost!.messageUpdates.length).toBe(writes);
  });

  test("continue / impersonate / disabled auto generation do not start a job", async () => {
    const { fx, engine, pipeline } = setup();
    await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "continue" });
    await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "impersonate" });
    await fx.services.storage.saveChatImageGenerationSettings({ ...(await fx.services.storage.loadChatImageGenerationSettings()), autoGenerationEnabled: false });
    await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
    await new Promise((r) => setTimeout(r, 30));
    expect(engine.runs.length).toBe(0);
  });

  test("message with fewer than 2 paragraphs -> plan error with the Asset Maid text", async () => {
    const { fx, pipeline } = setup({ messages: [{ id: "m1", content: "Only one paragraph." }] });
    await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
    await waitFor(() => finished(fx).length > 0);
    const f = finished(fx)[0]!;
    expect(f.result).toBe("failed");
    expect(f.error?.message).toContain("Could not find a paragraph position");
    expect(f.error?.messageKo).toBe("이미지를 삽입할 문단 위치를 찾지 못했습니다. 메시지 본문을 확인해 주세요.");
    expect(fx.chatData.get(CHAT_ID)!.plans["illustration:m1@0"]!.status).toBe("error");
    const states = await pipeline.getMessageStates(CHAT_ID);
    expect(states.messages[0]!.attempt).toBe("retry");
  });
});

describe("manual generation, locks, cancel, retry", () => {
  test("start -> busy on second start -> reroll creates a second revision", async () => {
    const { fx, engine, pipeline } = setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    engine.beforeImages = () => gate;
    const { jobId, messageKey } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    expect(messageKey).toBe("illustration:m1@0");
    await expect(pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 })).rejects.toMatchObject({ error: { code: "busy" } });
    expect(pipeline.listActive(CHAT_ID).map((j) => j.jobId)).toEqual([jobId]);
    const busyState = (await pipeline.getMessageStates(CHAT_ID)).messages[0]!;
    expect(busyState.busy).toBe(true);
    release();
    await waitFor(() => finished(fx, jobId).length > 0);
    expect((engine.runs[0]!.input as any).generationType).toBe("manual-all");
    engine.beforeImages = undefined;
    const second = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, second.jobId).length > 0);
    const doc = fx.chatData.get(CHAT_ID)!;
    const message = doc.history.messagesByKey["illustration:m1@0"]!;
    expect(message.revisions.length).toBe(2);
    expect(message.revisions[1]!.parentRevisionId).toBe(message.revisions[0]!.revisionId);
    expect(message.activeRevisionId).toBe(message.revisions[1]!.revisionId);
    expect(fx.message("m1").content).toContain('data-inlay-illustrator-image-id="img-2"');
    const state = (await pipeline.getMessageStates(CHAT_ID)).messages[0]!;
    expect(state.attempt).toBe("reroll");
    expect(state.revisions.length).toBe(2);
    // revision pager: back to the first revision re-bakes img-1
    await pipeline.selectRevision(CHAT_ID, "illustration:m1@0", message.revisions[0]!.revisionId);
    expect(fx.message("m1").content).toContain('data-inlay-illustrator-image-id="img-1"');
    expect(fx.message("m1").content).not.toContain("img-2");
  });

  test("cancel restores the plan status and reports cancelled", async () => {
    const { fx, engine, pipeline } = setup();
    engine.beforeImages = (_n, input) =>
      new Promise((_resolve, reject) => (input.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => engine.runs.length === 1);
    pipeline.cancel({ jobId });
    await waitFor(() => finished(fx, jobId).length > 0);
    expect(finished(fx, jobId)[0]!.result).toBe("cancelled");
    expect(fx.chatData.get(CHAT_ID)!.plans["illustration:m1@0"]!.status).toBe("idle");
    expect(fx.message("m1").content).toBe(STORY);
  });

  test("retryable analyzer failure is retried automatically as a retry attempt", async () => {
    const { fx, engine, pipeline } = setup();
    engine.beforeImages = (n) => {
      if (n === 1) throw Object.assign(new Error("Analyzer returned invalid JSON"), { code: "ANALYZER_JSON_PARSE" });
    };
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, jobId).length > 0);
    expect(finished(fx, jobId)[0]!.result).toBe("completed");
    expect(engine.runs.length).toBe(2);
    expect((engine.runs[1]!.input as any).generationType).toBe("illustration-retry");
  });

  test("non-retryable failure -> footer retry -> retry run completes", async () => {
    const { fx, engine, pipeline } = setup();
    engine.beforeImages = (n) => {
      if (n === 1) throw Object.assign(new Error("Provider rejected the prompt"), { retryable: false });
    };
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, jobId).length > 0);
    expect(finished(fx, jobId)[0]!.result).toBe("failed");
    expect(pipeline.listActive(CHAT_ID)[0]!.canRetry).toBe(true);
    const retry = await pipeline.retry(jobId);
    await waitFor(() => finished(fx, retry.jobId).length > 0);
    expect(finished(fx, retry.jobId)[0]!.result).toBe("completed");
    expect(fx.chatData.get(CHAT_ID)!.plans["illustration:m1@0"]!.status).toBe("complete");
  });
});

describe("history, regenerate, delete", () => {
  async function generated() {
    const ctx = setup();
    ctx.engine.imageCount = 2;
    await ctx.pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
    await waitFor(() => finished(ctx.fx).length > 0);
    return ctx;
  }

  test("regenerateSlot appends a regenerate entry, selects it and re-bakes; selectEntry goes back", async () => {
    const { fx, engine, pipeline } = await generated();
    const slotId = "illustration:m1@0:slot:0";
    const before = fx.chatData.get(CHAT_ID)!;
    const firstEntry = Object.values(before.history.entriesById).find((e) => e.slotId === slotId)!;
    const { jobId } = await pipeline.regenerateSlot({ chatId: CHAT_ID, messageKey: "illustration:m1@0", slotId });
    await waitFor(() => finished(fx, jobId).length > 0);
    expect(finished(fx, jobId)[0]!.result).toBe("completed");
    expect(engine.dispatches[0]!.request.seed).toBe("");
    expect(engine.dispatches[0]!.request.prompt).toBe("pos 1");
    const doc = fx.chatData.get(CHAT_ID)!;
    const regen = Object.values(doc.history.entriesById).find((e) => e.generationOrigin === "regenerate")!;
    expect(regen.parentEntryId).toBe(firstEntry.entryId);
    expect(fx.message("m1").content).toContain(`data-inlay-illustrator-image-id="${regen.savedPath!.split("/").pop()}"`);
    const state = (await pipeline.getMessageStates(CHAT_ID)).messages[0]!;
    expect(state.slots[0]!.entries.length).toBe(2);
    expect(state.slots[0]!.selectedEntryId).toBe(regen.entryId);
    await pipeline.selectEntry(CHAT_ID, slotId, firstEntry.entryId);
    expect(fx.message("m1").content).toContain('data-inlay-illustrator-image-id="img-1"');
    const details = await pipeline.getZoomDetails(CHAT_ID, slotId);
    expect(details.entryId).toBe(firstEntry.entryId);
    expect(details.positivePrompt).toBe("pos 1");
    expect(details.sections.map((s) => s.id)).toEqual(["main", "actor:0"]);
    expect(details.history.length).toBe(2);
  });

  test("deleteEntry falls back and deletes the unreferenced image", async () => {
    const { fx, pipeline } = await generated();
    const slotId = "illustration:m1@0:slot:0";
    const { jobId } = await pipeline.regenerateSlot({ chatId: CHAT_ID, messageKey: "illustration:m1@0", slotId });
    await waitFor(() => finished(fx, jobId).length > 0);
    const regen = Object.values(fx.chatData.get(CHAT_ID)!.history.entriesById).find((e) => e.generationOrigin === "regenerate")!;
    const result = await pipeline.deleteEntry(CHAT_ID, regen.entryId);
    expect(result.fallbackEntryId).toMatch(/^generated:/);
    expect(result.cleanup).toEqual([{ assetName: regen.assetName, status: "removed" }]);
    expect(fx.deletedImageIds).toEqual([regen.savedPath!.split("/").pop()!]);
    expect(fx.message("m1").content).toContain('data-inlay-illustrator-image-id="img-1"');
  });

  test("slot deletion with preview token removes the block and the images", async () => {
    const { fx, pipeline } = await generated();
    expect(fx.message("m1").content).toContain("img-2");
    const preview = await pipeline.prepareSlotDeletion(CHAT_ID, "illustration:m1@0", "illustration:m1@0:slot:1");
    expect(preview).toMatchObject({ imageCount: 1, revisionNumber: 1, lastSlot: false });
    const result = await pipeline.deleteSlot(preview.previewToken);
    expect(result.cleanup.map((c) => c.status)).toEqual(["removed"]);
    expect(fx.deletedImageIds).toEqual(["img-2"]);
    const content = fx.message("m1").content;
    expect(content).toContain("img-1");
    expect(content).not.toContain("img-2");
    const message = fx.chatData.get(CHAT_ID)!.history.messagesByKey["illustration:m1@0"]!;
    expect(message.revisions[0]!.deletedSlotIndices).toEqual([1]);
    await expect(pipeline.deleteSlot(preview.previewToken)).rejects.toMatchObject({ error: { code: "not-found" } });
  });

  test("zoom drafts: save, import, clear", async () => {
    const { pipeline } = await generated();
    const slotId = "illustration:m1@0:slot:0";
    let d = await pipeline.saveDraft(CHAT_ID, slotId, { positivePrompt: "edited", seed: "42", seedFixed: true });
    expect(d.positivePrompt).toBe("edited");
    expect(d.promptDraftActive).toBe(true);
    expect(d.seed).toBe("42");
    d = await pipeline.clearDraft(CHAT_ID, slotId, "prompts");
    expect(d.positivePrompt).toBe("pos 1");
    expect(d.seedFixed).toBe(true);
    d = await pipeline.importViewed(CHAT_ID, slotId, d.entryId, "prompts");
    expect(d.promptDraftActive).toBe(true);
    d = await pipeline.clearDraft(CHAT_ID, slotId, "all");
    expect(d.promptDraftActive).toBe(false);
    expect(d.seedFixed).toBe(false);
  });
});

describe("swipes, events, recovery", () => {
  test("generation on a non-active swipe writes the swipes array only", async () => {
    const { fx, pipeline } = setup({ messages: [{ id: "m1", swipes: [STORY, "Second swipe A.\n\nSecond swipe B."], swipe_id: 0 }] });
    const { jobId, messageKey } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 1 });
    expect(messageKey).toBe("illustration:m1@1");
    await waitFor(() => finished(fx, jobId).length > 0);
    const m = fx.message("m1");
    expect(m.content).toBe(STORY);
    expect(m.swipes[1]).toContain("data-inlay-illustrator-swipe-id=\"1\"");
    expect(fx.fakeHost!.messageUpdates.at(-1)!.patch.swipes).toBeDefined();
  });

  test("swipe deletion drops the swipe's data and shifts later swipes", async () => {
    const swipes = ["A one.\n\nA two.", "B one.\n\nB two.", "C one.\n\nC two."];
    const { fx, pipeline } = setup({ messages: [{ id: "m1", swipes, swipe_id: 2 }] });
    for (const swipeIndex of [1, 2]) {
      const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex });
      await waitFor(() => finished(fx, jobId).length > 0);
    }
    await pipeline.handleHostEvent("MESSAGE_SWIPED", { chatId: CHAT_ID, action: "deleted", swipeId: 1, message: { id: "m1", chat_id: CHAT_ID } });
    const doc = fx.chatData.get(CHAT_ID)!;
    expect(Object.keys(doc.history.messagesByKey)).toEqual(["illustration:m1@1"]);
    expect(Object.keys(doc.plans)).toEqual(["illustration:m1@1"]);
    expect(Object.keys(doc.store.messages)).toEqual(["m1@1"]);
    expect(Object.values(doc.history.slotsById).every((s) => s.slotId.startsWith("illustration:m1@1:slot:"))).toBe(true);
  });

  test("message deletion removes all its data", async () => {
    const { fx, pipeline } = setup();
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, jobId).length > 0);
    await pipeline.handleHostEvent("MESSAGE_DELETED", { chatId: CHAT_ID, messageId: "m1" });
    const doc = fx.chatData.get(CHAT_ID)!;
    expect(doc.history.messagesByKey).toEqual({});
    expect(doc.plans).toEqual({});
  });

  test("publish waits while a host generation writes into the message", async () => {
    const { fx, pipeline } = setup();
    await pipeline.handleHostEvent("GENERATION_STARTED", { generationId: "g9", chatId: CHAT_ID, targetMessageId: "m1" });
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 }).catch((e) => ({ jobId: "", e }) as never);
    await waitFor(() => finished(fx).length > 0);
    // blocked while streaming (AM Or 173589)
    expect(finished(fx)[0]!.result).toBe("blocked");
    await pipeline.handleHostEvent("GENERATION_STOPPED", { generationId: "g9", chatId: CHAT_ID });
    const second = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, second.jobId).length > 0);
    expect(finished(fx, second.jobId)[0]!.result).toBe("completed");
    void jobId;
    // a streaming target delays a re-bake until the generation ends
    await pipeline.handleHostEvent("GENERATION_STARTED", { generationId: "g10", chatId: CHAT_ID, targetMessageId: "m1" });
    const doc = fx.chatData.get(CHAT_ID)!;
    const message = doc.history.messagesByKey["illustration:m1@0"]!;
    const writes = fx.fakeHost!.messageUpdates.length;
    fx.fakeHost!.messages.get(CHAT_ID)!.find((m) => m.id === "m1")!.content = STORY;
    expect(await pipeline.publish(CHAT_ID, message.messageKey)).toBe("streaming");
    expect(fx.fakeHost!.messageUpdates.length).toBe(writes);
    await pipeline.handleHostEvent("GENERATION_STOPPED", { generationId: "g10", chatId: CHAT_ID });
    await waitFor(() => fx.fakeHost!.messageUpdates.length > writes);
    expect(fx.message("m1").content).toContain("img-1");
    pipeline.dispose();
  });

  test("recover marks interrupted plans as error (footer retry)", async () => {
    const { fx, pipeline } = setup();
    await fx.services.storage.updateChatData(CHAT_ID, (doc) => {
      doc.plans["illustration:m1@0"] = { key: "illustration:m1@0", characterIndex: -1, chatIndex: -1, messageIndex: 1, messageId: "m1@0", countPolicy: { mode: "fixed", min: 1, max: 1, values: { fixed: 1, min: 1, max: 2 } }, requestedCount: 1, status: "generating", slots: [], entries: [], assetHints: [], nativeAssetSuppressed: false, revisions: [], activeRevisionId: "", error: "", updatedAt: 0 };
      return doc;
    });
    fx.json.set("chats/chat-1/chat-data.json", {});
    await pipeline.recover();
    expect(fx.chatData.get(CHAT_ID)!.plans["illustration:m1@0"]!.status).toBe("error");
  });

  test("interceptor strip", () => {
    const { pipeline } = setup();
    expect(pipeline.stripForInterceptor([{ role: "assistant", content: "x" }])[0]!.content).toBe("x");
  });

  test("chat state get / clear", async () => {
    const { fx, pipeline } = setup();
    await fx.services.storage.updateChatData(CHAT_ID, (doc) => {
      doc.actorState = { revision: 2, actors: { "persona::persona-1": { groups: { "state.fluid.cum.location": [], "actor.injury": ["bandage"] }, count: 0, ttl: {} } } } as never;
      return doc;
    });
    expect(Object.keys((await pipeline.getChatState(CHAT_ID)).actorState.actors)).toEqual(["persona::persona-1"]);
    const cleared = await pipeline.clearChatState(CHAT_ID);
    expect(cleared.actorState.actors).toEqual({});
  });
});
