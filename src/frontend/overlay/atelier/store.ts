/**
 * Maid Atelier screen controller (port of AM `hct$990` 123138 + `pct$990` 122621 persistence, condensed): the preset
 * draft, the view state, guideline drafts, saves with the revision / field checks, conflict recovery and kept drafts.
 * One store per overlay; screens read it with `useAtelier(selector)`. RPCs go through the AppController; the shared
 * `AtelierState` lives in the app store (`app.state.atelier`) so the chat toolbar sees the same data.
 */
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import {
  ATELIER_BUILTIN_DOCUMENT_ID,
  PRESET_MAX_BYTES,
  RECOVERY_FORMAT,
  type AtelierDocumentSelection,
  type AtelierExecutionPatch,
  type AtelierFieldConflict,
  type AtelierState,
  type FreeGenerationKind,
  type GuidelineKind,
  type PresetDiagnostic,
  type SceneInstruction,
  type SceneSystem
} from "../../../shared/contract/atelier.js";
import type { RpcError } from "../../../shared/contract/rpc.js";
import { toRpcError } from "../../rpc/client.js";
import type { AppController } from "../../state/app-state.js";
import { Store, useSelector } from "../../state/store.js";
import { ATELIER_LABELS as L } from "./labels.js";
import {
  editableDocument,
  errorDiagnostics,
  errorKind,
  formatRulesJson,
  parsePreset,
  parseRulesJson,
  safeFileName,
  serializePreset,
  systemCatalog,
  utf8Size,
  type PresetDocument,
  type SystemCatalog
} from "./model.js";

export type AtelierSection = "expressions" | "interactions" | "scenes" | "rules";
export type GuidelineTab = "scene" | "imageRatio" | "free";
export type AtelierEditor =
  | { type: "group"; id: string; system?: boolean; detail?: boolean; tab?: "options" | "settings"; option?: string | null; fromInteraction?: string }
  | { type: "channel"; id: string; system?: boolean }
  | { type: "interaction"; id: string }
  | { type: "category"; category: string }
  | { type: "scene"; id: string }
  | { type: "guideline"; kind: GuidelineKind; id: string }
  | null;

export interface AtelierView {
  mode: "preset" | "guidelines";
  section: AtelierSection;
  guidelineTab: GuidelineTab;
  freeKind: FreeGenerationKind;
  scope: "preset" | "system";
  expressionKind: "groups" | "free" | "text";
  interactionTab: "basics" | "subGroups";
  /** Opened interaction category (list of its interactions); null = category list. */
  category: string | null;
  rulesScope: "directing" | "common";
  rulesMode: "table" | "json";
  rulesDirection: string;
  orderOpen: boolean;
  rawOpen: boolean;
  guideOpen: boolean;
  editor: AtelierEditor;
  query: Record<string, string>;
}

export interface DocumentDraft {
  id: string;
  /** Stored JSON this draft is based on. */
  baseJson: string;
  doc: PresetDocument | null;
  readError?: string;
  /** Raw JSON editor text (null = closed / untouched). */
  rawText: string | null;
  /** Common rules JSON-mode text (null = table mode). */
  rulesText: string | null;
  dirty: boolean;
}

export interface GuidelineDraft { kind: GuidelineKind; id: string; field: string; before: unknown; value: unknown }
export interface KeptDraft { id: string; createdAt: string; documentId: string; name: string; json: string }

export interface AtelierSnapshot {
  documentId: string;
  draft: DocumentDraft | null;
  baseline: { document: PresetDocument; raw: Record<string, unknown> } | null;
  view: AtelierView;
  saving: boolean;
  saveError: RpcError | null;
  failure: "conflict" | "validation" | "io" | null;
  diagnostics: PresetDiagnostic[];
  /** The stored document changed while the draft was dirty (another window). */
  stale: boolean;
  recoveries: KeptDraft[];
  guidelineDrafts: Record<string, GuidelineDraft>;
  guidelineError: { message: string; conflict?: AtelierFieldConflict } | null;
  /** Fields currently holding an invalid value (ID being typed, ...). */
  incomplete: string[];
  busy: boolean;
}

function defaultView(): AtelierView {
  return {
    mode: "preset",
    section: "expressions",
    guidelineTab: "scene",
    freeKind: "character",
    scope: "preset",
    expressionKind: "groups",
    interactionTab: "basics",
    category: null,
    rulesScope: "common",
    rulesMode: "table",
    rulesDirection: "default",
    orderOpen: false,
    rawOpen: false,
    guideOpen: false,
    editor: null,
    query: {}
  };
}

export const guidelineDraftKey = (kind: GuidelineKind, id: string, field: string): string => `${kind}:${id}:${field}`;

/** Download helper (port of AM `fileSave`: a JSON blob through an anchor). */
export function downloadJson(fileName: string, json: string, doc: Document = document): void {
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  const url = view?.URL?.createObjectURL ? view.URL.createObjectURL(new Blob([json], { type: "application/json" })) : `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (url.startsWith("blob:")) setTimeout(() => view?.URL?.revokeObjectURL?.(url), 1000);
}

export class AtelierStore {
  readonly store: Store<AtelierSnapshot>;
  private disposeApp: (() => void) | null = null;
  private lastState: AtelierState | null = null;
  /** Download sink (tests replace it). */
  download: (fileName: string, json: string) => void = (fileName, json) => downloadJson(fileName, json);

  constructor(readonly app: AppController) {
    this.store = new Store<AtelierSnapshot>({
      documentId: ATELIER_BUILTIN_DOCUMENT_ID,
      draft: null,
      baseline: null,
      view: defaultView(),
      saving: false,
      saveError: null,
      failure: null,
      diagnostics: [],
      stale: false,
      recoveries: [],
      guidelineDrafts: {},
      guidelineError: null,
      incomplete: [],
      busy: false
    });
  }

  get snapshot(): AtelierSnapshot {
    return this.store.get();
  }
  get state(): AtelierState | null {
    return this.app.state.atelier;
  }

  /** Loads the state + baseline and follows `app.state.atelier`. */
  async open(): Promise<void> {
    if (!this.disposeApp) {
      this.disposeApp = this.app.store.subscribe(() => {
        const state = this.app.state.atelier;
        if (state && state !== this.lastState) this.sync(state);
      });
    }
    const [state] = await Promise.all([this.app.loadAtelier(), this.loadBaseline()]);
    if (state) {
      if (!this.lastState) this.store.patch({ documentId: state.catalog.activeId });
      this.sync(state, true);
    }
  }

  close(): void {
    this.disposeApp?.();
    this.disposeApp = null;
  }

  private async loadBaseline(): Promise<void> {
    if (this.snapshot.baseline) return;
    try {
      const baseline = await this.app.call("atelier.getBaseline", {});
      this.store.patch({ baseline: { document: baseline.document as unknown as PresetDocument, raw: baseline.normalizedRawConfig } });
      if (this.lastState) this.sync(this.lastState, true);
    } catch (error) {
      this.app.notifyError(error);
    }
  }

  /** System catalogue of the shown document (read-only system scope, output order, rule objects). */
  system(): SystemCatalog {
    const s = this.snapshot;
    return systemCatalog(s.baseline?.raw ?? null, s.draft?.doc ?? null);
  }

  /* ---------------------------------------------------------------------------------------------- state sync */

  private sync(state: AtelierState, force = false): void {
    this.lastState = state;
    const s = this.snapshot;
    let documentId = s.documentId;
    if (!state.catalog.documents.some((d) => d.id === documentId)) documentId = state.catalog.activeId;
    const stored = state.catalog.documents.find((d) => d.id === documentId);
    if (!stored) return;
    const draft = s.draft;
    if (!force && draft && draft.id === documentId && draft.baseJson === stored.json && s.baseline) {
      if (documentId !== s.documentId) this.store.patch({ documentId });
      return;
    }
    if (draft && draft.id === documentId && draft.dirty && draft.baseJson !== stored.json) {
      this.store.patch({ documentId, stale: true });
      return;
    }
    this.store.patch({ documentId, draft: this.buildDraft(documentId, stored.json, stored.readError), stale: false });
  }

  private buildDraft(id: string, json: string, readError?: string): DocumentDraft {
    const parsed = parsePreset(json);
    const baseline = this.snapshot.baseline?.document ?? null;
    if (!parsed.doc || readError) return { id, baseJson: json, doc: parsed.doc ? editableDocument(parsed.doc, baseline) : null, readError: readError ?? parsed.error, rawText: null, rulesText: null, dirty: false };
    return { id, baseJson: json, doc: editableDocument(parsed.doc, baseline), rawText: null, rulesText: null, dirty: false };
  }

  /* ---------------------------------------------------------------------------------------------- view */

  updateView(patch: Partial<AtelierView>): void {
    this.store.patch({ view: { ...this.snapshot.view, ...patch } });
  }
  setQuery(key: string, value: string): void {
    this.updateView({ query: { ...this.snapshot.view.query, [key]: value } });
  }
  openEditor(editor: AtelierEditor): void {
    this.updateView({ editor });
  }
  closeEditor(): void {
    this.updateView({ editor: null });
  }
  setIncomplete(key: string, incomplete: boolean): void {
    const list = this.snapshot.incomplete;
    if (incomplete === list.includes(key)) return;
    this.store.patch({ incomplete: incomplete ? [...list, key] : list.filter((k) => k !== key) });
  }

  /** Unsaved preset or guideline edits (the transition guard asks before dropping them). */
  hasUnsaved(): boolean {
    const s = this.snapshot;
    return !!s.draft?.dirty || Object.keys(s.guidelineDrafts).length > 0;
  }
  discardAll(): void {
    const s = this.snapshot;
    const stored = this.state?.catalog.documents.find((d) => d.id === s.documentId);
    this.store.patch({
      draft: stored ? this.buildDraft(s.documentId, stored.json, stored.readError) : s.draft,
      guidelineDrafts: {},
      guidelineError: null,
      stale: false,
      failure: null,
      saveError: null,
      diagnostics: [],
      incomplete: []
    });
  }
  /** Saves every pending edit; false when something failed (the guard then stays). */
  async saveAll(): Promise<boolean> {
    let ok = true;
    if (this.snapshot.draft?.dirty) ok = (await this.save()) && ok;
    const keys = new Set(Object.values(this.snapshot.guidelineDrafts).map((d) => `${d.kind}\u0000${d.id}`));
    for (const key of keys) {
      const [kind, id] = key.split("\u0000") as [GuidelineKind, string];
      ok = (await this.saveGuideline(kind, id)) && ok;
    }
    return ok;
  }

  /** Shows another document (callers guard unsaved edits first). */
  selectDocument(id: string): void {
    const state = this.state;
    const stored = state?.catalog.documents.find((d) => d.id === id);
    if (!stored) return;
    this.store.patch({
      documentId: id,
      draft: this.buildDraft(id, stored.json, stored.readError),
      stale: false,
      failure: null,
      saveError: null,
      diagnostics: [],
      incomplete: [],
      view: { ...this.snapshot.view, mode: "preset", editor: null, rawOpen: !!stored.readError, rulesMode: "table" }
    });
  }

  /* ---------------------------------------------------------------------------------------------- document edits */

  /**
   * Applies an edit to the preset draft. `auto` edits (toggles, reorder) are saved at once when nothing else is pending
   * (AM "settings changed in the table are saved automatically"); `draft` edits wait for Save.
   */
  edit(fn: (doc: PresetDocument) => PresetDocument, mode: "auto" | "draft" = "draft"): void {
    const draft = this.snapshot.draft;
    if (!draft?.doc || this.isReadOnly()) return;
    const wasDirty = draft.dirty;
    const doc = fn(draft.doc);
    if (doc === draft.doc) return;
    this.store.patch({ draft: { ...draft, doc, dirty: true }, failure: null, saveError: null, diagnostics: [] });
    if (mode === "auto" && !wasDirty && !this.snapshot.stale) void this.save();
  }
  setRawText(text: string | null): void {
    const draft = this.snapshot.draft;
    if (!draft) return;
    this.store.patch({ draft: { ...draft, rawText: text, dirty: text !== null ? true : draft.dirty } });
  }
  setRulesText(text: string | null): void {
    const draft = this.snapshot.draft;
    if (!draft) return;
    this.store.patch({ draft: { ...draft, rulesText: text, dirty: text !== null ? text !== formatRulesJson(draft.doc?.content.rules ?? []) || draft.dirty : draft.dirty } });
  }
  isReadOnly(): boolean {
    return false;
  }

  /** JSON the draft would save (raw editor text wins; rules JSON text is merged). */
  draftJson(): { json?: string; error?: string } {
    const draft = this.snapshot.draft;
    if (!draft) return { error: L.guidelines.notFound };
    if (draft.rawText !== null) return { json: draft.rawText };
    if (!draft.doc) return { error: draft.readError ?? L.raw.invalid };
    let doc = draft.doc;
    if (draft.rulesText !== null) {
      const parsed = parseRulesJson(draft.rulesText);
      if (!parsed.rules) return { error: parsed.error };
      doc = { ...doc, content: { ...doc.content, rules: parsed.rules } };
      if (!parsed.rules.length) delete doc.content.rules;
    }
    return { json: serializePreset(doc) };
  }

  /** `atelier.documents.save` with the current revision (AM `_be`). */
  async save(): Promise<boolean> {
    const s = this.snapshot;
    const state = this.state;
    if (!s.draft || !state || s.saving) return false;
    const { json, error } = this.draftJson();
    if (!json) {
      this.store.patch({ failure: "validation", saveError: { code: "bad-request", message: error ?? L.raw.invalid }, diagnostics: [] });
      return false;
    }
    this.store.patch({ saving: true, saveError: null });
    try {
      const result = await this.app.call("atelier.documents.save", { baseRevision: state.revision, id: s.draft.id, json });
      const stored = result.state.catalog.documents.find((d) => d.id === s.draft!.id);
      this.lastState = result.state;
      this.store.patch({
        saving: false,
        failure: null,
        diagnostics: [],
        stale: false,
        draft: stored ? { ...this.buildDraft(stored.id, stored.json, stored.readError), rulesText: s.draft.rulesText !== null ? formatRulesJson(parsePreset(stored.json).doc?.content.rules ?? []) : null } : null
      });
      if (stored && this.snapshot.draft && s.view.rawOpen) this.store.patch({ view: { ...this.snapshot.view, rawOpen: !!stored.readError } });
      this.app.applyAtelier(result.state);
      return true;
    } catch (caught) {
      const rpc = toRpcError(caught);
      const kind = errorKind(rpc);
      this.store.patch({ saving: false, saveError: rpc, failure: kind === "conflict" ? "conflict" : kind === "validation" || kind === "limit" ? "validation" : "io", diagnostics: errorDiagnostics(rpc) });
      return false;
    }
  }

  /** Conflict action "Save edits": reload the latest revision, then save the draft over it. */
  async saveOverLatest(): Promise<boolean> {
    const state = await this.app.loadAtelier();
    if (!state) return false;
    const draft = this.snapshot.draft;
    const stored = state.catalog.documents.find((d) => d.id === draft?.id);
    if (draft && stored) this.store.patch({ draft: { ...draft, baseJson: stored.json }, stale: false });
    return this.save();
  }
  /** Conflict action "Keep draft, load latest" (AM recovery draft, `R` 122702). */
  async keepAndReload(): Promise<void> {
    const s = this.snapshot;
    const { json } = this.draftJson();
    const name = this.state?.catalog.documents.find((d) => d.id === s.documentId)?.name ?? s.documentId;
    if (json && s.draft?.dirty) {
      const kept: KeptDraft = { id: `${Date.now()}-${s.recoveries.length + 1}`, createdAt: new Date().toISOString(), documentId: s.documentId, name, json };
      this.store.patch({ recoveries: [...s.recoveries, kept] });
    }
    await this.reload();
  }
  /** Drops the draft and loads the stored values. */
  async reload(): Promise<void> {
    const state = await this.app.loadAtelier();
    const stored = state?.catalog.documents.find((d) => d.id === this.snapshot.documentId);
    this.store.patch({ stale: false, failure: null, saveError: null, diagnostics: [], ...(stored ? { draft: this.buildDraft(stored.id, stored.json, stored.readError) } : {}) });
  }
  /** Recovery export (AM `asset-maid-atelier-recovery`, 123057). */
  exportRecoveries(): void {
    const s = this.snapshot;
    const state = this.state;
    const file = {
      format: RECOVERY_FORMAT,
      owner: "atelier-global",
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      stored: state ? { activeId: state.catalog.activeId, revision: state.revision, documents: state.catalog.documents.map(({ id, name, json }) => ({ id, name, json })) } : null,
      display: s.recoveries,
      automatic: null
    };
    this.download(`atelier-${file.id}.recovery.json`, JSON.stringify(file, null, 2));
  }
  /** Restores one kept draft as a new user document "<name> recovery" (AM 123062). */
  async restoreRecovery(id: string): Promise<boolean> {
    const kept = this.snapshot.recoveries.find((r) => r.id === id);
    if (!kept) {
      this.app.notify({ tone: "danger", message: L.recovery.notFound });
      return false;
    }
    const created = await this.documentCall(() => this.app.call("atelier.documents.create", { baseRevision: this.state!.revision, name: L.recovery.copyName(kept.name), json: kept.json }));
    if (!created) return false;
    this.store.patch({ recoveries: this.snapshot.recoveries.filter((r) => r.id !== id) });
    this.selectDocument(created.id);
    return true;
  }

  /* ---------------------------------------------------------------------------------------------- document operations */

  /** Runs a document RPC; on a revision conflict reloads and reports. Returns the result or null. */
  private async documentCall<T extends { state: AtelierState }>(call: () => Promise<T>): Promise<T | null> {
    if (!this.state) return null;
    this.store.patch({ busy: true });
    try {
      const result = await call();
      this.app.applyAtelier(result.state);
      return result;
    } catch (caught) {
      const rpc = toRpcError(caught);
      if (errorKind(rpc) === "conflict") {
        await this.app.loadAtelier();
        this.app.notify({ tone: "warning", message: L.recovery.conflict });
      } else this.app.notify({ tone: "danger", message: [rpc.message, ...errorDiagnostics(rpc).map((d) => d.message)].join(" ") });
      return null;
    } finally {
      this.store.patch({ busy: false });
    }
  }

  async createDocument(): Promise<string | null> {
    const r = await this.documentCall(() => this.app.call("atelier.documents.create", { baseRevision: this.state!.revision, name: L.sidebar.newPreset }));
    if (r) this.selectDocument(r.id);
    return r?.id ?? null;
  }
  async duplicateDocument(id: string): Promise<string | null> {
    const source = this.state?.catalog.documents.find((d) => d.id === id);
    if (!source) return null;
    const draftJson = id === this.snapshot.documentId && this.snapshot.draft?.dirty ? this.draftJson().json : undefined;
    const r = await this.documentCall(() => this.app.call("atelier.documents.create", { baseRevision: this.state!.revision, name: L.sidebar.copyName(source.builtIn ? L.sidebar.defaultPresetName : source.name), duplicateOf: id, ...(draftJson ? { json: draftJson } : {}) }));
    return r?.id ?? null;
  }
  async renameDocument(id: string, name: string): Promise<string | null> {
    if (!name.trim()) return L.sidebar.nameRequired;
    const r = await this.documentCall(() => this.app.call("atelier.documents.rename", { baseRevision: this.state!.revision, id, name: name.trim() }));
    return r ? null : L.sidebar.renameFailed;
  }
  async deleteDocument(id: string): Promise<boolean> {
    const r = await this.documentCall(() => this.app.call("atelier.documents.delete", { baseRevision: this.state!.revision, id }));
    if (r && this.snapshot.documentId === id) this.selectDocument(r.state.catalog.activeId);
    return !!r;
  }
  async resetBuiltIn(): Promise<boolean> {
    const r = await this.documentCall(() => this.app.call("atelier.documents.resetBuiltIn", { baseRevision: this.state!.revision }));
    if (r && this.snapshot.documentId === ATELIER_BUILTIN_DOCUMENT_ID) this.selectDocument(ATELIER_BUILTIN_DOCUMENT_ID);
    return !!r;
  }
  async activateDocument(id: string): Promise<boolean> {
    return !!(await this.documentCall(() => this.app.call("atelier.documents.activate", { baseRevision: this.state!.revision, id })));
  }

  /**
   * JSON import (AM file input 124938): 2 MiB limit, validation errors returned for the import dialog; the imported
   * document becomes active and is shown.
   */
  async importFile(file: { name: string; size?: number; text: () => Promise<string> }): Promise<{ ok: boolean; errors: string[]; merged?: number }> {
    if ((file.size ?? 0) > PRESET_MAX_BYTES) return { ok: false, errors: [L.importing.tooLarge] };
    let json: string;
    try {
      json = await file.text();
    } catch {
      return { ok: false, errors: [L.importing.readFailed] };
    }
    if (utf8Size(json) > PRESET_MAX_BYTES) return { ok: false, errors: [L.importing.tooLarge] };
    const state = this.state;
    if (!state) return { ok: false, errors: [L.importing.saveFailed] };
    this.store.patch({ busy: true });
    try {
      const r = await this.app.call("atelier.documents.import", { baseRevision: state.revision, fileName: file.name.replace(/\.json$/i, ""), json, activate: true });
      this.app.applyAtelier(r.state);
      this.selectDocument(r.id);
      const merged = Object.values(r.merged).reduce((n, ids) => n + ids.length, 0);
      return { ok: true, errors: [], merged };
    } catch (caught) {
      const rpc = toRpcError(caught);
      const diagnostics = errorDiagnostics(rpc).map((d) => d.message);
      if (errorKind(rpc) === "conflict") await this.app.loadAtelier();
      return { ok: false, errors: diagnostics.length ? [rpc.message, ...diagnostics] : [errorKind(rpc) === "other" ? L.importing.saveFailed : rpc.message] };
    } finally {
      this.store.patch({ busy: false });
    }
  }

  /** Export with the chosen bundled guidelines (AM `Sct` dialog -> `$st`). */
  async exportDocument(id: string, selection?: AtelierDocumentSelection): Promise<string | null> {
    try {
      const draftJson = id === this.snapshot.documentId && this.snapshot.draft?.dirty ? this.draftJson().json : undefined;
      const r = await this.app.call("atelier.documents.export", { id, ...(draftJson ? { json: draftJson } : {}), ...(selection ? { selection } : {}) });
      this.download(safeFileName(r.fileName), r.json);
      return null;
    } catch (caught) {
      return toRpcError(caught).message;
    }
  }
  /** Raw backup (AM "원문 백업"). */
  async exportRaw(id: string): Promise<void> {
    try {
      const r = await this.app.call("atelier.documents.rawSource", { id });
      this.download(safeFileName(r.fileName), r.json);
    } catch (error) {
      this.app.notifyError(error);
    }
  }
  async repair(part: "catalog" | "library" | "freeGeneration"): Promise<void> {
    try {
      const r = await this.app.call("atelier.repair", { part, confirm: true });
      this.app.applyAtelier(r.state);
    } catch (error) {
      this.app.notifyError(error);
    }
  }

  /* ---------------------------------------------------------------------------------------------- guidelines */

  private async libraryCall<T extends { state: AtelierState }>(call: () => Promise<T>): Promise<T | null> {
    this.store.patch({ busy: true, guidelineError: null });
    try {
      const result = await call();
      this.app.applyAtelier(result.state);
      return result;
    } catch (caught) {
      const rpc = toRpcError(caught);
      const conflict = errorKind(rpc) === "field-conflict" ? (rpc.details as AtelierFieldConflict) : undefined;
      this.store.patch({ guidelineError: { message: conflict ? (conflict.kind === "character" || conflict.kind === "outfit" ? L.recovery.freeChanged : L.recovery.guidelineChanged) : rpc.message, ...(conflict ? { conflict } : {}) } });
      return null;
    } finally {
      this.store.patch({ busy: false });
    }
  }

  selectGuideline(kind: GuidelineKind, id: string): Promise<unknown> {
    return this.libraryCall(() => this.app.call("atelier.instructions.select", { kind, id }));
  }
  async createGuideline(kind: GuidelineKind, copyOf?: string): Promise<string | null> {
    const r = await this.libraryCall(() => this.app.call("atelier.instructions.create", { kind, ...(copyOf ? { copyOf } : {}) }));
    if (r) this.openEditor({ type: "guideline", kind, id: r.id });
    return r?.id ?? null;
  }
  async removeGuideline(kind: GuidelineKind, id: string): Promise<boolean> {
    const r = await this.libraryCall(() => this.app.call("atelier.instructions.remove", { kind, id }));
    if (r) {
      this.dropGuidelineDrafts(kind, id);
      const editor = this.snapshot.view.editor;
      if (editor?.type === "guideline" && editor.id === id) this.closeEditor();
    }
    return !!r;
  }
  setOutputMode(id: string, mode: "illustration" | "comic"): Promise<unknown> {
    return this.libraryCall(() => this.app.call("atelier.instructions.setOutputMode", { id, mode }));
  }
  setSizes(id: string, allowedSizeIds: number[], customSizes: Array<{ id: number; width: number; height: number }> = []): Promise<unknown> {
    return this.libraryCall(() => this.app.call("atelier.instructions.setSizes", { id, allowedSizeIds, ...(customSizes.length ? { customSizes } : {}) }));
  }
  setOption(id: string, optionId: string, value: boolean): Promise<unknown> {
    return this.libraryCall(() => this.app.call("atelier.instructions.setOption", { id, optionId, value }));
  }
  async setSystem(id: string, system: SceneSystem): Promise<string[] | null> {
    const r = await this.libraryCall(() => this.app.call("atelier.instructions.setSystems", { systems: { [id]: system } }));
    return r ? r.incomplete : null;
  }
  async restoreGuideline(id: string): Promise<boolean> {
    if (Object.values(this.snapshot.guidelineDrafts).some((d) => d.kind === "scene" && d.id === id)) {
      this.store.patch({ guidelineError: { message: L.guidelines.saveBeforeRestore } });
      return false;
    }
    const expected = this.state?.library.scene.items[id] as SceneInstruction | undefined;
    if (!expected) return false;
    return !!(await this.libraryCall(() => this.app.call("atelier.instructions.restore", { id, expected })));
  }
  setExecution(patch: AtelierExecutionPatch): Promise<unknown> {
    return this.libraryCall(() => this.app.call("atelier.execution.set", { patch }));
  }
  async importLegacyDirections(): Promise<number | null> {
    const r = await this.libraryCall(() => this.app.call("atelier.instructions.importLegacyDirections", { baseRevision: this.state!.revision }));
    return r ? r.created.scene.length + r.created.imageRatio.length : null;
  }

  /** Stored value of a guideline field (the `before` of a draft). */
  guidelineValue(kind: GuidelineKind, id: string, field: string): unknown {
    const state = this.state;
    if (!state) return undefined;
    const item = (kind === "scene" || kind === "imageRatio" ? state.library[kind].items[id] : state.freeGeneration[kind].items[id]) as unknown as Record<string, unknown> | undefined;
    return item?.[field];
  }
  editGuideline(kind: GuidelineKind, id: string, field: string, value: unknown): void {
    const key = guidelineDraftKey(kind, id, field);
    const drafts = { ...this.snapshot.guidelineDrafts };
    const before = drafts[key]?.before ?? this.guidelineValue(kind, id, field);
    if (value === before || (value === null && before === undefined)) delete drafts[key];
    else drafts[key] = { kind, id, field, before, value };
    this.store.patch({ guidelineDrafts: drafts, guidelineError: null });
  }
  dropGuidelineDrafts(kind: GuidelineKind, id: string): void {
    const drafts = Object.fromEntries(Object.entries(this.snapshot.guidelineDrafts).filter(([, d]) => !(d.kind === kind && d.id === id)));
    this.store.patch({ guidelineDrafts: drafts, guidelineError: null });
  }
  /** Saves the drafts of one guideline with the field check (AM `qst` save). */
  async saveGuideline(kind: GuidelineKind, id: string): Promise<boolean> {
    const edits = Object.values(this.snapshot.guidelineDrafts).filter((d) => d.kind === kind && d.id === id).map(({ id: itemId, field, before, value }) => ({ id: itemId, field, before, value }));
    if (!edits.length) return true;
    const r = await this.libraryCall(() => this.app.call("atelier.instructions.save", { kind, edits }));
    if (r) this.dropGuidelineDrafts(kind, id);
    return !!r;
  }
  /** Field conflict: take the latest stored value as the new base of the draft (keeps the typed value). */
  rebaseGuidelineDraft(kind: GuidelineKind, id: string, useLatest: boolean): void {
    const drafts = { ...this.snapshot.guidelineDrafts };
    for (const [key, d] of Object.entries(drafts)) {
      if (d.kind !== kind || d.id !== id) continue;
      const latest = this.guidelineValue(kind, id, d.field);
      if (useLatest) delete drafts[key];
      else drafts[key] = { ...d, before: latest };
    }
    this.store.patch({ guidelineDrafts: drafts, guidelineError: null });
  }
}

export const AtelierContext = createContext<AtelierStore | null>(null);
export function useAtelierStore(): AtelierStore {
  const store = useContext(AtelierContext);
  if (!store) throw new Error("AtelierContext missing");
  return store;
}
export function useAtelier<S>(selector: (snapshot: AtelierSnapshot) => S): S {
  return useSelector(useAtelierStore().store, selector);
}
