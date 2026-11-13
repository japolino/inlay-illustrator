/**
 * Maid Atelier data layer (Asset Maid 0.9.90): the `DefaultChanges` diff/patch functions, the directing/ratio
 * guideline library commit, the free-generation library, preset bundle import/export, catalog checks, execution
 * settings and the "AI selection history" summary.
 *
 * Thin typed facade over the verbatim 0.9.90 core (src/engine/core/asset-maid-core.ts; roots added to
 * core/tooling/slice-config.json). Nothing is re-implemented: every function delegates to the original declaration
 * named in its JSDoc (p120 name @line, the as95 name in the port spec carries a `$990` suffix). Errors are the
 * original ones (Korean messages); the backend maps them to English (`src/backend/services/atelier-messages.ts`).
 *
 * The functions read and return AM-shaped config snapshots (`Y0`): `presetCatalog.atelier`,
 * `runtime.instructionChanges`, `runtime.freeGenerationLibrary`, `runtime.freeGenerationInstructions`,
 * `runtime.analysisExecution`, `runtime.customImageSizes` and `novelai.v5UserDirections`.
 */
import {
  FP,
  tm,
  Nv,
  Rv,
  KP,
  HP,
  p2e,
  YX,
  Dv,
  BP,
  d2e,
  u2e,
  HV,
  XV,
  M0,
  WV,
  wAe,
  JV,
  hS,
  S8,
  A8,
  QV,
  PAe,
  OAe,
  EAe,
  kbe,
  Kst,
  Ibe,
  Sbe,
  $st,
  Gb,
  Bst,
  fye,
  QY,
  gAe,
  qV,
  hAe,
  jAe,
  pAe,
  kH,
  IH,
  ql,
  ZV,
  uC,
  fS,
  uS,
  im,
  zd,
  Kf,
  $P,
  nm,
  createDefaultAnalysisDocument as L0,
  resolveStoredAnalysisDocument as w8,
  resolveAnalysisDocument as zc,
  readAtelierDirectingRules as eS,
  vS_91,
  mergeDirectingRules as VP,
  stripAnalysisDocumentVersions as QI,
  assertDirectingRules as C8,
  compileAtelierPresetJsonOrThrow as Ld,
  BUILTIN_ATELIER_PRESETS as r2,
} from "../core/asset-maid-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;
type Rec = Record<string, unknown>;
const call = <T>(fn: unknown, ...args: unknown[]): T => (fn as AnyFn)(...args) as T;

/* ------------------------------------------------------------------------------------------------ shapes */

/** `DefaultChanges` (diff of a default value; spec atelier-data §1.6). */
export type AtelierDefaultChanges =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "object"; readonly added: Readonly<Rec>; readonly removed: readonly string[]; readonly changed: Readonly<Record<string, AtelierDefaultChanges>> }
  | { readonly kind: "list"; readonly entries: AtelierDefaultChanges; readonly moves: readonly { readonly id: string; readonly before: readonly string[]; readonly after: readonly string[] }[] };

/** Guideline library (`InstructionLibrary`, §1.3); item shapes are owned by the core. */
export interface AtelierLibrary {
  migration?: number;
  scene: { selected: string; lastSelectedByMode?: Partial<Record<"illustration" | "comic", string>>; items: Record<string, Rec> };
  imageRatio: { selected: string; items: Record<string, Rec> };
  [key: string]: unknown;
}
/** Free-generation library (§1.5). */
export interface AtelierFreeGenerationLibrary {
  character: { selected: string; items: Record<string, { name: string; instruction?: string; designInstruction?: string }> };
  outfit: { selected: string; items: Record<string, { name: string; instruction?: string; designInstruction?: string }> };
}
/** `presetCatalog.atelier` (§1.1). */
export interface AtelierCatalogValue {
  documents: Array<{ id: string; name: string; json: string }>;
  activeId: string;
  revision: number;
}
/** Catalog conflict diagnostic (`Ibe`). */
export interface AtelierCatalogConflict {
  expectedRevision: number;
  actualRevision: number;
  fields: string[];
  documents: Array<{ id: string; fields: string[] }>;
}

/* ------------------------------------------------------------------------------------------------ diff / patch */

/** Diff `next` against `base` (lists of `{id}` objects by id + LIS moves). Original: `FP` @51. */
export function diffDefaultChanges(base: unknown, next: unknown): AtelierDefaultChanges | undefined {
  return call(FP, base, next);
}
/** Apply a diff (`"Invalid change key"` / `"Invalid default changes"`). Original: `tm` @84. */
export function applyDefaultChanges<T>(base: T, changes: AtelierDefaultChanges | undefined): T {
  return call(tm, base, changes);
}
/** Paths whose user change no longer applies to the current default. Original: `Nv` @116. */
export function pendingDefaultChangePaths(base: unknown, changes: AtelierDefaultChanges | undefined, prefix = ""): string[] {
  return call(Nv, base, changes, prefix);
}
/** Rebase: diff of `next` vs `base`, keeping `previous` where it still differs. Original: `Rv` @125. */
export function rebaseDefaultChanges(base: unknown, next: unknown, previous: AtelierDefaultChanges | undefined): AtelierDefaultChanges | undefined {
  return call(Rv, base, next, previous);
}
/** Drop the change at a key path. Original: `KP` @158. */
export function dropDefaultChangePath(changes: AtelierDefaultChanges | undefined, path: readonly string[]): AtelierDefaultChanges | undefined {
  return call(KP, changes, path);
}

/* ------------------------------------------------------------------------------------------------ guideline library */

/** Built-in library (`default`, `default-comic`, `system-pov`, `system-ensemble`; ratio `default`). Original: `L0` @4393. */
export function createBuiltInLibrary(): AtelierLibrary {
  return call(L0);
}
/** Stored library of a config (built-in + `runtime.instructionChanges`). Original: `w8` @4136. */
export function resolveStoredLibrary(config: unknown): AtelierLibrary {
  return call(w8, config);
}
/**
 * Effective library (stored + the directing rules of the active preset, or of `presetId`: 0.9.91 guideline editing
 * reads the preset being edited). Original: `zc(config, presetId)` 0.9.91 @4224.
 */
export function resolveLibrary(config: unknown, presetId?: string): AtelierLibrary {
  return call(zc, config, presetId);
}
/**
 * Directing rules `{document, parsed, rules}` of the active preset (or of `presetId`), or undefined.
 * Original: `eS` = `vS_91(config)`; with `presetId`: `vS_91(config, presetId)` 0.9.91 @975.
 */
export function readActivePresetRules(config: unknown, presetId?: string): { document: { id: string; name: string; json: string }; parsed: Rec; rules: Record<string, Rec[]> } | undefined {
  return presetId === undefined ? call(eS, config) : call(vS_91, config, presetId);
}
/** Overlay preset rules onto a library. Original: `VP` @910. */
export function overlayPresetRules(library: AtelierLibrary, rules: Record<string, Rec[]> | undefined): AtelierLibrary {
  return call(VP, library, rules);
}
/**
 * Library commit (`hS` 0.9.91 @3957): preset rule write-back (`v2e`), output-mode normalization (`JV`),
 * `runtime.instructionChanges = Rv(L0(), tW(lib, false), previous)` (with `restoreId`: the item's change is dropped
 * first, `KP`), `analysisExecution` mode from the selected item. Returns the next config.
 * 0.9.91: the third argument (unused in 0.9.90) is the id of the preset being edited: its directing rules receive the
 * write-back (default: the active preset); throws "편집하던 프리셋이 없어 규칙을 저장하지 못했습니다." when the catalog no
 * longer has that preset.
 */
export function commitLibrary<T extends object>(config: T, library: AtelierLibrary, presetId?: string, restoreId?: string): T {
  return call(hS, config, library, presetId, restoreId);
}
/** Validate a library edit against the current effective library (`bS` stored + changed rules). Original: `jAe` @4043. */
export function validateLibraryEdit(current: AtelierLibrary, next: AtelierLibrary): void {
  call(jAe, current, next);
}
/** Check the rules of `library` (for `selected`) against a compiled preset catalog. Original: `C8` @4466. */
export function assertLibraryRules(library: AtelierLibrary, catalog: unknown, selected?: string): void {
  call(C8, library, catalog, selected);
}
/** Output-mode normalization + `lastSelectedByMode`. Original: `JV` @3863. */
export function normalizeLibraryOutputModes(library: AtelierLibrary, mode?: string): AtelierLibrary {
  return call(JV, library, mode);
}
/** Pending defaults of inherited copies. Original: `EAe` @4461. */
export function pendingInheritedDefaults(library: AtelierLibrary): string[] {
  return call(EAe, library);
}
/** Copy of a scene item under a new id (inherited copies keep `inheritance`). Original: `OAe` @4455. */
export function copySceneItem(item: Rec, fromId: string, toId: string): Rec {
  return call(OAe, item, fromId, toId);
}
/** Copy of a scene item with re-id'd options and rules. Original: `HV` @3424. */
export function reidSceneItem(item: Rec, fromId: string, toId: string): Rec {
  return call(HV, item, fromId, toId);
}
/** Restore a built-in scene item (keeps user rules). Original: `pAe` @3457. */
export function restoreBuiltInSceneItem(item: Rec, id: string): Rec {
  return call(pAe, item, id);
}
/** Empty directing rule set `{options:[], values:{}, rules:[]}`. Original: `uC` @3112. */
export function emptySceneSystem(): Rec {
  return call(uC);
}
/** Provided rules of `system-pov` / `system-ensemble` (undefined for other ids). Original: `fS` @3286. */
export function providedSceneSystem(id: string): Rec | undefined {
  return call(fS, id);
}
/** Built-in provided scene ids (`["system-pov", "system-ensemble"]`). Original: `uS` @3110. */
export const PROVIDED_SCENE_IDS: readonly string[] = uS as readonly string[];
/** `default` / `default-comic`. Original: `im`. */
export function isDefaultSceneId(id: string): boolean {
  return call(im, id);
}
/** Output mode of a scene item (absent = illustration). Original: `zd`. */
export function sceneOutputMode(item: Rec | undefined): "illustration" | "comic" {
  return call(zd, item ?? {});
}

/** Read a draft field of a guideline item (`customText` = `customInstruction.text`). Original: `kH` @121076. */
export function readGuidelineField(item: Rec, field: string): unknown {
  return call(kH, item, field);
}
/** Write a draft field of a guideline item (`customText`, `outputMode`, `system`, else plain). Original: `IH` @121077. */
export function writeGuidelineField(item: Rec, field: string, value: unknown): void {
  call(IH, item, field, value);
}
/** Valid custom image sizes (unique ids, 64..2048). Original: `ql`. */
export function normalizeCustomSizes(sizes: readonly unknown[]): Array<{ id: number; width: number; height: number }> {
  return call(ql, sizes);
}
/**
 * Library key a legacy (array-form) bundle item gets on import, as `kbe` computes it per item (`legacy-<hash>`,
 * a built-in id, or a content match). Original: `ZV` @4082 on a fresh `L0()`.
 */
export function legacyBundleItemKey(analysis: Rec, kind: "scene" | "imageRatio", itemId: string, title: string): string {
  const items = ((analysis[kind] as { items?: Rec[] } | undefined)?.items ?? []).filter((i) => i.id === itemId);
  const single = { ...analysis, scene: { selected: "", items: [] }, imageRatio: { selected: "", items: [] }, [kind]: { selected: itemId, items } };
  return call<Record<string, string>>(ZV, call(L0), single, title)[kind]!;
}

/* ------------------------------------------------------------------------------------------------ free generation */

/** `["character", "outfit"]`. Original: `nm` @580. */
export const FREE_GENERATION_KINDS: readonly ("character" | "outfit")[] = nm as readonly ("character" | "outfit")[];
/** Built-in judgment instructions. Original: `Kf` @623. */
export const FREE_GENERATION_DEFAULT_INSTRUCTIONS: Readonly<Record<"character" | "outfit", string>> = Kf as Readonly<Record<"character" | "outfit", string>>;
/** Built-in design instructions. Original: `$P` @582. */
export const FREE_GENERATION_DEFAULT_DESIGN: Readonly<Record<"character" | "outfit", string>> = $P as Readonly<Record<"character" | "outfit", string>>;
/** Effective free-generation library (built-in defaults + stored items; legacy strings become `legacy`). Original: `Dv` @653. */
export function resolveFreeGenerationLibrary(config: unknown): AtelierFreeGenerationLibrary {
  return call(Dv, config);
}
/** Validate a (partial) free-generation library or bundle (throws Korean errors). Original: `BP` @584. */
export function validateFreeGeneration(value: unknown): void {
  call(BP, value);
}
/** Stored form (without the `default` items). Original: `YX` @739. */
export function storedFreeGenerationLibrary(library: AtelierFreeGenerationLibrary): Rec {
  return call(YX, library);
}
/** Normalized bundle (`string` kinds become a `legacy` item). Original: `HP` @679. */
export function normalizeFreeGenerationBundle(value: unknown): Rec {
  return call(HP, value);
}
/** Merge a preset's bundled free-generation items under fresh ids (name suffix on clashes). Original: `p2e` @715. */
export function mergeFreeGenerationBundle(library: AtelierFreeGenerationLibrary, bundle: unknown, documentName: string, newId?: () => string): AtelierFreeGenerationLibrary {
  return newId ? call(p2e, library, bundle, documentName, newId) : call(p2e, library, bundle, documentName);
}
/** Selected judgment instructions. Original: `d2e`. */
export function selectedFreeGenerationInstructions(config: unknown): Record<"character" | "outfit", string> {
  return call(d2e, config);
}
/** Selected design instructions. Original: `u2e`. */
export function selectedFreeGenerationDesign(config: unknown): Record<"character" | "outfit", string> {
  return call(u2e, config);
}

/* ------------------------------------------------------------------------------------------------ bundles / import / export */

/**
 * Normalize an imported preset: bundled guidelines become the keyed form (legacy shapes become `legacy-<hash>`
 * items), validated. `{json, names, count}`. Original: `kbe` @120696.
 */
export function normalizeImportedPreset(json: string): { json: string; names: string[]; count: number } {
  return call(kbe, json);
}
/** Duplicate/new document JSON: bundled guidelines dropped, `analysis.scene.rules` kept. Original: `Sbe` @120765. */
export function presetJsonForCopy(json: string): string {
  return call(Sbe, json);
}
/**
 * Export a preset with the selected guidelines bundled (`content.analysis`), re-validated. Returns the compile
 * result (`document`, `json`). Original: `$st` @120778.
 */
export function exportPresetDocument(
  json: string,
  library: AtelierLibrary,
  title: string,
  selection: { scene: string[]; imageRatio: string[]; freeGeneration?: Partial<Record<"character" | "outfit", string[]>> } | undefined,
  freeGeneration: AtelierFreeGenerationLibrary | undefined,
): { document: Rec; json: string } {
  return call($st, json, library, title, selection, freeGeneration);
}
/** Default export selection: every non built-in item (+ all free-generation items). Original: `S8` @4246. */
export function defaultExportSelection(library: AtelierLibrary, freeGeneration?: AtelierFreeGenerationLibrary): { scene: string[]; imageRatio: string[]; freeGeneration?: Record<string, string[]> } {
  return call(S8, library, freeGeneration);
}
/** Expand an export selection with referenced directions (throws when an id is missing). Original: `A8` @4260. */
export function expandExportSelection(library: AtelierLibrary & { freeGeneration?: unknown }, selection: unknown): { scene: string[]; imageRatio: string[]; freeGeneration?: Record<string, string[]> } {
  return call(A8, library, selection);
}
/** Bundle the selected guidelines (`content.analysis` keyed form). Original: `QV` @4294. */
export function bundleGuidelines(library: AtelierLibrary, selection?: unknown, freeGeneration?: unknown): Rec {
  return selection === undefined ? call(QV, library) : call(QV, library, selection, freeGeneration);
}
/** Merge a keyed bundle into the user library under fresh ids (name suffix on clashes). Original: `PAe` @4308. */
export function mergeGuidelineBundle(library: AtelierLibrary, bundle: unknown, documentName: string, newId?: () => string): AtelierLibrary {
  return newId ? call(PAe, library, bundle, documentName, newId) : call(PAe, library, bundle, documentName);
}
/**
 * Legacy V5 user directions (`novelai.v5UserDirections` + custom sizes) as the array-form `content.analysis` of a
 * preset. Original: `XV` @3679.
 */
export function legacyDirectionsAnalysis(directions: unknown, customImageSizes: readonly unknown[] = []): Rec {
  return call(XV, directions, customImageSizes);
}
/** Document title fallback (`title || fileName || "새 프리셋"`). Original: `QY` @17313. */
export function presetTitle(document: { title?: string }, fileName: string): string {
  return call(QY, document, fileName);
}
/** Strip version markers from a stored `content.analysis`. Original: `QI`. */
export function stripAnalysisVersions(analysis: unknown): unknown {
  return call(QI, analysis);
}

/* ------------------------------------------------------------------------------------------------ catalog */

/** Built-in documents (`[{id:"default", name:"기본 프리셋", json}]`). Original: `r2` @17662. */
export const BUILTIN_ATELIER_DOCUMENTS: readonly { readonly id: string; readonly name: string; readonly json: string }[] = r2 as readonly { id: string; name: string; json: string }[];
/**
 * Structural catalog check of `config.presetCatalog.atelier` (absent -> built-in list). Throws
 * `"저장된 메이드 아틀리에 목록 형식이 올바르지 않습니다."`. Original: `Gb` @120832.
 */
export function readAtelierCatalog(config: unknown): AtelierCatalogValue {
  return call(Gb, config);
}
/** Same catalog (revision, activeId, ids, names, json, order). Original: `Kst` @120725. */
export function sameAtelierCatalog(a: AtelierCatalogValue, b: AtelierCatalogValue): boolean {
  return call(Kst, a, b);
}
/** Conflict diagnostic between the expected and the actual catalog. Original: `Ibe` @120736. */
export function atelierCatalogConflict(expected: AtelierCatalogValue, actual: AtelierCatalogValue): AtelierCatalogConflict {
  return call(Ibe, expected, actual);
}
/**
 * Commit check: structure (`Gb`), and every new/changed document plus a newly active one compiles (`Abe`); throws an
 * Error `"<name>: <message>"` / `"<name> 활성 전환: <message>"`. Original: `Bst` @120851 (memo store omitted).
 */
export function assertAtelierCatalogCommit(base: AtelierCatalogValue, next: AtelierCatalogValue): void {
  call(Bst, undefined, base, next);
}
/** Compile a preset JSON (throws `NovelAIV5RawValidationError`). Original: `Ld` @17657. */
export function compilePresetOrThrow(json: string): { catalog: unknown; document: Rec; json: string } {
  return call(Ld, json);
}

/* ------------------------------------------------------------------------------------------------ execution */

/** Normalize `runtime.analysisExecution` (invalid -> undefined). Original: `M0` @3807. */
export function normalizeExecution(value: unknown): Rec | undefined {
  return call(M0, value);
}
/** The execution still needs its resolution / AI-coordinates seed. Original: `WV` @3826. */
export function executionNeedsSeed(config: unknown): boolean {
  return call(WV, config);
}
/** Execution of a config, or `{mode, controls}` from the legacy V5 user directions. Original: `wAe` @3830. */
export function executionOrLegacy(config: unknown, directions: unknown): Rec {
  return call(wAe, config, directions);
}
/** Illustration/comic switch: select the last guideline of that mode (`lastSelectedByMode`). Original: `gAe` @3568. */
export function selectOutputMode<T extends object>(config: T, mode: string): T {
  return call(gAe, config, mode);
}
/** Select a directing guideline and commit (`hS`). Original: `qV`. */
export function selectDirection<T extends object>(config: T, id: string): T {
  return call(qV, config, id);
}
/** Chat toolbar directing menu `{selected, lastSelectedByMode, options:[{value,label,shortLabel,outputMode}]}`. Original: `hAe`. */
export function directionMenu(config: unknown): { selected: string; lastSelectedByMode?: Rec; options: Array<{ value: string; label: string; shortLabel: string; outputMode: string }> } {
  return call(hAe, config);
}

/* ------------------------------------------------------------------------------------------------ AI selection history */

/**
 * Selection summary of an image's analyzer decision (`{status, scenes, interactions, sections, inventoryRecorded}`;
 * labels are the original Korean). Reads `decision.asset_maid_analysis` (compact record) or falls back to the full
 * graph `decision.v5_interaction_led`. Original: `fye` @148924 (+ `Out` @149013, `u4`, `Q_`).
 */
export function buildSelectionSummary(decision: unknown, actorLabels: ReadonlyArray<{ label?: string } | undefined> = []): Rec {
  return call(fye, decision, actorLabels);
}
