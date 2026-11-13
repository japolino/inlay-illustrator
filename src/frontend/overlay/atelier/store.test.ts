import { describe, expect, test } from "bun:test";
import type { AtelierState } from "../../../shared/contract/atelier.js";
import { createFullMockBackend } from "../../dev/mock/index.js";
import { RpcClient } from "../../rpc/client.js";
import { AppController } from "../../state/app-state.js";
import { ATELIER_LABELS as L } from "./labels.js";
import { parsePreset } from "./model.js";
import { AtelierStore } from "./store.js";

async function until<T>(read: () => T | null | undefined | false, timeoutMs = 3000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error("until: timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function openStore() {
  const mock = createFullMockBackend({ timeScale: 0 });
  const app = new AppController(new RpcClient(mock.transport));
  await app.init();
  const store = new AtelierStore(app);
  await store.open();
  store.selectDocument("mock-1");
  return { mock, app, store };
}

describe("Maid Atelier store", () => {
  test("edits made while a save is in flight survive it; toggles made meanwhile are saved next", async () => {
    const { mock, app, store } = await openStore();
    const original = mock.handlers["atelier.documents.save"]!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mock.handlers["atelier.documents.save"] = async (params, ctx) => {
      await gate;
      return original(params, ctx);
    };
    const saves = () => mock.calls.filter((c) => c.method === "atelier.documents.save").map((c) => parsePreset((c.params as { json: string }).json).doc?.title);
    store.edit((doc) => ({ ...doc, title: "A" }), "auto");
    await until(() => saves().length === 1);
    store.edit((doc) => ({ ...doc, title: "B" }), "auto");
    release();
    await until(() => saves().length === 2);
    expect(saves()).toEqual(["A", "B"]);
    expect(store.snapshot.draft?.doc?.title).toBe("B");
    await until(() => !store.snapshot.saving && !store.snapshot.draft?.dirty);
    expect(parsePreset(app.state.atelier!.catalog.documents.find((d) => d.id === "mock-1")!.json).doc?.title).toBe("B");
    app.destroy();
  });

  test("busy stays on while any of several overlapping calls runs", async () => {
    const { mock, app, store } = await openStore();
    let release!: () => void;
    let n = 0;
    mock.handlers["atelier.instructions.setOption"] = async () => {
      if (n++ === 0) await new Promise<void>((resolve) => (release = resolve));
      return { state: app.state.atelier! } as never;
    };
    const first = store.setOption("default", "a", true);
    await store.setOption("default", "b", true);
    expect(store.snapshot.busy).toBe(true);
    release();
    await first;
    expect(store.snapshot.busy).toBe(false);
    app.destroy();
  });
});

/* ------------------------------------------------------------------------------------------------ AM 0.9.91 */

type StateEdit = (state: AtelierState) => void;
/** Applies a changed copy of the current state (as an `atelier.changed` reload would). */
function applyChanged(app: AppController, edit: StateEdit): AtelierState {
  const next = JSON.parse(JSON.stringify(app.state.atelier)) as AtelierState;
  edit(next);
  next.storeRevision += 1;
  app.applyAtelier(next);
  return next;
}
const rule = (id: string, direction = "default") => ({ id, condition: { direction }, effect: { kind: "path", action: "remove", path: "actor.text.dialogue" } });
/** Sets the directing rules (`content.analysis.scene.rules`) and optionally the title of the stored "mock-1". */
function storedMock1(rules: unknown, title?: string): StateEdit {
  return (state) => {
    const doc = state.catalog.documents.find((d) => d.id === "mock-1")!;
    const parsed = JSON.parse(doc.json) as { title?: string; content: { analysis?: { scene: Record<string, unknown>; imageRatio: Record<string, unknown> } } };
    parsed.content.analysis ??= { scene: { selected: "default", items: {} }, imageRatio: { selected: "default", items: {} } };
    if (rules === undefined) delete parsed.content.analysis.scene.rules;
    else parsed.content.analysis.scene.rules = rules;
    if (title !== undefined) parsed.title = title;
    doc.json = JSON.stringify(parsed);
    state.revision += 1;
  };
}
/** "mock-1" stored with rules A, and a dirty draft (title edited) on top of it. */
async function dirtyDraftWithRules() {
  const opened = await openStore();
  applyChanged(opened.app, storedMock1({ default: [rule("rule-a")] }));
  expect(opened.store.snapshot.draft?.dirty).toBe(false);
  opened.store.edit((doc) => ({ ...doc, title: "Mine" }), "draft");
  expect(opened.store.snapshot.draft?.dirty).toBe(true);
  return opened;
}
const draftRules = (store: AtelierStore) => (store.snapshot.draft?.doc?.content.analysis as { scene?: { rules?: unknown } } | undefined)?.scene?.rules;

describe("Maid Atelier store: rule-only catalog changes are rebased into a dirty draft (AM 0.9.91 pct / Jlt_91)", () => {
  test("a stored change of the directing rules only keeps the edit, takes the new rules and stays saveable", async () => {
    const { app, store, mock } = await dirtyDraftWithRules();
    const next = applyChanged(app, storedMock1({ default: [rule("rule-a"), rule("rule-b")] }));
    const stored = next.catalog.documents.find((d) => d.id === "mock-1")!.json;
    expect(store.snapshot.stale).toBe(false);
    expect(store.snapshot.draft).toMatchObject({ dirty: true, baseJson: stored, rawText: null });
    expect(store.snapshot.draft?.doc?.title).toBe("Mine");
    expect(draftRules(store)).toEqual({ default: [rule("rule-a"), rule("rule-b")] });
    // Rules removed from the stored document are removed from the draft too.
    applyChanged(app, storedMock1(undefined));
    expect(store.snapshot.stale).toBe(false);
    expect(draftRules(store)).toBeUndefined();
    // Save stays available (not stale) and would write the edit on the new base.
    expect(parsePreset(store.draftJson().json!).doc?.title).toBe("Mine");
    expect(mock.calls.some((c) => c.method === "atelier.documents.save")).toBe(false);
    app.destroy();
  });

  test("a change outside the rules still marks the draft stale", async () => {
    const { app, store } = await dirtyDraftWithRules();
    applyChanged(app, storedMock1({ default: [rule("rule-b")] }, "Changed elsewhere"));
    expect(store.snapshot.stale).toBe(true);
    expect(draftRules(store)).toEqual({ default: [rule("rule-a")] });
    app.destroy();
  });

  test("an open raw editor with edited text still goes stale; an unedited one takes the stored JSON", async () => {
    const edited = await dirtyDraftWithRules();
    edited.store.setRawText('{"format":"asset-maid-preset","content":{}}');
    applyChanged(edited.app, storedMock1({ default: [rule("rule-b")] }));
    expect(edited.store.snapshot.stale).toBe(true);
    edited.app.destroy();

    const unedited = await dirtyDraftWithRules();
    unedited.store.setRawText(unedited.store.snapshot.draft!.baseJson);
    const next = applyChanged(unedited.app, storedMock1({ default: [rule("rule-b")] }));
    const stored = next.catalog.documents.find((d) => d.id === "mock-1")!.json;
    expect(unedited.store.snapshot.stale).toBe(false);
    expect(unedited.store.snapshot.draft?.rawText).toBe(stored);
    expect(unedited.store.snapshot.draft?.baseJson).toBe(stored);
    unedited.app.destroy();
  });
});

describe("Maid Atelier store: guideline edits follow the preset open in the Atelier (AM 0.9.91 qst(e, shownId))", () => {
  test("library calls send the open preset's id; restore and field values read that preset's library", async () => {
    const { app, store, mock } = await openStore();
    const shownPov = { ...app.state.atelier!.library.scene.items["system-pov"]!, system: { options: [], values: {}, rules: [rule("mock-rule", "system-pov")] } };
    applyChanged(app, (state) => {
      const library = JSON.parse(JSON.stringify(state.library)) as AtelierState["library"];
      library.scene.items["system-pov"] = shownPov as never;
      library.scene.items.default!.instruction = "Seen from mock-1";
      state.presetLibraries = { default: { library: state.library, ownedRuleIds: {} }, "mock-1": { library, ownedRuleIds: { "system-pov": ["mock-rule"] } } };
    });
    expect(store.presetLibrary()?.ownedRuleIds).toEqual({ "system-pov": ["mock-rule"] });
    expect(store.guidelineValue("scene", "default", "instruction")).toBe("Seen from mock-1");
    // (The mock answers without presetLibraries, so restore, which reads the shown library, goes first.)
    await store.restoreGuideline("system-pov");
    await store.setSystem("default", { options: [], values: {}, rules: [] });
    await store.setOption("system-pov", "x", true);
    const params = (method: string) => mock.calls.filter((c) => c.method === method).at(-1)!.params as Record<string, unknown>;
    expect(params("atelier.instructions.setSystems").presetId).toBe("mock-1");
    expect(params("atelier.instructions.setOption").presetId).toBe("mock-1");
    expect(params("atelier.instructions.restore")).toMatchObject({ id: "system-pov", presetId: "mock-1", expected: shownPov });
    store.selectDocument("default");
    await store.selectGuideline("scene", "default");
    expect(params("atelier.instructions.select").presetId).toBe("default");
    app.destroy();
  });
});

describe("Maid Atelier store: import saves pending edits, reloads, then imports (AM 0.9.91 hct.xr / Ict)", () => {
  const file = (json: string) => ({ name: "imported.json", size: json.length, text: async () => json });
  const IMPORTED = JSON.stringify({ format: "asset-maid-preset", title: "Imported", content: {} });

  test("validate, save the dirty draft, reload, import with the reloaded revision", async () => {
    const { app, store, mock } = await openStore();
    store.edit((doc) => ({ ...doc, title: "Mine" }), "draft");
    const from = mock.calls.length;
    const result = await store.importFile(file(IMPORTED));
    expect(result.ok).toBe(true);
    const calls = mock.calls.slice(from).map((c) => c.method);
    expect(calls.filter((m) => ["atelier.validateDocument", "atelier.documents.save", "atelier.get", "atelier.documents.import"].includes(m))).toEqual(["atelier.validateDocument", "atelier.documents.save", "atelier.get", "atelier.documents.import"]);
    const saved = mock.calls.find((c, i) => i >= from && c.method === "atelier.documents.save")!.params as { json: string };
    expect(parsePreset(saved.json).doc?.title).toBe("Mine");
    const imported = mock.calls.find((c, i) => i >= from && c.method === "atelier.documents.import")!.params as { baseRevision: number; activate: boolean };
    expect(imported.activate).toBe(true);
    expect(app.state.atelier!.catalog.documents.find((d) => d.id === store.snapshot.documentId)?.name).toBeDefined();
    expect(store.snapshot.documentId).toBe(app.state.atelier!.catalog.activeId);
    app.destroy();
  });

  test("a failed save stops the import; an invalid file saves nothing", async () => {
    const { app, store, mock } = await openStore();
    store.edit((doc) => ({ ...doc, title: "Mine" }), "draft");
    mock.handlers["atelier.documents.save"] = async (_params, ctx) => ctx.fail("storage-error", "disk full");
    expect(await store.importFile(file(IMPORTED))).toEqual({ ok: false, errors: [L.importing.saveFailed] });
    expect(mock.calls.some((c) => c.method === "atelier.documents.import")).toBe(false);
    const invalid = await store.importFile(file('{"format":"other","content":{}}'));
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(" ")).toContain("Unknown document format.");
    expect(mock.calls.filter((c) => c.method === "atelier.documents.save").length).toBe(1);
    app.destroy();
  });
});
