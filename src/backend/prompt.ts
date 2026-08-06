import type { Config, PerspectiveMode, PromptPreset } from "../shared/config.js";
import {
  CAMERA_ANGLE_VALUES,
  CAMERA_FOCUS_VALUES,
  CAMERA_FRAMING_VALUES,
  CAMERA_PERSPECTIVE_VALUES
} from "./camera-diversity.js";
import { isIdentitySafeCreativeCue } from "./creative.js";
import type { AssembledPrompt, CharacterJson, CreativeConcept, PromptEntry, SceneJson, ShotJson } from "./types.js";
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
    stripOrReplaceNames(cleanString(character.body), replacements, true),
    stripOrReplaceNames(cleanString(character.attire), replacements, true),
    stripOrReplaceNames(cleanString(character.expression), replacements, true),
    includeAction ? stripOrReplaceNames(cleanString(character.action), replacements, true) : ""
  )).join(", ");
}

function assembleProjectedCharacterBlock(
  character: CharacterJson,
  config: Config,
  replacements: Map<string, string>
): string {
  const projection = stripOrReplaceNames(cleanString(character.visibleTags), replacements, true);
  if (!projection) return assembleCharacterBlock(character, config, replacements, false, "dynamic");
  const excludesReadableFace = isFragmentRenderScope(character.renderScope);
  return unique(csvParts(
    stripOrReplaceNames(cleanString(character.label), replacements, true),
    shouldIncludeCharacterNames(config) ? displayName(cleanString(character.name), config) : "",
    excludesReadableFace ? "" : stripOrReplaceNames(cleanString(character.age), replacements, true),
    projection,
    excludesReadableFace ? "" : stripOrReplaceNames(cleanString(character.expression), replacements, true)
  )).join(", ");
}

function isFragmentRenderScope(value: unknown): boolean {
  const scope = cleanString(value).toLowerCase();
  return /\b(?:head|face|eyes)\s+out\s+of\s+frame\b|\b(?:hand|hands|feet|foot|lower body|torso|back|shoulder|silhouette|shadow)\s+(?:only|detail|focus)\b|\bonly\s+(?:the\s+)?(?:hand|hands|feet|foot|lower body|torso|back|shoulder|silhouette|shadow)\b/.test(scope);
}

export function resolveShotPerspective(
  shot: ShotJson,
  config: Config
): { mode: PerspectiveMode; source: "adaptive" | "manual" } {
  if (!config.adaptiveMode) return { mode: config.perspectiveMode, source: "manual" };
  const candidate = cleanString(shot.perspectiveMode).toLowerCase();
  return candidate === "creative" || candidate === "static" || candidate === "dynamic"
    ? { mode: candidate, source: "adaptive" }
    : { mode: "dynamic", source: "adaptive" };
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
    const baseTags = conceptTags || (compactDynamic
      ? isFragmentRenderScope(character.renderScope)
        ? assembleProjectedCharacterBlock(character, config, replacements)
        : hybridDynamic
          ? assembleCharacterBlock(character, config, replacements, false, "dynamic")
          : assembleProjectedCharacterBlock(character, config, replacements)
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
    : assembleStructuredCamera(shot.camera);
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

export function assemblePrompt(
  scene: SceneJson,
  shot: ShotJson,
  config: Config,
  parserParagraph: number,
  originalParagraph: number,
  creativeConcept?: CreativeConcept,
  evaluationOptions?: { dynamicLayout?: "hybrid" | "compact" }
): PromptEntry {
  const characters = cleanArray<CharacterJson>(shot.characters);
  const replacements = buildNameReplacementMap(characters);
  const perspective = resolveShotPerspective(shot, config);
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
    paragraph: originalParagraph,
    parserParagraph,
    perspectiveMode: perspective.mode,
    perspectiveSource: perspective.source,
    creativeConcept: perspective.mode === "creative" ? creativeConcept : undefined
  };
}
