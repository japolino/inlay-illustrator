/**
 * V3.7.6 Source-Faithful Prompt Assembly and Generation Pipeline.
 *
 * Faithfully ports Lua runtime routines from trigger_lua_0.lua:
 * - buildCharacterPromptGroups (lines 1206-1217)
 * - extractPresetSections (lines 1229-1259)
 * - removeDuplicateTags (lines 1261-1312)
 * - extractLLMPrompts (lines 1314-1415)
 * - applyPreset (lines 1597-1687)
 * - getFinalPromptsForGeneration (lines 1689-1930)
 *
 * Source Preset DSL & UI Mapping Notes:
 * 1. Preset Structure:
 *    Presets contain [Positive] and [Negative] marker tags (case-insensitive).
 *    In [Positive], the placeholders {prompt}, {setup}, {char}, and {supplement}
 *    are dynamically substituted.
 *    - {prompt} is replaced with setupPrompt + charPositive joined by mergeStr.
 *    - {setup} is replaced with setupPrompt.
 *    - {char} is replaced with charPositive.
 *    - {supplement} is erased (replaced with "") per source Lua line 1633/1642.
 *    If no placeholders are present, {prompt} is appended with joinStr.
 *    [Negative] replaces {prompt} with "" and appends charNegative with commaStr.
 * 2. Delimiters:
 *    - promptSeparator: "pipe" (default) uses joinStr=", ", mergeStr=" | ", commaStr=", ".
 *    - promptSeparator: "newline" uses joinStr="\n\n", mergeStr=",\n\n", commaStr=",\n\n".
 *    - promptSeparator: "native" with syntax: "nai" activates NovelAI v4 paired character channels.
 * 3. Weight & Syntax Escaping:
 *    - In NAI mode (compatMode == false), literal parentheses are escaped: ( -> \(, ) -> \).
 *    - In ComfyUI mode (compatMode == true), curly braces become parens: { -> (, } -> ).
 *      Negative character tags are formatted as (tag:-1) instead of -1::tag::.
 * 4. Custom Affix Mapping:
 *    In the original V3.7.6 module toggles:
 *    - toggle_Card.CustomPos ("커스텀 작가 태그" / Custom artist tags) is PREPENDED to the positive prompt.
 *    - toggle_Card.CustomNeg ("커스텀 퀄리티 태그" / Custom quality tags) is APPENDED to the positive prompt.
 *    In our UI, customPositivePrefix maps to CustomPos and customPositiveSuffix maps to CustomNeg.
 *    Any customNegative / negativeAffix configured by the user is explicitly appended to the negative prompt.
 * 5. Config Prompt Preset Adapter:
 *    When Config contains promptPresets and an activePromptPresetId, the active preset is converted:
 *    - If it already has [Positive] or [Negative], it is treated as a native source preset template.
 *    - Otherwise, positivePrefix is mapped to [Positive] and negativePrefix to [Negative].
 *      Because source applyPreset automatically appends {prompt} when placeholders are absent,
 *      plain prefix tags behave cleanly, and full DSL placeholders ({prompt}, {setup}, {char}) work seamlessly!
 */

import {
  V376Character,
  V376CompileOptions,
  V376CompiledShot,
  V376NativeCharacter,
  V376Options,
  V376Panel,
  V376Payload,
  V376Scene,
  V376Shot,
} from "./types.js";

export type { V376CompileOptions };
import { PLACEHOLDER_KEYS, PLACEHOLDER_MAP, RAW_PRESET_1 } from "./data.js";
import {
  filterStandaloneGenderTags,
  normalizeCharacterData,
  normalizeV376Payload,
} from "./schema.js";



/**
 * Helper to join prompt parts, discarding empty or whitespace-only elements.
 * Exact port of Lua joinPromptParts (lines 1197-1204).
 */
export function joinPromptParts(
  parts: (string | undefined | null)[],
  separator: string
): string {
  const filtered: string[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      const trimmed = part.trim();
      if (trimmed !== "") {
        filtered.push(trimmed);
      }
    }
  }
  return filtered.join(separator);
}

/**
 * Builds positive and negative character tag groups joined by divider.
 * Exact port of Lua buildCharacterPromptGroups (lines 1206-1217).
 */
export function buildCharacterPromptGroups(
  characters: V376Character[],
  divider: string,
  options?: Partial<V376Options>
): { positive: string; negative: string } {
  const positiveParts: string[] = [];
  const negativeParts: string[] = [];

  for (const char of characters ?? []) {
    if (!char) continue;
    let pos = (char.positive ?? "").trim();
    let neg = (char.negative ?? "").trim();

    // If positive is not pre-computed, normalize character properties
    if (pos === "") {
      const norm = normalizeCharacterData(char, options as V376Options);
      pos = norm.positive.trim();
      if (neg === "") neg = norm.negative.trim();
    }

    if (pos !== "") positiveParts.push(pos);
    if (neg !== "") negativeParts.push(neg);
  }

  return {
    positive: joinPromptParts(positiveParts, divider),
    negative: joinPromptParts(negativeParts, divider),
  };
}

/**
 * Extracts [Positive] and [Negative] sections from preset content string.
 * Exact port of Lua extractPresetSections (lines 1229-1259).
 */
export function extractPresetSections(content?: string): {
  positive: string;
  negative: string;
} {
  const trimmed = (content ?? "").trim();
  if (trimmed === "") return { positive: "", negative: "" };

  const lowerStr = trimmed.toLowerCase();
  const posStart = lowerStr.indexOf("[positive]");
  const negStart = lowerStr.indexOf("[negative]");

  let positive = "";
  let negative = "";

  if (posStart !== -1 && negStart !== -1 && posStart < negStart) {
    positive = trimmed.slice(posStart + 10, negStart);
    negative = trimmed.slice(negStart + 10);
  } else if (posStart !== -1 && negStart === -1) {
    positive = trimmed.slice(posStart + 10);
  } else if (negStart !== -1 && posStart === -1) {
    negative = trimmed.slice(negStart + 10);
  } else {
    return { positive: trimmed, negative: "" };
  }

  return { positive: positive.trim(), negative: negative.trim() };
}

/**
 * Converts a UI PromptPreset or custom prefix configuration into a source-faithful preset DSL string.
 */
export function convertConfigPresetToSourceDsl(preset: {
  positivePrefix?: string;
  negativePrefix?: string;
  content?: string;
}): string {
  if (preset.content && preset.content.trim() !== "") {
    return preset.content.trim();
  }
  const pos = (preset.positivePrefix ?? "").trim();
  const neg = (preset.negativePrefix ?? "").trim();

  // If already formatted with [Positive] or [Negative]
  const lower = `${pos} ${neg}`.toLowerCase();
  if (lower.includes("[positive]") || lower.includes("[negative]")) {
    return `${pos}\n\n${neg}`.trim();
  }

  const parts: string[] = [];
  if (pos !== "") {
    parts.push(`[Positive]\n${pos}`);
  }
  if (neg !== "") {
    parts.push(`[Negative]\n${neg}`);
  }

  return parts.join("\n\n").trim();
}

/**
 * Resolves active preset template from options or Config.
 */
export function resolvePresetContent(options: V376CompileOptions): string {
  if (options.presetContent && options.presetContent.trim() !== "") {
    return options.presetContent.trim();
  }

  if (options.activePromptPresetId && Array.isArray(options.promptPresets)) {
    const selected = options.promptPresets.find(
      (p) => p.id === options.activePromptPresetId
    );
    if (selected) {
      const converted = convertConfigPresetToSourceDsl(selected);
      if (converted !== "") {
        return converted;
      }
    }
  }

  return RAW_PRESET_1;
}

/**
 * Deduplicates comma-separated tags while safely preserving pipe (|) and newline boundaries.
 * Exact port of Lua removeDuplicateTags (lines 1261-1312).
 */
export function removeDuplicateTags(text: string): string {
  if (typeof text !== "string" || text === "") return text;

  const processPipeSegment = (segment: string): string => {
    const tags: string[] = [];
    const seen = new Set<string>();
    for (const rawTag of segment.split(",")) {
      const t = rawTag.trim();
      if (t !== "") {
        const lower = t.toLowerCase();
        if (!seen.has(lower)) {
          tags.push(t);
          seen.add(lower);
        }
      }
    }
    return tags.join(", ");
  };

  const processLine = (line: string): string => {
    const pipeSegments: string[] = [];
    let start = 0;
    while (true) {
      const pipePos = line.indexOf("|", start);
      if (pipePos === -1) {
        pipeSegments.push(processPipeSegment(line.slice(start)));
        break;
      }
      pipeSegments.push(processPipeSegment(line.slice(start, pipePos)));
      start = pipePos + 1;
    }
    return pipeSegments.join(" | ");
  };

  const lines: string[] = [];
  let start = 0;
  while (true) {
    const nlPos = text.indexOf("\n", start);
    if (nlPos === -1) {
      lines.push(processLine(text.slice(start)));
      break;
    }
    lines.push(processLine(text.slice(start, nlPos)));
    start = nlPos + 1;
  }

  return lines.join("\n");
}

/**
 * Decodes placeholder tokens (BP1..BP10, SE1..SE20) into explicit tags.
 * Exact port of Lua decodePlaceholders (lines 215-221).
 */
export function decodePlaceholders(prompt: string): string {
  if (!prompt) return prompt;
  let decoded = prompt;
  for (const code of PLACEHOLDER_KEYS) {
    if (decoded.includes(code)) {
      decoded = decoded.split(code).join(PLACEHOLDER_MAP[code]);
    }
  }
  return decoded;
}

/**
 * Intermediate extraction result matching Lua extractLLMPrompts.
 */
export interface ExtractedLLMPrompts {
  setupPrompt: string;
  charPositive: string;
  charNegative: string;
  charNames: string;
  panelsStr: string;
  characterNames: string[];
}

/**
 * Extracts and prepares raw prompts from a shot and its character list.
 * Exact port of Lua extractLLMPrompts (lines 1314-1415).
 */
export function extractLLMPrompts(
  shot: V376Shot,
  options?: Partial<V376Options>,
  parentPlace?: string
): ExtractedLLMPrompts {
  const cardMode = options?.mode === "asset" ? "1" : options?.mode === "comic" ? "2" : "0";
  const placement = (shot.placement ?? "").trim();

  let setupPrompt = "";
  let charPositive = "";
  let charNegative = "";

  if (cardMode === "2") {
    // Mode 2 (Comic): setup is place + placement
    const place = (shot.place || parentPlace || "").trim();
    const setupParts: string[] = [];
    if (place !== "") setupParts.push(place);
    if (placement !== "") setupParts.push(placement);

    setupPrompt = setupParts.join(", ");
    if (setupPrompt === "") {
      setupPrompt = joinPromptParts([shot.scene], ", ");
    }

    const groups = buildCharacterPromptGroups(shot.characters ?? [], " | ", options);
    charPositive = groups.positive;
    charNegative = groups.negative;

    setupPrompt = setupPrompt.split("from front").join("straight-on");
    charPositive = charPositive.split("from front").join("straight-on");
    setupPrompt = setupPrompt.split("young girl").join("loli");
    charPositive = charPositive.split("young girl").join("loli");
    setupPrompt = setupPrompt.split("young boy").join("shota");
    charPositive = charPositive.split("young boy").join("shota");

    charPositive = removeDuplicateTags(charPositive);
    charNegative = removeDuplicateTags(charNegative);
  } else {
    // Modes 0 (Illustration) and 1 (Asset): camera, scene, action, sex, placement
    const resolvedPlace = (parentPlace || shot.place || "").trim();
    let sceneText = (shot.scene || shot.situation || "").trim();
    if (resolvedPlace && !sceneText.includes(resolvedPlace)) {
      sceneText = sceneText ? `${resolvedPlace}, ${sceneText}` : resolvedPlace;
    }
    setupPrompt = joinPromptParts(
      [shot.camera, sceneText, shot.action, shot.sex, placement],
      ", "
    );

    const groups = buildCharacterPromptGroups(shot.characters ?? [], " | ", options);
    charPositive = groups.positive;
    charNegative = groups.negative;

    setupPrompt = setupPrompt.split("from front").join("straight-on");
    charPositive = charPositive.split("from front").join("straight-on");
    setupPrompt = setupPrompt.split("young girl").join("loli");
    charPositive = charPositive.split("young girl").join("loli");
    setupPrompt = setupPrompt.split("young boy").join("shota");
    charPositive = charPositive.split("young boy").join("shota");

    charPositive = removeDuplicateTags(charPositive);
    charNegative = removeDuplicateTags(charNegative);
  }

  if (cardMode === "2") {
    const extraTags = "comic panel, manga panel, ultra complexity";
    if (setupPrompt === "") setupPrompt = extraTags;
    else setupPrompt = `${setupPrompt}, ${extraTags}`;
  }

  // Build panels strings for mode 2
  let panelsStr = "";
  if (cardMode === "2" && Array.isArray(shot.panels) && shot.panels.length > 0) {
    const panelParts: string[] = [];
    for (const panel of shot.panels) {
      const parts: string[] = [];
      const num = String(panel.number ?? "").trim();
      const comp = String(panel.composition ?? "").trim();
      const txt = String(panel.text ?? "").trim();

      if (num !== "") parts.push(`panel ${num}`);
      if (comp !== "") parts.push(comp);
      if (txt !== "") parts.push(txt);

      const panelStr = parts.join(", ");
      if (panelStr !== "") panelParts.push(panelStr);
    }
    panelsStr = panelParts.join(" | ");
  }

  const characterNames = (shot.characters ?? [])
    .map((c) => (c.name ?? "").trim())
    .filter((n) => n !== "");

  return {
    setupPrompt,
    charPositive,
    charNegative,
    charNames: characterNames.join("|"),
    panelsStr,
    characterNames,
  };
}

/**
 * Applies a preset template to setupPrompt and character prompt groups.
 * Exact port of Lua applyPreset (lines 1597-1687).
 */
export function applyPreset(
  setupPrompt: string,
  charPositive: string,
  charNegative: string,
  presetContent: string,
  options?: {
    syntax?: "nai" | "comfyui";
    separator?: "pipe" | "newline" | "native";
    compatMode?: boolean;
    promptSep?: boolean;
  }
): { positive: string; negative: string } {
  const compatMode =
    options?.compatMode ?? options?.syntax === "comfyui";
  const promptSep =
    options?.promptSep ?? options?.separator === "newline";

  const { positive: positiveTemplateRaw, negative: negativeTemplateRaw } =
    extractPresetSections(presetContent);

  const joinStr = promptSep ? "\n\n" : ", ";
  const mergeStr = promptSep ? ",\n\n" : " | ";
  const commaStr = promptSep ? ",\n\n" : ", ";

  let positiveTemplate = positiveTemplateRaw;
  if (positiveTemplate === "") positiveTemplate = "{prompt}";
  if (
    !positiveTemplate.includes("{prompt}") &&
    !positiveTemplate.includes("{setup}") &&
    !positiveTemplate.includes("{char}") &&
    !positiveTemplate.includes("{supplement}")
  ) {
    positiveTemplate = positiveTemplate + joinStr + "{prompt}";
  }

  const promptBody = joinPromptParts([setupPrompt, charPositive], mergeStr);

  let positive = "";
  if (positiveTemplate.includes("{prompt}")) {
    positive = positiveTemplate.split("{prompt}").join(promptBody);
    positive = positive.split("{setup}").join(setupPrompt);
    positive = positive.split("{char}").join(charPositive);
    positive = positive.split("{supplement}").join("");
  } else {
    positive = positiveTemplate;
    if (positive.includes("{setup}")) {
      positive = positive.split("{setup}").join(setupPrompt);
    } else {
      positive = joinPromptParts([positive, setupPrompt], commaStr);
    }

    if (positive.includes("{char}")) {
      positive = positive.split("{char}").join(charPositive);
    } else {
      positive = joinPromptParts([positive, charPositive], mergeStr);
    }
    positive = positive.split("{supplement}").join("");
  }

  let negativeTemplate = negativeTemplateRaw;
  if (negativeTemplate === "") negativeTemplate = "{prompt}";
  let negative = negativeTemplate.split("{prompt}").join("");
  negative = joinPromptParts([negative, charNegative], commaStr);

  positive = positive.replace(/\n\n\n+/g, "\n\n");
  negative = negative.replace(/\n\n\n+/g, "\n\n");

  if (compatMode && !promptSep) {
    positive = positive.replace(/\n+/g, ", ");
    negative = negative.replace(/\n+/g, ", ");
  } else if (!compatMode) {
    // NovelAI: Escape parentheses so they don't break attention syntax
    positive = positive.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  positive = positive
    .replace(/,\s*,+/g, ", ")
    .replace(/^\s*,\s*/, "")
    .replace(/\s*,\s*$/, "");
  negative = negative
    .replace(/,\s*,+/g, ", ")
    .replace(/^\s*,\s*/, "")
    .replace(/\s*,\s*$/, "");

  // Protect ||...|| patterns from pipe cleaning
  const protectedBlocks: Record<string, string> = {};
  let pIdx = 1;
  positive = positive.replace(/\|\|(.*?)\|\|/gs, (match) => {
    const token = `@@BLOCK${pIdx++}@@`;
    protectedBlocks[token] = match;
    return token;
  });

  // Clean up awkward pipe spaces
  positive = positive
    .replace(/\|\s*\|/g, "|")
    .replace(/^\s*\|\s*/, "")
    .replace(/\s*\|\s*$/, "");

  if (!promptSep) {
    positive = positive.replace(/\s*\|\s*/g, " | ");
  }

  for (const [token, original] of Object.entries(protectedBlocks)) {
    positive = positive.split(token).join(original);
  }

  return { positive, negative };
}

/**
 * Post-processing step applying encoding placeholder resolution and ComfyUI weight formatting.
 * Exact port of Lua postProcess (lines 1800-1809).
 */
export function postProcessPrompt(
  str: string,
  options?: { encodingMode?: string; compatMode?: boolean; syntax?: "nai" | "comfyui" }
): string {
  if (!str) return "";
  let result = str;

  if (options?.encodingMode === "placeholder" || options?.encodingMode === "1") {
    result = decodePlaceholders(result);
  }

  const compatMode =
    options?.compatMode ?? options?.syntax === "comfyui";
  if (compatMode) {
    result = result.replace(/\{/g, "(").replace(/\}/g, ")");
  }

  return result;
}

/**
 * Compiles a single shot into generation-ready prompts.
 * Exact port of Lua getFinalPromptsForGeneration (lines 1689-1930).
 */
export function compileV376Shot(
  shot: V376Shot,
  options: V376CompileOptions,
  context?: { parentPlace?: string }
): V376CompiledShot {
  const promptSepVal =
    options.separator === "native"
      ? "2"
      : options.separator === "newline"
      ? "1"
      : "0";
  const promptSep = promptSepVal === "1";
  const useNaiV4Api = promptSepVal === "2" && options.syntax !== "comfyui";
  const cardMode =
    options.mode === "asset" ? "1" : options.mode === "comic" ? "2" : "0";
  const compatMode = options.syntax === "comfyui";
  const commaStr = promptSep ? ",\n\n" : ", ";

  const presetContent = resolvePresetContent(options);

  const extracted = extractLLMPrompts(shot, options, context?.parentPlace);
  const finalSetup = extracted.setupPrompt;
  const charPos = extracted.charPositive;
  const charNeg = extracted.charNegative;
  const panels = extracted.panelsStr;
  const cNamesList = extracted.characterNames;

  const splitByPipe = (str: string): string[] => {
    const parts: string[] = [];
    if (!str) return parts;
    const tokens = str.split(" | ");
    for (const tok of tokens) {
      const trimmed = tok.trim();
      if (trimmed !== "") parts.push(trimmed);
    }
    return parts;
  };

  const charPosParts = splitByPipe(charPos);
  const rawCharNegParts = splitByPipe(charNeg);
  const panelParts = splitByPipe(panels);

  // In NAI native mode, evaluate initial negative count before any padding:
  // Lua lines 1880-1881: if not negAligned and #charNegParts > 0 then ...
  // A shot where some characters lack negatives is mismatched: unaligned negatives
  // are concatenated to baseNeg, and character negative channels remain empty.
  const initialNegAligned =
    rawCharNegParts.length === charPosParts.length || rawCharNegParts.length === 0;

  const charNegParts = [...rawCharNegParts];
  if (rawCharNegParts.length === 0 && useNaiV4Api) {
    while (charNegParts.length < charPosParts.length) {
      charNegParts.push("");
    }
  }

  // Character appearance negative tag integration (Lua lines 1731-1798)
  const appMap = options.appearanceMap ?? {};
  if (cNamesList.length > 0) {
    if (useNaiV4Api) {
      if (initialNegAligned) {
        if (charPosParts.length === cNamesList.length) {
          for (let i = 0; i < cNamesList.length; i++) {
            const data = appMap[cNamesList[i]];
            if (data && data.negTags && data.negTags.trim() !== "") {
              const trimmedNeg = data.negTags.trim();
              if (charNegParts[i] === "") {
                charNegParts[i] = trimmedNeg;
              } else {
                charNegParts[i] = `${charNegParts[i]}, ${trimmedNeg}`;
              }
            }
          }
        } else {
          const allNegs: string[] = [];
          for (let i = 0; i < cNamesList.length; i++) {
            const data = appMap[cNamesList[i]];
            if (data && data.negTags && data.negTags.trim() !== "") {
              allNegs.push(data.negTags.trim());
            }
          }
          if (allNegs.length > 0) {
            const combined = allNegs.join(", ");
            if (charNegParts.length > 0) {
              charNegParts[0] = `${charNegParts[0]}, ${combined}`;
            } else {
              charNegParts.push(combined);
            }
          }
        }
      }
    } else {
      // Legacy String path (ComfyUI / pipe / newline): insert (-1::tag::) into positive
      if (charPosParts.length === cNamesList.length) {
        for (let i = 0; i < cNamesList.length; i++) {
          const data = appMap[cNamesList[i]];
          if (data && data.negTags && data.negTags.trim() !== "") {
            const formatted = compatMode
              ? `(${data.negTags.trim()}:-1)`
              : `-1::${data.negTags.trim()}::`;
            if (charPosParts[i] === "") {
              charPosParts[i] = formatted;
            } else {
              charPosParts[i] = `${charPosParts[i]}, ${formatted}`;
            }
          }
        }
      } else {
        const allNegs: string[] = [];
        for (let i = 0; i < cNamesList.length; i++) {
          const data = appMap[cNamesList[i]];
          if (data && data.negTags && data.negTags.trim() !== "") {
            const formatted = compatMode
              ? `(${data.negTags.trim()}:-1)`
              : `-1::${data.negTags.trim()}::`;
            allNegs.push(formatted);
          }
        }
        if (allNegs.length > 0) {
          const combined = allNegs.join(", ");
          if (charPosParts.length > 0) {
            charPosParts[0] = `${charPosParts[0]}, ${combined}`;
          } else {
            charPosParts.push(combined);
          }
        }
      }
    }
  }

  const customPos = (options.customPos ?? options.customPositivePrefix ?? "").trim();
  const customNeg = (options.customNeg ?? options.customPositiveSuffix ?? "").trim();
  const customNegative = (options.customNegative ?? options.negativeAffix ?? "").trim();

  // ============================================================
  // LEGACY/STRING MODE: ComfyUI or separator: "pipe" / "newline"
  // ============================================================
  if (!useNaiV4Api) {
    const mergeStr = promptSep ? "\n\n" : " | ";
    let mergedCharPos = charPosParts.join(mergeStr);
    const mergedCharNeg = charNegParts.join(mergeStr);

    if (panelParts.length > 0) {
      const panelMerge = panelParts.join(mergeStr);
      if (mergedCharPos === "") {
        mergedCharPos = panelMerge;
      } else {
        mergedCharPos = `${mergedCharPos}${mergeStr}${panelMerge}`;
      }
    }

    const applied = applyPreset(
      finalSetup,
      mergedCharPos,
      mergedCharNeg,
      presetContent,
      {
        compatMode,
        promptSep,
        syntax: options.syntax,
        separator: options.separator,
      }
    );

    let pos = applied.positive;
    let neg = applied.negative;

    if (cardMode === "1") {
      if (!pos.includes("white background")) {
        pos = `white background, simple background${commaStr}${pos}`;
      }
      if (!pos.includes("portrait")) {
        pos = `portrait${commaStr}${pos}`;
      }
      if (!pos.includes("cowboy shot")) {
        pos = pos.replace("portrait,", "portrait, cowboy shot,");
      }
      if (!pos.includes("looking at viewer")) {
        pos = `${pos}${commaStr}looking at viewer`;
      }
    }

    if (customPos !== "" && customPos !== "null") {
      if (pos === "") pos = customPos;
      else pos = `${customPos}${commaStr}${pos}`;
    }
    if (customNeg !== "" && customNeg !== "null") {
      if (pos === "") pos = customNeg;
      else pos = `${pos}${commaStr}${customNeg}`;
    }
    if (customNegative !== "" && customNegative !== "null") {
      if (neg === "") neg = customNegative;
      else neg = `${neg}${commaStr}${customNegative}`;
    }

    pos = postProcessPrompt(pos, {
      encodingMode: options.encodingMode,
      compatMode,
      syntax: options.syntax,
    });
    neg = postProcessPrompt(neg, {
      encodingMode: options.encodingMode,
      compatMode,
      syntax: options.syntax,
    });

    const corePrompt = joinPromptParts([finalSetup, mergedCharPos], mergeStr);

    return {
      paragraph: shot.paragraph,
      prompt: pos,
      negative: neg,
      corePrompt,
      rawShot: shot,
      scenePlace: context?.parentPlace || shot.place,
      quote: shot.quote,
      panels: panels !== "" ? panels : undefined,
      panelsPrompt: panels !== "" ? panels : undefined,
      characterNames: cNamesList,
    };
  }

  // ============================================================
  // NAI V4 NATIVE MODE: separator: "native" AND syntax: "nai"
  // ============================================================
  const appliedBase = applyPreset(finalSetup, "", "", presetContent, {
    compatMode: false,
    promptSep: false,
    syntax: "nai",
    separator: "native",
  });

  let basePos = appliedBase.positive;
  let baseNeg = appliedBase.negative;

  if (cardMode === "1") {
    if (!basePos.includes("white background")) {
      basePos = `white background, simple background${commaStr}${basePos}`;
    }
    if (!basePos.includes("portrait")) {
      basePos = `portrait${commaStr}${basePos}`;
    }
    if (!basePos.includes("cowboy shot")) {
      basePos = basePos.replace("portrait,", "portrait, cowboy shot,");
    }
    if (!basePos.includes("looking at viewer")) {
      basePos = `${basePos}${commaStr}looking at viewer`;
    }
  }

  if (customPos !== "" && customPos !== "null") {
    if (basePos === "") basePos = customPos;
    else basePos = `${customPos}${commaStr}${basePos}`;
  }
  if (customNeg !== "" && customNeg !== "null") {
    if (basePos === "") basePos = customNeg;
    else basePos = `${basePos}${commaStr}${customNeg}`;
  }
  if (customNegative !== "" && customNegative !== "null") {
    if (baseNeg === "") baseNeg = customNegative;
    else baseNeg = `${baseNeg}${commaStr}${customNegative}`;
  }

  // If character negatives could not align 1:1, concatenate unaligned negatives into baseNeg
  if (!initialNegAligned && rawCharNegParts.length > 0) {
    const allCharNeg = rawCharNegParts.filter((t) => t.trim() !== "").join(", ");
    if (allCharNeg !== "") {
      if (baseNeg === "") baseNeg = allCharNeg;
      else baseNeg = `${baseNeg}, ${allCharNeg}`;
    }
  }

  const nativeCharacters: V376NativeCharacter[] = [];
  for (let i = 0; i < charPosParts.length; i++) {
    const pos = charPosParts[i];
    if (pos !== "") {
      const neg = initialNegAligned ? charNegParts[i] ?? "" : "";
      const name = cNamesList[i];
      nativeCharacters.push({
        name,
        prompt: pos,
        negative: neg !== "" ? neg : undefined,
      });
    }
  }
  for (const panel of panelParts) {
    if (panel !== "") {
      nativeCharacters.push({
        prompt: panel,
        negative: undefined,
      });
    }
  }

  basePos = postProcessPrompt(basePos, {
    encodingMode: options.encodingMode,
    compatMode: false,
    syntax: "nai",
  });
  baseNeg = postProcessPrompt(baseNeg, {
    encodingMode: options.encodingMode,
    compatMode: false,
    syntax: "nai",
  });

  for (const char of nativeCharacters) {
    char.prompt = postProcessPrompt(char.prompt, {
      encodingMode: options.encodingMode,
      compatMode: false,
      syntax: "nai",
    });
    if (char.negative) {
      char.negative = postProcessPrompt(char.negative, {
        encodingMode: options.encodingMode,
        compatMode: false,
        syntax: "nai",
      });
    }
  }

  const corePrompt = joinPromptParts([finalSetup, charPos], " | ");

  return {
    paragraph: shot.paragraph,
    prompt: basePos,
    negative: baseNeg,
    corePrompt,
    nativeCharacters: nativeCharacters.length > 0 ? nativeCharacters : undefined,
    rawShot: shot,
    scenePlace: context?.parentPlace || shot.place,
    quote: shot.quote,
    panels: panels !== "" ? panels : undefined,
    panelsPrompt: panels !== "" ? panels : undefined,
    characterNames: cNamesList,
  };
}

/**
 * Normalizes input options from either typed V376CompileOptions or AppConfig.
 */
export function normalizeCompileOptions(
  config?: V376CompileOptions | Record<string, unknown>
): V376CompileOptions {
  if (!config) {
    return {
      mode: "illustration",
      separator: "pipe",
      syntax: "nai",
      nsfw: false,
      supplement: false,
      text: "off",
      quote: false,
      imageMin: 1,
      imageMax: 1,
      characterMax: 2,
      panelMin: 3,
      originalReference: false,
      originalCreationName: "",
      encodingMode: "plain",
    };
  }

  const cfg = config as Record<string, unknown>;

  // Detect mode
  let mode: V376Options["mode"] = "illustration";
  if (cfg.mode === "illustration" || cfg.mode === "asset" || cfg.mode === "comic") {
    mode = cfg.mode;
  } else if (
    cfg.moduleMode === "illustration" ||
    cfg.moduleMode === "asset" ||
    cfg.moduleMode === "comic"
  ) {
    mode = cfg.moduleMode;
  }

  // Detect separator
  let separator: V376Options["separator"] = "pipe";
  if (cfg.separator === "pipe" || cfg.separator === "newline" || cfg.separator === "native") {
    separator = cfg.separator;
  } else if (
    cfg.promptSeparator === "pipe" ||
    cfg.promptSeparator === "newline" ||
    cfg.promptSeparator === "native"
  ) {
    separator = cfg.promptSeparator;
  }

  // Detect syntax
  let syntax: V376Options["syntax"] = "nai";
  if (cfg.syntax === "nai" || cfg.syntax === "comfyui") {
    syntax = cfg.syntax;
  } else if (cfg.promptSyntax === "nai" || cfg.promptSyntax === "comfyui") {
    syntax = cfg.promptSyntax;
  }

  // Detect encoding
  let encodingMode: V376Options["encodingMode"] = "plain";
  if (
    cfg.encodingMode === "plain" ||
    cfg.encodingMode === "placeholder" ||
    cfg.encodingMode === "base64" ||
    cfg.encodingMode === "atbash"
  ) {
    encodingMode = cfg.encodingMode;
  }

  return {
    ...cfg,
    mode,
    separator,
    syntax,
    encodingMode,
    nsfw: Boolean(cfg.nsfw ?? cfg.nsfwInstructions ?? false),
    supplement: Boolean(cfg.supplement ?? false),
    quote: Boolean(cfg.quote ?? cfg.quoteEnabled ?? false),
    originalReference: Boolean(cfg.originalReference ?? false),
    originalCreationName: String(cfg.originalCreationName ?? ""),
    customPos: String(cfg.customPos ?? cfg.customPositivePrefix ?? ""),
    customNeg: String(cfg.customNeg ?? cfg.customPositiveSuffix ?? ""),
    customNegative: String(cfg.customNegative ?? cfg.negativeAffix ?? ""),
    activePromptPresetId: (cfg.activePromptPresetId as string | null | undefined) ?? undefined,
    promptPresets: Array.isArray(cfg.promptPresets) ? cfg.promptPresets : undefined,
    presetContent: typeof cfg.presetContent === "string" ? cfg.presetContent : undefined,
  } as V376CompileOptions;
}

/**
 * Main entry point: Compiles a V376Payload into source-faithful V376CompiledShot[] records.
 *
 * Adheres strictly to CONTRACT.md:
 * - Yields source-ordered positive/negative prompts and nativeCharacters paired channels.
 * - No ANIMA crop projection, shotPlan hierarchy, or remote camera repair constraints.
 * - Respects illustration, asset, and comic mode constructions faithfully.
 */
export function compileV376Payload(
  payload: V376Payload,
  config?: V376CompileOptions | Record<string, unknown>
): V376CompiledShot[] {
  const options = normalizeCompileOptions(config);

  // Normalize payload if raw structure passed
  const normalized =
    payload && Array.isArray(payload.scenes)
      ? payload
      : normalizeV376Payload(payload, options as V376Options);

  const compiledShots: V376CompiledShot[] = [];

  for (const scene of normalized.scenes ?? []) {
    const parentPlace = scene.place;
    for (const shot of scene.shots ?? []) {
      const compiled = compileV376Shot(shot, options, { parentPlace });
      compiledShots.push(compiled);
    }
  }

  return compiledShots;
}
