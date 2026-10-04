/**
 * Runtime shapes of Asset Maid 0.9.88 NovelAI V5 ("v5-hybrid") data, mirrored from the original bundle.
 *
 * Field names follow the original runtime objects exactly (camelCase for engine shapes, snake_case for analyzer
 * payload fields). Shapes that are large or open-ended keep an index signature so the verbatim core can attach
 * extra fields without breaking the facade types. See spec/novelai.md §2-§5 and spec/pipeline.md §2.4 / §3.8.
 */

/** JSON value accepted by the V5 canonicalizer and prompt data (`Ff` 150). */
export type V5Json = null | boolean | number | string | readonly V5Json[] | { readonly [key: string]: V5Json };

/** Image provider ids understood by the V5 rule language (`provider` condition) and the prompt codecs. */
export type V5ImageProviderId = "novelai" | "chan-server" | "comfy-ui";

/** Raw config validation diagnostic (`pt` helper, raw validator 29-1641). */
export interface V5RawDiagnostic {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly sourcePath: string;
  readonly message: string;
}

/** Result of `validateNovelAIV5RawConfig` (`y1e` 1359). */
export interface V5RawValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly V5RawDiagnostic[];
}

/** Frozen read-only map used by the compiled catalog (`w1e`, `NovelAIV5ImmutableMap`). */
export interface V5ReadonlyMap<K, V> {
  get(key: K): V | undefined;
  has(key: K): boolean;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  entries(): IterableIterator<[K, V]>;
  forEach(callback: (value: V, key: K) => void): void;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<[K, V]>;
}

/** Compiled catalog hashes (`E1e`); a port must reproduce them for the built-in raw config. */
export interface V5CatalogHashes {
  readonly source: string;
  readonly semantic: string;
  readonly analyzer: string;
  readonly rules: string;
  readonly prompts: string;
  readonly weights: string;
  readonly continuity: string;
}

export interface V5CompiledSize {
  readonly id: number;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly analyzerSelectable: boolean;
  readonly guidance: unknown;
}

/** Compiled catalog (`E1e` 2059-2368, compilerVersion "novelai-v5-catalog-v1"). Only the commonly used members are typed. */
export interface V5CompiledCatalog {
  readonly compilerVersion: "novelai-v5-catalog-v1";
  readonly schema: string;
  readonly revision: number;
  readonly sizes: V5ReadonlyMap<number, V5CompiledSize>;
  readonly definitions: V5ReadonlyMap<string, V5CompiledDefinition>;
  readonly stageRules: V5ReadonlyMap<string, readonly unknown[]>;
  readonly interactions: V5ReadonlyMap<string, V5CompiledInteraction>;
  readonly interactionLookup: { readonly closedIds: unknown; readonly unknownIdPolicy: string };
  readonly objects: { readonly [key: string]: unknown };
  readonly continuity: { readonly groups: V5ReadonlyMap<string, unknown>; readonly [key: string]: unknown };
  readonly weights: V5ReadonlyMap<string, { readonly by: unknown; readonly reduce: string; readonly values: unknown }>;
  readonly analyzer: { readonly sizes: readonly unknown[]; readonly [key: string]: unknown };
  readonly prompts: { readonly entries: readonly unknown[]; readonly bySemanticId: unknown };
  readonly hashes: V5CatalogHashes;
  readonly stats: { readonly [key: string]: number };
  readonly diagnostics: readonly V5RawDiagnostic[];
}

export interface V5CompiledDefinition {
  readonly id: string;
  readonly library: "shared" | "actor-action";
  readonly subjects: readonly string[];
  readonly order: number;
  readonly selection: { readonly by: "ai" | "local"; readonly min: number; readonly max: number | null };
  readonly options: V5ReadonlyMap<string, { readonly id: string; readonly semanticId: string; readonly [key: string]: unknown }>;
  readonly [key: string]: unknown;
}

export interface V5CompiledInteraction {
  readonly id: string;
  readonly allowedModes: readonly ("directed" | "mutual")[];
  readonly defaultMode: "directed" | "mutual";
  readonly promptTarget: "female" | "relation";
  readonly [key: string]: unknown;
}

/** Closed modifier selection `{id, options}` used everywhere in scene graphs. */
export interface V5ModifierSelection {
  readonly id: string;
  readonly options: readonly string[];
}

export interface V5Center {
  readonly x: number;
  readonly y: number;
}

/** Recovered analyzer illustration = scene graph consumed by the rule engine (`KRe` 28260 → `DRe` 28107). */
export interface V5SceneGraph {
  readonly slotNumber: number;
  readonly status: "recovered" | "degraded" | "unusable" | string;
  readonly presentationMode: "single-frame" | "multi-frame";
  readonly analyzerSizeId?: number;
  readonly actors: readonly V5SceneActor[];
  readonly interactions: readonly V5SceneInteraction[];
  readonly location: {
    readonly modifiers: readonly V5ModifierSelection[];
    readonly freeTags: readonly string[];
    readonly instruction: string;
    readonly comicPageInstruction?: string;
    readonly comicPageModifiers?: readonly unknown[];
    readonly comicPanels?: readonly unknown[];
    readonly comicCrossPanelActors?: readonly unknown[];
  };
  readonly framePlacement: readonly {
    readonly actorId: string;
    readonly placementIndex: number;
    readonly center: V5Center;
    readonly facing?: { readonly id: string };
    readonly instruction: string;
    readonly source: string;
    readonly panelId?: string;
  }[];
  readonly actorDetails: readonly V5SceneActorDetail[];
  readonly camera: { readonly modifiers: readonly V5ModifierSelection[]; readonly instruction: string };
  readonly diagnostics: readonly V5RecoveryDiagnostic[];
}

export interface V5SceneActor {
  readonly actorId: string;
  readonly candidateKey: string;
  readonly formId?: string;
  readonly sex?: "female" | "male" | "unknown";
  readonly continuityIdentity?: { readonly kind: string; readonly value: string };
  readonly generated?: { readonly label: string; readonly tags: readonly string[]; readonly instruction: string; readonly profile?: unknown };
  readonly outfit?: { readonly selectedId?: string; readonly [key: string]: unknown };
  readonly [key: string]: unknown;
}

export interface V5SceneInteraction {
  readonly interactionRef: string;
  readonly id: string;
  readonly mode: "directed" | "mutual";
  readonly sourceActorId?: string;
  readonly targetActorId?: string;
  readonly bindingStatus: string;
  readonly unresolvedActorRefs: readonly string[];
  readonly modifiers: readonly V5ModifierSelection[];
  readonly participantDetails: readonly { readonly actorId: string; readonly text: string }[];
  readonly panelIds?: readonly string[];
  readonly [key: string]: unknown;
}

export interface V5SceneActorDetail {
  readonly actorId: string;
  readonly placementIndex: number;
  readonly actions: readonly string[];
  readonly modifiers: readonly V5ModifierSelection[];
  readonly freeTags: readonly string[];
  readonly poseInstruction: string;
  readonly actionInstruction: string;
  readonly objectInstruction: string;
  readonly dialogueInstruction?: string;
  readonly objects: readonly unknown[];
  readonly outfit?: unknown;
  readonly [key: string]: unknown;
}

/** Recovery diagnostic (`Tt`), 125 codes listed in extract `v5-recovery-diagnostic-codes.json`. */
export interface V5RecoveryDiagnostic {
  readonly code: string;
  readonly impact: "recovered" | "degraded" | "unusable";
  readonly path: string;
  readonly message: string;
}

/** Recovered analyzer response (`FRe` 28248). */
export interface V5RecoveredResponse {
  readonly illustrations: readonly V5SceneGraph[];
  readonly diagnostics: readonly V5RecoveryDiagnostic[];
}

/** Per-actor continuity view handed to the rule engine (`ruleContinuityByActorId`). */
export interface V5RuleContinuity {
  readonly groups: Readonly<Record<string, readonly string[]>>;
  readonly counters: Readonly<Record<string, number>>;
}

/** Rule context for `sceneCompiler.compile` (spec/novelai.md §3.1; built at Ygt 118963). */
export interface V5RuleContext {
  /** `${messageId|responseKey|sessionKey}:${sourceImageToken}:${imageIndex}`; seeds deterministic rule chance. */
  readonly selectionKey: string;
  readonly actorHumanlike: Readonly<Record<string, boolean>>;
  readonly provider: V5ImageProviderId;
  readonly completelyNudeActorIds: readonly string[];
  readonly ruleContinuityByActorId: Readonly<Record<string, V5RuleContinuity>>;
  readonly requestedSizeId?: number;
}

/** Compiled free-scene draft (`_8e` 45656). */
export interface V5SceneDraft {
  readonly kind: "free_scene";
  readonly camera: { readonly sizeId: number; readonly [key: string]: unknown };
  readonly actors: readonly V5SceneActor[];
  readonly [key: string]: unknown;
}

/** Ledger entry of the V5 prompt projection (`j8e` 45875). */
export interface V5LedgerEntry {
  readonly lane: "tag" | "instruction";
  readonly destination: { readonly kind: "global" } | { readonly kind: "actor"; readonly actorId: string };
  readonly semanticId: string;
  readonly value: string;
  readonly status: "applied" | "suppressed" | string;
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly placementIndex?: number;
  readonly weight?: number;
  readonly [key: string]: unknown;
}

export interface V5SerializedLane {
  readonly tags: string;
  readonly instructions: string;
  readonly serializedPrompt: string;
}

/** Executed V5 prompt plan (`gFe` 47148; format "novelai-v5-interaction-led-prompt-v1"). */
export interface V5PromptPlan {
  readonly format: string;
  readonly sizeId: number;
  readonly width: number;
  readonly height: number;
  readonly global: V5SerializedLane;
  readonly globalNegativePrompt: string;
  readonly characters: readonly (V5SerializedLane & {
    readonly actorId: string;
    readonly placementIndex?: number;
    readonly candidateKey: string;
    readonly sex?: string;
    readonly centerX: number;
    readonly centerY: number;
    readonly negativePrompt: string;
  })[];
  readonly ledger: readonly V5LedgerEntry[];
}

/** External prompt entry (identity / outfit / artist / fixed) fed to the projection (`Rgt` 117760, `Ngt` 117721). */
export interface V5ExternalEntry {
  readonly lane: "tag";
  readonly phase: "identity" | "outfit" | "artist" | "fixed";
  readonly actorId?: string;
  readonly placementIndex?: number;
  readonly semanticId: string;
  readonly value: string;
  readonly order: number;
  readonly sourceId: string;
  readonly bodyParts?: readonly string[];
}
