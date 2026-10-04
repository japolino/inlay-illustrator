/**
 * Continuity document helpers and checkpoints (spec/pipeline.md §3.7a, §3.7c).
 */
import {
  createEmptyContinuityState as coreEmpty,
  pushContinuityCheckpoint as corePush,
  reconcileContinuityCheckpoints as coreReconcile,
  hasContinuityData as coreHasData,
  serializeContinuityState as coreSerialize,
  getLatestContinuityCheckpointSnapshot as coreLatest,
  createV5ContinuityBasis as coreV5Basis,
  Kg as isStableMessageIdCore,
} from "../core/asset-maid-core";
import type { ContinuityParticipants, ContinuityState, V5ContinuityBasis } from "./types";

/** Empty continuity document. Original: `$g` @42944. */
export function createEmptyContinuityState(): ContinuityState {
  return coreEmpty() as ContinuityState;
}

/**
 * Push a checkpoint for `messageId` (rejects `index:` / `request:` / `response-` ids). Snapshot comes from
 * `sourceState ?? state`; list stays newest first (sort `uA`), max 128; matching historical bases are dropped;
 * `promoteToCurrentState` copies the checkpoint into the current state. Returns false when nothing was written.
 * Original: `K8` @42761.
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

/**
 * Check checkpoints against the live chat message ids (by id; indexes re-mapped; gone messages dropped) and
 * restore the current state from the newest one. Mutates `state`. Returns "unchanged" | "restored" | "cleared".
 * Original: `Pte` @42905 (called in beforeRequest 169172-169193).
 */
export function reconcileContinuityCheckpoints(state: ContinuityState, chatKey: string, liveMessageIds: string[]): "unchanged" | "restored" | "cleared" {
  return coreReconcile(state, chatKey, liveMessageIds) as "unchanged" | "restored" | "cleared";
}

/** True when any per-chat record exists. Original: `hDe` @42968. */
export function hasContinuityData(state: ContinuityState): boolean {
  return coreHasData(state) as boolean;
}

/** Canonical JSON string of the document (`JSON.stringify(SDe(state))`). Original: `Ete` @43321. */
export function serializeContinuityState(state: ContinuityState): string {
  return coreSerialize(state) as string;
}

/** True when a message id can own a checkpoint (`id:` prefix allowed; `index:`, `request:`, `response-` rejected). Original: `Kg` @42658. */
export function isStableContinuityMessageId(messageId: unknown): boolean {
  return isStableMessageIdCore(messageId) as boolean;
}

/**
 * Snapshot of the current per-chat state + newest checkpoint participants (v5 orchestrator input
 * `previousContinuitySnapshot`). `profile === "novelai-v4-5"` also copies nsfwPositions. Original: `D5e` @38084.
 */
export function getLatestContinuityCheckpointSnapshot(state: ContinuityState, chatKey: string, profile: "novelai-v5" | "novelai-v4-5"): Record<string, unknown> | undefined {
  return coreLatest(state, chatKey, profile) as Record<string, unknown> | undefined;
}

/** V5 continuity basis from a snapshot (or `{characters: previousCharacterStateMap}`). Original: `vN` @38066. */
export function createV5ContinuityBasis(snapshot: unknown): V5ContinuityBasis {
  return coreV5Basis(snapshot) as V5ContinuityBasis;
}
