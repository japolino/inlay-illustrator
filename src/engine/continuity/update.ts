/**
 * Update after generation (spec/pipeline.md §3.7e).
 */
import {
  updateVisualContinuity as coreUpdate,
  computeDeferredVisualContinuity as coreDeferred,
  updateModifierRefs as coreModifierRefs,
} from "../core/asset-maid-core";
import type { ContinuityMutator, ContinuityState, VisualContinuityResult } from "./types";

export interface ContinuityUpdateInput {
  controller: ContinuityMutator;
  /** Result of `applyVisualContinuityToPlan` for this batch. */
  continuity: VisualContinuityResult;
  chatKey: string;
  chatIndex: number;
  messageIndex: number;
  /** `id:<messageId>`; unstable ids (`index:`, `request:`, `response-`) update state without a checkpoint. */
  messageId: string;
  outfitReferences?: unknown[];
  /** Defaults to `amEnv.now()`. */
  now?: number;
}

/**
 * Live update inside `controller.mutate`: skipped when a newer message already updated the chat; writes
 * characters (+stamp), modifier refs (`Ore`), scene (`jre`), NSFW positions (`Ere`), outfit refs (`Nre`) and a
 * checkpoint (`K8`). The caller flushes. Original: `fKe` @48903.
 */
export async function updateVisualContinuity(input: ContinuityUpdateInput): Promise<void> {
  await coreUpdate(input);
}

/**
 * Deferred variant: computes the same update on a copy of `basisState` and only pushes a checkpoint
 * (with `sourceState`, not promoted). Committed later by the history revision commit. Original: `mKe` @48945.
 */
export async function computeDeferredVisualContinuity(
  input: ContinuityUpdateInput & { basisState: ContinuityState; historyRevisionId?: string; historyRevisionOrder?: number },
): Promise<void> {
  await coreDeferred(input);
}

/** Update `state.modifierRefs[chatKey]` (global onValue/onNone/clear; actor refs at the next turn). Original: `Ore` @48786. */
export function updateModifierRefs(
  state: ContinuityState,
  chatKey: string,
  continuity: VisualContinuityResult,
  now: number,
  chatIndex: number,
  messageIndex: number,
  messageId: string,
): void {
  coreModifierRefs(state, chatKey, continuity, now, chatIndex, messageIndex, messageId);
}
