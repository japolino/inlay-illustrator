/**
 * Rating tag policy (AM 0.9.90; replaces the 0.9.89 NSFW prefix `C7` / `d7`).
 * "Always NSFW" is now a fixed rating: `resolveFixedRating(settings)` returns `fixedRating` ("sfw" | "nsfw") when
 * `nsfwAlwaysEnabled`, else `false`. The batch executor passes it as `forceRating` (image requests carry it to the
 * NovelAI adapter, which prepends it with `prependRatingTag` and strips rating tags from the character prompts).
 */
import {
  applyRatingPolicy as coreApplyRatingPolicy,
  prependRatingTag as corePrependRatingTag,
  RATING_TAGS as CORE_RATING_TAGS,
  resolveFixedRating as coreResolveFixedRating,
  O8 as coreNormalizeRating,
  hh as coreStripTags,
} from "../core/asset-maid-core";
import type { RatingTag } from "./types";

/** Every rating tag AM recognizes (`vC` @4535): sfw, nsfw, rating:general/sensitive/questionable/explicit/safe. */
export const RATING_TAGS: readonly string[] = CORE_RATING_TAGS as readonly string[];

/** `"sfw"` stays `"sfw"`, anything else becomes `"nsfw"`. Original: `O8` @4529. */
export function normalizeRatingTag(value: unknown): RatingTag {
  return coreNormalizeRating(value) as RatingTag;
}

/** `settings.nsfwAlwaysEnabled ? settings.fixedRating : false`. Original: `yS` @4532. */
export function resolveFixedRating(settings: { nsfwAlwaysEnabled?: boolean; fixedRating?: RatingTag }): RatingTag | false {
  return coreResolveFixedRating(settings) as RatingTag | false;
}

/** Strip every rating tag from `prompt` and prepend `rating`. Original: `OG` @154841. */
export function prependRatingTag(prompt: string, rating: RatingTag): string {
  return corePrependRatingTag(prompt, rating) as string;
}

/** Remove the given tags from a NovelAI prompt (weighted groups respected). Original: `hh`. */
export function stripPromptTags(prompt: string, tags: readonly string[] = RATING_TAGS): string {
  return coreStripTags(prompt, tags) as string;
}

/**
 * Provider prompt rating policy of the batch executor: 0 actors -> strip rating tags from `positivePrompt` and
 * `globalPositivePrompt`; else when `rating` is set -> prepend it to both and strip rating tags from every character
 * prompt. Original: `XG` @156445 (was `C7(prompt, forceNsfwPrefix, actorCount)`).
 */
export function applyRatingPolicy<T extends { positivePrompt: string; globalPositivePrompt: string; characterPrompts: ReadonlyArray<{ prompt: string }> }>(
  prompt: T,
  rating: RatingTag | false,
  actorCount: number,
): T {
  return coreApplyRatingPolicy(prompt, rating, actorCount) as T;
}
