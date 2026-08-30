import type { Config } from "../shared/config.js";
import type { RawPromptData, CharacterJson, SceneJson, ShotJson } from "./types.js";
import { cleanString } from "./utils.js";
import { decodePlaceholders } from "./encoding.js";
// Keep existing helpers for backward compat where needed
export function normalizeReferenceTags(tagString: unknown): string {
  // Not used in new pipeline, keep simple
  const parts = String(tagString ?? "").split(",").map(s=>s.trim()).filter(Boolean).filter(tag=> {
    const l = tag.toLowerCase(); return l!=="null" && l!=="none";
  });
  // original normalizeReferenceTags uses unique, but not needed for new logic; keep dedupe preserved for legacy callers?
  // We'll keep unique behavior for legacy.
  const seen = new Set<string>(); const out: string[]=[];
  for(const p of parts){ const k=p.toLowerCase(); if(!seen.has(k)){seen.add(k); out.push(p);} }
  return out.join(", ");
}

export function normalizeCharacterName(value: unknown): string {
  return String(value ?? "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

export function buildCharacterTagReference(map: Record<string, string>): string {
  const lines = Object.entries(map)
    .map(([rawName, rawTags]) => {
      const name = normalizeCharacterName(rawName);
      const tags = normalizeReferenceTags(rawTags);
      return name && tags ? `- ${name}: ${tags}` : "";
    })
    .filter(Boolean);
  return lines.length
    ? ["## Previous Character Tags", "Use these as a baseline for returning characters (including their base attire). The current message always wins over this reference.", ...lines].join("\n")
    : "";
}

// Helpers
function trimWhitespace(value: unknown): string {
  return String(value ?? "").replace(/^\s+|\s+$/g, "").replace(/^\s+|\s+$/g, "").trim();
  // Equivalent to Lua trimWhitespace: match "^%s*(.-)%s*$"
}
function luaTrim(value: unknown): string {
  const s = String(value ?? "");
  const m = s.match(/^\s*(.*?)\s*$/s);
  return m ? m[1] : "";
}

function joinPromptParts(parts: (string|undefined)[], separator: string): string {
  const filtered: string[] = [];
  for (const p of parts || []) {
    const t = luaTrim(p ?? "");
    if (t !== "") filtered.push(t);
  }
  return filtered.join(separator);
}

function removeEscapedBalancedGroups(input: string): string {
  let s = input;
  while (true) {
    let idx = -1;
    for (let i = 0; i < s.length - 1; i++) {
      if (s.charCodeAt(i) === 92 && s.charCodeAt(i + 1) === 40) { idx = i; break; }
    }
    if (idx === -1) break;
    let depth = 1;
    let j = idx + 2;
    let found = -1;
    while (j < s.length) {
      if (j + 1 < s.length && s.charCodeAt(j) === 92 && s.charCodeAt(j + 1) === 40) { depth++; j += 2; continue; }
      if (j + 1 < s.length && s.charCodeAt(j) === 92 && s.charCodeAt(j + 1) === 41) { depth--; if (depth === 0) { found = j + 2; break; } j += 2; continue; }
      j++;
    }
    if (found !== -1) {
      s = s.slice(0, idx) + s.slice(found);
    } else {
      break;
    }
  }
  return s;
}

function removeTrailingBalancedOrdinary(input: string): string {
  let s = input;
  let end = s.length;
  while (end > 0 && /\s/.test(s[end - 1])) end--;
  if (end === 0 || s.charCodeAt(end - 1) !== 41) return s;
  let depth = 0;
  let openPos = -1;
  for (let i = end - 1; i >= 0; i--) {
    const c = s.charCodeAt(i);
    if (c === 41) depth++;
    else if (c === 40) { depth--; if (depth === 0) { openPos = i; break; } }
  }
  if (openPos === -1) return s;
  let start = openPos;
  while (start > 0 && /\s/.test(s[start - 1])) start--;
  return s.slice(0, start);
}

// Port normalizeCharacterData exactly
export function normalizeCharacterData(char: unknown, config: Config): { name: string; positive: string; negative: string; identity: string } | null {
  if (typeof char !== "object" || char === null) return null;
  const c = char as Record<string, unknown>;
  const useOriginal = config.originalReference === true;
  let finalName = luaTrim(String(c["name"] ?? ""));
  const lowerFinal = finalName.toLowerCase();
  if (lowerFinal === "null" || lowerFinal === "none") finalName = "";
  let baseName = finalName;
  let creationName = "";
  if (useOriginal) {
    creationName = luaTrim(String(config.originalCreationName ?? ""));
    const lc = creationName.toLowerCase();
    if (creationName !== "" && lc !== "null" && lc !== "none" && finalName !== "") {
      finalName = removeEscapedBalancedGroups(finalName);
      finalName = removeTrailingBalancedOrdinary(finalName);
      finalName = luaTrim(finalName);
      baseName = finalName;
      if (finalName !== "") {
        const compatMode = config.promptSyntax === "comfyui";
        const creationSuffix = compatMode ? ` \\\(${creationName}\\\)` : ` (${creationName})`;
        finalName = finalName + creationSuffix;
        // original mutates char.name = finalName; not needed but keep?
      }
    }
  }
  let positive = luaTrim(String(c["positive"] ?? ""));
  const lp = positive.toLowerCase();
  if (lp === "null" || lp === "none") positive = "";
  if (positive !== "" && useOriginal && creationName !== "" && finalName !== "") {
    if (!positive.includes(finalName)) {
      if (baseName !== "" && positive.includes(baseName)) {
        // replace first occurrence only, escaping % as in Lua gsub replacement
        // In JS, simple replace first
        const idx = positive.indexOf(baseName);
        if (idx !== -1) {
          positive = positive.slice(0, idx) + finalName + positive.slice(idx + baseName.length);
        }
      } else {
        positive = positive + ", " + finalName;
      }
    }
  }
  if (positive === "") {
    const parts: string[] = [];
    const keys = useOriginal
      ? ["label", "name", "age", "appearance", "body", "attire", "expression", "action"]
      : ["label", "age", "appearance", "body", "attire", "expression", "action"];
    for (const key of keys) {
      let val: string;
      if (key === "name") {
        // use finalName (which may include suffix) as char.name after mutation
        val = luaTrim(finalName);
      } else {
        val = luaTrim(String(c[key] ?? ""));
      }
      if (val !== "" && val.toLowerCase() !== "null" && val.toLowerCase() !== "none") parts.push(val);
    }
    positive = parts.join(", ");
  }
  const identityParts: string[] = [];
  const idKeys = ["label", "age", "appearance", "body", "attire"];
  for (const key of idKeys) {
    const val = luaTrim(String(c[key] ?? ""));
    if (val !== "" && val.toLowerCase() !== "null" && val.toLowerCase() !== "none") identityParts.push(val);
  }
  let finalNegative = luaTrim(String(c["negative"] ?? ""));
  if (finalNegative.toLowerCase() === "null" || finalNegative.toLowerCase() === "none") finalNegative = "";
  return { name: finalName, positive, negative: finalNegative, identity: identityParts.join(", ") };
}

// Extract preset sections
export function extractPresetSections(content: unknown): [string, string] {
  const trimmed = luaTrim(String(content ?? ""));
  if (trimmed === "") return ["", ""];
  // Lua: positive = trimmed:match("%[Positive%]%s*([%s%S]-)%s*%[Negative%]")
  // negative = trimmed:match("%[Negative%]%s*([%s%S]-)%s*$")
  // Use JS equivalent: capture between [Positive] and [Negative], and after [Negative] to end
  // Note: need to handle multiline including newlines
  const posMatch = trimmed.match(/\[Positive\]\s*([\s\S]*?)\s*\[Negative\]/);
  const negMatch = trimmed.match(/\[Negative\]\s*([\s\S]*?)\s*$/);
  const positive = posMatch ? luaTrim(posMatch[1] ?? "") : "";
  const negative = negMatch ? luaTrim(negMatch[1] ?? "") : "";
  if (positive || negative) return [positive, negative];
  return [trimmed, ""];
}

// buildAnimaPromptBody
export function buildAnimaPromptBody(entry: RawPromptData & { animaMode?: boolean }, compatMode: boolean): string {
  const sectionDivider = (compatMode || (entry && (entry as any).animaMode)) ? ",\n" : ", ";
  if (entry) {
    const hasStructuredSetup =
      luaTrim(entry.situation ?? "") !== "" ||
      luaTrim(entry.place ?? "") !== "" ||
      luaTrim(entry.camera ?? "") !== "" ||
      luaTrim(entry.action ?? "") !== "";
    if (!hasStructuredSetup) {
      return joinPromptParts([entry.charPos, entry.setup], sectionDivider);
    }
  }
  const parts = [
    entry ? entry.situation : "",
    entry ? entry.charPos : "",
    entry ? entry.action : "",
    entry ? entry.camera : "",
    entry ? entry.place : "",
  ];
  return joinPromptParts(parts, sectionDivider);
}

// buildCharacterPromptGroups
function buildCharacterPromptGroups(scene: { characters?: Array<{ positive?: string; negative?: string }> }, divider: string): [string, string] {
  const posParts: string[] = [];
  const negParts: string[] = [];
  for (const ch of (scene.characters as any[]) || []) {
    if (!ch) continue;
    const p = luaTrim(ch.positive ?? "");
    const n = luaTrim(ch.negative ?? "");
    if (p !== "") posParts.push(p);
    if (n !== "") negParts.push(n);
  }
  return [joinPromptParts(posParts, divider), joinPromptParts(negParts, divider)];
}

// extractLLMPrompts
export function extractLLMPrompts(scene: any, config: Config): RawPromptData {
  const setupPrompt = joinPromptParts([scene.camera, scene.scene, scene.action], ", ");
  const compatMode = config.promptSyntax === "comfyui";
  const animaMode = config.promptStyle === "anima";
  const characterDivider = (compatMode || animaMode) ? ",\n" : " | ";
  const [charPos, charNeg] = buildCharacterPromptGroups(scene, characterDivider);
  return {
    setup: setupPrompt,
    charPos,
    charNeg,
    supplement: luaTrim(scene.supplement ?? ""),
    situation: luaTrim(scene.situation ?? ""),
    place: luaTrim(scene.place ?? ""),
    camera: luaTrim(scene.camera ?? ""),
    action: luaTrim(scene.action ?? ""),
  };
}

// applyPreset exactly
// Lorebook presets (프리셋 N) are intentionally not supported on Lumiverse: the
// structured saved presets (config.promptPresets / activePromptPresetId) are the
// only preset source. No saved preset → bare {prompt} template via the fallback
// below, matching staging.
export function applyPreset(entry: RawPromptData, config: Config): [string, string] {
  const compatMode = config.promptSyntax === "comfyui";
  const useAnima = config.promptStyle === "anima";
  const selectedPreset = activePromptPreset(config);
  let positiveTemplate = selectedPreset?.positivePrefix ?? "";
  let negativeTemplate = selectedPreset?.negativePrefix ?? "";
  if (positiveTemplate === "") positiveTemplate = "{prompt}";
  const hasPromptPlaceholder = positiveTemplate.includes("{prompt}") || positiveTemplate.includes("{setup}") || positiveTemplate.includes("{char}") || positiveTemplate.includes("{supplement}");
  if (!hasPromptPlaceholder) {
    const promptAppendDivider = (compatMode || useAnima) ? ",\n" : " | ";
    positiveTemplate = positiveTemplate + promptAppendDivider + "{prompt}";
  }
  const promptDivider = (compatMode || useAnima) ? ",\n" : " | ";
  // Build promptEntry for anima body: need to set animaMode
  const promptEntry: RawPromptData & { animaMode?: boolean } = { ...entry, animaMode: useAnima };
  // promptBody
  const promptBody = useAnima ? buildAnimaPromptBody(promptEntry, compatMode) : joinPromptParts([entry.setup, entry.charPos], promptDivider);

  let positive = "";
  if (positiveTemplate.includes("{prompt}")) {
    // Gsub order: {prompt} first, then {setup}, {char}, {supplement}
    positive = positiveTemplate.split("{prompt}").join(promptBody);
    positive = positive.split("{setup}").join(entry.setup);
    positive = positive.split("{char}").join(entry.charPos);
    positive = positive.split("{supplement}").join("");
  } else {
    positive = positiveTemplate;
    if (positive.includes("{setup}")) {
      positive = positive.split("{setup}").join(entry.setup);
    } else {
      positive = joinPromptParts([positive, entry.setup], ", ");
    }
    if (positive.includes("{char}")) {
      positive = positive.split("{char}").join(entry.charPos);
    } else {
      positive = joinPromptParts([positive, entry.charPos], promptDivider);
    }
    positive = positive.split("{supplement}").join("");
  }

  if (negativeTemplate === "") negativeTemplate = "{prompt}";
  let negative = negativeTemplate.split("{prompt}").join("");
  negative = joinPromptParts([negative, entry.charNeg], ", ");

  // triple newline collapse: gsub("\n\n\n+", "\n\n")
  positive = positive.replace(/\n\n\n+/g, "\n\n");
  negative = negative.replace(/\n\n\n+/g, "\n\n");

  if (compatMode) {
    positive = positive.replace(/[ \t]*\n[ \t]*/g, "\n");
    negative = negative.replace(/\n+/g, ", ");
  } else {
    // escape parentheses only on positive
    positive = positive.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  // comma cleanup
  positive = positive.replace(/,\s*,+/g, ", ").replace(/^\s*,\s*/, "").replace(/\s*,\s*$/, "");
  negative = negative.replace(/,\s*,+/g, ", ").replace(/^\s*,\s*/, "").replace(/\s*,\s*$/, "");

  if (!compatMode) {
    const protectedBlocks: Record<string,string> = {};
    let pIdx = 1;
    positive = positive.replace(/\|\|(.*?)\|\|/g, (_match, inner: string) => {
      const token = `@@BLOCK${pIdx}@@`;
      protectedBlocks[token] = `||${inner}||`;
      pIdx++;
      return token;
    });
    positive = positive.replace(/\|\s*\|/g, "|").replace(/^\s*\|\s*/, "").replace(/\s*\|\s*$/, "");
    positive = positive.replace(/\s*\|\s*/g, " | ");
    for (const [token, original] of Object.entries(protectedBlocks)) {
      // original includes % handling: gsub("%%","%%%%") equivalent to escaping % for replacement; not needed in JS
      positive = positive.split(token).join(original);
    }
  }

  return [positive, negative];
}

// getFinalPromptsForGeneration exactly
export function getFinalPromptsForGeneration(entry: RawPromptData, config: Config): [string, string] {
  let [pos, neg] = applyPreset(entry, config);

  // asset injections
  if (config.mode === "asset") {
    if (!pos.includes("white background")) pos = "white background, simple background, " + pos;
    if (!pos.includes("portrait")) pos = "portrait, " + pos;
    if (!pos.includes("cowboy shot")) pos = pos.replace("portrait,", "portrait, cowboy shot,");
    if (!pos.includes("looking at viewer")) pos = pos + ", looking at viewer";
  }

  // custom positive front
  let customPos = luaTrim(String(config.customPositivePrefix ?? ""));
  if (customPos === "null") customPos = "";
  let customNeg = luaTrim(String(config.customNegative ?? ""));
  if (customNeg === "null") customNeg = "";

  if (customPos !== "") {
    if (pos === "") pos = customPos;
    else pos = customPos + ", " + pos;
  }
  if (customNeg !== "") {
    if (pos === "") pos = customNeg;
    else pos = pos + ", " + customNeg;
  }

  // supplement after customNegative
  if (config.supplement === true) {
    const sup = luaTrim(entry.supplement ?? "");
    if (sup !== "") {
      const supplementDivider = config.promptStyle === "anima" ? ",\n" : ", ";
      if (pos === "") pos = sup;
      else pos = pos + supplementDivider + sup;
    }
  }

  // placeholder decode when encodeMode 0
  if (config.encodeMode === "0") {
    pos = decodePlaceholders(pos);
    neg = decodePlaceholders(neg);
  }

  // compat brace conversion
  if (config.promptSyntax === "comfyui") {
    pos = pos.replace(/\{/g, "(").replace(/\}/g, ")");
    neg = neg.replace(/\{/g, "(").replace(/\}/g, ")");
  }

  return [pos, neg];
}

// Legacy helpers retained for generation staging

export function renderPrompt(prompt: import("./types.js").AssembledPrompt, syntax: Config["promptSyntax"]): string {
  // AssembledPrompt is built via getFinal currently? But keep simple join
  const clean = prompt.sections.map(s => s.trim()).filter(Boolean);
  if (prompt.format === "ordered") return clean.join(",\n");
  if (syntax === "comfyui") return clean.join(",\n");
  return clean.join(" | ");
}

export function activePromptPreset(config: Config): import("../shared/config.js").PromptPreset | null {
  return config.promptPresets.find(p => p.id === config.activePromptPresetId) || null;
}

// For tests that still call finalizePromptText etc, provide exact but deprecate
export function finalizePromptText(text: string, config: Config): string {
  let out = text;
  if (config.encodeMode === "0") out = decodePlaceholders(out);
  if (config.promptSyntax === "comfyui") out = out.replace(/\{/g, "(").replace(/\}/g, ")");
  else out = out.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  return out;
}

export function renderPromptWithCurrentAffixes(corePrompt: string, format: "legacy"|"ordered", config: Config): string {
  // Deprecated: now recomposed via getFinal; keep for compat but not used in reroll
  // This was previously adding custom affixes broad; now we want exact behavior without suffix.
  // For backward tests, we treat as applyPreset from raw? But keep simple: return corePrompt with affixes per original? We'll just call getFinal with dummy raw using corePrompt as setup?
  // Not used in new pipeline; return corePrompt transformed only by placeholder/compat
  return finalizePromptText(corePrompt, config);
}

export function renderNegativeWithCurrentSelection(shotNegative: string, _format: any, config: Config): string {
  const rawNegative = luaTrim(String(shotNegative ?? ""));
  if (rawNegative === "") return "";
  let out = rawNegative;
  if (config.encodeMode === "0") out = decodePlaceholders(out);
  if (config.promptSyntax === "comfyui") {
    out = out.replace(/\n+/g, ", ");
    out = out.replace(/\{/g, "(").replace(/\}/g, ")");
  }
  // NAI negative must NOT escape parentheses (original defect preserved)
  out = out.replace(/,\s*,+/g, ", ").replace(/^\s*,\s*/, "").replace(/\s*,\s*$/, "");
  return out;
}

// For scenes building
export function assemblePrompt(scene: SceneJson, shot: ShotJson, config: Config, parserParagraph: number, originalParagraph: number): import("./types.js").PromptEntry {
  // This is called from selectPromptEntries - but new pipeline should not use assemblePrompt; instead it should use normalizeCharacterData + extractLLMPrompts + getFinal
  // We'll implement as legacy wrapper that builds raw and then final, for compatibility.
  // Merge scene and shot into normalized scene object (use shot.scene fallback etc) but we want exact.
  // Use normalizeScenePayload-style merging: sceneText = shot.scene or situation+place
  // For this wrapper, create a temporary normalized scene
  const tmpScene: any = {
    camera: String(shot.camera ?? ""),
    scene: (() => {
      const s = luaTrim(String((shot as any).scene ?? ""));
      if (s !== "") return s;
      const sit = luaTrim(String(shot.situation ?? ""));
      const place = luaTrim(String(scene.place ?? ""));
      return joinPromptParts([sit, place], ", ");
    })(),
    action: String(shot.action ?? ""),
    supplement: String(shot.supplement ?? ""),
    situation: "", // defect: empty
    place: "", // defect: empty
    characters: (shot.characters ?? []).map(ch => {
      const norm = normalizeCharacterData(ch, config);
      return norm ?? { name:"", positive:"", negative:"", identity:"" };
    }),
  };
  const raw = extractLLMPrompts(tmpScene, config);
  const [finalPos, finalNeg] = getFinalPromptsForGeneration(raw, config);
  const adaptedShotNegative = raw.charNeg;
  // Build AssembledPrompt from finalPos (split? But original prompt is single string; we'll store as single section)
  // For PromptEntry, prompt sections should be final string? But keep sections as [finalPos]
  const isAnima = config.promptStyle === "anima";
  return {
    prompt: { sections: [finalPos], format: isAnima ? "ordered" : "legacy" },
    corePrompt: { sections: [raw.setup + (raw.charPos ? ", " + raw.charPos : "")], format: isAnima ? "ordered" : "legacy" },
    shotNegative: adaptedShotNegative,
    negative: finalNeg,
    paragraph: originalParagraph,
    parserParagraph,
    quote: String(shot.quote ?? ""),
    rawPromptData: raw,
  };
}
