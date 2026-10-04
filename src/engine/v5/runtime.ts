/**
 * NovelAI V5 rule runtime, scene compiler, continuity hooks and prompt projection (ledger).
 *
 * Typed facade over the verbatim Asset Maid core. `planV5Scene` composes the per-graph steps exactly as the V5
 * orchestrator does (`Ygt` 118896-119010): compile → apply continuity → reconcile → outfit/passthrough state
 * updates → executed prompt plan. Nothing here re-implements an algorithm.
 */
import {
  createNovelAIV5RuleRuntime,
  createV5SceneCompiler,
  runV5RulePhases as coreRunV5RulePhases,
  buildV5PromptProjection as coreBuildV5PromptProjection,
  serializeV5PromptPlan as coreSerializeV5PromptPlan,
  buildV5ExecutedPromptPlan as coreBuildV5ExecutedPromptPlan,
  applyV5SceneContinuity,
  reconcileV5SceneContinuity,
  createV5ContinuityBasis as coreCreateV5ContinuityBasis,
  evaluateV5RuleCondition as coreEvaluateV5RuleCondition,
  VQ as continuitySnapshotOf,
  fbe as recordSelectedOutfits,
  Tte as recordActorPassthrough,
  om as continuityStorageKeyOf,
} from "../core/asset-maid-core";
import { getDefaultV5Catalog } from "./catalog";
import type {
  V5CompiledCatalog,
  V5ExternalEntry,
  V5PromptPlan,
  V5RecoveredResponse,
  V5RuleContext,
  V5SceneDraft,
  V5SceneGraph,
} from "./types";

/** Opaque V5 continuity state (`vN` basis / `Wte` result state). Shape owned by the continuity module. */
export type V5ContinuityState = {
  readonly actors: Readonly<Record<string, unknown>>;
  readonly scene?: unknown;
  readonly modifierRefs?: unknown;
  readonly outfitRefs?: unknown;
  readonly participants?: unknown;
  readonly sceneLayouts?: readonly unknown[];
  readonly [key: string]: unknown;
};

/** Persisted continuity snapshot (`Xk` shape: scene/characters/modifierRefs/outfitRefs/participants). */
export type V5ContinuitySnapshot = { readonly [key: string]: unknown };

/** Analyzer checkpoint store of a runtime (`ZFe` 48483; max 120 entries, no TTL). */
export interface V5CheckpointStore {
  find(context: unknown, request: unknown): { readonly checkpoint: unknown; readonly reason: string };
  store(context: unknown, request: unknown, response: unknown): void;
  clear(context: unknown): void;
  readonly [key: string]: unknown;
}

/** Scene compiler (`I8e` 45707). */
export interface V5SceneCompiler {
  compile(graph: V5SceneGraph, context: V5RuleContext): V5SceneDraft;
}

/** Analyzer request built by the runtime (`tMe` 28727). */
export interface V5AnalyzerRequest {
  readonly systemInstruction: string;
  readonly instructionModules: unknown;
  readonly payload: { readonly scene: string; readonly slot_hints?: unknown; readonly response_contract: any; readonly [key: string]: unknown };
  readonly enabledModifierRefs: readonly string[];
  readonly localRecovery: { readonly requiredParticipants: readonly unknown[]; readonly modifierDefaults: readonly unknown[] };
  readonly localProjection: { readonly characterCoordinates?: "fixed" | "automatic" | "persona-automatic"; readonly sizeId?: number };
}

/** Recovery mode of `recoverAnalyzerResponse`. */
export type V5RecoveryMode = "complete-from-request" | "preserve-response-membership";

/** V5 rule runtime (`_re` 48534): catalog, checkpoints, scene compiler, analyzer request builder and recovery. */
export interface V5RuleRuntime {
  readonly catalog: V5CompiledCatalog;
  readonly catalogFingerprint: string;
  readonly checkpoints: V5CheckpointStore;
  readonly sceneCompiler: V5SceneCompiler;
  buildAnalyzerRequest(context: Record<string, unknown>, userDirections?: Record<string, unknown>): V5AnalyzerRequest;
  recoverAnalyzerResponse(
    response: unknown,
    candidates: readonly unknown[],
    enabledModifierRefs?: readonly string[],
    sourceScene?: string,
    localRecovery?: V5AnalyzerRequest["localRecovery"],
    slotCandidateKeys?: unknown,
    requestedSlotNumbers?: readonly number[],
    actorRosterRecoveryMode?: V5RecoveryMode,
    freeCharacterGenerationEnabled?: boolean,
  ): V5RecoveredResponse;
}

/**
 * Create a V5 rule runtime over the built-in catalog.
 * @param options.checkpoints Optional analyzer checkpoint store (default: a fresh `ZFe()` store).
 * Original: `_re` (createNovelAIV5RuleRuntime) @48534.
 */
export function createV5RuleRuntime(options: { checkpoints?: V5CheckpointStore } = {}): V5RuleRuntime {
  return createNovelAIV5RuleRuntime(options) as unknown as V5RuleRuntime;
}

let shared: V5RuleRuntime | undefined;
/** Lazily created module-wide runtime (stateless apart from its checkpoint store). */
export function getSharedV5RuleRuntime(): V5RuleRuntime {
  return (shared ??= createV5RuleRuntime());
}

/**
 * Create a scene compiler bound to a catalog. Original: `I8e` (createV5SceneCompiler) @45707.
 */
export function createV5Compiler(catalog: V5CompiledCatalog = getDefaultV5Catalog()): V5SceneCompiler {
  return createV5SceneCompiler(catalog) as unknown as V5SceneCompiler;
}

/**
 * Compile one recovered scene graph into a free-scene draft (rule phases + size resolution).
 * Throws on rule violations (e.g. "V5 Rule requires an existing '<def>' selection.").
 * Original: `I8e.compile` = `s8e` (runV5RulePhases) @44830 + `_8e` (buildV5SceneDraft) @45656.
 */
export function compileV5Scene(graph: V5SceneGraph, context: V5RuleContext, catalog: V5CompiledCatalog = getDefaultV5Catalog()): V5SceneDraft {
  return createV5Compiler(catalog).compile(graph, context);
}

/** Rule phases only (`s8e` @44830): `{scene, promptEffects, projectionAttributes, matchedRules, ruleCandidates}`. */
export function runV5RulePhases(graph: V5SceneGraph, context: V5RuleContext, catalog: V5CompiledCatalog = getDefaultV5Catalog()): Record<string, unknown> {
  return coreRunV5RulePhases(graph, catalog, context.actorHumanlike, context) as Record<string, unknown>;
}

/** Evaluate one compiled rule condition (`Jx` @44017). Arguments are passed through verbatim. */
export function evaluateV5RuleCondition(...args: unknown[]): boolean {
  return (coreEvaluateV5RuleCondition as (...a: unknown[]) => boolean)(...args);
}

/** Build the V5 continuity basis from a persisted snapshot (`vN` @38066). `null` → empty basis. */
export function createV5ContinuityBasis(snapshot: V5ContinuitySnapshot | null | undefined): V5ContinuityState {
  return coreCreateV5ContinuityBasis(snapshot) as V5ContinuityState;
}

/** Convert a V5 continuity state into its persisted snapshot form (`VQ(state, "novelai-v5")` @38109). */
export function toV5ContinuitySnapshot(state: V5ContinuityState): V5ContinuitySnapshot | undefined {
  return continuitySnapshotOf(state, "novelai-v5") as V5ContinuitySnapshot | undefined;
}

/** Input of `applyV5Continuity` (`Wte` @45599). */
export interface V5ApplyContinuityInput {
  readonly scene: V5SceneGraph;
  readonly draft: V5SceneDraft;
  readonly catalog?: V5CompiledCatalog;
  readonly state: V5ContinuityState;
  /** `${sessionId}:${sourceImageToken}` in the orchestrator. */
  readonly eventScopeId: string;
  readonly advanceTurn?: boolean;
  readonly stateAccumulationEnabled?: boolean;
  readonly completelyNudeActorIds?: readonly string[];
}

/** Result of `applyV5Continuity`: `{continuity: {state, ...}, actorStorageKeyByActorId, sceneLocationTags, sceneModifiers}`. */
export interface V5AppliedContinuity {
  readonly continuity: { readonly state: V5ContinuityState; readonly [key: string]: unknown };
  readonly actorStorageKeyByActorId: Readonly<Record<string, string>>;
  readonly sceneLocationTags: readonly string[];
  readonly sceneModifiers: unknown;
}

/** Apply persisted continuity to a compiled draft. Original: `Wte` (applyV5SceneContinuity) @45599. */
export function applyV5Continuity(input: V5ApplyContinuityInput): V5AppliedContinuity {
  return applyV5SceneContinuity({ ...input, catalog: input.catalog ?? getDefaultV5Catalog() }) as V5AppliedContinuity;
}

/** Reconcile draft + applied continuity (`A8e` @45746) → `{draft, ...}` consumed by the projection. */
export function reconcileV5Continuity(
  draft: V5SceneDraft,
  applied: V5AppliedContinuity,
  options: { completelyNudeActorIds?: readonly string[] } = {},
  catalog: V5CompiledCatalog = getDefaultV5Catalog(),
): V5ReconciledScene {
  return reconcileV5SceneContinuity(draft, applied, catalog, options) as V5ReconciledScene;
}

/** Reconciled scene (`A8e` result). */
export type V5ReconciledScene = { readonly draft: V5SceneDraft; readonly [key: string]: unknown };

/** Input of the prompt projection (`uFe` @47085 / `Dht.build` @115035). */
export interface V5ProjectionInput {
  readonly reconciled: V5ReconciledScene;
  readonly catalog?: V5CompiledCatalog;
  /** `generationType !== "ai-prompt-edit" && !revisionDirection` in the orchestrator. */
  readonly includeRegisteredActorSexTags?: boolean;
  readonly actorHumanlike?: Readonly<Record<string, boolean>>;
  readonly externalEntries?: readonly V5ExternalEntry[];
  readonly globalNegativePrompt?: string;
  readonly actorNegativePrompts?: Readonly<Record<string, string>>;
}

const withCatalog = (input: V5ProjectionInput) => ({ ...input, catalog: input.catalog ?? getDefaultV5Catalog() });

/** Ledger projection: `{size, actors, globalNegativePrompt, ledger}`. Original: `uFe` (buildV5PromptProjection) @47085. */
export function buildV5PromptProjection(input: V5ProjectionInput): Record<string, unknown> {
  return coreBuildV5PromptProjection(withCatalog(input)) as Record<string, unknown>;
}

/** Serialize a projection into the executed prompt plan. Original: `gFe` (serializeV5PromptPlan) @47148. */
export function serializeV5PromptPlan(projection: Record<string, unknown>): V5PromptPlan {
  return coreSerializeV5PromptPlan(projection) as V5PromptPlan;
}

/** `serializeV5PromptPlan(buildV5PromptProjection(input))`. Original: `Dht.build` (buildV5ExecutedPromptPlan) @115035. */
export function buildV5ExecutedPromptPlan(input: V5ProjectionInput): V5PromptPlan {
  return coreBuildV5ExecutedPromptPlan(withCatalog(input)) as V5PromptPlan;
}

/** Projected prompt context subset used by `planV5Scene` (see `buildV5PromptContext` in compose.ts). */
export interface V5PlanPromptContext {
  readonly actorHumanlike: Readonly<Record<string, boolean>>;
  readonly completelyNudeActorIds: readonly string[];
  readonly externalEntries: readonly V5ExternalEntry[];
  readonly globalNegativePrompt: string;
  readonly actorNegativePrompts: Readonly<Record<string, string>>;
  readonly selectedOutfitIds: Readonly<Record<string, string>>;
  readonly selectedFormIds?: Readonly<Record<string, string>>;
}

/** Input of `planV5Scene`. */
export interface V5PlanSceneInput {
  readonly graph: V5SceneGraph;
  readonly promptContext: V5PlanPromptContext;
  readonly selectionKey: string;
  readonly provider: V5RuleContext["provider"];
  readonly state: V5ContinuityState;
  readonly eventScopeId: string;
  readonly requestedSizeId?: number;
  readonly advanceTurn?: boolean;
  readonly stateAccumulationEnabled?: boolean;
  readonly includeRegisteredActorSexTags?: boolean;
  readonly catalog?: V5CompiledCatalog;
}

/** Result of `planV5Scene`. `state` is the continuity state after this graph (feed it to the next graph). */
export interface V5PlannedScene {
  readonly ruleContext: V5RuleContext;
  readonly draft: V5SceneDraft;
  readonly applied: V5AppliedContinuity;
  readonly reconciled: V5ReconciledScene;
  readonly promptPlan: V5PromptPlan;
  readonly state: V5ContinuityState;
}

/**
 * Compile one graph and build its executed prompt plan, threading continuity state, in the same order as the
 * V5 orchestrator (`Ygt` 118962-119010): `sceneCompiler.compile` → `Wte` → `A8e` → `fbe` (outfit refs) →
 * `Tte` (actor passthrough) → `Dht.build`. The rule continuity view is read from `state.actors[storageKey]`.
 */
export function planV5Scene(input: V5PlanSceneInput): V5PlannedScene {
  const catalog = input.catalog ?? getDefaultV5Catalog();
  const ctx = input.promptContext;
  const actorsState = input.state.actors as Record<string, { groups: Record<string, string[]>; counters: Record<string, number> } | undefined>;
  const ruleContext: V5RuleContext = {
    selectionKey: input.selectionKey,
    actorHumanlike: ctx.actorHumanlike,
    provider: input.provider,
    completelyNudeActorIds: ctx.completelyNudeActorIds,
    ruleContinuityByActorId: Object.fromEntries(
      input.graph.actors.flatMap((actor) => {
        const key = actor.continuityIdentity ? continuityStorageKey(actor.continuityIdentity) : undefined;
        const entry = key ? actorsState[key] : undefined;
        return entry ? [[actor.actorId, { groups: entry.groups, counters: entry.counters }]] : [];
      }),
    ),
    ...(input.requestedSizeId ? { requestedSizeId: input.requestedSizeId } : {}),
  };
  const draft = compileV5Scene(input.graph, ruleContext, catalog);
  const applied = applyV5Continuity({
    scene: input.graph,
    draft,
    catalog,
    state: input.state,
    eventScopeId: input.eventScopeId,
    advanceTurn: input.advanceTurn,
    stateAccumulationEnabled: input.stateAccumulationEnabled,
    completelyNudeActorIds: ctx.completelyNudeActorIds,
  });
  let state = applied.continuity.state;
  const reconciled = reconcileV5Continuity(draft, applied, { completelyNudeActorIds: ctx.completelyNudeActorIds }, catalog);
  state = recordActorPassthrough(recordSelectedOutfits(state, input.graph, ctx), input.graph) as V5ContinuityState;
  const promptPlan = buildV5ExecutedPromptPlan({
    reconciled,
    catalog,
    includeRegisteredActorSexTags: input.includeRegisteredActorSexTags ?? true,
    actorHumanlike: ctx.actorHumanlike,
    externalEntries: ctx.externalEntries,
    globalNegativePrompt: ctx.globalNegativePrompt,
    actorNegativePrompts: ctx.actorNegativePrompts,
  });
  return { ruleContext, draft, applied, reconciled, promptPlan, state };
}

/** Storage key of a continuity identity (`om`), e.g. `lore:alice` / `persona::p1`. */
export function continuityStorageKey(identity: { readonly kind: string; readonly value: string }): string {
  return continuityStorageKeyOf(identity) as string;
}
