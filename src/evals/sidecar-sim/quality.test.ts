import { describe, expect, test } from "bun:test";
import type { ParsedPayload } from "../../backend/types.js";
import { evaluateQuality, isCensoredEmptyResponse } from "./quality.js";
import { sidecarScenarios } from "./scenarios.js";

const scenario = sidecarScenarios.find((candidate) => candidate.id === "rhea_platform_conflict")!;

function validPayload(): ParsedPayload {
  const character = (name: string, appearance: string, body: string, attire: string, expression: string, actions: string[], gaze: string) => ({
    name,
    label: name === "Rhea Calder" ? "woman" : "man",
    age: name === "Rhea Calder" ? "adult woman" : "adult man",
    identity: "",
    appearance,
    body,
    attire,
    attireInferred: false,
    visualChanges: [],
    expression,
    renderScope: "",
    visibleTags: "",
    composition: { position: name === "Rhea Calder" ? "left side of frame" : "right side of frame", pose: "standing with weight shifted backward", actions, gaze }
  });
  return {
    scenes: [{
      environment: {
        location: "exterior train platform",
        timeWeather: "rainy evening",
        lightingMood: ["cold overcast light"],
        backgroundElements: ["departing train", "wet platform"]
      },
      environmentChanges: ["location", "timeWeather", "lightingMood", "backgroundElements"],
      shots: [{
        paragraph: 1,
        perspectiveMode: "dynamic",
        camera: { framing: "medium shot", angle: "eye level", perspective: "three-quarter view", focus: ["shallow depth of field"] },
        situation: "2people, tense confrontation",
        characters: [
          character("Rhea Calder", "tan skin, long white braid, golden eyes, scar through left eyebrow", "tall", "navy officer coat, white shirt, red sash, black trousers, knee-high black boots", "angry, glaring", ["pointing toward departing train"], "looking at right man"),
          character("Evan Dorne", "messy short black hair, green eyes, freckles", "lean build", "gray hooded jacket, dark jeans, white sneakers", "startled", ["recoiling"], "looking at left woman")
        ],
        sharedComposition: { interaction: ["left woman gripping right man's sleeve"], spatialRelation: "left woman facing right man" },
        negative: ""
      }]
    }]
  };
}

describe("sidecar simulation quality rubric", () => {
  test("classifies only an empty Gemini response as censorship", () => {
    expect(isCensoredEmptyResponse("Gemini/gcli-gemini-3.1-pro-preview", "")).toBe(true);
    expect(isCensoredEmptyResponse("Gemini/gcli-gemini-3.1-pro-preview", "{}" )).toBe(false);
    expect(isCensoredEmptyResponse("DeepSeek-A/deepseek-v4-pro", "")).toBe(false);
  });

  test("does not treat the prohibited word man as a substring of woman", () => {
    const wordBoundaryScenario = {
      ...scenario,
      expectedCharacters: { 1: ["Rhea Calder"] },
      expectations: [{ paragraph: 1, field: "payload" as const, noneOf: ["man"], critical: true }]
    };
    const payload = validPayload();
    payload.scenes![0].shots![0].characters = [payload.scenes![0].shots![0].characters![0]];
    payload.scenes![0].shots![0].characters![0].composition = { position: "center", pose: "standing", actions: ["pointing"], gaze: "looking at viewer" };
    payload.scenes![0].shots![0].situation = "1woman, solo";
    payload.scenes![0].shots![0].sharedComposition = { interaction: [], spatialRelation: "" };
    const result = evaluateQuality(payload, wordBoundaryScenario, [{ paragraph: 1, positive: "valid prompt" }], true);
    expect(result.issues.some((entry) => entry.code === "stale_or_invented_fact")).toBe(false);
  });
  test("accepts a production-shaped prompt that preserves source facts", () => {
    const result = evaluateQuality(validPayload(), scenario, [{ paragraph: 1, positive: "2people, tense confrontation, medium shot" }], true);
    expect(result.issues).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  test("flags composition contamination, stale tone, and name leakage", () => {
    const payload = validPayload();
    const shot = payload.scenes![0].shots![0];
    const rhea = shot.characters![0];
    rhea.composition = { position: "Rhea Calder in close-up;", pose: "standing", actions: ["pointing"], gaze: "looking right" };
    shot.situation = "romantic confrontation";
    const result = evaluateQuality(payload, scenario, [{ paragraph: 1, positive: "romantic confrontation" }], true);
    expect(result.passed).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain("composition_contamination");
    expect(result.issues.map((entry) => entry.code)).toContain("composition_punctuation");
    expect(result.issues.map((entry) => entry.code)).toContain("name_leak");
    expect(result.issues.map((entry) => entry.code)).toContain("stale_or_invented_fact");
  });
});
