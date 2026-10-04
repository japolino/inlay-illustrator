import { describe, expect, test } from "bun:test";
import { createDefaultChatImageGenerationSettings } from "../../shared/contract/config.js";
import { findScopeViolations } from "../../build/css-scope.js";
import type { GenerationJobSnapshot } from "../../shared/contract/rpc.js";
import { applyCountAction, countLimits, countToggleText, countView } from "./count-model.js";
import { historyIdOfKey, jobForMessage, uniqueBubbles } from "./dom.js";
import { CHAT_SIDE_CSS } from "./styles.js";
import { buildToastStack, finishedToast, generationProgress, runningMessage } from "./toast-model.js";
import { historyPosition, revisionPosition } from "./widgets.js";

const limits = countLimits(false, "v5-hybrid");

describe("generation-count panel model", () => {
  test("default view: fixed 1, auto", () => {
    const view = countView(createDefaultChatImageGenerationSettings(), limits);
    expect(view.mode).toBe("fixed");
    expect(view.auto).toBe(true);
    expect(countToggleText(view)).toBe("1");
  });
  test("fixed stepper clamps to 1..7", () => {
    let s = createDefaultChatImageGenerationSettings();
    expect(applyCountAction(s, "fixed-decrement", limits)).toBeNull();
    for (let i = 0; i < 10; i += 1) s = applyCountAction(s, "fixed-increment", limits) ?? s;
    expect(countView(s, limits).fixed).toBe(7);
    expect(applyCountAction(s, "fixed-increment", limits)).toBeNull();
    expect(countView(s, countLimits(true, "v5-hybrid")).bounds.fixed.max).toBe(Number.MAX_SAFE_INTEGER);
  });
  test("range keeps min < max and the toggle shows min–max", () => {
    let s = applyCountAction(createDefaultChatImageGenerationSettings(), "select-range", limits)!;
    let view = countView(s, limits);
    expect(view.mode).toBe("range");
    expect(countToggleText(view)).toBe("1–2");
    expect(applyCountAction(s, "min-increment", limits)).toBeNull();
    s = applyCountAction(s, "max-increment", limits)!;
    s = applyCountAction(s, "min-increment", limits)!;
    view = countView(s, limits);
    expect([view.min, view.max]).toEqual([2, 3]);
    expect(s.analysisMode).toBe("single");
  });
  test("split needs V5 and caps the batch at ceil(total/2)", () => {
    expect(applyCountAction(createDefaultChatImageGenerationSettings(), "select-split", countLimits(false, "v4.5"))).toBeNull();
    let s = applyCountAction(createDefaultChatImageGenerationSettings(), "select-split", limits)!;
    expect(s.analysisMode).toBe("split");
    for (let i = 0; i < 8; i += 1) s = applyCountAction(s, "total-increment", limits) ?? s;
    expect(countView(s, limits).total).toBe(9);
    for (let i = 0; i < 9; i += 1) s = applyCountAction(s, "batch-increment", limits) ?? s;
    expect(countView(s, limits).batch).toBe(5);
    s = applyCountAction(s, "total-decrement", limits)!;
    expect(s.splitAnalysis).toEqual({ totalCount: 8, batchSize: 4 });
    expect(applyCountAction(s, "select-fixed", limits)!.analysisMode).toBe("single");
  });
  test("auto toggle", () => {
    expect(applyCountAction(createDefaultChatImageGenerationSettings(), "toggle-auto", limits)!.autoGenerationEnabled).toBe(false);
  });
});

function job(patch: Partial<GenerationJobSnapshot> = {}): GenerationJobSnapshot {
  return { jobId: "j1", chatId: "c", messageKey: "illustration:m1@0", attemptKind: "initial", status: "running", phase: "generating", progress: { label: "Image 1/3" }, requestedCount: 3, completedSlots: 1, failedSlots: 0, canRetry: true, canRestart: false, ...patch };
}

describe("runtime toasts", () => {
  test("running messages follow the phase", () => {
    expect(runningMessage(job())).toBe("Generating asset · 2/3");
    expect(runningMessage(job({ phase: "analyzing-preset" }))).toBe("Analyzing · 3 images");
    expect(runningMessage(job({ status: "queued", phase: "planned" }))).toBe("Analysis waiting");
    expect(runningMessage(job({ attemptKind: "regenerate" }))).toBe("Regenerating asset");
    expect(runningMessage(job({ progress: { label: "x", retry: { attempt: 2, total: 5 } } }))).toBe("Generating asset · 2/3 · 2/5");
  });
  test("progress uses the backend fraction, else the AM phase formula", () => {
    expect(generationProgress(job({ progress: { label: "", fraction: 0.5 } }))).toBe(0.5);
    expect(generationProgress(job({ phase: "planned" }))).toBeCloseTo(0.04);
    expect(generationProgress(job({ phase: "committing" }))).toBe(0.99);
    expect(generationProgress(job())).toBeCloseTo(0.04 + (0.96 / 5) * 3);
  });
  test("finished toasts: success auto-dismisses, failure offers retry and stays", () => {
    const ok = finishedToast({ jobId: "j", chatId: "c", messageKey: "k", result: "completed", attemptKind: "initial", requestedCount: 2, completedSlots: 2, canRetry: false, canRestart: false, finishedAt: 1 });
    expect([ok.tone, ok.message, ok.autoDismissMs > 0]).toEqual(["success", "Asset complete · 2 images", true]);
    const failed = finishedToast({ jobId: "j", chatId: "c", messageKey: "k", result: "failed", attemptKind: "initial", requestedCount: 2, completedSlots: 0, canRetry: true, canRestart: true, finishedAt: 1, error: { code: "provider-error", message: "HTTP 429" } });
    expect([failed.tone, failed.action, failed.autoDismissMs, failed.errorText]).toEqual(["danger", "retry", 0, "HTTP 429"]);
  });
  test("stack order, job numbers and dismissed keys", () => {
    const displayIndex = new Map<string, number>();
    const stack = buildToastStack({
      running: [job({ jobId: "a" }), job({ jobId: "done", status: "success" })],
      finished: [{ jobId: "b", chatId: "c", messageKey: "k", result: "cancelled", attemptKind: "initial", requestedCount: 1, completedSlots: 0, canRetry: false, canRestart: false, finishedAt: 1 }],
      notices: [{ key: "n", tone: "info", message: "hi", createdAt: 1 }],
      dismissed: new Set(["notice:x"]),
      displayIndex,
      now: 1
    });
    expect(stack.map((t) => [t.key, t.displayIndex])).toEqual([["generation:a", 1], ["generation:b", 2], ["notice:n", undefined]]);
    const again = buildToastStack({ running: [], finished: [], notices: [], dismissed: new Set(), displayIndex, now: 2 });
    expect(again).toEqual([]);
  });
});

describe("chat DOM helpers", () => {
  test("history ids and job matching", () => {
    expect(historyIdOfKey("illustration:m1@0")).toBe("m1@0");
    expect(historyIdOfKey("m1@0")).toBe("m1@0");
    const state = { chatId: "c", messageKey: "illustration:m1@0" };
    expect(jobForMessage({ j1: job() }, state)?.jobId).toBe("j1");
    expect(jobForMessage({ j1: job({ messageKey: "m1@0" }) }, state)?.jobId).toBe("j1");
    expect(jobForMessage({ j1: job({ attemptKind: "regenerate" }) }, state)).toBeUndefined();
    expect(jobForMessage({ j1: job({ status: "error" }) }, state)).toBeUndefined();
  });
  test("innermost element per message id", () => {
    const inner = { contains: () => false } as unknown as Element;
    const outer = { contains: (el: unknown) => el === inner } as unknown as Element;
    expect(uniqueBubbles([{ messageId: "m", element: outer }, { messageId: "m", element: inner }]).map((b) => b.element)).toEqual([inner]);
  });
  test("pager positions", () => {
    expect(revisionPosition({ revisions: [{ revisionId: "a" }, { revisionId: "b" }] as never, activeRevisionId: "a" })).toEqual({ index: 0, count: 2 });
    expect(revisionPosition({ revisions: [{ revisionId: "a" }] as never, activeRevisionId: "" })).toEqual({ index: 0, count: 1 });
    const attrs = { entryId: "e2", entryIndex: 1, entryCount: 3 } as never;
    expect(historyPosition(attrs, { entries: [{ entryId: "e1" }, { entryId: "e2" }] } as never)).toEqual({ index: 1, count: 2 });
    expect(historyPosition({ entryId: "", entryIndex: 2, entryCount: 3 } as never, undefined)).toEqual({ index: 1, count: 3 });
  });
});

/** Selectors of style rules (descends into @media, skips @keyframes). */
function styleSelectors(css: string): string[] {
  const out: string[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  const walk = (block: string) => {
    let i = 0;
    while (i < block.length) {
      const open = block.indexOf("{", i);
      if (open < 0) break;
      const head = block.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < block.length && depth > 0) {
        if (block[j] === "{") depth += 1;
        else if (block[j] === "}") depth -= 1;
        j += 1;
      }
      const body = block.slice(open + 1, j - 1);
      if (head.startsWith("@media") || head.startsWith("@supports")) walk(body);
      else if (!head.startsWith("@")) out.push(...head.split(",").map((s) => s.trim()).filter(Boolean));
      i = j;
    }
  };
  walk(text);
  return out;
}

describe("chat-side stylesheet", () => {
  test("every rule is anchored on our own markup", () => {
    // `.inlay-illustrator-frame` is our own baked frame class; the scope checker only knows `.ii-am-root`.
    const violations = findScopeViolations(CHAT_SIDE_CSS.replace(/\.inlay-illustrator-frame(:hover)? /gu, ".ii-am-root ").replace(/\.inlay-illustrator-frame > /gu, ".ii-am-root > "));
    expect(violations).toEqual([]);
    for (const selector of styleSelectors(CHAT_SIDE_CSS)) {
      expect(/^\.(?:ii-am-root|inlay-illustrator-frame)[.:\s[]/u.test(selector) || selector === ".ii-am-root").toBe(true);
    }
    expect(styleSelectors("@media (x){.a,.ii-am-root .b{c:d}} @keyframes k{to{x:y}} .e{f:g}")).toEqual([".a", ".ii-am-root .b", ".e"]);
  });
});
