/**
 * Analyzer context building (Asset Maid `MAt` @167588-167725 and helpers): everything the V4.5/V5
 * planner can see, plus the prompt-input/reference callbacks the orchestrator uses later.
 *
 * Thin typed wrappers over the verbatim core. See README.md in this folder for the exact list of
 * config / source / character fields read.
 */
import {
  buildAnalyzerContextInputs as coreBuildAnalyzerContextInputs,
  buildOutfitCandidates as coreBuildOutfitCandidates,
  buildVisualContinuityContext as coreBuildVisualContinuityContext,
  resolveNovelAIRunConfig as coreResolveNovelAIRunConfig,
  resolveArtistPromptSelection as coreResolveArtistPromptSelection,
  resolveSourceGenerationSettings as coreResolveSourceGenerationSettings,
  normalizeSourceGenerationSettings as coreDefaultSourceGenerationSettings,
  NOVELAI_DEFAULTS,
  RAt as coreBuildChatContext,
  lS as coreResolvePersonaProfile,
  jE as coreFreeOutfitGenerationEnabled,
  Nc as coreIsAnimaFlatProvider,
  B8 as coreHasStoredContinuity,
  UAt as coreResolveIdentityEvidence,
  g1t as coreToPlannerImageToken,
  rI as coreWithCustomCharacterMembers,
  OW as coreResolvePresetScope,
  ZAt as coreResolveOutfitCreationMode,
  c1t as coreBuildKnownIdentities,
  mb as coreAsRecord,
} from "../core/asset-maid-core";
import type {
  AnalyzerCheckpointContext,
  AnalyzerContext,
  AnalyzerFingerprintInput,
  AnalyzerValidationOptions,
  CandidateSlot,
  ChatContext,
  IdentityCandidate,
  ImageCountConstraint,
  OutfitCandidate,
  PresetScope,
  ReplayGeneratedOutfit,
  RevisionPromptChannel,
  VisualContinuityContext,
} from "./types";

export * from "./types";

/** Asset Maid global config (normalized; see spec/data.md). Only the read fields matter (README). */
export type AssetMaidConfig = Record<string, unknown> & {
  characterPrompt: Record<string, unknown>;
  runtime: Record<string, unknown> & { generationProvider: string };
  novelai: Record<string, unknown>;
  animaArtists: Record<string, unknown>;
};

/** Character source catalog entry (spec/data.md `Source`, AM `Krt` @86600). */
export interface CharacterSource {
  id: string;
  members: SourceMember[];
  sharedModuleAssets?: unknown[];
  assetGeneration?: string;
  [extra: string]: unknown;
}
export interface SourceMember {
  key: string;
  id?: string;
  name: string;
  aliases?: string[];
  lorebooks: SourceLoreRecord[];
  originalAssets?: unknown[];
  [extra: string]: unknown;
}
export interface SourceLoreRecord {
  kind?: "lorebook" | "character-description";
  id: string;
  selectionId?: string;
  title: string;
  keys: string[];
  primaryKeys?: string[];
  secondaryKeys?: string[];
  selective?: boolean;
  useRegex?: boolean;
  content: string;
  alwaysActive?: boolean;
  runtimePromptKey?: string;
  runtimeOrigin?: { kind: "custom-character"; id: string; origin?: "ai-auto" };
  runtimeSelected?: boolean;
  runtimeBasePrompt?: string;
  [extra: string]: unknown;
}

export interface PersonaRecord {
  key: string;
  id?: string;
  name: string;
  imageAsset?: unknown;
  [extra: string]: unknown;
}

/** Image token as produced by `toPlannerImageToken` (AM `g1t` @168873). */
export interface PlannerImageToken {
  sourceImageToken: string;
  tokenName: string;
  characterName: string;
  markupType?: string;
  full?: string;
  inner?: string;
  before?: string;
  after?: string;
  matchedPromptKeys?: string[];
}

export interface ChatMessageLike {
  role: string;
  content: unknown;
}

/** Visual continuity state (spec/pipeline.md §3.7a, AM `$g` @42944). */
export interface ContinuityState {
  version: 1;
  scenes: Record<string, unknown>;
  characters: Record<string, Record<string, Record<string, unknown>>>;
  modifierRefs: Record<string, unknown>;
  outfitRefs: Record<string, unknown>;
  nsfwPositions: Record<string, unknown>;
  recentCheckpoints: Record<string, unknown[]>;
  historicalStaticBases: Record<string, unknown[]>;
}

/** Input of `buildAnalyzerContextInputs` (E1t @169541-169562). */
export interface AnalyzerContextSourceInput {
  config: AssetMaidConfig;
  /** Live config getter used by the late callbacks (promptInputs, references, ...). Defaults to `config`. */
  getConfig?: () => AssetMaidConfig;
  continuity: ContinuityState;
  chatKey: string;
  /** Chat messages `{role, content}` (role "user" | "assistant"). */
  messages: ChatMessageLike[];
  /** The response being illustrated (`latest_assistant_response`). */
  content: string;
  imageTokens: PlannerImageToken[];
  /** Current character card (only `name|nickname`, `description|desc` are read). */
  character: Record<string, unknown> | null | undefined;
  /** Source with custom characters already appended (`withCustomCharacterMembers`). */
  source: CharacterSource | null;
  activePersona?: PersonaRecord | null;
  personaRecords?: PersonaRecord[];
}

/** NovelAI decision subset read by `promptInputs` (only `actors.*.lorebook_prompt_key`, `lorebook_prompt_key`). */
export interface DecisionLike {
  actors: Record<string, { lorebook_prompt_key?: string } | null | undefined>;
  lorebook_prompt_key?: string;
  [extra: string]: unknown;
}

/** Image actor subset read by the reference callbacks (AM `p_e` @167230). */
export interface ImageActorLike {
  actorId: string;
  kind: "character" | "persona";
  gender?: string;
  identityKey: string;
  selectedFormId?: string;
  selectedOutfitId?: string;
  identitySuppressed?: boolean;
  [extra: string]: unknown;
}

/** Prompt inputs for the prompt compiler (MAt @167610-167634). */
export interface PromptInputs {
  identityCandidates: unknown[];
  outfitsByPromptKey: Record<string, unknown[]>;
  fixedPositivePrompt: string;
  negativePrompt: string;
  personaPrompt: string;
  personaBasePromptGroups: Record<string, string[]>;
  personaNegativePrompt: string;
  personaName: string;
  personaGender: string;
  personaPromptKey: string;
  personaDefaultOutfitId: string;
  personaAppearanceForms: unknown[];
  personaDefaultFormId: string;
  artistId: string;
  artistName: string;
  artistPrompt: string;
  artistNegativePrompt: string;
  continuityPrompt?: string;
  actorContinuityPrompts?: Record<string, string>;
}

export interface CharacterReference {
  asset: { key: string; name: string; extension: string };
  cropReference?: unknown;
  promptKey: string;
  formId: string;
  outfitId: string;
  role: "outfit" | "character";
  type: unknown;
  strength: unknown;
  fidelity: unknown;
}

/** Output of `buildAnalyzerContextInputs` (MAt @167601-167724). */
export interface AnalyzerContextInputs {
  analyzerIdentityCandidates: IdentityCandidate[];
  analyzerPersonaCandidates: IdentityCandidate[];
  analyzerOutfitCandidates: OutfitCandidate[];
  v5PersonaCatalogCandidates: IdentityCandidate[];
  v5OutfitCatalogCandidates: OutfitCandidate[];
  analyzerPersonaPromptKey: string;
  analyzerPersonaDefaultOutfitId: string;
  personaGender: string;
  promptInputs(decision: DecisionLike): PromptInputs;
  v5PromptContext(identityKeys: string[]): Record<string, unknown>;
  references(actors: ImageActorLike[]): CharacterReference[];
  outfitReference(actors: ImageActorLike[]): CharacterReference | null;
  characterReference(actors: ImageActorLike[]): CharacterReference | null;
  /** Always `{key:"", seed:"", fixed:false}` in Asset Maid 0.9.88 (AM `kAt` @167335 stub). */
  seedSetting(actors: ImageActorLike[]): { key: string; seed: string; fixed: boolean };
  outfitContinuityReferences(images: unknown[]): { actorKey: string; formId: string; outfitId: string; description: string }[];
  visualContinuity: VisualContinuityContext;
  previousCharacterStateMap: Record<string, Record<string, unknown>>;
  chatContext: ChatContext;
}

/**
 * Build everything the analyzer and the prompt compiler need from config + source + chat (AM `MAt` @167588).
 * Pure except for the callbacks, which read `getConfig()` lazily (Asset Maid passes a live snapshot getter).
 */
export function buildAnalyzerContextInputs(input: AnalyzerContextSourceInput): AnalyzerContextInputs {
  return coreBuildAnalyzerContextInputs(input) as AnalyzerContextInputs;
}

/**
 * Outfit candidates of identity candidates (AM `y_e` @167359): candidate-enabled, non-empty outfits;
 * ai-auto outfits only when status "ready"; `form_id` omitted for "form_default".
 */
export function buildOutfitCandidates(candidates: IdentityCandidate[]): OutfitCandidate[] {
  return coreBuildOutfitCandidates(candidates) as OutfitCandidate[];
}

/**
 * Visual continuity context (AM `NAt` @167494).
 * @param primaryKeys first two image-token prompt keys (primary, secondary)
 * @param identityKeys all identity candidate keys (filters previous participants)
 * @param personaKeys `[personaPromptKey]` or []
 * @param formsByKey prompt key -> FormCollection (AM `JC`)
 */
export function buildVisualContinuityContext(
  continuity: ContinuityState,
  chatKey: string,
  primaryKeys: string[],
  identityKeys: string[],
  personaKeys: string[],
  formsByKey: Record<string, unknown>,
): VisualContinuityContext {
  return coreBuildVisualContinuityContext(continuity, chatKey, primaryKeys, identityKeys, personaKeys, formsByKey) as VisualContinuityContext;
}

/**
 * Chat history part of the chat context (AM `RAt` @167561): last non-empty user message,
 * previous non-empty assistant message before it (only when `includePreviousAssistant`), and `content`.
 */
export function buildChatContext(
  messages: ChatMessageLike[],
  content: string,
  includePreviousAssistant: boolean,
): Pick<ChatContext, "previous_assistant_response" | "current_user_input" | "latest_assistant_response"> {
  return coreBuildChatContext(messages, content, includePreviousAssistant) as ReturnType<typeof buildChatContext>;
}

/** Does the continuity state hold anything for this chat? (AM `B8` @42956). MAt sends the previous assistant reply only when false. */
export function hasStoredContinuity(continuity: ContinuityState, chatKey: string): boolean {
  return coreHasStoredContinuity(continuity, chatKey) as boolean;
}

export interface SourceGenerationSettings {
  nativeAssetVisibility: "shown" | "hidden";
  freeCharacterGenerationEnabled: boolean;
  freeOutfitGenerationEnabled: boolean;
  rosterSelectionEnabled: boolean;
  stateAccumulationEnabled: boolean;
  nsfwAlwaysEnabled: boolean;
  forceAiChoiceCoordinates: boolean;
  autoRemoveConflictingRegex: boolean;
  fixedResolution: { enabled: boolean; sizeId: number };
  fixedPositivePrompt: string;
  negativePrompt: string;
  animaPositivePrompt: string;
  animaNegativePrompt: string;
}

/**
 * Per-character-source generation settings (AM `ki` @24725): `characterPrompt.charxSettings.overrides[sourceId]`
 * over the defaults `characterPrompt.charxGenerationDefaults` (AM `xE` @24772).
 */
export function resolveSourceGenerationSettings(config: AssetMaidConfig, sourceId: string): SourceGenerationSettings {
  return coreResolveSourceGenerationSettings(config, sourceId) as SourceGenerationSettings;
}

/** Defaults part only (AM `xE` @24772). */
export function getDefaultSourceGenerationSettings(config: AssetMaidConfig): SourceGenerationSettings {
  return coreDefaultSourceGenerationSettings(config) as SourceGenerationSettings;
}

/** `resolveSourceGenerationSettings(config, sourceId).freeOutfitGenerationEnabled` (AM `jE` @25542). */
export function isFreeOutfitGenerationEnabled(config: AssetMaidConfig, sourceId: string): boolean {
  return coreFreeOutfitGenerationEnabled(config, sourceId) as boolean;
}

export interface ArtistPromptSelection {
  id: string;
  name: string;
  prompt: string;
  negativePrompt: string;
  novelAIOverrides?: Record<string, unknown>;
  nonArtistPromptWeight?: unknown;
}

/**
 * Artist prompt for a provider (AM `Ky` @94951). NovelAI: `characterPrompt.selectedArtistId` over
 * default presets + `characterPrompt.artistPrompts`; Anima (chan-server/comfy-ui): `animaArtists`
 * (`selection.bySourceId[sourceId] ?? defaultId`, negative ""). Prompts pass the weight normaliser `Mu`.
 */
export function resolveArtistPromptSelection(
  config: AssetMaidConfig,
  options: { provider?: string; promptKey?: string; sourceId?: string } = {},
): ArtistPromptSelection {
  return coreResolveArtistPromptSelection(config, options) as ArtistPromptSelection;
}

/**
 * NovelAI config for a run (AM `Sat` @94971): `config.novelai` + artist `novelAIOverrides`
 * + `nonArtistPromptWeight` + `nonArtistPromptWeightArtist {id,name,positive,negative}`.
 */
export function resolveNovelAIRunConfig(config: AssetMaidConfig, options: { sourceId?: string; promptKey?: string } = {}): Record<string, unknown> {
  return coreResolveNovelAIRunConfig(config, options) as Record<string, unknown>;
}

export interface PersonaProfile {
  key: string;
  prompt: string;
  basePromptGroups: Record<string, string[]>;
  negativePrompt: string;
  gender: string;
  outfits: unknown[];
  defaultOutfitId: string;
  forms: { defaultFormId: string; forms: unknown[] };
}

/** Persona appearance (AM `lS` @167430); default prompt "1::kazehaya shouta::" when the persona has no prompt. */
export function resolvePersonaProfile(config: AssetMaidConfig, personaKey: string): PersonaProfile {
  return coreResolvePersonaProfile(config, personaKey) as PersonaProfile;
}

/** chan-server / comfy-ui use the Anima flat prompt codec (AM `Nc` @20644). */
export function isAnimaFlatProvider(provider: string): boolean {
  return coreIsAnimaFlatProvider(provider) as boolean;
}

/** Planner image token from a detected chat image token (AM `g1t` @168873). */
export function toPlannerImageToken(token: {
  tokenName: string;
  characterName: string;
  markupType?: string;
  full?: string;
  before?: string;
  after?: string;
}): PlannerImageToken {
  return coreToPlannerImageToken(token) as PlannerImageToken;
}

/** Append active custom characters as virtual source members (AM `rI` @93161). Memoised per source. */
export function withCustomCharacterMembers(
  source: CharacterSource | null,
  customCharacters: unknown[],
  mode: "active" | "all" = "active",
): CharacterSource | null {
  return coreWithCustomCharacterMembers(source, customCharacters, mode) as CharacterSource | null;
}

/** Always "all" in 0.9.88 (AM `OW` @20663). */
export function resolvePresetScope(provider: string, comfyuiOutfitReferenceEnabled?: boolean): PresetScope {
  return coreResolvePresetScope(provider, comfyuiOutfitReferenceEnabled) as PresetScope;
}

/** Auto-outfit creation mode "tags-only" | "reference-image" (AM `ZAt` @168328). */
export function resolveOutfitCreationMode(config: AssetMaidConfig): "tags-only" | "reference-image" {
  return coreResolveOutfitCreationMode(config) as "tags-only" | "reference-image";
}

/** Known identities for free character generation (AM `c1t` @168769). */
export function buildKnownIdentities(source: CharacterSource | null, personaRecords: PersonaRecord[] = []): { name: string; keys: string[] }[] {
  return coreBuildKnownIdentities(source, personaRecords as never[]) as { name: string; keys: string[] }[];
}

export interface ParagraphSlotLike {
  slotId: string;
  index: number;
  beforeText: string;
  afterText: string;
}

export interface IdentityEvidence {
  actorHintsBySlot: Map<string, string[]>;
  [extra: string]: unknown;
}

/**
 * Identity evidence per paragraph slot (AM `UAt` @167957, async; yields every `yieldBudgetMs`).
 * `actorHintsBySlot.get(slotId)` becomes `candidateSlots[].actor_hints`.
 */
export async function resolveIdentityEvidence(input: {
  candidates: IdentityCandidate[];
  slots: ParagraphSlotLike[];
  originalAssetTokens: { tokenName: string; full: string; [extra: string]: unknown }[];
  source: CharacterSource | null;
  previousMessageParticipantKeys: string[];
  signal?: AbortSignal;
  yieldBudgetMs?: number;
}): Promise<IdentityEvidence> {
  return (await coreResolveIdentityEvidence({ yieldBudgetMs: 8, ...input })) as IdentityEvidence;
}

/** Candidate slots for the analyzer from paragraph slots + evidence (E1t @169621-169630). */
export function buildCandidateSlots(slots: ParagraphSlotLike[], evidence: IdentityEvidence | null): CandidateSlot[] {
  return slots.map((slot) => {
    const hints = [...(evidence?.actorHintsBySlot.get(slot.slotId) ?? [])];
    return {
      slot_id: slot.slotId,
      slot_number: slot.index,
      before: slot.beforeText,
      after: slot.afterText,
      ...(hints.length ? { actor_hints: hints } : {}),
    };
  });
}

export interface AssembleAnalyzerInputOptions {
  config: AssetMaidConfig;
  sourceId: string;
  inputs: AnalyzerContextInputs;
  candidateSlots: CandidateSlot[];
  targetImageCount: number;
  imageCountConstraint: ImageCountConstraint;
  checkpoint: { chatKey: string; messageIndex: number; messageId: string };
  modelType?: string;
  replayGeneratedOutfits?: ReplayGeneratedOutfit[];
  splitAnalysis?: AnalyzerContext["splitAnalysis"];
  revisionDirection?: string;
  revisionPromptChannels?: RevisionPromptChannel[];
  revisionEvidenceKey?: string;
}

export interface AssembledAnalyzerInput {
  context: AnalyzerContext;
  checkpointContext: AnalyzerCheckpointContext;
  fingerprintInput: AnalyzerFingerprintInput;
  revisionPromptChannels?: RevisionPromptChannel[];
  validationOptions: AnalyzerValidationOptions;
}

const s = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * Assemble `analyzerInput.{context, checkpointContext, fingerprintInput, validationOptions}` exactly as
 * the chat pipeline does (E1t @169706-169762). Object assembly only; every value comes from core helpers.
 * `freeCharacterGenerationEnabled` = profile v5-hybrid && per-source setting (E1t @169564).
 */
export function assembleAnalyzerInput(o: AssembleAnalyzerInputOptions): AssembledAnalyzerInput {
  const cfg = o.config;
  const settings = resolveSourceGenerationSettings(cfg, o.sourceId);
  const profile = (cfg.novelai as { analysisProfile?: string }).analysisProfile;
  const freeCharacterGenerationEnabled = profile === "v5-hybrid" && settings.freeCharacterGenerationEnabled;
  const runtime = cfg.runtime as { generationProvider: string; comfyuiOutfitReferenceEnabled?: boolean };
  const presetScope = resolvePresetScope(runtime.generationProvider, runtime.comfyuiOutfitReferenceEnabled);
  const ft = o.inputs;
  const context: AnalyzerContext = {
    cacheSourceId: o.sourceId,
    ...(o.splitAnalysis ? { splitAnalysis: o.splitAnalysis } : {}),
    rosterSelectionEnabled: settings.rosterSelectionEnabled,
    freeCharacterGenerationEnabled,
    freeOutfitGenerationEnabled: isFreeOutfitGenerationEnabled(cfg, o.sourceId),
    replayGeneratedOutfits: o.replayGeneratedOutfits ?? [],
    scope: "paragraph-slot-illustration",
    modelType: s(o.modelType),
    chatContext: ft.chatContext,
    candidateSlots: o.candidateSlots,
    targetImageCount: o.targetImageCount,
    imageCountConstraint: o.imageCountConstraint,
    actorCandidates: ft.analyzerIdentityCandidates,
    personaCandidates: ft.analyzerPersonaCandidates,
    outfitCandidates: ft.analyzerOutfitCandidates,
    v5PersonaCatalogCandidates: ft.v5PersonaCatalogCandidates,
    v5OutfitCatalogCandidates: ft.v5OutfitCatalogCandidates,
    personaPromptKey: ft.analyzerPersonaPromptKey,
    visualContinuity: ft.visualContinuity,
    presetScope,
  };
  return {
    context,
    checkpointContext: {
      chatKey: o.checkpoint.chatKey,
      messageIndex: o.checkpoint.messageIndex,
      messageId: o.checkpoint.messageId,
      generationProvider: runtime.generationProvider,
    },
    fingerprintInput: {
      presetScope,
      candidateSlots: o.candidateSlots.map((slot) => ({ slotId: slot.slot_id, slotNumber: slot.slot_number, actorHints: slot.actor_hints ?? [] })),
      imageCountConstraint: o.imageCountConstraint,
      outfitCreationMode: [...ft.analyzerIdentityCandidates, ...ft.analyzerPersonaCandidates].some((c) => c.allowOutfitCreation === true)
        ? "free-generation"
        : "existing-only",
      outfitCandidateIds: ft.analyzerOutfitCandidates.map((c) => [c.lorebook_prompt_key, c.id] as [string, string]),
      revisionDirection: s(o.revisionDirection),
      revisionPromptChannels: o.revisionPromptChannels ?? [],
      revisionEvidenceKey: s(o.revisionEvidenceKey),
    },
    ...(o.revisionPromptChannels?.length ? { revisionPromptChannels: o.revisionPromptChannels } : {}),
    validationOptions: {
      identityCandidates: ft.analyzerIdentityCandidates,
      personaCandidates: ft.analyzerPersonaCandidates,
      outfitCandidates: ft.analyzerOutfitCandidates,
      personaGender: ft.personaGender,
      personaPromptKey: ft.analyzerPersonaPromptKey,
      personaDefaultOutfitId: ft.analyzerPersonaDefaultOutfitId,
      defaultSizeId: (NOVELAI_DEFAULTS as { DEFAULT_IMAGE_SIZE_PRESET_ID: number }).DEFAULT_IMAGE_SIZE_PRESET_ID,
    },
  };
}

/** `previousGlobalModifierRefs` for the orchestrator (E1t @169805). */
export function previousGlobalModifierRefs(visualContinuity: VisualContinuityContext): Record<string, string[]> {
  return (coreAsRecord(visualContinuity.previous_modifiers.global) ?? {}) as Record<string, string[]>;
}
