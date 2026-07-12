import { normalizeCharacterName, normalizeReferenceTags } from "./prompt.js";
import { normalizeScenePayload } from "./scenes.js";
import type { CharacterJson, ParsedPayload, State } from "./types.js";
import { cleanArray, csvParts, unique } from "./utils.js";

const VOLATILE_MEMORY_TERMS = [
  "sitting", "standing", "leaning", "guided", "guiding", "holding", "pulling", "looking", "gaze",
  "smug", "flustered", "blush", "smile", "angry", "crying", "grin", "embarrassed", "annoyed",
  "chair", "bed", "sofa", "couch", "desk", "table", "from above", "from below", "from behind", "close-up", "wide shot",
  "portrait", "upper body", "full body", "cowboy shot", "pov"
];

const TRANSIENT_ATTIRE_MEMORY_TERMS = [
  "torn clothes", "open shirt", "shirt lift", "panty pull", "clothes pull", "undressing"
];

export function sanitizeMemoryTags(tags: string): string {
  return normalizeReferenceTags(csvParts(tags)
    .filter((tag) => {
      const normalized = tag.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
      if (!normalized) return false;
      if (TRANSIENT_ATTIRE_MEMORY_TERMS.some((term) => normalized === term || normalized.includes(term))) return false;
      return !VOLATILE_MEMORY_TERMS.some((term) => normalized === term || normalized.includes(term));
    })
    .join(", "));
}

function baselineCharacterTags(character: CharacterJson): string {
  return sanitizeMemoryTags(unique(csvParts(
    character.label,
    character.age,
    character.appearance,
    character.body,
    character.attire
  )).join(", "));
}

export function updateCache(cache: Record<string, string>, payload: ParsedPayload): void {
  for (const { shot } of normalizeScenePayload(payload)) {
    for (const character of cleanArray<CharacterJson>(shot.characters)) {
      const name = normalizeCharacterName(character.name);
      const tags = baselineCharacterTags(character);
      if (name && tags) cache[name] = tags;
    }
  }
}

export function upsertCharacterTag(state: State, oldName: unknown, nextName: unknown, nextTags: unknown): void {
  const previous = normalizeCharacterName(oldName);
  const name = normalizeCharacterName(nextName);
  const tags = sanitizeMemoryTags(normalizeReferenceTags(nextTags));
  if (previous && previous !== name) deleteCharacterTag(state, previous);
  if (name && tags) state.characterAppearance[name] = tags;
}

export function deleteCharacterTag(state: State, name: unknown): void {
  const target = normalizeCharacterName(name);
  if (!target) return;
  const key = Object.keys(state.characterAppearance).find((candidate) => candidate.toLowerCase() === target.toLowerCase()) || target;
  delete state.characterAppearance[key];
}
