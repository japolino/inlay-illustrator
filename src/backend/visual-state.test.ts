import { describe, expect, test } from "bun:test";
import type { PreviousVisualState } from "./types.js";
import { applyPreviousVisualState, buildPreviousVisualState, formatPreviousVisualState } from "./visual-state.js";

const previous: PreviousVisualState = {
  characters: [{
    name: "Jay",
    label: "boy",
    age: "",
    appearance: "straight black hair, dark brown eyes, pale skin",
    body: "slim, average height",
    attire: "black school uniform, white shirt",
    attireInferred: true
  }],
  environment: {
    location: "school clubroom",
    timeWeather: "late afternoon",
    lightingMood: ["warm sunlight through windows"],
    backgroundElements: ["desks", "chairs", "bookshelves"]
  },
  place: "",
  updatedAt: "2026-07-18T00:00:00.000Z"
};

describe("previous visual state", () => {
  test("removes placeholders and fills only missing character and environment fields", () => {
    const applied = applyPreviousVisualState({ scenes: [{
      environment: {
        location: "unspecified location",
        timeWeather: "unspecified time",
        lightingMood: ["unknown lighting"],
        backgroundElements: ["open book"]
      },
      shots: [{
        paragraph: 1,
        camera: { framing: "medium shot" },
        characters: [{
          name: "Jay",
          label: "boy",
          appearance: "unknown appearance",
          body: "",
          attire: "unspecified clothing",
          expression: "surprised"
        }]
      }]
    }] }, previous);
    const scene = applied.scenes?.[0];
    const character = scene?.shots?.[0]?.characters?.[0];

    expect(character).toMatchObject({
      appearance: "straight black hair, dark brown eyes, pale skin",
      body: "slim, average height",
      attire: "black school uniform, white shirt",
      attireInferred: true,
      expression: "surprised"
    });
    expect(scene?.environment).toEqual({
      location: "school clubroom",
      timeWeather: "late afternoon",
      lightingMood: ["warm sunlight through windows"],
      backgroundElements: ["desks", "chairs", "bookshelves"]
    });
  });

  test("keeps explicit current character and environment changes authoritative", () => {
    const applied = applyPreviousVisualState({ scenes: [{
      environment: {
        location: "rainy street",
        timeWeather: "night",
        lightingMood: ["blue neon light"],
        backgroundElements: ["shop signs"]
      },
      environmentChanges: ["location", "timeWeather", "lightingMood", "backgroundElements"],
      shots: [{
        paragraph: 2,
        characters: [{
          name: "Jay",
          appearance: "short black hair, dark brown eyes",
          body: "slim",
          attire: "yellow raincoat",
          attireInferred: false,
          visualChanges: ["appearance", "body", "attire"]
        }]
      }]
    }] }, previous);

    expect(applied.scenes?.[0]?.environment).toMatchObject({ location: "rainy street", timeWeather: "night" });
    expect(applied.scenes?.[0]?.shots?.[0]?.characters?.[0]).toMatchObject({
      appearance: "short black hair, dark brown eyes",
      attire: "yellow raincoat",
      attireInferred: false
    });
  });

  test("builds the next snapshot from successful paragraph selections without transient shot fields", () => {
    const payload = applyPreviousVisualState({ scenes: [{
      environment: {
        location: "school clubroom",
        timeWeather: "late afternoon",
        lightingMood: ["warm sunlight"],
        backgroundElements: ["desks"]
      },
      shots: [{
        paragraph: 1,
        camera: { framing: "close-up" },
        characters: [{ name: "Jay", appearance: "black hair", attire: "school uniform", expression: "smile" }]
      }, {
        paragraph: 2,
        camera: { framing: "wide shot" },
        characters: [{ name: "Jay", appearance: "black hair", attire: "school uniform", expression: "surprised" }]
      }]
    }] });
    const state = buildPreviousVisualState(payload, [2]);
    const formatted = formatPreviousVisualState(state!);

    expect(state?.characters[0]).toMatchObject({ name: "Jay", appearance: "black hair", attire: "school uniform" });
    expect(formatted).toContain("school clubroom");
    expect(formatted).not.toContain("close-up");
    expect(formatted).not.toContain("wide shot");
    expect(formatted).not.toContain("surprised");
  });
});
