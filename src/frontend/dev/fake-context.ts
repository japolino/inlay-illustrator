/**
 * Fake `SpindleFrontendContext` for the preview page and DOM tests. Implements the members the
 * frontend uses (ui mount/float/drawer/input bar, dom.addStyle/inject, events, backend messaging)
 * and returns inert stubs for everything else.
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { MockBackend } from "./mock-backend.js";

export interface FakeSpindle {
  ctx: SpindleFrontendContext;
  /** Emits a host event (e.g. CHAT_SWITCHED, MESSAGE_RENDERED). */
  emitHostEvent(name: string, payload: unknown): void;
  drawerRoot: HTMLElement;
  inputBarClick(): void;
}

export function createFakeSpindleContext(doc: Document, mock: MockBackend, options: { chatId?: string } = {}): FakeSpindle {
  const hostEvents = new Map<string, Set<(payload: unknown) => void>>();
  const drawerRoot = doc.createElement("div");
  drawerRoot.setAttribute("data-fake-drawer", "");
  drawerRoot.style.cssText = "position:fixed;left:8px;top:8px;width:300px;max-height:60vh;overflow:auto;border:1px solid #444;background:#151315;z-index:1;";
  doc.body.appendChild(drawerRoot);
  let inputBarHandler: (() => void) | null = null;
  const chatId = options.chatId ?? mock.db.status.activeChatId ?? "chat-1";

  const makeLayer = (kind: string, zIndex: number) => {
    const root = doc.createElement("div");
    root.setAttribute("data-fake-host", kind);
    root.style.cssText = `position:fixed;inset:0;z-index:${zIndex};display:none;`;
    doc.body.appendChild(root);
    return root;
  };

  const ui = {
    registerDrawerTab: () => ({ root: drawerRoot, destroy: () => drawerRoot.remove(), setTitle() {}, setBadge() {}, activate() {} }),
    registerInputBarAction: () => ({
      onClick: (handler: () => void) => {
        inputBarHandler = handler;
        return () => {
          inputBarHandler = null;
        };
      },
      destroy() {},
      setEnabled() {},
      update() {}
    }),
    mountApp: () => {
      const root = makeLayer("app", 9990);
      return { root, mountId: "fake", setVisible: (visible: boolean) => { root.style.display = visible ? "block" : "none"; }, destroy: () => root.remove() };
    },
    createFloatWidget: () => {
      const root = makeLayer("float", 9991);
      return { root, setVisible: (visible: boolean) => { root.style.display = visible ? "block" : "none"; }, destroy: () => root.remove(), setPosition() {}, getPosition: () => ({ x: 0, y: 0 }) };
    },
    showModal: () => ({ root: doc.createElement("div"), close() {}, onClose: () => () => undefined })
  };

  const injected = new Set<Element>();
  const dom = {
    addStyle: (css: string) => {
      const style = doc.createElement("style");
      style.textContent = css;
      doc.head.appendChild(style);
      return () => style.remove();
    },
    inject: (target: string | Element, html: string, position: InsertPosition = "beforeend") => {
      const element = typeof target === "string" ? doc.querySelector(target) : target;
      const wrapper = doc.createElement("div");
      wrapper.setAttribute("data-spindle-ext", "inlay_illustrator");
      wrapper.innerHTML = html;
      (element ?? doc.body).insertAdjacentElement(position, wrapper);
      injected.add(wrapper);
      return wrapper;
    },
    uninject: (element: Element) => {
      element.remove();
      injected.delete(element);
    },
    query: (selector: string) => doc.querySelector(selector),
    queryAll: (selector: string) => [...doc.querySelectorAll(selector)],
    cleanup: () => {
      for (const element of injected) element.remove();
      injected.clear();
    },
    createElement: (tag: string) => doc.createElement(tag),
    listMessageElements: () => [...doc.querySelectorAll("[data-message-id]")].map((element) => ({ messageId: element.getAttribute("data-message-id") ?? "", element }))
  };

  const base: Record<string, unknown> = {
    ui,
    dom,
    events: {
      on: (name: string, handler: (payload: unknown) => void) => {
        let set = hostEvents.get(name);
        if (!set) hostEvents.set(name, (set = new Set()));
        set.add(handler);
        return () => set!.delete(handler);
      }
    },
    getActiveChat: () => ({ chatId, characterId: mock.db.status.activeCharacterId }),
    sendToBackend: (payload: unknown) => mock.transport.send(payload),
    onBackendMessage: (handler: (payload: unknown) => void) => mock.transport.subscribe(handler),
    ready: () => undefined,
    manifest: { identifier: "inlay_illustrator", name: "Inlay Illustrator", version: "0.10.0" }
  };
  const stub: unknown = new Proxy(() => stub, { get: (_t, key) => (key === "then" ? undefined : stub), apply: () => stub });
  const ctx = new Proxy(base, { get: (target, key: string) => (key in target ? target[key] : stub) }) as unknown as SpindleFrontendContext;

  return {
    ctx,
    drawerRoot,
    emitHostEvent: (name, payload) => {
      for (const handler of [...(hostEvents.get(name) ?? [])]) handler(payload);
    },
    inputBarClick: () => inputBarHandler?.()
  };
}
