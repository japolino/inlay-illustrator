/**
 * Continuity persistence in the chat store (spec/pipeline.md §3.7a), AM 0.9.90.
 *
 * Checkpoints live on the image-history generations: `store.messages[messageId].generations[*].continuity`
 * (compact form, `rxt`). AM 0.9.89+ keeps this `{messages, jobs}` document in its chat lore; the port keeps the same
 * shape in userStorage (`chats/<id>/chat-data.json`). 0.9.90 removed the local-lore actor state (accumulation), so a
 * run's continuity is the checkpoint store only.
 */
import {
  rebuildContinuityFromChatStore as coreRebuild,
  rebuildContinuityAtMessage as coreRebuildAt,
  continuityCheckpointToStore as coreCheckpointToStore,
  Qyt as coreReadGenerationCheckpoint,
} from "../core/asset-maid-core";
import type {
  ContinuityChatMessage,
  ContinuityChatStore,
  ContinuityChatStoreGeneration,
  ContinuityCheckpoint,
  ContinuityState,
  StoredContinuityCheckpoint,
} from "./types";

/**
 * Current state rebuilt from the newest stored checkpoint among the last 3 character messages of the transcript
 * (`role`/`type` char|assistant|..., id from `chatId`). Original: `txt` @171412.
 */
export function rebuildContinuityFromChatStore(store: ContinuityChatStore, chatKey: string, messages: readonly (ContinuityChatMessage | unknown)[]): ContinuityState {
  return coreRebuild(store, chatKey, messages) as ContinuityState;
}

/**
 * State as of `messageId`: the newest generation checkpoint of the nearest of the 3 previous messages in
 * `messageIds` (ids with or without `id:`), empty when none. Original: `gwe` @171383.
 */
export function rebuildContinuityAtMessage(store: ContinuityChatStore, chatKey: string, messageIds: readonly string[], messageId: string): ContinuityState {
  return coreRebuildAt(store, chatKey, messageIds, messageId) as ContinuityState;
}

/** Full checkpoint (`id:` message id, revision ids, `capturedAt`) of one stored generation, or null. Original: `Qyt` @171362. */
export function readGenerationContinuityCheckpoint(input: {
  messageId: string;
  messageIndex: number;
  generation: ContinuityChatStoreGeneration;
  generationIndex: number;
}): ContinuityCheckpoint | null {
  return coreReadGenerationCheckpoint(input) as ContinuityCheckpoint | null;
}

/** Compact stored form of a checkpoint (`{scene?, characters, modifierRefs?, outfitRefs?, participants?}`). Original: `rxt` @171418. */
export function continuityCheckpointToStore(checkpoint: ContinuityCheckpoint): StoredContinuityCheckpoint {
  return coreCheckpointToStore(checkpoint) as StoredContinuityCheckpoint;
}

/** Outcome of {@link commitContinuityCheckpoint}. */
export type ContinuityCommitOutcome = "committed" | "already-committed" | "missing";

/**
 * Commit one revision's continuity (AM 0.9.90 history save `bwe` @171608-171614): when the generation
 * `historyRevisionId` of `messageId` exists and has no continuity yet, the checkpoint of that message/revision in
 * `next.recentCheckpoints[chatKey]` is stored on it (compact form). Checkpoints of other messages and revisions stay
 * as they are. Mutates `store`.
 * 0.9.90 changes: no actor-state revision check (the 0.9.89 `basisRevision` / local-lore write are gone).
 * Returns "missing" when the generation or the checkpoint does not exist.
 */
export function commitContinuityCheckpoint(
  store: ContinuityChatStore,
  next: ContinuityState,
  chatKey: string,
  messageId: string,
  historyRevisionId: string,
): ContinuityCommitOutcome {
  const generation = store.messages[messageId]?.generations.find((g) => g.id === historyRevisionId);
  if (!generation) return "missing";
  if (generation.continuity) return "already-committed";
  const checkpoint = next.recentCheckpoints[chatKey]?.find(
    (c) => c.messageId.replace(/^id:/u, "") === messageId && c.historyRevisionId === historyRevisionId,
  );
  const compact = checkpoint ? continuityCheckpointToStore(checkpoint) : undefined;
  if (!compact) return "missing";
  generation.continuity = compact;
  return "committed";
}

/** Remove every stored checkpoint from a chat store (port helper; AM clears with the whole chat lore document). Mutates `store`. */
export function clearContinuityFromChatStore(store: ContinuityChatStore): void {
  for (const message of Object.values(store.messages)) for (const generation of message.generations) delete generation.continuity;
}
