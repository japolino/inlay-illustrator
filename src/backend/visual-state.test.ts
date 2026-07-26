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

  test("treats a changed explicit location as a complete scene boundary without change markers", () => {
    const applied = applyPreviousVisualState({ scenes: [{
      environment: {
        location: "residential road",
        timeWeather: "evening",
        lightingMood: ["amber streetlamp light"],
        backgroundElements: ["parked cars", "wet pavement"]
      },
      shots: [{ paragraph: 1, characters: [{ name: "Jay" }] }]
    }, {
      environment: {
        location: "apartment living room",
        timeWeather: "evening",
        lightingMood: ["soft ceiling light"],
        backgroundElements: ["fabric sofa", "coffee table"]
      },
      environmentChanges: [],
      shots: [{ paragraph: 2, characters: [{ name: "Jay" }] }]
    }] }, previous);

    expect(applied.scenes?.[1]?.environment).toEqual({
      location: "apartment living room",
      timeWeather: "evening",
      lightingMood: ["soft ceiling light"],
      backgroundElements: ["fabric sofa", "coffee table"]
    });
  });

  test("persists terminal narrative state even when only an earlier road paragraph generated an image", () => {
    const applied = applyPreviousVisualState({
      scenes: [{
        environment: {
          location: "residential road",
          timeWeather: "evening",
          lightingMood: ["amber streetlamp light"],
          backgroundElements: ["parked cars", "wet pavement"]
        },
        environmentChanges: ["location", "timeWeather", "lightingMood", "backgroundElements"],
        shots: [{
          paragraph: 1,
          characters: [{
            name: "Jay",
            label: "boy",
            age: "adult man",
            appearance: "",
            body: "",
            attire: "",
            visualChanges: []
          }]
        }]
      }],
      terminalState: {
        paragraph: 2,
        environment: {
          location: "apartment living room",
          timeWeather: "evening",
          lightingMood: ["soft ceiling light"],
          backgroundElements: ["fabric sofa", "coffee table"]
        },
        environmentChanges: ["location", "lightingMood", "backgroundElements"],
        characters: [{
          name: "Jay",
          label: "boy",
          age: "",
          appearance: "",
          body: "",
          attire: "white shirt, black trousers",
          visualChanges: []
        }]
      }
    }, previous);
    const state = buildPreviousVisualState(applied, [1]);

    expect(applied.scenes?.[0]?.environment?.location).toBe("residential road");
    expect(state?.environment).toEqual({
      location: "apartment living room",
      timeWeather: "evening",
      lightingMood: ["soft ceiling light"],
      backgroundElements: ["fabric sofa", "coffee table"]
    });
    expect(state?.characters[0]).toMatchObject({
      name: "Jay",
      appearance: "straight black hair, dark brown eyes, pale skin",
      attire: "white shirt, black trousers"
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
