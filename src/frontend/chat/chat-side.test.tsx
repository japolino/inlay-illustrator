import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { RpcClient } from "../rpc/client.js";
import { AppController } from "../state/app-state.js";
import { createFakeSpindleContext } from "../dev/fake-context.js";
import { createFullMockBackend } from "../dev/mock/index.js";
import { mockChat } from "../dev/mock/chat.js";
import { renderChatFixture } from "../dev/chat-fixture.js";
import { createChatSide, type ChatSideController, type ChatSideOptions } from "./controller.js";
import { runtimeCornerPreference } from "./corner.js";
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
function rig(extra: Partial<ChatSideOptions> = {}): Rig {
  doc.body.innerHTML = '<div id="ii-preview-chat"></div>';
  const mock = createFullMockBackend({ latencyMs: 0, timeScale: 0 });
  const fake = createFakeSpindleContext(doc, mock);
  const app = new AppController(new RpcClient(mock.transport, { clientId: "test" }));
  const fixture = renderChatFixture(doc, mock);
  const opened: Rig["opened"] = [];
  const zoom = createZoomViewer(fake.ctx, app, { doc });
  const chat = createChatSide(fake.ctx, app, { doc, debounceMs: 0, getActiveChatId: () => "chat-1", openZoom: (target) => { opened.push(target); zoom.open(target); }, ...extra });
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

  test("animate: the first click rigs and plays the image, the next one stops it, a failed rig says why", async () => {
    const attached: Array<{ canvas: HTMLCanvasElement; destroyed: boolean }> = [];
    const renderer = {
      available: true,
      reducedMotion: false,
      playing: 0,
      attach(target: { canvas: HTMLCanvasElement }) {
        const entry = { canvas: target.canvas, destroyed: false };
        attached.push(entry);
        return { destroy: () => void (entry.destroyed = true) };
      },
      destroy() {},
    };
    const r = rig({ createPuppetRenderer: () => renderer } as Partial<ChatSideOptions>);
    const blocks = await until(() => doc.querySelectorAll('[data-message-id="msg-2"] [data-inlay-illustrator="true"]').length === 2 && [...doc.querySelectorAll('[data-message-id="msg-2"] [data-inlay-illustrator="true"]')]);
    const imageIds = blocks.map((b) => b.getAttribute("data-inlay-illustrator-image-id")!);
    const animate = (i: number) => blocks[i]!.querySelector<HTMLElement>(".ii-am-chat-edge__animate");
    await until(() => animate(0)?.getAttribute("data-ii-puppet") === "off");
    expect(animate(0)!.getAttribute("aria-label")).toBe("Animate image");
    expect(calls(r, "puppet.get").flatMap((c) => (c.params as { imageIds: string[] }).imageIds)).toEqual(expect.arrayContaining(imageIds));

    animate(0)!.click();
    await until(() => animate(0)?.getAttribute("data-ii-puppet") === "playing");
    expect(calls(r, "puppet.rig").map((c) => c.params)).toEqual([{ imageId: imageIds[0] }]);
    expect(animate(0)!.getAttribute("aria-pressed")).toBe("true");
    expect(animate(0)!.getAttribute("aria-label")).toBe("Stop animation");
    // A canvas layer over that image only, handed to the shared renderer.
    const canvas = await until(() => blocks[0]!.querySelector<HTMLCanvasElement>(".inlay-illustrator-frame canvas.ii-am-puppet-canvas"));
    expect(blocks[1]!.querySelector("canvas.ii-am-puppet-canvas")).toBeNull();
    expect(attached.map((a) => a.canvas)).toEqual([canvas]);

    animate(0)!.click();
    await until(() => animate(0)?.getAttribute("data-ii-puppet") === "off");
    expect(calls(r, "puppet.setEnabled").at(-1)!.params).toEqual({ imageId: imageIds[0], enabled: false });
    await until(() => !blocks[0]!.querySelector("canvas.ii-am-puppet-canvas"));
    expect(attached[0]!.destroyed).toBe(true);
    // Turning it back on reuses the stored rig.
    animate(0)!.click();
    await until(() => animate(0)?.getAttribute("data-ii-puppet") === "playing");
    expect(calls(r, "puppet.rig")).toHaveLength(1);

    r.mock.db.extra.puppetFail = { [imageIds[1]!]: "comic" };
    animate(1)!.click();
    await until(() => animate(1)?.getAttribute("data-ii-puppet") === "failed");
    expect(animate(1)!.getAttribute("title")).toBe("Comic pages with several panels can't be animated. Click to try again.");
    await until(() => doc.body.textContent?.includes("This image can't be animated"));
    expect(blocks[1]!.querySelector("canvas.ii-am-puppet-canvas")).toBeNull();
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

  test("the runtime host follows the corner preference live (saved under the old floating-button key)", async () => {
    const saved = new Map([["inlay-illustrator:fab-corner", "top-left"]]);
    const corner = runtimeCornerPreference({ getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => void saved.set(key, value) });
    rig({ corner });
    const host = q(".ii-am-chat-runtime-host")!;
    expect(host.getAttribute("data-ii-corner")).toBe("top-left");
    corner.set("bottom-left");
    expect(host.getAttribute("data-ii-corner")).toBe("bottom-left");
    expect(saved.get("inlay-illustrator:fab-corner")).toBe("bottom-left");
  });

  test("count panel generate button runs the latest-message action and waits for the chat's jobs", async () => {
    let started = 0;
    const r = rig({ generateLatest: async () => void (started += 1) });
    await r.app.init();
    (await until(() => q(".ii-am-chat-count__toggle"))).click();
    const button = await until(() => q('.ii-am-chat-count__generate[aria-label="Generate images for the latest message"]') as HTMLButtonElement | null);
    button.click();
    expect(started).toBe(1);
    r.mock.emit("generation.progress", { jobId: "job-g", chatId: "chat-1", messageKey: "illustration:msg-4@0", attemptKind: "initial", status: "running", phase: "generating", progress: { label: "Image 1/2" }, requestedCount: 2, completedSlots: 0, failedSlots: 0, canRetry: false, canRestart: false });
    await until(() => (q(".ii-am-chat-count__generate") as HTMLButtonElement | null)?.disabled);
  });

  test("after a resync every shown message state is read again", async () => {
    const r = rig();
    await r.app.init();
    await until(() => q('[data-message-id="msg-2"] .ii-am-chat-footer'));
    const before = calls(r, "chatDom.getMessageStates").length;
    await r.app.resync();
    const call = await until(() => calls(r, "chatDom.getMessageStates").slice(before)[0]);
    expect((call.params as { messageIds: string[] }).messageIds).toEqual(expect.arrayContaining(["msg-2", "msg-4", "msg-5"]));
  });

  test("a slot regeneration that ended while disconnected stops spinning after a resync", async () => {
    const r = rig();
    await r.app.init();
    const chat = mockChat(r.mock.db);
    chat.holdJobs = true;
    const edge = '.ii-am-chat-edge[data-ii-slot-id="illustration:msg-2@0:slot:0"]';
    (await until(() => q(`${edge} [data-ii-action="regenerate"]`))).click();
    const job = await until(() => Object.values(chat.jobs).find((j) => r.app.state.generationJobs[j.snapshot.jobId]?.status === "running"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(q(edge)?.getAttribute("data-ii-busy")).toBe("true");
    // The job ends without its generation.finished reaching the page (lost while the socket was down).
    job.snapshot.status = "success";
    await r.app.resync();
    await until(() => q(`${edge}[data-ii-busy="false"] [data-ii-action="regenerate"]`));
    chat.holdJobs = false;
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

  test("retry errors: error details, previous errors and copy error log (AM 0.9.89.5)", async () => {
    const r = rig();
    await until(() => q(".ii-am-chat-footer"));
    const retryErrors = [
      { attempt: 1, stage: "이미지 생성", occurredAt: 1, message: "HTTP 429" },
      { attempt: 2, stage: "이미지 생성", occurredAt: 2, message: "HTTP 500" }
    ];
    r.mock.emit("generation.progress", { jobId: "job-r", chatId: "chat-1", messageKey: "illustration:msg-4@0", attemptKind: "initial", status: "running", phase: "generating", progress: { label: "Image 1/2", retry: { attempt: 2, total: 5 } }, requestedCount: 2, completedSlots: 0, failedSlots: 0, canRetry: false, canRestart: false, retryErrors });
    const toast = '[data-ii-toast-key="generation:job-r"]';
    (await until(() => q(`${toast} .ii-am-chat-toast__error-toggle`))).click();
    const details = await until(() => q(`${toast} .ii-am-chat-toast__error-details`));
    expect(details.querySelector("p")?.textContent).toBe("Image 1\nImage generation · Request attempt 2 failed\nHTTP 500");
    const history = details.querySelector('[data-ii-toast-action="history"]') as HTMLElement;
    expect(history.textContent).toBe("Show previous errors (1)");
    history.click();
    await until(() => q(`${toast} .ii-am-chat-toast__previous-errors p`));
    expect(q(`${toast} .ii-am-chat-toast__previous-errors p`)!.textContent).toBe("Image 1\nImage generation · Request attempt 1 failed\nHTTP 429");

    const nav = win.navigator as unknown as { clipboard?: unknown };
    const saved = Object.getOwnPropertyDescriptor(nav, "clipboard");
    const copied: string[] = [];
    let fail = false;
    Object.defineProperty(nav, "clipboard", { configurable: true, value: { writeText: async (text: string) => { if (fail) throw new Error("denied"); copied.push(text); } } });
    const execCommand = doc.execCommand;
    doc.execCommand = () => false;
    try {
      q(`${toast} [data-ii-toast-action="copy-error"]`)!.click();
      await until(() => q(`${toast} .ii-am-chat-toast__copy-status`)?.textContent === "Copied");
      expect(copied).toEqual(["Image 1\nImage generation · Request attempt 2 failed\nHTTP 500\n\nImage 1\nImage generation · Request attempt 1 failed\nHTTP 429"]);
      fail = true;
      q(`${toast} [data-ii-toast-action="copy-error"]`)!.click();
      await until(() => q(`${toast} .ii-am-chat-toast__copy-status`)?.textContent === "Copy failed · Select the error text manually.");
    } finally {
      doc.execCommand = execCommand;
      if (saved) Object.defineProperty(nav, "clipboard", saved);
      else delete nav.clipboard;
    }
    // A running toast closes its details instead of dismissing itself.
    q(`${toast} [data-ii-toast-action="details"]`)!.click();
    await until(() => !q(`${toast} .ii-am-chat-toast__error-details`));
    expect(q(toast)).not.toBeNull();
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
    expect(sections.find((s) => s.id === "main")?.value).toBe("1girl, rooftop");
    await until(() => !q("[data-ii-zoom-save-prompts]"));
    (await until(() => { const b = q("[data-ii-zoom-delete-slot]"); return b && !b.hasAttribute("disabled") && b; })).click();
    (await until(() => q("[data-ii-zoom-slot-confirm]"))).click();
    await until(() => calls(r, "history.deleteSlot").length === 1);
    await until(() => calls(r, "zoom.getDetails").some((c) => (c.params as { slotId: string }).slotId === "illustration:msg-2@0:slot:1"));
  });

  test("zoom outfit and artist selects save the regeneration draft", async () => {
    const r = rig();
    await r.app.init();
    await openZoom(r);
    q("[data-ii-zoom-info-toggle]")!.click();
    const outfit = await until(() => q("[data-ii-zoom-outfit-select] button"));
    const actorKey = outfit.parentElement!.getAttribute("data-ii-zoom-outfit-select")!;
    expect(outfit.textContent).toContain("Default outfit");
    outfit.click();
    const option = await until(() => [...doc.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes("Casual")) as HTMLElement | undefined);
    option.click();
    await until(() => calls(r, "zoom.saveDraft").length === 1);
    const overrides = (calls(r, "zoom.saveDraft")[0]!.params as { overrides: { outfitByActor: Record<string, string> } }).overrides;
    expect(overrides.outfitByActor[actorKey]).toBe("outfit_casual");
    expect(Object.keys(overrides.outfitByActor).length).toBeGreaterThan(1);
    const artist = await until(() => { const b = q("[data-ii-zoom-artist-select] button"); return b && !b.hasAttribute("disabled") && b; });
    artist.click();
    (await until(() => [...doc.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes("Clean lineart")) as HTMLElement | undefined)).click();
    await until(() => calls(r, "zoom.saveDraft").length === 2);
    expect((calls(r, "zoom.saveDraft")[1]!.params as { overrides: { artistId: string } }).overrides).toEqual({ artistId: "preset-2" });
    await until(() => q("[data-ii-zoom-artist-select] button")?.textContent?.includes("Clean lineart"));
  });

  test("chat state window: deselect a tag and save through chatState.set", async () => {
    const r = rig();
    await r.app.init();
    await openZoom(r);
    q("[data-ii-zoom-state-toggle]")!.click();
    const chip = await until(() => q('[data-ii-zoom-state-tag="cum_on_hair"]'));
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(q("[data-ii-zoom-state-save]")!.hasAttribute("disabled")).toBe(true);
    chip.click();
    await until(() => q('[data-ii-zoom-state-tag="cum_on_hair"][aria-pressed="false"]'));
    (await until(() => { const b = q("[data-ii-zoom-state-save]"); return b && !b.hasAttribute("disabled") && b; })).click();
    await until(() => calls(r, "chatState.set").length === 1);
    const params = calls(r, "chatState.set")[0]!.params as { baseRevision: number; actorState: { actors: Record<string, { groups: Record<string, string[]>; ttl: Record<string, number> }> } };
    expect(params.baseRevision).toBe(3);
    expect(params.actorState.actors.mina!.groups["state.fluid.cum.location"]).toEqual([]);
    expect(params.actorState.actors.mina!.ttl).toEqual({});
    expect(params.actorState.actors.seoyeon!.groups["actor.injury"]).toEqual(["bandage_on_arm", "scraped_knee"]);
    await until(() => !q('[data-ii-zoom-state-tag="cum_on_hair"]'));
    expect(mockChat(r.mock.db).actorState.revision).toBe(4);
  });

  test("a slot removed elsewhere moves the viewer to another image (no polling of a dead slot)", async () => {
    const r = rig();
    await r.app.init();
    await openZoom(r);
    const chat = mockChat(r.mock.db);
    chat.messages = chat.messages.filter((m) => m.messageId !== "msg-2");
    r.mock.emit("chatData.changed", { chatId: chat.chatId, messageKeys: [] });
    await until(() => calls(r, "zoom.getDetails").some((c) => !(c.params as { slotId: string }).slotId.includes("msg-2")));
    const before = calls(r, "zoom.getDetails").filter((c) => (c.params as { slotId: string }).slotId.includes("msg-2")).length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls(r, "zoom.getDetails").filter((c) => (c.params as { slotId: string }).slotId.includes("msg-2")).length).toBe(before);
    expect(r.zoom.isOpen()).toBe(true);
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
