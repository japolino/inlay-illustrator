import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { OVERLAY_ROOT_CLASS as BUILD_ROOT_CLASS } from "../../build/css-scope.js";
import { OVERLAY_ROOT_CLASS } from "./constants.js";
import { handleOverlayEscape } from "./escape.js";
import { createOverlayHost } from "./host.js";
import { LayerStack } from "./ui/layers.js";
import { placeBelow } from "./ui/popover.js";
import { keyboardInset } from "./viewport.js";
import { AppController } from "../state/app-state.js";
import { RpcClient } from "../rpc/client.js";
import { createMockBackend } from "../dev/mock-backend.js";
import { coreMockHandlers } from "../dev/mock/core.js";
import { createMockDb, type MockDb } from "../dev/mock/fixtures.js";
import { render } from "preact";
import { LAUNCHER_LABELS } from "./labels.js";

// A private happy-dom window: other test files install minimal DOM fakes on globalThis.
const win = new Window({ url: "http://localhost/" });
const doc = win.document as unknown as Document;

// preact/hooks schedules effects with requestAnimationFrame when it exists; other
// test files may leave a partial fake on globalThis, so pin a complete pair here.
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

/** App controller over the dev mock backend (no handshake is started). */
function testApp(): AppController {
  return new AppController(new RpcClient(createMockBackend({ handlers: [coreMockHandlers()] }).transport));
}

type FakeUi = {
  calls: string[];
  mountFails?: boolean;
  floatFails?: boolean;
  visible: boolean[];
};

function fakeCtx(ui: FakeUi): SpindleFrontendContext {
  const make = (kind: string) => {
    const root = doc.createElement("div");
    root.setAttribute("data-fake-host", kind);
    doc.body.appendChild(root);
    return root;
  };
  return {
    ui: {
      mountApp: (options: { position?: string }) => {
        ui.calls.push(`mountApp:${options.position}`);
        if (ui.mountFails) throw new Error("permission app_manipulation missing");
        const root = make("app");
        return { root, mountId: "m1", setVisible: (visible: boolean) => ui.visible.push(visible), destroy: () => root.remove() };
      },
      createFloatWidget: (options: { fullscreen?: boolean; chromeless?: boolean }) => {
        ui.calls.push(`float:${options.fullscreen}:${options.chromeless}`);
        if (ui.floatFails) throw new Error("permission ui_panels missing");
        const root = make("float");
        let fullscreen = false;
        return {
          root, widgetId: "w1", moveTo() {}, getPosition: () => ({ x: 0, y: 0 }), setSize() {},
          setVisible: (visible: boolean) => ui.visible.push(visible), isVisible: () => true,
          setFullscreen: (value: boolean) => { fullscreen = value; }, isFullscreen: () => fullscreen,
          destroy: () => root.remove(), onDragEnd: () => () => undefined
        };
      }
    }
  } as unknown as SpindleFrontendContext;
}

afterEach(() => {
  doc.body.replaceChildren();
});

describe("overlay root class", () => {
  test("matches the class the CSS scoper anchors to", () => {
    expect(OVERLAY_ROOT_CLASS).toBe(BUILD_ROOT_CLASS);
  });
});

describe("overlay host fallback", () => {
  test("prefers mountApp app-overlay", () => {
    const ui: FakeUi = { calls: [], visible: [] };
    const host = createOverlayHost(fakeCtx(ui).ui, doc);
    expect(host.kind).toBe("app-overlay");
    expect(ui.calls).toEqual(["mountApp:app-overlay"]);
    expect(ui.visible).toEqual([false]);
  });

  test("falls back to a fullscreen chromeless float widget, then a body node", () => {
    const ui: FakeUi = { calls: [], visible: [], mountFails: true };
    const fallbacks: string[] = [];
    const host = createOverlayHost(fakeCtx(ui).ui, doc, (kind) => fallbacks.push(kind));
    expect(host.kind).toBe("float-widget");
    expect(ui.calls).toEqual(["mountApp:app-overlay", "float:true:true"]);
    const last = createOverlayHost(fakeCtx({ calls: [], visible: [], mountFails: true, floatFails: true }).ui, doc, (kind) => fallbacks.push(kind));
    expect(last.kind).toBe("body");
    expect(last.container.parentElement).toBe(doc.body);
    expect(last.container.hidden).toBe(true);
    last.setVisible(true);
    expect(last.container.hidden).toBe(false);
    last.destroy();
    expect(last.container.isConnected).toBe(false);
    expect(fallbacks).toEqual(["float-widget", "float-widget", "body"]);
  });
});

function keyEvent(target: EventTarget | null) {
  const record = { prevented: false, stopped: false };
  return {
    record,
    event: {
      key: "Escape",
      target,
      preventDefault: () => { record.prevented = true; },
      stopPropagation: () => { record.stopped = true; },
      stopImmediatePropagation: () => { record.stopped = true; }
    }
  };
}

describe("Escape handling", () => {
  test("closes only the top-most layer, then the overlay", () => {
    const root = doc.createElement("div");
    const inner = doc.createElement("button");
    root.appendChild(inner);
    doc.body.appendChild(root);
    const layers = new LayerStack();
    const closed: string[] = [];
    const popLower = layers.push(() => { closed.push("lower"); });
    layers.push(() => { closed.push("upper"); });
    const state = { open: true, root, layers, closeOverlay: () => closed.push("overlay") };

    const first = keyEvent(inner);
    expect(handleOverlayEscape(first.event, state)).toBe(true);
    expect(first.record).toEqual({ prevented: true, stopped: true });
    expect(closed).toEqual(["upper"]);
    popLower();
    expect(handleOverlayEscape(keyEvent(doc.body).event, state)).toBe(true);
    expect(closed).toEqual(["upper", "overlay"]);
  });

  test("a layer that stays open (busy) keeps Escape and its place on the stack", () => {
    const root = doc.createElement("div");
    doc.body.appendChild(root);
    const layers = new LayerStack();
    const closed: string[] = [];
    let busy = true;
    layers.push(() => { closed.push("lower"); });
    layers.push(() => {
      if (busy) return false;
      closed.push("upper");
    });
    const state = { open: true, root, layers, closeOverlay: () => closed.push("overlay") };

    // Escape while busy is handled (the overlay stays open) and the layer is still there afterwards.
    expect(handleOverlayEscape(keyEvent(root).event, state)).toBe(true);
    expect({ closed, size: layers.size }).toEqual({ closed: [], size: 2 });
    busy = false;
    handleOverlayEscape(keyEvent(root).event, state);
    handleOverlayEscape(keyEvent(root).event, state);
    expect(closed).toEqual(["upper", "lower"]);
    // Closing the host empties the stack even when a layer would stay.
    layers.push(() => false);
    layers.closeAll();
    expect(layers.size).toBe(0);
  });

  test("ignores other keys, closed overlays and events from outside the overlay", () => {
    const root = doc.createElement("div");
    const outside = doc.createElement("input");
    doc.body.append(root, outside);
    const layers = new LayerStack();
    let closed = 0;
    const state = { open: true, root, layers, closeOverlay: () => { closed += 1; } };
    const outsideEvent = keyEvent(outside);
    expect(handleOverlayEscape(outsideEvent.event, state)).toBe(false);
    expect(outsideEvent.record.stopped).toBe(false);
    expect(handleOverlayEscape({ ...keyEvent(root).event, key: "Enter" }, state)).toBe(false);
    expect(handleOverlayEscape(keyEvent(root).event, { ...state, open: false })).toBe(false);
    expect(handleOverlayEscape({ ...keyEvent(root).event, isComposing: true }, state)).toBe(false);
    expect(closed).toBe(0);
  });
});

describe("overlay controller", () => {
  test("mounts once, opens and closes, and stops Escape before the host sees it", async () => {
    const { createOverlayController } = await import("./controller.js");
    const { FrontendStore } = await import("./store.js");
    const ui: FakeUi = { calls: [], visible: [] };
    const store = new FrontendStore();
    const controller = createOverlayController(fakeCtx(ui), { store, app: testApp(), doc });
    expect(controller.hostKind()).toBeNull();
    controller.open();
    controller.close();
    controller.open();
    expect(ui.calls).toEqual(["mountApp:app-overlay"]);
    expect(controller.hostKind()).toBe("app-overlay");
    expect(store.get().overlayOpen).toBe(true);

    const root = doc.querySelector(`.${OVERLAY_ROOT_CLASS}`) as HTMLElement;
    expect(root.getAttribute("data-state")).toBe("open");
    expect(root.querySelector('[role="tablist"]')).not.toBeNull();
    expect(root.textContent).toContain("Asset analysis");

    let hostSawEscape = false;
    const hostListener = (event: KeyboardEvent) => { if (event.key === "Escape") hostSawEscape = true; };
    win.addEventListener("keydown", hostListener as never);
    root.querySelector("button")!.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event);
    win.removeEventListener("keydown", hostListener as never);
    expect(hostSawEscape).toBe(false);
    expect(controller.isOpen()).toBe(false);
    expect(root.getAttribute("data-state")).toBe("closed");
    expect(ui.visible.at(-1)).toBe(false);

    controller.destroy();
    expect(doc.querySelector(`.${OVERLAY_ROOT_CLASS}`)).toBeNull();
  });

  test("Escape in a search field clears the query before it closes the overlay", async () => {
    const { createOverlayController } = await import("./controller.js");
    const { FrontendStore } = await import("./store.js");
    const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 5)); };
    const app = testApp();
    await app.init();
    const controller = createOverlayController(fakeCtx({ calls: [], visible: [] }), { store: new FrontendStore(), app, doc });
    controller.open();
    await settle();
    const search = () => doc.querySelector<HTMLInputElement>('input[aria-label="Sidebar person search"]')!;
    const escape = () => search().dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }) as unknown as Event);
    search().focus();
    search().value = "ari";
    search().dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);
    // The very next task, before any paint: the field's layer is registered when the render commits.
    await new Promise((resolve) => setTimeout(resolve, 0));

    escape();
    await settle();
    expect({ open: controller.isOpen(), query: search().value }).toEqual({ open: true, query: "" });
    escape();
    expect(controller.isOpen()).toBe(false);
    controller.destroy();
  });

  test("opens the settings area with the Asset Maid navigation", async () => {
    const { createOverlayController } = await import("./controller.js");
    const { FrontendStore } = await import("./store.js");
    const controller = createOverlayController(fakeCtx({ calls: [], visible: [] }), { store: new FrontendStore(), app: testApp(), doc });
    controller.open({ settings: "system" });
    const items = [...doc.querySelectorAll("[data-settings-navigation-item]")].map((item) => item.getAttribute("data-settings-navigation-item"));
    expect(items).toEqual(["analysis-profile", "charx", "all-charx", "model", "image-model", "system"]);
    expect(doc.querySelector('[aria-current="page"]')?.getAttribute("data-settings-navigation-item")).toBe("system");
    controller.destroy();
  });
});

describe("overlay open options", () => {
  test("selects the requested character, then applies the tab to it", async () => {
    const { createOverlayController } = await import("./controller.js");
    const { FrontendStore } = await import("./store.js");
    const app = testApp();
    await app.selectCharacter("char-a");
    const controller = createOverlayController(fakeCtx({ calls: [], visible: [] }), { store: new FrontendStore(), app, doc });
    controller.open({ tab: "prompts", characterId: "char-b" });
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(app.state.selectedCharacterId).toBe("char-b");
    expect(doc.querySelector('[data-workspace-header] [role="tab"][aria-selected="true"]')?.textContent).toBe("Prompts");
    controller.destroy();
  });

  test("a settings request asks before dropping the custom character editor's unsaved edits", async () => {
    const { createOverlayController } = await import("./controller.js");
    const { FrontendStore } = await import("./store.js");
    const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 5)); };
    const app = testApp();
    await app.init();
    const controller = createOverlayController(fakeCtx({ calls: [], visible: [] }), { store: new FrontendStore(), app, doc });
    controller.open();
    await settle();
    doc.querySelector<HTMLButtonElement>('button[aria-label="Shadow figure person menu"]')!.click();
    await settle();
    [...doc.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent?.includes("Edit person"))!.click();
    await settle();
    const title = doc.querySelector<HTMLInputElement>("#character-editor-title")!;
    title.value = "Renamed";
    title.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);
    await settle();

    controller.open({ settings: "system" });
    await settle();
    expect(doc.querySelector("[data-editor-guard]")).not.toBeNull();
    expect(doc.querySelector("[data-settings-navigation-item]")).toBeNull();
    expect(doc.querySelector<HTMLInputElement>("#character-editor-title")?.value).toBe("Renamed");
    controller.destroy();
  });
});

describe("drawer launcher", () => {
  test("the default image connection (\"\") counts as connected; a warning only when none resolves", async () => {
    const { LauncherPanel } = await import("./launcher.js");
    const { FrontendStore } = await import("./store.js");
    const imageStatus = async (edit: (db: MockDb) => void) => {
      const db = createMockDb();
      db.config = { ...db.config, image: { ...db.config.image, connectionId: "" } };
      edit(db);
      const app = new AppController(new RpcClient(createMockBackend({ db, handlers: [coreMockHandlers()] }).transport));
      await app.init();
      const root = doc.createElement("div");
      doc.body.appendChild(root);
      render(<LauncherPanel app={app} store={new FrontendStore()} onOpen={() => undefined} onOpenSettings={() => undefined} corner={{ get: () => "bottom-right", set: () => undefined }} />, root as unknown as Element);
      for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
      const row = [...root.querySelectorAll('section[role="status"] > div')].find((r) => r.firstElementChild?.textContent === LAUNCHER_LABELS.imageProvider);
      const value = row?.lastElementChild?.textContent;
      render(null, root as unknown as Element);
      return value;
    };
    expect(await imageStatus(() => undefined)).toBe("novelai");
    expect(await imageStatus((db) => { db.imageConnections = []; })).toBe(LAUNCHER_LABELS.notConnected);
  });
});

describe("geometry helpers", () => {
  test("places floating content below, or above when there is more room", () => {
    const viewport = { width: 800, height: 600 };
    expect(placeBelow({ top: 100, bottom: 120, left: 10, width: 100 }, { width: 200, height: 100 }, viewport)).toMatchObject({ top: 126, left: 10 });
    const above = placeBelow({ top: 500, bottom: 520, left: 700, width: 100 }, { width: 200, height: 300 }, viewport);
    expect(above.top).toBe(500 - 6 - 300);
    expect(above.left).toBe(800 - 200 - 8);
  });

  test("computes the on-screen keyboard inset", () => {
    expect(keyboardInset({ innerHeight: 800, visualViewport: { height: 500, offsetTop: 0 } })).toBe(300);
    expect(keyboardInset({ innerHeight: 800, visualViewport: null })).toBe(0);
  });
});
