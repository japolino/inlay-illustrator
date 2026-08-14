import type { Config, PerspectiveMode, PromptPreset } from "../shared/config.js";
import {
  CAMERA_ANGLE_VALUES,
  CAMERA_FOCUS_VALUES,
  CAMERA_FRAMING_VALUES,
  CAMERA_PERSPECTIVE_VALUES
} from "./camera-diversity.js";
import { isIdentitySafeCreativeCue } from "./creative.js";
import {
  ALL_VISIBILITY_REGIONS,
  EYE_TAG,
  FRAMING_VISIBILITY_REGIONS,
  baselineTags,
  cameraViewOf,
  isFragmentCameraFraming,
  isFragmentRenderScope,
  resolveShotPerspective,
  tagVisibilityRegions,
  visibilityModifiersFor,
  type VisibilityRegion
} from "./shot-resolution.js";
import type { ResolvedShot } from "./domain.js";
import type { AssembledPrompt, CharacterJson, CreativeConcept, PromptEntry, SceneJson, ShotJson } from "./types.js";

// Compatibility export; ownership lives in the deterministic resolver.
export { projectDynamicVisibleTags, resolveShotPerspective } from "./shot-resolution.js";
import { asRecord, cleanArray, cleanString, csvParts, escapeRegExp, unique } from "./utils.js";

export function normalizeReferenceTags(tagString: unknown): string {
  return unique(csvParts(tagString).filter((tag) => {
    const normalized = tag.toLowerCase();
    return normalized !== "null" && normalized !== "none";
  })).join(", ");
}

function stripParenthetical(value: string): string {
  return value.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function displayName(name: string, config: Config): string {
  const clean = stripParenthetical(name);
  const source = config.originalCreationName.trim();
  return config.originalReference && clean && source ? `${clean} \\(${source}\\)` : clean;
}

export function normalizeCharacterName(value: unknown): string {
  return stripParenthetical(cleanString(value));
}

function shouldIncludeCharacterNames(config: Config): boolean {
  return config.originalReference === true && config.originalCreationName.trim().length > 0;
}

function characterDescriptor(character: CharacterJson): string {
  const parts = csvParts(character.label, character.age);
  const text = parts.join(" ").toLowerCase();
  if (/\bgirl\b|\bfemale\b|\bwoman\b/.test(text)) return "the girl";
  if (/\bboy\b|\bmale\b|\bman\b/.test(text)) return "the boy";
  if (/\bchild\b/.test(text)) return "the child";
  return "the character";
}

function buildNameReplacementMap(characters: CharacterJson[]): Map<string, string> {
  const replacements = new Map<string, string>();
  const firstNameCounts = new Map<string, number>();
  for (const character of characters) {
    const first = normalizeCharacterName(character.name).split(/\s+/)[0]?.toLowerCase();
    if (first) firstNameCounts.set(first, (firstNameCounts.get(first) || 0) + 1);
  }
  for (const character of characters) {
    const descriptor = characterDescriptor(character);
    const raw = cleanString(character.name);
    const normalized = normalizeCharacterName(raw);
    for (const name of unique([raw, normalized].filter(Boolean))) {
      if (name.length >= 2) replacements.set(name, descriptor);
    }
    const first = normalized.split(/\s+/)[0];
    if (first.length >= 2 && firstNameCounts.get(first.toLowerCase()) === 1) replacements.set(first, descriptor);
  }
  return replacements;
}

function stripOrReplaceNames(value: string, replacements: Map<string, string>, tagField: boolean): string {
  if (!value || replacements.size === 0) return value;
  if (tagField) {
    return unique(csvParts(value)
      .map((tag) => {
        let next = tag;
        for (const [name, descriptor] of replacements) {
          const tagName = next.replace(/\\\(|\\\)/g, "").replace(/[()]/g, "").trim().toLowerCase();
          const cleanName = name.replace(/[()]/g, "").trim().toLowerCase();
          if (tagName === cleanName || tagName === cleanName.replace(/\s+/g, "_")) return "";
          next = next.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), descriptor);
        }
        return next.trim();
      })
      .filter(Boolean)).join(", ");
  }

  let next = value;
  for (const [name, descriptor] of replacements) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), descriptor);
  }
  return next.replace(/\s+/g, " ").trim();
}

export function buildCharacterTagReference(map: Record<string, string>): string {
  const lines = Object.entries(map)
    .map(([rawName, rawTags]) => {
      const name = normalizeCharacterName(rawName);
      const tags = normalizeReferenceTags(rawTags);
      return name && tags ? `- ${name}: ${tags}` : "";
    })
    .filter(Boolean);
  return lines.length ? ["## Previous Character Tags", ...lines].join("\n") : "";
}

function joinSections(
  sections: string[],
  syntax: Config["promptSyntax"],
  format: NonNullable<AssembledPrompt["format"]>
): string {
  const clean = sections
    .map((section) => format === "ordered" ? normalizePromptSection(section) : section.trim())
    .filter(Boolean);
  return syntax === "comfyui" ? clean.join(format === "ordered" ? ",\n\n" : ",\n") : clean.join(", ");
}

const renderedPromptCache = new WeakMap<AssembledPrompt, Partial<Record<Config["promptSyntax"], string>>>();

export function renderPrompt(prompt: AssembledPrompt, syntax: Config["promptSyntax"]): string {
  const cached = renderedPromptCache.get(prompt)?.[syntax];
  if (cached !== undefined) return cached;
  const rendered = joinSections(prompt.sections, syntax, prompt.format || "ordered");
  const entries = renderedPromptCache.get(prompt) || {};
  entries[syntax] = rendered;
  renderedPromptCache.set(prompt, entries);
  return rendered;
}

export function renderPromptWithCurrentAffixes(
  corePrompt: string,
  format: NonNullable<AssembledPrompt["format"]>,
  config: Config
): string {
  const preset = activePromptPreset(config);
  const clean = (value: string): string => format === "ordered" ? normalizePromptSection(value) : value.trim();
  const separator = config.promptSyntax === "comfyui" ? (format === "ordered" ? ",\n\n" : ",\n") : ", ";
  return [
    clean(preset?.positivePrefix || ""),
    clean(config.customPositivePrefix),
    corePrompt.trim(),
    clean(config.customPositiveSuffix)
  ].filter(Boolean).join(separator);
}

export function renderNegativeWithCurrentSelection(
  shotNegative: string,
  format: NonNullable<AssembledPrompt["format"]>,
  config: Config
): string {
  const preset = activePromptPreset(config);
  const negative = unique(csvParts(preset?.negativePrefix, config.customNegative, shotNegative)).join(", ");
  return format === "ordered" ? normalizePromptSection(negative) : negative.trim();
}

/** Makes model- and user-provided prompt fragments safe to join without altering weight syntax. */
export function normalizePromptSection(value: string): string {
  const doubleColon = "\uE000";
  return value
    .replace(/::/g, doubleColon)
    .replace(/;/g, ",")
    .replace(/\s*,(?:\s*,)+\s*/g, ", ")
    .replace(/^\s*,+\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/[.!?]+(?=\s*,)/g, "")
    .replace(/[\s.,;:!?]+$/g, "")
    .replace(new RegExp(doubleColon, "g"), "::")
    .trim();
}

function normalizeSupplement(value: string): string {
  return normalizePromptSection(value);
}

export function activePromptPreset(config: Config): PromptPreset | null {
  return config.promptPresets.find((preset) => preset.id === config.activePromptPresetId) || null;
}

function dedupePromptSections(sections: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const section of sections.map((value) => value.trim()).filter(Boolean)) {
    const key = section.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(section);
  }
  return output;
}

function removeSupplementActionDuplicates(supplement: string, actionTags: string): string {
  let next = supplement.trim();
  for (const action of csvParts(actionTags)) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(action)}\\b`, "gi"), " ");
  }
  return next.replace(/\s+([,.])/g, "$1").replace(/\s+/g, " ").trim();
}

const ACTION_STOP_WORDS = new Set(["a", "an", "at", "in", "of", "on", "s", "the", "to", "toward", "towards", "with"]);

function actionToken(value: string): string {
  const lower = value.toLowerCase();
  if (["face", "facing", "gaze", "gazing", "look", "looking", "looks"].includes(lower)) return "look";
  if (["spin", "spinning", "turn", "turning", "turns"].includes(lower)) return "turn";
  if (["march", "marching", "walk", "walking", "walks"].includes(lower)) return "walk";
  if (["pull", "pulling", "pulls"].includes(lower)) return "pull";
  if (["grip", "gripping", "grips"].includes(lower)) return "grip";
  if (["run", "running", "runs"].includes(lower)) return "run";
  if (["girl", "woman", "female"].includes(lower)) return "female";
  if (["boy", "man", "male"].includes(lower)) return "male";
  if (lower === "another") return "other";
  if (lower.endsWith("ing") && lower.length > 5) {
    const stem = lower.slice(0, -3);
    return stem.at(-1) === stem.at(-2) ? stem.slice(0, -1) : stem;
  }
  if (lower.endsWith("ed") && lower.length > 4) return lower.slice(0, -2);
  if (lower.endsWith("s") && lower.length > 3) return lower.slice(0, -1);
  return lower;
}

function actionTokens(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((token) => !ACTION_STOP_WORDS.has(token))
    .map(actionToken);
}

function tokenCovered(token: string, proseTokens: string[]): boolean {
  return proseTokens.some((candidate) =>
    candidate === token
    || (Math.min(candidate.length, token.length) >= 4 && (candidate.startsWith(token) || token.startsWith(candidate)))
  );
}

function uncoveredActionTags(value: unknown, composition: string): string {
  const actions = unique(csvParts(value));
  if (!composition) return actions.join(", ");
  const proseTokens = actionTokens(composition);
  return actions.filter((action) => {
    const tokens = actionTokens(action);
    return tokens.length === 0 || !tokens.every((token) => tokenCovered(token, proseTokens));
  }).join(", ");
}

function sanitizeComposition(value: string, replacements: Map<string, string>): string {
  return stripOrReplaceNames(value, replacements, false)
    .replace(/\bfrom\s+[A-Z][\p{L}\p{M}-]*(?:\s+[A-Z][\p{L}\p{M}-]*)*['’]s\s+POV\b/giu, "from the viewer's POV")
    .replace(/\s+/g, " ")
    .trim();
}

function assembleCharacterBlock(
  character: CharacterJson,
  config: Config,
  replacements: Map<string, string>,
  includeAction: boolean,
  perspectiveMode: PerspectiveMode
): string {
  if (perspectiveMode === "creative") {
    return unique(csvParts(
      stripOrReplaceNames(cleanString(character.visibleTags), replacements, true)
    )).join(", ");
  }
  return unique(csvParts(
    stripOrReplaceNames(cleanString(character.label), replacements, true),
    shouldIncludeCharacterNames(config) ? displayName(cleanString(character.name), config) : "",
    stripOrReplaceNames(cleanString(character.age), replacements, true),
    stripOrReplaceNames(cleanString(character.identity), replacements, true),
    stripOrReplaceNames(cleanString(character.appearance), replacements, true),
    stripOrReplaceNames(cleanString(character.avatarAppearance), replacements, true),
    stripOrReplaceNames(cleanString(character.body), replacements, true),
    stripOrReplaceNames(cleanString(character.avatarBody), replacements, true),
    stripOrReplaceNames(cleanString(character.attire), replacements, true),
    stripOrReplaceNames(cleanString(character.avatarAttire), replacements, true),
    stripOrReplaceNames(cleanString(character.expression), replacements, true),
    includeAction ? stripOrReplaceNames(cleanString(character.action), replacements, true) : ""
  )).join(", ");
}

type DynamicCameraResolution = {
  value: unknown;
  view: { framing: string; angle: string; perspective: string };
  adjusted: boolean;
  originalFraming: string;
};

function criticalVisibilityText(shot: ShotJson): string {
  const shotPlan = asRecord(shot.shotPlan);
  const structuredShotPlan = hasAtomicField(shotPlan, ["primaryAction", "secondaryCue", "staging"]);
  const shared = asRecord(shot.sharedComposition);
  const values: unknown[] = [
    structuredShotPlan ? "" : shot.action,
    typeof shot.shotPlan === "string" ? shot.shotPlan : "",
    shotPlan.primaryAction,
    shotPlan.secondaryCue,
    shotPlan.staging,
    typeof shot.sharedComposition === "string" ? shot.sharedComposition : "",
    shared.interaction,
    shared.spatialRelation
  ];
  for (const character of cleanArray<CharacterJson>(shot.characters)) {
    const composition = asRecord(character.composition);
    const structuredComposition = hasAtomicField(composition, ["position", "pose", "actions", "gaze"]);
    values.push(
      structuredComposition ? "" : character.action,
      typeof character.composition === "string" ? character.composition : "",
      composition.pose,
      composition.actions,
      composition.gaze
    );
  }
  return values.flatMap((value) => Array.isArray(value) ? csvParts(value) : [cleanString(value)]).filter(Boolean).join(" ").toLowerCase();
}

function requiredCriticalRegions(shot: ShotJson): { regions: Set<VisibilityRegion>; requiresEyes: boolean } {
  const text = criticalVisibilityText(shot);
  const regions = new Set<VisibilityRegion>();
  const add = (region: VisibilityRegion, pattern: RegExp): void => {
    if (pattern.test(text)) regions.add(region);
  };
  add("feet", /\b(?:feet|foot|ankles?|toes?|shoes?|boots?|sneakers?|sandals?|loafers?|slippers?|heels?|kick(?:s|ed|ing)?|stomp(?:s|ed|ing)?)\b/);
  add("legs", /\b(?:legs?|thighs?|knees?|calves?|leggings?|stockings?|tights|pantyhose)\b/);
  add("hips", /\b(?:hips?|waists?|skirts?|pants|trousers|slacks|shorts|jeans|underwear|panties)\b/);
  add("hands", /\b(?:hands?|fingers?|palms?|wrists?|gloves?|grip(?:s|ped|ping)?|punch(?:es|ed|ing)?)\b/);
  add("arms", /\b(?:arms?|sleeves?|elbows?|forearms?)\b/);
  add("torso", /\b(?:torsos?|chests?|breasts?|stomachs?|midriffs?|backs?|shirts?|jackets?|coats?|dresses?)\b/);
  add("face", /\b(?:face|expression|eyes?|eyebrows?|pupils?|irises?|heterochromia|tareme|tsurime|jitome|gaze|gazing|look(?:s|ed|ing)?|glare(?:s|d|ing)?|wink(?:s|ed|ing)?|blink(?:s|ed|ing)?|mouth|lips?|tears?|blush(?:es|ed|ing)?|smile(?:s|d|ing)?|grin(?:s|ned|ning)?|frown(?:s|ed|ing)?|cry(?:ing|ies|ied)?)\b/);
  add("head", /\b(?:head|hair|bangs|ponytails?|braids?|horns?|ears?|hats?|caps?)\b/);
  const requiresEyes = /\b(?:eyes?|eyebrows?|pupils?|irises?|heterochromia|tareme|tsurime|jitome|gaze|gazing|look(?:s|ed|ing)?|glare(?:s|d|ing)?|wink(?:s|ed|ing)?|blink(?:s|ed|ing)?)\b/.test(text);
  return { regions, requiresEyes };
}

function cameraValueWithView(camera: unknown, view: { framing: string; angle: string; perspective: string }): unknown {
  const record = asRecord(camera);
  if (Object.keys(record).length > 0) {
    return { ...record, framing: view.framing, angle: view.angle, perspective: view.perspective };
  }
  const text = cleanString(camera).toLowerCase();
  return {
    framing: view.framing,
    angle: view.angle,
    perspective: view.perspective,
    focus: CAMERA_FOCUS_VALUES.filter((value) => text.includes(value))
  };
}

function smallestCompatibleFraming(required: Set<VisibilityRegion>): string {
  const candidates = ["portrait", "medium close-up", "upper body", "cowboy shot", "full body"];
  return candidates.find((candidate) => {
    const regions = new Set(FRAMING_VISIBILITY_REGIONS[candidate]);
    return [...required].every((region) => regions.has(region));
  }) || "full body";
}

function fragmentProjectionRegions(shot: ShotJson): Set<VisibilityRegion> {
  const regions = new Set<VisibilityRegion>();
  for (const character of cleanArray<CharacterJson>(shot.characters)) {
    for (const tag of csvParts(cleanString(character.visibleTags))) {
      for (const region of tagVisibilityRegions(tag, "projection")) {
        if (region !== "figure") regions.add(region);
      }
    }
  }
  return regions;
}

function resolveDynamicCamera(shot: ShotJson): DynamicCameraResolution {
  const original = cameraViewOf(shot.camera);
  if (!original.framing) {
    return { value: shot.camera, view: original, adjusted: false, originalFraming: "" };
  }
  const critical = requiredCriticalRegions(shot);
  const rearView = /\bfrom behind\b|\bfrom the back\b|\bback view\b/.test(original.perspective);
  const repairedPerspective = critical.regions.has("face") && rearView ? "three-quarter view" : original.perspective;

  if (original.framing === "body-part focus") {
    const visibleRegions = fragmentProjectionRegions(shot);
    const missesCritical = [...critical.regions].some((region) => !visibleRegions.has(region));
    if (!missesCritical && repairedPerspective === original.perspective) {
      return { value: shot.camera, view: original, adjusted: false, originalFraming: original.framing };
    }
    const required = new Set([...visibleRegions, ...critical.regions]);
    const view = { ...original, framing: smallestCompatibleFraming(required), perspective: repairedPerspective };
    return {
      value: cameraValueWithView(shot.camera, view),
      view,
      adjusted: true,
      originalFraming: original.framing
    };
  }

  const originalRegions = new Set(FRAMING_VISIBILITY_REGIONS[original.framing] || ALL_VISIBILITY_REGIONS);
  const required = new Set([...originalRegions, ...critical.regions]);
  let framing = original.framing;
  const framingMissesCritical = [...critical.regions].some((region) => !originalRegions.has(region));
  if (framingMissesCritical || (critical.requiresEyes && original.framing === "eyes out of frame")) {
    framing = smallestCompatibleFraming(required);
  }
  const view = { ...original, framing, perspective: repairedPerspective };
  const adjusted = framing !== original.framing || repairedPerspective !== original.perspective;
  return {
    value: adjusted ? cameraValueWithView(shot.camera, view) : shot.camera,
    view,
    adjusted,
    originalFraming: original.framing
  };
}

function adultAgeMarker(character: CharacterJson, shot: ShotJson): string {
  const nsfw = csvParts(shot.situation).some((tag) => tag.toLowerCase() === "nsfw");
  const age = cleanString(character.age);
  return nsfw && /\b(?:adult|mature|aged up|old|elderly)\b/i.test(age) ? age : "";
}

function assembleFragmentCharacterBlock(
  character: CharacterJson,
  config: Config,
  replacements: Map<string, string>,
  camera: { framing: string; angle: string; perspective: string },
  shot: ShotJson
): string {
  const renderScope = cleanString(character.renderScope).toLowerCase();
  const modifiers = visibilityModifiersFor(camera.framing, camera.angle, camera.perspective, renderScope);
  const hideHead = camera.framing === "head out of frame" || /\bhead\s+out\s+of\s+frame\b/.test(renderScope);
  const hideFace = hideHead || modifiers.hideFace || /\bface\s+out\s+of\s+frame\b/.test(renderScope);
  const hideEyes = hideFace || modifiers.hideEyes || /\beyes?\s+out\s+of\s+frame\b/.test(renderScope);
  const projection = csvParts(stripOrReplaceNames(cleanString(character.visibleTags), replacements, true)).filter((tag) => {
    const tagRegions = tagVisibilityRegions(tag, "projection");
    if (hideHead && tagRegions.some((region) => region === "head" || region === "face")) return false;
    if (hideFace && tagRegions.includes("face")) return false;
    if (hideEyes && EYE_TAG.test(tag.toLowerCase())) return false;
    return true;
  });
  return unique(csvParts(
    stripOrReplaceNames(cleanString(character.label), replacements, true),
    shouldIncludeCharacterNames(config) ? displayName(cleanString(character.name), config) : "",
    stripOrReplaceNames(adultAgeMarker(character, shot), replacements, true),
    projection.join(", ")
  )).join(", ");
}

/** Projects one Dynamic character without mutating its complete baseline. */
function assembleVisibilityTierCharacterBlock(
  character: CharacterJson,
  config: Config,
  replacements: Map<string, string>,
  camera: { framing: string; angle: string; perspective: string },
  shot: ShotJson,
  ignoreOcclusionScope: boolean,
  ignoreFragmentScope: boolean
): string {
  const renderScope = cleanString(character.renderScope);
  const fragment = isFragmentCameraFraming(camera.framing) || (!ignoreFragmentScope && isFragmentRenderScope(renderScope));
  if (fragment) return assembleFragmentCharacterBlock(character, config, replacements, camera, shot);

  const modifierScope = ignoreOcclusionScope ? "" : renderScope;
  const modifiers = visibilityModifiersFor(camera.framing, camera.angle, camera.perspective, modifierScope);
  const regions = new Set(FRAMING_VISIBILITY_REGIONS[camera.framing] || ALL_VISIBILITY_REGIONS);
  if (modifiers.hideFace) regions.delete("face");
  const faceReadable = regions.has("face");

  const projected: string[] = [];
  for (const { tag, source } of baselineTags(character)) {
    if (modifiers.hideEyes && EYE_TAG.test(tag.toLowerCase())) continue;
    if (tagVisibilityRegions(tag, source).some((region) => regions.has(region))) projected.push(tag);
  }
  for (const tag of csvParts(stripOrReplaceNames(cleanString(character.visibleTags), replacements, true))) {
    if (projected.some((candidate) => candidate.toLowerCase() === tag.toLowerCase())) continue;
    if (modifiers.hideEyes && EYE_TAG.test(tag.toLowerCase())) continue;
    if (tagVisibilityRegions(tag, "projection").some((region) => regions.has(region))) projected.push(tag);
  }

  return unique(csvParts(
    stripOrReplaceNames(cleanString(character.label), replacements, true),
    shouldIncludeCharacterNames(config) ? displayName(cleanString(character.name), config) : "",
    stripOrReplaceNames(faceReadable ? cleanString(character.age) : adultAgeMarker(character, shot), replacements, true),
    projected.map((tag) => stripOrReplaceNames(tag, replacements, true)).join(", "),
    faceReadable ? stripOrReplaceNames(cleanString(character.expression), replacements, true) : ""
  )).join(", ");
}

function structuredSnippets(value: unknown, cap: number): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => csvParts(entry))
    .map((entry) => cleanString(entry))
    .filter(Boolean)
    .slice(0, cap);
}

const CAMERA_FRAMING = new Set<string>(CAMERA_FRAMING_VALUES);
const CAMERA_ANGLE = new Set<string>(CAMERA_ANGLE_VALUES);
const CAMERA_PERSPECTIVE = new Set<string>(CAMERA_PERSPECTIVE_VALUES);
const CAMERA_FOCUS = new Set<string>(CAMERA_FOCUS_VALUES);

type AtomicSection = { text: string; structured: boolean };
type SharedAtomicSection = AtomicSection & { interaction: string; relation: string };

function hasAtomicField(record: Record<string, unknown>, fields: string[]): boolean {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(record, field));
}

function sanitizedAtomicSnippets(
  value: unknown,
  cap: number,
  replacements: Map<string, string>
): string[] {
  return structuredSnippets(value, cap)
    .map((snippet) => sanitizeComposition(snippet, replacements))
    .filter(Boolean);
}

function assembleAtomicCharacterComposition(value: unknown, replacements: Map<string, string>): AtomicSection {
  const record = asRecord(value);
  const fields = ["position", "pose", "actions", "gaze"];
  const structured = hasAtomicField(record, fields);
  if (!structured) return { text: sanitizeComposition(cleanString(value), replacements), structured: false };
  const snippets = unique([
    ...sanitizedAtomicSnippets(record.position, 1, replacements),
    ...sanitizedAtomicSnippets(record.pose, 1, replacements),
    ...sanitizedAtomicSnippets(record.actions, 3, replacements),
    ...sanitizedAtomicSnippets(record.gaze, 1, replacements)
  ]);
  return { text: snippets.join(", "), structured: true };
}

function assembleDynamicCharacterComposition(
  value: unknown,
  replacements: Map<string, string>,
  priority: string
): AtomicSection {
  const record = asRecord(value);
  const fields = ["position", "pose", "actions", "gaze"];
  const structured = hasAtomicField(record, fields);
  if (!structured) return { text: sanitizeComposition(cleanString(value), replacements), structured: false };
  const priorityTokens = actionTokens(priority);
  const uncovered = (snippet: string): boolean => {
    const tokens = actionTokens(snippet);
    return tokens.length === 0 || !tokens.every((token) => tokenCovered(token, priorityTokens));
  };
  const actions = sanitizedAtomicSnippets(record.actions, 3, replacements).filter(uncovered);
  return {
    text: unique([
      ...sanitizedAtomicSnippets(record.position, 1, replacements),
      ...sanitizedAtomicSnippets(record.pose, 1, replacements),
      ...actions,
      ...sanitizedAtomicSnippets(record.gaze, 1, replacements)
    ]).join(", "),
    structured: true
  };
}

function assembleStaticCharacterComposition(
  value: unknown,
  replacements: Map<string, string>,
  index: number,
  characterCount: number
): AtomicSection {
  const composition = asRecord(value);
  const pose = sanitizedAtomicSnippets(composition.pose, 1, replacements);
  const gaze = sanitizedAtomicSnippets(composition.gaze, 1, replacements);
  const concretePose = pose[0] && !/\bpos(?:e|es|ed|ing)\b/i.test(pose[0])
    ? pose[0]
    : "standing upright with arms relaxed at sides";
  const position = characterCount === 1
    ? "slightly forward from the background"
    : index === 0
      ? "left side slightly forward from the background"
      : index === characterCount - 1
        ? "right side slightly forward from the background"
        : "center slightly forward from the background";
  return {
    text: unique([
      position,
      concretePose,
      ...gaze
    ]).join(", "),
    structured: true
  };
}

function assembleAtomicSharedComposition(value: unknown, replacements: Map<string, string>): SharedAtomicSection {
  const record = asRecord(value);
  const fields = ["interaction", "spatialRelation"];
  const structured = hasAtomicField(record, fields);
  if (!structured) {
    const text = sanitizeComposition(cleanString(value), replacements);
    return { text, interaction: "", relation: "", structured: false };
  }
  const interactionParts = unique(sanitizedAtomicSnippets(record.interaction, 2, replacements));
  const relationParts = unique(sanitizedAtomicSnippets(record.spatialRelation, 1, replacements));
  return {
    text: unique([...interactionParts, ...relationParts]).join(", "),
    interaction: interactionParts.join(", "),
    relation: relationParts.join(", "),
    structured: true
  };
}

function allowedCameraSnippets(value: unknown, cap: number, allowed: Set<string>): string[] {
  return structuredSnippets(value, cap)
    .map((snippet) => snippet.toLowerCase().replace(/\s+/g, " ").trim())
    .filter((snippet) => allowed.has(snippet));
}

function assembleStructuredCamera(value: unknown): AtomicSection {
  const record = asRecord(value);
  const fields = ["framing", "angle", "perspective", "focus"];
  const structured = hasAtomicField(record, fields);
  if (!structured) return { text: unique(csvParts(cleanString(value))).join(", "), structured: false };
  return {
    text: unique([
      ...allowedCameraSnippets(record.framing, 1, CAMERA_FRAMING),
      ...allowedCameraSnippets(record.angle, 1, CAMERA_ANGLE),
      ...allowedCameraSnippets(record.perspective, 1, CAMERA_PERSPECTIVE),
      ...allowedCameraSnippets(record.focus, 2, CAMERA_FOCUS)
    ]).join(", "),
    structured: true
  };
}

function assembleDynamicShotPlan(value: unknown, replacements: Map<string, string>): AtomicSection {
  const record = asRecord(value);
  const fields = ["primaryAction", "secondaryCue", "staging"];
  const structured = hasAtomicField(record, fields);
  if (!structured) return { text: sanitizeComposition(cleanString(value), replacements), structured: false };
  return {
    text: unique([
      ...sanitizedAtomicSnippets(record.primaryAction, 1, replacements),
      ...sanitizedAtomicSnippets(record.secondaryCue, 1, replacements),
      ...sanitizedAtomicSnippets(record.staging, 1, replacements)
    ]).join(", "),
    structured: true
  };
}

function identitySafeCreativeSituation(value: unknown): string {
  return unique(csvParts(value).filter((tag) =>
    !/^(?:\d+(?:girl|boy|other)s?|girl|boy|other|solo|group)$/i.test(tag.trim())
  )).join(", ");
}

function normalizedSituation(value: unknown, characterCount: number): string {
  const tags = unique(csvParts(value));
  if (characterCount !== 1 || tags.some((tag) => tag.toLowerCase() === "solo")) return tags.join(", ");
  return unique([...tags, tags.some((tag) => /^1(?:girl|boy|other)$/i.test(tag.trim())) ? "solo" : ""]).join(", ");
}

function assetSituation(value: unknown, character: CharacterJson | undefined): string {
  const label = csvParts(character?.label, character?.age).join(" ").toLowerCase();
  const count = /\b(?:girl|female|woman)\b/.test(label)
    ? "1girl"
    : /\b(?:boy|male|man)\b/.test(label)
      ? "1boy"
      : "1other";
  const explicitRating = csvParts(value).filter((tag) => tag.toLowerCase() === "nsfw");
  return unique([count, "solo", ...explicitRating]).join(", ");
}

function assembleAssetCharacterComposition(value: unknown, replacements: Map<string, string>): AtomicSection {
  const record = asRecord(value);
  const fields = ["position", "pose", "actions", "gaze"];
  const structured = hasAtomicField(record, fields);
  if (!structured) {
    return {
      text: unique(csvParts(sanitizeComposition(cleanString(value), replacements), "looking at viewer")).join(", "),
      structured: false
    };
  }
  return {
    text: unique([
      ...sanitizedAtomicSnippets(record.position, 1, replacements),
      ...sanitizedAtomicSnippets(record.pose, 1, replacements),
      ...sanitizedAtomicSnippets(record.actions, 3, replacements),
      "looking at viewer"
    ]).join(", "),
    structured: true
  };
}

function creativeCueTags(anchor: unknown, visibleCues: unknown, parserVisibleTags: unknown = ""): string {
  const cues = unique(csvParts(visibleCues));
  const anchorText = cleanString(anchor);
  const cueTokens = actionTokens(cues.join(" "));
  const anchorTokens = actionTokens(anchorText);
  const anchorCovered = anchorTokens.length > 0 && anchorTokens.every((token) => tokenCovered(token, cueTokens));
  const safeParserTags = csvParts(parserVisibleTags).filter(isIdentitySafeCreativeCue);
  return unique(csvParts(anchorCovered ? "" : anchorText, cues, safeParserTags)).join(", ");
}

function assembleAnimaPrompt(
  scene: SceneJson,
  shot: ShotJson,
  config: Config,
  replacements: Map<string, string>,
  perspectiveMode: PerspectiveMode,
  creativeConcept?: CreativeConcept,
  dynamicLayout: "hybrid" | "compact" = "hybrid"
): AssembledPrompt {
  const allCharacters = cleanArray<CharacterJson>(shot.characters).slice(0, perspectiveMode === "asset" ? 1 : config.maxCharacters);
  const bindingCreative = perspectiveMode === "creative" && Boolean(creativeConcept);
  const characters = bindingCreative ? allCharacters.slice(0, 1) : allCharacters;
  const dynamicShotPlan = perspectiveMode === "dynamic"
    ? assembleDynamicShotPlan(shot.shotPlan, replacements)
    : { text: "", structured: false };
  const dynamicCamera = perspectiveMode === "dynamic"
    ? resolveDynamicCamera(shot)
    : { value: shot.camera, view: { framing: "", angle: "", perspective: "" }, adjusted: false, originalFraming: "" };
  const cameraView = dynamicCamera.view;
  const compactDynamic = perspectiveMode === "dynamic" && dynamicShotPlan.structured && Boolean(dynamicShotPlan.text);
  const hybridDynamic = compactDynamic && dynamicLayout === "hybrid";
  const conceptScope = perspectiveMode === "creative"
    ? sanitizeComposition(cleanString(creativeConcept?.renderScope), replacements)
    : "";
  const characterParts = characters.map((character, index) => {
    const composition = perspectiveMode === "asset"
      ? assembleAssetCharacterComposition(character.composition, replacements)
      : perspectiveMode === "static"
      ? assembleStaticCharacterComposition(character.composition, replacements, index, characters.length)
      : hybridDynamic
        ? assembleDynamicCharacterComposition(character.composition, replacements, dynamicShotPlan.text)
      : assembleAtomicCharacterComposition(character.composition, replacements);
    const scope = perspectiveMode === "creative"
      ? (index === 0 && conceptScope)
        || (() => {
          const parserScope = sanitizeComposition(cleanString(character.renderScope), replacements);
          return isIdentitySafeCreativeCue(parserScope) ? parserScope : "";
        })()
      : "";
    const compositionText = perspectiveMode === "creative" ? scope : composition.text;
    const conceptTags = perspectiveMode === "creative" && index === 0
      ? stripOrReplaceNames(
        creativeCueTags(creativeConcept?.anchor, creativeConcept?.visibleCues, character.visibleTags),
        replacements,
        true
      )
      : "";
    const baseTags = conceptTags || (perspectiveMode === "dynamic"
      ? assembleVisibilityTierCharacterBlock(
        character,
        config,
        replacements,
        cameraView,
        shot,
        dynamicCamera.adjusted,
        dynamicCamera.adjusted && isFragmentCameraFraming(dynamicCamera.originalFraming) && characters.length === 1
      )
      : assembleCharacterBlock(character, config, replacements, false, perspectiveMode));
    const uncoveredActions = composition.structured
      ? ""
      : stripOrReplaceNames(uncoveredActionTags(character.action, compositionText), replacements, true);
    const tags = unique(csvParts(baseTags, uncoveredActions)).join(", ");
    return {
      compositionText,
      sections: compactDynamic && !hybridDynamic ? [tags].filter(Boolean) : [compositionText, tags].filter(Boolean)
    };
  });
  const characterSections = characterParts.flatMap((part) => part.sections);
  const unboundCreativeCues = bindingCreative && characters.length === 0
    ? stripOrReplaceNames(
      creativeCueTags(creativeConcept?.anchor, creativeConcept?.visibleCues),
      replacements,
      true
    )
    : "";
  const individualComposition = characterParts.map((part) => part.compositionText).filter(Boolean).join(", ");
  const hasSharedComposition = Boolean(cleanString(shot.sharedComposition))
    || Object.keys(asRecord(shot.sharedComposition)).length > 0;
  const sharedSource = hasSharedComposition
    ? shot.sharedComposition
    : shot.supplement;
  const sharedComposition = assembleAtomicSharedComposition(sharedSource, replacements);
  const filteredSharedInteraction = sharedComposition.structured
    ? uncoveredActionTags(sharedComposition.interaction, individualComposition)
    : sharedComposition.interaction;
  const filteredSharedText = sharedComposition.structured
    ? unique(csvParts(filteredSharedInteraction, sharedComposition.relation)).join(", ")
    : sharedComposition.text;
  const sharedAction = sharedComposition.structured
    ? (config.supplement ? "" : filteredSharedInteraction)
    : stripOrReplaceNames(
      uncoveredActionTags(shot.action, config.supplement ? sharedComposition.text : ""),
      replacements,
      true
    );
  const camera = perspectiveMode === "asset"
    ? { text: "portrait, cowboy shot", structured: false }
    : perspectiveMode === "static"
    ? { text: "medium shot, eye level, straight-on, deep focus", structured: true }
    : perspectiveMode === "creative" && cleanString(creativeConcept?.camera)
      ? { text: cleanString(creativeConcept?.camera), structured: false }
    : assembleStructuredCamera(perspectiveMode === "dynamic" ? dynamicCamera.value : shot.camera);
  const environment = scene.environment || {};
  const location = structuredSnippets(environment.location, 1);
  const timeWeather = structuredSnippets(environment.timeWeather, 1);
  const lightingMood = config.supplement
    ? structuredSnippets(environment.lightingMood, compactDynamic ? 1 : 3)
    : [];
  const backgroundElements = config.supplement || perspectiveMode === "static"
    ? structuredSnippets(environment.backgroundElements, compactDynamic ? 3 : 5)
    : [];
  const legacyPlace = location.length === 0 ? stripOrReplaceNames(cleanString(scene.place), replacements, true) : "";
  const environmentSection = perspectiveMode === "asset" ? "white background, simple background" : [
    ...location.map((value) => stripOrReplaceNames(value, replacements, false)),
    legacyPlace,
    ...timeWeather.map((value) => stripOrReplaceNames(value, replacements, false)),
    ...lightingMood.map((value) => stripOrReplaceNames(value, replacements, false)),
    ...backgroundElements.map((value) => stripOrReplaceNames(value, replacements, false))
  ].filter(Boolean).join(", ");
  return { sections: [
    stripOrReplaceNames(
      perspectiveMode === "asset"
        ? assetSituation(shot.situation, characters[0])
        : bindingCreative
        ? identitySafeCreativeSituation(shot.situation)
        : compactDynamic && !hybridDynamic
          ? unique(csvParts(shot.situation)).join(", ")
          : hybridDynamic || perspectiveMode === "static"
            ? normalizedSituation(shot.situation, characters.length)
            : unique(csvParts(shot.situation)).join(", "),
      replacements,
      true
    ),
    compactDynamic ? stripOrReplaceNames(camera.text, replacements, true) : "",
    compactDynamic ? dynamicShotPlan.text : "",
    perspectiveMode === "creative" && characters.length === 0 ? conceptScope : "",
    unboundCreativeCues,
    ...characterSections,
    !compactDynamic && config.supplement && perspectiveMode !== "static" && perspectiveMode !== "asset" && !bindingCreative ? filteredSharedText : "",
    !compactDynamic && perspectiveMode !== "static" && perspectiveMode !== "asset" && !bindingCreative ? sharedAction : "",
    bindingCreative ? "" : environmentSection,
    compactDynamic ? "" : stripOrReplaceNames(camera.text, replacements, true)
  ].map((section) => section.trim()).filter(Boolean) };
}

function assembleDefaultPrompt(
  scene: SceneJson,
  shot: ShotJson,
  config: Config,
  replacements: Map<string, string>,
  perspectiveMode: PerspectiveMode,
  creativeConcept?: CreativeConcept
): AssembledPrompt {
  const allCharacters = cleanArray<CharacterJson>(shot.characters).slice(0, perspectiveMode === "asset" ? 1 : config.maxCharacters);
  const bindingCreative = perspectiveMode === "creative" && Boolean(creativeConcept);
  const characters = bindingCreative ? allCharacters.slice(0, 1) : allCharacters;
  const selectedScope = perspectiveMode === "creative"
    ? sanitizeComposition(cleanString(creativeConcept?.renderScope), replacements)
    : "";
  const creativeScopes = perspectiveMode === "creative"
    ? selectedScope
      ? [selectedScope]
      : unique(characters.map((character) => sanitizeComposition(cleanString(character.renderScope), replacements)).filter(Boolean))
    : [];
  const characterBlocks = characters
    .map((character, index) => {
      const conceptTags = perspectiveMode === "creative" && index === 0
        ? stripOrReplaceNames(unique(csvParts(creativeConcept?.visibleCues)).join(", "), replacements, true)
        : "";
      const block = conceptTags || assembleCharacterBlock(character, config, replacements, true, perspectiveMode);
      return perspectiveMode === "asset" ? unique(csvParts(block, "looking at viewer")).join(", ") : block;
    })
    .filter(Boolean);
  const supplement = config.supplement && !(perspectiveMode === "creative" && creativeScopes.length > 0)
    ? normalizeSupplement(stripOrReplaceNames(cleanString(shot.supplement), replacements, false))
    : "";
  const tagSections = dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(
      perspectiveMode === "asset"
        ? "portrait, cowboy shot"
        : perspectiveMode === "creative" && cleanString(creativeConcept?.camera)
        ? creativeConcept?.camera
        : shot.camera,
      perspectiveMode === "asset"
        ? assetSituation(shot.situation, characters[0])
        : bindingCreative ? identitySafeCreativeSituation(shot.situation) : shot.situation,
      perspectiveMode === "creative" && creativeScopes.length > 0 ? "" : shot.action
    )).join(", "), replacements, true),
    perspectiveMode === "asset"
      ? "white background, simple background"
      : bindingCreative ? "" : stripOrReplaceNames(unique(csvParts(scene.place)).join(", "), replacements, true),
    ...creativeScopes,
    ...characterBlocks
  ]);
  return { sections: [...tagSections, supplement].filter(Boolean), format: "legacy" };
}

function assemblePromptForPerspective(
  scene: SceneJson,
  shot: ShotJson,
  config: Config,
  parserParagraph: number,
  originalParagraph: number,
  perspective: ReturnType<typeof resolveShotPerspective>,
  creativeConcept?: CreativeConcept,
  evaluationOptions?: { dynamicLayout?: "hybrid" | "compact" }
): PromptEntry {
  const characters = cleanArray<CharacterJson>(shot.characters);
  const replacements = buildNameReplacementMap(characters);
  const core = config.promptStyle === "anima"
    ? assembleAnimaPrompt(
      scene,
      shot,
      config,
      replacements,
      perspective.mode,
      creativeConcept,
      evaluationOptions?.dynamicLayout || "hybrid"
    )
    : assembleDefaultPrompt(scene, shot, config, replacements, perspective.mode, creativeConcept);
  const preset = activePromptPreset(config);
  const presetPrefix = stripOrReplaceNames(preset?.positivePrefix || "", replacements, true);
  const prefix = stripOrReplaceNames(config.customPositivePrefix, replacements, true);
  const suffix = stripOrReplaceNames(config.customPositiveSuffix, replacements, true);
  const prefixes = [presetPrefix, prefix].filter(Boolean);
  const format = core.format || "ordered";
  const corePrompt: AssembledPrompt = { sections: [...core.sections], format };
  const shotNegative = stripOrReplaceNames(unique(csvParts(shot.negative)).join(", "), replacements, true);
  return {
    prompt: {
      sections: [...prefixes, ...core.sections, suffix].map((section) => section.trim()).filter(Boolean),
      format
    },
    corePrompt,
    shotNegative,
    negative: format === "ordered"
      ? normalizePromptSection(stripOrReplaceNames(
        unique(csvParts(preset?.negativePrefix, config.customNegative, shotNegative)).join(", "),
        replacements,
        true
      ))
      : stripOrReplaceNames(
        unique(csvParts(preset?.negativePrefix, config.customNegative, shotNegative)).join(", "),
        replacements,
        true
      ),
    placement: "paragraph",
    paragraph: originalParagraph,
    parserParagraph,
    perspectiveMode: perspective.mode,
    perspectiveSource: perspective.source,
    creativeConcept: perspective.mode === "creative" ? creativeConcept : undefined
  };
}


export function assemblePrompt(
  scene: SceneJson,
  shot: ShotJson,
  config: Config,
  parserParagraph: number,
  originalParagraph: number,
  creativeConcept?: CreativeConcept,
  evaluationOptions?: { dynamicLayout?: "hybrid" | "compact" }
): PromptEntry {
  return assemblePromptForPerspective(
    scene,
    shot,
    config,
    parserParagraph,
    originalParagraph,
    resolveShotPerspective(shot, config),
    creativeConcept,
    evaluationOptions
  );
}


/**
 * Direct compiler over a validated ResolvedShot. It projects canonical values
 * only into the renderer's small input view; it does not rebuild parser
 * objects, resolve perspective a second time, or call the legacy assembler.
 */
export function compilePrompt(
  resolved: ResolvedShot,
  config: Config,
  options?: { dynamicLayout?: "hybrid" | "compact" }
): PromptEntry {
  const plan = resolved.plan;
  const renderShot = {
    camera: resolved.cameraText || resolved.camera,
    ...(plan.mode === "dynamic"
      ? {
        shotPlan: {
          ...(plan.primaryAction ? { primaryAction: plan.primaryAction } : {}),
          ...(plan.secondaryCue ? { secondaryCue: plan.secondaryCue } : {}),
          ...(plan.staging ? { staging: plan.staging } : {})
        }
      }
      : {}),
    situation: resolved.situation,
    action: resolved.action,
    characters: resolved.characters.map((character) => ({
      ...character,
      visibleTags: character.visibleTags.join(", ")
    })),
    sharedComposition: resolved.sharedComposition,
    supplement: resolved.supplement,
    negative: resolved.negative
  };
  const renderScene = {
    place: resolved.place,
    environment: resolved.environment
  };
  const perspective: ReturnType<typeof resolveShotPerspective> = {
    mode: plan.mode,
    source: config.adaptiveMode ? "adaptive" : "manual"
  };
  const concept = plan.mode === "creative" ? plan.concept : undefined;
  return assemblePromptForPerspective(
    renderScene,
    renderShot,
    config,
    resolved.paragraph,
    resolved.paragraph,
    perspective,
    concept,
    options
  );
}
