/**
 * NovelAI V4.5 ("v4-5" analysis profile) Rule IR catalog: raw literal, compiler, default runtime,
 * analyzer projection and the values Asset Maid prints in its "State loaded" boot log.
 *
 * Everything here wraps the verbatim core (`../core/asset-maid-core`). No algorithm is re-implemented.
 */
import {
  NOVELAI_V45_RAW_CATALOG as CORE_RAW_CATALOG,
  compileV45Catalog as coreCompileV45Catalog,
  getDefaultV45Catalog as coreGetDefaultV45Catalog,
  createV45RuleRuntime as coreCreateV45RuleRuntime,
  createCatalogSourceResolver as coreCreateCatalogSourceResolver,
  createV45AnalyzerEngine,
  NOVELAI_DEFAULTS,
  D$e as buildRuleIRAnalyzerProjection,
  d9e as computeAnalyzerProjectionFingerprint,
} from "../core/asset-maid-core";

/** Read-only map used by the compiled catalog (AM class `Z5e` @38345, toStringTag "ImmutableMap"). */
export interface V45ImmutableMap<K, V> extends Iterable<[K, V]> {
  readonly size: number;
  get(key: K): V | undefined;
  has(key: K): boolean;
  entries(): IterableIterator<[K, V]>;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  forEach(fn: (value: V, key: K, map: V45ImmutableMap<K, V>) => void, thisArg?: unknown): void;
}

export interface V45SizePreset {
  id: number;
  label: string;
  width: number;
  height: number;
}

/** Raw V4.5 catalog literal shape (AM `vW` @11758). Inner records stay untyped (they are data). */
export interface V45RawCatalog {
  sizes: V45SizePreset[];
  features: Record<string, unknown>[];
  modifier_library: Record<string, unknown>[];
  presets: Record<string, unknown>;
  weights: Record<string, unknown>;
  rules: Record<string, unknown>[];
}

/** `catalog.hashes` (AM `LLe` @42098): fnv1a64 fingerprints of the raw source and of each projection. */
export interface V45CatalogHashes {
  source: string;
  semantic: string;
  analyzer: string;
  local: string;
  prompts: string;
  weights: string;
}

export interface V45CatalogStats {
  sourceRuleCount: number;
  syntheticRuleCount: number;
  attributedRuleCount: number;
  ruleInstanceCount: number;
  ruleProfileCount: number;
  familySelectorCount: number;
  expandedFamilyReferenceCount: number;
  dependencyEdgeCount: number;
  dependencyCycleCount: number;
}

export interface V45PresetPath {
  key: string;
  scope: {
    composition: string;
    category: string;
    position: string;
    variant: string;
    frame: string;
    size: number;
    key: string;
    depth: number;
  };
  nodeKeys: string[];
  [extra: string]: unknown;
}

export interface V45ContinuityGroup {
  definitionId: string;
  subjects: string[];
  policy: Record<string, unknown>;
  route: string[];
  [extra: string]: unknown;
}

/** Compiled V4.5 Rule IR catalog (return value of AM `LLe` @42061). */
export interface V45CompiledCatalog {
  readonly compilerVersion: string; // "raw-rule-ir-v12"
  readonly sizes: V45ImmutableMap<number, V45SizePreset>;
  readonly definitions: V45ImmutableMap<string, Record<string, unknown>>;
  readonly options: V45ImmutableMap<string, Record<string, unknown>>;
  readonly presetNodes: V45ImmutableMap<string, Record<string, unknown>>;
  readonly presetPaths: readonly V45PresetPath[];
  readonly ruleProfiles: V45ImmutableMap<string, Record<string, unknown>>;
  readonly ruleSources: readonly Record<string, unknown>[];
  readonly rulesByPhase: Record<string, unknown>;
  readonly continuity: {
    groups: V45ImmutableMap<string, V45ContinuityGroup>;
    counters: V45ImmutableMap<string, Record<string, unknown>>;
    derived: V45ImmutableMap<string, Record<string, unknown>>;
  };
  readonly weights: V45ImmutableMap<string, Record<string, unknown>>;
  readonly projections: {
    analyzer: { features: unknown[]; definitions: unknown[]; presets: unknown[] };
    local: { definitionIds: string[]; optionIds: string[]; ruleProfileIds: string[] };
    prompts: readonly Record<string, unknown>[];
  };
  readonly dependencies: { edges: unknown[]; cycles: unknown[]; [extra: string]: unknown };
  readonly hashes: V45CatalogHashes;
  readonly stats: V45CatalogStats;
  readonly diagnostics: readonly Record<string, unknown>[];
}

/** Analyzer v1 wire-id map (AM `M4e` @39302). `complete` must be true for the built-in runtime. */
export interface V45WireIds {
  presets: unknown;
  compositions: unknown;
  categories: unknown;
  positions: unknown;
  modifierGroups: unknown;
  modifierOptions: unknown;
  complete: boolean;
}

/** The default Rule IR runtime (AM `DLe` @42140): `{catalog, wireIds}`. Frozen singleton. */
export interface V45RuleRuntime {
  readonly catalog: V45CompiledCatalog;
  readonly wireIds: V45WireIds;
}

/** Analyzer projection of the rule runtime (AM `D$e` @51007). */
export interface V45AnalyzerProjection {
  readonly catalog: V45CompiledCatalog;
  readonly wireIds: V45WireIds;
}

export type V45PresetScope = "all" | "solo-reference";

/** The built-in V4.5 raw catalog literal (AM `vW` @11758). Do not mutate. */
export const NOVELAI_V45_RAW_CATALOG = CORE_RAW_CATALOG as unknown as V45RawCatalog;

/**
 * Compile a raw V4.5 catalog into Rule IR (AM `LLe` @42061).
 * Throws the core `y8` diagnostics error when the raw catalog has error-severity diagnostics.
 * @param raw raw catalog (same shape as `NOVELAI_V45_RAW_CATALOG`)
 * @returns frozen compiled catalog (`compilerVersion` "raw-rule-ir-v12")
 */
export function compileV45Catalog(raw: V45RawCatalog | Record<string, unknown>): V45CompiledCatalog {
  return coreCompileV45Catalog(raw) as unknown as V45CompiledCatalog;
}

/**
 * The compiled built-in catalog, memoised (AM `ute` @42136 = `LLe(vW)`).
 */
export function getDefaultV45Catalog(): V45CompiledCatalog {
  return coreGetDefaultV45Catalog() as unknown as V45CompiledCatalog;
}

/**
 * The built-in Rule IR runtime `{catalog, wireIds}` (AM `DLe` @42140), memoised and frozen.
 * This is the `ruleRuntime` passed to the analyzer engine and to the prompt compiler.
 */
export function createV45RuleRuntime(): V45RuleRuntime {
  return coreCreateV45RuleRuntime() as unknown as V45RuleRuntime;
}

/**
 * Analyzer projection of a rule runtime (AM `D$e` @51007), as built inside `Ttt` @85291.
 */
export function getV45AnalyzerProjection(runtime: V45RuleRuntime = createV45RuleRuntime()): V45AnalyzerProjection {
  return buildRuleIRAnalyzerProjection(runtime.catalog, runtime.wireIds) as unknown as V45AnalyzerProjection;
}

/**
 * Analyzer projection fingerprint for a preset scope (AM `d9e` @51888), e.g. "raw-rule-analyzer-v1.15pob1p".
 * It is part of every analyzer checkpoint fingerprint, and `all` is printed in the boot log.
 * Memoised per projection object by the core (WeakMap), so pass the same projection to reuse it.
 */
export function getV45AnalyzerProjectionFingerprint(
  scope: V45PresetScope = "all",
  projection: V45AnalyzerProjection = getV45AnalyzerProjection(),
): string {
  return computeAnalyzerProjectionFingerprint(projection, scope) as string;
}

/** Return value of the analyzer engine `summary()` (AM `Ttt` @85448). */
export interface V45AnalyzerSummary {
  presetRequestSchema: string;
  modifierRequestSchema: string;
  illustrationRequestSchema: string;
  illustrationResponseSchema: string;
  presetCount: number;
  modifierFeatureCount: number;
  checkpointCount: number;
  catalogSource: "rule-ir" | "legacy";
  analyzerProjectionFingerprint: string;
}

/** Values printed in Asset Maid's "[Asset Maid React] State loaded (...)" log (AM boot @181244-181258). */
export interface V45CatalogStateSummary {
  /** `ruleRuntime.catalog.compilerVersion` for the default catalog, else `legacy-v<version>`. */
  catalog: string;
  catalogSource: "default" | "custom";
  /** `presets=`: presetPaths.length (default) or presetIndex.length (custom). */
  presets: number;
  /** `modifiers=`: definitions.size (default) or modifierLibrary.length (custom). */
  modifiers: number;
  analyzer: V45AnalyzerSummary;
}

/**
 * Compute the "State loaded" catalog summary for the default Rule IR catalog (custom catalogs: see
 * `createCatalogSourceResolver`). Creates a throwaway analyzer engine (AM `Ttt`) with its own
 * checkpoint store, exactly as boot does, and returns its `summary()`.
 */
export function summarizeV45Catalog(runtime: V45RuleRuntime = createV45RuleRuntime()): V45CatalogStateSummary {
  const engine = createV45AnalyzerEngine(null, NOVELAI_DEFAULTS, { ruleRuntime: runtime });
  return {
    catalog: runtime.catalog.compilerVersion,
    catalogSource: "default",
    presets: runtime.catalog.presetPaths.length,
    modifiers: runtime.catalog.definitions.size,
    analyzer: engine.summary() as V45AnalyzerSummary,
  };
}

/** Resolution of `config.presetCatalog.rawJson` (AM `hlt` @105876 / `H6` @105870). */
export type V45CatalogSource =
  | { catalog: null; source: "default"; warning: string; ruleRuntime: V45RuleRuntime }
  | { catalog: Record<string, unknown>; source: "custom"; warning: ""; ruleRuntime: null };

export interface V45CatalogSourceResolver {
  /** Default resolution (built-in Rule IR). */
  getSnapshot(): V45CatalogSource;
  /**
   * Resolve the raw JSON text: empty -> default; parses + compiles (legacy `n$e`) -> custom;
   * otherwise default with `warning` = error message. Memoised on the trimmed text.
   */
  resolve(rawJson?: string): V45CatalogSource;
  invalidate(): void;
}

/**
 * Preset catalog source resolver (AM `hlt` @105876). "custom" switches the analyzer to
 * two-stage execution (see `resolveAnalyzerExecutionMode`) and the compiler to the legacy path.
 */
export function createCatalogSourceResolver(): V45CatalogSourceResolver {
  return coreCreateCatalogSourceResolver() as unknown as V45CatalogSourceResolver;
}

/** Continuity groups compiled from the catalog (`catalog.continuity.groups`), as a plain array. */
export function listV45ContinuityGroups(catalog: V45CompiledCatalog = getDefaultV45Catalog()): V45ContinuityGroup[] {
  return [...catalog.continuity.groups.values()];
}

/** Size presets of the catalog (ids 1..5), in catalog order. */
export function listV45SizePresets(catalog: V45CompiledCatalog = getDefaultV45Catalog()): V45SizePreset[] {
  return [...catalog.sizes.values()];
}
