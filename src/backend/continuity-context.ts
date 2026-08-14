import type { Config } from "../shared/config.js";
import { buildCharacterTagReference } from "./prompt.js";
import type { PreviousVisualState } from "./types.js";
import { formatPreviousVisualState } from "./visual-state.js";

export type ContinuityContextReadModel = {
  blocks: string[];
  diagnostics: Record<string, unknown>;
  authorities: Array<"character_baseline" | "previous_narrative_state">;
};

/**
 * One read-only continuity view for parser context construction. Persistence
 * remains compartmentalized: exact/manual character baselines and rolling
 * narrative state retain their different authorities and write policies.
 */
export function buildContinuityContext(
  characterCache: Record<string, string>,
  previousVisualState: PreviousVisualState | undefined,
  config: Pick<Config, "characterTagContextEnabled" | "previousVisualStateEnabled">
): ContinuityContextReadModel {
  const blocks: string[] = [];
  const diagnostics: Record<string, unknown> = {};
  const authorities: ContinuityContextReadModel["authorities"] = [];

  if (config.characterTagContextEnabled) {
    const reference = buildCharacterTagReference(characterCache);
    if (reference) {
      blocks.push(`${reference}\nUse these as a baseline for returning characters (including their base attire). The current message always wins over this reference.`);
      authorities.push("character_baseline");
    }
    diagnostics.cacheCharacters = Object.keys(characterCache).length;
  }

  if (config.previousVisualStateEnabled && previousVisualState) {
    const reference = formatPreviousVisualState(previousVisualState);
    if (reference) {
      blocks.push(reference);
      authorities.push("previous_narrative_state");
      diagnostics.previousVisualState = true;
    }
  }

  return { blocks, diagnostics, authorities };
}
