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
  const clean = sections.map(normalizePromptSection).filter(Boolean);
  return syntax === "comfyui" ? clean.join(",\n\n") : clean.join(", ");
}

export function renderPrompt(prompt: AssembledPrompt, syntax: Config["promptSyntax"]): string {
  return joinSections(prompt.sections, syntax);
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
    const composition = stripOrReplaceNames(cleanString(character.composition), replacements, false);
    const tags = assembleCharacterBlock(character, config, replacements, !composition);
    return [composition, tags].filter(Boolean);
  });
  const sharedComposition = stripOrReplaceNames(
    cleanString(shot.sharedComposition) || cleanString(shot.supplement),
    replacements,
    false
  );
  const sharedAction = stripOrReplaceNames(unique(csvParts(shot.action)).join(", "), replacements, true);
  const environment = scene.environment || {};
  const location = structuredSnippets(environment.location, 1);
  const timeWeather = structuredSnippets(environment.timeWeather, 1);
  const lightingMood = config.supplement ? structuredSnippets(environment.lightingMood, 3) : [];
  const backgroundElements = config.supplement ? structuredSnippets(environment.backgroundElements, 5) : [];
  const legacyPlace = location.length === 0 ? stripOrReplaceNames(cleanString(scene.place), replacements, true) : "";
  return { sections: [
    stripOrReplaceNames(unique(csvParts(shot.situation)).join(", "), replacements, true),
    ...characterSections,
    config.supplement && sharedComposition ? sharedComposition : sharedAction,
    ...location.map((value) => stripOrReplaceNames(value, replacements, false)),
    legacyPlace,
    ...timeWeather.map((value) => stripOrReplaceNames(value, replacements, false)),
    ...lightingMood.map((value) => stripOrReplaceNames(value, replacements, false)),
    ...backgroundElements.map((value) => stripOrReplaceNames(value, replacements, false)),
    stripOrReplaceNames(unique(csvParts(shot.camera)).join(", "), replacements, true)
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
  const sections = dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(shot.camera, shot.situation, shot.action, config.mode === "asset" ? "portrait, cowboy shot, looking at viewer" : "")).join(", "), replacements, true),
    stripOrReplaceNames(unique(csvParts(scene.place, config.mode === "asset" ? "white background, simple background" : "")).join(", "), replacements, true),
    ...characterBlocks,
    supplement
  ]);
  return { sections };
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
      sections: [...prefixes, ...core.sections, suffix].map((section) => section.trim()).filter(Boolean)
    },
    negative: normalizePromptSection(stripOrReplaceNames(
      unique(csvParts(preset?.negativePrefix, config.customNegative, shot.negative)).join(", "),
      replacements,
      true
    )),
    paragraph: originalParagraph,
    parserParagraph
  };
}
