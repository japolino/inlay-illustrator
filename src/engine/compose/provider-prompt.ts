/**
 * Provider prompt codecs (spec/novelai.md §6, spec/pipeline.md §3.5c). Facade over the verbatim 0.9.90 core.
 * Original names are 0.9.90 p120 names and lines.
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
  BUNDLED_ANIMA_WORKFLOW_PROFILE as bundledComfyProfile,
  resolveComfyWorkflowProfile as resolveComfyProfile,
  j4 as isOutfitRestylerProfile,
  Vi as isAnimaFlatProvider,
} from "../core/asset-maid-core";
import type { AnimaDiagnostic, ComfyWorkflowProfile, ImageActor, ProviderPrompt, ProviderPromptInput } from "./types";

/** "masterpiece, best quality, score_7, safe" (`$8` @4811). */
export const ANIMA_DEFAULT_POSITIVE_PREFIX: string = coreAnimaPos;
/** "worst quality, low quality, score_1, ... chromatic aberration" (`B8` @4812). */
export const ANIMA_DEFAULT_NEGATIVE_PREFIX: string = coreAnimaNeg;
/** Provider capability table (`F0` @4653): `novelai` and `comfy-ui` only (Chan Server removed in 0.9.90). */
export const IMAGE_PROVIDER_TABLE = coreProviderTable as unknown as Readonly<
  Record<string, { label: string; capabilities: { promptCodecId: "novelai-structured" | "anima-flat"; referenceUiMode: string; outfitImageGeneration: string } }>
>;
/** Bundled Anima (ComfyUI) workflow profile (`P4` @154823). */
export const BUNDLED_COMFY_WORKFLOW_PROFILE = bundledComfyProfile as ComfyWorkflowProfile;

/** Formatter table (`wgt` @156432): novelai -> `ygt`; comfy-ui -> Anima with the workflow profile. */
export const PROVIDER_PROMPT_FORMATTERS = coreFormatters as Readonly<Record<string, (input: ProviderPromptInput) => ProviderPrompt>>;

/**
 * Format the provider prompt for one image. Throws for a V5 plan with a non-NovelAI provider and for comfy-ui
 * without a workflow profile ("Anima Base UI 워크플로 프로필이 필요합니다."). Original: `UG` @156440.
 */
export function formatProviderPrompt(input: ProviderPromptInput): ProviderPrompt {
  return coreFormatProviderPrompt(input) as ProviderPrompt;
}

/** NovelAI structured prompt (`requestFormat "novelai"` or `"novelai-v5-hybrid"`). Original: `ygt` @156364. */
export function formatNovelAIProviderPrompt(input: ProviderPromptInput): ProviderPrompt {
  return coreFormatNovelAI(input) as ProviderPrompt;
}

/** Anima flat prompt for comfy-ui. Original: `xgt` @156409. */
export function formatAnimaProviderPrompt(input: ProviderPromptInput, provider: "comfy-ui", profileId: string, profileRevision: number): ProviderPrompt {
  return coreFormatAnima(input, provider, profileId, profileRevision) as ProviderPrompt;
}

/** Anima global/character composition (blank-line groups, restyler prefix). Original: `vgt` @156335. */
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
 * (`undefined` prefix = default `$8`/`B8`, "" = none). Original: `MG` @155060.
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
 * escape parentheses, `source#`/`mutual#` -> tag, drop `target#`, dedupe. Original: `fxe` @155045.
 */
export function parseAnimaPromptNodes(text: string, field: string, preserveBlankLineGroups = false): { prompt: string; diagnostics: AnimaDiagnostic[] } {
  return coreParseAnima(text, field, preserveBlankLineGroups) as { prompt: string; diagnostics: AnimaDiagnostic[] };
}

/** Replace `actorSlot` with `actorId`/`actorIndex` of the image actors (by position). Original: `bht` @158108. */
export function attachActorIdsToCharacterPrompts<T extends { characterPrompts: Array<Record<string, unknown>> }>(prompt: T, actors: readonly Pick<ImageActor, "actorId" | "actorIndex">[]): T {
  return coreAttachActorIds(prompt, actors) as T;
}

/** Resolve a ComfyUI workflow profile id (only the bundled id; else throws COMFYUI_WORKFLOW_PROFILE_UNAVAILABLE). Original: `CG` @154832 (= `emt`). */
export function resolveComfyWorkflowProfile(profileId: string): ComfyWorkflowProfile {
  return resolveComfyProfile(profileId) as ComfyWorkflowProfile;
}

/** True when the profile's `metadata.reference.mode` is "outfit-restyler". Original: `j4` @154660. */
export function isOutfitRestylerWorkflowProfile(profile: ComfyWorkflowProfile | null | undefined): boolean {
  return isOutfitRestylerProfile(profile) as boolean;
}

/** True when the provider uses the `anima-flat` codec (only comfy-ui in 0.9.90). Original: `Vi` @4734. */
export function usesAnimaFlatCodec(provider: string): boolean {
  return isAnimaFlatProvider(provider) as boolean;
}
