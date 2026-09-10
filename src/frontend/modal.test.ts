import { describe, expect, test } from "bun:test";
import { showNativeModal, cleanupModalStyles } from "./modal.js";

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
    listeners: new Map<string, Array<(e: any) => void>>(),
    removed: 0,
    tabIndex: 0,
    focused: false,
    focus() {
      if ((globalThis as any).document) {
        (globalThis as any).document.activeElement = this;
      }
      this.focused = true;
    },
    setAttribute(name: string, value: string) { this.attributes.set(name, value); },
    getAttribute(name: string) { return this.attributes.get(name) ?? null; },
    removeAttribute(name: string) { this.attributes.delete(name); },
    hasAttribute(name: string) { return this.attributes.has(name); },
    append(...children: any[]) {
      for (const c of children) {
        c.parent = this;
        this.children.push(c);
      }
    },
    addEventListener(type: string, handler: (e: any) => void) {
      const list = this.listeners.get(type) || [];      list.push(handler);
      this.listeners.set(type, list);
    },
    removeEventListener(type: string, handler: (e: any) => void) {
      const list = this.listeners.get(type) || [];
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    },
    dispatchEvent(event: any) {
      for (const handler of this.listeners.get(event.type) || []) {
        handler(event);
      }
    },
    contains(node: any) {
      if (!node) return false;
      if (node === this) return true;
      return this.children.some((c: any) => (c as any).contains?.(node));
    },
    closest(selector: string) {
      if (selector === "[hidden]") {
        if (this.hidden) return this;
        return this.parent?.closest?.(selector) || null;
      }
      return null;
    },
    remove() {
      this.removed += 1;
      if (this.parent) {
        const idx = this.parent.children.indexOf(this);
        if (idx >= 0) this.parent.children.splice(idx, 1);
      }
    },
    click() {
      this.dispatchEvent({ type: "click", target: this });
    },
    querySelector(selector: string) {
      const all = this.querySelectorAll(selector);
      return all.length > 0 ? all[0] : null;
    },
    querySelectorAll(selector: string) {
      const results: any[] = [];
      function collect(node: any) {
        for (const child of node.children || []) {
          let matches = false;
          if (selector.includes(".inlay-modal-title") && child.className?.includes("inlay-modal-title")) matches = true;
          else if (selector.includes(".inlay-modal-close") && child.className?.includes("inlay-modal-close")) matches = true;
          else if (selector.includes("button") && child.tagName === "BUTTON") {
            const isExcluded = selector.includes(':not([tabindex="-1"])') && child.tabIndex === -1;
            if (!isExcluded) matches = true;
          } else if (selector.includes("input") && child.tagName === "INPUT") {
            const isExcluded = selector.includes(':not([tabindex="-1"])') && child.tabIndex === -1;
            if (!isExcluded) matches = true;
          }
          if (matches) results.push(child);
          collect(child);
        }
      }
      collect(this);
      return results;
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
    get() { return ""; },
    set() {}
  });

  return el;
}

function setupDom(): { body: any; docListeners: Map<string, Array<(e: any) => void>> } {
  const body = fakeElement("body");
  const head = fakeElement("head");
  const docListeners = new Map<string, Array<(e: any) => void>>();

  (globalThis as any).document = {
    createElement: (tag: string) => fakeElement(tag),
    body,
    head,
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener(type: string, handler: (e: any) => void) {
      const list = docListeners.get(type) || [];
      list.push(handler);
      docListeners.set(type, list);
    },
    removeEventListener(type: string, handler: (e: any) => void) {
      const list = docListeners.get(type) || [];
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    },
    dispatchEvent(event: any) {
      for (const handler of docListeners.get(event.type) || []) {
        handler(event);
      }
    },
    contains: (node: any) => body.contains(node),
    activeElement: null
  };

  (globalThis as any).window = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {},
    removeEventListener() {}
  };
  (globalThis as any).requestAnimationFrame = (cb: () => void) => cb();

  return { body, docListeners };
}

describe("Native DOM Modal", () => {
  test("creates modal with accessible dialog, title, close button and body", () => {
    setupDom();
    const modal = showNativeModal({
      title: "Test Dialog",
      width: 600,
      maxHeight: 500
    });

    expect(modal.root).toBeDefined();
    expect(modal.dialog).toBeDefined();
    expect(modal.overlay).toBeDefined();
    expect(modal.dialog.getAttribute("role")).toBe("dialog");
    expect(modal.dialog.getAttribute("aria-modal")).toBe("true");

    const titleEl = modal.dialog.querySelector(".inlay-modal-title");
    expect(titleEl?.textContent).toBe("Test Dialog");

    const closeBtn = modal.dialog.querySelector(".inlay-modal-close");
    expect(closeBtn).toBeDefined();

    let dismissed = false;
    modal.onDismiss(() => { dismissed = true; });

    modal.dismiss();
  });

  test("dismiss closes, triggers onDismiss callback, and restores body scroll", async () => {
    const { body } = setupDom();
    expect(body.style.overflow).toBeUndefined();

    let dismissed = false;
    const modal = showNativeModal({
      title: "Dismiss Test"
    });

    expect(body.style.overflow).toBe("hidden");

    modal.onDismiss(() => {
      dismissed = true;
    });

    modal.dismiss();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(dismissed).toBe(true);
    expect(body.style.overflow).toBe("");
  });

  test("Escape key dismisses the active modal", async () => {
    const { docListeners } = setupDom();
    let dismissed = false;
    const modal = showNativeModal({ title: "Escape Test" });
    modal.onDismiss(() => { dismissed = true; });

    let prevented = false;
    const escEvent = {
      type: "keydown",
      key: "Escape",
      preventDefault() { prevented = true; }
    };
    for (const h of docListeners.get("keydown") || []) {
      h(escEvent);
    }

    expect(prevented).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(dismissed).toBe(true);
  });

  test("Tab key traps focus within dialog and loops correctly", () => {
    const { docListeners } = setupDom();
    const modal = showNativeModal({ title: "Focus Trap Test" });

    const btn1 = fakeElement("button");
    const btn2 = fakeElement("button");
    const negTabBtn = fakeElement("button");
    negTabBtn.tabIndex = -1;

    modal.root.append(btn1, btn2, negTabBtn);

    // Initial state: closeBtn is in header, btn1 and btn2 are in root
    const closeBtn = modal.dialog.querySelector(".inlay-modal-close");
    expect(closeBtn).toBeDefined();

    // When focus is at the last element (btn2) and Tab is pressed, it wraps to first (closeBtn)
    btn2.focus();
    let prevented = false;
    const tabEvent = {
      type: "keydown",
      key: "Tab",
      shiftKey: false,
      preventDefault() { prevented = true; }
    };
    for (const h of docListeners.get("keydown") || []) {
      h(tabEvent);
    }
    expect(prevented).toBe(true);
    expect((globalThis as any).document.activeElement).toBe(closeBtn);

    // When focus is at the first element (closeBtn) and Shift+Tab is pressed, it wraps to last (btn2)
    (closeBtn as any)?.focus();
    prevented = false;
    const shiftTabEvent = {
      type: "keydown",
      key: "Tab",
      shiftKey: true,
      preventDefault() { prevented = true; }
    };
    for (const h of docListeners.get("keydown") || []) {
      h(shiftTabEvent);
    }
    expect(prevented).toBe(true);
    expect((globalThis as any).document.activeElement).toBe(btn2);

    modal.dismiss();
  });

  test("cleanupModalStyles cleans up styles, modal stack, and body overflow", () => {
    const { body } = setupDom();
    showNativeModal({ title: "Leak Test" });
    expect(body.style.overflow).toBe("hidden");

    cleanupModalStyles();
    expect(body.style.overflow).toBe("");
  });
});