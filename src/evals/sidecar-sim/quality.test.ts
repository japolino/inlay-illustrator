import { describe, expect, test } from "bun:test";
import type { ParsedPayload } from "../../backend/types.js";
import { evaluateQuality, isCensoredEmptyResponse } from "./quality.js";
import { nsfwSidecarScenarios } from "./nsfw-scenarios.js";
import { sidecarScenarios } from "./scenarios.js";
import { expandedSidecarScenarios } from "./expanded-scenarios.js";

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
    renderScope: name === "Rhea Calder" ? "full figure on the left" : "full figure on the right",
    visibleTags: [appearance, body, attire].filter(Boolean).join(", "),
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
        shotPlan: {
          primaryAction: "left woman grips right man's sleeve",
          secondaryCue: "right man recoils backward",
          staging: "left woman faces right man"
        },
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
  test("keeps the expanded genre suite unique and explicitly adult for NSFW cases", () => {
    const ids = expandedSidecarScenarios.map((candidate) => candidate.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith("nsfw_"))).toHaveLength(3);
    expect(ids.filter((id) => id.startsWith("medieval_"))).toHaveLength(3);
    expect(ids.filter((id) => id.startsWith("magic_"))).toHaveLength(2);
    expect(ids.filter((id) => id.startsWith("fight_"))).toHaveLength(2);
    expect(ids).toEqual(expect.arrayContaining([
      "dynamic_monster_magic_sword",
      "static_kemonomimi_corporate",
      "dynamic_furry_streetwear"
    ]));
    for (const candidate of expandedSidecarScenarios.filter((entry) => entry.id.startsWith("nsfw_"))) {
      expect(candidate.paragraphs.every((paragraph) => /\badult/i.test(paragraph))).toBe(true);
    }
  });

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
    payload.scenes![0].shots![0].shotPlan = {
      primaryAction: "woman points toward departing train",
      secondaryCue: "",
      staging: "woman stands at center"
    };
    payload.scenes![0].shots![0].sharedComposition = { interaction: [], spatialRelation: "" };
    const result = evaluateQuality(payload, wordBoundaryScenario, [{ paragraph: 1, positive: "valid prompt" }], true);
    expect(result.issues.some((entry) => entry.code === "stale_or_invented_fact")).toBe(false);
  });
  test("does not flag an explicitly negated prohibited trait as invented", () => {
    const negatedTraitScenario = {
      ...scenario,
      expectations: [{ paragraph: 1, character: "Evan Dorne", field: "body" as const, noneOf: ["wings"], critical: true }]
    };
    const payload = validPayload();
    payload.scenes![0].shots![0].characters![1].body = "lean build, no wings";
    const result = evaluateQuality(payload, negatedTraitScenario, [{ paragraph: 1, positive: "valid prompt" }], true);
    expect(result.issues.some((entry) => entry.code === "stale_or_invented_fact")).toBe(false);
  });

  test("accepts durable identity traits from either appearance or body", () => {
    const identityScenario = {
      ...scenario,
      expectations: [
        { paragraph: 1, character: "Evan Dorne", field: "identityTraits" as const, anyOf: ["luminous wings"], critical: true },
        { paragraph: 1, character: "Evan Dorne", field: "terminalIdentityTraits" as const, anyOf: ["luminous wings"], critical: true }
      ]
    };
    const payload = validPayload();
    payload.scenes![0].shots![0].characters![1].body = "lean build, luminous wings";
    payload.terminalState = {
      paragraph: 1,
      environment: payload.scenes![0].environment,
      environmentChanges: [],
      characters: payload.scenes![0].shots![0].characters
    };
    const result = evaluateQuality(payload, identityScenario, [{ paragraph: 1, positive: "valid prompt" }], true);
    expect(result.issues.some((entry) => entry.code === "required_fact")).toBe(false);
  });

  test("accepts a production-shaped prompt that preserves source facts", () => {
    const result = evaluateQuality(validPayload(), scenario, [{ paragraph: 1, positive: "2people, tense confrontation, medium shot" }], true);
    expect(result.issues).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  test("finds a Dynamic primary action in shotPlan after renderer ownership deduplication", () => {
    const payload = validPayload();
    payload.scenes![0].shots![0].shotPlan = {
      primaryAction: "left woman grips right man's sleeve",
      secondaryCue: "",
      staging: "left woman faces right man"
    };
    (payload.scenes![0].shots![0].characters![0].composition as { actions: string[] }).actions =
      ["pointing toward departing train"];
    (payload.scenes![0].shots![0].sharedComposition as { interaction: string[] }).interaction = [];
    const actionScenario = {
      ...scenario,
      expectations: [{
        paragraph: 1,
        character: "Rhea Calder",
        field: "action" as const,
        anyOf: ["grips right man's sleeve"],
        critical: true
      }]
    };

    const result = evaluateQuality(payload, actionScenario, [{ paragraph: 1, positive: "valid prompt" }], true);
    expect(result.issues.some((entry) => entry.code === "required_fact")).toBe(false);
  });

  test("enforces Adaptive perspective routing and permits declared alternative character sets", () => {
    const payload = validPayload();
    const adaptiveScenario = {
      ...scenario,
      expectedPerspectives: { 1: ["static" as const, "creative" as const] },
      allowedCharacterSets: { 1: [["Rhea Calder", "Evan Dorne"], ["Rhea Calder"]] }
    };
    payload.scenes![0].shots![0].perspectiveMode = "dynamic";
    let result = evaluateQuality(payload, adaptiveScenario, [{ paragraph: 1, positive: "valid prompt" }], true);
    expect(result.issues.some((entry) => entry.code === "perspective_routing" && entry.critical)).toBe(true);

    payload.scenes![0].shots![0].perspectiveMode = "static";
    payload.scenes![0].shots![0].characters = [payload.scenes![0].shots![0].characters![0]];
    result = evaluateQuality(payload, adaptiveScenario, [{ paragraph: 1, positive: "valid prompt" }], true);
    expect(result.issues.some((entry) => entry.code === "perspective_routing")).toBe(false);
    expect(result.issues.some((entry) => entry.code === "character_set")).toBe(false);
  });

  test("requires the new Dynamic projection in live conformance runs but permits legacy saved image-study inputs", () => {
    const payload = validPayload();
    delete payload.scenes![0].shots![0].shotPlan;
    delete payload.scenes![0].shots![0].characters![0].renderScope;
    delete payload.scenes![0].shots![0].characters![0].visibleTags;

    const live = evaluateQuality(payload, scenario, [{ paragraph: 1, positive: "valid prompt" }], true);
    const legacy = evaluateQuality(
      payload,
      scenario,
      [{ paragraph: 1, positive: "valid prompt" }],
      true,
      { requireModeProjection: false }
    );

    expect(live.passed).toBe(false);
    expect(live.issues.some((entry) => entry.code === "legacy_dynamic_projection" && entry.critical)).toBe(true);
    expect(live.issues.some((entry) => entry.code === "dynamic_render_scope" && entry.critical)).toBe(true);
    expect(legacy.issues.some((entry) => entry.code === "legacy_dynamic_projection" && !entry.critical)).toBe(true);
    expect(legacy.issues.some((entry) => entry.code === "dynamic_render_scope")).toBe(false);
  });

  test("requires terminal visual state only for new live conformance outputs", () => {
    const payload = validPayload();
    const liveMissing = evaluateQuality(
      payload,
      scenario,
      [{ paragraph: 1, positive: "valid prompt" }],
      true,
      { requireTerminalState: true }
    );
    payload.terminalState = {
      paragraph: 1,
      environment: {
        location: "exterior train platform",
        timeWeather: "rainy evening",
        lightingMood: ["cold overcast light"],
        backgroundElements: ["departing train", "wet platform"]
      },
      environmentChanges: ["location", "timeWeather", "lightingMood", "backgroundElements"],
      characters: []
    };
    const liveComplete = evaluateQuality(
      payload,
      scenario,
      [{ paragraph: 1, positive: "valid prompt" }],
      true,
      { requireTerminalState: true }
    );

    expect(liveMissing.issues.some((entry) => entry.code === "terminal_paragraph")).toBe(true);
    expect(liveComplete.issues.some((entry) => entry.code.startsWith("terminal_"))).toBe(false);
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

  test("allows source-literal clothing removal actions but rejects static attire in composition", () => {
    const payload = validPayload();
    const composition = payload.scenes![0].shots![0].characters![0].composition as {
      actions: string[];
      pose: string;
    };
    composition.actions = ["pulling off black trousers"];
    const removal = evaluateQuality(payload, scenario, [{ paragraph: 1, positive: "valid prompt" }], true);
    expect(removal.issues.some((entry) => entry.code === "composition_contamination")).toBe(false);

    composition.pose = "standing in black trousers";
    const staticAttire = evaluateQuality(payload, scenario, [{ paragraph: 1, positive: "valid prompt" }], true);
    expect(staticAttire.issues.some((entry) => entry.code === "composition_contamination")).toBe(true);
  });

  test("requires explicit adult age markers in adult-only explicit fixtures", () => {
    const adultScenario = nsfwSidecarScenarios.find((candidate) => candidate.id === "nsfw_oral_action_ownership")!;
    const payload = validPayload();
    const shot = payload.scenes![0].shots![0];
    shot.characters![0].name = "Mara Quill";
    shot.characters![0].label = "girl";
    shot.characters![0].age = "";
    shot.characters![1].name = "Ivo Renn";
    shot.characters![1].label = "boy";
    shot.characters![1].age = "";
    const result = evaluateQuality(payload, adultScenario, [{ paragraph: 1, positive: "1girl, 1boy, nsfw" }], true);
    expect(result.passed).toBe(false);
    expect(result.issues.filter((entry) => entry.code === "adult_age_marker")).toHaveLength(2);

    shot.characters![0].age = "mature female";
    shot.characters![1].age = "mature male";
    const marked = evaluateQuality(payload, adultScenario, [{ paragraph: 1, positive: "1girl, 1boy, nsfw" }], true);
    expect(marked.issues.filter((entry) => entry.code === "adult_age_marker")).toHaveLength(0);
  });
});
