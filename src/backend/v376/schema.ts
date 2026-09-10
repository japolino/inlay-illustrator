/**
 * V3.7.6 Source-Faithful Schema Parsing and Structural Normalization.
 * Implements extractCardImageJson, fixJsonKeys, and normalizeScenePayload from Lua runtime.
 */

import {
  V376Character,
  V376NormalizedCharacter,
  V376NormalizedShot,
  V376Options,
  V376Panel,
  V376Payload,
  V376Scene,
  V376Shot,
  V376Supplement,
} from "./types.js";

export const KNOWN_JSON_KEYS: readonly string[] = Object.freeze([
  "scenes",
  "place",
  "shots",
  "paragraph",
  "camera",
  "situation",
  "characters",
  "label",
  "age",
  "appearance",
  "body",
  "attire",
  "expression",
  "action",
  "sex",
  "position",
  "negative",
  "name",
  "scene",
  "positive",
  "quote",
  "supplement",
  "text",
  "panels",
  "number",
  "composition",
  "placement",
]);

/**
 * Computes Levenshtein distance between two strings.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  let prev = Array.from({ length: len2 + 1 }, (_, j) => j);
  let curr = new Array<number>(len2 + 1).fill(0);

  for (let i = 1; i <= len1; i++) {
    curr[0] = i;
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = [...curr];
  }
  return prev[len2];
}

/**
 * Fuzzy matches a key against known V3.7.6 JSON schema keys up to maxDist (default 2).
 */
export function fuzzyMatchKey(key: string, maxDist = 2): string | null {
  for (const valid of KNOWN_JSON_KEYS) {
    if (key === valid) return key;
  }
  let best: string | null = null;
  let bestDist = maxDist + 1;
  for (const valid of KNOWN_JSON_KEYS) {
    const d = levenshteinDistance(key, valid);
    if (d < bestDist) {
      bestDist = d;
      best = valid;
    }
  }
  return best;
}

/**
 * Recursively repairs misspelled keys in an object tree using Levenshtein distance 2.
 */
export function fixJsonKeys<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => fixJsonKeys(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const fixedKey = fuzzyMatchKey(k, 2) ?? k;
    result[fixedKey] = fixJsonKeys(v);
  }
  return result as T;
}

/**
 * Filters standalone gender tags from a comma-separated tag string.
 * Excludes exact "boy", "girl", "1boy", "1girl", but preserves phrases like "tall boy".
 */
export function filterStandaloneGenderTags(tagString: string): string {
  if (!tagString) return "";
  const result: string[] = [];
  for (const rawTag of tagString.split(",")) {
    const tag = rawTag.trim();
    const lower = tag.toLowerCase();
    if (tag !== "" && lower !== "boy" && lower !== "girl" && lower !== "1boy" && lower !== "1girl") {
      result.push(tag);
    }
  }
  return result.join(", ");
}

/**
 * Normalizes reference tags, deduplicating case-insensitively and dropping null/none.
 */
export function normalizeReferenceTags(tagString: string): string {
  if (!tagString) return "";
  const result: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of tagString.split(",")) {
    const tag = rawTag.trim();
    const lower = tag.toLowerCase();
    if (tag !== "" && lower !== "null" && lower !== "none" && !seen.has(lower)) {
      result.push(tag);
      seen.add(lower);
    }
  }
  return result.join(", ");
}

/**
 * Strips trailing commas and markdown code fences to recover valid JSON from LLM output.
 */
function sanitizeJsonString(text: string): string {
  let cleaned = text
    .replace(/^```(?:json|JSON)?/m, "")
    .replace(/```$/m, "")
    .trim();

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  return cleaned;
}

/**
 * Extracts a candidate JSON object from raw response text.
 * Faithfully ports Lua extractCardImageJson with tolerant structural recovery.
 */
export function extractCardImageJson(responseText: string): unknown {
  const trimmed = responseText?.trim() ?? "";
  if (!trimmed) return null;

  // 1. Direct parse attempt
  try {
    const decoded = JSON.parse(trimmed);
    if (typeof decoded === "object" && decoded !== null) {
      return fixJsonKeys(decoded);
    }
  } catch {
    // continue to structural extraction
  }

  // 2. Try sanitized text (stripping markdown fences & trailing commas)
  const stripped = sanitizeJsonString(trimmed);
  try {
    const decoded = JSON.parse(stripped);
    if (typeof decoded === "object" && decoded !== null) {
      return fixJsonKeys(decoded);
    }
  } catch {
    // continue
  }

  // 3. Scan for balanced top-level JSON objects
  let searchPos = 0;
  const n = stripped.length;
  const collectedGroups: unknown[] = [];
  const collectedShots: unknown[] = [];

  while (searchPos < n) {
    const braceStart = stripped.indexOf("{", searchPos);
    if (braceStart === -1) break;

    // Find matching balanced closing brace
    let depth = 0;
    let inString = false;
    let escape = false;
    let braceEnd = -1;

    for (let j = braceStart; j < n; j++) {
      const char = stripped[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === "{") depth++;
        else if (char === "}") {
          depth--;
          if (depth === 0) {
            braceEnd = j;
            break;
          }
        }
      }
    }

    if (braceEnd !== -1) {
      const candidate = stripped.slice(braceStart, braceEnd + 1);
      try {
        const parsed = JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
        if (typeof parsed === "object" && parsed !== null) {
          const fixed = fixJsonKeys(parsed) as Record<string, unknown>;
          if (Array.isArray(fixed.scenes)) {
            return fixed;
          }
          if (Array.isArray(fixed.shots)) {
            collectedGroups.push(fixed);
          } else if ("paragraph" in fixed) {
            collectedShots.push(fixed);
          }
        }
      } catch {
        // Candidate was not valid JSON; keep scanning
      }
      searchPos = braceStart + 1;
    } else {
      searchPos = braceStart + 1;
    }
  }

  if (collectedGroups.length > 0) {
    return { scenes: collectedGroups };
  }
  if (collectedShots.length > 0) {
    return { scenes: [{ place: "", shots: collectedShots }] };
  }

  return null;
}

/**
 * Normalizes a single character object according to Lua normalizeCharacterData.
 */
export function normalizeCharacterData(
  char: unknown,
  options?: V376Options
): V376Character & V376NormalizedCharacter {
  if (!char || typeof char !== "object") {
    return {
      name: "",
      label: "",
      age: "",
      appearance: "",
      attire: "",
      positive: "",
      negative: "",
      identity: "",
    };
  }

  const record = char as Record<string, unknown>;
  const rawName = String(record.name ?? "").trim();
  const isOc = rawName.toLowerCase().includes("(oc)");
  const useOriginal = Boolean(options?.originalReference) && !isOc;

  let positive = String(record.positive ?? "").trim();
  if (positive.toLowerCase() === "null" || positive.toLowerCase() === "none") {
    positive = "";
  }

  if (positive === "") {
    const parts: string[] = [];
    const keys = useOriginal
      ? ["label", "name", "age", "appearance", "body", "attire", "expression", "action", "sex", "text"]
      : ["label", "age", "appearance", "body", "attire", "expression", "action", "sex", "text"];

    for (const key of keys) {
      let val = String(record[key] ?? "").trim();
      if (key === "appearance") {
        val = filterStandaloneGenderTags(val);
      }
      if (val !== "" && val.toLowerCase() !== "null" && val.toLowerCase() !== "none") {
        parts.push(val);
      }
    }

    if (options?.supplement) {
      const rawSup = record.supplement;
      const supParts: string[] = [];
      if (typeof rawSup === "string") {
        const t = rawSup.trim();
        if (t !== "" && t.toLowerCase() !== "null" && t.toLowerCase() !== "none") {
          supParts.push(t);
        }
      } else if (typeof rawSup === "object" && rawSup !== null) {
        for (const v of Object.values(rawSup as Record<string, unknown>)) {
          const t = String(v ?? "").trim();
          if (t !== "" && t.toLowerCase() !== "null" && t.toLowerCase() !== "none") {
            supParts.push(t);
          }
        }
      }
      if (supParts.length > 0) {
        parts.push(supParts.join(", "));
      }
    }

    positive = parts.join(", ");
  }

  const identityParts: string[] = [];
  const idKeys = ["label", "age", "appearance", "body", "attire"];
  for (const key of idKeys) {
    let val = String(record[key] ?? "").trim();
    if (key === "appearance") {
      val = filterStandaloneGenderTags(val);
    }
    if (val !== "" && val.toLowerCase() !== "null" && val.toLowerCase() !== "none") {
      identityParts.push(val);
    }
  }

  let finalName = String(record.name ?? "").trim();
  if (finalName.toLowerCase() === "null" || finalName.toLowerCase() === "none") {
    finalName = "";
  }

  let finalNegative = String(record.negative ?? "").trim();
  if (finalNegative.toLowerCase() === "null" || finalNegative.toLowerCase() === "none") {
    finalNegative = "";
  }

  return {
    name: finalName,
    label: String(record.label ?? "").trim(),
    age: String(record.age ?? "").trim(),
    appearance: String(record.appearance ?? "").trim(),
    attire: String(record.attire ?? "").trim(),
    body: record.body ? String(record.body).trim() : undefined,
    expression: record.expression ? String(record.expression).trim() : undefined,
    action: record.action ? String(record.action).trim() : undefined,
    sex: record.sex ? String(record.sex).trim() : undefined,
    position: record.position ? String(record.position).trim() : undefined,
    supplement: record.supplement as string | V376Supplement | undefined,
    text: record.text ? String(record.text).trim() : undefined,
    negative: finalNegative,
    positive,
    identity: identityParts.join(", "),
  };
}

/**
 * Normalizes paragraph value to integer. Handles string ("P1", "1") or numeric input.
 */
function normalizeParagraphIndex(val: unknown): number {
  if (typeof val === "number" && !Number.isNaN(val)) {
    return Math.floor(val);
  }
  const str = String(val ?? "");
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

/**
 * Normalizes raw payload scenes into structured V376Payload adhering to Lua normalizeScenePayload.
 */
export function normalizeV376Payload(rawPayload: unknown, options?: V376Options): V376Payload {
  if (!rawPayload || typeof rawPayload !== "object") {
    return { scenes: [] };
  }

  const rawObj = rawPayload as Record<string, unknown>;
  const scenesList = Array.isArray(rawObj.scenes) ? rawObj.scenes : [];
  const normalizedScenes: V376Scene[] = [];

  for (const sceneCandidate of scenesList) {
    if (!sceneCandidate || typeof sceneCandidate !== "object") continue;
    const sceneObj = sceneCandidate as Record<string, unknown>;
    const groupPlace = String(sceneObj.place ?? "").trim();

    const shotsCandidates = Array.isArray(sceneObj.shots)
      ? sceneObj.shots
      : [sceneObj]; // fallback for legacy flat scene structure

    const normalizedShots: V376Shot[] = [];
    const nameCounters: Record<string, number> = {};

    for (const shotCandidate of shotsCandidates) {
      if (!shotCandidate || typeof shotCandidate !== "object") continue;
      const shotObj = shotCandidate as Record<string, unknown>;

      const characters: V376Character[] = [];
      const rawChars = Array.isArray(shotObj.characters) ? shotObj.characters : [];

      for (const rawChar of rawChars) {
        const normChar = normalizeCharacterData(rawChar, options);
        if (normChar.name === "") {
          let label = normChar.label || "character";
          nameCounters[label] = (nameCounters[label] ?? 0) + 1;
          const suffix = String.fromCharCode(64 + nameCounters[label]);
          normChar.name = `${label} ${suffix}`;
        }
        characters.push(normChar);
      }

      const panels: V376Panel[] = [];
      if (Array.isArray(shotObj.panels)) {
        for (const panelCandidate of shotObj.panels) {
          if (panelCandidate && typeof panelCandidate === "object") {
            const p = panelCandidate as Record<string, unknown>;
            panels.push({
              number: String(p.number ?? "").trim(),
              composition: String(p.composition ?? "").trim(),
              text: p.text !== undefined ? String(p.text).trim() : undefined,
            });
          }
        }
      }

      let sceneText = String(shotObj.scene ?? "").trim();
      if (!sceneText) {
        const envParts: string[] = [];
        const situation = String(shotObj.situation ?? "").trim();
        if (situation) envParts.push(situation);
        if (groupPlace) envParts.push(groupPlace);
        sceneText = envParts.join(", ");
      }

      normalizedShots.push({
        paragraph: normalizeParagraphIndex(shotObj.paragraph),
        quote: shotObj.quote ? String(shotObj.quote).trim() : undefined,
        camera: shotObj.camera ? String(shotObj.camera).trim() : undefined,
        situation: shotObj.situation ? String(shotObj.situation).trim() : undefined,
        characters,
        placement: shotObj.placement ? String(shotObj.placement).trim() : undefined,
        panels: panels.length > 0 ? panels : undefined,
        scene: sceneText,
        action: shotObj.action ? String(shotObj.action).trim() : undefined,
        sex: shotObj.sex ? String(shotObj.sex).trim() : undefined,
        supplement: shotObj.supplement ? String(shotObj.supplement).trim() : undefined,
        place: groupPlace,
      });
    }

    normalizedScenes.push({
      place: groupPlace,
      shots: normalizedShots,
    });
  }

  return {
    scenes: normalizedScenes,
    ...(rawObj.cover !== undefined ? { cover: rawObj.cover } : {}),
  };
}

/**
 * Main parser entry point: parses raw text or object into a verified V376Payload.
 * Structural recovery only; preserves semantic camera/identity data.
 */
export function parseV376Payload(value: unknown, options?: V376Options): V376Payload {
  let rawJson: unknown = value;
  if (typeof value === "string") {
    rawJson = extractCardImageJson(value);
  } else if (typeof value === "object" && value !== null) {
    rawJson = fixJsonKeys(value);
  }

  if (!rawJson || typeof rawJson !== "object") {
    throw new Error("Failed to extract valid V3.7.6 JSON payload from input.");
  }

  return normalizeV376Payload(rawJson, options);
}

/**
 * Flattens V376Payload into normalized shots matching Lua trigger_lua_0.lua normalizedScenes.
 */
export function normalizeV376Scenes(payload: V376Payload, options?: V376Options): V376NormalizedShot[] {
  const normalizedShots: V376NormalizedShot[] = [];

  for (const scene of payload.scenes) {
    for (const shot of scene.shots) {
      const normChars: V376NormalizedCharacter[] = shot.characters.map((c) => {
        const norm = normalizeCharacterData(c, options);
        return {
          name: c.name || norm.name,
          positive: c.positive ?? norm.positive,
          negative: c.negative ?? norm.negative,
          identity: c.identity ?? norm.identity,
        };
      });

      let sceneText = String(shot.scene ?? "").trim();
      if (!sceneText) {
        const envParts: string[] = [];
        const situation = String(shot.situation ?? "").trim();
        const place = String(scene.place ?? "").trim();
        if (situation) envParts.push(situation);
        if (place) envParts.push(place);
        sceneText = envParts.join(", ");
      }

      normalizedShots.push({
        paragraph: shot.paragraph,
        quote: shot.quote,
        camera: shot.camera,
        characters: normChars,
        scene: sceneText,
        action: shot.action,
        sex: shot.sex,
        supplement: typeof shot.supplement === "string" ? shot.supplement : undefined,
        panels: shot.panels ?? [],
        place: scene.place,
        placement: shot.placement,
      });
    }
  }

  return normalizedShots;
}
