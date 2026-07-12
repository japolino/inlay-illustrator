import type { Config, PromptPreset } from "../shared/config.js";
import type { AssembledPrompt, CharacterJson, PromptEntry, SceneJson, ShotJson } from "./types.js";
import { cleanArray, cleanString, csvParts, escapeRegExp, unique } from "./utils.js";

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

function joinSections(sections: string[], syntax: Config["promptSyntax"]): string {
  const clean = sections.map((section) => section.trim()).filter(Boolean);
  return syntax === "comfyui" ? clean.join(",\n") : clean.join(", ");
}

export function renderPrompt(prompt: AssembledPrompt, syntax: Config["promptSyntax"]): string {
  const supplementIndex = Math.min(Math.max(prompt.supplementAfterTagSections, 0), prompt.tagSections.length);
  return joinSections([
    ...prompt.tagSections.slice(0, supplementIndex),
    prompt.supplement,
    ...prompt.tagSections.slice(supplementIndex)
  ], syntax);
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

function assembleAnimaPrompt(
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
  const sceneAction = stripOrReplaceNames(
    unique(csvParts(shot.action, ...characters.map((character) => character.action), config.mode === "asset" ? "looking at viewer" : "")).join(", "),
    replacements,
    true
  );
  const supplement = config.supplement
    ? stripOrReplaceNames(removeSupplementActionDuplicates(cleanString(shot.supplement), sceneAction), replacements, false)
    : "";
  const tagSections = dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(shot.situation)).join(", "), replacements, true),
    ...characterBlocks,
    sceneAction,
    stripOrReplaceNames(unique(csvParts(shot.camera, config.mode === "asset" ? "portrait, cowboy shot" : "")).join(", "), replacements, true),
    stripOrReplaceNames(unique(csvParts(scene.place, config.mode === "asset" ? "white background, simple background" : "")).join(", "), replacements, true)
  ]);
  return { tagSections, supplement, supplementAfterTagSections: tagSections.length };
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
  return { tagSections, supplement, supplementAfterTagSections: tagSections.length };
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
  const core = config.promptStyle === "anima"
    ? assembleAnimaPrompt(scene, shot, config, replacements)
    : assembleDefaultPrompt(scene, shot, config, replacements);
  const preset = activePromptPreset(config);
  const presetPrefix = stripOrReplaceNames(preset?.positivePrefix || "", replacements, true);
  const prefix = stripOrReplaceNames(config.customPositivePrefix, replacements, true);
  const suffix = stripOrReplaceNames(config.customPositiveSuffix, replacements, true);
  const prefixes = [presetPrefix, prefix].filter(Boolean);
  return {
    prompt: {
      tagSections: [...prefixes, ...core.tagSections, suffix].map((section) => section.trim()).filter(Boolean),
      supplement: core.supplement,
      supplementAfterTagSections: prefixes.length + core.supplementAfterTagSections
    },
    negative: stripOrReplaceNames(unique(csvParts(preset?.negativePrefix, config.customNegative, shot.negative)).join(", "), replacements, true),
    paragraph: originalParagraph,
    parserParagraph
  };
}
