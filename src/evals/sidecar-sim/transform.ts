import { auditDynamicCameraDiversity, repairDynamicCameraDiversityLocally } from "../../backend/camera-diversity.js";
import { planAndCompilePrompts } from "../../backend/canonical-planning.js";
import { chooseCreativeConcepts } from "../../backend/creative.js";
import { parseParserJson } from "../../backend/parser.js";
import { renderPrompt } from "../../backend/prompt.js";
import { normalizeScenePayload, dedupeExactShotCharacters, recoverSceneParagraphs } from "../../backend/scenes.js";
import { resolveShotPerspective } from "../../backend/shot-resolution.js";
import { applyPreviousVisualState } from "../../backend/visual-state.js";
import type { CreativeConcept, ParsedPayload, PreparedParagraph } from "../../backend/types.js";
import { cleanString } from "../../backend/utils.js";
import type { SidecarResult, SidecarScenario, SidecarTransformDiagnostics } from "./types.js";

export type SidecarTransformOptions = {
  /** Disable only the deterministic local camera-collision repair for ablation. */
  localCameraRepair?: boolean;
};

export type SidecarTransform = {
  payload: ParsedPayload;
  rendered: SidecarResult["rendered"];
  diagnostics: SidecarTransformDiagnostics;
};

function parsesStrictJson(raw: string): boolean {
  try {
    JSON.parse(raw.trim());
    return true;
  } catch {
    return false;
  }
}

function hasTerminalState(payload: ParsedPayload): boolean {
  return Boolean(payload.terminalState
    && typeof payload.terminalState === "object"
    && !Array.isArray(payload.terminalState));
}

function missingPrimaryActionCount(payload: ParsedPayload, scenario: SidecarScenario): number {
  return normalizeScenePayload(payload).filter(({ shot }) => {
    if (resolveShotPerspective(shot, scenario.config).mode !== "dynamic") return false;
    const plan = shot.shotPlan && typeof shot.shotPlan === "object" && !Array.isArray(shot.shotPlan)
      ? shot.shotPlan
      : {};
    return !cleanString(plan.primaryAction);
  }).length;
}

/**
 * Local, deterministic half of the sidecar pipeline. Production and offline
 * replay share the same canonical selection, resolution, and compilation seam.
 * Remote repair/camera calls are deliberately outside this function.
 */
export function transformSidecarResponse(
  raw: string,
  scenario: SidecarScenario,
  paragraphs: PreparedParagraph[],
  concepts: CreativeConcept[] = [],
  options: SidecarTransformOptions = {}
): SidecarTransform {
  const fallback = paragraphs.length === 1 ? paragraphs[0].parserIndex : undefined;
  let payload = dedupeExactShotCharacters(recoverSceneParagraphs(parseParserJson(raw), fallback));
  payload = applyPreviousVisualState(payload, scenario.previousVisualState);
  const cameraBefore = auditDynamicCameraDiversity(payload, scenario.config);
  let localCameraRepairApplied = false;
  if (options.localCameraRepair !== false) {
    const localCameraRepair = repairDynamicCameraDiversityLocally(payload, scenario.config, cameraBefore);
    if (localCameraRepair && localCameraRepair !== payload) {
      payload = localCameraRepair;
      localCameraRepairApplied = true;
    }
  }
  const selectedConcepts = chooseCreativeConcepts(concepts, [], () => 0);
  const selected = planAndCompilePrompts(
    payload,
    scenario.previousVisualState,
    paragraphs,
    scenario.config,
    selectedConcepts,
    concepts
  ).selected;
  const rendered = selected.map((entry) => ({
    paragraph: entry.parserParagraph,
    perspective: entry.perspectiveMode,
    positive: renderPrompt(entry.prompt, scenario.config.promptSyntax),
    negative: entry.negative
  }));
  return {
    payload,
    rendered,
    diagnostics: {
      strictJson: parsesStrictJson(raw),
      terminalStatePresent: hasTerminalState(payload),
      missingPrimaryActionCount: missingPrimaryActionCount(payload, scenario),
      cameraCollisionsBefore: cameraBefore.exactCollisions.length,
      cameraCollisionsAfter: auditDynamicCameraDiversity(payload, scenario.config).exactCollisions.length,
      localCameraRepairApplied,
      renderedPromptCount: rendered.length
    }
  };
}
