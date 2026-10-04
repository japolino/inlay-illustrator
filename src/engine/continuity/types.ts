/**
 * Visual continuity runtime shapes (spec/pipeline.md §3.7a), mirrored field by field.
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
  nsfwPositions?: unknown;
  participants: ContinuityParticipants;
}

/** Whole continuity document (`$g` @42944). Keys of every record are chat keys. */
export interface ContinuityState {
  version: 1;
  scenes: Record<string, { backgroundTags: string[]; locationTags: string[] } & ContinuityStamp>;
  characters: Record<string, Record<string, ActorContinuityState & { characterName?: string } & ContinuityStamp>>;
  modifierRefs: Record<string, ContinuityModifierRefs & ContinuityStamp>;
  outfitRefs: Record<string, { actors: Record<string, { formId?: string; outfitId: string; description: string }> } & ContinuityStamp>;
  nsfwPositions: Record<string, { activeSceneIdByCharacter: Record<string, string>; scenes: Record<string, Record<string, unknown>> }>;
  /** Newest first, max 128. */
  recentCheckpoints: Record<string, ContinuityCheckpoint[]>;
  historicalStaticBases: Record<string, ContinuityCheckpoint[]>;
}

/** One actor's merge result (`iKe`). */
export interface ActorContinuityMerge {
  previous: ActorContinuityState;
  current: ActorContinuityState;
  /** Prompt-carry subset applied to the current image. */
  applied: ActorContinuityState;
  /** State to persist (lifetimes, expiry, counters). */
  saved: ActorContinuityState;
}

/** Per-identity entry of {@link VisualContinuityResult.characterStates}. */
export interface CharacterContinuityState extends ActorContinuityMerge {
  characterName: string;
  clear: Record<string, string[] | "*">;
}

/** Output of `applyVisualContinuityToPlan` (`z9e`). */
export interface VisualContinuityResult<P = { images: Array<Record<string, unknown>> }> {
  plan: P;
  characterStates: Record<string, CharacterContinuityState>;
  imageStates: Record<string, CharacterContinuityState>;
  imageActorStates: Record<string, Partial<Record<"primary" | "secondary" | "persona", CharacterContinuityState>>>;
  imagePromptSelections: unknown[];
  nsfwSourceImageTokens: string[];
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

/** Minimal controller contract used by `updateVisualContinuity` / `computeDeferredVisualContinuity`. */
export interface ContinuityMutator {
  mutate(fn: (state: ContinuityState) => void): Promise<void> | void;
}

/** Local-lore actor entry (`zne` output / `Tne` payload member). */
export interface LocalLoreActorEntry {
  groups: Record<string, string[]>;
  count: number;
  ttl: Record<string, number>;
}

/** Payload stored in the chat local lore `asset-maid:current-actor-state` entry. */
export interface LocalLoreActorState {
  revision: number;
  actors: Record<string, LocalLoreActorEntry>;
}

/** Asset Maid chat store subset read/written by continuity (`chat.localLore` 'asset-maid:chat-data'). */
export interface ContinuityChatStore {
  messages: Record<string, { generations: Array<{ id: string; slots: Record<string, unknown[]>; deletedSlotIndices?: number[]; continuity?: unknown; [key: string]: unknown }>; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** Chat subset: transcript (`message[]` with `role`, `data`, `chatId`) and `localLore[]`. */
export interface ContinuityChat {
  message?: Array<{ role?: string; data?: string; chatId?: string; [key: string]: unknown }>;
  localLore?: unknown[];
  [key: string]: unknown;
}

/** V5 continuity basis (`vN`). */
export interface V5ContinuityBasis {
  actors: Readonly<Record<string, unknown>>;
  scene?: unknown;
  modifierRefs?: unknown;
  outfitRefs?: unknown;
  nsfwPositions?: unknown;
  participants?: unknown;
  sceneLayouts?: unknown[];
}
