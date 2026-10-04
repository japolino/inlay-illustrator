/**
 * NovelAI config / character coordinates (spec/pipeline.md §3.5e, spec/novelai.md §6.2).
 */
import {
  createV45NovelAIConfig as coreCreateConfig,
  applyAiChoiceCoordinates as coreApplyAiChoice,
  toNovelAICharacterCaptions as coreCaptions,
} from "../core/asset-maid-core";
import type { ImageActor, NovelAIConfigCharacter, NovelAIRunConfig, PromptPlan } from "./types";

/**
 * Per-image NovelAI config: `{...config, analysisProfile:"v4-5", seed, width, height, negativePrompt, characterPrompts}`;
 * characters with an empty prompt AND uc are dropped; `centerX = (i+1)/(n+1)` (0.5 when n<=1), `centerY = 0.5`;
 * then `applyAiChoiceCoordinates(cfg, forceAiChoiceCoordinates)`. Original: `Mht` @114829.
 */
export function createV45NovelAIConfig(
  config: NovelAIRunConfig,
  plan: Pick<PromptPlan, "width" | "height" | "negativePrompt">,
  actors: readonly Pick<ImageActor, "actorId" | "actorIndex" | "prompt" | "negativePrompt">[],
  seed: string,
  forceAiChoiceCoordinates: boolean,
): NovelAIRunConfig {
  return coreCreateConfig(config, plan, actors, seed, forceAiChoiceCoordinates) as NovelAIRunConfig;
}

/**
 * When `force` and `config.forceCharacterCoordinates !== true`: `useCoords:false` and every character
 * `coordinateMode:"automatic"`. Original: `c7` @108846.
 */
export function applyAiChoiceCoordinates<T extends Record<string, unknown>>(config: T, force: boolean): T {
  return coreApplyAiChoice(config, force) as T;
}

/**
 * NovelAI `char_captions`: center `{0,0}` for automatic characters, `{0.5,0.5}` for a single character when not V5,
 * else centerX/centerY. Original: `hge` @108855.
 */
export function toNovelAICharacterCaptions(
  characters: ReadonlyArray<Pick<NovelAIConfigCharacter, "prompt" | "uc" | "centerX" | "centerY" | "coordinateMode">>,
  key: "prompt" | "uc",
  v5 = false,
): Array<{ char_caption: string; centers: Array<{ x: number; y: number }> }> {
  return coreCaptions(characters, key, v5) as ReturnType<typeof toNovelAICharacterCaptions>;
}
