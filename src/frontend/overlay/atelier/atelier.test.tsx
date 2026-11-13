import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { AtelierState } from "../../../shared/contract/atelier.js";
import { AppController } from "../../state/app-state.js";
import { RpcClient } from "../../rpc/client.js";
import { createFullMockBackend } from "../../dev/mock/index.js";
import type { MockBackend } from "../../dev/mock-backend.js";
import { ATELIER_LABELS as L } from "./labels.js";

const win = new Window({ url: "http://localhost/" });
const doc = win.document as unknown as Document;
const frameGlobals = globalThis as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown; CSS?: unknown };
const saved = { request: frameGlobals.requestAnimationFrame, cancel: frameGlobals.cancelAnimationFrame, css: frameGlobals.CSS };
beforeAll(() => {
  frameGlobals.CSS ??= { escape: (value: string) => value.replace(/["\\]/g, "\\$&") };
  frameGlobals.requestAnimationFrame = (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0);
  frameGlobals.cancelAnimationFrame = (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle);
});
afterAll(() => {
  frameGlobals.requestAnimationFrame = saved.request;
  frameGlobals.cancelAnimationFrame = saved.cancel;
  frameGlobals.CSS = saved.css;
  win.happyDOM.abort();
});
afterEach(() => {
  doc.body.replaceChildren();
});

function fakeCtx(): SpindleFrontendContext {
  return {
    ui: {
      mountApp: () => {
        const root = doc.createElement("div");
        doc.body.appendChild(root);
        return { root, mountId: "m1", setVisible: () => undefined, destroy: () => root.remove() };
      }
    }
  } as unknown as SpindleFrontendContext;
}

async function until<T>(read: () => T | null | undefined | false, timeoutMs = 3000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error("until: timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function openOverlay(options: { atelier?: true; settings?: string } = {}) {
  const mock = createFullMockBackend({ timeScale: 0 });
  const app = new AppController(new RpcClient(mock.transport));
  await app.init();
  const { createOverlayController } = await import("../controller.js");
  const { FrontendStore } = await import("../store.js");
  const controller = createOverlayController(fakeCtx(), { store: new FrontendStore(), app, doc });
  controller.open(options as never);
  return { mock, app, controller };
}

const q = (selector: string) => doc.querySelector(selector) as HTMLElement | null;
const button = (text: string, root: ParentNode = doc) => [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text || b.getAttribute("aria-label") === text) as HTMLButtonElement | undefined;

/** Opens the Atelier on the sample user preset (mock fixture id "mock-1"). */
async function openSamplePreset() {
  const opened = await openOverlay({ atelier: true });
  const row = await until(() => q('[data-atelier-preset="mock-1"]'));
  [...row.querySelectorAll("button")].find((b) => b.textContent?.includes("Sample preset"))!.click();
  await until(() => q('[data-atelier-section="expressions"]') && doc.querySelector('[data-atelier-row="mood.tone"]'));
  return opened;
}

describe("Maid Atelier screens (DOM)", () => {
  test("header entry opens the Atelier and the exit button returns to the workspace", async () => {
    const { controller } = await openOverlay();
    const entry = await until(() => q("[data-atelier-entry]"));
    entry.click();
    await until(() => q("[data-ii-atelier]") && q("[data-atelier-sidebar]"));
    expect(q('[data-atelier-preset="default"]')).not.toBeNull();
    (await until(() => q("[data-atelier-exit]"))).click();
    await until(() => q("[data-atelier-entry]"));
    expect(q("[data-ii-atelier]")).toBeNull();
    controller.destroy();
  });

  test("adding a tag group makes the preset dirty; Save writes the document", async () => {
    const { mock, controller } = await openSamplePreset();
    const saveButton = () => q("[data-atelier-save-button]") as HTMLButtonElement;
    expect(saveButton().disabled).toBe(true);
    button(L.expressions.addGroup)!.click();
    await until(() => q('[data-atelier-editor="group"]'));
    await until(() => !saveButton().disabled);
    saveButton().click();
    await until(() => mock.calls.some((c) => c.method === "atelier.documents.save"));
    const call = mock.calls.find((c) => c.method === "atelier.documents.save")!.params as { id: string; json: string };
    expect(call.id).toBe("mock-1");
    expect((JSON.parse(call.json) as { content: { definitions: unknown[] } }).content.definitions).toHaveLength(4);
    await until(() => saveButton().disabled);
    controller.destroy();
  });

  test("a change elsewhere while editing shows the conflict banner; Save edits writes over the latest", async () => {
    const { mock, controller } = await openSamplePreset();
    button(L.expressions.addGroup)!.click();
    await until(() => !(q("[data-atelier-save-button]") as HTMLButtonElement).disabled);
    // Another window changes the same preset.
    await changeElsewhere(mock);
    const banner = await until(() => q("[data-atelier-conflict]"));
    expect(banner.textContent).toContain(L.recovery.conflict);
    button(L.recovery.saveEdits, banner)!.click();
    await until(() => mock.calls.some((c) => c.method === "atelier.documents.save"));
    await until(() => !q("[data-atelier-conflict]"));
    const saved = JSON.parse((mock.calls.find((c) => c.method === "atelier.documents.save")!.params as { json: string }).json) as { title: string; content: { definitions: unknown[] } };
    expect(saved.content.definitions).toHaveLength(4);
    controller.destroy();
  });

  test("leaving with unsaved edits asks first; Discard leaves without saving", async () => {
    const { mock, controller } = await openSamplePreset();
    button(L.expressions.addGroup)!.click();
    await until(() => !(q("[data-atelier-save-button]") as HTMLButtonElement).disabled);
    q("[data-atelier-exit]")!.click();
    const discard = await until(() => q("[data-atelier-discard]"));
    expect(doc.body.textContent).toContain(L.save.guardTitle);
    discard.click();
    await until(() => q("[data-atelier-entry]"));
    expect(mock.calls.some((c) => c.method === "atelier.documents.save")).toBe(false);
    controller.destroy();
  });

  test("import: a file over 2 MiB and an invalid document show the import error dialog", async () => {
    const { mock, controller } = await openOverlay({ atelier: true });
    const input = (await until(() => q("[data-atelier-import-input]"))) as HTMLInputElement;
    const pick = (file: { name: string; size: number; text: () => Promise<string> }) => {
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new win.Event("change", { bubbles: true }) as unknown as Event);
    };
    pick({ name: "huge.json", size: 3 * 1024 * 1024, text: async () => "{}" });
    const errors = await until(() => q("[data-atelier-import-errors]")?.textContent ? q("[data-atelier-import-errors]") : null);
    expect(errors.textContent).toContain(L.importing.tooLarge);
    expect(mock.calls.some((c) => c.method === "atelier.documents.import")).toBe(false);
    button(L.importing.close)!.click();
    await until(() => !q("[data-atelier-import-errors]"));

    pick({ name: "broken.json", size: 20, text: async () => '{"format": "other"}' });
    const second = await until(() => q("[data-atelier-import-errors]")?.textContent ? q("[data-atelier-import-errors]") : null);
    expect(second.textContent).toContain("Unknown document format.");
    controller.destroy();
  });

  test("guidelines: the default directing guideline cannot be deleted; choosing another selects it", async () => {
    const { mock, app, controller } = await openOverlay({ atelier: true });
    (await until(() => q("[data-atelier-guidelines-entry]"))).click();
    const section = await until(() => q('[data-atelier-guideline-kind="scene"]'));
    const defaultRow = section.querySelector('[data-atelier-row="default"]')!;
    expect(defaultRow.textContent).toContain("Default illustration");
    expect(defaultRow.querySelector("[data-atelier-delete]")).toBeNull();
    const povRow = section.querySelector('[data-atelier-row="system-pov"]')!;
    (povRow.querySelector('input[type="radio"]') as HTMLInputElement).click();
    await until(() => mock.calls.some((c) => c.method === "atelier.instructions.select"));
    await until(() => app.state.atelier?.library.scene.selected === "system-pov");
    controller.destroy();
  });

  test("settings analysis page links to the Atelier guidelines instead of the old direction editors", async () => {
    const { controller } = await openOverlay({ settings: "analysis-profile" });
    const card = await until(() => q("[data-guidelines-moved]"));
    expect(q("[data-v5-direction]")).toBeNull();
    (card.querySelector("[data-open-atelier-guidelines]") as HTMLButtonElement).click();
    await until(() => q('[data-atelier-section="guidelines"]'));
    controller.destroy();
  });
});

describe("Maid Atelier screens: AM 0.9.91 changes (DOM)", () => {
  test("import with unsaved edits asks nothing: the draft is saved first, then the file is imported", async () => {
    const { mock, controller } = await openSamplePreset();
    button(L.expressions.addGroup)!.click();
    await until(() => !(q("[data-atelier-save-button]") as HTMLButtonElement).disabled);
    const from = mock.calls.length;
    const input = q("[data-atelier-import-input]") as HTMLInputElement;
    const json = JSON.stringify({ format: "asset-maid-preset", title: "Imported", content: {} });
    Object.defineProperty(input, "files", { configurable: true, value: [{ name: "imported.json", size: json.length, text: async () => json }] });
    input.dispatchEvent(new win.Event("change", { bubbles: true }) as unknown as Event);
    await until(() => mock.calls.some((c, i) => i >= from && c.method === "atelier.documents.import"));
    expect(q("[data-atelier-discard]")).toBeNull();
    expect(doc.body.textContent).not.toContain(L.save.guardTitle);
    const order = mock.calls.slice(from).map((c) => c.method).filter((m) => m === "atelier.documents.save" || m === "atelier.documents.import");
    expect(order).toEqual(["atelier.documents.save", "atelier.documents.import"]);
    const saved = JSON.parse((mock.calls.find((c, i) => i >= from && c.method === "atelier.documents.save")!.params as { json: string }).json) as { content: { definitions: unknown[] } };
    expect(saved.content.definitions).toHaveLength(4);
    controller.destroy();
  });

  test("directing rules list the rules of the preset open in the Atelier, and a toggle edits that preset", async () => {
    const { mock, app, controller } = await openSamplePreset();
    const shownRule = { id: "sample-rule", condition: { direction: "default" }, effect: { kind: "path", action: "remove", path: "actor.text.dialogue" } };
    const withPresetLibraries = (state: AtelierState): AtelierState => {
      const library = JSON.parse(JSON.stringify(state.library)) as AtelierState["library"];
      library.scene.items.default!.system = { options: [], values: {}, rules: [shownRule] } as never;
      return { ...state, presetLibraries: { default: { library: state.library, ownedRuleIds: {} }, "mock-1": { library, ownedRuleIds: { default: ["sample-rule"] } } } };
    };
    const get = mock.handlers["atelier.get"]!;
    mock.handlers["atelier.get"] = async (params, ctx) => ({ state: withPresetLibraries((await get(params, ctx)).state) });
    const current = app.state.atelier!;
    app.applyAtelier(withPresetLibraries({ ...current, storeRevision: current.storeRevision + 1 }));
    ([...doc.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === L.tabs.rules) as HTMLElement).click();
    (await until(() => [...doc.querySelectorAll('[role="radio"]')].find((b) => b.textContent?.trim() === L.rules.directing) as HTMLButtonElement | undefined)).click();
    const row = await until(() => q('[data-atelier-row="sample-rule"]'));
    expect(row.textContent).toContain(L.expressions.scopePreset);
    (row.querySelector('[role="switch"]') as HTMLButtonElement).click();
    await until(() => mock.calls.some((c) => c.method === "atelier.instructions.setSystems"));
    const sent = mock.calls.find((c) => c.method === "atelier.instructions.setSystems")!.params as { presetId?: string; systems: Record<string, { rules: Array<{ id: string; enabled?: boolean }> }> };
    expect(sent.presetId).toBe("mock-1");
    expect(sent.systems.default!.rules).toMatchObject([{ id: "sample-rule", enabled: false }]);
    controller.destroy();
  });
});

async function currentRevision(mock: MockBackend): Promise<number> {
  const result = await mock.handlers["atelier.get"]!({} as never, {} as never);
  return result.state.revision;
}

/** Simulates another window saving the sample preset (mock state change + `atelier.changed`). */
async function changeElsewhere(mock: MockBackend): Promise<void> {
  const revision = await currentRevision(mock);
  const state = (await mock.handlers["atelier.get"]!({} as never, {} as never)).state;
  const stored = JSON.parse(state.catalog.documents.find((d) => d.id === "mock-1")!.json) as Record<string, unknown>;
  const ctx = { emit: mock.emit, fail: (code: string, message: string) => { throw new Error(`${code}: ${message}`); } } as never;
  await mock.handlers["atelier.documents.save"]!({ baseRevision: revision, id: "mock-1", json: JSON.stringify({ ...stored, title: "Changed elsewhere" }) }, ctx);
}
