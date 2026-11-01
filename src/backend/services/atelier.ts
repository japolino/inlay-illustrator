/**
 * AtelierService: the Maid Atelier store (`config/atelier.json`) and every write to it (spec am990
 * atelier-data.md §2, §4; RPC list in spec/atelier-rpc.md).
 *
 * The file holds AM's `presetCatalog.atelier`, `runtime.instructionChanges`, `runtime.freeGenerationLibrary`
 * (+ legacy `freeGenerationInstructions`) and the execution mode / controls, written together (AM commits them in one
 * settings-domain update). Every operation rebuilds the AM config snapshot (`amOf`), runs the verbatim AM logic
 * (`src/engine/v5/atelier.ts`: `_be` for documents, `hS` for the library, `Dv`/`YX` for free generation, `gAe` for the
 * mode switch) and stores the parts back (`storeFrom`). Writes are serialized per storage; `storeRevision` +1 per
 * write; `catalog.revision` follows AM (`_be` base + 1, `v2e` + 1). Each write emits `atelier.changed`.
 *
 * Optimistic checks: document operations carry `baseRevision` (= `catalog.revision` the UI rendered; mismatch ->
 * `conflict` / `atelier-conflict`); guideline field edits carry `before` (AM field check, `atelier-field-conflict`);
 * selections, toggles and creates are last-writer-wins like AM's automatic updates.
 *
 * Migrations (once, when the file is created): the legacy `novelai.v5UserDirections` text the user wrote or added to
 * a built-in direction becomes guideline library items (port decision, see PORT-MAP.md), selected like before.
 */
import {
  ANALYSIS_RECORD_MAX_BYTES,
  ATELIER_BUILTIN_DOCUMENT_ID,
  ATELIER_MAX_DOCUMENTS,
  ATELIER_MAX_TOTAL_BYTES,
  ATELIER_SCHEMA,
  ATELIER_VERSION,
  BUILTIN_PRESET_JSON,
  FREE_GENERATION_KINDS,
  PRESET_FORMAT,
  STORAGE_PATHS,
  V5_IMAGE_RATIO_PRESETS,
  V5_SCENE_PRESETS,
  createDefaultAtelierStore,
  normalizeAnalysisExecution,
  normalizeAtelierExecution,
  normalizeAtelierStore,
  type AtelierCatalog,
  type AtelierChangedEvent,
  type AtelierConflict,
  type AtelierDocumentSelection,
  type AtelierDocumentView,
  type AtelierExecutionPatch,
  type AtelierGuidelineEdit,
  type AtelierExecution,
  type AtelierExecutionControls,
  type AtelierIssue,
  type AtelierRuntimeOverlay,
  type AtelierState,
  type AtelierStoreDocument,
  type FreeGenerationKind,
  type FreeGenerationLibrary,
  type GuidelineKind,
  type InlayConfig,
  type InstructionKind,
  type InstructionLibrary,
  type OutputMode,
  type PresetDiagnostic,
  type SceneSystem,
} from "../../shared/contract/index.js";
import * as A from "../../engine/v5/atelier.js";
import { compileAtelierPreset, DEFAULT_ATELIER_PRESET_DOCUMENT, isV5RawValidationError, V5_NORMALIZED_RAW_CONFIG } from "../../engine/v5/catalog.js";
import { fail, RpcFailure } from "../rpc/errors.js";
import { atelierMessage, translateAtelierText } from "./atelier-messages.js";
import type { BackendServices, EventBus, RunLog, StorageService } from "./types.js";
import { jsonClone } from "./util.js";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const PATH = STORAGE_PATHS.atelier;

/** English default names of new items (AM: "새 프리셋", "새 지침", "새 비율 지침", "새 인물 지침", "새 의상 지침", "<name> 복사본"). */
export const ATELIER_NAMES = Object.freeze({
  newPreset: "New preset", // 새 프리셋
  newScene: "New guideline", // 새 지침
  newRatio: "New ratio guideline", // 새 비율 지침
  newCharacter: "New character guideline", // 새 인물 지침
  newOutfit: "New outfit guideline", // 새 의상 지침
  copyOf: (name: string) => `${name} copy`, // <name> 복사본
  legacyTitle: "Previous directions", // port: title of the migrated 0.9.89 directions
});
/** English names of the port's 0.9.89 built-in direction presets (the stored names are Korean). */
const LEGACY_PRESET_NAMES: Readonly<Record<string, string>> = Object.freeze({
  "scene-default": "Illustration", // 삽화
  "scene-pov": "POV direction", // pov 연출
  "scene-ensemble": "Multi-character direction", // 다인 연출
  "scene-comic": "Comic", // 카툰 연출
  "image-ratio-default": "Default", // 기본
  "image-ratio-unspecified": "Unspecified", // 미지정
});

/* ------------------------------------------------------------------------------------------------
 * Public API
 * ---------------------------------------------------------------------------------------------- */

type DocumentSelection = AtelierDocumentSelection;
type GuidelineEdit = AtelierGuidelineEdit;

export interface AtelierService {
  getState(): Promise<AtelierState>;
  /** The Atelier part of a run's AM config (`buildRuntimeConfig(..., {atelier})`). */
  runtimeOverlay(config?: InlayConfig): Promise<AtelierRuntimeOverlay>;
  /** Bundled baseline data for the editors (read-only system definitions). */
  baseline(): { document: Rec; builtInJson: string; normalizedRawConfig: Rec };
  validateDocument(json: string): { valid: boolean; diagnostics: PresetDiagnostic[]; json?: string; title?: string; bundled?: { names: string[]; count: number } };
  createDocument(p: { baseRevision: number; name: string; duplicateOf?: string; json?: string }): Promise<{ state: AtelierState; id: string }>;
  importDocument(p: { baseRevision: number; fileName: string; json: string; activate?: boolean }): Promise<{ state: AtelierState; id: string; merged: Record<"scene" | "imageRatio" | "character" | "outfit", string[]> }>;
  saveDocument(p: { baseRevision: number; id: string; json: string }): Promise<{ state: AtelierState }>;
  renameDocument(p: { baseRevision: number; id: string; name: string }): Promise<{ state: AtelierState }>;
  deleteDocument(p: { baseRevision: number; id: string }): Promise<{ state: AtelierState }>;
  resetBuiltInDocument(p: { baseRevision: number }): Promise<{ state: AtelierState }>;
  activateDocument(p: { baseRevision: number; id: string }): Promise<{ state: AtelierState }>;
  exportDocument(p: { id: string; json?: string; selection?: DocumentSelection }): Promise<{ fileName: string; json: string }>;
  rawSource(p: { id: string }): Promise<{ fileName: string; json: string }>;
  selectGuideline(p: { kind: GuidelineKind; id: string }): Promise<{ state: AtelierState }>;
  createGuideline(p: { kind: GuidelineKind; copyOf?: string }): Promise<{ state: AtelierState; id: string }>;
  removeGuideline(p: { kind: GuidelineKind; id: string }): Promise<{ state: AtelierState }>;
  saveGuidelines(p: { kind: GuidelineKind; edits: GuidelineEdit[] }): Promise<{ state: AtelierState }>;
  setOutputMode(p: { id: string; mode: OutputMode }): Promise<{ state: AtelierState }>;
  setSystems(p: { systems: Record<string, SceneSystem> }): Promise<{ state: AtelierState; incomplete: string[] }>;
  setOption(p: { id: string; optionId: string; value: boolean }): Promise<{ state: AtelierState }>;
  setSizes(p: { id: string; allowedSizeIds: number[]; customSizes?: Array<{ id: number; width: number; height: number }> }): Promise<{ state: AtelierState }>;
  restoreGuideline(p: { id: string; expected: unknown }): Promise<{ state: AtelierState }>;
  importLegacyDirections(p: { baseRevision: number }): Promise<{ state: AtelierState; created: { scene: string[]; imageRatio: string[] } }>;
  setExecution(p: { patch: AtelierExecutionPatch }): Promise<{ state: AtelierState }>;
  setExecutionMode(p: { mode: "default" | "comic" }): Promise<{ state: AtelierState }>;
  repair(p: { part: "catalog" | "library" | "freeGeneration" }): Promise<{ state: AtelierState }>;
}

export interface AtelierServiceDeps {
  storage: StorageService;
  events?: EventBus;
  log?: RunLog;
  now?: () => Date;
  newId?: () => string;
}

/* ------------------------------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------------------------- */

/** Writes of one storage are serialized (the fake storage of the tests has no queue). */
const locks = new WeakMap<object, Promise<unknown>>();
function serialize<T>(key: object, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  locks.set(key, run.catch(() => undefined));
  return run;
}

/** Compile results by JSON text (documents are compiled on every state read; AM memoizes too, `Abe`). */
const compiled = new Map<string, ReturnType<typeof compileAtelierPreset>>();
function compileCached(json: string): ReturnType<typeof compileAtelierPreset> {
  const hit = compiled.get(json);
  if (hit) {
    compiled.delete(json);
    compiled.set(json, hit);
    return hit;
  }
  let result: ReturnType<typeof compileAtelierPreset>;
  try {
    result = compileAtelierPreset(json);
  } catch (error) {
    result = { valid: false, diagnostics: [{ code: "invalid-value", severity: "error", sourcePath: "JSON", message: error instanceof Error ? error.message : String(error) }] } as never;
  }
  compiled.set(json, result);
  while (compiled.size > 24) compiled.delete(compiled.keys().next().value!);
  return result;
}

function diagnosticsOf(list: readonly unknown[]): PresetDiagnostic[] {
  return list.map((d) => {
    const r = rec(d);
    const ko = String(r.message ?? "");
    const message = translateAtelierText(ko);
    return {
      code: String(r.code ?? "invalid-value"),
      severity: r.severity === "warning" || r.severity === "info" ? r.severity : "error",
      sourcePath: String(r.sourcePath ?? ""),
      message,
      ...(message !== ko ? { messageKo: ko } : {}),
      ...(typeof r.relatedSourcePath === "string" ? { relatedSourcePath: r.relatedSourcePath } : {}),
    };
  });
}

/** Errors of the AM core -> `bad-request` / `atelier-validation` (English message, Korean original, diagnostics). */
function validationFailure(error: unknown, extra: Rec = {}): never {
  if (error instanceof RpcFailure) throw error;
  if (error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError) throw error;
  const { message, messageKo } = atelierMessage(error);
  const diagnostics = isV5RawValidationError(error) ? diagnosticsOf(error.diagnostics) : undefined;
  fail("bad-request", message, { ...(messageKo ? { messageKo } : {}), detailCode: "atelier-validation", retryable: false, details: { ...(diagnostics ? { diagnostics } : {}), ...extra } });
}
function attempt<T>(fn: () => T, extra?: Rec): T {
  try {
    return fn();
  } catch (error) {
    validationFailure(error, extra);
  }
}
function fieldConflict(kind: GuidelineKind, id: string, field: string, expected: unknown, actual: unknown, ko: string): never {
  const { message, messageKo } = atelierMessage(new Error(ko));
  fail("conflict", message, { ...(messageKo ? { messageKo } : {}), detailCode: "atelier-field-conflict", retryable: false, details: { kind, id, field, expected, actual } });
}
function notFound(ko: string): never {
  const { message, messageKo } = atelierMessage(new Error(ko));
  fail("not-found", message, { ...(messageKo ? { messageKo } : {}), detailCode: "atelier-validation" });
}

/** AM config snapshot (`Y0` parts the Atelier logic reads). */
function amOf(store: AtelierStoreDocument, config: InlayConfig): Rec {
  return {
    novelai: { v5UserDirections: jsonClone(config.novelai.v5UserDirections) },
    runtime: {
      customImageSizes: jsonClone(config.runtime.customImageSizes ?? []),
      ...(store.instructionChanges !== undefined ? { instructionChanges: jsonClone(store.instructionChanges) } : {}),
      ...(store.freeGenerationLibrary !== undefined ? { freeGenerationLibrary: jsonClone(store.freeGenerationLibrary) } : {}),
      ...(store.freeGenerationInstructions !== undefined ? { freeGenerationInstructions: jsonClone(store.freeGenerationInstructions) } : {}),
      ...(store.execution ? { analysisExecution: jsonClone(store.execution) } : {}),
    },
    presetCatalog: { atelier: jsonClone(store.catalog) },
  };
}
const runtimeOf = (am: Rec): Rec => rec(am.runtime);
const catalogOf = (am: Rec): AtelierCatalog => rec(am.presetCatalog).atelier as AtelierCatalog;

/** Store parts of an AM snapshot (execution: mode + controls only; resolution / AI coordinates stay in the config). */
function storeFrom(am: Rec, previous: AtelierStoreDocument): AtelierStoreDocument {
  const rt = runtimeOf(am);
  const next: AtelierStoreDocument = { ...previous, catalog: jsonClone(catalogOf(am)) };
  delete next.instructionChanges;
  delete next.freeGenerationLibrary;
  if (rt.instructionChanges !== undefined) next.instructionChanges = jsonClone(rt.instructionChanges) as AtelierStoreDocument["instructionChanges"];
  if (rt.freeGenerationLibrary !== undefined) next.freeGenerationLibrary = jsonClone(rt.freeGenerationLibrary) as AtelierStoreDocument["freeGenerationLibrary"];
  const execution = normalizeAtelierExecution(rt.analysisExecution);
  if (execution) next.execution = execution;
  return next;
}

/** Execution mode + controls of a store: stored, else from the legacy V5 user directions (`wAe`). */
function executionOf(store: AtelierStoreDocument, config: InlayConfig): AtelierExecution {
  if (store.execution) return store.execution;
  const legacy = A.executionOrLegacy({ runtime: {} }, config.novelai.v5UserDirections);
  return normalizeAtelierExecution(legacy) ?? { mode: "default", controls: {} };
}

/** Selected scene/ratio/free-generation existence check for a kind. */
const isInstructionKind = (kind: GuidelineKind): kind is InstructionKind => kind === "scene" || kind === "imageRatio";
const isFreeKind = (kind: GuidelineKind): kind is FreeGenerationKind => (FREE_GENERATION_KINDS as readonly string[]).includes(kind);

/* ------------------------------------------------------------------------------------------------
 * Legacy directions migration
 * ---------------------------------------------------------------------------------------------- */

const norm = (text: unknown): string => (typeof text === "string" ? text.replace(/\r\n?/gu, "\n").trim() : "");

/** Ids of legacy presets with user text: own presets, edited built-in text, text added to a built-in, changed sizes. */
function changedLegacyPresets(directions: InlayConfig["novelai"]["v5UserDirections"]): { scene: Set<string>; imageRatio: Set<string> } {
  const out = { scene: new Set<string>(), imageRatio: new Set<string>() };
  for (const kind of ["scene", "imageRatio"] as const) {
    const builtIns = new Map((kind === "scene" ? V5_SCENE_PRESETS : V5_IMAGE_RATIO_PRESETS).map((p) => [p.id, p]));
    for (const preset of directions[kind].presets ?? []) {
      const builtIn = builtIns.get(preset.id);
      if (!builtIn) {
        if (norm(preset.instruction) || norm(preset.customInstruction?.text)) out[kind].add(preset.id);
        continue;
      }
      const textChanged = norm(preset.instruction) !== norm(builtIn.instruction);
      const added = !!norm(preset.customInstruction?.text);
      const sizesChanged = kind === "imageRatio" && !same([...(preset.allowedSizeIds ?? [1, 2, 5])].sort(), [...(builtIn.allowedSizeIds ?? [1, 2, 5])].sort());
      if (textChanged || added || sizesChanged) out[kind].add(preset.id);
    }
  }
  return out;
}

/**
 * Import the legacy directions into a library (AM import path: `XV` -> `kbe` -> `PAe`), only the presets with user
 * text. `select`: also select the guidelines that replace the previously selected presets (built-in POV / ensemble /
 * comic map to the provided `system-pov` / `system-ensemble` / `default-comic`).
 */
function importLegacyDirectionsInto(am: Rec, config: InlayConfig, select: boolean, newId: () => string): { am: Rec; created: { scene: string[]; imageRatio: string[] } } | null {
  const directions = config.novelai.v5UserDirections;
  const changed = changedLegacyPresets(directions);
  const named = jsonClone(directions);
  for (const kind of ["scene", "imageRatio"] as const) for (const p of named[kind].presets ?? []) if (LEGACY_PRESET_NAMES[p.id]) p.name = LEGACY_PRESET_NAMES[p.id]!;
  const title = ATELIER_NAMES.legacyTitle;
  const library = A.resolveLibrary(am);
  const created = { scene: [] as string[], imageRatio: [] as string[] };
  let next = jsonClone(library);
  const keyToId = new Map<string, string>();
  if (changed.scene.size || changed.imageRatio.size) {
    const analysis = A.legacyDirectionsAnalysis(named, config.runtime.customImageSizes ?? []);
    for (const kind of ["scene", "imageRatio"] as const) {
      const list = rec(analysis[kind]);
      const items = (Array.isArray(list.items) ? list.items : []).filter((i) => changed[kind].has(String(rec(i).id)));
      list.items = items;
      if (!items.some((i) => rec(i).id === list.selected)) list.selected = String(rec(items[0]).id ?? "");
    }
    const keyed = A.normalizeImportedPreset(JSON.stringify({ format: PRESET_FORMAT, title, content: { analysis } }));
    const bundle = rec(rec(JSON.parse(keyed.json).content).analysis);
    const ids: string[] = [];
    next = A.mergeGuidelineBundle(next as A.AtelierLibrary, bundle, title, () => {
      const id = newId();
      ids.push(id);
      return id;
    });
    const keys = [...Object.keys(rec(rec(bundle.scene).items)), ...Object.keys(rec(rec(bundle.imageRatio).items))];
    keys.forEach((key, i) => ids[i] && keyToId.set(key, ids[i]!));
    for (const kind of ["scene", "imageRatio"] as const) created[kind] = Object.keys(next[kind].items).filter((id) => !(id in library[kind].items));
    if (select) {
      for (const kind of ["scene", "imageRatio"] as const) {
        const selected = directions[kind].selectedPresetId ?? "";
        if (!changed[kind].has(selected)) continue;
        const key = A.legacyBundleItemKey(analysis, kind, selected, title);
        const id = keyToId.get(key) ?? (key in next[kind].items ? key : undefined);
        if (id) next[kind].selected = id;
      }
    }
  }
  if (select && !changed.scene.has(directions.scene.selectedPresetId ?? "")) {
    const provided: Record<string, string> = { "scene-pov": "system-pov", "scene-ensemble": "system-ensemble", "scene-comic": "default-comic" };
    const id = provided[directions.scene.selectedPresetId ?? ""];
    if (id && next.scene.items[id]) next.scene.selected = id;
  }
  if (!created.scene.length && !created.imageRatio.length && same(next.scene.selected, library.scene.selected) && same(next.imageRatio.selected, library.imageRatio.selected)) return null;
  A.validateLibraryEdit(library as A.AtelierLibrary, next as A.AtelierLibrary);
  return { am: A.commitLibrary(am, next as A.AtelierLibrary, catalogOf(am).activeId), created };
}

/* ------------------------------------------------------------------------------------------------
 * Service
 * ---------------------------------------------------------------------------------------------- */

export function createAtelierService(deps: AtelierServiceDeps): AtelierService {
  const { storage } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const log = (level: "info" | "warn", message: string, details?: unknown) => deps.log?.append(level, "atelier", message, details);

  interface Loaded { store: AtelierStoreDocument; issues: AtelierIssue[]; tooNew: boolean }

  /** Read (no lock). A missing file is created (with the legacy migration) under the lock. */
  async function read(): Promise<Loaded> {
    const raw = await storage.readJson<unknown>(PATH, null);
    if (raw === null || raw === undefined) return serialize(storage, () => readLocked());
    return normalizeLoaded(raw);
  }
  function normalizeLoaded(raw: unknown): Loaded {
    const { document, issues } = normalizeAtelierStore(raw, now().toISOString());
    const version = Number(rec(raw).version);
    return { store: document, issues, tooNew: Number.isFinite(version) && version > ATELIER_VERSION };
  }
  /** Read inside the lock; creates / repairs the file when needed. */
  async function readLocked(): Promise<Loaded> {
    const raw = await storage.readJson<unknown>(PATH, null);
    if (raw === null || raw === undefined) {
      const config = await storage.loadConfig();
      let store = createDefaultAtelierStore(now().toISOString());
      try {
        const migrated = importLegacyDirectionsInto(amOf(store, config), config, true, newId);
        if (migrated) {
          store = { ...storeFrom(migrated.am, store), migrations: { legacyDirections: { at: now().toISOString(), ...migrated.created } } };
          log("info", `Imported the previous directing guidelines into the Atelier (${migrated.created.scene.length} directing, ${migrated.created.imageRatio.length} ratio).`);
        }
      } catch (error) {
        log("warn", "Could not import the previous directing guidelines into the Atelier.", atelierMessage(error).message);
      }
      await storage.writeJson(PATH, store);
      return { store, issues: [], tooNew: false };
    }
    const loaded = normalizeLoaded(raw);
    if (!loaded.tooNew && loaded.issues.some((i) => i.code === "catalog-invalid" || i.code === "wrong-schema")) {
      const stamp = now().toISOString().replace(/:/gu, "-");
      await storage.writeJson(STORAGE_PATHS.legacyAtelier(stamp), raw);
      await storage.writeJson(PATH, loaded.store);
      log("warn", `config/atelier.json had an invalid preset list; the built-in list was restored and the original kept in ${STORAGE_PATHS.legacyAtelier(stamp)}.`, loaded.issues);
    }
    return loaded;
  }

  function emit(event: AtelierChangedEvent): void {
    deps.events?.emit("atelier.changed", event);
  }

  /**
   * Serialized read-modify-write. `fn` returns the next store (or null = unchanged) and a result; the service bumps
   * `storeRevision`, sets `updatedAt`, writes, emits `atelier.changed`.
   */
  async function write<T>(reason: AtelierChangedEvent["reason"], fn: (ctx: { store: AtelierStoreDocument; config: InlayConfig; issues: AtelierIssue[] }) => Promise<{ store: AtelierStoreDocument | null; result: T }> | { store: AtelierStoreDocument | null; result: T }): Promise<{ state: AtelierState; result: T }> {
    const config = await storage.loadConfig();
    const { store, result } = await serialize(storage, async () => {
      const loaded = await readLocked();
      if (loaded.tooNew) fail("storage-error", "config/atelier.json was written by a newer version of Inlay Illustrator and cannot be changed by this version.", { detailCode: "STORAGE_FILE_TOO_NEW" });
      const out = await fn({ store: loaded.store, config, issues: loaded.issues });
      if (!out.store || same(out.store, loaded.store)) return { store: loaded.store, result: out.result, changed: false };
      const next: AtelierStoreDocument = { ...out.store, schema: ATELIER_SCHEMA, version: ATELIER_VERSION, storeRevision: loaded.store.storeRevision + 1, updatedAt: now().toISOString() };
      const bytes = next.catalog.documents.reduce((n, d) => n + d.json.length, 0);
      if (next.catalog.documents.length > ATELIER_MAX_DOCUMENTS || bytes > ATELIER_MAX_TOTAL_BYTES) {
        fail("bad-request", `Too many presets: the Atelier keeps at most ${ATELIER_MAX_DOCUMENTS} documents and ${ATELIER_MAX_TOTAL_BYTES / 1024 / 1024} MiB of preset JSON.`, { detailCode: "atelier-limit", retryable: false });
      }
      await storage.writeJson(PATH, next);
      return { store: next, result: out.result, changed: true };
    }).then((r) => {
      if (r.changed) emit({ revision: r.store.catalog.revision, storeRevision: r.store.storeRevision, reason });
      return r;
    });
    return { state: stateOf(store, config, []), result };
  }

  /** Library read failure blocks library writes (AM read-failure mode). */
  function requireReadable(issues: AtelierIssue[], part: "library" | "free-generation"): void {
    const code = part === "library" ? "library-invalid" : "free-generation-invalid";
    if (issues.some((i) => i.code === code)) fail("storage-error", part === "library" ? "The stored guideline list could not be read. Repair it before editing." : "The stored free-generation guidelines could not be read. Repair them before editing.", { detailCode: "atelier-read", retryable: false });
  }
  function requireRevision(store: AtelierStoreDocument, baseRevision: number, ids: string[] = []): void {
    if (baseRevision === store.catalog.revision) return;
    const details: AtelierConflict = { expectedRevision: baseRevision, actualRevision: store.catalog.revision, fields: ["revision"], documents: ids.map((id) => ({ id, fields: store.catalog.documents.some((d) => d.id === id) ? ["json"] : ["removed"] })) };
    const { message, messageKo } = atelierMessage(new Error("프리셋의 저장 기준이 달라졌습니다. 초안을 보관한 뒤 최신 값을 불러오세요."));
    fail("conflict", message, { ...(messageKo ? { messageKo } : {}), detailCode: "atelier-conflict", retryable: false, details });
  }

  /* ---------------------------------------------------------------- state */

  function stateOf(store: AtelierStoreDocument, config: InlayConfig, issues: AtelierIssue[]): AtelierState {
    const am = amOf(store, config);
    const readFailures = issues.filter((i) => i.code !== "catalog-invalid" && i.code !== "wrong-schema").map((i) => ({ code: i.code, message: i.message }));
    const documents: AtelierDocumentView[] = store.catalog.documents.map((doc) => {
      const compiledDoc = compileCached(doc.json);
      const view: AtelierDocumentView = { ...doc, builtIn: doc.id === ATELIER_BUILTIN_DOCUMENT_ID };
      if (!compiledDoc.valid) {
        const diagnostics = diagnosticsOf(compiledDoc.diagnostics ?? []);
        view.readError = diagnostics.map((d) => (d.sourcePath ? `${d.sourcePath}: ${d.message}` : d.message)).join("\n") || "The preset could not be read.";
        view.diagnostics = diagnostics;
      }
      return view;
    });
    let library: InstructionLibrary;
    let pendingDefaults: string[] = [];
    try {
      library = A.resolveLibrary(am) as unknown as InstructionLibrary;
      pendingDefaults = [...A.pendingDefaultChangePaths(A.createBuiltInLibrary(), store.instructionChanges as never), ...A.pendingInheritedDefaults(library as never)];
    } catch (error) {
      library = A.createBuiltInLibrary() as unknown as InstructionLibrary;
      if (!readFailures.some((f) => f.code === "library-invalid")) readFailures.push({ code: "library-invalid", message: atelierMessage(error).message });
    }
    let freeGeneration: FreeGenerationLibrary;
    try {
      freeGeneration = A.resolveFreeGenerationLibrary(am) as FreeGenerationLibrary;
    } catch (error) {
      freeGeneration = A.resolveFreeGenerationLibrary({ runtime: {} }) as FreeGenerationLibrary;
      if (!readFailures.some((f) => f.code === "free-generation-invalid")) readFailures.push({ code: "free-generation-invalid", message: atelierMessage(error).message });
    }
    const owned = (() => {
      try {
        return A.readActivePresetRules(am)?.rules ?? {};
      } catch {
        return {};
      }
    })();
    const ownedRuleIds = Object.fromEntries(Object.entries(owned).map(([direction, rules]) => [direction, rules.map((r) => String(r.id))]));
    const execution = executionOf(store, config);
    const selected = library.scene.items[library.scene.selected];
    const mode = A.sceneOutputMode(selected as never) === "comic" ? "comic" : execution.mode === "comic" ? "default" : execution.mode;
    let directionMenu: AtelierState["directionMenu"];
    try {
      directionMenu = A.directionMenu({ ...am, runtime: { ...runtimeOf(am), analysisExecution: { ...execution } } }) as AtelierState["directionMenu"];
    } catch {
      directionMenu = { selected: library.scene.selected, options: [] };
    }
    return {
      revision: store.catalog.revision,
      storeRevision: store.storeRevision,
      catalog: { activeId: store.catalog.activeId, documents },
      library,
      ownedRuleIds,
      freeGeneration,
      execution: { mode, controls: execution.controls },
      pendingDefaults,
      directionMenu,
      ...(readFailures.length ? { readFailures } : {}),
      ...(store.migrations ? { migrations: store.migrations } : {}),
    };
  }

  /* ---------------------------------------------------------------- AM commits */

  /** AM `_be` (documents commit) on an AM snapshot: checks, normalizes new documents, merges their bundled guidelines. */
  function commitCatalog(am: Rec, next: AtelierCatalog): { am: Rec; merged: Record<"scene" | "imageRatio" | "character" | "outfit", string[]> } {
    const base = catalogOf(am);
    attempt(() => A.assertAtelierCatalogCommit(base as never, next as never));
    const documents = next.documents.map((doc) => {
      if (base.documents.some((d) => d.id === doc.id && d.json === doc.json)) return doc;
      if (!base.documents.some((d) => d.id === doc.id)) {
        const json = attempt(() => A.normalizeImportedPreset(doc.json).json);
        return same(JSON.parse(json), JSON.parse(doc.json)) ? doc : { ...doc, json };
      }
      const parsed = JSON.parse(doc.json) as Rec;
      const analysis = rec(parsed.content).analysis;
      if (analysis === undefined) return doc;
      const stripped = A.stripAnalysisVersions(analysis);
      if (same(stripped, analysis)) return doc;
      (parsed.content as Rec).analysis = stripped;
      return { ...doc, json: JSON.stringify(parsed) };
    });
    const catalog: AtelierCatalog = { ...next, documents, revision: base.revision + 1 };
    const withCatalog = { ...am, presetCatalog: { ...rec(am.presetCatalog), atelier: catalog } };
    const before = { library: A.resolveStoredLibrary(am), free: A.resolveFreeGenerationLibrary(am) };
    let library = jsonClone(A.overlayPresetRules(before.library, A.readActivePresetRules(withCatalog)?.rules));
    let free = A.resolveFreeGenerationLibrary(am);
    for (const doc of documents) {
      if (base.documents.some((d) => d.id === doc.id)) continue;
      const bundle = rec(rec(JSON.parse(doc.json)).content).analysis;
      if (!bundle) continue;
      library = attempt(() => A.mergeGuidelineBundle(library, bundle, doc.name, newId));
      const fg = rec(bundle).freeGeneration;
      if (fg) free = attempt(() => A.mergeFreeGenerationBundle(free, fg, doc.name, newId));
    }
    const committed = attempt(() => A.commitLibrary({ ...am, runtime: { ...runtimeOf(am), freeGenerationLibrary: A.storedFreeGenerationLibrary(free) }, presetCatalog: { ...rec(am.presetCatalog), atelier: catalog } }, library));
    if (catalog.activeId !== base.activeId) {
      const active = catalog.documents.find((d) => d.id === catalog.activeId)!;
      attempt(() => {
        const lib = A.resolveLibrary(committed);
        A.assertLibraryRules(lib, A.compilePresetOrThrow(active.json).catalog, lib.scene.selected);
      });
    }
    const after = { library: A.resolveStoredLibrary(committed), free: A.resolveFreeGenerationLibrary(committed) };
    const merged = {
      scene: Object.keys(after.library.scene.items).filter((id) => !(id in before.library.scene.items)),
      imageRatio: Object.keys(after.library.imageRatio.items).filter((id) => !(id in before.library.imageRatio.items)),
      character: Object.keys(after.free.character.items).filter((id) => !(id in before.free.character.items)),
      outfit: Object.keys(after.free.outfit.items).filter((id) => !(id in before.free.outfit.items)),
    };
    return { am: committed, merged };
  }

  /** AM `qst.A` (library commit): mutate the effective library, validate (`jAe`, optional `C8`), commit (`hS`). */
  function commitLibraryEdit(am: Rec, mutate: (library: A.AtelierLibrary) => A.AtelierLibrary | void, options: { checkPreset?: boolean; restoreId?: string } = {}): Rec {
    return attempt(() => {
      const current = A.resolveLibrary(am);
      const draft = jsonClone(current);
      const next = mutate(draft) ?? draft;
      A.validateLibraryEdit(current, next);
      if (options.checkPreset) {
        const active = catalogOf(am).documents.find((d) => d.id === catalogOf(am).activeId);
        if (!active) throw new Error("활성 연출 프리셋을 찾을 수 없습니다.");
        A.assertLibraryRules(next, A.compilePresetOrThrow(active.json).catalog, next.scene.selected);
      }
      return A.commitLibrary(am, next, catalogOf(am).activeId, options.restoreId);
    });
  }

  /** AM `Gst.u` (free-generation commit). */
  function commitFree(am: Rec, mutate: (library: A.AtelierFreeGenerationLibrary) => void): Rec {
    return attempt(() => {
      const library = A.resolveFreeGenerationLibrary(am);
      mutate(library);
      A.validateFreeGeneration(library);
      return { ...am, runtime: { ...runtimeOf(am), freeGenerationLibrary: A.storedFreeGenerationLibrary(library) } };
    });
  }

  const catalogWrite = (baseRevision: number, ids: string[], fn: (am: Rec, catalog: AtelierCatalog, config: InlayConfig) => { catalog: AtelierCatalog; id?: string }) =>
    write("documents", ({ store, config, issues }) => {
      requireRevision(store, baseRevision, ids);
      requireReadable(issues, "library");
      requireReadable(issues, "free-generation");
      const am = amOf(store, config);
      const { catalog, id } = fn(am, jsonClone(store.catalog), config);
      const { am: next, merged } = commitCatalog(am, catalog);
      return { store: storeFrom(next, store), result: { id: id ?? "", merged } };
    });

  const docOf = (catalog: AtelierCatalog, id: string) => catalog.documents.find((d) => d.id === id) ?? fail("not-found", `Unknown preset: ${id}`, { detailCode: "atelier-validation" });
  const fileSafe = (name: string) => name.replace(/[<>:"/\\|?*]/gu, "_");

  /* ---------------------------------------------------------------- library writes */

  const libraryWrite = (fn: (am: Rec, config: InlayConfig) => Rec, reason: AtelierChangedEvent["reason"] = "library") =>
    write(reason, ({ store, config, issues }) => {
      requireReadable(issues, "library");
      const next = fn(amOf(store, config), config);
      return { store: storeFrom(next, store), result: undefined };
    });
  const freeWrite = (fn: (am: Rec) => Rec) =>
    write("free-generation", ({ store, config, issues }) => {
      requireReadable(issues, "free-generation");
      return { store: storeFrom(fn(amOf(store, config)), store), result: undefined };
    });

  /** Scene item copy without the rules owned by the active preset (AM `qst.v`). */
  const sceneCopy = (am: Rec, library: A.AtelierLibrary, fromId: string, toId: string) => {
    const item = jsonClone(library.scene.items[fromId]!);
    const owned = new Set((A.readActivePresetRules(am)?.rules[fromId] ?? []).map((r) => String(r.id)));
    const system = rec(item.system);
    if (Array.isArray(system.rules)) system.rules = system.rules.filter((r) => !owned.has(String(rec(r).id)));
    return A.copySceneItem(item, fromId, toId);
  };

  const service: AtelierService = {
    async getState() {
      const config = await storage.loadConfig();
      const loaded = await read();
      return stateOf(loaded.store, config, loaded.issues);
    },

    async runtimeOverlay(config) {
      const cfg = config ?? (await storage.loadConfig());
      const { store } = await read();
      return {
        catalog: jsonClone(store.catalog),
        ...(store.instructionChanges !== undefined ? { instructionChanges: jsonClone(store.instructionChanges) } : {}),
        ...(store.freeGenerationLibrary !== undefined ? { freeGenerationLibrary: jsonClone(store.freeGenerationLibrary) } : {}),
        ...(store.freeGenerationInstructions !== undefined ? { freeGenerationInstructions: jsonClone(store.freeGenerationInstructions) } : {}),
        execution: executionOf(store, cfg),
      };
    },

    baseline() {
      return {
        document: jsonClone(DEFAULT_ATELIER_PRESET_DOCUMENT) as Rec,
        builtInJson: BUILTIN_PRESET_JSON,
        normalizedRawConfig: jsonClone(V5_NORMALIZED_RAW_CONFIG) as Rec,
      };
    },

    validateDocument(json) {
      const result = compileCached(json);
      if (!result.valid) return { valid: false, diagnostics: diagnosticsOf(result.diagnostics ?? []) };
      try {
        const normalized = A.normalizeImportedPreset(json);
        const title = (JSON.parse(normalized.json) as { title?: unknown }).title;
        return { valid: true, diagnostics: diagnosticsOf(result.diagnostics ?? []), json: normalized.json, ...(typeof title === "string" ? { title } : {}), bundled: { names: normalized.names, count: normalized.count } };
      } catch (error) {
        const { message, messageKo } = atelierMessage(error);
        const diagnostics = isV5RawValidationError(error) ? diagnosticsOf(error.diagnostics) : [{ code: "invalid-value", severity: "error" as const, sourcePath: "content.analysis", message, ...(messageKo ? { messageKo } : {}) }];
        return { valid: false, diagnostics };
      }
    },

    async createDocument(p) {
      const { state, result } = await catalogWrite(p.baseRevision, [], (_am, catalog) => {
        const source = p.duplicateOf ? docOf(catalog, p.duplicateOf) : undefined;
        const json = attempt(() => A.presetJsonForCopy(p.json ?? source?.json ?? BUILTIN_PRESET_JSON));
        attempt(() => A.compilePresetOrThrow(json));
        const id = newId();
        const name = String(p.name ?? "").trim() || (source ? ATELIER_NAMES.copyOf(source.name) : ATELIER_NAMES.newPreset);
        return { catalog: { ...catalog, documents: [...catalog.documents, { id, name, json }] }, id };
      });
      return { state, id: result.id };
    },

    async importDocument(p) {
      const { state, result } = await catalogWrite(p.baseRevision, [], (_am, catalog) => {
        const compiledDoc = attempt(() => A.compilePresetOrThrow(p.json));
        const id = newId();
        const name = A.presetTitle(compiledDoc.document as { title?: string }, String(p.fileName ?? "").replace(/\.json$/iu, ""));
        return { catalog: { ...catalog, ...(p.activate !== false ? { activeId: id } : {}), documents: [...catalog.documents, { id, name: name === "새 프리셋" ? ATELIER_NAMES.newPreset : name, json: compiledDoc.json }] }, id };
      });
      return { state, id: result.id, merged: result.merged };
    },

    async saveDocument(p) {
      const { state } = await catalogWrite(p.baseRevision, [p.id], (_am, catalog) => {
        docOf(catalog, p.id);
        const compiledDoc = attempt(() => A.compilePresetOrThrow(p.json));
        return { catalog: { ...catalog, documents: catalog.documents.map((d) => (d.id === p.id ? { ...d, json: compiledDoc.json } : d)) } };
      });
      return { state };
    },

    async renameDocument(p) {
      const name = String(p.name ?? "").trim();
      if (!name) fail("bad-request", "The preset name is required.", { detailCode: "atelier-validation" });
      const { state } = await catalogWrite(p.baseRevision, [p.id], (_am, catalog) => {
        docOf(catalog, p.id);
        return { catalog: { ...catalog, documents: catalog.documents.map((d) => (d.id === p.id ? { ...d, name } : d)) } };
      });
      return { state };
    },

    async deleteDocument(p) {
      if (p.id === ATELIER_BUILTIN_DOCUMENT_ID) fail("bad-request", "The built-in preset cannot be deleted.", { detailCode: "atelier-validation" });
      const { state } = await catalogWrite(p.baseRevision, [p.id], (_am, catalog) => {
        docOf(catalog, p.id);
        return { catalog: { ...catalog, activeId: catalog.activeId === p.id ? ATELIER_BUILTIN_DOCUMENT_ID : catalog.activeId, documents: catalog.documents.filter((d) => d.id !== p.id) } };
      });
      return { state };
    },

    async resetBuiltInDocument(p) {
      const { state } = await catalogWrite(p.baseRevision, [ATELIER_BUILTIN_DOCUMENT_ID], (_am, catalog) => ({
        catalog: { ...catalog, documents: catalog.documents.map((d) => (d.id === ATELIER_BUILTIN_DOCUMENT_ID ? { ...d, json: A.BUILTIN_ATELIER_DOCUMENTS[0]!.json } : d)) },
      }));
      return { state };
    },

    async activateDocument(p) {
      const { state } = await catalogWrite(p.baseRevision, [p.id], (_am, catalog) => {
        docOf(catalog, p.id);
        return { catalog: { ...catalog, activeId: p.id } };
      });
      return { state };
    },

    async exportDocument(p) {
      const config = await storage.loadConfig();
      const { store } = await read();
      const doc = docOf(store.catalog, p.id);
      const am = amOf(store, config);
      const library = attempt(() => A.resolveLibrary(am));
      const free = attempt(() => A.resolveFreeGenerationLibrary(am));
      const exported = attempt(() => A.exportPresetDocument(p.json ?? doc.json, library, doc.name, p.selection as never, free));
      return { fileName: `${fileSafe(doc.name)}.json`, json: JSON.stringify(exported.document, null, 2) };
    },

    async rawSource(p) {
      const { store } = await read();
      const doc = docOf(store.catalog, p.id);
      return { fileName: `${fileSafe(doc.name)}.source.json`, json: doc.json };
    },

    async selectGuideline(p) {
      if (isFreeKind(p.kind)) {
        const { state } = await freeWrite((am) =>
          commitFree(am, (lib) => {
            if (!lib[p.kind as FreeGenerationKind].items[p.id]) throw new Error("지침을 찾을 수 없습니다.");
            lib[p.kind as FreeGenerationKind].selected = p.id;
          }),
        );
        return { state };
      }
      if (!isInstructionKind(p.kind)) fail("bad-request", `Unknown guideline kind: ${String(p.kind)}`);
      const kind = p.kind;
      const { state } = await libraryWrite((am) =>
        commitLibraryEdit(
          am,
          (lib) => {
            if (!lib[kind].items[p.id]) throw new Error("지침을 찾을 수 없습니다.");
            lib[kind].selected = p.id;
          },
          { checkPreset: kind === "scene" },
        ),
      );
      return { state };
    },

    async createGuideline(p) {
      const id = newId();
      if (isFreeKind(p.kind)) {
        const kind = p.kind;
        const { state } = await freeWrite((am) =>
          commitFree(am, (lib) => {
            const source = p.copyOf ? lib[kind].items[p.copyOf] : undefined;
            if (p.copyOf && !source) throw new Error("복제할 지침을 찾을 수 없습니다.");
            lib[kind].items[id] = source
              ? { ...(p.copyOf === "default" ? {} : jsonClone(source)), name: ATELIER_NAMES.copyOf(source.name).slice(0, 80) }
              : { name: kind === "character" ? ATELIER_NAMES.newCharacter : ATELIER_NAMES.newOutfit };
          }),
        );
        return { state, id };
      }
      if (p.kind === "scene") {
        const { state } = await libraryWrite((am) =>
          commitLibraryEdit(am, (lib) => {
            const source = p.copyOf ? lib.scene.items[p.copyOf] : undefined;
            if (p.copyOf && !source) throw new Error("복제할 지침을 찾을 수 없습니다.");
            lib.scene.items[id] = source
              ? { ...sceneCopy(am, lib, p.copyOf!, id), name: ATELIER_NAMES.copyOf(String(source.name)).slice(0, 80) }
              : { name: ATELIER_NAMES.newScene, instruction: "", outputMode: "illustration", system: A.emptySceneSystem() };
          }),
        );
        return { state, id };
      }
      if (p.kind !== "imageRatio") fail("bad-request", `Unknown guideline kind: ${String(p.kind)}`);
      const { state } = await libraryWrite((am) =>
        commitLibraryEdit(am, (lib) => {
          const source = p.copyOf ? lib.imageRatio.items[p.copyOf] : undefined;
          if (p.copyOf && !source) throw new Error("비율 지침을 찾을 수 없습니다.");
          lib.imageRatio.items[id] = source ? { ...jsonClone(source), name: ATELIER_NAMES.copyOf(String(source.name)).slice(0, 80) } : { name: ATELIER_NAMES.newRatio, instruction: "", allowedSizeIds: [1, 2, 5] };
        }),
      );
      return { state, id };
    },

    async removeGuideline(p) {
      if (isFreeKind(p.kind)) {
        const kind = p.kind;
        const { state } = await freeWrite((am) =>
          commitFree(am, (lib) => {
            if (p.id === "default") throw new Error("기본 지침은 유지해야 합니다.");
            delete lib[kind].items[p.id];
            if (lib[kind].selected === p.id) lib[kind].selected = "default";
          }),
        );
        return { state };
      }
      if (!isInstructionKind(p.kind)) fail("bad-request", `Unknown guideline kind: ${String(p.kind)}`);
      const kind = p.kind;
      const { state } = await libraryWrite((am) =>
        commitLibraryEdit(am, (lib) => {
          if (p.id === "default" || (kind === "scene" && (A.isDefaultSceneId(p.id) || A.PROVIDED_SCENE_IDS.includes(p.id)))) throw new Error("기본 지침은 유지해야 합니다.");
          if (kind === "scene" && Object.entries(lib.scene.items).some(([id, item]) => id !== p.id && (rec(item.system).rules as Rec[] | undefined)?.some((r) => rec(r.condition).direction === p.id)))
            throw new Error("이 연출을 참조하는 규칙을 먼저 삭제하거나 재연결해주세요.");
          const fallback = kind === "scene" && lib.scene.items[p.id] && A.sceneOutputMode(lib.scene.items[p.id]) === "comic" ? "default-comic" : "default";
          delete lib[kind].items[p.id];
          if (lib[kind].selected === p.id) lib[kind].selected = fallback;
        }),
      );
      return { state };
    },

    async saveGuidelines(p) {
      const edits = Array.isArray(p.edits) ? p.edits : [];
      if (isFreeKind(p.kind)) {
        const kind = p.kind;
        const { state } = await freeWrite((am) => {
          const library = A.resolveFreeGenerationLibrary(am);
          for (const e of edits) {
            if (!["name", "instruction", "designInstruction"].includes(e.field) || e.id === "default") fail("bad-request", `Field ${e.field} of ${e.id} cannot be edited.`, { detailCode: "atelier-validation" });
            const item = library[kind].items[e.id] as Rec | undefined;
            if (!item) notFound("지침을 찾을 수 없습니다.");
            if (item[e.field] !== e.before && item[e.field] !== e.value) fieldConflict(kind, e.id, e.field, e.before, item[e.field], "다른 화면에서 자유생성 지침이 변경되었습니다. 초안은 유지됩니다. 최신 내용과 비교해주세요.");
            if (e.value === undefined || e.value === null) delete item[e.field];
            else item[e.field] = e.value;
          }
          attempt(() => A.validateFreeGeneration(library));
          return { ...am, runtime: { ...runtimeOf(am), freeGenerationLibrary: A.storedFreeGenerationLibrary(library) } };
        });
        return { state };
      }
      if (!isInstructionKind(p.kind)) fail("bad-request", `Unknown guideline kind: ${String(p.kind)}`);
      const kind = p.kind;
      const { state } = await libraryWrite((am) =>
        commitLibraryEdit(am, (lib) => {
          for (const e of edits) {
            if (!["name", "instruction", "customText", "outputMode", "system"].includes(e.field)) fail("bad-request", `Unknown guideline field: ${e.field}`, { detailCode: "atelier-validation" });
            const fixed = kind === "scene" ? A.isDefaultSceneId(e.id) && e.field !== "instruction" && e.field !== "system" : e.id === "default";
            if (fixed) throw new Error(kind === "scene" && e.field === "outputMode" ? "기본 지침의 표현 방식은 고정값입니다." : "기본 지침은 고정값입니다.");
            const item = lib[kind].items[e.id];
            if (!item) notFound("지침을 찾을 수 없습니다.");
            const current = A.readGuidelineField(item, e.field);
            if (!same(current, e.before) && !same(current, e.value)) fieldConflict(kind, e.id, e.field, e.before, current, "다른 화면에서 지침이 변경되었습니다. 초안은 유지됩니다. 최신 내용과 비교해주세요.");
            A.writeGuidelineField(item, e.field, e.value);
          }
        }),
      );
      return { state };
    },

    async setOutputMode(p) {
      const { state } = await libraryWrite((am) =>
        commitLibraryEdit(am, (lib) => {
          if (A.isDefaultSceneId(p.id)) throw new Error("기본 지침의 표현 방식은 고정값입니다.");
          const item = lib.scene.items[p.id];
          if (!item) throw new Error("지침을 찾을 수 없습니다.");
          item.outputMode = p.mode;
        }),
      );
      return { state };
    },

    async setSystems(p) {
      const incomplete: string[] = [];
      const { state } = await libraryWrite((am) =>
        commitLibraryEdit(am, (lib) => {
          for (const [id, system] of Object.entries(rec(p.systems))) {
            const item = lib.scene.items[id];
            if (!item) throw new Error("지침을 찾을 수 없습니다.");
            const s = jsonClone(rec(system)) as unknown as SceneSystem;
            const rules = (Array.isArray(s.rules) ? s.rules : []).filter((r) => !(r?.effect?.kind === "paths" && Array.isArray(r.effect.targets) && r.effect.targets.length === 0));
            if (rules.length !== (Array.isArray(s.rules) ? s.rules.length : 0)) incomplete.push(id);
            item.system = { ...s, rules } as unknown as Rec;
          }
        }),
      );
      return { state, incomplete };
    },

    async setOption(p) {
      const { state } = await libraryWrite((am) =>
        commitLibraryEdit(am, (lib) => {
          const system = rec(lib.scene.items[p.id]?.system) as unknown as SceneSystem;
          if (!Array.isArray(system.options) || !system.options.some((o) => o.id === p.optionId)) throw new Error("연출 옵션을 찾을 수 없습니다.");
          system.values = { ...system.values, [p.optionId]: p.value === true };
        }),
      );
      return { state };
    },

    async setSizes(p) {
      const { state } = await libraryWrite((am, config) =>
        commitLibraryEdit(am, (lib) => {
          if (p.id === "default") throw new Error("기본 지침은 고정값입니다.");
          const item = lib.imageRatio.items[p.id];
          if (!item) throw new Error("지침을 찾을 수 없습니다.");
          const allowed = Array.isArray(p.allowedSizeIds) ? p.allowedSizeIds : [];
          item.allowedSizeIds = allowed;
          item.customSizes = A.normalizeCustomSizes([...(p.customSizes ?? []), ...(config.runtime.customImageSizes ?? []).filter((s) => allowed.includes(s.id))]);
        }),
      );
      return { state };
    },

    async restoreGuideline(p) {
      const { state } = await libraryWrite((am) => {
        if (!A.isDefaultSceneId(p.id) && !A.providedSceneSystem(p.id)) fail("bad-request", "Only built-in directing guidelines can be restored.", { detailCode: "atelier-validation" });
        const current = A.resolveLibrary(am).scene.items[p.id];
        if (!same(current, p.expected)) fieldConflict("scene", p.id, "*", p.expected, current, "다른 화면에서 연출이 변경되었습니다. 최신 내용을 확인해주세요.");
        return commitLibraryEdit(
          am,
          (lib) => {
            const owned = A.readActivePresetRules(am)?.rules;
            const ownedIds = new Set((owned?.[p.id] ?? []).map((r) => String(r.id)));
            const restored = jsonClone(rec(p.expected));
            const system = rec(restored.system);
            if (Array.isArray(system.rules)) system.rules = system.rules.filter((r) => !ownedIds.has(String(rec(r).id)));
            lib.scene.items[p.id] = A.restoreBuiltInSceneItem(restored, p.id);
            lib.scene.items[p.id] = A.overlayPresetRules(lib, owned && { [p.id]: owned[p.id] ?? [] }).scene.items[p.id]!;
          },
          { restoreId: p.id },
        );
      });
      return { state };
    },

    async importLegacyDirections(p) {
      const { state, result } = await write("migration", ({ store, config, issues }) => {
        requireRevision(store, p.baseRevision);
        requireReadable(issues, "library");
        const migrated = attempt(() => importLegacyDirectionsInto(amOf(store, config), config, false, newId));
        if (!migrated) return { store: null, result: { scene: [] as string[], imageRatio: [] as string[] } };
        return { store: storeFrom(migrated.am, store), result: migrated.created };
      });
      return { state, created: result };
    },

    async setExecution(p) {
      const patch = rec(p.patch);
      if ("resolution" in patch || "aiCoordinates" in patch) {
        // Chat toolbar resolution / AI coordinates live in the settings (`runtime.analysisExecution`, AM `CPe`).
        await storage.updateConfig((config) => {
          const next: Rec = { ...(config.runtime.analysisExecution ?? {}) };
          if ("resolution" in patch) next.resolution = patch.resolution;
          if (typeof patch.aiCoordinates === "boolean") next.aiCoordinates = patch.aiCoordinates;
          const normalized = normalizeAnalysisExecution(next);
          if (!normalized || ("resolution" in patch && !("resolution" in normalized))) fail("bad-request", "Invalid resolution or AI coordinates.", { detailCode: "atelier-validation" });
          return { ...config, runtime: { ...config.runtime, analysisExecution: normalized } };
        });
      }
      if (!("controls" in patch)) return { state: await service.getState() };
      const { state } = await write("execution", ({ store, config }) => {
        const current = executionOf(store, config);
        const merged = normalizeAtelierExecution({ mode: current.mode, controls: { ...current.controls, ...rec(patch.controls) } });
        if (!merged) fail("bad-request", "Invalid execution controls.", { detailCode: "atelier-validation" });
        // AM `hS` drops the speech bubble control of the comic mode.
        delete merged.controls["comic.speech-bubble"];
        return { store: { ...store, execution: merged }, result: undefined };
      });
      return { state };
    },

    async setExecutionMode(p) {
      const { state } = await libraryWrite((am) => attempt(() => A.selectOutputMode({ ...am, runtime: { ...runtimeOf(am), analysisExecution: { ...rec(runtimeOf(am).analysisExecution ?? { mode: "default", controls: {} }) } } }, p.mode)), "execution");
      return { state };
    },

    async repair(p) {
      const { state } = await write("reset", async ({ store }) => {
        const stamp = now().toISOString().replace(/:/gu, "-");
        await storage.writeJson(STORAGE_PATHS.legacyAtelier(stamp), store);
        const next = { ...store };
        if (p.part === "catalog") next.catalog = createDefaultAtelierStore().catalog;
        if (p.part === "library") delete next.instructionChanges;
        if (p.part === "freeGeneration") {
          delete next.freeGenerationLibrary;
          delete next.freeGenerationInstructions;
        }
        log("warn", `Atelier ${p.part} reset; the previous file was kept in ${STORAGE_PATHS.legacyAtelier(stamp)}.`);
        return { store: next, result: undefined };
      });
      return { state };
    },
  };
  return service;
}

/** The service of a user's services (created on first use; `BackendServices.atelier` when the factory set it). */
const services = new WeakMap<object, AtelierService>();
export function atelierServiceOf(s: Pick<BackendServices, "storage" | "events" | "log"> & { atelier?: AtelierService }): AtelierService {
  if (s.atelier) return s.atelier;
  let service = services.get(s.storage);
  if (!service) services.set(s.storage, (service = createAtelierService({ storage: s.storage, events: s.events, log: s.log })));
  return service;
}

export { ANALYSIS_RECORD_MAX_BYTES };
