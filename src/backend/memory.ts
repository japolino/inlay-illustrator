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

const PLACEHOLDER_TERM = /\b(?:unknown|unspecified|not specified|not stated|unmentioned|undetermined|n\/?a)\b/i;

export function sanitizeMemoryTags(tags: string): string {
  return normalizeReferenceTags(csvParts(tags)
    .filter((tag) => {
      const normalized = tag.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
      if (!normalized) return false;
      if (PLACEHOLDER_TERM.test(normalized)) return false;
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

function matchingKey(map: Record<string, string> | undefined, name: string): string | undefined {
  if (!map) return undefined;
  return Object.keys(map).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
}

export function updateCache(
  cache: Record<string, string>,
  payload: ParsedPayload,
  manualCharacterAppearance?: Record<string, string>
): void {
  for (const { shot } of normalizeScenePayload(payload)) {
    for (const character of cleanArray<CharacterJson>(shot.characters)) {
      const name = normalizeCharacterName(character.name);
      const tags = baselineCharacterTags(character);
      if (!name || !tags) continue;
      const manualKey = matchingKey(manualCharacterAppearance, name);
      if (manualKey) {
        const cacheKey = matchingKey(cache, name);
        if (cacheKey && cacheKey !== manualKey) delete cache[cacheKey];
        cache[manualKey] = manualCharacterAppearance![manualKey];
        continue;
      }
      const cacheKey = matchingKey(cache, name);
      if (cacheKey && cacheKey !== name) delete cache[cacheKey];
      cache[name] = tags;
    }
  }
}

export function updateCharacterMemory(state: State, payload: ParsedPayload): void {
  updateCache(state.characterAppearance, payload, state.manualCharacterAppearance);
}

export function upsertCharacterTag(state: State, oldName: unknown, nextName: unknown, nextTags: unknown): void {
  const previous = normalizeCharacterName(oldName);
  const name = normalizeCharacterName(nextName);
  const tags = sanitizeMemoryTags(normalizeReferenceTags(nextTags));
  if (!name) throw new Error("Character name is required.");
  if (!tags) throw new Error("Character appearance tags must include at least one durable tag.");

  const entries = Object.keys(state.characterAppearance);
  const sourceKey = previous
    ? entries.find((candidate) => candidate.toLowerCase() === previous.toLowerCase())
    : undefined;
  const destinationCollision = entries.find((candidate) =>
    candidate.toLowerCase() === name.toLowerCase() && candidate !== sourceKey
  );
  if (destinationCollision) throw new Error(`A character named "${name}" already exists.`);

  if (sourceKey && sourceKey !== name) delete state.characterAppearance[sourceKey];
  state.characterAppearance[name] = tags;
  const manual = state.manualCharacterAppearance || {};
  const manualSourceKey = previous ? matchingKey(manual, previous) : undefined;
  const manualDestinationKey = matchingKey(manual, name);
  if (manualSourceKey && manualSourceKey !== name) delete manual[manualSourceKey];
  if (manualDestinationKey && manualDestinationKey !== name) delete manual[manualDestinationKey];
  manual[name] = tags;
  state.manualCharacterAppearance = manual;
}

export function deleteCharacterTag(state: State, name: unknown): void {
  const target = normalizeCharacterName(name);
  if (!target) return;
  const key = Object.keys(state.characterAppearance).find((candidate) => candidate.toLowerCase() === target.toLowerCase()) || target;
  delete state.characterAppearance[key];
  const manualKey = matchingKey(state.manualCharacterAppearance, target);
  if (manualKey) delete state.manualCharacterAppearance![manualKey];
  if (state.manualCharacterAppearance && Object.keys(state.manualCharacterAppearance).length === 0) {
    delete state.manualCharacterAppearance;
  }
}
