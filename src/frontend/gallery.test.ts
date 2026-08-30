
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInlayGallery } from "./gallery.js";

// Minimal DOM mock for gallery

function createFakeElement(tag = "div"): any {
  const el: any = {
    tagName: tag.toUpperCase(),
    className: "",
    textContent: "",
    hidden: false,
    children: [] as any[],
    attributes: new Map<string, string>(),
    style: {} as Record<string, string>,
    disabled: false,
    src: "",
    alt: "",
    loading: "",
    parent: null as any,
    eventListeners: new Map<string, Array<(e: unknown) => void>>(),
    setAttribute(name: string, value: string) { this.attributes.set(name, value); },
    getAttribute(name: string) { return this.attributes.get(name) ?? null; },
    removeAttribute(name: string) { this.attributes.delete(name); },
    hasAttribute(name: string) { return this.attributes.has(name); },
    append(...children: any[]) {
      for (const c of children) {
        if (!c) continue;
        c.parent = this;
        this.children.push(c);
      }
    },
    replaceChildren(...children: any[]) {
      this.children = [];
      for (const c of children) {
        if (c) { c.parent = this; this.children.push(c); }
      }
    },
    querySelectorAll(sel: string) { return []; },
    querySelector(sel: string) { return null; },
    closest(sel: string) {
      if (sel.includes("data-inlay-illustrator") && this.attributes?.get?.("data-inlay-illustrator") === "true") return this;
      // for img wrapper detection, walk up
      let cur: any = this;
      while (cur) {
        if (cur.attributes?.get?.("data-inlay-illustrator") === "true") return cur;
        cur = cur.parent;
      }
      return null;
    },
    addEventListener(type: string, fn: (e: unknown) => void) {
      const arr = this.eventListeners.get(type) ?? [];
      arr.push(fn);
      this.eventListeners.set(type, arr);
    },
    dispatchEvent(type: string, event: unknown) {
      for (const fn of this.eventListeners.get(type) ?? []) fn(event);
    },
    click() {
      for (const fn of this.eventListeners.get("click") ?? []) fn({});
    },
    classList: {
      add(cls: string) { if (!el.className.includes(cls)) el.className += (el.className ? " " : "") + cls; },
      contains(cls: string) { return el.className.split(" ").includes(cls); },
      remove() {}
    },
    // helper find
    findByText(text: string): any | null {
      if (this.textContent === text) return this;
      for (const ch of this.children) {
        const found = ch.findByText?.(text);
        if (found) return found;
      }
      return null;
    },
    findButtons(): any[] {
      const out: any[] = [];
      const walk = (node: any) => {
        if (node.tagName === "BUTTON") out.push(node);
        for (const c of node.children) walk(c);
      };
      walk(this);
      return out;
    },
    findByClass(cls: string): any | null {
      if (this.className.split(" ").includes(cls)) return this;
      for (const ch of this.children) {
        const f = ch.findByClass?.(cls);
        if (f) return f;
      }
      return null;
    },
    replaceChildrenInternal(...children: any[]) { this.replaceChildren(...children); }
  };
  // Make append handle string? Not needed
  el.innerHTML = "";
  Object.defineProperty(el, "innerHTML", {
    get() { return ""; },
    set(_v: string) { this.children = []; }
  });
  return el;
}

let origDoc: unknown;
let origWin: unknown;

function setupDom() {
  origDoc = (globalThis as unknown as { document: unknown }).document;
  origWin = (globalThis as unknown as { window: unknown }).window;
  (globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => createFakeElement(tag)
  } as unknown as Document;
  (globalThis as unknown as { window: unknown }).window = {} as unknown as Window;
}

function teardownDom() {
  if (origDoc !== undefined) (globalThis as unknown as { document: unknown }).document = origDoc as Document; else delete (globalThis as unknown as { document: unknown }).document;
  if (origWin !== undefined) (globalThis as unknown as { window: unknown }).window = origWin as Window; else delete (globalThis as unknown as { window: unknown }).window;
}

function makeCtx(): {
  ctx: any;
  sent: unknown[];
  handlers: Array<(p: unknown) => void>;
  modals: Array<{ root: any; dismiss: () => void; dismissCalls: number; onDismissHandlers: Array<() => void> }>;
  emit: (p: unknown) => void;
} {
  const sent: unknown[] = [];
  const handlers: Array<(p: unknown) => void> = [];
  const modals: Array<{ root: any; dismiss: () => void; dismissCalls: number; onDismissHandlers: Array<() => void> }> = [];
  const ctx: any = {
    sendToBackend: (payload: unknown) => sent.push(payload),
    onBackendMessage: (h: (p: unknown) => void) => {
      handlers.push(h);
      return () => { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); };
    },
    ui: {
      showModal: (_opts: unknown) => {
        const root = createFakeElement("div");
        const modal: any = {
          root,
          dismissCalls: 0,
          onDismissHandlers: [] as Array<() => void>,
          dismiss() { this.dismissCalls += 1; for (const fn of this.onDismissHandlers) fn(); },
          onDismiss(cb: () => void) { this.onDismissHandlers.push(cb); return () => {}; },
          setTitle() {}
        };
        modals.push(modal);
        return modal;
      }
    },
    dom: { addStyle: () => () => {} },
    getActiveChat: () => ({ chatId: "test" })
  };
  return { ctx, sent, handlers, modals, emit: (p: unknown) => handlers.forEach((h) => h(p)) };
}

function chatImage(chatId: string, paragraph: number, opts: Partial<Record<string, unknown>> = {}): unknown {
  return {
    chatId,
    messageId: `msg-${chatId}-${paragraph}`,
    swipeId: 0,
    imageId: `img-${chatId}-${paragraph}`,
    imageUrl: `/api/v1/image-gen/results/img-${chatId}-${paragraph}`,
    imageIndex: opts.imageIndex ?? paragraph - 1,
    paragraph,
    prompt: `prompt ${paragraph}`,
    negativePrompt: `negative ${paragraph}`,
    quote: paragraph === 1 ? `quote ${paragraph}` : "",
    ...opts
  };
}

describe("Inlay gallery frontend", () => {
  beforeEach(() => setupDom());
  afterEach(() => teardownDom());

  test("open modal requests page 1 and renders All + chat nav", () => {
    const { ctx, sent, modals, emit } = makeCtx();
    const gallery = createInlayGallery(ctx as unknown as import("lumiverse-spindle-types").SpindleFrontendContext);
    gallery.open();
    expect(modals.length).toBe(1);
    expect(sent.length).toBe(1);
    const first = sent[0] as Record<string, unknown>;
    expect(first.type).toBe("list_inlay_gallery");
    expect(first.page).toBe(1);
    expect(first.requestId).toBeTruthy();

    // Backend returns 2 chats
    const chats = [
      { chatId: "1", images: [chatImage("1", 1), chatImage("1", 2)] as unknown[] },
      { chatId: "2", images: [chatImage("2", 1)] as unknown[] }
    ];
    emit({
      type: "inlay_gallery_result",
      requestId: first.requestId,
      ok: true,
      page: 1,
      totalChats: 2,
      totalPages: 1,
      chatIds: ["1", "2"],
      chats
    });

    const root = modals[0].root;
    const nav = root.findByClass("inlay-gallery-nav");
    expect(nav).toBeTruthy();
    // The chat filter is a single dropdown (not a huge row of chat tabs).
    const select = nav.querySelector?.("select") || (() => {
      let found: any = null;
      const walk = (n: any) => { if (n.tagName === "SELECT" && !found) found = n; for (const ch of n.children) walk(ch); };
      walk(nav);
      return found;
    })();
    expect(select).toBeTruthy();
    expect(select.tagName).toBe("SELECT");
    // All chats + 2 chat options
    expect(select.children.length).toBe(3);
    expect(select.children[0].textContent).toBe("All chats");
    expect(select.children[1].value).toBe("1");
    expect(select.children[1].textContent).toBe("#1");
    expect(select.children[2].value).toBe("2");

    const headings = root.findByClass("inlay-gallery-content");
    expect(headings).toBeTruthy();
    // Should have headings for chat sections
    // Find headings via class
    const chatHeadings = headings.children.filter((c: any) => c.findByClass?.("inlay-gallery-chat-heading"));
    expect(chatHeadings.length).toBe(2);

    // Badges and quotes
    const badges = root.findByClass("inlay-gallery-grid")?.findByClass?.("inlay-gallery-badge") || null;
    // Instead traverse all cards
    const allCards = (() => {
      const out: any[] = [];
      const walk = (n: any) => {
        if (n.className?.includes?.("inlay-gallery-card")) out.push(n);
        for (const ch of n.children) walk(ch);
      };
      walk(root);
      return out;
    })();
    expect(allCards.length).toBe(3);
    expect(allCards[0].findByClass("inlay-gallery-badge").textContent).toBe("Paragraph: 1");
    // quote present for first image
    expect(allCards[0].findByClass("inlay-gallery-quote")).toBeTruthy();
    expect(allCards[1].findByClass("inlay-gallery-quote")).toBeFalsy();

    // Image attributes - lightbox compatible
    const firstImg = (() => {
      let found: any = null;
      const walk = (n: any) => {
        if (n.tagName === "IMG" && !found) found = n;
        for (const ch of n.children) walk(ch);
      };
      walk(root);
      return found;
    })();
    expect(firstImg).toBeTruthy();
    expect(firstImg.getAttribute("data-inlay-illustrator-chat-id")).toBe("1");
    expect(firstImg.getAttribute("data-inlay-illustrator-message-id")).toBe("msg-1-1");
    expect(firstImg.getAttribute("data-inlay-illustrator-swipe-id")).toBe("0");
    expect(firstImg.getAttribute("data-inlay-illustrator-image-index")).toBe("0");
    expect(firstImg.getAttribute("data-inlay-illustrator-image-id")).toBeTruthy();
    expect(firstImg.getAttribute("data-inlay-illustrator-prompt")).toBeTruthy();
    expect(firstImg.getAttribute("data-inlay-illustrator-negative-prompt")).toBeTruthy();
    expect(firstImg.src).toContain("/api/v1/image-gen/results/");
    // wrapper has data-inlay-illustrator true
    expect(firstImg.parent?.getAttribute?.("data-inlay-illustrator")).toBe("true");

    gallery.destroy();
  });

  test("prev/next page buttons request backend", () => {
    const { ctx, sent, modals, emit } = makeCtx();
    const gallery = createInlayGallery(ctx as unknown as import("lumiverse-spindle-types").SpindleFrontendContext);
    gallery.open();
    const firstId = (sent[0] as Record<string, unknown>).requestId;
    emit({
      type: "inlay_gallery_result",
      requestId: firstId,
      ok: true,
      page: 1,
      totalChats: 7,
      totalPages: 2,
      chatIds: ["1","2","3","4","5","6","7"],
      chats: Array.from({ length: 5 }, (_, i) => ({ chatId: String(i+1), images: [chatImage(String(i+1), 1)] }))
    });
    const root = modals[0].root;
    const pagination = root.findByClass("inlay-gallery-pagination");
    expect(pagination).toBeTruthy();
    const buttons = pagination.findButtons();
    const next = buttons.find((b: any) => b.textContent.includes("Next"));
    expect(next.disabled).toBe(false);
    next.click();
    expect(sent.length).toBe(2);
    expect((sent[1] as Record<string, unknown>).page).toBe(2);
    expect((sent[1] as Record<string, unknown>).type).toBe("list_inlay_gallery");

    // Simulate page 2 response and click prev
    const secondId = (sent[1] as Record<string, unknown>).requestId;
    emit({
      type: "inlay_gallery_result",
      requestId: secondId,
      ok: true,
      page: 2,
      totalChats: 7,
      totalPages: 2,
      chatIds: ["1","2","3","4","5","6","7"],
      chats: [{ chatId: "6", images: [chatImage("6", 1)] }, { chatId: "7", images: [chatImage("7", 1)] }]
    });
    const updatedPagination = root.findByClass("inlay-gallery-pagination");
    const prev = updatedPagination.findButtons().find((b: any) => b.textContent.includes("Prev"));
    expect(prev.disabled).toBe(false);
    prev.click();
    expect(sent.length).toBe(3);
    expect((sent[2] as Record<string, unknown>).page).toBe(1);

    gallery.destroy();
  });

  test("per-chat nav works and All returns current page", () => {
    const { ctx, sent, modals, emit } = makeCtx();
    const gallery = createInlayGallery(ctx as unknown as import("lumiverse-spindle-types").SpindleFrontendContext);
    gallery.open();
    const firstId = (sent[0] as Record<string, unknown>).requestId;
    emit({
      type: "inlay_gallery_result",
      requestId: firstId,
      ok: true,
      page: 2,
      totalChats: 6,
      totalPages: 2,
      chatIds: ["1","2","3","4","5","6"],
      chats: [{ chatId: "6", images: [chatImage("6", 1)] }]
    });
    // select chat #2 from the dropdown
    const nav = modals[0].root.findByClass("inlay-gallery-nav");
    const select = (() => {
      let found: any = null;
      const walk = (n: any) => { if (n.tagName === "SELECT" && !found) found = n; for (const ch of n.children) walk(ch); };
      walk(nav);
      return found;
    })();
    select.value = "2";
    select.dispatchEvent("change", {});
    expect(sent.length).toBe(2);
    expect((sent[1] as Record<string, unknown>).selectedChatId).toBe("2");
    expect((sent[1] as Record<string, unknown>).page).toBe(1);

    const selectedId = (sent[1] as Record<string, unknown>).requestId;
    emit({
      type: "inlay_gallery_result",
      requestId: selectedId,
      ok: true,
      page: 1,
      totalChats: 6,
      totalPages: 2,
      chatIds: ["1","2","3","4","5","6"],
      chats: [{ chatId: "2", images: [chatImage("2", 5)] }]
    });
    // pagination hidden in per-chat view
    expect(modals[0].root.findByClass("inlay-gallery-pagination").hidden).toBe(true);
    // All returns current page (which was 2 before selecting)
    const allSelect = (() => {
      let found: any = null;
      const walk = (n: any) => { if (n.tagName === "SELECT" && !found) found = n; for (const ch of n.children) walk(ch); };
      walk(nav);
      return found;
    })();
    allSelect.value = "";
    allSelect.dispatchEvent("change", {});
    expect(sent.length).toBe(3);
    expect((sent[2] as Record<string, unknown>).selectedChatId).toBeFalsy();
    expect((sent[2] as Record<string, unknown>).page).toBe(2);

    gallery.destroy();
  });

  test("ignore stale responses and cleanup/dismiss safely", () => {
    const { ctx, sent, modals, emit } = makeCtx();
    const gallery = createInlayGallery(ctx as unknown as import("lumiverse-spindle-types").SpindleFrontendContext);
    gallery.open();
    const firstId = (sent[0] as Record<string, unknown>).requestId;
    // trigger second request before first resolves (pagination)
    // simulate All page 2 request
    // We need to get nav to trigger next; but simpler directly request via button
    const root = modals[0].root;
    // Emit stale later: first send second request via gallery's internal? Use next button if available
    // Instead manually send second backend request by clicking All again (creates new request)
    // Mock: directly call sendToBackend again by clicking All twice
    const allBtn = root.findByClass("inlay-gallery-nav").findButtons()[0];
    // need chats to enable nav buttons; emit initial result first
    emit({
      type: "inlay_gallery_result",
      requestId: firstId,
      ok: true,
      page: 1,
      totalChats: 7,
      totalPages: 2,
      chatIds: ["1","2","3","4","5","6","7"],
      chats: [{ chatId: "1", images: [chatImage("1", 1)] }]
    });
    // Now click next to generate pending second request
    const next = root.findByClass("inlay-gallery-pagination").findButtons().find((b: any) => b.textContent.includes("Next"));
    next.click();
    const secondId = (sent[1] as Record<string, unknown>).requestId;
    // Now stale firstId arrives after second request is pending - should be ignored
    emit({
      type: "inlay_gallery_result",
      requestId: firstId,
      ok: true,
      page: 1,
      totalChats: 7,
      totalPages: 2,
      chatIds: ["1","2","3","4","5","6","7"],
      chats: [{ chatId: "99", images: [chatImage("99", 1)] }]
    });
    // Should still show loading or previous, not 99
    const walkFor99 = (node: any): boolean => {
      if (node.textContent === "💬 Chat #99") return true;
      for (const ch of node.children) if (walkFor99(ch)) return true;
      return false;
    };
    expect(walkFor99(modals[0].root)).toBe(false);

    // Correct second response updates
    emit({
      type: "inlay_gallery_result",
      requestId: secondId,
      ok: true,
      page: 2,
      totalChats: 7,
      totalPages: 2,
      chatIds: ["1","2","3","4","5","6","7"],
      chats: [{ chatId: "6", images: [chatImage("6", 2)] }]
    });
    // Now dismiss and ensure no crash on late response
    modals[0].dismiss();
    emit({
      type: "inlay_gallery_result",
      requestId: "late-after-dismiss",
      ok: true,
      page: 1,
      totalChats: 0,
      totalPages: 1,
      chatIds: [],
      chats: []
    });
    // Should not throw, gallery destroyed should not render
    expect(modals[0].dismissCalls).toBe(1);

    gallery.destroy();
    // After destroy, emit should be ignored (handlers removed)
    emit({
      type: "inlay_gallery_result",
      requestId: "after-destroy",
      ok: true,
      page: 1,
      totalChats: 1,
      totalPages: 1,
      chatIds: ["1"],
      chats: [{ chatId: "1", images: [chatImage("1", 1)] }]
    });
  });

  test("loading/error/empty states accessible", () => {
    const { ctx, sent, modals, emit } = makeCtx();
    const gallery = createInlayGallery(ctx as unknown as import("lumiverse-spindle-types").SpindleFrontendContext);
    gallery.open();
    let content = modals[0].root.findByClass("inlay-gallery-content");
    expect(content.findByClass("inlay-gallery-status")).toBeTruthy();

    const firstId = (sent[0] as Record<string, unknown>).requestId;
    emit({ type: "inlay_gallery_result", requestId: firstId, ok: false, error: "boom" });
    expect(modals[0].root.findByClass("inlay-gallery-status").getAttribute("role")).toBe("alert");

    // Empty
    gallery.open();
    const secondReq = sent[sent.length - 1] as unknown as Record<string, unknown>;
    emit({
      type: "inlay_gallery_result",
      requestId: (secondReq.requestId as string),
      ok: true,
      page: 1,
      totalChats: 0,
      totalPages: 1,
      chatIds: [],
      chats: []
    });
    const latestModal = modals[modals.length - 1].root;
    expect(latestModal.findByClass("inlay-gallery-empty").textContent).toBe("No saved Inlay history.");

    gallery.destroy();
  });
});


describe("Inlay gallery scoped-open and naming", () => {
  beforeEach(() => setupDom());
  afterEach(() => teardownDom());

  test("open(chatId) scopes the first request to that chat", () => {
    const { ctx, sent, modals } = makeCtx();
    const gallery = createInlayGallery(ctx as unknown as import("lumiverse-spindle-types").SpindleFrontendContext);
    gallery.open("chat-9");
    expect(modals.length).toBe(1);
    const first = sent[0] as Record<string, unknown>;
    expect(first.type).toBe("list_inlay_gallery");
    expect(first.page).toBe(1);
    expect(first.selectedChatId).toBe("chat-9");
  });

  test("open() without a chat id stays on the global All view", () => {
    const { ctx, sent } = makeCtx();
    const gallery = createInlayGallery(ctx as unknown as import("lumiverse-spindle-types").SpindleFrontendContext);
    gallery.open();
    const first = sent[0] as Record<string, unknown>;
    expect(first.type).toBe("list_inlay_gallery");
    expect(first.selectedChatId).toBeUndefined();
  });

  test("renders the card/chat name and message/branch counts in the heading", () => {
    const { ctx, sent, modals, emit } = makeCtx();
    const gallery = createInlayGallery(ctx as unknown as import("lumiverse-spindle-types").SpindleFrontendContext);
    gallery.open();
    const first = sent[0] as Record<string, unknown>;
    emit({
      type: "inlay_gallery_result",
      requestId: first.requestId,
      ok: true,
      page: 1,
      totalChats: 1,
      totalPages: 1,
      chatIds: ["1"],
      chats: [
        { chatId: "1", cardName: "Alice", name: "Alice chat", messageCount: 2, branchCount: 1, images: [chatImage("1", 1), chatImage("1", 2), chatImage("1", 3)] as unknown[] }
      ]
    });
    const root = modals[0].root;
    const heading = root.findByClass("inlay-gallery-chat-heading");
    expect(heading.textContent).toBe("💬 Alice");
    const meta = root.findByClass("inlay-gallery-chat-meta");
    expect(meta.textContent).toContain("2 messages");
    expect(meta.textContent).toContain("3 images");
    expect(meta.textContent).toContain("1 branch");
  });
});
