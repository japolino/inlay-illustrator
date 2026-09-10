import { describe, expect, test } from "bun:test";
import { createInlayGallery } from "./gallery.js";

function fakeElement(tag: string): any {
  const el: any = {
    tagName: tag.toUpperCase(),
    className: "",
    hidden: false,
    disabled: false,
    parent: null,
    style: {} as Record<string, string>,
    children: [] as any[],
    attributes: new Map<string, string>(),
    listeners: new Map<string, Array<(e: unknown) => void>>(),
    removed: 0,
    tabIndex: 0,
    focus() {},
    setAttribute(name: string, value: string) { this.attributes.set(name, value); },
    getAttribute(name: string) { return this.attributes.get(name) ?? null; },
    removeAttribute(name: string) { this.attributes.delete(name); },
    hasAttribute(name: string) { return this.attributes.has(name); },
    append(...children: any[]) { for (const c of children) { c.parent = this; this.children.push(c); } },
    replaceChildren(...children: any[]) { this.children = [...children]; for (const c of children) c.parent = this; },
    addEventListener(type: string, handler: (e: unknown) => void) {
      const list = this.listeners.get(type) || [];
      list.push(handler);
      this.listeners.set(type, list);
    },
    removeEventListener(type: string, handler: (e: unknown) => void) {
      const list = this.listeners.get(type) || [];
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    },
    contains(node: any) { return node === this || this.children.some((c: any) => (c as any).contains?.(node)); },
    remove() { this.removed += 1; },
    click() { for (const handler of this.listeners.get("click") || []) handler({}); },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  Object.defineProperty(el, "classList", {
    value: {
      _set: new Set<string>(),
      add(name: string) { this._set.add(name); },
      remove(name: string) { this._set.delete(name); },
      toggle(name: string, force?: boolean) {
        if (force === undefined) {
          this._set.has(name) ? this._set.delete(name) : this._set.add(name);
        } else if (force) this._set.add(name);
        else this._set.delete(name);
      },
      contains(name: string) { return this._set.has(name); }
    }
  });
  Object.defineProperty(el, "innerHTML", {
    get() { return ""; },
    set() {}
  });
  return el;
}

function setupDom(): Array<any> {
  const body = fakeElement("body");
  const head = fakeElement("head");
  (globalThis as any).document = {
    createElement: (tag: string) => fakeElement(tag),
    body,
    head,
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    contains: (node: any) => node === body
  };
  (globalThis as any).window = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
    removeEventListener() {}
  };
  (globalThis as any).requestAnimationFrame = (cb: () => void) => cb();
  return [body];
}

describe("Inlay Gallery component", () => {
  test("open requests page 1 and sends list_inlay_gallery to backend", () => {
    setupDom();
    const sent: any[] = [];
    const backendHandlers: Array<(p: unknown) => void> = [];

    const ctx: any = {
      sendToBackend: (payload: unknown) => sent.push(payload),
      onBackendMessage: (h: (p: unknown) => void) => {
        backendHandlers.push(h);
        return () => {};
      },
      dom: { addStyle: () => () => {} },
      getActiveChat: () => ({ chatId: "chat-10" }),
      events: { on: () => () => {} }
    };

    const gallery = createInlayGallery(ctx);
    gallery.open("chat-10");

    expect(sent.length).toBe(1);
    expect(sent[0]).toMatchObject({
      type: "list_inlay_gallery",
      page: 1,
      selectedChatId: "chat-10"
    });

    gallery.destroy();
  });
});
