/**
 * Analyzer context building (Asset Maid 0.9.90 `gxt` @172212 and helpers): everything the V5 planner can see, plus
 * the prompt-context/reference callbacks the orchestrator uses later.
 *
 * Thin typed wrappers over the verbatim core. See README.md in this folder for the exact list of
 * config / source / character fields read. 0.9.90 dropped the V4.5 parts of the old `s1t`
 * (`promptInputs`, `outfitContinuityReferences`) and the known-identity list for free character generation.
 */
import {
  buildAnalyzerContextInputs as coreBuildAnalyzerContextInputs,
  buildOutfitCandidates as coreBuildOutfitCandidates,
  buildVisualContinuityContext as coreBuildVisualContinuityContext,
  resolveNovelAIRunConfig as coreResolveNovelAIRunConfig,
  resolveArtistPromptSelection as coreResolveArtistPromptSelection,
  resolveSourceGenerationSettings as coreResolveSourceGenerationSettings,
  normalizeSourceGenerationSettings as coreDefaultSourceGenerationSettings,
  resolveFixedRating as coreResolveFixedRating,
  mxt as coreBuildChatContext,
  kj as coreResolvePersonaProfile,
  NE as coreFreeOutfitGenerationEnabled,
  Vi as coreIsAnimaFlatProvider,
  hasStoredContinuity as coreHasStoredContinuity,
  Axt as coreResolveIdentityEvidence,
  Txt as coreToPlannerImageToken,
  r5 as coreWithCustomCharacterMembers,
  qAe as coreResolvePresetScope,
  gyt as coreResolveOutfitCreationMode,
  Xwe as coreAsRecord,
} from "../core/asset-maid-core";
import type {
  AnalyzerCheckpointContext,
  AnalyzerContext,
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

/** Visual continuity state (spec/pipeline.md §3.7a, AM 0.9.90 `UE` @36624). */
export interface ContinuityState {
  version: 1;
  scenes: Record<string, unknown>;
  characters: Record<string, Record<string, Record<string, unknown>>>;
  modifierRefs: Record<string, unknown>;
  outfitRefs: Record<string, unknown>;
  recentCheckpoints: Record<string, unknown[]>;
}

/** Input of `buildAnalyzerContextInputs` (AM 0.9.90 `Vxt` @173414-173431). */
export interface AnalyzerContextSourceInput {
  config: AssetMaidConfig;
  /** Live config getter used by the late callbacks (v5PromptContext, references, ...). Defaults to `config`. */
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

/** Output of `buildAnalyzerContextInputs` (`gxt` @172212). */
export interface AnalyzerContextInputs {
  analyzerIdentityCandidates: IdentityCandidate[];
  analyzerPersonaCandidates: IdentityCandidate[];
  analyzerOutfitCandidates: OutfitCandidate[];
  v5PersonaCatalogCandidates: IdentityCandidate[];
  v5OutfitCatalogCandidates: OutfitCandidate[];
  analyzerPersonaPromptKey: string;
  analyzerPersonaDefaultOutfitId: string;
  personaGender: string;
  v5PromptContext(identityKeys: string[]): Record<string, unknown>;
  references(actors: ImageActorLike[]): CharacterReference[];
  outfitReference(actors: ImageActorLike[]): CharacterReference | null;
  characterReference(actors: ImageActorLike[]): CharacterReference | null;
  /** Per-actor seed setting (`sxt`). */
  seedSetting(actors: ImageActorLike[]): { key?: string; seed: string; fixed: boolean };
  visualContinuity: VisualContinuityContext;
  previousCharacterStateMap: Record<string, Record<string, unknown>>;
  chatContext: ChatContext;
}

/**
 * Build everything the V5 analyzer and composer need from config + source + chat (AM `gxt` @172212).
 * Pure except for the callbacks, which read `getConfig()` lazily (Asset Maid passes a live snapshot getter).
 * The config must carry `jevConnection` (read by the source generation settings `pO`).
 */
export function buildAnalyzerContextInputs(input: AnalyzerContextSourceInput): AnalyzerContextInputs {
  return coreBuildAnalyzerContextInputs(input) as unknown as AnalyzerContextInputs;
}

/**
 * Outfit candidates of identity candidates (AM `jwe` @171996): candidate-enabled, non-empty outfits;
 * ai-auto outfits only when status "ready"; `form_id` omitted for "form_default".
 */
export function buildOutfitCandidates(candidates: IdentityCandidate[]): OutfitCandidate[] {
  return coreBuildOutfitCandidates(candidates) as OutfitCandidate[];
}

/**
 * Visual continuity context (AM `pxt` @172119).
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
 * Chat history part of the chat context (AM `mxt` @172185): last non-empty user message,
 * previous non-empty assistant message before it (only when `includePreviousAssistant`), and `content`.
 */
export function buildChatContext(
  messages: ChatMessageLike[],
  content: string,
  includePreviousAssistant: boolean,
): Pick<ChatContext, "previous_assistant_response" | "current_user_input" | "latest_assistant_response"> {
  return coreBuildChatContext(messages, content, includePreviousAssistant) as ReturnType<typeof buildChatContext>;
}

/** Does the continuity state hold anything for this chat? (AM `$3e` @36627). `gxt` sends the previous assistant reply only when false. */
export function hasStoredContinuity(continuity: ContinuityState, chatKey: string): boolean {
  return coreHasStoredContinuity(continuity, chatKey) as boolean;
}

export interface SourceGenerationSettings {
  nativeAssetVisibility: "shown" | "hidden";
  freeCharacterGenerationEnabled: boolean;
  freeOutfitGenerationEnabled: boolean;
  rosterSelectionEnabled: boolean;
  nsfwAlwaysEnabled: boolean;
  /** 0.9.90: the rating used when `nsfwAlwaysEnabled` (`O8`: "sfw" stays, anything else "nsfw"). */
  fixedRating: "sfw" | "nsfw";
  forceAiChoiceCoordinates: boolean;
  autoRemoveConflictingRegex: boolean;
  fixedResolution: { enabled: boolean; sizeId: number };
  fixedPositivePrompt: string;
  negativePrompt: string;
  animaPositivePrompt: string;
  animaNegativePrompt: string;
}

/**
 * Per-character-source generation settings (AM `xi` @12476): `characterPrompt.charxSettings.overrides[sourceId]`
 * over the defaults `characterPrompt.charxGenerationDefaults` (AM `pO` @12520). 0.9.90: no `stateAccumulationEnabled`,
 * new `fixedRating`, `rosterSelectionEnabled` defaults to `config.jevConnection.rosterSelectionDefault`.
 */
export function resolveSourceGenerationSettings(config: AssetMaidConfig, sourceId: string): SourceGenerationSettings {
  return coreResolveSourceGenerationSettings(config, sourceId) as SourceGenerationSettings;
}

/** Defaults part only (AM `pO` @12520). */
export function getDefaultSourceGenerationSettings(config: AssetMaidConfig): SourceGenerationSettings {
  return coreDefaultSourceGenerationSettings(config) as SourceGenerationSettings;
}

/** Fixed rating of a source (`nsfwAlwaysEnabled ? fixedRating : false`; run input `forceRating`). AM `yS` @4532. */
export function resolveSourceFixedRating(config: AssetMaidConfig, sourceId: string): "sfw" | "nsfw" | false {
  return coreResolveFixedRating(resolveSourceGenerationSettings(config, sourceId)) as "sfw" | "nsfw" | false;
}

/** `resolveSourceGenerationSettings(config, sourceId).freeOutfitGenerationEnabled` (AM `NE`). */
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
 * Artist prompt for a provider (AM `Sx` @89787). NovelAI: `characterPrompt.selectedArtistId` over
 * default presets (0.9.90: only `none`) + `characterPrompt.artistPrompts`; Anima (comfy-ui): `animaArtists`
 * (`selection.bySourceId[sourceId] ?? defaultId`, negative ""). Prompts pass the weight normaliser `hm`.
 */
export function resolveArtistPromptSelection(
  config: AssetMaidConfig,
  options: { provider?: string; promptKey?: string; sourceId?: string } = {},
): ArtistPromptSelection {
  return coreResolveArtistPromptSelection(config, options) as ArtistPromptSelection;
}

/**
 * NovelAI config for a run (AM `OYe` @89807): `config.novelai` + artist `novelAIOverrides`
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

/** Persona appearance (AM `kj` @172062). */
export function resolvePersonaProfile(config: AssetMaidConfig, personaKey: string): PersonaProfile {
  return coreResolvePersonaProfile(config, personaKey) as PersonaProfile;
}

/** comfy-ui uses the Anima flat prompt codec (AM `Vi` @4734; Chan Server is gone in 0.9.90). */
export function isAnimaFlatProvider(provider: string): boolean {
  return coreIsAnimaFlatProvider(provider) as boolean;
}

/** Planner image token from a detected chat image token (AM `Txt` @172924). */
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

/** Append active custom characters as virtual source members (AM `r5` @69417). Memoised per source. */
export function withCustomCharacterMembers(
  source: CharacterSource | null,
  customCharacters: unknown[],
  mode: "active" | "all" = "active",
): CharacterSource | null {
  return coreWithCustomCharacterMembers(source, customCharacters, mode) as CharacterSource | null;
}

/** Always "all" (AM `qAe` @4753). */
export function resolvePresetScope(provider: string, comfyuiOutfitReferenceEnabled?: boolean): PresetScope {
  return coreResolvePresetScope(provider, comfyuiOutfitReferenceEnabled) as PresetScope;
}

/** Auto-outfit creation mode "tags-only" | "reference-image" (AM `gyt` @169692). */
export function resolveOutfitCreationMode(config: AssetMaidConfig): "tags-only" | "reference-image" {
  return coreResolveOutfitCreationMode(config) as "tags-only" | "reference-image";
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
 * Identity evidence per paragraph slot (AM `Axt` @172554, async; yields every `yieldBudgetMs`).
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

/** Candidate slots for the analyzer from paragraph slots + evidence (AM `Vxt` chat flow). */
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
  /** `messageIndex` is accepted for compatibility and unused (0.9.90 checkpoint context has no index). */
  checkpoint: { chatKey: string; messageIndex?: number; messageId: string };
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
  revisionPromptChannels?: RevisionPromptChannel[];
}

const s = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * Assemble `analyzerInput.{context, checkpointContext, revisionPromptChannels?}` exactly as the 0.9.90 chat flow does
 * (`Vxt` @173586-173614). Object assembly only; every value comes from core helpers.
 * 0.9.90 changes: `freeCharacterGenerationEnabled` is the per-source setting alone (no analysis-profile gate),
 * `checkpointContext` is `{chatKey, messageId}` (the `id:` prefix stripped), and the V4.5 `fingerprintInput` /
 * `validationOptions` are gone. `revisionDirection` / `revisionEvidenceKey` are accepted and ignored (they travel on
 * the run input).
 */
export function assembleAnalyzerInput(o: AssembleAnalyzerInputOptions): AssembledAnalyzerInput {
  const cfg = o.config;
  const settings = resolveSourceGenerationSettings(cfg, o.sourceId);
  const runtime = cfg.runtime as { generationProvider: string; comfyuiOutfitReferenceEnabled?: boolean };
  const ft = o.inputs;
  const context: AnalyzerContext = {
    cacheSourceId: o.sourceId,
    ...(o.splitAnalysis ? { splitAnalysis: o.splitAnalysis } : {}),
    rosterSelectionEnabled: settings.rosterSelectionEnabled,
    freeCharacterGenerationEnabled: settings.freeCharacterGenerationEnabled,
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
    presetScope: resolvePresetScope(runtime.generationProvider, runtime.comfyuiOutfitReferenceEnabled),
  };
  return {
    context,
    checkpointContext: { chatKey: o.checkpoint.chatKey, messageId: s(o.checkpoint.messageId).replace(/^id:/u, "") },
    ...(o.revisionPromptChannels?.length ? { revisionPromptChannels: o.revisionPromptChannels } : {}),
  };
}

/** `previousGlobalModifierRefs` for the orchestrator (`Vxt` @173646). */
export function previousGlobalModifierRefs(visualContinuity: VisualContinuityContext): Record<string, string[]> {
  return (coreAsRecord(visualContinuity.previous_modifiers.global) ?? {}) as Record<string, string[]>;
}
