/**
 * NovelAI V5 raw config validation, catalog compilation, canonical JSON and FNV hashing.
 *
 * Thin typed facade over the verbatim Asset Maid core (src/engine/core/asset-maid-core.ts). No algorithm is
 * re-implemented here; every function delegates to the original declaration named in its JSDoc.
 */
import {
  NovelAIV5RawValidationError as CoreRawValidationError,
  NOVELAI_V5_COMPILER_VERSION,
  NOVELAI_V5_RAW_CONFIG,
  validateNovelAIV5RawConfig,
  assertNovelAIV5RawConfig,
  canonicalizeV5Value,
  canonicalJsonStringify,
  fnv1a64Hash,
  compileNovelAIV5Catalog,
  getDefaultNovelAIV5Catalog,
  WFe as catalogFingerprintOf,
} from "../core/asset-maid-core";
import type { V5CatalogHashes, V5CompiledCatalog, V5Json, V5RawDiagnostic, V5RawValidationResult } from "./types";

/** Compiler version string of the V5 catalog compiler (`qAe` @38). */
export const V5_COMPILER_VERSION: "novelai-v5-catalog-v1" = NOVELAI_V5_COMPILER_VERSION as "novelai-v5-catalog-v1";

/**
 * Built-in V5 raw config literal (`dg` @5805). Equal to extract/novelai/v5-raw-config.json.
 * Treat it as read-only; clone it (JSON round trip) before editing.
 */
export const V5_RAW_CONFIG: Readonly<Record<string, unknown>> = NOVELAI_V5_RAW_CONFIG as Readonly<Record<string, unknown>>;

/** Error class thrown by the raw validator and the compiler (`uV` @29, name "NovelAIV5RawValidationError"). */
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
 * Validate a raw V5 config without throwing.
 * @param raw Candidate raw config (any JSON value).
 * @returns `{valid, diagnostics}`; every diagnostic is `{code, severity, sourcePath, message}`.
 * Original: `y1e` (validateNovelAIV5RawConfig) @1359.
 */
export function validateV5RawConfig(raw: unknown): V5RawValidationResult {
  return validateNovelAIV5RawConfig(raw) as V5RawValidationResult;
}

/**
 * Validate a raw V5 config and throw `NovelAIV5RawValidationError` (message = first error "<path>: <message>").
 * Original: `b1e` (assertNovelAIV5RawConfig) @1638.
 */
export function assertV5RawConfig(raw: unknown): void {
  assertNovelAIV5RawConfig(raw);
}

/**
 * Compile a raw V5 config into the frozen catalog (validates first, throws `NovelAIV5RawValidationError`).
 * @returns Catalog with Maps (`sizes`, `definitions`, `interactions`, ...), analyzer projection and `hashes`.
 * Original: `E1e` (compileNovelAIV5Catalog) @2059.
 */
export function compileV5Catalog(raw: unknown): V5CompiledCatalog {
  return compileNovelAIV5Catalog(raw) as unknown as V5CompiledCatalog;
}

/**
 * The cached compiled built-in catalog (`E1e(dg)`), shared by every rule runtime.
 * Original: `uF` (getDefaultNovelAIV5Catalog) @48531.
 */
export function getDefaultV5Catalog(): V5CompiledCatalog {
  return getDefaultNovelAIV5Catalog() as unknown as V5CompiledCatalog;
}

/** Hashes of the built-in catalog (`source`, `semantic`, `analyzer`, `rules`, `prompts`, `weights`, `continuity`). */
export function getDefaultV5CatalogHashes(): V5CatalogHashes {
  return getDefaultV5Catalog().hashes;
}

/**
 * Catalog fingerprint used by analyzer checkpoints and history: `v5.` + FNV-1a-64 of
 * `{compilerVersion, schema, revision, hashes}`. Original: `WFe` @48466.
 */
export function getV5CatalogFingerprint(catalog: V5CompiledCatalog = getDefaultV5Catalog()): string {
  return catalogFingerprintOf(catalog) as string;
}

/**
 * Canonicalize a JSON value: object keys sorted, `undefined` members dropped, `-0` → `0`, result deep-frozen.
 * Throws TypeError for non-finite numbers, `undefined` array items, bigint, functions, symbols.
 * Original: `_i` (canonicalizeV5Value) @1645.
 */
export function canonicalizeV5(value: unknown): V5Json {
  return canonicalizeV5Value(value) as V5Json;
}

/** `JSON.stringify(canonicalizeV5(value))`. Original: `p3` (canonicalJsonStringify) @1662. */
export function canonicalV5Json(value: unknown): string {
  return canonicalJsonStringify(value) as string;
}

/**
 * FNV-1a-64 over the canonical JSON (UTF-16 code units, low byte then high byte) → `fnv1a64-<16 hex>`.
 * Original: `np` (fnv1a64Hash) @1665.
 */
export function fnv1a64V5(value: unknown): string {
  return fnv1a64Hash(value) as string;
}
