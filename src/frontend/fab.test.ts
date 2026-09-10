import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, normalizeFabCorner } from "../shared/config.js";
import {
  fabButtonEdges,
  fabButtonRect,
  fabMenuPosition,
  installInlayFab
} from "./fab.js";

describe("FAB corner placement helpers", () => {
  const viewport = { width: 1280, height: 800 };

  test("button anchors to each configured corner with a fixed inset", () => {
    expect(fabButtonEdges("bottom-right")).toEqual({ right: "20px", bottom: "20px", left: "auto", top: "auto" });
    expect(fabButtonEdges("bottom-left")).toEqual({ left: "20px", bottom: "20px", right: "auto", top: "auto" });
    expect(fabButtonEdges("top-right")).toEqual({ right: "20px", top: "20px", left: "auto", bottom: "auto" });
    expect(fabButtonEdges("top-left")).toEqual({ left: "20px", top: "20px", right: "auto", bottom: "auto" });

    const rect = fabButtonRect("bottom-right", viewport);
    expect(rect.left).toBe(1280 - 20 - 48);
    expect(rect.top).toBe(800 - 20 - 48);

    const topLeft = fabButtonRect("top-left", { width: 600, height: 400 });
    expect(topLeft.left).toBe(20);
    expect(topLeft.top).toBe(20);
  });

  test("menu drops up from bottom corners and down from top corners", () => {
    const menu = { width: 230, height: 140 };
    const bottomRight = fabButtonRect("bottom-right", viewport);
    const up = fabMenuPosition("bottom-right", bottomRight, menu, viewport);
    expect(up.top + menu.height).toBe(bottomRight.top - 8);

    const topRight = fabButtonRect("top-right", viewport);
    const down = fabMenuPosition("top-right", topRight, menu, viewport);
    expect(down.top).toBe(topRight.bottom + 8);

    // Horizontal alignment follows the anchor edge of each corner
    expect(up.left).toBe(bottomRight.right - menu.width);
    expect(down.left).toBe(topRight.right - menu.width);

    const bottomLeft = fabButtonRect("bottom-left", viewport);
    const upLeft = fabMenuPosition("bottom-left", bottomLeft, menu, viewport);
    expect(upLeft.left).toBe(bottomLeft.left);

    const topLeft = fabButtonRect("top-left", viewport);
    const downLeft = fabMenuPosition("top-left", topLeft, menu, viewport);
    expect(downLeft.left).toBe(topLeft.left);
  });

  test("menu clamps inside the viewport even for narrow screens", () => {
    const narrow = { width: 260, height: 300 };
    const menu = { width: 200, height: 140 };
    const button = { left: 20, top: 20, right: 68, bottom: 68, width: 48, height: 48 };
    const position = fabMenuPosition("bottom-left", button, menu, narrow);
    expect(position.left).toBeGreaterThanOrEqual(8);
    expect(position.left + menu.width).toBeLessThanOrEqual(narrow.width - 8);
    expect(position.top).toBe(button.bottom + 8);
  });

  test("unknown corner values normalize before placement", () => {
    expect(normalizeFabCorner("Bottom-Right")).toBe("bottom-right");
    expect(normalizeFabCorner("top-LEFT ")).toBe("top-left");
    expect(normalizeFabCorner("invalid")).toBe("bottom-right");
    expect(DEFAULT_CONFIG.fabCorner).toBe("bottom-right");
  });
});

describe("FAB turn-aware behavior and hover animation", () => {
  function fakeElement(tag: string): any {
    let innerHtmlVal = "";
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
      setAttribute(name: string, value: string) { this.attributes.set(name, value); },
      getAttribute(name: string) { return this.attributes.get(name) ?? null; },
      removeAttribute(name: string) { this.attributes.delete(name); },
      hasAttribute(name: string) { return this.attributes.has(name); },
      append(...children: any[]) { for (const c of children) { c.parent = this; this.children.push(c); } },
      addEventListener(type: string, handler: (e: unknown) => void) {
        const list = this.listeners.get(type) || [];
        list.push(handler);
        this.listeners.set(type, list);
      },
      removeEventListener() {},
      contains(node: any) { return node === this || this.children.some((c: any) => (c as any).contains?.(node)); },
      closest(selector: string) {
        if (selector === ".inlay-gallery" || selector === ".inlay-modal-dialog") return null;
        return null;
      },
      remove() { this.removed += 1; },
      click() { for (const handler of this.listeners.get("click") || []) handler({}); },
      getBoundingClientRect() { return { left: 1232, top: 732, right: 1280, bottom: 780, width: 48, height: 48 }; },
      querySelector(selector: string) {
        if (selector === "img" || selector === '[data-inlay-illustrator="true"] img') {
          return this.querySelectorAll("img")[0] || null;
        }
        if (selector === ".inlay-fab-label") return this.children.find((c: any) => c.className === "inlay-fab-label") || null;
        return null;
      },
      querySelectorAll(selector: string) {
        const res: any[] = [];
        function walk(node: any) {
          for (const c of node.children || []) {
            if (selector === "img" && c.tagName === "IMG") res.push(c);
            walk(c);
          }
        }
        walk(this);
        return res;
      }
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
      get() { return innerHtmlVal; },
      set(v: string) { innerHtmlVal = v; }
    });
    return el;
  }

  function setupDom(queryElements: Record<string, any[]> = {}): Array<any> {
    const created: Array<any> = [];
    const body = fakeElement("body");
    (globalThis as any).document = {
      createElement: (tag: string) => { const el = fakeElement(tag); created.push(el); return el; },
      body,
      querySelectorAll: (sel: string) => {
        if (queryElements[sel]) return queryElements[sel];
        return [];
      },
      addEventListener() {},
      removeEventListener() {},
      contains: (node: any) => body.contains(node)
    };
    (globalThis as any).window = {
      innerWidth: 1280,
      innerHeight: 800,
      addEventListener() {},
      removeEventListener() {}
    };
    return [body];
  }

  test("when no images exist for this turn, button has empty-turn class and clicking triggers generate_latest", () => {
    const [body] = setupDom();
    const sent: unknown[] = [];
    const backendHandlers: Array<(p: unknown) => void> = [];
    const ctx: any = {
      sendToBackend: (payload: unknown) => sent.push(payload),
      onBackendMessage: (h: (p: unknown) => void) => { backendHandlers.push(h); return () => {}; },
      dom: { addStyle: () => () => {} },
      getActiveChat: () => ({ chatId: "chat-42" }),
      events: { on: () => () => {} }
    };

    const destroy = installInlayFab(ctx as any, { getCorner: () => "bottom-right", openGallery: () => {} });
    const button = body.children[0];

    // With no images in DOM, empty turn class is set
    expect(button.classList.contains("inlay-fab-empty-turn")).toBeTrue();

    // Clicking when no images exist triggers generate_latest directly
    button.click();
    expect(sent.length).toBe(1);
    expect(sent[0]).toEqual({ type: "generate_latest", chatId: "chat-42" });

    destroy();
  });

  test("does not fall through to historical turn images when latest message has no images", () => {
    const turn1Msg = fakeElement("div");
    const turn1Img = fakeElement("img");
    turn1Img.setAttribute("data-inlay-illustrator-image-url", "https://img1.png");
    turn1Msg.append(turn1Img);

    const turn2Msg = fakeElement("div"); // Empty turn, no images

    const messages = [turn1Msg, turn2Msg];
    const queryMap: Record<string, any[]> = {
      '[data-message-id], .chat-message, .message': messages,
      '[data-inlay-illustrator="true"]': [turn1Msg]
    };

    const [body] = setupDom(queryMap);
    const sent: unknown[] = [];
    const ctx: any = {
      sendToBackend: (payload: unknown) => sent.push(payload),
      onBackendMessage: () => () => {},
      dom: { addStyle: () => () => {} },
      getActiveChat: () => ({ chatId: "chat-42" }),
      events: { on: () => () => {} }
    };

    const destroy = installInlayFab(ctx as any, { getCorner: () => "bottom-right", openGallery: () => {} });
    const button = body.children[0];

    // Because the latest message has NO images, it must be empty-turn
    expect(button.classList.contains("inlay-fab-empty-turn")).toBeTrue();

    destroy();
  });

  test("when images exist in latest message, button toggles action menu with all items", () => {
    const turn1Msg = fakeElement("div");
    const turn1Img = fakeElement("img");
    turn1Img.setAttribute("data-inlay-illustrator-image-url", "https://img1.png");
    turn1Msg.append(turn1Img);

    const messages = [turn1Msg];
    const queryMap: Record<string, any[]> = {
      '[data-message-id], .chat-message, .message': messages,
      '[data-inlay-illustrator="true"]': [turn1Msg]
    };

    const [body] = setupDom(queryMap);
    const sent: unknown[] = [];
    let openedSettings = false;
    let openedGallery = false;

    const ctx: any = {
      sendToBackend: (payload: unknown) => sent.push(payload),
      onBackendMessage: () => () => {},
      dom: { addStyle: () => () => {} },
      getActiveChat: () => ({ chatId: "chat-42" }),
      events: { on: () => () => {} }
    };

    const destroy = installInlayFab(ctx as any, {
      getCorner: () => "bottom-right",
      openGallery: () => { openedGallery = true; },
      openSettings: () => { openedSettings = true; }
    });
    const button = body.children[0];
    const menu = body.children[1];

    // Has images, so NOT empty turn
    expect(button.classList.contains("inlay-fab-empty-turn")).toBeFalse();

    // Clicking toggles menu open
    button.click();
    expect(menu.hidden).toBeFalse();

    // Contains 4 menu items: Reroll, Sidecar, Gallery, Settings
    expect(menu.children.length).toBe(4);

    // Click Gallery item
    const galleryItem = menu.children[2];
    galleryItem.click();
    expect(openedGallery).toBeTrue();
    expect(menu.hidden).toBeTrue();

    // Reopen menu and click Settings item
    button.click();
    expect(menu.hidden).toBeFalse();
    const settingsItem = menu.children[3];
    settingsItem.click();
    expect(openedSettings).toBeTrue();
    expect(menu.hidden).toBeTrue();

    destroy();
  });
});
