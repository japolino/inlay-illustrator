/**
 * NovelAI config / character coordinates (spec/pipeline.md §3.5e, spec/novelai.md §6.2).
 */
import {
  applyAiChoiceCoordinates as coreApplyAiChoice,
  toNovelAICharacterCaptions as coreCaptions,
} from "../core/asset-maid-core";
import type { NovelAIConfigCharacter } from "./types";

/**
 * When `force` and `config.forceCharacterCoordinates !== true`: `useCoords:false` and every character
 * `coordinateMode:"automatic"`. Original: `Vye` @153363.
 */
export function applyAiChoiceCoordinates<T extends Record<string, unknown>>(config: T, force: boolean): T {
  return coreApplyAiChoice(config, force) as T;
}

/**
 * NovelAI `char_captions`: center `{0,0}` for automatic characters, `{0.5,0.5}` for a single character when not V5,
 * else centerX/centerY. Original: `Wye` @153372.
 */
export function toNovelAICharacterCaptions(
  characters: ReadonlyArray<Pick<NovelAIConfigCharacter, "prompt" | "uc" | "centerX" | "centerY" | "coordinateMode">>,
  key: "prompt" | "uc",
  v5 = false,
): Array<{ char_caption: string; centers: Array<{ x: number; y: number }> }> {
  return coreCaptions(characters, key, v5) as ReturnType<typeof toNovelAICharacterCaptions>;
}
