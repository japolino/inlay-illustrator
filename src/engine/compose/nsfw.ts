/**
 * NSFW prefix policy (spec/pipeline.md §3.5d).
 */
import { applyNsfwPrefixPolicy as coreApplyNsfw, prependNsfwTag as corePrependNsfw } from "../core/asset-maid-core";

/** Tags removed from the global/positive prompt when an image has 0 actors (literal list in `C7`). */
export const ZERO_ACTOR_RATING_TAGS: readonly string[] = Object.freeze([
  "nsfw",
  "sfw",
  "rating:general",
  "rating:sensitive",
  "rating:questionable",
  "rating:explicit",
  "rating:safe",
]);

/**
 * `actorCount === 0`: strip {@link ZERO_ACTOR_RATING_TAGS} from `positivePrompt` and `globalPositivePrompt`
 * (weighted groups handled by `hg`). Else, when `forceNsfwPrefix`: prepend `nsfw` (dropping existing ones).
 * Returns the same object when nothing changes. Original: `C7` @110998.
 */
export function applyNsfwPrefixPolicy<T extends { positivePrompt: string; globalPositivePrompt: string }>(
  prompt: T,
  forceNsfwPrefix: boolean,
  actorCount: number,
): T {
  return coreApplyNsfw(prompt, forceNsfwPrefix, actorCount) as T;
}

/** `"nsfw, " + tags without any existing nsfw` (top-level comma split respecting `::` groups). Original: `d7` @109306. */
export function prependNsfwTag(prompt: string): string {
  return corePrependNsfw(prompt) as string;
}
