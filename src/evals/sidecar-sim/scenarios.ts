import { normalizeConfig } from "../../shared/config.js";
import type { PreviousVisualState } from "../../backend/types.js";
import type { SidecarScenario } from "./types.js";

function config(overrides: Parameters<typeof normalizeConfig>[0] = {}) {
  return normalizeConfig({
    minImages: 1,
    maxImages: 1,
    maxCharacters: 2,
    parserRetries: 0,
    preprocessingEnabled: false,
    promptStyle: "anima",
    promptSyntax: "comfyui",
    customPositivePrefix: "",
    customPositiveSuffix: "",
    customNegative: "",
    promptPresets: [],
    ...overrides
  });
}

const rheaMemory = "woman, adult woman, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, navy officer coat, white shirt, red sash, black trousers, knee-high black boots";
const evanMemory = "man, adult man, messy short black hair, green eyes, freckles, lean build, gray hooded jacket, dark jeans, white sneakers";

function state(
  attire: string,
  location: string,
  timeWeather: string,
  backgroundElements: string[]
): PreviousVisualState {
  return {
    characters: [
      { name: "Rhea Calder", label: "woman", age: "adult woman", appearance: "tan skin, long white braid, golden eyes, scar through left eyebrow", body: "tall", attire, attireInferred: false },
      { name: "Evan Dorne", label: "man", age: "adult man", appearance: "messy short black hair, green eyes, freckles", body: "lean build", attire: evanMemory.split(", ").slice(6).join(", "), attireInferred: false }
    ],
    environment: { location, timeWeather, lightingMood: ["cold rainy light"], backgroundElements },
    place: "",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

export const sidecarScenarios: SidecarScenario[] = [
  {
    id: "rhea_platform_conflict",
    description: "Two-person tense action with explicit ownership and non-romantic tone.",
    config: config(),
    characterMemory: { "Rhea Calder": rheaMemory, "Evan Dorne": evanMemory },
    paragraphs: ["On an exterior train platform in heavy rain, Rhea Calder angrily grips Evan Dorne's sleeve and points toward a departing train. Evan recoils and looks directly at her. Their interaction is tense and explicitly not romantic."],
    expectedParagraphs: [1], expectedCharacters: { 1: ["Rhea Calder", "Evan Dorne"] },
    expectations: [
      { paragraph: 1, character: "Rhea Calder", field: "attire", anyOf: ["navy officer coat", "navy blue officer coat"], critical: true },
      { paragraph: 1, character: "Rhea Calder", field: "action", anyOf: ["grip", "gripping"], critical: true },
      { paragraph: 1, character: "Rhea Calder", field: "action", anyOf: ["point", "pointing"], critical: true },
      { paragraph: 1, character: "Evan Dorne", field: "action", anyOf: ["recoil", "recoiling", "leaning back", "pulling body away"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["romantic", "affectionate", "tender"], critical: true },
      { paragraph: 1, field: "location", anyOf: ["train platform", "railway platform"], critical: true }
    ]
  },
  {
    id: "rhea_corridor_continuity",
    description: "Returning attire, movement direction, and a partial third presence.",
    config: config(),
    characterMemory: { "Rhea Calder": rheaMemory, "Evan Dorne": evanMemory },
    previousVisualState: state("navy officer coat, white shirt, red sash, black trousers, knee-high black boots", "exterior train platform", "rainy evening", ["departing train", "wet platform"]),
    paragraphs: ["Now inside a train corridor, Evan Dorne pulls Rhea Calder forward by the wrist while running left. Rhea looks backward toward a partial bronze mechanical hand reaching through the closing doorway. Her navy officer coat and red sash are still present. Do not show a complete automaton or a third character."],
    expectedParagraphs: [1], expectedCharacters: { 1: ["Rhea Calder", "Evan Dorne"] },
    expectations: [
      { paragraph: 1, field: "location", anyOf: ["train corridor", "railcar corridor"], noneOf: ["train platform"], critical: true },
      { paragraph: 1, character: "Rhea Calder", field: "attire", anyOf: ["navy officer coat"], critical: true },
      { paragraph: 1, character: "Rhea Calder", field: "attire", anyOf: ["red sash"], critical: true },
      { paragraph: 1, character: "Evan Dorne", field: "action", anyOf: ["running left", "runs left", "moving left", "mid-run left"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["bronze mechanical hand", "partial bronze hand", "bronze hand"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["complete automaton", "full automaton"], critical: true }
    ]
  },
  {
    id: "rhea_compartment_attire_removal",
    description: "Explicit removal must override immediately previous attire.",
    config: config(),
    characterMemory: { "Rhea Calder": rheaMemory, "Evan Dorne": evanMemory },
    previousVisualState: state("navy officer coat, white shirt, red sash, black trousers, knee-high black boots", "interior train corridor", "rainy evening", ["closing doorway", "brass handrail"]),
    recentContext: "Rhea ran through the corridor wearing her navy officer coat and red sash.",
    paragraphs: ["Later inside a train compartment, Rhea Calder has removed her navy officer coat and red sash, rolled up her white shirt sleeves, and is bandaging Evan Dorne's injured palm. Both remain tense and alert. Rain is visible through the window. Do not restore the removed coat or sash."],
    expectedParagraphs: [1], expectedCharacters: { 1: ["Rhea Calder", "Evan Dorne"] },
    expectations: [
      { paragraph: 1, field: "location", anyOf: ["train compartment", "railcar compartment"], critical: true },
      { paragraph: 1, character: "Rhea Calder", field: "attire", anyOf: ["white shirt"], noneOf: ["navy officer coat", "red sash"], critical: true },
      { paragraph: 1, character: "Rhea Calder", field: "action", anyOf: ["bandag", "wrapping"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["rain", "rainy"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["romantic", "tender", "affectionate"], critical: true }
    ]
  },
  {
    id: "static_visual_novel",
    description: "Static mode should be a stable visual-novel composition with readable setting.",
    config: config({ perspectiveMode: "static" }),
    paragraphs: ["In a late-afternoon academy library, adult instructor Mira Sol stands slightly forward from the shelves with one hand resting on a closed book. She wears a burgundy cardigan, white blouse, and charcoal skirt and watches the viewer with a guarded expression."],
    expectedParagraphs: [1], expectedCharacters: { 1: ["Mira Sol"] },
    expectations: [
      { paragraph: 1, field: "location", anyOf: ["academy library", "library"], critical: true },
      { paragraph: 1, character: "Mira Sol", field: "attire", anyOf: ["burgundy cardigan"], critical: true },
      { paragraph: 1, field: "prompt", anyOf: ["medium shot", "eye level", "straight-on", "deep focus"], critical: true },
      { paragraph: 1, field: "prompt", noneOf: ["dutch angle", "motion blur", "close-up"], critical: true }
    ]
  },
  {
    id: "creative_mundane_anchor",
    description: "Manual Creative should isolate an identity-safe overlooked visual cue rather than dump memory.",
    config: config({ perspectiveMode: "creative", preprocessingEnabled: false }),
    characterMemory: { "Talia Nox": "woman, adult woman, short copper hair, blue eyes, black blazer, cream shirt, gray trousers" },
    paragraphs: ["At a quiet office desk, Talia Nox hesitates before signing a resignation letter. Her fingers hover above the uncapped fountain pen while the blank signature line remains visible beneath them."],
    expectedParagraphs: [1], expectedCharacters: { 1: ["Talia Nox"] },
    expectations: [
      { paragraph: 1, field: "prompt", anyOf: ["fountain pen", "signature line", "resignation letter", "hovering fingers"], critical: true },
      { paragraph: 1, field: "prompt", noneOf: ["copper hair", "blue eyes", "black blazer", "cream shirt", "gray trousers"], critical: true }
    ]
  },
  {
    id: "adaptive_urgent_action",
    description: "Adaptive mode should preserve a strong action beat without defaulting every shot to Creative.",
    config: config({ adaptiveMode: true, minImages: 2, maxImages: 2 }),
    paragraphs: [
      "Inside a storm-damaged greenhouse, adult botanist Oren Kade ducks right as a glass pane falls behind him. He looks terrified and wears a green rain jacket and tan work pants.",
      "At the greenhouse exit, Oren Kade braces both hands against a jammed steel door and pushes outward while water rises around his boots."
    ],
    expectedParagraphs: [1, 2], expectedCharacters: { 1: ["Oren Kade"], 2: ["Oren Kade"] },
    expectations: [
      { paragraph: 1, character: "Oren Kade", field: "action", anyOf: ["duck", "ducking", "dodging to the right", "dodging right"], critical: true },
      { paragraph: 1, character: "Oren Kade", field: "expression", anyOf: ["terrified", "fear", "afraid"], critical: true },
      { paragraph: 2, character: "Oren Kade", field: "action", anyOf: ["push", "pushing", "bracing"], critical: true },
      { paragraph: 2, field: "payload", anyOf: ["water", "flood"], critical: true }
    ]
  },
  {
    id: "stale_context_override",
    description: "Current location, time, attire, and direction override stale recent context.",
    config: config(),
    recentContext: "Nara waited at night in a snowy cabin wearing a red parka beside a fireplace.",
    paragraphs: ["At midday in a sunlit desert canyon, adult scout Nara Pell climbs upward on the east wall wearing a beige scarf, brown shirt, khaki trousers, and climbing boots. No snow, cabin, night, fireplace, or red parka is present."],
    expectedParagraphs: [1], expectedCharacters: { 1: ["Nara Pell"] },
    expectations: [
      { paragraph: 1, field: "location", anyOf: ["desert canyon"], noneOf: ["cabin"], critical: true },
      { paragraph: 1, character: "Nara Pell", field: "attire", anyOf: ["beige scarf", "brown shirt", "khaki trousers"], noneOf: ["red parka"], critical: true },
      { paragraph: 1, character: "Nara Pell", field: "action", anyOf: ["climbing upward", "climbs upward", "ascending", "scaling the steep wall", "scaling the cliff", "moving upward"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["snow", "night", "fireplace"], critical: true }
    ]
  },
  {
    id: "default_mode_compatibility",
    description: "Legacy/default prompt style remains useful while sharing the same continuity rules.",
    config: config({ promptStyle: "default", supplement: true }),
    paragraphs: ["At midnight inside a hilltop observatory, adult astronomer Sera Venn adjusts a brass telescope toward a green comet. She wears a cream sweater and brown trousers and looks awestruck."],
    expectedParagraphs: [1], expectedCharacters: { 1: ["Sera Venn"] },
    expectations: [
      { paragraph: 1, field: "location", anyOf: ["observatory"], critical: true },
      { paragraph: 1, character: "Sera Venn", field: "attire", anyOf: ["cream sweater", "brown trousers"], critical: true },
      { paragraph: 1, character: "Sera Venn", field: "action", anyOf: ["adjust", "adjusting"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["green comet"], critical: true }
    ]
  }
];
