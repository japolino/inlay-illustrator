var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// src/shared/config.ts
var DEFAULT_CONFIG = {
  enabled: true,
  autoGenerate: true,
  debugLogging: false,
  coverImageEnabled: false,
  adaptiveMode: false,
  fastMode: false,
  perspectiveMode: "dynamic",
  parserConnectionId: null,
  parserModel: "",
  parserParameters: {},
  parserMaxTokens: 0,
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
  coverImageWidth: 1200,
  coverImageMaxHeightVh: 80,
  promptStyle: "anima",
  promptSyntax: "comfyui",
  includeUserInfo: true,
  includeCharacterInfo: true,
  includeLorebook: false,
  characterTagContextEnabled: true,
  previousVisualStateEnabled: true,
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
    coverImageEnabled: raw.coverImageEnabled === true,
    adaptiveMode: raw.adaptiveMode === true,
    fastMode: raw.fastMode === true,
    perspectiveMode: raw.perspectiveMode === "creative" || raw.perspectiveMode === "static" || raw.perspectiveMode === "dynamic" || raw.perspectiveMode === "asset" ? raw.perspectiveMode : raw.mode === "asset" ? "asset" : "dynamic",
    parserConnectionId: cleanNullableString(raw.parserConnectionId) || cleanNullableString(imageGeneration.promptParserConnectionId),
    parserModel: cleanString(raw.parserModel) || cleanString(imageGeneration.promptParserModel),
    parserParameters: Object.keys(parserParameters).length > 0 ? parserParameters : cleanParameters(imageGeneration.promptParserParameters),
    parserMaxTokens: clampInt(raw.parserMaxTokens, 0, 32768, DEFAULT_CONFIG.parserMaxTokens),
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
    coverImageWidth: clampInt(raw.coverImageWidth, 120, 2400, DEFAULT_CONFIG.coverImageWidth),
    coverImageMaxHeightVh: clampInt(raw.coverImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.coverImageMaxHeightVh),
    promptStyle: raw.promptStyle === "default" ? "default" : "anima",
    promptSyntax: raw.promptSyntax === "nai" ? "nai" : "comfyui",
    includeUserInfo: raw.includeUserInfo !== false,
    includeCharacterInfo: raw.includeCharacterInfo !== false,
    includeLorebook: raw.includeLorebook === true,
    characterTagContextEnabled: raw.characterTagContextEnabled !== false,
    previousVisualStateEnabled: raw.previousVisualStateEnabled !== false,
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
function effectiveGenerationConfig(config) {
  if (!config.fastMode)
    return config;
  return {
    ...config,
    preprocessingEnabled: false,
    parserRetries: 0,
    includeLorebook: false
  };
}

// src/backend/avatar-image-bridge.ts
var pending = new Map;
var MAX_BASE64_LENGTH = 12000000;
function finish(requestId) {
  const entry = pending.get(requestId);
  if (!entry)
    return null;
  pending.delete(requestId);
  clearTimeout(entry.timer);
  if (entry.signal && entry.abort)
    entry.signal.removeEventListener("abort", entry.abort);
  return entry;
}
async function requestAvatarImage(imageId, chatId, userId, signal, timeoutMs = 8000) {
  const image = await spindle.images.get(imageId, { specificity: "lg", userId });
  if (!image?.url)
    throw new Error("Character avatar image is unavailable.");
  if (signal?.aborted)
    throw new DOMException("Avatar request aborted.", "AbortError");
  const requestId = crypto.randomUUID();
  const response = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const entry2 = finish(requestId);
      entry2?.reject(new Error("Timed out waiting for the character avatar."));
    }, timeoutMs);
    const entry = { resolve, reject, timer, signal };
    if (signal) {
      entry.abort = () => {
        const current = finish(requestId);
        current?.reject(new DOMException("Avatar request aborted.", "AbortError"));
      };
      signal.addEventListener("abort", entry.abort, { once: true });
    }
    pending.set(requestId, entry);
  });
  spindle.sendToFrontend({
    type: "avatar_image_request",
    chatId,
    requestId,
    imageUrl: image.url
  }, userId);
  return response;
}
function acceptAvatarImageResponse(message) {
  if (message.type !== "avatar_image_response")
    return false;
  const requestId = String(message.requestId || "");
  const entry = finish(requestId);
  if (!entry)
    return true;
  const error = String(message.error || "").trim();
  if (error) {
    entry.reject(new Error(error));
    return true;
  }
  const data = String(message.data || "").trim();
  const mimeType = String(message.mimeType || "").trim().toLowerCase();
  if (!data || data.length > MAX_BASE64_LENGTH || !/^image\/(?:png|jpe?g|webp|gif)$/.test(mimeType)) {
    entry.reject(new Error("The frontend returned an invalid avatar image."));
    return true;
  }
  entry.resolve({ data, mimeType });
  return true;
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
  if (!content.includes("inlay-illustrator") && !content.includes("inlay_illustrator"))
    return content;
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
var SAFE_FRAMING_ALTERNATIVES = [
  "close-up",
  "portrait",
  "medium close-up",
  "upper body",
  "medium shot",
  "cowboy shot",
  "full body",
  "wide shot"
];
function repairDynamicCameraDiversityLocally(payload, config, audit = auditDynamicCameraDiversity(payload, config)) {
  if (audit.exactCollisions.length === 0)
    return payload;
  const repaired = clonePayload(payload);
  const shots = orderedShots(repaired);
  const used = new Set(audit.signatures.map((entry) => entry.signature));
  for (const collision of audit.exactCollisions) {
    const entry = shots[collision.duplicateIndex];
    const camera = asRecord(entry?.shot.camera);
    const angle = cleanString2(camera.angle).toLowerCase();
    const perspective = cleanString2(camera.perspective).toLowerCase();
    if (!entry || !angle || !perspective)
      return null;
    const currentFraming = cleanString2(camera.framing).toLowerCase();
    const currentIndex = SAFE_FRAMING_ALTERNATIVES.indexOf(currentFraming);
    if (currentIndex < 0)
      return null;
    const candidates = [...SAFE_FRAMING_ALTERNATIVES].sort((left, right) => {
      const leftDistance = Math.abs(SAFE_FRAMING_ALTERNATIVES.indexOf(left) - currentIndex);
      const rightDistance = Math.abs(SAFE_FRAMING_ALTERNATIVES.indexOf(right) - currentIndex);
      return leftDistance - rightDistance;
    });
    const framing = candidates.find((candidate) => candidate !== currentFraming && !used.has(`${candidate} | ${angle} | ${perspective}`));
    if (!framing)
      return null;
    const replacement = { ...camera, framing };
    if (!validCamera(replacement))
      return null;
    entry.shot.camera = replacement;
    used.add(`${framing} | ${angle} | ${perspective}`);
  }
  return auditDynamicCameraDiversity(repaired, config).exactCollisions.length === 0 ? repaired : null;
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
function identityBearingClaim(value) {
  const excludedIdentityList = /\b(?:no|without)\s+(?:recognizable\s+|visible\s+|complete\s+|identifying\s+)*(?:faces?|facial features?|hair|hairstyle|outfits?|clothing|clothes|complete bod(?:y|ies)|bod(?:y|ies)|figures?|people|persons?|characters?)(?:\s*(?:,|or|and)\s*(?:the\s+)?(?:faces?|facial features?|hair|hairstyle|outfits?|clothing|clothes|complete bod(?:y|ies)|bod(?:y|ies)|figures?|people|persons?|characters?))*/gi;
  return value.replace(excludedIdentityList, " ").replace(/\b(?:faces?|facial features?|hair|hairstyle|outfits?|clothing|clothes|bod(?:y|ies)|figures?|people|persons?|characters?)\s+(?:is|are|remains?|stay|stays)?\s*(?:fully\s+|entirely\s+)?(?:cropped|excluded|outside|out of frame|not visible|unreadable|occluded)\b/gi, " ").replace(/\b(?:crop|exclude|omit|hide|occlude)(?:s|d|ing)?\s+(?:the\s+)?(?:faces?|facial features?|hair|hairstyle|outfits?|clothing|clothes|bod(?:y|ies)|figures?|people|persons?|characters?)\b/gi, " ");
}
function isIdentitySafeCreativeConcept(concept) {
  if (!concept.subjectType || !CREATIVE_SUBJECT_TYPES.has(concept.subjectType))
    return false;
  return isIdentitySafeCreativeCue([
    concept.anchor,
    concept.concept,
    concept.renderScope,
    ...concept.visibleCues
  ].join(" "));
}
function isIdentitySafeCreativeCue(value) {
  return !IDENTITY_BEARING_CUE.test(identityBearingClaim(value));
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
    "Never write a character name in anchor, concept, renderScope, camera, or visibleCues, even to say that person is cropped out. Use generic terms such as person, figure, or room occupant in exclusion wording.",
    "Allowed subjectType values are object, environment, shadow, silhouette, reflection, fragment, or spatial. Reflections and fragments must remain non-identifying; generic hands, fingers, feet, gestures, and fully unreadable silhouettes are allowed.",
    "Prefer overlooked but meaningful anchors: a source-supported object, environmental detail, shadow, unreadable silhouette, non-identifying fragment, foreground layer, aftermath, or unusual spatial relationship.",
    "If a paragraph has no faithful identity-safe anchor, return no Creative candidate for it. Do not weaken this rule merely to fill the requested count.",
    "Do not merely restate the paragraph's complete main action.",
    "Separate literal cues from metaphors and internal narration. Never render a simile literally and never invent an object, body part, action, or setting detail.",
    "renderScope is binding: state exactly what is inside the frame and what is cropped or occluded. visibleCues contains only traits and elements actually visible inside that scope.",
    "Repeat the exact source-specific anchor noun in anchor and at least one visibleCues entry. Never shorten a specific object into an ambiguous generic word: for example keep condom wrapper rather than wrapper, train ticket rather than paper, and broken mace head rather than debris.",
    "Preserve every explicit modifier on an included cue, such as black-gloved fingertip, bronze hand, red switch, wet handprint, or tied used condom. Never simplify an included cue in a way that changes its material, color, state, or ownership.",
    "Keep one or two source-supported grounding cues around the anchor so the image remains spatially legible, such as the bedside edge and rumpled sheet, arena arch and sand, or bus-shelter glass and rain. Avoid an extreme context-free macro unless the source itself contains no meaningful surrounding context.",
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

// node_modules/zod/v4/classic/external.js
var exports_external = {};
__export(exports_external, {
  xor: () => xor,
  xid: () => xid2,
  void: () => _void2,
  uuidv7: () => uuidv7,
  uuidv6: () => uuidv6,
  uuidv4: () => uuidv4,
  uuid: () => uuid2,
  util: () => exports_util,
  url: () => url,
  uppercase: () => _uppercase,
  unknown: () => unknown,
  union: () => union,
  undefined: () => _undefined3,
  ulid: () => ulid2,
  uint64: () => uint64,
  uint32: () => uint32,
  tuple: () => tuple,
  trim: () => _trim,
  treeifyError: () => treeifyError,
  transform: () => transform,
  toUpperCase: () => _toUpperCase,
  toLowerCase: () => _toLowerCase,
  toJSONSchema: () => toJSONSchema,
  templateLiteral: () => templateLiteral,
  symbol: () => symbol,
  superRefine: () => superRefine,
  success: () => success,
  stringbool: () => stringbool,
  stringFormat: () => stringFormat,
  string: () => string2,
  strictObject: () => strictObject,
  startsWith: () => _startsWith,
  slugify: () => _slugify,
  size: () => _size,
  setErrorMap: () => setErrorMap,
  set: () => set,
  safeParseAsync: () => safeParseAsync2,
  safeParse: () => safeParse2,
  safeEncodeAsync: () => safeEncodeAsync2,
  safeEncode: () => safeEncode2,
  safeDecodeAsync: () => safeDecodeAsync2,
  safeDecode: () => safeDecode2,
  registry: () => registry,
  regexes: () => exports_regexes,
  regex: () => _regex,
  refine: () => refine,
  record: () => record,
  readonly: () => readonly,
  property: () => _property,
  promise: () => promise,
  prettifyError: () => prettifyError,
  preprocess: () => preprocess,
  prefault: () => prefault,
  positive: () => _positive,
  pipe: () => pipe,
  partialRecord: () => partialRecord,
  parseAsync: () => parseAsync2,
  parse: () => parse3,
  overwrite: () => _overwrite,
  optional: () => optional,
  object: () => object,
  number: () => number2,
  nullish: () => nullish2,
  nullable: () => nullable,
  null: () => _null3,
  normalize: () => _normalize,
  nonpositive: () => _nonpositive,
  nonoptional: () => nonoptional,
  nonnegative: () => _nonnegative,
  never: () => never,
  negative: () => _negative,
  nativeEnum: () => nativeEnum,
  nanoid: () => nanoid2,
  nan: () => nan,
  multipleOf: () => _multipleOf,
  minSize: () => _minSize,
  minLength: () => _minLength,
  mime: () => _mime,
  meta: () => meta2,
  maxSize: () => _maxSize,
  maxLength: () => _maxLength,
  map: () => map,
  mac: () => mac2,
  lte: () => _lte,
  lt: () => _lt,
  lowercase: () => _lowercase,
  looseRecord: () => looseRecord,
  looseObject: () => looseObject,
  locales: () => exports_locales,
  literal: () => literal,
  length: () => _length,
  lazy: () => lazy,
  ksuid: () => ksuid2,
  keyof: () => keyof,
  jwt: () => jwt,
  json: () => json,
  iso: () => exports_iso,
  ipv6: () => ipv62,
  ipv4: () => ipv42,
  invertCodec: () => invertCodec,
  intersection: () => intersection,
  int64: () => int64,
  int32: () => int32,
  int: () => int,
  instanceof: () => _instanceof,
  includes: () => _includes,
  httpUrl: () => httpUrl,
  hostname: () => hostname2,
  hex: () => hex2,
  hash: () => hash,
  guid: () => guid2,
  gte: () => _gte,
  gt: () => _gt,
  globalRegistry: () => globalRegistry,
  getErrorMap: () => getErrorMap,
  function: () => _function,
  fromJSONSchema: () => fromJSONSchema,
  formatError: () => formatError,
  float64: () => float64,
  float32: () => float32,
  flattenError: () => flattenError,
  file: () => file,
  exactOptional: () => exactOptional,
  enum: () => _enum2,
  endsWith: () => _endsWith,
  encodeAsync: () => encodeAsync2,
  encode: () => encode2,
  emoji: () => emoji2,
  email: () => email2,
  e164: () => e1642,
  discriminatedUnion: () => discriminatedUnion,
  describe: () => describe2,
  decodeAsync: () => decodeAsync2,
  decode: () => decode2,
  date: () => date3,
  custom: () => custom,
  cuid2: () => cuid22,
  cuid: () => cuid3,
  core: () => exports_core2,
  config: () => config,
  coerce: () => exports_coerce,
  codec: () => codec,
  clone: () => clone,
  cidrv6: () => cidrv62,
  cidrv4: () => cidrv42,
  check: () => check,
  catch: () => _catch2,
  boolean: () => boolean2,
  bigint: () => bigint2,
  base64url: () => base64url2,
  base64: () => base642,
  array: () => array,
  any: () => any,
  _function: () => _function,
  _default: () => _default2,
  _ZodString: () => _ZodString,
  ZodXor: () => ZodXor,
  ZodXID: () => ZodXID,
  ZodVoid: () => ZodVoid,
  ZodUnknown: () => ZodUnknown,
  ZodUnion: () => ZodUnion,
  ZodUndefined: () => ZodUndefined,
  ZodUUID: () => ZodUUID,
  ZodURL: () => ZodURL,
  ZodULID: () => ZodULID,
  ZodType: () => ZodType,
  ZodTuple: () => ZodTuple,
  ZodTransform: () => ZodTransform,
  ZodTemplateLiteral: () => ZodTemplateLiteral,
  ZodSymbol: () => ZodSymbol,
  ZodSuccess: () => ZodSuccess,
  ZodStringFormat: () => ZodStringFormat,
  ZodString: () => ZodString,
  ZodSet: () => ZodSet,
  ZodRecord: () => ZodRecord,
  ZodRealError: () => ZodRealError,
  ZodReadonly: () => ZodReadonly,
  ZodPromise: () => ZodPromise,
  ZodPreprocess: () => ZodPreprocess,
  ZodPrefault: () => ZodPrefault,
  ZodPipe: () => ZodPipe,
  ZodOptional: () => ZodOptional,
  ZodObject: () => ZodObject,
  ZodNumberFormat: () => ZodNumberFormat,
  ZodNumber: () => ZodNumber,
  ZodNullable: () => ZodNullable,
  ZodNull: () => ZodNull,
  ZodNonOptional: () => ZodNonOptional,
  ZodNever: () => ZodNever,
  ZodNanoID: () => ZodNanoID,
  ZodNaN: () => ZodNaN,
  ZodMap: () => ZodMap,
  ZodMAC: () => ZodMAC,
  ZodLiteral: () => ZodLiteral,
  ZodLazy: () => ZodLazy,
  ZodKSUID: () => ZodKSUID,
  ZodJWT: () => ZodJWT,
  ZodIssueCode: () => ZodIssueCode,
  ZodIntersection: () => ZodIntersection,
  ZodISOTime: () => ZodISOTime,
  ZodISODuration: () => ZodISODuration,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODate: () => ZodISODate,
  ZodIPv6: () => ZodIPv6,
  ZodIPv4: () => ZodIPv4,
  ZodGUID: () => ZodGUID,
  ZodFunction: () => ZodFunction,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFile: () => ZodFile,
  ZodExactOptional: () => ZodExactOptional,
  ZodError: () => ZodError,
  ZodEnum: () => ZodEnum,
  ZodEmoji: () => ZodEmoji,
  ZodEmail: () => ZodEmail,
  ZodE164: () => ZodE164,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodDefault: () => ZodDefault,
  ZodDate: () => ZodDate,
  ZodCustomStringFormat: () => ZodCustomStringFormat,
  ZodCustom: () => ZodCustom,
  ZodCodec: () => ZodCodec,
  ZodCatch: () => ZodCatch,
  ZodCUID2: () => ZodCUID2,
  ZodCUID: () => ZodCUID,
  ZodCIDRv6: () => ZodCIDRv6,
  ZodCIDRv4: () => ZodCIDRv4,
  ZodBoolean: () => ZodBoolean,
  ZodBigIntFormat: () => ZodBigIntFormat,
  ZodBigInt: () => ZodBigInt,
  ZodBase64URL: () => ZodBase64URL,
  ZodBase64: () => ZodBase64,
  ZodArray: () => ZodArray,
  ZodAny: () => ZodAny,
  TimePrecision: () => TimePrecision,
  NEVER: () => NEVER,
  $output: () => $output,
  $input: () => $input,
  $brand: () => $brand
});

// node_modules/zod/v4/core/index.js
var exports_core2 = {};
__export(exports_core2, {
  version: () => version,
  util: () => exports_util,
  treeifyError: () => treeifyError,
  toJSONSchema: () => toJSONSchema,
  toDotPath: () => toDotPath,
  safeParseAsync: () => safeParseAsync,
  safeParse: () => safeParse,
  safeEncodeAsync: () => safeEncodeAsync,
  safeEncode: () => safeEncode,
  safeDecodeAsync: () => safeDecodeAsync,
  safeDecode: () => safeDecode,
  registry: () => registry,
  regexes: () => exports_regexes,
  process: () => process,
  prettifyError: () => prettifyError,
  parseAsync: () => parseAsync,
  parse: () => parse,
  meta: () => meta,
  locales: () => exports_locales,
  isValidJWT: () => isValidJWT,
  isValidBase64URL: () => isValidBase64URL,
  isValidBase64: () => isValidBase64,
  initializeContext: () => initializeContext,
  globalRegistry: () => globalRegistry,
  globalConfig: () => globalConfig,
  formatError: () => formatError,
  flattenError: () => flattenError,
  finalize: () => finalize,
  extractDefs: () => extractDefs,
  encodeAsync: () => encodeAsync,
  encode: () => encode,
  describe: () => describe,
  decodeAsync: () => decodeAsync,
  decode: () => decode,
  createToJSONSchemaMethod: () => createToJSONSchemaMethod,
  createStandardJSONSchemaMethod: () => createStandardJSONSchemaMethod,
  config: () => config,
  clone: () => clone,
  _xor: () => _xor,
  _xid: () => _xid,
  _void: () => _void,
  _uuidv7: () => _uuidv7,
  _uuidv6: () => _uuidv6,
  _uuidv4: () => _uuidv4,
  _uuid: () => _uuid,
  _url: () => _url,
  _uppercase: () => _uppercase,
  _unknown: () => _unknown,
  _union: () => _union,
  _undefined: () => _undefined2,
  _ulid: () => _ulid,
  _uint64: () => _uint64,
  _uint32: () => _uint32,
  _tuple: () => _tuple,
  _trim: () => _trim,
  _transform: () => _transform,
  _toUpperCase: () => _toUpperCase,
  _toLowerCase: () => _toLowerCase,
  _templateLiteral: () => _templateLiteral,
  _symbol: () => _symbol,
  _superRefine: () => _superRefine,
  _success: () => _success,
  _stringbool: () => _stringbool,
  _stringFormat: () => _stringFormat,
  _string: () => _string,
  _startsWith: () => _startsWith,
  _slugify: () => _slugify,
  _size: () => _size,
  _set: () => _set,
  _safeParseAsync: () => _safeParseAsync,
  _safeParse: () => _safeParse,
  _safeEncodeAsync: () => _safeEncodeAsync,
  _safeEncode: () => _safeEncode,
  _safeDecodeAsync: () => _safeDecodeAsync,
  _safeDecode: () => _safeDecode,
  _regex: () => _regex,
  _refine: () => _refine,
  _record: () => _record,
  _readonly: () => _readonly,
  _property: () => _property,
  _promise: () => _promise,
  _positive: () => _positive,
  _pipe: () => _pipe,
  _parseAsync: () => _parseAsync,
  _parse: () => _parse,
  _overwrite: () => _overwrite,
  _optional: () => _optional,
  _number: () => _number,
  _nullable: () => _nullable,
  _null: () => _null2,
  _normalize: () => _normalize,
  _nonpositive: () => _nonpositive,
  _nonoptional: () => _nonoptional,
  _nonnegative: () => _nonnegative,
  _never: () => _never,
  _negative: () => _negative,
  _nativeEnum: () => _nativeEnum,
  _nanoid: () => _nanoid,
  _nan: () => _nan,
  _multipleOf: () => _multipleOf,
  _minSize: () => _minSize,
  _minLength: () => _minLength,
  _min: () => _gte,
  _mime: () => _mime,
  _maxSize: () => _maxSize,
  _maxLength: () => _maxLength,
  _max: () => _lte,
  _map: () => _map,
  _mac: () => _mac,
  _lte: () => _lte,
  _lt: () => _lt,
  _lowercase: () => _lowercase,
  _literal: () => _literal,
  _length: () => _length,
  _lazy: () => _lazy,
  _ksuid: () => _ksuid,
  _jwt: () => _jwt,
  _isoTime: () => _isoTime,
  _isoDuration: () => _isoDuration,
  _isoDateTime: () => _isoDateTime,
  _isoDate: () => _isoDate,
  _ipv6: () => _ipv6,
  _ipv4: () => _ipv4,
  _intersection: () => _intersection,
  _int64: () => _int64,
  _int32: () => _int32,
  _int: () => _int,
  _includes: () => _includes,
  _guid: () => _guid,
  _gte: () => _gte,
  _gt: () => _gt,
  _float64: () => _float64,
  _float32: () => _float32,
  _file: () => _file,
  _enum: () => _enum,
  _endsWith: () => _endsWith,
  _encodeAsync: () => _encodeAsync,
  _encode: () => _encode,
  _emoji: () => _emoji2,
  _email: () => _email,
  _e164: () => _e164,
  _discriminatedUnion: () => _discriminatedUnion,
  _default: () => _default,
  _decodeAsync: () => _decodeAsync,
  _decode: () => _decode,
  _date: () => _date,
  _custom: () => _custom,
  _cuid2: () => _cuid2,
  _cuid: () => _cuid,
  _coercedString: () => _coercedString,
  _coercedNumber: () => _coercedNumber,
  _coercedDate: () => _coercedDate,
  _coercedBoolean: () => _coercedBoolean,
  _coercedBigint: () => _coercedBigint,
  _cidrv6: () => _cidrv6,
  _cidrv4: () => _cidrv4,
  _check: () => _check,
  _catch: () => _catch,
  _boolean: () => _boolean,
  _bigint: () => _bigint,
  _base64url: () => _base64url,
  _base64: () => _base64,
  _array: () => _array,
  _any: () => _any,
  TimePrecision: () => TimePrecision,
  NEVER: () => NEVER,
  JSONSchemaGenerator: () => JSONSchemaGenerator,
  JSONSchema: () => exports_json_schema,
  Doc: () => Doc,
  $output: () => $output,
  $input: () => $input,
  $constructor: () => $constructor,
  $brand: () => $brand,
  $ZodXor: () => $ZodXor,
  $ZodXID: () => $ZodXID,
  $ZodVoid: () => $ZodVoid,
  $ZodUnknown: () => $ZodUnknown,
  $ZodUnion: () => $ZodUnion,
  $ZodUndefined: () => $ZodUndefined,
  $ZodUUID: () => $ZodUUID,
  $ZodURL: () => $ZodURL,
  $ZodULID: () => $ZodULID,
  $ZodType: () => $ZodType,
  $ZodTuple: () => $ZodTuple,
  $ZodTransform: () => $ZodTransform,
  $ZodTemplateLiteral: () => $ZodTemplateLiteral,
  $ZodSymbol: () => $ZodSymbol,
  $ZodSuccess: () => $ZodSuccess,
  $ZodStringFormat: () => $ZodStringFormat,
  $ZodString: () => $ZodString,
  $ZodSet: () => $ZodSet,
  $ZodRegistry: () => $ZodRegistry,
  $ZodRecord: () => $ZodRecord,
  $ZodRealError: () => $ZodRealError,
  $ZodReadonly: () => $ZodReadonly,
  $ZodPromise: () => $ZodPromise,
  $ZodPreprocess: () => $ZodPreprocess,
  $ZodPrefault: () => $ZodPrefault,
  $ZodPipe: () => $ZodPipe,
  $ZodOptional: () => $ZodOptional,
  $ZodObjectJIT: () => $ZodObjectJIT,
  $ZodObject: () => $ZodObject,
  $ZodNumberFormat: () => $ZodNumberFormat,
  $ZodNumber: () => $ZodNumber,
  $ZodNullable: () => $ZodNullable,
  $ZodNull: () => $ZodNull,
  $ZodNonOptional: () => $ZodNonOptional,
  $ZodNever: () => $ZodNever,
  $ZodNanoID: () => $ZodNanoID,
  $ZodNaN: () => $ZodNaN,
  $ZodMap: () => $ZodMap,
  $ZodMAC: () => $ZodMAC,
  $ZodLiteral: () => $ZodLiteral,
  $ZodLazy: () => $ZodLazy,
  $ZodKSUID: () => $ZodKSUID,
  $ZodJWT: () => $ZodJWT,
  $ZodIntersection: () => $ZodIntersection,
  $ZodISOTime: () => $ZodISOTime,
  $ZodISODuration: () => $ZodISODuration,
  $ZodISODateTime: () => $ZodISODateTime,
  $ZodISODate: () => $ZodISODate,
  $ZodIPv6: () => $ZodIPv6,
  $ZodIPv4: () => $ZodIPv4,
  $ZodGUID: () => $ZodGUID,
  $ZodFunction: () => $ZodFunction,
  $ZodFile: () => $ZodFile,
  $ZodExactOptional: () => $ZodExactOptional,
  $ZodError: () => $ZodError,
  $ZodEnum: () => $ZodEnum,
  $ZodEncodeError: () => $ZodEncodeError,
  $ZodEmoji: () => $ZodEmoji,
  $ZodEmail: () => $ZodEmail,
  $ZodE164: () => $ZodE164,
  $ZodDiscriminatedUnion: () => $ZodDiscriminatedUnion,
  $ZodDefault: () => $ZodDefault,
  $ZodDate: () => $ZodDate,
  $ZodCustomStringFormat: () => $ZodCustomStringFormat,
  $ZodCustom: () => $ZodCustom,
  $ZodCodec: () => $ZodCodec,
  $ZodCheckUpperCase: () => $ZodCheckUpperCase,
  $ZodCheckStringFormat: () => $ZodCheckStringFormat,
  $ZodCheckStartsWith: () => $ZodCheckStartsWith,
  $ZodCheckSizeEquals: () => $ZodCheckSizeEquals,
  $ZodCheckRegex: () => $ZodCheckRegex,
  $ZodCheckProperty: () => $ZodCheckProperty,
  $ZodCheckOverwrite: () => $ZodCheckOverwrite,
  $ZodCheckNumberFormat: () => $ZodCheckNumberFormat,
  $ZodCheckMultipleOf: () => $ZodCheckMultipleOf,
  $ZodCheckMinSize: () => $ZodCheckMinSize,
  $ZodCheckMinLength: () => $ZodCheckMinLength,
  $ZodCheckMimeType: () => $ZodCheckMimeType,
  $ZodCheckMaxSize: () => $ZodCheckMaxSize,
  $ZodCheckMaxLength: () => $ZodCheckMaxLength,
  $ZodCheckLowerCase: () => $ZodCheckLowerCase,
  $ZodCheckLessThan: () => $ZodCheckLessThan,
  $ZodCheckLengthEquals: () => $ZodCheckLengthEquals,
  $ZodCheckIncludes: () => $ZodCheckIncludes,
  $ZodCheckGreaterThan: () => $ZodCheckGreaterThan,
  $ZodCheckEndsWith: () => $ZodCheckEndsWith,
  $ZodCheckBigIntFormat: () => $ZodCheckBigIntFormat,
  $ZodCheck: () => $ZodCheck,
  $ZodCatch: () => $ZodCatch,
  $ZodCUID2: () => $ZodCUID2,
  $ZodCUID: () => $ZodCUID,
  $ZodCIDRv6: () => $ZodCIDRv6,
  $ZodCIDRv4: () => $ZodCIDRv4,
  $ZodBoolean: () => $ZodBoolean,
  $ZodBigIntFormat: () => $ZodBigIntFormat,
  $ZodBigInt: () => $ZodBigInt,
  $ZodBase64URL: () => $ZodBase64URL,
  $ZodBase64: () => $ZodBase64,
  $ZodAsyncError: () => $ZodAsyncError,
  $ZodArray: () => $ZodArray,
  $ZodAny: () => $ZodAny
});

// node_modules/zod/v4/core/core.js
var _a;
var NEVER = /* @__PURE__ */ Object.freeze({
  status: "aborted"
});
function $constructor(name, initializer, params) {
  function init(inst, def) {
    if (!inst._zod) {
      Object.defineProperty(inst, "_zod", {
        value: {
          def,
          constr: _,
          traits: new Set
        },
        enumerable: false
      });
    }
    if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer(inst, def);
    const proto = _.prototype;
    const keys = Object.keys(proto);
    for (let i = 0;i < keys.length; i++) {
      const k = keys[i];
      if (!(k in inst)) {
        inst[k] = proto[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;

  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    var _a2;
    const inst = params?.Parent ? new Definition : this;
    init(inst, def);
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
var $brand = Symbol("zod_brand");

class $ZodAsyncError extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
}

class $ZodEncodeError extends Error {
  constructor(name) {
    super(`Encountered unidirectional transform during encode: ${name}`);
    this.name = "ZodEncodeError";
  }
}
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}
// node_modules/zod/v4/core/util.js
var exports_util = {};
__export(exports_util, {
  unwrapMessage: () => unwrapMessage,
  uint8ArrayToHex: () => uint8ArrayToHex,
  uint8ArrayToBase64url: () => uint8ArrayToBase64url,
  uint8ArrayToBase64: () => uint8ArrayToBase64,
  stringifyPrimitive: () => stringifyPrimitive,
  slugify: () => slugify,
  shallowClone: () => shallowClone,
  safeExtend: () => safeExtend,
  required: () => required,
  randomString: () => randomString,
  propertyKeyTypes: () => propertyKeyTypes,
  promiseAllObject: () => promiseAllObject,
  primitiveTypes: () => primitiveTypes,
  prefixIssues: () => prefixIssues,
  pick: () => pick,
  partial: () => partial,
  parsedType: () => parsedType,
  optionalKeys: () => optionalKeys,
  omit: () => omit,
  objectClone: () => objectClone,
  numKeys: () => numKeys,
  nullish: () => nullish,
  normalizeParams: () => normalizeParams,
  mergeDefs: () => mergeDefs,
  merge: () => merge,
  jsonStringifyReplacer: () => jsonStringifyReplacer,
  joinValues: () => joinValues,
  issue: () => issue,
  isPlainObject: () => isPlainObject,
  isObject: () => isObject,
  hexToUint8Array: () => hexToUint8Array,
  getSizableOrigin: () => getSizableOrigin,
  getParsedType: () => getParsedType,
  getLengthableOrigin: () => getLengthableOrigin,
  getEnumValues: () => getEnumValues,
  getElementAtPath: () => getElementAtPath,
  floatSafeRemainder: () => floatSafeRemainder,
  finalizeIssue: () => finalizeIssue,
  extend: () => extend,
  explicitlyAborted: () => explicitlyAborted,
  escapeRegex: () => escapeRegex,
  esc: () => esc,
  defineLazy: () => defineLazy,
  createTransparentProxy: () => createTransparentProxy,
  cloneDef: () => cloneDef,
  clone: () => clone,
  cleanRegex: () => cleanRegex,
  cleanEnum: () => cleanEnum,
  captureStackTrace: () => captureStackTrace,
  cached: () => cached,
  base64urlToUint8Array: () => base64urlToUint8Array,
  base64ToUint8Array: () => base64ToUint8Array,
  assignProp: () => assignProp,
  assertNotEqual: () => assertNotEqual,
  assertNever: () => assertNever,
  assertIs: () => assertIs,
  assertEqual: () => assertEqual,
  assert: () => assert,
  allowsEval: () => allowsEval,
  aborted: () => aborted,
  NUMBER_FORMAT_RANGES: () => NUMBER_FORMAT_RANGES,
  Class: () => Class,
  BIGINT_FORMAT_RANGES: () => BIGINT_FORMAT_RANGES
});
function assertEqual(val) {
  return val;
}
function assertNotEqual(val) {
  return val;
}
function assertIs(_arg) {}
function assertNever(_x) {
  throw new Error("Unexpected value in exhaustive check");
}
function assert(_) {}
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array, separator = "|") {
  return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  const set = false;
  return {
    get value() {
      if (!set) {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
      throw new Error("cached value already set");
    }
  };
}
function nullish(input) {
  return input === null || input === undefined;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
var EVALUATING = /* @__PURE__ */ Symbol("evaluating");
function defineLazy(object, key, getter) {
  let value = undefined;
  Object.defineProperty(object, key, {
    get() {
      if (value === EVALUATING) {
        return;
      }
      if (value === undefined) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object, key, {
        value: v
      });
    },
    configurable: true
  });
}
function objectClone(obj) {
  return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj));
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function cloneDef(schema) {
  return mergeDefs(schema._zod.def);
}
function getElementAtPath(obj, path) {
  if (!path)
    return obj;
  return path.reduce((acc, key) => acc?.[key], obj);
}
function promiseAllObject(promisesObj) {
  const keys = Object.keys(promisesObj);
  const promises = keys.map((key) => promisesObj[key]);
  return Promise.all(promises).then((results) => {
    const resolvedObj = {};
    for (let i = 0;i < keys.length; i++) {
      resolvedObj[keys[i]] = results[i];
    }
    return resolvedObj;
  });
}
function randomString(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let str = "";
  for (let i = 0;i < length; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === undefined)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
function numKeys(data) {
  let keyCount = 0;
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      keyCount++;
    }
  }
  return keyCount;
}
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "object":
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return "promise";
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return "map";
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return "set";
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return "date";
      }
      if (typeof File !== "undefined" && data instanceof File) {
        return "file";
      }
      return "object";
    default:
      throw new Error(`Unknown data type: ${t}`);
  }
};
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
var primitiveTypes = /* @__PURE__ */ new Set([
  "string",
  "number",
  "bigint",
  "boolean",
  "symbol",
  "undefined"
]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== undefined) {
    if (params?.error !== undefined)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function createTransparentProxy(getter) {
  let target;
  return new Proxy({}, {
    get(_, prop, receiver) {
      target ?? (target = getter());
      return Reflect.get(target, prop, receiver);
    },
    set(_, prop, value, receiver) {
      target ?? (target = getter());
      return Reflect.set(target, prop, value, receiver);
    },
    has(_, prop) {
      target ?? (target = getter());
      return Reflect.has(target, prop);
    },
    deleteProperty(_, prop) {
      target ?? (target = getter());
      return Reflect.deleteProperty(target, prop);
    },
    ownKeys(_) {
      target ?? (target = getter());
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_, prop) {
      target ?? (target = getter());
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    defineProperty(_, prop, descriptor) {
      target ?? (target = getter());
      return Reflect.defineProperty(target, prop, descriptor);
    }
  });
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-340282346638528860000000000000000000000, 340282346638528860000000000000000000000],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
var BIGINT_FORMAT_RANGES = {
  int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
  uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = {};
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        newShape[key] = currDef.shape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = { ...schema._zod.def.shape };
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        delete newShape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = schema._zod.def.shape;
    for (const key in shape) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== undefined) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function merge(a, b) {
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const def = mergeDefs(a._zod.def, {
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class, schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".partial() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in oldShape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      } else {
        for (const key in oldShape) {
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function required(Class, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in shape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      } else {
        for (const key in oldShape) {
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    }
  });
  return clone(schema, def);
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a2;
    (_a2 = iss).path ?? (_a2.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config2) {
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
  const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
  rest.path ?? (rest.path = []);
  rest.message = message;
  if (ctx?.reportInput) {
    rest.input = _input;
  }
  return rest;
}
function getSizableOrigin(input) {
  if (input instanceof Set)
    return "set";
  if (input instanceof Map)
    return "map";
  if (input instanceof File)
    return "file";
  return "unknown";
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function parsedType(data) {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "nan" : "number";
    }
    case "object": {
      if (data === null) {
        return "null";
      }
      if (Array.isArray(data)) {
        return "array";
      }
      const obj = data;
      if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
        return obj.constructor.name;
      }
    }
  }
  return t;
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function cleanEnum(obj) {
  return Object.entries(obj).filter(([k, _]) => {
    return Number.isNaN(Number.parseInt(k, 10));
  }).map((el) => el[1]);
}
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0;i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
function uint8ArrayToBase64(bytes) {
  let binaryString = "";
  for (let i = 0;i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}
function base64urlToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  return base64ToUint8Array(base64 + padding);
}
function uint8ArrayToBase64url(bytes) {
  return uint8ArrayToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function hexToUint8Array(hex) {
  const cleanHex = hex.replace(/^0x/, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0;i < cleanHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}
function uint8ArrayToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

class Class {
  constructor(..._args) {}
}

// node_modules/zod/v4/core/errors.js
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  Object.defineProperty(inst, "_zod", {
    value: inst._zod,
    enumerable: false
  });
  Object.defineProperty(inst, "issues", {
    value: def,
    enumerable: false
  });
  inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
  Object.defineProperty(inst, "toString", {
    value: () => inst.message,
    enumerable: false
  });
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
function flattenError(error, mapper = (issue2) => issue2.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error.issues) {
    if (sub.path.length > 0) {
      fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
      fieldErrors[sub.path[0]].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue2) => issue2.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error2, path = []) => {
    for (const issue2 of error2.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue2));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue2));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    }
  };
  processError(error);
  return fieldErrors;
}
function treeifyError(error, mapper = (issue2) => issue2.message) {
  const result = { errors: [] };
  const processError = (error2, path = []) => {
    var _a2, _b;
    for (const issue2 of error2.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          result.errors.push(mapper(issue2));
          continue;
        }
        let curr = result;
        let i = 0;
        while (i < fullpath.length) {
          const el = fullpath[i];
          const terminal = i === fullpath.length - 1;
          if (typeof el === "string") {
            curr.properties ?? (curr.properties = {});
            (_a2 = curr.properties)[el] ?? (_a2[el] = { errors: [] });
            curr = curr.properties[el];
          } else {
            curr.items ?? (curr.items = []);
            (_b = curr.items)[el] ?? (_b[el] = { errors: [] });
            curr = curr.items[el];
          }
          if (terminal) {
            curr.errors.push(mapper(issue2));
          }
          i++;
        }
      }
    }
  };
  processError(error);
  return result;
}
function toDotPath(_path) {
  const segs = [];
  const path = _path.map((seg) => typeof seg === "object" ? seg.key : seg);
  for (const seg of path) {
    if (typeof seg === "number")
      segs.push(`[${seg}]`);
    else if (typeof seg === "symbol")
      segs.push(`[${JSON.stringify(String(seg))}]`);
    else if (/[^\w$]/.test(seg))
      segs.push(`[${JSON.stringify(seg)}]`);
    else {
      if (segs.length)
        segs.push(".");
      segs.push(seg);
    }
  }
  return segs.join("");
}
function prettifyError(error) {
  const lines = [];
  const issues = [...error.issues].sort((a, b) => (a.path ?? []).length - (b.path ?? []).length);
  for (const issue2 of issues) {
    lines.push(`✖ ${issue2.message}`);
    if (issue2.path?.length)
      lines.push(`  → at ${toDotPath(issue2.path)}`);
  }
  return lines.join(`
`);
}

// node_modules/zod/v4/core/parse.js
var _parse = (_Err) => (schema, value, _ctx, _params) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  if (result.issues.length) {
    const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, _params?.callee);
    throw e;
  }
  return result.value;
};
var parse = /* @__PURE__ */ _parse($ZodRealError);
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  if (result.issues.length) {
    const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, params?.callee);
    throw e;
  }
  return result.value;
};
var parseAsync = /* @__PURE__ */ _parseAsync($ZodRealError);
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  return result.issues.length ? {
    success: false,
    error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParse = /* @__PURE__ */ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? {
    success: false,
    error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
var safeParseAsync = /* @__PURE__ */ _safeParseAsync($ZodRealError);
var _encode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parse(_Err)(schema, value, ctx);
};
var encode = /* @__PURE__ */ _encode($ZodRealError);
var _decode = (_Err) => (schema, value, _ctx) => {
  return _parse(_Err)(schema, value, _ctx);
};
var decode = /* @__PURE__ */ _decode($ZodRealError);
var _encodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parseAsync(_Err)(schema, value, ctx);
};
var encodeAsync = /* @__PURE__ */ _encodeAsync($ZodRealError);
var _decodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _parseAsync(_Err)(schema, value, _ctx);
};
var decodeAsync = /* @__PURE__ */ _decodeAsync($ZodRealError);
var _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
};
var safeEncode = /* @__PURE__ */ _safeEncode($ZodRealError);
var _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
};
var safeDecode = /* @__PURE__ */ _safeDecode($ZodRealError);
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
};
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync($ZodRealError);
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync($ZodRealError);
// node_modules/zod/v4/core/regexes.js
var exports_regexes = {};
__export(exports_regexes, {
  xid: () => xid,
  uuid7: () => uuid7,
  uuid6: () => uuid6,
  uuid4: () => uuid4,
  uuid: () => uuid,
  uppercase: () => uppercase,
  unicodeEmail: () => unicodeEmail,
  undefined: () => _undefined,
  ulid: () => ulid,
  time: () => time,
  string: () => string,
  sha512_hex: () => sha512_hex,
  sha512_base64url: () => sha512_base64url,
  sha512_base64: () => sha512_base64,
  sha384_hex: () => sha384_hex,
  sha384_base64url: () => sha384_base64url,
  sha384_base64: () => sha384_base64,
  sha256_hex: () => sha256_hex,
  sha256_base64url: () => sha256_base64url,
  sha256_base64: () => sha256_base64,
  sha1_hex: () => sha1_hex,
  sha1_base64url: () => sha1_base64url,
  sha1_base64: () => sha1_base64,
  rfc5322Email: () => rfc5322Email,
  number: () => number,
  null: () => _null,
  nanoid: () => nanoid,
  md5_hex: () => md5_hex,
  md5_base64url: () => md5_base64url,
  md5_base64: () => md5_base64,
  mac: () => mac,
  lowercase: () => lowercase,
  ksuid: () => ksuid,
  ipv6: () => ipv6,
  ipv4: () => ipv4,
  integer: () => integer,
  idnEmail: () => idnEmail,
  httpProtocol: () => httpProtocol,
  html5Email: () => html5Email,
  hostname: () => hostname,
  hex: () => hex,
  guid: () => guid,
  extendedDuration: () => extendedDuration,
  emoji: () => emoji,
  email: () => email,
  e164: () => e164,
  duration: () => duration,
  domain: () => domain,
  datetime: () => datetime,
  date: () => date,
  cuid2: () => cuid2,
  cuid: () => cuid,
  cidrv6: () => cidrv6,
  cidrv4: () => cidrv4,
  browserEmail: () => browserEmail,
  boolean: () => boolean,
  bigint: () => bigint,
  base64url: () => base64url,
  base64: () => base64
});
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var extendedDuration = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version) => {
  if (!version)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
var uuid4 = /* @__PURE__ */ uuid(4);
var uuid6 = /* @__PURE__ */ uuid(6);
var uuid7 = /* @__PURE__ */ uuid(7);
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var html5Email = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
var rfc5322Email = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
var unicodeEmail = /^[^\s@"]{1,64}@[^\s@]{1,255}$/u;
var idnEmail = unicodeEmail;
var browserEmail = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
var _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var mac = (delimiter) => {
  const escapedDelim = escapeRegex(delimiter ?? ":");
  return new RegExp(`^(?:[0-9A-F]{2}${escapedDelim}){5}[0-9A-F]{2}$|^(?:[0-9a-f]{2}${escapedDelim}){5}[0-9a-f]{2}$`);
};
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var hostname = /^(?=.{1,253}\.?$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[-0-9a-zA-Z]{0,61}[0-9a-zA-Z])?)*\.?$/;
var domain = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date = /* @__PURE__ */ new RegExp(`^${dateSource}$`);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const time2 = timeSource({ precision: args.precision });
  const opts = ["Z"];
  if (args.local)
    opts.push("");
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const timeRegex = `${time2}(?:${opts.join("|")})`;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string = (params) => {
  const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
  return new RegExp(`^${regex}$`);
};
var bigint = /^-?\d+n?$/;
var integer = /^-?\d+$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean = /^(?:true|false)$/i;
var _null = /^null$/i;
var _undefined = /^undefined$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;
var hex = /^[0-9a-fA-F]*$/;
function fixedBase64(bodyLength, padding) {
  return new RegExp(`^[A-Za-z0-9+/]{${bodyLength}}${padding}$`);
}
function fixedBase64url(length) {
  return new RegExp(`^[A-Za-z0-9_-]{${length}}$`);
}
var md5_hex = /^[0-9a-fA-F]{32}$/;
var md5_base64 = /* @__PURE__ */ fixedBase64(22, "==");
var md5_base64url = /* @__PURE__ */ fixedBase64url(22);
var sha1_hex = /^[0-9a-fA-F]{40}$/;
var sha1_base64 = /* @__PURE__ */ fixedBase64(27, "=");
var sha1_base64url = /* @__PURE__ */ fixedBase64url(27);
var sha256_hex = /^[0-9a-fA-F]{64}$/;
var sha256_base64 = /* @__PURE__ */ fixedBase64(43, "=");
var sha256_base64url = /* @__PURE__ */ fixedBase64url(43);
var sha384_hex = /^[0-9a-fA-F]{96}$/;
var sha384_base64 = /* @__PURE__ */ fixedBase64(64, "");
var sha384_base64url = /* @__PURE__ */ fixedBase64url(64);
var sha512_hex = /^[0-9a-fA-F]{128}$/;
var sha512_base64 = /* @__PURE__ */ fixedBase64(86, "==");
var sha512_base64url = /* @__PURE__ */ fixedBase64url(86);

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a2;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a2 = inst._zod).onattach ?? (_a2.onattach = []);
});
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
    if (def.value < curr) {
      if (def.inclusive)
        bag.maximum = def.value;
      else
        bag.exclusiveMaximum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
    if (def.value > curr) {
      if (def.inclusive)
        bag.minimum = def.value;
      else
        bag.exclusiveMinimum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    var _a2;
    (_a2 = inst2._zod.bag).multipleOf ?? (_a2.multipleOf = def.value);
  });
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
    if (isInt)
      bag.pattern = integer;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckBigIntFormat = /* @__PURE__ */ $constructor("$ZodCheckBigIntFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  const [minimum, maximum] = BIGINT_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (input < minimum) {
      payload.issues.push({
        origin: "bigint",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "bigint",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckMaxSize = /* @__PURE__ */ $constructor("$ZodCheckMaxSize", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst2._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size <= def.maximum)
      return;
    payload.issues.push({
      origin: getSizableOrigin(input),
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinSize = /* @__PURE__ */ $constructor("$ZodCheckMinSize", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst2._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size >= def.minimum)
      return;
    payload.issues.push({
      origin: getSizableOrigin(input),
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckSizeEquals = /* @__PURE__ */ $constructor("$ZodCheckSizeEquals", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.size !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.minimum = def.size;
    bag.maximum = def.size;
    bag.size = def.size;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const size = input.size;
    if (size === def.size)
      return;
    const tooBig = size > def.size;
    payload.issues.push({
      origin: getSizableOrigin(input),
      ...tooBig ? { code: "too_big", maximum: def.size } : { code: "too_small", minimum: def.size },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst2._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst2._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== undefined;
  });
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.minimum = def.length;
    bag.maximum = def.length;
    bag.length = def.length;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a2, _b;
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    if (def.pattern) {
      bag.patterns ?? (bag.patterns = new Set);
      bag.patterns.add(def.pattern);
    }
  });
  if (def.pattern)
    (_a2 = inst._zod).check ?? (_a2.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = new Set);
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function handleCheckPropertyResult(result, payload, property) {
  if (result.issues.length) {
    payload.issues.push(...prefixIssues(property, result.issues));
  }
}
var $ZodCheckProperty = /* @__PURE__ */ $constructor("$ZodCheckProperty", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    const result = def.schema._zod.run({
      value: payload.value[def.property],
      issues: []
    }, {});
    if (result instanceof Promise) {
      return result.then((result2) => handleCheckPropertyResult(result2, payload, def.property));
    }
    handleCheckPropertyResult(result, payload, def.property);
    return;
  };
});
var $ZodCheckMimeType = /* @__PURE__ */ $constructor("$ZodCheckMimeType", (inst, def) => {
  $ZodCheck.init(inst, def);
  const mimeSet = new Set(def.mime);
  inst._zod.onattach.push((inst2) => {
    inst2._zod.bag.mime = def.mime;
  });
  inst._zod.check = (payload) => {
    if (mimeSet.has(payload.value.type))
      return;
    payload.issues.push({
      code: "invalid_value",
      values: def.mime,
      input: payload.value.type,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// node_modules/zod/v4/core/doc.js
class Doc {
  constructor(args = []) {
    this.content = [];
    this.indent = 0;
    if (this)
      this.args = args;
  }
  indented(fn) {
    this.indent += 1;
    fn(this);
    this.indent -= 1;
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split(`
`).filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const args = this?.args;
    const content = this?.content ?? [``];
    const lines = [...content.map((x) => `  ${x}`)];
    return new F(...args, lines.join(`
`));
  }
}

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 4,
  patch: 3
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a2;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const checks = [...inst._zod.def.checks ?? []];
  if (inst._zod.traits.has("$ZodCheck")) {
    checks.unshift(inst);
  }
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError;
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
  defineLazy(inst, "~standard", () => ({
    validate: (value) => {
      try {
        const r = safeParse(inst, value);
        return r.success ? { value: r.data } : { issues: r.error?.issues };
      } catch (_) {
        return safeParseAsync(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
      }
    },
    vendor: "zod",
    version: 1
  }));
});
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string(inst._zod.bag);
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {}
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === undefined)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      if (!def.normalize && def.protocol?.source === httpProtocol.source) {
        if (!/^https?:\/\//i.test(trimmed)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid URL format",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
      }
      const url = new URL(trimmed);
      if (def.hostname) {
        def.hostname.lastIndex = 0;
        if (!def.hostname.test(url.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: def.hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.protocol) {
        def.protocol.lastIndex = 0;
        if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.normalize) {
        payload.value = url.href;
      } else {
        payload.value = trimmed;
      }
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  def.pattern ?? (def.pattern = nanoid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration);
  $ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv4`;
});
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv6`;
  inst._zod.check = (payload) => {
    try {
      new URL(`http://[${payload.value}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodMAC = /* @__PURE__ */ $constructor("$ZodMAC", (inst, def) => {
  def.pattern ?? (def.pattern = mac(def.delimiter));
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `mac`;
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    const parts = payload.value.split("/");
    try {
      if (parts.length !== 2)
        throw new Error;
      const [address, prefix] = parts;
      if (!prefix)
        throw new Error;
      const prefixNum = Number(prefix);
      if (`${prefixNum}` !== prefix)
        throw new Error;
      if (prefixNum < 0 || prefixNum > 128)
        throw new Error;
      new URL(`http://[${address}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64";
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base642 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base642.padEnd(Math.ceil(base642.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64url);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64url";
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCustomStringFormat = /* @__PURE__ */ $constructor("$ZodCustomStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (def.fn(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: def.format,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : undefined : undefined;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodBigInt = /* @__PURE__ */ $constructor("$ZodBigInt", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = bigint;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = BigInt(payload.value);
      } catch (_) {}
    if (typeof payload.value === "bigint")
      return payload;
    payload.issues.push({
      expected: "bigint",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodBigIntFormat = /* @__PURE__ */ $constructor("$ZodBigIntFormat", (inst, def) => {
  $ZodCheckBigIntFormat.init(inst, def);
  $ZodBigInt.init(inst, def);
});
var $ZodSymbol = /* @__PURE__ */ $constructor("$ZodSymbol", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "symbol")
      return payload;
    payload.issues.push({
      expected: "symbol",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUndefined = /* @__PURE__ */ $constructor("$ZodUndefined", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _undefined;
  inst._zod.values = new Set([undefined]);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "undefined")
      return payload;
    payload.issues.push({
      expected: "undefined",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodNull = /* @__PURE__ */ $constructor("$ZodNull", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _null;
  inst._zod.values = new Set([null]);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input === null)
      return payload;
    payload.issues.push({
      expected: "null",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodAny = /* @__PURE__ */ $constructor("$ZodAny", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodVoid = /* @__PURE__ */ $constructor("$ZodVoid", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (typeof input === "undefined")
      return payload;
    payload.issues.push({
      expected: "void",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodDate = /* @__PURE__ */ $constructor("$ZodDate", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce) {
      try {
        payload.value = new Date(payload.value);
      } catch (_err) {}
    }
    const input = payload.value;
    const isDate = input instanceof Date;
    const isValidDate = isDate && !Number.isNaN(input.getTime());
    if (isValidDate)
      return payload;
    payload.issues.push({
      expected: "date",
      code: "invalid_type",
      input,
      ...isDate ? { received: "Invalid Date" } : {},
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = Array(input.length);
    const proms = [];
    for (let i = 0;i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
  const isPresent = key in input;
  if (result.issues.length) {
    if (isOptionalIn && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && !isOptionalIn) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: undefined,
        path: [key]
      });
    }
    return;
  }
  if (result.value === undefined) {
    if (isPresent) {
      final.value[key] = undefined;
    }
  } else {
    final.value[key] = result.value;
  }
}
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  for (const k of keys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    keys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const isOptionalIn = _catchall.optin === "optional";
  const isOptionalOut = _catchall.optout === "optional";
  for (const key in input) {
    if (key === "__proto__")
      continue;
    if (keySet.has(key))
      continue;
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut)));
    } else {
      handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  if (!desc?.get) {
    const sh = def.shape;
    Object.defineProperty(def, "shape", {
      get: () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", {
          value: newSh
        });
        return newSh;
      }
    });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazy(inst._zod, "propValues", () => {
    const shape = def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        propValues[key] ?? (propValues[key] = new Set);
        for (const v of field.values)
          propValues[key].add(v);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = {};
    const proms = [];
    const shape = value.shape;
    for (const key of value.keys) {
      const el = shape[key];
      const isOptionalIn = el._zod.optin === "optional";
      const isOptionalOut = el._zod.optout === "optional";
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut)));
      } else {
        handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
  };
});
var $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
  $ZodObject.init(inst, def);
  const superParse = inst._zod.parse;
  const _normalized = cached(() => normalizeDef(def));
  const generateFastpass = (shape) => {
    const doc = new Doc(["shape", "payload", "ctx"]);
    const normalized = _normalized.value;
    const parseStr = (key) => {
      const k = esc(key);
      return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    };
    doc.write(`const input = payload.value;`);
    const ids = Object.create(null);
    let counter = 0;
    for (const key of normalized.keys) {
      ids[key] = `key_${counter++}`;
    }
    doc.write(`const newResult = {};`);
    for (const key of normalized.keys) {
      const id = ids[key];
      const k = esc(key);
      const schema = shape[key];
      const isOptionalIn = schema?._zod?.optin === "optional";
      const isOptionalOut = schema?._zod?.optout === "optional";
      doc.write(`const ${id} = ${parseStr(key)};`);
      if (isOptionalIn && isOptionalOut) {
        doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      } else if (!isOptionalIn) {
        doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
      } else {
        doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      }
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    const fn = doc.compile();
    return (payload, ctx) => fn(shape, payload, ctx);
  };
  let fastpass;
  const isObject2 = isObject;
  const jit = !globalConfig.jitless;
  const allowsEval2 = allowsEval;
  const fastEnabled = jit && allowsEval2.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
      if (!catchall)
        return payload;
      return handleCatchall([], input, payload, ctx, value, inst);
    }
    return superParse(payload, ctx);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : undefined);
  defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
  defineLazy(inst._zod, "values", () => {
    if (def.options.every((o) => o._zod.values)) {
      return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return;
  });
  defineLazy(inst._zod, "pattern", () => {
    if (def.options.every((o) => o._zod.pattern)) {
      const patterns = def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
function handleExclusiveUnionResults(results, final, inst, ctx) {
  const successes = results.filter((r) => r.issues.length === 0);
  if (successes.length === 1) {
    final.value = successes[0].value;
    return final;
  }
  if (successes.length === 0) {
    final.issues.push({
      code: "invalid_union",
      input: final.value,
      inst,
      errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
    });
  } else {
    final.issues.push({
      code: "invalid_union",
      input: final.value,
      inst,
      errors: [],
      inclusive: false
    });
  }
  return final;
}
var $ZodXor = /* @__PURE__ */ $constructor("$ZodXor", (inst, def) => {
  $ZodUnion.init(inst, def);
  def.inclusive = false;
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        results.push(result);
      }
    }
    if (!async)
      return handleExclusiveUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleExclusiveUnionResults(results2, payload, inst, ctx);
    });
  };
});
var $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
  def.inclusive = false;
  $ZodUnion.init(inst, def);
  const _super = inst._zod.parse;
  defineLazy(inst._zod, "propValues", () => {
    const propValues = {};
    for (const option of def.options) {
      const pv = option._zod.propValues;
      if (!pv || Object.keys(pv).length === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
      for (const [k, v] of Object.entries(pv)) {
        if (!propValues[k])
          propValues[k] = new Set;
        for (const val of v) {
          propValues[k].add(val);
        }
      }
    }
    return propValues;
  });
  const disc = cached(() => {
    const opts = def.options;
    const map = new Map;
    for (const o of opts) {
      const values = o._zod.propValues?.[def.discriminator];
      if (!values || values.size === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
      for (const v of values) {
        if (map.has(v)) {
          throw new Error(`Duplicate discriminator value "${String(v)}"`);
        }
        map.set(v, o);
      }
    }
    return map;
  });
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isObject(input)) {
      payload.issues.push({
        code: "invalid_type",
        expected: "object",
        input,
        inst
      });
      return payload;
    }
    const opt = disc.value.get(input?.[def.discriminator]);
    if (opt) {
      return opt._zod.run(payload, ctx);
    }
    if (def.unionFallback || ctx.direction === "backward") {
      return _super(payload, ctx);
    }
    payload.issues.push({
      code: "invalid_union",
      errors: [],
      note: "No matching discriminator",
      discriminator: def.discriminator,
      options: Array.from(disc.value.keys()),
      input,
      path: [def.discriminator],
      inst
    });
    return payload;
  };
});
var $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left2, right2]) => {
        return handleIntersectionResults(payload, left2, right2);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0;index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = new Map;
  let unrecIssue;
  for (const iss of left.issues) {
    if (iss.code === "unrecognized_keys") {
      unrecIssue ?? (unrecIssue = iss);
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).l = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  for (const iss of right.issues) {
    if (iss.code === "unrecognized_keys") {
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).r = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length && unrecIssue) {
    result.issues.push({ ...unrecIssue, keys: bothKeys });
  }
  if (aborted(result))
    return result;
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
var $ZodTuple = /* @__PURE__ */ $constructor("$ZodTuple", (inst, def) => {
  $ZodType.init(inst, def);
  const items = def.items;
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        input,
        inst,
        expected: "tuple",
        code: "invalid_type"
      });
      return payload;
    }
    payload.value = [];
    const proms = [];
    const optinStart = getTupleOptStart(items, "optin");
    const optoutStart = getTupleOptStart(items, "optout");
    if (!def.rest) {
      if (input.length < optinStart) {
        payload.issues.push({
          code: "too_small",
          minimum: optinStart,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
        return payload;
      }
      if (input.length > items.length) {
        payload.issues.push({
          code: "too_big",
          maximum: items.length,
          inclusive: true,
          input,
          inst,
          origin: "array"
        });
      }
    }
    const itemResults = new Array(items.length);
    for (let i = 0;i < items.length; i++) {
      const r = items[i]._zod.run({ value: input[i], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((rr) => {
          itemResults[i] = rr;
        }));
      } else {
        itemResults[i] = r;
      }
    }
    if (def.rest) {
      let i = items.length - 1;
      const rest = input.slice(items.length);
      for (const el of rest) {
        i++;
        const result = def.rest._zod.run({ value: el, issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((r) => handleTupleResult(r, payload, i)));
        } else {
          handleTupleResult(result, payload, i);
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
    }
    return handleTupleResults(itemResults, payload, items, input, optoutStart);
  };
});
function getTupleOptStart(items, key) {
  for (let i = items.length - 1;i >= 0; i--) {
    if (items[i]._zod[key] !== "optional")
      return i + 1;
  }
  return 0;
}
function handleTupleResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
function handleTupleResults(itemResults, final, items, input, optoutStart) {
  for (let i = 0;i < items.length; i++) {
    const r = itemResults[i];
    const isPresent = i < input.length;
    if (r.issues.length) {
      if (!isPresent && i >= optoutStart) {
        final.value.length = i;
        break;
      }
      final.issues.push(...prefixIssues(i, r.issues));
    }
    final.value[i] = r.value;
  }
  for (let i = final.value.length - 1;i >= input.length; i--) {
    if (items[i]._zod.optout === "optional" && final.value[i] === undefined) {
      final.value.length = i;
    } else {
      break;
    }
  }
  return final;
}
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    const values = def.keyType._zod.values;
    if (values) {
      payload.value = {};
      const recordKeys = new Set;
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          recordKeys.add(typeof key === "number" ? key.toString() : key);
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
            continue;
          }
          const outKey = keyResult.value;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key, result2.issues));
              }
              payload.value[outKey] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!recordKeys.has(key)) {
          unrecognized = unrecognized ?? [];
          unrecognized.push(key);
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized
        });
      }
    } else {
      payload.value = {};
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        if (!Object.prototype.propertyIsEnumerable.call(input, key))
          continue;
        let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
        if (checkNumericKey) {
          const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
          if (retryResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (retryResult.issues.length === 0) {
            keyResult = retryResult;
          }
        }
        if (keyResult.issues.length) {
          if (def.mode === "loose") {
            payload.value[key] = input[key];
          } else {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
          }
          continue;
        }
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => {
            if (result2.issues.length) {
              payload.issues.push(...prefixIssues(key, result2.issues));
            }
            payload.value[keyResult.value] = result2.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[keyResult.value] = result.value;
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodMap = /* @__PURE__ */ $constructor("$ZodMap", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!(input instanceof Map)) {
      payload.issues.push({
        expected: "map",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    payload.value = new Map;
    for (const [key, value] of input) {
      const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
      const valueResult = def.valueType._zod.run({ value, issues: [] }, ctx);
      if (keyResult instanceof Promise || valueResult instanceof Promise) {
        proms.push(Promise.all([keyResult, valueResult]).then(([keyResult2, valueResult2]) => {
          handleMapResult(keyResult2, valueResult2, payload, key, input, inst, ctx);
        }));
      } else {
        handleMapResult(keyResult, valueResult, payload, key, input, inst, ctx);
      }
    }
    if (proms.length)
      return Promise.all(proms).then(() => payload);
    return payload;
  };
});
function handleMapResult(keyResult, valueResult, final, key, input, inst, ctx) {
  if (keyResult.issues.length) {
    if (propertyKeyTypes.has(typeof key)) {
      final.issues.push(...prefixIssues(key, keyResult.issues));
    } else {
      final.issues.push({
        code: "invalid_key",
        origin: "map",
        input,
        inst,
        issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      });
    }
  }
  if (valueResult.issues.length) {
    if (propertyKeyTypes.has(typeof key)) {
      final.issues.push(...prefixIssues(key, valueResult.issues));
    } else {
      final.issues.push({
        origin: "map",
        code: "invalid_element",
        input,
        inst,
        key,
        issues: valueResult.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      });
    }
  }
  final.value.set(keyResult.value, valueResult.value);
}
var $ZodSet = /* @__PURE__ */ $constructor("$ZodSet", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!(input instanceof Set)) {
      payload.issues.push({
        input,
        inst,
        expected: "set",
        code: "invalid_type"
      });
      return payload;
    }
    const proms = [];
    payload.value = new Set;
    for (const item of input) {
      const result = def.valueType._zod.run({ value: item, issues: [] }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleSetResult(result2, payload)));
      } else
        handleSetResult(result, payload);
    }
    if (proms.length)
      return Promise.all(proms).then(() => payload);
    return payload;
  };
});
function handleSetResult(result, final) {
  if (result.issues.length) {
    final.issues.push(...result.issues);
  }
  final.value.add(result.value);
}
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  if (def.values.length === 0) {
    throw new Error("Cannot create literal schema with no valid values");
  }
  const values = new Set(def.values);
  inst._zod.values = values;
  inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodFile = /* @__PURE__ */ $constructor("$ZodFile", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input instanceof File)
      return payload;
    payload.issues.push({
      expected: "file",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    const _out = def.transform(payload.value, payload);
    if (ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output2) => {
        payload.value = output2;
        payload.fallback = true;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError;
    }
    payload.value = _out;
    payload.fallback = true;
    return payload;
  };
});
function handleOptionalResult(result, input) {
  if (input === undefined && (result.issues.length || result.fallback)) {
    return { issues: [], value: undefined };
  }
  return result;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? new Set([...def.innerType._zod.values, undefined]) : undefined;
  });
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (def.innerType._zod.optin === "optional") {
      const input = payload.value;
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise)
        return result.then((r) => handleOptionalResult(r, input));
      return handleOptionalResult(result, input);
    }
    if (payload.value === undefined) {
      return payload;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
  inst._zod.parse = (payload, ctx) => {
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : undefined;
  });
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? new Set([...def.innerType._zod.values, null]) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleDefaultResult(result2, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === undefined) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => {
    const v = def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== undefined)) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleNonOptionalResult(result2, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === undefined) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
var $ZodSuccess = /* @__PURE__ */ $constructor("$ZodSuccess", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError("ZodSuccess");
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.issues.length === 0;
        return payload;
      });
    }
    payload.value = result.issues.length === 0;
    return payload;
  };
});
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.value;
        if (result2.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result2.issues.map((iss) => finalizeIssue(iss, ctx, config()))
            },
            input: payload.value
          });
          payload.issues = [];
          payload.fallback = true;
        }
        return payload;
      });
    }
    payload.value = result.value;
    if (result.issues.length) {
      payload.value = def.catchValue({
        ...payload,
        error: {
          issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        },
        input: payload.value
      });
      payload.issues = [];
      payload.fallback = true;
    }
    return payload;
  };
});
var $ZodNaN = /* @__PURE__ */ $constructor("$ZodNaN", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "number" || !Number.isNaN(payload.value)) {
      payload.issues.push({
        input: payload.value,
        inst,
        expected: "nan",
        code: "invalid_type"
      });
      return payload;
    }
    return payload;
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right2) => handlePipeResult(right2, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left2) => handlePipeResult(left2, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues, fallback: left.fallback }, ctx);
}
var $ZodCodec = /* @__PURE__ */ $constructor("$ZodCodec", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    const direction = ctx.direction || "forward";
    if (direction === "forward") {
      const left = def.in._zod.run(payload, ctx);
      if (left instanceof Promise) {
        return left.then((left2) => handleCodecAResult(left2, def, ctx));
      }
      return handleCodecAResult(left, def, ctx);
    } else {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right2) => handleCodecAResult(right2, def, ctx));
      }
      return handleCodecAResult(right, def, ctx);
    }
  };
});
function handleCodecAResult(result, def, ctx) {
  if (result.issues.length) {
    result.aborted = true;
    return result;
  }
  const direction = ctx.direction || "forward";
  if (direction === "forward") {
    const transformed = def.transform(result.value, result);
    if (transformed instanceof Promise) {
      return transformed.then((value) => handleCodecTxResult(result, value, def.out, ctx));
    }
    return handleCodecTxResult(result, transformed, def.out, ctx);
  } else {
    const transformed = def.reverseTransform(result.value, result);
    if (transformed instanceof Promise) {
      return transformed.then((value) => handleCodecTxResult(result, value, def.in, ctx));
    }
    return handleCodecTxResult(result, transformed, def.in, ctx);
  }
}
function handleCodecTxResult(left, value, nextSchema, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return nextSchema._zod.run({ value, issues: left.issues }, ctx);
}
var $ZodPreprocess = /* @__PURE__ */ $constructor("$ZodPreprocess", (inst, def) => {
  $ZodPipe.init(inst, def);
});
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
  defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodTemplateLiteral = /* @__PURE__ */ $constructor("$ZodTemplateLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  const regexParts = [];
  for (const part of def.parts) {
    if (typeof part === "object" && part !== null) {
      if (!part._zod.pattern) {
        throw new Error(`Invalid template literal part, no pattern found: ${[...part._zod.traits].shift()}`);
      }
      const source = part._zod.pattern instanceof RegExp ? part._zod.pattern.source : part._zod.pattern;
      if (!source)
        throw new Error(`Invalid template literal part: ${part._zod.traits}`);
      const start = source.startsWith("^") ? 1 : 0;
      const end = source.endsWith("$") ? source.length - 1 : source.length;
      regexParts.push(source.slice(start, end));
    } else if (part === null || primitiveTypes.has(typeof part)) {
      regexParts.push(escapeRegex(`${part}`));
    } else {
      throw new Error(`Invalid template literal part: ${part}`);
    }
  }
  inst._zod.pattern = new RegExp(`^${regexParts.join("")}$`);
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "string") {
      payload.issues.push({
        input: payload.value,
        inst,
        expected: "string",
        code: "invalid_type"
      });
      return payload;
    }
    inst._zod.pattern.lastIndex = 0;
    if (!inst._zod.pattern.test(payload.value)) {
      payload.issues.push({
        input: payload.value,
        inst,
        code: "invalid_format",
        format: def.format ?? "template_literal",
        pattern: inst._zod.pattern.source
      });
      return payload;
    }
    return payload;
  };
});
var $ZodFunction = /* @__PURE__ */ $constructor("$ZodFunction", (inst, def) => {
  $ZodType.init(inst, def);
  inst._def = def;
  inst._zod.def = def;
  inst.implement = (func) => {
    if (typeof func !== "function") {
      throw new Error("implement() must be called with a function");
    }
    return function(...args) {
      const parsedArgs = inst._def.input ? parse(inst._def.input, args) : args;
      const result = Reflect.apply(func, this, parsedArgs);
      if (inst._def.output) {
        return parse(inst._def.output, result);
      }
      return result;
    };
  };
  inst.implementAsync = (func) => {
    if (typeof func !== "function") {
      throw new Error("implementAsync() must be called with a function");
    }
    return async function(...args) {
      const parsedArgs = inst._def.input ? await parseAsync(inst._def.input, args) : args;
      const result = await Reflect.apply(func, this, parsedArgs);
      if (inst._def.output) {
        return await parseAsync(inst._def.output, result);
      }
      return result;
    };
  };
  inst._zod.parse = (payload, _ctx) => {
    if (typeof payload.value !== "function") {
      payload.issues.push({
        code: "invalid_type",
        expected: "function",
        input: payload.value,
        inst
      });
      return payload;
    }
    const hasPromiseOutput = inst._def.output && inst._def.output._zod.def.type === "promise";
    if (hasPromiseOutput) {
      payload.value = inst.implementAsync(payload.value);
    } else {
      payload.value = inst.implement(payload.value);
    }
    return payload;
  };
  inst.input = (...args) => {
    const F = inst.constructor;
    if (Array.isArray(args[0])) {
      return new F({
        type: "function",
        input: new $ZodTuple({
          type: "tuple",
          items: args[0],
          rest: args[1]
        }),
        output: inst._def.output
      });
    }
    return new F({
      type: "function",
      input: args[0],
      output: inst._def.output
    });
  };
  inst.output = (output) => {
    const F = inst.constructor;
    return new F({
      type: "function",
      input: inst._def.input,
      output
    });
  };
  return inst;
});
var $ZodPromise = /* @__PURE__ */ $constructor("$ZodPromise", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    return Promise.resolve(payload.value).then((inner) => def.innerType._zod.run({ value: inner, issues: [] }, ctx));
  };
});
var $ZodLazy = /* @__PURE__ */ $constructor("$ZodLazy", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "innerType", () => {
    const d = def;
    if (!d._cachedInner)
      d._cachedInner = def.getter();
    return d._cachedInner;
  });
  defineLazy(inst._zod, "pattern", () => inst._zod.innerType?._zod?.pattern);
  defineLazy(inst._zod, "propValues", () => inst._zod.innerType?._zod?.propValues);
  defineLazy(inst._zod, "optin", () => inst._zod.innerType?._zod?.optin ?? undefined);
  defineLazy(inst._zod, "optout", () => inst._zod.innerType?._zod?.optout ?? undefined);
  inst._zod.parse = (payload, ctx) => {
    const inner = inst._zod.innerType;
    return inner._zod.run(payload, ctx);
  };
});
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r2) => handleRefineResult(r2, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      path: [...inst._zod.def.path ?? []],
      continue: !inst._zod.def.abort
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}
// node_modules/zod/v4/locales/index.js
var exports_locales = {};
__export(exports_locales, {
  zhTW: () => zh_TW_default,
  zhCN: () => zh_CN_default,
  yo: () => yo_default,
  vi: () => vi_default,
  uz: () => uz_default,
  ur: () => ur_default,
  uk: () => uk_default,
  ua: () => ua_default,
  tr: () => tr_default,
  th: () => th_default,
  ta: () => ta_default,
  sv: () => sv_default,
  sl: () => sl_default,
  ru: () => ru_default,
  ro: () => ro_default,
  pt: () => pt_default,
  ps: () => ps_default,
  pl: () => pl_default,
  ota: () => ota_default,
  no: () => no_default,
  nl: () => nl_default,
  ms: () => ms_default,
  mk: () => mk_default,
  lt: () => lt_default,
  ko: () => ko_default,
  km: () => km_default,
  kh: () => kh_default,
  ka: () => ka_default,
  ja: () => ja_default,
  it: () => it_default,
  is: () => is_default,
  id: () => id_default,
  hy: () => hy_default,
  hu: () => hu_default,
  hr: () => hr_default,
  he: () => he_default,
  frCA: () => fr_CA_default,
  fr: () => fr_default,
  fi: () => fi_default,
  fa: () => fa_default,
  es: () => es_default,
  eo: () => eo_default,
  en: () => en_default,
  el: () => el_default,
  de: () => de_default,
  da: () => da_default,
  cs: () => cs_default,
  ca: () => ca_default,
  bg: () => bg_default,
  be: () => be_default,
  az: () => az_default,
  ar: () => ar_default
});

// node_modules/zod/v4/locales/ar.js
var error = () => {
  const Sizable = {
    string: { unit: "حرف", verb: "أن يحوي" },
    file: { unit: "بايت", verb: "أن يحوي" },
    array: { unit: "عنصر", verb: "أن يحوي" },
    set: { unit: "عنصر", verb: "أن يحوي" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "مدخل",
    email: "بريد إلكتروني",
    url: "رابط",
    emoji: "إيموجي",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "تاريخ ووقت بمعيار ISO",
    date: "تاريخ بمعيار ISO",
    time: "وقت بمعيار ISO",
    duration: "مدة بمعيار ISO",
    ipv4: "عنوان IPv4",
    ipv6: "عنوان IPv6",
    cidrv4: "مدى عناوين بصيغة IPv4",
    cidrv6: "مدى عناوين بصيغة IPv6",
    base64: "نَص بترميز base64-encoded",
    base64url: "نَص بترميز base64url-encoded",
    json_string: "نَص على هيئة JSON",
    e164: "رقم هاتف بمعيار E.164",
    jwt: "JWT",
    template_literal: "مدخل"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `مدخلات غير مقبولة: يفترض إدخال instanceof ${issue2.expected}، ولكن تم إدخال ${received}`;
        }
        return `مدخلات غير مقبولة: يفترض إدخال ${expected}، ولكن تم إدخال ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `مدخلات غير مقبولة: يفترض إدخال ${stringifyPrimitive(issue2.values[0])}`;
        return `اختيار غير مقبول: يتوقع انتقاء أحد هذه الخيارات: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return ` أكبر من اللازم: يفترض أن تكون ${issue2.origin ?? "القيمة"} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "عنصر"}`;
        return `أكبر من اللازم: يفترض أن تكون ${issue2.origin ?? "القيمة"} ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `أصغر من اللازم: يفترض لـ ${issue2.origin} أن يكون ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `أصغر من اللازم: يفترض لـ ${issue2.origin} أن يكون ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `نَص غير مقبول: يجب أن يبدأ بـ "${issue2.prefix}"`;
        if (_issue.format === "ends_with")
          return `نَص غير مقبول: يجب أن ينتهي بـ "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `نَص غير مقبول: يجب أن يتضمَّن "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `نَص غير مقبول: يجب أن يطابق النمط ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} غير مقبول`;
      }
      case "not_multiple_of":
        return `رقم غير مقبول: يجب أن يكون من مضاعفات ${issue2.divisor}`;
      case "unrecognized_keys":
        return `معرف${issue2.keys.length > 1 ? "ات" : ""} غريب${issue2.keys.length > 1 ? "ة" : ""}: ${joinValues(issue2.keys, "، ")}`;
      case "invalid_key":
        return `معرف غير مقبول في ${issue2.origin}`;
      case "invalid_union":
        return "مدخل غير مقبول";
      case "invalid_element":
        return `مدخل غير مقبول في ${issue2.origin}`;
      default:
        return "مدخل غير مقبول";
    }
  };
};
function ar_default() {
  return {
    localeError: error()
  };
}
// node_modules/zod/v4/locales/az.js
var error2 = () => {
  const Sizable = {
    string: { unit: "simvol", verb: "olmalıdır" },
    file: { unit: "bayt", verb: "olmalıdır" },
    array: { unit: "element", verb: "olmalıdır" },
    set: { unit: "element", verb: "olmalıdır" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Yanlış dəyər: gözlənilən instanceof ${issue2.expected}, daxil olan ${received}`;
        }
        return `Yanlış dəyər: gözlənilən ${expected}, daxil olan ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Yanlış dəyər: gözlənilən ${stringifyPrimitive(issue2.values[0])}`;
        return `Yanlış seçim: aşağıdakılardan biri olmalıdır: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Çox böyük: gözlənilən ${issue2.origin ?? "dəyər"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element"}`;
        return `Çox böyük: gözlənilən ${issue2.origin ?? "dəyər"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Çox kiçik: gözlənilən ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        return `Çox kiçik: gözlənilən ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Yanlış mətn: "${_issue.prefix}" ilə başlamalıdır`;
        if (_issue.format === "ends_with")
          return `Yanlış mətn: "${_issue.suffix}" ilə bitməlidir`;
        if (_issue.format === "includes")
          return `Yanlış mətn: "${_issue.includes}" daxil olmalıdır`;
        if (_issue.format === "regex")
          return `Yanlış mətn: ${_issue.pattern} şablonuna uyğun olmalıdır`;
        return `Yanlış ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Yanlış ədəd: ${issue2.divisor} ilə bölünə bilən olmalıdır`;
      case "unrecognized_keys":
        return `Tanınmayan açar${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} daxilində yanlış açar`;
      case "invalid_union":
        return "Yanlış dəyər";
      case "invalid_element":
        return `${issue2.origin} daxilində yanlış dəyər`;
      default:
        return `Yanlış dəyər`;
    }
  };
};
function az_default() {
  return {
    localeError: error2()
  };
}
// node_modules/zod/v4/locales/be.js
function getBelarusianPlural(count, one, few, many) {
  const absCount = Math.abs(count);
  const lastDigit = absCount % 10;
  const lastTwoDigits = absCount % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return many;
  }
  if (lastDigit === 1) {
    return one;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }
  return many;
}
var error3 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "сімвал",
        few: "сімвалы",
        many: "сімвалаў"
      },
      verb: "мець"
    },
    array: {
      unit: {
        one: "элемент",
        few: "элементы",
        many: "элементаў"
      },
      verb: "мець"
    },
    set: {
      unit: {
        one: "элемент",
        few: "элементы",
        many: "элементаў"
      },
      verb: "мець"
    },
    file: {
      unit: {
        one: "байт",
        few: "байты",
        many: "байтаў"
      },
      verb: "мець"
    }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "увод",
    email: "email адрас",
    url: "URL",
    emoji: "эмодзі",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO дата і час",
    date: "ISO дата",
    time: "ISO час",
    duration: "ISO працягласць",
    ipv4: "IPv4 адрас",
    ipv6: "IPv6 адрас",
    cidrv4: "IPv4 дыяпазон",
    cidrv6: "IPv6 дыяпазон",
    base64: "радок у фармаце base64",
    base64url: "радок у фармаце base64url",
    json_string: "JSON радок",
    e164: "нумар E.164",
    jwt: "JWT",
    template_literal: "увод"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "лік",
    array: "масіў"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Няправільны ўвод: чакаўся instanceof ${issue2.expected}, атрымана ${received}`;
        }
        return `Няправільны ўвод: чакаўся ${expected}, атрымана ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Няправільны ўвод: чакалася ${stringifyPrimitive(issue2.values[0])}`;
        return `Няправільны варыянт: чакаўся адзін з ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const maxValue = Number(issue2.maximum);
          const unit = getBelarusianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `Занадта вялікі: чакалася, што ${issue2.origin ?? "значэнне"} павінна ${sizing.verb} ${adj}${issue2.maximum.toString()} ${unit}`;
        }
        return `Занадта вялікі: чакалася, што ${issue2.origin ?? "значэнне"} павінна быць ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const minValue = Number(issue2.minimum);
          const unit = getBelarusianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `Занадта малы: чакалася, што ${issue2.origin} павінна ${sizing.verb} ${adj}${issue2.minimum.toString()} ${unit}`;
        }
        return `Занадта малы: чакалася, што ${issue2.origin} павінна быць ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Няправільны радок: павінен пачынацца з "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Няправільны радок: павінен заканчвацца на "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Няправільны радок: павінен змяшчаць "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Няправільны радок: павінен адпавядаць шаблону ${_issue.pattern}`;
        return `Няправільны ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Няправільны лік: павінен быць кратным ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Нераспазнаны ${issue2.keys.length > 1 ? "ключы" : "ключ"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Няправільны ключ у ${issue2.origin}`;
      case "invalid_union":
        return "Няправільны ўвод";
      case "invalid_element":
        return `Няправільнае значэнне ў ${issue2.origin}`;
      default:
        return `Няправільны ўвод`;
    }
  };
};
function be_default() {
  return {
    localeError: error3()
  };
}
// node_modules/zod/v4/locales/bg.js
var error4 = () => {
  const Sizable = {
    string: { unit: "символа", verb: "да съдържа" },
    file: { unit: "байта", verb: "да съдържа" },
    array: { unit: "елемента", verb: "да съдържа" },
    set: { unit: "елемента", verb: "да съдържа" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "вход",
    email: "имейл адрес",
    url: "URL",
    emoji: "емоджи",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO време",
    date: "ISO дата",
    time: "ISO време",
    duration: "ISO продължителност",
    ipv4: "IPv4 адрес",
    ipv6: "IPv6 адрес",
    cidrv4: "IPv4 диапазон",
    cidrv6: "IPv6 диапазон",
    base64: "base64-кодиран низ",
    base64url: "base64url-кодиран низ",
    json_string: "JSON низ",
    e164: "E.164 номер",
    jwt: "JWT",
    template_literal: "вход"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "число",
    array: "масив"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Невалиден вход: очакван instanceof ${issue2.expected}, получен ${received}`;
        }
        return `Невалиден вход: очакван ${expected}, получен ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Невалиден вход: очакван ${stringifyPrimitive(issue2.values[0])}`;
        return `Невалидна опция: очаквано едно от ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Твърде голямо: очаква се ${issue2.origin ?? "стойност"} да съдържа ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "елемента"}`;
        return `Твърде голямо: очаква се ${issue2.origin ?? "стойност"} да бъде ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Твърде малко: очаква се ${issue2.origin} да съдържа ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Твърде малко: очаква се ${issue2.origin} да бъде ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Невалиден низ: трябва да започва с "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Невалиден низ: трябва да завършва с "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Невалиден низ: трябва да включва "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Невалиден низ: трябва да съвпада с ${_issue.pattern}`;
        let invalid_adj = "Невалиден";
        if (_issue.format === "emoji")
          invalid_adj = "Невалидно";
        if (_issue.format === "datetime")
          invalid_adj = "Невалидно";
        if (_issue.format === "date")
          invalid_adj = "Невалидна";
        if (_issue.format === "time")
          invalid_adj = "Невалидно";
        if (_issue.format === "duration")
          invalid_adj = "Невалидна";
        return `${invalid_adj} ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Невалидно число: трябва да бъде кратно на ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Неразпознат${issue2.keys.length > 1 ? "и" : ""} ключ${issue2.keys.length > 1 ? "ове" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Невалиден ключ в ${issue2.origin}`;
      case "invalid_union":
        return "Невалиден вход";
      case "invalid_element":
        return `Невалидна стойност в ${issue2.origin}`;
      default:
        return `Невалиден вход`;
    }
  };
};
function bg_default() {
  return {
    localeError: error4()
  };
}
// node_modules/zod/v4/locales/ca.js
var error5 = () => {
  const Sizable = {
    string: { unit: "caràcters", verb: "contenir" },
    file: { unit: "bytes", verb: "contenir" },
    array: { unit: "elements", verb: "contenir" },
    set: { unit: "elements", verb: "contenir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "entrada",
    email: "adreça electrònica",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data i hora ISO",
    date: "data ISO",
    time: "hora ISO",
    duration: "durada ISO",
    ipv4: "adreça IPv4",
    ipv6: "adreça IPv6",
    cidrv4: "rang IPv4",
    cidrv6: "rang IPv6",
    base64: "cadena codificada en base64",
    base64url: "cadena codificada en base64url",
    json_string: "cadena JSON",
    e164: "número E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Tipus invàlid: s'esperava instanceof ${issue2.expected}, s'ha rebut ${received}`;
        }
        return `Tipus invàlid: s'esperava ${expected}, s'ha rebut ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Valor invàlid: s'esperava ${stringifyPrimitive(issue2.values[0])}`;
        return `Opció invàlida: s'esperava una de ${joinValues(issue2.values, " o ")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "com a màxim" : "menys de";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Massa gran: s'esperava que ${issue2.origin ?? "el valor"} contingués ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Massa gran: s'esperava que ${issue2.origin ?? "el valor"} fos ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "com a mínim" : "més de";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Massa petit: s'esperava que ${issue2.origin} contingués ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Massa petit: s'esperava que ${issue2.origin} fos ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Format invàlid: ha de començar amb "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Format invàlid: ha d'acabar amb "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Format invàlid: ha d'incloure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Format invàlid: ha de coincidir amb el patró ${_issue.pattern}`;
        return `Format invàlid per a ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Número invàlid: ha de ser múltiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Clau${issue2.keys.length > 1 ? "s" : ""} no reconeguda${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Clau invàlida a ${issue2.origin}`;
      case "invalid_union":
        return "Entrada invàlida";
      case "invalid_element":
        return `Element invàlid a ${issue2.origin}`;
      default:
        return `Entrada invàlida`;
    }
  };
};
function ca_default() {
  return {
    localeError: error5()
  };
}
// node_modules/zod/v4/locales/cs.js
var error6 = () => {
  const Sizable = {
    string: { unit: "znaků", verb: "mít" },
    file: { unit: "bajtů", verb: "mít" },
    array: { unit: "prvků", verb: "mít" },
    set: { unit: "prvků", verb: "mít" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "regulární výraz",
    email: "e-mailová adresa",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "datum a čas ve formátu ISO",
    date: "datum ve formátu ISO",
    time: "čas ve formátu ISO",
    duration: "doba trvání ISO",
    ipv4: "IPv4 adresa",
    ipv6: "IPv6 adresa",
    cidrv4: "rozsah IPv4",
    cidrv6: "rozsah IPv6",
    base64: "řetězec zakódovaný ve formátu base64",
    base64url: "řetězec zakódovaný ve formátu base64url",
    json_string: "řetězec ve formátu JSON",
    e164: "číslo E.164",
    jwt: "JWT",
    template_literal: "vstup"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "číslo",
    string: "řetězec",
    function: "funkce",
    array: "pole"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Neplatný vstup: očekáváno instanceof ${issue2.expected}, obdrženo ${received}`;
        }
        return `Neplatný vstup: očekáváno ${expected}, obdrženo ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Neplatný vstup: očekáváno ${stringifyPrimitive(issue2.values[0])}`;
        return `Neplatná možnost: očekávána jedna z hodnot ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Hodnota je příliš velká: ${issue2.origin ?? "hodnota"} musí mít ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "prvků"}`;
        }
        return `Hodnota je příliš velká: ${issue2.origin ?? "hodnota"} musí být ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Hodnota je příliš malá: ${issue2.origin ?? "hodnota"} musí mít ${adj}${issue2.minimum.toString()} ${sizing.unit ?? "prvků"}`;
        }
        return `Hodnota je příliš malá: ${issue2.origin ?? "hodnota"} musí být ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Neplatný řetězec: musí začínat na "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Neplatný řetězec: musí končit na "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Neplatný řetězec: musí obsahovat "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Neplatný řetězec: musí odpovídat vzoru ${_issue.pattern}`;
        return `Neplatný formát ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Neplatné číslo: musí být násobkem ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Neznámé klíče: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Neplatný klíč v ${issue2.origin}`;
      case "invalid_union":
        return "Neplatný vstup";
      case "invalid_element":
        return `Neplatná hodnota v ${issue2.origin}`;
      default:
        return `Neplatný vstup`;
    }
  };
};
function cs_default() {
  return {
    localeError: error6()
  };
}
// node_modules/zod/v4/locales/da.js
var error7 = () => {
  const Sizable = {
    string: { unit: "tegn", verb: "havde" },
    file: { unit: "bytes", verb: "havde" },
    array: { unit: "elementer", verb: "indeholdt" },
    set: { unit: "elementer", verb: "indeholdt" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "e-mailadresse",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO dato- og klokkeslæt",
    date: "ISO-dato",
    time: "ISO-klokkeslæt",
    duration: "ISO-varighed",
    ipv4: "IPv4-område",
    ipv6: "IPv6-område",
    cidrv4: "IPv4-spektrum",
    cidrv6: "IPv6-spektrum",
    base64: "base64-kodet streng",
    base64url: "base64url-kodet streng",
    json_string: "JSON-streng",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN",
    string: "streng",
    number: "tal",
    boolean: "boolean",
    array: "liste",
    object: "objekt",
    set: "sæt",
    file: "fil"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ugyldigt input: forventede instanceof ${issue2.expected}, fik ${received}`;
        }
        return `Ugyldigt input: forventede ${expected}, fik ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ugyldig værdi: forventede ${stringifyPrimitive(issue2.values[0])}`;
        return `Ugyldigt valg: forventede en af følgende ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing)
          return `For stor: forventede ${origin ?? "value"} ${sizing.verb} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "elementer"}`;
        return `For stor: forventede ${origin ?? "value"} havde ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing) {
          return `For lille: forventede ${origin} ${sizing.verb} ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `For lille: forventede ${origin} havde ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ugyldig streng: skal starte med "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Ugyldig streng: skal ende med "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ugyldig streng: skal indeholde "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ugyldig streng: skal matche mønsteret ${_issue.pattern}`;
        return `Ugyldig ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ugyldigt tal: skal være deleligt med ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Ukendte nøgler" : "Ukendt nøgle"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ugyldig nøgle i ${issue2.origin}`;
      case "invalid_union":
        return "Ugyldigt input: matcher ingen af de tilladte typer";
      case "invalid_element":
        return `Ugyldig værdi i ${issue2.origin}`;
      default:
        return `Ugyldigt input`;
    }
  };
};
function da_default() {
  return {
    localeError: error7()
  };
}
// node_modules/zod/v4/locales/de.js
var error8 = () => {
  const Sizable = {
    string: { unit: "Zeichen", verb: "zu haben" },
    file: { unit: "Bytes", verb: "zu haben" },
    array: { unit: "Elemente", verb: "zu haben" },
    set: { unit: "Elemente", verb: "zu haben" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "Eingabe",
    email: "E-Mail-Adresse",
    url: "URL",
    emoji: "Emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-Datum und -Uhrzeit",
    date: "ISO-Datum",
    time: "ISO-Uhrzeit",
    duration: "ISO-Dauer",
    ipv4: "IPv4-Adresse",
    ipv6: "IPv6-Adresse",
    cidrv4: "IPv4-Bereich",
    cidrv6: "IPv6-Bereich",
    base64: "Base64-codierter String",
    base64url: "Base64-URL-codierter String",
    json_string: "JSON-String",
    e164: "E.164-Nummer",
    jwt: "JWT",
    template_literal: "Eingabe"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "Zahl",
    array: "Array"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ungültige Eingabe: erwartet instanceof ${issue2.expected}, erhalten ${received}`;
        }
        return `Ungültige Eingabe: erwartet ${expected}, erhalten ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ungültige Eingabe: erwartet ${stringifyPrimitive(issue2.values[0])}`;
        return `Ungültige Option: erwartet eine von ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Zu groß: erwartet, dass ${issue2.origin ?? "Wert"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "Elemente"} hat`;
        return `Zu groß: erwartet, dass ${issue2.origin ?? "Wert"} ${adj}${issue2.maximum.toString()} ist`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Zu klein: erwartet, dass ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} hat`;
        }
        return `Zu klein: erwartet, dass ${issue2.origin} ${adj}${issue2.minimum.toString()} ist`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ungültiger String: muss mit "${_issue.prefix}" beginnen`;
        if (_issue.format === "ends_with")
          return `Ungültiger String: muss mit "${_issue.suffix}" enden`;
        if (_issue.format === "includes")
          return `Ungültiger String: muss "${_issue.includes}" enthalten`;
        if (_issue.format === "regex")
          return `Ungültiger String: muss dem Muster ${_issue.pattern} entsprechen`;
        return `Ungültig: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ungültige Zahl: muss ein Vielfaches von ${issue2.divisor} sein`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Unbekannte Schlüssel" : "Unbekannter Schlüssel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ungültiger Schlüssel in ${issue2.origin}`;
      case "invalid_union":
        return "Ungültige Eingabe";
      case "invalid_element":
        return `Ungültiger Wert in ${issue2.origin}`;
      default:
        return `Ungültige Eingabe`;
    }
  };
};
function de_default() {
  return {
    localeError: error8()
  };
}
// node_modules/zod/v4/locales/el.js
var error9 = () => {
  const Sizable = {
    string: { unit: "χαρακτήρες", verb: "να έχει" },
    file: { unit: "bytes", verb: "να έχει" },
    array: { unit: "στοιχεία", verb: "να έχει" },
    set: { unit: "στοιχεία", verb: "να έχει" },
    map: { unit: "καταχωρήσεις", verb: "να έχει" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "είσοδος",
    email: "διεύθυνση email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO ημερομηνία και ώρα",
    date: "ISO ημερομηνία",
    time: "ISO ώρα",
    duration: "ISO διάρκεια",
    ipv4: "διεύθυνση IPv4",
    ipv6: "διεύθυνση IPv6",
    mac: "διεύθυνση MAC",
    cidrv4: "εύρος IPv4",
    cidrv6: "εύρος IPv6",
    base64: "συμβολοσειρά κωδικοποιημένη σε base64",
    base64url: "συμβολοσειρά κωδικοποιημένη σε base64url",
    json_string: "συμβολοσειρά JSON",
    e164: "αριθμός E.164",
    jwt: "JWT",
    template_literal: "είσοδος"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (typeof issue2.expected === "string" && /^[A-Z]/.test(issue2.expected)) {
          return `Μη έγκυρη είσοδος: αναμενόταν instanceof ${issue2.expected}, λήφθηκε ${received}`;
        }
        return `Μη έγκυρη είσοδος: αναμενόταν ${expected}, λήφθηκε ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Μη έγκυρη είσοδος: αναμενόταν ${stringifyPrimitive(issue2.values[0])}`;
        return `Μη έγκυρη επιλογή: αναμενόταν ένα από ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Πολύ μεγάλο: αναμενόταν ${issue2.origin ?? "τιμή"} να έχει ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "στοιχεία"}`;
        return `Πολύ μεγάλο: αναμενόταν ${issue2.origin ?? "τιμή"} να είναι ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Πολύ μικρό: αναμενόταν ${issue2.origin} να έχει ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Πολύ μικρό: αναμενόταν ${issue2.origin} να είναι ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Μη έγκυρη συμβολοσειρά: πρέπει να ξεκινά με "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Μη έγκυρη συμβολοσειρά: πρέπει να τελειώνει με "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Μη έγκυρη συμβολοσειρά: πρέπει να περιέχει "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Μη έγκυρη συμβολοσειρά: πρέπει να ταιριάζει με το μοτίβο ${_issue.pattern}`;
        return `Μη έγκυρο: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Μη έγκυρος αριθμός: πρέπει να είναι πολλαπλάσιο του ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Άγνωστ${issue2.keys.length > 1 ? "α" : "ο"} κλειδ${issue2.keys.length > 1 ? "ιά" : "ί"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Μη έγκυρο κλειδί στο ${issue2.origin}`;
      case "invalid_union":
        return "Μη έγκυρη είσοδος";
      case "invalid_element":
        return `Μη έγκυρη τιμή στο ${issue2.origin}`;
      default:
        return `Μη έγκυρη είσοδος`;
    }
  };
};
function el_default() {
  return {
    localeError: error9()
  };
}
// node_modules/zod/v4/locales/en.js
var error10 = () => {
  const Sizable = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" },
    map: { unit: "entries", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    mac: "MAC address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        return `Invalid input: expected ${expected}, received ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `Invalid option: expected one of ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Too big: expected ${issue2.origin ?? "value"} to have ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Too big: expected ${issue2.origin ?? "value"} to be ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Too small: expected ${issue2.origin} to have ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Too small: expected ${issue2.origin} to be ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Invalid string: must start with "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Invalid string: must end with "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Invalid string: must include "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Invalid string: must match pattern ${_issue.pattern}`;
        return `Invalid ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${issue2.origin}`;
      case "invalid_union":
        if (issue2.options && Array.isArray(issue2.options) && issue2.options.length > 0) {
          const opts = issue2.options.map((o) => `'${o}'`).join(" | ");
          return `Invalid discriminator value. Expected ${opts}`;
        }
        return "Invalid input";
      case "invalid_element":
        return `Invalid value in ${issue2.origin}`;
      default:
        return `Invalid input`;
    }
  };
};
function en_default() {
  return {
    localeError: error10()
  };
}
// node_modules/zod/v4/locales/eo.js
var error11 = () => {
  const Sizable = {
    string: { unit: "karaktrojn", verb: "havi" },
    file: { unit: "bajtojn", verb: "havi" },
    array: { unit: "elementojn", verb: "havi" },
    set: { unit: "elementojn", verb: "havi" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "enigo",
    email: "retadreso",
    url: "URL",
    emoji: "emoĝio",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-datotempo",
    date: "ISO-dato",
    time: "ISO-tempo",
    duration: "ISO-daŭro",
    ipv4: "IPv4-adreso",
    ipv6: "IPv6-adreso",
    cidrv4: "IPv4-rango",
    cidrv6: "IPv6-rango",
    base64: "64-ume kodita karaktraro",
    base64url: "URL-64-ume kodita karaktraro",
    json_string: "JSON-karaktraro",
    e164: "E.164-nombro",
    jwt: "JWT",
    template_literal: "enigo"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "nombro",
    array: "tabelo",
    null: "senvalora"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Nevalida enigo: atendiĝis instanceof ${issue2.expected}, riceviĝis ${received}`;
        }
        return `Nevalida enigo: atendiĝis ${expected}, riceviĝis ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Nevalida enigo: atendiĝis ${stringifyPrimitive(issue2.values[0])}`;
        return `Nevalida opcio: atendiĝis unu el ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Tro granda: atendiĝis ke ${issue2.origin ?? "valoro"} havu ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementojn"}`;
        return `Tro granda: atendiĝis ke ${issue2.origin ?? "valoro"} havu ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Tro malgranda: atendiĝis ke ${issue2.origin} havu ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Tro malgranda: atendiĝis ke ${issue2.origin} estu ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Nevalida karaktraro: devas komenciĝi per "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Nevalida karaktraro: devas finiĝi per "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Nevalida karaktraro: devas inkluzivi "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Nevalida karaktraro: devas kongrui kun la modelo ${_issue.pattern}`;
        return `Nevalida ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Nevalida nombro: devas esti oblo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Nekonata${issue2.keys.length > 1 ? "j" : ""} ŝlosilo${issue2.keys.length > 1 ? "j" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Nevalida ŝlosilo en ${issue2.origin}`;
      case "invalid_union":
        return "Nevalida enigo";
      case "invalid_element":
        return `Nevalida valoro en ${issue2.origin}`;
      default:
        return `Nevalida enigo`;
    }
  };
};
function eo_default() {
  return {
    localeError: error11()
  };
}
// node_modules/zod/v4/locales/es.js
var error12 = () => {
  const Sizable = {
    string: { unit: "caracteres", verb: "tener" },
    file: { unit: "bytes", verb: "tener" },
    array: { unit: "elementos", verb: "tener" },
    set: { unit: "elementos", verb: "tener" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "entrada",
    email: "dirección de correo electrónico",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "fecha y hora ISO",
    date: "fecha ISO",
    time: "hora ISO",
    duration: "duración ISO",
    ipv4: "dirección IPv4",
    ipv6: "dirección IPv6",
    cidrv4: "rango IPv4",
    cidrv6: "rango IPv6",
    base64: "cadena codificada en base64",
    base64url: "URL codificada en base64",
    json_string: "cadena JSON",
    e164: "número E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  const TypeDictionary = {
    nan: "NaN",
    string: "texto",
    number: "número",
    boolean: "booleano",
    array: "arreglo",
    object: "objeto",
    set: "conjunto",
    file: "archivo",
    date: "fecha",
    bigint: "número grande",
    symbol: "símbolo",
    undefined: "indefinido",
    null: "nulo",
    function: "función",
    map: "mapa",
    record: "registro",
    tuple: "tupla",
    enum: "enumeración",
    union: "unión",
    literal: "literal",
    promise: "promesa",
    void: "vacío",
    never: "nunca",
    unknown: "desconocido",
    any: "cualquiera"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Entrada inválida: se esperaba instanceof ${issue2.expected}, recibido ${received}`;
        }
        return `Entrada inválida: se esperaba ${expected}, recibido ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrada inválida: se esperaba ${stringifyPrimitive(issue2.values[0])}`;
        return `Opción inválida: se esperaba una de ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing)
          return `Demasiado grande: se esperaba que ${origin ?? "valor"} tuviera ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementos"}`;
        return `Demasiado grande: se esperaba que ${origin ?? "valor"} fuera ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing) {
          return `Demasiado pequeño: se esperaba que ${origin} tuviera ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Demasiado pequeño: se esperaba que ${origin} fuera ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Cadena inválida: debe comenzar con "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Cadena inválida: debe terminar en "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Cadena inválida: debe incluir "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Cadena inválida: debe coincidir con el patrón ${_issue.pattern}`;
        return `Inválido ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Número inválido: debe ser múltiplo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Llave${issue2.keys.length > 1 ? "s" : ""} desconocida${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Llave inválida en ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
      case "invalid_union":
        return "Entrada inválida";
      case "invalid_element":
        return `Valor inválido en ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
      default:
        return `Entrada inválida`;
    }
  };
};
function es_default() {
  return {
    localeError: error12()
  };
}
// node_modules/zod/v4/locales/fa.js
var error13 = () => {
  const Sizable = {
    string: { unit: "کاراکتر", verb: "داشته باشد" },
    file: { unit: "بایت", verb: "داشته باشد" },
    array: { unit: "آیتم", verb: "داشته باشد" },
    set: { unit: "آیتم", verb: "داشته باشد" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "ورودی",
    email: "آدرس ایمیل",
    url: "URL",
    emoji: "ایموجی",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "تاریخ و زمان ایزو",
    date: "تاریخ ایزو",
    time: "زمان ایزو",
    duration: "مدت زمان ایزو",
    ipv4: "IPv4 آدرس",
    ipv6: "IPv6 آدرس",
    cidrv4: "IPv4 دامنه",
    cidrv6: "IPv6 دامنه",
    base64: "base64-encoded رشته",
    base64url: "base64url-encoded رشته",
    json_string: "JSON رشته",
    e164: "E.164 عدد",
    jwt: "JWT",
    template_literal: "ورودی"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "عدد",
    array: "آرایه"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `ورودی نامعتبر: می‌بایست instanceof ${issue2.expected} می‌بود، ${received} دریافت شد`;
        }
        return `ورودی نامعتبر: می‌بایست ${expected} می‌بود، ${received} دریافت شد`;
      }
      case "invalid_value":
        if (issue2.values.length === 1) {
          return `ورودی نامعتبر: می‌بایست ${stringifyPrimitive(issue2.values[0])} می‌بود`;
        }
        return `گزینه نامعتبر: می‌بایست یکی از ${joinValues(issue2.values, "|")} می‌بود`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `خیلی بزرگ: ${issue2.origin ?? "مقدار"} باید ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "عنصر"} باشد`;
        }
        return `خیلی بزرگ: ${issue2.origin ?? "مقدار"} باید ${adj}${issue2.maximum.toString()} باشد`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `خیلی کوچک: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} ${sizing.unit} باشد`;
        }
        return `خیلی کوچک: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} باشد`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `رشته نامعتبر: باید با "${_issue.prefix}" شروع شود`;
        }
        if (_issue.format === "ends_with") {
          return `رشته نامعتبر: باید با "${_issue.suffix}" تمام شود`;
        }
        if (_issue.format === "includes") {
          return `رشته نامعتبر: باید شامل "${_issue.includes}" باشد`;
        }
        if (_issue.format === "regex") {
          return `رشته نامعتبر: باید با الگوی ${_issue.pattern} مطابقت داشته باشد`;
        }
        return `${FormatDictionary[_issue.format] ?? issue2.format} نامعتبر`;
      }
      case "not_multiple_of":
        return `عدد نامعتبر: باید مضرب ${issue2.divisor} باشد`;
      case "unrecognized_keys":
        return `کلید${issue2.keys.length > 1 ? "های" : ""} ناشناس: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `کلید ناشناس در ${issue2.origin}`;
      case "invalid_union":
        return `ورودی نامعتبر`;
      case "invalid_element":
        return `مقدار نامعتبر در ${issue2.origin}`;
      default:
        return `ورودی نامعتبر`;
    }
  };
};
function fa_default() {
  return {
    localeError: error13()
  };
}
// node_modules/zod/v4/locales/fi.js
var error14 = () => {
  const Sizable = {
    string: { unit: "merkkiä", subject: "merkkijonon" },
    file: { unit: "tavua", subject: "tiedoston" },
    array: { unit: "alkiota", subject: "listan" },
    set: { unit: "alkiota", subject: "joukon" },
    number: { unit: "", subject: "luvun" },
    bigint: { unit: "", subject: "suuren kokonaisluvun" },
    int: { unit: "", subject: "kokonaisluvun" },
    date: { unit: "", subject: "päivämäärän" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "säännöllinen lauseke",
    email: "sähköpostiosoite",
    url: "URL-osoite",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-aikaleima",
    date: "ISO-päivämäärä",
    time: "ISO-aika",
    duration: "ISO-kesto",
    ipv4: "IPv4-osoite",
    ipv6: "IPv6-osoite",
    cidrv4: "IPv4-alue",
    cidrv6: "IPv6-alue",
    base64: "base64-koodattu merkkijono",
    base64url: "base64url-koodattu merkkijono",
    json_string: "JSON-merkkijono",
    e164: "E.164-luku",
    jwt: "JWT",
    template_literal: "templaattimerkkijono"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Virheellinen tyyppi: odotettiin instanceof ${issue2.expected}, oli ${received}`;
        }
        return `Virheellinen tyyppi: odotettiin ${expected}, oli ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Virheellinen syöte: täytyy olla ${stringifyPrimitive(issue2.values[0])}`;
        return `Virheellinen valinta: täytyy olla yksi seuraavista: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Liian suuri: ${sizing.subject} täytyy olla ${adj}${issue2.maximum.toString()} ${sizing.unit}`.trim();
        }
        return `Liian suuri: arvon täytyy olla ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Liian pieni: ${sizing.subject} täytyy olla ${adj}${issue2.minimum.toString()} ${sizing.unit}`.trim();
        }
        return `Liian pieni: arvon täytyy olla ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Virheellinen syöte: täytyy alkaa "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Virheellinen syöte: täytyy loppua "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Virheellinen syöte: täytyy sisältää "${_issue.includes}"`;
        if (_issue.format === "regex") {
          return `Virheellinen syöte: täytyy vastata säännöllistä lauseketta ${_issue.pattern}`;
        }
        return `Virheellinen ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Virheellinen luku: täytyy olla luvun ${issue2.divisor} monikerta`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Tuntemattomat avaimet" : "Tuntematon avain"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return "Virheellinen avain tietueessa";
      case "invalid_union":
        return "Virheellinen unioni";
      case "invalid_element":
        return "Virheellinen arvo joukossa";
      default:
        return `Virheellinen syöte`;
    }
  };
};
function fi_default() {
  return {
    localeError: error14()
  };
}
// node_modules/zod/v4/locales/fr.js
var error15 = () => {
  const Sizable = {
    string: { unit: "caractères", verb: "avoir" },
    file: { unit: "octets", verb: "avoir" },
    array: { unit: "éléments", verb: "avoir" },
    set: { unit: "éléments", verb: "avoir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "entrée",
    email: "adresse e-mail",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "date et heure ISO",
    date: "date ISO",
    time: "heure ISO",
    duration: "durée ISO",
    ipv4: "adresse IPv4",
    ipv6: "adresse IPv6",
    cidrv4: "plage IPv4",
    cidrv6: "plage IPv6",
    base64: "chaîne encodée en base64",
    base64url: "chaîne encodée en base64url",
    json_string: "chaîne JSON",
    e164: "numéro E.164",
    jwt: "JWT",
    template_literal: "entrée"
  };
  const TypeDictionary = {
    string: "chaîne",
    number: "nombre",
    int: "entier",
    boolean: "booléen",
    bigint: "grand entier",
    symbol: "symbole",
    undefined: "indéfini",
    null: "null",
    never: "jamais",
    void: "vide",
    date: "date",
    array: "tableau",
    object: "objet",
    tuple: "tuple",
    record: "enregistrement",
    map: "carte",
    set: "ensemble",
    file: "fichier",
    nonoptional: "non-optionnel",
    nan: "NaN",
    function: "fonction"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Entrée invalide : instanceof ${issue2.expected} attendu, ${received} reçu`;
        }
        return `Entrée invalide : ${expected} attendu, ${received} reçu`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrée invalide : ${stringifyPrimitive(issue2.values[0])} attendu`;
        return `Option invalide : une valeur parmi ${joinValues(issue2.values, "|")} attendue`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Trop grand : ${TypeDictionary[issue2.origin] ?? "valeur"} doit ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "élément(s)"}`;
        return `Trop grand : ${TypeDictionary[issue2.origin] ?? "valeur"} doit être ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Trop petit : ${TypeDictionary[issue2.origin] ?? "valeur"} doit ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        return `Trop petit : ${TypeDictionary[issue2.origin] ?? "valeur"} doit être ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Chaîne invalide : doit commencer par "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Chaîne invalide : doit se terminer par "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Chaîne invalide : doit inclure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Chaîne invalide : doit correspondre au modèle ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} invalide`;
      }
      case "not_multiple_of":
        return `Nombre invalide : doit être un multiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Clé${issue2.keys.length > 1 ? "s" : ""} non reconnue${issue2.keys.length > 1 ? "s" : ""} : ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Clé invalide dans ${issue2.origin}`;
      case "invalid_union":
        return "Entrée invalide";
      case "invalid_element":
        return `Valeur invalide dans ${issue2.origin}`;
      default:
        return `Entrée invalide`;
    }
  };
};
function fr_default() {
  return {
    localeError: error15()
  };
}
// node_modules/zod/v4/locales/fr-CA.js
var error16 = () => {
  const Sizable = {
    string: { unit: "caractères", verb: "avoir" },
    file: { unit: "octets", verb: "avoir" },
    array: { unit: "éléments", verb: "avoir" },
    set: { unit: "éléments", verb: "avoir" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "entrée",
    email: "adresse courriel",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "date-heure ISO",
    date: "date ISO",
    time: "heure ISO",
    duration: "durée ISO",
    ipv4: "adresse IPv4",
    ipv6: "adresse IPv6",
    cidrv4: "plage IPv4",
    cidrv6: "plage IPv6",
    base64: "chaîne encodée en base64",
    base64url: "chaîne encodée en base64url",
    json_string: "chaîne JSON",
    e164: "numéro E.164",
    jwt: "JWT",
    template_literal: "entrée"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Entrée invalide : attendu instanceof ${issue2.expected}, reçu ${received}`;
        }
        return `Entrée invalide : attendu ${expected}, reçu ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrée invalide : attendu ${stringifyPrimitive(issue2.values[0])}`;
        return `Option invalide : attendu l'une des valeurs suivantes ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "≤" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Trop grand : attendu que ${issue2.origin ?? "la valeur"} ait ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
        return `Trop grand : attendu que ${issue2.origin ?? "la valeur"} soit ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "≥" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Trop petit : attendu que ${issue2.origin} ait ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Trop petit : attendu que ${issue2.origin} soit ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Chaîne invalide : doit commencer par "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Chaîne invalide : doit se terminer par "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Chaîne invalide : doit inclure "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Chaîne invalide : doit correspondre au motif ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} invalide`;
      }
      case "not_multiple_of":
        return `Nombre invalide : doit être un multiple de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Clé${issue2.keys.length > 1 ? "s" : ""} non reconnue${issue2.keys.length > 1 ? "s" : ""} : ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Clé invalide dans ${issue2.origin}`;
      case "invalid_union":
        return "Entrée invalide";
      case "invalid_element":
        return `Valeur invalide dans ${issue2.origin}`;
      default:
        return `Entrée invalide`;
    }
  };
};
function fr_CA_default() {
  return {
    localeError: error16()
  };
}
// node_modules/zod/v4/locales/he.js
var error17 = () => {
  const TypeNames = {
    string: { label: "מחרוזת", gender: "f" },
    number: { label: "מספר", gender: "m" },
    boolean: { label: "ערך בוליאני", gender: "m" },
    bigint: { label: "BigInt", gender: "m" },
    date: { label: "תאריך", gender: "m" },
    array: { label: "מערך", gender: "m" },
    object: { label: "אובייקט", gender: "m" },
    null: { label: "ערך ריק (null)", gender: "m" },
    undefined: { label: "ערך לא מוגדר (undefined)", gender: "m" },
    symbol: { label: "סימבול (Symbol)", gender: "m" },
    function: { label: "פונקציה", gender: "f" },
    map: { label: "מפה (Map)", gender: "f" },
    set: { label: "קבוצה (Set)", gender: "f" },
    file: { label: "קובץ", gender: "m" },
    promise: { label: "Promise", gender: "m" },
    NaN: { label: "NaN", gender: "m" },
    unknown: { label: "ערך לא ידוע", gender: "m" },
    value: { label: "ערך", gender: "m" }
  };
  const Sizable = {
    string: { unit: "תווים", shortLabel: "קצר", longLabel: "ארוך" },
    file: { unit: "בייטים", shortLabel: "קטן", longLabel: "גדול" },
    array: { unit: "פריטים", shortLabel: "קטן", longLabel: "גדול" },
    set: { unit: "פריטים", shortLabel: "קטן", longLabel: "גדול" },
    number: { unit: "", shortLabel: "קטן", longLabel: "גדול" }
  };
  const typeEntry = (t) => t ? TypeNames[t] : undefined;
  const typeLabel = (t) => {
    const e = typeEntry(t);
    if (e)
      return e.label;
    return t ?? TypeNames.unknown.label;
  };
  const withDefinite = (t) => `ה${typeLabel(t)}`;
  const verbFor = (t) => {
    const e = typeEntry(t);
    const gender = e?.gender ?? "m";
    return gender === "f" ? "צריכה להיות" : "צריך להיות";
  };
  const getSizing = (origin) => {
    if (!origin)
      return null;
    return Sizable[origin] ?? null;
  };
  const FormatDictionary = {
    regex: { label: "קלט", gender: "m" },
    email: { label: "כתובת אימייל", gender: "f" },
    url: { label: "כתובת רשת", gender: "f" },
    emoji: { label: "אימוג'י", gender: "m" },
    uuid: { label: "UUID", gender: "m" },
    nanoid: { label: "nanoid", gender: "m" },
    guid: { label: "GUID", gender: "m" },
    cuid: { label: "cuid", gender: "m" },
    cuid2: { label: "cuid2", gender: "m" },
    ulid: { label: "ULID", gender: "m" },
    xid: { label: "XID", gender: "m" },
    ksuid: { label: "KSUID", gender: "m" },
    datetime: { label: "תאריך וזמן ISO", gender: "m" },
    date: { label: "תאריך ISO", gender: "m" },
    time: { label: "זמן ISO", gender: "m" },
    duration: { label: "משך זמן ISO", gender: "m" },
    ipv4: { label: "כתובת IPv4", gender: "f" },
    ipv6: { label: "כתובת IPv6", gender: "f" },
    cidrv4: { label: "טווח IPv4", gender: "m" },
    cidrv6: { label: "טווח IPv6", gender: "m" },
    base64: { label: "מחרוזת בבסיס 64", gender: "f" },
    base64url: { label: "מחרוזת בבסיס 64 לכתובות רשת", gender: "f" },
    json_string: { label: "מחרוזת JSON", gender: "f" },
    e164: { label: "מספר E.164", gender: "m" },
    jwt: { label: "JWT", gender: "m" },
    ends_with: { label: "קלט", gender: "m" },
    includes: { label: "קלט", gender: "m" },
    lowercase: { label: "קלט", gender: "m" },
    starts_with: { label: "קלט", gender: "m" },
    uppercase: { label: "קלט", gender: "m" }
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expectedKey = issue2.expected;
        const expected = TypeDictionary[expectedKey ?? ""] ?? typeLabel(expectedKey);
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? TypeNames[receivedType]?.label ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `קלט לא תקין: צריך להיות instanceof ${issue2.expected}, התקבל ${received}`;
        }
        return `קלט לא תקין: צריך להיות ${expected}, התקבל ${received}`;
      }
      case "invalid_value": {
        if (issue2.values.length === 1) {
          return `ערך לא תקין: הערך חייב להיות ${stringifyPrimitive(issue2.values[0])}`;
        }
        const stringified = issue2.values.map((v) => stringifyPrimitive(v));
        if (issue2.values.length === 2) {
          return `ערך לא תקין: האפשרויות המתאימות הן ${stringified[0]} או ${stringified[1]}`;
        }
        const lastValue = stringified[stringified.length - 1];
        const restValues = stringified.slice(0, -1).join(", ");
        return `ערך לא תקין: האפשרויות המתאימות הן ${restValues} או ${lastValue}`;
      }
      case "too_big": {
        const sizing = getSizing(issue2.origin);
        const subject = withDefinite(issue2.origin ?? "value");
        if (issue2.origin === "string") {
          return `${sizing?.longLabel ?? "ארוך"} מדי: ${subject} צריכה להכיל ${issue2.maximum.toString()} ${sizing?.unit ?? ""} ${issue2.inclusive ? "או פחות" : "לכל היותר"}`.trim();
        }
        if (issue2.origin === "number") {
          const comparison = issue2.inclusive ? `קטן או שווה ל-${issue2.maximum}` : `קטן מ-${issue2.maximum}`;
          return `גדול מדי: ${subject} צריך להיות ${comparison}`;
        }
        if (issue2.origin === "array" || issue2.origin === "set") {
          const verb = issue2.origin === "set" ? "צריכה" : "צריך";
          const comparison = issue2.inclusive ? `${issue2.maximum} ${sizing?.unit ?? ""} או פחות` : `פחות מ-${issue2.maximum} ${sizing?.unit ?? ""}`;
          return `גדול מדי: ${subject} ${verb} להכיל ${comparison}`.trim();
        }
        const adj = issue2.inclusive ? "<=" : "<";
        const be = verbFor(issue2.origin ?? "value");
        if (sizing?.unit) {
          return `${sizing.longLabel} מדי: ${subject} ${be} ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
        }
        return `${sizing?.longLabel ?? "גדול"} מדי: ${subject} ${be} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const sizing = getSizing(issue2.origin);
        const subject = withDefinite(issue2.origin ?? "value");
        if (issue2.origin === "string") {
          return `${sizing?.shortLabel ?? "קצר"} מדי: ${subject} צריכה להכיל ${issue2.minimum.toString()} ${sizing?.unit ?? ""} ${issue2.inclusive ? "או יותר" : "לפחות"}`.trim();
        }
        if (issue2.origin === "number") {
          const comparison = issue2.inclusive ? `גדול או שווה ל-${issue2.minimum}` : `גדול מ-${issue2.minimum}`;
          return `קטן מדי: ${subject} צריך להיות ${comparison}`;
        }
        if (issue2.origin === "array" || issue2.origin === "set") {
          const verb = issue2.origin === "set" ? "צריכה" : "צריך";
          if (issue2.minimum === 1 && issue2.inclusive) {
            const singularPhrase = issue2.origin === "set" ? "לפחות פריט אחד" : "לפחות פריט אחד";
            return `קטן מדי: ${subject} ${verb} להכיל ${singularPhrase}`;
          }
          const comparison = issue2.inclusive ? `${issue2.minimum} ${sizing?.unit ?? ""} או יותר` : `יותר מ-${issue2.minimum} ${sizing?.unit ?? ""}`;
          return `קטן מדי: ${subject} ${verb} להכיל ${comparison}`.trim();
        }
        const adj = issue2.inclusive ? ">=" : ">";
        const be = verbFor(issue2.origin ?? "value");
        if (sizing?.unit) {
          return `${sizing.shortLabel} מדי: ${subject} ${be} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `${sizing?.shortLabel ?? "קטן"} מדי: ${subject} ${be} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `המחרוזת חייבת להתחיל ב "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `המחרוזת חייבת להסתיים ב "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `המחרוזת חייבת לכלול "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `המחרוזת חייבת להתאים לתבנית ${_issue.pattern}`;
        const nounEntry = FormatDictionary[_issue.format];
        const noun = nounEntry?.label ?? _issue.format;
        const gender = nounEntry?.gender ?? "m";
        const adjective = gender === "f" ? "תקינה" : "תקין";
        return `${noun} לא ${adjective}`;
      }
      case "not_multiple_of":
        return `מספר לא תקין: חייב להיות מכפלה של ${issue2.divisor}`;
      case "unrecognized_keys":
        return `מפתח${issue2.keys.length > 1 ? "ות" : ""} לא מזוה${issue2.keys.length > 1 ? "ים" : "ה"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key": {
        return `שדה לא תקין באובייקט`;
      }
      case "invalid_union":
        return "קלט לא תקין";
      case "invalid_element": {
        const place = withDefinite(issue2.origin ?? "array");
        return `ערך לא תקין ב${place}`;
      }
      default:
        return `קלט לא תקין`;
    }
  };
};
function he_default() {
  return {
    localeError: error17()
  };
}
// node_modules/zod/v4/locales/hr.js
var error18 = () => {
  const Sizable = {
    string: { unit: "znakova", verb: "imati" },
    file: { unit: "bajtova", verb: "imati" },
    array: { unit: "stavki", verb: "imati" },
    set: { unit: "stavki", verb: "imati" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "unos",
    email: "email adresa",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datum i vrijeme",
    date: "ISO datum",
    time: "ISO vrijeme",
    duration: "ISO trajanje",
    ipv4: "IPv4 adresa",
    ipv6: "IPv6 adresa",
    cidrv4: "IPv4 raspon",
    cidrv6: "IPv6 raspon",
    base64: "base64 kodirani tekst",
    base64url: "base64url kodirani tekst",
    json_string: "JSON tekst",
    e164: "E.164 broj",
    jwt: "JWT",
    template_literal: "unos"
  };
  const TypeDictionary = {
    nan: "NaN",
    string: "tekst",
    number: "broj",
    boolean: "boolean",
    array: "niz",
    object: "objekt",
    set: "skup",
    file: "datoteka",
    date: "datum",
    bigint: "bigint",
    symbol: "simbol",
    undefined: "undefined",
    null: "null",
    function: "funkcija",
    map: "mapa"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Neispravan unos: očekuje se instanceof ${issue2.expected}, a primljeno je ${received}`;
        }
        return `Neispravan unos: očekuje se ${expected}, a primljeno je ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Neispravna vrijednost: očekivano ${stringifyPrimitive(issue2.values[0])}`;
        return `Neispravna opcija: očekivano jedno od ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing)
          return `Preveliko: očekivano da ${origin ?? "vrijednost"} ima ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemenata"}`;
        return `Preveliko: očekivano da ${origin ?? "vrijednost"} bude ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        if (sizing) {
          return `Premalo: očekivano da ${origin} ima ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Premalo: očekivano da ${origin} bude ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Neispravan tekst: mora započinjati s "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Neispravan tekst: mora završavati s "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Neispravan tekst: mora sadržavati "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Neispravan tekst: mora odgovarati uzorku ${_issue.pattern}`;
        return `Neispravna ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Neispravan broj: mora biti višekratnik od ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Neprepoznat${issue2.keys.length > 1 ? "i ključevi" : " ključ"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Neispravan ključ u ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
      case "invalid_union":
        return "Neispravan unos";
      case "invalid_element":
        return `Neispravna vrijednost u ${TypeDictionary[issue2.origin] ?? issue2.origin}`;
      default:
        return `Neispravan unos`;
    }
  };
};
function hr_default() {
  return {
    localeError: error18()
  };
}
// node_modules/zod/v4/locales/hu.js
var error19 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "legyen" },
    file: { unit: "byte", verb: "legyen" },
    array: { unit: "elem", verb: "legyen" },
    set: { unit: "elem", verb: "legyen" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "bemenet",
    email: "email cím",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO időbélyeg",
    date: "ISO dátum",
    time: "ISO idő",
    duration: "ISO időintervallum",
    ipv4: "IPv4 cím",
    ipv6: "IPv6 cím",
    cidrv4: "IPv4 tartomány",
    cidrv6: "IPv6 tartomány",
    base64: "base64-kódolt string",
    base64url: "base64url-kódolt string",
    json_string: "JSON string",
    e164: "E.164 szám",
    jwt: "JWT",
    template_literal: "bemenet"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "szám",
    array: "tömb"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Érvénytelen bemenet: a várt érték instanceof ${issue2.expected}, a kapott érték ${received}`;
        }
        return `Érvénytelen bemenet: a várt érték ${expected}, a kapott érték ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Érvénytelen bemenet: a várt érték ${stringifyPrimitive(issue2.values[0])}`;
        return `Érvénytelen opció: valamelyik érték várt ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Túl nagy: ${issue2.origin ?? "érték"} mérete túl nagy ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elem"}`;
        return `Túl nagy: a bemeneti érték ${issue2.origin ?? "érték"} túl nagy: ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Túl kicsi: a bemeneti érték ${issue2.origin} mérete túl kicsi ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Túl kicsi: a bemeneti érték ${issue2.origin} túl kicsi ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Érvénytelen string: "${_issue.prefix}" értékkel kell kezdődnie`;
        if (_issue.format === "ends_with")
          return `Érvénytelen string: "${_issue.suffix}" értékkel kell végződnie`;
        if (_issue.format === "includes")
          return `Érvénytelen string: "${_issue.includes}" értéket kell tartalmaznia`;
        if (_issue.format === "regex")
          return `Érvénytelen string: ${_issue.pattern} mintának kell megfelelnie`;
        return `Érvénytelen ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Érvénytelen szám: ${issue2.divisor} többszörösének kell lennie`;
      case "unrecognized_keys":
        return `Ismeretlen kulcs${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Érvénytelen kulcs ${issue2.origin}`;
      case "invalid_union":
        return "Érvénytelen bemenet";
      case "invalid_element":
        return `Érvénytelen érték: ${issue2.origin}`;
      default:
        return `Érvénytelen bemenet`;
    }
  };
};
function hu_default() {
  return {
    localeError: error19()
  };
}
// node_modules/zod/v4/locales/hy.js
function getArmenianPlural(count, one, many) {
  return Math.abs(count) === 1 ? one : many;
}
function withDefiniteArticle(word) {
  if (!word)
    return "";
  const vowels = ["ա", "ե", "ը", "ի", "ո", "ու", "օ"];
  const lastChar = word[word.length - 1];
  return word + (vowels.includes(lastChar) ? "ն" : "ը");
}
var error20 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "նշան",
        many: "նշաններ"
      },
      verb: "ունենալ"
    },
    file: {
      unit: {
        one: "բայթ",
        many: "բայթեր"
      },
      verb: "ունենալ"
    },
    array: {
      unit: {
        one: "տարր",
        many: "տարրեր"
      },
      verb: "ունենալ"
    },
    set: {
      unit: {
        one: "տարր",
        many: "տարրեր"
      },
      verb: "ունենալ"
    }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "մուտք",
    email: "էլ. հասցե",
    url: "URL",
    emoji: "էմոջի",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO ամսաթիվ և ժամ",
    date: "ISO ամսաթիվ",
    time: "ISO ժամ",
    duration: "ISO տևողություն",
    ipv4: "IPv4 հասցե",
    ipv6: "IPv6 հասցե",
    cidrv4: "IPv4 միջակայք",
    cidrv6: "IPv6 միջակայք",
    base64: "base64 ձևաչափով տող",
    base64url: "base64url ձևաչափով տող",
    json_string: "JSON տող",
    e164: "E.164 համար",
    jwt: "JWT",
    template_literal: "մուտք"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "թիվ",
    array: "զանգված"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Սխալ մուտքագրում․ սպասվում էր instanceof ${issue2.expected}, ստացվել է ${received}`;
        }
        return `Սխալ մուտքագրում․ սպասվում էր ${expected}, ստացվել է ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Սխալ մուտքագրում․ սպասվում էր ${stringifyPrimitive(issue2.values[1])}`;
        return `Սխալ տարբերակ․ սպասվում էր հետևյալներից մեկը՝ ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const maxValue = Number(issue2.maximum);
          const unit = getArmenianPlural(maxValue, sizing.unit.one, sizing.unit.many);
          return `Չափազանց մեծ արժեք․ սպասվում է, որ ${withDefiniteArticle(issue2.origin ?? "արժեք")} կունենա ${adj}${issue2.maximum.toString()} ${unit}`;
        }
        return `Չափազանց մեծ արժեք․ սպասվում է, որ ${withDefiniteArticle(issue2.origin ?? "արժեք")} լինի ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const minValue = Number(issue2.minimum);
          const unit = getArmenianPlural(minValue, sizing.unit.one, sizing.unit.many);
          return `Չափազանց փոքր արժեք․ սպասվում է, որ ${withDefiniteArticle(issue2.origin)} կունենա ${adj}${issue2.minimum.toString()} ${unit}`;
        }
        return `Չափազանց փոքր արժեք․ սպասվում է, որ ${withDefiniteArticle(issue2.origin)} լինի ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Սխալ տող․ պետք է սկսվի "${_issue.prefix}"-ով`;
        if (_issue.format === "ends_with")
          return `Սխալ տող․ պետք է ավարտվի "${_issue.suffix}"-ով`;
        if (_issue.format === "includes")
          return `Սխալ տող․ պետք է պարունակի "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Սխալ տող․ պետք է համապատասխանի ${_issue.pattern} ձևաչափին`;
        return `Սխալ ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Սխալ թիվ․ պետք է բազմապատիկ լինի ${issue2.divisor}-ի`;
      case "unrecognized_keys":
        return `Չճանաչված բանալի${issue2.keys.length > 1 ? "ներ" : ""}. ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Սխալ բանալի ${withDefiniteArticle(issue2.origin)}-ում`;
      case "invalid_union":
        return "Սխալ մուտքագրում";
      case "invalid_element":
        return `Սխալ արժեք ${withDefiniteArticle(issue2.origin)}-ում`;
      default:
        return `Սխալ մուտքագրում`;
    }
  };
};
function hy_default() {
  return {
    localeError: error20()
  };
}
// node_modules/zod/v4/locales/id.js
var error21 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "memiliki" },
    file: { unit: "byte", verb: "memiliki" },
    array: { unit: "item", verb: "memiliki" },
    set: { unit: "item", verb: "memiliki" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "alamat email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "tanggal dan waktu format ISO",
    date: "tanggal format ISO",
    time: "jam format ISO",
    duration: "durasi format ISO",
    ipv4: "alamat IPv4",
    ipv6: "alamat IPv6",
    cidrv4: "rentang alamat IPv4",
    cidrv6: "rentang alamat IPv6",
    base64: "string dengan enkode base64",
    base64url: "string dengan enkode base64url",
    json_string: "string JSON",
    e164: "angka E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Input tidak valid: diharapkan instanceof ${issue2.expected}, diterima ${received}`;
        }
        return `Input tidak valid: diharapkan ${expected}, diterima ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input tidak valid: diharapkan ${stringifyPrimitive(issue2.values[0])}`;
        return `Pilihan tidak valid: diharapkan salah satu dari ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Terlalu besar: diharapkan ${issue2.origin ?? "value"} memiliki ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemen"}`;
        return `Terlalu besar: diharapkan ${issue2.origin ?? "value"} menjadi ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Terlalu kecil: diharapkan ${issue2.origin} memiliki ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Terlalu kecil: diharapkan ${issue2.origin} menjadi ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `String tidak valid: harus dimulai dengan "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `String tidak valid: harus berakhir dengan "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `String tidak valid: harus menyertakan "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `String tidak valid: harus sesuai pola ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} tidak valid`;
      }
      case "not_multiple_of":
        return `Angka tidak valid: harus kelipatan dari ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Kunci tidak dikenali ${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Kunci tidak valid di ${issue2.origin}`;
      case "invalid_union":
        return "Input tidak valid";
      case "invalid_element":
        return `Nilai tidak valid di ${issue2.origin}`;
      default:
        return `Input tidak valid`;
    }
  };
};
function id_default() {
  return {
    localeError: error21()
  };
}
// node_modules/zod/v4/locales/is.js
var error22 = () => {
  const Sizable = {
    string: { unit: "stafi", verb: "að hafa" },
    file: { unit: "bæti", verb: "að hafa" },
    array: { unit: "hluti", verb: "að hafa" },
    set: { unit: "hluti", verb: "að hafa" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "gildi",
    email: "netfang",
    url: "vefslóð",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO dagsetning og tími",
    date: "ISO dagsetning",
    time: "ISO tími",
    duration: "ISO tímalengd",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded strengur",
    base64url: "base64url-encoded strengur",
    json_string: "JSON strengur",
    e164: "E.164 tölugildi",
    jwt: "JWT",
    template_literal: "gildi"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "númer",
    array: "fylki"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Rangt gildi: Þú slóst inn ${received} þar sem á að vera instanceof ${issue2.expected}`;
        }
        return `Rangt gildi: Þú slóst inn ${received} þar sem á að vera ${expected}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Rangt gildi: gert ráð fyrir ${stringifyPrimitive(issue2.values[0])}`;
        return `Ógilt val: má vera eitt af eftirfarandi ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Of stórt: gert er ráð fyrir að ${issue2.origin ?? "gildi"} hafi ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "hluti"}`;
        return `Of stórt: gert er ráð fyrir að ${issue2.origin ?? "gildi"} sé ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Of lítið: gert er ráð fyrir að ${issue2.origin} hafi ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Of lítið: gert er ráð fyrir að ${issue2.origin} sé ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Ógildur strengur: verður að byrja á "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Ógildur strengur: verður að enda á "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ógildur strengur: verður að innihalda "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ógildur strengur: verður að fylgja mynstri ${_issue.pattern}`;
        return `Rangt ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Röng tala: verður að vera margfeldi af ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Óþekkt ${issue2.keys.length > 1 ? "ir lyklar" : "ur lykill"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Rangur lykill í ${issue2.origin}`;
      case "invalid_union":
        return "Rangt gildi";
      case "invalid_element":
        return `Rangt gildi í ${issue2.origin}`;
      default:
        return `Rangt gildi`;
    }
  };
};
function is_default() {
  return {
    localeError: error22()
  };
}
// node_modules/zod/v4/locales/it.js
var error23 = () => {
  const Sizable = {
    string: { unit: "caratteri", verb: "avere" },
    file: { unit: "byte", verb: "avere" },
    array: { unit: "elementi", verb: "avere" },
    set: { unit: "elementi", verb: "avere" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "indirizzo email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data e ora ISO",
    date: "data ISO",
    time: "ora ISO",
    duration: "durata ISO",
    ipv4: "indirizzo IPv4",
    ipv6: "indirizzo IPv6",
    cidrv4: "intervallo IPv4",
    cidrv6: "intervallo IPv6",
    base64: "stringa codificata in base64",
    base64url: "URL codificata in base64",
    json_string: "stringa JSON",
    e164: "numero E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "numero",
    array: "vettore"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Input non valido: atteso instanceof ${issue2.expected}, ricevuto ${received}`;
        }
        return `Input non valido: atteso ${expected}, ricevuto ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input non valido: atteso ${stringifyPrimitive(issue2.values[0])}`;
        return `Opzione non valida: atteso uno tra ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Troppo grande: ${issue2.origin ?? "valore"} deve avere ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementi"}`;
        return `Troppo grande: ${issue2.origin ?? "valore"} deve essere ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Troppo piccolo: ${issue2.origin} deve avere ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Troppo piccolo: ${issue2.origin} deve essere ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Stringa non valida: deve iniziare con "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Stringa non valida: deve terminare con "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Stringa non valida: deve includere "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Stringa non valida: deve corrispondere al pattern ${_issue.pattern}`;
        return `Input non valido: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Numero non valido: deve essere un multiplo di ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Chiav${issue2.keys.length > 1 ? "i" : "e"} non riconosciut${issue2.keys.length > 1 ? "e" : "a"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Chiave non valida in ${issue2.origin}`;
      case "invalid_union":
        return "Input non valido";
      case "invalid_element":
        return `Valore non valido in ${issue2.origin}`;
      default:
        return `Input non valido`;
    }
  };
};
function it_default() {
  return {
    localeError: error23()
  };
}
// node_modules/zod/v4/locales/ja.js
var error24 = () => {
  const Sizable = {
    string: { unit: "文字", verb: "である" },
    file: { unit: "バイト", verb: "である" },
    array: { unit: "要素", verb: "である" },
    set: { unit: "要素", verb: "である" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "入力値",
    email: "メールアドレス",
    url: "URL",
    emoji: "絵文字",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO日時",
    date: "ISO日付",
    time: "ISO時刻",
    duration: "ISO期間",
    ipv4: "IPv4アドレス",
    ipv6: "IPv6アドレス",
    cidrv4: "IPv4範囲",
    cidrv6: "IPv6範囲",
    base64: "base64エンコード文字列",
    base64url: "base64urlエンコード文字列",
    json_string: "JSON文字列",
    e164: "E.164番号",
    jwt: "JWT",
    template_literal: "入力値"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "数値",
    array: "配列"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `無効な入力: instanceof ${issue2.expected}が期待されましたが、${received}が入力されました`;
        }
        return `無効な入力: ${expected}が期待されましたが、${received}が入力されました`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `無効な入力: ${stringifyPrimitive(issue2.values[0])}が期待されました`;
        return `無効な選択: ${joinValues(issue2.values, "、")}のいずれかである必要があります`;
      case "too_big": {
        const adj = issue2.inclusive ? "以下である" : "より小さい";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `大きすぎる値: ${issue2.origin ?? "値"}は${issue2.maximum.toString()}${sizing.unit ?? "要素"}${adj}必要があります`;
        return `大きすぎる値: ${issue2.origin ?? "値"}は${issue2.maximum.toString()}${adj}必要があります`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "以上である" : "より大きい";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `小さすぎる値: ${issue2.origin}は${issue2.minimum.toString()}${sizing.unit}${adj}必要があります`;
        return `小さすぎる値: ${issue2.origin}は${issue2.minimum.toString()}${adj}必要があります`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `無効な文字列: "${_issue.prefix}"で始まる必要があります`;
        if (_issue.format === "ends_with")
          return `無効な文字列: "${_issue.suffix}"で終わる必要があります`;
        if (_issue.format === "includes")
          return `無効な文字列: "${_issue.includes}"を含む必要があります`;
        if (_issue.format === "regex")
          return `無効な文字列: パターン${_issue.pattern}に一致する必要があります`;
        return `無効な${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `無効な数値: ${issue2.divisor}の倍数である必要があります`;
      case "unrecognized_keys":
        return `認識されていないキー${issue2.keys.length > 1 ? "群" : ""}: ${joinValues(issue2.keys, "、")}`;
      case "invalid_key":
        return `${issue2.origin}内の無効なキー`;
      case "invalid_union":
        return "無効な入力";
      case "invalid_element":
        return `${issue2.origin}内の無効な値`;
      default:
        return `無効な入力`;
    }
  };
};
function ja_default() {
  return {
    localeError: error24()
  };
}
// node_modules/zod/v4/locales/ka.js
var error25 = () => {
  const Sizable = {
    string: { unit: "სიმბოლო", verb: "უნდა შეიცავდეს" },
    file: { unit: "ბაიტი", verb: "უნდა შეიცავდეს" },
    array: { unit: "ელემენტი", verb: "უნდა შეიცავდეს" },
    set: { unit: "ელემენტი", verb: "უნდა შეიცავდეს" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "შეყვანა",
    email: "ელ-ფოსტის მისამართი",
    url: "URL",
    emoji: "ემოჯი",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "თარიღი-დრო",
    date: "თარიღი",
    time: "დრო",
    duration: "ხანგრძლივობა",
    ipv4: "IPv4 მისამართი",
    ipv6: "IPv6 მისამართი",
    cidrv4: "IPv4 დიაპაზონი",
    cidrv6: "IPv6 დიაპაზონი",
    base64: "base64-კოდირებული ველი",
    base64url: "base64url-კოდირებული ველი",
    json_string: "JSON ველი",
    e164: "E.164 ნომერი",
    jwt: "JWT",
    template_literal: "შეყვანა"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "რიცხვი",
    string: "ველი",
    boolean: "ბულეანი",
    function: "ფუნქცია",
    array: "მასივი"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `არასწორი შეყვანა: მოსალოდნელი instanceof ${issue2.expected}, მიღებული ${received}`;
        }
        return `არასწორი შეყვანა: მოსალოდნელი ${expected}, მიღებული ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `არასწორი შეყვანა: მოსალოდნელი ${stringifyPrimitive(issue2.values[0])}`;
        return `არასწორი ვარიანტი: მოსალოდნელია ერთ-ერთი ${joinValues(issue2.values, "|")}-დან`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `ზედმეტად დიდი: მოსალოდნელი ${issue2.origin ?? "მნიშვნელობა"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit}`;
        return `ზედმეტად დიდი: მოსალოდნელი ${issue2.origin ?? "მნიშვნელობა"} იყოს ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `ზედმეტად პატარა: მოსალოდნელი ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `ზედმეტად პატარა: მოსალოდნელი ${issue2.origin} იყოს ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `არასწორი ველი: უნდა იწყებოდეს "${_issue.prefix}"-ით`;
        }
        if (_issue.format === "ends_with")
          return `არასწორი ველი: უნდა მთავრდებოდეს "${_issue.suffix}"-ით`;
        if (_issue.format === "includes")
          return `არასწორი ველი: უნდა შეიცავდეს "${_issue.includes}"-ს`;
        if (_issue.format === "regex")
          return `არასწორი ველი: უნდა შეესაბამებოდეს შაბლონს ${_issue.pattern}`;
        return `არასწორი ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `არასწორი რიცხვი: უნდა იყოს ${issue2.divisor}-ის ჯერადი`;
      case "unrecognized_keys":
        return `უცნობი გასაღებ${issue2.keys.length > 1 ? "ები" : "ი"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `არასწორი გასაღები ${issue2.origin}-ში`;
      case "invalid_union":
        return "არასწორი შეყვანა";
      case "invalid_element":
        return `არასწორი მნიშვნელობა ${issue2.origin}-ში`;
      default:
        return `არასწორი შეყვანა`;
    }
  };
};
function ka_default() {
  return {
    localeError: error25()
  };
}
// node_modules/zod/v4/locales/km.js
var error26 = () => {
  const Sizable = {
    string: { unit: "តួអក្សរ", verb: "គួរមាន" },
    file: { unit: "បៃ", verb: "គួរមាន" },
    array: { unit: "ធាតុ", verb: "គួរមាន" },
    set: { unit: "ធាតុ", verb: "គួរមាន" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "ទិន្នន័យបញ្ចូល",
    email: "អាសយដ្ឋានអ៊ីមែល",
    url: "URL",
    emoji: "សញ្ញាអារម្មណ៍",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "កាលបរិច្ឆេទ និងម៉ោង ISO",
    date: "កាលបរិច្ឆេទ ISO",
    time: "ម៉ោង ISO",
    duration: "រយៈពេល ISO",
    ipv4: "អាសយដ្ឋាន IPv4",
    ipv6: "អាសយដ្ឋាន IPv6",
    cidrv4: "ដែនអាសយដ្ឋាន IPv4",
    cidrv6: "ដែនអាសយដ្ឋាន IPv6",
    base64: "ខ្សែអក្សរអ៊ិកូដ base64",
    base64url: "ខ្សែអក្សរអ៊ិកូដ base64url",
    json_string: "ខ្សែអក្សរ JSON",
    e164: "លេខ E.164",
    jwt: "JWT",
    template_literal: "ទិន្នន័យបញ្ចូល"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "លេខ",
    array: "អារេ (Array)",
    null: "គ្មានតម្លៃ (null)"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ instanceof ${issue2.expected} ប៉ុន្តែទទួលបាន ${received}`;
        }
        return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${expected} ប៉ុន្តែទទួលបាន ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${stringifyPrimitive(issue2.values[0])}`;
        return `ជម្រើសមិនត្រឹមត្រូវ៖ ត្រូវជាមួយក្នុងចំណោម ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `ធំពេក៖ ត្រូវការ ${issue2.origin ?? "តម្លៃ"} ${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "ធាតុ"}`;
        return `ធំពេក៖ ត្រូវការ ${issue2.origin ?? "តម្លៃ"} ${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `តូចពេក៖ ត្រូវការ ${issue2.origin} ${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `តូចពេក៖ ត្រូវការ ${issue2.origin} ${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវចាប់ផ្តើមដោយ "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវបញ្ចប់ដោយ "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវមាន "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវតែផ្គូផ្គងនឹងទម្រង់ដែលបានកំណត់ ${_issue.pattern}`;
        return `មិនត្រឹមត្រូវ៖ ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `លេខមិនត្រឹមត្រូវ៖ ត្រូវតែជាពហុគុណនៃ ${issue2.divisor}`;
      case "unrecognized_keys":
        return `រកឃើញសោមិនស្គាល់៖ ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `សោមិនត្រឹមត្រូវនៅក្នុង ${issue2.origin}`;
      case "invalid_union":
        return `ទិន្នន័យមិនត្រឹមត្រូវ`;
      case "invalid_element":
        return `ទិន្នន័យមិនត្រឹមត្រូវនៅក្នុង ${issue2.origin}`;
      default:
        return `ទិន្នន័យមិនត្រឹមត្រូវ`;
    }
  };
};
function km_default() {
  return {
    localeError: error26()
  };
}

// node_modules/zod/v4/locales/kh.js
function kh_default() {
  return km_default();
}
// node_modules/zod/v4/locales/ko.js
var error27 = () => {
  const Sizable = {
    string: { unit: "문자", verb: "to have" },
    file: { unit: "바이트", verb: "to have" },
    array: { unit: "개", verb: "to have" },
    set: { unit: "개", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "입력",
    email: "이메일 주소",
    url: "URL",
    emoji: "이모지",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO 날짜시간",
    date: "ISO 날짜",
    time: "ISO 시간",
    duration: "ISO 기간",
    ipv4: "IPv4 주소",
    ipv6: "IPv6 주소",
    cidrv4: "IPv4 범위",
    cidrv6: "IPv6 범위",
    base64: "base64 인코딩 문자열",
    base64url: "base64url 인코딩 문자열",
    json_string: "JSON 문자열",
    e164: "E.164 번호",
    jwt: "JWT",
    template_literal: "입력"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `잘못된 입력: 예상 타입은 instanceof ${issue2.expected}, 받은 타입은 ${received}입니다`;
        }
        return `잘못된 입력: 예상 타입은 ${expected}, 받은 타입은 ${received}입니다`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `잘못된 입력: 값은 ${stringifyPrimitive(issue2.values[0])} 이어야 합니다`;
        return `잘못된 옵션: ${joinValues(issue2.values, "또는 ")} 중 하나여야 합니다`;
      case "too_big": {
        const adj = issue2.inclusive ? "이하" : "미만";
        const suffix = adj === "미만" ? "이어야 합니다" : "여야 합니다";
        const sizing = getSizing(issue2.origin);
        const unit = sizing?.unit ?? "요소";
        if (sizing)
          return `${issue2.origin ?? "값"}이 너무 큽니다: ${issue2.maximum.toString()}${unit} ${adj}${suffix}`;
        return `${issue2.origin ?? "값"}이 너무 큽니다: ${issue2.maximum.toString()} ${adj}${suffix}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "이상" : "초과";
        const suffix = adj === "이상" ? "이어야 합니다" : "여야 합니다";
        const sizing = getSizing(issue2.origin);
        const unit = sizing?.unit ?? "요소";
        if (sizing) {
          return `${issue2.origin ?? "값"}이 너무 작습니다: ${issue2.minimum.toString()}${unit} ${adj}${suffix}`;
        }
        return `${issue2.origin ?? "값"}이 너무 작습니다: ${issue2.minimum.toString()} ${adj}${suffix}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `잘못된 문자열: "${_issue.prefix}"(으)로 시작해야 합니다`;
        }
        if (_issue.format === "ends_with")
          return `잘못된 문자열: "${_issue.suffix}"(으)로 끝나야 합니다`;
        if (_issue.format === "includes")
          return `잘못된 문자열: "${_issue.includes}"을(를) 포함해야 합니다`;
        if (_issue.format === "regex")
          return `잘못된 문자열: 정규식 ${_issue.pattern} 패턴과 일치해야 합니다`;
        return `잘못된 ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `잘못된 숫자: ${issue2.divisor}의 배수여야 합니다`;
      case "unrecognized_keys":
        return `인식할 수 없는 키: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `잘못된 키: ${issue2.origin}`;
      case "invalid_union":
        return `잘못된 입력`;
      case "invalid_element":
        return `잘못된 값: ${issue2.origin}`;
      default:
        return `잘못된 입력`;
    }
  };
};
function ko_default() {
  return {
    localeError: error27()
  };
}
// node_modules/zod/v4/locales/lt.js
var capitalizeFirstCharacter = (text) => {
  return text.charAt(0).toUpperCase() + text.slice(1);
};
function getUnitTypeFromNumber(number2) {
  const abs = Math.abs(number2);
  const last = abs % 10;
  const last2 = abs % 100;
  if (last2 >= 11 && last2 <= 19 || last === 0)
    return "many";
  if (last === 1)
    return "one";
  return "few";
}
var error28 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "simbolis",
        few: "simboliai",
        many: "simbolių"
      },
      verb: {
        smaller: {
          inclusive: "turi būti ne ilgesnė kaip",
          notInclusive: "turi būti trumpesnė kaip"
        },
        bigger: {
          inclusive: "turi būti ne trumpesnė kaip",
          notInclusive: "turi būti ilgesnė kaip"
        }
      }
    },
    file: {
      unit: {
        one: "baitas",
        few: "baitai",
        many: "baitų"
      },
      verb: {
        smaller: {
          inclusive: "turi būti ne didesnis kaip",
          notInclusive: "turi būti mažesnis kaip"
        },
        bigger: {
          inclusive: "turi būti ne mažesnis kaip",
          notInclusive: "turi būti didesnis kaip"
        }
      }
    },
    array: {
      unit: {
        one: "elementą",
        few: "elementus",
        many: "elementų"
      },
      verb: {
        smaller: {
          inclusive: "turi turėti ne daugiau kaip",
          notInclusive: "turi turėti mažiau kaip"
        },
        bigger: {
          inclusive: "turi turėti ne mažiau kaip",
          notInclusive: "turi turėti daugiau kaip"
        }
      }
    },
    set: {
      unit: {
        one: "elementą",
        few: "elementus",
        many: "elementų"
      },
      verb: {
        smaller: {
          inclusive: "turi turėti ne daugiau kaip",
          notInclusive: "turi turėti mažiau kaip"
        },
        bigger: {
          inclusive: "turi turėti ne mažiau kaip",
          notInclusive: "turi turėti daugiau kaip"
        }
      }
    }
  };
  function getSizing(origin, unitType, inclusive, targetShouldBe) {
    const result = Sizable[origin] ?? null;
    if (result === null)
      return result;
    return {
      unit: result.unit[unitType],
      verb: result.verb[targetShouldBe][inclusive ? "inclusive" : "notInclusive"]
    };
  }
  const FormatDictionary = {
    regex: "įvestis",
    email: "el. pašto adresas",
    url: "URL",
    emoji: "jaustukas",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO data ir laikas",
    date: "ISO data",
    time: "ISO laikas",
    duration: "ISO trukmė",
    ipv4: "IPv4 adresas",
    ipv6: "IPv6 adresas",
    cidrv4: "IPv4 tinklo prefiksas (CIDR)",
    cidrv6: "IPv6 tinklo prefiksas (CIDR)",
    base64: "base64 užkoduota eilutė",
    base64url: "base64url užkoduota eilutė",
    json_string: "JSON eilutė",
    e164: "E.164 numeris",
    jwt: "JWT",
    template_literal: "įvestis"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "skaičius",
    bigint: "sveikasis skaičius",
    string: "eilutė",
    boolean: "loginė reikšmė",
    undefined: "neapibrėžta reikšmė",
    function: "funkcija",
    symbol: "simbolis",
    array: "masyvas",
    object: "objektas",
    null: "nulinė reikšmė"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Gautas tipas ${received}, o tikėtasi - instanceof ${issue2.expected}`;
        }
        return `Gautas tipas ${received}, o tikėtasi - ${expected}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Privalo būti ${stringifyPrimitive(issue2.values[0])}`;
        return `Privalo būti vienas iš ${joinValues(issue2.values, "|")} pasirinkimų`;
      case "too_big": {
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        const sizing = getSizing(issue2.origin, getUnitTypeFromNumber(Number(issue2.maximum)), issue2.inclusive ?? false, "smaller");
        if (sizing?.verb)
          return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} ${sizing.verb} ${issue2.maximum.toString()} ${sizing.unit ?? "elementų"}`;
        const adj = issue2.inclusive ? "ne didesnis kaip" : "mažesnis kaip";
        return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} turi būti ${adj} ${issue2.maximum.toString()} ${sizing?.unit}`;
      }
      case "too_small": {
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        const sizing = getSizing(issue2.origin, getUnitTypeFromNumber(Number(issue2.minimum)), issue2.inclusive ?? false, "bigger");
        if (sizing?.verb)
          return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} ${sizing.verb} ${issue2.minimum.toString()} ${sizing.unit ?? "elementų"}`;
        const adj = issue2.inclusive ? "ne mažesnis kaip" : "didesnis kaip";
        return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} turi būti ${adj} ${issue2.minimum.toString()} ${sizing?.unit}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Eilutė privalo prasidėti "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Eilutė privalo pasibaigti "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Eilutė privalo įtraukti "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Eilutė privalo atitikti ${_issue.pattern}`;
        return `Neteisingas ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Skaičius privalo būti ${issue2.divisor} kartotinis.`;
      case "unrecognized_keys":
        return `Neatpažint${issue2.keys.length > 1 ? "i" : "as"} rakt${issue2.keys.length > 1 ? "ai" : "as"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return "Rastas klaidingas raktas";
      case "invalid_union":
        return "Klaidinga įvestis";
      case "invalid_element": {
        const origin = TypeDictionary[issue2.origin] ?? issue2.origin;
        return `${capitalizeFirstCharacter(origin ?? issue2.origin ?? "reikšmė")} turi klaidingą įvestį`;
      }
      default:
        return "Klaidinga įvestis";
    }
  };
};
function lt_default() {
  return {
    localeError: error28()
  };
}
// node_modules/zod/v4/locales/mk.js
var error29 = () => {
  const Sizable = {
    string: { unit: "знаци", verb: "да имаат" },
    file: { unit: "бајти", verb: "да имаат" },
    array: { unit: "ставки", verb: "да имаат" },
    set: { unit: "ставки", verb: "да имаат" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "внес",
    email: "адреса на е-пошта",
    url: "URL",
    emoji: "емоџи",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO датум и време",
    date: "ISO датум",
    time: "ISO време",
    duration: "ISO времетраење",
    ipv4: "IPv4 адреса",
    ipv6: "IPv6 адреса",
    cidrv4: "IPv4 опсег",
    cidrv6: "IPv6 опсег",
    base64: "base64-енкодирана низа",
    base64url: "base64url-енкодирана низа",
    json_string: "JSON низа",
    e164: "E.164 број",
    jwt: "JWT",
    template_literal: "внес"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "број",
    array: "низа"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Грешен внес: се очекува instanceof ${issue2.expected}, примено ${received}`;
        }
        return `Грешен внес: се очекува ${expected}, примено ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `Грешана опција: се очекува една ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Премногу голем: се очекува ${issue2.origin ?? "вредноста"} да има ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "елементи"}`;
        return `Премногу голем: се очекува ${issue2.origin ?? "вредноста"} да биде ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Премногу мал: се очекува ${issue2.origin} да има ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Премногу мал: се очекува ${issue2.origin} да биде ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Неважечка низа: мора да започнува со "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Неважечка низа: мора да завршува со "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Неважечка низа: мора да вклучува "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Неважечка низа: мора да одгоара на патернот ${_issue.pattern}`;
        return `Invalid ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Грешен број: мора да биде делив со ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Непрепознаени клучеви" : "Непрепознаен клуч"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Грешен клуч во ${issue2.origin}`;
      case "invalid_union":
        return "Грешен внес";
      case "invalid_element":
        return `Грешна вредност во ${issue2.origin}`;
      default:
        return `Грешен внес`;
    }
  };
};
function mk_default() {
  return {
    localeError: error29()
  };
}
// node_modules/zod/v4/locales/ms.js
var error30 = () => {
  const Sizable = {
    string: { unit: "aksara", verb: "mempunyai" },
    file: { unit: "bait", verb: "mempunyai" },
    array: { unit: "elemen", verb: "mempunyai" },
    set: { unit: "elemen", verb: "mempunyai" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "alamat e-mel",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "tarikh masa ISO",
    date: "tarikh ISO",
    time: "masa ISO",
    duration: "tempoh ISO",
    ipv4: "alamat IPv4",
    ipv6: "alamat IPv6",
    cidrv4: "julat IPv4",
    cidrv6: "julat IPv6",
    base64: "string dikodkan base64",
    base64url: "string dikodkan base64url",
    json_string: "string JSON",
    e164: "nombor E.164",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "nombor"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Input tidak sah: dijangka instanceof ${issue2.expected}, diterima ${received}`;
        }
        return `Input tidak sah: dijangka ${expected}, diterima ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Input tidak sah: dijangka ${stringifyPrimitive(issue2.values[0])}`;
        return `Pilihan tidak sah: dijangka salah satu daripada ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Terlalu besar: dijangka ${issue2.origin ?? "nilai"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemen"}`;
        return `Terlalu besar: dijangka ${issue2.origin ?? "nilai"} adalah ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Terlalu kecil: dijangka ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Terlalu kecil: dijangka ${issue2.origin} adalah ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `String tidak sah: mesti bermula dengan "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `String tidak sah: mesti berakhir dengan "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `String tidak sah: mesti mengandungi "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `String tidak sah: mesti sepadan dengan corak ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} tidak sah`;
      }
      case "not_multiple_of":
        return `Nombor tidak sah: perlu gandaan ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Kunci tidak dikenali: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Kunci tidak sah dalam ${issue2.origin}`;
      case "invalid_union":
        return "Input tidak sah";
      case "invalid_element":
        return `Nilai tidak sah dalam ${issue2.origin}`;
      default:
        return `Input tidak sah`;
    }
  };
};
function ms_default() {
  return {
    localeError: error30()
  };
}
// node_modules/zod/v4/locales/nl.js
var error31 = () => {
  const Sizable = {
    string: { unit: "tekens", verb: "heeft" },
    file: { unit: "bytes", verb: "heeft" },
    array: { unit: "elementen", verb: "heeft" },
    set: { unit: "elementen", verb: "heeft" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "invoer",
    email: "emailadres",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datum en tijd",
    date: "ISO datum",
    time: "ISO tijd",
    duration: "ISO duur",
    ipv4: "IPv4-adres",
    ipv6: "IPv6-adres",
    cidrv4: "IPv4-bereik",
    cidrv6: "IPv6-bereik",
    base64: "base64-gecodeerde tekst",
    base64url: "base64 URL-gecodeerde tekst",
    json_string: "JSON string",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "invoer"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "getal"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ongeldige invoer: verwacht instanceof ${issue2.expected}, ontving ${received}`;
        }
        return `Ongeldige invoer: verwacht ${expected}, ontving ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ongeldige invoer: verwacht ${stringifyPrimitive(issue2.values[0])}`;
        return `Ongeldige optie: verwacht één van ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        const longName = issue2.origin === "date" ? "laat" : issue2.origin === "string" ? "lang" : "groot";
        if (sizing)
          return `Te ${longName}: verwacht dat ${issue2.origin ?? "waarde"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementen"} ${sizing.verb}`;
        return `Te ${longName}: verwacht dat ${issue2.origin ?? "waarde"} ${adj}${issue2.maximum.toString()} is`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        const shortName = issue2.origin === "date" ? "vroeg" : issue2.origin === "string" ? "kort" : "klein";
        if (sizing) {
          return `Te ${shortName}: verwacht dat ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} ${sizing.verb}`;
        }
        return `Te ${shortName}: verwacht dat ${issue2.origin} ${adj}${issue2.minimum.toString()} is`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Ongeldige tekst: moet met "${_issue.prefix}" beginnen`;
        }
        if (_issue.format === "ends_with")
          return `Ongeldige tekst: moet op "${_issue.suffix}" eindigen`;
        if (_issue.format === "includes")
          return `Ongeldige tekst: moet "${_issue.includes}" bevatten`;
        if (_issue.format === "regex")
          return `Ongeldige tekst: moet overeenkomen met patroon ${_issue.pattern}`;
        return `Ongeldig: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ongeldig getal: moet een veelvoud van ${issue2.divisor} zijn`;
      case "unrecognized_keys":
        return `Onbekende key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ongeldige key in ${issue2.origin}`;
      case "invalid_union":
        return "Ongeldige invoer";
      case "invalid_element":
        return `Ongeldige waarde in ${issue2.origin}`;
      default:
        return `Ongeldige invoer`;
    }
  };
};
function nl_default() {
  return {
    localeError: error31()
  };
}
// node_modules/zod/v4/locales/no.js
var error32 = () => {
  const Sizable = {
    string: { unit: "tegn", verb: "å ha" },
    file: { unit: "bytes", verb: "å ha" },
    array: { unit: "elementer", verb: "å inneholde" },
    set: { unit: "elementer", verb: "å inneholde" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "e-postadresse",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO dato- og klokkeslett",
    date: "ISO-dato",
    time: "ISO-klokkeslett",
    duration: "ISO-varighet",
    ipv4: "IPv4-område",
    ipv6: "IPv6-område",
    cidrv4: "IPv4-spekter",
    cidrv6: "IPv6-spekter",
    base64: "base64-enkodet streng",
    base64url: "base64url-enkodet streng",
    json_string: "JSON-streng",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "tall",
    array: "liste"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ugyldig input: forventet instanceof ${issue2.expected}, fikk ${received}`;
        }
        return `Ugyldig input: forventet ${expected}, fikk ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ugyldig verdi: forventet ${stringifyPrimitive(issue2.values[0])}`;
        return `Ugyldig valg: forventet en av ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `For stor(t): forventet ${issue2.origin ?? "value"} til å ha ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementer"}`;
        return `For stor(t): forventet ${issue2.origin ?? "value"} til å ha ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `For lite(n): forventet ${issue2.origin} til å ha ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `For lite(n): forventet ${issue2.origin} til å ha ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ugyldig streng: må starte med "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Ugyldig streng: må ende med "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ugyldig streng: må inneholde "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ugyldig streng: må matche mønsteret ${_issue.pattern}`;
        return `Ugyldig ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ugyldig tall: må være et multiplum av ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Ukjente nøkler" : "Ukjent nøkkel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ugyldig nøkkel i ${issue2.origin}`;
      case "invalid_union":
        return "Ugyldig input";
      case "invalid_element":
        return `Ugyldig verdi i ${issue2.origin}`;
      default:
        return `Ugyldig input`;
    }
  };
};
function no_default() {
  return {
    localeError: error32()
  };
}
// node_modules/zod/v4/locales/ota.js
var error33 = () => {
  const Sizable = {
    string: { unit: "harf", verb: "olmalıdır" },
    file: { unit: "bayt", verb: "olmalıdır" },
    array: { unit: "unsur", verb: "olmalıdır" },
    set: { unit: "unsur", verb: "olmalıdır" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "giren",
    email: "epostagâh",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO hengâmı",
    date: "ISO tarihi",
    time: "ISO zamanı",
    duration: "ISO müddeti",
    ipv4: "IPv4 nişânı",
    ipv6: "IPv6 nişânı",
    cidrv4: "IPv4 menzili",
    cidrv6: "IPv6 menzili",
    base64: "base64-şifreli metin",
    base64url: "base64url-şifreli metin",
    json_string: "JSON metin",
    e164: "E.164 sayısı",
    jwt: "JWT",
    template_literal: "giren"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "numara",
    array: "saf",
    null: "gayb"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Fâsit giren: umulan instanceof ${issue2.expected}, alınan ${received}`;
        }
        return `Fâsit giren: umulan ${expected}, alınan ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Fâsit giren: umulan ${stringifyPrimitive(issue2.values[0])}`;
        return `Fâsit tercih: mûteberler ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Fazla büyük: ${issue2.origin ?? "value"}, ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"} sahip olmalıydı.`;
        return `Fazla büyük: ${issue2.origin ?? "value"}, ${adj}${issue2.maximum.toString()} olmalıydı.`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Fazla küçük: ${issue2.origin}, ${adj}${issue2.minimum.toString()} ${sizing.unit} sahip olmalıydı.`;
        }
        return `Fazla küçük: ${issue2.origin}, ${adj}${issue2.minimum.toString()} olmalıydı.`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Fâsit metin: "${_issue.prefix}" ile başlamalı.`;
        if (_issue.format === "ends_with")
          return `Fâsit metin: "${_issue.suffix}" ile bitmeli.`;
        if (_issue.format === "includes")
          return `Fâsit metin: "${_issue.includes}" ihtivâ etmeli.`;
        if (_issue.format === "regex")
          return `Fâsit metin: ${_issue.pattern} nakşına uymalı.`;
        return `Fâsit ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Fâsit sayı: ${issue2.divisor} katı olmalıydı.`;
      case "unrecognized_keys":
        return `Tanınmayan anahtar ${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} için tanınmayan anahtar var.`;
      case "invalid_union":
        return "Giren tanınamadı.";
      case "invalid_element":
        return `${issue2.origin} için tanınmayan kıymet var.`;
      default:
        return `Kıymet tanınamadı.`;
    }
  };
};
function ota_default() {
  return {
    localeError: error33()
  };
}
// node_modules/zod/v4/locales/ps.js
var error34 = () => {
  const Sizable = {
    string: { unit: "توکي", verb: "ولري" },
    file: { unit: "بایټس", verb: "ولري" },
    array: { unit: "توکي", verb: "ولري" },
    set: { unit: "توکي", verb: "ولري" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "ورودي",
    email: "بریښنالیک",
    url: "یو آر ال",
    emoji: "ایموجي",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "نیټه او وخت",
    date: "نېټه",
    time: "وخت",
    duration: "موده",
    ipv4: "د IPv4 پته",
    ipv6: "د IPv6 پته",
    cidrv4: "د IPv4 ساحه",
    cidrv6: "د IPv6 ساحه",
    base64: "base64-encoded متن",
    base64url: "base64url-encoded متن",
    json_string: "JSON متن",
    e164: "د E.164 شمېره",
    jwt: "JWT",
    template_literal: "ورودي"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "عدد",
    array: "ارې"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `ناسم ورودي: باید instanceof ${issue2.expected} وای, مګر ${received} ترلاسه شو`;
        }
        return `ناسم ورودي: باید ${expected} وای, مګر ${received} ترلاسه شو`;
      }
      case "invalid_value":
        if (issue2.values.length === 1) {
          return `ناسم ورودي: باید ${stringifyPrimitive(issue2.values[0])} وای`;
        }
        return `ناسم انتخاب: باید یو له ${joinValues(issue2.values, "|")} څخه وای`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `ډیر لوی: ${issue2.origin ?? "ارزښت"} باید ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "عنصرونه"} ولري`;
        }
        return `ډیر لوی: ${issue2.origin ?? "ارزښت"} باید ${adj}${issue2.maximum.toString()} وي`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `ډیر کوچنی: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} ${sizing.unit} ولري`;
        }
        return `ډیر کوچنی: ${issue2.origin} باید ${adj}${issue2.minimum.toString()} وي`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `ناسم متن: باید د "${_issue.prefix}" سره پیل شي`;
        }
        if (_issue.format === "ends_with") {
          return `ناسم متن: باید د "${_issue.suffix}" سره پای ته ورسيږي`;
        }
        if (_issue.format === "includes") {
          return `ناسم متن: باید "${_issue.includes}" ولري`;
        }
        if (_issue.format === "regex") {
          return `ناسم متن: باید د ${_issue.pattern} سره مطابقت ولري`;
        }
        return `${FormatDictionary[_issue.format] ?? issue2.format} ناسم دی`;
      }
      case "not_multiple_of":
        return `ناسم عدد: باید د ${issue2.divisor} مضرب وي`;
      case "unrecognized_keys":
        return `ناسم ${issue2.keys.length > 1 ? "کلیډونه" : "کلیډ"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `ناسم کلیډ په ${issue2.origin} کې`;
      case "invalid_union":
        return `ناسمه ورودي`;
      case "invalid_element":
        return `ناسم عنصر په ${issue2.origin} کې`;
      default:
        return `ناسمه ورودي`;
    }
  };
};
function ps_default() {
  return {
    localeError: error34()
  };
}
// node_modules/zod/v4/locales/pl.js
var error35 = () => {
  const Sizable = {
    string: { unit: "znaków", verb: "mieć" },
    file: { unit: "bajtów", verb: "mieć" },
    array: { unit: "elementów", verb: "mieć" },
    set: { unit: "elementów", verb: "mieć" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "wyrażenie",
    email: "adres email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data i godzina w formacie ISO",
    date: "data w formacie ISO",
    time: "godzina w formacie ISO",
    duration: "czas trwania ISO",
    ipv4: "adres IPv4",
    ipv6: "adres IPv6",
    cidrv4: "zakres IPv4",
    cidrv6: "zakres IPv6",
    base64: "ciąg znaków zakodowany w formacie base64",
    base64url: "ciąg znaków zakodowany w formacie base64url",
    json_string: "ciąg znaków w formacie JSON",
    e164: "liczba E.164",
    jwt: "JWT",
    template_literal: "wejście"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "liczba",
    array: "tablica"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Nieprawidłowe dane wejściowe: oczekiwano instanceof ${issue2.expected}, otrzymano ${received}`;
        }
        return `Nieprawidłowe dane wejściowe: oczekiwano ${expected}, otrzymano ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Nieprawidłowe dane wejściowe: oczekiwano ${stringifyPrimitive(issue2.values[0])}`;
        return `Nieprawidłowa opcja: oczekiwano jednej z wartości ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Za duża wartość: oczekiwano, że ${issue2.origin ?? "wartość"} będzie mieć ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementów"}`;
        }
        return `Zbyt duż(y/a/e): oczekiwano, że ${issue2.origin ?? "wartość"} będzie wynosić ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Za mała wartość: oczekiwano, że ${issue2.origin ?? "wartość"} będzie mieć ${adj}${issue2.minimum.toString()} ${sizing.unit ?? "elementów"}`;
        }
        return `Zbyt mał(y/a/e): oczekiwano, że ${issue2.origin ?? "wartość"} będzie wynosić ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Nieprawidłowy ciąg znaków: musi zaczynać się od "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Nieprawidłowy ciąg znaków: musi kończyć się na "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Nieprawidłowy ciąg znaków: musi zawierać "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Nieprawidłowy ciąg znaków: musi odpowiadać wzorcowi ${_issue.pattern}`;
        return `Nieprawidłow(y/a/e) ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Nieprawidłowa liczba: musi być wielokrotnością ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Nierozpoznane klucze${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Nieprawidłowy klucz w ${issue2.origin}`;
      case "invalid_union":
        return "Nieprawidłowe dane wejściowe";
      case "invalid_element":
        return `Nieprawidłowa wartość w ${issue2.origin}`;
      default:
        return `Nieprawidłowe dane wejściowe`;
    }
  };
};
function pl_default() {
  return {
    localeError: error35()
  };
}
// node_modules/zod/v4/locales/pt.js
var error36 = () => {
  const Sizable = {
    string: { unit: "caracteres", verb: "ter" },
    file: { unit: "bytes", verb: "ter" },
    array: { unit: "itens", verb: "ter" },
    set: { unit: "itens", verb: "ter" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "padrão",
    email: "endereço de e-mail",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "data e hora ISO",
    date: "data ISO",
    time: "hora ISO",
    duration: "duração ISO",
    ipv4: "endereço IPv4",
    ipv6: "endereço IPv6",
    cidrv4: "faixa de IPv4",
    cidrv6: "faixa de IPv6",
    base64: "texto codificado em base64",
    base64url: "URL codificada em base64",
    json_string: "texto JSON",
    e164: "número E.164",
    jwt: "JWT",
    template_literal: "entrada"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "número",
    null: "nulo"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Tipo inválido: esperado instanceof ${issue2.expected}, recebido ${received}`;
        }
        return `Tipo inválido: esperado ${expected}, recebido ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Entrada inválida: esperado ${stringifyPrimitive(issue2.values[0])}`;
        return `Opção inválida: esperada uma das ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Muito grande: esperado que ${issue2.origin ?? "valor"} tivesse ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementos"}`;
        return `Muito grande: esperado que ${issue2.origin ?? "valor"} fosse ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Muito pequeno: esperado que ${issue2.origin} tivesse ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Muito pequeno: esperado que ${issue2.origin} fosse ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Texto inválido: deve começar com "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Texto inválido: deve terminar com "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Texto inválido: deve incluir "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Texto inválido: deve corresponder ao padrão ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} inválido`;
      }
      case "not_multiple_of":
        return `Número inválido: deve ser múltiplo de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Chave${issue2.keys.length > 1 ? "s" : ""} desconhecida${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Chave inválida em ${issue2.origin}`;
      case "invalid_union":
        return "Entrada inválida";
      case "invalid_element":
        return `Valor inválido em ${issue2.origin}`;
      default:
        return `Campo inválido`;
    }
  };
};
function pt_default() {
  return {
    localeError: error36()
  };
}
// node_modules/zod/v4/locales/ro.js
var error37 = () => {
  const Sizable = {
    string: { unit: "caractere", verb: "să aibă" },
    file: { unit: "octeți", verb: "să aibă" },
    array: { unit: "elemente", verb: "să aibă" },
    set: { unit: "elemente", verb: "să aibă" },
    map: { unit: "intrări", verb: "să aibă" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "intrare",
    email: "adresă de email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "dată și oră ISO",
    date: "dată ISO",
    time: "oră ISO",
    duration: "durată ISO",
    ipv4: "adresă IPv4",
    ipv6: "adresă IPv6",
    mac: "adresă MAC",
    cidrv4: "interval IPv4",
    cidrv6: "interval IPv6",
    base64: "șir codat base64",
    base64url: "șir codat base64url",
    json_string: "șir JSON",
    e164: "număr E.164",
    jwt: "JWT",
    template_literal: "intrare"
  };
  const TypeDictionary = {
    nan: "NaN",
    string: "șir",
    number: "număr",
    boolean: "boolean",
    function: "funcție",
    array: "matrice",
    object: "obiect",
    undefined: "nedefinit",
    symbol: "simbol",
    bigint: "număr mare",
    void: "void",
    never: "never",
    map: "hartă",
    set: "set"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        return `Intrare invalidă: așteptat ${expected}, primit ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Intrare invalidă: așteptat ${stringifyPrimitive(issue2.values[0])}`;
        return `Opțiune invalidă: așteptat una dintre ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Prea mare: așteptat ca ${issue2.origin ?? "valoarea"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elemente"}`;
        return `Prea mare: așteptat ca ${issue2.origin ?? "valoarea"} să fie ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Prea mic: așteptat ca ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Prea mic: așteptat ca ${issue2.origin} să fie ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Șir invalid: trebuie să înceapă cu "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Șir invalid: trebuie să se termine cu "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Șir invalid: trebuie să includă "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Șir invalid: trebuie să se potrivească cu modelul ${_issue.pattern}`;
        return `Format invalid: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Număr invalid: trebuie să fie multiplu de ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Chei nerecunoscute: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Cheie invalidă în ${issue2.origin}`;
      case "invalid_union":
        return "Intrare invalidă";
      case "invalid_element":
        return `Valoare invalidă în ${issue2.origin}`;
      default:
        return `Intrare invalidă`;
    }
  };
};
function ro_default() {
  return {
    localeError: error37()
  };
}
// node_modules/zod/v4/locales/ru.js
function getRussianPlural(count, one, few, many) {
  const absCount = Math.abs(count);
  const lastDigit = absCount % 10;
  const lastTwoDigits = absCount % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return many;
  }
  if (lastDigit === 1) {
    return one;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }
  return many;
}
var error38 = () => {
  const Sizable = {
    string: {
      unit: {
        one: "символ",
        few: "символа",
        many: "символов"
      },
      verb: "иметь"
    },
    file: {
      unit: {
        one: "байт",
        few: "байта",
        many: "байт"
      },
      verb: "иметь"
    },
    array: {
      unit: {
        one: "элемент",
        few: "элемента",
        many: "элементов"
      },
      verb: "иметь"
    },
    set: {
      unit: {
        one: "элемент",
        few: "элемента",
        many: "элементов"
      },
      verb: "иметь"
    }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "ввод",
    email: "email адрес",
    url: "URL",
    emoji: "эмодзи",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO дата и время",
    date: "ISO дата",
    time: "ISO время",
    duration: "ISO длительность",
    ipv4: "IPv4 адрес",
    ipv6: "IPv6 адрес",
    cidrv4: "IPv4 диапазон",
    cidrv6: "IPv6 диапазон",
    base64: "строка в формате base64",
    base64url: "строка в формате base64url",
    json_string: "JSON строка",
    e164: "номер E.164",
    jwt: "JWT",
    template_literal: "ввод"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "число",
    array: "массив"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Неверный ввод: ожидалось instanceof ${issue2.expected}, получено ${received}`;
        }
        return `Неверный ввод: ожидалось ${expected}, получено ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Неверный ввод: ожидалось ${stringifyPrimitive(issue2.values[0])}`;
        return `Неверный вариант: ожидалось одно из ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const maxValue = Number(issue2.maximum);
          const unit = getRussianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `Слишком большое значение: ожидалось, что ${issue2.origin ?? "значение"} будет иметь ${adj}${issue2.maximum.toString()} ${unit}`;
        }
        return `Слишком большое значение: ожидалось, что ${issue2.origin ?? "значение"} будет ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          const minValue = Number(issue2.minimum);
          const unit = getRussianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
          return `Слишком маленькое значение: ожидалось, что ${issue2.origin} будет иметь ${adj}${issue2.minimum.toString()} ${unit}`;
        }
        return `Слишком маленькое значение: ожидалось, что ${issue2.origin} будет ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Неверная строка: должна начинаться с "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Неверная строка: должна заканчиваться на "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Неверная строка: должна содержать "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Неверная строка: должна соответствовать шаблону ${_issue.pattern}`;
        return `Неверный ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Неверное число: должно быть кратным ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Нераспознанн${issue2.keys.length > 1 ? "ые" : "ый"} ключ${issue2.keys.length > 1 ? "и" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Неверный ключ в ${issue2.origin}`;
      case "invalid_union":
        return "Неверные входные данные";
      case "invalid_element":
        return `Неверное значение в ${issue2.origin}`;
      default:
        return `Неверные входные данные`;
    }
  };
};
function ru_default() {
  return {
    localeError: error38()
  };
}
// node_modules/zod/v4/locales/sl.js
var error39 = () => {
  const Sizable = {
    string: { unit: "znakov", verb: "imeti" },
    file: { unit: "bajtov", verb: "imeti" },
    array: { unit: "elementov", verb: "imeti" },
    set: { unit: "elementov", verb: "imeti" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "vnos",
    email: "e-poštni naslov",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datum in čas",
    date: "ISO datum",
    time: "ISO čas",
    duration: "ISO trajanje",
    ipv4: "IPv4 naslov",
    ipv6: "IPv6 naslov",
    cidrv4: "obseg IPv4",
    cidrv6: "obseg IPv6",
    base64: "base64 kodiran niz",
    base64url: "base64url kodiran niz",
    json_string: "JSON niz",
    e164: "E.164 številka",
    jwt: "JWT",
    template_literal: "vnos"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "število",
    array: "tabela"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Neveljaven vnos: pričakovano instanceof ${issue2.expected}, prejeto ${received}`;
        }
        return `Neveljaven vnos: pričakovano ${expected}, prejeto ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Neveljaven vnos: pričakovano ${stringifyPrimitive(issue2.values[0])}`;
        return `Neveljavna možnost: pričakovano eno izmed ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Preveliko: pričakovano, da bo ${issue2.origin ?? "vrednost"} imelo ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elementov"}`;
        return `Preveliko: pričakovano, da bo ${issue2.origin ?? "vrednost"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Premajhno: pričakovano, da bo ${issue2.origin} imelo ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Premajhno: pričakovano, da bo ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Neveljaven niz: mora se začeti z "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Neveljaven niz: mora se končati z "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Neveljaven niz: mora vsebovati "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Neveljaven niz: mora ustrezati vzorcu ${_issue.pattern}`;
        return `Neveljaven ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Neveljavno število: mora biti večkratnik ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Neprepoznan${issue2.keys.length > 1 ? "i ključi" : " ključ"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Neveljaven ključ v ${issue2.origin}`;
      case "invalid_union":
        return "Neveljaven vnos";
      case "invalid_element":
        return `Neveljavna vrednost v ${issue2.origin}`;
      default:
        return "Neveljaven vnos";
    }
  };
};
function sl_default() {
  return {
    localeError: error39()
  };
}
// node_modules/zod/v4/locales/sv.js
var error40 = () => {
  const Sizable = {
    string: { unit: "tecken", verb: "att ha" },
    file: { unit: "bytes", verb: "att ha" },
    array: { unit: "objekt", verb: "att innehålla" },
    set: { unit: "objekt", verb: "att innehålla" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "reguljärt uttryck",
    email: "e-postadress",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO-datum och tid",
    date: "ISO-datum",
    time: "ISO-tid",
    duration: "ISO-varaktighet",
    ipv4: "IPv4-intervall",
    ipv6: "IPv6-intervall",
    cidrv4: "IPv4-spektrum",
    cidrv6: "IPv6-spektrum",
    base64: "base64-kodad sträng",
    base64url: "base64url-kodad sträng",
    json_string: "JSON-sträng",
    e164: "E.164-nummer",
    jwt: "JWT",
    template_literal: "mall-literal"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "antal",
    array: "lista"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ogiltig inmatning: förväntat instanceof ${issue2.expected}, fick ${received}`;
        }
        return `Ogiltig inmatning: förväntat ${expected}, fick ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ogiltig inmatning: förväntat ${stringifyPrimitive(issue2.values[0])}`;
        return `Ogiltigt val: förväntade en av ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `För stor(t): förväntade ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "element"}`;
        }
        return `För stor(t): förväntat ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `För lite(t): förväntade ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `För lite(t): förväntade ${issue2.origin ?? "värdet"} att ha ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Ogiltig sträng: måste börja med "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Ogiltig sträng: måste sluta med "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ogiltig sträng: måste innehålla "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ogiltig sträng: måste matcha mönstret "${_issue.pattern}"`;
        return `Ogiltig(t) ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Ogiltigt tal: måste vara en multipel av ${issue2.divisor}`;
      case "unrecognized_keys":
        return `${issue2.keys.length > 1 ? "Okända nycklar" : "Okänd nyckel"}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Ogiltig nyckel i ${issue2.origin ?? "värdet"}`;
      case "invalid_union":
        return "Ogiltig input";
      case "invalid_element":
        return `Ogiltigt värde i ${issue2.origin ?? "värdet"}`;
      default:
        return `Ogiltig input`;
    }
  };
};
function sv_default() {
  return {
    localeError: error40()
  };
}
// node_modules/zod/v4/locales/ta.js
var error41 = () => {
  const Sizable = {
    string: { unit: "எழுத்துக்கள்", verb: "கொண்டிருக்க வேண்டும்" },
    file: { unit: "பைட்டுகள்", verb: "கொண்டிருக்க வேண்டும்" },
    array: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" },
    set: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "உள்ளீடு",
    email: "மின்னஞ்சல் முகவரி",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO தேதி நேரம்",
    date: "ISO தேதி",
    time: "ISO நேரம்",
    duration: "ISO கால அளவு",
    ipv4: "IPv4 முகவரி",
    ipv6: "IPv6 முகவரி",
    cidrv4: "IPv4 வரம்பு",
    cidrv6: "IPv6 வரம்பு",
    base64: "base64-encoded சரம்",
    base64url: "base64url-encoded சரம்",
    json_string: "JSON சரம்",
    e164: "E.164 எண்",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "எண்",
    array: "அணி",
    null: "வெறுமை"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது instanceof ${issue2.expected}, பெறப்பட்டது ${received}`;
        }
        return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${expected}, பெறப்பட்டது ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${stringifyPrimitive(issue2.values[0])}`;
        return `தவறான விருப்பம்: எதிர்பார்க்கப்பட்டது ${joinValues(issue2.values, "|")} இல் ஒன்று`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${issue2.origin ?? "மதிப்பு"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "உறுப்புகள்"} ஆக இருக்க வேண்டும்`;
        }
        return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${issue2.origin ?? "மதிப்பு"} ${adj}${issue2.maximum.toString()} ஆக இருக்க வேண்டும்`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} ஆக இருக்க வேண்டும்`;
        }
        return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${issue2.origin} ${adj}${issue2.minimum.toString()} ஆக இருக்க வேண்டும்`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `தவறான சரம்: "${_issue.prefix}" இல் தொடங்க வேண்டும்`;
        if (_issue.format === "ends_with")
          return `தவறான சரம்: "${_issue.suffix}" இல் முடிவடைய வேண்டும்`;
        if (_issue.format === "includes")
          return `தவறான சரம்: "${_issue.includes}" ஐ உள்ளடக்க வேண்டும்`;
        if (_issue.format === "regex")
          return `தவறான சரம்: ${_issue.pattern} முறைபாட்டுடன் பொருந்த வேண்டும்`;
        return `தவறான ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `தவறான எண்: ${issue2.divisor} இன் பலமாக இருக்க வேண்டும்`;
      case "unrecognized_keys":
        return `அடையாளம் தெரியாத விசை${issue2.keys.length > 1 ? "கள்" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} இல் தவறான விசை`;
      case "invalid_union":
        return "தவறான உள்ளீடு";
      case "invalid_element":
        return `${issue2.origin} இல் தவறான மதிப்பு`;
      default:
        return `தவறான உள்ளீடு`;
    }
  };
};
function ta_default() {
  return {
    localeError: error41()
  };
}
// node_modules/zod/v4/locales/th.js
var error42 = () => {
  const Sizable = {
    string: { unit: "ตัวอักษร", verb: "ควรมี" },
    file: { unit: "ไบต์", verb: "ควรมี" },
    array: { unit: "รายการ", verb: "ควรมี" },
    set: { unit: "รายการ", verb: "ควรมี" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "ข้อมูลที่ป้อน",
    email: "ที่อยู่อีเมล",
    url: "URL",
    emoji: "อิโมจิ",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "วันที่เวลาแบบ ISO",
    date: "วันที่แบบ ISO",
    time: "เวลาแบบ ISO",
    duration: "ช่วงเวลาแบบ ISO",
    ipv4: "ที่อยู่ IPv4",
    ipv6: "ที่อยู่ IPv6",
    cidrv4: "ช่วง IP แบบ IPv4",
    cidrv6: "ช่วง IP แบบ IPv6",
    base64: "ข้อความแบบ Base64",
    base64url: "ข้อความแบบ Base64 สำหรับ URL",
    json_string: "ข้อความแบบ JSON",
    e164: "เบอร์โทรศัพท์ระหว่างประเทศ (E.164)",
    jwt: "โทเคน JWT",
    template_literal: "ข้อมูลที่ป้อน"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "ตัวเลข",
    array: "อาร์เรย์ (Array)",
    null: "ไม่มีค่า (null)"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `ประเภทข้อมูลไม่ถูกต้อง: ควรเป็น instanceof ${issue2.expected} แต่ได้รับ ${received}`;
        }
        return `ประเภทข้อมูลไม่ถูกต้อง: ควรเป็น ${expected} แต่ได้รับ ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `ค่าไม่ถูกต้อง: ควรเป็น ${stringifyPrimitive(issue2.values[0])}`;
        return `ตัวเลือกไม่ถูกต้อง: ควรเป็นหนึ่งใน ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "ไม่เกิน" : "น้อยกว่า";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `เกินกำหนด: ${issue2.origin ?? "ค่า"} ควรมี${adj} ${issue2.maximum.toString()} ${sizing.unit ?? "รายการ"}`;
        return `เกินกำหนด: ${issue2.origin ?? "ค่า"} ควรมี${adj} ${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? "อย่างน้อย" : "มากกว่า";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `น้อยกว่ากำหนด: ${issue2.origin} ควรมี${adj} ${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `น้อยกว่ากำหนด: ${issue2.origin} ควรมี${adj} ${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `รูปแบบไม่ถูกต้อง: ข้อความต้องขึ้นต้นด้วย "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `รูปแบบไม่ถูกต้อง: ข้อความต้องลงท้ายด้วย "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `รูปแบบไม่ถูกต้อง: ข้อความต้องมี "${_issue.includes}" อยู่ในข้อความ`;
        if (_issue.format === "regex")
          return `รูปแบบไม่ถูกต้อง: ต้องตรงกับรูปแบบที่กำหนด ${_issue.pattern}`;
        return `รูปแบบไม่ถูกต้อง: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `ตัวเลขไม่ถูกต้อง: ต้องเป็นจำนวนที่หารด้วย ${issue2.divisor} ได้ลงตัว`;
      case "unrecognized_keys":
        return `พบคีย์ที่ไม่รู้จัก: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `คีย์ไม่ถูกต้องใน ${issue2.origin}`;
      case "invalid_union":
        return "ข้อมูลไม่ถูกต้อง: ไม่ตรงกับรูปแบบยูเนียนที่กำหนดไว้";
      case "invalid_element":
        return `ข้อมูลไม่ถูกต้องใน ${issue2.origin}`;
      default:
        return `ข้อมูลไม่ถูกต้อง`;
    }
  };
};
function th_default() {
  return {
    localeError: error42()
  };
}
// node_modules/zod/v4/locales/tr.js
var error43 = () => {
  const Sizable = {
    string: { unit: "karakter", verb: "olmalı" },
    file: { unit: "bayt", verb: "olmalı" },
    array: { unit: "öğe", verb: "olmalı" },
    set: { unit: "öğe", verb: "olmalı" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "girdi",
    email: "e-posta adresi",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO tarih ve saat",
    date: "ISO tarih",
    time: "ISO saat",
    duration: "ISO süre",
    ipv4: "IPv4 adresi",
    ipv6: "IPv6 adresi",
    cidrv4: "IPv4 aralığı",
    cidrv6: "IPv6 aralığı",
    base64: "base64 ile şifrelenmiş metin",
    base64url: "base64url ile şifrelenmiş metin",
    json_string: "JSON dizesi",
    e164: "E.164 sayısı",
    jwt: "JWT",
    template_literal: "Şablon dizesi"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Geçersiz değer: beklenen instanceof ${issue2.expected}, alınan ${received}`;
        }
        return `Geçersiz değer: beklenen ${expected}, alınan ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Geçersiz değer: beklenen ${stringifyPrimitive(issue2.values[0])}`;
        return `Geçersiz seçenek: aşağıdakilerden biri olmalı: ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Çok büyük: beklenen ${issue2.origin ?? "değer"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "öğe"}`;
        return `Çok büyük: beklenen ${issue2.origin ?? "değer"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Çok küçük: beklenen ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        return `Çok küçük: beklenen ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Geçersiz metin: "${_issue.prefix}" ile başlamalı`;
        if (_issue.format === "ends_with")
          return `Geçersiz metin: "${_issue.suffix}" ile bitmeli`;
        if (_issue.format === "includes")
          return `Geçersiz metin: "${_issue.includes}" içermeli`;
        if (_issue.format === "regex")
          return `Geçersiz metin: ${_issue.pattern} desenine uymalı`;
        return `Geçersiz ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Geçersiz sayı: ${issue2.divisor} ile tam bölünebilmeli`;
      case "unrecognized_keys":
        return `Tanınmayan anahtar${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} içinde geçersiz anahtar`;
      case "invalid_union":
        return "Geçersiz değer";
      case "invalid_element":
        return `${issue2.origin} içinde geçersiz değer`;
      default:
        return `Geçersiz değer`;
    }
  };
};
function tr_default() {
  return {
    localeError: error43()
  };
}
// node_modules/zod/v4/locales/uk.js
var error44 = () => {
  const Sizable = {
    string: { unit: "символів", verb: "матиме" },
    file: { unit: "байтів", verb: "матиме" },
    array: { unit: "елементів", verb: "матиме" },
    set: { unit: "елементів", verb: "матиме" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "вхідні дані",
    email: "адреса електронної пошти",
    url: "URL",
    emoji: "емодзі",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "дата та час ISO",
    date: "дата ISO",
    time: "час ISO",
    duration: "тривалість ISO",
    ipv4: "адреса IPv4",
    ipv6: "адреса IPv6",
    cidrv4: "діапазон IPv4",
    cidrv6: "діапазон IPv6",
    base64: "рядок у кодуванні base64",
    base64url: "рядок у кодуванні base64url",
    json_string: "рядок JSON",
    e164: "номер E.164",
    jwt: "JWT",
    template_literal: "вхідні дані"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "число",
    array: "масив"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Неправильні вхідні дані: очікується instanceof ${issue2.expected}, отримано ${received}`;
        }
        return `Неправильні вхідні дані: очікується ${expected}, отримано ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Неправильні вхідні дані: очікується ${stringifyPrimitive(issue2.values[0])}`;
        return `Неправильна опція: очікується одне з ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Занадто велике: очікується, що ${issue2.origin ?? "значення"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "елементів"}`;
        return `Занадто велике: очікується, що ${issue2.origin ?? "значення"} буде ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Занадто мале: очікується, що ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Занадто мале: очікується, що ${issue2.origin} буде ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Неправильний рядок: повинен починатися з "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Неправильний рядок: повинен закінчуватися на "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Неправильний рядок: повинен містити "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Неправильний рядок: повинен відповідати шаблону ${_issue.pattern}`;
        return `Неправильний ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Неправильне число: повинно бути кратним ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Нерозпізнаний ключ${issue2.keys.length > 1 ? "і" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Неправильний ключ у ${issue2.origin}`;
      case "invalid_union":
        return "Неправильні вхідні дані";
      case "invalid_element":
        return `Неправильне значення у ${issue2.origin}`;
      default:
        return `Неправильні вхідні дані`;
    }
  };
};
function uk_default() {
  return {
    localeError: error44()
  };
}

// node_modules/zod/v4/locales/ua.js
function ua_default() {
  return uk_default();
}
// node_modules/zod/v4/locales/ur.js
var error45 = () => {
  const Sizable = {
    string: { unit: "حروف", verb: "ہونا" },
    file: { unit: "بائٹس", verb: "ہونا" },
    array: { unit: "آئٹمز", verb: "ہونا" },
    set: { unit: "آئٹمز", verb: "ہونا" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "ان پٹ",
    email: "ای میل ایڈریس",
    url: "یو آر ایل",
    emoji: "ایموجی",
    uuid: "یو یو آئی ڈی",
    uuidv4: "یو یو آئی ڈی وی 4",
    uuidv6: "یو یو آئی ڈی وی 6",
    nanoid: "نینو آئی ڈی",
    guid: "جی یو آئی ڈی",
    cuid: "سی یو آئی ڈی",
    cuid2: "سی یو آئی ڈی 2",
    ulid: "یو ایل آئی ڈی",
    xid: "ایکس آئی ڈی",
    ksuid: "کے ایس یو آئی ڈی",
    datetime: "آئی ایس او ڈیٹ ٹائم",
    date: "آئی ایس او تاریخ",
    time: "آئی ایس او وقت",
    duration: "آئی ایس او مدت",
    ipv4: "آئی پی وی 4 ایڈریس",
    ipv6: "آئی پی وی 6 ایڈریس",
    cidrv4: "آئی پی وی 4 رینج",
    cidrv6: "آئی پی وی 6 رینج",
    base64: "بیس 64 ان کوڈڈ سٹرنگ",
    base64url: "بیس 64 یو آر ایل ان کوڈڈ سٹرنگ",
    json_string: "جے ایس او این سٹرنگ",
    e164: "ای 164 نمبر",
    jwt: "جے ڈبلیو ٹی",
    template_literal: "ان پٹ"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "نمبر",
    array: "آرے",
    null: "نل"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `غلط ان پٹ: instanceof ${issue2.expected} متوقع تھا، ${received} موصول ہوا`;
        }
        return `غلط ان پٹ: ${expected} متوقع تھا، ${received} موصول ہوا`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `غلط ان پٹ: ${stringifyPrimitive(issue2.values[0])} متوقع تھا`;
        return `غلط آپشن: ${joinValues(issue2.values, "|")} میں سے ایک متوقع تھا`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `بہت بڑا: ${issue2.origin ?? "ویلیو"} کے ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "عناصر"} ہونے متوقع تھے`;
        return `بہت بڑا: ${issue2.origin ?? "ویلیو"} کا ${adj}${issue2.maximum.toString()} ہونا متوقع تھا`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `بہت چھوٹا: ${issue2.origin} کے ${adj}${issue2.minimum.toString()} ${sizing.unit} ہونے متوقع تھے`;
        }
        return `بہت چھوٹا: ${issue2.origin} کا ${adj}${issue2.minimum.toString()} ہونا متوقع تھا`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `غلط سٹرنگ: "${_issue.prefix}" سے شروع ہونا چاہیے`;
        }
        if (_issue.format === "ends_with")
          return `غلط سٹرنگ: "${_issue.suffix}" پر ختم ہونا چاہیے`;
        if (_issue.format === "includes")
          return `غلط سٹرنگ: "${_issue.includes}" شامل ہونا چاہیے`;
        if (_issue.format === "regex")
          return `غلط سٹرنگ: پیٹرن ${_issue.pattern} سے میچ ہونا چاہیے`;
        return `غلط ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `غلط نمبر: ${issue2.divisor} کا مضاعف ہونا چاہیے`;
      case "unrecognized_keys":
        return `غیر تسلیم شدہ کی${issue2.keys.length > 1 ? "ز" : ""}: ${joinValues(issue2.keys, "، ")}`;
      case "invalid_key":
        return `${issue2.origin} میں غلط کی`;
      case "invalid_union":
        return "غلط ان پٹ";
      case "invalid_element":
        return `${issue2.origin} میں غلط ویلیو`;
      default:
        return `غلط ان پٹ`;
    }
  };
};
function ur_default() {
  return {
    localeError: error45()
  };
}
// node_modules/zod/v4/locales/uz.js
var error46 = () => {
  const Sizable = {
    string: { unit: "belgi", verb: "bo‘lishi kerak" },
    file: { unit: "bayt", verb: "bo‘lishi kerak" },
    array: { unit: "element", verb: "bo‘lishi kerak" },
    set: { unit: "element", verb: "bo‘lishi kerak" },
    map: { unit: "yozuv", verb: "bo‘lishi kerak" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "kirish",
    email: "elektron pochta manzili",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO sana va vaqti",
    date: "ISO sana",
    time: "ISO vaqt",
    duration: "ISO davomiylik",
    ipv4: "IPv4 manzil",
    ipv6: "IPv6 manzil",
    mac: "MAC manzil",
    cidrv4: "IPv4 diapazon",
    cidrv6: "IPv6 diapazon",
    base64: "base64 kodlangan satr",
    base64url: "base64url kodlangan satr",
    json_string: "JSON satr",
    e164: "E.164 raqam",
    jwt: "JWT",
    template_literal: "kirish"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "raqam",
    array: "massiv"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Noto‘g‘ri kirish: kutilgan instanceof ${issue2.expected}, qabul qilingan ${received}`;
        }
        return `Noto‘g‘ri kirish: kutilgan ${expected}, qabul qilingan ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Noto‘g‘ri kirish: kutilgan ${stringifyPrimitive(issue2.values[0])}`;
        return `Noto‘g‘ri variant: quyidagilardan biri kutilgan ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Juda katta: kutilgan ${issue2.origin ?? "qiymat"} ${adj}${issue2.maximum.toString()} ${sizing.unit} ${sizing.verb}`;
        return `Juda katta: kutilgan ${issue2.origin ?? "qiymat"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Juda kichik: kutilgan ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit} ${sizing.verb}`;
        }
        return `Juda kichik: kutilgan ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Noto‘g‘ri satr: "${_issue.prefix}" bilan boshlanishi kerak`;
        if (_issue.format === "ends_with")
          return `Noto‘g‘ri satr: "${_issue.suffix}" bilan tugashi kerak`;
        if (_issue.format === "includes")
          return `Noto‘g‘ri satr: "${_issue.includes}" ni o‘z ichiga olishi kerak`;
        if (_issue.format === "regex")
          return `Noto‘g‘ri satr: ${_issue.pattern} shabloniga mos kelishi kerak`;
        return `Noto‘g‘ri ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Noto‘g‘ri raqam: ${issue2.divisor} ning karralisi bo‘lishi kerak`;
      case "unrecognized_keys":
        return `Noma’lum kalit${issue2.keys.length > 1 ? "lar" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} dagi kalit noto‘g‘ri`;
      case "invalid_union":
        return "Noto‘g‘ri kirish";
      case "invalid_element":
        return `${issue2.origin} da noto‘g‘ri qiymat`;
      default:
        return `Noto‘g‘ri kirish`;
    }
  };
};
function uz_default() {
  return {
    localeError: error46()
  };
}
// node_modules/zod/v4/locales/vi.js
var error47 = () => {
  const Sizable = {
    string: { unit: "ký tự", verb: "có" },
    file: { unit: "byte", verb: "có" },
    array: { unit: "phần tử", verb: "có" },
    set: { unit: "phần tử", verb: "có" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "đầu vào",
    email: "địa chỉ email",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ngày giờ ISO",
    date: "ngày ISO",
    time: "giờ ISO",
    duration: "khoảng thời gian ISO",
    ipv4: "địa chỉ IPv4",
    ipv6: "địa chỉ IPv6",
    cidrv4: "dải IPv4",
    cidrv6: "dải IPv6",
    base64: "chuỗi mã hóa base64",
    base64url: "chuỗi mã hóa base64url",
    json_string: "chuỗi JSON",
    e164: "số E.164",
    jwt: "JWT",
    template_literal: "đầu vào"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "số",
    array: "mảng"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Đầu vào không hợp lệ: mong đợi instanceof ${issue2.expected}, nhận được ${received}`;
        }
        return `Đầu vào không hợp lệ: mong đợi ${expected}, nhận được ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Đầu vào không hợp lệ: mong đợi ${stringifyPrimitive(issue2.values[0])}`;
        return `Tùy chọn không hợp lệ: mong đợi một trong các giá trị ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Quá lớn: mong đợi ${issue2.origin ?? "giá trị"} ${sizing.verb} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "phần tử"}`;
        return `Quá lớn: mong đợi ${issue2.origin ?? "giá trị"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Quá nhỏ: mong đợi ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Quá nhỏ: mong đợi ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Chuỗi không hợp lệ: phải bắt đầu bằng "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Chuỗi không hợp lệ: phải kết thúc bằng "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Chuỗi không hợp lệ: phải bao gồm "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Chuỗi không hợp lệ: phải khớp với mẫu ${_issue.pattern}`;
        return `${FormatDictionary[_issue.format] ?? issue2.format} không hợp lệ`;
      }
      case "not_multiple_of":
        return `Số không hợp lệ: phải là bội số của ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Khóa không được nhận dạng: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Khóa không hợp lệ trong ${issue2.origin}`;
      case "invalid_union":
        return "Đầu vào không hợp lệ";
      case "invalid_element":
        return `Giá trị không hợp lệ trong ${issue2.origin}`;
      default:
        return `Đầu vào không hợp lệ`;
    }
  };
};
function vi_default() {
  return {
    localeError: error47()
  };
}
// node_modules/zod/v4/locales/zh-CN.js
var error48 = () => {
  const Sizable = {
    string: { unit: "字符", verb: "包含" },
    file: { unit: "字节", verb: "包含" },
    array: { unit: "项", verb: "包含" },
    set: { unit: "项", verb: "包含" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "输入",
    email: "电子邮件",
    url: "URL",
    emoji: "表情符号",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO日期时间",
    date: "ISO日期",
    time: "ISO时间",
    duration: "ISO时长",
    ipv4: "IPv4地址",
    ipv6: "IPv6地址",
    cidrv4: "IPv4网段",
    cidrv6: "IPv6网段",
    base64: "base64编码字符串",
    base64url: "base64url编码字符串",
    json_string: "JSON字符串",
    e164: "E.164号码",
    jwt: "JWT",
    template_literal: "输入"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "数字",
    array: "数组",
    null: "空值(null)"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `无效输入：期望 instanceof ${issue2.expected}，实际接收 ${received}`;
        }
        return `无效输入：期望 ${expected}，实际接收 ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `无效输入：期望 ${stringifyPrimitive(issue2.values[0])}`;
        return `无效选项：期望以下之一 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `数值过大：期望 ${issue2.origin ?? "值"} ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "个元素"}`;
        return `数值过大：期望 ${issue2.origin ?? "值"} ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `数值过小：期望 ${issue2.origin} ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `数值过小：期望 ${issue2.origin} ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `无效字符串：必须以 "${_issue.prefix}" 开头`;
        if (_issue.format === "ends_with")
          return `无效字符串：必须以 "${_issue.suffix}" 结尾`;
        if (_issue.format === "includes")
          return `无效字符串：必须包含 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `无效字符串：必须满足正则表达式 ${_issue.pattern}`;
        return `无效${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `无效数字：必须是 ${issue2.divisor} 的倍数`;
      case "unrecognized_keys":
        return `出现未知的键(key): ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `${issue2.origin} 中的键(key)无效`;
      case "invalid_union":
        return "无效输入";
      case "invalid_element":
        return `${issue2.origin} 中包含无效值(value)`;
      default:
        return `无效输入`;
    }
  };
};
function zh_CN_default() {
  return {
    localeError: error48()
  };
}
// node_modules/zod/v4/locales/zh-TW.js
var error49 = () => {
  const Sizable = {
    string: { unit: "字元", verb: "擁有" },
    file: { unit: "位元組", verb: "擁有" },
    array: { unit: "項目", verb: "擁有" },
    set: { unit: "項目", verb: "擁有" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "輸入",
    email: "郵件地址",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO 日期時間",
    date: "ISO 日期",
    time: "ISO 時間",
    duration: "ISO 期間",
    ipv4: "IPv4 位址",
    ipv6: "IPv6 位址",
    cidrv4: "IPv4 範圍",
    cidrv6: "IPv6 範圍",
    base64: "base64 編碼字串",
    base64url: "base64url 編碼字串",
    json_string: "JSON 字串",
    e164: "E.164 數值",
    jwt: "JWT",
    template_literal: "輸入"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `無效的輸入值：預期為 instanceof ${issue2.expected}，但收到 ${received}`;
        }
        return `無效的輸入值：預期為 ${expected}，但收到 ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `無效的輸入值：預期為 ${stringifyPrimitive(issue2.values[0])}`;
        return `無效的選項：預期為以下其中之一 ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `數值過大：預期 ${issue2.origin ?? "值"} 應為 ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "個元素"}`;
        return `數值過大：預期 ${issue2.origin ?? "值"} 應為 ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `數值過小：預期 ${issue2.origin} 應為 ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `數值過小：預期 ${issue2.origin} 應為 ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `無效的字串：必須以 "${_issue.prefix}" 開頭`;
        }
        if (_issue.format === "ends_with")
          return `無效的字串：必須以 "${_issue.suffix}" 結尾`;
        if (_issue.format === "includes")
          return `無效的字串：必須包含 "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `無效的字串：必須符合格式 ${_issue.pattern}`;
        return `無效的 ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `無效的數字：必須為 ${issue2.divisor} 的倍數`;
      case "unrecognized_keys":
        return `無法識別的鍵值${issue2.keys.length > 1 ? "們" : ""}：${joinValues(issue2.keys, "、")}`;
      case "invalid_key":
        return `${issue2.origin} 中有無效的鍵值`;
      case "invalid_union":
        return "無效的輸入值";
      case "invalid_element":
        return `${issue2.origin} 中有無效的值`;
      default:
        return `無效的輸入值`;
    }
  };
};
function zh_TW_default() {
  return {
    localeError: error49()
  };
}
// node_modules/zod/v4/locales/yo.js
var error50 = () => {
  const Sizable = {
    string: { unit: "àmi", verb: "ní" },
    file: { unit: "bytes", verb: "ní" },
    array: { unit: "nkan", verb: "ní" },
    set: { unit: "nkan", verb: "ní" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "ẹ̀rọ ìbáwọlé",
    email: "àdírẹ́sì ìmẹ́lì",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "àkókò ISO",
    date: "ọjọ́ ISO",
    time: "àkókò ISO",
    duration: "àkókò tó pé ISO",
    ipv4: "àdírẹ́sì IPv4",
    ipv6: "àdírẹ́sì IPv6",
    cidrv4: "àgbègbè IPv4",
    cidrv6: "àgbègbè IPv6",
    base64: "ọ̀rọ̀ tí a kọ́ ní base64",
    base64url: "ọ̀rọ̀ base64url",
    json_string: "ọ̀rọ̀ JSON",
    e164: "nọ́mbà E.164",
    jwt: "JWT",
    template_literal: "ẹ̀rọ ìbáwọlé"
  };
  const TypeDictionary = {
    nan: "NaN",
    number: "nọ́mbà",
    array: "akopọ"
  };
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = TypeDictionary[issue2.expected] ?? issue2.expected;
        const receivedType = parsedType(issue2.input);
        const received = TypeDictionary[receivedType] ?? receivedType;
        if (/^[A-Z]/.test(issue2.expected)) {
          return `Ìbáwọlé aṣìṣe: a ní láti fi instanceof ${issue2.expected}, àmọ̀ a rí ${received}`;
        }
        return `Ìbáwọlé aṣìṣe: a ní láti fi ${expected}, àmọ̀ a rí ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Ìbáwọlé aṣìṣe: a ní láti fi ${stringifyPrimitive(issue2.values[0])}`;
        return `Àṣàyàn aṣìṣe: yan ọ̀kan lára ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Tó pọ̀ jù: a ní láti jẹ́ pé ${issue2.origin ?? "iye"} ${sizing.verb} ${adj}${issue2.maximum} ${sizing.unit}`;
        return `Tó pọ̀ jù: a ní láti jẹ́ ${adj}${issue2.maximum}`;
      }
      case "too_small": {
        const adj = issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Kéré ju: a ní láti jẹ́ pé ${issue2.origin} ${sizing.verb} ${adj}${issue2.minimum} ${sizing.unit}`;
        return `Kéré ju: a ní láti jẹ́ ${adj}${issue2.minimum}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with")
          return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ bẹ̀rẹ̀ pẹ̀lú "${_issue.prefix}"`;
        if (_issue.format === "ends_with")
          return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ parí pẹ̀lú "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ ní "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Ọ̀rọ̀ aṣìṣe: gbọ́dọ̀ bá àpẹẹrẹ mu ${_issue.pattern}`;
        return `Aṣìṣe: ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Nọ́mbà aṣìṣe: gbọ́dọ̀ jẹ́ èyà pípín ti ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Bọtìnì àìmọ̀: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Bọtìnì aṣìṣe nínú ${issue2.origin}`;
      case "invalid_union":
        return "Ìbáwọlé aṣìṣe";
      case "invalid_element":
        return `Iye aṣìṣe nínú ${issue2.origin}`;
      default:
        return "Ìbáwọlé aṣìṣe";
    }
  };
};
function yo_default() {
  return {
    localeError: error50()
  };
}
// node_modules/zod/v4/core/registries.js
var _a2;
var $output = Symbol("ZodOutput");
var $input = Symbol("ZodInput");

class $ZodRegistry {
  constructor() {
    this._map = new WeakMap;
    this._idmap = new Map;
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = new WeakMap;
    this._idmap = new Map;
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : undefined;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
}
function registry() {
  return new $ZodRegistry;
}
(_a2 = globalThis).__zod_globalRegistry ?? (_a2.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;
// node_modules/zod/v4/core/api.js
function _string(Class2, params) {
  return new Class2({
    type: "string",
    ...normalizeParams(params)
  });
}
function _coercedString(Class2, params) {
  return new Class2({
    type: "string",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _email(Class2, params) {
  return new Class2({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _guid(Class2, params) {
  return new Class2({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuidv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
function _uuidv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
function _uuidv7(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
function _url(Class2, params) {
  return new Class2({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _emoji2(Class2, params) {
  return new Class2({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _nanoid(Class2, params) {
  return new Class2({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid2(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ulid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _xid(Class2, params) {
  return new Class2({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ksuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _mac(Class2, params) {
  return new Class2({
    type: "string",
    format: "mac",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64url(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _e164(Class2, params) {
  return new Class2({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _jwt(Class2, params) {
  return new Class2({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
var TimePrecision = {
  Any: null,
  Minute: -1,
  Second: 0,
  Millisecond: 3,
  Microsecond: 6
};
function _isoDateTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDate(Class2, params) {
  return new Class2({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _isoTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDuration(Class2, params) {
  return new Class2({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _number(Class2, params) {
  return new Class2({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
function _coercedNumber(Class2, params) {
  return new Class2({
    type: "number",
    coerce: true,
    checks: [],
    ...normalizeParams(params)
  });
}
function _int(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
function _float32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "float32",
    ...normalizeParams(params)
  });
}
function _float64(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "float64",
    ...normalizeParams(params)
  });
}
function _int32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "int32",
    ...normalizeParams(params)
  });
}
function _uint32(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "uint32",
    ...normalizeParams(params)
  });
}
function _boolean(Class2, params) {
  return new Class2({
    type: "boolean",
    ...normalizeParams(params)
  });
}
function _coercedBoolean(Class2, params) {
  return new Class2({
    type: "boolean",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _bigint(Class2, params) {
  return new Class2({
    type: "bigint",
    ...normalizeParams(params)
  });
}
function _coercedBigint(Class2, params) {
  return new Class2({
    type: "bigint",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _int64(Class2, params) {
  return new Class2({
    type: "bigint",
    check: "bigint_format",
    abort: false,
    format: "int64",
    ...normalizeParams(params)
  });
}
function _uint64(Class2, params) {
  return new Class2({
    type: "bigint",
    check: "bigint_format",
    abort: false,
    format: "uint64",
    ...normalizeParams(params)
  });
}
function _symbol(Class2, params) {
  return new Class2({
    type: "symbol",
    ...normalizeParams(params)
  });
}
function _undefined2(Class2, params) {
  return new Class2({
    type: "undefined",
    ...normalizeParams(params)
  });
}
function _null2(Class2, params) {
  return new Class2({
    type: "null",
    ...normalizeParams(params)
  });
}
function _any(Class2) {
  return new Class2({
    type: "any"
  });
}
function _unknown(Class2) {
  return new Class2({
    type: "unknown"
  });
}
function _never(Class2, params) {
  return new Class2({
    type: "never",
    ...normalizeParams(params)
  });
}
function _void(Class2, params) {
  return new Class2({
    type: "void",
    ...normalizeParams(params)
  });
}
function _date(Class2, params) {
  return new Class2({
    type: "date",
    ...normalizeParams(params)
  });
}
function _coercedDate(Class2, params) {
  return new Class2({
    type: "date",
    coerce: true,
    ...normalizeParams(params)
  });
}
function _nan(Class2, params) {
  return new Class2({
    type: "nan",
    ...normalizeParams(params)
  });
}
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _positive(params) {
  return _gt(0, params);
}
function _negative(params) {
  return _lt(0, params);
}
function _nonpositive(params) {
  return _lte(0, params);
}
function _nonnegative(params) {
  return _gte(0, params);
}
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
function _maxSize(maximum, params) {
  return new $ZodCheckMaxSize({
    check: "max_size",
    ...normalizeParams(params),
    maximum
  });
}
function _minSize(minimum, params) {
  return new $ZodCheckMinSize({
    check: "min_size",
    ...normalizeParams(params),
    minimum
  });
}
function _size(size, params) {
  return new $ZodCheckSizeEquals({
    check: "size_equals",
    ...normalizeParams(params),
    size
  });
}
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
function _property(property, schema, params) {
  return new $ZodCheckProperty({
    check: "property",
    property,
    schema,
    ...normalizeParams(params)
  });
}
function _mime(types, params) {
  return new $ZodCheckMimeType({
    check: "mime_type",
    mime: types,
    ...normalizeParams(params)
  });
}
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
function _normalize(form) {
  return _overwrite((input) => input.normalize(form));
}
function _trim() {
  return _overwrite((input) => input.trim());
}
function _toLowerCase() {
  return _overwrite((input) => input.toLowerCase());
}
function _toUpperCase() {
  return _overwrite((input) => input.toUpperCase());
}
function _slugify() {
  return _overwrite((input) => slugify(input));
}
function _array(Class2, element, params) {
  return new Class2({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
function _union(Class2, options, params) {
  return new Class2({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
function _xor(Class2, options, params) {
  return new Class2({
    type: "union",
    options,
    inclusive: false,
    ...normalizeParams(params)
  });
}
function _discriminatedUnion(Class2, discriminator, options, params) {
  return new Class2({
    type: "union",
    options,
    discriminator,
    ...normalizeParams(params)
  });
}
function _intersection(Class2, left, right) {
  return new Class2({
    type: "intersection",
    left,
    right
  });
}
function _tuple(Class2, items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new Class2({
    type: "tuple",
    items,
    rest,
    ...normalizeParams(params)
  });
}
function _record(Class2, keyType, valueType, params) {
  return new Class2({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
function _map(Class2, keyType, valueType, params) {
  return new Class2({
    type: "map",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
function _set(Class2, valueType, params) {
  return new Class2({
    type: "set",
    valueType,
    ...normalizeParams(params)
  });
}
function _enum(Class2, values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new Class2({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
function _nativeEnum(Class2, entries, params) {
  return new Class2({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
function _literal(Class2, value, params) {
  return new Class2({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
function _file(Class2, params) {
  return new Class2({
    type: "file",
    ...normalizeParams(params)
  });
}
function _transform(Class2, fn) {
  return new Class2({
    type: "transform",
    transform: fn
  });
}
function _optional(Class2, innerType) {
  return new Class2({
    type: "optional",
    innerType
  });
}
function _nullable(Class2, innerType) {
  return new Class2({
    type: "nullable",
    innerType
  });
}
function _default(Class2, innerType, defaultValue) {
  return new Class2({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
function _nonoptional(Class2, innerType, params) {
  return new Class2({
    type: "nonoptional",
    innerType,
    ...normalizeParams(params)
  });
}
function _success(Class2, innerType) {
  return new Class2({
    type: "success",
    innerType
  });
}
function _catch(Class2, innerType, catchValue) {
  return new Class2({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
function _pipe(Class2, in_, out) {
  return new Class2({
    type: "pipe",
    in: in_,
    out
  });
}
function _readonly(Class2, innerType) {
  return new Class2({
    type: "readonly",
    innerType
  });
}
function _templateLiteral(Class2, parts, params) {
  return new Class2({
    type: "template_literal",
    parts,
    ...normalizeParams(params)
  });
}
function _lazy(Class2, getter) {
  return new Class2({
    type: "lazy",
    getter
  });
}
function _promise(Class2, innerType) {
  return new Class2({
    type: "promise",
    innerType
  });
}
function _custom(Class2, fn, _params) {
  const norm = normalizeParams(_params);
  norm.abort ?? (norm.abort = true);
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...norm
  });
  return schema;
}
function _refine(Class2, fn, _params) {
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
function _superRefine(fn, params) {
  const ch = _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}
function describe(description) {
  const ch = new $ZodCheck({ check: "describe" });
  ch._zod.onattach = [
    (inst) => {
      const existing = globalRegistry.get(inst) ?? {};
      globalRegistry.add(inst, { ...existing, description });
    }
  ];
  ch._zod.check = () => {};
  return ch;
}
function meta(metadata) {
  const ch = new $ZodCheck({ check: "meta" });
  ch._zod.onattach = [
    (inst) => {
      const existing = globalRegistry.get(inst) ?? {};
      globalRegistry.add(inst, { ...existing, ...metadata });
    }
  ];
  ch._zod.check = () => {};
  return ch;
}
function _stringbool(Classes, _params) {
  const params = normalizeParams(_params);
  let truthyArray = params.truthy ?? ["true", "1", "yes", "on", "y", "enabled"];
  let falsyArray = params.falsy ?? ["false", "0", "no", "off", "n", "disabled"];
  if (params.case !== "sensitive") {
    truthyArray = truthyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
    falsyArray = falsyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
  }
  const truthySet = new Set(truthyArray);
  const falsySet = new Set(falsyArray);
  const _Codec = Classes.Codec ?? $ZodCodec;
  const _Boolean = Classes.Boolean ?? $ZodBoolean;
  const _String = Classes.String ?? $ZodString;
  const stringSchema = new _String({ type: "string", error: params.error });
  const booleanSchema = new _Boolean({ type: "boolean", error: params.error });
  const codec = new _Codec({
    type: "pipe",
    in: stringSchema,
    out: booleanSchema,
    transform: (input, payload) => {
      let data = input;
      if (params.case !== "sensitive")
        data = data.toLowerCase();
      if (truthySet.has(data)) {
        return true;
      } else if (falsySet.has(data)) {
        return false;
      } else {
        payload.issues.push({
          code: "invalid_value",
          expected: "stringbool",
          values: [...truthySet, ...falsySet],
          input: payload.value,
          inst: codec,
          continue: false
        });
        return {};
      }
    },
    reverseTransform: (input, _payload) => {
      if (input === true) {
        return truthyArray[0] || "true";
      } else {
        return falsyArray[0] || "false";
      }
    },
    error: params.error
  });
  return codec;
}
function _stringFormat(Class2, format, fnOrRegex, _params = {}) {
  const params = normalizeParams(_params);
  const def = {
    ...normalizeParams(_params),
    check: "string_format",
    type: "string",
    format,
    fn: typeof fnOrRegex === "function" ? fnOrRegex : (val) => fnOrRegex.test(val),
    ...params
  };
  if (fnOrRegex instanceof RegExp) {
    def.pattern = fnOrRegex;
  }
  const inst = new Class2(def);
  return inst;
}
// node_modules/zod/v4/core/to-json-schema.js
function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {}),
    io: params?.io ?? "output",
    counter: 0,
    seen: new Map,
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    external: params?.external ?? undefined
  };
}
function process(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a3;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
  ctx.seen.set(schema, result);
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      process(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta2 = ctx.metadataRegistry.get(schema);
  if (meta2)
    Object.assign(result.schema, meta2);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a3 = result.schema).default ?? (_a3.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const idToSchema = new Map;
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id2) => id2);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
    }
    if (entry[1] === root) {
      return { ref: "#" };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + defId };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema2 = seen.schema;
    for (const key in schema2) {
      delete schema2[key];
    }
    schema2.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error("Cycle detected: " + `#/${seen.cycle?.join("/")}/<root>` + '\n\nSet the `cycles` parameter to `"ref"` to resolve cyclical schemas with defs.');
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
        continue;
      }
    }
  }
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema2 = seen.def ?? seen.schema;
    const _cached = { ...schema2 };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema2.allOf = schema2.allOf ?? [];
        schema2.allOf.push(refSchema);
      } else {
        Object.assign(schema2, refSchema);
      }
      Object.assign(schema2, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (!(key in _cached)) {
            delete schema2[key];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (key in refSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(refSeen.def[key])) {
            delete schema2[key];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema2.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key in schema2) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in parentSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(parentSeen.def[key])) {
              delete schema2[key];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema2,
      path: seen.path ?? []
    });
  };
  for (const entry of [...ctx.seen.entries()].reverse()) {
    flattenRef(entry[0]);
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") {}
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  Object.assign(result, root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== undefined && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (seen.def && seen.defId) {
      if (seen.def.id === seen.defId)
        delete seen.def.id;
      defs[seen.defId] = seen.def;
    }
  }
  if (ctx.external) {} else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: new Set };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key in def.shape) {
      if (isTransforming(def.shape[key], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
  const ctx = initializeContext({ ...params, processors });
  process(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
  const { libraryOptions, target } = params ?? {};
  const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
  process(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
// node_modules/zod/v4/core/json-schema-processors.js
var formatMap = {
  guid: "uuid",
  url: "uri",
  datetime: "date-time",
  json_string: "json-string",
  regex: ""
};
var stringProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  json.type = "string";
  const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minLength = minimum;
  if (typeof maximum === "number")
    json.maxLength = maximum;
  if (format) {
    json.format = formatMap[format] ?? format;
    if (json.format === "")
      delete json.format;
    if (format === "time") {
      delete json.format;
    }
  }
  if (contentEncoding)
    json.contentEncoding = contentEncoding;
  if (patterns && patterns.size > 0) {
    const regexes = [...patterns];
    if (regexes.length === 1)
      json.pattern = regexes[0].source;
    else if (regexes.length > 1) {
      json.allOf = [
        ...regexes.map((regex) => ({
          ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
          pattern: regex.source
        }))
      ];
    }
  }
};
var numberProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
  if (typeof format === "string" && format.includes("int"))
    json.type = "integer";
  else
    json.type = "number";
  const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
  const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
  const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
  if (exMin) {
    if (legacy) {
      json.minimum = exclusiveMinimum;
      json.exclusiveMinimum = true;
    } else {
      json.exclusiveMinimum = exclusiveMinimum;
    }
  } else if (typeof minimum === "number") {
    json.minimum = minimum;
  }
  if (exMax) {
    if (legacy) {
      json.maximum = exclusiveMaximum;
      json.exclusiveMaximum = true;
    } else {
      json.exclusiveMaximum = exclusiveMaximum;
    }
  } else if (typeof maximum === "number") {
    json.maximum = maximum;
  }
  if (typeof multipleOf === "number")
    json.multipleOf = multipleOf;
};
var booleanProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
};
var bigintProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("BigInt cannot be represented in JSON Schema");
  }
};
var symbolProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Symbols cannot be represented in JSON Schema");
  }
};
var nullProcessor = (_schema, ctx, json, _params) => {
  if (ctx.target === "openapi-3.0") {
    json.type = "string";
    json.nullable = true;
    json.enum = [null];
  } else {
    json.type = "null";
  }
};
var undefinedProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Undefined cannot be represented in JSON Schema");
  }
};
var voidProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Void cannot be represented in JSON Schema");
  }
};
var neverProcessor = (_schema, _ctx, json, _params) => {
  json.not = {};
};
var anyProcessor = (_schema, _ctx, _json, _params) => {};
var unknownProcessor = (_schema, _ctx, _json, _params) => {};
var dateProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Date cannot be represented in JSON Schema");
  }
};
var enumProcessor = (schema, _ctx, json, _params) => {
  const def = schema._zod.def;
  const values = getEnumValues(def.entries);
  if (values.every((v) => typeof v === "number"))
    json.type = "number";
  if (values.every((v) => typeof v === "string"))
    json.type = "string";
  json.enum = values;
};
var literalProcessor = (schema, ctx, json, _params) => {
  const def = schema._zod.def;
  const vals = [];
  for (const val of def.values) {
    if (val === undefined) {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Literal `undefined` cannot be represented in JSON Schema");
      }
    } else if (typeof val === "bigint") {
      if (ctx.unrepresentable === "throw") {
        throw new Error("BigInt literals cannot be represented in JSON Schema");
      } else {
        vals.push(Number(val));
      }
    } else {
      vals.push(val);
    }
  }
  if (vals.length === 0) {} else if (vals.length === 1) {
    const val = vals[0];
    json.type = val === null ? "null" : typeof val;
    if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
      json.enum = [val];
    } else {
      json.const = val;
    }
  } else {
    if (vals.every((v) => typeof v === "number"))
      json.type = "number";
    if (vals.every((v) => typeof v === "string"))
      json.type = "string";
    if (vals.every((v) => typeof v === "boolean"))
      json.type = "boolean";
    if (vals.every((v) => v === null))
      json.type = "null";
    json.enum = vals;
  }
};
var nanProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("NaN cannot be represented in JSON Schema");
  }
};
var templateLiteralProcessor = (schema, _ctx, json, _params) => {
  const _json = json;
  const pattern = schema._zod.pattern;
  if (!pattern)
    throw new Error("Pattern not found in template literal");
  _json.type = "string";
  _json.pattern = pattern.source;
};
var fileProcessor = (schema, _ctx, json, _params) => {
  const _json = json;
  const file = {
    type: "string",
    format: "binary",
    contentEncoding: "binary"
  };
  const { minimum, maximum, mime } = schema._zod.bag;
  if (minimum !== undefined)
    file.minLength = minimum;
  if (maximum !== undefined)
    file.maxLength = maximum;
  if (mime) {
    if (mime.length === 1) {
      file.contentMediaType = mime[0];
      Object.assign(_json, file);
    } else {
      Object.assign(_json, file);
      _json.anyOf = mime.map((m) => ({ contentMediaType: m }));
    }
  } else {
    Object.assign(_json, file);
  }
};
var successProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
};
var customProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Custom types cannot be represented in JSON Schema");
  }
};
var functionProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Function types cannot be represented in JSON Schema");
  }
};
var transformProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Transforms cannot be represented in JSON Schema");
  }
};
var mapProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Map cannot be represented in JSON Schema");
  }
};
var setProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Set cannot be represented in JSON Schema");
  }
};
var arrayProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
  json.type = "array";
  json.items = process(def.element, ctx, {
    ...params,
    path: [...params.path, "items"]
  });
};
var objectProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  json.properties = {};
  const shape = def.shape;
  for (const key in shape) {
    json.properties[key] = process(shape[key], ctx, {
      ...params,
      path: [...params.path, "properties", key]
    });
  }
  const allKeys = new Set(Object.keys(shape));
  const requiredKeys = new Set([...allKeys].filter((key) => {
    const v = def.shape[key]._zod;
    if (ctx.io === "input") {
      return v.optin === undefined;
    } else {
      return v.optout === undefined;
    }
  }));
  if (requiredKeys.size > 0) {
    json.required = Array.from(requiredKeys);
  }
  if (def.catchall?._zod.def.type === "never") {
    json.additionalProperties = false;
  } else if (!def.catchall) {
    if (ctx.io === "output")
      json.additionalProperties = false;
  } else if (def.catchall) {
    json.additionalProperties = process(def.catchall, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
};
var unionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const isExclusive = def.inclusive === false;
  const options = def.options.map((x, i) => process(x, ctx, {
    ...params,
    path: [...params.path, isExclusive ? "oneOf" : "anyOf", i]
  }));
  if (isExclusive) {
    json.oneOf = options;
  } else {
    json.anyOf = options;
  }
};
var intersectionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const a = process(def.left, ctx, {
    ...params,
    path: [...params.path, "allOf", 0]
  });
  const b = process(def.right, ctx, {
    ...params,
    path: [...params.path, "allOf", 1]
  });
  const isSimpleIntersection = (val) => ("allOf" in val) && Object.keys(val).length === 1;
  const allOf = [
    ...isSimpleIntersection(a) ? a.allOf : [a],
    ...isSimpleIntersection(b) ? b.allOf : [b]
  ];
  json.allOf = allOf;
};
var tupleProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "array";
  const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
  const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
  const prefixItems = def.items.map((x, i) => process(x, ctx, {
    ...params,
    path: [...params.path, prefixPath, i]
  }));
  const rest = def.rest ? process(def.rest, ctx, {
    ...params,
    path: [...params.path, restPath, ...ctx.target === "openapi-3.0" ? [def.items.length] : []]
  }) : null;
  if (ctx.target === "draft-2020-12") {
    json.prefixItems = prefixItems;
    if (rest) {
      json.items = rest;
    }
  } else if (ctx.target === "openapi-3.0") {
    json.items = {
      anyOf: prefixItems
    };
    if (rest) {
      json.items.anyOf.push(rest);
    }
    json.minItems = prefixItems.length;
    if (!rest) {
      json.maxItems = prefixItems.length;
    }
  } else {
    json.items = prefixItems;
    if (rest) {
      json.additionalItems = rest;
    }
  }
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
};
var recordProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  const keyType = def.keyType;
  const keyBag = keyType._zod.bag;
  const patterns = keyBag?.patterns;
  if (def.mode === "loose" && patterns && patterns.size > 0) {
    const valueSchema = process(def.valueType, ctx, {
      ...params,
      path: [...params.path, "patternProperties", "*"]
    });
    json.patternProperties = {};
    for (const pattern of patterns) {
      json.patternProperties[pattern.source] = valueSchema;
    }
  } else {
    if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
      json.propertyNames = process(def.keyType, ctx, {
        ...params,
        path: [...params.path, "propertyNames"]
      });
    }
    json.additionalProperties = process(def.valueType, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
  const keyValues = keyType._zod.values;
  if (keyValues) {
    const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
    if (validKeyValues.length > 0) {
      json.required = validKeyValues;
    }
  }
};
var nullableProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const inner = process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  if (ctx.target === "openapi-3.0") {
    seen.ref = def.innerType;
    json.nullable = true;
  } else {
    json.anyOf = [inner, { type: "null" }];
  }
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var defaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
var prefaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  if (ctx.io === "input")
    json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
var catchProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  let catchValue;
  try {
    catchValue = def.catchValue(undefined);
  } catch {
    throw new Error("Dynamic catch values are not supported in JSON Schema");
  }
  json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  const inIsTransform = def.in._zod.traits.has("$ZodTransform");
  const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
  process(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.readOnly = true;
};
var promiseProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var optionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var lazyProcessor = (schema, ctx, _json, params) => {
  const innerType = schema._zod.innerType;
  process(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var allProcessors = {
  string: stringProcessor,
  number: numberProcessor,
  boolean: booleanProcessor,
  bigint: bigintProcessor,
  symbol: symbolProcessor,
  null: nullProcessor,
  undefined: undefinedProcessor,
  void: voidProcessor,
  never: neverProcessor,
  any: anyProcessor,
  unknown: unknownProcessor,
  date: dateProcessor,
  enum: enumProcessor,
  literal: literalProcessor,
  nan: nanProcessor,
  template_literal: templateLiteralProcessor,
  file: fileProcessor,
  success: successProcessor,
  custom: customProcessor,
  function: functionProcessor,
  transform: transformProcessor,
  map: mapProcessor,
  set: setProcessor,
  array: arrayProcessor,
  object: objectProcessor,
  union: unionProcessor,
  intersection: intersectionProcessor,
  tuple: tupleProcessor,
  record: recordProcessor,
  nullable: nullableProcessor,
  nonoptional: nonoptionalProcessor,
  default: defaultProcessor,
  prefault: prefaultProcessor,
  catch: catchProcessor,
  pipe: pipeProcessor,
  readonly: readonlyProcessor,
  promise: promiseProcessor,
  optional: optionalProcessor,
  lazy: lazyProcessor
};
function toJSONSchema(input, params) {
  if ("_idmap" in input) {
    const registry2 = input;
    const ctx2 = initializeContext({ ...params, processors: allProcessors });
    const defs = {};
    for (const entry of registry2._idmap.entries()) {
      const [_, schema] = entry;
      process(schema, ctx2);
    }
    const schemas = {};
    const external = {
      registry: registry2,
      uri: params?.uri,
      defs
    };
    ctx2.external = external;
    for (const entry of registry2._idmap.entries()) {
      const [key, schema] = entry;
      extractDefs(ctx2, schema);
      schemas[key] = finalize(ctx2, schema);
    }
    if (Object.keys(defs).length > 0) {
      const defsSegment = ctx2.target === "draft-2020-12" ? "$defs" : "definitions";
      schemas.__shared = {
        [defsSegment]: defs
      };
    }
    return { schemas };
  }
  const ctx = initializeContext({ ...params, processors: allProcessors });
  process(input, ctx);
  extractDefs(ctx, input);
  return finalize(ctx, input);
}
// node_modules/zod/v4/core/json-schema-generator.js
class JSONSchemaGenerator {
  get metadataRegistry() {
    return this.ctx.metadataRegistry;
  }
  get target() {
    return this.ctx.target;
  }
  get unrepresentable() {
    return this.ctx.unrepresentable;
  }
  get override() {
    return this.ctx.override;
  }
  get io() {
    return this.ctx.io;
  }
  get counter() {
    return this.ctx.counter;
  }
  set counter(value) {
    this.ctx.counter = value;
  }
  get seen() {
    return this.ctx.seen;
  }
  constructor(params) {
    let normalizedTarget = params?.target ?? "draft-2020-12";
    if (normalizedTarget === "draft-4")
      normalizedTarget = "draft-04";
    if (normalizedTarget === "draft-7")
      normalizedTarget = "draft-07";
    this.ctx = initializeContext({
      processors: allProcessors,
      target: normalizedTarget,
      ...params?.metadata && { metadata: params.metadata },
      ...params?.unrepresentable && { unrepresentable: params.unrepresentable },
      ...params?.override && { override: params.override },
      ...params?.io && { io: params.io }
    });
  }
  process(schema, _params = { path: [], schemaPath: [] }) {
    return process(schema, this.ctx, _params);
  }
  emit(schema, _params) {
    if (_params) {
      if (_params.cycles)
        this.ctx.cycles = _params.cycles;
      if (_params.reused)
        this.ctx.reused = _params.reused;
      if (_params.external)
        this.ctx.external = _params.external;
    }
    extractDefs(this.ctx, schema);
    const result = finalize(this.ctx, schema);
    const { "~standard": _, ...plainResult } = result;
    return plainResult;
  }
}
// node_modules/zod/v4/core/json-schema.js
var exports_json_schema = {};
// node_modules/zod/v4/classic/schemas.js
var exports_schemas2 = {};
__export(exports_schemas2, {
  xor: () => xor,
  xid: () => xid2,
  void: () => _void2,
  uuidv7: () => uuidv7,
  uuidv6: () => uuidv6,
  uuidv4: () => uuidv4,
  uuid: () => uuid2,
  url: () => url,
  unknown: () => unknown,
  union: () => union,
  undefined: () => _undefined3,
  ulid: () => ulid2,
  uint64: () => uint64,
  uint32: () => uint32,
  tuple: () => tuple,
  transform: () => transform,
  templateLiteral: () => templateLiteral,
  symbol: () => symbol,
  superRefine: () => superRefine,
  success: () => success,
  stringbool: () => stringbool,
  stringFormat: () => stringFormat,
  string: () => string2,
  strictObject: () => strictObject,
  set: () => set,
  refine: () => refine,
  record: () => record,
  readonly: () => readonly,
  promise: () => promise,
  preprocess: () => preprocess,
  prefault: () => prefault,
  pipe: () => pipe,
  partialRecord: () => partialRecord,
  optional: () => optional,
  object: () => object,
  number: () => number2,
  nullish: () => nullish2,
  nullable: () => nullable,
  null: () => _null3,
  nonoptional: () => nonoptional,
  never: () => never,
  nativeEnum: () => nativeEnum,
  nanoid: () => nanoid2,
  nan: () => nan,
  meta: () => meta2,
  map: () => map,
  mac: () => mac2,
  looseRecord: () => looseRecord,
  looseObject: () => looseObject,
  literal: () => literal,
  lazy: () => lazy,
  ksuid: () => ksuid2,
  keyof: () => keyof,
  jwt: () => jwt,
  json: () => json,
  ipv6: () => ipv62,
  ipv4: () => ipv42,
  invertCodec: () => invertCodec,
  intersection: () => intersection,
  int64: () => int64,
  int32: () => int32,
  int: () => int,
  instanceof: () => _instanceof,
  httpUrl: () => httpUrl,
  hostname: () => hostname2,
  hex: () => hex2,
  hash: () => hash,
  guid: () => guid2,
  function: () => _function,
  float64: () => float64,
  float32: () => float32,
  file: () => file,
  exactOptional: () => exactOptional,
  enum: () => _enum2,
  emoji: () => emoji2,
  email: () => email2,
  e164: () => e1642,
  discriminatedUnion: () => discriminatedUnion,
  describe: () => describe2,
  date: () => date3,
  custom: () => custom,
  cuid2: () => cuid22,
  cuid: () => cuid3,
  codec: () => codec,
  cidrv6: () => cidrv62,
  cidrv4: () => cidrv42,
  check: () => check,
  catch: () => _catch2,
  boolean: () => boolean2,
  bigint: () => bigint2,
  base64url: () => base64url2,
  base64: () => base642,
  array: () => array,
  any: () => any,
  _function: () => _function,
  _default: () => _default2,
  _ZodString: () => _ZodString,
  ZodXor: () => ZodXor,
  ZodXID: () => ZodXID,
  ZodVoid: () => ZodVoid,
  ZodUnknown: () => ZodUnknown,
  ZodUnion: () => ZodUnion,
  ZodUndefined: () => ZodUndefined,
  ZodUUID: () => ZodUUID,
  ZodURL: () => ZodURL,
  ZodULID: () => ZodULID,
  ZodType: () => ZodType,
  ZodTuple: () => ZodTuple,
  ZodTransform: () => ZodTransform,
  ZodTemplateLiteral: () => ZodTemplateLiteral,
  ZodSymbol: () => ZodSymbol,
  ZodSuccess: () => ZodSuccess,
  ZodStringFormat: () => ZodStringFormat,
  ZodString: () => ZodString,
  ZodSet: () => ZodSet,
  ZodRecord: () => ZodRecord,
  ZodReadonly: () => ZodReadonly,
  ZodPromise: () => ZodPromise,
  ZodPreprocess: () => ZodPreprocess,
  ZodPrefault: () => ZodPrefault,
  ZodPipe: () => ZodPipe,
  ZodOptional: () => ZodOptional,
  ZodObject: () => ZodObject,
  ZodNumberFormat: () => ZodNumberFormat,
  ZodNumber: () => ZodNumber,
  ZodNullable: () => ZodNullable,
  ZodNull: () => ZodNull,
  ZodNonOptional: () => ZodNonOptional,
  ZodNever: () => ZodNever,
  ZodNanoID: () => ZodNanoID,
  ZodNaN: () => ZodNaN,
  ZodMap: () => ZodMap,
  ZodMAC: () => ZodMAC,
  ZodLiteral: () => ZodLiteral,
  ZodLazy: () => ZodLazy,
  ZodKSUID: () => ZodKSUID,
  ZodJWT: () => ZodJWT,
  ZodIntersection: () => ZodIntersection,
  ZodIPv6: () => ZodIPv6,
  ZodIPv4: () => ZodIPv4,
  ZodGUID: () => ZodGUID,
  ZodFunction: () => ZodFunction,
  ZodFile: () => ZodFile,
  ZodExactOptional: () => ZodExactOptional,
  ZodEnum: () => ZodEnum,
  ZodEmoji: () => ZodEmoji,
  ZodEmail: () => ZodEmail,
  ZodE164: () => ZodE164,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodDefault: () => ZodDefault,
  ZodDate: () => ZodDate,
  ZodCustomStringFormat: () => ZodCustomStringFormat,
  ZodCustom: () => ZodCustom,
  ZodCodec: () => ZodCodec,
  ZodCatch: () => ZodCatch,
  ZodCUID2: () => ZodCUID2,
  ZodCUID: () => ZodCUID,
  ZodCIDRv6: () => ZodCIDRv6,
  ZodCIDRv4: () => ZodCIDRv4,
  ZodBoolean: () => ZodBoolean,
  ZodBigIntFormat: () => ZodBigIntFormat,
  ZodBigInt: () => ZodBigInt,
  ZodBase64URL: () => ZodBase64URL,
  ZodBase64: () => ZodBase64,
  ZodArray: () => ZodArray,
  ZodAny: () => ZodAny
});

// node_modules/zod/v4/classic/checks.js
var exports_checks2 = {};
__export(exports_checks2, {
  uppercase: () => _uppercase,
  trim: () => _trim,
  toUpperCase: () => _toUpperCase,
  toLowerCase: () => _toLowerCase,
  startsWith: () => _startsWith,
  slugify: () => _slugify,
  size: () => _size,
  regex: () => _regex,
  property: () => _property,
  positive: () => _positive,
  overwrite: () => _overwrite,
  normalize: () => _normalize,
  nonpositive: () => _nonpositive,
  nonnegative: () => _nonnegative,
  negative: () => _negative,
  multipleOf: () => _multipleOf,
  minSize: () => _minSize,
  minLength: () => _minLength,
  mime: () => _mime,
  maxSize: () => _maxSize,
  maxLength: () => _maxLength,
  lte: () => _lte,
  lt: () => _lt,
  lowercase: () => _lowercase,
  length: () => _length,
  includes: () => _includes,
  gte: () => _gte,
  gt: () => _gt,
  endsWith: () => _endsWith
});

// node_modules/zod/v4/classic/iso.js
var exports_iso = {};
__export(exports_iso, {
  time: () => time2,
  duration: () => duration2,
  datetime: () => datetime2,
  date: () => date2,
  ZodISOTime: () => ZodISOTime,
  ZodISODuration: () => ZodISODuration,
  ZodISODateTime: () => ZodISODateTime,
  ZodISODate: () => ZodISODate
});
var ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function datetime2(params) {
  return _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function date2(params) {
  return _isoDate(ZodISODate, params);
}
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function time2(params) {
  return _isoTime(ZodISOTime, params);
}
var ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function duration2(params) {
  return _isoDuration(ZodISODuration, params);
}

// node_modules/zod/v4/classic/errors.js
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  Object.defineProperties(inst, {
    format: {
      value: (mapper) => formatError(inst, mapper)
    },
    flatten: {
      value: (mapper) => flattenError(inst, mapper)
    },
    addIssue: {
      value: (issue2) => {
        inst.issues.push(issue2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
    },
    addIssues: {
      value: (issues2) => {
        inst.issues.push(...issues2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
    },
    isEmpty: {
      get() {
        return inst.issues.length === 0;
      }
    }
  });
};
var ZodError = /* @__PURE__ */ $constructor("ZodError", initializer2);
var ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer2, {
  Parent: Error
});

// node_modules/zod/v4/classic/parse.js
var parse3 = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync2 = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse2 = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync2 = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode2 = /* @__PURE__ */ _encode(ZodRealError);
var decode2 = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync2 = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync2 = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode2 = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode2 = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync2 = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync2 = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

// node_modules/zod/v4/classic/schemas.js
var _installedGroups = /* @__PURE__ */ new WeakMap;
function _installLazyMethods(inst, group, methods) {
  const proto = Object.getPrototypeOf(inst);
  let installed = _installedGroups.get(proto);
  if (!installed) {
    installed = new Set;
    _installedGroups.set(proto, installed);
  }
  if (installed.has(group))
    return;
  installed.add(group);
  for (const key in methods) {
    const fn = methods[key];
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: false,
      get() {
        const bound = fn.bind(this);
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: bound
        });
        return bound;
      },
      set(v) {
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: v
        });
      }
    });
  }
}
var ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  $ZodType.init(inst, def);
  Object.assign(inst["~standard"], {
    jsonSchema: {
      input: createStandardJSONSchemaMethod(inst, "input"),
      output: createStandardJSONSchemaMethod(inst, "output")
    }
  });
  inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
  inst.def = def;
  inst.type = def.type;
  Object.defineProperty(inst, "_def", { value: def });
  inst.parse = (data, params) => parse3(inst, data, params, { callee: inst.parse });
  inst.safeParse = (data, params) => safeParse2(inst, data, params);
  inst.parseAsync = async (data, params) => parseAsync2(inst, data, params, { callee: inst.parseAsync });
  inst.safeParseAsync = async (data, params) => safeParseAsync2(inst, data, params);
  inst.spa = inst.safeParseAsync;
  inst.encode = (data, params) => encode2(inst, data, params);
  inst.decode = (data, params) => decode2(inst, data, params);
  inst.encodeAsync = async (data, params) => encodeAsync2(inst, data, params);
  inst.decodeAsync = async (data, params) => decodeAsync2(inst, data, params);
  inst.safeEncode = (data, params) => safeEncode2(inst, data, params);
  inst.safeDecode = (data, params) => safeDecode2(inst, data, params);
  inst.safeEncodeAsync = async (data, params) => safeEncodeAsync2(inst, data, params);
  inst.safeDecodeAsync = async (data, params) => safeDecodeAsync2(inst, data, params);
  _installLazyMethods(inst, "ZodType", {
    check(...chks) {
      const def2 = this.def;
      return this.clone(exports_util.mergeDefs(def2, {
        checks: [
          ...def2.checks ?? [],
          ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }), { parent: true });
    },
    with(...chks) {
      return this.check(...chks);
    },
    clone(def2, params) {
      return clone(this, def2, params);
    },
    brand() {
      return this;
    },
    register(reg, meta2) {
      reg.add(this, meta2);
      return this;
    },
    refine(check, params) {
      return this.check(refine(check, params));
    },
    superRefine(refinement, params) {
      return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
      return this.check(_overwrite(fn));
    },
    optional() {
      return optional(this);
    },
    exactOptional() {
      return exactOptional(this);
    },
    nullable() {
      return nullable(this);
    },
    nullish() {
      return optional(nullable(this));
    },
    nonoptional(params) {
      return nonoptional(this, params);
    },
    array() {
      return array(this);
    },
    or(arg) {
      return union([this, arg]);
    },
    and(arg) {
      return intersection(this, arg);
    },
    transform(tx) {
      return pipe(this, transform(tx));
    },
    default(d) {
      return _default2(this, d);
    },
    prefault(d) {
      return prefault(this, d);
    },
    catch(params) {
      return _catch2(this, params);
    },
    pipe(target) {
      return pipe(this, target);
    },
    readonly() {
      return readonly(this);
    },
    describe(description) {
      const cl = this.clone();
      globalRegistry.add(cl, { description });
      return cl;
    },
    meta(...args) {
      if (args.length === 0)
        return globalRegistry.get(this);
      const cl = this.clone();
      globalRegistry.add(cl, args[0]);
      return cl;
    },
    isOptional() {
      return this.safeParse(undefined).success;
    },
    isNullable() {
      return this.safeParse(null).success;
    },
    apply(fn) {
      return fn(this);
    }
  });
  Object.defineProperty(inst, "description", {
    get() {
      return globalRegistry.get(inst)?.description;
    },
    configurable: true
  });
  return inst;
});
var _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
  _installLazyMethods(inst, "_ZodString", {
    regex(...args) {
      return this.check(_regex(...args));
    },
    includes(...args) {
      return this.check(_includes(...args));
    },
    startsWith(...args) {
      return this.check(_startsWith(...args));
    },
    endsWith(...args) {
      return this.check(_endsWith(...args));
    },
    min(...args) {
      return this.check(_minLength(...args));
    },
    max(...args) {
      return this.check(_maxLength(...args));
    },
    length(...args) {
      return this.check(_length(...args));
    },
    nonempty(...args) {
      return this.check(_minLength(1, ...args));
    },
    lowercase(params) {
      return this.check(_lowercase(params));
    },
    uppercase(params) {
      return this.check(_uppercase(params));
    },
    trim() {
      return this.check(_trim());
    },
    normalize(...args) {
      return this.check(_normalize(...args));
    },
    toLowerCase() {
      return this.check(_toLowerCase());
    },
    toUpperCase() {
      return this.check(_toUpperCase());
    },
    slugify() {
      return this.check(_slugify());
    }
  });
});
var ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
  inst.email = (params) => inst.check(_email(ZodEmail, params));
  inst.url = (params) => inst.check(_url(ZodURL, params));
  inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
  inst.emoji = (params) => inst.check(_emoji2(ZodEmoji, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
  inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
  inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
  inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
  inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
  inst.guid = (params) => inst.check(_guid(ZodGUID, params));
  inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
  inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
  inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
  inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
  inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
  inst.xid = (params) => inst.check(_xid(ZodXID, params));
  inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
  inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
  inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
  inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
  inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
  inst.e164 = (params) => inst.check(_e164(ZodE164, params));
  inst.datetime = (params) => inst.check(datetime2(params));
  inst.date = (params) => inst.check(date2(params));
  inst.time = (params) => inst.check(time2(params));
  inst.duration = (params) => inst.check(duration2(params));
});
function string2(params) {
  return _string(ZodString, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function email2(params) {
  return _email(ZodEmail, params);
}
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function guid2(params) {
  return _guid(ZodGUID, params);
}
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function uuid2(params) {
  return _uuid(ZodUUID, params);
}
function uuidv4(params) {
  return _uuidv4(ZodUUID, params);
}
function uuidv6(params) {
  return _uuidv6(ZodUUID, params);
}
function uuidv7(params) {
  return _uuidv7(ZodUUID, params);
}
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function url(params) {
  return _url(ZodURL, params);
}
function httpUrl(params) {
  return _url(ZodURL, {
    protocol: exports_regexes.httpProtocol,
    hostname: exports_regexes.domain,
    ...exports_util.normalizeParams(params)
  });
}
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function emoji2(params) {
  return _emoji2(ZodEmoji, params);
}
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function nanoid2(params) {
  return _nanoid(ZodNanoID, params);
}
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cuid3(params) {
  return _cuid(ZodCUID, params);
}
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cuid22(params) {
  return _cuid2(ZodCUID2, params);
}
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ulid2(params) {
  return _ulid(ZodULID, params);
}
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function xid2(params) {
  return _xid(ZodXID, params);
}
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ksuid2(params) {
  return _ksuid(ZodKSUID, params);
}
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ipv42(params) {
  return _ipv4(ZodIPv4, params);
}
var ZodMAC = /* @__PURE__ */ $constructor("ZodMAC", (inst, def) => {
  $ZodMAC.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function mac2(params) {
  return _mac(ZodMAC, params);
}
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function ipv62(params) {
  return _ipv6(ZodIPv6, params);
}
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cidrv42(params) {
  return _cidrv4(ZodCIDRv4, params);
}
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function cidrv62(params) {
  return _cidrv6(ZodCIDRv6, params);
}
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function base642(params) {
  return _base64(ZodBase64, params);
}
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function base64url2(params) {
  return _base64url(ZodBase64URL, params);
}
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function e1642(params) {
  return _e164(ZodE164, params);
}
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function jwt(params) {
  return _jwt(ZodJWT, params);
}
var ZodCustomStringFormat = /* @__PURE__ */ $constructor("ZodCustomStringFormat", (inst, def) => {
  $ZodCustomStringFormat.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function stringFormat(format, fnOrRegex, _params = {}) {
  return _stringFormat(ZodCustomStringFormat, format, fnOrRegex, _params);
}
function hostname2(_params) {
  return _stringFormat(ZodCustomStringFormat, "hostname", exports_regexes.hostname, _params);
}
function hex2(_params) {
  return _stringFormat(ZodCustomStringFormat, "hex", exports_regexes.hex, _params);
}
function hash(alg, params) {
  const enc = params?.enc ?? "hex";
  const format = `${alg}_${enc}`;
  const regex = exports_regexes[format];
  if (!regex)
    throw new Error(`Unrecognized hash format: ${format}`);
  return _stringFormat(ZodCustomStringFormat, format, regex, params);
}
var ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
  _installLazyMethods(inst, "ZodNumber", {
    gt(value, params) {
      return this.check(_gt(value, params));
    },
    gte(value, params) {
      return this.check(_gte(value, params));
    },
    min(value, params) {
      return this.check(_gte(value, params));
    },
    lt(value, params) {
      return this.check(_lt(value, params));
    },
    lte(value, params) {
      return this.check(_lte(value, params));
    },
    max(value, params) {
      return this.check(_lte(value, params));
    },
    int(params) {
      return this.check(int(params));
    },
    safe(params) {
      return this.check(int(params));
    },
    positive(params) {
      return this.check(_gt(0, params));
    },
    nonnegative(params) {
      return this.check(_gte(0, params));
    },
    negative(params) {
      return this.check(_lt(0, params));
    },
    nonpositive(params) {
      return this.check(_lte(0, params));
    },
    multipleOf(value, params) {
      return this.check(_multipleOf(value, params));
    },
    step(value, params) {
      return this.check(_multipleOf(value, params));
    },
    finite() {
      return this;
    }
  });
  const bag = inst._zod.bag;
  inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
  inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
  inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
});
function number2(params) {
  return _number(ZodNumber, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
function float32(params) {
  return _float32(ZodNumberFormat, params);
}
function float64(params) {
  return _float64(ZodNumberFormat, params);
}
function int32(params) {
  return _int32(ZodNumberFormat, params);
}
function uint32(params) {
  return _uint32(ZodNumberFormat, params);
}
var ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
var ZodBigInt = /* @__PURE__ */ $constructor("ZodBigInt", (inst, def) => {
  $ZodBigInt.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => bigintProcessor(inst, ctx, json, params);
  inst.gte = (value, params) => inst.check(_gte(value, params));
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.gt = (value, params) => inst.check(_gt(value, params));
  inst.gte = (value, params) => inst.check(_gte(value, params));
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.lt = (value, params) => inst.check(_lt(value, params));
  inst.lte = (value, params) => inst.check(_lte(value, params));
  inst.max = (value, params) => inst.check(_lte(value, params));
  inst.positive = (params) => inst.check(_gt(BigInt(0), params));
  inst.negative = (params) => inst.check(_lt(BigInt(0), params));
  inst.nonpositive = (params) => inst.check(_lte(BigInt(0), params));
  inst.nonnegative = (params) => inst.check(_gte(BigInt(0), params));
  inst.multipleOf = (value, params) => inst.check(_multipleOf(value, params));
  const bag = inst._zod.bag;
  inst.minValue = bag.minimum ?? null;
  inst.maxValue = bag.maximum ?? null;
  inst.format = bag.format ?? null;
});
function bigint2(params) {
  return _bigint(ZodBigInt, params);
}
var ZodBigIntFormat = /* @__PURE__ */ $constructor("ZodBigIntFormat", (inst, def) => {
  $ZodBigIntFormat.init(inst, def);
  ZodBigInt.init(inst, def);
});
function int64(params) {
  return _int64(ZodBigIntFormat, params);
}
function uint64(params) {
  return _uint64(ZodBigIntFormat, params);
}
var ZodSymbol = /* @__PURE__ */ $constructor("ZodSymbol", (inst, def) => {
  $ZodSymbol.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => symbolProcessor(inst, ctx, json, params);
});
function symbol(params) {
  return _symbol(ZodSymbol, params);
}
var ZodUndefined = /* @__PURE__ */ $constructor("ZodUndefined", (inst, def) => {
  $ZodUndefined.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => undefinedProcessor(inst, ctx, json, params);
});
function _undefined3(params) {
  return _undefined2(ZodUndefined, params);
}
var ZodNull = /* @__PURE__ */ $constructor("ZodNull", (inst, def) => {
  $ZodNull.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nullProcessor(inst, ctx, json, params);
});
function _null3(params) {
  return _null2(ZodNull, params);
}
var ZodAny = /* @__PURE__ */ $constructor("ZodAny", (inst, def) => {
  $ZodAny.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => anyProcessor(inst, ctx, json, params);
});
function any() {
  return _any(ZodAny);
}
var ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor(inst, ctx, json, params);
});
function unknown() {
  return _unknown(ZodUnknown);
}
var ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
  return _never(ZodNever, params);
}
var ZodVoid = /* @__PURE__ */ $constructor("ZodVoid", (inst, def) => {
  $ZodVoid.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => voidProcessor(inst, ctx, json, params);
});
function _void2(params) {
  return _void(ZodVoid, params);
}
var ZodDate = /* @__PURE__ */ $constructor("ZodDate", (inst, def) => {
  $ZodDate.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => dateProcessor(inst, ctx, json, params);
  inst.min = (value, params) => inst.check(_gte(value, params));
  inst.max = (value, params) => inst.check(_lte(value, params));
  const c = inst._zod.bag;
  inst.minDate = c.minimum ? new Date(c.minimum) : null;
  inst.maxDate = c.maximum ? new Date(c.maximum) : null;
});
function date3(params) {
  return _date(ZodDate, params);
}
var ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
  inst.element = def.element;
  _installLazyMethods(inst, "ZodArray", {
    min(n, params) {
      return this.check(_minLength(n, params));
    },
    nonempty(params) {
      return this.check(_minLength(1, params));
    },
    max(n, params) {
      return this.check(_maxLength(n, params));
    },
    length(n, params) {
      return this.check(_length(n, params));
    },
    unwrap() {
      return this.element;
    }
  });
});
function array(element, params) {
  return _array(ZodArray, element, params);
}
function keyof(schema) {
  const shape = schema._zod.def.shape;
  return _enum2(Object.keys(shape));
}
var ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
  exports_util.defineLazy(inst, "shape", () => {
    return def.shape;
  });
  _installLazyMethods(inst, "ZodObject", {
    keyof() {
      return _enum2(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
      return this.clone({ ...this._zod.def, catchall });
    },
    passthrough() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    loose() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    strict() {
      return this.clone({ ...this._zod.def, catchall: never() });
    },
    strip() {
      return this.clone({ ...this._zod.def, catchall: undefined });
    },
    extend(incoming) {
      return exports_util.extend(this, incoming);
    },
    safeExtend(incoming) {
      return exports_util.safeExtend(this, incoming);
    },
    merge(other) {
      return exports_util.merge(this, other);
    },
    pick(mask) {
      return exports_util.pick(this, mask);
    },
    omit(mask) {
      return exports_util.omit(this, mask);
    },
    partial(...args) {
      return exports_util.partial(ZodOptional, this, args[0]);
    },
    required(...args) {
      return exports_util.required(ZodNonOptional, this, args[0]);
    }
  });
});
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...exports_util.normalizeParams(params)
  };
  return new ZodObject(def);
}
function strictObject(shape, params) {
  return new ZodObject({
    type: "object",
    shape,
    catchall: never(),
    ...exports_util.normalizeParams(params)
  });
}
function looseObject(shape, params) {
  return new ZodObject({
    type: "object",
    shape,
    catchall: unknown(),
    ...exports_util.normalizeParams(params)
  });
}
var ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...exports_util.normalizeParams(params)
  });
}
var ZodXor = /* @__PURE__ */ $constructor("ZodXor", (inst, def) => {
  ZodUnion.init(inst, def);
  $ZodXor.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
  inst.options = def.options;
});
function xor(options, params) {
  return new ZodXor({
    type: "union",
    options,
    inclusive: false,
    ...exports_util.normalizeParams(params)
  });
}
var ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodDiscriminatedUnion", (inst, def) => {
  ZodUnion.init(inst, def);
  $ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
  return new ZodDiscriminatedUnion({
    type: "union",
    options,
    discriminator,
    ...exports_util.normalizeParams(params)
  });
}
var ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
var ZodTuple = /* @__PURE__ */ $constructor("ZodTuple", (inst, def) => {
  $ZodTuple.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => tupleProcessor(inst, ctx, json, params);
  inst.rest = (rest) => inst.clone({
    ...inst._zod.def,
    rest
  });
});
function tuple(items, _paramsOrRest, _params) {
  const hasRest = _paramsOrRest instanceof $ZodType;
  const params = hasRest ? _params : _paramsOrRest;
  const rest = hasRest ? _paramsOrRest : null;
  return new ZodTuple({
    type: "tuple",
    items,
    rest,
    ...exports_util.normalizeParams(params)
  });
}
var ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodRecord({
      type: "record",
      keyType: string2(),
      valueType: keyType,
      ...exports_util.normalizeParams(valueType)
    });
  }
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...exports_util.normalizeParams(params)
  });
}
function partialRecord(keyType, valueType, params) {
  const k = clone(keyType);
  k._zod.values = undefined;
  return new ZodRecord({
    type: "record",
    keyType: k,
    valueType,
    ...exports_util.normalizeParams(params)
  });
}
function looseRecord(keyType, valueType, params) {
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    mode: "loose",
    ...exports_util.normalizeParams(params)
  });
}
var ZodMap = /* @__PURE__ */ $constructor("ZodMap", (inst, def) => {
  $ZodMap.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => mapProcessor(inst, ctx, json, params);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
  inst.min = (...args) => inst.check(_minSize(...args));
  inst.nonempty = (params) => inst.check(_minSize(1, params));
  inst.max = (...args) => inst.check(_maxSize(...args));
  inst.size = (...args) => inst.check(_size(...args));
});
function map(keyType, valueType, params) {
  return new ZodMap({
    type: "map",
    keyType,
    valueType,
    ...exports_util.normalizeParams(params)
  });
}
var ZodSet = /* @__PURE__ */ $constructor("ZodSet", (inst, def) => {
  $ZodSet.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => setProcessor(inst, ctx, json, params);
  inst.min = (...args) => inst.check(_minSize(...args));
  inst.nonempty = (params) => inst.check(_minSize(1, params));
  inst.max = (...args) => inst.check(_maxSize(...args));
  inst.size = (...args) => inst.check(_size(...args));
});
function set(valueType, params) {
  return new ZodSet({
    type: "set",
    valueType,
    ...exports_util.normalizeParams(params)
  });
}
var ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...exports_util.normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...exports_util.normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum2(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...exports_util.normalizeParams(params)
  });
}
function nativeEnum(entries, params) {
  return new ZodEnum({
    type: "enum",
    entries,
    ...exports_util.normalizeParams(params)
  });
}
var ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...exports_util.normalizeParams(params)
  });
}
var ZodFile = /* @__PURE__ */ $constructor("ZodFile", (inst, def) => {
  $ZodFile.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => fileProcessor(inst, ctx, json, params);
  inst.min = (size, params) => inst.check(_minSize(size, params));
  inst.max = (size, params) => inst.check(_maxSize(size, params));
  inst.mime = (types, params) => inst.check(_mime(Array.isArray(types) ? types : [types], params));
});
function file(params) {
  return _file(ZodFile, params);
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(exports_util.issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(exports_util.issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output2) => {
        payload.value = output2;
        payload.fallback = true;
        return payload;
      });
    }
    payload.value = output;
    payload.fallback = true;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
var ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
var ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
  $ZodExactOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
var ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
function nullish2(innerType) {
  return optional(nullable(innerType));
}
var ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default2(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : exports_util.shallowClone(defaultValue);
    }
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : exports_util.shallowClone(defaultValue);
    }
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...exports_util.normalizeParams(params)
  });
}
var ZodSuccess = /* @__PURE__ */ $constructor("ZodSuccess", (inst, def) => {
  $ZodSuccess.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => successProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function success(innerType) {
  return new ZodSuccess({
    type: "success",
    innerType
  });
}
var ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch2(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
var ZodNaN = /* @__PURE__ */ $constructor("ZodNaN", (inst, def) => {
  $ZodNaN.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nanProcessor(inst, ctx, json, params);
});
function nan(params) {
  return _nan(ZodNaN, params);
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
  });
}
var ZodCodec = /* @__PURE__ */ $constructor("ZodCodec", (inst, def) => {
  ZodPipe.init(inst, def);
  $ZodCodec.init(inst, def);
});
function codec(in_, out, params) {
  return new ZodCodec({
    type: "pipe",
    in: in_,
    out,
    transform: params.decode,
    reverseTransform: params.encode
  });
}
function invertCodec(codec2) {
  const def = codec2._zod.def;
  return new ZodCodec({
    type: "pipe",
    in: def.out,
    out: def.in,
    transform: def.reverseTransform,
    reverseTransform: def.transform
  });
}
var ZodPreprocess = /* @__PURE__ */ $constructor("ZodPreprocess", (inst, def) => {
  ZodPipe.init(inst, def);
  $ZodPreprocess.init(inst, def);
});
var ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
var ZodTemplateLiteral = /* @__PURE__ */ $constructor("ZodTemplateLiteral", (inst, def) => {
  $ZodTemplateLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => templateLiteralProcessor(inst, ctx, json, params);
});
function templateLiteral(parts, params) {
  return new ZodTemplateLiteral({
    type: "template_literal",
    parts,
    ...exports_util.normalizeParams(params)
  });
}
var ZodLazy = /* @__PURE__ */ $constructor("ZodLazy", (inst, def) => {
  $ZodLazy.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => lazyProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.getter();
});
function lazy(getter) {
  return new ZodLazy({
    type: "lazy",
    getter
  });
}
var ZodPromise = /* @__PURE__ */ $constructor("ZodPromise", (inst, def) => {
  $ZodPromise.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => promiseProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function promise(innerType) {
  return new ZodPromise({
    type: "promise",
    innerType
  });
}
var ZodFunction = /* @__PURE__ */ $constructor("ZodFunction", (inst, def) => {
  $ZodFunction.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => functionProcessor(inst, ctx, json, params);
});
function _function(params) {
  return new ZodFunction({
    type: "function",
    input: Array.isArray(params?.input) ? tuple(params?.input) : params?.input ?? array(unknown()),
    output: params?.output ?? unknown()
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function check(fn) {
  const ch = new $ZodCheck({
    check: "custom"
  });
  ch._zod.check = fn;
  return ch;
}
function custom(fn, _params) {
  return _custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}
var describe2 = describe;
var meta2 = meta;
function _instanceof(cls, params = {}) {
  const inst = new ZodCustom({
    type: "custom",
    check: "custom",
    fn: (data) => data instanceof cls,
    abort: true,
    ...exports_util.normalizeParams(params)
  });
  inst._zod.bag.Class = cls;
  inst._zod.check = (payload) => {
    if (!(payload.value instanceof cls)) {
      payload.issues.push({
        code: "invalid_type",
        expected: cls.name,
        input: payload.value,
        inst,
        path: [...inst._zod.def.path ?? []]
      });
    }
  };
  return inst;
}
var stringbool = (...args) => _stringbool({
  Codec: ZodCodec,
  Boolean: ZodBoolean,
  String: ZodString
}, ...args);
function json(params) {
  const jsonSchema = lazy(() => {
    return union([string2(params), number2(), boolean2(), _null3(), array(jsonSchema), record(string2(), jsonSchema)]);
  });
  return jsonSchema;
}
function preprocess(fn, schema) {
  return new ZodPreprocess({
    type: "pipe",
    in: transform(fn),
    out: schema
  });
}
// node_modules/zod/v4/classic/compat.js
var ZodIssueCode = {
  invalid_type: "invalid_type",
  too_big: "too_big",
  too_small: "too_small",
  invalid_format: "invalid_format",
  not_multiple_of: "not_multiple_of",
  unrecognized_keys: "unrecognized_keys",
  invalid_union: "invalid_union",
  invalid_key: "invalid_key",
  invalid_element: "invalid_element",
  invalid_value: "invalid_value",
  custom: "custom"
};
function setErrorMap(map2) {
  config({
    customError: map2
  });
}
function getErrorMap() {
  return config().customError;
}
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
// node_modules/zod/v4/classic/from-json-schema.js
var z = {
  ...exports_schemas2,
  ...exports_checks2,
  iso: exports_iso
};
var RECOGNIZED_KEYS = /* @__PURE__ */ new Set([
  "$schema",
  "$ref",
  "$defs",
  "definitions",
  "$id",
  "id",
  "$comment",
  "$anchor",
  "$vocabulary",
  "$dynamicRef",
  "$dynamicAnchor",
  "type",
  "enum",
  "const",
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  "properties",
  "required",
  "additionalProperties",
  "patternProperties",
  "propertyNames",
  "minProperties",
  "maxProperties",
  "items",
  "prefixItems",
  "additionalItems",
  "minItems",
  "maxItems",
  "uniqueItems",
  "contains",
  "minContains",
  "maxContains",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "description",
  "default",
  "contentEncoding",
  "contentMediaType",
  "contentSchema",
  "unevaluatedItems",
  "unevaluatedProperties",
  "if",
  "then",
  "else",
  "dependentSchemas",
  "dependentRequired",
  "nullable",
  "readOnly"
]);
function detectVersion(schema, defaultTarget) {
  const $schema = schema.$schema;
  if ($schema === "https://json-schema.org/draft/2020-12/schema") {
    return "draft-2020-12";
  }
  if ($schema === "http://json-schema.org/draft-07/schema#") {
    return "draft-7";
  }
  if ($schema === "http://json-schema.org/draft-04/schema#") {
    return "draft-4";
  }
  return defaultTarget ?? "draft-2020-12";
}
function resolveRef(ref, ctx) {
  if (!ref.startsWith("#")) {
    throw new Error("External $ref is not supported, only local refs (#/...) are allowed");
  }
  const path = ref.slice(1).split("/").filter(Boolean);
  if (path.length === 0) {
    return ctx.rootSchema;
  }
  const defsKey = ctx.version === "draft-2020-12" ? "$defs" : "definitions";
  if (path[0] === defsKey) {
    const key = path[1];
    if (!key || !ctx.defs[key]) {
      throw new Error(`Reference not found: ${ref}`);
    }
    return ctx.defs[key];
  }
  throw new Error(`Reference not found: ${ref}`);
}
function convertBaseSchema(schema, ctx) {
  if (schema.not !== undefined) {
    if (typeof schema.not === "object" && Object.keys(schema.not).length === 0) {
      return z.never();
    }
    throw new Error("not is not supported in Zod (except { not: {} } for never)");
  }
  if (schema.unevaluatedItems !== undefined) {
    throw new Error("unevaluatedItems is not supported");
  }
  if (schema.unevaluatedProperties !== undefined) {
    throw new Error("unevaluatedProperties is not supported");
  }
  if (schema.if !== undefined || schema.then !== undefined || schema.else !== undefined) {
    throw new Error("Conditional schemas (if/then/else) are not supported");
  }
  if (schema.dependentSchemas !== undefined || schema.dependentRequired !== undefined) {
    throw new Error("dependentSchemas and dependentRequired are not supported");
  }
  if (schema.$ref) {
    const refPath = schema.$ref;
    if (ctx.refs.has(refPath)) {
      return ctx.refs.get(refPath);
    }
    if (ctx.processing.has(refPath)) {
      return z.lazy(() => {
        if (!ctx.refs.has(refPath)) {
          throw new Error(`Circular reference not resolved: ${refPath}`);
        }
        return ctx.refs.get(refPath);
      });
    }
    ctx.processing.add(refPath);
    const resolved = resolveRef(refPath, ctx);
    const zodSchema2 = convertSchema(resolved, ctx);
    ctx.refs.set(refPath, zodSchema2);
    ctx.processing.delete(refPath);
    return zodSchema2;
  }
  if (schema.enum !== undefined) {
    const enumValues = schema.enum;
    if (ctx.version === "openapi-3.0" && schema.nullable === true && enumValues.length === 1 && enumValues[0] === null) {
      return z.null();
    }
    if (enumValues.length === 0) {
      return z.never();
    }
    if (enumValues.length === 1) {
      return z.literal(enumValues[0]);
    }
    if (enumValues.every((v) => typeof v === "string")) {
      return z.enum(enumValues);
    }
    const literalSchemas = enumValues.map((v) => z.literal(v));
    if (literalSchemas.length < 2) {
      return literalSchemas[0];
    }
    return z.union([literalSchemas[0], literalSchemas[1], ...literalSchemas.slice(2)]);
  }
  if (schema.const !== undefined) {
    return z.literal(schema.const);
  }
  const type = schema.type;
  if (Array.isArray(type)) {
    const typeSchemas = type.map((t) => {
      const typeSchema = { ...schema, type: t };
      return convertBaseSchema(typeSchema, ctx);
    });
    if (typeSchemas.length === 0) {
      return z.never();
    }
    if (typeSchemas.length === 1) {
      return typeSchemas[0];
    }
    return z.union(typeSchemas);
  }
  if (!type) {
    return z.any();
  }
  let zodSchema;
  switch (type) {
    case "string": {
      let stringSchema = z.string();
      if (schema.format) {
        const format = schema.format;
        if (format === "email") {
          stringSchema = stringSchema.check(z.email());
        } else if (format === "uri" || format === "uri-reference") {
          stringSchema = stringSchema.check(z.url());
        } else if (format === "uuid" || format === "guid") {
          stringSchema = stringSchema.check(z.uuid());
        } else if (format === "date-time") {
          stringSchema = stringSchema.check(z.iso.datetime());
        } else if (format === "date") {
          stringSchema = stringSchema.check(z.iso.date());
        } else if (format === "time") {
          stringSchema = stringSchema.check(z.iso.time());
        } else if (format === "duration") {
          stringSchema = stringSchema.check(z.iso.duration());
        } else if (format === "ipv4") {
          stringSchema = stringSchema.check(z.ipv4());
        } else if (format === "ipv6") {
          stringSchema = stringSchema.check(z.ipv6());
        } else if (format === "mac") {
          stringSchema = stringSchema.check(z.mac());
        } else if (format === "cidr") {
          stringSchema = stringSchema.check(z.cidrv4());
        } else if (format === "cidr-v6") {
          stringSchema = stringSchema.check(z.cidrv6());
        } else if (format === "base64") {
          stringSchema = stringSchema.check(z.base64());
        } else if (format === "base64url") {
          stringSchema = stringSchema.check(z.base64url());
        } else if (format === "e164") {
          stringSchema = stringSchema.check(z.e164());
        } else if (format === "jwt") {
          stringSchema = stringSchema.check(z.jwt());
        } else if (format === "emoji") {
          stringSchema = stringSchema.check(z.emoji());
        } else if (format === "nanoid") {
          stringSchema = stringSchema.check(z.nanoid());
        } else if (format === "cuid") {
          stringSchema = stringSchema.check(z.cuid());
        } else if (format === "cuid2") {
          stringSchema = stringSchema.check(z.cuid2());
        } else if (format === "ulid") {
          stringSchema = stringSchema.check(z.ulid());
        } else if (format === "xid") {
          stringSchema = stringSchema.check(z.xid());
        } else if (format === "ksuid") {
          stringSchema = stringSchema.check(z.ksuid());
        }
      }
      if (typeof schema.minLength === "number") {
        stringSchema = stringSchema.min(schema.minLength);
      }
      if (typeof schema.maxLength === "number") {
        stringSchema = stringSchema.max(schema.maxLength);
      }
      if (schema.pattern) {
        stringSchema = stringSchema.regex(new RegExp(schema.pattern));
      }
      zodSchema = stringSchema;
      break;
    }
    case "number":
    case "integer": {
      let numberSchema = type === "integer" ? z.number().int() : z.number();
      if (typeof schema.minimum === "number") {
        numberSchema = numberSchema.min(schema.minimum);
      }
      if (typeof schema.maximum === "number") {
        numberSchema = numberSchema.max(schema.maximum);
      }
      if (typeof schema.exclusiveMinimum === "number") {
        numberSchema = numberSchema.gt(schema.exclusiveMinimum);
      } else if (schema.exclusiveMinimum === true && typeof schema.minimum === "number") {
        numberSchema = numberSchema.gt(schema.minimum);
      }
      if (typeof schema.exclusiveMaximum === "number") {
        numberSchema = numberSchema.lt(schema.exclusiveMaximum);
      } else if (schema.exclusiveMaximum === true && typeof schema.maximum === "number") {
        numberSchema = numberSchema.lt(schema.maximum);
      }
      if (typeof schema.multipleOf === "number") {
        numberSchema = numberSchema.multipleOf(schema.multipleOf);
      }
      zodSchema = numberSchema;
      break;
    }
    case "boolean": {
      zodSchema = z.boolean();
      break;
    }
    case "null": {
      zodSchema = z.null();
      break;
    }
    case "object": {
      const shape = {};
      const properties = schema.properties || {};
      const requiredSet = new Set(schema.required || []);
      for (const [key, propSchema] of Object.entries(properties)) {
        const propZodSchema = convertSchema(propSchema, ctx);
        shape[key] = requiredSet.has(key) ? propZodSchema : propZodSchema.optional();
      }
      if (schema.propertyNames) {
        const keySchema = convertSchema(schema.propertyNames, ctx);
        const valueSchema = schema.additionalProperties && typeof schema.additionalProperties === "object" ? convertSchema(schema.additionalProperties, ctx) : z.any();
        if (Object.keys(shape).length === 0) {
          zodSchema = z.record(keySchema, valueSchema);
          break;
        }
        const objectSchema2 = z.object(shape).passthrough();
        const recordSchema = z.looseRecord(keySchema, valueSchema);
        zodSchema = z.intersection(objectSchema2, recordSchema);
        break;
      }
      if (schema.patternProperties) {
        const patternProps = schema.patternProperties;
        const patternKeys = Object.keys(patternProps);
        const looseRecords = [];
        for (const pattern of patternKeys) {
          const patternValue = convertSchema(patternProps[pattern], ctx);
          const keySchema = z.string().regex(new RegExp(pattern));
          looseRecords.push(z.looseRecord(keySchema, patternValue));
        }
        const schemasToIntersect = [];
        if (Object.keys(shape).length > 0) {
          schemasToIntersect.push(z.object(shape).passthrough());
        }
        schemasToIntersect.push(...looseRecords);
        if (schemasToIntersect.length === 0) {
          zodSchema = z.object({}).passthrough();
        } else if (schemasToIntersect.length === 1) {
          zodSchema = schemasToIntersect[0];
        } else {
          let result = z.intersection(schemasToIntersect[0], schemasToIntersect[1]);
          for (let i = 2;i < schemasToIntersect.length; i++) {
            result = z.intersection(result, schemasToIntersect[i]);
          }
          zodSchema = result;
        }
        break;
      }
      const objectSchema = z.object(shape);
      if (schema.additionalProperties === false) {
        zodSchema = objectSchema.strict();
      } else if (typeof schema.additionalProperties === "object") {
        zodSchema = objectSchema.catchall(convertSchema(schema.additionalProperties, ctx));
      } else {
        zodSchema = objectSchema.passthrough();
      }
      break;
    }
    case "array": {
      const prefixItems = schema.prefixItems;
      const items = schema.items;
      if (prefixItems && Array.isArray(prefixItems)) {
        const tupleItems = prefixItems.map((item) => convertSchema(item, ctx));
        const rest = items && typeof items === "object" && !Array.isArray(items) ? convertSchema(items, ctx) : undefined;
        if (rest) {
          zodSchema = z.tuple(tupleItems).rest(rest);
        } else {
          zodSchema = z.tuple(tupleItems);
        }
        if (typeof schema.minItems === "number") {
          zodSchema = zodSchema.check(z.minLength(schema.minItems));
        }
        if (typeof schema.maxItems === "number") {
          zodSchema = zodSchema.check(z.maxLength(schema.maxItems));
        }
      } else if (Array.isArray(items)) {
        const tupleItems = items.map((item) => convertSchema(item, ctx));
        const rest = schema.additionalItems && typeof schema.additionalItems === "object" ? convertSchema(schema.additionalItems, ctx) : undefined;
        if (rest) {
          zodSchema = z.tuple(tupleItems).rest(rest);
        } else {
          zodSchema = z.tuple(tupleItems);
        }
        if (typeof schema.minItems === "number") {
          zodSchema = zodSchema.check(z.minLength(schema.minItems));
        }
        if (typeof schema.maxItems === "number") {
          zodSchema = zodSchema.check(z.maxLength(schema.maxItems));
        }
      } else if (items !== undefined) {
        const element = convertSchema(items, ctx);
        let arraySchema = z.array(element);
        if (typeof schema.minItems === "number") {
          arraySchema = arraySchema.min(schema.minItems);
        }
        if (typeof schema.maxItems === "number") {
          arraySchema = arraySchema.max(schema.maxItems);
        }
        zodSchema = arraySchema;
      } else {
        zodSchema = z.array(z.any());
      }
      break;
    }
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
  return zodSchema;
}
function convertSchema(schema, ctx) {
  if (typeof schema === "boolean") {
    return schema ? z.any() : z.never();
  }
  let baseSchema = convertBaseSchema(schema, ctx);
  const hasExplicitType = schema.type || schema.enum !== undefined || schema.const !== undefined;
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    const options = schema.anyOf.map((s) => convertSchema(s, ctx));
    const anyOfUnion = z.union(options);
    baseSchema = hasExplicitType ? z.intersection(baseSchema, anyOfUnion) : anyOfUnion;
  }
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    const options = schema.oneOf.map((s) => convertSchema(s, ctx));
    const oneOfUnion = z.xor(options);
    baseSchema = hasExplicitType ? z.intersection(baseSchema, oneOfUnion) : oneOfUnion;
  }
  if (schema.allOf && Array.isArray(schema.allOf)) {
    if (schema.allOf.length === 0) {
      baseSchema = hasExplicitType ? baseSchema : z.any();
    } else {
      let result = hasExplicitType ? baseSchema : convertSchema(schema.allOf[0], ctx);
      const startIdx = hasExplicitType ? 0 : 1;
      for (let i = startIdx;i < schema.allOf.length; i++) {
        result = z.intersection(result, convertSchema(schema.allOf[i], ctx));
      }
      baseSchema = result;
    }
  }
  if (schema.nullable === true && ctx.version === "openapi-3.0") {
    baseSchema = z.nullable(baseSchema);
  }
  if (schema.readOnly === true) {
    baseSchema = z.readonly(baseSchema);
  }
  if (schema.default !== undefined) {
    baseSchema = baseSchema.default(schema.default);
  }
  const extraMeta = {};
  const coreMetadataKeys = ["$id", "id", "$comment", "$anchor", "$vocabulary", "$dynamicRef", "$dynamicAnchor"];
  for (const key of coreMetadataKeys) {
    if (key in schema) {
      extraMeta[key] = schema[key];
    }
  }
  const contentMetadataKeys = ["contentEncoding", "contentMediaType", "contentSchema"];
  for (const key of contentMetadataKeys) {
    if (key in schema) {
      extraMeta[key] = schema[key];
    }
  }
  for (const key of Object.keys(schema)) {
    if (!RECOGNIZED_KEYS.has(key)) {
      extraMeta[key] = schema[key];
    }
  }
  if (Object.keys(extraMeta).length > 0) {
    ctx.registry.add(baseSchema, extraMeta);
  }
  if (schema.description) {
    baseSchema = baseSchema.describe(schema.description);
  }
  return baseSchema;
}
function fromJSONSchema(schema, params) {
  if (typeof schema === "boolean") {
    return schema ? z.any() : z.never();
  }
  let normalized;
  try {
    normalized = JSON.parse(JSON.stringify(schema));
  } catch {
    throw new Error("fromJSONSchema input is not valid JSON (possibly cyclic); use $defs/$ref for recursive schemas");
  }
  const version2 = detectVersion(normalized, params?.defaultTarget);
  const defs = normalized.$defs || normalized.definitions || {};
  const ctx = {
    version: version2,
    defs,
    refs: new Map,
    processing: new Set,
    rootSchema: normalized,
    registry: params?.registry ?? globalRegistry
  };
  return convertSchema(normalized, ctx);
}
// node_modules/zod/v4/classic/coerce.js
var exports_coerce = {};
__export(exports_coerce, {
  string: () => string3,
  number: () => number3,
  date: () => date4,
  boolean: () => boolean3,
  bigint: () => bigint3
});
function string3(params) {
  return _coercedString(ZodString, params);
}
function number3(params) {
  return _coercedNumber(ZodNumber, params);
}
function boolean3(params) {
  return _coercedBoolean(ZodBoolean, params);
}
function bigint3(params) {
  return _coercedBigint(ZodBigInt, params);
}
function date4(params) {
  return _coercedDate(ZodDate, params);
}

// node_modules/zod/v4/classic/external.js
config(en_default());
// src/backend/domain.ts
var NonEmptyStringSchema = exports_external.string().trim().min(1);
var ParagraphSchema = exports_external.number().int().positive();
var StringListSchema = exports_external.array(exports_external.string());
var ShotModeSchema = exports_external.enum(["dynamic", "static", "creative", "asset"]);
var DynamicShotPlanSchema = exports_external.object({
  mode: exports_external.literal("dynamic"),
  primaryAction: NonEmptyStringSchema.optional(),
  secondaryCue: exports_external.string().optional(),
  staging: exports_external.string().optional(),
  degradedFromCreative: exports_external.literal(true).optional()
}).strict().superRefine((plan, context) => {
  if (!plan.primaryAction && !plan.degradedFromCreative) {
    context.addIssue({ code: "custom", path: ["primaryAction"], message: "Dynamic plans require a primary action." });
  }
});
var StaticShotPlanSchema = exports_external.object({
  mode: exports_external.literal("static")
}).strict();
var CreativeSubjectTypeSchema = exports_external.enum([
  "object",
  "environment",
  "shadow",
  "silhouette",
  "reflection",
  "fragment",
  "spatial"
]);
var CreativeConceptSchema = exports_external.object({
  id: NonEmptyStringSchema,
  paragraph: ParagraphSchema,
  subjectType: CreativeSubjectTypeSchema,
  anchor: NonEmptyStringSchema,
  concept: NonEmptyStringSchema,
  renderScope: NonEmptyStringSchema,
  camera: NonEmptyStringSchema,
  visibleCues: exports_external.array(NonEmptyStringSchema),
  score: exports_external.number().min(0).max(100)
}).strict();
var CreativeShotPlanSchema = exports_external.object({
  mode: exports_external.literal("creative"),
  concept: CreativeConceptSchema.optional()
}).strict();
var AssetShotPlanSchema = exports_external.object({
  mode: exports_external.literal("asset")
}).strict();
var ShotPlanSchema = exports_external.discriminatedUnion("mode", [
  DynamicShotPlanSchema,
  StaticShotPlanSchema,
  CreativeShotPlanSchema,
  AssetShotPlanSchema
]);
var CharacterFieldSourceSchema = exports_external.enum([
  "card_explicit",
  "previous_memory",
  "narrative_explicit",
  "inferred"
]);
var CharacterFieldSourcesSchema = exports_external.object({
  age: CharacterFieldSourceSchema.optional(),
  appearance: CharacterFieldSourceSchema.optional(),
  body: CharacterFieldSourceSchema.optional(),
  attire: CharacterFieldSourceSchema.optional()
}).strict();
var CharacterContinuityStateSchema = exports_external.object({
  name: NonEmptyStringSchema,
  label: exports_external.string(),
  age: exports_external.string(),
  appearance: exports_external.string(),
  body: exports_external.string(),
  attire: exports_external.string(),
  attireInferred: exports_external.boolean(),
  sources: CharacterFieldSourcesSchema.optional()
}).strict();
var EnvironmentContinuityStateSchema = exports_external.object({
  location: exports_external.string(),
  timeWeather: exports_external.string(),
  lightingMood: StringListSchema,
  backgroundElements: StringListSchema
}).strict();
var ContinuityStateSchema = exports_external.object({
  characters: exports_external.array(CharacterContinuityStateSchema),
  environment: EnvironmentContinuityStateSchema,
  place: exports_external.string(),
  updatedAt: exports_external.iso.datetime().optional()
}).strict();
var CharacterContinuityFieldSchema = exports_external.enum([
  "label",
  "age",
  "appearance",
  "body",
  "attire",
  "attireInferred",
  "sources"
]);
var CharacterContinuityChangesSchema = exports_external.object({
  label: exports_external.string().optional(),
  age: exports_external.string().optional(),
  appearance: exports_external.string().optional(),
  body: exports_external.string().optional(),
  attire: exports_external.string().optional(),
  attireInferred: exports_external.boolean().optional(),
  sources: CharacterFieldSourcesSchema.optional()
}).strict();
var CharacterContinuityDeltaSchema = exports_external.object({
  name: NonEmptyStringSchema,
  set: CharacterContinuityChangesSchema.optional(),
  clear: exports_external.array(CharacterContinuityFieldSchema).optional()
}).strict().superRefine((delta, context) => {
  const hasSet = delta.set !== undefined && Object.keys(delta.set).length > 0;
  const hasClear = delta.clear !== undefined && delta.clear.length > 0;
  if (!hasSet && !hasClear) {
    context.addIssue({
      code: "custom",
      message: "A character continuity delta must set or clear at least one field."
    });
  }
  if (delta.clear && new Set(delta.clear).size !== delta.clear.length) {
    context.addIssue({ code: "custom", path: ["clear"], message: "Clear fields must be unique." });
  }
});
var EnvironmentContinuityFieldSchema = exports_external.enum([
  "location",
  "timeWeather",
  "lightingMood",
  "backgroundElements"
]);
var EnvironmentContinuityChangesSchema = exports_external.object({
  location: exports_external.string().optional(),
  timeWeather: exports_external.string().optional(),
  lightingMood: StringListSchema.optional(),
  backgroundElements: StringListSchema.optional()
}).strict();
var EnvironmentContinuityDeltaSchema = exports_external.object({
  set: EnvironmentContinuityChangesSchema.optional(),
  clear: exports_external.array(EnvironmentContinuityFieldSchema).optional()
}).strict().superRefine((delta, context) => {
  const hasSet = delta.set !== undefined && Object.keys(delta.set).length > 0;
  const hasClear = delta.clear !== undefined && delta.clear.length > 0;
  if (!hasSet && !hasClear) {
    context.addIssue({
      code: "custom",
      message: "An environment continuity delta must set or clear at least one field."
    });
  }
  if (delta.clear && new Set(delta.clear).size !== delta.clear.length) {
    context.addIssue({ code: "custom", path: ["clear"], message: "Clear fields must be unique." });
  }
});
var ContinuityDeltaSchema = exports_external.object({
  paragraph: ParagraphSchema,
  timing: exports_external.enum(["before_shot", "after_shot"]).optional(),
  characters: exports_external.array(CharacterContinuityDeltaSchema).optional(),
  removeCharacters: exports_external.array(NonEmptyStringSchema).optional(),
  environment: EnvironmentContinuityDeltaSchema.optional(),
  place: exports_external.string().nullable().optional()
}).strict().superRefine((delta, context) => {
  if (delta.removeCharacters && new Set(delta.removeCharacters.map((name) => name.toLowerCase())).size !== delta.removeCharacters.length) {
    context.addIssue({ code: "custom", path: ["removeCharacters"], message: "Removed character names must be unique." });
  }
  if (!(delta.characters?.length || delta.removeCharacters?.length || delta.environment !== undefined || delta.place !== undefined)) {
    context.addIssue({ code: "custom", message: "A continuity delta must contain at least one change." });
  }
});
var CameraSchema = exports_external.object({
  framing: exports_external.string(),
  angle: exports_external.string(),
  perspective: exports_external.string(),
  focus: StringListSchema
}).strict();
var CharacterCompositionSchema = exports_external.object({
  position: exports_external.string(),
  pose: exports_external.string(),
  actions: StringListSchema,
  gaze: exports_external.string()
}).strict();
var SharedCompositionSchema = exports_external.object({
  interaction: StringListSchema,
  spatialRelation: exports_external.string()
}).strict();
var ResolvedCharacterSchema = CharacterContinuityStateSchema.extend({
  identity: exports_external.string(),
  avatarAppearance: exports_external.string(),
  avatarBody: exports_external.string(),
  avatarAttire: exports_external.string(),
  expression: exports_external.string(),
  action: exports_external.string(),
  composition: CharacterCompositionSchema,
  renderScope: exports_external.string(),
  visibleTags: StringListSchema
}).strict();
var ResolvedShotSchema = exports_external.object({
  paragraph: ParagraphSchema,
  plan: ShotPlanSchema,
  camera: CameraSchema,
  cameraText: exports_external.string(),
  situation: exports_external.string(),
  action: exports_external.string(),
  characters: exports_external.array(ResolvedCharacterSchema),
  sharedComposition: SharedCompositionSchema,
  supplement: exports_external.string(),
  environment: EnvironmentContinuityStateSchema,
  place: exports_external.string(),
  negative: exports_external.string()
}).strict();
var IllustrationPlanSchema = exports_external.object({
  version: exports_external.literal(1),
  shots: exports_external.array(ResolvedShotSchema),
  initialContinuity: ContinuityStateSchema,
  continuityDeltas: exports_external.array(ContinuityDeltaSchema),
  terminalContinuity: ContinuityStateSchema
}).strict().superRefine((plan, context) => {
  for (let index = 1;index < plan.shots.length; index += 1) {
    if (plan.shots[index].paragraph <= plan.shots[index - 1].paragraph) {
      context.addIssue({
        code: "custom",
        path: ["shots"],
        message: "Resolved shots must be ordered by strictly increasing paragraph."
      });
      break;
    }
  }
  for (let index = 1;index < plan.continuityDeltas.length; index += 1) {
    const previous = plan.continuityDeltas[index - 1];
    const current = plan.continuityDeltas[index];
    const previousPhase = previous.timing === "after_shot" ? 1 : 0;
    const currentPhase = current.timing === "after_shot" ? 1 : 0;
    if (current.paragraph < previous.paragraph || current.paragraph === previous.paragraph && currentPhase <= previousPhase) {
      context.addIssue({
        code: "custom",
        path: ["continuityDeltas"],
        message: "Continuity deltas must be ordered by paragraph and before/after-shot phase."
      });
      break;
    }
  }
  const resolvedTerminal = resolveContinuity(plan.initialContinuity, plan.continuityDeltas);
  if (JSON.stringify(resolvedTerminal) !== JSON.stringify(plan.terminalContinuity)) {
    context.addIssue({
      code: "custom",
      path: ["terminalContinuity"],
      message: "terminalContinuity must equal the deterministic reduction of initialContinuity and continuityDeltas."
    });
  }
});
var EMPTY_CHARACTER = {
  label: "",
  age: "",
  appearance: "",
  body: "",
  attire: "",
  attireInferred: false
};
function applyContinuityDelta(state, input) {
  const current = ContinuityStateSchema.parse(state);
  const delta = ContinuityDeltaSchema.parse(input);
  let characters = current.characters.map((character) => ({
    ...character,
    ...character.sources ? { sources: { ...character.sources } } : {}
  }));
  const removedNames = new Set((delta.removeCharacters || []).map((name) => name.trim().toLowerCase()));
  if (removedNames.size > 0) {
    characters = characters.filter((character) => !removedNames.has(character.name.toLowerCase()));
  }
  for (const change of delta.characters || []) {
    const key = change.name.trim().toLowerCase();
    let index = characters.findIndex((character2) => character2.name.toLowerCase() === key);
    if (index < 0) {
      characters.push({ name: change.name, ...EMPTY_CHARACTER });
      index = characters.length - 1;
    }
    const character = { ...characters[index], ...change.set || {} };
    for (const field of change.clear || []) {
      if (field === "attireInferred")
        character.attireInferred = false;
      else if (field === "sources")
        delete character.sources;
      else
        character[field] = "";
    }
    characters[index] = character;
  }
  const environment = {
    ...current.environment,
    lightingMood: [...current.environment.lightingMood],
    backgroundElements: [...current.environment.backgroundElements],
    ...delta.environment?.set || {}
  };
  for (const field of delta.environment?.clear || []) {
    if (field === "lightingMood" || field === "backgroundElements")
      environment[field] = [];
    else
      environment[field] = "";
  }
  return ContinuityStateSchema.parse({
    ...current,
    characters,
    environment,
    ...delta.place !== undefined ? { place: delta.place ?? "" } : {}
  });
}
function resolveContinuity(initial, deltas) {
  let resolved = ContinuityStateSchema.parse(initial);
  let previousParagraph = 0;
  let previousPhase = -1;
  for (const delta of deltas) {
    const validated = ContinuityDeltaSchema.parse(delta);
    const phase = validated.timing === "after_shot" ? 1 : 0;
    if (validated.paragraph < previousParagraph || validated.paragraph === previousParagraph && phase <= previousPhase) {
      throw new Error("Continuity deltas must be ordered by source paragraph and phase.");
    }
    resolved = applyContinuityDelta(resolved, validated);
    previousParagraph = validated.paragraph;
    previousPhase = phase;
  }
  return resolved;
}
var CHARACTER_DIFF_FIELDS = ["label", "age", "appearance", "body", "attire", "attireInferred", "sources"];
var ENVIRONMENT_DIFF_FIELDS = ["location", "timeWeather", "lightingMood", "backgroundElements"];
function sameDomainValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function continuityDeltaBetween(previousInput, terminalInput, paragraph, timing) {
  const previous = ContinuityStateSchema.parse(previousInput);
  const terminal = ContinuityStateSchema.parse(terminalInput);
  const previousCharacters = new Map(previous.characters.map((character) => [character.name.toLowerCase(), character]));
  const terminalNames = new Set(terminal.characters.map((character) => character.name.toLowerCase()));
  const characters = [];
  for (const character of terminal.characters) {
    const prior = previousCharacters.get(character.name.toLowerCase());
    const set2 = {};
    for (const field of CHARACTER_DIFF_FIELDS) {
      if (!prior || !sameDomainValue(prior[field], character[field]))
        set2[field] = character[field];
    }
    if (Object.keys(set2).length > 0) {
      characters.push({ name: character.name, set: set2 });
    }
  }
  const removeCharacters = previous.characters.filter((character) => !terminalNames.has(character.name.toLowerCase())).map((character) => character.name);
  const environmentSet = {};
  for (const field of ENVIRONMENT_DIFF_FIELDS) {
    if (!sameDomainValue(previous.environment[field], terminal.environment[field])) {
      environmentSet[field] = terminal.environment[field];
    }
  }
  const candidate = {
    paragraph,
    ...timing ? { timing } : {},
    ...characters.length > 0 ? { characters } : {},
    ...removeCharacters.length > 0 ? { removeCharacters } : {},
    ...Object.keys(environmentSet).length > 0 ? { environment: { set: environmentSet } } : {},
    ...previous.place !== terminal.place ? { place: terminal.place || null } : {}
  };
  return Object.keys(candidate).every((key) => key === "paragraph" || key === "timing") ? null : ContinuityDeltaSchema.parse(candidate);
}
function reconcileContinuityState(previousInput, terminalInput, paragraph) {
  const terminal = ContinuityStateSchema.parse(terminalInput);
  const previous = previousInput ? ContinuityStateSchema.parse(previousInput) : ContinuityStateSchema.parse({
    characters: [],
    environment: { location: "", timeWeather: "", lightingMood: [], backgroundElements: [] },
    place: "",
    ...terminal.updatedAt ? { updatedAt: terminal.updatedAt } : {}
  });
  const delta = continuityDeltaBetween(previous, terminal, paragraph);
  const resolved = delta ? resolveContinuity(previous, [delta]) : previous;
  return ContinuityStateSchema.parse({ ...resolved, ...terminal.updatedAt ? { updatedAt: terminal.updatedAt } : {} });
}
var PlannedCharacterSchema = exports_external.object({
  name: NonEmptyStringSchema,
  identity: exports_external.string().optional(),
  avatarAppearance: exports_external.string().optional(),
  avatarBody: exports_external.string().optional(),
  avatarAttire: exports_external.string().optional(),
  expression: exports_external.string().optional(),
  action: exports_external.string().optional(),
  composition: CharacterCompositionSchema.optional(),
  renderScope: exports_external.string().optional(),
  visibleTags: StringListSchema.optional()
}).strict();
var PlannedShotSchema = exports_external.object({
  paragraph: ParagraphSchema,
  plan: ShotPlanSchema,
  camera: CameraSchema.partial(),
  cameraText: exports_external.string().optional(),
  situation: exports_external.string().optional(),
  action: exports_external.string().optional(),
  characters: exports_external.array(PlannedCharacterSchema).optional(),
  sharedComposition: SharedCompositionSchema.optional(),
  supplement: exports_external.string().optional(),
  negative: exports_external.string().optional(),
  place: exports_external.string().optional()
}).strict();
var IllustrationInputSchema = exports_external.object({
  initialContinuity: ContinuityStateSchema,
  shots: exports_external.array(PlannedShotSchema).min(1),
  deltas: exports_external.array(ContinuityDeltaSchema).optional()
}).strict();

// src/backend/shot-resolution.ts
function isFragmentRenderScope(value) {
  const scope = cleanString2(value).toLowerCase();
  const subject = "(?:head|face|eye|eyes|mouth|hair|hand|hands|finger|fingers|arm|arms|sleeve|sleeves|feet|foot|leg|legs|lower body|torso|chest|back|shoulder|tail|wing|silhouette|shadow)";
  return new RegExp([
    "\\b(?:head|face|eyes)\\s+out\\s+of\\s+frame\\b",
    `\\b${subject}\\s+(?:only|detail|focus)\\b`,
    `\\bonly\\s+(?:the\\s+)?${subject}\\b`,
    `\\b(?:close(?:-up)?|tight|crop(?:ped)?)\\s+(?:view|crop|focus)(?:\\s+(?:on|of))?\\s+(?:the\\s+|her\\s+|his\\s+|their\\s+)?${subject}\\b`,
    `\\b(?:focus|detail|close(?:-up)?|crop|view)\\s+(?:on|of)\\s+(?:the\\s+|her\\s+|his\\s+|their\\s+)?(?:[a-z-]+\\s+){0,2}${subject}\\b`,
    `\\b${subject}\\s+(?:fills?|filling)\\s+(?:the\\s+)?frame\\b`
  ].join("|"), "i").test(scope);
}
var ALL_VISIBILITY_REGIONS = ["head", "face", "neck", "shoulders", "torso", "arms", "hands", "hips", "legs", "feet", "figure"];
var FRAMING_VISIBILITY_REGIONS = {
  portrait: ["head", "face", "neck", "shoulders"],
  "close-up": ["head", "face", "neck", "shoulders"],
  "medium close-up": ["head", "face", "neck", "shoulders", "torso"],
  "upper body": ["head", "face", "neck", "shoulders", "torso", "arms", "hands"],
  "medium shot": ["head", "face", "neck", "shoulders", "torso", "arms", "hands"],
  "cowboy shot": ["head", "face", "neck", "shoulders", "torso", "arms", "hands", "hips", "legs"],
  "feet out of frame": ["head", "face", "neck", "shoulders", "torso", "arms", "hands", "hips", "legs"],
  "full body": ALL_VISIBILITY_REGIONS,
  "wide shot": ALL_VISIBILITY_REGIONS,
  "lower body": ["hips", "legs", "feet"],
  "head out of frame": ["torso", "arms", "hands", "hips", "legs", "feet"],
  "eyes out of frame": ["head", "face", "neck", "shoulders"],
  "body-part focus": []
};
var REGION_TAG_PATTERNS = [
  [["feet"], /\b(?:feet|foot|ankles?|shoes?|boots?|sneakers?|sandals?|loafers?|slippers?|heels?|footwear|barefoot|toes?|socks?|stocking feet)\b/],
  [["legs"], /\b(?:legs?|thighs?|knees?|calves?|thigh[- ]?highs?|stockings?|tights|pantyhose|leggings?|leg warmers?|garters?)\b/],
  [["hips"], /\b(?:hips?|waists?|waistbands?|belts?|crotches?|genitals?|pubis|penis|vulva|vagina|pussy|butts?|buttocks|asses?|mini[- ]?skirts?|skirts?|pants|trousers|slacks|shorts|jeans|underwear|panties|briefs|thongs?|bottomless)\b/],
  [["hands", "feet"], /\b(?:paws?|claws?)\b/],
  [["hands"], /\b(?:hands?|fingers?|fingernails?|palms?|wrists?|gloves?|mittens?|rings?|watches|bracelets?)\b/],
  [["arms"], /\b(?:arms?|sleeves?|elbows?|forearms?|biceps|triceps)\b/],
  [["shoulders"], /\b(?:shoulders?|shoulder pads)\b/],
  [["shoulders", "torso"], /\b(?:shirts?|blouses?|tank tops?|sweaters?|sweatshirts?|cardigans?|hoodies?|jackets?|blazers?|coats?|vests?|jerseys?|suits?|dresses?|robes?|gowns?|overalls|aprons?|uniforms?|ribbons?|capes?|cloaks?|tunics?|waistcoats?|suspenders?|sash(?:es)?|shirtless|topless)\b/],
  [["shoulders", "torso", "arms"], /\b(?:sleeveless|oversized|unzipped|unbuttoned|open front)\b/],
  [["hips", "legs"], /\b(?:side slit|high slit|pleated|high[- ]?waisted|low[- ]?rise)\b/],
  [["shoulders", "torso", "arms", "hips", "legs"], /\b(?:torn clothes|wet clothes)\b/],
  [["shoulders", "torso", "hips", "legs", "feet"], /\b(?:nude|naked)\b/],
  [["torso"], /\b(?:torsos?|chests?|breasts?|busts?|nipples?|bellies?|stomachs?|midriffs?|abdomens?|backs?|spines?|corsets?|bras?|binders?|collarbones?|cleavage|necklines?)\b/],
  [["neck"], /\b(?:necks?|necklaces?|chokers?|scarves?|ties?|neckties?|bow ?ties?|collars?|brooch(?:es)?|badges?|medals?)\b/],
  [["face"], /\b(?:eyes?|eyebrows?|brows|eyelashes?|lashes|pupils|irises?|heterochromia|tareme|tsurime|jitome|sanpaku|empty eyes|dashed eyes|symbol in eye|faces?|facial|freckles|beauty marks?|moles?|blush|cheeks?|chins?|jaws?|foreheads?|noses?|lips?|mouths?|teeth|tongues?|smiles?|frowns?|grins?|fangs?|tusks?|muzzles?|snouts?|eyepatches?|eye patches?|masks?|glasses|eyeglasses|goggles|monocles?|beards?|mustaches?|moustaches?|makeup)\b/],
  [["head"], /\b(?:hair|hairstyles?|bangs|fringe|ponytails?|braids?|buns?|bald|horns?|ears?|elf ears|earrings?|ear piercings?|antennae|halos?|hats?|caps?|hoods?|headbands?|tiaras?|veils?|hairpins?|hair clips?|hair ornaments?)\b/],
  [["shoulders", "torso"], /\b(?:wings?|winged)\b/],
  [["hips"], /\b(?:tails?|tail feathers?)\b/],
  [ALL_VISIBILITY_REGIONS, /\b(?:skin|fur|scales?|feathers?|furry|human|elf|elven|demon|demonic|angel|angelic|android|robot|robotic|cyborg|oni|vampire|orc|goblin|mermaid|alien|androgynous|kemonomimi|cat girl|wolf girl|fox girl|monster girl)\b/],
  [["figure"], /\b(?:tall|short|petite|giant|dwarf(?:ed)?|full[- ]?figure)\b/],
  [["shoulders", "torso", "arms"], /\b(?:muscular|toned|stocky|athletic)\b/],
  [["torso", "hips", "legs"], /\b(?:skinny|slim|lean|plump|fat|curvy|build|physique|pear[- ]?shaped|hourglass)\b/],
  [["legs"], /\b(?:long legs?|short legs?|thick thighs?)\b/]
];
var EYE_TAG = /\b(?:eyes?|eyebrows?|brows|eyelashes?|lashes|pupils|irises?|heterochromia|tareme|tsurime|jitome|sanpaku|empty eyes|dashed eyes|symbol in eye|eyepatches?|eye patches?)\b/;
function fallbackVisibilityRegions(source) {
  if (source === "identity")
    return ALL_VISIBILITY_REGIONS;
  if (source === "appearance")
    return ["face"];
  if (source === "attire")
    return ["shoulders", "torso"];
  return ["figure"];
}
function tagVisibilityRegions(tag, source) {
  const normalized = tag.toLowerCase();
  for (const [regions, pattern] of REGION_TAG_PATTERNS) {
    if (pattern.test(normalized))
      return regions;
  }
  return fallbackVisibilityRegions(source);
}
function visibilityModifiersFor(framing, angle, perspective, renderScope) {
  const scopeText = `${angle} ${perspective} ${renderScope}`.toLowerCase();
  return {
    hideFace: /\bfrom behind\b|\bfrom the back\b|\bback (?:view|only|to (?:the )?(?:viewer|camera))\b|\bseen from behind\b|\bfacing away\b|\bface (?:hidden|out of frame)\b/.test(scopeText),
    hideEyes: framing === "eyes out of frame" || /\beyes? (?:hidden|out of frame|cropped out|outside (?:the )?frame)\b/.test(scopeText)
  };
}
function cameraViewOf(camera) {
  const record2 = asRecord(camera);
  const framing = cleanString2(record2.framing).toLowerCase();
  const angle = cleanString2(record2.angle).toLowerCase();
  const perspective = cleanString2(record2.perspective).toLowerCase();
  if (framing || angle || perspective)
    return { framing, angle, perspective };
  const text = cleanString2(camera).toLowerCase();
  const byLengthDesc = (values) => [...values].sort((left, right) => right.length - left.length);
  return {
    framing: byLengthDesc(CAMERA_FRAMING_VALUES).find((value) => text.includes(value)) || "",
    angle: byLengthDesc(CAMERA_ANGLE_VALUES).find((value) => text.includes(value)) || "",
    perspective: byLengthDesc(CAMERA_PERSPECTIVE_VALUES).find((value) => text.includes(value)) || ""
  };
}
function isFragmentCameraFraming(framing) {
  return framing === "body-part focus" || framing === "head out of frame" || framing === "eyes out of frame";
}
function projectDynamicVisibleTags(character, camera, renderScope = "") {
  const view = cameraViewOf(camera);
  if (isFragmentCameraFraming(view.framing))
    return "";
  const modifiers = visibilityModifiersFor(view.framing, view.angle, view.perspective, renderScope);
  const regions = new Set(FRAMING_VISIBILITY_REGIONS[view.framing] || ALL_VISIBILITY_REGIONS);
  if (modifiers.hideFace)
    regions.delete("face");
  const projected = [];
  for (const { tag, source } of baselineTags(character)) {
    if (modifiers.hideEyes && EYE_TAG.test(tag.toLowerCase()))
      continue;
    if (tagVisibilityRegions(tag, source).some((region) => regions.has(region)))
      projected.push(tag);
  }
  return unique(projected).join(", ");
}
function baselineTags(character) {
  const fields = [
    ["identity", character.identity],
    ["appearance", character.appearance],
    ["appearance", character.avatarAppearance],
    ["body", character.body],
    ["body", character.avatarBody],
    ["attire", character.attire],
    ["attire", character.avatarAttire]
  ];
  const seen = new Set;
  const output = [];
  for (const [source, value] of fields) {
    for (const tag of csvParts(cleanString2(value))) {
      const key = tag.toLowerCase();
      if (seen.has(key))
        continue;
      seen.add(key);
      output.push({ tag, source });
    }
  }
  return output;
}
function resolveShotPerspective(shot, config2) {
  if (!config2.adaptiveMode)
    return { mode: config2.perspectiveMode, source: "manual" };
  const candidate = cleanString2(shot.perspectiveMode).toLowerCase();
  return candidate === "creative" || candidate === "static" || candidate === "dynamic" ? { mode: candidate, source: "adaptive" } : { mode: "dynamic", source: "adaptive" };
}
var EMPTY_CAMERA = { framing: "", angle: "", perspective: "", focus: [] };
var EMPTY_COMPOSITION = { position: "", pose: "", actions: [], gaze: "" };
var EMPTY_SHARED = { interaction: [], spatialRelation: "" };
function resolveShotAgainstState(state, planned) {
  const characterMap = new Map(state.characters.map((character) => [character.name.toLowerCase(), character]));
  const characters = (planned.characters || []).map((reference) => {
    const baseline = characterMap.get(reference.name.trim().toLowerCase());
    if (!baseline) {
      throw new Error(`Planned shot ${planned.paragraph} references unknown character "${reference.name}".`);
    }
    return ResolvedCharacterSchema.parse({
      ...baseline,
      identity: reference.identity ?? "",
      avatarAppearance: reference.avatarAppearance ?? "",
      avatarBody: reference.avatarBody ?? "",
      avatarAttire: reference.avatarAttire ?? "",
      expression: reference.expression ?? "",
      action: reference.action ?? "",
      composition: { ...EMPTY_COMPOSITION, ...reference.composition || {} },
      renderScope: reference.renderScope ?? "",
      visibleTags: reference.visibleTags ?? []
    });
  });
  return ResolvedShotSchema.parse({
    paragraph: planned.paragraph,
    plan: planned.plan,
    camera: { ...EMPTY_CAMERA, ...planned.camera },
    cameraText: planned.cameraText ?? "",
    situation: planned.situation ?? "",
    action: planned.action ?? "",
    characters,
    sharedComposition: { ...EMPTY_SHARED, ...planned.sharedComposition || {} },
    supplement: planned.supplement ?? "",
    environment: state.environment,
    place: planned.place ?? state.place,
    negative: planned.negative ?? ""
  });
}
function resolveIllustrationPlan(input) {
  const { initialContinuity, shots, deltas = [] } = IllustrationInputSchema.parse(input);
  const resolvedShots = [];
  let state = initialContinuity;
  let deltaIndex = 0;
  for (const planned of shots) {
    while (deltaIndex < deltas.length && deltas[deltaIndex].paragraph < planned.paragraph) {
      state = applyContinuityDelta(state, deltas[deltaIndex]);
      deltaIndex += 1;
    }
    while (deltaIndex < deltas.length && deltas[deltaIndex].paragraph === planned.paragraph && deltas[deltaIndex].timing !== "after_shot") {
      state = applyContinuityDelta(state, deltas[deltaIndex]);
      deltaIndex += 1;
    }
    resolvedShots.push(resolveShotAgainstState(state, planned));
    while (deltaIndex < deltas.length && deltas[deltaIndex].paragraph === planned.paragraph && deltas[deltaIndex].timing === "after_shot") {
      state = applyContinuityDelta(state, deltas[deltaIndex]);
      deltaIndex += 1;
    }
  }
  while (deltaIndex < deltas.length) {
    state = applyContinuityDelta(state, deltas[deltaIndex]);
    deltaIndex += 1;
  }
  return IllustrationPlanSchema.parse({
    version: 1,
    shots: resolvedShots,
    initialContinuity,
    continuityDeltas: deltas,
    terminalContinuity: state
  });
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
function displayName(name, config2) {
  const clean = stripParenthetical(name);
  const source = config2.originalCreationName.trim();
  return config2.originalReference && clean && source ? `${clean} \\(${source}\\)` : clean;
}
function normalizeCharacterName(value) {
  return stripParenthetical(cleanString2(value));
}
function shouldIncludeCharacterNames(config2) {
  return config2.originalReference === true && config2.originalCreationName.trim().length > 0;
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
  const firstNameCounts = new Map;
  for (const character of characters) {
    const first = normalizeCharacterName(character.name).split(/\s+/)[0]?.toLowerCase();
    if (first)
      firstNameCounts.set(first, (firstNameCounts.get(first) || 0) + 1);
  }
  for (const character of characters) {
    const descriptor = characterDescriptor(character);
    const raw = cleanString2(character.name);
    const normalized = normalizeCharacterName(raw);
    for (const name of unique([raw, normalized].filter(Boolean))) {
      if (name.length >= 2)
        replacements.set(name, descriptor);
    }
    const first = normalized.split(/\s+/)[0];
    if (first.length >= 2 && firstNameCounts.get(first.toLowerCase()) === 1)
      replacements.set(first, descriptor);
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
function buildCharacterTagReference(map2) {
  const lines = Object.entries(map2).map(([rawName, rawTags]) => {
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
var renderedPromptCache = new WeakMap;
function renderPrompt(prompt, syntax) {
  const cached2 = renderedPromptCache.get(prompt)?.[syntax];
  if (cached2 !== undefined)
    return cached2;
  const rendered = joinSections(prompt.sections, syntax, prompt.format || "ordered");
  const entries = renderedPromptCache.get(prompt) || {};
  entries[syntax] = rendered;
  renderedPromptCache.set(prompt, entries);
  return rendered;
}
function renderPromptWithCurrentAffixes(corePrompt, format, config2) {
  const preset = activePromptPreset(config2);
  const clean = (value) => format === "ordered" ? normalizePromptSection(value) : value.trim();
  const separator = config2.promptSyntax === "comfyui" ? format === "ordered" ? `,

` : `,
` : ", ";
  return [
    clean(preset?.positivePrefix || ""),
    clean(config2.customPositivePrefix),
    corePrompt.trim(),
    clean(config2.customPositiveSuffix)
  ].filter(Boolean).join(separator);
}
function renderNegativeWithCurrentSelection(shotNegative, format, config2) {
  const preset = activePromptPreset(config2);
  const negative = unique(csvParts(preset?.negativePrefix, config2.customNegative, shotNegative)).join(", ");
  return format === "ordered" ? normalizePromptSection(negative) : negative.trim();
}
function normalizePromptSection(value) {
  const doubleColon = "";
  return value.replace(/::/g, doubleColon).replace(/;/g, ",").replace(/\s*,(?:\s*,)+\s*/g, ", ").replace(/^\s*,+\s*/, "").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/[.!?]+(?=\s*,)/g, "").replace(/[\s.,;:!?]+$/g, "").replace(new RegExp(doubleColon, "g"), "::").trim();
}
function normalizeSupplement(value) {
  return normalizePromptSection(value);
}
function activePromptPreset(config2) {
  return config2.promptPresets.find((preset) => preset.id === config2.activePromptPresetId) || null;
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
var ACTION_STOP_WORDS = new Set(["a", "an", "at", "in", "of", "on", "s", "the", "to", "toward", "towards", "with"]);
function actionToken(value) {
  const lower = value.toLowerCase();
  if (["face", "facing", "gaze", "gazing", "look", "looking", "looks"].includes(lower))
    return "look";
  if (["spin", "spinning", "turn", "turning", "turns"].includes(lower))
    return "turn";
  if (["march", "marching", "walk", "walking", "walks"].includes(lower))
    return "walk";
  if (["pull", "pulling", "pulls"].includes(lower))
    return "pull";
  if (["grip", "gripping", "grips"].includes(lower))
    return "grip";
  if (["run", "running", "runs"].includes(lower))
    return "run";
  if (["girl", "woman", "female"].includes(lower))
    return "female";
  if (["boy", "man", "male"].includes(lower))
    return "male";
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
function assembleCharacterBlock(character, config2, replacements, includeAction, perspectiveMode) {
  if (perspectiveMode === "creative") {
    return unique(csvParts(stripOrReplaceNames(cleanString2(character.visibleTags), replacements, true))).join(", ");
  }
  return unique(csvParts(stripOrReplaceNames(cleanString2(character.label), replacements, true), shouldIncludeCharacterNames(config2) ? displayName(cleanString2(character.name), config2) : "", stripOrReplaceNames(cleanString2(character.age), replacements, true), stripOrReplaceNames(cleanString2(character.identity), replacements, true), stripOrReplaceNames(cleanString2(character.appearance), replacements, true), stripOrReplaceNames(cleanString2(character.avatarAppearance), replacements, true), stripOrReplaceNames(cleanString2(character.body), replacements, true), stripOrReplaceNames(cleanString2(character.avatarBody), replacements, true), stripOrReplaceNames(cleanString2(character.attire), replacements, true), stripOrReplaceNames(cleanString2(character.avatarAttire), replacements, true), stripOrReplaceNames(cleanString2(character.expression), replacements, true), includeAction ? stripOrReplaceNames(cleanString2(character.action), replacements, true) : "")).join(", ");
}
function criticalVisibilityText(shot) {
  const shotPlan = asRecord(shot.shotPlan);
  const structuredShotPlan = hasAtomicField(shotPlan, ["primaryAction", "secondaryCue", "staging"]);
  const shared = asRecord(shot.sharedComposition);
  const values = [
    structuredShotPlan ? "" : shot.action,
    typeof shot.shotPlan === "string" ? shot.shotPlan : "",
    shotPlan.primaryAction,
    shotPlan.secondaryCue,
    shotPlan.staging,
    typeof shot.sharedComposition === "string" ? shot.sharedComposition : "",
    shared.interaction,
    shared.spatialRelation
  ];
  for (const character of cleanArray(shot.characters)) {
    const composition = asRecord(character.composition);
    const structuredComposition = hasAtomicField(composition, ["position", "pose", "actions", "gaze"]);
    values.push(structuredComposition ? "" : character.action, typeof character.composition === "string" ? character.composition : "", composition.pose, composition.actions, composition.gaze);
  }
  return values.flatMap((value) => Array.isArray(value) ? csvParts(value) : [cleanString2(value)]).filter(Boolean).join(" ").toLowerCase();
}
function requiredCriticalRegions(shot) {
  const text = criticalVisibilityText(shot);
  const regions = new Set;
  const add = (region, pattern) => {
    if (pattern.test(text))
      regions.add(region);
  };
  add("feet", /\b(?:feet|foot|ankles?|toes?|shoes?|boots?|sneakers?|sandals?|loafers?|slippers?|heels?|kick(?:s|ed|ing)?|stomp(?:s|ed|ing)?)\b/);
  add("legs", /\b(?:legs?|thighs?|knees?|calves?|leggings?|stockings?|tights|pantyhose)\b/);
  add("hips", /\b(?:hips?|waists?|skirts?|pants|trousers|slacks|shorts|jeans|underwear|panties)\b/);
  add("hands", /\b(?:hands?|fingers?|palms?|wrists?|gloves?|grip(?:s|ped|ping)?|punch(?:es|ed|ing)?)\b/);
  add("arms", /\b(?:arms?|sleeves?|elbows?|forearms?)\b/);
  add("torso", /\b(?:torsos?|chests?|breasts?|stomachs?|midriffs?|backs?|shirts?|jackets?|coats?|dresses?)\b/);
  add("face", /\b(?:face|expression|eyes?|eyebrows?|pupils?|irises?|heterochromia|tareme|tsurime|jitome|gaze|gazing|look(?:s|ed|ing)?|glare(?:s|d|ing)?|wink(?:s|ed|ing)?|blink(?:s|ed|ing)?|mouth|lips?|tears?|blush(?:es|ed|ing)?|smile(?:s|d|ing)?|grin(?:s|ned|ning)?|frown(?:s|ed|ing)?|cry(?:ing|ies|ied)?)\b/);
  add("head", /\b(?:head|hair|bangs|ponytails?|braids?|horns?|ears?|hats?|caps?)\b/);
  const requiresEyes = /\b(?:eyes?|eyebrows?|pupils?|irises?|heterochromia|tareme|tsurime|jitome|gaze|gazing|look(?:s|ed|ing)?|glare(?:s|d|ing)?|wink(?:s|ed|ing)?|blink(?:s|ed|ing)?)\b/.test(text);
  return { regions, requiresEyes };
}
function cameraValueWithView(camera, view) {
  const record2 = asRecord(camera);
  if (Object.keys(record2).length > 0) {
    return { ...record2, framing: view.framing, angle: view.angle, perspective: view.perspective };
  }
  const text = cleanString2(camera).toLowerCase();
  return {
    framing: view.framing,
    angle: view.angle,
    perspective: view.perspective,
    focus: CAMERA_FOCUS_VALUES.filter((value) => text.includes(value))
  };
}
function smallestCompatibleFraming(required2) {
  const candidates = ["portrait", "medium close-up", "upper body", "cowboy shot", "full body"];
  return candidates.find((candidate) => {
    const regions = new Set(FRAMING_VISIBILITY_REGIONS[candidate]);
    return [...required2].every((region) => regions.has(region));
  }) || "full body";
}
function fragmentProjectionRegions(shot) {
  const regions = new Set;
  for (const character of cleanArray(shot.characters)) {
    for (const tag of csvParts(cleanString2(character.visibleTags))) {
      for (const region of tagVisibilityRegions(tag, "projection")) {
        if (region !== "figure")
          regions.add(region);
      }
    }
  }
  return regions;
}
function resolveDynamicCamera(shot) {
  const original = cameraViewOf(shot.camera);
  if (!original.framing) {
    return { value: shot.camera, view: original, adjusted: false, originalFraming: "" };
  }
  const critical = requiredCriticalRegions(shot);
  const rearView = /\bfrom behind\b|\bfrom the back\b|\bback view\b/.test(original.perspective);
  const repairedPerspective = critical.regions.has("face") && rearView ? "three-quarter view" : original.perspective;
  if (original.framing === "body-part focus") {
    const visibleRegions = fragmentProjectionRegions(shot);
    const missesCritical = [...critical.regions].some((region) => !visibleRegions.has(region));
    if (!missesCritical && repairedPerspective === original.perspective) {
      return { value: shot.camera, view: original, adjusted: false, originalFraming: original.framing };
    }
    const required3 = new Set([...visibleRegions, ...critical.regions]);
    const view2 = { ...original, framing: smallestCompatibleFraming(required3), perspective: repairedPerspective };
    return {
      value: cameraValueWithView(shot.camera, view2),
      view: view2,
      adjusted: true,
      originalFraming: original.framing
    };
  }
  const originalRegions = new Set(FRAMING_VISIBILITY_REGIONS[original.framing] || ALL_VISIBILITY_REGIONS);
  const required2 = new Set([...originalRegions, ...critical.regions]);
  let framing = original.framing;
  const framingMissesCritical = [...critical.regions].some((region) => !originalRegions.has(region));
  if (framingMissesCritical || critical.requiresEyes && original.framing === "eyes out of frame") {
    framing = smallestCompatibleFraming(required2);
  }
  const view = { ...original, framing, perspective: repairedPerspective };
  const adjusted = framing !== original.framing || repairedPerspective !== original.perspective;
  return {
    value: adjusted ? cameraValueWithView(shot.camera, view) : shot.camera,
    view,
    adjusted,
    originalFraming: original.framing
  };
}
function adultAgeMarker(character, shot) {
  const nsfw = csvParts(shot.situation).some((tag) => tag.toLowerCase() === "nsfw");
  const age = cleanString2(character.age);
  return nsfw && /\b(?:adult|mature|aged up|old|elderly)\b/i.test(age) ? age : "";
}
function assembleFragmentCharacterBlock(character, config2, replacements, camera, shot) {
  const renderScope = cleanString2(character.renderScope).toLowerCase();
  const modifiers = visibilityModifiersFor(camera.framing, camera.angle, camera.perspective, renderScope);
  const hideHead = camera.framing === "head out of frame" || /\bhead\s+out\s+of\s+frame\b/.test(renderScope);
  const hideFace = hideHead || modifiers.hideFace || /\bface\s+out\s+of\s+frame\b/.test(renderScope);
  const hideEyes = hideFace || modifiers.hideEyes || /\beyes?\s+out\s+of\s+frame\b/.test(renderScope);
  const projection = csvParts(stripOrReplaceNames(cleanString2(character.visibleTags), replacements, true)).filter((tag) => {
    const tagRegions = tagVisibilityRegions(tag, "projection");
    if (hideHead && tagRegions.some((region) => region === "head" || region === "face"))
      return false;
    if (hideFace && tagRegions.includes("face"))
      return false;
    if (hideEyes && EYE_TAG.test(tag.toLowerCase()))
      return false;
    return true;
  });
  return unique(csvParts(stripOrReplaceNames(cleanString2(character.label), replacements, true), shouldIncludeCharacterNames(config2) ? displayName(cleanString2(character.name), config2) : "", stripOrReplaceNames(adultAgeMarker(character, shot), replacements, true), projection.join(", "))).join(", ");
}
function assembleVisibilityTierCharacterBlock(character, config2, replacements, camera, shot, ignoreOcclusionScope, ignoreFragmentScope) {
  const renderScope = cleanString2(character.renderScope);
  const fragment = isFragmentCameraFraming(camera.framing) || !ignoreFragmentScope && isFragmentRenderScope(renderScope);
  if (fragment)
    return assembleFragmentCharacterBlock(character, config2, replacements, camera, shot);
  const modifierScope = ignoreOcclusionScope ? "" : renderScope;
  const modifiers = visibilityModifiersFor(camera.framing, camera.angle, camera.perspective, modifierScope);
  const regions = new Set(FRAMING_VISIBILITY_REGIONS[camera.framing] || ALL_VISIBILITY_REGIONS);
  if (modifiers.hideFace)
    regions.delete("face");
  const faceReadable = regions.has("face");
  const projected = [];
  for (const { tag, source } of baselineTags(character)) {
    if (modifiers.hideEyes && EYE_TAG.test(tag.toLowerCase()))
      continue;
    if (tagVisibilityRegions(tag, source).some((region) => regions.has(region)))
      projected.push(tag);
  }
  for (const tag of csvParts(stripOrReplaceNames(cleanString2(character.visibleTags), replacements, true))) {
    if (projected.some((candidate) => candidate.toLowerCase() === tag.toLowerCase()))
      continue;
    if (modifiers.hideEyes && EYE_TAG.test(tag.toLowerCase()))
      continue;
    if (tagVisibilityRegions(tag, "projection").some((region) => regions.has(region)))
      projected.push(tag);
  }
  return unique(csvParts(stripOrReplaceNames(cleanString2(character.label), replacements, true), shouldIncludeCharacterNames(config2) ? displayName(cleanString2(character.name), config2) : "", stripOrReplaceNames(faceReadable ? cleanString2(character.age) : adultAgeMarker(character, shot), replacements, true), projected.map((tag) => stripOrReplaceNames(tag, replacements, true)).join(", "), faceReadable ? stripOrReplaceNames(cleanString2(character.expression), replacements, true) : "")).join(", ");
}
function structuredSnippets(value, cap) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) => csvParts(entry)).map((entry) => cleanString2(entry)).filter(Boolean).slice(0, cap);
}
var CAMERA_FRAMING2 = new Set(CAMERA_FRAMING_VALUES);
var CAMERA_ANGLE2 = new Set(CAMERA_ANGLE_VALUES);
var CAMERA_PERSPECTIVE2 = new Set(CAMERA_PERSPECTIVE_VALUES);
var CAMERA_FOCUS2 = new Set(CAMERA_FOCUS_VALUES);
function hasAtomicField(record2, fields) {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(record2, field));
}
function sanitizedAtomicSnippets(value, cap, replacements) {
  return structuredSnippets(value, cap).map((snippet) => sanitizeComposition(snippet, replacements)).filter(Boolean);
}
function assembleAtomicCharacterComposition(value, replacements) {
  const record2 = asRecord(value);
  const fields = ["position", "pose", "actions", "gaze"];
  const structured = hasAtomicField(record2, fields);
  if (!structured)
    return { text: sanitizeComposition(cleanString2(value), replacements), structured: false };
  const snippets = unique([
    ...sanitizedAtomicSnippets(record2.position, 1, replacements),
    ...sanitizedAtomicSnippets(record2.pose, 1, replacements),
    ...sanitizedAtomicSnippets(record2.actions, 3, replacements),
    ...sanitizedAtomicSnippets(record2.gaze, 1, replacements)
  ]);
  return { text: snippets.join(", "), structured: true };
}
function assembleDynamicCharacterComposition(value, replacements, priority) {
  const record2 = asRecord(value);
  const fields = ["position", "pose", "actions", "gaze"];
  const structured = hasAtomicField(record2, fields);
  if (!structured)
    return { text: sanitizeComposition(cleanString2(value), replacements), structured: false };
  const priorityTokens = actionTokens(priority);
  const uncovered = (snippet) => {
    const tokens = actionTokens(snippet);
    return tokens.length === 0 || !tokens.every((token) => tokenCovered(token, priorityTokens));
  };
  const actions = sanitizedAtomicSnippets(record2.actions, 3, replacements).filter(uncovered);
  return {
    text: unique([
      ...sanitizedAtomicSnippets(record2.position, 1, replacements),
      ...sanitizedAtomicSnippets(record2.pose, 1, replacements),
      ...actions,
      ...sanitizedAtomicSnippets(record2.gaze, 1, replacements)
    ]).join(", "),
    structured: true
  };
}
function assembleStaticCharacterComposition(value, replacements, index, characterCount) {
  const composition = asRecord(value);
  const pose = sanitizedAtomicSnippets(composition.pose, 1, replacements);
  const gaze = sanitizedAtomicSnippets(composition.gaze, 1, replacements);
  const concretePose = pose[0] && !/\bpos(?:e|es|ed|ing)\b/i.test(pose[0]) ? pose[0] : "standing upright with arms relaxed at sides";
  const position = characterCount === 1 ? "slightly forward from the background" : index === 0 ? "left side slightly forward from the background" : index === characterCount - 1 ? "right side slightly forward from the background" : "center slightly forward from the background";
  return {
    text: unique([
      position,
      concretePose,
      ...gaze
    ]).join(", "),
    structured: true
  };
}
function assembleAtomicSharedComposition(value, replacements) {
  const record2 = asRecord(value);
  const fields = ["interaction", "spatialRelation"];
  const structured = hasAtomicField(record2, fields);
  if (!structured) {
    const text = sanitizeComposition(cleanString2(value), replacements);
    return { text, interaction: "", relation: "", structured: false };
  }
  const interactionParts = unique(sanitizedAtomicSnippets(record2.interaction, 2, replacements));
  const relationParts = unique(sanitizedAtomicSnippets(record2.spatialRelation, 1, replacements));
  return {
    text: unique([...interactionParts, ...relationParts]).join(", "),
    interaction: interactionParts.join(", "),
    relation: relationParts.join(", "),
    structured: true
  };
}
function allowedCameraSnippets(value, cap, allowed) {
  return structuredSnippets(value, cap).map((snippet) => snippet.toLowerCase().replace(/\s+/g, " ").trim()).filter((snippet) => allowed.has(snippet));
}
function assembleStructuredCamera(value) {
  const record2 = asRecord(value);
  const fields = ["framing", "angle", "perspective", "focus"];
  const structured = hasAtomicField(record2, fields);
  if (!structured)
    return { text: unique(csvParts(cleanString2(value))).join(", "), structured: false };
  return {
    text: unique([
      ...allowedCameraSnippets(record2.framing, 1, CAMERA_FRAMING2),
      ...allowedCameraSnippets(record2.angle, 1, CAMERA_ANGLE2),
      ...allowedCameraSnippets(record2.perspective, 1, CAMERA_PERSPECTIVE2),
      ...allowedCameraSnippets(record2.focus, 2, CAMERA_FOCUS2)
    ]).join(", "),
    structured: true
  };
}
function assembleDynamicShotPlan(value, replacements) {
  const record2 = asRecord(value);
  const fields = ["primaryAction", "secondaryCue", "staging"];
  const structured = hasAtomicField(record2, fields);
  if (!structured)
    return { text: sanitizeComposition(cleanString2(value), replacements), structured: false };
  return {
    text: unique([
      ...sanitizedAtomicSnippets(record2.primaryAction, 1, replacements),
      ...sanitizedAtomicSnippets(record2.secondaryCue, 1, replacements),
      ...sanitizedAtomicSnippets(record2.staging, 1, replacements)
    ]).join(", "),
    structured: true
  };
}
function identitySafeCreativeSituation(value) {
  return unique(csvParts(value).filter((tag) => !/^(?:\d+(?:girl|boy|other)s?|girl|boy|other|solo|group)$/i.test(tag.trim()))).join(", ");
}
function normalizedSituation(value, characterCount) {
  const tags = unique(csvParts(value));
  if (characterCount !== 1 || tags.some((tag) => tag.toLowerCase() === "solo"))
    return tags.join(", ");
  return unique([...tags, tags.some((tag) => /^1(?:girl|boy|other)$/i.test(tag.trim())) ? "solo" : ""]).join(", ");
}
function assetSituation(value, character) {
  const label = csvParts(character?.label, character?.age).join(" ").toLowerCase();
  const count = /\b(?:girl|female|woman)\b/.test(label) ? "1girl" : /\b(?:boy|male|man)\b/.test(label) ? "1boy" : "1other";
  const explicitRating = csvParts(value).filter((tag) => tag.toLowerCase() === "nsfw");
  return unique([count, "solo", ...explicitRating]).join(", ");
}
function assembleAssetCharacterComposition(value, replacements) {
  const record2 = asRecord(value);
  const fields = ["position", "pose", "actions", "gaze"];
  const structured = hasAtomicField(record2, fields);
  if (!structured) {
    return {
      text: unique(csvParts(sanitizeComposition(cleanString2(value), replacements), "looking at viewer")).join(", "),
      structured: false
    };
  }
  return {
    text: unique([
      ...sanitizedAtomicSnippets(record2.position, 1, replacements),
      ...sanitizedAtomicSnippets(record2.pose, 1, replacements),
      ...sanitizedAtomicSnippets(record2.actions, 3, replacements),
      "looking at viewer"
    ]).join(", "),
    structured: true
  };
}
function creativeCueTags(anchor, visibleCues, parserVisibleTags = "") {
  const cues = unique(csvParts(visibleCues));
  const anchorText = cleanString2(anchor);
  const cueTokens = actionTokens(cues.join(" "));
  const anchorTokens = actionTokens(anchorText);
  const anchorCovered = anchorTokens.length > 0 && anchorTokens.every((token) => tokenCovered(token, cueTokens));
  const safeParserTags = csvParts(parserVisibleTags).filter(isIdentitySafeCreativeCue);
  return unique(csvParts(anchorCovered ? "" : anchorText, cues, safeParserTags)).join(", ");
}
function assembleAnimaPrompt(scene, shot, config2, replacements, perspectiveMode, creativeConcept, dynamicLayout = "hybrid") {
  const allCharacters = cleanArray(shot.characters).slice(0, perspectiveMode === "asset" ? 1 : config2.maxCharacters);
  const bindingCreative = perspectiveMode === "creative" && Boolean(creativeConcept);
  const characters = bindingCreative ? allCharacters.slice(0, 1) : allCharacters;
  const dynamicShotPlan = perspectiveMode === "dynamic" ? assembleDynamicShotPlan(shot.shotPlan, replacements) : { text: "", structured: false };
  const dynamicCamera = perspectiveMode === "dynamic" ? resolveDynamicCamera(shot) : { value: shot.camera, view: { framing: "", angle: "", perspective: "" }, adjusted: false, originalFraming: "" };
  const cameraView = dynamicCamera.view;
  const compactDynamic = perspectiveMode === "dynamic" && dynamicShotPlan.structured && Boolean(dynamicShotPlan.text);
  const hybridDynamic = compactDynamic && dynamicLayout === "hybrid";
  const conceptScope = perspectiveMode === "creative" ? sanitizeComposition(cleanString2(creativeConcept?.renderScope), replacements) : "";
  const characterParts = characters.map((character, index) => {
    const composition = perspectiveMode === "asset" ? assembleAssetCharacterComposition(character.composition, replacements) : perspectiveMode === "static" ? assembleStaticCharacterComposition(character.composition, replacements, index, characters.length) : hybridDynamic ? assembleDynamicCharacterComposition(character.composition, replacements, dynamicShotPlan.text) : assembleAtomicCharacterComposition(character.composition, replacements);
    const scope = perspectiveMode === "creative" ? index === 0 && conceptScope || (() => {
      const parserScope = sanitizeComposition(cleanString2(character.renderScope), replacements);
      return isIdentitySafeCreativeCue(parserScope) ? parserScope : "";
    })() : "";
    const compositionText = perspectiveMode === "creative" ? scope : composition.text;
    const conceptTags = perspectiveMode === "creative" && index === 0 ? stripOrReplaceNames(creativeCueTags(creativeConcept?.anchor, creativeConcept?.visibleCues, character.visibleTags), replacements, true) : "";
    const baseTags = conceptTags || (perspectiveMode === "dynamic" ? assembleVisibilityTierCharacterBlock(character, config2, replacements, cameraView, shot, dynamicCamera.adjusted, dynamicCamera.adjusted && isFragmentCameraFraming(dynamicCamera.originalFraming) && characters.length === 1) : assembleCharacterBlock(character, config2, replacements, false, perspectiveMode));
    const uncoveredActions = composition.structured ? "" : stripOrReplaceNames(uncoveredActionTags(character.action, compositionText), replacements, true);
    const tags = unique(csvParts(baseTags, uncoveredActions)).join(", ");
    return {
      compositionText,
      sections: compactDynamic && !hybridDynamic ? [tags].filter(Boolean) : [compositionText, tags].filter(Boolean)
    };
  });
  const characterSections = characterParts.flatMap((part) => part.sections);
  const unboundCreativeCues = bindingCreative && characters.length === 0 ? stripOrReplaceNames(creativeCueTags(creativeConcept?.anchor, creativeConcept?.visibleCues), replacements, true) : "";
  const individualComposition = characterParts.map((part) => part.compositionText).filter(Boolean).join(", ");
  const hasSharedComposition = Boolean(cleanString2(shot.sharedComposition)) || Object.keys(asRecord(shot.sharedComposition)).length > 0;
  const sharedSource = hasSharedComposition ? shot.sharedComposition : shot.supplement;
  const sharedComposition = assembleAtomicSharedComposition(sharedSource, replacements);
  const filteredSharedInteraction = sharedComposition.structured ? uncoveredActionTags(sharedComposition.interaction, individualComposition) : sharedComposition.interaction;
  const filteredSharedText = sharedComposition.structured ? unique(csvParts(filteredSharedInteraction, sharedComposition.relation)).join(", ") : sharedComposition.text;
  const sharedAction = sharedComposition.structured ? config2.supplement ? "" : filteredSharedInteraction : stripOrReplaceNames(uncoveredActionTags(shot.action, config2.supplement ? sharedComposition.text : ""), replacements, true);
  const camera = perspectiveMode === "asset" ? { text: "portrait, cowboy shot", structured: false } : perspectiveMode === "static" ? { text: "medium shot, eye level, straight-on, deep focus", structured: true } : perspectiveMode === "creative" && cleanString2(creativeConcept?.camera) ? { text: cleanString2(creativeConcept?.camera), structured: false } : assembleStructuredCamera(perspectiveMode === "dynamic" ? dynamicCamera.value : shot.camera);
  const environment = scene.environment || {};
  const location = structuredSnippets(environment.location, 1);
  const timeWeather = structuredSnippets(environment.timeWeather, 1);
  const lightingMood = config2.supplement ? structuredSnippets(environment.lightingMood, compactDynamic ? 1 : 3) : [];
  const backgroundElements = config2.supplement || perspectiveMode === "static" ? structuredSnippets(environment.backgroundElements, compactDynamic ? 3 : 5) : [];
  const legacyPlace = location.length === 0 ? stripOrReplaceNames(cleanString2(scene.place), replacements, true) : "";
  const environmentSection = perspectiveMode === "asset" ? "white background, simple background" : [
    ...location.map((value) => stripOrReplaceNames(value, replacements, false)),
    legacyPlace,
    ...timeWeather.map((value) => stripOrReplaceNames(value, replacements, false)),
    ...lightingMood.map((value) => stripOrReplaceNames(value, replacements, false)),
    ...backgroundElements.map((value) => stripOrReplaceNames(value, replacements, false))
  ].filter(Boolean).join(", ");
  return { sections: [
    stripOrReplaceNames(perspectiveMode === "asset" ? assetSituation(shot.situation, characters[0]) : bindingCreative ? identitySafeCreativeSituation(shot.situation) : compactDynamic && !hybridDynamic ? unique(csvParts(shot.situation)).join(", ") : hybridDynamic || perspectiveMode === "static" ? normalizedSituation(shot.situation, characters.length) : unique(csvParts(shot.situation)).join(", "), replacements, true),
    compactDynamic ? stripOrReplaceNames(camera.text, replacements, true) : "",
    compactDynamic ? dynamicShotPlan.text : "",
    perspectiveMode === "creative" && characters.length === 0 ? conceptScope : "",
    unboundCreativeCues,
    ...characterSections,
    !compactDynamic && config2.supplement && perspectiveMode !== "static" && perspectiveMode !== "asset" && !bindingCreative ? filteredSharedText : "",
    !compactDynamic && perspectiveMode !== "static" && perspectiveMode !== "asset" && !bindingCreative ? sharedAction : "",
    bindingCreative ? "" : environmentSection,
    compactDynamic ? "" : stripOrReplaceNames(camera.text, replacements, true)
  ].map((section) => section.trim()).filter(Boolean) };
}
function assembleDefaultPrompt(scene, shot, config2, replacements, perspectiveMode, creativeConcept) {
  const allCharacters = cleanArray(shot.characters).slice(0, perspectiveMode === "asset" ? 1 : config2.maxCharacters);
  const bindingCreative = perspectiveMode === "creative" && Boolean(creativeConcept);
  const characters = bindingCreative ? allCharacters.slice(0, 1) : allCharacters;
  const selectedScope = perspectiveMode === "creative" ? sanitizeComposition(cleanString2(creativeConcept?.renderScope), replacements) : "";
  const creativeScopes = perspectiveMode === "creative" ? selectedScope ? [selectedScope] : unique(characters.map((character) => sanitizeComposition(cleanString2(character.renderScope), replacements)).filter(Boolean)) : [];
  const characterBlocks = characters.map((character, index) => {
    const conceptTags = perspectiveMode === "creative" && index === 0 ? stripOrReplaceNames(unique(csvParts(creativeConcept?.visibleCues)).join(", "), replacements, true) : "";
    const block = conceptTags || assembleCharacterBlock(character, config2, replacements, true, perspectiveMode);
    return perspectiveMode === "asset" ? unique(csvParts(block, "looking at viewer")).join(", ") : block;
  }).filter(Boolean);
  const supplement = config2.supplement && !(perspectiveMode === "creative" && creativeScopes.length > 0) ? normalizeSupplement(stripOrReplaceNames(cleanString2(shot.supplement), replacements, false)) : "";
  const tagSections = dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(perspectiveMode === "asset" ? "portrait, cowboy shot" : perspectiveMode === "creative" && cleanString2(creativeConcept?.camera) ? creativeConcept?.camera : shot.camera, perspectiveMode === "asset" ? assetSituation(shot.situation, characters[0]) : bindingCreative ? identitySafeCreativeSituation(shot.situation) : shot.situation, perspectiveMode === "creative" && creativeScopes.length > 0 ? "" : shot.action)).join(", "), replacements, true),
    perspectiveMode === "asset" ? "white background, simple background" : bindingCreative ? "" : stripOrReplaceNames(unique(csvParts(scene.place)).join(", "), replacements, true),
    ...creativeScopes,
    ...characterBlocks
  ]);
  return { sections: [...tagSections, supplement].filter(Boolean), format: "legacy" };
}
function assemblePrompt(scene, shot, config2, parserParagraph, originalParagraph, creativeConcept, evaluationOptions) {
  const characters = cleanArray(shot.characters);
  const replacements = buildNameReplacementMap(characters);
  const perspective = resolveShotPerspective(shot, config2);
  const core2 = config2.promptStyle === "anima" ? assembleAnimaPrompt(scene, shot, config2, replacements, perspective.mode, creativeConcept, evaluationOptions?.dynamicLayout || "hybrid") : assembleDefaultPrompt(scene, shot, config2, replacements, perspective.mode, creativeConcept);
  const preset = activePromptPreset(config2);
  const presetPrefix = stripOrReplaceNames(preset?.positivePrefix || "", replacements, true);
  const prefix = stripOrReplaceNames(config2.customPositivePrefix, replacements, true);
  const suffix = stripOrReplaceNames(config2.customPositiveSuffix, replacements, true);
  const prefixes = [presetPrefix, prefix].filter(Boolean);
  const format = core2.format || "ordered";
  const corePrompt = { sections: [...core2.sections], format };
  const shotNegative = stripOrReplaceNames(unique(csvParts(shot.negative)).join(", "), replacements, true);
  return {
    prompt: {
      sections: [...prefixes, ...core2.sections, suffix].map((section) => section.trim()).filter(Boolean),
      format
    },
    corePrompt,
    shotNegative,
    negative: format === "ordered" ? normalizePromptSection(stripOrReplaceNames(unique(csvParts(preset?.negativePrefix, config2.customNegative, shotNegative)).join(", "), replacements, true)) : stripOrReplaceNames(unique(csvParts(preset?.negativePrefix, config2.customNegative, shotNegative)).join(", "), replacements, true),
    placement: "paragraph",
    paragraph: originalParagraph,
    parserParagraph,
    perspectiveMode: perspective.mode,
    perspectiveSource: perspective.source,
    creativeConcept: perspective.mode === "creative" ? creativeConcept : undefined
  };
}
function compilePrompt(resolved, config2, options) {
  const plan = resolved.plan;
  const shot = {
    paragraph: resolved.paragraph,
    perspectiveMode: plan.mode === "asset" ? "dynamic" : plan.mode,
    camera: resolved.cameraText || resolved.camera,
    ...plan.mode === "dynamic" ? {
      shotPlan: {
        ...plan.primaryAction ? { primaryAction: plan.primaryAction } : {},
        ...plan.secondaryCue ? { secondaryCue: plan.secondaryCue } : {},
        ...plan.staging ? { staging: plan.staging } : {}
      }
    } : {},
    situation: resolved.situation,
    action: resolved.action,
    characters: resolved.characters.map((character) => ({
      name: character.name,
      label: character.label,
      age: character.age,
      identity: character.identity,
      appearance: character.appearance,
      avatarAppearance: character.avatarAppearance,
      body: character.body,
      avatarBody: character.avatarBody,
      attire: character.attire,
      avatarAttire: character.avatarAttire,
      attireInferred: character.attireInferred,
      ...character.sources ? { sources: character.sources } : {},
      expression: character.expression,
      action: character.action,
      composition: character.composition,
      renderScope: character.renderScope,
      visibleTags: character.visibleTags.join(", ")
    })),
    sharedComposition: resolved.sharedComposition,
    supplement: resolved.supplement,
    negative: resolved.negative
  };
  const scene = {
    place: resolved.place,
    environment: resolved.environment,
    shots: [shot]
  };
  const concept = plan.mode === "creative" ? plan.concept : undefined;
  return assemblePrompt(scene, shot, config2, resolved.paragraph, resolved.paragraph, concept, options ? { dynamicLayout: options.dynamicLayout } : undefined);
}

// src/backend/logging.ts
function logStage(config2, stage, details, level = "info") {
  if (!config2?.debugLogging && level !== "error")
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
  const terminalParagraph = parseParagraphNumber(payload.terminalState?.paragraph);
  const terminalState = terminalParagraph && payload.terminalState ? { ...payload.terminalState, paragraph: terminalParagraph } : payload.terminalState;
  return {
    ...payload,
    ...terminalState ? { terminalState } : {},
    scenes
  };
}
function dedupeCharacters(characters) {
  if (!Array.isArray(characters))
    return characters;
  const seen = new Set;
  return characters.filter((character) => {
    const name = cleanString2(character.name).toLowerCase();
    const key = `${name}\x00${normalizedVisualValue(character)}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function dedupeExactShotCharacters(payload) {
  const terminalState = payload.terminalState && Array.isArray(payload.terminalState.characters) ? { ...payload.terminalState, characters: dedupeCharacters(payload.terminalState.characters) } : payload.terminalState;
  const cover = payload.cover && Array.isArray(payload.cover.characters) ? { ...payload.cover, characters: dedupeCharacters(payload.cover.characters) } : payload.cover;
  return {
    ...payload,
    ...cover ? { cover } : {},
    ...terminalState ? { terminalState } : {},
    scenes: cleanArray(payload.scenes).map((scene) => {
      const next = { ...scene };
      if (Array.isArray(scene.characters))
        next.characters = dedupeCharacters(scene.characters);
      if (Array.isArray(scene.shots)) {
        next.shots = scene.shots.map((shot) => Array.isArray(shot.characters) ? { ...shot, characters: dedupeCharacters(shot.characters) } : { ...shot });
      }
      return next;
    })
  };
}
function normalizeCompositionTerm(value, key = "") {
  if (typeof value === "string") {
    const viewpointSafe = value.replace(/\bcamera\b/gi, "viewer");
    return key === "gaze" && /\b(?:eyes?\s+closed|closed\s+eyes?)\b/i.test(viewpointSafe) ? "" : viewpointSafe;
  }
  if (Array.isArray(value))
    return value.map((entry) => normalizeCompositionTerm(entry, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, normalizeCompositionTerm(child, childKey)]));
  }
  return value;
}
function normalizeAtomicCompositionTerms(payload) {
  const normalizeCharacters = (characters) => Array.isArray(characters) ? characters.map((character) => ({
    ...character,
    ...character.composition === undefined ? {} : { composition: normalizeCompositionTerm(character.composition) }
  })) : characters;
  const cover = payload.cover ? {
    ...payload.cover,
    ...Array.isArray(payload.cover.characters) ? { characters: normalizeCharacters(payload.cover.characters) } : {}
  } : payload.cover;
  return {
    ...payload,
    ...cover ? { cover } : {},
    scenes: cleanArray(payload.scenes).map((scene) => ({
      ...scene,
      ...Array.isArray(scene.characters) ? { characters: normalizeCharacters(scene.characters) } : {},
      ...Array.isArray(scene.shots) ? {
        shots: scene.shots.map((shot) => ({
          ...shot,
          ...Array.isArray(shot.characters) ? { characters: normalizeCharacters(shot.characters) } : {}
        }))
      } : {}
    }))
  };
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
    shotPlan: normalizedVisualValue(entry.shot.shotPlan),
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
function selectCoverPromptEntry(payload, paragraphs, config2) {
  if (!config2.coverImageEnabled || !payload.cover || paragraphs.length === 0)
    return null;
  const source = paragraphs[0];
  const cover = payload.cover;
  const coverConfig = {
    ...config2,
    adaptiveMode: true,
    perspectiveMode: "dynamic"
  };
  const entry = assemblePrompt(cover, { ...cover, perspectiveMode: "dynamic" }, coverConfig, source.parserIndex, source.originalIndex);
  return renderPrompt(entry.prompt, config2.promptSyntax) ? { ...entry, placement: "cover", perspectiveSource: "manual" } : null;
}
function selectShotDecisions(payload, paragraphs, config2, creativeConcepts = new Map, creativeCandidates = []) {
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
  const selected = uniqueParagraphs.slice(0, config2.maxImages).map((entry, modelPriority) => ({ entry, modelPriority })).sort((left, right) => left.entry.parserParagraph - right.entry.parserParagraph || left.modelPriority - right.modelPriority).map(({ entry }) => entry);
  const maxAdaptiveCreative = selected.length > 1 ? Math.ceil(selected.length / 2) : 1;
  const safeCreativeConcepts = new Map([...creativeConcepts].filter(([, concept]) => isIdentitySafeCreativeConcept(concept)));
  const adaptiveCreativeAllowed = new Set(config2.adaptiveMode ? selected.filter((entry) => cleanString2(entry.shot.perspectiveMode).toLowerCase() === "creative" && safeCreativeConcepts.has(entry.parserParagraph)).sort((left, right) => (safeCreativeConcepts.get(right.parserParagraph)?.score || 0) - (safeCreativeConcepts.get(left.parserParagraph)?.score || 0)).slice(0, maxAdaptiveCreative) : []);
  const decisions = [];
  for (const entry of selected) {
    const paragraph = paragraphMap.get(entry.parserParagraph);
    if (!paragraph)
      continue;
    const concept = safeCreativeConcepts.get(entry.parserParagraph);
    const requestedPerspective = cleanString2(entry.shot.perspectiveMode).toLowerCase();
    const shot = config2.adaptiveMode && !config2.fastMode && requestedPerspective === "creative" && (!concept || !adaptiveCreativeAllowed.has(entry)) ? { ...entry.shot, perspectiveMode: "dynamic" } : entry.shot;
    const perspective = resolveShotPerspective(shot, config2);
    decisions.push({
      scene: entry.scene,
      shot,
      parserParagraph: entry.parserParagraph,
      paragraph: paragraph.originalIndex,
      perspectiveMode: perspective.mode,
      perspectiveSource: perspective.source,
      ...perspective.mode === "creative" && concept ? { creativeConcept: concept } : {},
      creativeCandidates: creativeCandidates.filter((candidate) => candidate.paragraph === entry.parserParagraph)
    });
  }
  logStage(config2, "illustration_candidates_selected", {
    candidateCount: normalized.length,
    validCandidateCount: valid.length,
    distinctCandidateCount: distinct.length,
    uniqueParagraphCandidateCount: uniqueParagraphs.length,
    selectedCount: decisions.length,
    selectedParagraphs: decisions.map((entry) => entry.parserParagraph),
    perspectives: decisions.map((entry) => ({ mode: entry.perspectiveMode, source: entry.perspectiveSource })),
    cameraTags: selected.map((entry) => normalizedVisualValue(entry.shot.camera))
  });
  return decisions;
}
function selectPromptEntries(payload, paragraphs, config2, creativeConcepts = new Map, creativeCandidates = []) {
  return selectShotDecisions(payload, paragraphs, config2, creativeConcepts, creativeCandidates).map((decision) => {
    const prompt = assemblePrompt(decision.scene, decision.shot, config2, decision.parserParagraph, decision.paragraph, decision.creativeConcept);
    prompt.creativeCandidates = decision.creativeCandidates;
    return prompt;
  }).filter((entry) => Boolean(renderPrompt(entry.prompt, config2.promptSyntax)));
}

// src/backend/visual-state.ts
var PLACEHOLDER_TERM = /\b(?:unknown|unspecified|not specified|not stated|unmentioned|undetermined|n\/?a|default clothing)\b/i;
function cleanTagField(value) {
  return unique(csvParts(value).map((tag) => cleanString2(tag)).filter((tag) => tag && !PLACEHOLDER_TERM.test(tag))).join(", ");
}
function cleanAtomicField(value) {
  const cleaned = cleanString2(value);
  return cleaned && !PLACEHOLDER_TERM.test(cleaned) ? cleaned : "";
}
function cleanAtomicList(value) {
  return unique(cleanArray(Array.isArray(value) ? value : value === undefined ? [] : [value]).flatMap((entry) => csvParts(entry)).map((entry) => cleanString2(entry)).filter((entry) => entry && !PLACEHOLDER_TERM.test(entry)));
}
function inferred(value) {
  return value === true || cleanString2(value).toLowerCase() === "true";
}
function changeSet(value, allowed) {
  const permitted = new Set(allowed);
  return new Set(cleanArray(Array.isArray(value) ? value : value === undefined ? [] : [value]).flatMap((entry) => csvParts(entry)).map((entry) => cleanString2(entry)).filter((entry) => permitted.has(entry)));
}
function cleanEnvironment(value) {
  return {
    location: cleanAtomicField(value?.location),
    timeWeather: cleanAtomicField(value?.timeWeather),
    lightingMood: cleanAtomicList(value?.lightingMood),
    backgroundElements: cleanAtomicList(value?.backgroundElements)
  };
}
function mergeEnvironment(current, previous, changed = new Set) {
  if (!previous)
    return current;
  const canonicalLocation = (value) => cleanAtomicField(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const currentLocation = canonicalLocation(current.location);
  const previousLocation = canonicalLocation(previous.location);
  const locationBoundary = changed.has("location") || Boolean(currentLocation && previousLocation && currentLocation !== previousLocation);
  if (locationBoundary) {
    changed.add("location");
    changed.add("timeWeather");
    changed.add("lightingMood");
    changed.add("backgroundElements");
  }
  const select = (key, currentValue, previousValue) => {
    const hasCurrent = Array.isArray(currentValue) ? currentValue.length > 0 : Boolean(currentValue);
    const hasPrevious = Array.isArray(previousValue) ? previousValue.length > 0 : Boolean(previousValue);
    if (locationBoundary && (key === "timeWeather" || key === "lightingMood" || key === "backgroundElements")) {
      return currentValue;
    }
    if (changed.has(key))
      return hasCurrent ? currentValue : previousValue;
    return hasPrevious ? previousValue : currentValue;
  };
  return {
    location: select("location", current.location, cleanAtomicField(previous.location)),
    timeWeather: select("timeWeather", current.timeWeather, cleanAtomicField(previous.timeWeather)),
    lightingMood: select("lightingMood", current.lightingMood, cleanAtomicList(previous.lightingMood)),
    backgroundElements: select("backgroundElements", current.backgroundElements, cleanAtomicList(previous.backgroundElements))
  };
}
function visualCharacter(character) {
  const name = normalizeCharacterName(character.name);
  if (!name)
    return null;
  return {
    name,
    label: cleanTagField(character.label),
    age: cleanTagField(character.age),
    appearance: cleanTagField(unique(csvParts(character.identity, character.appearance)).join(", ")),
    body: cleanTagField(character.body),
    attire: cleanTagField(character.attire),
    attireInferred: inferred(character.attireInferred),
    ...character.sources ? { sources: { ...character.sources } } : {}
  };
}
function inheritCharacter(raw, previousCharacters, explicitCurrentWins = false) {
  const current = visualCharacter(raw);
  const name = current?.name || normalizeCharacterName(raw.name);
  const previous = name ? previousCharacters.get(name.toLowerCase()) : undefined;
  const currentAttire = cleanTagField(raw.attire);
  const changes = changeSet(raw.visualChanges, ["age", "appearance", "body", "attire"]);
  const stableField = (key, currentValue, previousValue = "") => {
    if (!previousValue)
      return currentValue;
    if (explicitCurrentWins && currentValue)
      return currentValue;
    if (changes.has(key))
      return currentValue || previousValue;
    return previousValue;
  };
  const next = {
    ...raw,
    label: previous?.label || cleanTagField(raw.label),
    age: stableField("age", cleanTagField(raw.age), previous?.age),
    appearance: stableField("appearance", cleanTagField(raw.appearance), previous?.appearance),
    body: stableField("body", cleanTagField(raw.body), previous?.body),
    attire: stableField("attire", currentAttire, previous?.attire),
    attireInferred: !previous ? inferred(raw.attireInferred) : (explicitCurrentWins || changes.has("attire")) && currentAttire ? inferred(raw.attireInferred) : previous.attireInferred,
    sources: {
      age: previous && !changes.has("age") ? previous.sources?.age ?? "previous_memory" : raw.sources?.age,
      appearance: previous && !changes.has("appearance") ? previous.sources?.appearance ?? "previous_memory" : raw.sources?.appearance,
      body: previous && !changes.has("body") ? previous.sources?.body ?? "previous_memory" : raw.sources?.body,
      attire: previous && !changes.has("attire") ? previous.sources?.attire ?? "previous_memory" : raw.sources?.attire
    }
  };
  const remembered = visualCharacter(next);
  if (remembered)
    previousCharacters.set(remembered.name.toLowerCase(), remembered);
  return next;
}
function inheritShot(raw, previousCharacters) {
  return {
    ...raw,
    characters: cleanArray(raw.characters).map((character) => inheritCharacter(character, previousCharacters))
  };
}
function applyPreviousVisualState(payload, previous) {
  const previousCharacters = new Map(cleanArray(previous?.characters).map((character) => [normalizeCharacterName(character.name).toLowerCase(), character]).filter(([name]) => Boolean(name)));
  let carriedEnvironment = previous ? cleanEnvironment(previous.environment) : undefined;
  let carriedPlace = previous ? cleanAtomicField(previous.place) : "";
  const scenes = cleanArray(payload.scenes).map((rawScene) => {
    const environmentChanges = changeSet(rawScene.environmentChanges, ["location", "timeWeather", "lightingMood", "backgroundElements", "place"]);
    const environment = mergeEnvironment(cleanEnvironment(rawScene.environment), carriedEnvironment, environmentChanges);
    carriedEnvironment = environment;
    const currentPlace = cleanTagField(rawScene.place);
    const placeChanged = environmentChanges.has("place") || Boolean(currentPlace && carriedPlace && currentPlace.toLowerCase() !== carriedPlace.toLowerCase());
    const place = placeChanged ? currentPlace || carriedPlace : carriedPlace || currentPlace;
    carriedPlace = place;
    const shots = cleanArray(rawScene.shots);
    if (shots.length > 0) {
      return {
        ...rawScene,
        place,
        environment,
        shots: shots.map((shot) => inheritShot(shot, previousCharacters))
      };
    }
    return {
      ...inheritShot(rawScene, previousCharacters),
      place,
      environment
    };
  });
  const rawTerminal = payload.terminalState;
  if (!rawTerminal || typeof rawTerminal !== "object" || Array.isArray(rawTerminal))
    return { ...payload, scenes };
  const terminalChanges = changeSet(rawTerminal.environmentChanges, ["location", "timeWeather", "lightingMood", "backgroundElements", "place"]);
  const terminalEnvironment = mergeEnvironment(cleanEnvironment(rawTerminal.environment), previous ? cleanEnvironment(previous.environment) : undefined, terminalChanges);
  const terminalPlaceCurrent = cleanTagField(rawTerminal.place);
  const previousPlace = previous ? cleanAtomicField(previous.place) : "";
  const terminalPlaceChanged = terminalChanges.has("place") || Boolean(terminalPlaceCurrent && previousPlace && terminalPlaceCurrent.toLowerCase() !== previousPlace.toLowerCase());
  const terminalPlace = terminalPlaceChanged ? terminalPlaceCurrent || previousPlace : previousPlace || terminalPlaceCurrent;
  const terminalCharacters = new Map(cleanArray(previous?.characters).map((character) => [normalizeCharacterName(character.name).toLowerCase(), character]).filter(([name]) => Boolean(name)));
  return {
    ...payload,
    scenes,
    terminalState: {
      ...rawTerminal,
      place: terminalPlace,
      environment: terminalEnvironment,
      characters: cleanArray(rawTerminal.characters).map((character) => inheritCharacter(character, terminalCharacters, true))
    }
  };
}
function buildPreviousVisualState(payload, selectedParserParagraphs) {
  const terminal = payload.terminalState;
  if (terminal && typeof terminal === "object" && !Array.isArray(terminal)) {
    const characters2 = cleanArray(terminal.characters).map(visualCharacter).filter((character) => Boolean(character));
    const environment2 = cleanEnvironment(terminal.environment);
    const place2 = cleanTagField(terminal.place);
    const hasEnvironment2 = Boolean(environment2.location || environment2.timeWeather || environment2.lightingMood.length || environment2.backgroundElements.length || place2);
    if (characters2.length > 0 || hasEnvironment2) {
      return {
        characters: characters2,
        environment: environment2,
        place: place2,
        updatedAt: new Date().toISOString()
      };
    }
  }
  const selected = new Set(selectedParserParagraphs);
  const ordered = normalizeScenePayload(payload).filter((entry) => selected.size === 0 || selected.has(entry.parserParagraph)).sort((left, right) => left.parserParagraph - right.parserParagraph);
  if (ordered.length === 0)
    return null;
  const characters = new Map;
  let environment = cleanEnvironment(undefined);
  let place = "";
  for (const entry of ordered) {
    environment = cleanEnvironment(entry.scene.environment);
    place = cleanTagField(entry.scene.place);
    for (const character of cleanArray(entry.shot.characters)) {
      const visual = visualCharacter(character);
      if (visual)
        characters.set(visual.name.toLowerCase(), visual);
    }
  }
  const hasEnvironment = Boolean(environment.location || environment.timeWeather || environment.lightingMood.length || environment.backgroundElements.length || place);
  if (characters.size === 0 && !hasEnvironment)
    return null;
  return {
    characters: [...characters.values()],
    environment,
    place,
    updatedAt: new Date().toISOString()
  };
}
function formatPreviousVisualState(previous) {
  const reference = {
    characters: cleanArray(previous.characters).map((character) => ({
      name: normalizeCharacterName(character.name),
      label: cleanTagField(character.label),
      age: cleanTagField(character.age),
      appearance: cleanTagField(character.appearance),
      body: cleanTagField(character.body),
      attire: cleanTagField(character.attire),
      attireInferred: character.attireInferred === true,
      ...character.sources ? { sources: character.sources } : {}
    })).filter((character) => character.name),
    environment: cleanEnvironment(previous.environment),
    place: cleanTagField(previous.place)
  };
  return compactBlock([
    "## Previous Visual State",
    "This is the terminal narrative state of the immediately previous processed response, not a new narrative source. For unchanged returning character baseline fields, leave the raw value empty and leave its change marker absent; the backend injects the exact stored value after parsing. Copy unchanged environment values explicitly because scene validation occurs before inheritance. Output a full new value and its change marker when the current numbered source explicitly replaces it. Current source changes always win. Never copy camera, pose, action, or expression from prior state.",
    JSON.stringify(reference)
  ].join(`
`), 5000);
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
async function loadParserContextSources(chatId, config2, userId, options = {}) {
  const diagnostics = {};
  if (config2.fastMode) {
    const needsChat2 = config2.includeCharacterInfo && options.fastBootstrapCharacter === true;
    let chat2 = null;
    let character2 = null;
    if (needsChat2) {
      try {
        chat2 = asRecord(await spindle.chats.get(chatId, userId));
        if (config2.includeCharacterInfo && chat2?.character_id) {
          character2 = asRecord(await spindle.characters.get(String(chat2.character_id), userId));
        }
      } catch (error51) {
        diagnostics.characterInfoError = error51 instanceof Error ? error51.message : String(error51);
      }
      diagnostics.fastBootstrapCharacter = true;
    } else {
      diagnostics.fastBootstrapCharacter = false;
    }
    diagnostics.fastMode = true;
    return { chat: chat2, persona: null, character: character2, diagnostics };
  }
  const needsChat = config2.includeCharacterInfo || config2.includeLorebook || config2.userInstructionsEnabled;
  const needsPersona = config2.includeUserInfo || config2.userInstructionsEnabled;
  const [chatResult, personaResult] = await Promise.allSettled([
    needsChat ? spindle.chats.get(chatId, userId) : Promise.resolve(null),
    needsPersona ? spindle.personas.getActive(userId) : Promise.resolve(null)
  ]);
  const chat = chatResult.status === "fulfilled" && chatResult.value ? asRecord(chatResult.value) : null;
  const persona = personaResult.status === "fulfilled" && personaResult.value ? asRecord(personaResult.value) : null;
  if (chatResult.status === "rejected")
    diagnostics.chatLookupError = chatResult.reason instanceof Error ? chatResult.reason.message : String(chatResult.reason);
  if (personaResult.status === "rejected")
    diagnostics.userInfoError = personaResult.reason instanceof Error ? personaResult.reason.message : String(personaResult.reason);
  let character = null;
  if (config2.includeCharacterInfo && chat?.character_id) {
    try {
      character = asRecord(await spindle.characters.get(String(chat.character_id), userId));
    } catch (error51) {
      diagnostics.characterInfoError = error51 instanceof Error ? error51.message : String(error51);
    }
  }
  return { chat, persona, character, diagnostics };
}
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
async function buildLorebookContextSnapshot(chatId, target, config2, userId) {
  if (!config2.includeLorebook)
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
  } catch (error51) {
    return {
      ...EMPTY_LOREBOOK_CONTEXT,
      diagnostics: { lorebookEntries: 0, lorebookError: error51 instanceof Error ? error51.message : String(error51) }
    };
  }
}
function formatRecentContext(messages, targetIndex, includeCount) {
  const previous = [];
  const limit = includeCount > 0 ? includeCount : 2;
  for (let index = Math.min(targetIndex, messages.length) - 1;index >= 0 && previous.length < limit; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant" || isOwnMessage(message))
      continue;
    const content = stripInlayContent(message.content);
    if (content.trim())
      previous.unshift({ ...message, content });
  }
  const selected = includeCount > 0 ? previous.slice(-includeCount) : previous.length === 1 ? previous : [];
  return compactBlock(selected.map((message) => `${message.role}: ${message.content}`).join(`

`), 8000);
}
function includeCountForAttempt(config2, attempt) {
  if (config2.includeMaxMessages <= config2.includeMinMessages)
    return config2.includeMinMessages;
  if (config2.parserRetries <= 0)
    return config2.includeMinMessages;
  const step = Math.ceil((config2.includeMaxMessages - config2.includeMinMessages) / config2.parserRetries);
  return Math.min(config2.includeMaxMessages, config2.includeMinMessages + step * attempt);
}
async function buildParserContext(chatId, messages, targetIndex, cache, config2, attempt, userId, lorebookSnapshot, previousVisualState, preparedSources) {
  const blocks = [];
  const preprocessingBlocks = [];
  const overrides = [];
  const diagnostics = { attempt, includeCount: includeCountForAttempt(config2, attempt) };
  const sources = preparedSources || await loadParserContextSources(chatId, config2, userId);
  const chat = sources.chat;
  Object.assign(diagnostics, sources.diagnostics);
  const pushBlock = (block, includeInPreprocessing = true) => {
    if (!block)
      return;
    blocks.push(block);
    if (includeInPreprocessing)
      preprocessingBlocks.push(block);
  };
  if (chat)
    overrides.push(...collectExtraInstructionStrings(chat.metadata));
  if (config2.includeUserInfo || config2.userInstructionsEnabled) {
    if (sources.persona) {
      const record2 = sources.persona;
      const block = config2.includeUserInfo ? formatInfoBlock("{{user}} Info", [
        namedField("Name", record2.name),
        namedField("Title", record2.title),
        namedField("Description", record2.description)
      ]) : "";
      pushBlock(block);
      overrides.push(...collectExtraInstructionStrings(record2.metadata));
      diagnostics.userInfo = Boolean(block);
    }
  }
  if (config2.includeCharacterInfo && chat?.character_id) {
    if (sources.character) {
      const record2 = sources.character;
      const block = formatInfoBlock("{{char}} Info", [
        namedField("Name", record2.name),
        namedField("Description", record2.description),
        namedField("Personality", record2.personality),
        namedField("Scenario", record2.scenario),
        namedField("Creator notes", record2.creator_notes),
        namedField("System prompt", record2.system_prompt),
        namedField("Post-history instructions", record2.post_history_instructions),
        Array.isArray(record2.tags) && record2.tags.length ? `Tags: ${record2.tags.join(", ")}` : ""
      ], 6000);
      pushBlock(block);
      overrides.push(...collectExtraInstructionStrings(record2.extensions));
      diagnostics.characterInfo = Boolean(block);
    }
  }
  if (config2.includeLorebook && !config2.fastMode) {
    const target = messages[targetIndex]?.content || "";
    const snapshot = lorebookSnapshot || await buildLorebookContextSnapshot(chatId, target, config2, userId);
    const block = attempt === 0 ? snapshot.compact : snapshot.full;
    pushBlock(block, false);
    Object.assign(diagnostics, snapshot.diagnostics, { lorebookMode: attempt === 0 ? "compact" : "full" });
  }
  if (config2.characterTagContextEnabled) {
    const characterReference = buildCharacterTagReference(cache);
    if (characterReference) {
      pushBlock(`${characterReference}
Use these as a baseline for returning characters (including their base attire). The current message always wins over this reference.`);
    }
    diagnostics.cacheCharacters = Object.keys(cache).length;
  }
  if (config2.previousVisualStateEnabled && previousVisualState) {
    const visualStateReference = formatPreviousVisualState(previousVisualState);
    pushBlock(visualStateReference);
    diagnostics.previousVisualState = Boolean(visualStateReference);
  }
  if (config2.userInstructionsEnabled)
    overrides.unshift(config2.customParserInstructions);
  return {
    systemContext: blocks.filter(Boolean).join(`

`),
    preprocessingSystemContext: preprocessingBlocks.filter(Boolean).join(`

`),
    recentContext: config2.fastMode ? "" : formatRecentContext(messages, targetIndex, includeCountForAttempt(config2, attempt)),
    override: unique(overrides.map((value) => cleanString2(value)).filter(Boolean)).join(`

`),
    diagnostics
  };
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
var PLACEHOLDER_TERM2 = /\b(?:unknown|unspecified|not specified|not stated|unmentioned|undetermined|n\/?a)\b/i;
function sanitizeMemoryTags(tags) {
  return normalizeReferenceTags(csvParts(tags).filter((tag) => {
    const normalized = tag.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!normalized)
      return false;
    if (PLACEHOLDER_TERM2.test(normalized))
      return false;
    if (TRANSIENT_ATTIRE_MEMORY_TERMS.some((term) => normalized === term || normalized.includes(term)))
      return false;
    return !VOLATILE_MEMORY_TERMS.some((term) => normalized === term || normalized.includes(term));
  }).join(", "));
}
function baselineCharacterTags(character) {
  const attireInferred = character.attireInferred === true || String(character.attireInferred).toLowerCase() === "true";
  const sources = character.sources && typeof character.sources === "object" ? character.sources : undefined;
  const durable = (field, value) => {
    if (!sources)
      return field === "attire" && attireInferred ? "" : value;
    const source = sources[field];
    return source === "card_explicit" || source === "previous_memory" ? value : "";
  };
  const label = sources ? "" : character.label;
  return sanitizeMemoryTags(unique(csvParts(label, durable("age", character.age), sources ? "" : character.identity, durable("appearance", character.appearance), durable("body", character.body), durable("attire", character.attire))).join(", "));
}
function hasTransientProvenance(character) {
  const sources = character.sources;
  if (!sources || typeof sources !== "object")
    return false;
  const values = [
    ["age", character.age],
    ["appearance", character.appearance],
    ["body", character.body],
    ["attire", character.attire]
  ];
  return values.some(([field, value]) => {
    if (!String(value ?? "").trim())
      return false;
    const source = sources[field];
    return source !== "card_explicit" && source !== "previous_memory";
  });
}
function matchingKey(map2, name) {
  if (!map2)
    return;
  return Object.keys(map2).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
}
function updateCache(cache, payload, manualCharacterAppearance) {
  for (const { shot } of normalizeScenePayload(payload)) {
    for (const character of cleanArray(shot.characters)) {
      const name = normalizeCharacterName(character.name);
      if (!name)
        continue;
      const manualKey = matchingKey(manualCharacterAppearance, name);
      if (manualKey) {
        const cacheKey2 = matchingKey(cache, name);
        if (cacheKey2 && cacheKey2 !== manualKey)
          delete cache[cacheKey2];
        cache[manualKey] = manualCharacterAppearance[manualKey];
        continue;
      }
      const cacheKey = matchingKey(cache, name);
      if (cacheKey && hasTransientProvenance(character))
        continue;
      const tags = baselineCharacterTags(character);
      if (!tags)
        continue;
      if (cacheKey && cacheKey !== name)
        delete cache[cacheKey];
      cache[name] = tags;
    }
  }
}
function updateCharacterMemory(state, payload) {
  updateCache(state.characterAppearance, payload, state.manualCharacterAppearance);
}
function invalidatePreviousVisualCharacters(state, names) {
  if (!state.previousVisualState || names.length === 0)
    return;
  const targets = new Set(names.map((name) => normalizeCharacterName(name).toLowerCase()).filter(Boolean));
  state.previousVisualState.characters = cleanArray(state.previousVisualState.characters).filter((character) => !targets.has(normalizeCharacterName(character.name).toLowerCase()));
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
  const manual = state.manualCharacterAppearance || {};
  const manualSourceKey = previous ? matchingKey(manual, previous) : undefined;
  const manualDestinationKey = matchingKey(manual, name);
  if (manualSourceKey && manualSourceKey !== name)
    delete manual[manualSourceKey];
  if (manualDestinationKey && manualDestinationKey !== name)
    delete manual[manualDestinationKey];
  manual[name] = tags;
  state.manualCharacterAppearance = manual;
  invalidatePreviousVisualCharacters(state, [previous, name]);
}
function deleteCharacterTag(state, name) {
  const target = normalizeCharacterName(name);
  if (!target)
    return;
  const key = Object.keys(state.characterAppearance).find((candidate) => candidate.toLowerCase() === target.toLowerCase()) || target;
  delete state.characterAppearance[key];
  const manualKey = matchingKey(state.manualCharacterAppearance, target);
  if (manualKey)
    delete state.manualCharacterAppearance[manualKey];
  if (state.manualCharacterAppearance && Object.keys(state.manualCharacterAppearance).length === 0) {
    delete state.manualCharacterAppearance;
  }
  invalidatePreviousVisualCharacters(state, [target]);
}

// src/backend/generated-record.ts
var SLOT_STATUSES = new Set([
  "pending",
  "generating",
  "completed",
  "failed",
  "cancelled"
]);
var GENERATION_STATUSES = new Set(["pending", "completed", "failed", "cancelled"]);
var PERSPECTIVE_MODES = new Set(["creative", "static", "dynamic", "asset"]);
function isObject2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasString(value, key) {
  return typeof value[key] === "string";
}
function isSlotStatus(value) {
  return typeof value === "string" && SLOT_STATUSES.has(value);
}
function inferredStatus(_imageId, imageUrl) {
  return imageUrl ? "completed" : "pending";
}
function isReferenceSlot(value) {
  return isObject2(value) && Number.isInteger(value.paragraph) && Number(value.paragraph) >= 0 && typeof value.imageId === "string" && typeof value.imageUrl === "string" && (value.status === undefined || isSlotStatus(value.status));
}
function isCreativeConcept(value) {
  return isObject2(value) && typeof value.id === "string" && Number.isInteger(value.paragraph) && typeof value.anchor === "string" && typeof value.concept === "string" && typeof value.renderScope === "string" && typeof value.camera === "string" && Array.isArray(value.visibleCues) && value.visibleCues.every((cue) => typeof cue === "string") && Number.isFinite(value.score);
}
function normalizeLegacyCreativeConcept(value, paragraph) {
  if (value === null)
    return null;
  if (isCreativeConcept(value))
    return value;
  if (!isObject2(value) || typeof value.anchor !== "string" || typeof value.concept !== "string")
    return;
  const subjectTypes = new Set(["object", "environment", "shadow", "silhouette", "reflection", "fragment", "spatial"]);
  const subjectType = typeof value.subjectType === "string" && subjectTypes.has(value.subjectType) ? value.subjectType : undefined;
  return {
    id: typeof value.id === "string" && value.id ? value.id : `legacy-concept-p${paragraph}`,
    paragraph: Number.isInteger(value.paragraph) ? Number(value.paragraph) : paragraph,
    ...subjectType ? { subjectType } : {},
    anchor: value.anchor,
    concept: value.concept,
    renderScope: typeof value.renderScope === "string" ? value.renderScope : "",
    camera: typeof value.camera === "string" ? value.camera : "",
    visibleCues: Array.isArray(value.visibleCues) ? value.visibleCues.filter((cue) => typeof cue === "string") : [],
    score: Number.isFinite(value.score) ? Number(value.score) : 0
  };
}
function isRecordSlot(value) {
  if (!isObject2(value) || !isReferenceSlot(value))
    return false;
  const candidate = value;
  return typeof candidate.prompt === "string" && typeof candidate.negativePrompt === "string" && typeof candidate.perspectiveMode === "string" && PERSPECTIVE_MODES.has(candidate.perspectiveMode) && (candidate.perspectiveSource === "adaptive" || candidate.perspectiveSource === "manual") && (candidate.placement === "cover" || candidate.placement === "paragraph") && isSlotStatus(candidate.status) && (candidate.imageParameters === undefined || isObject2(candidate.imageParameters)) && (candidate.corePrompt === undefined || typeof candidate.corePrompt === "string") && (candidate.shotNegative === undefined || typeof candidate.shotNegative === "string") && (candidate.promptFormat === undefined || candidate.promptFormat === "legacy" || candidate.promptFormat === "ordered") && (candidate.creativeConcept === undefined || candidate.creativeConcept === null || isCreativeConcept(candidate.creativeConcept)) && (candidate.creativeConceptCandidates === undefined || Array.isArray(candidate.creativeConceptCandidates) && candidate.creativeConceptCandidates.every(isCreativeConcept)) && (candidate.creativeConceptHistory === undefined || Array.isArray(candidate.creativeConceptHistory) && candidate.creativeConceptHistory.every((id) => typeof id === "string")) && (candidate.error === undefined || typeof candidate.error === "string");
}
function isGeneratedRecordV3(value) {
  if (!isObject2(value) || value.schemaVersion !== 3 || !Array.isArray(value.slots))
    return false;
  return hasString(value, "chatId") && hasString(value, "messageId") && Number.isInteger(value.swipeId) && hasString(value, "createdAt") && isObject2(value.rawJson) && (value.operationId === undefined || typeof value.operationId === "string") && (value.generationStatus === undefined || typeof value.generationStatus === "string" && GENERATION_STATUSES.has(value.generationStatus)) && (value.sourceFingerprint === undefined || typeof value.sourceFingerprint === "string") && (value.illustrationPlan === undefined || IllustrationPlanSchema.safeParse(value.illustrationPlan).success) && value.slots.every(isRecordSlot);
}
function isGeneratedRecordReferenceV3(value) {
  if (!isObject2(value) || value.storageVersion !== 3 || !Array.isArray(value.slots))
    return false;
  return hasString(value, "recordPath") && hasString(value, "chatId") && hasString(value, "messageId") && Number.isInteger(value.swipeId) && hasString(value, "createdAt") && (value.operationId === undefined || typeof value.operationId === "string") && (value.generationStatus === undefined || typeof value.generationStatus === "string" && GENERATION_STATUSES.has(value.generationStatus)) && value.slots.every(isReferenceSlot);
}
function legacyReference(value) {
  return value.storageVersion === 2 && hasString(value, "recordPath") && hasString(value, "chatId") && hasString(value, "messageId") && Number.isFinite(value.swipeId) && hasString(value, "createdAt") && Array.isArray(value.paragraphs) && value.paragraphs.every(Number.isFinite) && Array.isArray(value.imageIds) && value.imageIds.every((item) => typeof item === "string") && Array.isArray(value.imageUrls) && value.imageUrls.every((item) => typeof item === "string");
}
function legacyRecord(value) {
  const validArray = (key, predicate) => Array.isArray(value[key]) && value[key].every(predicate);
  const validOptionalArray = (key, predicate) => value[key] === undefined || validArray(key, predicate);
  const isString = (item) => typeof item === "string";
  return hasString(value, "chatId") && hasString(value, "messageId") && Number.isFinite(value.swipeId) && hasString(value, "createdAt") && isObject2(value.rawJson) && validArray("prompts", isString) && validOptionalArray("negativePrompts", isString) && validOptionalArray("perspectiveModes", (item) => ["creative", "static", "dynamic", "asset"].includes(String(item))) && validOptionalArray("perspectiveSources", (item) => item === "adaptive" || item === "manual") && validArray("paragraphs", Number.isFinite) && validArray("imageIds", isString) && validArray("imageUrls", isString) && validOptionalArray("imageParameters", isObject2) && validOptionalArray("corePrompts", isString) && validOptionalArray("shotNegatives", isString) && validOptionalArray("promptFormats", (item) => item === "legacy" || item === "ordered") && validOptionalArray("creativeConcepts", (item) => item === null || isObject2(item)) && validOptionalArray("creativeConceptCandidates", (item) => Array.isArray(item) && item.every(isObject2)) && validOptionalArray("creativeConceptHistory", (item) => Array.isArray(item) && item.every(isString)) && validOptionalArray("placements", (item) => item === "cover" || item === "paragraph") && validOptionalArray("slotStatuses", isSlotStatus) && validOptionalArray("slotErrors", isString);
}
function sameLength(length, ...arrays) {
  return arrays.every((array2) => array2.length === length);
}
function copyOptional(target, key, value) {
  if (value !== undefined)
    target[key] = value;
}
function toGeneratedRecordV3(value) {
  if (isGeneratedRecordV3(value)) {
    return { ...value, slots: value.slots.map((slot) => ({ ...slot })) };
  }
  if (!isObject2(value) || !legacyRecord(value))
    return null;
  const slotCount = value.prompts.length;
  const alignedArrays = [value.paragraphs, value.imageIds, value.imageUrls];
  for (const array2 of [value.negativePrompts, value.perspectiveModes, value.perspectiveSources]) {
    if (array2 !== undefined)
      alignedArrays.push(array2);
  }
  if (!sameLength(slotCount, ...alignedArrays))
    return null;
  const optionalArrays = [
    value.imageParameters,
    value.corePrompts,
    value.shotNegatives,
    value.promptFormats,
    value.creativeConcepts,
    value.creativeConceptCandidates,
    value.creativeConceptHistory,
    value.placements,
    value.slotStatuses,
    value.slotErrors
  ];
  if (optionalArrays.some((array2) => array2 !== undefined && (!Array.isArray(array2) || array2.length !== slotCount))) {
    return null;
  }
  const slots = value.prompts.map((prompt, index) => {
    const imageId = value.imageIds[index];
    const imageUrl = value.imageUrls[index];
    const slot = {
      prompt,
      negativePrompt: value.negativePrompts?.[index] ?? "",
      perspectiveMode: value.perspectiveModes?.[index] ?? "dynamic",
      perspectiveSource: value.perspectiveSources?.[index] ?? "manual",
      paragraph: value.paragraphs[index],
      imageId,
      imageUrl,
      placement: value.placements?.[index] ?? "paragraph",
      status: value.slotStatuses?.[index] ?? inferredStatus(imageId, imageUrl)
    };
    copyOptional(slot, "imageParameters", value.imageParameters?.[index]);
    copyOptional(slot, "corePrompt", value.corePrompts?.[index]);
    copyOptional(slot, "shotNegative", value.shotNegatives?.[index]);
    copyOptional(slot, "promptFormat", value.promptFormats?.[index]);
    copyOptional(slot, "creativeConcept", normalizeLegacyCreativeConcept(value.creativeConcepts?.[index], slot.paragraph));
    const candidates = value.creativeConceptCandidates?.[index]?.map((candidate) => normalizeLegacyCreativeConcept(candidate, slot.paragraph)).filter((candidate) => candidate !== undefined && candidate !== null);
    copyOptional(slot, "creativeConceptCandidates", candidates);
    copyOptional(slot, "creativeConceptHistory", value.creativeConceptHistory?.[index]);
    const error51 = value.slotErrors?.[index];
    if (error51)
      slot.error = error51;
    return slot;
  });
  const migrated = {
    schemaVersion: 3,
    chatId: value.chatId,
    messageId: value.messageId,
    swipeId: value.swipeId,
    slots,
    operationId: value.operationId,
    generationStatus: value.generationStatus,
    sourceFingerprint: value.sourceFingerprint,
    rawJson: value.rawJson,
    createdAt: value.createdAt
  };
  return isGeneratedRecordV3(migrated) ? migrated : null;
}
function toGeneratedRecordReferenceV3(value) {
  if (isGeneratedRecordReferenceV3(value)) {
    return { ...value, slots: value.slots.map((slot) => ({ ...slot })) };
  }
  if (!isObject2(value) || !legacyReference(value))
    return null;
  const slotCount = value.paragraphs.length;
  if (!sameLength(slotCount, value.imageIds, value.imageUrls))
    return null;
  const migrated = {
    storageVersion: 3,
    recordPath: value.recordPath,
    chatId: value.chatId,
    messageId: value.messageId,
    swipeId: value.swipeId,
    slots: value.paragraphs.map((paragraph, index) => {
      const imageId = value.imageIds[index];
      const imageUrl = value.imageUrls[index];
      return { paragraph, imageId, imageUrl, status: inferredStatus(imageId, imageUrl) };
    }),
    createdAt: value.createdAt,
    operationId: value.operationId,
    generationStatus: value.generationStatus
  };
  return isGeneratedRecordReferenceV3(migrated) ? migrated : null;
}
function adaptGeneratedRecord(value) {
  return toGeneratedRecordReferenceV3(value) ?? toGeneratedRecordV3(value);
}

// src/backend/storage.ts
var stateUpdateQueues = new Map;
var configUpdateQueues = new Map;
async function readJson(path, fallback, userId) {
  try {
    if (typeof spindle.userStorage.getJson === "function") {
      const value2 = await spindle.userStorage.getJson(path, { fallback, userId });
      return value2 && typeof value2 === "object" && fallback && typeof fallback === "object" ? { ...fallback, ...value2 } : value2 ?? fallback;
    }
    if (!await spindle.userStorage.exists(path, userId))
      return fallback;
    const text = await spindle.userStorage.read(path, userId);
    const value = JSON.parse(text);
    return value && typeof value === "object" && fallback && typeof fallback === "object" ? { ...fallback, ...value } : value ?? fallback;
  } catch {
    return fallback;
  }
}
async function writeJson(path, value, userId) {
  if (typeof spindle.userStorage.setJson === "function") {
    await spindle.userStorage.setJson(path, value, { indent: 0, userId });
    return;
  }
  const slash = path.lastIndexOf("/");
  if (slash > 0)
    await spindle.userStorage.mkdir(path.slice(0, slash), userId).catch(() => {
      return;
    });
  await spindle.userStorage.write(path, JSON.stringify(value), userId);
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
  if (typeof spindle.userStorage.getJson === "function") {
    const value = await spindle.userStorage.getJson(path, { fallback, userId });
    return { ...fallback, ...value };
  }
  if (!await spindle.userStorage.exists(path, userId))
    return fallback;
  return { ...fallback, ...JSON.parse(await spindle.userStorage.read(path, userId)) };
}
function safePathPart(value) {
  return encodeURIComponent(value).replace(/%/g, "_");
}
function recordPath(chatId, key) {
  return `records/${safePathPart(chatId)}/${safePathPart(key)}.json`;
}
function workflowPath(hash2) {
  return `workflows/${hash2}.json`;
}
async function contentHash(value) {
  const bytes = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((entry) => entry.toString(16).padStart(2, "0")).join("");
  }
  let left = 2166136261;
  let right = 2246822519;
  for (const byte of bytes) {
    left = Math.imul(left ^ byte, 16777619);
    right = Math.imul(right ^ byte, 3266489917);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}
var WORKFLOW_REFERENCE_KEY = "__inlayIllustratorWorkflowRef";
var storedWorkflowWrites = new Map;
async function ensureWorkflowStored(hash2, workflow, userId) {
  const cacheKey = JSON.stringify([userId ?? null, hash2]);
  const existing = storedWorkflowWrites.get(cacheKey);
  if (existing)
    return existing;
  const operation = (async () => {
    const path = workflowPath(hash2);
    if (!await spindle.userStorage.exists(path, userId))
      await writeJson(path, workflow, userId);
  })();
  if (storedWorkflowWrites.size >= 64) {
    const oldest = storedWorkflowWrites.keys().next().value;
    if (typeof oldest === "string")
      storedWorkflowWrites.delete(oldest);
  }
  storedWorkflowWrites.set(cacheKey, operation);
  try {
    await operation;
  } catch (error51) {
    if (storedWorkflowWrites.get(cacheKey) === operation)
      storedWorkflowWrites.delete(cacheKey);
    throw error51;
  }
}
async function compactParameters(parameters, userId) {
  const workflow = parameters.workflow;
  if (!workflow || typeof workflow !== "object")
    return parameters;
  if (!Array.isArray(workflow) && typeof workflow[WORKFLOW_REFERENCE_KEY] === "string") {
    return parameters;
  }
  const serialized = JSON.stringify(workflow);
  const hash2 = await contentHash(serialized);
  await ensureWorkflowStored(hash2, workflow, userId);
  const compact = { ...parameters };
  compact.workflow = { [WORKFLOW_REFERENCE_KEY]: hash2 };
  return compact;
}
async function hydrateParameters(parameters, userId) {
  const workflow = parameters.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow))
    return parameters;
  const hash2 = workflow[WORKFLOW_REFERENCE_KEY];
  if (typeof hash2 !== "string" || !hash2)
    return parameters;
  const hydrated = await readJson(workflowPath(hash2), {}, userId);
  if (Object.keys(hydrated).length === 0)
    throw new Error(`Stored ComfyUI workflow ${hash2} is unavailable.`);
  return { ...parameters, workflow: hydrated };
}
function isGeneratedRecordReference(value) {
  return toGeneratedRecordReferenceV3(value) !== null;
}
function generatedRecordReference(record2, path) {
  return {
    storageVersion: 3,
    recordPath: path,
    chatId: record2.chatId,
    messageId: record2.messageId,
    swipeId: record2.swipeId,
    slots: record2.slots.map((slot) => ({
      paragraph: slot.paragraph,
      imageId: slot.imageId,
      imageUrl: slot.imageUrl,
      status: slot.status
    })),
    createdAt: record2.createdAt,
    operationId: record2.operationId,
    generationStatus: record2.generationStatus
  };
}
async function storeGeneratedRecord(chatId, key, record2, userId) {
  const canonical = toGeneratedRecordV3(record2);
  if (!canonical)
    throw new Error("Cannot store an invalid or ragged generated record.");
  const path = recordPath(chatId, key);
  const slots = await Promise.all(canonical.slots.map(async (slot) => ({
    ...slot,
    ...slot.imageParameters ? { imageParameters: await compactParameters(slot.imageParameters, userId) } : {}
  })));
  await writeJson(path, { ...canonical, slots }, userId);
  return generatedRecordReference(canonical, path);
}
async function loadGeneratedRecord(value, userId, hydrateWorkflows = true) {
  let stored = value;
  if (isGeneratedRecordReference(value)) {
    stored = await readJson(value.recordPath, null, userId);
  }
  const record2 = toGeneratedRecordV3(stored);
  if (!record2)
    return null;
  if (!hydrateWorkflows)
    return record2;
  return {
    ...record2,
    slots: await Promise.all(record2.slots.map(async (slot) => ({
      ...slot,
      ...slot.imageParameters ? { imageParameters: await hydrateParameters(slot.imageParameters, userId) } : {}
    })))
  };
}
async function migrateLegacyGeneratedRecords(chatId, state, userId) {
  for (const [key, value] of Object.entries(state.generated)) {
    if (isGeneratedRecordReferenceV3(value))
      continue;
    const reference = toGeneratedRecordReferenceV3(value);
    if (reference) {
      state.generated[key] = reference;
      continue;
    }
    const record2 = toGeneratedRecordV3(value);
    if (record2)
      state.generated[key] = await storeGeneratedRecord(chatId, key, record2, userId);
  }
}
function rebuildGeneratedImageIndex(state) {
  const index = {};
  for (const [key, value] of Object.entries(state.generated)) {
    const adapted = adaptGeneratedRecord(value);
    if (!adapted)
      continue;
    adapted.slots.forEach((slot, imageIndex) => {
      if (slot.imageId)
        index[`id:${slot.imageId}`] = { key, index: imageIndex };
      if (slot.imageUrl)
        index[`url:${slot.imageUrl}`] = { key, index: imageIndex };
    });
  }
  state.generatedImageIndex = index;
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
  } catch (error51) {
    spindle.log.warn(`Parser connection list unavailable: ${error51 instanceof Error ? error51.message : String(error51)}`);
    return [];
  }
}
async function sendState(userId, chatId, preparedConfig) {
  const [state, config2, parserConnections] = await Promise.all([
    chatId ? getState(chatId, userId) : Promise.resolve(null),
    preparedConfig ? Promise.resolve(preparedConfig) : getConfig(userId),
    getParserConnections(userId)
  ]);
  spindle.sendToFrontend({
    type: "state",
    config: config2,
    parserConnections,
    chatId: chatId || "",
    characterAppearance: state?.characterAppearance || {},
    avatarVisualSupplements: state?.avatarVisualSupplements || {},
    avatarVisionAttempts: state?.avatarVisionAttempts || {}
  }, userId);
}

// src/backend/avatar-vision.ts
var MAX_CARD_CONTEXT = 7000;
var MAX_SUPPLEMENT_FIELD = 700;
var GENERIC_TAGS = new Set(["girl", "boy", "woman", "man", "1girl", "1boy", "solo", "character"]);
function avatarSupplementKey(characterId) {
  return characterId.trim();
}
function avatarVisionAttemptKey(characterId, imageId, provider, model) {
  return JSON.stringify([characterId, imageId, provider, model]);
}
function explicitBoolean(root, keys) {
  const record2 = asRecord(root);
  for (const key of keys) {
    if (typeof record2[key] === "boolean")
      return record2[key];
  }
  return null;
}
function declaredVisionSupport(metadata) {
  const record2 = asRecord(metadata);
  const direct = explicitBoolean(record2, ["vision", "supportsVision", "supports_vision", "multimodal", "supportsImages", "supports_images"]);
  if (direct !== null)
    return direct;
  const capabilities = asRecord(record2.capabilities);
  const nested = explicitBoolean(capabilities, ["vision", "image", "images", "multimodal"]);
  if (nested !== null)
    return nested;
  const modalities = [record2.input_modalities, record2.inputModalities, capabilities.input_modalities, capabilities.inputModalities].flatMap((value) => cleanArray(value).map((item) => cleanString2(item).toLowerCase()));
  if (modalities.includes("image") || modalities.includes("vision"))
    return true;
  if (modalities.length > 0 && modalities.every((value) => value === "text"))
    return false;
  return null;
}
function unsupportedVisionError(error51) {
  const message = (error51 instanceof Error ? error51.message : String(error51)).toLowerCase();
  return /(?:image|vision|multimodal).*(?:unsupported|not supported|not allowed|invalid)|(?:unsupported|invalid|does not support|doesn't support).*(?:image|vision|content.*array|input modality)|text[- ]only/.test(message);
}
function textParts(value) {
  if (typeof value === "string")
    return value;
  return cleanArray(value).map((part) => cleanString2(asRecord(part).text || asRecord(part).content)).filter(Boolean).join(`
`);
}
function resultText(result) {
  if (typeof result === "string")
    return result;
  const root = asRecord(result);
  for (const key of ["content", "text", "output", "message"]) {
    const text = textParts(root[key]);
    if (text)
      return text;
  }
  const choice = asRecord(cleanArray(root.choices)[0]);
  return textParts(asRecord(choice.message).content);
}
function jsonObject(text) {
  const stripped = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return asRecord(JSON.parse(stripped));
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start < 0 || end <= start)
      throw new Error("Avatar vision returned no JSON object.");
    return asRecord(JSON.parse(stripped.slice(start, end + 1)));
  }
}
function sanitizeVisionTags(value) {
  const clean = sanitizeMemoryTags(cleanString2(value));
  return unique(csvParts(clean).filter((tag) => {
    const normalized = tag.toLowerCase();
    if (GENERIC_TAGS.has(normalized))
      return false;
    return !/\b(?:smil(?:e|es|ing)|grin(?:s|ning)?|frown(?:s|ing)?|crying|blushing|standing|sitting|posing|looking at viewer)\b/.test(normalized);
  })).join(", ").slice(0, MAX_SUPPLEMENT_FIELD).replace(/,\s*$/, "");
}
function parseAvatarVisualSupplement(raw, identity, createdAt = new Date().toISOString()) {
  const parsed = jsonObject(raw);
  return {
    ...identity,
    appearance: sanitizeVisionTags(parsed.appearance),
    body: sanitizeVisionTags(parsed.body),
    attire: sanitizeVisionTags(parsed.attire),
    createdAt
  };
}
function cardContext(character, canonicalTags) {
  const rows = [
    `Name: ${cleanString2(character.name)}`,
    cleanString2(character.description) ? `Description: ${cleanString2(character.description)}` : "",
    cleanString2(character.personality) ? `Personality: ${cleanString2(character.personality)}` : "",
    cleanString2(character.scenario) ? `Scenario: ${cleanString2(character.scenario)}` : "",
    Array.isArray(character.tags) && character.tags.length ? `Card tags: ${character.tags.map(cleanString2).filter(Boolean).join(", ")}` : "",
    canonicalTags ? `Existing canonical visual tags: ${canonicalTags}` : ""
  ].filter(Boolean).join(`
`);
  return rows.slice(0, MAX_CARD_CONTEXT);
}
function visionInstruction(characterName, context) {
  return [
    "Inspect the supplied character profile picture against the supplied character-card text.",
    "The text is authoritative. Return only directly visible, stable visual details that complement details missing from the text and existing canonical tags.",
    "Never contradict or repeat an explicitly stated text attribute. Do not infer hidden anatomy, personality, ethnicity, age, or conventional species traits.",
    "Prioritize missing colors and stable shapes for hair, eyes, skin or fur, markings, species features, recurring accessories, and visible default clothing.",
    "Ignore expression, pose, gesture, camera, crop, background, lighting, art style, image quality, and temporary effects.",
    "For attire, if the card names a garment, add only missing visible properties of that garment; do not replace it with an unrelated portrait outfit. Add a new default garment only when the text establishes no attire.",
    "Use short comma-separated image-generation tags. If no safe complement exists for a field, return an empty string.",
    'Return exactly one JSON object: {"appearance":"...","body":"...","attire":"..."}.',
    `Character: ${characterName}`,
    "## Character Card",
    context
  ].join(`

`);
}
async function analyzeAvatar(character, canonicalTags, connection, config2, chatId, userId, signal) {
  const characterId = cleanString2(character.id);
  const imageId = cleanString2(character.image_id);
  const characterName = cleanString2(character.name);
  const model = config2.parserModel || connection.model;
  const avatar = await requestAvatarImage(imageId, chatId, userId, signal);
  const parameters = { ...config2.parserParameters };
  if (parameters.max_tokens === undefined && parameters.max_completion_tokens === undefined)
    parameters.max_tokens = 1000;
  if (parameters.temperature === undefined)
    parameters.temperature = 0;
  const result = await spindle.generate.raw({
    type: "raw",
    provider: connection.provider,
    model,
    connection_id: connection.id,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: visionInstruction(characterName, cardContext(character, canonicalTags)) },
        { type: "image", data: avatar.data, mime_type: avatar.mimeType }
      ]
    }],
    parameters,
    reasoning: { source: "off" },
    userId,
    signal
  });
  const raw = resultText(result);
  if (!raw)
    throw new Error("Avatar vision returned no output.");
  return parseAvatarVisualSupplement(raw, {
    characterId,
    imageId,
    characterName,
    provider: connection.provider,
    model
  });
}
function applyLocalAttempt(state, key, attempt, supplement) {
  state.avatarVisionAttempts ||= {};
  state.avatarVisionAttempts[key] = attempt;
  const supplementKey = avatarSupplementKey(attempt.characterId);
  const stale = state.avatarVisualSupplements?.[supplementKey];
  if (stale && stale.imageId !== attempt.imageId)
    delete state.avatarVisualSupplements?.[supplementKey];
  if (supplement) {
    state.avatarVisualSupplements ||= {};
    state.avatarVisualSupplements[supplementKey] = supplement;
  }
}
async function persistAttempt(chatId, key, attempt, supplement, userId) {
  await updateState(chatId, userId, (current) => applyLocalAttempt(current, key, attempt, supplement));
}
async function ensureAvatarVisualSupplement(input) {
  const character = input.character;
  if (!character)
    return null;
  const characterId = cleanString2(character.id);
  const imageId = cleanString2(character.image_id);
  const characterName = cleanString2(character.name);
  if (!characterId || !imageId || !characterName)
    return null;
  const supplementKey = avatarSupplementKey(characterId);
  const existing = input.state.avatarVisualSupplements?.[supplementKey];
  if (existing?.imageId === imageId)
    return existing;
  const model = input.config.parserModel || input.connection.model;
  const attemptKey = avatarVisionAttemptKey(characterId, imageId, input.connection.provider, model);
  const previousAttempt = input.state.avatarVisionAttempts?.[attemptKey];
  if (previousAttempt) {
    applyLocalAttempt(input.state, attemptKey, previousAttempt);
    try {
      await persistAttempt(input.chatId, attemptKey, previousAttempt, undefined, input.userId);
    } catch {}
    return null;
  }
  if (declaredVisionSupport(input.connection.metadata) === false) {
    const attempt = {
      characterId,
      imageId,
      provider: input.connection.provider,
      model,
      status: "unsupported",
      attemptedAt: new Date().toISOString()
    };
    applyLocalAttempt(input.state, attemptKey, attempt);
    try {
      await persistAttempt(input.chatId, attemptKey, attempt, undefined, input.userId);
    } catch {}
    return null;
  }
  const canonicalKey = Object.keys(input.canonicalTags).find((name) => normalizeCharacterName(name).toLowerCase() === normalizeCharacterName(characterName).toLowerCase());
  const canonicalTags = canonicalKey ? input.canonicalTags[canonicalKey] : "";
  try {
    logStage(input.config, "avatar_vision_start", { characterId, imageId, provider: input.connection.provider, model });
    const supplement = await analyzeAvatar(character, canonicalTags, input.connection, input.config, input.chatId, input.userId, input.signal);
    const attempt = {
      characterId,
      imageId,
      provider: input.connection.provider,
      model,
      status: "completed",
      attemptedAt: supplement.createdAt
    };
    applyLocalAttempt(input.state, attemptKey, attempt, supplement);
    try {
      await persistAttempt(input.chatId, attemptKey, attempt, supplement, input.userId);
    } catch {}
    logStage(input.config, "avatar_vision_done", {
      characterId,
      appearanceTags: csvParts(supplement.appearance).length,
      bodyTags: csvParts(supplement.body).length,
      attireTags: csvParts(supplement.attire).length
    });
    return supplement;
  } catch (error51) {
    if (input.signal?.aborted)
      throw error51;
    const status = unsupportedVisionError(error51) ? "unsupported" : "failed";
    const attempt = {
      characterId,
      imageId,
      provider: input.connection.provider,
      model,
      status,
      attemptedAt: new Date().toISOString()
    };
    applyLocalAttempt(input.state, attemptKey, attempt);
    try {
      await persistAttempt(input.chatId, attemptKey, attempt, undefined, input.userId);
    } catch {}
    logStage(input.config, "avatar_vision_skipped", {
      characterId,
      status,
      error: error51 instanceof Error ? error51.message : String(error51)
    }, "warn");
    return null;
  }
}
function changed(character, field) {
  const changes = cleanArray(character.visualChanges).map((value) => cleanString2(value).toLowerCase());
  return changes.includes(field) || character.sources?.[field] === "narrative_explicit";
}
function applyAvatarVisualSupplements(payload, supplements) {
  const profiles = Object.values(supplements || {});
  if (profiles.length === 0)
    return payload;
  for (const { shot } of normalizeScenePayload(payload)) {
    for (const character of cleanArray(shot.characters)) {
      const name = normalizeCharacterName(cleanString2(character.name)).toLowerCase();
      const profile = profiles.find((candidate) => normalizeCharacterName(candidate.characterName).toLowerCase() === name);
      if (!profile)
        continue;
      if (!changed(character, "appearance"))
        character.avatarAppearance = profile.appearance;
      if (!changed(character, "body"))
        character.avatarBody = profile.body;
      const attireSource = character.sources?.attire;
      const attireWins = cleanString2(character.attire) && attireSource !== "card_explicit";
      if (!changed(character, "attire") && !attireWins)
        character.avatarAttire = profile.attire;
    }
  }
  return payload;
}

// src/backend/plan-adapter.ts
var EMPTY_CONTINUITY = {
  characters: [],
  environment: { location: "", timeWeather: "", lightingMood: [], backgroundElements: [] },
  place: ""
};
function planFromParsedPayload(payload, previousState, paragraphs, config2, conceptSelections = new Map, selectedEntries) {
  const validParagraphs = new Set(paragraphs.map((paragraph) => paragraph.parserIndex));
  const selectedByParagraph = selectedEntries ? new Map(selectedEntries.filter((entry) => entry.placement !== "cover").map((entry) => [entry.parserParagraph, entry])) : null;
  const seenParagraphs = new Set;
  const normalized = normalizeScenePayload(payload).filter((entry) => validParagraphs.has(entry.parserParagraph) && (!selectedByParagraph || selectedByParagraph.has(entry.parserParagraph))).filter((entry) => {
    if (seenParagraphs.has(entry.parserParagraph))
      return false;
    seenParagraphs.add(entry.parserParagraph);
    return true;
  }).sort((left, right) => left.parserParagraph - right.parserParagraph);
  const initialContinuity = ContinuityStateSchema.parse(previousState || EMPTY_CONTINUITY);
  let current = initialContinuity;
  const deltas = [];
  for (const { scene, shot, parserParagraph } of normalized) {
    const snapshot = stateWithShotSnapshot(current, scene, shot);
    const delta = continuityDeltaBetween(current, snapshot, parserParagraph, "before_shot");
    if (delta) {
      deltas.push(delta);
      current = applyContinuityDelta(current, delta);
    }
  }
  const finalSelectedParagraph = normalized.at(-1)?.parserParagraph || 1;
  const terminalParagraph = Math.max(finalSelectedParagraph, positiveParagraph(payload.terminalState?.paragraph) || finalSelectedParagraph);
  const terminalSnapshot = terminalStateFromPayload(payload.terminalState, current);
  const terminalDelta = continuityDeltaBetween(current, terminalSnapshot, terminalParagraph, "after_shot");
  if (terminalDelta)
    deltas.push(terminalDelta);
  const shots = normalized.map(({ scene, shot, parserParagraph }) => {
    const selection = selectedByParagraph?.get(parserParagraph);
    const perspective = selection ? { mode: selection.perspectiveMode, source: selection.perspectiveSource } : resolveShotPerspective(shot, config2);
    const concept = selection?.creativeConcept || conceptSelections.get(parserParagraph);
    const degradedFromCreative = perspective.mode === "dynamic" && cleanString2(shot.perspectiveMode).toLowerCase() === "creative" && !concept;
    const plan = shotPlanFor(shot, perspective.mode, concept, degradedFromCreative);
    const sharedComposition = sharedCompositionInput(shot);
    return PlannedShotSchema.parse({
      paragraph: parserParagraph,
      plan,
      camera: cameraInput(shot.camera),
      ...typeof shot.camera === "string" && cleanString2(shot.camera) ? { cameraText: cleanString2(shot.camera) } : {},
      ...cleanString2(shot.situation) ? { situation: cleanString2(shot.situation) } : {},
      ...cleanString2(shot.action) ? { action: cleanString2(shot.action) } : {},
      ...cleanArray(shot.characters).length > 0 ? { characters: cleanArray(shot.characters).map((character) => plannedCharacter(character)).filter((character) => character !== null) } : {},
      ...sharedComposition ? { sharedComposition } : {},
      ...cleanString2(shot.supplement) ? { supplement: cleanString2(shot.supplement) } : {},
      ...cleanString2(shot.negative) ? { negative: cleanString2(shot.negative) } : {},
      ...cleanString2(scene.place) ? { place: cleanString2(scene.place) } : {}
    });
  });
  return IllustrationInputSchema.parse({
    initialContinuity,
    shots,
    deltas
  });
}
function positiveParagraph(value) {
  const match = cleanString2(String(value ?? "")).match(/\d+/);
  const parsed = match ? Number(match[0]) : 0;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
function environmentState(value) {
  const environment = asRecord(value);
  return {
    location: cleanString2(environment.location),
    timeWeather: cleanString2(environment.timeWeather),
    lightingMood: cleanArray(environment.lightingMood).map(cleanString2).filter(Boolean),
    backgroundElements: cleanArray(environment.backgroundElements).map(cleanString2).filter(Boolean)
  };
}
function continuityCharacter(character) {
  const name = cleanString2(character.name);
  if (!name)
    return null;
  const attireInferred = character.attireInferred === true || cleanString2(character.attireInferred).toLowerCase() === "true";
  return {
    name,
    label: cleanString2(character.label),
    age: cleanString2(character.age),
    appearance: unique(csvParts(character.identity, character.appearance)).join(", "),
    body: cleanString2(character.body),
    attire: cleanString2(character.attire),
    attireInferred,
    ...character.sources ? { sources: { ...character.sources } } : {}
  };
}
function stateWithShotSnapshot(current, scene, shot) {
  const characters = current.characters.map((character) => ({
    ...character,
    ...character.sources ? { sources: { ...character.sources } } : {}
  }));
  for (const raw of cleanArray(shot.characters)) {
    const snapshot = continuityCharacter(raw);
    if (!snapshot)
      continue;
    const index = characters.findIndex((character) => character.name.toLowerCase() === snapshot.name.toLowerCase());
    if (index < 0)
      characters.push(snapshot);
    else
      characters[index] = { ...characters[index], ...snapshot };
  }
  return ContinuityStateSchema.parse({
    ...current,
    characters,
    environment: environmentState(scene.environment),
    place: cleanString2(scene.place)
  });
}
function terminalStateFromPayload(terminal, fallback) {
  if (!terminal || typeof terminal !== "object" || Array.isArray(terminal))
    return fallback;
  const characters = cleanArray(terminal.characters).map(continuityCharacter).filter((character) => character !== null);
  const environment = environmentState(terminal.environment);
  const place = cleanString2(terminal.place);
  const hasSnapshot = characters.length > 0 || place || environment.location || environment.timeWeather || environment.lightingMood.length > 0 || environment.backgroundElements.length > 0;
  return hasSnapshot ? ContinuityStateSchema.parse({ ...fallback, characters, environment, place }) : fallback;
}
function shotPlanFor(shot, mode, concept, degradedFromCreative = false) {
  if (mode === "static")
    return { mode: "static" };
  if (mode === "asset")
    return { mode: "asset" };
  if (mode === "creative") {
    return concept ? { mode: "creative", concept: {
      id: concept.id,
      paragraph: concept.paragraph,
      subjectType: concept.subjectType || "object",
      anchor: concept.anchor,
      concept: concept.concept,
      renderScope: concept.renderScope,
      camera: concept.camera,
      visibleCues: concept.visibleCues,
      score: concept.score
    } } : { mode: "creative" };
  }
  const plan = asRecord(shot.shotPlan);
  const primaryAction = cleanString2(plan.primaryAction) || (typeof shot.shotPlan === "string" ? cleanString2(shot.shotPlan) : "") || cleanString2(shot.action) || (cleanArray(shot.characters).map((character) => asRecord(character.composition).actions).flatMap((actions) => cleanArray(actions)).map(cleanString2).find(Boolean) || "");
  return {
    mode: "dynamic",
    ...primaryAction ? { primaryAction } : {},
    ...!primaryAction && degradedFromCreative ? { degradedFromCreative: true } : {},
    ...cleanString2(plan.secondaryCue) ? { secondaryCue: cleanString2(plan.secondaryCue) } : {},
    ...cleanString2(plan.staging) ? { staging: cleanString2(plan.staging) } : {}
  };
}
function cameraInput(camera) {
  const record2 = asRecord(camera);
  if (Object.keys(record2).length === 0) {
    const view = cameraViewOf(camera);
    return { framing: view.framing, angle: view.angle, perspective: view.perspective, focus: [] };
  }
  return {
    ...cleanString2(record2.framing) ? { framing: cleanString2(record2.framing) } : {},
    ...cleanString2(record2.angle) ? { angle: cleanString2(record2.angle) } : {},
    ...cleanString2(record2.perspective) ? { perspective: cleanString2(record2.perspective) } : {},
    ...Array.isArray(record2.focus) ? { focus: cleanArray(record2.focus).map(cleanString2) } : cleanString2(record2.focus) ? { focus: csvParts(record2.focus) } : {}
  };
}
function plannedCharacter(character) {
  const name = cleanString2(character.name);
  if (!name)
    return null;
  const composition = asRecord(character.composition);
  return {
    name,
    ...cleanString2(character.identity) ? { identity: cleanString2(character.identity) } : {},
    ...cleanString2(character.avatarAppearance) ? { avatarAppearance: cleanString2(character.avatarAppearance) } : {},
    ...cleanString2(character.avatarBody) ? { avatarBody: cleanString2(character.avatarBody) } : {},
    ...cleanString2(character.avatarAttire) ? { avatarAttire: cleanString2(character.avatarAttire) } : {},
    ...cleanString2(character.expression) ? { expression: cleanString2(character.expression) } : {},
    ...cleanString2(character.action) ? { action: cleanString2(character.action) } : {},
    ...Object.keys(composition).length > 0 ? {
      composition: {
        position: cleanString2(composition.position),
        pose: cleanString2(composition.pose),
        actions: Array.isArray(composition.actions) ? cleanArray(composition.actions).map(cleanString2) : cleanString2(composition.actions) ? csvParts(composition.actions) : [],
        gaze: cleanString2(composition.gaze)
      }
    } : {},
    ...cleanString2(character.renderScope) ? { renderScope: cleanString2(character.renderScope) } : {},
    ...cleanArray(character.visibleTags).length > 0 || cleanString2(character.visibleTags) ? { visibleTags: cleanArray(character.visibleTags).map(cleanString2).length > 0 ? cleanArray(character.visibleTags).map(cleanString2) : csvParts(character.visibleTags) } : {}
  };
}
function sharedCompositionInput(shot) {
  const record2 = asRecord(shot.sharedComposition);
  if (Object.keys(record2).length === 0 && typeof shot.sharedComposition !== "string")
    return null;
  const interaction = Array.isArray(record2.interaction) ? cleanArray(record2.interaction).map(cleanString2) : cleanString2(record2.interaction) ? csvParts(record2.interaction) : [];
  const spatialRelation = cleanString2(record2.spatialRelation);
  return { interaction, spatialRelation };
}

// src/backend/canonical-planning.ts
function compileDecisions(payload, previousState, paragraphs, config2, conceptSelections, decisions) {
  const plan = resolveIllustrationPlan(planFromParsedPayload(payload, previousState, paragraphs, config2, conceptSelections, decisions));
  const resolvedByParagraph = new Map(plan.shots.map((shot) => [shot.paragraph, shot]));
  const selected = decisions.map((decision) => {
    const resolved = resolvedByParagraph.get(decision.parserParagraph);
    if (!resolved)
      throw new Error(`Canonical plan omitted selected paragraph P${decision.parserParagraph}.`);
    return {
      ...compilePrompt(resolved, config2),
      placement: "paragraph",
      paragraph: decision.paragraph,
      parserParagraph: decision.parserParagraph,
      creativeCandidates: decision.creativeCandidates
    };
  });
  return { plan, selected, decisions };
}
function planAndCompilePrompts(payload, previousState, paragraphs, config2, conceptSelections = new Map, creativeCandidates = []) {
  let decisions = selectShotDecisions(payload, paragraphs, config2, conceptSelections, creativeCandidates);
  if (!config2.adaptiveMode && config2.perspectiveMode === "creative" && conceptSelections.size > 0) {
    decisions = decisions.filter((decision) => Boolean(decision.creativeConcept));
  }
  let compiled = compileDecisions(payload, previousState, paragraphs, config2, conceptSelections, decisions);
  const usable = compiled.selected.map((entry) => Boolean(renderPrompt(entry.prompt, config2.promptSyntax)));
  if (usable.every(Boolean))
    return compiled;
  decisions = decisions.filter((_decision, index) => usable[index]);
  compiled = compileDecisions(payload, previousState, paragraphs, config2, conceptSelections, decisions);
  return compiled;
}

// src/backend/operation-manager.ts
function operationKey(userId, chatId, messageId) {
  return JSON.stringify([userId ?? null, chatId, messageId]);
}
function chatKey(userId, chatId) {
  return JSON.stringify([userId ?? null, chatId]);
}
function randomOperationId() {
  if (globalThis.crypto?.randomUUID)
    return globalThis.crypto.randomUUID();
  return `inlay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

class GenerationOperationQueue {
  operations = new Map;
  chatTails = new Map;
  enqueue(userId, chatId, messageId, task, dedupeId = messageId) {
    const key = operationKey(userId, chatId, dedupeId);
    const existing = this.operations.get(key);
    if (existing)
      return { ...existing, reused: true };
    const operation = {
      id: randomOperationId(),
      userId,
      chatId,
      messageId,
      controller: new AbortController,
      stage: "queued",
      completed: 0,
      total: 0
    };
    const queueKey = chatKey(userId, chatId);
    const previous = this.chatTails.get(queueKey) || Promise.resolve();
    const execution = previous.then(() => task(operation), () => task(operation));
    const tail = execution.then(() => {
      return;
    }, () => {
      return;
    });
    const scheduled = { operation, promise: execution, reused: false };
    this.operations.set(key, scheduled);
    this.chatTails.set(queueKey, tail);
    tail.finally(() => {
      if (this.operations.get(key)?.promise === execution)
        this.operations.delete(key);
      if (this.chatTails.get(queueKey) === tail)
        this.chatTails.delete(queueKey);
    });
    return scheduled;
  }
  cancelChat(userId, chatId, operationId) {
    const cancelled = [];
    for (const scheduled of this.operations.values()) {
      const operation = scheduled.operation;
      if (operation.userId !== userId || operation.chatId !== chatId)
        continue;
      if (operationId && operation.id !== operationId)
        continue;
      if (!operation.controller.signal.aborted)
        operation.controller.abort("Cancelled by user");
      cancelled.push(operation.id);
    }
    return cancelled;
  }
}
var REGISTRY_KEY = Symbol.for("inlay-illustrator.generation-operations");
var globalRegistry2 = globalThis;
function sharedQueue() {
  const existing = globalRegistry2[REGISTRY_KEY];
  if (existing?.queue && typeof existing.queue.enqueue === "function" && typeof existing.queue.cancelChat === "function") {
    return existing.queue;
  }
  const created = { queue: new GenerationOperationQueue };
  globalRegistry2[REGISTRY_KEY] = created;
  return created.queue;
}
function enqueueGeneration(userId, chatId, messageId, task, dedupeId) {
  return sharedQueue().enqueue(userId, chatId, messageId, task, dedupeId);
}
function cancelChatGenerations(userId, chatId, operationId) {
  return sharedQueue().cancelChat(userId, chatId, operationId);
}
function abortError(message = "Generation cancelled.") {
  const error51 = new Error(message);
  error51.name = "AbortError";
  return error51;
}
function throwIfAborted(signal) {
  if (signal?.aborted)
    throw abortError(typeof signal.reason === "string" ? signal.reason : undefined);
}
function isAbortError(error51, signal) {
  return Boolean(signal?.aborted || error51 instanceof Error && error51.name === "AbortError");
}

// src/backend/images.ts
var imageConnectionCache = new Map;
function cacheImageConnection(key, connection) {
  if (imageConnectionCache.size >= 32) {
    const oldest = imageConnectionCache.keys().next().value;
    if (typeof oldest === "string")
      imageConnectionCache.delete(oldest);
  }
  imageConnectionCache.set(key, { expiresAt: Date.now() + 5000, connection });
}
async function resolveImageConnection(config2, userId) {
  logStage(config2, "image_connection_resolve_start", { configuredConnectionId: config2.imageConnectionId });
  const cacheKey = JSON.stringify([userId ?? null, config2.imageConnectionId || "(default)"]);
  const cached2 = imageConnectionCache.get(cacheKey);
  if (cached2 && cached2.expiresAt > Date.now())
    return cached2.connection;
  if (config2.imageConnectionId) {
    const configured = await spindle.imageGen.getConnection(config2.imageConnectionId, userId);
    if (configured) {
      logStage(config2, "image_connection_resolved", {
        id: configured.id,
        name: configured.name,
        provider: configured.provider,
        model: configured.model,
        source: "configured"
      });
      cacheImageConnection(cacheKey, configured);
      return configured;
    }
    logStage(config2, "image_connection_missing", { configuredConnectionId: config2.imageConnectionId }, "warn");
  }
  const connections = await spindle.imageGen.listConnections(userId);
  const fallback = connections.find((connection) => connection.is_default) || connections[0] || null;
  logStage(config2, "image_connection_resolved", fallback ? {
    id: fallback.id,
    name: fallback.name,
    provider: fallback.provider,
    model: fallback.model,
    source: fallback.is_default ? "default" : "first_available"
  } : { source: "none", availableConnections: 0 }, fallback ? "info" : "warn");
  cacheImageConnection(cacheKey, fallback);
  return fallback;
}
function readComfyConfig(metadata) {
  if (!metadata || typeof metadata !== "object")
    return null;
  const comfy = metadata.comfyui;
  if (!comfy || typeof comfy !== "object")
    return null;
  const config2 = comfy;
  const workflow = config2.workflow_api_json || config2.workflow_json;
  if (!workflow || typeof workflow !== "object" || !Array.isArray(config2.field_mappings))
    return null;
  return config2;
}
function numberParam(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
function stringParam(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function patchComfyWorkflow(workflow, mappings, values) {
  const source = workflow;
  const patched = { ...source };
  const clonedNodes = new Set;
  for (const mapping of mappings) {
    const originalNode = source[mapping.nodeId];
    if (originalNode && !clonedNodes.has(mapping.nodeId)) {
      patched[mapping.nodeId] = {
        ...originalNode,
        inputs: originalNode.inputs && typeof originalNode.inputs === "object" ? { ...originalNode.inputs } : originalNode.inputs
      };
      clonedNodes.add(mapping.nodeId);
    }
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
async function buildImageParameters(config2, connection, prompt, negative) {
  const parameters = { ...connection?.default_parameters || {}, ...config2.imageParameters };
  logStage(config2, "image_parameters_start", {
    provider: connection?.provider || "(default)",
    connectionId: connection?.id || null,
    promptLength: prompt.length,
    negativeLength: negative.length,
    parameterKeys: keysOf(parameters)
  });
  if (connection?.provider !== "comfyui" && connection?.provider !== "swarmui") {
    logStage(config2, "image_parameters_ready", { provider: connection?.provider || "(default)", workflowPresent: Boolean(parameters.workflow) });
    return parameters;
  }
  if (parameters.workflow && typeof parameters.workflow === "object") {
    logStage(config2, "comfy_workflow_existing", { parameterKeys: keysOf(parameters) });
    return parameters;
  }
  const comfy = readComfyConfig(connection.metadata);
  if (!comfy) {
    logStage(config2, "comfy_workflow_missing", { metadataKeys: keysOf(connection.metadata) }, "warn");
    return parameters;
  }
  const workflow = comfy.workflow_api_json || comfy.workflow_json;
  const mappings = comfy.field_mappings || [];
  logStage(config2, "comfy_workflow_config_found", {
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
  logStage(config2, "comfy_workflow_patched", {
    workflowPresent: true,
    workflowFormat: "api_prompt",
    parameterKeys: keysOf({ ...parameters, workflow: patched, workflowFormat: "api_prompt", preserveImportedWorkflow: true })
  });
  return { ...parameters, workflow: patched, workflowFormat: "api_prompt", preserveImportedWorkflow: true };
}
async function prepareAndDispatchImageJobs(inputs, eager, prepare, generate, options = {}) {
  const jobs = [];
  const requests = [];
  let serialRequest = Promise.resolve();
  let preparationFailure;
  let hasPreparationFailure = false;
  for (const [index, input] of inputs.entries()) {
    let job;
    try {
      throwIfAborted(options.signal);
      job = await prepare(input, index);
      throwIfAborted(options.signal);
    } catch (error51) {
      preparationFailure = error51;
      hasPreparationFailure = true;
      break;
    }
    jobs.push(job);
    const invoke = () => {
      try {
        throwIfAborted(options.signal);
        return Promise.resolve(generate(job));
      } catch (error51) {
        return Promise.reject(error51);
      }
    };
    const providerRequest = eager || requests.length === 0 ? invoke() : serialRequest.then(invoke);
    const request = options.onSettled ? providerRequest.then(async (result) => {
      await options.onSettled?.(job, { status: "fulfilled", value: result });
      return result;
    }, async (error51) => {
      await options.onSettled?.(job, { status: "rejected", reason: error51 });
      throw error51;
    }) : providerRequest;
    request.catch(() => {
      return;
    });
    requests.push(request);
    if (!eager)
      serialRequest = providerRequest.then(() => {
        return;
      }, () => {
        return;
      });
  }
  const allSettled = Promise.allSettled(requests);
  const settled = options.stopWaitingOnAbort && options.signal ? await new Promise((resolve, reject) => {
    const cancel = () => {
      options.signal?.removeEventListener("abort", cancel);
      reject(abortError());
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    allSettled.then((results) => {
      options.signal?.removeEventListener("abort", cancel);
      resolve(results);
    });
    if (options.signal?.aborted)
      cancel();
  }) : await allSettled;
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

// src/backend/paragraphs.ts
function ignoredTagNames(config2) {
  return unique(String(config2.ignoredTags || "").split(/[\n,]/).map((tag) => tag.trim().replace(/^<|>$/g, "").replace(/^\/+/, "")).filter(Boolean));
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
var ignoredPatternCache = new Map;
function ignoredTagPatterns(config2) {
  const key = String(config2.ignoredTags || "");
  const cached2 = ignoredPatternCache.get(key);
  if (cached2)
    return cached2;
  const patterns = ignoredTagNames(config2).map((tag) => {
    const name = escapeRegExp(tag);
    return {
      paired: new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, "gi"),
      element: new RegExp(`<\\/?${name}\\b[^>]*>`, "gi"),
      bracket: new RegExp(`^\\s*\\[${name}\\b[^\\]]*\\]\\s*$`, "gim")
    };
  });
  if (ignoredPatternCache.size >= 32) {
    const oldest = ignoredPatternCache.keys().next().value;
    if (typeof oldest === "string")
      ignoredPatternCache.delete(oldest);
  }
  ignoredPatternCache.set(key, patterns);
  return patterns;
}
function stripIgnoredTags(text, patterns) {
  let output = text;
  for (const pattern of patterns) {
    output = output.replace(pattern.paired, "").replace(pattern.element, "").replace(pattern.bracket, "");
  }
  return output;
}
function cleanParagraphText(text, patterns) {
  const stripped = stripIgnoredTags(text, patterns).replace(/CARDDATA:.*$/gim, "").replace(/<Update Log\b[\s\S]*?<\/Update Log>/gi, "").replace(/<Choice\b[\s\S]*?<\/Choice>/gi, "");
  return stripped.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed)
      return false;
    return !/^\[(?:Date|FLOOR|RESERVEDFLOOR)\s*:/i.test(trimmed) && !/^<\s*(?:suggestion|scene\s+seed=|check|choice)\b/i.test(trimmed);
  }).join(`
`).trim();
}
function prepareParagraphs(content, config2) {
  const paragraphs = [];
  const originalBlocks = splitParagraphBlocks(stripInlayContent(content));
  const patterns = ignoredTagPatterns(config2);
  for (const [index, block] of originalBlocks.entries()) {
    const cleaned = cleanParagraphText(block, patterns);
    if (cleaned)
      paragraphs.push({ parserIndex: paragraphs.length + 1, originalIndex: index + 1, text: cleaned });
  }
  return paragraphs;
}
function paragraphCount(content) {
  return content.split(/(\r?\n\s*\r?\n)/).filter((part) => part.trim()).length;
}

// src/backend/instructions.ts
function coverDirectionContract(config2) {
  if (!config2.coverImageEnabled)
    return "";
  return [
    "## Cover Image / Key Visual",
    "cover is required and is one additional whole-message promotional prompt. It does not count toward minImages or maxImages and has no paragraph field because it is placed above the prose rather than beside any paragraph.",
    "Capture the current message's overall theme or emotional core, not a recreation of any specific scene or paragraph. Treat it like bold magazine-cover or album-art photography.",
    "Be daring. Unconventional framing, symbolic juxtaposition, foreground devices, reflections, silhouettes, extreme scale, or other narrative devices are encouraged even when that exact composition would never occur as a Scene.",
    "Keep every depicted identity, appearance trait, object, and thematic motif grounded in the current message or supplied continuity. Cinematic synthesis may rearrange source-supported visual elements, but it must not invent a new event, character identity, outfit, prop, location, or relationship.",
    "Make cover unmistakably distinct from every numbered Scene in composition, camera, focal arrangement, character selection, and environment treatment. Do not copy a Scene and merely change its angle.",
    "Do not add typography, titles, captions, logos, borders, watermarks, or readable text unless the client explicitly requests them.",
    "Use the same visible-only character detail, camera vocabulary, name privacy, negative-tag, and maximum-character rules as Scenes.",
    config2.promptStyle === "anima" ? "Fill cover with the displayed structured cover fields. Its shotPlan is a concise rendering hierarchy for the promotional composition: primaryAction names the dominant visible relationship, secondaryCue is optional, and staging states the spatial arrangement. Cover has no perspectiveMode, paragraph, environmentChanges, or visualChanges." : "Fill cover with the displayed flat cover fields. Use supplement only for concise objective composition details that tags cannot express. Cover has no perspectiveMode, paragraph, or environmentChanges."
  ].join(`
`);
}
function coverSchema(config2) {
  if (!config2.coverImageEnabled)
    return [];
  if (config2.promptStyle === "anima") {
    return [
      '  "cover": {',
      '    "environment": {',
      '      "location": "string",',
      '      "timeWeather": "string",',
      '      "lightingMood": ["string"],',
      '      "backgroundElements": ["string"]',
      "    },",
      '    "camera": {',
      '      "framing": "string",',
      '      "angle": "string",',
      '      "perspective": "string",',
      '      "focus": ["string"]',
      "    },",
      '    "shotPlan": {',
      '      "primaryAction": "string",',
      '      "secondaryCue": "string",',
      '      "staging": "string"',
      "    },",
      '    "situation": "string",',
      '    "characters": [',
      "      {",
      '        "name": "string",',
      '        "label": "string",',
      '        "age": "string",',
      '        "identity": "string",',
      '        "appearance": "string",',
      '        "body": "string",',
      '        "attire": "string",',
      '        "attireInferred": false,',
      '        "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
      '        "expression": "string",',
      '        "renderScope": "string",',
      '        "visibleTags": "string",',
      '        "composition": {',
      '          "position": "string",',
      '          "pose": "string",',
      '          "actions": ["string"],',
      '          "gaze": "string"',
      "        }",
      "      }",
      "    ],",
      '    "sharedComposition": {',
      '      "interaction": ["string"],',
      '      "spatialRelation": "string"',
      "    },",
      '    "negative": "string"',
      "  },"
    ];
  }
  return [
    '  "cover": {',
    '    "place": "string",',
    '    "camera": "string",',
    '    "situation": "string",',
    '    "action": "string",',
    '    "characters": [',
    "      {",
    '        "name": "string",',
    '        "label": "string",',
    '        "age": "string",',
    '        "identity": "string",',
    '        "appearance": "string",',
    '        "body": "string",',
    '        "attire": "string",',
    '        "attireInferred": false,',
    '        "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
    '        "expression": "string",',
    '        "renderScope": "string",',
    '        "visibleTags": "string",',
    '        "action": "string"',
    "      }",
    "    ],",
    '    "supplement": "string",',
    '    "negative": "string"',
    "  },"
  ];
}
function parserSchema(config2) {
  const structuredAnima = config2.promptStyle === "anima";
  const dynamicPossible = config2.adaptiveMode || config2.perspectiveMode === "dynamic";
  const perspectiveSchemaValue = config2.adaptiveMode ? "creative | static | dynamic" : config2.perspectiveMode;
  return structuredAnima ? [
    "{",
    ...coverSchema(config2),
    '  "scenes": [',
    "    {",
    '      "environment": {',
    '        "location": "string",',
    '        "timeWeather": "string",',
    '        "lightingMood": ["string"],',
    '        "backgroundElements": ["string"]',
    "      },",
    '      "environmentChanges": ["location | timeWeather | lightingMood | backgroundElements"],',
    '      "shots": [',
    "        {",
    '          "paragraph": 0,',
    `          "perspectiveMode": "${perspectiveSchemaValue}",`,
    '          "camera": {',
    '            "framing": "string",',
    '            "angle": "string",',
    '            "perspective": "string",',
    '            "focus": ["string"]',
    "          },",
    ...dynamicPossible ? [
      '          "shotPlan": {',
      '            "primaryAction": "string",',
      '            "secondaryCue": "string",',
      '            "staging": "string"',
      "          },"
    ] : [],
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
    '              "attireInferred": false,',
    '              "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
    '              "visualChanges": ["age | appearance | body | attire"],',
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
    "  ],",
    '  "terminalState": {',
    '    "paragraph": 0,',
    '    "environment": {',
    '      "location": "string",',
    '      "timeWeather": "string",',
    '      "lightingMood": ["string"],',
    '      "backgroundElements": ["string"]',
    "    },",
    '    "environmentChanges": ["location | timeWeather | lightingMood | backgroundElements"],',
    '    "characters": [',
    "      {",
    '        "name": "string",',
    '        "label": "string",',
    '        "age": "string",',
    '        "appearance": "string",',
    '        "body": "string",',
    '        "attire": "string",',
    '        "attireInferred": false,',
    '        "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
    '        "visualChanges": ["age | appearance | body | attire"]',
    "      }",
    "    ]",
    "  }",
    "}"
  ] : [
    "{",
    ...coverSchema(config2),
    '  "scenes": [',
    "    {",
    '      "place": "string",',
    '      "environmentChanges": ["place"],',
    '      "shots": [',
    "        {",
    '          "paragraph": 0,',
    `          "perspectiveMode": "${perspectiveSchemaValue}",`,
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
    '              "attireInferred": false,',
    '              "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
    '              "visualChanges": ["age | appearance | body | attire"],',
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
    "  ],",
    '  "terminalState": {',
    '    "paragraph": 0,',
    '    "place": "string",',
    '    "environmentChanges": ["place"],',
    '    "characters": [',
    "      {",
    '        "name": "string",',
    '        "label": "string",',
    '        "age": "string",',
    '        "appearance": "string",',
    '        "body": "string",',
    '        "attire": "string",',
    '        "attireInferred": false,',
    '        "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
    '        "visualChanges": ["age | appearance | body | attire"]',
    "      }",
    "    ]",
    "  }",
    "}"
  ];
}
function parserInstruction(config2, options = {}) {
  return buildCompactParserInstruction(config2, options);
}
function normalQualityContract(config2, hasPreviousVisualState) {
  const structuredAnima = config2.promptStyle === "anima";
  return [
    "## Normal Mode Quality Contract",
    "Preserve explicit source facts exactly: action owner and target, movement direction, visible emotion, interpersonal tone, colors, materials, counts, partial visibility, and out-of-frame status. Never romanticize conflict or replace a distinctive action with a generic pose.",
    structuredAnima ? "Give every visible action exactly one owner. Individual actions belong in that character's composition.actions; shared contact belongs in sharedComposition.interaction; shotPlan may prioritize but not change those facts. Preserve source-critical environmental contact such as water around boots or vines around an arm." : "Give every action exactly one owner. Keep individual actions on the character and shared contact at shot level; never duplicate or reassign them.",
    "Keep durable fields separate. appearance contains hair, eyes, skin, species and permanent identifying features; body contains build, proportions and persistent anatomy; attire contains only worn clothing and accessories; expression contains transient facial state. Held weapons, parcels, tools and active props belong in action or composition, not attire.",
    "Species fidelity is literal. Preserve every stated ear, tail, horn, wing, muzzle, fur color or pattern, limb count, digitigrade trait, and human-versus-anthropomorphic distinction. Do not infer companion anatomy: kemonomimi ears and tail do not imply a muzzle or body fur, while an explicitly furry character keeps its stated fur and muzzle.",
    "For visible clothing, preserve each stated layer, color, material and style, including uniforms, corporate clothing and streetwear. Never invent wardrobe from occupation, genre, school, species or setting. If attire is genuinely absent, choose one conservative outfit and mark attireInferred=true with sources.attire=inferred.",
    "A current-source transformation that remains visible after the final paragraph belongs in appearance or body and terminalState, even when magical or described as temporary. Preserve every unchanged baseline field and change only fields explicitly replaced by the source.",
    "Continuity moves forward only. Never copy a later transformation, prop, attire, action or environment backward into an earlier shot. Later unselected paragraphs still update terminalState.",
    "Choose a camera that contains the facts the image must prove. A required face or eye must stay visible; lower-body action or attire needs a sufficiently wide crop; a true fragment must omit every out-of-crop identity trait.",
    "Environment uses source-supported physical details only. Do not infer romance, calm, menace or another emotional tone from lighting or genre.",
    hasPreviousVisualState ? "When Previous Visual State exists, unchanged character baseline fields stay empty with no visualChanges marker so deterministic inheritance preserves them; explicit replacements carry the complete new field and its marker." : "Without Previous Visual State, repeat complete stable character baselines across shots until the source explicitly changes them."
  ].join(`
`);
}
function fastPerspectiveContract(config2) {
  const dynamic = [
    "### Dynamic shot direction",
    "shotPlan is required for Dynamic. shotPlan.primaryAction is one concise comma-free role-bound subject-verb-object clause naming the primary action, its owner (visual role such as left woman), target or object, and movement direction. secondaryCue is empty or one lower-priority visible cue. staging is one comma-free spatial arrangement with no new action.",
    "Every Dynamic character needs renderScope (what the crop actually contains) and visibleTags (only stable appearance, body, and attire traits visible in that crop; no expression, action, camera, environment, names, or subject counts).",
    "composition and sharedComposition retain full factual action ownership; shotPlan only selects what dominates the rendered image.",
    "Choose framing that contains the primary action and every source-critical visible fact; prefer a repeated suitable camera over a novel camera that crops out the action."
  ].join(`
`);
  const stat = [
    "### Static shot direction",
    "Fixed to a conventional medium shot at eye level, straight-on, with deep focus. No close-ups, wide shots, body-part crops, POV, high or low angles, dutch angles, motion blur, or action-centric framing.",
    "One Static character sits slightly forward from a readable background; two characters are left and right on the same shallow plane. Pose is one concrete source-supported resting body arrangement, never an abstract phrase such as simple pose. composition.actions is an empty array.",
    "Every Static scene needs a specific physical location and 2-3 concrete backgroundElements.",
    "Leave shotPlan absent."
  ].join(`
`);
  const creat = [
    "### Creative shot direction",
    "Isolate one identity-safe visual anchor from the paragraph: object, environment, shadow, silhouette, reflection, foreground layer, aftermath, unusual spatial relationship, or non-identifying body fragment. Never a recognizable face, hairstyle, outfit, or clothing detail.",
    "renderScope and visibleTags belong ONLY inside a character object in shot.characters and never at the shot or scene level. shot.characters contains only people with an actually visible body part inside renderScope; for a zero-character Creative frame use an empty characters array and do NOT add shot-level renderScope or visibleTags keys, because they are not in the schema.",
    "Populate the complete environment object even when the Creative renderer will omit it from the prompt: exactly one location, exactly one time/weather phrase, 1-2 lightingMood snippets, and 1-3 backgroundElements.",
    "Leave shotPlan absent."
  ].join(`
`);
  const asset = "### Asset shot direction\nAlways `white background, simple background`. No location, lighting, weather, or prop tags.";
  const fixed = "perspectiveMode, renderScope, visibleTags, and shotPlan are shot-only rendering decisions; they never alter complete appearance, body, attire, or environment continuity.";
  if (!config2.adaptiveMode) {
    const contract = config2.perspectiveMode === "creative" ? creat : config2.perspectiveMode === "static" ? stat : config2.perspectiveMode === "asset" ? asset : dynamic;
    return ["### Perspective mode - fixed", `Set perspectiveMode to exactly ${config2.perspectiveMode} for every shot.`, contract, fixed].join(`
`);
  }
  return [
    "### Perspective mode - Adaptive router",
    "Choose perspectiveMode independently for every shot: exactly creative, static, or dynamic. Do not choose Creative for every shot in a multi-shot batch.",
    "Use Creative only for a faithful identity-safe anchor; use Static for a stable readable scene; use Dynamic for visible action or movement. A required visible action chooses Dynamic; an identity-safe no-character anchor may choose Creative; otherwise choose Static.",
    creat,
    stat,
    dynamic,
    fixed
  ].join(`
`);
}
function buildCompactParserInstruction(config2, options = {}) {
  const fixedAsset = !config2.adaptiveMode && config2.perspectiveMode === "asset";
  const maxCharacters = fixedAsset ? 1 : config2.maxCharacters;
  const structuredAnima = config2.promptStyle === "anima";
  const hasPreviousVisualState = config2.previousVisualStateEnabled && options.hasPreviousVisualState === true;
  const fixedStatic = !config2.adaptiveMode && config2.perspectiveMode === "static";
  const staticBackgroundPossible = fixedStatic || config2.adaptiveMode;
  const shotInstruction = [
    fixedAsset ? "One shot per selected paragraph, each containing exactly one visible character." : `Generate ${config2.minImages}-${config2.maxImages} shots total when possible.`,
    "Choose the most visually consequential changes, actions, interactions, or emotional beats across the entire current source; do not favor earlier paragraphs merely because they appear first.",
    fixedAsset ? "Every shot must reference a different selected source paragraph. Never return two shots for the same paragraph." : fixedStatic ? "Keep the visual-novel framing fixed across Static shots. Distinguish additional shots through source-supported changes in primary character, expression, simple pose, or background instead of dramatic cinematography." : "Each additional shot must differ from the other shots in at least two of these dimensions: (1) perspective or framing, (2) focal subject or visible action, and (3) composition, depth, or foreground occlusion.",
    fixedAsset ? "Do not invent narrative events or add a second visible character." : "If the source contains too few distinct visual paragraphs, return fewer shots. Do not repeat a paragraph or invent narrative events.",
    fixedAsset ? "" : "Every shot must reference a different source paragraph. Never return two shots for the same paragraph. Order shots by their visual importance, not paragraph number.",
    structuredAnima ? "Preserve the source's explicit action, direction of movement, visible emotional state, and interpersonal tone. Never replace irritation, fear, conflict, or urgency with romance, serenity, or another inferred mood." : ""
  ].join(`
`);
  const schema = parserSchema(config2);
  return [
    "# Image Tagging System",
    "Tag the current message's paragraphs as Danbooru-style English image prompts. Output a single JSON object.",
    "## JSON Format",
    schema.join(`
`),
    structuredAnima ? "- negative is optional. All other displayed fields and nested objects are required except shotPlan, which is required only for Dynamic and must be absent for Static or Creative. Use empty strings or arrays inside required objects when a field does not apply; never collapse an object into a string." : "- negative is optional. All other fields are required, though values may be empty strings when a field does not apply.",
    "- These are the ONLY allowed fields. Adding any unlisted field is a schema violation.",
    coverDirectionContract(config2),
    "## Scenes & Shots",
    "Scene = shots sharing one physical location.",
    "- Same location means same scene, multiple shots.",
    structuredAnima ? "- Location change means a new scene with its own environment." : "- Location change means a new scene with its own place.",
    "- Shot = one distinct visual moment: interaction, emotion, significant action, or clear framing change. Prefer closer framing over wide shots. Shots are independent, so repeat tags if the scene has not changed.",
    shotInstruction,
    "- When Non-authoritative Shot-Router Notes are present, create scenes and shots only for the selected [P#] references in those notes.",
    "- Paragraph references are 1-based. Copy the exact visible number after P; never convert to zero-based indices, renumber the source, or use paragraph 0. Never invent paragraph numbers outside the visible range.",
    "- Tag ONLY the current message. Recent context is for continuity only.",
    "## Terminal Visual State",
    "terminalState is required, is never rendered, and never changes camera, composition, perspective, shot selection, or prompt content.",
    "Set terminalState.paragraph to the final original numbered paragraph, even when that paragraph is not selected for illustration.",
    structuredAnima ? "Read every original paragraph in order and record the physical environment and stable baselines (label, age, appearance, body, attire, sources) of characters still present after the final paragraph. Use only environment, environmentChanges, and the listed stable character fields; never include action, expression, pose, camera, shotPlan, renderScope, visibleTags, or supplement." : "Read every original paragraph in order and record the final place and stable baselines of characters still present after the final paragraph. Use only place, environmentChanges, and the listed stable character fields; never include action, expression, pose, camera, renderScope, visibleTags, or supplement.",
    "Apply explicit location, attire, appearance, and body changes from unselected paragraphs to terminalState. Do not let an earlier illustrated paragraph overwrite a later narrative change.",
    "## Tag Rules",
    "Use common, objective, visualizable Danbooru-style English tags. Never fabricate tag vocabulary; use simpler well-known equivalents if unsure. Never output placeholder tags or phrases such as unknown, unspecified, not specified, unmentioned, undetermined, default clothing, or unspecified time; leave genuinely nonvisual fields empty instead.",
    structuredAnima ? "Tag fields are comma-separated tags. Atomic composition and sharedComposition values are concise comma-free natural-language phrases. Environment arrays contain one comma-free visual snippet per item." : "All fields are comma-separated tags except supplement, which is a short objective visual sentence.",
    "Character names are private memory keys. Outside characters[].name, never write a full name or first name in any field, including situation, renderScope, visibleTags, composition, sharedComposition, camera, environment, place, supplement, or negative. Use visual descriptors such as left woman, right man, foreground character, or background character.",
    `Character limit: max ${maxCharacters} character object(s) per shot. Do not add another character object beyond this limit; refer to an additional anonymous out-of-frame person only through visible composition when the source requires it.`,
    hasPreviousVisualState ? "Previous Visual State is injected after parsing. For an unchanged returning character, leave age, appearance, body, and attire empty and leave visualChanges empty; the backend restores the exact stored baseline before rendering and persistence. For a new character, or when no matching previous character exists, output the complete baseline. For an explicit current-source change or a final user instruction that adds or replaces durable character tags, list that field in visualChanges and output its complete new value." : "Repeat stable appearance, body, and attire tags for returning characters across all shots unless the current message clearly changes their present visual state.",
    "Set sources.age/appearance/body/attire independently to card_explicit, previous_memory, narrative_explicit, or inferred. Card facts must be directly stated in {{char}} Info; scene facts must be directly stated in [P#]; role-, genre-, species-, school-, or setting-based completion is inferred.",
    "Preserve every explicitly paired species feature (for example ears and tail) with stated color/count/type, but never infer an unstated companion feature.",
    "Never invent hair length/style, eye modifiers, clothing color/items, jewelry, pupil shape, or anatomy from conventions. Explicit card attire uses attireInferred=false and card_explicit; chosen clothing uses attireInferred=true and inferred.",
    "Only card_explicit and previous_memory fields may enter durable character memory. narrative_explicit fields remain in rolling Previous Visual State when visualChanges marks them, but never rewrite the canonical character-card baseline.",
    "Core fields: situation uses only source-supported visible count tags such as 1girl, 1boy, other, solo, or group and must match the complete visible people. label is exactly girl, boy, or other. Leave legacy identity empty; put durable species and recognition traits in appearance or body.",
    "age is a nonnumeric visual category. Usually leave it empty for late teens through early thirties. When explicit sexual content identifies participants as adults, give every visible participant mature female, mature male, aged up, or another clearly adult nonnumeric category in every shot of that sequence. Never output numeric ages.",
    "Continuity does not require repeating camera angle, framing, composition, depth, or occlusion. Vary those deliberately between shots while preserving narrative facts.",
    "Before returning the batch, compare Dynamic cameras as a soft camera ledger. When two equally suitable cameras would contain their focal actions, prefer different framing + angle + perspective tuples. Never choose a worse, more extreme, or action-cropping camera merely to create variety.",
    config2.fastMode ? "" : normalQualityContract(config2, hasPreviousVisualState),
    fastPerspectiveContract(config2),
    structuredAnima ? "### Camera values" : "",
    structuredAnima ? "- camera.framing must be empty or exactly one of: portrait, close-up, medium close-up, upper body, medium shot, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, body-part focus. camera.angle must be empty or exactly one of: eye level, low angle, high angle, dutch angle. camera.perspective must be empty or exactly one of: straight-on, from above, from behind, from below, from side, sideways, three-quarter view, pov. Never swap them: from above and from side are perspectives; high angle and low angle are angles. camera.focus may contain at most two of: shallow depth of field, deep focus, background blur, foreground blur, motion blur, fisheye, wide-angle lens, telephoto lens. Do not add any other camera keys or values." : "- Framing tags: portrait, upper body, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, close-up, body-part focus. Perspective tags: from above, from behind, from below, from side, high up, sideways, straight-on, upside-down, pov.",
    structuredAnima ? "### Atomic Natural Composition" : config2.supplement ? "### Natural Language Supplement" : "Do not include supplement text.",
    structuredAnima ? "characters[].composition is always required and uses its four atomic fields (position, pose, actions, gaze), rendered in that exact order. Each phrase is concise, comma-free, independently visual, and never repeats a fact from another field. gaze contains direction only; startled eyes, closed eyes, anger and other facial states belong in expression. Never use names; say viewer, left girl, right boy, foreground character, or background character. Never put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle, appearance, attire, or facial-expression adjectives in any composition field." : config2.supplement ? "In supplement, describe visible details in concise objective telegraphic sentences: composition, framing, positions, interactions, unusual vantage points, or objective atmosphere/lighting. Separate phrases with commas, never semicolons. No names, no smell, sound, internal sensation, invisible emotion, or prose narration." : "Do not write supplement.",
    structuredAnima ? "Use sharedComposition.interaction for shared contact or combined actions only, and spatialRelation for one spatial relationship phrase. Do not repeat individual character actions." : "",
    structuredAnima ? config2.supplement ? "Environment target budget: exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements. Prefer the source's exact concrete noun phrase over a generic paraphrase; never add a plausible prop the current paragraph does not establish. When the source does not establish time/weather, choose one conservative visually coherent value supported by the setting; never leave timeWeather empty or write unknown or unspecified." : staticBackgroundPossible ? "Environment target budget: exactly one location, exactly one time/weather phrase, empty lightingMood, and 2-3 backgroundElements for every scene containing a Static shot. Prefer the source's exact concrete noun phrase; never add a prop the paragraph does not establish. When the source does not establish time/weather, choose one conservative visually coherent value; never leave timeWeather empty." : "Environment target budget: exactly one location, exactly one time/weather phrase, empty lightingMood and backgroundElements. Prefer the source's exact concrete noun phrase; never add a prop the paragraph does not establish. When the source does not establish time/weather, choose one conservative visually coherent value; never leave timeWeather empty." : "",
    "## Data Priority",
    "1. Client comments or explicit user instructions in the current message override all instructions.",
    "2. Current message [P#] paragraphs are authoritative for scene content. Never restore outdated clothing, props, location, or actions from context.",
    hasPreviousVisualState ? "3. Previous Visual State is the immediate visual continuity layer. It never overrides an explicit current-source change or a final user-instruction baseline change marked in visualChanges." : "",
    config2.characterTagContextEnabled ? "4. Character tag history is the durable visual baseline for returning characters: label, age, appearance, body, and explicit base attire. Current narrative changes update rolling Previous Visual State, not this canonical baseline." : "",
    "## Output Format",
    "- Output raw JSON only. One JSON object. No XML, HTML, YAML, markdown fences, comments, or prose.",
    "- Double-quoted keys and values. No trailing commas. Validate bracket balance: every { has }, every [ has ].",
    "- Positive tags only unless client says otherwise. English only.",
    "## Character Names",
    "Use names only for the JSON name field as private memory keys. Names will not be included in final prompts. If the narrative provides a multi-word name, copy that full name exactly in characters[].name. If unnamed, use a consistent identifier such as girl A, boy B, shopkeeper, guard, or stranger. Never empty; this is used for cross-message appearance tracking.",
    ...config2.originalReference ? [
      "Original Creation Tag:",
      config2.originalCreationName || "(empty)",
      "Use full character names ONLY for the JSON name field. Output the character's name only: no parentheses, no creation tag, no source/work title, and no aliases. The extension adds the creation tag programmatically afterward. Do not include any parenthetical, source name, creation reference, title, or alias in name or any other field."
    ] : []
  ].join(`

`);
}

// src/backend/parser.ts
var parserConnectionCache = new Map;
function cacheParserConnection(key, connection) {
  if (parserConnectionCache.size >= 32) {
    const oldest = parserConnectionCache.keys().next().value;
    if (typeof oldest === "string")
      parserConnectionCache.delete(oldest);
  }
  parserConnectionCache.set(key, { expiresAt: Date.now() + 5000, connection });
}
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
    "Use this reference only to fill missing stable appearance, attire, location, still-current time/weather, lighting, background, and persistent-action details.",
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
    const object2 = result;
    for (const key of ["content", "text", "message", "output"]) {
      if (typeof object2[key] === "string")
        return object2[key];
    }
  }
  return "";
}
function extractUsage(result) {
  const usage = asRecord(asRecord(result).usage);
  const output = {};
  for (const key of [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "total_cached_tokens",
    "prompt_cache_hit_tokens",
    "prompt_cache_miss_tokens",
    "cache_write_tokens"
  ]) {
    const value = Number(usage[key]);
    if (Number.isFinite(value))
      output[key] = value;
  }
  const promptDetails = asRecord(usage.prompt_tokens_details);
  for (const key of ["cached_tokens", "cache_write_tokens"]) {
    const value = Number(promptDetails[key]);
    if (Number.isFinite(value))
      output[key] = value;
  }
  return output;
}
function extractFinishReason(result) {
  const object2 = asRecord(result);
  if (typeof object2.finish_reason === "string")
    return object2.finish_reason;
  const choices = Array.isArray(object2.choices) ? object2.choices : [];
  const first = asRecord(choices[0]);
  return typeof first.finish_reason === "string" ? first.finish_reason : "";
}
var FUZZY_KEYS = [
  "scenes",
  "place",
  "environmentChanges",
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
  "attireInferred",
  "sources",
  "visualChanges",
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
  "visibleTags",
  "shotPlan",
  "primaryAction",
  "secondaryCue",
  "staging",
  "terminalState"
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
function parseParserJson(text) {
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
    const object2 = parsed;
    if (Array.isArray(object2.shots))
      collectedGroups.push(object2);
    else if (object2.paragraph !== undefined)
      collectedShots.push(object2);
  }
  if (collectedGroups.length > 0)
    return { scenes: collectedGroups };
  if (collectedShots.length > 0)
    return { scenes: collectedShots };
  throw new Error("Parser did not return usable JSON scenes.");
}
function staticShot(shot, config2) {
  if (!config2.adaptiveMode)
    return config2.perspectiveMode === "static";
  return cleanString2(shot.perspectiveMode).toLowerCase() === "static";
}
function dynamicShot(shot, config2) {
  if (!config2.adaptiveMode)
    return config2.perspectiveMode === "dynamic";
  return cleanString2(shot.perspectiveMode).toLowerCase() === "dynamic";
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
function staticPayloadIssues(payload, config2) {
  if (config2.promptStyle !== "anima")
    return [];
  const issues = [];
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  scenes.forEach((scene, sceneIndex) => {
    const shots = Array.isArray(scene.shots) ? scene.shots : [scene];
    const staticShots = shots.filter((shot) => staticShot(shot, config2));
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
var ATOMIC_DIRECTION_END = /[.!?:,;]\s*$/;
function dynamicPayloadIssues(payload, config2, required2 = true) {
  if (config2.promptStyle !== "anima" || !required2)
    return [];
  const issues = [];
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  scenes.forEach((scene, sceneIndex) => {
    const shots = Array.isArray(scene.shots) ? scene.shots : [scene];
    shots.forEach((shot, shotIndex) => {
      if (!dynamicShot(shot, config2))
        return;
      const plan = asRecord(shot.shotPlan);
      const primaryAction = cleanString2(plan.primaryAction);
      if (!primaryAction) {
        issues.push(`scene ${sceneIndex + 1} Dynamic shot ${shotIndex + 1} needs shotPlan.primaryAction`);
      }
      for (const field of ["primaryAction", "secondaryCue", "staging"]) {
        const value = cleanString2(plan[field]);
        if (value && (value.includes(",") || value.includes(";") || ATOMIC_DIRECTION_END.test(value))) {
          issues.push(`scene ${sceneIndex + 1} Dynamic shot ${shotIndex + 1} shotPlan.${field} must be one atomic comma-free phrase`);
        }
      }
      const fragment = isFragmentCameraFraming(framingOf(shot.camera));
      const characters = Array.isArray(shot.characters) ? shot.characters : [];
      characters.forEach((character, characterIndex) => {
        if (!fragment && !cleanString2(character.renderScope)) {
          issues.push(`scene ${sceneIndex + 1} Dynamic shot ${shotIndex + 1} character ${characterIndex + 1} needs renderScope`);
        }
        if (!fragment && !cleanString2(character.visibleTags)) {
          issues.push(`scene ${sceneIndex + 1} Dynamic shot ${shotIndex + 1} character ${characterIndex + 1} needs visibleTags`);
        }
      });
    });
  });
  return issues;
}
function dynamicRepairInstruction(issues) {
  return [
    "Repair this valid JSON so every Dynamic shot has a compact rendering projection. Return only valid JSON and preserve every source fact, paragraph, character object, baseline field, expression, composition action owner, shared interaction, environment value, and camera.",
    "Add or repair only shotPlan, renderScope, and visibleTags unless syntax repair requires otherwise.",
    "shotPlan.primaryAction is one comma-free role-bound subject-verb-object clause selecting the single action or interaction that should dominate the image. Preserve its explicit owner, target or object, and movement direction.",
    "shotPlan.secondaryCue is empty or one comma-free lower-priority visible gaze, reaction, hazard, or environmental-contact cue. shotPlan.staging is one comma-free spatial arrangement and contains no new action.",
    "renderScope states what the existing camera actually contains. visibleTags contains only stable appearance, body, and attire traits visible in that crop; it contains no expression, action, camera, environment, name, or subject-count tag.",
    "Do not add a character, action, contact, emotion, outfit, prop, or event.",
    `Problems to repair:
- ${issues.join(`
- `)}`
  ].join(`
`);
}
function framingOf(camera) {
  const record2 = asRecord(camera);
  const framing = cleanString2(record2.framing).toLowerCase();
  if (framing)
    return framing;
  const text = cleanString2(camera).toLowerCase();
  const byLengthDesc = [...CAMERA_FRAMING_VALUES].sort((left, right) => right.length - left.length);
  return byLengthDesc.find((value) => text.includes(value)) || "";
}
var FRAGMENT_RENDER_SCOPE_DEFAULTS = {
  portrait: "head and shoulders visible",
  "close-up": "head and shoulders visible",
  "medium close-up": "head and torso visible",
  "upper body": "upper body visible",
  "medium shot": "upper body visible",
  "cowboy shot": "hips and upper legs visible",
  "feet out of frame": "full body with feet cropped out of frame",
  "full body": "full body visible",
  "wide shot": "full body visible",
  "lower body": "lower body visible"
};
function defaultRenderScopeForFraming(framing) {
  return FRAGMENT_RENDER_SCOPE_DEFAULTS[framing] || "full body visible";
}
function atomicPhrase(value) {
  const text = cleanString2(Array.isArray(value) ? value[0] : value);
  if (!text)
    return "";
  return text.split(/[,;]/)[0].replace(ATOMIC_DIRECTION_END, "").trim();
}
function primaryActionCandidates(shot) {
  const candidates = [];
  if (typeof shot.shotPlan === "string") {
    const plan = atomicPhrase(shot.shotPlan);
    if (plan)
      candidates.push(plan);
  }
  const action = atomicPhrase(shot.action);
  if (action)
    candidates.push(action);
  for (const character of cleanArray(shot.characters)) {
    const composition = asRecord(character.composition);
    const actions = Array.isArray(composition.actions) ? composition.actions : [composition.actions];
    for (const value of actions) {
      const phrase = atomicPhrase(value);
      if (phrase)
        candidates.push(phrase);
    }
  }
  return candidates;
}
function repairDynamicProjectionLocally(payload, config2, required2) {
  if (config2.promptStyle !== "anima" || !required2)
    return payload;
  const repaired = JSON.parse(JSON.stringify(payload));
  let shotPlanSanitized = 0;
  let primaryActionsSynthesized = 0;
  let renderScopesDefaulted = 0;
  let visibleTagsSynthesized = 0;
  for (const scene of cleanArray(repaired.scenes)) {
    const shots = Array.isArray(scene.shots) ? scene.shots : [scene];
    for (const shot of shots) {
      if (!dynamicShot(shot, config2))
        continue;
      const framing = framingOf(shot.camera);
      const fragment = isFragmentCameraFraming(framing);
      const plan = asRecord(shot.shotPlan);
      const nextPlan = { ...plan };
      let planChanged = false;
      for (const field of ["primaryAction", "secondaryCue", "staging"]) {
        if (!cleanString2(nextPlan[field]))
          continue;
        const phrase = atomicPhrase(nextPlan[field]);
        if (phrase !== cleanString2(nextPlan[field])) {
          nextPlan[field] = phrase;
          planChanged = true;
          shotPlanSanitized += 1;
        }
      }
      if (!cleanString2(nextPlan.primaryAction)) {
        const candidate = primaryActionCandidates(shot).find(Boolean);
        if (candidate) {
          nextPlan.primaryAction = candidate;
          planChanged = true;
          primaryActionsSynthesized += 1;
        }
      }
      if (planChanged)
        shot.shotPlan = nextPlan;
      if (fragment)
        continue;
      const characters = Array.isArray(shot.characters) ? shot.characters : [];
      characters.forEach((character, characterIndex) => {
        const nextCharacter = { ...character };
        let characterChanged = false;
        if (!cleanString2(nextCharacter.renderScope)) {
          nextCharacter.renderScope = defaultRenderScopeForFraming(framing);
          characterChanged = true;
          renderScopesDefaulted += 1;
        }
        if (!cleanString2(nextCharacter.visibleTags)) {
          const tags = projectDynamicVisibleTags(nextCharacter, shot.camera, cleanString2(nextCharacter.renderScope));
          if (tags) {
            nextCharacter.visibleTags = tags;
            characterChanged = true;
            visibleTagsSynthesized += 1;
          }
        }
        if (characterChanged)
          characters[characterIndex] = nextCharacter;
      });
    }
  }
  if (shotPlanSanitized > 0 || primaryActionsSynthesized > 0 || renderScopesDefaulted > 0 || visibleTagsSynthesized > 0) {
    logStage(config2, "dynamic_projection_repaired", {
      method: "local",
      shotPlanSanitized,
      primaryActionsSynthesized,
      renderScopesDefaulted,
      visibleTagsSynthesized
    });
  }
  return repaired;
}
function coverPayloadIssues(payload, config2) {
  if (!config2.coverImageEnabled)
    return [];
  const cover = asRecord(payload.cover);
  if (Object.keys(cover).length === 0)
    return ["cover is missing or is not an object"];
  const issues = [];
  const camera = cover.camera;
  if (config2.promptStyle === "anima") {
    if (!camera || typeof camera !== "object" || Array.isArray(camera) || Object.keys(asRecord(camera)).length === 0) {
      issues.push("cover.camera must be a populated structured camera object");
    }
    if (!cover.environment || typeof cover.environment !== "object" || Array.isArray(cover.environment)) {
      issues.push("cover.environment must be an object");
    }
    if (!cover.shotPlan || typeof cover.shotPlan !== "object" || Array.isArray(cover.shotPlan)) {
      issues.push("cover.shotPlan must be an object");
    }
  } else if (!cleanString2(camera)) {
    issues.push("cover.camera must be a non-empty string");
  }
  if (!cleanString2(cover.situation))
    issues.push("cover.situation must be a non-empty visual prompt");
  if (!Array.isArray(cover.characters))
    issues.push("cover.characters must be an array");
  return issues;
}
function coverRepairInstruction(issues, config2) {
  return [
    "Repair or add only the top-level cover key visual while preserving every existing numbered Scene and terminalState exactly. Return the complete JSON object and no other text.",
    "The cover is a whole-message promotional prompt with no paragraph field. Capture the current message's overall theme or emotional core rather than recreating one Scene.",
    "Use bold magazine-cover or album-art composition, source-grounded symbolic synthesis, and a camera and focal arrangement distinct from every numbered Scene. Do not add readable text, logos, captions, or watermarks.",
    config2.promptStyle === "anima" ? "Use exactly the structured cover fields shown in the original schema: environment, camera, shotPlan, situation, characters, sharedComposition, and optional negative." : "Use exactly the flat cover fields shown in the original schema: place, camera, situation, action, characters, supplement, and optional negative.",
    `Problems to repair:
- ${issues.join(`
- `)}`
  ].join(`
`);
}
function modePayloadIssues(payload, config2, requireDynamicProjection = true) {
  return [
    ...coverPayloadIssues(payload, config2),
    ...staticPayloadIssues(payload, config2),
    ...dynamicPayloadIssues(payload, config2, requireDynamicProjection)
  ];
}
function modeRepairInstruction(payload, config2, issues, requireDynamicProjection = true) {
  const coverIssues = coverPayloadIssues(payload, config2);
  const dynamicIssues = dynamicPayloadIssues(payload, config2, requireDynamicProjection);
  const staticIssues = staticPayloadIssues(payload, config2);
  const hasDynamic = dynamicIssues.length > 0;
  const hasStatic = staticIssues.length > 0;
  if (coverIssues.length > 0 && !hasDynamic && !hasStatic)
    return coverRepairInstruction(coverIssues, config2);
  if (coverIssues.length === 0 && hasDynamic && !hasStatic)
    return dynamicRepairInstruction(issues);
  if (coverIssues.length === 0 && hasStatic && !hasDynamic)
    return staticRepairInstruction(issues);
  return [
    "Repair this valid JSON so its cover, Static shots, and Dynamic shots satisfy the listed semantic requirements. Return only valid JSON and preserve all source facts and continuity values.",
    ...coverIssues.length > 0 ? [coverRepairInstruction(coverIssues, config2)] : [],
    ...staticIssues.length > 0 ? [staticRepairInstruction(staticIssues)] : [],
    ...dynamicIssues.length > 0 ? [dynamicRepairInstruction(dynamicIssues)] : []
  ].join(`

`);
}
function validateParserPayloadContext(context) {
  const validParagraphs = (values, label) => {
    if (values.length === 0 || values.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      throw new Error(`${label} must contain positive source paragraph numbers.`);
    }
    if (new Set(values).size !== values.length)
      throw new Error(`${label} must not contain duplicates.`);
    return [...values];
  };
  const currentParagraphs = validParagraphs(context.currentParagraphs, "currentParagraphs");
  const allowedParagraphs = validParagraphs(context.allowedParagraphs, "allowedParagraphs");
  if (allowedParagraphs.some((paragraph) => !currentParagraphs.includes(paragraph))) {
    throw new Error("allowedParagraphs must be a subset of currentParagraphs.");
  }
  return { ...context, currentParagraphs, allowedParagraphs };
}
function currentSourceText(messages) {
  const request = messages.find((message) => message.role === "user" && message.content.includes("## Current Numbered Paragraph Source"));
  if (!request)
    return "";
  return request.content.split("## Current Numbered Paragraph Source", 2)[1]?.split(/## (?:Selected Creative Concepts|Optional Creative Candidates)/i, 1)[0] || "";
}
function currentParagraphReferences(messages) {
  const source = currentSourceText(messages).split("## Non-authoritative Shot-Router Notes", 1)[0] || "";
  return [...new Set([...source.matchAll(/\[P(\d+)\]/gi)].map((match) => Number(match[1])).filter(Number.isFinite))];
}
function routedParagraphReferences(messages) {
  const source = currentSourceText(messages);
  const notes = source.split("## Non-authoritative Shot-Router Notes", 2)[1] || "";
  return [...new Set([...notes.matchAll(/^\[P(\d+)\]\s*:/gim)].map((match) => Number(match[1])).filter(Number.isFinite))];
}
function structuralPayloadIssues(payload, allowedParagraphs) {
  const normalized = normalizeScenePayload(payload);
  if (normalized.length === 0)
    return ["no scene contains a shot with a usable paragraph reference"];
  if (allowedParagraphs.length > 0) {
    const invalid = [...new Set(normalized.map((entry) => entry.parserParagraph).filter((paragraph) => !allowedParagraphs.includes(paragraph)))];
    if (invalid.length > 0) {
      return [`shots reference unselected or invalid paragraphs (${invalid.map((paragraph) => `P${paragraph}`).join(", ")}); allowed references are ${allowedParagraphs.map((paragraph) => `P${paragraph}`).join(", ")}`];
    }
    if (!normalized.some((entry) => allowedParagraphs.includes(entry.parserParagraph))) {
      return [`no shot references an allowed paragraph (${allowedParagraphs.map((paragraph) => `P${paragraph}`).join(", ")})`];
    }
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
async function resolveParserConnection(config2, userId) {
  logStage(config2, "parser_connection_resolve_start", { configuredConnectionId: config2.parserConnectionId, modelOverride: Boolean(config2.parserModel) });
  if (!config2.parserConnectionId)
    throw new Error("Select a parser connection before generating.");
  const cacheKey = JSON.stringify([userId ?? null, config2.parserConnectionId]);
  const cached2 = parserConnectionCache.get(cacheKey);
  if (cached2 && cached2.expiresAt > Date.now())
    return cached2.connection;
  const connection = await spindle.connections.get(config2.parserConnectionId, userId);
  if (!connection)
    throw new Error("Parser connection not found.");
  logStage(config2, "parser_connection_resolved", {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    connectionModel: connection.model,
    effectiveModel: config2.parserModel || connection.model
  });
  const resolved = {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    model: connection.model,
    metadata: connection.metadata
  };
  cacheParserConnection(cacheKey, resolved);
  return resolved;
}
var unsupportedStructuredOutput = new Set;
function parserStageTokenBudget(model, config2, stage) {
  const promptCount = Math.max(1, config2.maxImages) + (config2.coverImageEnabled ? 1 : 0);
  const budgets = {
    main: Math.min(config2.coverImageEnabled ? 7900 : 7000, 1800 + promptCount * 900),
    ideation: Math.min(5000, 1200 + Math.max(1, config2.maxImages) * 700),
    preprocess: 2400,
    repair: Math.min(config2.coverImageEnabled ? 6800 : 6000, 1600 + promptCount * 800),
    camera: 1800
  };
  let base = budgets[stage];
  if (/kimi[^\n]*k2[.\-_ ]?7[^\n]*code/i.test(model)) {
    if (stage === "main")
      base = Math.max(base, 16000);
    else if (stage === "repair")
      base = Math.max(base, 12000);
    else
      base = Math.max(base, 8000);
  } else if (/claude[^\n]*sonnet[^\n]*5/i.test(model)) {
    if (stage === "main")
      base = Math.max(base, 9000);
    else if (stage === "ideation")
      base = Math.max(base, 5000);
    else if (stage === "preprocess")
      base = Math.max(base, 4000);
    else if (stage === "repair")
      base = Math.max(base, 7000);
    else if (stage === "camera")
      base = Math.max(base, 4000);
  } else if (/deepseek[^\n]*v4[^\n]*pro/i.test(model)) {
    if (stage === "main")
      base = Math.max(base, 9000);
    else if (stage === "ideation")
      base = Math.max(base, 5000);
    else if (stage === "preprocess")
      base = Math.max(base, 4000);
    else if (stage === "repair")
      base = Math.max(base, 7000);
    else if (stage === "camera")
      base = Math.max(base, 4000);
  }
  if (config2.fastMode) {
    const heavyReasoner = /kimi[^\n]*k2[.\-_ ]?7[^\n]*code|claude[^\n]*sonnet[^\n]*5|deepseek[^\n]*v4[^\n]*pro/i.test(model);
    const perImage = 1400 + promptCount * 600;
    const fast = stage === "main" || stage === "repair" ? heavyReasoner ? base : Math.min(base, Math.min(perImage, 5200)) : Math.min(base, 2400);
    return config2.parserMaxTokens > 0 ? Math.min(config2.parserMaxTokens, fast) : fast;
  }
  if (config2.parserMaxTokens > 0)
    return config2.parserMaxTokens;
  return base;
}
function parserStageParameters(connection, config2, stage, structured = stage !== "preprocess") {
  const parameters = { ...config2.parserParameters };
  if (parameters.max_tokens === undefined && parameters.max_completion_tokens === undefined) {
    parameters.max_tokens = parserStageTokenBudget(config2.parserModel || connection.model, config2, stage);
  }
  const capabilityKey = JSON.stringify([connection.provider, config2.parserModel || connection.model]);
  const providerModel = `${connection.provider} ${config2.parserModel || connection.model}`.toLowerCase();
  const canRequestJson = /openai|gpt-|gemini|deepseek/.test(providerModel);
  const injectedStructuredOutput = structured && canRequestJson && parameters.response_format === undefined && !unsupportedStructuredOutput.has(capabilityKey);
  if (injectedStructuredOutput)
    parameters.response_format = { type: "json_object" };
  return { parameters, injectedStructuredOutput };
}
async function generateParserText(connection, config2, messages, userId, stage = "main", signal) {
  const startedAt = Date.now();
  const selected = parserStageParameters(connection, config2, stage);
  const run = async (parameters) => {
    throwIfAborted(signal);
    const controller = new AbortController;
    const timeout = setTimeout(() => controller.abort(), 180000);
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      return await spindle.generate.raw({
        type: "raw",
        provider: connection.provider,
        model: config2.parserModel || connection.model,
        connection_id: connection.id,
        messages,
        parameters,
        reasoning: { source: "off" },
        userId,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  };
  try {
    logStage(config2, "parser_llm_start", {
      provider: connection.provider,
      model: config2.parserModel || connection.model,
      connectionId: connection.id,
      stage,
      parameterKeys: keysOf(selected.parameters),
      messageCount: messages.length,
      messageLengths: messages.map((message) => message.content.length)
    });
    let result;
    try {
      result = await run(selected.parameters);
    } catch (error51) {
      const reason = error51 instanceof Error ? error51.message : String(error51);
      if (!selected.injectedStructuredOutput || !/\b400\b|invalid.*(?:response|argument|format)|response_format/i.test(reason))
        throw error51;
      const capabilityKey = JSON.stringify([connection.provider, config2.parserModel || connection.model]);
      unsupportedStructuredOutput.add(capabilityKey);
      const fallbackParameters = { ...selected.parameters };
      delete fallbackParameters.response_format;
      logStage(config2, "parser_structured_output_fallback", { stage, reason }, "warn");
      result = await run(fallbackParameters);
    }
    const text = extractText(result);
    const usage = extractUsage(result);
    const finishReason = extractFinishReason(result);
    logStage(config2, "parser_llm_done", {
      stage,
      outputLength: text.length,
      elapsedMs: Date.now() - startedAt,
      ...finishReason ? { finishReason } : {},
      ...Object.keys(usage).length ? { usage } : {}
    });
    if (finishReason === "length" && !text.trim())
      throw new Error("Parser response was truncated before producing JSON.");
    return text;
  } catch (error51) {
    if (signal?.aborted)
      throw abortError(typeof signal.reason === "string" ? signal.reason : undefined);
    logStage(config2, "parser_llm_error", {
      stage,
      elapsedMs: Date.now() - startedAt,
      error: error51 instanceof Error ? error51.message : String(error51)
    }, "error");
    throw new Error(`Parser generation failed: ${error51 instanceof Error ? error51.message : String(error51)}`);
  }
}
async function generateCreativeConcepts(parserConnection, config2, paragraphs, targetSource, context, previousConcepts = [], userId, signal) {
  try {
    logStage(config2, "creative_ideation_start", {
      paragraphCount: paragraphs.length,
      previousConceptCount: previousConcepts.length,
      adaptiveMode: config2.adaptiveMode
    });
    const raw = await generateParserText(parserConnection, config2, parserMessages(creativeIdeationInstruction(config2, previousConcepts), continuityReference(context.preprocessingSystemContext ?? context.systemContext, context.recentContext), creativeIdeationRequest(targetSource), context.override, "auxiliary"), userId, "ideation", signal);
    const concepts = parseCreativeConcepts(raw, paragraphs, config2);
    if (concepts.length === 0) {
      logStage(config2, "creative_ideation_fallback", { reason: "invalid_or_empty_slate", outputLength: raw.length }, "warn");
      return [];
    }
    logStage(config2, "creative_ideation_done", {
      candidateCount: concepts.length,
      paragraphCount: new Set(concepts.map((concept) => concept.paragraph)).size,
      scores: concepts.map((concept) => concept.score)
    });
    return concepts;
  } catch (error51) {
    throwIfAborted(signal);
    logStage(config2, "creative_ideation_fallback", {
      reason: error51 instanceof Error ? error51.message : String(error51)
    }, "warn");
    return [];
  }
}
function parserMessages(stableInstruction, referenceContext, userRequest, override, stage = "parser") {
  const messages = [{ role: "system", content: stableInstruction.trim() }];
  if (referenceContext.trim())
    messages.push({ role: "system", content: referenceContext.trim() });
  messages.push({ role: "user", content: userRequest.trim() });
  if (override.trim())
    messages.push({
      role: "user",
      content: [
        "Final user instructions override lower-priority parser guidance when they do not conflict with valid JSON output.",
        stage === "parser" ? "If they add or replace durable tags for a character, put those tags in appearance, body, or attire and list each affected field in that character's visualChanges so deterministic continuity preserves the requested change. Do not put those tags only in identity." : "",
        override.trim()
      ].filter(Boolean).join(`

`)
    });
  return messages;
}
function preprocessingInstruction(paragraphs, config2) {
  const minimum = Math.min(config2.minImages, paragraphs.length);
  const maximum = Math.min(config2.maxImages, paragraphs.length);
  const perspectiveGuidance = config2.adaptiveMode ? "Select varied candidates that give the main parser strong options for Creative, Static, or Dynamic treatment." : config2.perspectiveMode === "creative" ? "Favor concrete but easily overlooked visual anchors: partial subjects, objects, reflections, silhouettes, foreground fragments, environmental details, or unusual spatial relationships." : config2.perspectiveMode === "asset" ? "One shot per selected paragraph, each containing exactly one visible character." : config2.perspectiveMode === "static" ? "Favor stable clearly readable beats with conventional framing, limited motion, and limited occlusion." : "Favor significant visible action, movement, interaction, and cinematic changes.";
  return [
    "# Illustration Shot Router",
    "Select the strongest source paragraphs and give the final mode-specific parser a non-authoritative directing note. Never replace, rewrite, or summarize away the original source facts.",
    `Select between ${minimum} and ${maximum} unique paragraphs.`,
    "Choose paragraphs with the most significant visual changes, actions, interactions, location changes, or emotional beats across the whole source. Do not favor early paragraphs by default.",
    perspectiveGuidance,
    "Output plain text only with exactly one line per selected paragraph in this form:",
    "[P#]: Visual thesis: one decisive visible idea; Camera intent: concrete framing and viewpoint",
    "Use each selected [P#] once. Do not invent or alter paragraph numbers.",
    "Every selected line must include a non-empty Visual thesis and Camera intent.",
    "Use concise objective English. Do not output character baselines, rewritten narrative, markdown, greetings, or explanations."
  ].join(`

`);
}
function preprocessingUserRequest(rawTarget) {
  return ["Edit these current numbered paragraphs into the requested visual-beat selection:", rawTarget].join(`

`);
}
function routedTargetSource(rawTarget, selection) {
  return [
    rawTarget,
    "## Non-authoritative Shot-Router Notes",
    selection.summary,
    "Create illustration scenes and shots only for the selected [P#] references above. Read every original numbered paragraph for terminalState and continuity. The original paragraphs are authoritative; these notes only prioritize shots and never replace source facts."
  ].join(`

`);
}
function validatePreprocessedTarget(value, paragraphs, config2) {
  const summary = cleanString2(value);
  if (!summary)
    return null;
  const lines = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const minimum = Math.min(config2.minImages, paragraphs.length);
  const maximum = Math.min(config2.maxImages, paragraphs.length);
  const paragraphLines = lines;
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
    const thesis = match[2].match(/\bVisual thesis\s*:\s*(.+?)(?=;\s*Camera intent\s*:)/i)?.[1]?.trim() || "";
    const camera = match[2].match(/\bCamera intent\s*:\s*(\S.*)$/i)?.[1]?.trim() || "";
    if (!thesis || !camera)
      return null;
    seen.add(paragraph);
    selectedParagraphs.push(paragraph);
    cameraNotes.push(camera);
  }
  return { summary: compactBlock(summary, 12000), selectedParagraphs, cameraNotes };
}
async function preprocessTarget(parserConnection, config2, paragraphs, context, userId, signal) {
  const rawTarget = formatTargetParagraphs(paragraphs);
  const allParagraphs = paragraphs.map((paragraph) => paragraph.parserIndex);
  if (!config2.preprocessingEnabled)
    return { source: rawTarget, selectedParagraphs: allParagraphs };
  try {
    const summary = await generateParserText(parserConnection, config2, parserMessages(preprocessingInstruction(paragraphs, config2), continuityReference(context.preprocessingSystemContext ?? context.systemContext, context.recentContext), preprocessingUserRequest(rawTarget), context.override, "auxiliary"), userId, "preprocess", signal);
    const selection = validatePreprocessedTarget(summary, paragraphs, config2);
    if (selection) {
      logStage(config2, "preprocessing_done", {
        summaryLength: selection.summary.length,
        candidateCount: paragraphs.length,
        selectedCount: selection.selectedParagraphs.length,
        selectedParagraphs: selection.selectedParagraphs,
        cameraNotes: selection.cameraNotes
      });
      return {
        source: routedTargetSource(rawTarget, selection),
        selectedParagraphs: selection.selectedParagraphs
      };
    }
    logStage(config2, "preprocessing_fallback", { reason: "invalid_selection", summaryLength: cleanString2(summary).length }, "warn");
  } catch (error51) {
    throwIfAborted(signal);
    logStage(config2, "preprocessing_fallback", { reason: error51 instanceof Error ? error51.message : String(error51) }, "warn");
  }
  return { source: rawTarget, selectedParagraphs: allParagraphs };
}
async function preprocessTargetParagraphs(parserConnection, config2, paragraphs, context, userId, signal) {
  return (await preprocessTarget(parserConnection, config2, paragraphs, context, userId, signal)).source;
}
function terminalParagraphNumber(value) {
  const match = String(value ?? "").match(/\d+/);
  if (!match)
    return null;
  const paragraph = Number(match[0]);
  return Number.isSafeInteger(paragraph) && paragraph > 0 ? paragraph : null;
}
function terminalStateIssues(payload, config2, currentParagraphs, required2) {
  if (!required2)
    return [];
  const terminal = asRecord(payload.terminalState);
  if (Object.keys(terminal).length === 0)
    return ["terminalState is missing or is not an object"];
  const finalParagraph = currentParagraphs.at(-1);
  if (finalParagraph && terminalParagraphNumber(terminal.paragraph) !== finalParagraph) {
    return [`terminalState.paragraph must reference final source paragraph P${finalParagraph}`];
  }
  const issues = [];
  if (!Array.isArray(terminal.characters))
    issues.push("terminalState.characters must be an array");
  if (config2.promptStyle === "anima") {
    if (!terminal.environment || typeof terminal.environment !== "object" || Array.isArray(terminal.environment)) {
      issues.push("terminalState.environment must remain an object");
    }
  } else if (!Object.prototype.hasOwnProperty.call(terminal, "place")) {
    issues.push("terminalState.place is required for Default prompt style");
  }
  return issues;
}
function terminalStateRepairInstruction(issues, config2, currentParagraphs) {
  const finalParagraph = currentParagraphs.at(-1);
  return [
    "Repair or add only the non-rendered terminalState object while preserving every existing scene and shot exactly. Return the complete JSON object and no other text.",
    finalParagraph ? `Set terminalState.paragraph to P${finalParagraph}, the final original numbered paragraph.` : "Use the final original numbered paragraph for terminalState.paragraph.",
    config2.promptStyle === "anima" ? "terminalState contains paragraph, a complete environment object, environmentChanges, and characters still present after all source paragraphs." : "terminalState contains paragraph, place, environmentChanges, and characters still present after all source paragraphs.",
    "Terminal characters contain only name, label, age, appearance, body, attire, attireInferred, sources, and visualChanges. Never add actions, expressions, camera, composition, or rendering fields.",
    "Use the full current source chronology. Later source changes override earlier illustrated scenes.",
    `Problems to repair:
- ${issues.join(`
- `)}`
  ].join(`
`);
}
function payloadRepairInput(payload, currentSource, includeCurrentSource) {
  if (!includeCurrentSource)
    return JSON.stringify(payload);
  return [
    "## Current Numbered Paragraph Source",
    currentSource,
    "## JSON to Repair",
    JSON.stringify(payload)
  ].join(`

`);
}
async function parsePayloadWithRepair(parserConnection, config2, messages, userId, signal, payloadContext) {
  const validatedContext = payloadContext ? validateParserPayloadContext(payloadContext) : undefined;
  const raw = await generateParserText(parserConnection, config2, messages, userId, "main", signal);
  if (!raw.trim())
    throw new Error("Parser returned an empty response.");
  const inferredCurrentParagraphs = validatedContext ? [] : currentParagraphReferences(messages);
  const inferredRoutedParagraphs = validatedContext ? [] : routedParagraphReferences(messages);
  const currentSource = validatedContext?.currentSource ?? currentSourceText(messages);
  const currentParagraphs = validatedContext?.currentParagraphs ?? inferredCurrentParagraphs;
  const allowedParagraphs = validatedContext?.allowedParagraphs ?? (inferredRoutedParagraphs.length > 0 ? inferredRoutedParagraphs : inferredCurrentParagraphs);
  const requireDynamicProjection = validatedContext?.requireDynamicProjection ?? messages.some((message) => message.role === "system" && message.content.includes("shotPlan.primaryAction"));
  const requireTerminalState = validatedContext?.requireTerminalState ?? messages.some((message) => message.role === "system" && message.content.includes("## Terminal Visual State"));
  const fallbackParagraph = allowedParagraphs.length === 1 ? allowedParagraphs[0] : undefined;
  let repairSystem = "Repair malformed JSON. Return only valid JSON.";
  let repairInput = raw;
  try {
    logStage(config2, "json_parse_start", { rawLength: raw.length, repair: false });
    const parsed = normalizeAtomicCompositionTerms(dedupeExactShotCharacters(recoverSceneParagraphs(parseParserJson(raw), fallbackParagraph)));
    const structuralIssues = structuralPayloadIssues(parsed, allowedParagraphs);
    const terminalIssues = terminalStateIssues(parsed, config2, currentParagraphs, requireTerminalState);
    if (structuralIssues.length > 0) {
      repairSystem = [
        structuralRepairInstruction(structuralIssues, allowedParagraphs),
        ...terminalIssues.length > 0 ? [terminalStateRepairInstruction(terminalIssues, config2, currentParagraphs)] : []
      ].join(`

`);
      repairInput = payloadRepairInput(parsed, currentSource, terminalIssues.length > 0);
      throw new Error("Parser payload has no usable numbered shots.");
    }
    const locallyRepaired = repairDynamicProjectionLocally(parsed, config2, requireDynamicProjection);
    const issues = modePayloadIssues(locallyRepaired, config2, requireDynamicProjection);
    if (terminalIssues.length > 0) {
      repairSystem = [
        terminalStateRepairInstruction(terminalIssues, config2, currentParagraphs),
        ...issues.length > 0 ? [modeRepairInstruction(parsed, config2, issues, requireDynamicProjection)] : []
      ].join(`

`);
      repairInput = payloadRepairInput(parsed, currentSource, true);
      throw new Error("Terminal visual state is incomplete.");
    }
    if (issues.length > 0) {
      repairSystem = modeRepairInstruction(parsed, config2, issues, requireDynamicProjection);
      repairInput = coverPayloadIssues(parsed, config2).length > 0 ? payloadRepairInput(parsed, currentSource, true) : JSON.stringify(parsed);
      throw new Error("Mode-specific payload is incomplete.");
    }
    logStage(config2, "json_parse_done", { repair: false });
    return locallyRepaired;
  } catch {
    logStage(config2, "json_parse_failed", { rawLength: raw.length, repairWillRun: true }, "warn");
    const repaired = await generateParserText(parserConnection, config2, [
      { role: "system", content: repairSystem },
      { role: "user", content: repairInput }
    ], userId, "repair", signal);
    if (!repaired.trim())
      throw new Error("Parser returned an empty repair response.");
    const parsed = normalizeAtomicCompositionTerms(dedupeExactShotCharacters(recoverSceneParagraphs(parseParserJson(repaired), fallbackParagraph)));
    const structuralIssues = structuralPayloadIssues(parsed, allowedParagraphs);
    if (structuralIssues.length > 0) {
      throw new Error(`Parser did not return usable numbered scenes: ${structuralIssues.join("; ")}`);
    }
    const locallyRepaired = repairDynamicProjectionLocally(parsed, config2, requireDynamicProjection);
    const remainingIssues = modePayloadIssues(locallyRepaired, config2, requireDynamicProjection);
    const remainingTerminalIssues = terminalStateIssues(parsed, config2, currentParagraphs, requireTerminalState);
    if (remainingIssues.length > 0 || remainingTerminalIssues.length > 0) {
      throw new Error(`Parser did not return a complete payload: ${[...remainingIssues, ...remainingTerminalIssues].join("; ")}`);
    }
    logStage(config2, "json_parse_done", { repair: true });
    return locallyRepaired;
  }
}
async function repairDynamicCameraDiversity(parserConnection, config2, payload, targetSource, userId, signal) {
  const audit = auditDynamicCameraDiversity(payload, config2);
  logStage(config2, "camera_diversity_audit", audit);
  if (audit.exactCollisions.length === 0)
    return payload;
  const hasProjectedDynamicShot = normalizeScenePayload(payload).some(({ shot }) => {
    const perspective = config2.adaptiveMode ? cleanString2(shot.perspectiveMode).toLowerCase() : config2.perspectiveMode;
    return perspective === "dynamic" && Boolean(cleanString2(asRecord(shot.shotPlan).primaryAction));
  });
  if (hasProjectedDynamicShot) {
    logStage(config2, "camera_diversity_soft_collision_preserved", {
      reason: "camera and crop-visible projection must remain aligned",
      signatures: audit.signatures,
      exactCollisions: audit.exactCollisions
    });
    return payload;
  }
  const local = repairDynamicCameraDiversityLocally(payload, config2, audit);
  if (local) {
    logStage(config2, "camera_diversity_repaired", {
      method: "local",
      before: audit.signatures,
      after: auditDynamicCameraDiversity(local, config2).signatures,
      remainingExactCollisions: 0
    });
    return local;
  }
  if (config2.fastMode) {
    logStage(config2, "camera_diversity_remote_repair_skipped", {
      reason: "fast_mode",
      signatures: audit.signatures,
      exactCollisions: audit.exactCollisions
    }, "warn");
    return payload;
  }
  try {
    const raw = await generateParserText(parserConnection, config2, [
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
    ], userId, "camera", signal);
    if (!raw.trim())
      throw new Error("empty camera repair response");
    const repaired = parseParserJson(raw);
    const merged = mergeDynamicCameraRepair(payload, repaired, config2, audit);
    if (!merged)
      throw new Error("camera repair did not safely reduce exact collisions");
    const repairedAudit = auditDynamicCameraDiversity(merged, config2);
    logStage(config2, "camera_diversity_repaired", {
      before: audit.signatures,
      after: repairedAudit.signatures,
      remainingExactCollisions: repairedAudit.exactCollisions.length,
      pairRepetitions: repairedAudit.pairRepetitions
    });
    return merged;
  } catch (error51) {
    throwIfAborted(signal);
    logStage(config2, "camera_diversity_repair_fallback", {
      reason: error51 instanceof Error ? error51.message : String(error51),
      preservedSignatures: audit.signatures
    }, "warn");
    return payload;
  }
}

// src/backend/rendering.ts
function normalizedInlaySlots(record2) {
  if (record2.slots)
    return record2.slots;
  const count = Math.max(record2.imageUrls?.length || 0, record2.paragraphs?.length || 0, record2.slotStatuses?.length || 0);
  return Array.from({ length: count }, (_value, index) => ({
    imageId: record2.imageIds?.[index] || "",
    imageUrl: record2.imageUrls?.[index] || "",
    prompt: record2.prompts?.[index] || "",
    negativePrompt: record2.negativePrompts?.[index] || "",
    perspectiveMode: record2.perspectiveModes?.[index],
    perspectiveSource: record2.perspectiveSources?.[index],
    creativeConcept: record2.creativeConcepts?.[index],
    placement: record2.placements?.[index] || "paragraph",
    paragraph: record2.paragraphs?.[index],
    status: record2.slotStatuses?.[index]
  }));
}
function imageUrlFromId(imageId) {
  return `/api/v1/image-gen/results/${encodeURIComponent(imageId)}`;
}
function htmlAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r\n?|\n/g, "&#10;");
}
function renderInlayBlock(url2, _prompt, _negativePrompt, perspectiveMode, _perspectiveSource, _creativeConcept, imageId, chatId, messageId, swipeId, index, config2, placement = "paragraph", illustrationNumber = index + 1) {
  const label = placement === "cover" ? "Cover image" : `Inlay ${illustrationNumber}`;
  const asset = perspectiveMode === "asset";
  const width = clampInt2(asset ? config2.assetImageWidth : placement === "cover" ? config2.coverImageWidth : config2.inlayImageWidth, 120, 2400, asset ? DEFAULT_CONFIG.assetImageWidth : placement === "cover" ? DEFAULT_CONFIG.coverImageWidth : DEFAULT_CONFIG.inlayImageWidth);
  const maxHeight = clampInt2(placement === "cover" ? config2.coverImageMaxHeightVh : config2.inlayImageMaxHeightVh, 10, 100, placement === "cover" ? DEFAULT_CONFIG.coverImageMaxHeightVh : DEFAULT_CONFIG.inlayImageMaxHeightVh);
  return `${MARKER}
<div class="inlay-illustrator-image" data-inlay-illustrator="true" style="display:flex;justify-content:center;align-items:center;margin:10px 0;width:100%;"><img src="${htmlAttr(url2)}" alt="${htmlAttr(label)}" data-inlay-illustrator-image-id="${htmlAttr(imageId)}" data-inlay-illustrator-chat-id="${htmlAttr(chatId)}" data-inlay-illustrator-message-id="${htmlAttr(messageId)}" data-inlay-illustrator-swipe-id="${swipeId}" data-inlay-illustrator-image-index="${index}" style="display:block;width:min(100%, ${width}px);max-height:${maxHeight}vh;height:auto;object-fit:contain;border-radius:8px;cursor:zoom-in;"/></div>`;
}
function renderSlotPlaceholder(status, index, placement = "paragraph", illustrationNumber = index + 1) {
  const subject = placement === "cover" ? "Cover image" : `Illustration ${illustrationNumber}`;
  const label = status === "failed" ? `${subject} failed. Use Generate latest to retry.` : status === "cancelled" ? `${subject} cancelled.` : `Generating ${subject.toLowerCase()}…`;
  return `${MARKER}
<div class="inlay-illustrator-placeholder" data-inlay-illustrator="true" data-inlay-illustrator-image-index="${index}" role="status">${htmlAttr(label)}</div>`;
}
function renderInlaidMessage(original, record2, config2) {
  const cleanOriginal = stripInlayContent(original);
  const blocks = new Map;
  const coverBlocks = [];
  const count = Math.max(1, paragraphCount(cleanOriginal));
  const slots = normalizedInlaySlots(record2);
  for (const [index, slot] of slots.entries()) {
    const url2 = slot.imageUrl || "";
    const status = slot.status;
    if (!url2 && !status)
      continue;
    const placement = slot.placement === "cover" ? "cover" : "paragraph";
    const illustrationNumber = slots.slice(0, index + 1).filter((candidate) => candidate.placement !== "cover").length;
    const paragraph2 = clampInt2(slot.paragraph, 1, count, Math.min(index + 1, count));
    const existing = placement === "cover" ? coverBlocks : blocks.get(paragraph2) || [];
    existing.push(url2 ? renderInlayBlock(url2, slot.prompt || "", slot.negativePrompt || "", slot.perspectiveMode, slot.perspectiveSource, slot.creativeConcept, slot.imageId || "", record2.chatId || "", record2.messageId || "", record2.swipeId || 0, index, config2, placement, illustrationNumber) : renderSlotPlaceholder(status || "pending", index, placement, illustrationNumber));
    if (placement === "paragraph")
      blocks.set(paragraph2, existing);
  }
  const tokens = cleanOriginal.trimEnd().split(/(\r?\n\s*\r?\n)/);
  let paragraph = 0;
  const output = [];
  if (coverBlocks.length)
    output.push(`${coverBlocks.join(`

`)}

`);
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
  const unused = [...blocks.entries()].filter(([number4]) => number4 > paragraph).flatMap(([, inlays]) => inlays);
  if (unused.length)
    output.push(`

${unused.join(`

`)}`);
  return output.join("");
}

// src/backend/runtime-lock.ts
var REGISTRY_KEY2 = Symbol.for("inlay-illustrator.runtime-locks");
var globalRegistry3 = globalThis;
function registry2() {
  const existing = globalRegistry3[REGISTRY_KEY2];
  if (existing && typeof existing === "object" && existing.locks instanceof Set) {
    return existing;
  }
  const created = { locks: new Set };
  globalRegistry3[REGISTRY_KEY2] = created;
  return created;
}
function tryAcquireRuntimeLock(scope, key) {
  const lockKey = `${scope}:${key}`;
  const locks = registry2().locks;
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
function sameImageUrl(stored, requested) {
  if (!stored || !requested)
    return false;
  return stored === requested || requested.endsWith(stored) || stored.endsWith(requested);
}
async function locateStoredGeneratedImage(state, request, userId, hydrateWorkflows = true) {
  const direct = request.imageId ? state.generatedImageIndex?.[`id:${request.imageId}`] : request.imageUrl ? state.generatedImageIndex?.[`url:${request.imageUrl}`] : undefined;
  const exactKey = request.messageId && request.swipeId !== undefined ? `${request.chatId}:${request.messageId}:${request.swipeId}` : "";
  const candidates = [...new Set([
    direct?.key,
    exactKey && state.generated[exactKey] ? exactKey : undefined,
    ...Object.keys(state.generated)
  ].filter((value) => Boolean(value)))];
  for (const key of candidates) {
    const record2 = await loadGeneratedRecord(state.generated[key], userId, hydrateWorkflows);
    if (!record2 || record2.chatId !== request.chatId)
      continue;
    if (request.messageId && record2.messageId !== request.messageId)
      continue;
    if (request.swipeId !== undefined && record2.swipeId !== request.swipeId)
      continue;
    const preferredIndex = direct?.key === key ? direct.index : request.imageIndex;
    if (preferredIndex !== undefined && Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < record2.slots.length) {
      const slot = record2.slots[preferredIndex];
      const idMatches = !request.imageId || slot.imageId === request.imageId;
      const urlMatches = !request.imageUrl || sameImageUrl(slot.imageUrl, request.imageUrl);
      if (idMatches && urlMatches)
        return { key, record: record2, index: preferredIndex };
    }
    const matchedIndex = record2.slots.findIndex((slot) => request.imageId && slot.imageId === request.imageId || request.imageUrl && sameImageUrl(slot.imageUrl, request.imageUrl));
    if (matchedIndex >= 0)
      return { key, record: record2, index: matchedIndex };
  }
  throw new Error("The selected image is not present in this chat's generated-image history.");
}
async function getStoredImageDetails(request, userId) {
  const state = await getState(request.chatId, userId);
  const located = await locateStoredGeneratedImage(state, request, userId, false);
  const slot = located.record.slots[located.index];
  const concept = slot.creativeConcept;
  return {
    prompt: slot.prompt,
    negativePrompt: slot.negativePrompt,
    perspectiveMode: slot.perspectiveMode || null,
    perspectiveSource: slot.perspectiveSource || null,
    creativeConcept: concept ? `${concept.anchor}: ${concept.concept}` : ""
  };
}
function compactLorebookNeedsFullRetry(payload, snapshot) {
  if (!snapshot.compacted || !snapshot.hasCharacterVisualReference)
    return false;
  const characters = normalizeScenePayload(payload).flatMap(({ shot }) => cleanArray(shot.characters));
  if (characters.length === 0)
    return false;
  return !characters.some((character) => [character.identity, character.appearance, character.body, character.attire].some((value) => cleanString2(value)));
}
function retryClassification(error51) {
  const message = error51 instanceof Error ? error51.message : String(error51);
  if (/\b(?:401|403|404)\b|unauthori[sz]ed|forbidden|connection not found|select a parser connection/i.test(message)) {
    return "terminal";
  }
  if (/\b(?:408|409|425|429|500|502|503|504|520|522|523|524|525)\b|timeout|timed out|handshake|temporar|rate limit/i.test(message)) {
    return "transient";
  }
  if (/\b400\b.*(?:invalid argument|bad request)/i.test(message))
    return "terminal";
  return "context";
}
async function waitForParserRetry(attempt, signal) {
  const delay = Math.min(1500, 250 * 2 ** attempt) + Math.floor(Math.random() * 125);
  await new Promise((resolve, reject) => {
    const complete = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timeout = setTimeout(complete, delay);
    const cancel = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      reject(abortError());
    };
    if (signal?.aborted)
      cancel();
    else
      signal?.addEventListener("abort", cancel, { once: true });
  });
}
async function parseAndSelectPrompts(input) {
  const { chatId, messageId, messages, paragraphs, state, config: config2, userId, signal } = input;
  throwIfAborted(signal);
  const targetIndex = Math.max(0, messages.findIndex((message) => message.id === messageId));
  let parsed = null;
  let selected = [];
  let lastParserError = null;
  let conceptCandidates = [...input.creativeCandidates || []];
  let conceptSelections = null;
  let ideationAttempted = false;
  let creativeTarget = null;
  let canonicalPlan = null;
  const usedConceptIds = new Set(input.usedCreativeConceptIds || []);
  const manualCreative = !config2.adaptiveMode && config2.perspectiveMode === "creative";
  const creativePipeline = manualCreative || config2.adaptiveMode;
  const [parserConnection, lorebookSnapshot, contextSources] = await Promise.all([
    input.preparedParserConnection || resolveParserConnection(config2, userId),
    buildLorebookContextSnapshot(chatId, paragraphs.map((paragraph) => paragraph.text).join(`

`), config2, userId),
    loadParserContextSources(chatId, config2, userId, {
      fastBootstrapCharacter: input.fastBootstrapCharacter === true
    })
  ]);
  await ensureAvatarVisualSupplement({
    chatId,
    character: contextSources.character,
    canonicalTags: state.characterAppearance,
    connection: parserConnection,
    config: config2,
    state,
    userId,
    signal
  });
  for (let attempt = 0;attempt <= config2.parserRetries; attempt += 1) {
    try {
      canonicalPlan = null;
      throwIfAborted(signal);
      const context = await buildParserContext(chatId, messages, targetIndex, state.characterAppearance, config2, attempt, userId, lorebookSnapshot, config2.previousVisualStateEnabled ? state.previousVisualState : undefined, contextSources);
      if (manualCreative && conceptSelections === null) {
        if (config2.fastMode) {
          logStage(config2, "creative_ideation_skipped", { reason: "fast_mode", mode: "manual_creative" });
          conceptSelections = new Map;
        } else {
          if (!hasUnusedCreativeConcepts(conceptCandidates, usedConceptIds) && !ideationAttempted) {
            const previousConcepts = conceptCandidates.filter((concept) => usedConceptIds.has(concept.id)).map((concept) => concept.concept);
            conceptCandidates = await generateCreativeConcepts(parserConnection, config2, paragraphs, formatTargetParagraphs(paragraphs), context, previousConcepts, userId, signal);
            ideationAttempted = true;
          }
          conceptSelections = chooseCreativeConcepts(conceptCandidates, usedConceptIds);
          if (conceptSelections.size === 0 && conceptCandidates.length > 0) {
            conceptSelections = chooseCreativeConcepts(conceptCandidates);
          }
        }
      }
      if (creativePipeline && creativeTarget === null) {
        const candidateParagraphs = new Set(conceptCandidates.map((concept) => concept.paragraph));
        if (manualCreative && config2.preprocessingEnabled && candidateParagraphs.size > 0) {
          const selectedParagraphs = [...candidateParagraphs].sort((left, right) => left - right);
          const notes = selectedParagraphs.map((paragraph) => {
            const concept = conceptSelections?.get(paragraph) || conceptCandidates.find((candidate) => candidate.paragraph === paragraph);
            return `[P${paragraph}]: Visual thesis: ${concept?.concept || concept?.anchor || "selected Creative focal beat"}; Camera intent: ${concept?.camera || "identity-safe Creative framing"}`;
          });
          creativeTarget = {
            source: routedTargetSource(formatTargetParagraphs(paragraphs), {
              summary: notes.join(`
`),
              selectedParagraphs,
              cameraNotes: selectedParagraphs.map((paragraph) => conceptSelections?.get(paragraph)?.camera || conceptCandidates.find((candidate) => candidate.paragraph === paragraph)?.camera || "identity-safe Creative framing")
            }),
            selectedParagraphs
          };
          logStage(config2, "creative_preprocessing_done", {
            candidateCount: conceptCandidates.length,
            selectedParagraphs
          });
        } else {
          creativeTarget = await preprocessTarget(parserConnection, config2, paragraphs, context, userId, signal);
        }
      }
      const target = creativePipeline ? creativeTarget || {
        source: formatTargetParagraphs(paragraphs),
        selectedParagraphs: paragraphs.map((paragraph) => paragraph.parserIndex)
      } : await preprocessTarget(parserConnection, config2, paragraphs, context, userId, signal);
      const targetSource = target.source;
      const instruction = parserInstruction(config2, {
        hasPreviousVisualState: Boolean(config2.previousVisualStateEnabled && state.previousVisualState)
      });
      const referenceContext = continuityReference(context.systemContext, context.recentContext);
      const userRequest = parserUserRequest(targetSource, manualCreative ? creativeConceptConstraint(conceptSelections || new Map, false) : "");
      logStage(config2, "parser_prompt_built", {
        attempt,
        instructionLength: instruction.length,
        systemContextLength: context.systemContext.length,
        recentContextLength: context.recentContext.length,
        overrideLength: context.override.length,
        parserParagraphs: paragraphs.length,
        cacheCharacters: Object.keys(state.characterAppearance).length,
        promptStyle: config2.promptStyle,
        promptSyntax: config2.promptSyntax,
        adaptiveMode: config2.adaptiveMode,
        perspectiveMode: config2.perspectiveMode,
        maxCharacters: config2.maxCharacters,
        preprocessingEnabled: config2.preprocessingEnabled,
        contextDiagnostics: context.diagnostics
      });
      parsed = await parsePayloadWithRepair(parserConnection, config2, parserMessages(instruction, referenceContext, userRequest, context.override), userId, signal, {
        currentSource: formatTargetParagraphs(paragraphs),
        currentParagraphs: paragraphs.map((paragraph) => paragraph.parserIndex),
        allowedParagraphs: target.selectedParagraphs,
        requireDynamicProjection: config2.promptStyle === "anima" && (config2.adaptiveMode || config2.perspectiveMode === "dynamic"),
        requireTerminalState: true
      });
      parsed = applyPreviousVisualState(parsed, config2.previousVisualStateEnabled ? state.previousVisualState : undefined);
      parsed = await repairDynamicCameraDiversity(parserConnection, config2, parsed, targetSource, userId, signal);
      parsed = applyAvatarVisualSupplements(parsed, state.avatarVisualSupplements);
      if (config2.adaptiveMode && config2.fastMode) {
        logStage(config2, "creative_ideation_skipped", { reason: "fast_mode", mode: "adaptive" });
        conceptSelections = new Map;
      } else if (config2.adaptiveMode) {
        const creativeParagraphs = new Set(normalizeScenePayload(parsed).filter(({ shot }) => cleanString2(shot.perspectiveMode).toLowerCase() === "creative").map(({ parserParagraph }) => parserParagraph));
        if (creativeParagraphs.size > 0) {
          const creativeParagraphEntries = paragraphs.filter((paragraph) => creativeParagraphs.has(paragraph.parserIndex));
          if (!hasUnusedCreativeConcepts(conceptCandidates, usedConceptIds) && !ideationAttempted) {
            const previousConcepts = conceptCandidates.filter((concept) => usedConceptIds.has(concept.id)).map((concept) => concept.concept);
            conceptCandidates = await generateCreativeConcepts(parserConnection, config2, creativeParagraphEntries, formatTargetParagraphs(creativeParagraphEntries), context, previousConcepts, userId, signal);
            ideationAttempted = true;
          }
          conceptSelections = chooseCreativeConcepts(conceptCandidates.filter((concept) => creativeParagraphs.has(concept.paragraph)), usedConceptIds);
          if (conceptSelections.size === 0 && conceptCandidates.length > 0) {
            conceptSelections = chooseCreativeConcepts(conceptCandidates.filter((concept) => creativeParagraphs.has(concept.paragraph)));
          }
        } else {
          conceptSelections = new Map;
        }
      }
      const canonicalSelection = planAndCompilePrompts(parsed, config2.previousVisualStateEnabled ? state.previousVisualState : undefined, paragraphs, config2, conceptSelections || new Map, conceptCandidates);
      canonicalPlan = canonicalSelection.plan;
      selected = canonicalSelection.selected;
      if (selected.length === 0)
        throw new Error("No usable prompts were parsed.");
      logStage(config2, "canonical_plan_resolved", {
        shots: canonicalPlan.shots.length,
        characters: canonicalPlan.shots.reduce((total, shot) => total + shot.characters.length, 0),
        paragraphs: [...new Set(canonicalPlan.shots.map((shot) => shot.paragraph))],
        terminalCharacters: canonicalPlan.terminalContinuity.characters.length,
        renderer: "canonical"
      });
      const cover = selectCoverPromptEntry(parsed, paragraphs, config2);
      if (cover)
        selected = [cover, ...selected];
      if (attempt === 0 && config2.parserRetries > 0 && compactLorebookNeedsFullRetry(parsed, lorebookSnapshot)) {
        throw new Error("Compact lorebook context did not produce durable character tags; retrying with full lorebook context.");
      }
      break;
    } catch (error51) {
      throwIfAborted(signal);
      lastParserError = error51;
      const classification = retryClassification(error51);
      logStage(config2, "parser_attempt_failed", { attempt, retries: config2.parserRetries, classification, error: error51 instanceof Error ? error51.message : String(error51) }, attempt >= config2.parserRetries ? "error" : "warn");
      if (attempt >= config2.parserRetries || classification === "terminal")
        throw error51;
      if (classification === "transient")
        await waitForParserRetry(attempt, signal);
    }
  }
  if (!parsed)
    throw new Error(lastParserError instanceof Error ? lastParserError.message : "Parser did not return usable prompts.");
  return { parsed, selected, plan: canonicalPlan };
}
function logParsedSelection(parsed, selected, paragraphs, config2) {
  const scenes = parsed.scenes || [];
  const normalized = normalizeScenePayload(parsed);
  logStage(config2, "parsed_payload_summary", {
    sceneCount: scenes.length,
    normalizedCount: normalized.length,
    parserParagraphs: normalized.map((entry) => entry.parserParagraph),
    rejectedParagraphs: normalized.map((entry) => entry.parserParagraph).filter((paragraph) => paragraph < 1 || paragraph > paragraphs.length),
    charactersPerShot: normalized.map((entry) => cleanArray(entry.shot.characters).length)
  });
  logStage(config2, "prompt_selection_done", {
    promptCount: normalized.length,
    selectedCount: selected.length,
    parserParagraphs: selected.map((entry) => entry.parserParagraph),
    originalParagraphs: selected.map((entry) => entry.paragraph),
    placements: selected.map((entry) => entry.placement || "paragraph"),
    promptLengths: selected.map((entry) => renderPrompt(entry.prompt, config2.promptSyntax).length),
    negativeLengths: selected.map((entry) => entry.negative.length),
    perspectives: selected.map((entry) => ({ mode: entry.perspectiveMode, source: entry.perspectiveSource }))
  });
}
var MESSAGE_COMMIT_REGISTRY_KEY = Symbol.for("inlay-illustrator.message-commit-queues");
var messageCommitGlobal = globalThis;
function messageCommitQueues() {
  const existing = messageCommitGlobal[MESSAGE_COMMIT_REGISTRY_KEY];
  if (existing?.queues instanceof Map)
    return existing.queues;
  const created = { queues: new Map };
  messageCommitGlobal[MESSAGE_COMMIT_REGISTRY_KEY] = created;
  return created.queues;
}
function enqueueMessageWrite(userId, chatId, messageId, task) {
  const queues = messageCommitQueues();
  const queueKey = JSON.stringify([userId ?? null, chatId, messageId]);
  const previous = queues.get(queueKey) || Promise.resolve();
  const operation = previous.then(task, task);
  const tail = operation.then(() => {
    return;
  }, () => {
    return;
  });
  queues.set(queueKey, tail);
  tail.finally(() => {
    if (queues.get(queueKey) === tail)
      queues.delete(queueKey);
  });
  return operation;
}
function enqueueMessageCommit(context, task) {
  return enqueueMessageWrite(context.userId, context.chatId, context.messageId, task);
}
function sourceContentFingerprint(content) {
  let left = 2166136261;
  let right = 2246822519;
  for (let index = 0;index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    left = Math.imul(left ^ code, 16777619);
    right = Math.imul(right ^ code, 3266489917);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}
function reportGenerationProgress(operation, stage, userId, detail) {
  operation.stage = stage;
  spindle.sendToFrontend({
    type: "generation_progress",
    operationId: operation.id,
    chatId: operation.chatId,
    messageId: operation.messageId,
    stage,
    completed: operation.completed,
    total: operation.total,
    detail
  }, userId);
}
function pendingGenerationRecord(context, selected, parsed, plan) {
  return {
    schemaVersion: 3,
    chatId: context.chatId,
    messageId: context.messageId,
    swipeId: context.swipeId,
    slots: selected.map((entry) => ({
      prompt: renderPrompt(entry.prompt, context.config.promptSyntax),
      negativePrompt: entry.negative || "",
      perspectiveMode: entry.perspectiveMode,
      perspectiveSource: entry.perspectiveSource,
      paragraph: entry.paragraph,
      imageId: "",
      imageUrl: "",
      imageParameters: {},
      corePrompt: renderPrompt(entry.corePrompt, context.config.promptSyntax),
      shotNegative: entry.shotNegative,
      promptFormat: entry.corePrompt.format || "ordered",
      creativeConcept: entry.creativeConcept || null,
      creativeConceptCandidates: entry.creativeCandidates || [],
      creativeConceptHistory: entry.creativeConcept ? [entry.creativeConcept.id] : [],
      placement: entry.placement || "paragraph",
      status: "pending"
    })),
    operationId: context.operation.id,
    generationStatus: "pending",
    sourceFingerprint: context.sourceFingerprint,
    rawJson: parsed,
    ...plan ? { illustrationPlan: plan } : {},
    createdAt: new Date().toISOString()
  };
}
function currentSwipe(message) {
  return Number.isFinite(Number(message.swipe_id)) ? Number(message.swipe_id) : 0;
}
function matchesGenerationSource(message, swipeId, fingerprint) {
  return message.role === "assistant" && currentSwipe(message) === swipeId && sourceContentFingerprint(stripInlayContent(String(message.content || ""))) === fingerprint;
}
function assertCurrentSource(message, context) {
  if (!message || message.role !== "assistant")
    throw new Error("The source assistant message no longer exists.");
  if (currentSwipe(message) !== context.swipeId)
    throw new Error("The source message changed swipes while illustrations were generating.");
  if (!matchesGenerationSource(message, context.swipeId, context.sourceFingerprint)) {
    throw new Error("The source message was edited while illustrations were generating.");
  }
}
function recordMetadata(message, record2) {
  return {
    ...message.metadata || {},
    inlayIllustratorImageIds: record2.slots.map((slot) => slot.imageId),
    inlayIllustratorParagraphs: record2.slots.map((slot) => slot.paragraph),
    inlayIllustratorGeneratedAt: record2.createdAt,
    inlayIllustratorOperationId: record2.operationId,
    inlayIllustratorGenerationStatus: record2.generationStatus
  };
}
async function renderProgressiveRecord(message, record2, context) {
  await spindle.chat.updateMessage(context.chatId, context.messageId, {
    content: renderInlaidMessage(String(message.content || ""), record2, context.config),
    metadata: recordMetadata(message, record2),
    skipChunkRebuild: true
  });
}
async function initializeProgressiveGeneration(context, record2) {
  await enqueueMessageCommit(context, async () => {
    const messages = await spindle.chat.getMessages(context.chatId);
    const current = messages.find((message) => message.id === context.messageId);
    assertCurrentSource(current, context);
    const reference = await storeGeneratedRecord(context.chatId, context.key, record2, context.userId);
    const committed = await updateState(context.chatId, context.userId, async (state) => {
      await migrateLegacyGeneratedRecords(context.chatId, state, context.userId);
      updateCharacterMemory(state, record2.rawJson);
      state.generated[context.key] = reference;
      rebuildGeneratedImageIndex(state);
    });
    await renderProgressiveRecord(current, record2, context);
    spindle.sendToFrontend({
      type: "character_memory_updated",
      chatId: context.chatId,
      characterAppearance: committed.characterAppearance
    }, context.userId);
  });
}
async function mutateProgressiveGeneration(context, mutate, mutateState) {
  return enqueueMessageCommit(context, async () => {
    const messages = await spindle.chat.getMessages(context.chatId);
    const currentMessage = messages.find((message) => message.id === context.messageId);
    assertCurrentSource(currentMessage, context);
    let committedRecord = null;
    await updateState(context.chatId, context.userId, async (state) => {
      const currentRecord = await loadGeneratedRecord(state.generated[context.key], context.userId, false);
      if (!currentRecord || currentRecord.operationId !== context.operation.id) {
        throw new Error("A newer illustration operation replaced this generation.");
      }
      committedRecord = mutate(currentRecord);
      state.generated[context.key] = await storeGeneratedRecord(context.chatId, context.key, committedRecord, context.userId);
      mutateState?.(state, committedRecord);
      rebuildGeneratedImageIndex(state);
    });
    const record2 = committedRecord;
    if (!record2)
      throw new Error("The progressive illustration record could not be persisted.");
    await renderProgressiveRecord(currentMessage, record2, context);
    return record2;
  });
}
async function commitProgressiveSlot(context, job, settlement) {
  const cancelled = context.operation.controller.signal.aborted;
  const providerResult = settlement.status === "fulfilled" ? settlement.value : null;
  const imageId = cancelled ? "" : providerResult?.imageId || "";
  const imageUrl = cancelled ? "" : providerResult?.imageUrl || (imageId ? imageUrlFromId(imageId) : "");
  const completed = Boolean(imageUrl);
  const status = cancelled ? "cancelled" : completed ? "completed" : "failed";
  const reason = settlement.status === "rejected" ? settlement.reason instanceof Error ? settlement.reason.message : String(settlement.reason) : completed ? "" : "The image provider returned no image.";
  await mutateProgressiveGeneration(context, (record2) => ({
    ...record2,
    slots: record2.slots.map((slot, index) => index === job.index ? {
      ...slot,
      prompt: job.prompt,
      negativePrompt: job.negative,
      perspectiveMode: job.perspectiveMode || context.config.perspectiveMode,
      perspectiveSource: job.perspectiveSource || "manual",
      imageParameters: job.parameters,
      corePrompt: job.corePrompt || "",
      shotNegative: job.shotNegative || "",
      promptFormat: job.promptFormat || "ordered",
      creativeConcept: job.creativeConcept || null,
      creativeConceptCandidates: job.creativeCandidates || [],
      placement: job.placement || "paragraph",
      paragraph: job.paragraph,
      imageId,
      imageUrl,
      status,
      error: reason.slice(0, 500)
    } : slot)
  }));
  return completed;
}
async function finalizeProgressiveGeneration(context, parsed, successfulParserParagraphs, cancelled, plan) {
  const visualState = successfulParserParagraphs.length > 0 && !plan ? buildPreviousVisualState(parsed, successfulParserParagraphs) : null;
  const validatedVisualState = plan ? ContinuityStateSchema.parse(plan.terminalContinuity) : visualState ? ContinuityStateSchema.parse(visualState) : null;
  const terminalParagraphMatch = String(parsed.terminalState?.paragraph ?? "").match(/\d+/);
  const continuityParagraph = terminalParagraphMatch ? Number(terminalParagraphMatch[0]) : Math.max(1, ...successfulParserParagraphs);
  return mutateProgressiveGeneration(context, (record2) => {
    const slots = record2.slots.map((slot) => slot.status === "pending" || slot.status === "generating" ? { ...slot, status: cancelled ? "cancelled" : "failed" } : slot);
    const hasSuccess = slots.some((slot) => slot.status === "completed");
    return {
      ...record2,
      slots,
      generationStatus: cancelled ? "cancelled" : hasSuccess ? "completed" : "failed"
    };
  }, (state) => {
    if (successfulParserParagraphs.length > 0) {
      if (validatedVisualState) {
        const terminal = {
          ...validatedVisualState,
          updatedAt: validatedVisualState.updatedAt || new Date().toISOString()
        };
        state.previousVisualState = plan ? ContinuityStateSchema.parse(terminal) : reconcileContinuityState(state.previousVisualState, terminal, continuityParagraph);
      } else
        delete state.previousVisualState;
    }
  });
}
async function prepareAndDispatchImages(chatId, selected, config2, userId, preparedImageConnection, options = {}) {
  throwIfAborted(options.signal);
  const imageConnection = await (preparedImageConnection || resolveImageConnection(config2, userId));
  const preparationStartedAt = Date.now();
  logStage(config2, "image_generation_preparation_start", {
    total: selected.length,
    provider: imageConnection?.provider || "(default)",
    connectionId: imageConnection?.id || null
  });
  const eagerComfyQueueing = imageConnection?.provider === "comfyui";
  const submissionStartedAt = Date.now();
  return prepareAndDispatchImageJobs(selected, eagerComfyQueueing, async (entry, index) => {
    const jobStartedAt = Date.now();
    logStage(config2, "image_generation_preparation_job_start", { index: index + 1, total: selected.length, paragraph: entry.paragraph });
    const prompt = renderPrompt(entry.prompt, config2.promptSyntax);
    const corePrompt = renderPrompt(entry.corePrompt, config2.promptSyntax);
    const promptFormat = entry.corePrompt.format || "ordered";
    const parameters = await buildImageParameters(config2, imageConnection, prompt, entry.negative || "");
    const job = {
      index,
      total: selected.length,
      prompt,
      negative: entry.negative || "",
      corePrompt,
      shotNegative: entry.shotNegative,
      promptFormat,
      placement: entry.placement || "paragraph",
      paragraph: entry.paragraph,
      parserParagraph: entry.parserParagraph,
      perspectiveMode: entry.perspectiveMode,
      perspectiveSource: entry.perspectiveSource,
      creativeConcept: entry.creativeConcept,
      creativeCandidates: entry.creativeCandidates,
      parameters
    };
    logStage(config2, "image_generation_prepared", {
      index: index + 1,
      total: selected.length,
      paragraph: entry.paragraph,
      elapsedMs: Date.now() - jobStartedAt,
      preparationElapsedMs: Date.now() - preparationStartedAt,
      promptLength: prompt.length,
      parameterKeys: keysOf(parameters)
    });
    if (index === selected.length - 1) {
      logStage(config2, "image_generation_preparation_done", {
        total: selected.length,
        elapsedMs: Date.now() - preparationStartedAt,
        provider: imageConnection?.provider || "(default)"
      });
    }
    return job;
  }, (job) => {
    const submittedAt = Date.now();
    logStage(config2, "image_generation_request_submitted", {
      index: job.index + 1,
      total: job.total,
      paragraph: job.paragraph,
      provider: imageConnection?.provider || "(default)",
      dispatch: eagerComfyQueueing ? "eager_comfyui" : "sequential",
      elapsedMs: submittedAt - submissionStartedAt
    });
    return spindle.imageGen.generate({
      connection_id: config2.imageConnectionId || undefined,
      prompt: job.prompt,
      negativePrompt: job.negative || undefined,
      model: config2.imageModel || undefined,
      parameters: job.parameters,
      owner_chat_id: chatId,
      userId,
      includeDataUrl: false
    }).then((result) => {
      logStage(config2, "image_generation_completed", {
        index: job.index + 1,
        total: job.total,
        paragraph: job.paragraph,
        elapsedMs: Date.now() - submittedAt,
        imageId: result.imageId || null,
        provider: result.provider || imageConnection?.provider || null,
        model: result.model || null
      });
      return result;
    }, (error51) => {
      logStage(config2, "image_generation_failed", {
        index: job.index + 1,
        total: job.total,
        paragraph: job.paragraph,
        elapsedMs: Date.now() - submittedAt,
        error: error51 instanceof Error ? error51.message : String(error51)
      }, "error");
      throw error51;
    });
  }, options);
}
async function commitImageReplacement(request, replacement, config2, userId, parsedForMemory) {
  let committedKey = "";
  let committedIndex = -1;
  let committedRecord = null;
  const state = await updateState(request.chatId, userId, async (current) => {
    await migrateLegacyGeneratedRecords(request.chatId, current, userId);
    const located = await locateStoredGeneratedImage(current, request, userId);
    committedKey = located.key;
    committedIndex = located.index;
    const record3 = located.record;
    committedRecord = {
      ...record3,
      slots: record3.slots.map((slot, index) => index === located.index ? {
        ...slot,
        prompt: replacement.prompt,
        negativePrompt: replacement.negative,
        perspectiveMode: replacement.perspectiveMode,
        perspectiveSource: replacement.perspectiveSource,
        imageParameters: replacement.parameters,
        corePrompt: replacement.corePrompt,
        shotNegative: replacement.shotNegative,
        promptFormat: replacement.promptFormat,
        creativeConcept: replacement.creativeConcept,
        creativeConceptCandidates: replacement.creativeCandidates,
        creativeConceptHistory: replacement.creativeConceptHistory,
        paragraph: replacement.paragraph,
        imageId: replacement.imageId,
        imageUrl: replacement.imageUrl,
        status: "completed",
        error: ""
      } : slot)
    };
    current.generated[located.key] = await storeGeneratedRecord(request.chatId, located.key, committedRecord, userId);
    if (parsedForMemory)
      updateCharacterMemory(current, parsedForMemory);
    rebuildGeneratedImageIndex(current);
  });
  const record2 = committedRecord;
  if (!record2 || committedIndex < 0)
    throw new Error("The replacement image could not be persisted.");
  await enqueueMessageWrite(userId, request.chatId, record2.messageId, async () => {
    const latestState = await getState(request.chatId, userId);
    const latestRecord = await loadGeneratedRecord(latestState.generated[committedKey], userId, false) || record2;
    const messages = await spindle.chat.getMessages(request.chatId);
    const target = messages.find((message) => message.id === record2.messageId);
    if (!target)
      throw new Error("The source assistant message no longer exists.");
    await spindle.chat.updateMessage(request.chatId, record2.messageId, {
      content: renderInlaidMessage(String(target.content || ""), latestRecord, config2),
      metadata: recordMetadata(target, latestRecord),
      skipChunkRebuild: true
    });
  });
  if (parsedForMemory) {
    spindle.sendToFrontend({
      type: "character_memory_updated",
      chatId: request.chatId,
      characterAppearance: state.characterAppearance
    }, userId);
  }
  return { record: record2, index: committedIndex };
}
async function rerunStoredImage(request, rerunSidecar, userId, preparedConfig) {
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
    const config2 = preparedConfig || await getConfig(userId);
    const initialState = await getState(request.chatId, userId);
    const located = await locateStoredGeneratedImage(initialState, request, userId);
    const imageConnection = await resolveImageConnection(config2, userId);
    let replacement;
    let selectionForMemory;
    const originalSlot = located.record.slots[located.index];
    if (!originalSlot)
      throw new Error("The selected image slot no longer exists.");
    if (!rerunSidecar) {
      const corePrompt = originalSlot.corePrompt || "";
      const promptFormat = originalSlot.promptFormat || (config2.promptStyle === "default" ? "legacy" : "ordered");
      const prompt = corePrompt ? renderPromptWithCurrentAffixes(corePrompt, promptFormat, config2) : originalSlot.prompt || "";
      if (!prompt)
        throw new Error("The selected image has no stored prompt to reroll.");
      const shotNegative = originalSlot.shotNegative || "";
      const negative = renderNegativeWithCurrentSelection(shotNegative, promptFormat, config2);
      const originalParameters = originalSlot.imageParameters || await buildImageParameters(config2, imageConnection, prompt, negative);
      const parameters = rerollImageParameters(originalParameters, imageConnection, prompt, negative);
      const result = await spindle.imageGen.generate({
        connection_id: config2.imageConnectionId || undefined,
        prompt,
        negativePrompt: negative || undefined,
        model: config2.imageModel || undefined,
        parameters,
        owner_chat_id: request.chatId,
        userId,
        includeDataUrl: false
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
        paragraph: originalSlot.paragraph || 1,
        perspectiveMode: originalSlot.perspectiveMode || "dynamic",
        perspectiveSource: originalSlot.perspectiveSource || "manual",
        creativeConcept: originalSlot.creativeConcept || null,
        creativeCandidates: originalSlot.creativeConceptCandidates || [],
        creativeConceptHistory: originalSlot.creativeConceptHistory || [],
        parameters,
        imageId,
        imageUrl
      };
    } else {
      const messages = await spindle.chat.getMessages(request.chatId);
      const target = messages.find((message) => message.id === located.record.messageId);
      if (!target)
        throw new Error("The source assistant message no longer exists.");
      const originalParagraph = originalSlot.paragraph || 1;
      const isCover = originalSlot.placement === "cover";
      const allParagraphs = prepareParagraphs(String(target.content || ""), config2);
      const sourceParagraph = allParagraphs.find((paragraph) => paragraph.originalIndex === originalParagraph);
      if (!isCover && !sourceParagraph)
        throw new Error("The source paragraph for this image no longer exists.");
      if (isCover && allParagraphs.length === 0)
        throw new Error("The source message has no usable paragraphs for a cover prompt.");
      const singleConfig = {
        ...effectiveGenerationConfig(config2),
        coverImageEnabled: isCover,
        minImages: 1,
        maxImages: 1,
        preprocessingEnabled: false,
        previousVisualStateEnabled: false
      };
      const paragraphs = isCover ? allParagraphs : [{ ...sourceParagraph, parserIndex: 1 }];
      const storedCandidates = rebaseCreativeConcepts(originalSlot.creativeConceptCandidates || [], 1);
      const previousConceptHistory = originalSlot.creativeConceptHistory || [];
      const selection = await parseAndSelectPrompts({
        chatId: request.chatId,
        messageId: located.record.messageId,
        messages,
        paragraphs,
        state: initialState,
        config: singleConfig,
        creativeCandidates: storedCandidates,
        usedCreativeConceptIds: previousConceptHistory,
        userId,
        fastBootstrapCharacter: singleConfig.fastMode && singleConfig.includeCharacterInfo && Object.keys(initialState.characterAppearance).length === 0
      });
      selectionForMemory = selection.parsed;
      const entry = isCover ? selection.selected.find((candidate) => candidate.placement === "cover") : selection.selected.find((candidate) => candidate.placement !== "cover");
      if (!entry)
        throw new Error(isCover ? "The sidecar returned no usable replacement cover prompt." : "The sidecar returned no usable replacement prompt.");
      const stage = await prepareAndDispatchImages(request.chatId, [entry], singleConfig, userId, Promise.resolve(imageConnection));
      const job = stage.jobs[0];
      const result = stage.results[0];
      if (!job || !result)
        throw new Error("The replacement image was not generated.");
      const imageId = result.imageId || "";
      const imageUrl = result.imageUrl || (imageId ? imageUrlFromId(imageId) : "");
      if (!imageUrl)
        throw new Error("The image provider returned no replacement image.");
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
    const committed = await commitImageReplacement(request, replacement, config2, userId, rerunSidecar ? selectionForMemory : undefined);
    logStage(config2, rerunSidecar ? "image_sidecar_rerun_done" : "image_reroll_done", {
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
async function runGenerationForMessage(chatId, messageId, content, operation, userId, prepared) {
  const generationStartedAt = Date.now();
  const signal = operation.controller.signal;
  let config2 = null;
  let context = null;
  let parsed = null;
  let canonicalPlan = null;
  let initialized = false;
  let initializationPromise = null;
  let releaseGeneration = null;
  const successfulParserParagraphs = [];
  try {
    throwIfAborted(signal);
    const storedConfig = prepared?.config || await getConfig(userId);
    config2 = effectiveGenerationConfig(storedConfig);
    logStage(config2, "request_received", { chatId, messageId, contentLength: content.length, enabled: config2.enabled, autoGenerate: config2.autoGenerate });
    if (config2.fastMode) {
      logStage(config2, "fast_mode_applied", {
        configuredMinImages: storedConfig.minImages,
        configuredMaxImages: storedConfig.maxImages,
        effectiveMinImages: config2.minImages,
        effectiveMaxImages: config2.maxImages,
        recentContextSkipped: true,
        preprocessingSkipped: true,
        retriesDisabled: true,
        lorebookSkipped: storedConfig.includeLorebook && !config2.includeLorebook
      });
    }
    if (!config2.enabled) {
      logStage(config2, "request_skipped", { reason: "disabled", chatId, messageId });
      return;
    }
    reportGenerationProgress(operation, "loading", userId);
    const messagesPromise = prepared?.messages ? Promise.resolve(prepared.messages) : spindle.chat.getMessages(chatId);
    const statePromise = getState(chatId, userId);
    const imageConnectionPromise = resolveImageConnection(config2, userId);
    const parserConnectionPromise = resolveParserConnection(config2, userId);
    imageConnectionPromise.catch(() => {
      return;
    });
    parserConnectionPromise.catch(() => {
      return;
    });
    const [messages, state] = await Promise.all([messagesPromise, statePromise]);
    throwIfAborted(signal);
    const target = messages.find((message) => message.id === messageId);
    logStage(config2, "target_checked", {
      found: Boolean(target),
      role: target?.role || null,
      ownMessage: target ? isOwnMessage(target) : false,
      messageCount: messages.length
    });
    if (!target || target.role !== "assistant" || isOwnMessage(target))
      return;
    const swipeId = currentSwipe(target);
    const key = `${chatId}:${messageId}:${swipeId}`;
    const runningKey = JSON.stringify([userId ?? null, key]);
    releaseGeneration = tryAcquireRuntimeLock("generation", runningKey);
    if (!releaseGeneration) {
      logStage(config2, "request_skipped", { reason: "already_running", key });
      return;
    }
    if (state.generated[key]) {
      const existing = await loadGeneratedRecord(state.generated[key], userId, false);
      const hasIncompleteSlot = existing?.slots.some((slot) => slot.status !== "completed") || false;
      if (!existing?.generationStatus || existing.generationStatus === "completed" && !hasIncompleteSlot) {
        logStage(config2, "request_skipped", { reason: "already_generated", key });
        return;
      }
    }
    const sourceContent = stripInlayContent(String(target.content || content || ""));
    context = {
      chatId,
      messageId,
      swipeId,
      key,
      sourceFingerprint: sourceContentFingerprint(sourceContent),
      operation,
      config: config2,
      userId
    };
    const paragraphs = prepareParagraphs(sourceContent, config2);
    logStage(config2, "paragraph_cleanup_done", {
      originalParagraphs: paragraphCount(sourceContent),
      parserParagraphs: paragraphs.length,
      mappedOriginalParagraphs: paragraphs.map((paragraph) => paragraph.originalIndex),
      ignoredTagCount: ignoredTagNames(config2).length
    });
    if (paragraphs.length === 0)
      throw new Error("No usable paragraphs found for image parsing.");
    reportGenerationProgress(operation, "parsing", userId);
    const selection = await parseAndSelectPrompts({
      chatId,
      messageId,
      messages,
      paragraphs,
      state,
      config: config2,
      userId,
      signal,
      preparedParserConnection: parserConnectionPromise,
      fastBootstrapCharacter: config2.fastMode && config2.includeCharacterInfo && Object.keys(state.characterAppearance).length === 0
    });
    parsed = selection.parsed;
    canonicalPlan = selection.plan || null;
    const selected = selection.selected;
    logParsedSelection(parsed, selected, paragraphs, config2);
    operation.total = selected.length;
    reportGenerationProgress(operation, "preparing", userId);
    initializationPromise = initializeProgressiveGeneration(context, pendingGenerationRecord(context, selected, parsed, selection.plan)).then(() => {
      initialized = true;
    });
    initializationPromise.catch(() => {
      return;
    });
    reportGenerationProgress(operation, "generating", userId);
    await prepareAndDispatchImages(chatId, selected, config2, userId, imageConnectionPromise, {
      signal,
      stopWaitingOnAbort: true,
      onSettled: async (job, settlement) => {
        if (signal.aborted)
          return;
        try {
          await initializationPromise;
          const completed = await commitProgressiveSlot(context, job, settlement);
          if (completed && job.placement !== "cover" && Number.isFinite(job.parserParagraph)) {
            successfulParserParagraphs.push(job.parserParagraph);
          }
          operation.completed += 1;
          const illustrationNumber = selected[0]?.placement === "cover" ? job.index : job.index + 1;
          const subject = job.placement === "cover" ? "Cover image" : `Illustration ${illustrationNumber}`;
          reportGenerationProgress(operation, "generating", userId, completed ? `${subject} ready.` : `${subject} did not complete.`);
          if (settlement.status === "fulfilled" && !completed && !signal.aborted) {
            throw new Error("The image provider returned no image.");
          }
        } catch (error51) {
          throw error51;
        }
      }
    });
    await initializationPromise;
    throwIfAborted(signal);
    reportGenerationProgress(operation, "persisting", userId);
    const record2 = await finalizeProgressiveGeneration(context, parsed, successfulParserParagraphs, false, canonicalPlan);
    reportGenerationProgress(operation, "completed", userId);
    spindle.sendToFrontend({ type: "status", chatId, operationId: operation.id, status: "Generated", record: record2 }, userId);
    logStage(config2, "generation_pipeline_done", {
      chatId,
      messageId,
      imageCount: record2.slots.filter((slot) => Boolean(slot.imageUrl)).length,
      elapsedMs: Date.now() - generationStartedAt
    });
  } catch (error51) {
    const cancelled = isAbortError(error51, signal);
    if (!initialized && initializationPromise) {
      try {
        await initializationPromise;
      } catch {}
    }
    if (initialized && context && parsed) {
      try {
        await finalizeProgressiveGeneration(context, parsed, successfulParserParagraphs, cancelled, canonicalPlan);
      } catch (finalizeError) {
        logStage(config2 || { debugLogging: true }, "progressive_finalize_error", {
          error: finalizeError instanceof Error ? finalizeError.message : String(finalizeError)
        }, "error");
      }
    }
    if (cancelled) {
      reportGenerationProgress(operation, "cancelled", userId);
      return;
    }
    reportGenerationProgress(operation, "failed", userId, error51 instanceof Error ? error51.message : String(error51));
    throw error51;
  } finally {
    releaseGeneration?.();
  }
}
async function generateForMessage(chatId, messageId, content, userId, prepared) {
  const scheduled = enqueueGeneration(userId, chatId, messageId, (operation) => runGenerationForMessage(chatId, messageId, content, operation, userId, prepared), `${messageId}:${sourceContentFingerprint(stripInlayContent(content))}`);
  if (!scheduled.reused)
    reportGenerationProgress(scheduled.operation, "queued", userId);
  return scheduled.promise;
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
    const config2 = await getConfig(userId);
    configForError = config2;
    logStage(config2, "generation_ended_event", {
      chatId: payload.chatId,
      messageId: payload.messageId || null,
      generationType: payload.generationType || null,
      hasError: Boolean(payload.error),
      hasContent: Boolean(payload.content),
      contentLength: String(payload.content || "").length
    });
    if (!config2.enabled || !config2.autoGenerate || payload.error || !payload.messageId || !payload.content)
      return;
    if (payload.generationType === "continue" || payload.generationType === "impersonate")
      return;
    await generateForMessage(payload.chatId, payload.messageId, payload.content, userId, { config: config2 });
  } catch (error51) {
    const message = error51 instanceof Error ? error51.message : String(error51);
    logStage(configForError || { debugLogging: true }, "auto_generation_error", { error: message }, "error");
    spindle.log.error(`Auto generation failed: ${message}`);
    spindle.sendToFrontend({ type: "status", chatId: payload.chatId, status: "Error", error: message }, userId);
  }
});
spindle.onFrontendMessage(async (payload, userId) => {
  const message = payload;
  let configForError = null;
  try {
    if (acceptAvatarImageResponse(message))
      return;
    if (message.type === "get_state") {
      const config2 = await getConfig(userId);
      configForError = config2;
      const chatId = String(message.chatId || "");
      logStage(config2, "frontend_get_state", { chatId: chatId || null });
      await sendState(userId, chatId, config2);
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
      const config2 = await getConfig(userId);
      configForError = config2;
      const chatId = String(message.chatId || "");
      if (!chatId)
        throw new Error("Open a chat first.");
      const state = await updateState(chatId, userId, (current) => {
        upsertCharacterTag(current, message.oldName, message.name, message.tags);
      });
      logStage(config2, "character_tags_update", { chatId, oldName: String(message.oldName || ""), name: String(message.name || "") });
      spindle.sendToFrontend({
        type: "character_memory_updated",
        chatId,
        characterAppearance: state.characterAppearance
      }, userId);
    } else if (message.type === "character_tags_delete") {
      const config2 = await getConfig(userId);
      configForError = config2;
      const chatId = String(message.chatId || "");
      if (!chatId)
        throw new Error("Open a chat first.");
      const state = await updateState(chatId, userId, (current) => {
        deleteCharacterTag(current, message.name);
      });
      logStage(config2, "character_tags_delete", { chatId, name: String(message.name || "") });
      spindle.sendToFrontend({
        type: "character_memory_updated",
        chatId,
        characterAppearance: state.characterAppearance
      }, userId);
    } else if (message.type === "cancel_generation") {
      const chatId = String(message.chatId || "");
      if (!chatId)
        throw new Error("Open a chat first.");
      const cancelled = cancelChatGenerations(userId, chatId, String(message.operationId || "") || undefined);
      spindle.sendToFrontend({
        type: "status",
        chatId,
        status: cancelled.length ? "Cancellation requested…" : "No active generation to cancel."
      }, userId);
    } else if (message.type === "generate_latest") {
      const config2 = await getConfig(userId);
      configForError = config2;
      const chatId = String(message.chatId || "");
      if (!chatId)
        throw new Error("Open a chat first.");
      logStage(config2, "manual_generate_latest", { chatId });
      const messages = await spindle.chat.getMessages(chatId);
      const target = [...messages].reverse().find((candidate) => candidate.role === "assistant" && !isOwnMessage(candidate));
      if (!target)
        throw new Error("No assistant message found.");
      spindle.sendToFrontend({ type: "status", chatId, status: "Generating..." }, userId);
      await generateForMessage(chatId, target.id, target.content, userId, {
        config: config2,
        messages
      });
    } else if (message.type === "get_inlay_image_details") {
      const request = {
        chatId: String(message.chatId || ""),
        messageId: String(message.messageId || "") || undefined,
        swipeId: Number.isInteger(Number(message.swipeId)) ? Number(message.swipeId) : undefined,
        imageIndex: Number.isInteger(Number(message.imageIndex)) ? Number(message.imageIndex) : undefined,
        imageId: String(message.imageId || "") || undefined,
        imageUrl: String(message.imageUrl || "") || undefined
      };
      try {
        const details = await getStoredImageDetails(request, userId);
        spindle.sendToFrontend({
          type: "inlay_image_details_result",
          requestId: String(message.requestId || ""),
          ok: true,
          ...details
        }, userId);
      } catch (error51) {
        spindle.sendToFrontend({
          type: "inlay_image_details_result",
          requestId: String(message.requestId || ""),
          ok: false,
          error: error51 instanceof Error ? error51.message : String(error51)
        }, userId);
      }
    } else if (message.type === "reroll_image" || message.type === "rerun_image_sidecar") {
      const config2 = await getConfig(userId);
      configForError = config2;
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
      spindle.sendToFrontend({ type: "status", chatId, status: actionLabel }, userId);
      const result = await rerunStoredImage(request, rerunSidecar, userId, config2);
      spindle.sendToFrontend({
        type: "inlay_image_action_result",
        requestId: String(message.requestId || ""),
        operation: rerunSidecar ? "sidecar" : "reroll",
        ok: true,
        chatId,
        messageId: result.record.messageId,
        imageIndex: result.index,
        imageUrl: result.record.slots[result.index]?.imageUrl || ""
      }, userId);
      spindle.sendToFrontend({ type: "status", chatId, status: rerunSidecar ? "Sidecar rerun complete" : "Image rerolled", record: result.record }, userId);
    }
  } catch (error51) {
    const errorMessage = error51 instanceof Error ? error51.message : String(error51);
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
    spindle.sendToFrontend({ type: "status", chatId: String(message.chatId || ""), status: "Error", error: errorMessage }, userId);
  }
});
spindle.log.info("Inlay Illustrator loaded.");
export {
  __testables
};
