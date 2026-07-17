// src/shared/config.ts
var DEFAULT_CONFIG = {
  enabled: true,
  autoGenerate: true,
  debugLogging: true,
  mode: "illustration",
  parserConnectionId: null,
  parserModel: "",
  parserParameters: {},
  imageConnectionId: null,
  imageModel: "",
  imageParameters: {},
  minImages: 3,
  maxImages: 5,
  maxCharacters: 2,
  includeMinMessages: 0,
  includeMaxMessages: 8,
  parserRetries: 1,
  preprocessingEnabled: false,
  inlayImageWidth: 640,
  assetImageWidth: 400,
  inlayImageMaxHeightVh: 70,
  promptStyle: "anima",
  promptSyntax: "comfyui",
  includeUserInfo: true,
  includeCharacterInfo: true,
  includeLorebook: false,
  characterTagContextEnabled: true,
  userInstructionsEnabled: true,
  customParserInstructions: "",
  originalReference: false,
  originalCreationName: "",
  supplement: true,
  danbooruCleanup: false,
  danbooruEndpoint: "http://127.0.0.1:8000/tools/validate_tags",
  ignoredTags: "",
  customPositivePrefix: "",
  customPositiveSuffix: "",
  customNegative: "",
  promptPresets: [],
  activePromptPresetId: null
};
function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}
function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function cleanNullableString(value) {
  return cleanString(value) || null;
}
function cleanParameters(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalizePromptPresets(value) {
  if (!Array.isArray(value))
    return [];
  const seen = new Set;
  const presets = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      continue;
    const id = cleanString(candidate.id);
    const name = cleanString(candidate.name);
    if (!id || !name || seen.has(id))
      continue;
    seen.add(id);
    presets.push({
      id,
      name,
      positivePrefix: cleanString(candidate.positivePrefix),
      negativePrefix: cleanString(candidate.negativePrefix)
    });
  }
  return presets;
}
function normalizeConfig(raw) {
  const imageGeneration = raw.imageGeneration || {};
  const includeMin = clampInt(raw.includeMinMessages, 0, 32, DEFAULT_CONFIG.includeMinMessages);
  const includeMax = clampInt(raw.includeMaxMessages, 0, 32, DEFAULT_CONFIG.includeMaxMessages);
  const minImages = clampInt(raw.minImages, 1, 12, DEFAULT_CONFIG.minImages);
  const maxImages = clampInt(raw.maxImages, 1, 12, DEFAULT_CONFIG.maxImages);
  const promptPresets = normalizePromptPresets(raw.promptPresets);
  const activePromptPresetId = cleanNullableString(raw.activePromptPresetId);
  const parserParameters = cleanParameters(raw.parserParameters);
  const imageParameters = cleanParameters(raw.imageParameters);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    mode: raw.mode === "asset" ? "asset" : "illustration",
    parserConnectionId: cleanNullableString(raw.parserConnectionId) || cleanNullableString(imageGeneration.promptParserConnectionId),
    parserModel: cleanString(raw.parserModel) || cleanString(imageGeneration.promptParserModel),
    parserParameters: Object.keys(parserParameters).length > 0 ? parserParameters : cleanParameters(imageGeneration.promptParserParameters),
    imageConnectionId: cleanNullableString(raw.imageConnectionId) || cleanNullableString(imageGeneration.activeImageGenConnectionId),
    imageModel: cleanString(raw.imageModel) || cleanString(imageGeneration.model),
    imageParameters: Object.keys(imageParameters).length > 0 ? imageParameters : cleanParameters(imageGeneration.parameters),
    minImages: Math.min(minImages, maxImages),
    maxImages: Math.max(minImages, maxImages),
    maxCharacters: clampInt(raw.maxCharacters, 1, 8, DEFAULT_CONFIG.maxCharacters),
    includeMinMessages: Math.min(includeMin, includeMax),
    includeMaxMessages: Math.max(includeMin, includeMax),
    parserRetries: clampInt(raw.parserRetries, 0, 5, DEFAULT_CONFIG.parserRetries),
    preprocessingEnabled: raw.preprocessingEnabled === true,
    inlayImageWidth: clampInt(raw.inlayImageWidth, 120, 2400, DEFAULT_CONFIG.inlayImageWidth),
    assetImageWidth: clampInt(raw.assetImageWidth, 120, 2400, DEFAULT_CONFIG.assetImageWidth),
    inlayImageMaxHeightVh: clampInt(raw.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh),
    promptStyle: raw.promptStyle === "default" ? "default" : "anima",
    promptSyntax: raw.promptSyntax === "nai" ? "nai" : "comfyui",
    includeUserInfo: raw.includeUserInfo !== false,
    includeCharacterInfo: raw.includeCharacterInfo !== false,
    includeLorebook: raw.includeLorebook === true,
    characterTagContextEnabled: raw.characterTagContextEnabled !== false,
    userInstructionsEnabled: raw.userInstructionsEnabled !== false,
    customParserInstructions: cleanString(raw.customParserInstructions),
    ignoredTags: cleanString(raw.ignoredTags),
    customPositivePrefix: cleanString(raw.customPositivePrefix),
    customPositiveSuffix: cleanString(raw.customPositiveSuffix),
    customNegative: cleanString(raw.customNegative),
    promptPresets,
    activePromptPresetId: activePromptPresetId && promptPresets.some((preset) => preset.id === activePromptPresetId) ? activePromptPresetId : null
  };
}

// src/backend/logging.ts
function logStage(config, stage, details, level = "info") {
  if (!config?.debugLogging && level !== "error")
    return;
  const suffix = details ? ` ${JSON.stringify(details, (_key, value) => {
    if (typeof value === "string" && value.length > 300)
      return `${value.slice(0, 300)}...(${value.length} chars)`;
    return value;
  })}` : "";
  const message = `[Inlay:${stage}]${suffix}`;
  if (level === "warn")
    spindle.log.warn(message);
  else if (level === "error")
    spindle.log.error(message);
  else
    spindle.log.info(message);
}

// src/backend/utils.ts
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function keysOf(value) {
  return Object.keys(asRecord(value));
}
function clampInt2(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}
function cleanString2(value) {
  return typeof value === "string" ? value.trim() : "";
}
function cleanArray(value) {
  return Array.isArray(value) ? value : [];
}
function compactBlock(value, maxLength) {
  const clean = value.replace(/\r\n/g, `
`).replace(/[ \t]+\n/g, `
`).replace(/\n{3,}/g, `

`).trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength).trim()}
...[truncated]` : clean;
}
function csvParts(...values) {
  return values.flatMap((value) => String(value || "").split(",")).map((value) => value.trim()).filter(Boolean);
}
function unique(parts) {
  const seen = new Set;
  const output = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key))
      continue;
    seen.add(key);
    output.push(part);
  }
  return output;
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function parseCorsJson(response, label) {
  const wrapper = asRecord(response);
  if ("body" in wrapper || "status" in wrapper || "statusText" in wrapper) {
    const { status, statusText, body } = wrapper;
    if (typeof status === "number" && (status < 200 || status >= 300)) {
      throw new Error(`${label} returned HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
    }
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch {
        throw new Error(`${label} returned invalid JSON`);
      }
    }
    if (body && typeof body === "object")
      return body;
    throw new Error(`${label} returned an empty response body`);
  }
  return response;
}

// src/backend/prompt.ts
function normalizeReferenceTags(tagString) {
  return unique(csvParts(tagString).filter((tag) => {
    const normalized = tag.toLowerCase();
    return normalized !== "null" && normalized !== "none";
  })).join(", ");
}
function stripParenthetical(value) {
  return value.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}
function displayName(name, config) {
  const clean = stripParenthetical(name);
  const source = config.originalCreationName.trim();
  return config.originalReference && clean && source ? `${clean} \\(${source}\\)` : clean;
}
function normalizeCharacterName(value) {
  return stripParenthetical(cleanString2(value));
}
function shouldIncludeCharacterNames(config) {
  return config.originalReference === true && config.originalCreationName.trim().length > 0;
}
function characterDescriptor(character) {
  const parts = csvParts(character.label, character.age);
  const text = parts.join(" ").toLowerCase();
  if (/\bgirl\b|\bfemale\b|\bwoman\b/.test(text))
    return "the girl";
  if (/\bboy\b|\bmale\b|\bman\b/.test(text))
    return "the boy";
  if (/\bchild\b/.test(text))
    return "the child";
  return "the character";
}
function buildNameReplacementMap(characters) {
  const replacements = new Map;
  for (const character of characters) {
    const descriptor = characterDescriptor(character);
    const raw = cleanString2(character.name);
    const normalized = normalizeCharacterName(raw);
    for (const name of unique([raw, normalized].filter(Boolean))) {
      if (name.length >= 2)
        replacements.set(name, descriptor);
    }
  }
  return replacements;
}
function stripOrReplaceNames(value, replacements, tagField) {
  if (!value || replacements.size === 0)
    return value;
  if (tagField) {
    return unique(csvParts(value).map((tag) => {
      let next2 = tag;
      for (const [name, descriptor] of replacements) {
        const tagName = next2.replace(/\\\(|\\\)/g, "").replace(/[()]/g, "").trim().toLowerCase();
        const cleanName = name.replace(/[()]/g, "").trim().toLowerCase();
        if (tagName === cleanName || tagName === cleanName.replace(/\s+/g, "_"))
          return "";
        next2 = next2.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), descriptor);
      }
      return next2.trim();
    }).filter(Boolean)).join(", ");
  }
  let next = value;
  for (const [name, descriptor] of replacements) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), descriptor);
  }
  return next.replace(/\s+/g, " ").trim();
}
function buildCharacterTagReference(map) {
  const lines = Object.entries(map).map(([rawName, rawTags]) => {
    const name = normalizeCharacterName(rawName);
    const tags = normalizeReferenceTags(rawTags);
    return name && tags ? `- ${name}: ${tags}` : "";
  }).filter(Boolean);
  return lines.length ? ["## Previous Character Tags", ...lines].join(`
`) : "";
}
function joinSections(sections, syntax) {
  const clean = sections.map((section) => section.trim()).filter(Boolean);
  return syntax === "comfyui" ? clean.join(`,
`) : clean.join(", ");
}
function renderPrompt(prompt, syntax) {
  const supplementIndex = Math.min(Math.max(prompt.supplementAfterTagSections, 0), prompt.tagSections.length);
  return joinSections([
    ...prompt.tagSections.slice(0, supplementIndex),
    prompt.supplement,
    ...prompt.tagSections.slice(supplementIndex)
  ], syntax);
}
function activePromptPreset(config) {
  return config.promptPresets.find((preset) => preset.id === config.activePromptPresetId) || null;
}
function dedupePromptSections(sections) {
  const seen = new Set;
  const output = [];
  for (const section of sections.map((value) => value.trim()).filter(Boolean)) {
    const key = section.toLowerCase();
    if (seen.has(key))
      continue;
    seen.add(key);
    output.push(section);
  }
  return output;
}
function removeSupplementActionDuplicates(supplement, actionTags) {
  let next = supplement.trim();
  for (const action of csvParts(actionTags)) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(action)}\\b`, "gi"), " ");
  }
  return next.replace(/\s+([,.])/g, "$1").replace(/\s+/g, " ").trim();
}
function assembleCharacterBlock(character, config, replacements, includeAction) {
  return unique(csvParts(stripOrReplaceNames(cleanString2(character.label), replacements, true), shouldIncludeCharacterNames(config) ? displayName(cleanString2(character.name), config) : "", stripOrReplaceNames(cleanString2(character.age), replacements, true), stripOrReplaceNames(cleanString2(character.appearance), replacements, true), stripOrReplaceNames(cleanString2(character.body), replacements, true), stripOrReplaceNames(cleanString2(character.attire), replacements, true), stripOrReplaceNames(cleanString2(character.expression), replacements, true), includeAction ? stripOrReplaceNames(cleanString2(character.action), replacements, true) : "")).join(", ");
}
function assembleAnimaPrompt(scene, shot, config, replacements) {
  const maxCharacters = config.mode === "asset" ? 1 : config.maxCharacters;
  const characters = cleanArray(shot.characters).slice(0, maxCharacters);
  const characterBlocks = characters.map((character) => assembleCharacterBlock(character, config, replacements, false)).filter(Boolean);
  const sceneAction = stripOrReplaceNames(unique(csvParts(shot.action, ...characters.map((character) => character.action), config.mode === "asset" ? "looking at viewer" : "")).join(", "), replacements, true);
  const supplement = config.supplement ? stripOrReplaceNames(removeSupplementActionDuplicates(cleanString2(shot.supplement), sceneAction), replacements, false) : "";
  const tagSections = dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(shot.situation)).join(", "), replacements, true),
    ...characterBlocks,
    sceneAction,
    stripOrReplaceNames(unique(csvParts(shot.camera, config.mode === "asset" ? "portrait, cowboy shot" : "")).join(", "), replacements, true),
    stripOrReplaceNames(unique(csvParts(scene.place, config.mode === "asset" ? "white background, simple background" : "")).join(", "), replacements, true)
  ]);
  return { tagSections, supplement, supplementAfterTagSections: tagSections.length };
}
function assembleDefaultPrompt(scene, shot, config, replacements) {
  const maxCharacters = config.mode === "asset" ? 1 : config.maxCharacters;
  const characters = cleanArray(shot.characters).slice(0, maxCharacters);
  const characterBlocks = characters.map((character) => assembleCharacterBlock(character, config, replacements, true)).filter(Boolean);
  const supplement = config.supplement ? stripOrReplaceNames(cleanString2(shot.supplement), replacements, false) : "";
  const tagSections = dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(shot.camera, shot.situation, shot.action, config.mode === "asset" ? "portrait, cowboy shot, looking at viewer" : "")).join(", "), replacements, true),
    stripOrReplaceNames(unique(csvParts(scene.place, config.mode === "asset" ? "white background, simple background" : "")).join(", "), replacements, true),
    ...characterBlocks
  ]);
  return { tagSections, supplement, supplementAfterTagSections: tagSections.length };
}
function assemblePrompt(scene, shot, config, parserParagraph, originalParagraph) {
  const characters = cleanArray(shot.characters);
  const replacements = buildNameReplacementMap(characters);
  const core = config.promptStyle === "anima" ? assembleAnimaPrompt(scene, shot, config, replacements) : assembleDefaultPrompt(scene, shot, config, replacements);
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

// src/backend/cleanup.ts
var DANBOORU_CLEANUP_BATCH_SIZE = 16;
function descriptorCandidates(words, suffix, original) {
  const candidates = [];
  for (let index = 0;index < words.length; index += 1) {
    const candidate = `${words.slice(index).join(" ")} ${suffix}`.trim();
    if (candidate.toLowerCase() !== original.toLowerCase())
      candidates.push(candidate);
  }
  return unique(candidates);
}
function localCandidateGroups(tag) {
  const lower = tag.toLowerCase();
  const groups = [];
  if (lower === "exterior")
    groups.push(["outdoors"]);
  if (lower === "smug smirk")
    groups.push(["smirk"], ["smug"]);
  if (lower.includes("pleated mini skirt"))
    groups.push(["pleated skirt"], ["miniskirt"]);
  if (lower === "revealing dark purple dress")
    groups.push(["purple dress"], ["revealing clothes"]);
  const hair = lower.match(/\b(.+?)\s+hair\b/);
  if (hair) {
    const words = hair[1].trim().split(/\s+/);
    const length = words.find((word) => word === "long" || word === "short" || word === "medium");
    const descriptors = words.filter((word) => word !== length);
    const descriptorGroup = descriptorCandidates(descriptors, "hair", lower);
    if (descriptorGroup.length)
      groups.push(descriptorGroup);
    if (length && `${length} hair` !== lower)
      groups.push([`${length} hair`]);
  }
  const eyes = lower.match(/\b(.+?)\s+(?:irises|eyes)\b/);
  if (eyes && !lower.includes("pupils")) {
    const descriptorGroup = descriptorCandidates(eyes[1].trim().split(/\s+/), "eyes", lower);
    if (descriptorGroup.length)
      groups.push(descriptorGroup);
  }
  return groups.map((group) => unique(group));
}
function localCandidates(tag) {
  return localCandidateGroups(tag).flat();
}
function bestSuggestion(suggestions) {
  let best;
  for (const suggestion of suggestions) {
    if (!suggestion.tag || typeof suggestion.score !== "number")
      continue;
    if (!best || suggestion.score > (best.score || 0))
      best = suggestion;
  }
  return best;
}
async function cleanupPrompt(prompt, config) {
  const endpoint = config.danbooruEndpoint.trim();
  if (!config.danbooruCleanup || !endpoint) {
    logStage(config, "danbooru_cleanup_skipped", { enabled: config.danbooruCleanup, endpointConfigured: Boolean(endpoint) });
    return renderPrompt(prompt, config.promptSyntax);
  }
  const sectionTags = prompt.tagSections.map((section) => csvParts(section));
  const tags = sectionTags.flat();
  const requestTags = unique(tags.flatMap((tag) => [tag, ...localCandidates(tag)]));
  const batches = [];
  for (let start = 0;start < requestTags.length; start += DANBOORU_CLEANUP_BATCH_SIZE) {
    batches.push(requestTags.slice(start, start + DANBOORU_CLEANUP_BATCH_SIZE));
  }
  const cleanupStartedAt = Date.now();
  logStage(config, "danbooru_cleanup_start", {
    endpoint,
    tagCount: tags.length,
    requestTagCount: requestTags.length,
    batchCount: batches.length
  });
  try {
    const valid = [];
    const suggestions = {};
    for (const [index, batch] of batches.entries()) {
      const batchNumber = index + 1;
      const batchStartedAt = Date.now();
      logStage(config, "danbooru_cleanup_batch_start", { batchNumber, batchCount: batches.length, tagCount: batch.length });
      try {
        const response = parseCorsJson(await spindle.cors(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ tags: batch })
        }), `Danbooru cleanup batch ${batchNumber}/${batches.length}`);
        valid.push(...response.valid || response.data?.valid || []);
        const batchSuggestions = response.suggestions || response.data?.suggestions || {};
        for (const [tag, entries] of Object.entries(batchSuggestions)) {
          const key = tag.toLowerCase();
          suggestions[key] = [...suggestions[key] || [], ...entries];
        }
        logStage(config, "danbooru_cleanup_batch_done", {
          batchNumber,
          batchCount: batches.length,
          tagCount: batch.length,
          elapsedMs: Date.now() - batchStartedAt
        });
      } catch (error) {
        logStage(config, "danbooru_cleanup_batch_failed", {
          batchNumber,
          batchCount: batches.length,
          tagCount: batch.length,
          elapsedMs: Date.now() - batchStartedAt,
          error: error instanceof Error ? error.message : String(error)
        }, "warn");
        throw error;
      }
    }
    const validKeys = new Set(valid.map((tag) => tag.toLowerCase()));
    const replacementsFor = (tag) => {
      const key = tag.toLowerCase();
      if (validKeys.has(key))
        return [tag];
      const decomposed = localCandidateGroups(tag).map((group) => group.find((candidate) => validKeys.has(candidate.toLowerCase()))).filter((candidate) => Boolean(candidate));
      if (decomposed.length > 0)
        return unique(decomposed);
      const best = bestSuggestion(suggestions[key] || []);
      if (best?.tag && (best.score || 0) >= 0.88)
        return [best.tag];
      return [tag];
    };
    const seen = new Set;
    const cleanedSections = sectionTags.map((section) => unique(section.flatMap(replacementsFor)).filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key))
        return false;
      seen.add(key);
      return true;
    }).join(", "));
    const cleaned = renderPrompt({ ...prompt, tagSections: cleanedSections }, config.promptSyntax);
    logStage(config, "danbooru_cleanup_done", {
      beforeTagCount: tags.length,
      afterTagCount: cleanedSections.flatMap((section) => csvParts(section)).length,
      batchCount: batches.length,
      elapsedMs: Date.now() - cleanupStartedAt
    });
    return cleaned;
  } catch (error) {
    spindle.log.warn(`Danbooru cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
    return renderPrompt(prompt, config.promptSyntax);
  }
}

// src/backend/constants.ts
var EXTENSION_ID = "inlay_illustrator";
var MARKER = "<!-- inlay_illustrator -->";

// src/backend/inlay-content.ts
var MARKER_PATTERN = String.raw`<!--\s*inlay_illustrator\s*-->`;
var CURRENT_DIV_PATTERN = String.raw`<div\b(?=[^>]*[\t\n\f\r ]data-inlay-illustrator\s*=\s*(?:"true"|'true'|true(?=[\s>])))[^>]*>[\s\S]*?<\/div\s*>`;
var MARKDOWN_IMAGE_PATTERN = String.raw`!\[[^\]\r\n]*\]\([^\r\n]*\)`;
var HTML_IMAGE_PATTERN = String.raw`<img\b[^>]*>`;
var LEGACY_DETAILS_PATTERN = String.raw`<details\b[^>]*>\s*<summary\b[^>]*>\s*Prompt\b[\s\S]*?<\/details\s*>`;
function ownedBlock(pattern) {
  return new RegExp(`${pattern}(?:(?:[ \\t]*\\r?\\n){2})?`, "gi");
}
var LEGACY_BLOCK = ownedBlock(`${MARKER_PATTERN}\\s*(?:(?:${MARKDOWN_IMAGE_PATTERN}|${HTML_IMAGE_PATTERN})\\s*)?${LEGACY_DETAILS_PATTERN}`);
var CURRENT_BLOCK = ownedBlock(`(?:${MARKER_PATTERN}\\s*)?${CURRENT_DIV_PATTERN}`);
var MARKER_IMAGE_BLOCK = ownedBlock(`${MARKER_PATTERN}\\s*(?:${MARKDOWN_IMAGE_PATTERN}|${HTML_IMAGE_PATTERN})`);
var PROMPT_PRE_BLOCK = ownedBlock(String.raw`<pre\b(?=[^>]*[\t\n\f\r ]class\s*=\s*(?:"(?:[^"]*[\t\n\f\r ])?inlay-illustrator-prompt(?:[\t\n\f\r ][^"]*)?"|'(?:[^']*[\t\n\f\r ])?inlay-illustrator-prompt(?:[\t\n\f\r ][^']*)?'|inlay-illustrator-prompt(?=[\s>])))[^>]*>[\s\S]*?<\/pre\s*>`);
var ORPHAN_MARKER = ownedBlock(MARKER_PATTERN);
var PROMPT_ATTRIBUTE = /\s+data-inlay-illustrator-prompt(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi;
function stripInlayContent(content) {
  return content.replace(LEGACY_BLOCK, "").replace(CURRENT_BLOCK, "").replace(MARKER_IMAGE_BLOCK, "").replace(PROMPT_PRE_BLOCK, "").replace(ORPHAN_MARKER, "").replace(PROMPT_ATTRIBUTE, "");
}
function stripInlayFromMessages(messages) {
  return messages.map((message) => {
    if (message.role !== "assistant")
      return message;
    if (typeof message.content === "string") {
      const content2 = stripInlayContent(message.content);
      return content2 === message.content ? message : { ...message, content: content2 };
    }
    let changed = false;
    const content = message.content.map((part) => {
      if (part.type !== "text")
        return part;
      const text = stripInlayContent(part.text);
      if (text === part.text)
        return part;
      changed = true;
      return { ...part, text };
    });
    return changed ? { ...message, content } : message;
  });
}

// src/backend/context.ts
var MAX_ACTIVATED_LOREBOOK_ENTRIES = 24;
var COMPACT_LOREBOOK_LENGTH = 4000;
var FULL_LOREBOOK_LENGTH = 8000;
var TARGET_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "because",
  "before",
  "being",
  "between",
  "could",
  "does",
  "from",
  "have",
  "into",
  "just",
  "more",
  "other",
  "over",
  "said",
  "same",
  "should",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "through",
  "under",
  "very",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your"
]);
var CHARACTER_VISUAL_PATTERN = /\b(?:appearance|attire|body|build|clothes?|clothing|coat|dress|eyes?|face|facial|freckles|hair|horns?|jacket|pants|robe|scar|shirt|shoes?|skin|skirt|species|suit|tail|tattoo|uniform|wears?|wearing|wings?)\b/i;
var SCENE_VISUAL_PATTERN = /\b(?:architecture|background|castle|city|clouds?|forest|interior|exterior|lamp|light|lighting|moonlight|night|palace|rain|room|snow|street|sunlight|temple|weather|weapon|window)\b/i;
var EMPTY_LOREBOOK_CONTEXT = {
  compact: "",
  full: "",
  compacted: false,
  hasCharacterVisualReference: false,
  diagnostics: { lorebookEntries: 0 }
};
function isOwnMessage(message) {
  return Boolean(message.metadata?.extension === EXTENSION_ID);
}
function namedField(label, value) {
  const text = cleanString2(value);
  return text ? `${label}: ${text}` : "";
}
function formatInfoBlock(title, lines, maxLength = 4000) {
  const clean = lines.map((line) => line.trim()).filter(Boolean);
  return clean.length ? compactBlock([`## ${title}`, ...clean].join(`
`), maxLength) : "";
}
function findNestedString(root, path) {
  let current = root;
  for (const part of path)
    current = asRecord(current)[part];
  return cleanString2(current);
}
function collectExtraInstructionStrings(root) {
  const values = [
    findNestedString(root, ["lb-xnai", "lb", "extra"]),
    findNestedString(root, ["lb_xnai", "lb", "extra"]),
    findNestedString(root, ["Inlay", "extra"]),
    findNestedString(root, ["inlay", "extra"])
  ];
  return unique(values.filter(Boolean)).map((value) => compactBlock(value, 2000));
}
function normalizedTerms(value) {
  return unique((value.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []).map((term) => term.replace(/[_-]+/g, " ")).filter((term) => !TARGET_STOP_WORDS.has(term)));
}
function normalizeSearchText(value) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function includesTerm(value, term) {
  const clean = normalizeSearchText(term);
  const source = normalizeSearchText(value);
  return clean.length >= 2 && ` ${source} `.includes(` ${clean} `);
}
function splitLorebookSegments(content) {
  const paragraphs = content.replace(/\r\n/g, `
`).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const segments = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= 500) {
      segments.push(paragraph);
      continue;
    }
    const sentences = paragraph.split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
    if (sentences.length <= 1) {
      for (let offset = 0;offset < paragraph.length; offset += 500)
        segments.push(paragraph.slice(offset, offset + 500).trim());
    } else {
      segments.push(...sentences);
    }
  }
  return segments;
}
function targetOverlap(value, targetTerms) {
  return targetTerms.reduce((count, term) => count + (includesTerm(value, term) ? 1 : 0), 0);
}
function entryRelevance(entry, target, targetTerms) {
  const directKeyMatches = entry.keys.filter((key) => includesTerm(target, key)).length;
  const titleMatch = entry.title && includesTerm(target, entry.title) ? 1 : 0;
  const sourceWeight = entry.source === "keyword" ? 15 : Math.max(0, 15 - Math.max(0, Number(entry.score || 0)) * 10);
  const scopeWeight = { character: 12, chat: 8, persona: 4, global: 0 };
  const priorityWeight = Math.max(-20, Math.min(20, entry.priority / 5));
  return directKeyMatches * 100 + titleMatch * 50 + sourceWeight + (entry.bookSource ? scopeWeight[entry.bookSource] : 0) + priorityWeight + Math.min(10, targetOverlap(entry.content, targetTerms));
}
function compactEntryContent(entry, targetTerms, maxLength) {
  const segments = splitLorebookSegments(entry.content);
  if (segments.length === 0)
    return "";
  const ranked = segments.map((segment, index) => {
    const keyMatches = entry.keys.reduce((count, key) => count + (includesTerm(segment, key) ? 1 : 0), 0);
    const overlap = targetOverlap(segment, targetTerms);
    const visual = CHARACTER_VISUAL_PATTERN.test(segment) ? 8 : SCENE_VISUAL_PATTERN.test(segment) ? 4 : 0;
    return { segment, index, score: keyMatches * 8 + Math.min(8, overlap) + visual + (index === 0 ? 1 : 0) };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = [];
  let length = 0;
  for (const candidate of ranked) {
    const separator = selected.length ? 2 : 0;
    if (selected.length && length + separator + candidate.segment.length > maxLength)
      continue;
    const segment = selected.length === 0 && candidate.segment.length > maxLength ? truncateLorebookText(candidate.segment, maxLength) : candidate.segment;
    selected.push({ segment, index: candidate.index });
    length += separator + segment.length;
    if (length >= maxLength)
      break;
  }
  return selected.sort((left, right) => left.index - right.index).map(({ segment }) => segment).join(`

`);
}
function lorebookHeader(entry) {
  const title = entry.title || entry.keys.join(", ") || `Entry ${entry.id}`;
  const keys = entry.keys.length ? `Keys: ${entry.keys.join(", ")}` : "";
  return [`### ${title}`, keys].filter(Boolean).join(`
`);
}
function truncateLorebookText(value, maxLength) {
  if (value.length <= maxLength)
    return value;
  const marker = `
...[truncated]`;
  if (maxLength <= marker.length)
    return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - marker.length).trimEnd()}${marker}`;
}
function appendLorebookRows(rows, maxLength) {
  if (rows.length === 0)
    return { block: "", count: 0 };
  const prefix = "## Lorebook";
  const selected = [];
  let length = prefix.length;
  for (const row of rows) {
    const remaining = maxLength - length - 2;
    if (remaining <= 80)
      break;
    const next = truncateLorebookText(row, remaining);
    selected.push(next);
    length += next.length + 2;
    if (next.length < row.length)
      break;
  }
  return { block: [prefix, ...selected].join(`

`), count: selected.length };
}
function renderLorebookBlocks(entries, target) {
  const targetTerms = normalizedTerms(target);
  const ranked = [...entries].sort((left, right) => entryRelevance(right, target, targetTerms) - entryRelevance(left, target, targetTerms) || left.index - right.index);
  const fairEntryLimit = Math.max(360, Math.min(1200, Math.floor(3600 / Math.max(1, Math.min(ranked.length, 8)))));
  const compactRows = ranked.map((entry) => {
    const content = compactEntryContent(entry, targetTerms, fairEntryLimit);
    return { row: [lorebookHeader(entry), content].filter(Boolean).join(`
`), content };
  });
  const fullRows = ranked.map((entry) => [lorebookHeader(entry), entry.content].filter(Boolean).join(`
`));
  const compactRendered = appendLorebookRows(compactRows.map(({ row }) => row), COMPACT_LOREBOOK_LENGTH);
  const fullRendered = appendLorebookRows(fullRows, FULL_LOREBOOK_LENGTH);
  return {
    compact: compactRendered.block,
    full: fullRendered.block,
    hasCharacterVisualReference: compactRows.slice(0, compactRendered.count).some(({ content }) => CHARACTER_VISUAL_PATTERN.test(content)),
    compactEntries: compactRendered.count,
    fullEntries: fullRendered.count
  };
}
function activatedEntryRelevance(entry, target, index) {
  const directKeyMatches = (entry.keys || []).filter((key) => includesTerm(target, key)).length;
  const titleMatch = entry.comment && includesTerm(target, entry.comment) ? 1 : 0;
  const sourceWeight = entry.source === "keyword" ? 15 : Math.max(0, 15 - Math.max(0, Number(entry.score || 0)) * 10);
  const scopeWeight = { character: 12, chat: 8, persona: 4, global: 0 };
  return directKeyMatches * 100 + titleMatch * 50 + sourceWeight + (entry.bookSource ? scopeWeight[entry.bookSource] : 0) - index / 1000;
}
async function resolveLorebookContent(content, chatId, userId) {
  if (!content || typeof spindle.macros?.resolve !== "function")
    return { content, resolved: false, diagnostics: 0 };
  try {
    const result = await spindle.macros.resolve(content, { chatId, userId, commit: false });
    return { content: cleanString2(result.text) || content, resolved: true, diagnostics: Array.isArray(result.diagnostics) ? result.diagnostics.length : 0 };
  } catch {
    return { content, resolved: false, diagnostics: 0 };
  }
}
async function buildLorebookContextSnapshot(chatId, target, config, userId) {
  if (!config.includeLorebook)
    return EMPTY_LOREBOOK_CONTEXT;
  try {
    const allActivated = await spindle.world_books.getActivated(chatId, userId);
    const activated = allActivated.map((entry, index) => ({ entry, index })).sort((left, right) => activatedEntryRelevance(right.entry, target, right.index) - activatedEntryRelevance(left.entry, target, left.index)).slice(0, MAX_ACTIVATED_LOREBOOK_ENTRIES).map(({ entry }) => entry);
    let resolvedCount = 0;
    let macroDiagnostics = 0;
    let fetchFailures = 0;
    const fetched = await Promise.all(activated.map(async (activatedEntry, index) => {
      let full = null;
      try {
        full = await spindle.world_books.entries.get(activatedEntry.id, userId);
      } catch {
        full = null;
      }
      if (!full)
        fetchFailures += 1;
      const rawContent = cleanString2(full?.content);
      const resolved = await resolveLorebookContent(rawContent, chatId, userId);
      if (resolved.resolved)
        resolvedCount += 1;
      macroDiagnostics += resolved.diagnostics;
      const title = cleanString2(activatedEntry.comment) || cleanString2(full?.comment);
      const keys = unique([...activatedEntry.keys || [], ...full?.key || []].map((key) => cleanString2(key)).filter(Boolean));
      const content = resolved.content || [title, keys.length ? `Keys: ${keys.join(", ")}` : ""].filter(Boolean).join(`
`);
      if (!content)
        return null;
      return {
        index,
        id: activatedEntry.id,
        title,
        keys,
        content,
        priority: Number(full?.priority || 0),
        source: activatedEntry.source,
        score: activatedEntry.score,
        bookSource: activatedEntry.bookSource
      };
    }));
    const entries = fetched.filter((entry) => Boolean(entry));
    const rendered = renderLorebookBlocks(entries, target);
    return {
      compact: rendered.compact,
      full: rendered.full,
      compacted: rendered.compact.length < rendered.full.length || rendered.compactEntries < entries.length,
      hasCharacterVisualReference: rendered.hasCharacterVisualReference,
      diagnostics: {
        lorebookEntries: entries.length,
        lorebookActivated: allActivated.length,
        lorebookSelected: activated.length,
        lorebookCompactEntries: rendered.compactEntries,
        lorebookFullEntries: rendered.fullEntries,
        lorebookCompactLength: rendered.compact.length,
        lorebookFullLength: rendered.full.length,
        lorebookMacroResolved: resolvedCount,
        lorebookMacroDiagnostics: macroDiagnostics,
        lorebookFetchFailures: fetchFailures
      }
    };
  } catch (error) {
    return {
      ...EMPTY_LOREBOOK_CONTEXT,
      diagnostics: { lorebookEntries: 0, lorebookError: error instanceof Error ? error.message : String(error) }
    };
  }
}
function formatRecentContext(messages, targetIndex, includeCount) {
  if (includeCount <= 0)
    return "";
  const previous = messages.slice(0, Math.max(0, targetIndex)).filter((message) => message.role === "assistant" && !isOwnMessage(message)).map((message) => ({ ...message, content: stripInlayContent(message.content) })).filter((message) => message.content.trim()).slice(-includeCount);
  return compactBlock(previous.map((message) => `${message.role}: ${message.content}`).join(`

`), 8000);
}
function includeCountForAttempt(config, attempt) {
  if (config.includeMaxMessages <= config.includeMinMessages)
    return config.includeMinMessages;
  if (config.parserRetries <= 0)
    return config.includeMinMessages;
  const step = Math.ceil((config.includeMaxMessages - config.includeMinMessages) / config.parserRetries);
  return Math.min(config.includeMaxMessages, config.includeMinMessages + step * attempt);
}
async function buildParserContext(chatId, messages, targetIndex, cache, config, attempt, userId, lorebookSnapshot) {
  const blocks = [];
  const preprocessingBlocks = [];
  const overrides = [];
  const diagnostics = { attempt, includeCount: includeCountForAttempt(config, attempt) };
  let chat = null;
  const pushBlock = (block, includeInPreprocessing = true) => {
    if (!block)
      return;
    blocks.push(block);
    if (includeInPreprocessing)
      preprocessingBlocks.push(block);
  };
  if (config.includeCharacterInfo || config.includeLorebook || config.userInstructionsEnabled) {
    try {
      chat = await spindle.chats.get(chatId, userId);
      overrides.push(...collectExtraInstructionStrings(chat?.metadata));
    } catch (error) {
      diagnostics.chatLookupError = error instanceof Error ? error.message : String(error);
    }
  }
  if (config.includeUserInfo || config.userInstructionsEnabled) {
    try {
      const persona = await spindle.personas.getActive(userId);
      const record = asRecord(persona);
      const block = config.includeUserInfo ? formatInfoBlock("{{user}} Info", [
        namedField("Name", record.name),
        namedField("Title", record.title),
        namedField("Description", record.description)
      ]) : "";
      pushBlock(block);
      overrides.push(...collectExtraInstructionStrings(record.metadata));
      diagnostics.userInfo = Boolean(block);
    } catch (error) {
      diagnostics.userInfoError = error instanceof Error ? error.message : String(error);
    }
  }
  if (config.includeCharacterInfo && chat?.character_id) {
    try {
      const character = await spindle.characters.get(String(chat.character_id), userId);
      const record = asRecord(character);
      const block = formatInfoBlock("{{char}} Info", [
        namedField("Name", record.name),
        namedField("Description", record.description),
        namedField("Personality", record.personality),
        namedField("Scenario", record.scenario),
        namedField("Creator notes", record.creator_notes),
        namedField("System prompt", record.system_prompt),
        namedField("Post-history instructions", record.post_history_instructions),
        Array.isArray(record.tags) && record.tags.length ? `Tags: ${record.tags.join(", ")}` : ""
      ], 6000);
      pushBlock(block);
      overrides.push(...collectExtraInstructionStrings(record.extensions));
      diagnostics.characterInfo = Boolean(block);
    } catch (error) {
      diagnostics.characterInfoError = error instanceof Error ? error.message : String(error);
    }
  }
  if (config.includeLorebook) {
    const target = messages[targetIndex]?.content || "";
    const snapshot = lorebookSnapshot || await buildLorebookContextSnapshot(chatId, target, config, userId);
    const block = attempt === 0 ? snapshot.compact : snapshot.full;
    pushBlock(block, false);
    Object.assign(diagnostics, snapshot.diagnostics, { lorebookMode: attempt === 0 ? "compact" : "full" });
  }
  if (config.characterTagContextEnabled) {
    const characterReference = buildCharacterTagReference(cache);
    if (characterReference) {
      pushBlock(`${characterReference}
Use these as a baseline for returning characters (including their base attire). The current message always wins over this reference.`);
    }
    diagnostics.cacheCharacters = Object.keys(cache).length;
  }
  if (config.userInstructionsEnabled)
    overrides.unshift(config.customParserInstructions);
  return {
    systemContext: blocks.filter(Boolean).join(`

`),
    preprocessingSystemContext: preprocessingBlocks.filter(Boolean).join(`

`),
    recentContext: formatRecentContext(messages, targetIndex, includeCountForAttempt(config, attempt)),
    override: unique(overrides.map((value) => cleanString2(value)).filter(Boolean)).join(`

`),
    diagnostics
  };
}

// src/backend/images.ts
async function resolveImageConnection(config, userId) {
  logStage(config, "image_connection_resolve_start", { configuredConnectionId: config.imageConnectionId });
  if (config.imageConnectionId) {
    const configured = await spindle.imageGen.getConnection(config.imageConnectionId, userId);
    if (configured) {
      logStage(config, "image_connection_resolved", {
        id: configured.id,
        name: configured.name,
        provider: configured.provider,
        model: configured.model,
        source: "configured"
      });
      return configured;
    }
    logStage(config, "image_connection_missing", { configuredConnectionId: config.imageConnectionId }, "warn");
  }
  const connections = await spindle.imageGen.listConnections(userId);
  const fallback = connections.find((connection) => connection.is_default) || connections[0] || null;
  logStage(config, "image_connection_resolved", fallback ? {
    id: fallback.id,
    name: fallback.name,
    provider: fallback.provider,
    model: fallback.model,
    source: fallback.is_default ? "default" : "first_available"
  } : { source: "none", availableConnections: 0 }, fallback ? "info" : "warn");
  return fallback;
}
function readComfyConfig(metadata) {
  if (!metadata || typeof metadata !== "object")
    return null;
  const comfy = metadata.comfyui;
  if (!comfy || typeof comfy !== "object")
    return null;
  const config = comfy;
  const workflow = config.workflow_api_json || config.workflow_json;
  if (!workflow || typeof workflow !== "object" || !Array.isArray(config.field_mappings))
    return null;
  return config;
}
function numberParam(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function stringParam(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function patchComfyWorkflow(workflow, mappings, values) {
  const patched = JSON.parse(JSON.stringify(workflow));
  for (const mapping of mappings) {
    const node = patched[mapping.nodeId];
    if (!node || !node.inputs || typeof node.inputs !== "object")
      continue;
    const value = mapping.mappedAs === "custom" ? values.custom && typeof values.custom === "object" ? values.custom[`${mapping.nodeId}:${mapping.fieldName}`] : undefined : values[mapping.mappedAs];
    if (value !== undefined)
      node.inputs[mapping.fieldName] = value;
  }
  return patched;
}
async function buildImageParameters(config, connection, prompt, negative) {
  const parameters = { ...connection?.default_parameters || {}, ...config.imageParameters };
  logStage(config, "image_parameters_start", {
    provider: connection?.provider || "(default)",
    connectionId: connection?.id || null,
    promptLength: prompt.length,
    negativeLength: negative.length,
    parameterKeys: keysOf(parameters)
  });
  if (connection?.provider !== "comfyui" && connection?.provider !== "swarmui") {
    logStage(config, "image_parameters_ready", { provider: connection?.provider || "(default)", workflowPresent: Boolean(parameters.workflow) });
    return parameters;
  }
  if (parameters.workflow && typeof parameters.workflow === "object") {
    logStage(config, "comfy_workflow_existing", { parameterKeys: keysOf(parameters) });
    return parameters;
  }
  const comfy = readComfyConfig(connection.metadata);
  if (!comfy) {
    logStage(config, "comfy_workflow_missing", { metadataKeys: keysOf(connection.metadata) }, "warn");
    return parameters;
  }
  const workflow = comfy.workflow_api_json || comfy.workflow_json;
  const mappings = comfy.field_mappings || [];
  logStage(config, "comfy_workflow_config_found", {
    workflowSource: comfy.workflow_api_json ? "api" : "json",
    mappingCount: mappings.length,
    mappedAs: mappings.map((mapping) => mapping.mappedAs)
  });
  if (!mappings.some((mapping) => mapping.mappedAs === "positive_prompt")) {
    throw new Error("Imported ComfyUI workflow must map at least one positive prompt field");
  }
  const customValues = parameters.comfyui_custom_fields && typeof parameters.comfyui_custom_fields === "object" ? parameters.comfyui_custom_fields : parameters.custom && typeof parameters.custom === "object" ? parameters.custom : {};
  const values = {
    positive_prompt: prompt,
    negative_prompt: negative || parameters.negativePrompt,
    seed: numberParam(parameters.seed) ?? Math.floor(Math.random() * 2147483647),
    steps: numberParam(parameters.steps),
    cfg: numberParam(parameters.cfg),
    sampler_name: stringParam(parameters.sampler_name),
    scheduler: stringParam(parameters.scheduler),
    width: numberParam(parameters.width),
    height: numberParam(parameters.height),
    checkpoint: stringParam(parameters.checkpoint || parameters.ckpt_name),
    custom: customValues
  };
  const patched = patchComfyWorkflow(workflow, mappings, values);
  logStage(config, "comfy_workflow_patched", {
    workflowPresent: true,
    workflowFormat: "api_prompt",
    parameterKeys: keysOf({ ...parameters, workflow: patched, workflowFormat: "api_prompt", preserveImportedWorkflow: true })
  });
  return { ...parameters, workflow: patched, workflowFormat: "api_prompt", preserveImportedWorkflow: true };
}
async function prepareAndDispatchImageJobs(inputs, eager, prepare, generate) {
  const jobs = [];
  const requests = [];
  let serialRequest = Promise.resolve();
  let preparationFailure;
  let hasPreparationFailure = false;
  for (const [index, input] of inputs.entries()) {
    let job;
    try {
      job = await prepare(input, index);
    } catch (error) {
      preparationFailure = error;
      hasPreparationFailure = true;
      break;
    }
    jobs.push(job);
    const invoke = () => {
      try {
        return Promise.resolve(generate(job));
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const request = eager || requests.length === 0 ? invoke() : serialRequest.then(invoke);
    request.catch(() => {
      return;
    });
    requests.push(request);
    if (!eager)
      serialRequest = request;
  }
  const settled = await Promise.allSettled(requests);
  if (hasPreparationFailure)
    throw preparationFailure;
  const failure = settled.find((result) => result.status === "rejected");
  if (failure?.status === "rejected")
    throw failure.reason;
  return {
    jobs,
    results: settled.map((result) => result.value)
  };
}

// src/backend/scenes.ts
function parseParagraphNumber(value) {
  const match = String(value ?? "").match(/\d+/);
  if (!match)
    return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}
function normalizeScenePayload(payload) {
  const normalized = [];
  for (const rawScene of cleanArray(payload.scenes)) {
    const parentPlace = cleanString2(rawScene.place);
    const shots = cleanArray(rawScene.shots);
    if (shots.length > 0) {
      for (const rawShot of shots) {
        const parserParagraph2 = parseParagraphNumber(rawShot.paragraph);
        if (!parserParagraph2)
          continue;
        const shot2 = { ...rawShot, paragraph: parserParagraph2 };
        const scene2 = { ...rawScene, place: parentPlace, shots: [shot2] };
        normalized.push({ scene: scene2, shot: shot2, parserParagraph: parserParagraph2 });
      }
      continue;
    }
    const parserParagraph = parseParagraphNumber(rawScene.paragraph);
    if (!parserParagraph)
      continue;
    const situation = cleanString2(rawScene.situation) || parentPlace;
    const shot = { ...rawScene, paragraph: parserParagraph, situation };
    const scene = { place: parentPlace, shots: [shot] };
    normalized.push({ scene, shot, parserParagraph });
  }
  return normalized;
}
function normalizedVisualValue(value) {
  return cleanString2(value).replace(/\s+/g, " ").toLowerCase();
}
function exactVisualKey(entry) {
  return JSON.stringify({
    paragraph: entry.parserParagraph,
    camera: normalizedVisualValue(entry.shot.camera),
    situation: normalizedVisualValue(entry.shot.situation),
    sceneAction: normalizedVisualValue(entry.scene.action),
    shotAction: normalizedVisualValue(entry.shot.action),
    characters: cleanArray(entry.shot.characters).map((character) => ({
      expression: normalizedVisualValue(character.expression),
      action: normalizedVisualValue(character.action)
    })),
    composition: normalizedVisualValue(entry.shot.supplement)
  });
}
function selectPromptEntries(payload, paragraphs, config) {
  const normalized = normalizeScenePayload(payload);
  const paragraphMap = new Map(paragraphs.map((paragraph) => [paragraph.parserIndex, paragraph]));
  const valid = normalized.filter((entry) => paragraphMap.has(entry.parserParagraph));
  let distinct;
  if (config.mode === "asset") {
    const seenParagraphs = new Set;
    distinct = valid.filter((entry) => {
      if (seenParagraphs.has(entry.parserParagraph))
        return false;
      seenParagraphs.add(entry.parserParagraph);
      return true;
    });
  } else {
    const seenVisuals = new Set;
    distinct = valid.filter((entry) => {
      const key = exactVisualKey(entry);
      if (seenVisuals.has(key))
        return false;
      seenVisuals.add(key);
      return true;
    });
  }
  const limit = config.mode === "asset" ? paragraphs.length : config.maxImages;
  const selected = distinct.slice(0, limit).map((entry, modelPriority) => ({ entry, modelPriority })).sort((left, right) => left.entry.parserParagraph - right.entry.parserParagraph || left.modelPriority - right.modelPriority).map(({ entry }) => entry);
  const prompts = [];
  for (const entry of selected) {
    const paragraph = paragraphMap.get(entry.parserParagraph);
    if (!paragraph)
      continue;
    const prompt = assemblePrompt(entry.scene, entry.shot, config, entry.parserParagraph, paragraph.originalIndex);
    if (renderPrompt(prompt.prompt, config.promptSyntax))
      prompts.push(prompt);
  }
  logStage(config, "illustration_candidates_selected", {
    candidateCount: normalized.length,
    validCandidateCount: valid.length,
    distinctCandidateCount: distinct.length,
    selectedCount: prompts.length,
    selectedParagraphs: selected.map((entry) => entry.parserParagraph),
    cameraTags: selected.map((entry) => cleanString2(entry.shot.camera))
  });
  return prompts;
}

// src/backend/memory.ts
var VOLATILE_MEMORY_TERMS = [
  "sitting",
  "standing",
  "leaning",
  "guided",
  "guiding",
  "holding",
  "pulling",
  "looking",
  "gaze",
  "smug",
  "flustered",
  "blush",
  "smile",
  "angry",
  "crying",
  "grin",
  "embarrassed",
  "annoyed",
  "chair",
  "bed",
  "sofa",
  "couch",
  "desk",
  "table",
  "from above",
  "from below",
  "from behind",
  "close-up",
  "wide shot",
  "portrait",
  "upper body",
  "full body",
  "cowboy shot",
  "pov"
];
var TRANSIENT_ATTIRE_MEMORY_TERMS = [
  "torn clothes",
  "open shirt",
  "shirt lift",
  "panty pull",
  "clothes pull",
  "undressing"
];
function sanitizeMemoryTags(tags) {
  return normalizeReferenceTags(csvParts(tags).filter((tag) => {
    const normalized = tag.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!normalized)
      return false;
    if (TRANSIENT_ATTIRE_MEMORY_TERMS.some((term) => normalized === term || normalized.includes(term)))
      return false;
    return !VOLATILE_MEMORY_TERMS.some((term) => normalized === term || normalized.includes(term));
  }).join(", "));
}
function baselineCharacterTags(character) {
  return sanitizeMemoryTags(unique(csvParts(character.label, character.age, character.appearance, character.body, character.attire)).join(", "));
}
function updateCache(cache, payload) {
  for (const { shot } of normalizeScenePayload(payload)) {
    for (const character of cleanArray(shot.characters)) {
      const name = normalizeCharacterName(character.name);
      const tags = baselineCharacterTags(character);
      if (name && tags)
        cache[name] = tags;
    }
  }
}
function upsertCharacterTag(state, oldName, nextName, nextTags) {
  const previous = normalizeCharacterName(oldName);
  const name = normalizeCharacterName(nextName);
  const tags = sanitizeMemoryTags(normalizeReferenceTags(nextTags));
  if (!name)
    throw new Error("Character name is required.");
  if (!tags)
    throw new Error("Character appearance tags must include at least one durable tag.");
  const entries = Object.keys(state.characterAppearance);
  const sourceKey = previous ? entries.find((candidate) => candidate.toLowerCase() === previous.toLowerCase()) : undefined;
  const destinationCollision = entries.find((candidate) => candidate.toLowerCase() === name.toLowerCase() && candidate !== sourceKey);
  if (destinationCollision)
    throw new Error(`A character named "${name}" already exists.`);
  if (sourceKey && sourceKey !== name)
    delete state.characterAppearance[sourceKey];
  state.characterAppearance[name] = tags;
}
function deleteCharacterTag(state, name) {
  const target = normalizeCharacterName(name);
  if (!target)
    return;
  const key = Object.keys(state.characterAppearance).find((candidate) => candidate.toLowerCase() === target.toLowerCase()) || target;
  delete state.characterAppearance[key];
}

// src/backend/paragraphs.ts
function ignoredTagNames(config) {
  return unique(String(config.ignoredTags || "").split(/[\n,]/).map((tag) => tag.trim().replace(/^<|>$/g, "").replace(/^\/+/, "")).filter(Boolean));
}
function splitParagraphBlocks(content) {
  const blocks = [];
  let current = [];
  for (const line of content.replace(/\r\n/g, `
`).split(`
`)) {
    if (line.trim()) {
      current.push(line);
    } else if (current.length > 0) {
      blocks.push(current.join(`
`));
      current = [];
    }
  }
  if (current.length > 0)
    blocks.push(current.join(`
`));
  return blocks;
}
function stripIgnoredTags(text, config) {
  let output = text;
  for (const tag of ignoredTagNames(config)) {
    const name = escapeRegExp(tag);
    output = output.replace(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, "gi"), "").replace(new RegExp(`<\\/?${name}\\b[^>]*>`, "gi"), "").replace(new RegExp(`^\\s*\\[${name}\\b[^\\]]*\\]\\s*$`, "gim"), "");
  }
  return output;
}
function cleanParagraphText(text, config) {
  const stripped = stripIgnoredTags(text, config).replace(/CARDDATA:.*$/gim, "").replace(/<Update Log\b[\s\S]*?<\/Update Log>/gi, "").replace(/<Choice\b[\s\S]*?<\/Choice>/gi, "");
  return stripped.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed)
      return false;
    return !/^\[(?:Date|FLOOR|RESERVEDFLOOR)\s*:/i.test(trimmed) && !/^<\s*(?:suggestion|scene\s+seed=|check|choice)\b/i.test(trimmed);
  }).join(`
`).trim();
}
function prepareParagraphs(content, config) {
  const paragraphs = [];
  const originalBlocks = splitParagraphBlocks(stripInlayContent(content));
  for (const [index, block] of originalBlocks.entries()) {
    const cleaned = cleanParagraphText(block, config);
    if (cleaned)
      paragraphs.push({ parserIndex: paragraphs.length + 1, originalIndex: index + 1, text: cleaned });
  }
  return paragraphs;
}
function paragraphCount(content) {
  return content.split(/(\r?\n\s*\r?\n)/).filter((part) => part.trim()).length;
}

// src/backend/instructions.ts
function parserInstruction(config) {
  const maxCharacters = config.mode === "asset" ? 1 : config.maxCharacters;
  const shotInstruction = config.mode === "asset" ? [
    "Asset mode: generate exactly one shot for each [P#] paragraph.",
    "Each shot must contain exactly one visible character.",
    "Force place to include white background, simple background.",
    "Favor clean reusable character portrait tags over narrative scene illustration tags."
  ].join(`
`) : [
    `Generate ${config.minImages}-${config.maxImages} shots total when possible.`,
    "Choose the most visually consequential changes, actions, interactions, or emotional beats across the entire current source; do not favor earlier paragraphs merely because they appear first.",
    "Each additional shot must differ from the other shots in at least two of these dimensions: (1) perspective or framing, (2) focal subject or visible action, and (3) composition, depth, or foreground occlusion.",
    "If the source contains too few distinct visual beats, create alternate shots of the same paragraph with genuinely different cinematography. Do not invent narrative events.",
    "Distinct shots may reference the same paragraph. Order shots by their visual importance, not paragraph number."
  ].join(`
`);
  const source = config.originalReference ? [
    "Original Creation Tag:",
    config.originalCreationName || "(empty)",
    "Use full character names ONLY for the JSON name field.",
    "Output the character's name only: no parentheses, no creation tag, no source/work title, and no aliases.",
    "The extension adds the creation tag programmatically afterward.",
    "Do not include any parenthetical, source name, creation reference, title, or alias in name or any other field."
  ].join(`
`) : "Use names only for the JSON name field as private memory keys. Names will not be included in final prompts. If not given, make a concise stable identifier that fits the description.";
  const supplement = config.supplement ? [
    "### Natural Language Supplement",
    "In supplement, describe the image in natural language for visible details that tags cannot express well, such as detailed composition, framing, character positions, interactions, unusual vantage points, or objective atmosphere/lighting.",
    "Use concise, minimal, telegraphic sentences. Be objective, not subjective interpretation.",
    "Unusual framing and vantage points are welcome, such as viewed through an object, reflected in a mirror, or partially obscured by foreground elements.",
    "When describing multiple people, do not use names. Identify people by visual position such as left girl, right boy, foreground character, or background character.",
    "Do not use supplement for smell, sound, internal sensations, invisible emotions, or prose narration."
  ].join(`
`) : "Do not include supplement text.";
  return [
    "# Image Tagging System",
    "Tag the current message's paragraphs as Danbooru-style English image prompts. Output a single JSON object.",
    "## JSON Format",
    [
      "{",
      '  "scenes": [',
      "    {",
      '      "place": "string",',
      '      "shots": [',
      "        {",
      '          "paragraph": 0,',
      '          "camera": "string",',
      '          "situation": "string",',
      '          "action": "string",',
      '          "characters": [',
      "            {",
      '              "name": "string",',
      '              "label": "string",',
      '              "age": "string",',
      '              "identity": "string",',
      '              "appearance": "string",',
      '              "body": "string",',
      '              "attire": "string",',
      '              "expression": "string",',
      '              "action": "string"',
      "            }",
      "          ],",
      '          "supplement": "string",',
      '          "negative": "string"',
      "        }",
      "      ]",
      "    }",
      "  ]",
      "}"
    ].join(`
`),
    "- negative is optional. All other fields are required, though values may be empty strings when a field does not apply.",
    "- These are the ONLY allowed fields. Adding any unlisted field is a schema violation.",
    "## Scenes & Shots",
    "Scene = shots sharing one physical location.",
    "- Same location means same scene, multiple shots.",
    "- Location change means a new scene with its own place.",
    "Shot = one distinct visual moment: interaction, emotion, significant action, or clear framing change. Prefer closer framing over wide shots. Shots are independent, so repeat tags if the scene has not changed.",
    shotInstruction,
    "Paragraph mapping: current message uses [P#] numbering.",
    "- Each shot's paragraph must reference an existing [P#].",
    "- Never invent paragraph numbers outside the visible range.",
    "- Tag ONLY the current message. Recent context is for continuity only.",
    "## Tag Rules",
    "Use common, objective, visualizable Danbooru-style English tags. Do not invent tags; use simpler well-known equivalents if unsure. Do not use metaphors for tags.",
    "All fields are comma-separated tags except supplement, which is a short objective visual sentence.",
    `Character limit: max ${maxCharacters} visible character(s) per shot. Characters outside the limit should be represented only by visible partial body parts, such as out of frame, hand, arm, or legs. Do not output their expressions or attire. Only output visible body parts and actions when needed.`,
    config.mode === "asset" ? "Asset mode requires one character in characters[] for every shot, no group shots, no narrative background beyond a simple white background." : "",
    "Repeat tags if the situation or scene has not changed. Shots are independent, so repeated tags across shots are expected for stable appearance, attire, location, and persistent actions.",
    config.mode === "illustration" ? "Continuity does not require repeating camera angle, framing, composition, depth, or occlusion. Vary those deliberately between shots while preserving narrative facts." : "",
    "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields are expression, action, camera, situation, place, supplement, and negative.",
    "## Field Reference",
    "### place - scene-level",
    "Start with interior or exterior when location is known, then add location, mood, lighting, time, weather, and prominent props. Prominent props should be color + object. Define once per scene; all shots in the scene share identical place.",
    "Do not include character names, actions, expressions, clothing, body traits, or camera framing in place.",
    "### camera - shot-level",
    "Perspective tags: from above, from behind, from below, from side, high up, sideways, straight-on, upside-down, pov.",
    "Framing tags: portrait, upper body, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, close-up, body-part focus.",
    "Use camera only for perspective and framing. Do not include actions, expressions, appearance, clothing, subject counts, or place.",
    "### situation - shot-level",
    "Strictly use character count/composition tags such as 1girl, 2girls, 1boy, 1girl, 1boy, other, solo, group, and nsfw only when explicitly visual.",
    "The total number of people should match the visible characters being described/tagged.",
    "Do not include names, numeric ages, appearance, attire, expression, action, camera, or place.",
    "### label",
    "Use girl, boy, or other regardless of age. For out-of-frame partial characters, use label plus out of frame and visible part, such as boy, out of frame, hand.",
    "### name - required",
    "Character name from the narrative. If unnamed, use a consistent identifier such as girl A, boy B, shopkeeper, guard, or stranger. Never empty; this is used for cross-message appearance tracking.",
    "Do not put character names in label, age, appearance, body, attire, expression, action, situation, camera, place, supplement, or negative.",
    "### age",
    "Visual age category only: child, aged down, mature male, mature female, aged up, or old. Based on appearance only.",
    "If characters appear late teens to early thirties, leave age blank.",
    "Never output numeric ages such as 18, 21, or 25.",
    "### identity",
    "Legacy/private recognition tags that are not part of the rolling baseline memory. Leave empty unless a non-clothing trait does not fit appearance or body.",
    "Use identity only for durable traits that help recognize the character across chats: species/race, notable scars or tattoos, distinctive non-clothing accessories only if permanent, or named archetype traits when visually stable.",
    "Do not include names, attire, expression, pose, action, camera, place, or supplement in identity.",
    "### appearance",
    "Identity traits: hair, eyes, skin, species/race, and distinguishing features.",
    "Hair: length, color, style. Always include when known.",
    "Eyes: color, shape, and visual modifiers such as heterochromia, tareme, tsurime, jitome, empty eyes, or dashed eyes. Always include when known.",
    "Skin: color and visible texture, such as dark skin, tan, red skin, metal skin, see-through body, or patchwork skin.",
    "Other: freckles, facial hair, scars, tattoos with location, symbol in eye, elf, demon, furry, androgynous, and other persistent identity traits.",
    "Do not include names, attire, expression, pose, action, camera, place, or supplement in appearance.",
    "### body",
    "Physique, height, body shape, build, and persistent body traits. Exclude normal/default traits.",
    "Examples: muscular, toned, skinny, plump, fat, curvy, petite, shortstack, pear-shaped figure, giant, tall, short, flat chest, small breasts, medium breasts, large breasts, broad shoulders, wide hips, thick thighs.",
    "appearance + body + attire form the rolling character baseline. Copy the SAME tags for the same character across all shots unless the current message clearly changes their present visual state. Camera framing never justifies omitting known baseline traits.",
    "Do not include clothing, expression, action, camera, place, or supplement in body.",
    "### attire",
    "All visible clothing and accessories, or visible lack of clothing, with color, material, and style for each.",
    "Disassemble uniforms into individual items. Always include color details using color names. Do not use vague color traits like colorful or gradient unless the text clearly describes them.",
    "Examples: white loose button-up shirt, black silk dress, side slit, sleeveless, long sleeves, oversized, gray tight jeans, pleated mini skirt, white ankle socks, bare feet, red baseball cap, small blue gem necklace, open shirt, torn clothes, unzipped, midriff.",
    "Use no shirt, no pants, bare feet, or similar absence tags when visually relevant.",
    "Do not include body traits, expressions, actions, camera, place, or names in attire.",
    "### expression",
    "Visible facial emotions and facial/eye states only: annoyed, angry, embarrassed, blush, grin, smile, crying, empty eyes, closed eyes.",
    "Do not include posture, gaze direction, clothing, body, action, camera, place, or names in expression.",
    "### action",
    "Use shot.action for global or relationship action that applies to the whole shot, such as two characters holding hands or one character guiding another.",
    "Use characters[].action for a single character's posture, gaze, pose, interactions, and visible actions. Use multiple tags if needed.",
    "Posture examples: standing, sitting on chair, on back, kneeling, spread legs, all fours, squatting, on stomach, on side.",
    "Gaze examples: looking at viewer, looking away, looking at another.",
    "Interaction examples: arm hug, leaning, heads together, carrying, piggyback, holding hands.",
    "Do not duplicate camera, place, situation counts, appearance, body, attire, or expression. Do not put the same action in multiple fields.",
    "### negative - optional",
    "Only if the client explicitly specifies negative prompt tags. Never infer negative tags.",
    supplement,
    "## Repetition is Consistency",
    "- If a detail appears in one shot and persists, tag it in all subsequent shots.",
    "- If an action or attire is still in motion or still present, repeat it in later shots.",
    config.mode === "illustration" ? "- Preserve a continuous pov only when the narrative establishes an ongoing viewpoint. Otherwise choose the strongest perspective for each visual beat." : "",
    "- appearance + body + attire must be identical for the same character across all shots unless the current message explicitly changes their present visual state.",
    "## Data Priority",
    "1. Client comments or explicit user instructions in the current message override all instructions.",
    "2. Current message [P#] paragraphs are authoritative for scene content. Never restore outdated clothing, props, location, or actions from context.",
    config.characterTagContextEnabled ? "3. Character tag history is the current visual baseline for returning characters: label, age, appearance, body, and base attire." : "",
    config.characterTagContextEnabled ? "Use previous character tags as a baseline for returning characters, including base attire. Preserve specific baseline tags when not contradicted, such as short cut, white pupils, small breasts, black high school uniform, red sailor ribbon, black skirt, and white pantyhose." : "",
    config.characterTagContextEnabled ? "The current message is authoritative for the character's present visual state. It can update the baseline when it clearly changes clothing, lack of clothing, appearance, or body traits." : "",
    "## Weights",
    "Weights such as {tag}, [tag], N::tag::, and (tag:N) control emphasis. Never add, remove, or modify client-specified weights. Copy them exactly when they are present in the source text.",
    "## Output Format",
    "- Output raw JSON only.",
    "- One JSON object. No XML, HTML, YAML, markdown fences, comments, or prose.",
    "- Double-quoted keys and values. No trailing commas.",
    "- Validate bracket balance: every { has }, every [ has ].",
    "- Positive tags only unless client says otherwise.",
    "- English only.",
    "## Character Names",
    source
  ].join(`

`);
}

// src/backend/parser.ts
function formatTargetParagraphs(paragraphs) {
  return paragraphs.map((paragraph) => `[P${paragraph.parserIndex}]
${paragraph.text}`).join(`

`);
}
function continuityReference(systemContext, recentContext) {
  const references = [
    systemContext.trim(),
    recentContext.trim() ? `## Recent Assistant Context
${recentContext.trim()}` : ""
  ].filter(Boolean);
  if (references.length === 0)
    return "";
  return [
    "# Continuity Reference Only",
    "Use this reference only to fill missing stable appearance, attire, location, and persistent-action details.",
    "The current numbered source is authoritative. Never restore outdated scene facts or copy an earlier camera angle or composition merely for continuity.",
    ...references
  ].join(`

`);
}
function parserUserRequest(targetSource) {
  return [
    "Create the requested image-prompt batch from the current numbered paragraph source below.",
    "Use only its narrative events. Return one raw JSON object with a top-level scenes array and no other text.",
    "## Current Numbered Paragraph Source",
    targetSource
  ].join(`

`);
}
function extractText(result) {
  if (typeof result === "string")
    return result;
  if (result && typeof result === "object") {
    const object = result;
    for (const key of ["content", "text", "message", "output"]) {
      if (typeof object[key] === "string")
        return object[key];
    }
  }
  return "";
}
function extractUsage(result) {
  const usage = asRecord(asRecord(result).usage);
  const output = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
    const value = Number(usage[key]);
    if (Number.isFinite(value))
      output[key] = value;
  }
  return output;
}
var FUZZY_KEYS = [
  "scenes",
  "place",
  "shots",
  "paragraph",
  "camera",
  "situation",
  "characters",
  "label",
  "age",
  "identity",
  "appearance",
  "body",
  "attire",
  "expression",
  "action",
  "negative",
  "name",
  "scene",
  "positive",
  "quote",
  "supplement"
];
function levenshtein(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_value, index) => index);
  for (let i = 1;i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1;j <= b.length; j += 1) {
      next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = next;
  }
  return previous[b.length];
}
function fuzzyKey(key) {
  if (FUZZY_KEYS.includes(key))
    return key;
  let best = key;
  let bestDistance = 3;
  for (const candidate of FUZZY_KEYS) {
    const distance = levenshtein(key.toLowerCase(), candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= 2 ? best : key;
}
function fuzzyRepair(value) {
  if (Array.isArray(value))
    return value.map((item) => fuzzyRepair(item));
  if (!value || typeof value !== "object")
    return value;
  const repaired = {};
  for (const [key, child] of Object.entries(value)) {
    const fixed = fuzzyKey(key);
    repaired[repaired[fixed] === undefined ? fixed : key] = fuzzyRepair(child);
  }
  return repaired;
}
function hasScenes(value) {
  return Boolean(value && typeof value === "object" && Array.isArray(value.scenes));
}
function tryParseObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? fuzzyRepair(parsed) : null;
  } catch {
    return null;
  }
}
function stripJsonFences(text) {
  return text.replace(/```(?:json|JSON)?/g, "").replace(/```/g, "").trim();
}
function balancedObjects(text) {
  const objects = [];
  const starts = [];
  let inString = false;
  let escaped = false;
  for (let index = 0;index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped)
        escaped = false;
      else if (character === "\\")
        escaped = true;
      else if (character === '"')
        inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{")
      starts.push(index);
    else if (character === "}" && starts.length > 0) {
      const start = starts.pop();
      if (start !== undefined)
        objects.push(text.slice(start, index + 1));
    }
  }
  return [...new Set(objects.sort((left, right) => right.length - left.length))];
}
function parseJson(text) {
  const trimmed = text.trim().replace(/\\\(/g, "(").replace(/\\\)/g, ")");
  const whole = tryParseObject(trimmed);
  if (hasScenes(whole))
    return whole;
  const candidates = balancedObjects(stripJsonFences(trimmed));
  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (hasScenes(parsed))
      return parsed;
  }
  const collectedGroups = [];
  const collectedShots = [];
  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (!parsed || typeof parsed !== "object")
      continue;
    const object = parsed;
    if (Array.isArray(object.shots))
      collectedGroups.push(object);
    else if (object.paragraph !== undefined)
      collectedShots.push(object);
  }
  if (collectedGroups.length > 0)
    return { scenes: collectedGroups };
  if (collectedShots.length > 0)
    return { scenes: collectedShots };
  throw new Error("Parser did not return usable JSON scenes.");
}
async function resolveParserConnection(config, userId) {
  logStage(config, "parser_connection_resolve_start", { configuredConnectionId: config.parserConnectionId, modelOverride: Boolean(config.parserModel) });
  if (!config.parserConnectionId)
    throw new Error("Select a parser connection before generating.");
  const connection = await spindle.connections.get(config.parserConnectionId, userId);
  if (!connection)
    throw new Error("Parser connection not found.");
  logStage(config, "parser_connection_resolved", {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    connectionModel: connection.model,
    effectiveModel: config.parserModel || connection.model
  });
  return { id: connection.id, name: connection.name, provider: connection.provider, model: connection.model };
}
async function generateParserText(connection, config, messages, userId) {
  try {
    logStage(config, "parser_llm_start", {
      provider: connection.provider,
      model: config.parserModel || connection.model,
      connectionId: connection.id,
      parameterKeys: keysOf(config.parserParameters),
      messageCount: messages.length,
      messageLengths: messages.map((message) => message.content.length)
    });
    const result = await spindle.generate.raw({
      type: "raw",
      provider: connection.provider,
      model: config.parserModel || connection.model,
      connection_id: connection.id,
      messages,
      parameters: config.parserParameters,
      reasoning: { source: "off" },
      userId
    });
    const text = extractText(result);
    const usage = extractUsage(result);
    logStage(config, "parser_llm_done", { outputLength: text.length, ...Object.keys(usage).length ? { usage } : {} });
    return text;
  } catch (error) {
    logStage(config, "parser_llm_error", { error: error instanceof Error ? error.message : String(error) }, "error");
    throw new Error(`Parser generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function parserMessages(stableInstruction, referenceContext, userRequest, override) {
  const messages = [{ role: "system", content: stableInstruction.trim() }];
  if (referenceContext.trim())
    messages.push({ role: "system", content: referenceContext.trim() });
  messages.push({ role: "user", content: userRequest.trim() });
  if (override.trim())
    messages.push({
      role: "user",
      content: [
        "Final user instructions override lower-priority parser guidance when they do not conflict with valid JSON output.",
        override.trim()
      ].join(`

`)
    });
  return messages;
}
function preprocessingInstruction(paragraphs, config) {
  const minimum = Math.min(config.minImages, paragraphs.length);
  const maximum = Math.min(config.maxImages, paragraphs.length);
  return [
    "# Illustration Visual-Beat Editor",
    "Select and summarize the strongest visual beats from the current numbered assistant paragraphs.",
    `Select between ${minimum} and ${maximum} unique paragraphs.`,
    "Choose paragraphs with the most significant visual changes, actions, interactions, location changes, or emotional beats across the whole source. Do not favor early paragraphs by default.",
    "Output plain text only. The first line must have exactly this form:",
    "[Appearance: character name1: current visual baseline tags, character name2: current visual baseline tags]",
    "Then output one line per selected paragraph in exactly this form:",
    "[P#]: Visual beat: concise visible details; Camera/composition: concrete angle, framing, depth, or foreground-occlusion note",
    "Use each selected [P#] once. Do not invent or alter paragraph numbers.",
    "Every selected line must include a non-empty Camera/composition note.",
    "Use only visual details and concise English tags or short tag-like phrases. Output no markdown, greeting, or explanation."
  ].join(`

`);
}
function preprocessingUserRequest(rawTarget) {
  return ["Edit these current numbered paragraphs into the requested visual-beat selection:", rawTarget].join(`

`);
}
function validatePreprocessedTarget(value, paragraphs, config) {
  const summary = cleanString2(value);
  if (!summary)
    return null;
  const lines = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!/^\[Appearance:[^\]\r\n]*\]$/i.test(lines[0] || ""))
    return null;
  const minimum = Math.min(config.minImages, paragraphs.length);
  const maximum = Math.min(config.maxImages, paragraphs.length);
  const paragraphLines = lines.slice(1);
  if (paragraphLines.length < minimum || paragraphLines.length > maximum)
    return null;
  const validParagraphs = new Set(paragraphs.map((paragraph) => paragraph.parserIndex));
  const selectedParagraphs = [];
  const cameraNotes = [];
  const seen = new Set;
  for (const line of paragraphLines) {
    const match = line.match(/^\[P(\d+)\]\s*:\s*(.+)$/i);
    if (!match)
      return null;
    const paragraph = Number(match[1]);
    if (!validParagraphs.has(paragraph) || seen.has(paragraph))
      return null;
    const camera = match[2].match(/\bCamera\/composition\s*:\s*(\S.*)$/i)?.[1]?.trim() || "";
    if (!camera)
      return null;
    seen.add(paragraph);
    selectedParagraphs.push(paragraph);
    cameraNotes.push(camera);
  }
  return { summary: compactBlock(summary, 12000), selectedParagraphs, cameraNotes };
}
async function preprocessTargetParagraphs(parserConnection, config, paragraphs, context, userId) {
  const rawTarget = formatTargetParagraphs(paragraphs);
  if (!config.preprocessingEnabled || config.mode !== "illustration")
    return rawTarget;
  try {
    const summary = await generateParserText(parserConnection, config, parserMessages(preprocessingInstruction(paragraphs, config), continuityReference(context.preprocessingSystemContext ?? context.systemContext, context.recentContext), preprocessingUserRequest(rawTarget), context.override), userId);
    const selection = validatePreprocessedTarget(summary, paragraphs, config);
    if (selection) {
      logStage(config, "preprocessing_done", {
        summaryLength: selection.summary.length,
        candidateCount: paragraphs.length,
        selectedCount: selection.selectedParagraphs.length,
        selectedParagraphs: selection.selectedParagraphs,
        cameraNotes: selection.cameraNotes
      });
      return selection.summary;
    }
    logStage(config, "preprocessing_fallback", { reason: "invalid_selection", summaryLength: cleanString2(summary).length }, "warn");
  } catch (error) {
    logStage(config, "preprocessing_fallback", { reason: error instanceof Error ? error.message : String(error) }, "warn");
  }
  return rawTarget;
}
async function parsePayloadWithRepair(parserConnection, config, messages, userId) {
  const raw = await generateParserText(parserConnection, config, messages, userId);
  try {
    logStage(config, "json_parse_start", { rawLength: raw.length, repair: false });
    const parsed = parseJson(raw);
    logStage(config, "json_parse_done", { repair: false });
    return parsed;
  } catch {
    logStage(config, "json_parse_failed", { rawLength: raw.length, repairWillRun: true }, "warn");
    const repaired = await generateParserText(parserConnection, config, [
      { role: "system", content: "Repair malformed JSON. Return only valid JSON." },
      { role: "user", content: raw }
    ], userId);
    const parsed = parseJson(repaired);
    logStage(config, "json_parse_done", { repair: true });
    return parsed;
  }
}

// src/backend/rendering.ts
function imageUrlFromId(imageId) {
  return `/api/v1/image-gen/results/${encodeURIComponent(imageId)}`;
}
function htmlAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function renderInlayBlock(url, prompt, index, config) {
  const label = `Inlay ${index + 1}`;
  const configuredWidth = config.mode === "asset" ? config.assetImageWidth : config.inlayImageWidth;
  const fallbackWidth = config.mode === "asset" ? DEFAULT_CONFIG.assetImageWidth : DEFAULT_CONFIG.inlayImageWidth;
  const width = clampInt2(configuredWidth, 120, 2400, fallbackWidth);
  const maxHeight = clampInt2(config.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh);
  const safePrompt = prompt.replace(/```/g, "'''");
  return `${MARKER}
<div class="inlay-illustrator-image" data-inlay-illustrator="true" style="display:flex;justify-content:center;align-items:center;margin:10px 0;width:100%;"><img src="${htmlAttr(url)}" alt="${htmlAttr(label)}" data-lightbox data-inlay-illustrator-prompt="${htmlAttr(safePrompt)}" style="display:block;width:min(100%, ${width}px);max-height:${maxHeight}vh;height:auto;object-fit:contain;border-radius:8px;"/><pre class="inlay-illustrator-prompt" hidden>${htmlAttr(safePrompt)}</pre></div>`;
}
function renderInlaidMessage(original, record, config) {
  const cleanOriginal = stripInlayContent(original);
  const blocks = new Map;
  const count = Math.max(1, paragraphCount(cleanOriginal));
  record.imageUrls.forEach((url, index) => {
    const paragraph2 = clampInt2(record.paragraphs[index], 1, count, Math.min(index + 1, count));
    const existing = blocks.get(paragraph2) || [];
    existing.push(renderInlayBlock(url, record.prompts[index] || "", index, config));
    blocks.set(paragraph2, existing);
  });
  const tokens = cleanOriginal.trimEnd().split(/(\r?\n\s*\r?\n)/);
  let paragraph = 0;
  const output = [];
  for (const token of tokens) {
    if (!token.trim()) {
      output.push(token);
      continue;
    }
    paragraph += 1;
    const inlays = blocks.get(paragraph);
    if (inlays?.length)
      output.push(`${inlays.join(`

`)}

`);
    output.push(token);
  }
  const unused = [...blocks.entries()].filter(([number]) => number > paragraph).flatMap(([, inlays]) => inlays);
  if (unused.length)
    output.push(`

${unused.join(`

`)}`);
  return output.join("");
}

// src/backend/storage.ts
var stateUpdateQueues = new Map;
async function readJson(path, fallback, userId) {
  try {
    if (!await spindle.userStorage.exists(path, userId))
      return fallback;
    const text = await spindle.userStorage.read(path, userId);
    return { ...fallback, ...JSON.parse(text) };
  } catch {
    return fallback;
  }
}
async function writeJson(path, value, userId) {
  const slash = path.lastIndexOf("/");
  if (slash > 0)
    await spindle.userStorage.mkdir(path.slice(0, slash), userId).catch(() => {
      return;
    });
  await spindle.userStorage.write(path, JSON.stringify(value, null, 2), userId);
}
async function getConfig(userId) {
  return normalizeConfig(await readJson("config.json", DEFAULT_CONFIG, userId));
}
async function setConfig(patch, userId) {
  const next = normalizeConfig({ ...await getConfig(userId), ...patch });
  await writeJson("config.json", next, userId);
  return next;
}
async function getState(chatId, userId) {
  return readJson(`states/${chatId}.json`, { characterAppearance: {}, generated: {} }, userId);
}
async function getStateForUpdate(chatId, userId) {
  const fallback = { characterAppearance: {}, generated: {} };
  const path = `states/${chatId}.json`;
  if (!await spindle.userStorage.exists(path, userId))
    return fallback;
  return { ...fallback, ...JSON.parse(await spindle.userStorage.read(path, userId)) };
}
async function updateState(chatId, userId, mutator) {
  const queueKey = JSON.stringify([userId ?? null, chatId]);
  const previous = stateUpdateQueues.get(queueKey) || Promise.resolve();
  const operation = previous.then(async () => {
    const state = await getStateForUpdate(chatId, userId);
    await mutator(state);
    await writeJson(`states/${chatId}.json`, state, userId);
    return state;
  });
  const tail = operation.then(() => {
    return;
  }, () => {
    return;
  });
  stateUpdateQueues.set(queueKey, tail);
  try {
    return await operation;
  } finally {
    if (stateUpdateQueues.get(queueKey) === tail)
      stateUpdateQueues.delete(queueKey);
  }
}
async function getParserConnections(userId) {
  try {
    return (await spindle.connections.list(userId)).map((connection) => ({
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      model: connection.model
    }));
  } catch (error) {
    spindle.log.warn(`Parser connection list unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
async function sendState(userId, chatId) {
  const state = chatId ? await getState(chatId, userId) : null;
  spindle.sendToFrontend({
    type: "state",
    config: await getConfig(userId),
    parserConnections: await getParserConnections(userId),
    chatId: chatId || "",
    characterAppearance: state?.characterAppearance || {}
  }, userId);
}

// src/backend/generation.ts
var running = new Set;
function compactLorebookNeedsFullRetry(payload, snapshot) {
  if (!snapshot.compacted || !snapshot.hasCharacterVisualReference)
    return false;
  const characters = normalizeScenePayload(payload).flatMap(({ shot }) => cleanArray(shot.characters));
  if (characters.length === 0)
    return false;
  return !characters.some((character) => [character.identity, character.appearance, character.body, character.attire].some((value) => cleanString2(value)));
}
async function parseAndSelectPrompts(input) {
  const { chatId, messageId, messages, paragraphs, state, config, userId } = input;
  const parserConnection = await resolveParserConnection(config, userId);
  const targetIndex = Math.max(0, messages.findIndex((message) => message.id === messageId));
  let parsed = null;
  let selected = [];
  let lastParserError = null;
  const lorebookSnapshot = await buildLorebookContextSnapshot(chatId, paragraphs.map((paragraph) => paragraph.text).join(`

`), config, userId);
  for (let attempt = 0;attempt <= config.parserRetries; attempt += 1) {
    try {
      const context = await buildParserContext(chatId, messages, targetIndex, state.characterAppearance, config, attempt, userId, lorebookSnapshot);
      const targetSource = await preprocessTargetParagraphs(parserConnection, config, paragraphs, context, userId);
      const instruction = parserInstruction(config);
      const referenceContext = continuityReference(context.systemContext, context.recentContext);
      const userRequest = parserUserRequest(targetSource);
      logStage(config, "parser_prompt_built", {
        attempt,
        instructionLength: instruction.length,
        systemContextLength: context.systemContext.length,
        recentContextLength: context.recentContext.length,
        overrideLength: context.override.length,
        parserParagraphs: paragraphs.length,
        cacheCharacters: Object.keys(state.characterAppearance).length,
        promptStyle: config.promptStyle,
        promptSyntax: config.promptSyntax,
        mode: config.mode,
        maxCharacters: config.mode === "asset" ? 1 : config.maxCharacters,
        preprocessingEnabled: config.preprocessingEnabled,
        contextDiagnostics: context.diagnostics
      });
      parsed = await parsePayloadWithRepair(parserConnection, config, parserMessages(instruction, referenceContext, userRequest, context.override), userId);
      selected = selectPromptEntries(parsed, paragraphs, config);
      if (selected.length === 0)
        throw new Error("No usable prompts were parsed.");
      if (attempt === 0 && config.parserRetries > 0 && compactLorebookNeedsFullRetry(parsed, lorebookSnapshot)) {
        throw new Error("Compact lorebook context did not produce durable character tags; retrying with full lorebook context.");
      }
      break;
    } catch (error) {
      lastParserError = error;
      logStage(config, "parser_attempt_failed", { attempt, retries: config.parserRetries, error: error instanceof Error ? error.message : String(error) }, attempt >= config.parserRetries ? "error" : "warn");
      if (attempt >= config.parserRetries)
        throw error;
    }
  }
  if (!parsed)
    throw new Error(lastParserError instanceof Error ? lastParserError.message : "Parser did not return usable prompts.");
  return { parsed, selected };
}
async function persistCharacterMemory(chatId, parsed, config, userId) {
  const committed = await updateState(chatId, userId, (state) => {
    updateCache(state.characterAppearance, parsed);
  });
  spindle.sendToFrontend({
    type: "character_memory_updated",
    chatId,
    characterAppearance: committed.characterAppearance
  }, userId);
  logStage(config, "character_memory_persisted", { chatId, characterCount: Object.keys(committed.characterAppearance).length });
}
function logParsedSelection(parsed, selected, paragraphs, config) {
  const scenes = parsed.scenes || [];
  const normalized = normalizeScenePayload(parsed);
  logStage(config, "parsed_payload_summary", {
    sceneCount: scenes.length,
    normalizedCount: normalized.length,
    parserParagraphs: normalized.map((entry) => entry.parserParagraph),
    rejectedParagraphs: normalized.map((entry) => entry.parserParagraph).filter((paragraph) => paragraph < 1 || paragraph > paragraphs.length),
    charactersPerShot: normalized.map((entry) => cleanArray(entry.shot.characters).length)
  });
  logStage(config, "prompt_selection_done", {
    promptCount: normalized.length,
    selectedCount: selected.length,
    parserParagraphs: selected.map((entry) => entry.parserParagraph),
    originalParagraphs: selected.map((entry) => entry.paragraph),
    promptLengths: selected.map((entry) => renderPrompt(entry.prompt, config.promptSyntax).length),
    negativeLengths: selected.map((entry) => entry.negative.length)
  });
}
async function prepareAndDispatchImages(chatId, selected, config, userId) {
  const imageConnection = await resolveImageConnection(config, userId);
  const preparationStartedAt = Date.now();
  logStage(config, "image_generation_preparation_start", {
    total: selected.length,
    provider: imageConnection?.provider || "(default)",
    connectionId: imageConnection?.id || null
  });
  const eagerComfyQueueing = imageConnection?.provider === "comfyui";
  const submissionStartedAt = Date.now();
  return prepareAndDispatchImageJobs(selected, eagerComfyQueueing, async (entry, index) => {
    const jobStartedAt = Date.now();
    logStage(config, "image_generation_preparation_job_start", { index: index + 1, total: selected.length, paragraph: entry.paragraph });
    const prompt = await cleanupPrompt(entry.prompt, config);
    const parameters = await buildImageParameters(config, imageConnection, prompt, entry.negative || "");
    const job = {
      index,
      total: selected.length,
      prompt,
      negative: entry.negative || "",
      paragraph: entry.paragraph,
      parameters
    };
    logStage(config, "image_generation_prepared", {
      index: index + 1,
      total: selected.length,
      paragraph: entry.paragraph,
      elapsedMs: Date.now() - jobStartedAt,
      preparationElapsedMs: Date.now() - preparationStartedAt,
      promptLength: prompt.length,
      parameterKeys: keysOf(parameters)
    });
    if (index === selected.length - 1) {
      logStage(config, "image_generation_preparation_done", {
        total: selected.length,
        elapsedMs: Date.now() - preparationStartedAt,
        provider: imageConnection?.provider || "(default)"
      });
    }
    return job;
  }, (job) => {
    const submittedAt = Date.now();
    logStage(config, "image_generation_request_submitted", {
      index: job.index + 1,
      total: job.total,
      paragraph: job.paragraph,
      provider: imageConnection?.provider || "(default)",
      dispatch: eagerComfyQueueing ? "eager_comfyui" : "sequential",
      elapsedMs: submittedAt - submissionStartedAt
    });
    return spindle.imageGen.generate({
      connection_id: config.imageConnectionId || undefined,
      prompt: job.prompt,
      negativePrompt: job.negative || undefined,
      model: config.imageModel || undefined,
      parameters: job.parameters,
      owner_chat_id: chatId,
      userId
    }).then((result) => {
      logStage(config, "image_generation_completed", {
        index: job.index + 1,
        total: job.total,
        paragraph: job.paragraph,
        elapsedMs: Date.now() - submittedAt,
        imageId: result.imageId || null,
        provider: result.provider || imageConnection?.provider || null,
        model: result.model || null
      });
      return result;
    }, (error) => {
      logStage(config, "image_generation_failed", {
        index: job.index + 1,
        total: job.total,
        paragraph: job.paragraph,
        elapsedMs: Date.now() - submittedAt,
        error: error instanceof Error ? error.message : String(error)
      }, "error");
      throw error;
    });
  });
}
function collectImageResults(stage, config) {
  const imageIds = [];
  const imageUrls = [];
  const prompts = stage.jobs.map((job) => job.prompt);
  const paragraphs = stage.jobs.map((job) => job.paragraph);
  for (const [index, result] of stage.results.entries()) {
    if (result.imageId)
      imageIds.push(result.imageId);
    const imageUrl = result.imageUrl || (result.imageId ? imageUrlFromId(result.imageId) : "");
    if (imageUrl)
      imageUrls.push(imageUrl);
    logStage(config, "image_generation_results_collected", {
      index: index + 1,
      imageId: result.imageId || null,
      returnedImageUrl: result.imageUrl || null,
      markdownImageUrl: imageUrls[imageUrls.length - 1] || null,
      provider: result.provider || null,
      model: result.model || null
    });
  }
  return { prompts, paragraphs, imageIds, imageUrls };
}
async function persistGeneration(input) {
  const { chatId, messageId, swipeId, key, target, parsed, assets, config, userId } = input;
  const record = {
    chatId,
    messageId,
    swipeId,
    prompts: assets.prompts,
    paragraphs: assets.paragraphs,
    imageIds: assets.imageIds,
    imageUrls: assets.imageUrls,
    rawJson: parsed,
    createdAt: new Date().toISOString()
  };
  await updateState(chatId, userId, (state) => {
    state.generated[key] = record;
  });
  logStage(config, "state_persisted", { key, imageCount: assets.imageIds.length, paragraphs: assets.paragraphs });
  const originalContent = String(target.content || "");
  const nextContent = renderInlaidMessage(originalContent, record, config);
  logStage(config, "inlay_rendered", {
    originalLength: originalContent.length,
    finalLength: nextContent.length,
    originalParagraphs: paragraphCount(originalContent),
    imageCount: assets.imageUrls.length,
    paragraphs: assets.paragraphs
  });
  await spindle.chat.updateMessage(chatId, messageId, {
    content: nextContent,
    metadata: {
      ...target.metadata || {},
      inlayIllustratorImageIds: assets.imageIds,
      inlayIllustratorParagraphs: assets.paragraphs,
      inlayIllustratorGeneratedAt: record.createdAt
    }
  });
  logStage(config, "message_updated", { chatId, messageId, imageIds: assets.imageIds, paragraphs: assets.paragraphs });
  spindle.sendToFrontend({ type: "status", status: "Generated", record }, userId);
  return record;
}
async function generateForMessage(chatId, messageId, content, userId) {
  const config = await getConfig(userId);
  logStage(config, "request_received", { chatId, messageId, contentLength: content.length, enabled: config.enabled, autoGenerate: config.autoGenerate });
  if (!config.enabled) {
    logStage(config, "request_skipped", { reason: "disabled", chatId, messageId });
    return;
  }
  const messages = await spindle.chat.getMessages(chatId);
  const target = messages.find((message) => message.id === messageId);
  logStage(config, "target_checked", {
    found: Boolean(target),
    role: target?.role || null,
    ownMessage: target ? isOwnMessage(target) : false,
    messageCount: messages.length
  });
  if (!target || target.role !== "assistant" || isOwnMessage(target))
    return;
  const swipeId = Number.isFinite(Number(target.swipe_id)) ? Number(target.swipe_id) : 0;
  const key = `${chatId}:${messageId}:${swipeId}`;
  const runningKey = JSON.stringify([userId ?? null, key]);
  if (running.has(runningKey)) {
    logStage(config, "request_skipped", { reason: "already_running", key });
    return;
  }
  running.add(runningKey);
  try {
    const state = await getState(chatId, userId);
    if (state.generated[key]) {
      logStage(config, "request_skipped", { reason: "already_generated", key });
      return;
    }
    const sourceContent = String(content || target.content || "");
    const paragraphs = prepareParagraphs(sourceContent, config);
    logStage(config, "paragraph_cleanup_done", {
      originalParagraphs: paragraphCount(sourceContent),
      parserParagraphs: paragraphs.length,
      mappedOriginalParagraphs: paragraphs.map((paragraph) => paragraph.originalIndex),
      ignoredTagCount: ignoredTagNames(config).length
    });
    if (paragraphs.length === 0)
      throw new Error("No usable paragraphs found for image parsing.");
    const { parsed, selected } = await parseAndSelectPrompts({ chatId, messageId, messages, paragraphs, state, config, userId });
    await persistCharacterMemory(chatId, parsed, config, userId);
    logParsedSelection(parsed, selected, paragraphs, config);
    const imageStage = await prepareAndDispatchImages(chatId, selected, config, userId);
    const assets = collectImageResults(imageStage, config);
    await persistGeneration({ chatId, messageId, swipeId, key, target, parsed, assets, config, userId });
  } finally {
    running.delete(runningKey);
  }
}

// src/backend.ts
var __testables = {
  DEFAULT_CONFIG,
  activePromptPreset,
  assemblePrompt,
  cleanupPrompt,
  continuityReference,
  exactVisualKey,
  formatTargetParagraphs,
  parserInstruction,
  parserMessages,
  parserUserRequest,
  preprocessTargetParagraphs,
  preprocessingInstruction,
  preprocessingUserRequest,
  prepareAndDispatchImageJobs,
  normalizeConfig,
  renderPrompt,
  selectPromptEntries,
  stripInlayContent,
  stripInlayFromMessages,
  validatePreprocessedTarget
};
spindle.registerInterceptor(async (messages) => stripInlayFromMessages(messages));
spindle.on("GENERATION_ENDED", async (payload, userId) => {
  let configForError = null;
  try {
    const config = await getConfig(userId);
    configForError = config;
    logStage(config, "generation_ended_event", {
      chatId: payload.chatId,
      messageId: payload.messageId || null,
      generationType: payload.generationType || null,
      hasError: Boolean(payload.error),
      hasContent: Boolean(payload.content),
      contentLength: String(payload.content || "").length
    });
    if (!config.enabled || !config.autoGenerate || payload.error || !payload.messageId || !payload.content)
      return;
    if (payload.generationType === "continue" || payload.generationType === "impersonate")
      return;
    await generateForMessage(payload.chatId, payload.messageId, payload.content, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStage(configForError || { debugLogging: true }, "auto_generation_error", { error: message }, "error");
    spindle.log.error(`Auto generation failed: ${message}`);
    spindle.sendToFrontend({ type: "status", status: "Error", error: message }, userId);
  }
});
spindle.onFrontendMessage(async (payload, userId) => {
  const message = payload;
  let configForError = null;
  try {
    if (message.type === "get_state") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      logStage(config, "frontend_get_state", { chatId: chatId || null });
      await sendState(userId, chatId);
    } else if (message.type === "set_config") {
      const next = await setConfig(message.patch || {}, userId);
      configForError = next;
      logStage(next, "frontend_set_config", { patchKeys: keysOf(message.patch) });
      await sendState(userId, String(message.chatId || ""));
    } else if (message.type === "character_tags_update") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId)
        throw new Error("Open a chat first.");
      const state = await updateState(chatId, userId, (current) => {
        upsertCharacterTag(current, message.oldName, message.name, message.tags);
      });
      logStage(config, "character_tags_update", { chatId, oldName: String(message.oldName || ""), name: String(message.name || "") });
      spindle.sendToFrontend({
        type: "character_memory_updated",
        chatId,
        characterAppearance: state.characterAppearance
      }, userId);
    } else if (message.type === "character_tags_delete") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId)
        throw new Error("Open a chat first.");
      const state = await updateState(chatId, userId, (current) => {
        deleteCharacterTag(current, message.name);
      });
      logStage(config, "character_tags_delete", { chatId, name: String(message.name || "") });
      spindle.sendToFrontend({
        type: "character_memory_updated",
        chatId,
        characterAppearance: state.characterAppearance
      }, userId);
    } else if (message.type === "generate_latest") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId)
        throw new Error("Open a chat first.");
      logStage(config, "manual_generate_latest", { chatId });
      const messages = await spindle.chat.getMessages(chatId);
      const target = [...messages].reverse().find((candidate) => candidate.role === "assistant" && !isOwnMessage(candidate));
      if (!target)
        throw new Error("No assistant message found.");
      spindle.sendToFrontend({ type: "status", status: "Generating..." }, userId);
      await generateForMessage(chatId, target.id, target.content, userId);
    } else if (message.type === "test_danbooru") {
      const config = await getConfig(userId);
      configForError = config;
      logStage(config, "danbooru_test_start", { endpoint: config.danbooruEndpoint });
      const result = parseCorsJson(await spindle.cors(config.danbooruEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ tags: ["1girl", "blonde hair", "red eyes"] })
      }), "Danbooru test");
      spindle.sendToFrontend({ type: "danbooru_test", ok: true, result }, userId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStage(configForError || { debugLogging: true }, "frontend_message_error", { type: String(message.type || ""), error: errorMessage }, "error");
    spindle.log.error(errorMessage);
    spindle.sendToFrontend({ type: "status", status: "Error", error: errorMessage }, userId);
  }
});
spindle.log.info("Inlay Illustrator loaded.");
export {
  __testables
};
