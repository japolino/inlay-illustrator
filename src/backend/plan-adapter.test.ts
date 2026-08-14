import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { planFromParsedPayload } from "./plan-adapter.js";
import { compilePrompt, renderPrompt } from "./prompt.js";
import { selectPromptEntries } from "./scenes.js";
import { resolveIllustrationPlan } from "./shot-resolution.js";
import type { ParsedPayload, PreparedParagraph } from "./types.js";

const paragraphs: PreparedParagraph[] = [{ parserIndex: 1, originalIndex: 4, text: "A courier runs." }];

describe("legacy payload to canonical plan adapter", () => {
  test("preserves every default-style render field through canonical compilation", () => {
    const config = {
      ...DEFAULT_CONFIG,
      promptStyle: "default" as const,
      promptSyntax: "nai" as const,
      maxImages: 1,
      customPositivePrefix: "score_9",
      customNegative: "lowres"
    };
    const payload: ParsedPayload = {
      scenes: [{
        place: "neon overpass",
        environment: { location: "neon overpass", timeWeather: "dusk", lightingMood: [], backgroundElements: [] },
        shots: [{
          paragraph: 1,
          perspectiveMode: "dynamic",
          camera: "full body, low angle, from side, motion blur",
          situation: "1other, solo",
          action: "vaulting rightward over a barrier",
          characters: [{
            name: "Rook Sable",
            label: "other",
            age: "mature male",
            identity: "anthropomorphic fox",
            appearance: "orange fur, white muzzle",
            avatarAppearance: "amber eyes",
            body: "digitigrade legs",
            avatarBody: "athletic build",
            attire: "teal bomber jacket",
            avatarAttire: "black hoodie",
            attireInferred: false,
            expression: "focused",
            action: "clutching a parcel"
          }],
          supplement: "right side of frame, concrete barrier in foreground",
          negative: "extra tails"
        }]
      }],
      terminalState: {
        paragraph: 1,
        place: "neon overpass",
        environment: { location: "neon overpass", timeWeather: "dusk", lightingMood: [], backgroundElements: [] },
        characters: [{
          name: "Rook Sable",
          label: "other",
          age: "mature male",
          identity: "anthropomorphic fox",
          appearance: "orange fur, white muzzle",
          body: "digitigrade legs",
          attire: "teal bomber jacket",
          attireInferred: false
        }]
      }
    };
    const legacy = selectPromptEntries(payload, paragraphs, config);
    const plan = resolveIllustrationPlan(planFromParsedPayload(payload, undefined, paragraphs, config, new Map(), legacy));
    const compiled = compilePrompt(plan.shots[0], config);

    expect(renderPrompt(compiled.prompt, config.promptSyntax)).toBe(renderPrompt(legacy[0].prompt, config.promptSyntax));
    expect(renderPrompt(compiled.corePrompt, config.promptSyntax)).toBe(renderPrompt(legacy[0].corePrompt, config.promptSyntax));
    expect(compiled.negative).toBe(legacy[0].negative);
    expect(plan.shots[0]).toMatchObject({
      cameraText: "full body, low angle, from side, motion blur",
      action: "vaulting rightward over a barrier",
      supplement: "right side of frame, concrete barrier in foreground",
      characters: [{
        identity: "anthropomorphic fox",
        avatarAppearance: "amber eyes",
        avatarBody: "athletic build",
        avatarAttire: "black hoodie",
        action: "clutching a parcel"
      }]
    });
  });

  test("resolves explicit empty shared composition and applies terminal removal after the shot", () => {
    const config = { ...DEFAULT_CONFIG, maxImages: 1 };
    const payload: ParsedPayload = {
      scenes: [{
        environment: { location: "stone gate", timeWeather: "night", lightingMood: [], backgroundElements: [] },
        shots: [{
          paragraph: 1,
          perspectiveMode: "dynamic",
          camera: { framing: "medium shot", angle: "eye level", perspective: "straight-on", focus: [] },
          shotPlan: { primaryAction: "woman opens the gate", secondaryCue: "", staging: "woman at center" },
          situation: "1girl, solo",
          characters: [{
            name: "Asha Fen",
            label: "girl",
            age: "",
            appearance: "black curls",
            body: "slim",
            attire: "purple coat",
            attireInferred: false,
            expression: "focused",
            composition: { position: "center", pose: "standing", actions: ["opening the gate"], gaze: "toward gate" },
            renderScope: "upper body",
            visibleTags: "black curls, purple coat"
          }],
          sharedComposition: { interaction: [], spatialRelation: "" },
          negative: ""
        }]
      }],
      terminalState: {
        paragraph: 1,
        environment: { location: "stone gate", timeWeather: "night", lightingMood: [], backgroundElements: [] },
        characters: []
      }
    };
    const legacy = selectPromptEntries(payload, paragraphs, config);
    const input = planFromParsedPayload(payload, undefined, paragraphs, config, new Map(), legacy);
    const plan = resolveIllustrationPlan(input);

    expect(input.deltas?.map((delta) => delta.timing)).toEqual(["before_shot", "after_shot"]);
    expect(plan.shots[0].characters[0]?.name).toBe("Asha Fen");
    expect(plan.shots[0].sharedComposition).toEqual({ interaction: [], spatialRelation: "" });
    const compiled = compilePrompt(plan.shots[0], config);
    expect(renderPrompt(compiled.prompt, config.promptSyntax)).toBe(renderPrompt(legacy[0].prompt, config.promptSyntax));
    expect(plan.terminalContinuity.characters).toEqual([]);
  });

  test("mirrors the legacy Adaptive Creative downgrade in the canonical mode", () => {
    const config = { ...DEFAULT_CONFIG, adaptiveMode: true, fastMode: false, maxImages: 1 };
    const payload: ParsedPayload = {
      scenes: [{
        environment: { location: "bridge", timeWeather: "night", lightingMood: [], backgroundElements: [] },
        shots: [{
          paragraph: 1,
          perspectiveMode: "creative",
          camera: { framing: "wide shot", angle: "eye level", perspective: "straight-on", focus: [] },
          situation: "no humans, object focus, wet pavement reflection",
          characters: [],
          sharedComposition: { interaction: [], spatialRelation: "" },
          negative: ""
        }]
      }],
      terminalState: {
        paragraph: 1,
        environment: { location: "bridge", timeWeather: "night", lightingMood: [], backgroundElements: [] },
        characters: []
      }
    };
    const legacy = selectPromptEntries(payload, paragraphs, config, new Map());
    expect(legacy[0].perspectiveMode).toBe("dynamic");
    const plan = resolveIllustrationPlan(planFromParsedPayload(payload, undefined, paragraphs, config, new Map(), legacy));
    expect(plan.shots[0].plan).toEqual({ mode: "dynamic", degradedFromCreative: true });
    const compiled = compilePrompt(plan.shots[0], config);
    expect(renderPrompt(compiled.prompt, config.promptSyntax)).toBe(renderPrompt(legacy[0].prompt, config.promptSyntax));
  });
});
