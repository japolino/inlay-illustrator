import { parseCreativeConcepts } from "../../backend/creative.js";
import { prepareParagraphs } from "../../backend/paragraphs.js";
import type { Config } from "../../shared/config.js";
import type { ParsedPayload, PreviousVisualState } from "../../backend/types.js";
import { transformSidecarResponse, type SidecarTransform, type SidecarTransformOptions } from "./transform.js";
import type { SidecarResult, SidecarScenario } from "./types.js";

export type SidecarReplayContext = {
  config: Config;
  paragraphs: string[];
  previousVisualState?: PreviousVisualState;
};

export type SavedSidecarArtifact = {
  round?: number;
  scenario: string;
  model: string;
  raw: string;
  payload?: ParsedPayload;
  rendered?: SidecarResult["rendered"];
  ideation?: { raw?: string };
  replayContext?: SidecarReplayContext;
};

export type SidecarReplayResult = {
  scenario: string;
  model: string;
  payloadEqual: boolean;
  renderedEqual: boolean;
  expectedRendered: SidecarResult["rendered"];
  current: SidecarTransform;
};

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

export function replaySidecarArtifact(
  artifact: SavedSidecarArtifact,
  registeredScenario: SidecarScenario,
  options: SidecarTransformOptions = {}
): SidecarReplayResult {
  const replayScenario: SidecarScenario = artifact.replayContext
    ? {
      ...registeredScenario,
      config: artifact.replayContext.config,
      paragraphs: artifact.replayContext.paragraphs,
      previousVisualState: artifact.replayContext.previousVisualState
    }
    : registeredScenario;
  const paragraphs = prepareParagraphs(replayScenario.paragraphs.join("\n\n"), replayScenario.config);
  const concepts = artifact.ideation?.raw
    ? parseCreativeConcepts(artifact.ideation.raw, paragraphs, replayScenario.config)
    : [];
  const current = transformSidecarResponse(artifact.raw, replayScenario, paragraphs, concepts, options);
  const expectedRendered = artifact.rendered || [];
  return {
    scenario: artifact.scenario,
    model: artifact.model,
    payloadEqual: artifact.payload === undefined || serialized(current.payload) === serialized(artifact.payload),
    renderedEqual: serialized(current.rendered) === serialized(expectedRendered),
    expectedRendered,
    current
  };
}
