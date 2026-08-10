import type { Config, PerspectiveMode } from "../shared/config.js";
import {
  CAMERA_ANGLE_VALUES,
  CAMERA_FRAMING_VALUES,
  CAMERA_PERSPECTIVE_VALUES
} from "./camera-diversity.js";
import {
  applyContinuityDelta,
  IllustrationInputSchema,
  IllustrationPlanSchema,
  ResolvedCharacterSchema,
  ResolvedShotSchema
} from "./domain.js";
import type {
  ContinuityState,
  IllustrationInput,
  IllustrationPlan,
  PlannedShot,
  ResolvedCharacter,
  ResolvedShot
} from "./domain.js";
import type { CharacterJson } from "./types.js";
import { asRecord, cleanString, csvParts, unique } from "./utils.js";

/**
 * Deterministic shot-resolution primitives shared by parser normalization and
 * prompt compilation. This module owns crop visibility semantics; neither
 * caller reimplements or imports behavior from the other.
 */
export function isFragmentRenderScope(value: unknown): boolean {
  const scope = cleanString(value).toLowerCase();
  const subject = "(?:head|face|eye|eyes|mouth|hair|hand|hands|finger|fingers|arm|arms|sleeve|sleeves|feet|foot|leg|legs|lower body|torso|chest|back|shoulder|tail|wing|silhouette|shadow)";
  return new RegExp([
    "\\b(?:head|face|eyes)\\s+out\\s+of\\s+frame\\b",
    `\\b${subject}\\s+(?:only|detail|focus)\\b`,
    `\\bonly\\s+(?:the\\s+)?${subject}\\b`,
    `\\b(?:close(?:-up)?|tight|crop(?:ped)?)\\s+(?:view|crop|focus)(?:\\s+(?:on|of))?\\s+(?:the\\s+|her\\s+|his\\s+|their\\s+)?${subject}\\b`,
    `\\b(?:focus|detail|close(?:-up)?|crop|view)\\s+(?:on|of)\\s+(?:the\\s+|her\\s+|his\\s+|their\\s+)?(?:[a-z-]+\\s+){0,2}${subject}\\b`,
    `\\b${subject}\\s+(?:fills?|filling)\\s+(?:the\\s+)?frame\\b`
  ].join("|"), "i").test(scope);
}

// ---------------------------------------------------------------------------
// Visibility-tier projection
//
// Character continuity retains the complete baseline. Prompt rendering is a
// separate, deterministic projection through the selected Dynamic framing.
// Crop and occlusion rules are hard constraints: incompatible traits are not
// injected into the prompt. The parser must instead choose a camera that can
// show every source-critical fact. Fragment framings use visibleTags as their
// authoritative projection, subject to hard camera occlusions.
// ---------------------------------------------------------------------------

export type VisibilityRegion = "head" | "face" | "neck" | "shoulders" | "torso" | "arms" | "hands" | "hips" | "legs" | "feet" | "figure";
export type VisibilityTagSource = "identity" | "appearance" | "body" | "attire" | "projection";

export const ALL_VISIBILITY_REGIONS: VisibilityRegion[] = ["head", "face", "neck", "shoulders", "torso", "arms", "hands", "hips", "legs", "feet", "figure"];

/** Body regions each Dynamic framing value normally contains. Empty/unknown framings fail open to the complete figure for legacy compatibility. */
export const FRAMING_VISIBILITY_REGIONS: Record<string, VisibilityRegion[]> = {
  portrait: ["head", "face", "neck", "shoulders"],
  "close-up": ["head", "face", "neck", "shoulders"],
  "medium close-up": ["head", "face", "neck", "shoulders", "torso"],
  "upper body": ["head", "face", "neck", "shoulders", "torso", "arms", "hands"],
  "medium shot": ["head", "face", "neck", "shoulders", "torso", "arms", "hands"],
  "cowboy shot": ["head", "face", "neck", "shoulders", "torso", "arms", "hands", "hips", "legs"],
  "feet out of frame": ["head", "face", "neck", "shoulders", "torso", "arms", "hands", "hips", "legs"],
  "full body": ALL_VISIBILITY_REGIONS,
  "wide shot": ALL_VISIBILITY_REGIONS,
  "lower body": ["hips", "legs", "feet"],
  "head out of frame": ["torso", "arms", "hands", "hips", "legs", "feet"],
  "eyes out of frame": ["head", "face", "neck", "shoulders"],
  "body-part focus": []
};

/**
 * Ordered, first-match classifier. Specific garment nouns precede anatomy so
 * compound tags such as "knee-high boots" remain footwear instead of being
 * accepted merely because the framing contains knees.
 */
const REGION_TAG_PATTERNS: Array<[VisibilityRegion[], RegExp]> = [
  [["feet"], /\b(?:feet|foot|ankles?|shoes?|boots?|sneakers?|sandals?|loafers?|slippers?|heels?|footwear|barefoot|toes?|socks?|stocking feet)\b/],
  [["legs"], /\b(?:legs?|thighs?|knees?|calves?|thigh[- ]?highs?|stockings?|tights|pantyhose|leggings?|leg warmers?|garters?)\b/],
  [["hips"], /\b(?:hips?|waists?|waistbands?|belts?|crotches?|genitals?|pubis|penis|vulva|vagina|pussy|butts?|buttocks|asses?|mini[- ]?skirts?|skirts?|pants|trousers|slacks|shorts|jeans|underwear|panties|briefs|thongs?|bottomless)\b/],
  [["hands", "feet"], /\b(?:paws?|claws?)\b/],
  [["hands"], /\b(?:hands?|fingers?|fingernails?|palms?|wrists?|gloves?|mittens?|rings?|watches|bracelets?)\b/],
  [["arms"], /\b(?:arms?|sleeves?|elbows?|forearms?|biceps|triceps)\b/],
  [["shoulders"], /\b(?:shoulders?|shoulder pads)\b/],
  [["shoulders", "torso"], /\b(?:shirts?|blouses?|tank tops?|sweaters?|sweatshirts?|cardigans?|hoodies?|jackets?|blazers?|coats?|vests?|jerseys?|suits?|dresses?|robes?|gowns?|overalls|aprons?|uniforms?|ribbons?|capes?|cloaks?|tunics?|waistcoats?|suspenders?|sash(?:es)?|shirtless|topless)\b/],
  [["shoulders", "torso", "arms"], /\b(?:sleeveless|oversized|unzipped|unbuttoned|open front)\b/],
  [["hips", "legs"], /\b(?:side slit|high slit|pleated|high[- ]?waisted|low[- ]?rise)\b/],
  [["shoulders", "torso", "arms", "hips", "legs"], /\b(?:torn clothes|wet clothes)\b/],
  [["shoulders", "torso", "hips", "legs", "feet"], /\b(?:nude|naked)\b/],
  [["torso"], /\b(?:torsos?|chests?|breasts?|busts?|nipples?|bellies?|stomachs?|midriffs?|abdomens?|backs?|spines?|corsets?|bras?|binders?|collarbones?|cleavage|necklines?)\b/],
  [["neck"], /\b(?:necks?|necklaces?|chokers?|scarves?|ties?|neckties?|bow ?ties?|collars?|brooch(?:es)?|badges?|medals?)\b/],
  [["face"], /\b(?:eyes?|eyebrows?|brows|eyelashes?|lashes|pupils|irises?|heterochromia|tareme|tsurime|jitome|sanpaku|empty eyes|dashed eyes|symbol in eye|faces?|facial|freckles|beauty marks?|moles?|blush|cheeks?|chins?|jaws?|foreheads?|noses?|lips?|mouths?|teeth|tongues?|smiles?|frowns?|grins?|fangs?|tusks?|muzzles?|snouts?|eyepatches?|eye patches?|masks?|glasses|eyeglasses|goggles|monocles?|beards?|mustaches?|moustaches?|makeup)\b/],
  [["head"], /\b(?:hair|hairstyles?|bangs|fringe|ponytails?|braids?|buns?|bald|horns?|ears?|elf ears|earrings?|ear piercings?|antennae|halos?|hats?|caps?|hoods?|headbands?|tiaras?|veils?|hairpins?|hair clips?|hair ornaments?)\b/],
  [["shoulders", "torso"], /\b(?:wings?|winged)\b/],
  [["hips"], /\b(?:tails?|tail feathers?)\b/],
  [ALL_VISIBILITY_REGIONS, /\b(?:skin|fur|scales?|feathers?|furry|human|elf|elven|demon|demonic|angel|angelic|android|robot|robotic|cyborg|oni|vampire|orc|goblin|mermaid|alien|androgynous|kemonomimi|cat girl|wolf girl|fox girl|monster girl)\b/],
  [["figure"], /\b(?:tall|short|petite|giant|dwarf(?:ed)?|full[- ]?figure)\b/],
  [["shoulders", "torso", "arms"], /\b(?:muscular|toned|stocky|athletic)\b/],
  [["torso", "hips", "legs"], /\b(?:skinny|slim|lean|plump|fat|curvy|build|physique|pear[- ]?shaped|hourglass)\b/],
  [["legs"], /\b(?:long legs?|short legs?|thick thighs?)\b/]
];

/** Eye traits are a hard exclusion when the selected framing hides the eyes. */
export const EYE_TAG = /\b(?:eyes?|eyebrows?|brows|eyelashes?|lashes|pupils|irises?|heterochromia|tareme|tsurime|jitome|sanpaku|empty eyes|dashed eyes|symbol in eye|eyepatches?|eye patches?)\b/;

function fallbackVisibilityRegions(source: VisibilityTagSource): VisibilityRegion[] {
  // Legacy identity remains global. Unknown appearance is conservatively
  // treated as face-local, unknown attire as an upper garment, and unknown
  // body/parser-only tags require a complete figure.
  if (source === "identity") return ALL_VISIBILITY_REGIONS;
  if (source === "appearance") return ["face"];
  if (source === "attire") return ["shoulders", "torso"];
  return ["figure"];
}

export function tagVisibilityRegions(tag: string, source: VisibilityTagSource): VisibilityRegion[] {
  const normalized = tag.toLowerCase();
  for (const [regions, pattern] of REGION_TAG_PATTERNS) {
    if (pattern.test(normalized)) return regions;
  }
  return fallbackVisibilityRegions(source);
}

export function visibilityModifiersFor(framing: string, angle: string, perspective: string, renderScope: string): { hideFace: boolean; hideEyes: boolean } {
  const scopeText = `${angle} ${perspective} ${renderScope}`.toLowerCase();
  return {
    hideFace: /\bfrom behind\b|\bfrom the back\b|\bback (?:view|only|to (?:the )?(?:viewer|camera))\b|\bseen from behind\b|\bfacing away\b|\bface (?:hidden|out of frame)\b/.test(scopeText),
    hideEyes: framing === "eyes out of frame" || /\beyes? (?:hidden|out of frame|cropped out|outside (?:the )?frame)\b/.test(scopeText)
  };
}

export function cameraViewOf(camera: unknown): { framing: string; angle: string; perspective: string } {
  const record = asRecord(camera);
  const framing = cleanString(record.framing).toLowerCase();
  const angle = cleanString(record.angle).toLowerCase();
  const perspective = cleanString(record.perspective).toLowerCase();
  if (framing || angle || perspective) return { framing, angle, perspective };
  const text = cleanString(camera).toLowerCase();
  const byLengthDesc = (values: readonly string[]) => [...values].sort((left, right) => right.length - left.length);
  return {
    framing: byLengthDesc(CAMERA_FRAMING_VALUES).find((value) => text.includes(value)) || "",
    angle: byLengthDesc(CAMERA_ANGLE_VALUES).find((value) => text.includes(value)) || "",
    perspective: byLengthDesc(CAMERA_PERSPECTIVE_VALUES).find((value) => text.includes(value)) || ""
  };
}

export function isFragmentCameraFraming(framing: string): boolean {
  return framing === "body-part focus" || framing === "head out of frame" || framing === "eyes out of frame";
}

/**
 * Projects a Dynamic character's complete baseline into the tags actually
 * visible in the given camera framing (the same visibility-tier projection the
 * renderer audits). Used by the parser when a model omits visibleTags: for
 * ordinary framings the tier projection is authoritative, so the projected tags
 * are the correct audit value. Returns "" for fragment framings, where a
 * baseline projection would leak out-of-crop traits; the renderer fails closed
 * there instead.
 */
export function projectDynamicVisibleTags(character: CharacterJson, camera: unknown, renderScope = ""): string {
  const view = cameraViewOf(camera);
  if (isFragmentCameraFraming(view.framing)) return "";
  const modifiers = visibilityModifiersFor(view.framing, view.angle, view.perspective, renderScope);
  const regions = new Set(FRAMING_VISIBILITY_REGIONS[view.framing] || ALL_VISIBILITY_REGIONS);
  if (modifiers.hideFace) regions.delete("face");
  const projected: string[] = [];
  for (const { tag, source } of baselineTags(character)) {
    if (modifiers.hideEyes && EYE_TAG.test(tag.toLowerCase())) continue;
    if (tagVisibilityRegions(tag, source).some((region) => regions.has(region))) projected.push(tag);
  }
  return unique(projected).join(", ");
}

export type BaselineTag = { tag: string; source: VisibilityTagSource };

export function baselineTags(character: CharacterJson): BaselineTag[] {
  const fields: Array<[VisibilityTagSource, unknown]> = [
    ["identity", character.identity],
    ["appearance", character.appearance],
    ["appearance", character.avatarAppearance],
    ["body", character.body],
    ["body", character.avatarBody],
    ["attire", character.attire],
    ["attire", character.avatarAttire]
  ];
  const seen = new Set<string>();
  const output: BaselineTag[] = [];
  for (const [source, value] of fields) {
    for (const tag of csvParts(cleanString(value))) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({ tag, source });
    }
  }
  return output;
}


/** Resolve the configured/adaptive mode once before prompt compilation. */
export function resolveShotPerspective(
  shot: { perspectiveMode?: unknown },
  config: Config
): { mode: PerspectiveMode; source: "adaptive" | "manual" } {
  if (!config.adaptiveMode) return { mode: config.perspectiveMode, source: "manual" };
  const candidate = cleanString(shot.perspectiveMode).toLowerCase();
  return candidate === "creative" || candidate === "static" || candidate === "dynamic"
    ? { mode: candidate, source: "adaptive" }
    : { mode: "dynamic", source: "adaptive" };
}


// ─── Canonical illustration resolution ────────────────────────────────
//
// The pipeline boundary: typed model input (explicit deltas + shot plans) is
// reduced deterministically against trusted canonical state. Every ResolvedShot
// is validated before it can reach prompt compilation; unknown character
// references and impossible plans fail here instead of being silently
// formatted downstream.

const EMPTY_CAMERA = { framing: "", angle: "", perspective: "", focus: [] as string[] };
const EMPTY_COMPOSITION = { position: "", pose: "", actions: [] as string[], gaze: "" };
const EMPTY_SHARED = { interaction: [] as string[], spatialRelation: "" };

function resolveShotAgainstState(state: ContinuityState, planned: PlannedShot): ResolvedShot {
  const characterMap = new Map(state.characters.map((character) => [character.name.toLowerCase(), character]));
  const characters: ResolvedCharacter[] = (planned.characters || []).map((reference) => {
    const baseline = characterMap.get(reference.name.trim().toLowerCase());
    if (!baseline) {
      throw new Error(`Planned shot ${planned.paragraph} references unknown character "${reference.name}".`);
    }
    return ResolvedCharacterSchema.parse({
      ...baseline,
      expression: reference.expression ?? "",
      composition: { ...EMPTY_COMPOSITION, ...(reference.composition || {}) },
      renderScope: reference.renderScope ?? "",
      visibleTags: reference.visibleTags ?? []
    });
  });
  return ResolvedShotSchema.parse({
    paragraph: planned.paragraph,
    plan: planned.plan,
    camera: { ...EMPTY_CAMERA, ...planned.camera },
    situation: planned.situation ?? "",
    characters,
    sharedComposition: { ...EMPTY_SHARED, ...(planned.sharedComposition || {}) },
    environment: state.environment,
    place: planned.place ?? state.place,
    negative: planned.negative ?? ""
  });
}

/**
 * Reduces canonical state and typed shot plans into a validated IllustrationPlan.
 * Deltas whose paragraph is at or before a shot are visible to that shot; the
 * remaining deltas are applied after the final shot so terminalContinuity is
 * always the deterministic reduction.
 */
export function resolveIllustrationPlan(input: IllustrationInput): IllustrationPlan {
  const { initialContinuity, shots, deltas = [] } = IllustrationInputSchema.parse(input);
  const resolvedShots: ResolvedShot[] = [];
  let state = initialContinuity;
  let deltaIndex = 0;
  for (const planned of shots) {
    while (deltaIndex < deltas.length && deltas[deltaIndex].paragraph <= planned.paragraph) {
      state = applyContinuityDelta(state, deltas[deltaIndex]);
      deltaIndex += 1;
    }
    resolvedShots.push(resolveShotAgainstState(state, planned));
  }
  while (deltaIndex < deltas.length) {
    state = applyContinuityDelta(state, deltas[deltaIndex]);
    deltaIndex += 1;
  }
  return IllustrationPlanSchema.parse({
    version: 1,
    shots: resolvedShots,
    initialContinuity,
    continuityDeltas: deltas,
    terminalContinuity: state
  });
}
