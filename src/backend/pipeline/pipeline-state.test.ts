/**
 * Implicit pipeline state (STATE_MACHINES.md #3, #4, #7, #8, #18, #19, #25): retry memory, the host generation
 * tracker, blocked runs, the publish retry chain, deletions in flight and per-run engine config.
 */
import { describe, expect, test } from "bun:test";
import type { InlayConfig } from "../../shared/contract/index.js";
import type { StorageService } from "../services/types.js";
import { atelierServiceOf } from "../services/atelier.js";
import { createFakeServices } from "../testing/fake-services.js";
import { createEnginePort } from "./engine-port.js";
import { createPipelineModule, type PipelineModuleOptions } from "./index.js";
import { CHAT_ID, createFakeEngine, createPipelineFixture, finished, STORY, waitFor } from "./testing/fixtures.js";

type Messages = NonNullable<Parameters<typeof createPipelineFixture>[0]>["messages"];

function setup(options: { messages?: Messages; pipeline?: PipelineModuleOptions } = {}) {
  const fx = createPipelineFixture(options.messages ? { messages: options.messages } : {});
  const engine = createFakeEngine();
  const { pipeline } = createPipelineModule(fx.services, undefined, { engine, ...options.pipeline });
  return { fx, engine, pipeline };
}

/** Split settings the engine run got (`analyzerInput.context.splitAnalysis`), if any. */
const splitOf = (input: Record<string, unknown>) => (input.analyzerInput as { context: { splitAnalysis?: { revision: string } } }).context.splitAnalysis;

const replies = (n: number): Messages => Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}`, content: STORY }));

async function useSplit(storage: StorageService, totalCount = 2) {
  const settings = await storage.loadChatImageGenerationSettings();
  await storage.saveChatImageGenerationSettings({ ...settings, analysisMode: "split", splitAnalysis: { totalCount, batchSize: 1 } });
}
async function useSingle(storage: StorageService) {
  const settings = await storage.loadChatImageGenerationSettings();
  await storage.saveChatImageGenerationSettings({ ...settings, analysisMode: "single" });
}

const rejected = () => {
  throw Object.assign(new Error("Provider rejected the prompt"), { retryable: false });
};

/** The next storage.updateChatData call waits for `release`. */
function gateNextChatWrite(storage: StorageService) {
  const original = storage.updateChatData.bind(storage);
  let release!: () => void;
  let gate: Promise<void> | null = new Promise<void>((r) => (release = r));
  storage.updateChatData = (async (chatId: string, mutate: never) => {
    const g = gate;
    gate = null;
    if (g) await g;
    return original(chatId, mutate);
  }) as StorageService["updateChatData"];
  return () => release();
}

describe("retry memory (#3)", () => {
  test("a failed split message keeps its retry snapshot while later messages are illustrated", async () => {
    const { fx, engine, pipeline } = setup({ messages: replies(18) });
    await useSplit(fx.services.storage);
    engine.beforeImages = (n) => (n === 1 ? rejected() : undefined);
    const failed = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, failed.jobId).length > 0);
    const splitRevision = splitOf(engine.runs[0]!.input)!.revision;
    await useSingle(fx.services.storage);
    for (let i = 2; i <= 18; i += 1) {
      const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: `m${i}`, swipeIndex: 0 });
      await waitFor(() => finished(fx, jobId).length > 0);
    }
    const retry = await pipeline.retry(failed.jobId);
    await waitFor(() => finished(fx, retry.jobId).length > 0);
    expect(splitOf(engine.runs.at(-1)!.input)).toMatchObject({ revision: splitRevision });
  });

  test("after its memory is evicted, a failed split job still restarts and retries with its own settings and revision", async () => {
    const { fx, engine, pipeline } = setup({ messages: replies(17) });
    await useSplit(fx.services.storage);
    engine.beforeImages = rejected;
    const jobs: string[] = [];
    for (let i = 1; i <= 17; i += 1) {
      const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: `m${i}`, swipeIndex: 0 });
      await waitFor(() => finished(fx, jobId).length > 0);
      jobs.push(jobId);
    }
    const splitRevision = splitOf(engine.runs[0]!.input)!.revision;
    await useSingle(fx.services.storage);
    engine.beforeImages = undefined;
    expect(pipeline.listActive(CHAT_ID).find((j) => j.jobId === jobs[0])!.canRestart).toBe(true);
    const retry = await pipeline.retry(jobs[0]!);
    await waitFor(() => finished(fx, retry.jobId).length > 0);
    expect(splitOf(engine.runs.at(-1)!.input)).toMatchObject({ revision: splitRevision });
    const restart = await pipeline.restart(jobs[0]!);
    await waitFor(() => finished(fx, restart.jobId).length > 0);
    expect(splitOf(engine.runs.at(-1)!.input)).toBeDefined();
  });
});

describe("analysis preparation of retries and restarts (AM 0.9.91 179676)", () => {
  test("retry and restart prepare the analyzer from the failed run's snapshot, not the Atelier changed since", async () => {
    const { fx, engine, pipeline } = setup({ messages: replies(2) });
    await useSplit(fx.services.storage);
    engine.beforeImages = rejected;
    const failed = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, failed.jobId).length > 0);
    const original = engine.runs[0]!.context.analysisConfig;
    expect(original).toBeDefined();
    const before = JSON.stringify(original);

    // Another scene guideline selected after the failure.
    const atelier = atelierServiceOf(fx.services);
    const { id } = await atelier.createGuideline({ kind: "scene" });
    await atelier.saveGuidelines({ kind: "scene", edits: [{ id, field: "instruction", before: "", value: "Quokka guideline." }] });
    await atelier.selectGuideline({ kind: "scene", id });

    const retry = await pipeline.retry(failed.jobId);
    await waitFor(() => finished(fx, retry.jobId).length > 0);
    expect(engine.runs.at(-1)!.context.analysisConfig).toBe(original);
    const restart = await pipeline.restart(retry.jobId);
    await waitFor(() => finished(fx, restart.jobId).length > 0);
    expect(engine.runs.at(-1)!.context.analysisConfig).toBe(original);
    expect(JSON.stringify(original)).toBe(before);

    // A fresh run sees the new guideline.
    const fresh = await pipeline.start({ chatId: CHAT_ID, messageId: "m2", swipeIndex: 0 });
    await waitFor(() => finished(fx, fresh.jobId).length > 0);
    expect(JSON.stringify(engine.runs.at(-1)!.context.analysisConfig)).toContain("Quokka guideline.");
    expect(before).not.toContain("Quokka guideline.");
  });
});

describe("blocked runs and refused retries (#8)", () => {
  test("a manual start refused while the chat streams leaves the complete message without an error", async () => {
    const { fx, pipeline } = setup();
    const first = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, first.jobId).length > 0);
    await pipeline.handleHostEvent("GENERATION_STARTED", { generationId: "g-next", chatId: CHAT_ID });
    const blocked = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, blocked.jobId).length > 0);
    expect(finished(fx, blocked.jobId)[0]!.error).toMatchObject({ code: "busy" });
    const state = (await pipeline.getMessageStates(CHAT_ID)).messages[0]!;
    expect(state.planStatus).toBe("complete");
    expect(state.lastError).toBeUndefined();
  });

  test("a retry refused as busy keeps the failed job listed", async () => {
    const { fx, engine, pipeline } = setup();
    engine.beforeImages = rejected;
    const failed = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, failed.jobId).length > 0);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    engine.beforeImages = () => gate;
    const running = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await expect(pipeline.retry(failed.jobId)).rejects.toMatchObject({ error: { code: "busy" } });
    expect(pipeline.listActive(CHAT_ID).map((j) => j.jobId)).toContain(failed.jobId);
    release();
    await waitFor(() => finished(fx, running.jobId).length > 0);
  });

  test("a plan left generating because its error write failed shows as interrupted", async () => {
    const { fx, engine, pipeline } = setup();
    const storage = fx.services.storage;
    const original = storage.updateChatData.bind(storage);
    let failWrites = false;
    storage.updateChatData = (async (chatId: string, mutate: never) => {
      if (failWrites) throw new Error("disk full");
      return original(chatId, mutate);
    }) as StorageService["updateChatData"];
    engine.beforeImages = () => {
      failWrites = true;
      rejected();
    };
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, jobId).length > 0);
    expect(fx.chatData.get(CHAT_ID)!.plans["illustration:m1@0"]!.status).toBe("generating");
    const state = (await pipeline.getMessageStates(CHAT_ID)).messages[0]!;
    expect(state.planStatus).toBe("error");
    expect(state.attempt).toBe("retry");
  });
});

describe("host generation tracker (#4)", () => {
  test("a stop event without a generation id ends the chat's generations", async () => {
    const { fx, pipeline } = setup();
    await pipeline.handleHostEvent("GENERATION_STARTED", { generationId: "g-next", chatId: CHAT_ID });
    await pipeline.handleHostEvent("GENERATION_STOPPED", { chatId: CHAT_ID });
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, jobId).length > 0);
    expect(finished(fx, jobId)[0]!.result).toBe("completed");
  });

  test("a generation whose end never arrives stops blocking the chat after the stream wait limit", async () => {
    let t = 1_000_000;
    const { fx, pipeline } = setup({ pipeline: { now: () => t } });
    await pipeline.handleHostEvent("GENERATION_STARTED", { generationId: "g-lost", chatId: CHAT_ID });
    t += 5 * 60_000;
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, jobId).length > 0);
    expect(finished(fx, jobId)[0]!.result).toBe("completed");
  });
});

describe("publish retry chain (#18)", () => {
  test("publishes into a streaming message share one retry chain, warn once when it gives up, and resume when the generation ends", async () => {
    const { fx, engine, pipeline } = setup({ pipeline: { publishRetry: { delaysMs: [5], maxAttempts: 2 } } });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    engine.beforeImages = () => gate;
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => engine.runs.length === 1);
    // A swipe generation starts writing into m1 while the run commits.
    await pipeline.handleHostEvent("GENERATION_STARTED", { generationId: "g-swipe", chatId: CHAT_ID, targetMessageId: "m1" });
    release();
    await waitFor(() => finished(fx, jobId).length > 0);
    for (let i = 0; i < 4; i += 1) expect(await pipeline.publish(CHAT_ID, "illustration:m1@0")).toBe("streaming");
    const gaveUp = () => fx.services.log.list().filter((e) => e.level === "warn" && e.message.includes("Gave up updating the illustrated message"));
    await waitFor(() => gaveUp().length > 0);
    await new Promise((r) => setTimeout(r, 50));
    expect(gaveUp().length).toBe(1);
    expect(fx.message("m1").content).not.toContain("data-inlay-illustrator-image-id");
    await pipeline.handleHostEvent("GENERATION_STOPPED", { generationId: "g-swipe", chatId: CHAT_ID });
    await waitFor(() => fx.message("m1").content.includes("data-inlay-illustrator-image-id"));
  });
});

describe("deletions in flight (#19)", () => {
  test("a start during a swipe deletion runs after the keys moved, on the swipe the user sees", async () => {
    const swipes = ["A one.\n\nA two.", "B one.\n\nB two.", "C one.\n\nC two."];
    const { fx, engine, pipeline } = setup({ messages: [{ id: "m1", swipes, swipe_id: 2 }] });
    // The host already removed swipe A: C is now swipe 1.
    const m = fx.fakeHost!.messages.get(CHAT_ID)!.find((x) => x.id === "m1")!;
    m.swipes.splice(0, 1);
    m.swipe_id = 1;
    m.content = m.swipes[1]!;
    const release = gateNextChatWrite(fx.services.storage);
    const dropped = pipeline.handleHostEvent("MESSAGE_SWIPED", { chatId: CHAT_ID, action: "deleted", swipeId: 0, message: { id: "m1", chat_id: CHAT_ID } });
    const started = pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 1 });
    await new Promise((r) => setTimeout(r, 30));
    expect(engine.runs.length).toBe(0);
    release();
    await dropped;
    const { jobId } = await started;
    await waitFor(() => finished(fx, jobId).length > 0);
    const plans = fx.chatData.get(CHAT_ID)!.plans;
    expect(Object.keys(plans)).toEqual(["illustration:m1@1"]);
    expect(plans["illustration:m1@1"]!.status).toBe("complete");
  });

  test("a start while a slot of the message is being deleted is refused as busy", async () => {
    const { fx, pipeline } = setup();
    const first = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, first.jobId).length > 0);
    const preview = await pipeline.prepareSlotDeletion(CHAT_ID, "illustration:m1@0", "illustration:m1@0:slot:0");
    const release = gateNextChatWrite(fx.services.storage);
    const deleting = pipeline.deleteSlot(preview.previewToken);
    await expect(pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 })).rejects.toMatchObject({ error: { code: "busy" } });
    release();
    await deleting;
  });
});

describe("split retry count (#7)", () => {
  test("the split core's early count does not inflate a retry's image count past the plan", async () => {
    const story = ["One.", "Two.", "Three.", "Four."].join("\n\n");
    const { fx, engine, pipeline } = setup({ messages: [{ id: "m1", content: story }] });
    await useSplit(fx.services.storage, 3);
    // Run 1 saves two images, then fails: slots 0 and 1 are kept, slot 2 is missing.
    engine.beforeImages = (n, input) => {
      if (n !== 1) return;
      const persist = input.persistGeneratedImage as (img: unknown) => Promise<void>;
      let calls = 0;
      input.persistGeneratedImage = async (img: unknown) => {
        if ((calls += 1) > 2) rejected();
        await persist(img);
      };
    };
    const failed = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, failed.jobId).length > 0);
    // The retry's first detail batch holds only slot 0: the core reports 3 planned - 1 skipped = 2, then the run fails.
    engine.beforeImages = (n, input) => {
      if (n !== 2) return;
      (input.onEvent as (e: unknown) => void)({ phase: "analyzing-preset", analysisComplete: false, imageCount: 2, session: {} });
      rejected();
    };
    const retry = await pipeline.retry(failed.jobId);
    await waitFor(() => finished(fx, retry.jobId).length > 0);
    expect(pipeline.listActive(CHAT_ID).find((j) => j.jobId === retry.jobId)!.requestedCount).toBe(3);
  });
});

describe("engine port (#25)", () => {
  test("each dispatch in flight reads its own NovelAI request interval", async () => {
    const fx = createFakeServices();
    const base = await fx.services.storage.loadConfig();
    const withInterval = (sec: number): InlayConfig => ({ ...base, runtime: { ...base.runtime, novelaiParallelIntervalSec: sec } });
    let getIntervalMs!: (ref?: unknown) => number;
    const refs: unknown[] = [];
    const releases: Array<() => void> = [];
    const port = createEnginePort(fx.services, {
      createEngine: ((options: { getIntervalMs: typeof getIntervalMs }) => {
        getIntervalMs = options.getIntervalMs;
        return {
          parts: {
            dispatcher: {
              generate: (request: { providerRef: unknown }) =>
                new Promise((resolve) => {
                  refs.push(request.providerRef);
                  releases.push(() => resolve({}));
                }),
            },
          },
          dispose() {},
        };
      }) as never,
    });
    const context = { engineProvider: "novelai" as const, purpose: "regenerate" as const, connectionId: "img-1", model: "m", ownerChatId: CHAT_ID, ownerCharacterId: "char-1" };
    const a = port.dispatch({ provider: "novelai" }, context as never, withInterval(2));
    const b = port.dispatch({ provider: "novelai" }, context as never, withInterval(7));
    await waitFor(() => refs.length === 2);
    expect(getIntervalMs(refs[0])).toBe(2000);
    expect(getIntervalMs(refs[1])).toBe(7000);
    for (const r of releases) r();
    await Promise.all([a, b]);
  });
});
