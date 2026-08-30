import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { fabButtonEdges, fabButtonRect, fabMenuPosition, installInlayFab } from "./fab.js";
import { normalizeFabCorner } from "../shared/config.js";

describe("FAB corner placement helpers", () => {
  const viewport = { width: 1280, height: 800 };

  test("button anchors to each configured corner with a fixed inset", () => {
    expect(fabButtonEdges("bottom-right")).toEqual({ right: "20px", bottom: "20px" });
    expect(fabButtonEdges("bottom-left")).toEqual({ left: "20px", bottom: "20px" });
    expect(fabButtonEdges("top-right")).toEqual({ right: "20px", top: "20px" });
    expect(fabButtonEdges("top-left")).toEqual({ left: "20px", top: "20px" });
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

    // Horizontal alignment follows the anchor edge of each corner.
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
    // A bottom-left anchor whose natural left-aligned position would
    // overflow the right edge, and whose button sits high enough that the
    // menu cannot fit above it.
    const button: import("./fab.js").FabRect = { left: 20, top: 20, right: 68, bottom: 68, width: 48, height: 48 };
    const position = fabMenuPosition("bottom-left", button, menu, narrow);
    expect(position.left).toBeGreaterThanOrEqual(8);
    expect(position.left + menu.width).toBeLessThanOrEqual(narrow.width - 8);
    // When the menu cannot fit above, it flips below the button.
    expect(position.top).toBe(button.bottom + 8);
  });

  test("unknown corner values normalize before placement", () => {
    expect(normalizeFabCorner("Bottom-Right")).toBe("bottom-right");
    expect(normalizeFabCorner("top-LEFT ")).toBe("top-left");
    expect(normalizeFabCorner("garbage")).toBe("bottom-right");
    expect(DEFAULT_CONFIG.fabCorner).toBe("bottom-right");
  });
});

describe("FAB DOM lifecycle (fake DOM)", () => {
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
      setAttribute(name: string, value: string) { this.attributes.set(name, value); },
      getAttribute(name: string) { return this.attributes.get(name) ?? null; },
      append(...children: any[]) { for (const c of children) { c.parent = this; this.children.push(c); } },
      addEventListener(type: string, handler: (e: unknown) => void) {
        const list = this.listeners.get(type) || [];
        list.push(handler);
        this.listeners.set(type, list);
      },
      removeEventListener() {},
      contains(node: any) { return node === this || this.children.some((c: any) => (c as any).contains?.(node)); },
      remove() { this.removed += 1; },
      click() { for (const handler of this.listeners.get("click") || []) handler({}); },
      getBoundingClientRect() { return { left: 1232, top: 732, right: 1280, bottom: 780, width: 48, height: 48 }; }
    };
    Object.defineProperty(el, "classList", {
      value: {
        _set: new Set<string>(),
        add(name: string) { this._set.add(name); },
        remove(name: string) { this._set.delete(name); },
        toggle(name: string, force?: boolean) { if (force === undefined) { this._set.has(name) ? this._set.delete(name) : this._set.add(name); } else if (force) this._set.add(name); else this._set.delete(name); },
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
    const created: Array<any> = [];
    const body = fakeElement("body");
    const handlers: Array<(e: unknown) => void> = [];
    (globalThis as any).__inlayFabCreated = created;
    (globalThis as any).document = {
      createElement: (tag: string) => { const el = fakeElement(tag); created.push(el); return el; },
      body,
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
    return [body, handlers];
  }

  test("installs button+menu, wires busy state from status messages, and cleans up", () => {
    const [body] = setupDom();
    const sent: unknown[] = [];
    const backendHandlers: Array<(p: unknown) => void> = [];
    let corner: string = "bottom-right";
    const ctx: any = {
      sendToBackend: (payload: unknown) => sent.push(payload),
      onBackendMessage: (h: (p: unknown) => void) => { backendHandlers.push(h); return () => {}; },
      dom: { addStyle: () => () => {} },
      getActiveChat: () => ({ chatId: "chat-9" }),
      events: { on: () => () => {} }
    };
    const destroy = installInlayFab(ctx as any, { getCorner: () => corner as any, openGallery: () => {} });
    expect(body.children.length).toBe(2);
    const button = body.children[0];
    expect(button.className).toBe("inlay-fab");
    expect(button.style.right).toBe("20px");
    expect(button.style.bottom).toBe("20px");

    // Busy: true sets the animation class; a status completion clears it.
    const emit = (payload: unknown) => backendHandlers.forEach((h) => h(payload));
    emit({ type: "status", status: "Rerolling all images...", busy: true });
    expect(button.classList.contains("inlay-fab-busy")).toBeTrue();
    emit({ type: "status", status: "Rerolled", busy: false });
    expect(button.classList.contains("inlay-fab-busy")).toBeFalse();

    // Menu items: exact labels, in the user-specified order.
    const menu = body.children[1];
    expect(menu.children.length).toBe(3);
    expect(menu.children[0].children[0].textContent).toBe("Reroll images (from this turn)");
    expect(menu.children[1].children[0].textContent).toBe("Reroll images with sidecar (from this turn)");
    expect(menu.children[2].children[0].textContent).toBe("Open Gallery");

    // First menu action sends reroll_all_images without messageId (latest turn).
    menu.children[0].click();
    expect(sent.length).toBe(1);
    expect(sent[0]).toMatchObject({ type: "reroll_all_images", chatId: "chat-9", sidecar: false });
    expect((sent[0] as any).messageId).toBeUndefined();

    // Sidecar variant flips the flag.
    menu.children[1].click();
    expect(sent[1]).toMatchObject({ type: "reroll_all_images", sidecar: true });

    // A config broadcast re-anchors the button to the new corner.
    emit({ type: "config_updated", config: { fabCorner: "top-left" } });
    expect(button.style.left).toBe("20px");
    expect(button.style.top).toBe("20px");
    expect(button.style.right).toBe("auto");

    destroy();
    expect(button.removed).toBe(1);
    expect(menu.removed).toBe(1);
  });
});
