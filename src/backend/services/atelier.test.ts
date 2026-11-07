import { describe, expect, test } from "bun:test";
import {
  ATELIER_BUILTIN_DOCUMENT_ID,
  BUILTIN_PRESET_JSON,
  PRESET_FORMAT,
  STORAGE_PATHS,
  V5_SCENE_PRESETS,
  type AtelierChangedEvent,
  type InlayConfig,
} from "../../shared/contract/index.js";
import { createFakeHost } from "../testing/fake-host.js";
import { RpcFailure } from "../rpc/errors.js";
import { createAtelierService } from "./atelier.js";
import { createRunLog } from "./run-log.js";
import { createStorageService } from "./storage.js";
import type { EventBus } from "./types.js";

/** A preset document with one bundled directing guideline and one character free-generation guideline. */
const BUNDLED_PRESET = JSON.stringify({
  format: PRESET_FORMAT,
  title: "Noir pack",
  content: {
    analysis: {
      scene: { selected: "noir", items: { noir: { name: "Noir", instruction: "Low-key lighting, hard shadows, rain on the windows.", outputMode: "illustration" } } },
      imageRatio: { selected: "tall", items: { tall: { name: "Tall", instruction: "Prefer portrait sizes.", allowedSizeIds: [1, 2] } } },
      freeGeneration: { character: { selected: "detective", items: { detective: { name: "Detective", instruction: "Hard-boiled detective look.", designInstruction: "Trench coat and fedora." } } } },
    },
  },
});

function setup(files: Record<string, unknown> = {}) {
  const fake = createFakeHost();
  for (const [path, value] of Object.entries(files)) fake.files.set(path, JSON.stringify(value));
  const log = createRunLog();
  const storage = createStorageService(fake.host, fake.userId, { log });
  const events: Array<[string, AtelierChangedEvent]> = [];
  const bus = { emit: (event: string, payload: AtelierChangedEvent) => events.push([event, payload]) } as unknown as EventBus;
  let n = 0;
  const atelier = createAtelierService({ storage, events: bus, log, now: () => new Date("2026-11-01T10:00:00Z"), newId: () => `id-${++n}` });
  const stored = () => JSON.parse(fake.files.get(STORAGE_PATHS.atelier) as string);
  return { fake, storage, log, events, atelier, stored };
}

async function rejects(promise: Promise<unknown>): Promise<RpcFailure["error"]> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RpcFailure) return error.error;
    throw error;
  }
  throw new Error("expected a rejection");
}

describe("atelier store", () => {
  test("first read creates config/atelier.json with the built-in preset only", async () => {
    const { atelier, stored, events } = setup();
    const state = await atelier.getState();
    expect(state.catalog.activeId).toBe(ATELIER_BUILTIN_DOCUMENT_ID);
    expect(state.catalog.documents.map((d) => [d.id, d.builtIn])).toEqual([[ATELIER_BUILTIN_DOCUMENT_ID, true]]);
    expect(state.library.scene.selected).toBe("default");
    expect(Object.keys(state.library.scene.items)).toEqual(expect.arrayContaining(["default", "default-comic", "system-pov", "system-ensemble"]));
    expect(state.freeGeneration.character.selected).toBe("default");
    expect(state.execution).toEqual({ mode: "default", controls: {} });
    expect(state.migrations).toBeUndefined();
    expect(stored()).toMatchObject({ schema: "inlay-illustrator.atelier", version: 1, storeRevision: 0 });
    expect(events).toEqual([]);
  });

  test("an invalid stored preset list is backed up and replaced by the built-in list", async () => {
    const { atelier, fake, log } = setup({ [STORAGE_PATHS.atelier]: { schema: "inlay-illustrator.atelier", version: 1, storeRevision: 4, catalog: { revision: 2, activeId: "gone", documents: [] } } });
    await atelier.createGuideline({ kind: "scene" });
    const backups = [...fake.files.keys()].filter((k) => k.startsWith("config/legacy/atelier-"));
    expect(backups.length).toBe(1);
    expect(JSON.parse(fake.files.get(backups[0]!) as string).catalog.activeId).toBe("gone");
    expect((await atelier.getState()).catalog.activeId).toBe(ATELIER_BUILTIN_DOCUMENT_ID);
    expect(log.list().some((e) => e.level === "warn" && e.scope === "atelier")).toBe(true);
  });

  test("an unparseable file (truncated write) is kept in config/legacy/ and reset, so the Atelier and Repair work", async () => {
    const { atelier, fake, stored } = setup();
    const truncated = '{"schema":"inlay-illustrator.atelier","version":1,"catalog":{"rev';
    fake.files.set(STORAGE_PATHS.atelier, truncated);
    const state = await atelier.getState();
    expect(state.catalog.activeId).toBe(ATELIER_BUILTIN_DOCUMENT_ID);
    const backups = [...fake.files.keys()].filter((k) => k.startsWith("config/legacy/atelier-"));
    expect(backups.length).toBe(1);
    expect(new TextDecoder().decode(fake.files.get(backups[0]!) as Uint8Array)).toBe(truncated);
    expect(stored().schema).toBe("inlay-illustrator.atelier");
    // A write (Repair included) works on the same corruption too.
    fake.files.set(STORAGE_PATHS.atelier, truncated);
    await atelier.repair({ part: "catalog" });
    expect(stored().catalog.activeId).toBe(ATELIER_BUILTIN_DOCUMENT_ID);
  });
});

describe("atelier documents", () => {
  test("create, rename, activate, delete with revision checks and change events", async () => {
    const { atelier, events } = setup();
    const s0 = await atelier.getState();
    const { state: s1, id } = await atelier.createDocument({ baseRevision: s0.revision, name: "  " });
    expect(s1.revision).toBe(s0.revision + 1);
    expect(s1.catalog.documents.find((d) => d.id === id)!.name).toBe("New preset");
    const { state: s2 } = await atelier.renameDocument({ baseRevision: s1.revision, id, name: "Evening" });
    expect(s2.catalog.documents.find((d) => d.id === id)!.name).toBe("Evening");
    // A stale base revision is a conflict with the AM diagnostic shape.
    const stale = await rejects(atelier.activateDocument({ baseRevision: s1.revision, id }));
    expect(stale.code).toBe("conflict");
    expect(stale.detailCode).toBe("atelier-conflict");
    expect(stale.details).toMatchObject({ expectedRevision: s1.revision, actualRevision: s2.revision });
    const { state: s3 } = await atelier.activateDocument({ baseRevision: s2.revision, id });
    expect(s3.catalog.activeId).toBe(id);
    const { state: s4 } = await atelier.deleteDocument({ baseRevision: s3.revision, id });
    expect(s4.catalog.activeId).toBe(ATELIER_BUILTIN_DOCUMENT_ID);
    expect((await rejects(atelier.deleteDocument({ baseRevision: s4.revision, id: ATELIER_BUILTIN_DOCUMENT_ID }))).code).toBe("bad-request");
    expect(events.map(([e, p]) => [e, p.reason])).toEqual([
      ["atelier.changed", "documents"],
      ["atelier.changed", "documents"],
      ["atelier.changed", "documents"],
      ["atelier.changed", "documents"],
    ]);
    expect(events.map(([, p]) => p.storeRevision)).toEqual([1, 2, 3, 4]);
  });

  test("duplicate names the copy and keeps the source JSON; reset restores the built-in", async () => {
    const { atelier } = setup();
    const s0 = await atelier.getState();
    const edited = JSON.stringify({ format: PRESET_FORMAT, title: "Edited", content: {} });
    const { state: s1 } = await atelier.saveDocument({ baseRevision: s0.revision, id: ATELIER_BUILTIN_DOCUMENT_ID, json: edited });
    const { state: s2, id } = await atelier.createDocument({ baseRevision: s1.revision, name: "", duplicateOf: ATELIER_BUILTIN_DOCUMENT_ID });
    const copy = s2.catalog.documents.find((d) => d.id === id)!;
    expect(copy.name).toBe("기본 프리셋 copy");
    expect(JSON.parse(copy.json).title).toBe("Edited");
    const { state: s3 } = await atelier.resetBuiltInDocument({ baseRevision: s2.revision });
    expect(JSON.parse(s3.catalog.documents.find((d) => d.id === ATELIER_BUILTIN_DOCUMENT_ID)!.json)).toEqual(JSON.parse(BUILTIN_PRESET_JSON));
  });

  test("import activates the document and merges its bundled guidelines into the library under new ids", async () => {
    const { atelier } = setup();
    const s0 = await atelier.getState();
    const { state, id, merged } = await atelier.importDocument({ baseRevision: s0.revision, fileName: "noir.json", json: BUNDLED_PRESET });
    expect(state.catalog.activeId).toBe(id);
    expect(state.catalog.documents.find((d) => d.id === id)!.name).toBe("Noir pack");
    expect(merged.scene.length).toBe(1);
    expect(merged.imageRatio.length).toBe(1);
    expect(merged.character.length).toBe(1);
    const scene = state.library.scene.items[merged.scene[0]!]!;
    expect(scene.instruction).toBe("Low-key lighting, hard shadows, rain on the windows.");
    expect(state.library.imageRatio.items[merged.imageRatio[0]!]!.allowedSizeIds).toEqual([1, 2]);
    expect(state.freeGeneration.character.items[merged.character[0]!]).toMatchObject({ instruction: "Hard-boiled detective look.", designInstruction: "Trench coat and fedora." });
    // The bundle keys are not reused as ids.
    expect(merged.scene[0]).not.toBe("noir");
  });

  test("import rejects malformed and oversized JSON with English messages", async () => {
    const { atelier } = setup();
    const s0 = await atelier.getState();
    const bad = await rejects(atelier.importDocument({ baseRevision: s0.revision, fileName: "x.json", json: "{nope" }));
    expect(bad.code).toBe("bad-request");
    expect(bad.detailCode).toBe("atelier-validation");
    expect(bad.message).not.toMatch(/[가-힣]/u);
    const huge = JSON.stringify({ format: PRESET_FORMAT, title: "big", content: { pad: "x".repeat(2 * 1024 * 1024 + 10) } });
    expect((await rejects(atelier.importDocument({ baseRevision: s0.revision, fileName: "big.json", json: huge }))).code).toBe("bad-request");
    const deep = JSON.stringify({ format: PRESET_FORMAT, title: "deep", content: { a: JSON.parse("[".repeat(60) + "]".repeat(60)) } });
    expect((await rejects(atelier.importDocument({ baseRevision: s0.revision, fileName: "deep.json", json: deep }))).code).toBe("bad-request");
    expect((await atelier.getState()).catalog.documents.length).toBe(1);
  });

  test("export bundles the selected guidelines in the asset-maid-preset envelope; raw source is the stored JSON", async () => {
    const { atelier } = setup();
    const s0 = await atelier.getState();
    const { state, id, merged } = await atelier.importDocument({ baseRevision: s0.revision, fileName: "noir.json", json: BUNDLED_PRESET });
    await atelier.renameDocument({ baseRevision: state.revision, id, name: "Noir: v2" });
    const out = await atelier.exportDocument({ id, selection: { scene: [merged.scene[0]!], imageRatio: [] } });
    expect(out.fileName).toBe("Noir_ v2.json");
    const doc = JSON.parse(out.json);
    expect(doc.format).toBe(PRESET_FORMAT);
    const scenes = Object.values(doc.content.analysis.scene.items) as Array<{ instruction: string }>;
    expect(scenes.map((s) => s.instruction)).toEqual(["Low-key lighting, hard shadows, rain on the windows."]);
    // Re-importing the export gives the same guideline again (new id).
    const s2 = await atelier.getState();
    const again = await atelier.importDocument({ baseRevision: s2.revision, fileName: out.fileName, json: out.json, activate: false });
    expect(again.state.catalog.activeId).toBe(id);
    expect(again.merged.scene.length).toBe(1);
    const raw = await atelier.rawSource({ id });
    expect(raw.fileName).toBe("Noir_ v2.source.json");
    expect(raw.json).toBe(state.catalog.documents.find((d) => d.id === id)!.json);
  });

  test("validateDocument reports diagnostics and the bundled guideline count", async () => {
    const { atelier } = setup();
    expect(atelier.validateDocument(BUNDLED_PRESET)).toMatchObject({ valid: true, title: "Noir pack", bundled: { count: 3 } });
    const invalid = atelier.validateDocument(JSON.stringify({ format: "other", content: {} }));
    expect(invalid.valid).toBe(false);
    expect(invalid.diagnostics.length).toBeGreaterThan(0);
  });
});

describe("atelier guideline library", () => {
  test("create, edit, select and remove a directing guideline", async () => {
    const { atelier, events } = setup();
    const { id } = await atelier.createGuideline({ kind: "scene" });
    let state = await atelier.getState();
    expect(state.library.scene.items[id]).toMatchObject({ name: "New guideline", outputMode: "illustration" });
    state = (await atelier.saveGuidelines({ kind: "scene", edits: [
      { id, field: "name", before: "New guideline", value: "Rooftop" },
      { id, field: "instruction", before: "", value: "Wide rooftop shot at dusk." },
    ] })).state;
    expect(state.library.scene.items[id]).toMatchObject({ name: "Rooftop", instruction: "Wide rooftop shot at dusk." });
    state = (await atelier.selectGuideline({ kind: "scene", id })).state;
    expect(state.library.scene.selected).toBe(id);
    expect(state.directionMenu.selected).toBe(id);
    state = (await atelier.removeGuideline({ kind: "scene", id })).state;
    expect(state.library.scene.items[id]).toBeUndefined();
    expect(state.library.scene.selected).toBe("default");
    expect(events.every(([, p]) => p.reason === "library")).toBe(true);
  });

  test("a field edit against a value changed elsewhere is a field conflict; the same value is accepted", async () => {
    const { atelier } = setup();
    const { id } = await atelier.createGuideline({ kind: "scene" });
    await atelier.saveGuidelines({ kind: "scene", edits: [{ id, field: "instruction", before: "", value: "A" }] });
    const conflict = await rejects(atelier.saveGuidelines({ kind: "scene", edits: [{ id, field: "instruction", before: "", value: "B" }] }));
    expect(conflict.code).toBe("conflict");
    expect(conflict.detailCode).toBe("atelier-field-conflict");
    expect(conflict.details).toMatchObject({ kind: "scene", id, field: "instruction", expected: "", actual: "A" });
    expect(conflict.message).toContain("changed in another screen");
    await atelier.saveGuidelines({ kind: "scene", edits: [{ id, field: "instruction", before: "", value: "A" }] });
    expect((await atelier.getState()).library.scene.items[id]!.instruction).toBe("A");
  });

  test("built-in guidelines keep their fixed fields", async () => {
    const { atelier } = setup();
    expect((await rejects(atelier.removeGuideline({ kind: "scene", id: "default" }))).message).toBe("Default guidelines must be kept.");
    expect((await rejects(atelier.setOutputMode({ id: "default", mode: "comic" }))).message).toBe("The format of a default guideline is fixed.");
    expect((await rejects(atelier.removeGuideline({ kind: "imageRatio", id: "default" }))).code).toBe("bad-request");
  });

  test("ratio guideline sizes and the comic output mode", async () => {
    const { atelier } = setup();
    const { id } = await atelier.createGuideline({ kind: "imageRatio" });
    let state = (await atelier.setSizes({ id, allowedSizeIds: [2] })).state;
    expect(state.library.imageRatio.items[id]!.allowedSizeIds).toEqual([2]);
    expect((await rejects(atelier.setSizes({ id, allowedSizeIds: [] }))).message).toBe("Select at least one image size.");
    const scene = await atelier.createGuideline({ kind: "scene" });
    state = (await atelier.setOutputMode({ id: scene.id, mode: "comic" })).state;
    expect(state.library.scene.items[scene.id]!.outputMode).toBe("comic");
  });

  test("execution controls and the illustration/comic switch", async () => {
    const { atelier, storage, events } = setup();
    let state = (await atelier.setExecution({ patch: { controls: { "pov.hands": true } } })).state;
    expect(state.execution.controls).toEqual({ "pov.hands": true });
    state = (await atelier.setExecutionMode({ mode: "comic" })).state;
    expect(state.library.scene.selected).toBe("default-comic");
    state = (await atelier.setExecutionMode({ mode: "default" })).state;
    expect(state.library.scene.selected).toBe("default");
    await atelier.setExecution({ patch: { resolution: { id: 2, width: 1216, height: 832 }, aiCoordinates: false } });
    expect((await storage.loadConfig()).runtime.analysisExecution).toEqual({ resolution: { id: 2, width: 1216, height: 832 }, aiCoordinates: false });
    expect(events.map(([, p]) => p.reason)).toEqual(["execution", "execution", "execution"]);
    expect((await atelier.runtimeOverlay()).execution.controls).toEqual({ "pov.hands": true });
  });

  test("free-generation guidelines: create, edit with field check, select, remove", async () => {
    const { atelier } = setup();
    const { id } = await atelier.createGuideline({ kind: "outfit" });
    let state = (await atelier.saveGuidelines({ kind: "outfit", edits: [
      { id, field: "instruction", before: undefined, value: "Seasonal streetwear." },
      { id, field: "designInstruction", before: undefined, value: "Layered, muted colors." },
    ] })).state;
    expect(state.freeGeneration.outfit.items[id]).toMatchObject({ name: "New outfit guideline", instruction: "Seasonal streetwear." });
    state = (await atelier.selectGuideline({ kind: "outfit", id })).state;
    expect(state.freeGeneration.outfit.selected).toBe(id);
    expect((await atelier.runtimeOverlay()).freeGenerationLibrary?.outfit?.selected).toBe(id);
    const conflict = await rejects(atelier.saveGuidelines({ kind: "outfit", edits: [{ id, field: "instruction", before: "old", value: "new" }] }));
    expect(conflict.detailCode).toBe("atelier-field-conflict");
    state = (await atelier.removeGuideline({ kind: "outfit", id })).state;
    expect(state.freeGeneration.outfit.selected).toBe("default");
  });

  test("concurrent writes are serialized (no lost update)", async () => {
    const { atelier, stored } = setup();
    await atelier.getState();
    const ids = await Promise.all([1, 2, 3, 4].map(() => atelier.createGuideline({ kind: "scene" }).then((r) => r.id)));
    const state = await atelier.getState();
    for (const id of ids) expect(state.library.scene.items[id]).toBeDefined();
    expect(stored().storeRevision).toBe(4);
  });
});

describe("legacy V5 directions migration (0.9.89 -> Atelier guideline library)", () => {
  /** Realistic 0.9.89 data: text added to the built-in illustration preset, an own preset (selected), edited ratio sizes. */
  function legacyDirections(config: InlayConfig): InlayConfig {
    const d = structuredClone(config.novelai.v5UserDirections);
    const def = d.scene.presets.find((p) => p.id === "scene-default")!;
    def.customInstruction = { enabled: true, text: "Always keep both hands visible." };
    d.scene.presets.push({ id: "scene-user-7", name: "느와르", instruction: "Film noir: low-key lighting, venetian blind shadows, rain." });
    d.scene.selectedPresetId = "scene-user-7";
    const ratio = d.imageRatio.presets.find((p) => p.id === "image-ratio-default")!;
    ratio.allowedSizeIds = [2, 5];
    return { ...config, novelai: { ...config.novelai, v5UserDirections: d } };
  }

  test("own and edited presets become guidelines once; the previously selected preset stays selected", async () => {
    const { atelier, storage, stored, log } = setup();
    await storage.updateConfig(legacyDirections);
    const state = await atelier.getState();
    const created = state.migrations!.legacyDirections!;
    expect(created.scene.length).toBe(2);
    expect(created.imageRatio.length).toBe(1);
    const scenes = created.scene.map((id) => state.library.scene.items[id]!);
    // Imported names follow AM's merge (a name taken in the library gets the document title as prefix).
    expect(scenes.map((s) => s.name).sort()).toEqual(["Previous directions · Illustration", "느와르"]);
    const noirId = created.scene.find((id) => state.library.scene.items[id]!.name === "느와르")!;
    expect(state.library.scene.items[noirId]!.instruction).toContain("Film noir");
    const illustration = scenes.find((s) => s.name.endsWith("Illustration"))!;
    expect(JSON.stringify(illustration)).toContain("Always keep both hands visible.");
    expect(state.library.scene.selected).toBe(noirId);
    expect(state.library.imageRatio.items[created.imageRatio[0]!]!.allowedSizeIds).toEqual([2, 5]);
    // Unchanged built-ins (POV, ensemble, comic, unspecified) are not copied.
    expect(Object.values(state.library.scene.items).filter((s) => s.instruction === V5_SCENE_PRESETS.find((p) => p.id === "scene-pov")!.instruction)).toEqual([]);
    expect(log.list().some((e) => e.scope === "atelier" && e.message.includes("Imported the previous directing guidelines"))).toBe(true);
    // The legacy text stays readable in the settings.
    expect((await storage.loadConfig()).novelai.v5UserDirections.scene.selectedPresetId).toBe("scene-user-7");
    // Once: a later read does not import again.
    const before = stored();
    await atelier.getState();
    expect(stored()).toEqual(before);
  });

  test("a selected unchanged built-in POV preset maps to the provided POV guideline; nothing is imported", async () => {
    const { atelier, storage } = setup();
    await storage.updateConfig((config) => {
      const d = structuredClone(config.novelai.v5UserDirections);
      d.scene.selectedPresetId = "scene-pov";
      return { ...config, novelai: { ...config.novelai, v5UserDirections: d } };
    });
    const state = await atelier.getState();
    expect(state.library.scene.selected).toBe("system-pov");
    expect(state.migrations?.legacyDirections).toMatchObject({ scene: [], imageRatio: [] });
  });

  test("default directions import nothing and leave the defaults selected", async () => {
    const { atelier, stored } = setup();
    const state = await atelier.getState();
    expect(state.library.scene.selected).toBe("default");
    expect(stored().migrations).toBeUndefined();
    expect(stored().instructionChanges).toBeUndefined();
  });

  test("importLegacyDirections imports again on request (new ids, selection kept)", async () => {
    const { atelier, storage } = setup();
    await storage.updateConfig(legacyDirections);
    const s0 = await atelier.getState();
    const { state, created } = await atelier.importLegacyDirections({ baseRevision: s0.revision });
    expect(created.scene.length).toBe(2);
    expect(state.library.scene.selected).toBe(s0.library.scene.selected);
    expect(Object.keys(state.library.scene.items).length).toBe(Object.keys(s0.library.scene.items).length + 2);
  });
});
