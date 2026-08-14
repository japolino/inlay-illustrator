import { describe, expect, test } from "bun:test";
import {
  ContinuityDeltaSchema,
  ContinuityStateSchema,
  IllustrationPlanSchema,
  ResolvedShotSchema,
  ShotPlanSchema,
  applyContinuityDelta,
  continuityDeltaBetween,
  reconcileContinuityState,
  resolveContinuity,
  type IllustrationPlan,
  type ShotPlan
} from "./domain.js";

const continuity = {
  characters: [{
    name: "Asha Fen",
    label: "woman",
    age: "adult woman",
    appearance: "dark skin, curly black hair",
    body: "slim",
    attire: "purple travel coat",
    attireInferred: false,
    sources: { appearance: "card_explicit" as const, attire: "narrative_explicit" as const }
  }],
  environment: {
    location: "forest clearing",
    timeWeather: "moonlit twilight",
    lightingMood: ["soft moonlight"],
    backgroundElements: ["ancient trees", "undergrowth"]
  },
  place: "beside an ancient oak"
};

const resolvedShot = {
  paragraph: 2,
  plan: {
    mode: "dynamic" as const,
    primaryAction: "woman raises a crystal seed between both hands",
    secondaryCue: "green light spills across her fingers",
    staging: "woman centered in the clearing"
  },
  camera: {
    framing: "medium shot",
    angle: "eye level",
    perspective: "three-quarter view",
    focus: ["shallow depth of field"]
  },
  cameraText: "",
  situation: "1girl, solo, forest",
  action: "",
  characters: [{
    ...continuity.characters[0],
    identity: "",
    avatarAppearance: "",
    avatarBody: "",
    avatarAttire: "",
    expression: "focused",
    action: "",
    composition: {
      position: "center frame",
      pose: "standing upright",
      actions: ["raising a crystal seed"],
      gaze: "looking at crystal seed"
    },
    renderScope: "upper body and hands",
    visibleTags: ["dark skin", "curly black hair", "purple travel coat"]
  }],
  sharedComposition: { interaction: [], spatialRelation: "" },
  supplement: "",
  environment: continuity.environment,
  place: continuity.place,
  negative: ""
};

describe("ShotPlan domain boundary", () => {
  test("selects each mode through an explicit discriminator", () => {
    const plans: ShotPlan[] = [
      { mode: "dynamic", primaryAction: "woman opens the door", staging: "woman left of doorway" },
      { mode: "static" },
      {
        mode: "creative",
        concept: {
          id: "creative-seed-shadow",
          paragraph: 2,
          subjectType: "shadow",
          anchor: "crystal seed shadow",
          concept: "the seed shadow crosses tree bark",
          renderScope: "tree bark and the non-identifying shadow",
          camera: "tight oblique detail",
          visibleCues: ["crystal seed shadow", "rough tree bark"],
          score: 88
        }
      },
      { mode: "asset" }
    ];

    expect(plans.map((plan) => ShotPlanSchema.parse(plan).mode)).toEqual([
      "dynamic", "static", "creative", "asset"
    ]);
  });

  test("requires Dynamic hierarchy and rejects fields from another mode", () => {
    expect(ShotPlanSchema.safeParse({ mode: "dynamic", staging: "center frame" }).success).toBe(false);
    expect(ShotPlanSchema.safeParse({
      mode: "static",
      primaryAction: "woman runs"
    }).success).toBe(false);
    expect(ShotPlanSchema.safeParse({ mode: "unknown" }).success).toBe(false);
  });
});

describe("continuity domain boundary", () => {
  test("accepts complete continuity snapshots and explicit paragraph deltas", () => {
    expect(ContinuityStateSchema.parse(continuity)).toEqual(continuity);
    expect(ContinuityDeltaSchema.parse({
      paragraph: 2,
      characters: [{ name: "Asha Fen", set: { appearance: "luminous green eyes" } }],
      environment: { set: { lightingMood: ["green magical glow"] } },
      place: null
    })).toEqual({
      paragraph: 2,
      characters: [{ name: "Asha Fen", set: { appearance: "luminous green eyes" } }],
      environment: { set: { lightingMood: ["green magical glow"] } },
      place: null
    });
  });

  test("rejects empty deltas, duplicate clears, and unknown state fields", () => {
    expect(ContinuityDeltaSchema.safeParse({ paragraph: 2 }).success).toBe(false);
    expect(ContinuityDeltaSchema.safeParse({
      paragraph: 2,
      characters: [{ name: "Asha Fen", clear: ["attire", "attire"] }]
    }).success).toBe(false);
    expect(ContinuityStateSchema.safeParse({ ...continuity, camera: "wide shot" }).success).toBe(false);
  });
});

describe("resolved illustration plan", () => {
  test("accepts a fully resolved render-ready shot", () => {
    expect(ResolvedShotSchema.parse(resolvedShot)).toEqual(resolvedShot);
  });

  test("enforces strictness recursively", () => {
    expect(ResolvedShotSchema.safeParse({ ...resolvedShot, parserScratch: true }).success).toBe(false);
    expect(ResolvedShotSchema.safeParse({
      ...resolvedShot,
      camera: { ...resolvedShot.camera, zoom: "2x" }
    }).success).toBe(false);
    expect(ResolvedShotSchema.safeParse({
      ...resolvedShot,
      characters: [{ ...resolvedShot.characters[0], rememberedAction: "walking" }]
    }).success).toBe(false);
  });

  test("validates a strict, versioned IllustrationPlan", () => {
    const plan: IllustrationPlan = {
      version: 1,
      shots: [resolvedShot],
      initialContinuity: continuity,
      continuityDeltas: [{
        paragraph: 2,
        characters: [{ name: "Asha Fen", set: { appearance: "luminous green eyes" } }]
      }],
      terminalContinuity: {
        ...continuity,
        characters: [{ ...continuity.characters[0], appearance: "luminous green eyes" }]
      }
    };

    expect(IllustrationPlanSchema.parse(plan)).toEqual(plan);
    expect(IllustrationPlanSchema.safeParse({ ...plan, debug: true }).success).toBe(false);
    expect(IllustrationPlanSchema.safeParse({ ...plan, version: 2 }).success).toBe(false);
  });
});


describe("deterministic continuity resolution", () => {
  test("applies ordered deltas without mutating the initial snapshot", () => {
    const initial = structuredClone(continuity);
    const terminal = resolveContinuity(initial, [
      {
        paragraph: 2,
        characters: [{ name: "Asha Fen", set: { attire: "white ritual robe" }, clear: ["body"] }],
        environment: { set: { lightingMood: ["green glow"] } }
      },
      {
        paragraph: 3,
        characters: [{ name: "Toma", set: { label: "man", age: "adult man" } }],
        place: null
      }
    ]);

    expect(terminal.characters[0]).toMatchObject({ attire: "white ritual robe", body: "" });
    expect(terminal.characters[1]).toMatchObject({ name: "Toma", label: "man", age: "adult man" });
    expect(terminal.environment.lightingMood).toEqual(["green glow"]);
    expect(terminal.place).toBe("");
    expect(initial).toEqual(continuity);
  });

  test("rejects out-of-order deltas and validates each boundary", () => {
    expect(() => resolveContinuity(continuity, [
      { paragraph: 3, place: "bridge" },
      { paragraph: 2, place: "road" }
    ])).toThrow("ordered by source paragraph");
    expect(() => applyContinuityDelta(continuity, { paragraph: 2 } as never)).toThrow();
  });

  test("adapts terminal snapshots into explicit deltas and reconciles through the reducer", () => {
    const terminal = {
      ...continuity,
      characters: [{
        name: "Toma",
        label: "man",
        age: "adult man",
        appearance: "black hair",
        body: "",
        attire: "travel cloak",
        attireInferred: false
      }],
      environment: { ...continuity.environment, location: "stone bridge" },
      place: "on the bridge",
      updatedAt: "2026-08-11T00:00:00.000Z"
    };
    const delta = continuityDeltaBetween(continuity, terminal, 4);

    expect(delta).toMatchObject({
      paragraph: 4,
      removeCharacters: ["Asha Fen"],
      characters: [{ name: "Toma" }],
      environment: { set: { location: "stone bridge" } },
      place: "on the bridge"
    });
    expect(reconcileContinuityState(continuity, terminal, 4)).toEqual(terminal);
  });

});
