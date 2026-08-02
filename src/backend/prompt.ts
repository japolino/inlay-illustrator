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

export function normalizeCharacterName(value: unknown): string {
  return stripParenthetical(cleanString(value));
}

function displayName(name: string, config: Config): string {
  const clean = stripParenthetical(name);
  const source = config.originalCreationName.trim();
  return config.originalReference && clean && source ? `${clean} \\(${source}\\)` : clean;
}

function shouldIncludeCharacterNames(config: Config): boolean {
  return config.originalReference && Boolean(config.originalCreationName.trim());
}

function characterDescriptor(character: CharacterJson): string {
  const text = csvParts(character.label, character.age).join(" ").toLowerCase();
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
    return unique(csvParts(value).map((tag) => {
      let next = tag;
      for (const [name, descriptor] of replacements) {
        const tagName = next.replace(/\\\(|\\\)/g, "").replace(/[()]/g, "").trim().toLowerCase();
        const cleanName = name.replace(/[()]/g, "").trim().toLowerCase();
        if (tagName === cleanName || tagName === cleanName.replace(/\s+/g, "_")) return "";
        next = next.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), descriptor);
      }
      return next.trim();
    }).filter(Boolean)).join(", ");
  }
  let next = value;
  for (const [name, descriptor] of replacements) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), descriptor);
  }
  return next.replace(/\s+/g, " ").trim();
}

export function buildCharacterTagReference(map: Record<string, string>): string {
  const lines = Object.entries(map).map(([rawName, rawTags]) => {
    const name = normalizeCharacterName(rawName);
    const tags = normalizeReferenceTags(rawTags);
    return name && tags ? `- ${name}: ${tags}` : "";
  }).filter(Boolean);
  return lines.length ? ["## Previous Character Tags", "Use these as a baseline for returning characters (including their base attire). The current message always wins over this reference.", ...lines].join("\n") : "";
}

export function normalizePromptSection(value: string): string {
  const doubleColon = "\uE000";
  return value.replace(/::/g, doubleColon).replace(/;/g, ",")
    .replace(/\s*,(?:\s*,)+\s*/g, ", ").replace(/^\s*,+\s*/, "")
    .replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ")
    .replace(/[.!?]+(?=\s*,)/g, "").replace(/[\s.,;:!?]+$/g, "")
    .replace(new RegExp(doubleColon, "g"), "::").trim();
}

function joinSections(sections: string[], syntax: Config["promptSyntax"], format: NonNullable<AssembledPrompt["format"]>): string {
  const clean = sections.map((section) => format === "ordered" ? normalizePromptSection(section) : section.trim()).filter(Boolean);
  if (syntax === "comfyui") return clean.join(",\n");
  return format === "legacy" ? clean.join(" | ") : clean.join(", ");
}

export function renderPrompt(prompt: AssembledPrompt, syntax: Config["promptSyntax"]): string {
  return joinSections(prompt.sections, syntax, prompt.format || "ordered");
}

export function activePromptPreset(config: Config): PromptPreset | null {
  return config.promptPresets.find((preset) => preset.id === config.activePromptPresetId) || null;
}

export function renderPromptWithCurrentAffixes(
  corePrompt: string,
  format: NonNullable<AssembledPrompt["format"]>,
  config: Config
): string {
  const preset = activePromptPreset(config);
  const clean = (value: string): string => format === "ordered" ? normalizePromptSection(value) : value.trim();
  const separator = config.promptSyntax === "comfyui" ? ",\n" : format === "legacy" ? " | " : ", ";
  return [clean(preset?.positivePrefix || ""), clean(config.customPositivePrefix), corePrompt.trim(), clean(config.customPositiveSuffix)]
    .filter(Boolean).join(separator);
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

function dedupePromptSections(sections: string[]): string[] {
  const seen = new Set<string>();
  return sections.map((section) => section.trim()).filter((section) => {
    if (!section) return false;
    const key = section.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function assembleAnimaPrompt(scene: SceneJson, shot: ShotJson, config: Config, replacements: Map<string, string>): AssembledPrompt {
  const characters = cleanArray<CharacterJson>(shot.characters).slice(0, config.mode === "asset" ? 1 : config.maxCharacters);
  const characterBlocks = characters.map((character) => assembleCharacterBlock(character, config, replacements, false)).filter(Boolean);
  const action = stripOrReplaceNames(unique(csvParts(
    shot.action,
    ...characters.map((character) => character.action),
    config.mode === "asset" ? "looking at viewer" : ""
  )).join(", "), replacements, true);
  const supplement = config.supplement ? stripOrReplaceNames(cleanString(shot.supplement), replacements, false) : "";
  return {
    sections: dedupePromptSections([
      stripOrReplaceNames(unique(csvParts(shot.situation)).join(", "), replacements, true),
      ...characterBlocks,
      action,
      stripOrReplaceNames(unique(csvParts(shot.camera, config.mode === "asset" ? "portrait, cowboy shot" : "")).join(", "), replacements, true),
      stripOrReplaceNames(unique(csvParts(scene.place, config.mode === "asset" ? "white background, simple background" : "")).join(", "), replacements, true),
      supplement
    ]),
    format: "ordered"
  };
}

function assembleDefaultPrompt(scene: SceneJson, shot: ShotJson, config: Config, replacements: Map<string, string>): AssembledPrompt {
  const characters = cleanArray<CharacterJson>(shot.characters).slice(0, config.mode === "asset" ? 1 : config.maxCharacters);
  const characterBlocks = characters.map((character) => assembleCharacterBlock(character, config, replacements, true)).filter(Boolean);
  const supplement = config.supplement ? stripOrReplaceNames(cleanString(shot.supplement), replacements, false) : "";
  return {
    sections: dedupePromptSections([
      stripOrReplaceNames(unique(csvParts(shot.camera, shot.situation, shot.action, config.mode === "asset" ? "portrait, cowboy shot, looking at viewer" : "")).join(", "), replacements, true),
      stripOrReplaceNames(unique(csvParts(scene.place, config.mode === "asset" ? "white background, simple background" : "")).join(", "), replacements, true),
      ...characterBlocks,
      supplement
    ]),
    format: "legacy"
  };
}

export function assemblePrompt(scene: SceneJson, shot: ShotJson, config: Config, parserParagraph: number, originalParagraph: number): PromptEntry {
  const characters = cleanArray<CharacterJson>(shot.characters);
  const replacements = buildNameReplacementMap(characters);
  const core = config.promptStyle === "anima"
    ? assembleAnimaPrompt(scene, shot, config, replacements)
    : assembleDefaultPrompt(scene, shot, config, replacements);
  const preset = activePromptPreset(config);
  const format = core.format || "ordered";
  const corePrompt: AssembledPrompt = { sections: [...core.sections], format };
  const prefixes = [preset?.positivePrefix || "", config.customPositivePrefix].map((value) => stripOrReplaceNames(value, replacements, true)).filter(Boolean);
  const shotNegative = stripOrReplaceNames(unique(csvParts(shot.negative, ...characters.map((character) => character.negative))).join(", "), replacements, true);
  return {
    prompt: { sections: [...prefixes, ...core.sections, stripOrReplaceNames(config.customPositiveSuffix, replacements, true)].filter(Boolean), format },
    corePrompt,
    shotNegative,
    negative: renderNegativeWithCurrentSelection(shotNegative, format, config),
    paragraph: originalParagraph,
    parserParagraph,
    quote: cleanString(shot.quote),
  };
}
