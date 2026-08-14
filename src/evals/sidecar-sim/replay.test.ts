import { describe, expect, test } from "bun:test";
import { prepareParagraphs } from "../../backend/paragraphs.js";
import type { ParsedPayload } from "../../backend/types.js";
import { replaySidecarArtifact, type SavedSidecarArtifact } from "./replay.js";
import { sidecarScenarios } from "./scenarios.js";
import { transformSidecarResponse } from "./transform.js";

const scenario = sidecarScenarios.find((candidate) => candidate.id === "static_visual_novel")!;
const payload: ParsedPayload = {
  scenes: [{
    environment: {
      location: "academy library",
      timeWeather: "late afternoon",
      lightingMood: [],
      backgroundElements: ["bookshelves", "closed book"]
    },
    shots: [{
      paragraph: 1,
      perspectiveMode: "static",
      camera: { framing: "medium shot", angle: "eye level", perspective: "straight-on", focus: ["deep focus"] },
      situation: "1girl, solo",
      characters: [{
        name: "Mira Sol",
        label: "girl",
        age: "mature female",
        appearance: "",
        body: "",
        attire: "burgundy cardigan, white blouse, charcoal skirt",
        attireInferred: false,
        expression: "guarded expression",
        composition: {
          position: "slightly forward from the background",
          pose: "standing upright with one hand resting on a closed book",
          actions: [],
          gaze: "toward viewer"
        }
      }],
      sharedComposition: { interaction: [], spatialRelation: "" },
      negative: ""
    }]
  }],
  terminalState: {
    paragraph: 1,
    environment: {
      location: "academy library",
      timeWeather: "late afternoon",
      lightingMood: [],
      backgroundElements: ["bookshelves", "closed book"]
    },
    characters: [{
      name: "Mira Sol",
      label: "girl",
      age: "mature female",
      appearance: "",
      body: "",
      attire: "burgundy cardigan, white blouse, charcoal skirt",
      attireInferred: false
    }]
  }
};

describe("sidecar artifact replay", () => {
  test("replays a frozen raw response through the shared canonical transform", () => {
    const raw = JSON.stringify(payload);
    const paragraphs = prepareParagraphs(scenario.paragraphs.join("\n\n"), scenario.config);
    const baseline = transformSidecarResponse(raw, scenario, paragraphs);
    const artifact: SavedSidecarArtifact = {
      scenario: scenario.id,
      model: "fixture-model",
      raw,
      payload: baseline.payload,
      rendered: baseline.rendered,
      replayContext: {
        config: scenario.config,
        paragraphs: scenario.paragraphs,
        previousVisualState: scenario.previousVisualState
      }
    };

    const replay = replaySidecarArtifact(artifact, scenario);
    expect(replay.payloadEqual).toBe(true);
    expect(replay.renderedEqual).toBe(true);
  });

  test("reports rendered prompt drift without making a model request", () => {
    const raw = JSON.stringify(payload);
    const paragraphs = prepareParagraphs(scenario.paragraphs.join("\n\n"), scenario.config);
    const baseline = transformSidecarResponse(raw, scenario, paragraphs);
    const artifact: SavedSidecarArtifact = {
      scenario: scenario.id,
      model: "fixture-model",
      raw,
      payload: baseline.payload,
      rendered: baseline.rendered.map((entry) => ({ ...entry, positive: `${entry.positive}, changed` }))
    };

    const replay = replaySidecarArtifact(artifact, scenario);
    expect(replay.payloadEqual).toBe(true);
    expect(replay.renderedEqual).toBe(false);
  });
});
