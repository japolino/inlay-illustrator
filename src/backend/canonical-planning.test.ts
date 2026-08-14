import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, type Config, type PerspectiveMode } from "../shared/config.js";
import { planAndCompilePrompts } from "./canonical-planning.js";
import { renderPrompt } from "./prompt.js";
import { selectPromptEntries } from "./scenes.js";
import type { CreativeConcept, ParsedPayload, PreparedParagraph } from "./types.js";

const paragraphs: PreparedParagraph[] = [{ parserIndex: 1, originalIndex: 3, text: "A courier raises an umbrella." }];
const payload: ParsedPayload = {
  scenes: [{
    environment: { location: "rainy platform", timeWeather: "night", lightingMood: [], backgroundElements: [] },
    shots: [{
      paragraph: 1,
      perspectiveMode: "creative",
      camera: { framing: "medium shot", angle: "eye level", perspective: "straight-on", focus: [] },
      shotPlan: { primaryAction: "courier raises an umbrella", secondaryCue: "", staging: "courier at center" },
      situation: "1girl, solo, red umbrella",
      characters: [{
        name: "Mira",
        label: "girl",
        age: "",
        appearance: "black hair",
        body: "slim",
        attire: "yellow raincoat",
        attireInferred: false,
        expression: "focused",
        composition: { position: "center", pose: "standing", actions: ["raising an umbrella"], gaze: "upward" },
        renderScope: "upper body",
        visibleTags: "black hair, yellow raincoat"
      }],
      sharedComposition: { interaction: [], spatialRelation: "" },
      negative: ""
    }]
  }],
  terminalState: {
    paragraph: 1,
    environment: { location: "rainy platform", timeWeather: "night", lightingMood: [], backgroundElements: [] },
    characters: [{
      name: "Mira",
      label: "girl",
      age: "",
      appearance: "black hair",
      body: "slim",
      attire: "yellow raincoat",
      attireInferred: false
    }]
  }
};
const concept: CreativeConcept = {
  id: "umbrella",
  paragraph: 1,
  subjectType: "object",
  anchor: "red umbrella",
  concept: "rain beading on a red umbrella",
  renderScope: "red umbrella and one hand",
  camera: "close-up, from below",
  visibleCues: ["red umbrella", "rain droplets"],
  score: 90
};

function assertParity(config: Config, concepts = new Map<number, CreativeConcept>()): void {
  const legacy = selectPromptEntries(payload, paragraphs, config, concepts, [...concepts.values()]);
  const canonical = planAndCompilePrompts(payload, undefined, paragraphs, config, concepts, [...concepts.values()]);
  expect(canonical.selected).toHaveLength(legacy.length);
  expect(canonical.selected[0]?.paragraph).toBe(3);
  expect(canonical.selected[0]?.parserParagraph).toBe(1);
  expect(canonical.selected[0]?.perspectiveMode).toBe(legacy[0]?.perspectiveMode);
  expect(renderPrompt(canonical.selected[0]?.prompt || { sections: [] }, config.promptSyntax))
    .toBe(renderPrompt(legacy[0]?.prompt || { sections: [] }, config.promptSyntax));
  expect(canonical.selected[0]?.negative).toBe(legacy[0]?.negative);
}

describe("canonical prompt selection", () => {
  const manualModes: PerspectiveMode[] = ["dynamic", "static", "asset"];
  for (const perspectiveMode of manualModes) {
    test(`preserves legacy ${perspectiveMode} selection and compilation`, () => {
      assertParity({ ...DEFAULT_CONFIG, adaptiveMode: false, perspectiveMode, maxImages: 1 });
    });
  }

  test("preserves bound manual Creative compilation", () => {
    assertParity(
      { ...DEFAULT_CONFIG, adaptiveMode: false, perspectiveMode: "creative", maxImages: 1 },
      new Map([[1, concept]])
    );
  });

  test("preserves the Adaptive Creative downgrade", () => {
    assertParity({ ...DEFAULT_CONFIG, adaptiveMode: true, fastMode: false, maxImages: 1 });
  });

  test("preserves unbound Creative selection in Adaptive Fast Mode", () => {
    assertParity({ ...DEFAULT_CONFIG, adaptiveMode: true, fastMode: true, maxImages: 1 });
  });
});
