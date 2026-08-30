import { normalizeCharacterName, normalizeReferenceTags } from "./prompt.js";
import { normalizeScenePayload } from "./scenes.js";
import type { CharacterJson, ParsedPayload, State } from "./types.js";
import { cleanArray, csvParts } from "./utils.js";

export function baselineIdentityTags(character: CharacterJson): string {
  return normalizeReferenceTags(
    csvParts(character.label, character.age, character.appearance, character.body, character.attire).join(", ")
  );
}

function matchingKey(map: Record<string, string> | undefined, name: string): string | undefined {
  if (!map) return undefined;
  return Object.keys(map).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
}

export function parseCharAppearanceRaw(jsonStr: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!jsonStr) return map;
  const re = /"([^"]+)":"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(jsonStr)) !== null) {
    const name = m[1];
    const tags = m[2];
    const stable = normalizeReferenceTags(tags);
    if (stable) map[name] = stable;
  }
  return map;
}

/**
 * Faithful to original updateCharAppearance: load map, then for each
 * scene character set appearance[name] = stableTags unconditionally,
 * clobbering any previous value. No manualCharacterAppearance protection
 * (later UI improvement, not a Spindle blocker).
 */
export function updateCache(
  cache: Record<string, string>,
  payload: ParsedPayload
): void {
  for (const { shot } of normalizeScenePayload(payload as any)) {
    for (const character of cleanArray<any>(shot.characters)) {
      const name = normalizeCharacterName(character.name);
      // Prefer normalized identity if present (from new normalizeCharacterData), else recompute
      const rawIdentity = (character as any).identity as string | undefined;
      const identity = rawIdentity !== undefined ? normalizeReferenceTags(rawIdentity) : baselineIdentityTags(character as any);
      if (!name || !identity) continue;
      const cacheKey = matchingKey(cache, name);
      if (cacheKey && cacheKey !== name) delete cache[cacheKey];
      cache[name] = identity;
    }
  }
}

export function updateCharacterMemory(state: State, payload: ParsedPayload): void {
  updateCache(state.characterAppearance, payload);
}

export function upsertCharacterTag(state: State, oldName: unknown, nextName: unknown, nextTags: unknown): void {
  const previous = normalizeCharacterName(oldName);
  const name = normalizeCharacterName(nextName);
  const tags = normalizeReferenceTags(nextTags);
  if (!name) throw new Error("Character name is required.");
  if (!tags) throw new Error("Character appearance tags must include at least one durable tag.");
  const entries = Object.keys(state.characterAppearance);
  const sourceKey = previous ? entries.find((candidate) => candidate.toLowerCase() === previous.toLowerCase()) : undefined;
  const destinationCollision = entries.find((candidate) => candidate.toLowerCase() === name.toLowerCase() && candidate !== sourceKey);
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
  const key =
    Object.keys(state.characterAppearance).find((candidate) => candidate.toLowerCase() === target.toLowerCase()) || target;
  delete state.characterAppearance[key];
  const manualKey = matchingKey(state.manualCharacterAppearance, target);
  if (manualKey) delete state.manualCharacterAppearance![manualKey];
  if (state.manualCharacterAppearance && Object.keys(state.manualCharacterAppearance).length === 0) {
    delete state.manualCharacterAppearance;
  }
}
