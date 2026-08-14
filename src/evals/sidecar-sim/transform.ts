import { auditDynamicCameraDiversity, repairDynamicCameraDiversityLocally } from "../../backend/camera-diversity.js";
import { planAndCompilePrompts } from "../../backend/canonical-planning.js";
import { chooseCreativeConcepts } from "../../backend/creative.js";
import { parseParserJson } from "../../backend/parser.js";
import { renderPrompt } from "../../backend/prompt.js";
import { dedupeExactShotCharacters, recoverSceneParagraphs } from "../../backend/scenes.js";
import { applyPreviousVisualState } from "../../backend/visual-state.js";
import type { CreativeConcept, ParsedPayload, PreparedParagraph } from "../../backend/types.js";
import type { SidecarResult, SidecarScenario } from "./types.js";

export type SidecarTransform = {
  payload: ParsedPayload;
  rendered: SidecarResult["rendered"];
};

/**
 * Local, deterministic half of the sidecar pipeline. Production and offline
 * replay share the same canonical selection, resolution, and compilation seam.
 * Remote repair/camera calls are deliberately outside this function.
 */
export function transformSidecarResponse(
  raw: string,
  scenario: SidecarScenario,
  paragraphs: PreparedParagraph[],
  concepts: CreativeConcept[] = []
): SidecarTransform {
  const fallback = paragraphs.length === 1 ? paragraphs[0].parserIndex : undefined;
  let payload = dedupeExactShotCharacters(recoverSceneParagraphs(parseParserJson(raw), fallback));
  payload = applyPreviousVisualState(payload, scenario.previousVisualState);
  const localCameraRepair = repairDynamicCameraDiversityLocally(
    payload,
    scenario.config,
    auditDynamicCameraDiversity(payload, scenario.config)
  );
  if (localCameraRepair) payload = localCameraRepair;
  const selectedConcepts = chooseCreativeConcepts(concepts, [], () => 0);
  const selected = planAndCompilePrompts(
    payload,
    scenario.previousVisualState,
    paragraphs,
    scenario.config,
    selectedConcepts,
    concepts
  ).selected;
  return {
    payload,
    rendered: selected.map((entry) => ({
      paragraph: entry.parserParagraph,
      perspective: entry.perspectiveMode,
      positive: renderPrompt(entry.prompt, scenario.config.promptSyntax),
      negative: entry.negative
    }))
  };
}
