/**
 * Maid Atelier (Asset Maid 0.9.90 "메이드 아틀리에"): preset documents, the directing / ratio guideline library, the
 * free-generation guidelines and the execution mode, stored together in userStorage `config/atelier.json`.
 *
 * Spec: am990 spec/atelier-data.md (data model §1, port design §4) and spec/atelier-rpc.md (the RPCs over it).
 * Shapes are AM's; the verbatim AM logic that validates, diffs and resolves them runs in the backend
 * (`src/engine/v5/atelier.ts` over the generated core). This module only holds types, constants and the pure
 * structural normalizer of the stored file, so the frontend can import it without the engine.
 */
import { asRecord, isPlainObject, trimString } from "./common.js";

export const ATELIER_SCHEMA = "inlay-illustrator.atelier";
export const ATELIER_VERSION = 1;
/** Id of the built-in preset document (AM `r2[0].id`). */
export const ATELIER_BUILTIN_DOCUMENT_ID = "default";
/** Preset file format (`OPe`). */
export const PRESET_FORMAT = "asset-maid-preset";
/** Recovery draft export format (AM as95:123057). */
export const RECOVERY_FORMAT = "asset-maid-atelier-recovery";
/** Max UTF-8 size of one preset JSON (`YCe`, "파일은 2 MiB 이하여야 합니다."). */
export const PRESET_MAX_BYTES = 2 * 1024 * 1024;
/** Max JSON nesting depth / node count of a preset (`eZ`). */
export const PRESET_MAX_DEPTH = 48;
export const PRESET_MAX_NODES = 100000;
/**
 * Port soft limits of the single atelier file (AM has none; spec §5 Q6): number of documents and total JSON size.
 * Exceeding them answers `bad-request` with detailCode `atelier-limit`.
 */
export const ATELIER_MAX_DOCUMENTS = 32;
export const ATELIER_MAX_TOTAL_BYTES = 16 * 1024 * 1024;
/** JSON of the built-in document (AM `r2[0].json`; equality with the engine is tested). */
export const BUILTIN_PRESET_JSON = JSON.stringify({ format: PRESET_FORMAT, title: "기본 프리셋", content: {} });
/** Display name of the built-in document (AM "기본 프리셋"). */
export const BUILTIN_PRESET_NAME = "기본 프리셋";

/* ------------------------------------------------------------------------------------------------
 * Preset catalog (`presetCatalog.atelier`, §1.1)
 * ---------------------------------------------------------------------------------------------- */

export interface AtelierDocumentRef {
  /** "default" for the built-in document; a UUID for user documents. */
  id: string;
  /** Display name (rename edits only this). */
  name: string;
  /** The `asset-maid-preset` document as JSON text (compared byte for byte for conflicts). */
  json: string;
}
export interface AtelierCatalog {
  /** Order = list order in the Atelier sidebar. */
  documents: AtelierDocumentRef[];
  /** Preset used for generation (AM "생성에 사용"). */
  activeId: string;
  /** +1 per committed catalog change (`_be` / `v2e`). Document RPCs pass it back as `baseRevision`. */
  revision: number;
}

/* ------------------------------------------------------------------------------------------------
 * DefaultChanges (§1.6)
 * ---------------------------------------------------------------------------------------------- */

export type DefaultChanges =
  | { kind: "value"; value: unknown }
  | { kind: "object"; added: Record<string, unknown>; removed: string[]; changed: Record<string, DefaultChanges> }
  | { kind: "list"; entries: DefaultChanges; moves: Array<{ id: string; before: string[]; after: string[] }> };

/* ------------------------------------------------------------------------------------------------
 * Guideline library (§1.3, §1.4)
 * ---------------------------------------------------------------------------------------------- */

export type OutputMode = "illustration" | "comic";
/** Built-in directing guideline ids (`sm`): fixed defaults + provided POV / ensemble. */
export const BUILTIN_SCENE_IDS = ["default", "default-comic", "system-pov", "system-ensemble"] as const;
export type BuiltInSceneId = (typeof BUILTIN_SCENE_IDS)[number];

export interface SceneSystemOption { id: string; title: string; default: boolean; key?: string }
export type SceneRuleEffect =
  | { kind: "path"; action: "add" | "remove"; path: string; value?: string | boolean | string[] }
  | { kind: "paths"; action: "add" | "remove"; targets: Array<{ path: string; value?: unknown }> }
  | { kind: "output"; target: "scene" | "persona" | "actor"; path: string; options?: string[]; action: "exclude" | "release" }
  | { kind: "role"; role: string; source: "persona" }
  | { kind: "participant"; target: string }
  | { kind: "selection"; definition: string; options: string[]; action: "require" | "exclude"; target: string }
  | { kind: "contribution"; target: string; groups: string[]; action: "exclude" | "release" }
  | { kind: "coordinates"; policy: "fixed" | "automatic" | "role-automatic"; target?: string }
  | { kind: "instruction"; text: string };
export interface SceneRule {
  id: string;
  enabled?: boolean;
  condition: { direction: string; option?: string; equals?: boolean };
  /** Only inside preset-owned rules: insert position. */
  before?: string;
  effect: SceneRuleEffect;
}
/** Directing rules of a direction (연출규칙, `u8`). */
export interface SceneSystem {
  self?: string;
  options: SceneSystemOption[];
  values: Record<string, boolean>;
  rules: SceneRule[];
}
export interface SceneInstruction {
  /** Trimmed, non-empty, <= 80 characters. */
  name: string;
  instruction: string;
  outputMode?: OutputMode;
  /** Legacy "추가 지침" (folded into `instruction` when enabled). */
  customInstruction?: { enabled: boolean; text: string };
  system?: SceneSystem;
  inheritance?: { base: BuiltInSceneId; changes?: DefaultChanges; bindings?: Record<string, string> };
}
export interface ImageRatioInstruction {
  name: string;
  instruction: string;
  allowedSizeIds: number[];
  customSizes?: Array<{ id: number; width: number; height: number }>;
}
export interface InstructionLibrary {
  migration?: 1 | 2 | 3;
  scene: { selected: string; lastSelectedByMode?: Partial<Record<OutputMode, string>>; items: Record<string, SceneInstruction> };
  imageRatio: { selected: string; items: Record<string, ImageRatioInstruction> };
}
/** Library kinds addressed by the guideline RPCs. */
export type InstructionKind = "scene" | "imageRatio";

/* ------------------------------------------------------------------------------------------------
 * Free-generation library (§1.5)
 * ---------------------------------------------------------------------------------------------- */

export const FREE_GENERATION_KINDS = ["character", "outfit"] as const;
export type FreeGenerationKind = (typeof FREE_GENERATION_KINDS)[number];
export interface FreeGenerationItem {
  name: string;
  /** Judgment criteria; absent = built-in. */
  instruction?: string;
  /** Design direction; absent = built-in. */
  designInstruction?: string;
}
export interface FreeGenerationList { selected: string; items: Record<string, FreeGenerationItem> }
export type FreeGenerationLibrary = Record<FreeGenerationKind, FreeGenerationList>;
/** Every guideline kind (`atelier.instructions.*` `kind`). */
export type GuidelineKind = InstructionKind | FreeGenerationKind;
export const GUIDELINE_KINDS: readonly GuidelineKind[] = ["scene", "imageRatio", "character", "outfit"];

/* ------------------------------------------------------------------------------------------------
 * Execution (§1.7). Port split: `mode` / `controls` live here; `resolution` / `aiCoordinates` stay in
 * `config.runtime.analysisExecution` (chat toolbar, `config.update`), see spec/atelier-rpc.md.
 * ---------------------------------------------------------------------------------------------- */

export type AtelierExecutionMode = "default" | "comic" | "pov" | "ensemble";
export interface AtelierExecutionControls { "comic.speech-bubble"?: boolean; "pov.hands"?: boolean; "comic.frame"?: 0 | 1 | 2 }
export interface AtelierExecution { mode: AtelierExecutionMode; controls: AtelierExecutionControls }
const EXECUTION_MODES: readonly AtelierExecutionMode[] = ["default", "comic", "pov", "ensemble"];

/** Structural check of a stored execution (`M0` without resolution / aiCoordinates). */
export function normalizeAtelierExecution(value: unknown): AtelierExecution | undefined {
  if (!isPlainObject(value) || !EXECUTION_MODES.includes(value.mode as AtelierExecutionMode)) return undefined;
  const controls: AtelierExecutionControls = {};
  for (const [k, v] of Object.entries(asRecord(value.controls))) {
    if ((k === "comic.speech-bubble" || k === "pov.hands") && typeof v === "boolean") controls[k] = v;
    if (k === "comic.frame" && (v === 0 || v === 1 || v === 2)) controls[k] = v;
  }
  return { mode: value.mode as AtelierExecutionMode, controls };
}

/* ------------------------------------------------------------------------------------------------
 * Stored file `config/atelier.json`
 * ---------------------------------------------------------------------------------------------- */

/** One-time migrations already applied to this file (port addition). */
export interface AtelierMigrations {
  /** `novelai.v5UserDirections` text imported into the guideline library (ids of the created items). */
  legacyDirections?: { at: string; scene: string[]; imageRatio: string[] };
}

export interface AtelierStoreDocument {
  schema: typeof ATELIER_SCHEMA;
  version: number;
  /** ISO time of the last write. */
  updatedAt: string;
  /** +1 on every write of this file (port addition; change notification only). */
  storeRevision: number;
  /** AM `presetCatalog.atelier`. */
  catalog: AtelierCatalog;
  /** AM `runtime.instructionChanges` (absent = built-in library). */
  instructionChanges?: DefaultChanges;
  /** AM `runtime.freeGenerationLibrary` (stored form: without the "default" items). */
  freeGenerationLibrary?: Partial<Record<FreeGenerationKind, FreeGenerationList>>;
  /** AM `runtime.freeGenerationInstructions` legacy strings (read-only migration input). */
  freeGenerationInstructions?: Partial<Record<FreeGenerationKind, string>>;
  /** AM `runtime.analysisExecution` mode + controls (absent = from the legacy V5 user directions). */
  execution?: AtelierExecution;
  migrations?: AtelierMigrations;
}

export function createDefaultAtelierCatalog(): AtelierCatalog {
  return { documents: [{ id: ATELIER_BUILTIN_DOCUMENT_ID, name: BUILTIN_PRESET_NAME, json: BUILTIN_PRESET_JSON }], activeId: ATELIER_BUILTIN_DOCUMENT_ID, revision: 0 };
}

/** New store: the built-in document only, active, revision 0. */
export function createDefaultAtelierStore(now: string = new Date(0).toISOString()): AtelierStoreDocument {
  return { schema: ATELIER_SCHEMA, version: ATELIER_VERSION, updatedAt: now, storeRevision: 0, catalog: createDefaultAtelierCatalog() };
}

export type AtelierIssueCode = "catalog-invalid" | "library-invalid" | "free-generation-invalid" | "execution-invalid" | "wrong-schema";
export interface AtelierIssue { code: AtelierIssueCode; message: string }

/**
 * Structural catalog check (AM `Gb` rules: documents array, integer revision, string id/name/json, a "default"
 * document, unique ids, existing activeId). Returns the catalog or the reason it is invalid. The backend runs the
 * verbatim `Gb` too; this copy exists so the stored file can be normalized without the engine.
 */
export function checkAtelierCatalog(value: unknown): { catalog?: AtelierCatalog; error?: string } {
  const r = asRecord(value);
  const docs = r.documents;
  if (!Array.isArray(docs) || !Number.isInteger(r.revision)) return { error: "The stored Atelier list is invalid." };
  if (docs.some((d) => !isPlainObject(d) || typeof d.id !== "string" || typeof d.name !== "string" || typeof d.json !== "string")) return { error: "The stored Atelier list is invalid." };
  const ids = docs.map((d) => (d as AtelierDocumentRef).id);
  const activeId = typeof r.activeId === "string" ? r.activeId : ATELIER_BUILTIN_DOCUMENT_ID;
  if (!ids.includes(ATELIER_BUILTIN_DOCUMENT_ID) || new Set(ids).size !== ids.length || !ids.includes(activeId)) return { error: "The stored Atelier list is invalid." };
  return { catalog: { documents: docs.map((d) => ({ id: (d as AtelierDocumentRef).id, name: (d as AtelierDocumentRef).name, json: (d as AtelierDocumentRef).json })), activeId, revision: r.revision as number } };
}

/**
 * Lenient normalizer of the stored file (like `normalizeChatData`): an invalid catalog resets to the built-in list and
 * reports `catalog-invalid` (the backend backs the original file up first); an invalid library diff or free-generation
 * library is kept as stored and reported (the Atelier shows AM's read-failure state); nothing is dropped silently.
 */
export function normalizeAtelierStore(raw: unknown, now: string = new Date(0).toISOString()): { document: AtelierStoreDocument; issues: AtelierIssue[] } {
  const issues: AtelierIssue[] = [];
  const r = asRecord(raw);
  const base = createDefaultAtelierStore(trimString(r.updatedAt) || now);
  if (r.schema !== undefined && r.schema !== ATELIER_SCHEMA) issues.push({ code: "wrong-schema", message: `Unknown schema ${String(r.schema)}.` });
  const checked = checkAtelierCatalog(r.catalog);
  if (!checked.catalog) issues.push({ code: "catalog-invalid", message: checked.error ?? "The stored Atelier list is invalid." });
  const document: AtelierStoreDocument = {
    ...base,
    storeRevision: Number.isSafeInteger(r.storeRevision) && (r.storeRevision as number) >= 0 ? (r.storeRevision as number) : 0,
    catalog: checked.catalog ?? base.catalog,
  };
  if (r.instructionChanges !== undefined) {
    if (!isPlainObject(r.instructionChanges) || !["value", "object", "list"].includes(String(r.instructionChanges.kind))) issues.push({ code: "library-invalid", message: "The stored guideline list is invalid." });
    document.instructionChanges = r.instructionChanges as DefaultChanges;
  }
  if (r.freeGenerationLibrary !== undefined) {
    if (!isPlainObject(r.freeGenerationLibrary)) issues.push({ code: "free-generation-invalid", message: "The stored free-generation guidelines are invalid." });
    document.freeGenerationLibrary = r.freeGenerationLibrary as AtelierStoreDocument["freeGenerationLibrary"];
  }
  if (isPlainObject(r.freeGenerationInstructions)) {
    const legacy: Partial<Record<FreeGenerationKind, string>> = {};
    for (const k of FREE_GENERATION_KINDS) if (typeof r.freeGenerationInstructions[k] === "string") legacy[k] = r.freeGenerationInstructions[k] as string;
    if (Object.keys(legacy).length) document.freeGenerationInstructions = legacy;
  }
  if (r.execution !== undefined) {
    const execution = normalizeAtelierExecution(r.execution);
    if (execution) document.execution = execution;
    else issues.push({ code: "execution-invalid", message: "The stored execution mode was invalid and was reset." });
  }
  if (isPlainObject(r.migrations)) document.migrations = r.migrations as AtelierMigrations;
  return { document, issues };
}

/**
 * The Atelier part of AM's runtime config (`Y0`), merged by `buildRuntimeConfig` so the verbatim engine code
 * (`zc`, `qv`, `yAe`, `nZ`) reads it unchanged (spec §4.1 item 4).
 */
export interface AtelierRuntimeOverlay {
  catalog: AtelierCatalog;
  instructionChanges?: DefaultChanges;
  freeGenerationLibrary?: Partial<Record<FreeGenerationKind, FreeGenerationList>>;
  freeGenerationInstructions?: Partial<Record<FreeGenerationKind, string>>;
  /** Stored mode + controls, or the ones derived from the legacy V5 user directions (`wAe`). */
  execution: AtelierExecution;
}

export function atelierRuntimeOverlay(store: AtelierStoreDocument, fallbackExecution: AtelierExecution): AtelierRuntimeOverlay {
  return {
    catalog: store.catalog,
    ...(store.instructionChanges !== undefined ? { instructionChanges: store.instructionChanges } : {}),
    ...(store.freeGenerationLibrary !== undefined ? { freeGenerationLibrary: store.freeGenerationLibrary } : {}),
    ...(store.freeGenerationInstructions !== undefined ? { freeGenerationInstructions: store.freeGenerationInstructions } : {}),
    execution: store.execution ?? fallbackExecution,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Views returned by the RPCs
 * ---------------------------------------------------------------------------------------------- */

/** One validation finding of a preset (`JS` diagnostics; `sourcePath` like `content.rules[3].apply.remove`). */
export interface PresetDiagnostic { code: string; severity: "error" | "warning" | "info"; sourcePath: string; message: string; messageKo?: string; relatedSourcePath?: string }

export interface AtelierDocumentView extends AtelierDocumentRef {
  /** id === "default" (AM origin "기본 제공"); else a user document ("사용자 문서"). */
  builtIn: boolean;
  /** Parse / compile failure: the document can only be repaired as raw JSON (AM `readError`). */
  readError?: string;
  diagnostics?: PresetDiagnostic[];
}

/** The guideline library seen from one preset (see `AtelierState.presetLibraries`). */
export interface AtelierPresetLibrary { library?: InstructionLibrary; ownedRuleIds: Record<string, string[]>; error?: string }

/** Read failures of the stored file (AM `failureKind: "read"`). */
export interface AtelierReadFailure { code: AtelierIssueCode; message: string }

export interface AtelierState {
  /** `catalog.revision` (the `baseRevision` of document RPCs). */
  revision: number;
  storeRevision: number;
  catalog: { activeId: string; documents: AtelierDocumentView[] };
  /** Effective library (`zc`): built-ins + user diff + the active preset's directing rules. */
  library: InstructionLibrary;
  /** Direction id -> rule ids owned by the active preset (`eS`; edits of these write back into the preset). */
  ownedRuleIds: Record<string, string[]>;
  /**
   * Per document id: the library as the Atelier editor shows it with that preset open (`zc(config, id)`: stored + that
   * preset's directing rules) and the rule ids that preset owns (`vS_91(config, id)`). AM 0.9.91 `qst(e, shownId)`.
   * `library` is absent (with `error`) when that preset's rules cannot be applied. Absent in older states / mocks.
   */
  presetLibraries?: Record<string, AtelierPresetLibrary>;
  /** Effective free-generation library (`Dv`), including "default". */
  freeGeneration: FreeGenerationLibrary;
  /** Mode (from the selected directing guideline) + controls. */
  execution: AtelierExecution;
  /** Pending-defaults paths (`Nv(L0(), instructionChanges)` + `EAe`). */
  pendingDefaults: string[];
  /** Chat toolbar directing menu (`hAe`). */
  directionMenu: { selected: string; lastSelectedByMode?: Partial<Record<OutputMode, string>>; options: Array<{ value: string; label: string; shortLabel: string; outputMode: OutputMode }> };
  /** Present when the stored file could not be read as is. */
  readFailures?: AtelierReadFailure[];
  migrations?: AtelierMigrations;
}

/** Recovery draft export (`asset-maid-atelier-recovery`; drafts stay frontend-only, AM parity). */
export interface AtelierRecoveryFile { format: typeof RECOVERY_FORMAT; owner: "atelier-global"; id: string; createdAt: string; stored: AtelierCatalog; display: unknown; automatic: unknown }

/** `details` of an `atelier-conflict` failure (AM `Ibe` shape; `documents` is filled when the request named documents). */
export interface AtelierConflict {
  expectedRevision: number;
  actualRevision: number;
  fields: string[];
  documents: Array<{ id: string; fields: string[] }>;
}
/** `details` of an `atelier-field-conflict` failure. */
export interface AtelierFieldConflict { kind: GuidelineKind; id: string; field: string; expected: unknown; actual: unknown }

/** Guidelines bundled into an exported preset (AM `S8` default = every guideline). */
export interface AtelierDocumentSelection { scene: string[]; imageRatio: string[]; freeGeneration?: Partial<Record<FreeGenerationKind, string[]>> }
/** One guideline field edit: the stored value must equal `before` (or already `value`), AM field check. */
export interface AtelierGuidelineEdit { id: string; field: string; before: unknown; value: unknown }
/** `atelier.execution.set` patch: controls go to config/atelier.json, resolution / AI coordinates to the settings. */
export interface AtelierExecutionPatch { controls?: AtelierExecutionControls; resolution?: { id: number; width: number; height: number } | null; aiCoordinates?: boolean }

/** Event `atelier.changed` (after every write of `config/atelier.json`). */
export interface AtelierChangedEvent { revision: number; storeRevision: number; reason: "documents" | "library" | "free-generation" | "execution" | "migration" | "reset" }

/* ------------------------------------------------------------------------------------------------
 * AI selection history (§3.1, §4.7)
 * ---------------------------------------------------------------------------------------------- */

/** `GenerationRecord.analysis` in `chats/<chatId>/pipeline.json`. */
export interface GenerationAnalysisRecord {
  profile: "v5-hybrid";
  /** AM `asset_maid_analysis` compact record (`PDe`), or `{om:"metadata_size"}` when it was too large to keep. */
  record: unknown;
}
/** Records above this size are stored as `{om:"metadata_size"}` (summary status "omitted"). */
export const ANALYSIS_RECORD_MAX_BYTES = 512 * 1024;

export type SelectionGroup = { id: string; options: string[] } | { id: string; kind: "free" | "text"; options: string[]; recorded: boolean };
export interface SelectionSummary {
  status: "ready" | "missing" | "omitted";
  /** Scene definition per scope: `scope` "Whole scene" | panel id | "Panel N"; `id` = definition id, "" = free (AI composed). */
  scenes: Array<{ key: string; scope: string; id: string }>;
  interactions: Array<{ key: string; id: string; source: string; target: string; mutual: boolean; complete: boolean; panels: string[]; groups: SelectionGroup[] }>;
  sections: Array<{ key: string; title: string; groups: SelectionGroup[] }>;
  /** The record has the offered inventory, so "offered but not selected" groups can be shown. */
  inventoryRecorded: boolean;
}
