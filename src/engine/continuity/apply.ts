/**
 * Feeding continuity into analysis and applying it to the plan (spec/pipeline.md §3.7b-§3.7d).
 */
import {
  applyVisualContinuityToPlan as coreApply,
  mergeActorContinuityState as coreMerge,
  stripAccumulationState as coreStrip,
  buildVisualContinuityContext as coreContext,
} from "../core/asset-maid-core";
import type { ActorContinuityMerge, ActorContinuityState, ContinuityState, VisualContinuityContext, VisualContinuityResult } from "./types";

/**
 * Apply the previous actor states to every image of a validated v4-5 plan: per identity one shared turn
 * (`max(1, prev._continuity_turn + (advanceTurn === false ? 0 : 1))`), ttl expiry, clears, counters, rule-IR
 * modifier rewrite (`w9e`) or legacy rewrite (`N9e` + `E9e` global refs). `catalog` = rule runtime or legacy catalog.
 * Original: `z9e` @52249.
 */
export function applyVisualContinuityToPlan<P extends { images: Array<Record<string, unknown>> }>(
  plan: P,
  catalog: unknown,
  options: {
    previousCharacterStateMap?: Record<string, ActorContinuityState>;
    previousGlobalModifierRefs?: Record<string, string[]>;
    advanceTurn?: boolean;
    stateAccumulationEnabled?: boolean;
  } = {},
): VisualContinuityResult<P> {
  return coreApply(plan, catalog, options) as VisualContinuityResult<P>;
}

/**
 * Merge one actor: drop expired ttl options, apply clears, merge with the analyzer state, compute the prompt-carry
 * subset and the saved state; gender `when` and `stateAccumulationEnabled === false` keep cum/injury unchanged.
 * Original: `iKe` @48719.
 */
export function mergeActorContinuityState(input: {
  stateAccumulationEnabled?: boolean;
  actorGender: string;
  previous: ActorContinuityState;
  current: ActorContinuityState;
  clear: Record<string, string[] | "*">;
  observedGroupIds?: Iterable<string>;
  currentTurn: number;
}): ActorContinuityMerge {
  return coreMerge(input) as ActorContinuityMerge;
}

/**
 * Deep-remove `state.fluid.cum.location`, `actor.injury`, `state.fluid.cum.accumulation` and `cum_count` keys
 * (analyzer context when state accumulation is off). Original: `TA` @52318.
 */
export function stripAccumulationState<T>(value: T): T {
  return coreStrip(value) as T;
}

/**
 * Analyzer `visualContinuity` context: previous modifier refs (global, primary/secondary by identity key, persona),
 * preset/outfit refs, scene tags and previous participants. `actorKeys` = keys of image-token actors
 * (candidates[0]/[1]); `candidateKeys` = all identity keys; `personaKeys` = active persona key;
 * `outfitReferences` = map key -> reference. Original: `NAt` @167494.
 */
export function buildVisualContinuityContext(
  state: ContinuityState,
  chatKey: string,
  actorKeys: string[],
  candidateKeys: string[],
  personaKeys: string[],
  outfitReferences: Record<string, unknown>,
): VisualContinuityContext {
  return coreContext(state, chatKey, actorKeys, candidateKeys, personaKeys, outfitReferences) as VisualContinuityContext;
}
