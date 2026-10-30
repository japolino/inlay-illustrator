import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { h, render, type ComponentChild } from "preact";
import type { ChatMessageUiState } from "../../shared/contract/chat-dom.js";
import { createFullMockBackend } from "../dev/mock/index.js";
import { MockRpcError } from "../dev/mock-backend.js";
import { ConfirmProvider } from "../overlay/ui/index.js";
import { RpcClient } from "../rpc/client.js";
import { AppController } from "../state/app-state.js";
import { createZoomViewer, type ZoomViewer } from "./index.js";
import { AI_EDIT_LABELS, ZOOM_LABELS } from "./labels.js";
import { ChatStatePanel } from "./panels.js";
import { useZoomSession, type ZoomSession, type ZoomTarget } from "./session.js";
import { Stage } from "./stage.js";
import {
  aiChoiceZoneTop,
  buildImageGroups,
  centersOf,
  clampCoordinate,
  containRect,
  downloadName,
  filterMentions,
  findMentionTrigger,
  flattenItems,
  insertMention,
  isRemovalPoint,
  markersFromSections,
  mentionCandidates,
  pointToCenter,
  rosterDisplayName,
  stepId,
  stepItem,
  type MentionCandidate
} from "./model.js";

const people: MentionCandidate[] = [
  { id: "a", name: "한서연", ownerName: "Academy", searchKeys: ["서연", "Seo-yeon"] },
  { id: "b", name: "김민아", searchKeys: ["민아", "Mina"] },
  { id: "c", name: "강지훈", searchKeys: ["지훈", "Jihoon"] },
  { id: "d", name: "Ms. Park", searchKeys: ["선생님"] }
];

describe("mention trigger", () => {
  test("finds the last $ before the caret", () => {
    expect(findMentionTrigger("make $서", 7)).toEqual({ start: 5, query: "서" });
    expect(findMentionTrigger("a $b $cd", 8)).toEqual({ start: 5, query: "cd" });
    expect(findMentionTrigger("$", 1)).toEqual({ start: 0, query: "" });
  });
  test("rejects no $, newlines and long queries", () => {
    expect(findMentionTrigger("hello", 5)).toBeNull();
    expect(findMentionTrigger("$ab\ncd", 6)).toBeNull();
    expect(findMentionTrigger(`$${"x".repeat(41)}`, 42)).toBeNull();
    expect(findMentionTrigger(`$${"x".repeat(40)}`, 41)).not.toBeNull();
  });
  test("insert replaces $query with the plain name and moves the caret", () => {
    const text = "make $서 smile";
    const trigger = findMentionTrigger(text, 7)!;
    expect(insertMention(text, trigger, 7, "한서연")).toEqual({ text: "make 한서연 smile", caret: 8 });
  });
  test("insert refuses results longer than 2000 chars", () => {
    const text = `${"a".repeat(1999)}$`;
    expect(insertMention(text, { start: 1999, query: "" }, 2000, "한서연")).toBeNull();
  });
});

describe("mention filter (substring, jamo, chosung)", () => {
  const names = (q: string) => filterMentions(people, q).map((p) => p.name);
  test("empty query keeps every candidate in order", () => {
    expect(names("")).toEqual(["한서연", "김민아", "강지훈", "Ms. Park"]);
  });
  test("substring and search keys", () => {
    expect(names("민")).toEqual(["김민아"]);
    expect(names("mina")).toEqual(["김민아"]);
    expect(names("park")).toEqual(["Ms. Park"]);
  });
  test("partial syllable (jamo) matches", () => {
    expect(names("기")).toEqual(["김민아"]);
    expect(names("서ㅇ")).toEqual(["한서연"]);
  });
  test("chosung-only queries", () => {
    expect(names("ㅎㅅㅇ")).toEqual(["한서연"]);
    expect(names("ㅈㅎ")).toEqual(["강지훈"]);
    expect(names("ㅅ")).toContain("한서연");
  });
  test("prefix matches rank first", () => {
    const list: MentionCandidate[] = [{ id: "1", name: "Ann Lee", searchKeys: [] }, { id: "2", name: "Lee", searchKeys: [] }];
    expect(filterMentions(list, "lee").map((c) => c.id)).toEqual(["2", "1"]);
  });
  test("roster rows become candidates (registered, enabled, no description)", () => {
    const row = (title: string, extra: Record<string, unknown> = {}) => ({ promptKey: title, kind: "lore", title, registered: true, workspaceEnabled: true, recognitionKeys: ["k"], ...extra }) as never;
    const list = mentionCandidates([row("한서연 (Han Seo-yeon)"), row("Off", { workspaceEnabled: false }), row("Desc", { kind: "description" })], "Academy");
    expect(list).toEqual([{ id: "한서연 (Han Seo-yeon)", name: "한서연", ownerName: "Academy", searchKeys: ["한서연 (Han Seo-yeon)", "k"] }]);
    expect(rosterDisplayName("Ms. Park (homeroom teacher)")).toBe("Ms. Park");
  });
});

function state(id: string, slots: Array<{ slot: string; entries: string[]; selected?: string }>, revisions = ["r1"]): ChatMessageUiState {
  return {
    chatId: "c",
    messageId: id,
    swipeIndex: 0,
    messageKey: `illustration:${id}@0`,
    eligible: true,
    attempt: "reroll",
    planStatus: "complete",
    busy: false,
    revisions: revisions.map((r, i) => ({ revisionId: r, index: i + 1, status: "complete", entryCount: 1, deletedSlotIndices: [], createdAt: i })),
    activeRevisionId: revisions[revisions.length - 1]!,
    slots: slots.map((s, i) => ({
      slotId: s.slot,
      slotIndex: i,
      entries: s.entries.map((e) => ({ entryId: e, kind: "generated", assetName: `${e}.__am__.chat.x`, imageId: e, url: `u/${e}`, width: 832, height: 1216, createdAt: 0 })),
      selectedEntryId: s.selected ?? s.entries[s.entries.length - 1]!,
      canRegenerate: true,
      regenerating: false
    })),
    allSlotsDeleted: false
  };
}

describe("chat image groups", () => {
  const groups = buildImageGroups([
    state("m1", [{ slot: "s1", entries: ["e1", "e2"], selected: "e1" }, { slot: "s2", entries: ["e3"] }], ["r1", "r2"]),
    state("m2", []),
    state("m3", [{ slot: "s3", entries: ["e4"] }])
  ]);
  test("one group per message with images, selected entries, revision position", () => {
    expect(groups.map((g) => g.messageId)).toEqual(["m1", "m3"]);
    expect(groups[0]!.items.map((i) => i.entryId)).toEqual(["e1", "e3"]);
    expect(groups[0]!.revisionPosition).toBe(1);
    expect(groups[1]!.ordinal).toBe(2);
  });
  test("stepping wraps around", () => {
    const items = flattenItems(groups);
    expect(stepItem(items, "s3", 1)?.slotId).toBe("s1");
    expect(stepItem(items, "s1", -1)?.slotId).toBe("s3");
    expect(stepItem(items.slice(0, 1), "s1", 1)).toBeNull();
    expect(stepId(["a", "b", "c"], "a", -1)).toBe("c");
    expect(stepId(["a"], "a", 1)).toBeNull();
  });
});

describe("coordinate board geometry", () => {
  test("object-contain rect", () => {
    expect(containRect(1000, 1000, 500, 1000)).toEqual({ left: 250, top: 0, width: 500, height: 1000 });
    expect(containRect(0, 10, 1, 1)).toBeNull();
  });
  test("snap to 0.01 and clamp to 0.05..0.95", () => {
    expect(clampCoordinate(0.333)).toBe(0.33);
    expect(clampCoordinate(0)).toBe(0.05);
    expect(clampCoordinate(1.2)).toBe(0.95);
    expect(pointToCenter({ width: 200, height: 100 }, 50, 50)).toEqual({ x: 0.25, y: 0.5 });
  });
  test("removal below the image edge, AI choice zone above the stage bottom", () => {
    expect(isRemovalPoint({ height: 100 }, 99)).toBe(false);
    expect(isRemovalPoint({ height: 100 }, 100)).toBe(true);
    expect(aiChoiceZoneTop({ left: 0, top: 0, width: 100, height: 800 }, 800)).toBe(736);
    expect(aiChoiceZoneTop({ left: 0, top: 100, width: 100, height: 400 }, 800)).toBe(400);
  });
  test("markers and centers from prompt sections", () => {
    const markers = markersFromSections([
      { id: "main", target: "main", label: "", value: "", negativeValue: "" },
      { id: "actor:0", target: "actor", actorIndex: 0, label: "A", value: "", negativeValue: "", centerX: 0.3, centerY: 0.5 },
      { id: "actor:1", target: "actor", actorIndex: 1, label: "B", value: "", negativeValue: "" }
    ]);
    expect(markers.map((m) => [m.ordinal, m.center])).toEqual([[1, { x: 0.3, y: 0.5 }], [2, null]]);
    expect(centersOf(markers)).toEqual([{ x: 0.3, y: 0.5 }, null]);
  });
  test("download file name", () => {
    expect(downloadName("scene.__am__.chat.123", "/api/v1/image-gen/results/x")).toBe("scene.png");
    expect(downloadName("a/b", "data:image/svg+xml;utf8,x")).toBe("a_b.svg");
  });
});

describe("viewer components (DOM, dev mock)", () => {
  // Private desktop-size happy-dom window; preact/hooks schedules effects with requestAnimationFrame, so pin a complete pair.
  const win = new Window({ url: "http://localhost/", width: 1440, height: 900 });
  const doc = win.document as unknown as Document;
  const frames = globalThis as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
  const savedFrames = { request: frames.requestAnimationFrame, cancel: frames.cancelAnimationFrame };
  beforeAll(() => {
    frames.requestAnimationFrame = (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0);
    frames.cancelAnimationFrame = (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle);
  });
  afterAll(() => {
    frames.requestAnimationFrame = savedFrames.request;
    frames.cancelAnimationFrame = savedFrames.cancel;
    win.happyDOM.abort();
  });
  const roots: HTMLElement[] = [];
  const viewers: ZoomViewer[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) render(null, root);
    for (const viewer of viewers.splice(0)) viewer.destroy();
    doc.body.replaceChildren();
  });

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  async function until<T>(read: () => T | null | undefined | false): Promise<T> {
    const started = Date.now();
    for (;;) {
      const value = read();
      if (value) return value;
      if (Date.now() - started > 3000) throw new Error("until: timed out");
      await sleep(5);
    }
  }
  function mount(node: ComponentChild): HTMLElement {
    const root = doc.createElement("div");
    doc.body.appendChild(root);
    roots.push(root);
    render(node, root);
    return root;
  }
  async function mockApp() {
    const mock = createFullMockBackend({ timeScale: 0, latencyMs: 0 });
    const app = new AppController(new RpcClient(mock.transport));
    await app.init();
    const handlers = mock.handlers as Record<string, (params: never, ctx: never) => unknown>;
    const fail = (method: string) => {
      handlers[method] = () => { throw new MockRpcError("internal", "host load failed"); };
    };
    /** Holds every `method` call until `release()`, then fails it. */
    const hold = (method: string) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const held = { calls: 0, release };
      handlers[method] = async () => {
        held.calls += 1;
        await gate;
        throw new MockRpcError("busy", "held request failed");
      };
      return held;
    };
    return { mock, app, fail, hold };
  }

  const TARGET: ZoomTarget = { chatId: "chat-1", slotId: "illustration:msg-2@0:slot:0", messageKey: "illustration:msg-2@0" };
  function openViewer(app: AppController): ZoomViewer {
    // No host DOM API: the viewer falls back to doc.createElement for its root.
    const viewer = createZoomViewer({} as SpindleFrontendContext, app, { doc });
    viewers.push(viewer);
    viewer.open(TARGET);
    return viewer;
  }
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => doc.querySelector<T>(selector);
  const enabled = <T extends HTMLButtonElement | HTMLTextAreaElement = HTMLButtonElement>(selector: string) => {
    const element = q<T>(selector);
    return element && !element.disabled ? element : null;
  };
  /** A real keydown that reaches the viewer's capture listener on window; true when the viewer handled it. */
  function pressEscape(target: Element): boolean {
    const event = new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as KeyboardEvent;
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  test("the stage shows a loading status, not an error, while its url is pending", async () => {
    const props = { url: "", alt: "", width: 832, height: 1216, canStep: false, onStep: () => undefined };
    const root = mount(h(Stage, { ...props, pending: true }));
    await sleep(20);
    expect({ status: !!root.querySelector('[role="status"]'), error: root.textContent?.includes(ZOOM_LABELS.cannotLoad) }).toEqual({ status: true, error: false });
    render(h(Stage, { ...props, pending: false }), root);
    await until(() => root.textContent?.includes(ZOOM_LABELS.cannotLoad));
  });

  test("the viewer's stage is loading until its first details answer, and an error only once they fail", async () => {
    const { app, hold } = await mockApp();
    const details = hold("zoom.getDetails");
    openViewer(app);
    const stage = await until(() => details.calls === 1 && q("[data-ii-zoom-stage]"));
    await sleep(50);
    expect({ status: !!stage.querySelector('[role="status"]'), error: stage.textContent?.includes(ZOOM_LABELS.cannotLoad) }).toEqual({ status: true, error: false });
    details.release();
    await until(() => stage.textContent?.includes(ZOOM_LABELS.cannotLoad));
    expect(stage.querySelector('[role="status"]')).toBeNull();
  });

  test("stepping the revision keeps the chat image list when reloading it fails", async () => {
    const { mock, app, fail } = await mockApp();
    let session!: ZoomSession;
    function Harness() {
      session = useZoomSession(app, TARGET, () => undefined, doc);
      return null;
    }
    mount(h(Harness, null));
    await until(() => session.details && session.groups.length === 2);
    fail("chatDom.getMessageStates");
    await session.stepRevision(session.groups[0]!, -1);
    await sleep(50);
    expect(mock.calls.some((c) => c.method === "history.selectRevision")).toBe(true);
    expect(session.groups.map((g) => g.messageKey)).toEqual(["illustration:msg-2@0", "illustration:msg-5@0"]);
  });

  test("a successful chat state clear drops an earlier error", async () => {
    const { app, fail } = await mockApp();
    const root = mount(h(ConfirmProvider, null, h(ChatStatePanel, { app, chatId: "chat-1" })));
    await until(() => root.querySelector("[data-ii-zoom-state-tag]"));
    fail("chatState.get");
    root.querySelector<HTMLButtonElement>(`button[aria-label="${ZOOM_LABELS.refreshState}"]`)!.click();
    await until(() => root.querySelector('[role="alert"]'));
    [...root.querySelectorAll<HTMLButtonElement>("footer button")].find((b) => b.textContent?.includes(ZOOM_LABELS.clearAll))!.click();
    const dialog = await until(() => root.querySelector('[role="alertdialog"]'));
    [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes(ZOOM_LABELS.clearAll))!.click();
    await until(() => root.textContent?.includes(ZOOM_LABELS.stateEmpty));
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  test("Escape while an AI edit runs keeps the panel's layer: after the failure, Escape closes the panel, not the viewer", async () => {
    const { app, hold } = await mockApp();
    const viewer = openViewer(app);
    await until(() => enabled("[data-ii-zoom-delete-slot]"));
    if (!q("[data-ii-zoom-info]")) q("[data-ii-zoom-info-toggle]")!.click();
    (await until(() => enabled("[data-ii-zoom-ai-toggle]"))).click();
    const area = await until(() => q<HTMLTextAreaElement>("[data-ii-zoom-ai-instruction]"));
    const edit = hold("zoom.requestAiPromptEdit");
    area.value = "make the sky red";
    area.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);
    (await until(() => enabled(`[data-ii-zoom-ai-panel] button[aria-label="${AI_EDIT_LABELS.submit}"]`))).click();
    await until(() => edit.calls === 1 && q<HTMLTextAreaElement>("[data-ii-zoom-ai-instruction]")?.disabled);

    expect(pressEscape(q("[data-ii-zoom-ai-panel]")!)).toBe(true);
    edit.release();
    await until(() => enabled<HTMLTextAreaElement>("[data-ii-zoom-ai-instruction]"));
    expect({ viewer: viewer.isOpen(), panel: !!q("[data-ii-zoom-ai-panel]") }).toEqual({ viewer: true, panel: true });
    pressEscape(q("[data-ii-zoom-ai-panel]")!);
    await sleep(20);
    expect({ viewer: viewer.isOpen(), panel: !!q("[data-ii-zoom-ai-panel]") }).toEqual({ viewer: true, panel: false });
  });

  test("Escape while a slot delete runs keeps the dialog's layer: after the failure, Escape closes the dialog, not the viewer", async () => {
    const { app, hold } = await mockApp();
    const viewer = openViewer(app);
    (await until(() => enabled("[data-ii-zoom-delete-slot]"))).click();
    const confirm = await until(() => q<HTMLButtonElement>("[data-ii-zoom-slot-confirm]"));
    const del = hold("history.deleteSlot");
    confirm.click();
    await until(() => del.calls === 1 && q("[data-ii-zoom-slot-confirm]")?.textContent?.includes(ZOOM_LABELS.deleting));

    expect(pressEscape(q("[data-ii-zoom-slot-confirm]")!)).toBe(true);
    del.release();
    await until(() => enabled("[data-ii-zoom-slot-confirm]"));
    expect({ viewer: viewer.isOpen(), dialog: !!q("[data-ii-zoom-slot-confirm]") }).toEqual({ viewer: true, dialog: true });
    pressEscape(q("[data-ii-zoom-slot-confirm]")!);
    await sleep(20);
    expect({ viewer: viewer.isOpen(), dialog: !!q("[data-ii-zoom-slot-confirm]") }).toEqual({ viewer: true, dialog: false });
  });
});
