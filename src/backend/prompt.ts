import type { Config, PromptPreset } from "../shared/config.js";
import type { AssembledPrompt, CharacterJson, PromptEntry, SceneJson, ShotJson } from "./types.js";
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
  for (const character of characters) {
    const descriptor = characterDescriptor(character);
    const raw = cleanString(character.name);
    const normalized = normalizeCharacterName(raw);
    for (const name of unique([raw, normalized].filter(Boolean))) {
      if (name.length >= 2) replacements.set(name, descriptor);
    }
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

export function renderPrompt(prompt: AssembledPrompt, syntax: Config["promptSyntax"]): string {
  return joinSections(prompt.sections, syntax, prompt.format || "ordered");
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

const ACTION_STOP_WORDS = new Set(["a", "an", "at", "in", "of", "on", "the", "to", "toward", "towards", "with"]);

function actionToken(value: string): string {
  const lower = value.toLowerCase();
  if (["face", "facing", "gaze", "gazing", "look", "looking", "looks"].includes(lower)) return "look";
  if (["spin", "spinning", "turn", "turning", "turns"].includes(lower)) return "turn";
  if (["march", "marching", "walk", "walking", "walks"].includes(lower)) return "walk";
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
  includeAction: boolean
): string {
  return unique(csvParts(
    stripOrReplaceNames(cleanString(character.label), replacements, true),
    shouldIncludeCharacterNames(config) ? displayName(cleanString(character.name), config) : "",
    stripOrReplaceNames(cleanString(character.age), replacements, true),
    stripOrReplaceNames(cleanString(character.appearance), replacements, true),
    stripOrReplaceNames(cleanString(character.body), replacements, true),
    stripOrReplaceNames(cleanString(character.attire), replacements, true),
    stripOrReplaceNames(cleanString(character.expression), replacements, true),
    includeAction ? stripOrReplaceNames(cleanString(character.action), replacements, true) : ""
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

const CAMERA_FRAMING = new Set([
  "portrait", "close-up", "medium close-up", "upper body", "medium shot", "cowboy shot", "feet out of frame",
  "full body", "wide shot", "lower body", "head out of frame", "eyes out of frame", "body-part focus"
]);
const CAMERA_ANGLE = new Set(["eye level", "low angle", "high angle", "dutch angle"]);
const CAMERA_PERSPECTIVE = new Set([
  "straight-on", "from above", "from behind", "from below", "from side", "sideways", "three-quarter view", "pov"
]);
const CAMERA_FOCUS = new Set([
  "shallow depth of field", "deep focus", "background blur", "foreground blur", "motion blur", "fisheye",
  "wide-angle lens", "telephoto lens"
]);

type AtomicSection = { text: string; structured: boolean };
type SharedAtomicSection = AtomicSection & { interaction: string };

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

function assembleAtomicSharedComposition(value: unknown, replacements: Map<string, string>): SharedAtomicSection {
  const record = asRecord(value);
  const fields = ["interaction", "spatialRelation"];
  const structured = hasAtomicField(record, fields);
  if (!structured) {
    const text = sanitizeComposition(cleanString(value), replacements);
    return { text, interaction: "", structured: false };
  }
  const interactionParts = unique(sanitizedAtomicSnippets(record.interaction, 2, replacements));
  const relationParts = unique(sanitizedAtomicSnippets(record.spatialRelation, 1, replacements));
  return {
    text: unique([...interactionParts, ...relationParts]).join(", "),
    interaction: interactionParts.join(", "),
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

function assembleAnimaAssetPrompt(
  scene: SceneJson,
  shot: ShotJson,
  config: Config,
  replacements: Map<string, string>
): AssembledPrompt {
  const character = cleanArray<CharacterJson>(shot.characters)[0];
  const characterBlock = character ? assembleCharacterBlock(character, config, replacements, false) : "";
  const action = stripOrReplaceNames(unique(csvParts(
    shot.action,
    character?.action,
    "looking at viewer"
  )).join(", "), replacements, true);
  return { sections: dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(shot.situation)).join(", "), replacements, true),
    characterBlock,
    action,
    stripOrReplaceNames(unique(csvParts(shot.camera, "portrait, cowboy shot")).join(", "), replacements, true),
    stripOrReplaceNames(unique(csvParts(scene.place, "white background, simple background")).join(", "), replacements, true)
  ]) };
}

function assembleLegacyAnimaPrompt(
  scene: SceneJson,
  shot: ShotJson,
  config: Config,
  replacements: Map<string, string>
): AssembledPrompt {
  const maxCharacters = config.mode === "asset" ? 1 : config.maxCharacters;
  const characters = cleanArray<CharacterJson>(shot.characters).slice(0, maxCharacters);
  const characterBlocks = characters
    .map((character) => assembleCharacterBlock(character, config, replacements, false))
    .filter(Boolean);
  const sceneAction = stripOrReplaceNames(unique(csvParts(
    shot.action,
    ...characters.map((character) => character.action),
    config.mode === "asset" ? "looking at viewer" : ""
  )).join(", "), replacements, true);
  const supplement = config.supplement
    ? stripOrReplaceNames(removeSupplementActionDuplicates(cleanString(shot.supplement), sceneAction), replacements, false)
    : "";
  return {
    sections: [
      ...dedupePromptSections([
        stripOrReplaceNames(unique(csvParts(shot.situation)).join(", "), replacements, true),
        ...characterBlocks,
        sceneAction,
        stripOrReplaceNames(unique(csvParts(shot.camera, config.mode === "asset" ? "portrait, cowboy shot" : "")).join(", "), replacements, true),
        stripOrReplaceNames(unique(csvParts(scene.place, config.mode === "asset" ? "white background, simple background" : "")).join(", "), replacements, true)
      ]),
      supplement
    ].filter(Boolean),
    format: "legacy"
  };
}

function assembleAnimaPrompt(
  scene: SceneJson,
  shot: ShotJson,
  config: Config,
  replacements: Map<string, string>
): AssembledPrompt {
  if (config.mode === "asset") return assembleAnimaAssetPrompt(scene, shot, config, replacements);
  const maxCharacters = config.maxCharacters;
  const characters = cleanArray<CharacterJson>(shot.characters).slice(0, maxCharacters);
  const characterSections = characters.flatMap((character) => {
    const composition = assembleAtomicCharacterComposition(character.composition, replacements);
    const baseTags = assembleCharacterBlock(character, config, replacements, false);
    const uncoveredActions = composition.structured
      ? ""
      : stripOrReplaceNames(uncoveredActionTags(character.action, composition.text), replacements, true);
    const tags = unique(csvParts(baseTags, uncoveredActions)).join(", ");
    return [composition.text, tags].filter(Boolean);
  });
  const hasSharedComposition = Boolean(cleanString(shot.sharedComposition))
    || Object.keys(asRecord(shot.sharedComposition)).length > 0;
  const sharedSource = hasSharedComposition
    ? shot.sharedComposition
    : shot.supplement;
  const sharedComposition = assembleAtomicSharedComposition(sharedSource, replacements);
  const sharedAction = sharedComposition.structured
    ? (config.supplement ? "" : sharedComposition.interaction)
    : stripOrReplaceNames(
      uncoveredActionTags(shot.action, config.supplement ? sharedComposition.text : ""),
      replacements,
      true
    );
  const camera = assembleStructuredCamera(shot.camera);
  const environment = scene.environment || {};
  const location = structuredSnippets(environment.location, 1);
  const timeWeather = structuredSnippets(environment.timeWeather, 1);
  const lightingMood = config.supplement ? structuredSnippets(environment.lightingMood, 3) : [];
  const backgroundElements = config.supplement ? structuredSnippets(environment.backgroundElements, 5) : [];
  const legacyPlace = location.length === 0 ? stripOrReplaceNames(cleanString(scene.place), replacements, true) : "";
  const environmentSection = [
    ...location.map((value) => stripOrReplaceNames(value, replacements, false)),
    legacyPlace,
    ...timeWeather.map((value) => stripOrReplaceNames(value, replacements, false)),
    ...lightingMood.map((value) => stripOrReplaceNames(value, replacements, false)),
    ...backgroundElements.map((value) => stripOrReplaceNames(value, replacements, false))
  ].filter(Boolean).join(", ");
  return { sections: [
    stripOrReplaceNames(unique(csvParts(shot.situation)).join(", "), replacements, true),
    stripOrReplaceNames(camera.text, replacements, true),
    ...characterSections,
    config.supplement ? sharedComposition.text : "",
    sharedAction,
    environmentSection
  ].map((section) => section.trim()).filter(Boolean) };
}

function assembleDefaultPrompt(
  scene: SceneJson,
  shot: ShotJson,
  config: Config,
  replacements: Map<string, string>
): AssembledPrompt {
  const maxCharacters = config.mode === "asset" ? 1 : config.maxCharacters;
  const characters = cleanArray<CharacterJson>(shot.characters).slice(0, maxCharacters);
  const characterBlocks = characters
    .map((character) => assembleCharacterBlock(character, config, replacements, true))
    .filter(Boolean);
  const supplement = config.supplement ? stripOrReplaceNames(cleanString(shot.supplement), replacements, false) : "";
  const tagSections = dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(shot.camera, shot.situation, shot.action, config.mode === "asset" ? "portrait, cowboy shot, looking at viewer" : "")).join(", "), replacements, true),
    stripOrReplaceNames(unique(csvParts(scene.place, config.mode === "asset" ? "white background, simple background" : "")).join(", "), replacements, true),
    ...characterBlocks
  ]);
  const sections = config.mode === "illustration"
    ? [...tagSections, supplement].filter(Boolean)
    : dedupePromptSections([...tagSections, supplement]);
  return { sections, format: config.mode === "illustration" ? "legacy" : "ordered" };
}

export function assemblePrompt(
  scene: SceneJson,
  shot: ShotJson,
  config: Config,
  parserParagraph: number,
  originalParagraph: number
): PromptEntry {
  const characters = cleanArray<CharacterJson>(shot.characters);
  const replacements = buildNameReplacementMap(characters);
  const core = config.mode === "experimental"
    ? assembleAnimaPrompt(scene, shot, config, replacements)
    : config.mode === "asset" && config.promptStyle === "anima"
      ? assembleAnimaAssetPrompt(scene, shot, config, replacements)
      : config.promptStyle === "anima"
        ? assembleLegacyAnimaPrompt(scene, shot, config, replacements)
        : assembleDefaultPrompt(scene, shot, config, replacements);
  const preset = activePromptPreset(config);
  const presetPrefix = stripOrReplaceNames(preset?.positivePrefix || "", replacements, true);
  const prefix = stripOrReplaceNames(config.customPositivePrefix, replacements, true);
  const suffix = stripOrReplaceNames(config.customPositiveSuffix, replacements, true);
  const prefixes = [presetPrefix, prefix].filter(Boolean);
  return {
    prompt: {
      sections: [...prefixes, ...core.sections, suffix].map((section) => section.trim()).filter(Boolean),
      format: core.format || "ordered"
    },
    negative: (core.format || "ordered") === "ordered"
      ? normalizePromptSection(stripOrReplaceNames(
        unique(csvParts(preset?.negativePrefix, config.customNegative, shot.negative)).join(", "),
        replacements,
        true
      ))
      : stripOrReplaceNames(
        unique(csvParts(preset?.negativePrefix, config.customNegative, shot.negative)).join(", "),
        replacements,
        true
      ),
    paragraph: originalParagraph,
    parserParagraph
  };
}
