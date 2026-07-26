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

const adultCoupleMemory = {
  "Lena Voss": "woman, adult woman, shoulder-length black hair, brown eyes, curvy body, red camisole, black skirt",
  "Darin Holt": "man, adult man, short auburn hair, gray eyes, muscular body, white shirt, black trousers"
};

const clothedBedroomState: PreviousVisualState = {
  characters: [
    { name: "Lena Voss", label: "woman", age: "adult woman", appearance: "shoulder-length black hair, brown eyes", body: "curvy body", attire: "red camisole, black skirt", attireInferred: false },
    { name: "Darin Holt", label: "man", age: "adult man", appearance: "short auburn hair, gray eyes", body: "muscular body", attire: "white shirt, black trousers", attireInferred: false }
  ],
  environment: { location: "adult bedroom", timeWeather: "night", lightingMood: ["warm bedside light"], backgroundElements: ["bed", "nightstand"] },
  place: "",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

/** Adult-only consensual sexual-content fixtures, isolated from the general scorecard. */
export const nsfwSidecarScenarios: SidecarScenario[] = [
  {
    id: "nsfw_consensual_couple_action",
    description: "Explicit consensual intercourse must remain adult, correctly owned, and visually explicit.",
    config: config(),
    characterMemory: adultCoupleMemory,
    paragraphs: ["In a private bedroom at night, consenting adults Lena Voss and Darin Holt are nude and having vaginal sex on the bed, with Lena straddling Darin and riding him. Both are visibly aroused and looking at each other."],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Lena Voss", "Darin Holt"] },
    expectations: [
      { paragraph: 1, character: "Lena Voss", field: "attire", anyOf: ["nude", "naked"], noneOf: ["red camisole", "black skirt"], critical: true },
      { paragraph: 1, character: "Lena Voss", field: "action", anyOf: ["riding", "straddling", "vaginal sex"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["vaginal sex", "penetration", "riding"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["child", "young girl", "young boy", "teen"], critical: true }
    ]
  },
  {
    id: "nsfw_oral_action_ownership",
    description: "Explicit oral action must remain assigned to the acting adult without role reversal.",
    config: config(),
    paragraphs: ["In a private hotel room, consenting adult woman Mara Quill kneels in front of consenting adult man Ivo Renn and performs oral sex on his penis. Ivo remains standing with one hand resting on her shoulder. Both are nude."],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Mara Quill", "Ivo Renn"] },
    expectations: [
      { paragraph: 1, character: "Mara Quill", field: "action", anyOf: ["oral sex", "fellatio", "sucking penis"], critical: true },
      { paragraph: 1, character: "Ivo Renn", field: "action", anyOf: ["hand on shoulder", "resting hand on shoulder", "touching shoulder", "standing"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["penis", "fellatio", "oral sex"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["Mara standing", "Ivo kneeling"], critical: true }
    ]
  },
  {
    id: "nsfw_solo_no_invented_partner",
    description: "Solo explicit action must not invent a partner or hide the source action.",
    config: config({ maxCharacters: 1 }),
    paragraphs: ["Alone in her locked apartment bedroom, adult woman Sable Orr lies nude on the bed and masturbates by touching her exposed vulva with her right hand. No other person is present."],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Sable Orr"] },
    expectations: [
      { paragraph: 1, character: "Sable Orr", field: "action", anyOf: ["masturbating", "touching vulva", "touching her exposed vulva", "touching own exposed vulva", "fingering herself"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["vulva", "pussy", "female masturbation"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["partner", "man", "boy", "penis"], critical: true }
    ]
  },
  {
    id: "nsfw_nudity_overrides_stale_attire",
    description: "Current explicit nudity must override stale clothing memory for both adults.",
    config: config(),
    characterMemory: adultCoupleMemory,
    previousVisualState: clothedBedroomState,
    recentContext: "Lena still wore her red camisole and black skirt while Darin wore his white shirt and black trousers.",
    paragraphs: ["Later in the same adult bedroom, consenting adults Lena Voss and Darin Holt have removed all clothing and are completely nude. Lena lies on her back while Darin performs cunnilingus on her exposed vulva. Do not restore any earlier clothing."],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Lena Voss", "Darin Holt"] },
    expectations: [
      { paragraph: 1, character: "Lena Voss", field: "attire", anyOf: ["nude", "naked"], noneOf: ["camisole", "skirt"], critical: true },
      { paragraph: 1, character: "Darin Holt", field: "attire", anyOf: ["nude", "naked"], noneOf: ["white shirt", "black trousers"], critical: true },
      { paragraph: 1, character: "Darin Holt", field: "action", anyOf: ["cunnilingus", "oral sex", "licking vulva"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["red camisole", "black skirt", "white shirt", "black trousers"], critical: true }
    ]
  },
  {
    id: "nsfw_pov_partial_partner",
    description: "A one-character limit must retain explicit POV contact through a partial anonymous adult presence.",
    config: config({ maxCharacters: 1 }),
    paragraphs: ["From the POV of an out-of-frame consenting adult partner, nude adult woman Nyra Vale reclines on a sofa with legs spread while the partner's visible hand fingers her exposed vulva. Only Nyra and the anonymous adult hand are visible."],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Nyra Vale"] },
    expectations: [
      { paragraph: 1, character: "Nyra Vale", field: "action", anyOf: ["being fingered", "receiving fingering", "legs spread", "spread legs", "legs apart", "spreading legs"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["fingering", "fingers inside", "touching vulva"], critical: true },
      { paragraph: 1, field: "prompt", anyOf: ["pov", "hand", "fingers"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["second character", "2girls", "1boy"], critical: true }
    ]
  },
  {
    id: "nsfw_static_adult_portrait",
    description: "Adult-only Static mode should produce a stable erotic visual-novel portrait with a simple pose and readable private setting.",
    config: config({ perspectiveMode: "static", maxCharacters: 1 }),
    paragraphs: ["In a locked private dressing room, consenting adult woman Aria Pell stands nude slightly forward from a velvet screen with one hand resting on her hip and the other relaxed at her side. She has a clearly adult body, looks calmly toward the viewer, and no other person is present. A vanity table, folded towel, and shaded lamp remain visible behind her."],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Aria Pell"] },
    expectations: [
      { paragraph: 1, character: "Aria Pell", field: "attire", anyOf: ["nude", "naked"], critical: true },
      { paragraph: 1, field: "location", anyOf: ["private dressing room", "dressing room"], critical: true },
      { paragraph: 1, field: "prompt", anyOf: ["vanity table", "folded towel", "shaded lamp"], critical: true },
      { paragraph: 1, field: "prompt", anyOf: ["medium shot", "eye level", "straight-on", "deep focus"], critical: true },
      { paragraph: 1, field: "prompt", noneOf: ["1boy", "2girls", "motion blur", "dutch angle"], critical: true }
    ]
  },
  {
    id: "nsfw_adaptive_private_sequence",
    description: "Adult-only Adaptive mode should route a stable setup, explicit action, and empty aftermath independently.",
    config: config({ adaptiveMode: true, minImages: 3, maxImages: 3 }),
    characterMemory: adultCoupleMemory,
    paragraphs: [
      "In a locked private bedroom at night, consenting adults Lena Voss and Darin Holt sit nude and still on opposite sides of the bed, looking at each other. A bedside table and shaded lamp remain clearly visible.",
      "Lena pushes Darin onto his back, straddles his hips, and rides his penis during consensual vaginal sex. Darin grips the bedsheet with both hands while looking up at her.",
      "After both adults leave the frame for the shower, the empty bedroom remains. An opened lubricant tube and tied used condom rest on the bedside table beside the rumpled bedsheets."
    ],
    expectedParagraphs: [1, 2, 3],
    expectedCharacters: { 1: ["Lena Voss", "Darin Holt"], 2: ["Lena Voss", "Darin Holt"], 3: [] },
    expectedPerspectives: { 1: ["static"], 2: ["dynamic"], 3: ["creative"] },
    expectations: [
      { paragraph: 1, character: "Lena Voss", field: "attire", anyOf: ["nude", "naked"], critical: true },
      { paragraph: 1, character: "Darin Holt", field: "attire", anyOf: ["nude", "naked"], critical: true },
      { paragraph: 2, character: "Lena Voss", field: "action", anyOf: ["riding", "straddling", "vaginal sex"], critical: true },
      { paragraph: 2, character: "Darin Holt", field: "action", anyOf: ["grips the bedsheet", "gripping bedsheet", "lying on back"], critical: true },
      { paragraph: 3, field: "prompt", anyOf: ["lubricant tube", "used condom", "bedside table", "rumpled bedsheets"], critical: true }
    ]
  },
  {
    id: "nsfw_creative_aftermath_anchor",
    description: "Creative mode should isolate an adult sexual aftermath cue without leaking identity memory.",
    config: config({ perspectiveMode: "creative" }),
    characterMemory: adultCoupleMemory,
    paragraphs: ["After consensual sex between adults Lena Voss and Darin Holt, they rest out of focus beyond rumpled bedsheets. An opened condom wrapper and a tied used condom are clearly visible on the bedside table."],
    expectedParagraphs: [1],
    expectedCharacters: { 1: [] },
    expectations: [
      { paragraph: 1, field: "prompt", anyOf: ["condom wrapper", "used condom", "bedside table", "rumpled bedsheets"], critical: true },
      { paragraph: 1, field: "prompt", noneOf: ["black hair", "brown eyes", "auburn hair", "gray eyes", "red camisole", "white shirt"], critical: true }
    ]
  }
];
