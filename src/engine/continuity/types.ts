/**
 * Visual continuity runtime shapes (spec/pipeline.md §3.7a), mirrored field by field (AM 0.9.90).
 * 0.9.90 removed local state accumulation: no `nsfwPositions`, no `historicalStaticBases`, no local-lore actor state.
 */

/** `updatedAt*` stamp written with every per-chat record. */
export interface ContinuityStamp {
  updatedAt: number;
  updatedAtChatIndex: number;
  updatedAtMessageIndex: number;
  updatedAtMessageId?: string;
}

/** Per-actor state: group id -> option ids, plus counters and ttl bookkeeping. */
export type ActorContinuityState = {
  [groupId: string]: unknown;
} & {
  cum_count?: number;
  _continuity_turn?: number;
  _continuity_expires?: Record<string, Record<string, number>>;
};

export interface ContinuityModifierRefs {
  global: Record<string, string[]>;
  actors: Record<string, Record<string, string[]>>;
}

export interface ContinuityParticipants {
  characterKeys: string[];
  personaKeys: string[];
  sceneLayouts?: unknown[];
}

export interface ContinuityCheckpoint {
  messageId: string;
  messageIndex: number;
  historyRevisionId?: string;
  historyRevisionOrder?: number;
  capturedAt: number;
  scene?: { backgroundTags: string[]; locationTags: string[] } & Partial<ContinuityStamp>;
  characters: Record<string, ActorContinuityState & { characterName?: string } & Partial<ContinuityStamp>>;
  modifierRefs?: ContinuityModifierRefs & Partial<ContinuityStamp>;
  outfitRefs?: { actors: Record<string, { formId?: string; outfitId: string; description: string }> } & Partial<ContinuityStamp>;
  participants: ContinuityParticipants;
}

/** Whole continuity document (`UE` @36624, normalized by `B3e` @36634). Keys of every record are chat keys. */
export interface ContinuityState {
  version: 1;
  scenes: Record<string, { backgroundTags: string[]; locationTags: string[] } & ContinuityStamp>;
  characters: Record<string, Record<string, ActorContinuityState & { characterName?: string } & ContinuityStamp>>;
  modifierRefs: Record<string, ContinuityModifierRefs & ContinuityStamp>;
  outfitRefs: Record<string, { actors: Record<string, { formId?: string; outfitId: string; description: string }> } & ContinuityStamp>;
  /** Newest first, max 128. */
  recentCheckpoints: Record<string, ContinuityCheckpoint[]>;
}

/** Analyzer-facing continuity context (`NAt` @167494). */
export interface VisualContinuityContext {
  previous_modifiers: { global: Record<string, string[]>; actors: { primary: Record<string, string[]>; secondary: Record<string, string[]>; persona: Record<string, string[]> } };
  previous_preset_refs: { actors: { primary: unknown; secondary: unknown; persona: unknown } };
  previous_outfit_refs: { actors: { primary: unknown; secondary: unknown; persona: unknown } };
  previous_scene_tags: string[];
  previous_background_tags: string[];
  previous_scene_location_tags: string[];
  previous_message_participants?: { character_keys: string[]; persona_keys: string[] };
}

/** Compact checkpoint stored on a history generation (`rxt` @171418 output; read back by `Qyt` @171362). */
export interface StoredContinuityCheckpoint {
  scene?: unknown;
  characters: Record<string, unknown>;
  modifierRefs?: unknown;
  outfitRefs?: unknown;
  participants?: unknown;
}

/** History generation of the chat store (`{messages, jobs}` document of AM 0.9.89+; the port keeps it in chat-data.json). */
export interface ContinuityChatStoreGeneration {
  id: string;
  slots: Record<string, unknown[]>;
  deletedSlotIndices?: number[];
  continuity?: StoredContinuityCheckpoint;
  /** Legacy (0.9.89 actor-state commit bookkeeping); still accepted by the 0.9.90 reader, no longer written. */
  stateCommitRevision?: number;
  stateCommitSkipped?: boolean;
  [key: string]: unknown;
}

/** Asset Maid chat store subset read/written by continuity (`{messages, jobs?}`). */
export interface ContinuityChatStore {
  messages: Record<string, { generations: ContinuityChatStoreGeneration[]; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** Chat transcript message read by `rebuildContinuityFromChatStore` (`qC` @7128 / `Oi` @7117): role, content, chatId. */
export interface ContinuityChatMessage {
  role?: string;
  type?: string;
  data?: string;
  content?: string;
  chatId?: string;
  [key: string]: unknown;
}

/** V5 continuity basis (`BE` @36107). */
export interface V5ContinuityBasis {
  actors: Readonly<Record<string, unknown>>;
  scene?: unknown;
  modifierRefs?: unknown;
  outfitRefs?: unknown;
  participants?: unknown;
  sceneLayouts?: unknown[];
}
