/**
 * V3.7.6 Character Appearance Memory Runtime and Compatibility Layer.
 * Implements loadCharAppearance, saveCharAppearance, buildAppearanceReference,
 * and updateCharAppearance from Lua runtime, while bridging existing manual
 * edits and persisted state.characterAppearance.
 */

import { filterStandaloneGenderTags, normalizeReferenceTags } from "./schema.js";
import { V376Character, V376Options, V376Scene } from "./types.js";
import type { State } from "../types.js";

export interface V376MemoryEntry {
  tags: string;
  negTags: string;
  depth: number;
  isManual?: boolean;
}

export type V376MemoryMap = Record<string, V376MemoryEntry>;

export type ExtendedStateWithV376 = State;

/**
 * Extracts identity tags from character fields as in Lua normalizeCharacterData:
 * [label, age, appearance (gender-filtered), body, attire]
 */
export function extractCharacterIdentityTags(char: V376Character): string {
  const parts: string[] = [];
  const idKeys: Array<keyof V376Character> = ["label", "age", "appearance", "body", "attire"];

  for (const key of idKeys) {
    let val = String(char[key] ?? "").trim();
    if (key === "appearance") {
      val = filterStandaloneGenderTags(val);
    }
    const lower = val.toLowerCase();
    if (val !== "" && lower !== "null" && lower !== "none") {
      parts.push(val);
    }
  }

  return normalizeReferenceTags(parts.join(", "));
}

/**
 * Parses a serialized value "tags|||negTags|||depth" or legacy formats.
 */
export function parseMemoryEntryValue(val: string, defaultDepth = 5): V376MemoryEntry {
  const trimmed = (val || "").trim();
  if (!trimmed) {
    return { tags: "", negTags: "", depth: defaultDepth };
  }

  // 1. tags|||negTags|||depth
  const threePart = trimmed.match(/^(.*?)\|\|\|(.*?)\|\|\|(-?\d+)$/);
  if (threePart) {
    const rawDepth = parseInt(threePart[3], 10);
    const depth = rawDepth === -1 ? defaultDepth : rawDepth;
    return {
      tags: normalizeReferenceTags(threePart[1]),
      negTags: threePart[2].trim(),
      depth: isNaN(depth) ? defaultDepth : depth,
    };
  }

  // 2. tags|||depth
  const twoPart = trimmed.match(/^(.*?)\|\|\|(-?\d+)$/);
  if (twoPart) {
    const rawDepth = parseInt(twoPart[2], 10);
    const depth = rawDepth === -1 ? defaultDepth : rawDepth;
    return {
      tags: normalizeReferenceTags(twoPart[1]),
      negTags: "",
      depth: isNaN(depth) ? defaultDepth : depth,
    };
  }

  // 3. Plain tags string
  return {
    tags: normalizeReferenceTags(trimmed),
    negTags: "",
    depth: defaultDepth,
  };
}

/**
 * Serializes a memory entry into the Lua Card.CharAppearance format:
 * "tags|||negTags|||depth"
 */
export function serializeMemoryEntryValue(entry: V376MemoryEntry): string {
  const tags = entry.tags || "";
  const neg = entry.negTags || "";
  const depth = entry.depth ?? 5;
  return `${tags}|||${neg}|||${depth}`;
}

/**
 * Loads V3.7.6 character appearance memory from state, preserving:
 * - existing saved records in state.characterAppearance
 * - manual overrides in state.manualCharacterAppearance
 * - structured depths in state.v376CharacterMemory if present
 */
export function loadV376Memory(state: State, defaultDepth = 5): V376MemoryMap {
  const memoryMap: V376MemoryMap = {};

  // 1. If structured V376 memory already exists, initialize with it
  if (state.v376CharacterMemory) {
    for (const [name, entry] of Object.entries(state.v376CharacterMemory)) {
      if (entry && entry.tags) {
        memoryMap[name] = {
          tags: entry.tags,
          negTags: entry.negTags || "",
          depth: typeof entry.depth === "number" ? entry.depth : defaultDepth,
          isManual: entry.isManual ?? false,
        };
      }
    }
  }

  // 2. Load / migrate any entries from state.characterAppearance that aren't loaded yet
  if (state.characterAppearance) {
    for (const [name, val] of Object.entries(state.characterAppearance)) {
      if (!val) continue;
      const existing = findMemoryEntry(memoryMap, name);
      if (!existing) {
        const parsed = parseMemoryEntryValue(val, defaultDepth);
        if (parsed.tags) {
          memoryMap[name] = parsed;
        }
      }
    }
  }

  // 3. Check manualCharacterAppearance overrides
  if (state.manualCharacterAppearance) {
    for (const [name, manualTags] of Object.entries(state.manualCharacterAppearance)) {
      if (!manualTags) continue;
      const normalizedManual = normalizeReferenceTags(manualTags);
      const existingKey = findMemoryKey(memoryMap, name);
      if (existingKey) {
        memoryMap[existingKey].tags = normalizedManual;
        memoryMap[existingKey].isManual = true;
      } else {
        memoryMap[name] = {
          tags: normalizedManual,
          negTags: "",
          depth: defaultDepth,
          isManual: true,
        };
      }
    }
  }

  return memoryMap;
}

/**
 * Persists the V3.7.6 memory map back to state:
 * - saves full metadata in state.v376CharacterMemory
 * - maintains state.characterAppearance[name] = entry.tags for legacy UI compatibility
 */
export function saveV376Memory(state: State, memoryMap: V376MemoryMap): void {
  state.v376CharacterMemory = memoryMap;

  if (!state.characterAppearance) {
    state.characterAppearance = {};
  }

  // Keep state.characterAppearance synchronized with the active tags
  for (const [name, entry] of Object.entries(memoryMap)) {
    if (entry && entry.tags) {
      state.characterAppearance[name] = entry.tags;
    }
  }
}

function findMemoryKey(map: V376MemoryMap, name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.keys(map).find((k) => k.toLowerCase() === lower);
}

function findMemoryEntry(map: V376MemoryMap, name: string): V376MemoryEntry | undefined {
  const key = findMemoryKey(map, name);
  return key ? map[key] : undefined;
}

/**
 * Builds the ## Previous Character Tags context block.
 * Faithfully mirrors Lua buildAppearanceReference:
 * - All character names are listed (even if depth == 0)
 * - Detailed tag entries are ONLY appended for active characters where depth > 0
 * - Characters are sorted alphabetically (case-insensitive)
 * - Retains expired records in storage while omitting detailed tags from context
 */
export function buildAppearanceReference(memoryMap: V376MemoryMap): string | null {
  const allNames: string[] = [];
  const entries: string[] = [];

  for (const [name, data] of Object.entries(memoryMap)) {
    if (!name || !data || !data.tags) continue;
    allNames.push(name);
    if (data.depth > 0) {
      entries.push(`- ${name}: ${data.tags}`);
    }
  }

  if (allNames.length === 0) {
    return null;
  }

  // Sort names alphabetically
  allNames.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  let refText = "## Previous Character Tags\n";
  refText += `Characters: ${allNames.join(", ")}\n`;
  refText +=
    "Use these as a baseline for returning characters (including their base attire). The current messge always wins over this reference. But stick to the given names, don't change or modify already given names or terms of address.\n";

  if (entries.length > 0) {
    refText += entries.join("\n");
  }

  return refText;
}

/**
 * Updates character memory following scene generation:
 * - Decrements depth for all stored characters
 * - Updates characters present in current scenes with new identity tags, resetting depth to maxDepth
 * - Preserves manual edits against automated tag overwrites
 * - Preserves existing records in memory even when depth reaches 0
 */
export function updateV376Memory(
  state: State,
  scenes: V376Scene[],
  options?: Partial<V376Options>
): V376MemoryMap {
  const maxDepth = options?.characterContextDepth ?? 5;
  const memoryMap = loadV376Memory(state, maxDepth);

  // 1. Decrease depth for all stored characters
  for (const data of Object.values(memoryMap)) {
    if (data.depth > 0) {
      data.depth -= 1;
    }
  }

  // 2. Update characters present in current scenes
  for (const scene of scenes) {
    for (const shot of scene.shots || []) {
      for (const char of shot.characters || []) {
        const charName = (char.name || "").trim();
        if (!charName) continue;

        const matchedKey = findMemoryKey(memoryMap, charName) || charName;
        const existingEntry = memoryMap[matchedKey];

        // Determine stable identity tags
        let stableTags = "";
        if (char.identity && char.identity.trim()) {
          stableTags = normalizeReferenceTags(char.identity);
        } else {
          stableTags = extractCharacterIdentityTags(char);
        }

        if (stableTags) {
          if (existingEntry) {
            // If manual edit exists, preserve manual tags but reset depth
            if (existingEntry.isManual) {
              existingEntry.depth = maxDepth;
            } else {
              existingEntry.tags = stableTags;
              existingEntry.depth = maxDepth;
            }
            // Per Lua lines 783-785: existing negTags are preserved (never overwritten by scene shot negatives)
          } else {
            memoryMap[charName] = {
              tags: stableTags,
              negTags: "",
              depth: maxDepth,
              isManual: false,
            };
          }
        } else {
          // Mentioned with a name but no new identity tags: reset depth if exists
          if (existingEntry) {
            existingEntry.depth = maxDepth;
          }
        }
      }
    }
  }

  // Persist updated memory back to state
  saveV376Memory(state, memoryMap);
  return memoryMap;
}
