/**
 * Dev mock handlers for the Maid Atelier (`atelier.*`). An in-memory copy of a real backend state (atelier-fixture.ts)
 * with revision checks (atelier-conflict), simple validation (JSON parse / missing content -> atelier-validation) and
 * `atelier.changed` events. Owner: Atelier screens. Library edits are applied directly to the state (no engine).
 */
import type {
  AtelierChangedEvent,
  AtelierDocumentView,
  AtelierState,
  FreeGenerationKind,
  GuidelineKind,
  PresetDiagnostic
} from "../../../shared/contract/atelier.js";
import type { MockContext, MockHandlers } from "../mock-backend.js";
import { ATELIER_FIXTURE_JSON } from "./atelier-fixture.js";

type Baseline = { document: Record<string, unknown>; builtInJson: string; normalizedRawConfig: Record<string, unknown> };
type Rec = Record<string, unknown>;

export interface AtelierMockState {
  state: AtelierState;
  baseline: Baseline;
}

export function createAtelierMockState(): AtelierMockState {
  return JSON.parse(ATELIER_FIXTURE_JSON) as AtelierMockState;
}

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function diagnostic(message: string, sourcePath = ""): PresetDiagnostic {
  return { code: "invalid", severity: "error", sourcePath, message };
}

/** Mock validation: the JSON must parse, carry `format: "asset-maid-preset"` and an object `content`. */
function validate(json: string): { diagnostics: PresetDiagnostic[]; title?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return { diagnostics: [diagnostic(`JSON parse error: ${(error as Error).message}`)] };
  }
  const doc = parsed as Rec;
  const diagnostics: PresetDiagnostic[] = [];
  if (!doc || typeof doc !== "object" || doc.format !== "asset-maid-preset") diagnostics.push(diagnostic("Unknown document format.", "format"));
  if (doc && typeof doc === "object" && (typeof doc.content !== "object" || doc.content === null)) diagnostics.push(diagnostic("content must be an object.", "content"));
  return { diagnostics, ...(typeof doc?.title === "string" ? { title: doc.title } : {}) };
}

export function atelierMockHandlers(store: AtelierMockState = createAtelierMockState()): MockHandlers {
  let n = 0;
  const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++n}`;
  const state = () => store.state;
  const changed = (ctx: MockContext, reason: AtelierChangedEvent["reason"], bumpCatalog = false) => {
    const s = state();
    if (bumpCatalog) s.revision += 1;
    s.storeRevision += 1;
    ctx.emit("atelier.changed", { revision: s.revision, storeRevision: s.storeRevision, reason });
    return { state: clone(s) };
  };
  const checkRevision = (ctx: MockContext, base: number) => {
    const s = state();
    if (base !== s.revision) ctx.fail("conflict", "The Atelier was changed elsewhere. Load the latest version first.", { detailCode: "atelier-conflict", details: { expectedRevision: base, actualRevision: s.revision } });
  };
  const doc = (ctx: MockContext, id: string): AtelierDocumentView => {
    const found = state().catalog.documents.find((d) => d.id === id);
    if (!found) return ctx.fail("not-found", `No preset ${id}.`);
    return found;
  };
  const requireValid = (ctx: MockContext, json: string) => {
    const { diagnostics } = validate(json);
    if (diagnostics.length) ctx.fail("bad-request", diagnostics[0]!.message, { detailCode: "atelier-validation", details: { diagnostics } });
  };
  const listOf = (kind: GuidelineKind) => (kind === "scene" || kind === "imageRatio" ? state().library[kind] : state().freeGeneration[kind as FreeGenerationKind]) as unknown as { selected: string; items: Record<string, Rec> };
  const refreshMenu = () => {
    const s = state();
    s.directionMenu = {
      ...s.directionMenu,
      selected: s.library.scene.selected,
      options: Object.entries(s.library.scene.items).map(([value, item]) => ({ value, label: item.name, shortLabel: item.name, outputMode: item.outputMode ?? "illustration" }))
    };
  };

  return {
    "atelier.get": async () => ({ state: clone(state()) }),
    "atelier.getBaseline": async () => clone(store.baseline),
    "atelier.validateDocument": async ({ json }) => {
      const { diagnostics, title } = validate(json);
      return { valid: diagnostics.length === 0, diagnostics, ...(title ? { title } : {}), ...(diagnostics.length ? {} : { json }) };
    },
    "atelier.documents.create": async ({ baseRevision, name, duplicateOf, json }, ctx) => {
      checkRevision(ctx, baseRevision);
      const source = duplicateOf ? doc(ctx, duplicateOf).json : json ?? JSON.stringify({ format: "asset-maid-preset", title: name, content: {} });
      requireValid(ctx, source);
      const id = newId("preset");
      state().catalog.documents.push({ id, name, json: source, builtIn: false });
      return { ...changed(ctx, "documents", true), id };
    },
    "atelier.documents.import": async ({ baseRevision, fileName, json, activate }, ctx) => {
      checkRevision(ctx, baseRevision);
      if (new TextEncoder().encode(json).length > MAX_IMPORT_BYTES) ctx.fail("bad-request", "The file is larger than 2 MiB.", { detailCode: "atelier-limit" });
      requireValid(ctx, json);
      const id = newId("preset");
      const title = validate(json).title ?? fileName.replace(/\.json$/iu, "");
      state().catalog.documents.push({ id, name: title, json, builtIn: false });
      if (activate) state().catalog.activeId = id;
      return { ...changed(ctx, "documents", true), id, merged: { scene: [], imageRatio: [], character: [], outfit: [] } };
    },
    "atelier.documents.save": async ({ baseRevision, id, json }, ctx) => {
      checkRevision(ctx, baseRevision);
      requireValid(ctx, json);
      const d = doc(ctx, id);
      d.json = json;
      delete d.readError;
      return changed(ctx, "documents", true);
    },
    "atelier.documents.rename": async ({ baseRevision, id, name }, ctx) => {
      checkRevision(ctx, baseRevision);
      if (!name.trim()) ctx.fail("bad-request", "Enter a preset name.");
      doc(ctx, id).name = name.trim();
      return changed(ctx, "documents", true);
    },
    "atelier.documents.delete": async ({ baseRevision, id }, ctx) => {
      checkRevision(ctx, baseRevision);
      if (id === "default") ctx.fail("bad-request", "The built-in preset cannot be deleted.");
      const s = state();
      s.catalog.documents = s.catalog.documents.filter((d) => d.id !== id);
      if (s.catalog.activeId === id) s.catalog.activeId = "default";
      return changed(ctx, "documents", true);
    },
    "atelier.documents.resetBuiltIn": async ({ baseRevision }, ctx) => {
      checkRevision(ctx, baseRevision);
      doc(ctx, "default").json = store.baseline.builtInJson;
      return changed(ctx, "documents", true);
    },
    "atelier.documents.activate": async ({ baseRevision, id }, ctx) => {
      checkRevision(ctx, baseRevision);
      doc(ctx, id);
      state().catalog.activeId = id;
      return changed(ctx, "documents", true);
    },
    "atelier.documents.export": async ({ id, json }, ctx) => {
      const d = doc(ctx, id);
      return { fileName: `${d.name.replace(/[\\/:*?"<>|]+/gu, "_") || "preset"}.json`, json: json ?? d.json };
    },
    "atelier.documents.rawSource": async ({ id }, ctx) => {
      const d = doc(ctx, id);
      return { fileName: `${d.id}.raw.json`, json: d.json };
    },
    "atelier.instructions.select": async ({ kind, id }, ctx) => {
      const list = listOf(kind);
      if (!list.items[id]) ctx.fail("not-found", "That guideline no longer exists.");
      list.selected = id;
      if (kind === "scene") refreshMenu();
      return changed(ctx, kind === "character" || kind === "outfit" ? "free-generation" : "library");
    },
    "atelier.instructions.create": async ({ kind, copyOf }, ctx) => {
      const list = listOf(kind);
      const id = newId(kind);
      const base = copyOf ? list.items[copyOf] : undefined;
      const item: Rec = base ? { ...clone(base), name: `${String(base.name)} copy` } : { name: "New guideline", instruction: "" };
      if (kind === "scene" && !base) item.outputMode = "illustration";
      if (kind === "imageRatio" && !base) item.allowedSizeIds = [1, 2, 5];
      list.items[id] = item;
      if (kind === "scene") refreshMenu();
      return { ...changed(ctx, kind === "character" || kind === "outfit" ? "free-generation" : "library"), id };
    },
    "atelier.instructions.remove": async ({ kind, id }, ctx) => {
      const list = listOf(kind);
      if (id === "default" || id === "default-comic") ctx.fail("bad-request", "The default guideline cannot be deleted.");
      delete list.items[id];
      if (list.selected === id) list.selected = "default";
      if (kind === "scene") refreshMenu();
      return changed(ctx, kind === "character" || kind === "outfit" ? "free-generation" : "library");
    },
    "atelier.instructions.save": async ({ kind, edits }, ctx) => {
      const list = listOf(kind);
      for (const edit of edits) {
        const item = list.items[edit.id];
        if (!item) ctx.fail("not-found", "That guideline no longer exists.");
        const actual = item[edit.field];
        if (JSON.stringify(actual) !== JSON.stringify(edit.before) && JSON.stringify(actual) !== JSON.stringify(edit.value)) {
          ctx.fail("conflict", "This guideline was changed elsewhere.", { detailCode: "atelier-field-conflict", details: { kind, id: edit.id, field: edit.field, expected: edit.before, actual } });
        }
      }
      for (const edit of edits) {
        const item = list.items[edit.id]!;
        if (edit.value === null) delete item[edit.field];
        else item[edit.field] = edit.value;
      }
      if (kind === "scene") refreshMenu();
      return changed(ctx, kind === "character" || kind === "outfit" ? "free-generation" : "library");
    },
    "atelier.instructions.setOutputMode": async ({ id, mode }, ctx) => {
      const item = state().library.scene.items[id];
      if (!item) return ctx.fail("not-found", "That guideline no longer exists.");
      item.outputMode = mode;
      refreshMenu();
      return changed(ctx, "library");
    },
    "atelier.instructions.setSystems": async ({ systems }, ctx) => {
      for (const [id, system] of Object.entries(systems)) {
        const item = state().library.scene.items[id];
        if (item) item.system = system;
      }
      return { ...changed(ctx, "library"), incomplete: [] };
    },
    "atelier.instructions.setOption": async ({ id, optionId, value }, ctx) => {
      const item = state().library.scene.items[id];
      if (!item) return ctx.fail("not-found", "That guideline no longer exists.");
      const system = (item.system ?? { options: [], values: {}, rules: [] }) as unknown as Rec;
      system.values = { ...(system.values as Rec), [optionId]: value };
      item.system = system as never;
      return changed(ctx, "library");
    },
    "atelier.instructions.setSizes": async ({ id, allowedSizeIds, customSizes }, ctx) => {
      if (!allowedSizeIds.length) ctx.fail("bad-request", "Select at least one image size.");
      const item = state().library.imageRatio.items[id];
      if (!item) return ctx.fail("not-found", "That guideline no longer exists.");
      item.allowedSizeIds = allowedSizeIds;
      if (customSizes?.length) (item as unknown as Rec).customSizes = customSizes;
      return changed(ctx, "library");
    },
    "atelier.instructions.restore": async ({ id }, ctx) => {
      const fixture = createAtelierMockState().state.library.scene.items[id];
      if (!fixture) return ctx.fail("not-found", "This guideline has no provided version.");
      state().library.scene.items[id] = fixture;
      refreshMenu();
      return changed(ctx, "library");
    },
    "atelier.instructions.importLegacyDirections": async ({ baseRevision }, ctx) => {
      checkRevision(ctx, baseRevision);
      return { ...changed(ctx, "library"), created: { scene: [], imageRatio: [] } };
    },
    "atelier.execution.set": async ({ patch }, ctx) => {
      if (patch.controls) state().execution.controls = { ...state().execution.controls, ...patch.controls };
      return changed(ctx, "execution");
    },
    "atelier.execution.setMode": async ({ mode }, ctx) => {
      state().execution.mode = mode;
      return changed(ctx, "execution");
    },
    "atelier.repair": async (_params, ctx) => {
      delete state().readFailures;
      return changed(ctx, "reset");
    }
  };
}
