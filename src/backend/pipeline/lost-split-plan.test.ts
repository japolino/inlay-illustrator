// A retry of a partial split run needs the analysis plan the engine keeps in memory. After an extension restart or
// update, a changed setting or the plan's expiry, the core refuses ("부분 생성의 분석 계획이 변경되었거나 만료되었습니다"),
// and without a recovery the message fails on every retry. These tests cover the recovery: the REAL split runner raises
// the error and accepts the remainder request, and the pipeline keeps the saved images and generates the missing ones.
import { afterEach, describe, expect, test } from "bun:test";
import inputs from "../../engine/__fixtures__/v5/inputs.json";
import { setEngineEnv } from "../../engine/core/env.js";
import { seededEnv } from "../../engine/testing/env.js";
import { createV5SplitAnalysisRunner } from "../../engine/v5/analyzer.js";
import type { BackendServices } from "../services/types.js";
import { createPipelineModule } from "./index.js";
import { isLostSplitPlan, remainderAnalyzerContext } from "./generate.js";
import { CHAT_ID, createFakeEngine, createPipelineFixture, finished, waitFor } from "./testing/fixtures.js";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const LOST = "부분 생성의 분석 계획이 변경되었거나 만료되었습니다. 초기 결정부터 다시 시작하세요.";

afterEach(() => setEngineEnv(null));

describe("a partial split run whose stored analysis plan is gone", () => {
  test("the real split runner refuses to resume without its plan, and then runs the remainder request", async () => {
    setEngineEnv(seededEnv(9));
    const calls: Array<{ phase: string; slots: number[] }> = [];
    const analyzer = {
      runtime: { catalogFingerprint: "catalog" },
      captureSelectionSettings: () => undefined,
      async run(R: Any): Promise<Any> {
        calls.push({ phase: R.splitStage.phase, slots: R.context.candidateSlots.map((s: Any) => s.slot_number) });
        if (R.splitStage.phase === "initial")
          return { splitPlan: { illustrations: R.context.candidateSlots.map((s: Any) => ({ slot_number: s.slot_number, actor_roster: [] })) }, response: { illustrations: [], diagnostics: [] }, localProjection: {}, catalogFingerprint: "catalog" };
        return { response: { illustrations: R.splitStage.assignedSlots.map((n: number) => ({ slotNumber: n, status: "recovered", diagnostics: [] })), diagnostics: [] } };
      },
    };
    const runner = createV5SplitAnalysisRunner(analyzer as never);
    const slots = Array.from({ length: 4 }, (_, i) => ({ slot_id: "s" + i, slot_number: i, before: "b" + i, after: "a" + i }));
    const context = { ...(inputs as Any).context, candidateSlots: slots, targetImageCount: 4, imageCountConstraint: { mode: "fixed", min: 4, max: 4 }, splitAnalysis: { totalCount: 4, batchSize: 2, retries: 0 } };
    const run = (ctx: Any, requireRetainedPlan: boolean) =>
      runner.run(
        { context: ctx, config: { provider: "openai" }, userDirections: {}, continuitySnapshot: null, checkpointContext: { chatKey: "chat-key", messageId: "msg-1", pendingKey: "resp-1" } } as never,
        async () => ({}),
        undefined,
        undefined,
        { requireRetainedPlan, ready: () => undefined, stop: () => undefined, drain: async () => undefined },
      );

    // Slots 0 and 2 are saved; a fresh engine (after a restart) has no plan for this message.
    const refused = await run(context, true).catch((e: unknown) => e);
    expect((refused as Error).message).toBe(LOST);
    expect(refused).toMatchObject({ name: "SplitAnalysisError", scope: "expired" });
    expect(isLostSplitPlan(refused)).toBe(true);
    expect(isLostSplitPlan(new Error("wrapped", { cause: refused }))).toBe(true);
    expect(calls).toEqual([]);

    const remainder = remainderAnalyzerContext(context, [0, 2], 4)!;
    expect(remainder.candidateSlots.map((s: Any) => s.slot_number)).toEqual([1, 3]);
    expect([remainder.targetImageCount, remainder.imageCountConstraint, remainder.splitAnalysis]).toEqual([2, { mode: "fixed", min: 2, max: 2 }, { totalCount: 2, batchSize: 2, retries: 0 }]);
    const out: Any = await run(remainder, false);
    expect(out.result.response.illustrations.map((i: Any) => i.slotNumber).sort()).toEqual([1, 3]);
    expect(calls.map((c) => c.phase)).toEqual(["initial", "detail"]);
    expect(calls.every((c) => c.slots.join() === "1,3")).toBe(true);
    runner.dispose();
  });

  test("other errors are not taken for a lost plan; nothing missing gives no remainder", () => {
    expect(isLostSplitPlan(new Error("Analyzer timed out after 180000 ms"))).toBe(false);
    expect(isLostSplitPlan(Object.assign(new Error("busy"), { name: "SplitAnalysisError", scope: "busy" }))).toBe(false);
    expect(isLostSplitPlan(null)).toBe(false);
    const context = { candidateSlots: [{ slot_number: 0 }, { slot_number: 1 }], splitAnalysis: { totalCount: 2, batchSize: 1 } };
    expect(remainderAnalyzerContext(context, [0, 1], 2)).toBeNull();
    // One image was deleted by the user and one is saved: only the third is still owed.
    const three = { candidateSlots: [{ slot_number: 0 }, { slot_number: 1 }, { slot_number: 2 }], splitAnalysis: { totalCount: 3, batchSize: 1 } };
    expect(remainderAnalyzerContext(three, [0, 2], 3)).toMatchObject({ candidateSlots: [{ slot_number: 1 }], targetImageCount: 1, splitAnalysis: { totalCount: 1 } });
  });

  test("the pipeline keeps the saved image and generates the missing one instead of failing every retry", async () => {
    const fx = createPipelineFixture();
    const engine = createFakeEngine();
    const { pipeline } = createPipelineModule(fx.services as unknown as BackendServices, undefined, { engine });
    const key = "illustration:m1@0";
    const settings = await fx.services.storage.loadChatImageGenerationSettings();
    await fx.services.storage.saveChatImageGenerationSettings({ ...settings, analysisMode: "split", splitAnalysis: { totalCount: 2, batchSize: 1 } });
    // Run 1 saves its first image, then fails: the revision ends partial.
    engine.beforeImages = (n, input) => {
      if (n === 1) {
        const persist = input.persistGeneratedImage as (img: unknown) => Promise<void>;
        let saved = 0;
        input.persistGeneratedImage = async (img: unknown) => {
          if ((saved += 1) > 1) throw Object.assign(new Error("Provider rejected the prompt"), { retryable: false });
          await persist(img);
        };
      }
      // Run 2 is the retry on an engine that lost its plan (as after an extension update): the core's own refusal.
      if (n === 2) throw Object.assign(new Error(LOST), { name: "SplitAnalysisError", scope: "expired" });
    };
    const first = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx, first.jobId).length > 0);
    expect(finished(fx, first.jobId)[0]!.result).not.toBe("completed");
    expect(fx.chatData.get(CHAT_ID)!.plans[key]!.entries.map((e) => e.slotIndex)).toEqual([0]);

    const retry = await pipeline.retry(first.jobId);
    await waitFor(() => finished(fx, retry.jobId).length > 0);
    expect(finished(fx, retry.jobId)[0]!.error).toBeUndefined();
    expect(finished(fx, retry.jobId)[0]!.result).toBe("completed");
    // The refused resume asked to skip the saved slot; the restart asks for the missing image only, over the other slots.
    expect(engine.runs.length).toBe(3);
    const [, refused, restart] = engine.runs.map((r) => r.input as Any);
    expect(refused.skipSlotNumbers).toEqual([0]);
    expect(refused.analyzerInput.checkpointPolicy).toBe("resume");
    expect(restart.skipSlotNumbers).toEqual([]);
    expect(restart.analyzerInput.checkpointPolicy).toBe("restart-analysis");
    expect(restart.analyzerInput.context.candidateSlots.some((s: Any) => s.slot_number === 0)).toBe(false);
    expect([restart.analyzerInput.context.targetImageCount, restart.analyzerInput.context.splitAnalysis.totalCount]).toEqual([1, 1]);
    const plan = fx.chatData.get(CHAT_ID)!.plans[key]!;
    expect(plan.status).toBe("complete");
    expect(plan.entries.map((e) => e.slotIndex)).toEqual([0, 1]);
    expect(fx.chatData.get(CHAT_ID)!.history.messagesByKey[key]!.revisions.length).toBe(1);
    pipeline.dispose();
  });
});
