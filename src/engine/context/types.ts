/**
 * Typed mirrors of the Asset Maid runtime shapes that feed the analyzer (AM `MAt` @167588 and the
 * orchestrator input built in `E1t` @169706-169765). Field names are Asset Maid's (snake_case wire
 * fields stay snake_case). Index signatures keep the shapes open where Asset Maid passes extra data.
 */

export type Gender = "female" | "male" | "unknown" | "";

/** One outfit of an appearance form (AM `d_e` @167008 output, candidate side). */
export interface AppearanceOutfit {
  outfitId: string;
  candidateEnabled: boolean;
  status: string;
  label: string;
  sourceAssetName: string;
  referenceAsset?: unknown;
  head: string;
  top: string;
  bottom: string;
  legs: string;
  feet: string;
  origin?: "ai-auto";
  [extra: string]: unknown;
}

export interface AppearanceForm {
  formId: string;
  label: string;
  humanlike: boolean;
  basePromptGroups: Record<string, string[]>;
  gender: Gender | string;
  defaultOutfitId: string;
  outfits: AppearanceOutfit[];
  [extra: string]: unknown;
}

export interface IdentityAliasSources {
  lorebookTitle: string[];
  activationKeys: string[];
  customMatchingKeys: string[];
  assetClassificationKeys: string[];
}

export interface LoreActivation {
  primaryKeys: string[];
  secondaryKeys: string[];
  selective: boolean;
  useRegex: boolean;
  alwaysActive: boolean;
  loreContent: string;
}

/** Analyzer identity candidate (lorebook: AM `AAt` @167338; persona: AM `v_e` @167537). */
export interface IdentityCandidate {
  key: string;
  lorebookPromptKey?: string;
  characterName: string;
  /** Lorebook body. NOT sent to the planner. */
  description?: string;
  aliases: string[];
  source: "lorebook" | "persona";
  gender: Gender | string;
  allowOutfitCreation: boolean;
  appearanceForms: AppearanceForm[];
  defaultFormId: string;
  identityMetadata: {
    canonicalName: string;
    ownerName: string;
    aliasSources: IdentityAliasSources;
    loreActivation?: LoreActivation;
  };
  origin?: "ai-auto";
  [extra: string]: unknown;
}

/** Outfit candidate wire record (AM `y_e` @167359 / `PAt` @167392). */
export interface OutfitCandidate {
  lorebook_prompt_key: string;
  /** Omitted for the default form ("form_default"). */
  form_id?: string;
  id: string;
  label: string;
  source_asset_name: string;
  has_reference: boolean;
  reference_image_file_name: string;
  head?: string;
  top?: string;
  bottom?: string;
  legs?: string;
  feet?: string;
  origin?: "ai-auto";
}

export interface ActorSlots<T> {
  primary: T;
  secondary: T;
  persona: T;
}

export interface PreviousOutfitRef {
  lorebook_prompt_key: string;
  form_id: string;
  outfit_id: string;
}

/** Visual continuity sent to the analyzer (AM `NAt` @167494). */
export interface VisualContinuityContext {
  previous_modifiers: { global: Record<string, unknown>; actors: ActorSlots<Record<string, unknown>> };
  previous_preset_refs: { actors: ActorSlots<string> };
  previous_outfit_refs: { actors: ActorSlots<PreviousOutfitRef | null> };
  previous_scene_tags: string[];
  previous_background_tags: string[];
  previous_scene_location_tags: string[];
  previous_message_participants?: { character_keys: string[]; persona_keys: string[] };
}

/** Chat context (AM `MAt` @167717 + `RAt` @167561). */
export interface ChatContext {
  character: { name: string; description: string };
  persona: { id: string; name: string; gender: string } | null;
  previous_assistant_response: string;
  current_user_input: string;
  latest_assistant_response: string;
}

/** Candidate slot (E1t @169621). `slot_number` = paragraph slot index. */
export interface CandidateSlot {
  slot_id: string;
  slot_number: number;
  before: string;
  after: string;
  actor_hints?: string[];
}

export interface ImageCountConstraint {
  mode: "fixed" | "range";
  min: number;
  max: number;
}

export type PresetScope = "all" | "solo-reference";

export interface ReplayGeneratedOutfit {
  promptKey: string;
  formId: string;
  outfitId: string;
  fingerprint?: string;
  [extra: string]: unknown;
}

/** `analyzerInput.context` (E1t @169706-169727). */
export interface AnalyzerContext {
  cacheSourceId: string;
  splitAnalysis?: { totalCount: number; batchSize: number; retries: number; revision?: unknown };
  rosterSelectionEnabled?: boolean;
  freeCharacterGenerationEnabled: boolean;
  freeOutfitGenerationEnabled: boolean;
  replayGeneratedOutfits: ReplayGeneratedOutfit[];
  scope: "paragraph-slot-illustration" | string;
  modelType: string;
  chatContext: ChatContext;
  candidateSlots: CandidateSlot[];
  targetImageCount: number;
  imageCountConstraint: ImageCountConstraint;
  actorCandidates: IdentityCandidate[];
  personaCandidates: IdentityCandidate[];
  outfitCandidates: OutfitCandidate[];
  v5PersonaCatalogCandidates?: IdentityCandidate[];
  v5OutfitCatalogCandidates?: OutfitCandidate[];
  personaPromptKey: string;
  visualContinuity: VisualContinuityContext;
  presetScope: PresetScope;
  [extra: string]: unknown;
}

/** `analyzerInput.checkpointContext` (E1t @169728). Key = `generationProvider:chatKey:messageId` (AM `K9`). */
export interface AnalyzerCheckpointContext {
  chatKey: string;
  messageIndex: number;
  messageId: string;
  generationProvider: string;
  pendingKey?: string;
}

/** `analyzerInput.fingerprintInput` (E1t @169734). Part of the checkpoint fingerprint. */
export interface AnalyzerFingerprintInput {
  presetScope: PresetScope;
  candidateSlots: { slotId: string; slotNumber: number; actorHints: string[] }[];
  imageCountConstraint: ImageCountConstraint;
  outfitCreationMode: "free-generation" | "existing-only";
  outfitCandidateIds: [string, string][];
  revisionDirection: string;
  revisionPromptChannels: RevisionPromptChannel[];
  revisionEvidenceKey: string;
  [extra: string]: unknown;
}

/** `analyzerInput.validationOptions` (E1t @169754). */
export interface AnalyzerValidationOptions {
  identityCandidates: IdentityCandidate[];
  personaCandidates: IdentityCandidate[];
  outfitCandidates: OutfitCandidate[];
  personaGender: string;
  personaPromptKey: string;
  personaDefaultOutfitId: string;
  /** `NOVELAI_DEFAULTS.DEFAULT_IMAGE_SIZE_PRESET_ID` (1). */
  defaultSizeId: number;
}

/** Revision prompt channel (AM `FQe` @81662 reads id, kind, label, actorIndex?, positive, negative). */
export interface RevisionPromptChannel {
  id: string;
  kind: string;
  label: string;
  actorIndex?: number;
  positive: string;
  negative: string;
}
