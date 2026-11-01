/**
 * NovelAI V5 raw config validation, catalog compilation, Maid Atelier presets, canonical JSON and FNV hashing.
 *
 * Thin typed facade over the verbatim Asset Maid 0.9.90 core (src/engine/core/asset-maid-core.ts). No algorithm is
 * re-implemented here; every function delegates to the original declaration named in its JSDoc (p120 name @line).
 */
import {
  NovelAIV5RawValidationError as CoreRawValidationError,
  NOVELAI_V5_COMPILER_VERSION,
  NOVELAI_V5_RAW_CONFIG,
  NOVELAI_V5_NORMALIZED_RAW_CONFIG,
  normalizeAndValidateNovelAIV5RawConfig,
  normalizeNovelAIV5RawConfig,
  canonicalizeV5Value,
  canonicalJsonStringify,
  fnv1a64Hash,
  compileNovelAIV5Catalog,
  getDefaultNovelAIV5Catalog,
  computeCatalogFingerprint,
  parseAtelierPresetJson,
  compileAtelierPresetJson,
  compileAtelierPresetJsonOrThrow,
  selectActiveAtelierPreset,
  compileActiveAtelierPreset,
  BUILTIN_ATELIER_PRESETS as CORE_BUILTIN_ATELIER_PRESETS,
  DEFAULT_ATELIER_PRESET_DOCUMENT as CORE_DEFAULT_ATELIER_PRESET_DOCUMENT,
} from "../core/asset-maid-core";
import type { V5CatalogHashes, V5CompiledCatalog, V5Json, V5RawDiagnostic, V5RawValidationResult } from "./types";

/** Compiler version string of the V5 catalog compiler (`OCe` @15861). */
export const V5_COMPILER_VERSION: string = NOVELAI_V5_COMPILER_VERSION as string;

/**
 * Built-in V5 raw config literal (`Gl` @1631, `analysisPresets` inline). Equal to core/data/v5-raw-config.json.
 * Treat it as read-only; clone it (JSON round trip) before editing.
 */
export const V5_RAW_CONFIG: Readonly<Record<string, unknown>> = NOVELAI_V5_RAW_CONFIG as Readonly<Record<string, unknown>>;

/** Normalized built-in raw config (`Od` @2468 = `L2e(Gl)`), the source of `getDefaultV5Catalog()`. */
export const V5_NORMALIZED_RAW_CONFIG: Readonly<Record<string, unknown>> = NOVELAI_V5_NORMALIZED_RAW_CONFIG as Readonly<
  Record<string, unknown>
>;

/** Error class thrown by the compiler (`JS` @13718, name "NovelAIV5RawValidationError"). */
export const NovelAIV5RawValidationError = CoreRawValidationError as unknown as {
  new (diagnostics: readonly V5RawDiagnostic[]): Error & { readonly diagnostics: readonly V5RawDiagnostic[] };
  prototype: Error & { readonly diagnostics: readonly V5RawDiagnostic[] };
};
export type NovelAIV5RawValidationError = Error & { readonly diagnostics: readonly V5RawDiagnostic[] };

/** True when `error` is a raw validation error from the V5 validator/compiler. */
export function isV5RawValidationError(error: unknown): error is NovelAIV5RawValidationError {
  return error instanceof CoreRawValidationError;
}

/**
 * Normalize (`tC` @1350) and validate (`_Ce` @15181) a raw V5 config without throwing.
 * @param raw Candidate raw config (any JSON value).
 * @param ignoreUnknownFields Skip "unknown-field" diagnostics.
 * @returns `{valid, diagnostics, value}`; every diagnostic is `{code, severity, sourcePath, message}`.
 * Original: `$Y` (normalizeAndValidateNovelAIV5RawConfig) @15769.
 */
export function validateV5RawConfig(raw: unknown, ignoreUnknownFields = false): V5RawValidationResult & { readonly value: unknown } {
  return normalizeAndValidateNovelAIV5RawConfig(raw, ignoreUnknownFields) as V5RawValidationResult & { readonly value: unknown };
}

/** Normalization step only (`tC` @1350): `{value, issues}`. */
export function normalizeV5RawConfig(raw: unknown): { readonly value: unknown; readonly issues: readonly V5RawDiagnostic[] } {
  return normalizeNovelAIV5RawConfig(raw) as { readonly value: unknown; readonly issues: readonly V5RawDiagnostic[] };
}

/**
 * Validate a raw V5 config and throw `NovelAIV5RawValidationError` (message = every error "<path>: <message>").
 * 0.9.90 has no assert unit; this is `const r = $Y(raw); if (!r.valid) throw new JS(r.diagnostics)`, the same check
 * `WY` performs before compiling.
 */
export function assertV5RawConfig(raw: unknown): void {
  const result = validateV5RawConfig(raw);
  if (!result.valid) throw new NovelAIV5RawValidationError(result.diagnostics);
}

/**
 * Compile a raw V5 config into the frozen catalog (normalizes + validates first, throws `NovelAIV5RawValidationError`).
 * Original: `WY` (compileNovelAIV5Catalog) @16323.
 */
export function compileV5Catalog(raw: unknown): V5CompiledCatalog {
  return compileNovelAIV5Catalog(raw) as unknown as V5CompiledCatalog;
}

/**
 * The cached compiled bundled catalog (`WY(Od)`). Note: the default Atelier preset compiles to a different catalog
 * (it adds `nw.content.system`); use `compileActiveAtelierPreset` for what a run actually uses.
 * Original: `uz` (getDefaultNovelAIV5Catalog) @43295.
 */
export function getDefaultV5Catalog(): V5CompiledCatalog {
  return getDefaultNovelAIV5Catalog() as unknown as V5CompiledCatalog;
}

/** Hashes of the bundled catalog (`source`, `semantic`, `analyzer`, `rules`, `prompts`, `weights`, `continuity`, ...). */
export function getDefaultV5CatalogHashes(): V5CatalogHashes {
  return getDefaultV5Catalog().hashes;
}

/**
 * Catalog fingerprint used by analyzer checkpoints and history: `v5.` + FNV-1a-64 of
 * `{compilerVersion, schema, revision, hashes}`. Original: `WDe` @43230.
 */
export function getV5CatalogFingerprint(catalog: V5CompiledCatalog = getDefaultV5Catalog()): string {
  return computeCatalogFingerprint(catalog) as string;
}

/**
 * Canonicalize a JSON value: object keys sorted, `undefined` members dropped, `-0` → `0`, result deep-frozen.
 * Throws TypeError for non-finite numbers, `undefined` array items, bigint, functions, symbols.
 * Original: `Ua` (canonicalizeV5Value).
 */
export function canonicalizeV5(value: unknown): V5Json {
  return canonicalizeV5Value(value) as V5Json;
}

/** `JSON.stringify(canonicalizeV5(value))`. Original: `QS` (canonicalJsonStringify). */
export function canonicalV5Json(value: unknown): string {
  return canonicalJsonStringify(value) as string;
}

/**
 * FNV-1a-64 over the canonical JSON (UTF-16 code units, low byte then high byte) → `fnv1a64-<16 hex>`.
 * Original: `rp` (fnv1a64Hash).
 */
export function fnv1a64V5(value: unknown): string {
  return fnv1a64Hash(value) as string;
}

// ---------------------------------------------------------------------------------------------------------------
// Maid Atelier presets (0.9.90). A preset document is `{format: "asset-maid-preset", title?, content}` stored as JSON
// text in `config.presetCatalog.atelier.documents[].json`.
// ---------------------------------------------------------------------------------------------------------------

/** One stored Atelier preset entry. */
export interface AtelierPresetEntry {
  readonly id: string;
  readonly name?: string;
  readonly json: string;
  readonly [key: string]: unknown;
}

/** `config.presetCatalog` as far as the engine reads it. Absent `atelier` = built-in list. */
export interface AtelierPresetCatalog {
  readonly atelier?: { readonly activeId?: string; readonly revision?: number; readonly documents: readonly AtelierPresetEntry[] } | null;
  readonly [key: string]: unknown;
}

/** Result of compiling an Atelier preset (`rZ`). Invalid: `{valid:false, diagnostics}`. */
export interface AtelierPresetCompileResult {
  readonly valid: boolean;
  readonly diagnostics: readonly V5RawDiagnostic[];
  readonly catalog?: V5CompiledCatalog;
  readonly raw?: unknown;
  readonly document?: { readonly format: "asset-maid-preset"; readonly title?: string; readonly content: Record<string, unknown> };
  readonly json?: string;
  readonly [key: string]: unknown;
}

/** Built-in preset list used when `presetCatalog.atelier` is absent (`r2` @17662; one "default" document). */
export const BUILTIN_ATELIER_PRESETS: readonly AtelierPresetEntry[] = CORE_BUILTIN_ATELIER_PRESETS as unknown as readonly AtelierPresetEntry[];

/** Bundled default preset document whose `content.system` is applied under every preset (`nw` @12891). */
export const DEFAULT_ATELIER_PRESET_DOCUMENT: Readonly<Record<string, unknown>> = CORE_DEFAULT_ATELIER_PRESET_DOCUMENT as Readonly<
  Record<string, unknown>
>;

/**
 * Parse and structurally check a preset JSON text (size/depth limits, format, removed `content.continuity`).
 * Throws `NovelAIV5RawValidationError` (Korean messages) on failure. Original: `_h` (parseAtelierPresetJson) @17338.
 */
export function parseAtelierPreset(json: string): Record<string, unknown> {
  return parseAtelierPresetJson(json) as Record<string, unknown>;
}

/**
 * Compile a preset JSON text into a catalog without throwing. Original: `rZ` (compileAtelierPresetJson) @17439.
 */
export function compileAtelierPreset(json: string): AtelierPresetCompileResult {
  return compileAtelierPresetJson(json) as AtelierPresetCompileResult;
}

/** As `compileAtelierPreset` but throws `NovelAIV5RawValidationError` when invalid. Original: `Ld` @17657. */
export function compileAtelierPresetOrThrow(json: string): AtelierPresetCompileResult & { readonly catalog: V5CompiledCatalog } {
  return compileAtelierPresetJsonOrThrow(json) as AtelierPresetCompileResult & { readonly catalog: V5CompiledCatalog };
}

/**
 * Select the active preset of a preset catalog: `{kind:"preset", json}`. Throws when `activeId` is missing from the
 * documents. Original: `nZ` (selectActiveAtelierPreset) @17665.
 */
export function selectActiveAtelierPresetJson(presetCatalog: AtelierPresetCatalog | null | undefined): { readonly kind: "preset"; readonly json: string } {
  return selectActiveAtelierPreset(presetCatalog ?? {}) as { readonly kind: "preset"; readonly json: string };
}

/**
 * Compile the active preset of a preset catalog (throws when invalid). Original: `aZ(nZ(presetCatalog))` @17673.
 */
export function compileActiveAtelierPresetCatalog(
  presetCatalog: AtelierPresetCatalog | null | undefined,
): AtelierPresetCompileResult & { readonly catalog: V5CompiledCatalog } {
  return compileActiveAtelierPreset(selectActiveAtelierPresetJson(presetCatalog)) as AtelierPresetCompileResult & {
    readonly catalog: V5CompiledCatalog;
  };
}
