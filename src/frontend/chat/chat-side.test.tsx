import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { RpcClient } from "../rpc/client.js";
import { AppController } from "../state/app-state.js";
import { createFakeSpindleContext } from "../dev/fake-context.js";
import { createFullMockBackend } from "../dev/mock/index.js";
import { mockChat } from "../dev/mock/chat.js";
import { renderChatFixture } from "../dev/chat-fixture.js";
import { createChatSide, type ChatSideController } from "./controller.js";
import { createZoomViewer, type ZoomViewer } from "../zoom/index.js";

// Private happy-dom window (other test files install DOM fakes on globalThis).
const win = new Window({ url: "http://localhost/", width: 1440, height: 900 });
const doc = win.document as unknown as Document;

const frameGlobals = globalThis as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
const savedFrames = { request: frameGlobals.requestAnimationFrame, cancel: frameGlobals.cancelAnimationFrame };
beforeAll(() => {
  frameGlobals.requestAnimationFrame = (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0);
  frameGlobals.cancelAnimationFrame = (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle);
});
afterAll(() => {
  frameGlobals.requestAnimationFrame = savedFrames.request;
  frameGlobals.cancelAnimationFrame = savedFrames.cancel;
  win.happyDOM.abort();
});

async function until<T>(read: () => T | null | undefined | false, timeoutMs = 3000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error("until: timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

interface Rig { mock: ReturnType<typeof createFullMockBackend>; app: AppController; chat: ChatSideController; zoom: ZoomViewer; opened: Array<{ slotId: string; entryId?: string }>; destroy(): void }

const rigs: Rig[] = [];
function rig(): Rig {
  doc.body.innerHTML = '<div id="ii-preview-chat"></div>';
  const mock = createFullMockBackend({ latencyMs: 0, timeScale: 0 });
  const fake = createFakeSpindleContext(doc, mock);
  const app = new AppController(new RpcClient(mock.transport, { clientId: "test" }));
  const fixture = renderChatFixture(doc, mock);
  const opened: Rig["opened"] = [];
  const zoom = createZoomViewer(fake.ctx, app, { doc });
  const chat = createChatSide(fake.ctx, app, { doc, debounceMs: 0, getActiveChatId: () => "chat-1", openZoom: (target) => { opened.push(target); zoom.open(target); } });
  const r: Rig = { mock, app, chat, zoom, opened, destroy: () => { chat.destroy(); zoom.destroy(); app.destroy(); fixture.destroy(); } };
  rigs.push(r);
  return r;
}
afterEach(() => {
  for (const r of rigs.splice(0)) r.destroy();
  doc.body.innerHTML = "";
});

const q = (selector: string) => doc.querySelector(selector) as HTMLElement | null;
const calls = (r: Rig, method: string) => r.mock.calls.filter((c) => c.method === method);

describe("chat side (DOM, dev mock)", () => {
  test("injects footers for eligible messages and edge controls over baked images", async () => {
    const r = rig();
    await until(() => q('[data-message-id="msg-2"] .ii-am-chat-footer'));
    expect(q('[data-message-id="msg-1"] .ii-am-chat-footer')).toBeNull();
    expect(q('[data-message-id="msg-4"] .ii-am-chat-footer__generate')?.getAttribute("data-ii-attempt")).toBe("initial");
    expect(q('[data-message-id="msg-5"] .ii-am-chat-footer__generate')?.getAttribute("data-ii-attempt")).toBe("retry");
    const footer = q('[data-message-id="msg-2"] .ii-am-chat-footer')!;
    expect(footer.querySelector(".ii-am-chat-footer__revision-count")?.textContent).toBe("2/2");
    // Footers live in the host's message_footer mount, inside our own wrapper.
    expect(footer.closest('[data-spindle-mount="message_footer"]')).not.toBeNull();
    const edges = await until(() => doc.querySelectorAll('[data-message-id="msg-2"] .ii-am-chat-edge').length === 2 && doc.querySelectorAll('[data-message-id="msg-2"] .ii-am-chat-edge'));
    expect(edges[0]!.querySelector(".ii-am-chat-edge__count")?.textContent).toBe("2/3");
    expect(edges[1]!.querySelector(".ii-am-chat-edge__count")).toBeNull();
    expect(edges[1]!.querySelector(".ii-am-chat-edge__regenerate")).not.toBeNull();
    // Edge controls sit inside the baked frame (positioned overlay).
    expect(edges[0]!.closest(".inlay-illustrator-frame")).not.toBeNull();
    void r;
  });

  test("footer generate starts a job, shows busy, and the new revision arrives", async () => {
    const r = rig();
    const button = await until(() => q('[data-message-id="msg-4"] .ii-am-chat-footer__generate'));
    button.click();
    await until(() => calls(r, "generation.start").length === 1);
    expect(calls(r, "generation.start")[0]!.params).toMatchObject({ chatId: "chat-1", messageId: "msg-4", swipeIndex: 0, attemptKind: "initial" });
    await until(() => q('[data-message-id="msg-4"] .ii-am-chat-edge'));
    expect(mockChat(r.mock.db).messages.find((m) => m.messageId === "msg-4")!.revisions.length).toBe(1);
    await until(() => q('[data-message-id="msg-4"] .ii-am-chat-footer__generate')?.getAttribute("data-ii-attempt") === "reroll");
  });

  test("revision pager and history pager call the history RPCs", async () => {
    const r = rig();
    const previous = await until(() => q('[data-message-id="msg-2"] [data-ii-action="revision-previous"]'));
    previous.click();
    await until(() => calls(r, "history.selectRevision").length === 1);
    expect(calls(r, "history.selectRevision")[0]!.params).toMatchObject({ messageKey: "illustration:msg-2@0", revisionId: "rev-2a" });
    // Back to the newest revision for the history pager.
    await until(() => q('[data-message-id="msg-2"] .ii-am-chat-footer__revision-count')?.textContent === "1/2");
    q('[data-message-id="msg-2"] [data-ii-action="revision-next"]')!.click();
    const next = await until(() => q('[data-message-id="msg-2"] [data-ii-action="history-next"]'));
    next.click();
    await until(() => calls(r, "history.selectEntry").length === 1);
    expect(calls(r, "history.selectEntry")[0]!.params).toMatchObject({ slotId: "illustration:msg-2@0:slot:0", entryId: "entry-5" });
    await until(() => q('[data-message-id="msg-2"] .ii-am-chat-edge__count')?.textContent === "3/3");
  });

  test("regenerate calls generation.regenerateSlot and shows the spinner", async () => {
    const r = rig();
    mockChat(r.mock.db).holdJobs = true;
    const button = await until(() => q('[data-message-id="msg-2"] [data-ii-action="regenerate"]'));
    button.click();
    await until(() => calls(r, "generation.regenerateSlot").length === 1);
    expect(calls(r, "generation.regenerateSlot")[0]!.params).toMatchObject({ chatId: "chat-1", slotId: "illustration:msg-2@0:slot:0", entryId: "entry-4" });
    await until(() => q('.ii-am-chat-edge[data-ii-busy="true"] .ii-am-chat-edge__loading'));
    await until(() => q(".ii-am-chat-toast"));
    mockChat(r.mock.db).holdJobs = false;
  });

  test("clicking a baked image opens the zoom viewer", async () => {
    const r = rig();
    const image = await until(() => q('[data-message-id="msg-2"] [data-inlay-illustrator="true"] img'));
    image.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }) as unknown as Event);
    expect(r.opened).toEqual([{ chatId: "chat-1", slotId: "illustration:msg-2@0:slot:0", entryId: "entry-4", messageKey: "illustration:msg-2@0" } as never]);
    expect(r.zoom.isOpen()).toBe(true);
    await until(() => q("[data-ii-zoom-stage] img"));
    await until(() => q('[data-ii-zoom-history-entry="entry-4"][aria-pressed="true"]'));
    await until(() => doc.querySelectorAll("[data-ii-zoom-chat-image]").length >= 3);
    // ArrowRight steps to the next chat image.
    win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await until(() => calls(r, "zoom.getDetails").some((c) => (c.params as { slotId: string }).slotId === "illustration:msg-2@0:slot:1"));
    // Escape closes the viewer.
    (q(".ii-am-zoom") as HTMLElement).dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event);
    expect(r.zoom.isOpen()).toBe(false);
  });

  test("count panel toggles and saves chat image settings", async () => {
    const r = rig();
    await r.app.init();
    const toggle = await until(() => q(".ii-am-chat-count__toggle"));
    toggle.click();
    await until(() => q('.ii-am-chat-count[data-ii-expanded="true"]'));
    q('[aria-label="Increase generation count"]')!.click();
    await until(() => calls(r, "chatImageGeneration.set").length === 1);
    expect((calls(r, "chatImageGeneration.set")[0]!.params as { settings: { countPolicy: { max: number } } }).settings.countPolicy.max).toBe(2);
    await until(() => q(".ii-am-chat-count__toggle")?.textContent?.includes("2"));
  });

  test("backend error events open the runtime error dialog", async () => {
    const r = rig();
    await until(() => q(".ii-am-chat-footer"));
    r.mock.emit("error", { error: { code: "provider-error", message: "HTTP 402", detailCode: "NOVELAI_API_KEY_REQUIRED" } });
    const dialog = await until(() => q(".ii-am-chat-error"));
    expect(dialog.querySelector(".ii-am-chat-error__title")?.textContent).toBe("NovelAI API key required");
    (dialog.querySelector(".ii-am-chat-error__close") as HTMLElement).click();
    await until(() => !q(".ii-am-chat-error"));
  });
});

describe("zoom viewer (DOM, dev mock)", () => {
  async function openZoom(r: Rig) {
    const chat = mockChat(r.mock.db);
    r.zoom.open({ chatId: chat.chatId, slotId: "illustration:msg-2@0:slot:0" });
    await until(() => q('[data-ii-zoom-history-entry="entry-4"][aria-pressed="true"]'));
  }

  test("history selection, seed fix and regenerate", async () => {
    const r = rig();
    await r.app.init();
    await openZoom(r);
    q('[data-ii-zoom-history-entry="entry-3"]')!.click();
    await until(() => q('[data-ii-zoom-history-entry="entry-3"][aria-pressed="true"]'));
    expect(calls(r, "history.selectEntry").at(-1)!.params).toMatchObject({ entryId: "entry-3" });
    const fix = doc.querySelector('[data-ii-zoom-generation-footer="sidebar"] input[type="checkbox"]') as HTMLInputElement;
    fix.checked = true;
    fix.dispatchEvent(new win.Event("change", { bubbles: true }) as unknown as Event);
    await until(() => calls(r, "zoom.saveDraft").length === 1);
    expect((calls(r, "zoom.saveDraft")[0]!.params as { overrides: { seedFixed: boolean } }).overrides.seedFixed).toBe(true);
    await until(() => !q("[data-ii-zoom-regenerate]")?.hasAttribute("disabled"));
    q("[data-ii-zoom-regenerate]")!.click();
    await until(() => calls(r, "generation.regenerateSlot").length === 1);
    expect(calls(r, "generation.regenerateSlot")[0]!.params).toMatchObject({ slotId: "illustration:msg-2@0:slot:0", entryId: "entry-3", overrides: { seedFixed: true } });
  });

  test("prompt edit saves a draft; slot deletion asks first", async () => {
    const r = rig();
    await r.app.init();
    await openZoom(r);
    q("[data-ii-zoom-info-toggle]")!.click();
    (await until(() => q("[data-ii-zoom-edit-prompts]"))).click();
    const area = await until(() => doc.querySelector('[aria-label="Main prompt"]') as HTMLTextAreaElement | null);
    area.value = "1girl, rooftop";
    area.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);
    (await until(() => q("[data-ii-zoom-save-prompts]"))).click();
    await until(() => calls(r, "zoom.saveDraft").length === 1);
    const sections = (calls(r, "zoom.saveDraft")[0]!.params as { overrides: { sections: Array<{ id: string; value: string }> } }).overrides.sections;
    expect(sections.find((s) => s.id === "main-prompt")?.value).toBe("1girl, rooftop");
    await until(() => !q("[data-ii-zoom-save-prompts]"));
    (await until(() => { const b = q("[data-ii-zoom-delete-slot]"); return b && !b.hasAttribute("disabled") && b; })).click();
    (await until(() => q("[data-ii-zoom-slot-confirm]"))).click();
    await until(() => calls(r, "history.deleteSlot").length === 1);
    await until(() => calls(r, "zoom.getDetails").some((c) => (c.params as { slotId: string }).slotId === "illustration:msg-2@0:slot:1"));
  });

  test("AI edit: $ mention list and insertion", async () => {
    const r = rig();
    await r.app.init();
    await openZoom(r);
    q("[data-ii-zoom-info-toggle]")!.click();
    (await until(() => q("[data-ii-zoom-ai-toggle]"))).click();
    const area = await until(() => doc.querySelector("[data-ii-zoom-ai-instruction]") as HTMLTextAreaElement | null);
    area.focus();
    area.value = "make $ㅅ";
    area.setSelectionRange(area.value.length, area.value.length);
    area.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);
    const list = await until(() => q("[data-ii-zoom-mentions]"));
    expect([...list.querySelectorAll('[role="option"]')].map((o) => o.querySelector("span")?.textContent)).toContain("한서연");
    area.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }) as unknown as Event);
    await until(() => area.value === "make 한서연");
  });
});
