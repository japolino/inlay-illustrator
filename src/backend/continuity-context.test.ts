import { describe, expect, test } from "bun:test";
import { buildContinuityContext } from "./continuity-context.js";
import type { PreviousVisualState } from "./types.js";

const previous: PreviousVisualState = {
  characters: [{
    name: "Mira Sol",
    label: "girl",
    age: "mature female",
    appearance: "short black hair",
    body: "",
    attire: "burgundy cardigan",
    attireInferred: false
  }],
  environment: {
    location: "academy library",
    timeWeather: "late afternoon",
    lightingMood: [],
    backgroundElements: ["bookshelves"]
  },
  place: "",
  updatedAt: "2026-08-14T00:00:00.000Z"
};

describe("continuity context read model", () => {
  test("preserves baseline and rolling narrative authorities as ordered compartments", () => {
    const result = buildContinuityContext(
      { "Mira Sol": "girl, mature female, short black hair, burgundy cardigan" },
      previous,
      { characterTagContextEnabled: true, previousVisualStateEnabled: true }
    );

    expect(result.authorities).toEqual(["character_baseline", "previous_narrative_state"]);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toContain("Previous Character Tags");
    expect(result.blocks[1]).toContain("Previous Visual State");
    expect(result.diagnostics).toEqual({ cacheCharacters: 1, previousVisualState: true });
  });

  test("does not merge or expose disabled continuity stores", () => {
    const result = buildContinuityContext(
      { "Mira Sol": "girl, mature female" },
      previous,
      { characterTagContextEnabled: false, previousVisualStateEnabled: false }
    );

    expect(result).toEqual({ blocks: [], diagnostics: {}, authorities: [] });
  });
});
