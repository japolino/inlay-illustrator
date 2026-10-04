/**
 * NovelAI emphasis weight math and the non-artist prompt weight (작가 외 가중치), spec/novelai.md §6.2.
 */
import {
  applyNovelAIPromptWeight as coreApplyWeight,
  applyNonArtistWeightToPrompt as coreApplyToPrompt,
  applyNonArtistWeightToRequest as coreApplyToRequest,
  Aa as coreNormalizeWeight,
  Mu as coreNormalizeWeightSyntax,
} from "../core/asset-maid-core";
import type { NonArtistPromptSource, NonArtistPromptWeight, NonArtistWeightConfig, PromptSegments, WeightablePrompt } from "./types";

/**
 * Multiply every emphasis block of a NovelAI prompt by `multiplier`, writing `w::text ::` (4-decimal weights);
 * `{}` = ×1.05, `[]` = ÷1.05; escaped chars are kept; multiplier 1 or a blank prompt returns the input.
 * Original: `s2` @108640.
 */
export function applyNovelAIPromptWeight(prompt: string, multiplier: number): string {
  return coreApplyWeight(prompt, multiplier) as string;
}

/**
 * Apply the non-artist weight to a prompt triple: every tag outside the artist span (tracked source, given
 * segments, or the unique artist substring) and outside a leading `nsfw` is rescaled. Throws
 * "작가 외 가중치 적용을 위한 작가 프롬프트 구간을 확인하지 못했습니다." when the artist span cannot be found.
 * Original: `Put` @108722 (span lookup `fge` @108687).
 */
export function applyNonArtistWeightToPrompt(
  prompt: WeightablePrompt,
  config: NonArtistWeightConfig,
  segments?: PromptSegments,
): { prompt: WeightablePrompt; source?: NonArtistPromptSource } {
  return coreApplyToPrompt(prompt, config, segments) as { prompt: WeightablePrompt; source?: NonArtistPromptSource };
}

/** NovelAI request body subset read/written by {@link applyNonArtistWeightToRequest}. */
export interface NovelAIRequestBody {
  input: string;
  parameters: {
    negative_prompt: string;
    v4_prompt?: { caption: { base_caption: string; char_captions: Array<{ char_caption: string; centers: Array<{ x: number; y: number }> }> }; [key: string]: unknown };
    v4_negative_prompt?: { caption: { base_caption: string; char_captions: Array<{ char_caption: string; centers: Array<{ x: number; y: number }> }> }; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Apply the non-artist weight to a NovelAI request body (input, negative_prompt, v4 captions) and report
 * `finalizedPrompt.weight.status` ("unconfigured" | "disabled" | "identity" | "applied"). Original: `Cut` @108742.
 */
export function applyNonArtistWeightToRequest(
  body: NovelAIRequestBody,
  config: NonArtistWeightConfig,
): {
  body: NovelAIRequestBody;
  finalizedPrompt: WeightablePrompt & {
    source?: NonArtistPromptSource;
    weight: { status: "unconfigured" | "disabled" | "identity" | "applied"; multiplier?: number; artistId?: string };
  };
} {
  return coreApplyToRequest(body, config) as ReturnType<typeof applyNonArtistWeightToRequest>;
}

/** Normalize `{enabled, multiplier}` (multiplier clamped 0.5..1, step 0.05, default 0.7). Original: `Aa` @24565. */
export function normalizeNonArtistPromptWeight(value: unknown): NonArtistPromptWeight | undefined {
  return coreNormalizeWeight(value) as NonArtistPromptWeight | undefined;
}

/** Weight-syntax normaliser (adds a space before a closing `::`). Original: `Mu` @7452. */
export function normalizeNovelAIWeightSyntax(prompt: string): string {
  return coreNormalizeWeightSyntax(prompt) as string;
}
