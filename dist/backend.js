// src/shared/config.ts
var DEFAULT_CONFIG = {
  enabled: true,
  autoGenerate: true,
  debugLogging: true,
  adaptiveMode: false,
  perspectiveMode: "dynamic",
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
  const {
    danbooruCleanup: _legacyDanbooruCleanup,
    danbooruEndpoint: _legacyDanbooruEndpoint,
    mode: _legacyMode,
    assetImageWidth: _legacyAssetImageWidth,
    imageGeneration: _legacyImageGeneration,
    ...current
  } = raw;
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
    ...current,
    adaptiveMode: raw.adaptiveMode === true,
    perspectiveMode: raw.perspectiveMode === "creative" || raw.perspectiveMode === "static" || raw.perspectiveMode === "dynamic" ? raw.perspectiveMode : raw.mode === "asset" ? "static" : "dynamic",
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
var PROMPT_PRE_BLOCK = ownedBlock(String.raw`<pre\b(?=[^>]*[\t\n\f\r ]class\s*=\s*(?:"(?:[^"]*[\t\n\f\r ])?inlay-illustrator-(?:negative-)?prompt(?:[\t\n\f\r ][^"]*)?"|'(?:[^']*[\t\n\f\r ])?inlay-illustrator-(?:negative-)?prompt(?:[\t\n\f\r ][^']*)?'|inlay-illustrator-(?:negative-)?prompt(?=[\s>])))[^>]*>[\s\S]*?<\/pre\s*>`);
var ORPHAN_MARKER = ownedBlock(MARKER_PATTERN);
var PROMPT_ATTRIBUTE = /\s+data-inlay-illustrator-(?:negative-prompt|perspective-source|concept|image-index|image-id|message-id|swipe-id|chat-id|perspective|prompt)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi;
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

// src/backend/camera-diversity.ts
var CAMERA_FRAMING_VALUES = [
  "portrait",
  "close-up",
  "medium close-up",
  "upper body",
  "medium shot",
  "cowboy shot",
  "feet out of frame",
  "full body",
  "wide shot",
  "lower body",
  "head out of frame",
  "eyes out of frame",
  "body-part focus"
];
var CAMERA_ANGLE_VALUES = ["eye level", "low angle", "high angle", "dutch angle"];
var CAMERA_PERSPECTIVE_VALUES = [
  "straight-on",
  "from above",
  "from behind",
  "from below",
  "from side",
  "sideways",
  "three-quarter view",
  "pov"
];
var CAMERA_FOCUS_VALUES = [
  "shallow depth of field",
  "deep focus",
  "background blur",
  "foreground blur",
  "motion blur",
  "fisheye",
  "wide-angle lens",
  "telephoto lens"
];
var CAMERA_FRAMING = new Set(CAMERA_FRAMING_VALUES);
var CAMERA_ANGLE = new Set(CAMERA_ANGLE_VALUES);
var CAMERA_PERSPECTIVE = new Set(CAMERA_PERSPECTIVE_VALUES);
var CAMERA_FOCUS = new Set(CAMERA_FOCUS_VALUES);
function orderedShots(payload) {
  const output = [];
  for (const scene of Array.isArray(payload.scenes) ? payload.scenes : []) {
    const shots = Array.isArray(scene.shots) ? scene.shots : [scene];
    for (const shot of shots) {
      const paragraph = Number(shot.paragraph ?? scene.paragraph);
      output.push({ shot, paragraph: Number.isFinite(paragraph) ? paragraph : 0, index: output.length });
    }
  }
  return output;
}
function effectivePerspective(shot, config) {
  if (!config.adaptiveMode)
    return config.perspectiveMode;
  const requested = cleanString2(shot.perspectiveMode).toLowerCase();
  return requested === "creative" || requested === "static" || requested === "dynamic" ? requested : "dynamic";
}
function normalizedCamera(camera) {
  const record = asRecord(camera);
  return {
    framing: cleanString2(record.framing).toLowerCase(),
    angle: cleanString2(record.angle).toLowerCase(),
    perspective: cleanString2(record.perspective).toLowerCase()
  };
}
function fullSignature(camera) {
  return [camera.framing, camera.angle, camera.perspective].join(" | ");
}
function pairSignature(camera) {
  return camera.angle && camera.perspective ? `${camera.angle} | ${camera.perspective}` : "";
}
function auditDynamicCameraDiversity(payload, config) {
  if (config.promptStyle !== "anima") {
    return { dynamicShotCount: 0, signatures: [], exactCollisions: [], pairRepetitions: [] };
  }
  const dynamic = orderedShots(payload).filter(({ shot }) => effectivePerspective(shot, config) === "dynamic");
  const signatures = [];
  const exactCollisions = [];
  const seenFull = new Map;
  const seenPairs = new Map;
  for (const entry of dynamic) {
    const camera = normalizedCamera(entry.shot.camera);
    const signature = fullSignature(camera);
    const populated = [camera.framing, camera.angle, camera.perspective].filter(Boolean).length;
    signatures.push({ index: entry.index, paragraph: entry.paragraph, signature });
    if (populated >= 2) {
      const first = seenFull.get(signature);
      if (first) {
        exactCollisions.push({
          signature,
          firstIndex: first.index,
          duplicateIndex: entry.index,
          firstParagraph: first.paragraph,
          duplicateParagraph: entry.paragraph
        });
      } else {
        seenFull.set(signature, entry);
      }
    }
    const pair = pairSignature(camera);
    if (pair)
      seenPairs.set(pair, [...seenPairs.get(pair) || [], entry]);
  }
  const pairRepetitions = [...seenPairs.entries()].filter(([, entries]) => entries.length > 1).map(([signature, entries]) => ({
    signature,
    indexes: entries.map((entry) => entry.index),
    paragraphs: entries.map((entry) => entry.paragraph)
  }));
  return { dynamicShotCount: dynamic.length, signatures, exactCollisions, pairRepetitions };
}
function stringValues(value) {
  return (Array.isArray(value) ? value : [value]).map(cleanString2).map((entry) => entry.toLowerCase()).filter(Boolean);
}
function validCamera(camera) {
  const record = asRecord(camera);
  if (Object.keys(record).some((key) => !["framing", "angle", "perspective", "focus"].includes(key)))
    return false;
  const framing = stringValues(record.framing);
  const angle = stringValues(record.angle);
  const perspective = stringValues(record.perspective);
  const focus = stringValues(record.focus);
  return framing.length <= 1 && angle.length <= 1 && perspective.length <= 1 && focus.length <= 2 && framing.every((value) => CAMERA_FRAMING.has(value)) && angle.every((value) => CAMERA_ANGLE.has(value)) && perspective.every((value) => CAMERA_PERSPECTIVE.has(value)) && focus.every((value) => CAMERA_FOCUS.has(value));
}
function clonePayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}
function mergeDynamicCameraRepair(original, repaired, config, audit = auditDynamicCameraDiversity(original, config)) {
  if (audit.exactCollisions.length === 0)
    return original;
  const originalShots = orderedShots(original);
  const repairedShots = orderedShots(repaired);
  if (originalShots.length !== repairedShots.length)
    return null;
  if (originalShots.some((entry, index) => entry.paragraph !== repairedShots[index]?.paragraph))
    return null;
  const replacementIndexes = new Set(audit.exactCollisions.map((collision) => collision.duplicateIndex));
  const replacementCameras = new Map;
  for (const index of replacementIndexes) {
    const candidate = repairedShots[index]?.shot.camera;
    if (!validCamera(candidate))
      return null;
    replacementCameras.set(index, candidate);
  }
  const merged = clonePayload(original);
  for (const entry of orderedShots(merged)) {
    const replacement = replacementCameras.get(entry.index);
    if (replacement)
      entry.shot.camera = replacement;
  }
  return auditDynamicCameraDiversity(merged, config).exactCollisions.length < audit.exactCollisions.length ? merged : null;
}
function cameraRepairInstruction(audit) {
  const collisions = audit.exactCollisions.map((collision) => `shot ${collision.duplicateIndex + 1} (P${collision.duplicateParagraph}) repeats shot ${collision.firstIndex + 1} (P${collision.firstParagraph}): ${collision.signature}`);
  return [
    "Repair only the repeated Dynamic camera objects in this valid illustration JSON. Return one raw JSON object and no other text.",
    "Keep scene order, shot order, paragraph references, perspectiveMode, characters, composition, action, environment, and every non-camera value unchanged.",
    "For each listed later duplicate, choose a source-faithful camera that contains its complete focal action and avoids the repeated framing + angle + perspective tuple.",
    "Do not force an extreme or unsuitable angle merely for variety. Sharing one camera value is allowed. Sharing angle + perspective is allowed when framing genuinely differs.",
    "If the numbered source explicitly establishes a continuous camera or POV, preserve that camera instead of manufacturing variation.",
    `framing: ${CAMERA_FRAMING_VALUES.join(", ")}`,
    `angle: ${CAMERA_ANGLE_VALUES.join(", ")}`,
    `perspective: ${CAMERA_PERSPECTIVE_VALUES.join(", ")}`,
    `focus (maximum two): ${CAMERA_FOCUS_VALUES.join(", ")}`,
    `Repeated Dynamic cameras:
- ${collisions.join(`
- `)}`
  ].join(`
`);
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
function joinSections(sections, syntax, format) {
  const clean = sections.map((section) => format === "ordered" ? normalizePromptSection(section) : section.trim()).filter(Boolean);
  return syntax === "comfyui" ? clean.join(format === "ordered" ? `,

` : `,
`) : clean.join(", ");
}
function renderPrompt(prompt, syntax) {
  return joinSections(prompt.sections, syntax, prompt.format || "ordered");
}
function renderPromptWithCurrentAffixes(corePrompt, format, config) {
  const preset = activePromptPreset(config);
  const clean = (value) => format === "ordered" ? normalizePromptSection(value) : value.trim();
  const separator = config.promptSyntax === "comfyui" ? format === "ordered" ? `,

` : `,
` : ", ";
  return [
    clean(preset?.positivePrefix || ""),
    clean(config.customPositivePrefix),
    corePrompt.trim(),
    clean(config.customPositiveSuffix)
  ].filter(Boolean).join(separator);
}
function renderNegativeWithCurrentSelection(shotNegative, format, config) {
  const preset = activePromptPreset(config);
  const negative = unique(csvParts(preset?.negativePrefix, config.customNegative, shotNegative)).join(", ");
  return format === "ordered" ? normalizePromptSection(negative) : negative.trim();
}
function normalizePromptSection(value) {
  const doubleColon = "";
  return value.replace(/::/g, doubleColon).replace(/;/g, ",").replace(/\s*,(?:\s*,)+\s*/g, ", ").replace(/^\s*,+\s*/, "").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/[.!?]+(?=\s*,)/g, "").replace(/[\s.,;:!?]+$/g, "").replace(new RegExp(doubleColon, "g"), "::").trim();
}
function normalizeSupplement(value) {
  return normalizePromptSection(value);
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
var ACTION_STOP_WORDS = new Set(["a", "an", "at", "in", "of", "on", "the", "to", "toward", "towards", "with"]);
function actionToken(value) {
  const lower = value.toLowerCase();
  if (["face", "facing", "gaze", "gazing", "look", "looking", "looks"].includes(lower))
    return "look";
  if (["spin", "spinning", "turn", "turning", "turns"].includes(lower))
    return "turn";
  if (["march", "marching", "walk", "walking", "walks"].includes(lower))
    return "walk";
  if (lower === "another")
    return "other";
  if (lower.endsWith("ing") && lower.length > 5) {
    const stem = lower.slice(0, -3);
    return stem.at(-1) === stem.at(-2) ? stem.slice(0, -1) : stem;
  }
  if (lower.endsWith("ed") && lower.length > 4)
    return lower.slice(0, -2);
  if (lower.endsWith("s") && lower.length > 3)
    return lower.slice(0, -1);
  return lower;
}
function actionTokens(value) {
  return (value.toLowerCase().match(/[a-z0-9]+/g) || []).filter((token) => !ACTION_STOP_WORDS.has(token)).map(actionToken);
}
function tokenCovered(token, proseTokens) {
  return proseTokens.some((candidate) => candidate === token || Math.min(candidate.length, token.length) >= 4 && (candidate.startsWith(token) || token.startsWith(candidate)));
}
function uncoveredActionTags(value, composition) {
  const actions = unique(csvParts(value));
  if (!composition)
    return actions.join(", ");
  const proseTokens = actionTokens(composition);
  return actions.filter((action) => {
    const tokens = actionTokens(action);
    return tokens.length === 0 || !tokens.every((token) => tokenCovered(token, proseTokens));
  }).join(", ");
}
function sanitizeComposition(value, replacements) {
  return stripOrReplaceNames(value, replacements, false).replace(/\bfrom\s+[A-Z][\p{L}\p{M}-]*(?:\s+[A-Z][\p{L}\p{M}-]*)*['’]s\s+POV\b/giu, "from the viewer's POV").replace(/\s+/g, " ").trim();
}
function assembleCharacterBlock(character, config, replacements, includeAction, perspectiveMode) {
  if (perspectiveMode === "creative") {
    return unique(csvParts(stripOrReplaceNames(cleanString2(character.visibleTags), replacements, true))).join(", ");
  }
  return unique(csvParts(stripOrReplaceNames(cleanString2(character.label), replacements, true), shouldIncludeCharacterNames(config) ? displayName(cleanString2(character.name), config) : "", stripOrReplaceNames(cleanString2(character.age), replacements, true), stripOrReplaceNames(cleanString2(character.appearance), replacements, true), stripOrReplaceNames(cleanString2(character.body), replacements, true), stripOrReplaceNames(cleanString2(character.attire), replacements, true), stripOrReplaceNames(cleanString2(character.expression), replacements, true), includeAction ? stripOrReplaceNames(cleanString2(character.action), replacements, true) : "")).join(", ");
}
function resolveShotPerspective(shot, config) {
  if (!config.adaptiveMode)
    return { mode: config.perspectiveMode, source: "manual" };
  const candidate = cleanString2(shot.perspectiveMode).toLowerCase();
  return candidate === "creative" || candidate === "static" || candidate === "dynamic" ? { mode: candidate, source: "adaptive" } : { mode: "dynamic", source: "adaptive" };
}
function structuredSnippets(value, cap) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) => csvParts(entry)).map((entry) => cleanString2(entry)).filter(Boolean).slice(0, cap);
}
var CAMERA_FRAMING2 = new Set(CAMERA_FRAMING_VALUES);
var CAMERA_ANGLE2 = new Set(CAMERA_ANGLE_VALUES);
var CAMERA_PERSPECTIVE2 = new Set(CAMERA_PERSPECTIVE_VALUES);
var CAMERA_FOCUS2 = new Set(CAMERA_FOCUS_VALUES);
function hasAtomicField(record, fields) {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(record, field));
}
function sanitizedAtomicSnippets(value, cap, replacements) {
  return structuredSnippets(value, cap).map((snippet) => sanitizeComposition(snippet, replacements)).filter(Boolean);
}
function assembleAtomicCharacterComposition(value, replacements) {
  const record = asRecord(value);
  const fields = ["position", "pose", "actions", "gaze"];
  const structured = hasAtomicField(record, fields);
  if (!structured)
    return { text: sanitizeComposition(cleanString2(value), replacements), structured: false };
  const snippets = unique([
    ...sanitizedAtomicSnippets(record.position, 1, replacements),
    ...sanitizedAtomicSnippets(record.pose, 1, replacements),
    ...sanitizedAtomicSnippets(record.actions, 3, replacements),
    ...sanitizedAtomicSnippets(record.gaze, 1, replacements)
  ]);
  return { text: snippets.join(", "), structured: true };
}
function assembleStaticCharacterComposition(value, replacements) {
  const composition = asRecord(value);
  const pose = sanitizedAtomicSnippets(composition.pose, 1, replacements);
  const gaze = sanitizedAtomicSnippets(composition.gaze, 1, replacements);
  const concretePose = pose[0] && !/\bpos(?:e|es|ed|ing)\b/i.test(pose[0]) ? pose[0] : "standing upright with arms relaxed at sides";
  return {
    text: unique([
      "slightly forward from the background",
      concretePose,
      ...gaze
    ]).join(", "),
    structured: true
  };
}
function assembleAtomicSharedComposition(value, replacements) {
  const record = asRecord(value);
  const fields = ["interaction", "spatialRelation"];
  const structured = hasAtomicField(record, fields);
  if (!structured) {
    const text = sanitizeComposition(cleanString2(value), replacements);
    return { text, interaction: "", structured: false };
  }
  const interactionParts = unique(sanitizedAtomicSnippets(record.interaction, 2, replacements));
  const relationParts = unique(sanitizedAtomicSnippets(record.spatialRelation, 1, replacements));
  return {
    text: unique([...interactionParts, ...relationParts]).join(", "),
    interaction: interactionParts.join(", "),
    structured: true
  };
}
function allowedCameraSnippets(value, cap, allowed) {
  return structuredSnippets(value, cap).map((snippet) => snippet.toLowerCase().replace(/\s+/g, " ").trim()).filter((snippet) => allowed.has(snippet));
}
function assembleStructuredCamera(value) {
  const record = asRecord(value);
  const fields = ["framing", "angle", "perspective", "focus"];
  const structured = hasAtomicField(record, fields);
  if (!structured)
    return { text: unique(csvParts(cleanString2(value))).join(", "), structured: false };
  return {
    text: unique([
      ...allowedCameraSnippets(record.framing, 1, CAMERA_FRAMING2),
      ...allowedCameraSnippets(record.angle, 1, CAMERA_ANGLE2),
      ...allowedCameraSnippets(record.perspective, 1, CAMERA_PERSPECTIVE2),
      ...allowedCameraSnippets(record.focus, 2, CAMERA_FOCUS2)
    ]).join(", "),
    structured: true
  };
}
function identitySafeCreativeSituation(value) {
  return unique(csvParts(value).filter((tag) => !/^(?:\d+(?:girl|boy|other)s?|solo|group)$/i.test(tag.trim()))).join(", ");
}
function assembleAnimaPrompt(scene, shot, config, replacements, perspectiveMode, creativeConcept) {
  const allCharacters = cleanArray(shot.characters).slice(0, config.maxCharacters);
  const bindingCreative = perspectiveMode === "creative" && Boolean(creativeConcept);
  const characters = bindingCreative ? allCharacters.slice(0, 1) : allCharacters;
  const conceptScope = perspectiveMode === "creative" ? sanitizeComposition(cleanString2(creativeConcept?.renderScope), replacements) : "";
  const characterSections = characters.flatMap((character, index) => {
    const composition = perspectiveMode === "static" ? assembleStaticCharacterComposition(character.composition, replacements) : assembleAtomicCharacterComposition(character.composition, replacements);
    const scope = perspectiveMode === "creative" ? index === 0 && conceptScope || sanitizeComposition(cleanString2(character.renderScope), replacements) : "";
    const compositionText = perspectiveMode === "creative" && scope ? scope : composition.text;
    const conceptTags = perspectiveMode === "creative" && index === 0 ? stripOrReplaceNames(unique(csvParts(creativeConcept?.visibleCues)).join(", "), replacements, true) : "";
    const baseTags = conceptTags || assembleCharacterBlock(character, config, replacements, false, perspectiveMode);
    const uncoveredActions = composition.structured ? "" : stripOrReplaceNames(uncoveredActionTags(character.action, compositionText), replacements, true);
    const tags = unique(csvParts(baseTags, uncoveredActions)).join(", ");
    return [compositionText, tags].filter(Boolean);
  });
  const hasSharedComposition = Boolean(cleanString2(shot.sharedComposition)) || Object.keys(asRecord(shot.sharedComposition)).length > 0;
  const sharedSource = hasSharedComposition ? shot.sharedComposition : shot.supplement;
  const sharedComposition = assembleAtomicSharedComposition(sharedSource, replacements);
  const sharedAction = sharedComposition.structured ? config.supplement ? "" : sharedComposition.interaction : stripOrReplaceNames(uncoveredActionTags(shot.action, config.supplement ? sharedComposition.text : ""), replacements, true);
  const camera = perspectiveMode === "static" ? { text: "medium shot, eye level, straight-on, deep focus", structured: true } : perspectiveMode === "creative" && cleanString2(creativeConcept?.camera) ? { text: cleanString2(creativeConcept?.camera), structured: false } : assembleStructuredCamera(shot.camera);
  const environment = scene.environment || {};
  const location = structuredSnippets(environment.location, 1);
  const timeWeather = structuredSnippets(environment.timeWeather, 1);
  const lightingMood = config.supplement ? structuredSnippets(environment.lightingMood, 3) : [];
  const backgroundElements = config.supplement || perspectiveMode === "static" ? structuredSnippets(environment.backgroundElements, 5) : [];
  const legacyPlace = location.length === 0 ? stripOrReplaceNames(cleanString2(scene.place), replacements, true) : "";
  const environmentSection = [
    ...location.map((value) => stripOrReplaceNames(value, replacements, false)),
    legacyPlace,
    ...timeWeather.map((value) => stripOrReplaceNames(value, replacements, false)),
    ...lightingMood.map((value) => stripOrReplaceNames(value, replacements, false)),
    ...backgroundElements.map((value) => stripOrReplaceNames(value, replacements, false))
  ].filter(Boolean).join(", ");
  return { sections: [
    stripOrReplaceNames(bindingCreative ? identitySafeCreativeSituation(shot.situation) : unique(csvParts(shot.situation)).join(", "), replacements, true),
    perspectiveMode === "creative" && characters.length === 0 ? conceptScope : "",
    ...characterSections,
    config.supplement && perspectiveMode !== "static" && !bindingCreative ? sharedComposition.text : "",
    perspectiveMode === "static" || bindingCreative ? "" : sharedAction,
    bindingCreative ? "" : environmentSection,
    stripOrReplaceNames(camera.text, replacements, true)
  ].map((section) => section.trim()).filter(Boolean) };
}
function assembleDefaultPrompt(scene, shot, config, replacements, perspectiveMode, creativeConcept) {
  const allCharacters = cleanArray(shot.characters).slice(0, config.maxCharacters);
  const bindingCreative = perspectiveMode === "creative" && Boolean(creativeConcept);
  const characters = bindingCreative ? allCharacters.slice(0, 1) : allCharacters;
  const selectedScope = perspectiveMode === "creative" ? sanitizeComposition(cleanString2(creativeConcept?.renderScope), replacements) : "";
  const creativeScopes = perspectiveMode === "creative" ? selectedScope ? [selectedScope] : unique(characters.map((character) => sanitizeComposition(cleanString2(character.renderScope), replacements)).filter(Boolean)) : [];
  const characterBlocks = characters.map((character, index) => {
    const conceptTags = perspectiveMode === "creative" && index === 0 ? stripOrReplaceNames(unique(csvParts(creativeConcept?.visibleCues)).join(", "), replacements, true) : "";
    return conceptTags || assembleCharacterBlock(character, config, replacements, true, perspectiveMode);
  }).filter(Boolean);
  const supplement = config.supplement && !(perspectiveMode === "creative" && creativeScopes.length > 0) ? normalizeSupplement(stripOrReplaceNames(cleanString2(shot.supplement), replacements, false)) : "";
  const tagSections = dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(perspectiveMode === "creative" && cleanString2(creativeConcept?.camera) ? creativeConcept?.camera : shot.camera, bindingCreative ? identitySafeCreativeSituation(shot.situation) : shot.situation, perspectiveMode === "creative" && creativeScopes.length > 0 ? "" : shot.action)).join(", "), replacements, true),
    bindingCreative ? "" : stripOrReplaceNames(unique(csvParts(scene.place)).join(", "), replacements, true),
    ...creativeScopes,
    ...characterBlocks
  ]);
  return { sections: [...tagSections, supplement].filter(Boolean), format: "legacy" };
}
function assemblePrompt(scene, shot, config, parserParagraph, originalParagraph, creativeConcept) {
  const characters = cleanArray(shot.characters);
  const replacements = buildNameReplacementMap(characters);
  const perspective = resolveShotPerspective(shot, config);
  const core = config.promptStyle === "anima" ? assembleAnimaPrompt(scene, shot, config, replacements, perspective.mode, creativeConcept) : assembleDefaultPrompt(scene, shot, config, replacements, perspective.mode, creativeConcept);
  const preset = activePromptPreset(config);
  const presetPrefix = stripOrReplaceNames(preset?.positivePrefix || "", replacements, true);
  const prefix = stripOrReplaceNames(config.customPositivePrefix, replacements, true);
  const suffix = stripOrReplaceNames(config.customPositiveSuffix, replacements, true);
  const prefixes = [presetPrefix, prefix].filter(Boolean);
  const format = core.format || "ordered";
  const corePrompt = { sections: [...core.sections], format };
  const shotNegative = stripOrReplaceNames(unique(csvParts(shot.negative)).join(", "), replacements, true);
  return {
    prompt: {
      sections: [...prefixes, ...core.sections, suffix].map((section) => section.trim()).filter(Boolean),
      format
    },
    corePrompt,
    shotNegative,
    negative: format === "ordered" ? normalizePromptSection(stripOrReplaceNames(unique(csvParts(preset?.negativePrefix, config.customNegative, shotNegative)).join(", "), replacements, true)) : stripOrReplaceNames(unique(csvParts(preset?.negativePrefix, config.customNegative, shotNegative)).join(", "), replacements, true),
    paragraph: originalParagraph,
    parserParagraph,
    perspectiveMode: perspective.mode,
    perspectiveSource: perspective.source,
    creativeConcept: perspective.mode === "creative" ? creativeConcept : undefined
  };
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

// src/backend/creative.ts
function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0;index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function parseJsonObject(value) {
  const clean = value.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const candidates = [clean];
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start)
    candidates.push(clean.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed;
    } catch {}
  }
  return null;
}
function cleanCueList(value) {
  if (!Array.isArray(value))
    return [];
  return [...new Set(value.map(cleanString2).filter(Boolean))].slice(0, 6);
}
var CREATIVE_SUBJECT_TYPES = new Set([
  "object",
  "environment",
  "shadow",
  "silhouette",
  "reflection",
  "fragment",
  "spatial"
]);
var IDENTITY_BEARING_CUE = /\b(?:face|facial|cheek|chin|jaw|mouth|lip|lips|eye|eyes|iris|pupil|pupils|eyebrow|eyebrows|eyelash|eyelashes|hair|hairstyle|bangs|braid|ponytail|blonde|brunette|uniform|outfit|clothing|clothes|costume|dress|shirt|blouse|sweater|hoodie|coat|jacket|sleeve|collar|ribbon|tie|skirt|shorts|pants|trousers|stockings|pantyhose|sock|socks|shoe|shoes|boot|boots)\b/i;
function isIdentitySafeCreativeConcept(concept) {
  if (!concept.subjectType || !CREATIVE_SUBJECT_TYPES.has(concept.subjectType))
    return false;
  return !IDENTITY_BEARING_CUE.test([
    concept.anchor,
    concept.concept,
    concept.renderScope,
    concept.camera,
    ...concept.visibleCues
  ].join(" "));
}
function parseCreativeConcepts(value, paragraphs, config) {
  const parsed = parseJsonObject(value);
  const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  const validParagraphs = new Set(paragraphs.map((paragraph) => paragraph.parserIndex));
  const perParagraph = new Map;
  const seenIds = new Set;
  const concepts = [];
  for (const raw of rawCandidates) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      continue;
    const candidate = raw;
    const paragraph = Number(String(candidate.paragraph ?? "").match(/\d+/)?.[0]);
    const subjectType = cleanString2(candidate.subjectType).toLowerCase();
    const anchor = cleanString2(candidate.anchor);
    const concept = cleanString2(candidate.concept);
    const renderScope = cleanString2(candidate.renderScope);
    const camera = cleanString2(candidate.camera);
    const visibleCues = cleanCueList(candidate.visibleCues);
    const scoreValue = Number(candidate.score);
    if (!validParagraphs.has(paragraph) || !subjectType || !CREATIVE_SUBJECT_TYPES.has(subjectType) || !anchor || !concept || !renderScope || !camera || visibleCues.length === 0)
      continue;
    if (!Number.isFinite(scoreValue))
      continue;
    const score = Math.max(0, Math.min(100, Math.round(scoreValue)));
    const id = `creative-${stableHash([paragraph, subjectType, anchor, concept, renderScope, camera].join("|"))}`;
    const parsedConcept = {
      id,
      paragraph,
      subjectType,
      anchor,
      concept,
      renderScope,
      camera,
      visibleCues,
      score
    };
    if (!isIdentitySafeCreativeConcept(parsedConcept))
      continue;
    if (seenIds.has(id))
      continue;
    const count = perParagraph.get(paragraph) || 0;
    if (count >= 4)
      continue;
    seenIds.add(id);
    perParagraph.set(paragraph, count + 1);
    concepts.push(parsedConcept);
  }
  const finalCounts = new Map;
  const paragraphScores = new Map;
  concepts.forEach((concept) => finalCounts.set(concept.paragraph, (finalCounts.get(concept.paragraph) || 0) + 1));
  concepts.forEach((concept) => paragraphScores.set(concept.paragraph, Math.max(paragraphScores.get(concept.paragraph) || 0, concept.score)));
  const eligibleParagraphs = [...new Set(concepts.map((concept) => concept.paragraph))].filter((paragraph) => (finalCounts.get(paragraph) || 0) >= 2).sort((left, right) => (paragraphScores.get(right) || 0) - (paragraphScores.get(left) || 0) || left - right).slice(0, Math.max(1, config.maxImages));
  const allowed = new Set(eligibleParagraphs);
  return concepts.filter((concept) => allowed.has(concept.paragraph));
}
function hasUnusedCreativeConcepts(candidates, usedIds) {
  const used = new Set(usedIds);
  return candidates.some((candidate) => isIdentitySafeCreativeConcept(candidate) && !used.has(candidate.id));
}
function chooseCreativeConcepts(candidates, usedIds = [], random = Math.random) {
  const used = new Set(usedIds);
  const grouped = new Map;
  for (const candidate of candidates) {
    if (!isIdentitySafeCreativeConcept(candidate) || used.has(candidate.id))
      continue;
    const group = grouped.get(candidate.paragraph) || [];
    group.push(candidate);
    grouped.set(candidate.paragraph, group);
  }
  const selected = new Map;
  for (const [paragraph, group] of grouped) {
    const sorted = [...group].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    const bestScore = sorted[0]?.score ?? 0;
    const shortlist = sorted.filter((candidate) => candidate.score >= Math.max(50, bestScore - 20)).slice(0, 3);
    const pool = shortlist.length > 0 ? shortlist : sorted.slice(0, 1);
    if (pool.length === 0)
      continue;
    const floor = Math.min(...pool.map((candidate) => candidate.score)) - 5;
    const weights = pool.map((candidate) => Math.max(1, candidate.score - floor));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = Math.min(0.999999, Math.max(0, random())) * total;
    let choice = pool[pool.length - 1];
    for (let index = 0;index < pool.length; index += 1) {
      cursor -= weights[index];
      if (cursor < 0) {
        choice = pool[index];
        break;
      }
    }
    selected.set(paragraph, choice);
  }
  return selected;
}
function creativeIdeationInstruction(config, previousConcepts = []) {
  return [
    "# Creative Illustration Concept Ideator",
    "Extract literal visual cues from the numbered source and propose genuinely different Creative compositions before the prompt parser runs.",
    config.adaptiveMode ? `Screen up to ${Math.max(1, config.maxImages)} paragraph numbers for optional identity-safe Creative alternatives, then generate exactly four candidates for each. These candidates must not decide or bias the later Adaptive mode choice.` : `Choose up to ${Math.max(1, config.maxImages)} visually strong paragraph numbers and generate exactly four candidates for each chosen paragraph.`,
    "Candidates for the same paragraph must differ in focal anchor and at least one of crop scale, subject inclusion, depth, occlusion, or viewpoint.",
    "Creative must not focus on recognizable identity-bearing character features. Never use a face, facial feature, hair, hairstyle, or recognizable clothing as the anchor or a visible cue.",
    "Allowed subjectType values are object, environment, shadow, silhouette, reflection, fragment, or spatial. Reflections and fragments must remain non-identifying; generic hands, fingers, feet, gestures, and fully unreadable silhouettes are allowed.",
    "Prefer overlooked but meaningful anchors: a source-supported object, environmental detail, shadow, unreadable silhouette, non-identifying fragment, foreground layer, aftermath, or unusual spatial relationship.",
    "If a paragraph has no faithful identity-safe anchor, return no Creative candidate for it. Do not weaken this rule merely to fill the requested count.",
    "Do not merely restate the paragraph's complete main action.",
    "Separate literal cues from metaphors and internal narration. Never render a simile literally and never invent an object, body part, action, or setting detail.",
    "renderScope is binding: state exactly what is inside the frame and what is cropped or occluded. visibleCues contains only traits and elements actually visible inside that scope.",
    "Score each candidate from 0-100 for source fidelity, focal specificity, visual clarity, ANIMA promptability, and difference from an obvious Dynamic full-action shot.",
    previousConcepts.length > 0 ? `Avoid repeating these previously used concepts:
- ${previousConcepts.map(cleanString2).filter(Boolean).join(`
- `)}` : "",
    "Return raw JSON only with this exact shape:",
    '{"candidates":[{"paragraph":1,"subjectType":"object","anchor":"short anchor label","concept":"concise visible composition","renderScope":"exact contents of frame and crop","camera":"concise framing and viewpoint","visibleCues":["visible cue"],"score":85}]}',
    "No markdown, commentary, character-memory dump, or fields outside the schema."
  ].filter(Boolean).join(`

`);
}
function creativeIdeationRequest(targetSource) {
  return [
    "Generate the Creative concept slate from this current numbered source:",
    targetSource
  ].join(`

`);
}
function creativeConceptConstraint(concepts, adaptive) {
  if (concepts.size === 0)
    return "";
  const lines = [...concepts.values()].sort((left, right) => left.paragraph - right.paragraph).map((concept) => [
    `[P${concept.paragraph}] concept ID: ${concept.id}`,
    `Anchor: ${concept.anchor}`,
    `Binding render scope: ${concept.renderScope}`,
    `Camera intent: ${concept.camera}`,
    `Visible cues only: ${concept.visibleCues.join(", ")}`,
    `Creative suitability: ${concept.score}/100`
  ].join(`
`));
  return [
    adaptive ? "## Optional Creative Candidates" : "## Selected Creative Concepts",
    adaptive ? "First choose perspectiveMode independently from the paragraph itself. Creative is permitted only for paragraphs listed below, and the listed candidate becomes binding only after Creative is chosen. Otherwise ignore it and choose Static or Dynamic normally. Do not choose Creative merely because a candidate or score is present." : "Use only the listed paragraphs for Creative shots. Each listed concept is binding and must control renderScope, visibleTags, camera, and subject inclusion.",
    "Creative may show only identity-safe objects, environments, shadows, unreadable silhouettes, spatial details, or non-identifying fragments. It must not show a recognizable face, hair, or outfit.",
    "When a binding render scope exists, do not expand it with the character's complete pose, full action, off-frame attire, or unrelated memory traits.",
    ...lines
  ].join(`

`);
}
function rebaseCreativeConcepts(candidates, paragraph) {
  return candidates.map((candidate) => ({ ...candidate, paragraph }));
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
function freshSeed(previous) {
  const prior = new Set(previous.map(numberParam).filter((value) => value !== undefined));
  let seed = Math.floor(Math.random() * 2147483647);
  while (prior.has(seed))
    seed = (seed + 1) % 2147483647;
  return seed;
}
function rerollImageParameters(parameters, connection, prompt, negative) {
  const cloned = JSON.parse(JSON.stringify(parameters));
  const workflow = cloned.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    cloned.seed = freshSeed([cloned.seed]);
    return cloned;
  }
  const comfy = readComfyConfig(connection?.metadata);
  const mappings = comfy?.field_mappings || [];
  const seedMappings = mappings.filter((mapping) => mapping.mappedAs === "seed");
  const priorSeeds = [cloned.seed];
  for (const mapping of seedMappings) {
    const node = workflow[mapping.nodeId];
    priorSeeds.push(node?.inputs?.[mapping.fieldName]);
  }
  if (seedMappings.length === 0) {
    for (const node of Object.values(workflow)) {
      if (!node?.inputs || typeof node.inputs !== "object")
        continue;
      for (const [key, value] of Object.entries(node.inputs)) {
        if (/^(?:seed|noise_seed)$/i.test(key))
          priorSeeds.push(value);
      }
    }
  }
  const seed = freshSeed(priorSeeds);
  cloned.seed = seed;
  for (const mapping of mappings) {
    const value = mapping.mappedAs === "positive_prompt" ? prompt : mapping.mappedAs === "negative_prompt" ? negative : undefined;
    if (value === undefined)
      continue;
    const node = workflow[mapping.nodeId];
    if (node?.inputs && typeof node.inputs === "object")
      node.inputs[mapping.fieldName] = value;
  }
  if (seedMappings.length > 0) {
    for (const mapping of seedMappings) {
      const node = workflow[mapping.nodeId];
      if (node?.inputs && typeof node.inputs === "object")
        node.inputs[mapping.fieldName] = seed;
    }
    return cloned;
  }
  for (const node of Object.values(workflow)) {
    if (!node?.inputs || typeof node.inputs !== "object")
      continue;
    for (const key of Object.keys(node.inputs)) {
      if (/^(?:seed|noise_seed)$/i.test(key))
        node.inputs[key] = seed;
    }
  }
  return cloned;
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
      serialRequest = request.then(() => {
        return;
      }, () => {
        return;
      });
  }
  const settled = await Promise.allSettled(requests);
  const successfulJobs = [];
  const successfulResults = [];
  for (const [index, result] of settled.entries()) {
    if (result.status !== "fulfilled")
      continue;
    successfulJobs.push(jobs[index]);
    successfulResults.push(result.value);
  }
  if (successfulResults.length === 0) {
    if (hasPreparationFailure)
      throw preparationFailure;
    const failure = settled.find((result) => result.status === "rejected");
    if (failure?.status === "rejected")
      throw failure.reason;
  }
  return {
    jobs: successfulJobs,
    results: successfulResults
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
function recoverSceneParagraphs(payload, fallbackParagraph) {
  const scenes = cleanArray(payload.scenes).map((rawScene) => {
    const sceneParagraph = parseParagraphNumber(rawScene.paragraph) || fallbackParagraph;
    const shots = cleanArray(rawScene.shots);
    if (shots.length > 0) {
      return {
        ...rawScene,
        shots: shots.map((shot) => parseParagraphNumber(shot.paragraph) || !sceneParagraph ? shot : { ...shot, paragraph: sceneParagraph })
      };
    }
    return parseParagraphNumber(rawScene.paragraph) || !sceneParagraph ? rawScene : { ...rawScene, paragraph: sceneParagraph };
  });
  return { ...payload, scenes };
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
  const normalize = (candidate) => {
    if (typeof candidate === "string")
      return candidate.replace(/\s+/g, " ").trim().toLowerCase();
    if (Array.isArray(candidate))
      return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(Object.entries(candidate).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, normalize(child)]));
    }
    return candidate ?? "";
  };
  const normalized = normalize(value);
  return typeof normalized === "string" ? normalized : JSON.stringify(normalized);
}
function exactVisualKey(entry) {
  const environment = entry.scene.environment || {};
  return JSON.stringify({
    paragraph: entry.parserParagraph,
    perspectiveMode: normalizedVisualValue(entry.shot.perspectiveMode),
    camera: normalizedVisualValue(entry.shot.camera),
    situation: normalizedVisualValue(entry.shot.situation),
    sceneAction: normalizedVisualValue(entry.scene.action),
    shotAction: normalizedVisualValue(entry.shot.action),
    characters: cleanArray(entry.shot.characters).map((character) => ({
      expression: normalizedVisualValue(character.expression),
      action: normalizedVisualValue(character.action),
      composition: normalizedVisualValue(character.composition),
      renderScope: normalizedVisualValue(character.renderScope),
      visibleTags: normalizedVisualValue(character.visibleTags)
    })),
    sharedComposition: normalizedVisualValue(entry.shot.sharedComposition || entry.shot.supplement),
    environment: {
      location: normalizedVisualValue(environment.location),
      timeWeather: normalizedVisualValue(environment.timeWeather),
      lightingMood: cleanArray(environment.lightingMood).map(normalizedVisualValue),
      backgroundElements: cleanArray(environment.backgroundElements).map(normalizedVisualValue)
    }
  });
}
function selectPromptEntries(payload, paragraphs, config, creativeConcepts = new Map, creativeCandidates = []) {
  const normalized = normalizeScenePayload(payload);
  const paragraphMap = new Map(paragraphs.map((paragraph) => [paragraph.parserIndex, paragraph]));
  const valid = normalized.filter((entry) => paragraphMap.has(entry.parserParagraph));
  const seenVisuals = new Set;
  const distinct = valid.filter((entry) => {
    const key = exactVisualKey(entry);
    if (seenVisuals.has(key))
      return false;
    seenVisuals.add(key);
    return true;
  });
  const seenParagraphs = new Set;
  const uniqueParagraphs = distinct.filter((entry) => {
    const sourceParagraph = paragraphMap.get(entry.parserParagraph)?.originalIndex ?? entry.parserParagraph;
    if (seenParagraphs.has(sourceParagraph))
      return false;
    seenParagraphs.add(sourceParagraph);
    return true;
  });
  const limit = config.maxImages;
  const selected = uniqueParagraphs.slice(0, limit).map((entry, modelPriority) => ({ entry, modelPriority })).sort((left, right) => left.entry.parserParagraph - right.entry.parserParagraph || left.modelPriority - right.modelPriority).map(({ entry }) => entry);
  const maxAdaptiveCreative = selected.length > 1 ? Math.ceil(selected.length / 2) : 1;
  const safeCreativeConcepts = new Map([...creativeConcepts].filter(([, concept]) => isIdentitySafeCreativeConcept(concept)));
  const adaptiveCreativeAllowed = new Set(config.adaptiveMode ? selected.filter((entry) => cleanString2(entry.shot.perspectiveMode).toLowerCase() === "creative" && safeCreativeConcepts.has(entry.parserParagraph)).sort((left, right) => (safeCreativeConcepts.get(right.parserParagraph)?.score || 0) - (safeCreativeConcepts.get(left.parserParagraph)?.score || 0)).slice(0, maxAdaptiveCreative) : []);
  const prompts = [];
  for (const entry of selected) {
    const paragraph = paragraphMap.get(entry.parserParagraph);
    if (!paragraph)
      continue;
    const concept = safeCreativeConcepts.get(entry.parserParagraph);
    const requestedPerspective = cleanString2(entry.shot.perspectiveMode).toLowerCase();
    const shot = config.adaptiveMode && requestedPerspective === "creative" && (!concept || !adaptiveCreativeAllowed.has(entry)) ? { ...entry.shot, perspectiveMode: "dynamic" } : entry.shot;
    const prompt = assemblePrompt(entry.scene, shot, config, entry.parserParagraph, paragraph.originalIndex, concept);
    prompt.creativeCandidates = creativeCandidates.filter((candidate) => candidate.paragraph === entry.parserParagraph);
    if (renderPrompt(prompt.prompt, config.promptSyntax))
      prompts.push(prompt);
  }
  logStage(config, "illustration_candidates_selected", {
    candidateCount: normalized.length,
    validCandidateCount: valid.length,
    distinctCandidateCount: distinct.length,
    uniqueParagraphCandidateCount: uniqueParagraphs.length,
    selectedCount: prompts.length,
    selectedParagraphs: selected.map((entry) => entry.parserParagraph),
    perspectives: prompts.map((entry) => ({ mode: entry.perspectiveMode, source: entry.perspectiveSource })),
    cameraTags: selected.map((entry) => normalizedVisualValue(entry.shot.camera))
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
  const maxCharacters = config.maxCharacters;
  const structuredAnima = config.promptStyle === "anima";
  const fixedStatic = !config.adaptiveMode && config.perspectiveMode === "static";
  const staticBackgroundPossible = fixedStatic || config.adaptiveMode;
  const shotInstruction = [
    `Generate ${config.minImages}-${config.maxImages} shots total when possible.`,
    "Choose the most visually consequential changes, actions, interactions, or emotional beats across the entire current source; do not favor earlier paragraphs merely because they appear first.",
    fixedStatic ? "Keep the visual-novel framing fixed across Static shots. Distinguish additional shots through source-supported changes in primary character, expression, simple pose, or background instead of dramatic cinematography." : "Each additional shot must differ from the other shots in at least two of these dimensions: (1) perspective or framing, (2) focal subject or visible action, and (3) composition, depth, or foreground occlusion.",
    fixedStatic ? "If the source contains too few distinct stable paragraphs, return fewer shots. Do not repeat a paragraph, invent narrative events, or switch to action-centric framing." : "If the source contains too few distinct visual paragraphs, return fewer shots. Do not repeat a paragraph or invent narrative events.",
    "Every shot must reference a different source paragraph. Never return two shots for the same paragraph. Order shots by their visual importance, not paragraph number.",
    structuredAnima ? "Preserve the source's explicit action, direction of movement, visible emotional state, and interpersonal tone. Never replace irritation, fear, conflict, or urgency with romance, serenity, or another inferred mood." : ""
  ].join(`
`);
  const perspectiveInstruction = [
    "### Perspective mode - required per shot",
    config.adaptiveMode ? "Choose perspectiveMode independently for every shot before filling any other shot field. It must be exactly creative, static, or dynamic." : `Set perspectiveMode to exactly ${config.perspectiveMode} for every shot.`,
    config.adaptiveMode ? "For batches with two or more shots, do not choose Creative for every shot. Include at least one Static or Dynamic shot, and choose each mode from the paragraph rather than from the availability of an optional concept." : "",
    "Creative isolates a meaningful identity-safe visual anchor from the paragraph instead of showing the complete scene. Use a source-supported object, environment, shadow, unreadable silhouette, foreground layer, aftermath, unusual spatial relationship, or non-identifying body fragment.",
    "Creative must not focus on a recognizable face, facial feature, hair, hairstyle, outfit, or clothing detail. If the paragraph has no faithful identity-safe anchor, use Static or Dynamic in Adaptive mode.",
    "Creative must remain concrete and source-supported. Use renderScope to state what is actually in frame. visibleTags must describe only the identity-safe anchor and must not contain character-memory traits.",
    "After Creative is chosen, its supplied Creative candidate is binding. Copy its render scope faithfully, use its camera intent, and do not broaden it back into a recognizable character or the complete paragraph action.",
    "Dynamic follows the current scene's visible action, movement, interaction, and strongest cinematic viewpoint.",
    "Static uses a visual-novel composition: a clearly readable scene background with one primary character slightly forward on a shallow foreground plane. Include additional characters only when the source cannot be represented faithfully without them; keep them on the same shallow plane.",
    "Static is fixed to a conventional medium shot at eye level, straight-on, with deep focus so the background remains readable. Do not use close-ups, wide shots, body-part crops, POV, high or low angles, dutch angles, dramatic lenses, motion blur, foreground occlusion, or action-centric framing.",
    "For Static character composition, use slightly forward from the background as the position, a concrete source-supported resting body arrangement as the pose, an empty actions array, and a source-supported gaze or an empty gaze.",
    "A Static pose must state the visible body arrangement directly, such as standing upright with arms relaxed at sides or seated upright with hands resting in lap. Never write abstract meta-phrases such as simple pose, stable pose, holding a pose, or posing. Do not depict a mid-action pose.",
    "Every scene containing a Static shot must provide a specific physical location and 2-3 concrete backgroundElements so the setting is visibly readable; generic labels such as indoor or outdoor are not sufficient locations.",
    "These Static framing and pose constraints override any batch-wide request for cinematography variation whenever perspectiveMode is static.",
    "perspectiveMode, renderScope, and visibleTags are shot-only rendering decisions. They never alter or replace the complete appearance, body, and attire memory fields."
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
  const schema = structuredAnima ? [
    "{",
    '  "scenes": [',
    "    {",
    '      "environment": {',
    '        "location": "string",',
    '        "timeWeather": "string",',
    '        "lightingMood": ["string"],',
    '        "backgroundElements": ["string"]',
    "      },",
    '      "shots": [',
    "        {",
    '          "paragraph": 0,',
    '          "perspectiveMode": "creative | static | dynamic",',
    '          "camera": {',
    '            "framing": "string",',
    '            "angle": "string",',
    '            "perspective": "string",',
    '            "focus": ["string"]',
    "          },",
    '          "situation": "string",',
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
    '              "renderScope": "string",',
    '              "visibleTags": "string",',
    '              "composition": {',
    '                "position": "string",',
    '                "pose": "string",',
    '                "actions": ["string"],',
    '                "gaze": "string"',
    "              }",
    "            }",
    "          ],",
    '          "sharedComposition": {',
    '            "interaction": ["string"],',
    '            "spatialRelation": "string"',
    "          },",
    '          "negative": "string"',
    "        }",
    "      ]",
    "    }",
    "  ]",
    "}"
  ] : [
    "{",
    '  "scenes": [',
    "    {",
    '      "place": "string",',
    '      "shots": [',
    "        {",
    '          "paragraph": 0,',
    '          "perspectiveMode": "creative | static | dynamic",',
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
    '              "renderScope": "string",',
    '              "visibleTags": "string",',
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
  ];
  const naturalDetail = structuredAnima ? [
    "### Atomic Natural Composition",
    "characters[].composition is always required and must use its four atomic fields. The renderer joins them once in this exact order: position, pose, actions, gaze.",
    "For Creative, still populate composition for structured memory and validation, but renderScope is authoritative and replaces composition in the rendered prompt when present.",
    "composition.position is one concise spatial phrase describing where the character is in frame.",
    "composition.pose is one concise phrase describing the character's static body pose.",
    "composition.actions contains 0-3 concise phrases covering every visible action and movement direction exactly once. Use present visual phrasing such as mid-turn toward the viewer, not mixed completed and ongoing tenses.",
    "composition.gaze is one concise gaze-direction phrase, or empty when no gaze is visible.",
    "Each atomic phrase must be independently visual, comma-free, free of semicolons and terminal punctuation, and must not repeat a fact from another composition field.",
    "Do not put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle, appearance, attire, or facial-expression adjectives in any composition field.",
    config.supplement ? "Use sharedComposition.interaction for shared contact or combined actions only, and spatialRelation for one spatial relationship phrase. Do not repeat individual character actions." : "Use sharedComposition.interaction only for source-required shared contact or combined actions, and leave spatialRelation empty. The renderer keeps interaction as a compact action fallback while omitting shared prose.",
    "Do not use any character or persona names in composition fields, including the name of an out-of-frame POV character. Say viewer, camera, left girl, right boy, foreground character, or background character.",
    "Use concise objective visual phrases, not narration, invisible emotion, smell, sound, or internal sensation.",
    "Environment target budget: exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements.",
    "Each environment snippet must be concise and contain no comma, semicolon, or terminal punctuation.",
    config.supplement ? "Populate lightingMood and backgroundElements within the target budget." : staticBackgroundPossible ? "Leave lightingMood empty. Populate 2-3 backgroundElements for every scene containing a Static shot, and leave backgroundElements empty for scenes without a Static shot. Still populate location and timeWeather." : "Leave lightingMood and backgroundElements empty. Still populate location and timeWeather."
  ].join(`
`) : config.supplement ? [
    "### Natural Language Supplement",
    "In supplement, describe the image in natural language for visible details that tags cannot express well, such as detailed composition, framing, character positions, interactions, unusual vantage points, or objective atmosphere/lighting.",
    "Use concise, minimal, telegraphic sentences. Be objective, not subjective interpretation.",
    "Separate supplement phrases with commas, never semicolons. Do not end supplement with sentence punctuation.",
    "Unusual framing and vantage points are welcome, such as viewed through an object, reflected in a mirror, or partially obscured by foreground elements.",
    "When describing multiple people, do not use names. Identify people by visual position such as left girl, right boy, foreground character, or background character.",
    "Do not use supplement for smell, sound, internal sensations, invisible emotions, or prose narration."
  ].join(`
`) : "Do not include supplement text.";
  return [
    "# Image Tagging System",
    "Tag the current message's paragraphs as Danbooru-style English image prompts. Output a single JSON object.",
    "## JSON Format",
    schema.join(`
`),
    structuredAnima ? "- negative is optional. All other fields and nested objects are required. Use empty strings or arrays inside the required objects when a field does not apply; never collapse an object into a string." : "- negative is optional. All other fields are required, though values may be empty strings when a field does not apply.",
    "- These are the ONLY allowed fields. Adding any unlisted field is a schema violation.",
    "## Scenes & Shots",
    "Scene = shots sharing one physical location.",
    "- Same location means same scene, multiple shots.",
    structuredAnima ? "- Location change means a new scene with its own environment." : "- Location change means a new scene with its own place.",
    fixedStatic ? "Shot = one distinct stable visual-novel moment: a readable background plus a foreground character, simple pose, and visible expression. Shots are independent, so repeat tags if the scene has not changed." : "Shot = one distinct visual moment: interaction, emotion, significant action, or clear framing change. Prefer closer framing over wide shots. Shots are independent, so repeat tags if the scene has not changed.",
    shotInstruction,
    "Paragraph mapping: current message uses [P#] numbering.",
    "- Each shot's paragraph must reference an existing [P#].",
    "- Never invent paragraph numbers outside the visible range.",
    "- Tag ONLY the current message. Recent context is for continuity only.",
    "## Tag Rules",
    "Use common, objective, visualizable Danbooru-style English tags. Do not invent tags; use simpler well-known equivalents if unsure. Do not use metaphors for tags.",
    structuredAnima ? "Tag fields are comma-separated tags. Atomic composition and sharedComposition values are concise comma-free natural-language phrases. Environment arrays contain one comma-free visual snippet per item." : "All fields are comma-separated tags except supplement, which is a short objective visual sentence.",
    `Character limit: max ${maxCharacters} character object(s) per shot. Do not add another character object beyond this limit; refer to an additional anonymous out-of-frame person only through visible composition when the source requires it. For every character object, keep the complete known baseline in appearance, body, and attire even when Creative shows only a partial crop. visibleTags is the separate visible-only rendering projection.`,
    "Repeat tags if the situation or scene has not changed. Shots are independent, so repeated tags across shots are expected for stable appearance, attire, location, and persistent actions.",
    "Continuity does not require repeating camera angle, framing, composition, depth, or occlusion. Vary those deliberately between shots while preserving narrative facts.",
    "Before returning the batch, compare all Dynamic camera objects as a camera ledger. Do not repeat the same framing + angle + perspective tuple across Dynamic shots unless the current numbered source explicitly establishes a continuous camera or POV. Sharing one camera value is allowed, and sharing angle + perspective is allowed when framing genuinely differs.",
    perspectiveInstruction,
    structuredAnima ? "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields include expression, composition, camera, situation, sharedComposition, environment, and negative." : "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields are expression, action, camera, situation, place, supplement, and negative.",
    "## Field Reference",
    structuredAnima ? "### environment - scene-level" : "### place - scene-level",
    structuredAnima ? "environment.location is one physical location phrase; timeWeather is one time/weather phrase; lightingMood targets 1-2 snippets; backgroundElements targets 1-3 prominent visual props or setting details. Static scenes require a specific physical location and 2-3 backgroundElements." : "Start with interior or exterior when location is known, then add location, mood, lighting, time, weather, and prominent props. Prominent props should be color + object. Define once per scene; all shots in the scene share identical place.",
    structuredAnima ? "Do not include character names, actions, expressions, clothing, body traits, or camera framing in environment. Use only source-supported visual atmosphere; never infer romance, calm, menace, or another emotional tone from lighting alone." : "Do not include character names, actions, expressions, clothing, body traits, or camera framing in place.",
    "### camera - shot-level",
    structuredAnima ? "camera.framing must be empty or exactly one of: portrait, close-up, medium close-up, upper body, medium shot, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, body-part focus." : "Framing tags: portrait, upper body, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, close-up, body-part focus.",
    structuredAnima ? "camera.angle must be empty or exactly one of: eye level, low angle, high angle, dutch angle." : "Perspective tags: from above, from behind, from below, from side, high up, sideways, straight-on, upside-down, pov.",
    structuredAnima ? "camera.perspective must be empty or exactly one of: straight-on, from above, from behind, from below, from side, sideways, three-quarter view, pov." : "",
    structuredAnima ? "camera.focus may contain at most two values chosen only from: shallow depth of field, deep focus, background blur, foreground blur, motion blur, fisheye, wide-angle lens, telephoto lens." : "",
    structuredAnima ? "Do not add any other camera keys or camera values. Lighting, streetlamps, atmosphere, actions, expressions, appearance, clothing, subject counts, and place never belong in camera." : "Use camera only for perspective and framing. Do not include actions, expressions, appearance, clothing, subject counts, or place.",
    structuredAnima ? "Choose framing that can visibly contain the complete focal action unless Creative deliberately isolates a smaller visual anchor." : "",
    "### situation - shot-level",
    "Strictly use character count/composition tags such as 1girl, 2girls, 1boy, 1girl, 1boy, other, solo, group, and nsfw only when explicitly visual.",
    "The total number of people should match the visible characters being described/tagged.",
    "Do not include names, numeric ages, appearance, attire, expression, action, camera, or place.",
    "### label",
    "Use girl, boy, or other regardless of age. For out-of-frame partial characters, use label plus out of frame and visible part, such as boy, out of frame, hand.",
    "### name - required",
    "Character name from the narrative. If unnamed, use a consistent identifier such as girl A, boy B, shopkeeper, guard, or stranger. Never empty; this is used for cross-message appearance tracking.",
    structuredAnima ? "Do not put character names in label, age, appearance, body, attire, expression, action, composition, situation, camera, place, environment, sharedComposition, supplement, or negative." : "Do not put character names in label, age, appearance, body, attire, expression, action, situation, camera, place, supplement, or negative.",
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
    structuredAnima ? "Do not include names, attire, expression, pose, action, camera, place, supplement, blush, flushed cheeks, tears, sweat, or any other transient state in appearance." : "Do not include names, attire, expression, pose, action, camera, place, or supplement in appearance.",
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
    structuredAnima ? "Prefer the current source's explicit visible emotion over inferred genre mood. Convert irritation or anger into concrete visible tags such as annoyed, angry, furrowed brows, glaring, clenched teeth, or open mouth when supported." : "",
    "Do not include posture, gaze direction, clothing, body, action, camera, place, or names in expression.",
    structuredAnima ? "### Atomic action ownership" : "### action",
    structuredAnima ? "Do not output legacy shot.action or characters[].action fields. Put each individual action only in that character's composition.actions. Put shared contact or combined action only in sharedComposition.interaction." : "Use shot.action for global or relationship action that applies to the whole shot, such as two characters holding hands or one character guiding another.",
    structuredAnima ? "A fact must have exactly one owner. Never repeat an individual action in sharedComposition and never repeat shared contact in a character's composition." : "Use characters[].action for a single character's posture, gaze, pose, interactions, and visible actions. Use multiple tags if needed.",
    "Posture examples: standing, sitting on chair, on back, kneeling, spread legs, all fours, squatting, on stomach, on side.",
    "Gaze examples: looking at viewer, looking away, looking at another.",
    "Interaction examples: arm hug, leaning, heads together, carrying, piggyback, holding hands.",
    structuredAnima ? "Do not duplicate camera, environment, situation counts, appearance, body, attire, or expression in composition actions." : "Do not duplicate camera, place, situation counts, appearance, body, attire, or expression. Do not put the same action in multiple fields.",
    "### negative - optional",
    "Only if the client explicitly specifies negative prompt tags. Never infer negative tags.",
    naturalDetail,
    "## Repetition is Consistency",
    "- If a detail appears in one shot and persists, tag it in all subsequent shots.",
    "- If an action or attire is still in motion or still present, repeat it in later shots.",
    "- Preserve a continuous pov only when the narrative establishes an ongoing viewpoint. Otherwise choose the strongest perspective for each visual beat.",
    "- appearance + body + attire must be identical for the same character across all shots unless the current message explicitly changes their present visual state.",
    "## Data Priority",
    "1. Client comments or explicit user instructions in the current message override all instructions.",
    structuredAnima ? "2. Current message [P#] paragraphs are authoritative for scene content, action, visible emotion, interpersonal tone, and movement direction. Never soften, romanticize, or replace those facts with an inferred atmosphere. Never restore outdated clothing, props, location, or actions from context." : "2. Current message [P#] paragraphs are authoritative for scene content. Never restore outdated clothing, props, location, or actions from context.",
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
function parserUserRequest(targetSource, creativeConstraint = "") {
  return [
    "Create the requested image-prompt batch from the current numbered paragraph source below.",
    "Use only its narrative events. Return one raw JSON object with a top-level scenes array and no other text.",
    "## Current Numbered Paragraph Source",
    targetSource,
    creativeConstraint
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
  "composition",
  "sharedComposition",
  "environment",
  "location",
  "timeWeather",
  "lightingMood",
  "backgroundElements",
  "framing",
  "angle",
  "perspective",
  "focus",
  "position",
  "pose",
  "actions",
  "gaze",
  "interaction",
  "spatialRelation",
  "negative",
  "name",
  "scene",
  "positive",
  "quote",
  "supplement",
  "perspectiveMode",
  "renderScope",
  "visibleTags"
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
function staticShot(shot, config) {
  if (!config.adaptiveMode)
    return config.perspectiveMode === "static";
  return cleanString2(shot.perspectiveMode).toLowerCase() === "static";
}
var GENERIC_LOCATION_WORDS = new Set([
  "background",
  "inside",
  "interior",
  "indoor",
  "indoors",
  "outside",
  "exterior",
  "outdoor",
  "outdoors",
  "room"
]);
function isSpecificLocation(value) {
  const words = cleanString2(value).toLowerCase().match(/[a-z]+/g) || [];
  return words.some((word) => !GENERIC_LOCATION_WORDS.has(word));
}
function isConcreteStaticPose(value) {
  const pose = cleanString2(value);
  return Boolean(pose) && !/\bpos(?:e|es|ed|ing)\b/i.test(pose);
}
function staticPayloadIssues(payload, config) {
  if (config.promptStyle !== "anima")
    return [];
  const issues = [];
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  scenes.forEach((scene, sceneIndex) => {
    const shots = Array.isArray(scene.shots) ? scene.shots : [scene];
    const staticShots = shots.filter((shot) => staticShot(shot, config));
    if (staticShots.length === 0)
      return;
    const environment = asRecord(scene.environment);
    if (!isSpecificLocation(environment.location))
      issues.push(`scene ${sceneIndex + 1} needs a specific physical environment.location`);
    const backgroundElements = Array.isArray(environment.backgroundElements) ? environment.backgroundElements.map(cleanString2).filter(Boolean) : [];
    if (backgroundElements.length < 2 || backgroundElements.length > 3) {
      issues.push(`scene ${sceneIndex + 1} needs 2-3 concrete environment.backgroundElements`);
    }
    staticShots.forEach((shot, shotIndex) => {
      const characters = Array.isArray(shot.characters) ? shot.characters : [];
      if (characters.length === 0) {
        issues.push(`scene ${sceneIndex + 1} Static shot ${shotIndex + 1} needs a primary character`);
      }
      characters.forEach((character, characterIndex) => {
        const composition = asRecord(character.composition);
        if (!isConcreteStaticPose(composition.pose)) {
          issues.push(`scene ${sceneIndex + 1} Static shot ${shotIndex + 1} character ${characterIndex + 1} needs a concrete resting composition.pose`);
        }
        const actions = Array.isArray(composition.actions) ? composition.actions.map(cleanString2).filter(Boolean) : cleanString2(composition.actions) ? [cleanString2(composition.actions)] : [];
        if (actions.length > 0) {
          issues.push(`scene ${sceneIndex + 1} Static shot ${shotIndex + 1} character ${characterIndex + 1} must have an empty composition.actions array`);
        }
      });
    });
  });
  return issues;
}
function staticRepairInstruction(issues) {
  return [
    "Repair this valid JSON so every Static shot satisfies the listed semantic requirements. Return only valid JSON and preserve all source facts, character baselines, expressions, and scene meaning.",
    "For every Static character, composition.pose must directly describe one concrete source-supported resting body arrangement, composition.actions must be an empty array, and gaze may remain source-supported or empty.",
    "For every scene containing a Static shot, environment.location must name a specific physical setting rather than indoor/outdoor, and environment.backgroundElements must contain 2-3 concrete visible setting details.",
    "Do not use abstract pose language such as simple pose, stable pose, holding a pose, or posing.",
    `Problems to repair:
- ${issues.join(`
- `)}`
  ].join(`
`);
}
function currentParagraphReferences(messages) {
  const request = messages.find((message) => message.role === "user" && message.content.includes("## Current Numbered Paragraph Source"));
  if (!request)
    return [];
  const source = request.content.split("## Current Numbered Paragraph Source", 2)[1]?.split(/## (?:Selected Creative Concepts|Optional Creative Candidates)/i, 1)[0] || "";
  return [...new Set([...source.matchAll(/\[P(\d+)\]/gi)].map((match) => Number(match[1])).filter(Number.isFinite))];
}
function structuralPayloadIssues(payload, allowedParagraphs) {
  const normalized = normalizeScenePayload(payload);
  if (normalized.length === 0)
    return ["no scene contains a shot with a usable paragraph reference"];
  if (allowedParagraphs.length > 0 && !normalized.some((entry) => allowedParagraphs.includes(entry.parserParagraph))) {
    return [`no shot references an allowed paragraph (${allowedParagraphs.map((paragraph) => `P${paragraph}`).join(", ")})`];
  }
  return [];
}
function structuralRepairInstruction(issues, allowedParagraphs) {
  return [
    "Repair this JSON into the required scenes-and-shots structure. Return only valid JSON and preserve all existing scene, character, camera, and environment details.",
    "Every shot must contain a numeric paragraph field referencing one of the current numbered source paragraphs.",
    allowedParagraphs.length > 0 ? `Allowed paragraph references: ${allowedParagraphs.map((paragraph) => `P${paragraph}`).join(", ")}.` : "Do not invent paragraph references.",
    `Problems to repair:
- ${issues.join(`
- `)}`
  ].join(`
`);
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
async function generateCreativeConcepts(parserConnection, config, paragraphs, targetSource, context, previousConcepts = [], userId) {
  try {
    logStage(config, "creative_ideation_start", {
      paragraphCount: paragraphs.length,
      previousConceptCount: previousConcepts.length,
      adaptiveMode: config.adaptiveMode
    });
    const raw = await generateParserText(parserConnection, config, parserMessages(creativeIdeationInstruction(config, previousConcepts), continuityReference(context.preprocessingSystemContext ?? context.systemContext, context.recentContext), creativeIdeationRequest(targetSource), context.override), userId);
    const concepts = parseCreativeConcepts(raw, paragraphs, config);
    if (concepts.length === 0) {
      logStage(config, "creative_ideation_fallback", { reason: "invalid_or_empty_slate", outputLength: raw.length }, "warn");
      return [];
    }
    logStage(config, "creative_ideation_done", {
      candidateCount: concepts.length,
      paragraphCount: new Set(concepts.map((concept) => concept.paragraph)).size,
      scores: concepts.map((concept) => concept.score)
    });
    return concepts;
  } catch (error) {
    logStage(config, "creative_ideation_fallback", {
      reason: error instanceof Error ? error.message : String(error)
    }, "warn");
    return [];
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
  const perspectiveGuidance = config.adaptiveMode ? "Select varied candidates that give the main parser strong options for Creative, Static, or Dynamic treatment." : config.perspectiveMode === "creative" ? "Favor concrete but easily overlooked visual anchors: partial subjects, objects, reflections, silhouettes, foreground fragments, environmental details, or unusual spatial relationships." : config.perspectiveMode === "static" ? "Favor stable clearly readable beats with conventional framing, limited motion, and limited occlusion." : "Favor significant visible action, movement, interaction, and cinematic changes.";
  return [
    "# Illustration Visual-Beat Editor",
    "Select and summarize the strongest visual beats from the current numbered assistant paragraphs.",
    `Select between ${minimum} and ${maximum} unique paragraphs.`,
    "Choose paragraphs with the most significant visual changes, actions, interactions, location changes, or emotional beats across the whole source. Do not favor early paragraphs by default.",
    perspectiveGuidance,
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
  if (!config.preprocessingEnabled)
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
  if (!raw.trim())
    throw new Error("Parser returned an empty response.");
  const allowedParagraphs = currentParagraphReferences(messages);
  const fallbackParagraph = allowedParagraphs.length === 1 ? allowedParagraphs[0] : undefined;
  let repairSystem = "Repair malformed JSON. Return only valid JSON.";
  let repairInput = raw;
  try {
    logStage(config, "json_parse_start", { rawLength: raw.length, repair: false });
    const parsed = recoverSceneParagraphs(parseJson(raw), fallbackParagraph);
    const structuralIssues = structuralPayloadIssues(parsed, allowedParagraphs);
    if (structuralIssues.length > 0) {
      repairSystem = structuralRepairInstruction(structuralIssues, allowedParagraphs);
      throw new Error("Parser payload has no usable numbered shots.");
    }
    const issues = staticPayloadIssues(parsed, config);
    if (issues.length > 0) {
      repairSystem = staticRepairInstruction(issues);
      repairInput = JSON.stringify(parsed);
      throw new Error("Static payload is incomplete.");
    }
    logStage(config, "json_parse_done", { repair: false });
    return parsed;
  } catch {
    logStage(config, "json_parse_failed", { rawLength: raw.length, repairWillRun: true }, "warn");
    const repaired = await generateParserText(parserConnection, config, [
      { role: "system", content: repairSystem },
      { role: "user", content: repairInput }
    ], userId);
    if (!repaired.trim())
      throw new Error("Parser returned an empty repair response.");
    const parsed = recoverSceneParagraphs(parseJson(repaired), fallbackParagraph);
    const structuralIssues = structuralPayloadIssues(parsed, allowedParagraphs);
    if (structuralIssues.length > 0) {
      throw new Error(`Parser did not return usable numbered scenes: ${structuralIssues.join("; ")}`);
    }
    const remainingIssues = staticPayloadIssues(parsed, config);
    if (remainingIssues.length > 0) {
      throw new Error(`Parser did not return a complete Static scene: ${remainingIssues.join("; ")}`);
    }
    logStage(config, "json_parse_done", { repair: true });
    return parsed;
  }
}
async function repairDynamicCameraDiversity(parserConnection, config, payload, targetSource, userId) {
  const audit = auditDynamicCameraDiversity(payload, config);
  logStage(config, "camera_diversity_audit", audit);
  if (audit.exactCollisions.length === 0)
    return payload;
  try {
    const raw = await generateParserText(parserConnection, config, [
      { role: "system", content: cameraRepairInstruction(audit) },
      {
        role: "user",
        content: [
          "## Current Numbered Paragraph Source",
          targetSource,
          "## Valid Illustration JSON",
          JSON.stringify(payload)
        ].join(`

`)
      }
    ], userId);
    if (!raw.trim())
      throw new Error("empty camera repair response");
    const repaired = parseJson(raw);
    const merged = mergeDynamicCameraRepair(payload, repaired, config, audit);
    if (!merged)
      throw new Error("camera repair did not safely reduce exact collisions");
    const repairedAudit = auditDynamicCameraDiversity(merged, config);
    logStage(config, "camera_diversity_repaired", {
      before: audit.signatures,
      after: repairedAudit.signatures,
      remainingExactCollisions: repairedAudit.exactCollisions.length,
      pairRepetitions: repairedAudit.pairRepetitions
    });
    return merged;
  } catch (error) {
    logStage(config, "camera_diversity_repair_fallback", {
      reason: error instanceof Error ? error.message : String(error),
      preservedSignatures: audit.signatures
    }, "warn");
    return payload;
  }
}

// src/backend/rendering.ts
function imageUrlFromId(imageId) {
  return `/api/v1/image-gen/results/${encodeURIComponent(imageId)}`;
}
function htmlAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r\n?|\n/g, "&#10;");
}
function renderInlayBlock(url, prompt, negativePrompt, perspectiveMode, perspectiveSource, creativeConcept, imageId, chatId, messageId, swipeId, index, config) {
  const label = `Inlay ${index + 1}`;
  const width = clampInt2(config.inlayImageWidth, 120, 2400, DEFAULT_CONFIG.inlayImageWidth);
  const maxHeight = clampInt2(config.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh);
  const safePrompt = prompt.replace(/```/g, "'''");
  const safeNegative = negativePrompt.replace(/```/g, "'''");
  const modeAttribute = perspectiveMode ? ` data-inlay-illustrator-perspective="${htmlAttr(perspectiveMode)}"` : "";
  const sourceAttribute = perspectiveSource ? ` data-inlay-illustrator-perspective-source="${htmlAttr(perspectiveSource)}"` : "";
  const conceptAttribute = creativeConcept ? ` data-inlay-illustrator-concept="${htmlAttr(`${creativeConcept.anchor}: ${creativeConcept.concept}`)}"` : "";
  return `${MARKER}
<div class="inlay-illustrator-image" data-inlay-illustrator="true" style="display:flex;justify-content:center;align-items:center;margin:10px 0;width:100%;"><img src="${htmlAttr(url)}" alt="${htmlAttr(label)}" data-inlay-illustrator-prompt="${htmlAttr(safePrompt)}" data-inlay-illustrator-negative-prompt="${htmlAttr(safeNegative)}"${modeAttribute}${sourceAttribute}${conceptAttribute} data-inlay-illustrator-image-id="${htmlAttr(imageId)}" data-inlay-illustrator-chat-id="${htmlAttr(chatId)}" data-inlay-illustrator-message-id="${htmlAttr(messageId)}" data-inlay-illustrator-swipe-id="${swipeId}" data-inlay-illustrator-image-index="${index}" style="display:block;width:min(100%, ${width}px);max-height:${maxHeight}vh;height:auto;object-fit:contain;border-radius:8px;cursor:zoom-in;"/><pre class="inlay-illustrator-prompt" hidden>${htmlAttr(safePrompt)}</pre><pre class="inlay-illustrator-negative-prompt" hidden>${htmlAttr(safeNegative)}</pre></div>`;
}
function renderInlaidMessage(original, record, config) {
  const cleanOriginal = stripInlayContent(original);
  const blocks = new Map;
  const count = Math.max(1, paragraphCount(cleanOriginal));
  record.imageUrls.forEach((url, index) => {
    const paragraph2 = clampInt2(record.paragraphs[index], 1, count, Math.min(index + 1, count));
    const existing = blocks.get(paragraph2) || [];
    existing.push(renderInlayBlock(url, record.prompts[index] || "", record.negativePrompts?.[index] || "", record.perspectiveModes?.[index], record.perspectiveSources?.[index], record.creativeConcepts?.[index], record.imageIds?.[index] || "", record.chatId || "", record.messageId || "", record.swipeId || 0, index, config));
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
var configUpdateQueues = new Map;
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
  const queueKey = userId ?? "";
  const previous = configUpdateQueues.get(queueKey) || Promise.resolve();
  const operation = previous.then(async () => {
    const next = normalizeConfig({ ...await getConfig(userId), ...patch });
    await writeJson("config.json", next, userId);
    return next;
  });
  const tail = operation.then(() => {
    return;
  }, () => {
    return;
  });
  configUpdateQueues.set(queueKey, tail);
  try {
    return await operation;
  } finally {
    if (configUpdateQueues.get(queueKey) === tail)
      configUpdateQueues.delete(queueKey);
  }
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

// src/backend/runtime-lock.ts
var REGISTRY_KEY = Symbol.for("inlay-illustrator.runtime-locks");
var globalRegistry = globalThis;
function registry() {
  const existing = globalRegistry[REGISTRY_KEY];
  if (existing && typeof existing === "object" && existing.locks instanceof Set) {
    return existing;
  }
  const created = { locks: new Set };
  globalRegistry[REGISTRY_KEY] = created;
  return created;
}
function tryAcquireRuntimeLock(scope, key) {
  const lockKey = `${scope}:${key}`;
  const locks = registry().locks;
  if (locks.has(lockKey))
    return null;
  locks.add(lockKey);
  let released = false;
  return () => {
    if (released)
      return;
    released = true;
    locks.delete(lockKey);
  };
}

// src/backend/generation.ts
function generatedRecord(value) {
  if (!value || typeof value !== "object")
    return null;
  const candidate = value;
  return Array.isArray(candidate.prompts) && Array.isArray(candidate.paragraphs) && Array.isArray(candidate.imageUrls) && typeof candidate.messageId === "string" ? candidate : null;
}
function sameImageUrl(stored, requested) {
  if (!stored || !requested)
    return false;
  return stored === requested || requested.endsWith(stored) || stored.endsWith(requested);
}
function locateGeneratedImage(state, request) {
  for (const [key, value] of Object.entries(state.generated)) {
    const record = generatedRecord(value);
    if (!record || record.chatId !== request.chatId)
      continue;
    if (request.messageId && record.messageId !== request.messageId)
      continue;
    if (request.swipeId !== undefined && record.swipeId !== request.swipeId)
      continue;
    const explicitIndex = request.imageIndex;
    if (explicitIndex !== undefined && Number.isInteger(explicitIndex) && explicitIndex >= 0 && explicitIndex < record.imageUrls.length) {
      const idMatches = !request.imageId || record.imageIds?.[explicitIndex] === request.imageId;
      const urlMatches = !request.imageUrl || sameImageUrl(record.imageUrls[explicitIndex] || "", request.imageUrl);
      if (idMatches && urlMatches)
        return { key, record, index: explicitIndex };
    }
    const matchedIndex = record.imageUrls.findIndex((url, index) => request.imageId && record.imageIds?.[index] === request.imageId || request.imageUrl && sameImageUrl(url, request.imageUrl));
    if (matchedIndex >= 0)
      return { key, record, index: matchedIndex };
  }
  throw new Error("The selected image is not present in this chat's generated-image history.");
}
function replaceAt(values, index, value, fallback) {
  const next = [...values || []];
  while (next.length <= index)
    next.push(fallback);
  next[index] = value;
  return next;
}
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
  let conceptCandidates = [...input.creativeCandidates || []];
  let conceptSelections = null;
  let ideationAttempted = false;
  let creativeTargetSource = null;
  const usedConceptIds = new Set(input.usedCreativeConceptIds || []);
  const creativePipeline = config.perspectiveMode === "creative" || config.adaptiveMode;
  const lorebookSnapshot = await buildLorebookContextSnapshot(chatId, paragraphs.map((paragraph) => paragraph.text).join(`

`), config, userId);
  for (let attempt = 0;attempt <= config.parserRetries; attempt += 1) {
    try {
      const context = await buildParserContext(chatId, messages, targetIndex, state.characterAppearance, config, attempt, userId, lorebookSnapshot);
      if (creativePipeline && conceptSelections === null) {
        if (!hasUnusedCreativeConcepts(conceptCandidates, usedConceptIds) && !ideationAttempted) {
          const previousConcepts = conceptCandidates.filter((concept) => usedConceptIds.has(concept.id)).map((concept) => concept.concept);
          conceptCandidates = await generateCreativeConcepts(parserConnection, config, paragraphs, formatTargetParagraphs(paragraphs), context, previousConcepts, userId);
          ideationAttempted = true;
        }
        conceptSelections = chooseCreativeConcepts(conceptCandidates, usedConceptIds);
        if (conceptSelections.size === 0 && conceptCandidates.length > 0) {
          conceptSelections = chooseCreativeConcepts(conceptCandidates);
        }
      }
      if (creativePipeline && creativeTargetSource === null) {
        const candidateParagraphs = new Set(conceptCandidates.map((concept) => concept.paragraph));
        if (config.preprocessingEnabled && candidateParagraphs.size > 0) {
          creativeTargetSource = formatTargetParagraphs(paragraphs.filter((paragraph) => candidateParagraphs.has(paragraph.parserIndex)));
          logStage(config, "creative_preprocessing_done", {
            candidateCount: conceptCandidates.length,
            selectedParagraphs: [...candidateParagraphs].sort((left, right) => left - right)
          });
        } else {
          creativeTargetSource = await preprocessTargetParagraphs(parserConnection, config, paragraphs, context, userId);
        }
      }
      const targetSource = creativePipeline ? creativeTargetSource || formatTargetParagraphs(paragraphs) : await preprocessTargetParagraphs(parserConnection, config, paragraphs, context, userId);
      const instruction = parserInstruction(config);
      const referenceContext = continuityReference(context.systemContext, context.recentContext);
      const userRequest = parserUserRequest(targetSource, creativeConceptConstraint(conceptSelections || new Map, config.adaptiveMode));
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
        adaptiveMode: config.adaptiveMode,
        perspectiveMode: config.perspectiveMode,
        maxCharacters: config.maxCharacters,
        preprocessingEnabled: config.preprocessingEnabled,
        contextDiagnostics: context.diagnostics
      });
      parsed = await parsePayloadWithRepair(parserConnection, config, parserMessages(instruction, referenceContext, userRequest, context.override), userId);
      parsed = await repairDynamicCameraDiversity(parserConnection, config, parsed, targetSource, userId);
      selected = selectPromptEntries(parsed, paragraphs, config, conceptSelections || new Map, conceptCandidates);
      if (!config.adaptiveMode && config.perspectiveMode === "creative" && (conceptSelections?.size || 0) > 0) {
        selected = selected.filter((entry) => Boolean(entry.creativeConcept));
      }
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
    negativeLengths: selected.map((entry) => entry.negative.length),
    perspectives: selected.map((entry) => ({ mode: entry.perspectiveMode, source: entry.perspectiveSource }))
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
    const prompt = renderPrompt(entry.prompt, config.promptSyntax);
    const corePrompt = renderPrompt(entry.corePrompt, config.promptSyntax);
    const promptFormat = entry.corePrompt.format || "ordered";
    const parameters = await buildImageParameters(config, imageConnection, prompt, entry.negative || "");
    const job = {
      index,
      total: selected.length,
      prompt,
      negative: entry.negative || "",
      corePrompt,
      shotNegative: entry.shotNegative,
      promptFormat,
      paragraph: entry.paragraph,
      perspectiveMode: entry.perspectiveMode,
      perspectiveSource: entry.perspectiveSource,
      creativeConcept: entry.creativeConcept,
      creativeCandidates: entry.creativeCandidates,
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
  const negativePrompts = stage.jobs.map((job) => job.negative);
  const perspectiveModes = stage.jobs.map((job) => job.perspectiveMode || config.perspectiveMode);
  const perspectiveSources = stage.jobs.map((job) => job.perspectiveSource || "manual");
  const imageParameters = stage.jobs.map((job) => job.parameters);
  const corePrompts = stage.jobs.map((job) => job.corePrompt || "");
  const shotNegatives = stage.jobs.map((job) => job.shotNegative || "");
  const promptFormats = stage.jobs.map((job) => job.promptFormat || "ordered");
  const creativeConcepts = stage.jobs.map((job) => job.creativeConcept || null);
  const creativeConceptCandidates = stage.jobs.map((job) => job.creativeCandidates || []);
  const creativeConceptHistory = stage.jobs.map((job) => job.creativeConcept ? [job.creativeConcept.id] : []);
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
  return {
    prompts,
    negativePrompts,
    perspectiveModes,
    perspectiveSources,
    imageParameters,
    corePrompts,
    shotNegatives,
    promptFormats,
    creativeConcepts,
    creativeConceptCandidates,
    creativeConceptHistory,
    paragraphs,
    imageIds,
    imageUrls
  };
}
async function persistGeneration(input) {
  const { chatId, messageId, swipeId, key, target, parsed, assets, config, userId } = input;
  const record = {
    chatId,
    messageId,
    swipeId,
    prompts: assets.prompts,
    negativePrompts: assets.negativePrompts,
    perspectiveModes: assets.perspectiveModes,
    perspectiveSources: assets.perspectiveSources,
    imageParameters: assets.imageParameters,
    corePrompts: assets.corePrompts,
    shotNegatives: assets.shotNegatives,
    promptFormats: assets.promptFormats,
    creativeConcepts: assets.creativeConcepts,
    creativeConceptCandidates: assets.creativeConceptCandidates,
    creativeConceptHistory: assets.creativeConceptHistory,
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
async function commitImageReplacement(request, replacement, config, userId) {
  let committedKey = "";
  let committedIndex = -1;
  const state = await updateState(request.chatId, userId, (current) => {
    const located = locateGeneratedImage(current, request);
    committedKey = located.key;
    committedIndex = located.index;
    const record2 = located.record;
    current.generated[located.key] = {
      ...record2,
      prompts: replaceAt(record2.prompts, located.index, replacement.prompt, ""),
      negativePrompts: replaceAt(record2.negativePrompts, located.index, replacement.negative, ""),
      perspectiveModes: replaceAt(record2.perspectiveModes, located.index, replacement.perspectiveMode, "dynamic"),
      perspectiveSources: replaceAt(record2.perspectiveSources, located.index, replacement.perspectiveSource, "manual"),
      imageParameters: replaceAt(record2.imageParameters, located.index, replacement.parameters, {}),
      corePrompts: replaceAt(record2.corePrompts, located.index, replacement.corePrompt, ""),
      shotNegatives: replaceAt(record2.shotNegatives, located.index, replacement.shotNegative, ""),
      promptFormats: replaceAt(record2.promptFormats, located.index, replacement.promptFormat, "ordered"),
      creativeConcepts: replaceAt(record2.creativeConcepts, located.index, replacement.creativeConcept, null),
      creativeConceptCandidates: replaceAt(record2.creativeConceptCandidates, located.index, replacement.creativeCandidates, []),
      creativeConceptHistory: replaceAt(record2.creativeConceptHistory, located.index, replacement.creativeConceptHistory, []),
      paragraphs: replaceAt(record2.paragraphs, located.index, replacement.paragraph, 1),
      imageIds: replaceAt(record2.imageIds, located.index, replacement.imageId, ""),
      imageUrls: replaceAt(record2.imageUrls, located.index, replacement.imageUrl, "")
    };
  });
  const record = generatedRecord(state.generated[committedKey]);
  if (!record || committedIndex < 0)
    throw new Error("The replacement image could not be persisted.");
  const messages = await spindle.chat.getMessages(request.chatId);
  const target = messages.find((message) => message.id === record.messageId);
  if (!target)
    throw new Error("The source assistant message no longer exists.");
  await spindle.chat.updateMessage(request.chatId, record.messageId, {
    content: renderInlaidMessage(String(target.content || ""), record, config),
    metadata: {
      ...target.metadata || {},
      inlayIllustratorImageIds: record.imageIds,
      inlayIllustratorParagraphs: record.paragraphs,
      inlayIllustratorGeneratedAt: record.createdAt
    }
  });
  return { record, index: committedIndex };
}
async function rerunStoredImage(request, rerunSidecar, userId) {
  if (!request.chatId)
    throw new Error("Open the image's chat first.");
  const actionKey = JSON.stringify([
    userId ?? null,
    request.chatId,
    request.messageId ?? null,
    request.swipeId ?? null,
    request.imageIndex ?? null,
    request.imageId ?? request.imageUrl ?? null
  ]);
  const releaseAction = tryAcquireRuntimeLock("image-action", actionKey);
  if (!releaseAction)
    throw new Error("That image is already being regenerated.");
  try {
    const config = await getConfig(userId);
    const initialState = await getState(request.chatId, userId);
    const located = locateGeneratedImage(initialState, request);
    const imageConnection = await resolveImageConnection(config, userId);
    let replacement;
    if (!rerunSidecar) {
      const corePrompt = located.record.corePrompts?.[located.index] || "";
      const promptFormat = located.record.promptFormats?.[located.index] || (config.promptStyle === "default" ? "legacy" : "ordered");
      const prompt = corePrompt ? renderPromptWithCurrentAffixes(corePrompt, promptFormat, config) : located.record.prompts[located.index] || "";
      if (!prompt)
        throw new Error("The selected image has no stored prompt to reroll.");
      const shotNegative = located.record.shotNegatives?.[located.index] || "";
      const negative = renderNegativeWithCurrentSelection(shotNegative, promptFormat, config);
      const originalParameters = located.record.imageParameters?.[located.index] || await buildImageParameters(config, imageConnection, prompt, negative);
      const parameters = rerollImageParameters(originalParameters, imageConnection, prompt, negative);
      const result = await spindle.imageGen.generate({
        connection_id: config.imageConnectionId || undefined,
        prompt,
        negativePrompt: negative || undefined,
        model: config.imageModel || undefined,
        parameters,
        owner_chat_id: request.chatId,
        userId
      });
      const imageId = result.imageId || "";
      const imageUrl = result.imageUrl || (imageId ? imageUrlFromId(imageId) : "");
      if (!imageUrl)
        throw new Error("The image provider returned no replacement image.");
      replacement = {
        prompt,
        negative,
        corePrompt,
        shotNegative,
        promptFormat,
        paragraph: located.record.paragraphs[located.index] || 1,
        perspectiveMode: located.record.perspectiveModes?.[located.index] || "dynamic",
        perspectiveSource: located.record.perspectiveSources?.[located.index] || "manual",
        creativeConcept: located.record.creativeConcepts?.[located.index] || null,
        creativeCandidates: located.record.creativeConceptCandidates?.[located.index] || [],
        creativeConceptHistory: located.record.creativeConceptHistory?.[located.index] || [],
        parameters,
        imageId,
        imageUrl
      };
    } else {
      const messages = await spindle.chat.getMessages(request.chatId);
      const target = messages.find((message) => message.id === located.record.messageId);
      if (!target)
        throw new Error("The source assistant message no longer exists.");
      const originalParagraph = located.record.paragraphs[located.index] || 1;
      const sourceParagraph = prepareParagraphs(String(target.content || ""), config).find((paragraph) => paragraph.originalIndex === originalParagraph);
      if (!sourceParagraph)
        throw new Error("The source paragraph for this image no longer exists.");
      const singleConfig = { ...config, minImages: 1, maxImages: 1, preprocessingEnabled: false };
      const paragraphs = [{ ...sourceParagraph, parserIndex: 1 }];
      const storedCandidates = rebaseCreativeConcepts(located.record.creativeConceptCandidates?.[located.index] || [], 1);
      const previousConceptHistory = located.record.creativeConceptHistory?.[located.index] || [];
      const selection = await parseAndSelectPrompts({
        chatId: request.chatId,
        messageId: located.record.messageId,
        messages,
        paragraphs,
        state: initialState,
        config: singleConfig,
        creativeCandidates: storedCandidates,
        usedCreativeConceptIds: previousConceptHistory,
        userId
      });
      const entry = selection.selected[0];
      if (!entry)
        throw new Error("The sidecar returned no usable replacement prompt.");
      const stage = await prepareAndDispatchImages(request.chatId, [entry], singleConfig, userId);
      const job = stage.jobs[0];
      const result = stage.results[0];
      if (!job || !result)
        throw new Error("The replacement image was not generated.");
      const imageId = result.imageId || "";
      const imageUrl = result.imageUrl || (imageId ? imageUrlFromId(imageId) : "");
      if (!imageUrl)
        throw new Error("The image provider returned no replacement image.");
      await persistCharacterMemory(request.chatId, selection.parsed, singleConfig, userId);
      replacement = {
        prompt: job.prompt,
        negative: job.negative,
        corePrompt: job.corePrompt || renderPrompt(entry.corePrompt, singleConfig.promptSyntax),
        shotNegative: job.shotNegative || entry.shotNegative,
        promptFormat: job.promptFormat || entry.corePrompt.format || "ordered",
        paragraph: originalParagraph,
        perspectiveMode: entry.perspectiveMode,
        perspectiveSource: entry.perspectiveSource,
        creativeConcept: entry.creativeConcept || null,
        creativeCandidates: entry.creativeCandidates || storedCandidates,
        creativeConceptHistory: entry.creativeConcept ? [...new Set([...previousConceptHistory, entry.creativeConcept.id])] : previousConceptHistory,
        parameters: job.parameters,
        imageId,
        imageUrl
      };
    }
    const committed = await commitImageReplacement(request, replacement, config, userId);
    logStage(config, rerunSidecar ? "image_sidecar_rerun_done" : "image_reroll_done", {
      chatId: request.chatId,
      messageId: committed.record.messageId,
      imageIndex: committed.index,
      imageId: replacement.imageId || null
    });
    return committed;
  } finally {
    releaseAction();
  }
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
  const releaseGeneration = tryAcquireRuntimeLock("generation", runningKey);
  if (!releaseGeneration) {
    logStage(config, "request_skipped", { reason: "already_running", key });
    return;
  }
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
    releaseGeneration();
  }
}

// src/backend.ts
var __testables = {
  DEFAULT_CONFIG,
  activePromptPreset,
  assemblePrompt,
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
  rerollImageParameters,
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
      spindle.sendToFrontend({
        type: "config_updated",
        chatId: String(message.chatId || ""),
        config: next
      }, userId);
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
    } else if (message.type === "reroll_image" || message.type === "rerun_image_sidecar") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId)
        throw new Error("Open the image's chat first.");
      const numericIndex = Number(message.imageIndex);
      const numericSwipe = Number(message.swipeId);
      const request = {
        chatId,
        messageId: String(message.messageId || "") || undefined,
        swipeId: Number.isInteger(numericSwipe) ? numericSwipe : undefined,
        imageIndex: Number.isInteger(numericIndex) && numericIndex >= 0 ? numericIndex : undefined,
        imageId: String(message.imageId || "") || undefined,
        imageUrl: String(message.imageUrl || "") || undefined
      };
      const rerunSidecar = message.type === "rerun_image_sidecar";
      const actionLabel = rerunSidecar ? "Rerunning sidecar..." : "Rerolling image...";
      spindle.sendToFrontend({ type: "status", status: actionLabel }, userId);
      const result = await rerunStoredImage(request, rerunSidecar, userId);
      spindle.sendToFrontend({
        type: "inlay_image_action_result",
        requestId: String(message.requestId || ""),
        operation: rerunSidecar ? "sidecar" : "reroll",
        ok: true,
        chatId,
        messageId: result.record.messageId,
        imageIndex: result.index,
        imageUrl: result.record.imageUrls[result.index] || ""
      }, userId);
      spindle.sendToFrontend({ type: "status", status: rerunSidecar ? "Sidecar rerun complete" : "Image rerolled", record: result.record }, userId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStage(configForError || { debugLogging: true }, "frontend_message_error", { type: String(message.type || ""), error: errorMessage }, "error");
    spindle.log.error(errorMessage);
    if (message.type === "reroll_image" || message.type === "rerun_image_sidecar") {
      spindle.sendToFrontend({
        type: "inlay_image_action_result",
        requestId: String(message.requestId || ""),
        operation: message.type === "rerun_image_sidecar" ? "sidecar" : "reroll",
        ok: false,
        error: errorMessage
      }, userId);
    }
    spindle.sendToFrontend({ type: "status", status: "Error", error: errorMessage }, userId);
  }
});
spindle.log.info("Inlay Illustrator loaded.");
export {
  __testables
};
