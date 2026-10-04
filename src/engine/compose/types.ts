/**
 * Runtime shapes of the compose stage (Asset Maid 0.9.88), mirrored field by field.
 * Source: spec/pipeline.md §3, spec/novelai.md §6 and §9.
 */

export type ImageProviderId = "novelai" | "chan-server" | "comfy-ui";
export type ActorSlot = "primary" | "secondary" | "persona";

/** `{providerId, queueScopeKey}` (`_be` @119949; default scope `image-provider:<id>:global`). */
export interface ImageProviderRef {
  providerId: ImageProviderId;
  queueScopeKey: string;
}

/** One entry of the projection ledger (`promptLedger`). */
export interface PromptLedgerEntry {
  destination: string;
  semanticId?: string;
  tags?: string;
  sourceLayer?: string;
  source?: string;
  [key: string]: unknown;
}

/** Character prompt inside a {@link PromptPlan}: visible slots only, `uc` = form/identity negative. */
export interface PromptPlanCharacter {
  actorSlot: ActorSlot;
  prompt: string;
  uc: string;
  actorId?: string;
  actorIndex?: number;
}

/** Output of the prompt compiler (`kmt` @111219 + `myt` @119667). */
export interface PromptPlan {
  globalPositive: string;
  negativePrompt: string;
  characters: PromptPlanCharacter[];
  removeTags: string[];
  promptLedger?: PromptLedgerEntry[];
  bodyAction: string;
  artistId: string;
  artistName: string;
  width: number;
  height: number;
  sizeId: number;
  selectedFraming: string;
  selectedVariantId: string;
  matchedIdentityKeys: Partial<Record<ActorSlot, string>>;
  selectedOutfitIds: Partial<Record<ActorSlot, string>>;
  selectedFormIds?: Partial<Record<ActorSlot, string>>;
  actorIdentities: Partial<Record<ActorSlot, { type: "character" | "persona"; key: string; name: string }>>;
  identitySuppressedActorSlots: ActorSlot[];
  [key: string]: unknown;
}

/** Participant of a build spec (`jht` @114764). */
export interface PromptParticipant {
  actorSlot: ActorSlot;
  type: "character" | "persona";
  gender: string;
  lorebookPromptKey: string;
  characterName: string;
  sourceImageToken: string;
  outfitId: string;
  formId: string;
}

/** `spec` argument of `compiler.build(spec, inputs)` (`Eht` @114786). */
export interface PromptBuildSpec {
  presetId: string;
  bodyAction?: string;
  requestedModifiers: Record<string, unknown>;
  variantId: string;
  frameId: string;
  frameSizeId?: number | string;
  sizeId: number | string;
  providerId: ImageProviderId | string;
  chanceSeed: string;
  /** Canonical rule selections (`iee(decision.modifiers, ruleRuntime)`); required on the rule-IR path. */
  ruleSelections?: unknown;
  participants: PromptParticipant[];
}

/** Identity candidate (`u_e` @167040 output; read: key, prompt, basePromptGroups, negativePrompt, appearanceForms, defaultFormId, aliases). */
export interface IdentityCandidate {
  key: string;
  prompt: string;
  basePromptGroups: Record<string, string[]>;
  negativePrompt: string;
  appearanceForms?: AppearanceForm[];
  defaultFormId?: string;
  canonicalName?: string;
  ownerName?: string;
  loreTitle?: string;
  memberName?: string;
  aliasSources?: Record<string, string[]>;
  [key: string]: unknown;
}

/** Normalized outfit (`Mc`/`go` output). */
export interface OutfitRecord {
  id: string;
  label: string;
  description?: string;
  candidateEnabled?: boolean;
  head?: string;
  top?: string;
  bottom?: string;
  legs?: string;
  feet?: string;
  [key: string]: unknown;
}

/** Normalized appearance form (`Mc`/`go` output). */
export interface AppearanceForm {
  id: string;
  label: string;
  description?: string;
  humanlike: boolean;
  gender: string;
  basePromptGroups: Record<string, string[]>;
  negativePrompt: string;
  reference?: unknown;
  defaultOutfitId: string;
  outfits: OutfitRecord[];
}

/** `inputs` argument of `compiler.build` = `MAt.promptInputs(decision)` (167610-167634) + continuity fields. */
export interface PromptInputs {
  identityCandidates: IdentityCandidate[];
  outfitsByPromptKey: Record<string, OutfitRecord[]>;
  /** `ki(config, sourceId).fixedPositivePrompt`; "" for Anima providers. */
  fixedPositivePrompt: string;
  /** `ki(config, sourceId).negativePrompt`; "" for Anima providers. */
  negativePrompt: string;
  personaPrompt: string;
  personaBasePromptGroups: Record<string, string[]>;
  personaNegativePrompt: string;
  personaName: string;
  personaGender: string;
  personaPromptKey: string;
  personaDefaultOutfitId: string;
  personaAppearanceForms: AppearanceForm[];
  personaDefaultFormId: string;
  /** `Ky(config, {promptKey, sourceId})` (NovelAI: selectedArtistId over FP; Anima: animaArtists). */
  artistId: string;
  artistName: string;
  artistPrompt: string;
  artistNegativePrompt: string;
  continuityPrompt?: string;
  actorContinuityPrompts?: Partial<Record<ActorSlot, string>>;
  localContinuitySelections?: unknown;
}

/** Character prompt of a provider prompt. */
export interface ProviderCharacterPrompt {
  actorSlot?: ActorSlot | string;
  actorId?: string;
  actorIndex?: number;
  prompt: string;
  negativePrompt: string;
  centerX?: number;
  centerY?: number;
  depth?: number;
}

/** Provider prompt (`vmt` / `Hge` output). */
export interface ProviderPrompt {
  provider: ImageProviderId;
  profileId: string;
  profileRevision: number;
  sourceFormat: string;
  requestFormat: "novelai" | "novelai-v5-hybrid" | "anima";
  formatterRevision: number;
  globalPositivePrompt: string;
  globalNegativePrompt: string;
  positivePrompt: string;
  negativePrompt: string;
  characterPrompts: ProviderCharacterPrompt[];
  diagnostics: AnimaDiagnostic[];
}

export interface AnimaDiagnostic {
  code: string;
  field?: string;
  message?: string;
  [key: string]: unknown;
}

/** ComfyUI workflow profile (`Adt` output; bundled `n2`). Only `id`, `revision` and `metadata.reference` are read by compose. */
export interface ComfyWorkflowProfile {
  id: string;
  revision: number;
  workflowId?: string;
  metadata: { reference?: { mode?: string; positivePrefix?: string; [key: string]: unknown }; [key: string]: unknown };
  [key: string]: unknown;
}

/** Input of {@link formatProviderPrompt} (`g2`). */
export interface ProviderPromptInput {
  provider: ImageProviderId;
  plan: Pick<PromptPlan, "globalPositive" | "negativePrompt" | "bodyAction"> & {
    characters: Array<Omit<PromptPlanCharacter, "actorSlot"> & { actorSlot?: ActorSlot | string }>;
  };
  novelAIModel?: string;
  comfyUIProfile?: ComfyWorkflowProfile | null;
  outfitReferenceEnabled?: boolean;
  animaPositivePrefix?: string;
  animaNegativePrefix?: string;
  sourceFormat?: string;
  /** V5 executed prompt plan (NovelAI only). */
  v5PromptPlan?: Record<string, unknown>;
}

/** Non-artist prompt weight option (`Aa` @24565): multiplier clamped 0.5..1, step 0.05, default 0.7. */
export interface NonArtistPromptWeight {
  enabled: boolean;
  multiplier: number;
}

export interface TextSpan {
  start: number;
  end: number;
}

/** Tracked non-artist weighting source (`Dy` @92769 shape). */
export interface NonArtistPromptSource {
  artistId?: string;
  artistName?: string;
  option: NonArtistPromptWeight;
  positive: string;
  negative: string;
  characters: Array<{ prompt: string; negativePrompt: string }>;
  artistPositive?: TextSpan;
  artistNegative?: TextSpan;
}

/** Fields of NovelAIConfig read by the weighting code. */
export interface NonArtistWeightConfig {
  nonArtistPromptWeight?: Partial<NonArtistPromptWeight> | null;
  nonArtistPromptWeightArtist?: { id?: string; name?: string; positive?: string; negative?: string } | null;
  nonArtistPromptSource?: unknown;
  [key: string]: unknown;
}

/** Prompt triple used by the weighting code. */
export interface WeightablePrompt {
  positivePrompt: string;
  negativePrompt: string;
  characterPrompts: Array<{ prompt: string; negativePrompt: string; actorIndex?: number; centerX?: number; centerY?: number; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** Artist span offsets (`Nht` @114811 / `O7` @111018). */
export interface PromptSegments {
  artistPositive?: TextSpan;
  artistNegative?: TextSpan;
  outfits: Record<string, unknown>;
}

/** NovelAI character prompt inside NovelAIConfig (`Mht` / `Wgt`). */
export interface NovelAIConfigCharacter {
  actorId?: string;
  actorIndex?: number;
  actorSlot?: string;
  prompt: string;
  uc: string;
  centerX: number;
  centerY: number;
  coordinateMode?: "automatic" | "fixed";
}

/** NovelAI run config (`Sat` @94971 + per-image fields). Unknown provider settings pass through. */
export interface NovelAIRunConfig extends NonArtistWeightConfig {
  apiKey?: string;
  naiModel?: string;
  seed?: string | number;
  analysisProfile?: string;
  width?: number;
  height?: number;
  negativePrompt?: string;
  characterPrompts?: NovelAIConfigCharacter[];
  useCoords?: boolean;
  forceCharacterCoordinates?: boolean;
  [key: string]: unknown;
}

/** Image actor (`wht` @114609). */
export interface ImageActor {
  actorId: string;
  actorIndex: number;
  kind: "character" | "persona";
  gender: string;
  identityKey: string;
  identityName: string;
  selectedFormId: string;
  selectedOutfitId: string;
  identitySuppressed: boolean;
  prompt: string;
  negativePrompt: string;
}

/** Size preset / custom size (`Ns.IMAGE_SIZE_PRESETS`, `runtime.customImageSizes`). */
export interface ImageSize {
  id: number;
  width: number;
  height: number;
  label?: string;
  [key: string]: unknown;
}

/** Count policy (`Gf` @20598). */
export interface ImageCountPolicy {
  mode: "fixed" | "range";
  min: number;
  max: number;
  values: { fixed: number; min: number; max: number };
}

/** Per-run count constraint (`SW` @20616). */
export interface ImageCountConstraint {
  mode: "fixed" | "range";
  min: number;
  max: number;
}

/** Common fields of the request handed to the provider adapter (`umt` @110680). */
export interface ImageRequestBase {
  providerRef: ImageProviderRef;
  prompt: string;
  negativePrompt: string;
  seed: string;
  width: number;
  height: number;
  signal?: AbortSignal;
  maxAttempts?: number;
}

/** ImageRequest union (spec/pipeline.md §3.9). NovelAI character prompts travel in `config.characterPrompts`. */
export type ImageRequest =
  | (ImageRequestBase & {
      provider: "novelai";
      config: NovelAIRunConfig;
      forceNsfwPrefix?: false;
      session: unknown;
      references: unknown[];
      imageToImage?: { image: unknown; strength: number; noise: number };
      queueMeta: { kind: "generation"; source: string; sourceImageToken: string };
    })
  | (ImageRequestBase & { provider: "chan-server"; transport: "chan-server-nai"; requestUrl: string; apiKey: string; timeoutMs?: number })
  | (ImageRequestBase & {
      provider: "comfy-ui";
      transport: "direct-workflow";
      endpoint: string;
      profile: ComfyWorkflowProfile;
      outfitReference?: unknown;
      characterReference?: unknown;
      completionTimeoutMs?: number;
    });
