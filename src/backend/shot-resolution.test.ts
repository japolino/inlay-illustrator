import { describe, expect, test } from "bun:test";
import {
  ContinuityStateSchema,
  IllustrationPlanSchema,
  ShotPlanSchema,
  type ContinuityState,
  type IllustrationInput,
  type PlannedShot
} from "./domain.js";
import { resolveIllustrationPlan, resolveShotPerspective } from "./shot-resolution.js";
import { DEFAULT_CONFIG } from "../shared/config.js";

const baseline: ContinuityState = {
  characters: [{
    name: "Asha Fen",
    label: "woman",
    age: "adult woman",
    appearance: "dark skin, curly black hair",
    body: "slim",
    attire: "purple travel coat",
    attireInferred: false
  }],
  environment: {
    location: "forest clearing",
    timeWeather: "moonlit twilight",
    lightingMood: ["soft moonlight"],
    backgroundElements: ["ancient trees"]
  },
  place: "beside an ancient oak"
};

function planShot(paragraph: number, overrides: Partial<PlannedShot> = {}): PlannedShot {
  return {
    paragraph,
    plan: { mode: "dynamic", primaryAction: "woman raises a crystal seed", staging: "woman centered" },
    camera: { framing: "medium shot", angle: "eye level" },
    characters: [{ name: "Asha Fen", expression: "focused" }],
    ...overrides
  };
}

describe("resolveIllustrationPlan", () => {
  test("resolves named characters and camera defaults deterministically", () => {
    const input: IllustrationInput = {
      initialContinuity: baseline,
      shots: [planShot(1)]
    };
    const plan = resolveIllustrationPlan(input);

    expect(IllustrationPlanSchema.parse(plan)).toEqual(plan);
    expect(plan.shots[0]).toMatchObject({
      paragraph: 1,
      camera: { framing: "medium shot", angle: "eye level", perspective: "", focus: [] },
      situation: "",
      place: "beside an ancient oak",
      negative: "",
      characters: [{
        name: "Asha Fen",
        appearance: "dark skin, curly black hair",
        expression: "focused",
        renderScope: "",
        visibleTags: []
      }]
    });
    expect(plan.terminalContinuity).toEqual(baseline);
  });

  test("applies deltas chronologically so later shots see earlier changes", () => {
    const plan = resolveIllustrationPlan({
      initialContinuity: baseline,
      deltas: [{
        paragraph: 1,
        characters: [{ name: "Asha Fen", set: { attire: "white ritual robe" } }],
        environment: { set: { location: "stone circle" } }
      }],
      shots: [
        planShot(1),
        { ...planShot(2), place: "within the circle" }
      ]
    });

    expect(plan.shots[0].characters[0]?.attire).toBe("white ritual robe");
    expect(plan.shots[0].environment.location).toBe("stone circle");
    expect(plan.shots[0].place).toBe("beside an ancient oak");
    expect(plan.shots[1].place).toBe("within the circle");
    expect(plan.terminalContinuity.characters[0]?.attire).toBe("white ritual robe");
    expect(plan.terminalContinuity.environment.location).toBe("stone circle");
  });

  test("carries unchanged baselines forward and applies deltas after the final shot", () => {
    const plan = resolveIllustrationPlan({
      initialContinuity: baseline,
      deltas: [{ paragraph: 3, place: "docks" }],
      shots: [planShot(1)]
    });

    expect(plan.shots[0].place).toBe("beside an ancient oak");
    expect(plan.terminalContinuity.place).toBe("docks");
  });

  test("fails on unknown character references instead of silently formatting", () => {
    expect(() => resolveIllustrationPlan({
      initialContinuity: baseline,
      shots: [{ ...planShot(1), characters: [{ name: "Mystery Figure" }] }]
    })).toThrow("unknown character");
  });

  test("rejects unordered shots and non-terminal-equivalent snapshots", () => {
    expect(() => resolveIllustrationPlan({
      initialContinuity: baseline,
      shots: [planShot(2), planShot(1)]
    })).toThrow();
  });
});

describe("resolveShotPerspective", () => {
  test("maps adaptive choices to a fixed mode and never accepts asset", () => {
    const adaptive = { ...DEFAULT_CONFIG, adaptiveMode: true };
    expect(resolveShotPerspective({ perspectiveMode: "creative" }, adaptive)).toEqual({ mode: "creative", source: "adaptive" });
    expect(resolveShotPerspective({ perspectiveMode: "static" }, adaptive)).toEqual({ mode: "static", source: "adaptive" });
    expect(resolveShotPerspective({ perspectiveMode: "asset" }, adaptive)).toEqual({ mode: "dynamic", source: "adaptive" });
    expect(resolveShotPerspective({}, { ...DEFAULT_CONFIG, adaptiveMode: false, perspectiveMode: "asset" })).toEqual({ mode: "asset", source: "manual" });
  });

  test("shot plans round-trip through the discriminated union", () => {
    for (const plan of [
      { mode: "dynamic", primaryAction: "she runs", staging: "left of frame" },
      { mode: "static" },
      { mode: "asset" }
    ] as const) {
      expect(ShotPlanSchema.parse(plan).mode).toBe(plan.mode);
    }
  });
});
