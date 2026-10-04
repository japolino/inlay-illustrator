/**
 * Provider prompt codecs (spec/novelai.md §6, spec/pipeline.md §3.5c). Facade over the verbatim core.
 */
import {
  formatProviderPrompt as coreFormatProviderPrompt,
  PROVIDER_PROMPT_FORMATTERS as coreFormatters,
  formatNovelAIProviderPrompt as coreFormatNovelAI,
  formatAnimaProviderPrompt as coreFormatAnima,
  buildAnimaFlatPrompts as coreBuildAnimaFlat,
  formatAnimaFlatPrompt as coreFormatAnimaFlat,
  parseAnimaPromptNodes as coreParseAnima,
  attachActorIdsToCharacterPrompts as coreAttachActorIds,
  ANIMA_DEFAULT_POSITIVE_PREFIX as coreAnimaPos,
  ANIMA_DEFAULT_NEGATIVE_PREFIX as coreAnimaNeg,
  IMAGE_PROVIDER_TABLE as coreProviderTable,
  n2 as bundledComfyProfile,
  t7 as resolveComfyProfile,
  r2 as isOutfitRestylerProfile,
  Nc as isAnimaFlatProvider,
} from "../core/asset-maid-core";
import type { AnimaDiagnostic, ComfyWorkflowProfile, ImageActor, ProviderPrompt, ProviderPromptInput } from "./types";

/** "masterpiece, best quality, score_7, safe" (`lL` @20730). */
export const ANIMA_DEFAULT_POSITIVE_PREFIX: string = coreAnimaPos;
/** "worst quality, low quality, score_1, ... chromatic aberration" (`dL` @20731). */
export const ANIMA_DEFAULT_NEGATIVE_PREFIX: string = coreAnimaNeg;
/** Provider capability table (`W0` @20554): label, promptCodecId, referenceUiMode, outfitImageGeneration. */
export const IMAGE_PROVIDER_TABLE = coreProviderTable as unknown as Readonly<
  Record<string, { label: string; capabilities: { promptCodecId: "novelai-structured" | "anima-flat"; referenceUiMode: string; outfitImageGeneration: string } }>
>;
/** Bundled ComfyUI workflow profile (`n2` @107748). */
export const BUNDLED_COMFY_WORKFLOW_PROFILE = bundledComfyProfile as ComfyWorkflowProfile;

/** Formatter table (`wmt` @110984): novelai -> `vmt`; chan-server -> Anima (`anima-base` rev 1); comfy-ui -> Anima with the profile. */
export const PROVIDER_PROMPT_FORMATTERS = coreFormatters as Readonly<Record<string, (input: ProviderPromptInput) => ProviderPrompt>>;

/**
 * Format the provider prompt for one image. Throws for a V5 plan with a non-NovelAI provider and for comfy-ui
 * without a workflow profile ("Anima Base UI 워크플로 프로필이 필요합니다."). Original: `g2` @110993.
 */
export function formatProviderPrompt(input: ProviderPromptInput): ProviderPrompt {
  return coreFormatProviderPrompt(input) as ProviderPrompt;
}

/** NovelAI structured prompt (`requestFormat "novelai"` or `"novelai-v5-hybrid"`). Original: `vmt` @110916. */
export function formatNovelAIProviderPrompt(input: ProviderPromptInput): ProviderPrompt {
  return coreFormatNovelAI(input) as ProviderPrompt;
}

/** Anima flat prompt for chan-server / comfy-ui. Original: `Hge` @110961. */
export function formatAnimaProviderPrompt(input: ProviderPromptInput, provider: "chan-server" | "comfy-ui", profileId: string, profileRevision: number): ProviderPrompt {
  return coreFormatAnima(input, provider, profileId, profileRevision) as ProviderPrompt;
}

/** Anima global/character composition (blank-line groups, restyler prefix). Original: `bmt` @110887. */
export function buildAnimaFlatPrompts(input: ProviderPromptInput): {
  globalPositivePrompt: string;
  globalNegativePrompt: string;
  positivePrompt: string;
  negativePrompt: string;
  diagnostics: AnimaDiagnostic[];
} {
  return coreBuildAnimaFlat(input) as ReturnType<typeof buildAnimaFlatPrompts>;
}

/**
 * Convert one NovelAI-syntax positive/negative pair to Anima text with prefixes
 * (`undefined` prefix = default `lL`/`dL`, "" = none). Original: `p7` @109525.
 */
export function formatAnimaFlatPrompt(input: {
  positivePrompt: string;
  negativePrompt: string;
  positivePrefix?: string;
  negativePrefix?: string;
  preserveBlankLineGroups?: boolean;
}): { positivePrompt: string; negativePrompt: string; diagnostics: AnimaDiagnostic[] } {
  return coreFormatAnimaFlat(input) as ReturnType<typeof formatAnimaFlatPrompt>;
}

/**
 * Parse NovelAI `w::…::` emphasis, drop weights (w<=0 drops the block), convert `artist:x` -> `@x`, snake_case -> spaces,
 * escape parentheses, `source#`/`mutual#` -> tag, drop `target#`, dedupe. Original: `Oge` @109510.
 */
export function parseAnimaPromptNodes(text: string, field: string, preserveBlankLineGroups = false): { prompt: string; diagnostics: AnimaDiagnostic[] } {
  return coreParseAnima(text, field, preserveBlankLineGroups) as { prompt: string; diagnostics: AnimaDiagnostic[] };
}

/** Replace `actorSlot` with `actorId`/`actorIndex` of the image actors (by position). Original: `cht` @113979. */
export function attachActorIdsToCharacterPrompts<T extends { characterPrompts: Array<Record<string, unknown>> }>(prompt: T, actors: readonly Pick<ImageActor, "actorId" | "actorIndex">[]): T {
  return coreAttachActorIds(prompt, actors) as T;
}

/** Resolve a ComfyUI workflow profile id (only the bundled id is supported; else throws COMFYUI_WORKFLOW_PROFILE_UNAVAILABLE). Original: `t7` @107757. */
export function resolveComfyWorkflowProfile(profileId: string): ComfyWorkflowProfile {
  return resolveComfyProfile(profileId) as ComfyWorkflowProfile;
}

/** True when the profile's `metadata.reference.mode` is "outfit-restyler". Original: `r2` @107585. */
export function isOutfitRestylerWorkflowProfile(profile: ComfyWorkflowProfile | null | undefined): boolean {
  return isOutfitRestylerProfile(profile) as boolean;
}

/** True when the provider uses the `anima-flat` codec (chan-server, comfy-ui). Original: `Nc` @20644. */
export function usesAnimaFlatCodec(provider: string): boolean {
  return isAnimaFlatProvider(provider) as boolean;
}
