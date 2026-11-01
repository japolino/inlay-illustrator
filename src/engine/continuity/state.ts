/**
 * Continuity document helpers and checkpoints (spec/pipeline.md §3.7a, §3.7c), AM 0.9.90.
 */
import {
  createEmptyContinuityState as coreEmpty,
  normalizeContinuityState as coreNormalize,
  pushContinuityCheckpoint as corePush,
  getLatestContinuityCheckpointSnapshot as coreLatest,
  createV5ContinuityBasis as coreV5Basis,
  persistV5ContinuityState as corePersistV5,
  hasStoredContinuity as coreHasStored,
  qE as isStableMessageIdCore,
} from "../core/asset-maid-core";
import type { ContinuityParticipants, ContinuityState, V5ContinuityBasis } from "./types";

/** Empty continuity document `{version:1, scenes, characters, modifierRefs, outfitRefs, recentCheckpoints}`. Original: `UE` @36624. */
export function createEmptyContinuityState(): ContinuityState {
  return coreEmpty() as ContinuityState;
}

/**
 * Normalize an untrusted continuity document (drops invalid records and the removed accumulation keys such as
 * `cum_count` / `state.fluid.cum.accumulation`). Original: `B3e` @36634.
 */
export function normalizeContinuityState(value: unknown): ContinuityState {
  return coreNormalize(value) as ContinuityState;
}

/**
 * Push a checkpoint for `messageId` (rejects `index:` / `request:` / `response-` ids). Snapshot comes from
 * `sourceState ?? state`; list stays newest first, max 128; a checkpoint with the same message and history revision
 * is replaced; `promoteToCurrentState` copies the checkpoint into the current state. Returns false when nothing was
 * written. Original: `K3e` @36596.
 */
export function pushContinuityCheckpoint(
  state: ContinuityState,
  input: {
    chatKey: string;
    messageId: string;
    messageIndex: number;
    historyRevisionId?: string;
    historyRevisionOrder?: number;
    capturedAt: number;
    sourceState?: ContinuityState;
    participants: ContinuityParticipants | unknown;
    promoteToCurrentState?: boolean;
  },
): boolean {
  return corePush(state, input) as boolean;
}

/** True when the state holds any record (or checkpoint) for `chatKey`. Original: `$3e` @36627. */
export function hasStoredContinuity(state: ContinuityState, chatKey: string): boolean {
  return coreHasStored(state, chatKey) as boolean;
}

/** True when a message id can own a checkpoint (`id:` prefix allowed; `index:`, `request:`, `response-` rejected). Original: `qE` @36565. */
export function isStableContinuityMessageId(messageId: unknown): boolean {
  return isStableMessageIdCore(messageId) as boolean;
}

/**
 * Snapshot of the current per-chat state + newest checkpoint participants (V5 orchestrator input
 * `previousContinuitySnapshot`). The third argument of the 0.9.89 version (profile) is ignored. Original: `j3e` @36124.
 */
export function getLatestContinuityCheckpointSnapshot(state: ContinuityState, chatKey: string, _profile?: "novelai-v5"): Record<string, unknown> | undefined {
  return coreLatest(state, chatKey, _profile) as Record<string, unknown> | undefined;
}

/** V5 continuity basis from a snapshot (or `{characters: previousCharacterStateMap}`). Original: `BE` @36107. */
export function createV5ContinuityBasis(snapshot: unknown): V5ContinuityBasis {
  return coreV5Basis(snapshot) as V5ContinuityBasis;
}

/**
 * Next continuity document after a V5 run: the V5 continuity state (`applyV5Continuity` callback value) is written
 * over `basisState` for `chatKey` (scene, characters, modifier refs, outfit refs, stamped with `now`) and a
 * checkpoint for `messageId` / `historyRevisionId` is pushed. Pure: returns a new document. Original: `G3e` @36714.
 */
export function persistV5ContinuityState(input: {
  basisState: ContinuityState;
  continuity: unknown;
  chatKey: string;
  chatIndex: number;
  messageIndex: number;
  messageId: string;
  historyRevisionId?: string;
  historyRevisionOrder?: number;
  now?: number;
}): ContinuityState {
  return corePersistV5(input) as ContinuityState;
}
