import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { createDefaultChatImageGenerationSettings, createDefaultConfig, createDefaultV5UserDirections } from "../../../shared/contract/config.js";
import { AppController } from "../../state/app-state.js";
import { RpcClient } from "../../rpc/client.js";
import { createFullMockBackend } from "../../dev/mock/index.js";
import type { MockBackend } from "../../dev/mock-backend.js";
import { prunePatch } from "./config-form.js";
import {
  builtInDescription,
  commitPresetDraft,
  controlState,
  directionPatch,
  orderedPresets,
  presetControls,
  removePreset,
  selectPreset,
  selectedPreset,
  setControlEnabled,
  setControlValue,
  toggleSizeCandidate
} from "./directions.js";
import { saveCustomSize, setAnalysisMode, setCountMode, setCountRange, setFixedCount, setSplitTotal } from "./system-helpers.js";
import { anyCharxDirty, fixedResolutionOptions, regexRowsOf, resetAllPatch, sourceMetadataState } from "./charx.js";
import { formatLogList, mergeLogEntries, scopeLabel } from "./logs.js";
import { pickAnalyzerError } from "./analyzer-errors.js";
import { llmConnectionOptions, modelOptions } from "./model.js";
import { connectionPatch, resolveImageConnection } from "./image-model.js";

const win = new Window({ url: "http://localhost/" });
const doc = win.document as unknown as Document;
const frameGlobals = globalThis as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown; CSS?: unknown };
const savedFrames = { request: frameGlobals.requestAnimationFrame, cancel: frameGlobals.cancelAnimationFrame, css: frameGlobals.CSS };
beforeAll(() => {
  // The shell rail uses CSS.escape; the private happy-dom window does not install globals.
  frameGlobals.CSS ??= { escape: (value: string) => value.replace(/["\\]/g, "\\$&") };
  frameGlobals.requestAnimationFrame = (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0);
  frameGlobals.cancelAnimationFrame = (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle);
});
afterAll(() => {
  frameGlobals.requestAnimationFrame = savedFrames.request;
  frameGlobals.cancelAnimationFrame = savedFrames.cancel;
  frameGlobals.CSS = savedFrames.css;
  win.happyDOM.abort();
});
afterEach(() => {
  doc.body.replaceChildren();
});

describe("V5 direction helpers", () => {
  const scene = createDefaultV5UserDirections().scene;
  test("orders built-ins like Asset Maid and labels them in English", () => {
    const { builtIns, custom } = orderedPresets("analysis", scene.presets);
    expect(builtIns.map((p) => p.id)).toEqual(["scene-default", "scene-comic", "scene-pov", "scene-ensemble"]);
    expect(custom).toEqual([]);
    expect(builtInDescription("analysis", builtIns[0])).toContain("free, varied staging");
  });
  test("selecting a preset mirrors scene id and instruction", () => {
    const next = selectPreset(scene, "scene-comic");
    expect(next.selectedPresetId).toBe("scene-comic");
    expect(next.presetId).toBe("comic");
    expect(selectedPreset(next)?.id).toBe("scene-comic");
  });
  test("comic controls: minimum panels only in developer mode; overrides drop defaults", () => {
    const comic = scene.presets.find((p) => p.id === "scene-comic")!;
    expect(presetControls("analysis", comic, false).map((c) => c.id)).toEqual(["speech-bubble", "landscape"]);
    expect(presetControls("analysis", comic, true).map((c) => c.id)).toContain("minimum-panels");
    const off = setControlEnabled(undefined, "comic.speech-bubble", false);
    expect(off).toEqual({ "comic.speech-bubble": false });
    expect(setControlEnabled(off, "comic.speech-bubble", true)).toBeUndefined();
    const panels = setControlValue(setControlEnabled(undefined, "comic.minimum-panels", true), "comic.minimum-panels", 3);
    expect(panels).toEqual({ "comic.minimum-panels": 3 });
    const control = presetControls("analysis", comic, true).find((c) => c.id === "minimum-panels")!;
    expect(controlState(control, panels)).toEqual({ enabled: true, value: 3 });
  });
  test("direction patch lists every control so stale overrides cannot survive a deep merge", () => {
    const patch = directionPatch(selectPreset(scene, "scene-default"));
    expect(patch.presetId).toBe("");
    expect(patch.controlOverrides).toEqual({ "comic.speech-bubble": true, "comic.landscape": false, "comic.minimum-panels": false });
  });
  test("custom presets: add, then delete selects the first remaining", () => {
    const added = commitPresetDraft("analysis", scene, { id: "scene-x", name: "  Mine ", instruction: "", customInstruction: { enabled: true, text: " close-up " } });
    expect(added.selectedPresetId).toBe("scene-x");
    expect(selectedPreset(added)).toMatchObject({ name: "Mine", customInstruction: { enabled: true, text: "close-up" } });
    expect(orderedPresets("analysis", added.presets).custom.map((p) => p.id)).toEqual(["scene-x"]);
    expect(removePreset(added, "scene-x").selectedPresetId).toBe(scene.presets[0]!.id);
  });
  test("size candidates keep order and never become empty", () => {
    expect(toggleSizeCandidate([1, 2, 5], 3, true)).toEqual([1, 2, 3, 5]);
    expect(toggleSizeCandidate([5], 5, false)).toEqual([5]);
  });
});

describe("settings form helpers", () => {
  test("prunePatch drops values equal to the saved config", () => {
    const config = createDefaultConfig();
    expect(prunePatch({ analysis: { temperature: config.analysis.temperature } }, config)).toBeUndefined();
    expect(prunePatch<unknown>({ analysis: { temperature: 0.7, timeoutMs: config.analysis.timeoutMs } }, config)).toEqual({ analysis: { temperature: 0.7 } });
  });
  test("custom sizes are validated, rounded to 64 and deduplicated", () => {
    expect(saveCustomSize([], { id: 1e9, width: "30", height: "960" })).toEqual({ error: "Enter integers from 64 to 2048 for width and height." });
    expect(saveCustomSize([], { id: 1e9, width: "830", height: "1210" })).toEqual({ error: "This resolution is already registered." });
    expect(saveCustomSize([], { id: 1e9, width: "650", height: "970" })).toEqual({ sizes: [{ id: 1e9, width: 640, height: 960 }] });
  });
  test("chat image settings: fixed/range counts, split analysis", () => {
    const base = createDefaultChatImageGenerationSettings();
    expect(setFixedCount(base, 9, 7).countPolicy).toMatchObject({ mode: "fixed", min: 7, max: 7 });
    expect(setFixedCount(base, 9, Number.MAX_SAFE_INTEGER).countPolicy.max).toBe(9);
    const range = setCountRange(setCountMode(base, "range", 7), 2, 4, 7);
    expect(range.countPolicy).toMatchObject({ mode: "range", min: 2, max: 4 });
    const split = setAnalysisMode(base, "split", 7);
    expect(split.analysisMode).toBe("split");
    expect(split.splitAnalysis.totalCount).toBe(2);
    expect(setSplitTotal(split, 50, 7).splitAnalysis.totalCount).toBe(20);
  });
  test("charx helpers", () => {
    expect(sourceMetadataState({})).toBe("unknown");
    expect(sourceMetadataState({ a: "available", b: "none" })).toBe("partial");
    expect(sourceMetadataState({ a: "available", b: "deleted" })).toBe("available");
    expect(fixedResolutionOptions([{ id: 1e9, width: 640, height: 960 }]).map((o) => o.label)).toContain("Portrait 640 × 960 · Custom");
    const config = createDefaultConfig();
    config.characterPrompt.charxGenerationDefaults.dirtyFieldsBySourceId = { c1: ["nsfwAlwaysEnabled"] };
    expect(anyCharxDirty(config)).toBe(true);
    const patch = resetAllPatch(config);
    expect(patch.characterPrompt.charxGenerationDefaults.dirtyFieldsBySourceId).toEqual({ c1: [] });
    expect(patch.characterPrompt.charxGenerationDefaults.revisionByField.nsfwAlwaysEnabled).toBe(1);
    expect(regexRowsOf({ t1: { detectors: [{ in: "\\[img:(.+?)\\]" }] } })).toEqual([{ id: "t1:0", targetId: "t1", detectorIndex: 0, value: "\\[img:(.+?)\\]" }]);
  });
  test("log helpers merge newest first and export oldest first", () => {
    const a = { seq: 1, at: "2026-01-01T00:00:00Z", level: "info" as const, scope: "chat-image", message: "one" };
    const b = { seq: 2, at: "2026-01-01T00:00:01Z", level: "error" as const, scope: "x", message: "", details: { k: 1 } };
    expect(mergeLogEntries([a], [b, a]).map((e) => e.seq)).toEqual([2, 1]);
    const text = formatLogList([b, a]);
    expect(text.indexOf("one")).toBeLessThan(text.indexOf("(no message)"));
    expect(text).toContain("\n\n---\n\n");
    expect(scopeLabel("chat-image")).toBe("Chat image");
    expect(scopeLabel("raw-key")).toBe("raw-key");
  });
  test("analyzer error notice picks the oldest undismissed error", () => {
    const job = (jobId: string, status: "error" | "success", finishedAt: number) => ({ jobId, kind: "asset-matching" as const, characterId: "c", status, progress: { label: "" }, rows: [], startedAt: 0, finishedAt });
    const jobs = { a: job("a", "success", 1), b: job("b", "error", 3), c: job("c", "error", 2) };
    expect(pickAnalyzerError(jobs, new Set())?.jobId).toBe("c");
    expect(pickAnalyzerError(jobs, new Set(["c"]))?.jobId).toBe("b");
  });
  test("connection option helpers keep unknown saved values", () => {
    const llm = [{ id: "l1", name: "Main", provider: "openai", model: "gpt", isDefault: true, hasApiKey: true }];
    expect(llmConnectionOptions(llm, "gone").map((o) => o.value)).toEqual(["", "l1", "gone"]);
    expect(modelOptions([{ id: "m1", label: "M1" }], "old", "gpt").map((o) => o.value)).toEqual(["", "old", "m1"]);
    const images = [
      { id: "n", name: "NAI", provider: "novelai", model: "nai", isDefault: false, generationProvider: "novelai" as const, promptCodec: "novelai-structured" as const },
      { id: "c", name: "Comfy", provider: "comfyui", model: "x", isDefault: true, generationProvider: "comfy-ui" as const, promptCodec: "anima-flat" as const }
    ];
    expect(resolveImageConnection(images, "")?.id).toBe("c");
    expect(connectionPatch(images, "n")).toEqual({ image: { connectionId: "n", provider: "novelai", model: "" } });
  });
});

/* ------------------------------------------------------------------------------------------------
 * DOM tests against the dev mock (full overlay, settings area)
 * ---------------------------------------------------------------------------------------------- */

function fakeCtx(): SpindleFrontendContext {
  return {
    ui: {
      mountApp: () => {
        const root = doc.createElement("div");
        doc.body.appendChild(root);
        return { root, mountId: "m1", setVisible: () => undefined, destroy: () => root.remove() };
      }
    }
  } as unknown as SpindleFrontendContext;
}

async function until<T>(read: () => T | null | undefined | false, timeoutMs = 3000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error("until: timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function openSettings(section: string, setup?: (mock: MockBackend) => void) {
  const mock = createFullMockBackend({ timeScale: 0 });
  setup?.(mock);
  const app = new AppController(new RpcClient(mock.transport));
  await app.init();
  const { createOverlayController } = await import("../controller.js");
  const { FrontendStore } = await import("../store.js");
  const controller = createOverlayController(fakeCtx(), { store: new FrontendStore(), app, doc });
  controller.open({ settings: section as never });
  return { mock, app, controller };
}

function input(element: Element, value: string) {
  (element as HTMLInputElement).value = value;
  element.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);
}

describe("settings pages (DOM)", () => {
  test("model page: number fields are drafts saved by the header button", async () => {
    const { mock, controller } = await openSettings("model");
    const field = await until(() => doc.querySelector('[data-settings-page="model"] input[type="number"]'));
    const save = doc.querySelector("[data-settings-save]") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    input(field, "0.7");
    await until(() => doc.querySelector('[data-settings-dirty="true"]'));
    expect(mock.calls.some((c) => c.method === "config.update")).toBe(false);
    (doc.querySelector("[data-settings-save]") as HTMLButtonElement).click();
    await until(() => mock.db.config.analysis.temperature === 0.7);
    await until(() => doc.querySelector('[data-settings-dirty="false"]'));
    controller.destroy();
  });

  test("system page: steppers save at once and 5 clicks reveal developer mode", async () => {
    const { mock, controller } = await openSettings("system");
    const increase = await until(() => doc.querySelector('[aria-label="1 automatic retry less"]'));
    (increase as HTMLButtonElement).click();
    await until(() => mock.db.config.runtime.generationAutoRetryCount === 4);
    const trigger = doc.querySelector("[data-developer-mode-trigger]") as HTMLElement;
    expect(doc.querySelector('[aria-label="Use developer mode"]')).toBeNull();
    for (let i = 0; i < 5; i += 1) trigger.click();
    const toggle = await until(() => doc.querySelector('[aria-label="Use developer mode"]'));
    (toggle as HTMLButtonElement).click();
    await until(() => mock.db.config.ui.developerModeEnabled === true);
    controller.destroy();
  });

  test("current character settings: a toggle writes a per-character override and shows the Custom marker", async () => {
    const { mock, controller } = await openSettings("charx");
    const toggle = await until(() => doc.querySelector('[data-charx-field="nsfwAlwaysEnabled"] [role="switch"]'));
    expect(doc.querySelector('[data-charx-field="nsfwAlwaysEnabled"]')?.textContent).not.toContain("Custom");
    (toggle as HTMLButtonElement).click();
    await until(() => doc.querySelector('[data-charx-field="nsfwAlwaysEnabled"]')?.textContent?.includes("Custom"));
    const doc1 = mock.db.documents["char-seoyeon"]!;
    expect(doc1.characterPrompt.charxSettings.overrides["char-seoyeon"]).toMatchObject({ nsfwAlwaysEnabled: true });
    expect(mock.db.config.characterPrompt.charxGenerationDefaults.nsfwAlwaysEnabled).toBe(false);
    (doc.querySelector("[data-charx-reset-scope]") as HTMLButtonElement).click();
    await until(() => !doc.querySelector('[data-charx-field="nsfwAlwaysEnabled"]')?.textContent?.includes("Custom"));
    controller.destroy();
  });

  test("all characters settings: analysis and data sections are disabled", async () => {
    const { controller } = await openSettings("all-charx");
    await until(() => doc.querySelector('[data-charx-scope="all"]'));
    const disabled = [...doc.querySelectorAll('section[aria-disabled="true"]')].map((s) => s.querySelector("h2")?.textContent);
    expect(disabled).toEqual(["Character analysis", "Data management"]);
    controller.destroy();
  });

  test("logs page lists entries and appends live ones", async () => {
    const { mock, controller } = await openSettings("logs", (m) => { m.db.config.ui.developerModeEnabled = true; });
    await until(() => doc.querySelectorAll("[data-log-entry]").length === 8);
    const { appendMockLog } = await import("../../dev/mock/settings.js");
    appendMockLog(mock.db, mock, { level: "warn", scope: "chat-image", message: "live" });
    await until(() => doc.querySelectorAll("[data-log-entry]").length === 9);
    expect(doc.querySelector("[data-log-entry]")?.textContent).toContain("live");
    controller.destroy();
  });
});
