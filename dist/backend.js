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
var renderedPromptCache = new WeakMap;
function renderPrompt(prompt, syntax) {
  const cached = renderedPromptCache.get(prompt)?.[syntax];
  if (cached !== undefined)
    return cached;
  const rendered = joinSections(prompt.sections, syntax, prompt.format || "ordered");
  const entries = renderedPromptCache.get(prompt) || {};
  entries[syntax] = rendered;
  renderedPromptCache.set(prompt, entries);
  return rendered;
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
function assembleCharacterBlock(character, config, replacements, includeAction, perspectiveMode) {
  if (perspectiveMode === "creative") {
    return unique(csvParts(stripOrReplaceNames(cleanString2(character.visibleTags), replacements, true))).join(", ");
  }
  return unique(csvParts(stripOrReplaceNames(cleanString2(character.label), replacements, true), shouldIncludeCharacterNames(config) ? displayName(cleanString2(character.name), config) : "", stripOrReplaceNames(cleanString2(character.age), replacements, true), stripOrReplaceNames(cleanString2(character.identity), replacements, true), stripOrReplaceNames(cleanString2(character.appearance), replacements, true), stripOrReplaceNames(cleanString2(character.body), replacements, true), stripOrReplaceNames(cleanString2(character.attire), replacements, true), stripOrReplaceNames(cleanString2(character.expression), replacements, true), includeAction ? stripOrReplaceNames(cleanString2(character.action), replacements, true) : "")).join(", ");
}
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
  const record = asRecord(camera);
  const framing = cleanString2(record.framing).toLowerCase();
  const angle = cleanString2(record.angle).toLowerCase();
  const perspective = cleanString2(record.perspective).toLowerCase();
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
  const record = asRecord(camera);
  if (Object.keys(record).length > 0) {
    return { ...record, framing: view.framing, angle: view.angle, perspective: view.perspective };
  }
  const text = cleanString2(camera).toLowerCase();
  return {
    framing: view.framing,
    angle: view.angle,
    perspective: view.perspective,
    focus: CAMERA_FOCUS_VALUES.filter((value) => text.includes(value))
  };
}
function smallestCompatibleFraming(required) {
  const candidates = ["portrait", "medium close-up", "upper body", "cowboy shot", "full body"];
  return candidates.find((candidate) => {
    const regions = new Set(FRAMING_VISIBILITY_REGIONS[candidate]);
    return [...required].every((region) => regions.has(region));
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
    const required2 = new Set([...visibleRegions, ...critical.regions]);
    const view2 = { ...original, framing: smallestCompatibleFraming(required2), perspective: repairedPerspective };
    return {
      value: cameraValueWithView(shot.camera, view2),
      view: view2,
      adjusted: true,
      originalFraming: original.framing
    };
  }
  const originalRegions = new Set(FRAMING_VISIBILITY_REGIONS[original.framing] || ALL_VISIBILITY_REGIONS);
  const required = new Set([...originalRegions, ...critical.regions]);
  let framing = original.framing;
  const framingMissesCritical = [...critical.regions].some((region) => !originalRegions.has(region));
  if (framingMissesCritical || critical.requiresEyes && original.framing === "eyes out of frame") {
    framing = smallestCompatibleFraming(required);
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
    ["body", character.body],
    ["attire", character.attire]
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
function adultAgeMarker(character, shot) {
  const nsfw = csvParts(shot.situation).some((tag) => tag.toLowerCase() === "nsfw");
  const age = cleanString2(character.age);
  return nsfw && /\b(?:adult|mature|aged up|old|elderly)\b/i.test(age) ? age : "";
}
function assembleFragmentCharacterBlock(character, config, replacements, camera, shot) {
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
  return unique(csvParts(stripOrReplaceNames(cleanString2(character.label), replacements, true), shouldIncludeCharacterNames(config) ? displayName(cleanString2(character.name), config) : "", stripOrReplaceNames(adultAgeMarker(character, shot), replacements, true), projection.join(", "))).join(", ");
}
function assembleVisibilityTierCharacterBlock(character, config, replacements, camera, shot, ignoreOcclusionScope, ignoreFragmentScope) {
  const renderScope = cleanString2(character.renderScope);
  const fragment = isFragmentCameraFraming(camera.framing) || !ignoreFragmentScope && isFragmentRenderScope(renderScope);
  if (fragment)
    return assembleFragmentCharacterBlock(character, config, replacements, camera, shot);
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
  return unique(csvParts(stripOrReplaceNames(cleanString2(character.label), replacements, true), shouldIncludeCharacterNames(config) ? displayName(cleanString2(character.name), config) : "", stripOrReplaceNames(faceReadable ? cleanString2(character.age) : adultAgeMarker(character, shot), replacements, true), projected.map((tag) => stripOrReplaceNames(tag, replacements, true)).join(", "), faceReadable ? stripOrReplaceNames(cleanString2(character.expression), replacements, true) : "")).join(", ");
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
function assembleDynamicCharacterComposition(value, replacements, priority) {
  const record = asRecord(value);
  const fields = ["position", "pose", "actions", "gaze"];
  const structured = hasAtomicField(record, fields);
  if (!structured)
    return { text: sanitizeComposition(cleanString2(value), replacements), structured: false };
  const priorityTokens = actionTokens(priority);
  const uncovered = (snippet) => {
    const tokens = actionTokens(snippet);
    return tokens.length === 0 || !tokens.every((token) => tokenCovered(token, priorityTokens));
  };
  const actions = sanitizedAtomicSnippets(record.actions, 3, replacements).filter(uncovered);
  return {
    text: unique([
      ...sanitizedAtomicSnippets(record.position, 1, replacements),
      ...sanitizedAtomicSnippets(record.pose, 1, replacements),
      ...actions,
      ...sanitizedAtomicSnippets(record.gaze, 1, replacements)
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
  const record = asRecord(value);
  const fields = ["interaction", "spatialRelation"];
  const structured = hasAtomicField(record, fields);
  if (!structured) {
    const text = sanitizeComposition(cleanString2(value), replacements);
    return { text, interaction: "", relation: "", structured: false };
  }
  const interactionParts = unique(sanitizedAtomicSnippets(record.interaction, 2, replacements));
  const relationParts = unique(sanitizedAtomicSnippets(record.spatialRelation, 1, replacements));
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
function assembleDynamicShotPlan(value, replacements) {
  const record = asRecord(value);
  const fields = ["primaryAction", "secondaryCue", "staging"];
  const structured = hasAtomicField(record, fields);
  if (!structured)
    return { text: sanitizeComposition(cleanString2(value), replacements), structured: false };
  return {
    text: unique([
      ...sanitizedAtomicSnippets(record.primaryAction, 1, replacements),
      ...sanitizedAtomicSnippets(record.secondaryCue, 1, replacements),
      ...sanitizedAtomicSnippets(record.staging, 1, replacements)
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
  const record = asRecord(value);
  const fields = ["position", "pose", "actions", "gaze"];
  const structured = hasAtomicField(record, fields);
  if (!structured) {
    return {
      text: unique(csvParts(sanitizeComposition(cleanString2(value), replacements), "looking at viewer")).join(", "),
      structured: false
    };
  }
  return {
    text: unique([
      ...sanitizedAtomicSnippets(record.position, 1, replacements),
      ...sanitizedAtomicSnippets(record.pose, 1, replacements),
      ...sanitizedAtomicSnippets(record.actions, 3, replacements),
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
function assembleAnimaPrompt(scene, shot, config, replacements, perspectiveMode, creativeConcept, dynamicLayout = "hybrid") {
  const allCharacters = cleanArray(shot.characters).slice(0, perspectiveMode === "asset" ? 1 : config.maxCharacters);
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
    const baseTags = conceptTags || (perspectiveMode === "dynamic" ? assembleVisibilityTierCharacterBlock(character, config, replacements, cameraView, shot, dynamicCamera.adjusted, dynamicCamera.adjusted && isFragmentCameraFraming(dynamicCamera.originalFraming) && characters.length === 1) : assembleCharacterBlock(character, config, replacements, false, perspectiveMode));
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
  const sharedAction = sharedComposition.structured ? config.supplement ? "" : filteredSharedInteraction : stripOrReplaceNames(uncoveredActionTags(shot.action, config.supplement ? sharedComposition.text : ""), replacements, true);
  const camera = perspectiveMode === "asset" ? { text: "portrait, cowboy shot", structured: false } : perspectiveMode === "static" ? { text: "medium shot, eye level, straight-on, deep focus", structured: true } : perspectiveMode === "creative" && cleanString2(creativeConcept?.camera) ? { text: cleanString2(creativeConcept?.camera), structured: false } : assembleStructuredCamera(perspectiveMode === "dynamic" ? dynamicCamera.value : shot.camera);
  const environment = scene.environment || {};
  const location = structuredSnippets(environment.location, 1);
  const timeWeather = structuredSnippets(environment.timeWeather, 1);
  const lightingMood = config.supplement ? structuredSnippets(environment.lightingMood, compactDynamic ? 1 : 3) : [];
  const backgroundElements = config.supplement || perspectiveMode === "static" ? structuredSnippets(environment.backgroundElements, compactDynamic ? 3 : 5) : [];
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
    !compactDynamic && config.supplement && perspectiveMode !== "static" && perspectiveMode !== "asset" && !bindingCreative ? filteredSharedText : "",
    !compactDynamic && perspectiveMode !== "static" && perspectiveMode !== "asset" && !bindingCreative ? sharedAction : "",
    bindingCreative ? "" : environmentSection,
    compactDynamic ? "" : stripOrReplaceNames(camera.text, replacements, true)
  ].map((section) => section.trim()).filter(Boolean) };
}
function assembleDefaultPrompt(scene, shot, config, replacements, perspectiveMode, creativeConcept) {
  const allCharacters = cleanArray(shot.characters).slice(0, perspectiveMode === "asset" ? 1 : config.maxCharacters);
  const bindingCreative = perspectiveMode === "creative" && Boolean(creativeConcept);
  const characters = bindingCreative ? allCharacters.slice(0, 1) : allCharacters;
  const selectedScope = perspectiveMode === "creative" ? sanitizeComposition(cleanString2(creativeConcept?.renderScope), replacements) : "";
  const creativeScopes = perspectiveMode === "creative" ? selectedScope ? [selectedScope] : unique(characters.map((character) => sanitizeComposition(cleanString2(character.renderScope), replacements)).filter(Boolean)) : [];
  const characterBlocks = characters.map((character, index) => {
    const conceptTags = perspectiveMode === "creative" && index === 0 ? stripOrReplaceNames(unique(csvParts(creativeConcept?.visibleCues)).join(", "), replacements, true) : "";
    const block = conceptTags || assembleCharacterBlock(character, config, replacements, true, perspectiveMode);
    return perspectiveMode === "asset" ? unique(csvParts(block, "looking at viewer")).join(", ") : block;
  }).filter(Boolean);
  const supplement = config.supplement && !(perspectiveMode === "creative" && creativeScopes.length > 0) ? normalizeSupplement(stripOrReplaceNames(cleanString2(shot.supplement), replacements, false)) : "";
  const tagSections = dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(perspectiveMode === "asset" ? "portrait, cowboy shot" : perspectiveMode === "creative" && cleanString2(creativeConcept?.camera) ? creativeConcept?.camera : shot.camera, perspectiveMode === "asset" ? assetSituation(shot.situation, characters[0]) : bindingCreative ? identitySafeCreativeSituation(shot.situation) : shot.situation, perspectiveMode === "creative" && creativeScopes.length > 0 ? "" : shot.action)).join(", "), replacements, true),
    perspectiveMode === "asset" ? "white background, simple background" : bindingCreative ? "" : stripOrReplaceNames(unique(csvParts(scene.place)).join(", "), replacements, true),
    ...creativeScopes,
    ...characterBlocks
  ]);
  return { sections: [...tagSections, supplement].filter(Boolean), format: "legacy" };
}
function assemblePrompt(scene, shot, config, parserParagraph, originalParagraph, creativeConcept, evaluationOptions) {
  const characters = cleanArray(shot.characters);
  const replacements = buildNameReplacementMap(characters);
  const perspective = resolveShotPerspective(shot, config);
  const core = config.promptStyle === "anima" ? assembleAnimaPrompt(scene, shot, config, replacements, perspective.mode, creativeConcept, evaluationOptions?.dynamicLayout || "hybrid") : assembleDefaultPrompt(scene, shot, config, replacements, perspective.mode, creativeConcept);
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
    placement: "paragraph",
    paragraph: originalParagraph,
    parserParagraph,
    perspectiveMode: perspective.mode,
    perspectiveSource: perspective.source,
    creativeConcept: perspective.mode === "creative" ? creativeConcept : undefined
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
function selectCoverPromptEntry(payload, paragraphs, config) {
  if (!config.coverImageEnabled || !payload.cover || paragraphs.length === 0)
    return null;
  const source = paragraphs[0];
  const cover = payload.cover;
  const coverConfig = {
    ...config,
    adaptiveMode: true,
    perspectiveMode: "dynamic"
  };
  const entry = assemblePrompt(cover, { ...cover, perspectiveMode: "dynamic" }, coverConfig, source.parserIndex, source.originalIndex);
  return renderPrompt(entry.prompt, config.promptSyntax) ? { ...entry, placement: "cover", perspectiveSource: "manual" } : null;
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
    const shot = config.adaptiveMode && !config.fastMode && requestedPerspective === "creative" && (!concept || !adaptiveCreativeAllowed.has(entry)) ? { ...entry.shot, perspectiveMode: "dynamic" } : entry.shot;
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
    attireInferred: inferred(character.attireInferred)
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
    attireInferred: !previous ? inferred(raw.attireInferred) : (explicitCurrentWins || changes.has("attire")) && currentAttire ? inferred(raw.attireInferred) : previous.attireInferred
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
      attireInferred: character.attireInferred === true
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
async function loadParserContextSources(chatId, config, userId, options = {}) {
  const diagnostics = {};
  if (config.fastMode) {
    const needsChat2 = config.includeCharacterInfo && options.fastBootstrapCharacter === true;
    let chat2 = null;
    let character2 = null;
    if (needsChat2) {
      try {
        chat2 = asRecord(await spindle.chats.get(chatId, userId));
        if (config.includeCharacterInfo && chat2?.character_id) {
          character2 = asRecord(await spindle.characters.get(String(chat2.character_id), userId));
        }
      } catch (error) {
        diagnostics.characterInfoError = error instanceof Error ? error.message : String(error);
      }
      diagnostics.fastBootstrapCharacter = true;
    } else {
      diagnostics.fastBootstrapCharacter = false;
    }
    diagnostics.fastMode = true;
    return { chat: chat2, persona: null, character: character2, diagnostics };
  }
  const needsChat = config.includeCharacterInfo || config.includeLorebook || config.userInstructionsEnabled;
  const needsPersona = config.includeUserInfo || config.userInstructionsEnabled;
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
  if (config.includeCharacterInfo && chat?.character_id) {
    try {
      character = asRecord(await spindle.characters.get(String(chat.character_id), userId));
    } catch (error) {
      diagnostics.characterInfoError = error instanceof Error ? error.message : String(error);
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
function includeCountForAttempt(config, attempt) {
  if (config.includeMaxMessages <= config.includeMinMessages)
    return config.includeMinMessages;
  if (config.parserRetries <= 0)
    return config.includeMinMessages;
  const step = Math.ceil((config.includeMaxMessages - config.includeMinMessages) / config.parserRetries);
  return Math.min(config.includeMaxMessages, config.includeMinMessages + step * attempt);
}
async function buildParserContext(chatId, messages, targetIndex, cache, config, attempt, userId, lorebookSnapshot, previousVisualState, preparedSources) {
  const blocks = [];
  const preprocessingBlocks = [];
  const overrides = [];
  const diagnostics = { attempt, includeCount: includeCountForAttempt(config, attempt) };
  const sources = preparedSources || await loadParserContextSources(chatId, config, userId);
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
  if (config.includeUserInfo || config.userInstructionsEnabled) {
    if (sources.persona) {
      const record = sources.persona;
      const block = config.includeUserInfo ? formatInfoBlock("{{user}} Info", [
        namedField("Name", record.name),
        namedField("Title", record.title),
        namedField("Description", record.description)
      ]) : "";
      pushBlock(block);
      overrides.push(...collectExtraInstructionStrings(record.metadata));
      diagnostics.userInfo = Boolean(block);
    }
  }
  if (config.includeCharacterInfo && chat?.character_id) {
    if (sources.character) {
      const record = sources.character;
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
    }
  }
  if (config.includeLorebook && !config.fastMode) {
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
  if (config.previousVisualStateEnabled && previousVisualState) {
    const visualStateReference = formatPreviousVisualState(previousVisualState);
    pushBlock(visualStateReference);
    diagnostics.previousVisualState = Boolean(visualStateReference);
  }
  if (config.userInstructionsEnabled)
    overrides.unshift(config.customParserInstructions);
  return {
    systemContext: blocks.filter(Boolean).join(`

`),
    preprocessingSystemContext: preprocessingBlocks.filter(Boolean).join(`

`),
    recentContext: config.fastMode ? "" : formatRecentContext(messages, targetIndex, includeCountForAttempt(config, attempt)),
    override: unique(overrides.map((value) => cleanString2(value)).filter(Boolean)).join(`

`),
    diagnostics
  };
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
var globalRegistry = globalThis;
function sharedQueue() {
  const existing = globalRegistry[REGISTRY_KEY];
  if (existing?.queue && typeof existing.queue.enqueue === "function" && typeof existing.queue.cancelChat === "function") {
    return existing.queue;
  }
  const created = { queue: new GenerationOperationQueue };
  globalRegistry[REGISTRY_KEY] = created;
  return created.queue;
}
function enqueueGeneration(userId, chatId, messageId, task, dedupeId) {
  return sharedQueue().enqueue(userId, chatId, messageId, task, dedupeId);
}
function cancelChatGenerations(userId, chatId, operationId) {
  return sharedQueue().cancelChat(userId, chatId, operationId);
}
function abortError(message = "Generation cancelled.") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
function throwIfAborted(signal) {
  if (signal?.aborted)
    throw abortError(typeof signal.reason === "string" ? signal.reason : undefined);
}
function isAbortError(error, signal) {
  return Boolean(signal?.aborted || error instanceof Error && error.name === "AbortError");
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
async function resolveImageConnection(config, userId) {
  logStage(config, "image_connection_resolve_start", { configuredConnectionId: config.imageConnectionId });
  const cacheKey = JSON.stringify([userId ?? null, config.imageConnectionId || "(default)"]);
  const cached = imageConnectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now())
    return cached.connection;
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
      cacheImageConnection(cacheKey, configured);
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
  cacheImageConnection(cacheKey, fallback);
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
    } catch (error) {
      preparationFailure = error;
      hasPreparationFailure = true;
      break;
    }
    jobs.push(job);
    const invoke = () => {
      try {
        throwIfAborted(options.signal);
        return Promise.resolve(generate(job));
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const providerRequest = eager || requests.length === 0 ? invoke() : serialRequest.then(invoke);
    const request = options.onSettled ? providerRequest.then(async (result) => {
      await options.onSettled?.(job, { status: "fulfilled", value: result });
      return result;
    }, async (error) => {
      await options.onSettled?.(job, { status: "rejected", reason: error });
      throw error;
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
  return sanitizeMemoryTags(unique(csvParts(character.label, character.age, character.identity, character.appearance, character.body, attireInferred ? "" : character.attire)).join(", "));
}
function matchingKey(map, name) {
  if (!map)
    return;
  return Object.keys(map).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
}
function updateCache(cache, payload, manualCharacterAppearance) {
  for (const { shot } of normalizeScenePayload(payload)) {
    for (const character of cleanArray(shot.characters)) {
      const name = normalizeCharacterName(character.name);
      const tags = baselineCharacterTags(character);
      if (!name || !tags)
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
var ignoredPatternCache = new Map;
function ignoredTagPatterns(config) {
  const key = String(config.ignoredTags || "");
  const cached = ignoredPatternCache.get(key);
  if (cached)
    return cached;
  const patterns = ignoredTagNames(config).map((tag) => {
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
function prepareParagraphs(content, config) {
  const paragraphs = [];
  const originalBlocks = splitParagraphBlocks(stripInlayContent(content));
  const patterns = ignoredTagPatterns(config);
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
function dynamicDirectionContract() {
  return [
    "### Dynamic shot direction",
    "Dynamic is a source-literal action illustration. Choose the one visible action or interaction that best represents the paragraph; do not try to give every simultaneous fact equal rendering priority.",
    "shotPlan is required for Dynamic. shotPlan.primaryAction is one concise role-bound subject-verb-object clause containing the primary action, its owner and target or object, and any explicit movement direction. Use visual roles such as left woman or right man, never names.",
    "shotPlan.secondaryCue is empty or one lower-priority visible cue such as a gaze direction, approaching hazard, environmental contact, or consequential reaction. It must not introduce a second competing relational action.",
    "shotPlan.staging is one concise spatial arrangement that makes the primary action readable. It contains no new action, camera, clothing, expression, or lighting information.",
    "Every shotPlan string is one atomic phrase with no comma, semicolon, or terminal punctuation. Combine closely related words inside one clause instead of listing clauses.",
    "shotPlan is a rendering projection of facts still owned by composition and sharedComposition. It may restate the selected facts for priority, but it never changes them and is never persisted as memory.",
    "Every Dynamic character must have a non-empty renderScope even for an ordinary full-body or upper-body view. renderScope describes what the chosen framing actually contains. Never leave it empty because the character is fully visible.",
    "For ordinary portrait through full-body Dynamic framing, the structured Anima renderer projects the complete baseline through visibility tiers: portrait and close-up keep head, face, neck, shoulders, and upper garments visible at the shoulders; medium close-up adds torso; upper-body and medium framings add arms and hands; cowboy shot adds hips and upper legs; full body and wide shot keep everything including footwear. visibleTags must still list the traits actually visible so framing can be audited, but for ordinary framings the renderer's tier projection is authoritative — never pad visibleTags with out-of-crop traits. For body-part focus, head-out-of-frame, eyes-out-of-frame, or another true fragment, visibleTags is the complete rendered identity projection and must omit every trait outside the crop.",
    "Per-character composition remains required after shot planning. Preserve position, body arrangement, gaze, and any secondary action not already represented by shotPlan. Do not duplicate the primary action merely to add emphasis.",
    "Choose framing that contains every source-critical visible fact. The renderer never injects a trait that is incompatible with the selected crop or viewing direction and may deterministically turn or widen an incompatible camera as a safety fallback. Use cowboy shot or full body when lower-body movement, a transformed limb, or specifically required lower attire must be verified; turn or widen the camera when a required face, eye, or body region would otherwise be hidden.",
    "Choose framing for the action and source-critical facts alone. Portrait or close-up is acceptable for face-and-shoulder beats, and decorative out-of-crop attire must remain omitted rather than forcing a wider camera.",
    "Camera direction must be compatible with the facts the image must prove. If an explicit facial expression, gaze, eye trait, or eye transformation is important, keep the face readable and do not use from behind. Do not combine a required face-visible fact with a camera that hides it.",
    "Preserve source-critical modifiers in the projection, especially material, color, partial visibility, and out-of-frame status. A partial bronze mechanical hand must not become a generic mechanical hand or a complete character.",
    "Choose a camera that clearly contains the primary action. Prefer a repeated suitable camera over a novel camera that crops out or obscures the action. Camera variety is secondary to action readability."
  ].join(`
`);
}
function staticDirectionContract() {
  return [
    "### Static shot direction",
    "Static uses a visual-novel composition: a clearly readable scene background with one primary character slightly forward on a shallow foreground plane. Include additional characters only when the source cannot be represented faithfully without them; keep them on the same shallow plane.",
    "Static is fixed to a conventional medium shot at eye level, straight-on, with deep focus so the background remains readable. Do not use close-ups, wide shots, body-part crops, POV, high or low angles, dutch angles, dramatic lenses, motion blur, foreground occlusion, or action-centric framing.",
    "For one Static character, use slightly forward from the background as the position. For two characters, place one on the left and one on the right, both slightly forward on the same shallow plane; never give both an ambiguous identical position. Use a concrete source-supported resting body arrangement as the pose, an empty actions array, and a source-supported gaze or an empty gaze.",
    "A Static pose must state the visible body arrangement directly, such as standing upright with arms relaxed at sides or seated upright with hands resting in lap. Never write abstract meta-phrases such as simple pose, stable pose, holding a pose, or posing. Do not depict a mid-action pose.",
    "Every Static scene must provide a specific physical location and 2-3 concrete backgroundElements so the setting is visibly readable.",
    "Leave shotPlan absent. Static framing and pose constraints override requests for cinematography variation."
  ].join(`
`);
}
function creativeDirectionContract() {
  return [
    "### Creative shot direction",
    "Creative isolates a meaningful identity-safe visual anchor from the paragraph instead of showing the complete scene. Use a source-supported object, environment, shadow, unreadable silhouette, foreground layer, aftermath, unusual spatial relationship, or non-identifying body fragment.",
    "Creative must not focus on a recognizable face, facial feature, hair, hairstyle, outfit, or clothing detail.",
    "Creative must remain concrete and source-supported. renderScope states exactly what is in frame. visibleTags describes only the identity-safe anchor and contains no character-memory traits.",
    "shot.characters contains only people with an actually visible body part inside renderScope. If the selected Creative frame contains no person or body fragment, use an empty characters array; keep fully off-frame recurring people only in terminalState and never add placeholder out-of-frame shot characters.",
    "For a zero-character Creative frame, do not invent shot-level renderScope or visibleTags keys because they are not in the schema. The external binding supplies those render details after parsing; output only the normal declared shot fields with characters as an empty array.",
    "A supplied Creative candidate is binding. Copy its render scope faithfully, use its camera intent, and do not broaden it back into a recognizable character or the complete paragraph action.",
    "Leave shotPlan absent. Creative uses renderScope and the supplied concept as its rendering projection."
  ].join(`
`);
}
function assetDirectionContract() {
  return [
    "### Asset shot direction",
    "Always `white background, simple background`. No location, lighting, weather, or prop tags."
  ].join(`
`);
}
function coverDirectionContract(config) {
  if (!config.coverImageEnabled)
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
    config.promptStyle === "anima" ? "Fill cover with the displayed structured cover fields. Its shotPlan is a concise rendering hierarchy for the promotional composition: primaryAction names the dominant visible relationship, secondaryCue is optional, and staging states the spatial arrangement. Cover has no perspectiveMode, paragraph, environmentChanges, or visualChanges." : "Fill cover with the displayed flat cover fields. Use supplement only for concise objective composition details that tags cannot express. Cover has no perspectiveMode, paragraph, or environmentChanges."
  ].join(`
`);
}
function perspectiveContract(config) {
  if (!config.adaptiveMode) {
    const contract = config.perspectiveMode === "creative" ? creativeDirectionContract() : config.perspectiveMode === "static" ? staticDirectionContract() : config.perspectiveMode === "asset" ? assetDirectionContract() : dynamicDirectionContract();
    return [
      "### Perspective mode - fixed",
      `Set perspectiveMode to exactly ${config.perspectiveMode} for every shot.`,
      contract,
      "perspectiveMode, renderScope, visibleTags, and shotPlan are shot-only rendering decisions. They never alter or replace complete appearance, body, attire, or environment continuity."
    ].join(`
`);
  }
  return [
    "### Perspective mode - Adaptive router",
    "Choose perspectiveMode independently for every shot before filling any other shot field. It must be exactly creative, static, or dynamic.",
    "For batches with two or more shots, do not choose Creative for every shot. Include at least one Static or Dynamic shot, and choose each mode from the paragraph rather than from the availability of an optional concept.",
    "Use Creative only for a faithful identity-safe object, environment, shadow, unreadable silhouette, reflection, foreground layer, aftermath, unusual spatial relationship, or non-identifying fragment. If no such anchor exists, choose Static or Dynamic.",
    "Use Static for a stable readable visual-novel scene with a conventional medium shot, simple resting pose, and readable background.",
    "Use Dynamic for visible action, movement, interaction, urgency, or a cinematic change.",
    "Apply this precedence from source facts: a required visible action or movement chooses Dynamic; a no-character aftermath or identity-safe anchor may choose Creative; an otherwise stable character-and-background beat chooses Static. Do not use camera drama alone to turn a stable beat into Dynamic, and do not use Creative when it would omit the paragraph's only required visible action.",
    creativeDirectionContract(),
    staticDirectionContract(),
    dynamicDirectionContract(),
    "perspectiveMode, renderScope, visibleTags, and shotPlan are shot-only rendering decisions. They never alter or replace complete appearance, body, attire, or environment continuity."
  ].join(`
`);
}
function coverSchema(config) {
  if (!config.coverImageEnabled)
    return [];
  if (config.promptStyle === "anima") {
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
function parserSchema(config) {
  const structuredAnima = config.promptStyle === "anima";
  const dynamicPossible = config.adaptiveMode || config.perspectiveMode === "dynamic";
  const perspectiveSchemaValue = config.adaptiveMode ? "creative | static | dynamic" : config.perspectiveMode;
  return structuredAnima ? [
    "{",
    ...coverSchema(config),
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
    '        "visualChanges": ["age | appearance | body | attire"]',
    "      }",
    "    ]",
    "  }",
    "}"
  ] : [
    "{",
    ...coverSchema(config),
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
    '        "visualChanges": ["age | appearance | body | attire"]',
    "      }",
    "    ]",
    "  }",
    "}"
  ];
}
function parserInstruction(config, options = {}) {
  if (config.fastMode)
    return parserInstructionFast(config, options);
  const fixedAsset = !config.adaptiveMode && config.perspectiveMode === "asset";
  const maxCharacters = fixedAsset ? 1 : config.maxCharacters;
  const structuredAnima = config.promptStyle === "anima";
  const hasPreviousVisualState = config.previousVisualStateEnabled && options.hasPreviousVisualState === true;
  const fixedStatic = !config.adaptiveMode && config.perspectiveMode === "static";
  const dynamicPossible = config.adaptiveMode || config.perspectiveMode === "dynamic";
  const creativePossible = config.adaptiveMode || config.perspectiveMode === "creative";
  const staticBackgroundPossible = fixedStatic || config.adaptiveMode;
  const shotInstruction = [
    fixedAsset ? "One shot per selected paragraph, each containing exactly one visible character." : `Generate ${config.minImages}-${config.maxImages} shots total when possible.`,
    "Choose the most visually consequential changes, actions, interactions, or emotional beats across the entire current source; do not favor earlier paragraphs merely because they appear first.",
    fixedAsset ? "Every shot must reference a different selected source paragraph. Never return two shots for the same paragraph." : fixedStatic ? "Keep the visual-novel framing fixed across Static shots. Distinguish additional shots through source-supported changes in primary character, expression, simple pose, or background instead of dramatic cinematography." : "Each additional shot must differ from the other shots in at least two of these dimensions: (1) perspective or framing, (2) focal subject or visible action, and (3) composition, depth, or foreground occlusion.",
    fixedAsset ? "Do not invent narrative events or add a second visible character." : fixedStatic ? "If the source contains too few distinct stable paragraphs, return fewer shots. Do not repeat a paragraph, invent narrative events, or switch to action-centric framing." : "If the source contains too few distinct visual paragraphs, return fewer shots. Do not repeat a paragraph or invent narrative events.",
    fixedAsset ? "" : "Every shot must reference a different source paragraph. Never return two shots for the same paragraph. Order shots by their visual importance, not paragraph number.",
    structuredAnima ? "Preserve the source's explicit action, direction of movement, visible emotional state, and interpersonal tone. Never replace irritation, fear, conflict, or urgency with romance, serenity, or another inferred mood." : ""
  ].join(`
`);
  const perspectiveInstruction = perspectiveContract(config);
  const source = config.originalReference ? [
    "Original Creation Tag:",
    config.originalCreationName || "(empty)",
    "Use full character names ONLY for the JSON name field.",
    "Output the character's name only: no parentheses, no creation tag, no source/work title, and no aliases.",
    "The extension adds the creation tag programmatically afterward.",
    "Do not include any parenthetical, source name, creation reference, title, or alias in name or any other field."
  ].join(`
`) : "Use names only for the JSON name field as private memory keys. Names will not be included in final prompts. If not given, make a concise stable identifier that fits the description.";
  const schema = parserSchema(config);
  const naturalDetail = structuredAnima ? [
    "### Atomic Natural Composition",
    "characters[].composition is always required and must use its four atomic fields. The renderer joins them once in this exact order: position, pose, actions, gaze.",
    ...creativePossible ? [
      "For Creative, still populate composition for structured memory and validation, but renderScope is authoritative and replaces composition in the rendered prompt when present.",
      "Creative never turns its object, environment, shadow, reflection, silhouette, or fragment anchor into a character. Include a named source character in shot.characters only when some part of that person is actually visible inside renderScope; keep fully off-frame recurring people in terminalState only.",
      "When a person or body fragment is visible, renderScope and visibleTags belong only inside that source character object. Never move them to the shot or scene, and never use the Creative anchor as characters[].name. For a zero-character external concept, characters remains empty and the external binding supplies scope and cues.",
      "Creative does not exempt scene continuity fields. Populate the complete environment object within its normal location, timeWeather, lightingMood, and backgroundElements budgets even when the Creative renderer will omit that environment from the current prompt."
    ] : [],
    ...dynamicPossible ? [
      "For Dynamic, composition and sharedComposition retain complete factual action ownership while shotPlan selects only the primary action, optional secondary cue, and staging that should dominate the rendered image.",
      "For Dynamic, renderScope describes the actual crop and visibleTags contains only stable appearance, body, and attire traits visible within that crop. Do not put expression, pose, action, camera, environment, names, or subject-count tags in visibleTags."
    ] : [],
    "composition.position is one concise spatial phrase describing where the character is in frame.",
    "composition.pose is one concise comma-free phrase describing the character's static body pose. Fold compatible posture words together, such as leaning-forward running stance, instead of writing two comma-separated pose clauses.",
    "composition.actions contains 0-3 concise phrases covering every visible action and movement direction exactly once. Use present visual phrasing such as mid-turn toward the viewer, not mixed completed and ongoing tenses.",
    "When the source states a direction such as left, right, upward, downward, forward, backward, toward, or away, keep that direction in the same composition.actions phrase. Never reduce running left to running or climbing upward to climbing.",
    "Preserve each distinctive visible action verb and its visible object or trigger in composition.actions. Never replace ducking away from falling glass with only crouching plus moving right, pulling a wrist with only running, or pushing a jammed door with only leaning forward.",
    "Preserve source-described environmental contact or encroachment that changes the visible beat, such as rising water around boots, smoke surrounding a face, or vines wrapping an arm. Put the environmental material in an appropriate environment snippet and keep its contact with the character explicit; do not reduce it to generic weather or omit it after preserving the character action.",
    "composition.gaze is one concise gaze-direction phrase, or empty when no gaze is visible. Closed eyes and emotional eye states belong only in expression; when eyes are closed, leave gaze empty.",
    "Each atomic phrase must be independently visual, comma-free, free of semicolons and terminal punctuation, and must not repeat a fact from another composition field.",
    "Do not put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle, appearance, attire, or facial-expression adjectives in any composition field.",
    config.supplement ? "Use sharedComposition.interaction for shared contact or combined actions only, and spatialRelation for one spatial relationship phrase. Do not repeat individual character actions." : "Use sharedComposition.interaction only for source-required shared contact or combined actions, and leave spatialRelation empty. The renderer keeps interaction as a compact action fallback while omitting shared prose.",
    "Do not use any character or persona names in composition fields, including the name of an out-of-frame POV character. Say viewer, left girl, right boy, foreground character, or background character. Use viewer rather than camera for subject orientation.",
    "Use concise objective visual phrases, not narration, invisible emotion, smell, sound, or internal sensation.",
    ...fixedAsset ? [
      "Always `white background, simple background`. No location, lighting, weather, or prop tags.",
      "Put that exact value in environment.location. Leave timeWeather, lightingMood, and backgroundElements empty."
    ] : [
      "Environment target budget: exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements.",
      "Each environment snippet must be concise and contain no comma, semicolon, or terminal punctuation.",
      "Prefer the source's exact concrete noun phrase over a generic paraphrase: keep arrow-slit windows rather than windows, wet leaf rather than foliage, glass conservatory panes rather than walls, and tied used condom rather than object. Never add a plausible prop that the current paragraph does not establish.",
      hasPreviousVisualState ? "When the current source does not establish a new environment detail and Previous Visual State supplies it, copy that environment field exactly. If neither current source nor previous state establishes time/weather, choose one conservative visually coherent value supported by the setting; never write unknown or unspecified time." : "When the current source does not establish time/weather, choose one conservative visually coherent value supported by the setting; never write unknown or unspecified time.",
      config.supplement ? "Populate lightingMood and backgroundElements within the target budget." : staticBackgroundPossible ? "Leave lightingMood empty. Populate 2-3 backgroundElements for every scene containing a Static shot, and leave backgroundElements empty for scenes without a Static shot. Still populate location and timeWeather." : "Leave lightingMood and backgroundElements empty. Still populate location and timeWeather."
    ]
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
    structuredAnima ? `- negative is optional. All other displayed fields and nested objects are required except shotPlan, which is required only for Dynamic and must be absent for Static or Creative. Use empty strings or arrays inside required objects when a field does not apply; never collapse an object into a string.` : "- negative is optional. All other fields are required, though values may be empty strings when a field does not apply.",
    "- These are the ONLY allowed fields. Adding any unlisted field is a schema violation.",
    coverDirectionContract(config),
    "## Scenes & Shots",
    "Scene = shots sharing one physical location.",
    "- Same location means same scene, multiple shots.",
    structuredAnima ? "- Location change means a new scene with its own environment." : "- Location change means a new scene with its own place.",
    "- When Non-authoritative Shot-Router Notes are present, create scenes and shots only for the selected [P#] references in those notes. Read every original numbered paragraph for continuity, but never turn an unselected paragraph into an illustration shot.",
    fixedAsset ? "Shot = one selected paragraph containing exactly one visible character. Shots are independent, so repeat tags if the scene has not changed." : fixedStatic ? "Shot = one distinct stable visual-novel moment: a readable background plus a foreground character, simple pose, and visible expression. Shots are independent, so repeat tags if the scene has not changed." : "Shot = one distinct visual moment: interaction, emotion, significant action, or clear framing change. Prefer closer framing over wide shots. Shots are independent, so repeat tags if the scene has not changed.",
    shotInstruction,
    "Paragraph mapping: current message uses [P#] numbering.",
    "- Paragraph references are 1-based. Copy the exact visible number after P; never convert to zero-based indices, renumber the source, or use paragraph 0.",
    "- Each shot's paragraph must reference an existing [P#].",
    "- Never invent paragraph numbers outside the visible range.",
    "- Tag ONLY the current message. Recent context is for continuity only.",
    "## Terminal Visual State",
    "terminalState is required, is never rendered, and never changes camera, composition, perspective, shot selection, or prompt content.",
    "Set terminalState.paragraph to the final original numbered paragraph, even when that paragraph is not selected for illustration.",
    structuredAnima ? "Read every original paragraph in order and record the physical environment and stable baselines of characters still present after the final paragraph. Use only environment, environmentChanges, and the listed stable character fields; never include action, expression, pose, camera, shotPlan, renderScope, visibleTags, or supplement." : "Read every original paragraph in order and record the final place and stable baselines of characters still present after the final paragraph. Use only place, environmentChanges, and the listed stable character fields; never include action, expression, pose, camera, renderScope, visibleTags, or supplement.",
    "Apply explicit location, attire, appearance, and body changes from unselected paragraphs to terminalState. Do not let an earlier illustrated paragraph overwrite a later narrative change.",
    "For unchanged returning baseline fields, follow the same Previous Visual State and visualChanges rules used by shot characters.",
    "## Tag Rules",
    "Use common, objective, visualizable Danbooru-style English tags. Never fabricate tag vocabulary; use simpler well-known equivalents if unsure. Conservative scene inference is allowed only where this contract explicitly permits it. Do not use metaphors for tags.",
    "Never output placeholder tags or phrases such as unknown, unspecified, not specified, unmentioned, undetermined, default clothing, or unspecified time. Leave genuinely nonvisual fields empty instead.",
    structuredAnima ? "Tag fields are comma-separated tags. Atomic composition and sharedComposition values are concise comma-free natural-language phrases. Environment arrays contain one comma-free visual snippet per item." : "All fields are comma-separated tags except supplement, which is a short objective visual sentence.",
    "Character names are private memory keys. Outside characters[].name, never write a full name or first name in any field, including situation, renderScope, visibleTags, composition, sharedComposition, camera, environment, place, supplement, or negative. Use visual descriptors such as left woman, right man, foreground character, or background character.",
    `Character limit: max ${maxCharacters} character object(s) per shot. Do not add another character object beyond this limit; refer to an additional anonymous out-of-frame person only through visible composition when the source requires it. Every character object resolves to the complete known baseline in appearance, body, and attire regardless of crop. renderScope and visibleTags are the separate shot-only rendering projection.`,
    hasPreviousVisualState ? "Previous Visual State is injected after parsing. For an unchanged returning character, leave age, appearance, body, and attire empty and leave visualChanges empty; the backend restores the exact stored baseline before rendering and persistence. For a new character, or when no matching previous character exists, output the complete baseline. For an explicit current-source change or a final user instruction that adds or replaces durable character tags, list that field in visualChanges and output its complete new value." : "Repeat stable appearance, body, and attire tags for returning characters. Shots are independent, so repeated baseline tags are expected.",
    "Continuity does not require repeating camera angle, framing, composition, depth, or occlusion. Vary those deliberately between shots while preserving narrative facts.",
    "Before returning the batch, compare Dynamic cameras as a soft camera ledger. When two equally suitable cameras would contain their focal actions, prefer different framing + angle + perspective tuples. Never choose a worse, more extreme, or action-cropping camera merely to create variety. Preserve a repeated camera when it is the clearest source-faithful choice or the source establishes continuous camera or POV.",
    perspectiveInstruction,
    structuredAnima ? "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields include expression, composition, renderScope, visibleTags, shotPlan, camera, situation, sharedComposition, environment, and negative." : "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields are expression, action, camera, situation, place, supplement, and negative.",
    "## Field Reference",
    "### visual continuity change markers",
    hasPreviousVisualState ? "When Previous Visual State exists, characters[].visualChanges must list only age, appearance, body, or attire fields explicitly changed by the current numbered source or by a final user instruction that requests durable character tags. An empty list means the backend injects those prior fields exactly; leave their raw values empty instead of paraphrasing or re-emitting them. Do not mark a field changed merely because you rephrased its tags." : "characters[].visualChanges may be empty when no prior visual state is supplied.",
    structuredAnima ? hasPreviousVisualState ? "environmentChanges must list only location, timeWeather, lightingMood, or backgroundElements explicitly changed by the current numbered source. Before copying anything, compare the current numbered source against Previous Visual State. Spatial transition language such as now inside, enters, exits, outside, later in, or moves to explicitly changes location; output the new location and backgroundElements and list both change markers. An empty list means copy prior values only when the current source truly leaves them unchanged." : "environmentChanges lists only location, timeWeather, lightingMood, or backgroundElements explicitly changed by the current numbered source." : hasPreviousVisualState ? "environmentChanges contains place only when the current numbered source explicitly changes the setting. Otherwise leave it empty and copy the prior place exactly." : "environmentChanges contains place only when the current numbered source explicitly changes the setting.",
    structuredAnima ? "### environment - scene-level" : "### place - scene-level",
    fixedAsset ? "Always `white background, simple background`. No location, lighting, weather, or prop tags." : structuredAnima ? "environment.location is one physical location phrase; timeWeather is one time/weather phrase; lightingMood targets 1-2 snippets; backgroundElements targets 1-3 prominent visual props or setting details. Static scenes require a specific physical location and 2-3 backgroundElements." : "Start with interior or exterior when location is known, then add location, mood, lighting, time, weather, and prominent props. Prominent props should be color + object. Define once per scene; all shots in the scene share identical place.",
    structuredAnima ? "Do not include character names, actions, expressions, clothing, body traits, or camera framing in environment. Use only source-supported visual atmosphere; never infer romance, calm, menace, or another emotional tone from lighting alone." : "Do not include character names, actions, expressions, clothing, body traits, or camera framing in place.",
    structuredAnima ? "Retain source-critical environment modifiers exactly enough to preserve identity and scale, such as partial bronze mechanical hand rather than mechanical hand." : "",
    "### camera - shot-level",
    structuredAnima ? "camera.framing must be empty or exactly one of: portrait, close-up, medium close-up, upper body, medium shot, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, body-part focus." : "Framing tags: portrait, upper body, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, close-up, body-part focus.",
    structuredAnima ? "camera.angle must be empty or exactly one of: eye level, low angle, high angle, dutch angle." : "Perspective tags: from above, from behind, from below, from side, high up, sideways, straight-on, upside-down, pov.",
    structuredAnima ? "camera.perspective must be empty or exactly one of: straight-on, from above, from behind, from below, from side, sideways, three-quarter view, pov." : "",
    structuredAnima ? "Never swap camera.angle and camera.perspective: three-quarter view belongs only in perspective, while eye level, low angle, high angle, and dutch angle belong only in angle." : "",
    structuredAnima ? "camera.focus may contain at most two values chosen only from: shallow depth of field, deep focus, background blur, foreground blur, motion blur, fisheye, wide-angle lens, telephoto lens." : "",
    structuredAnima ? "Do not add any other camera keys or camera values. Lighting, streetlamps, atmosphere, actions, expressions, appearance, clothing, subject counts, and place never belong in camera." : "Use camera only for perspective and framing. Do not include actions, expressions, appearance, clothing, subject counts, or place.",
    structuredAnima ? "Choose framing that can visibly contain the complete focal action unless Creative deliberately isolates a smaller visual anchor." : "",
    "### situation - shot-level",
    "Strictly use character count/composition tags such as 1girl, 2girls, 1boy, 1girl, 1boy, other, solo, group, and nsfw only when explicitly visual.",
    "The total number of people should match the visible characters being described/tagged.",
    dynamicPossible ? "For a Dynamic shot with exactly one complete visible character, include solo alongside the one-character count tag. Partial hands, arms, silhouettes, or off-frame POV owners do not increase the complete-character count." : "",
    "Do not include names, numeric ages, appearance, attire, expression, action, camera, or place.",
    "### label",
    "Use girl, boy, or other regardless of age. For out-of-frame partial characters, use label plus out of frame and visible part, such as boy, out of frame, hand.",
    "### name - required",
    "Character name from the narrative. If unnamed, use a consistent identifier such as girl A, boy B, shopkeeper, guard, or stranger. Never empty; this is used for cross-message appearance tracking.",
    "When the narrative provides a multi-word name, copy that full name exactly in characters[].name. Never shorten it to a first name, surname, nickname, or partial name.",
    structuredAnima ? "Do not put character names in label, age, appearance, body, attire, expression, action, composition, situation, camera, place, environment, sharedComposition, supplement, or negative." : "Do not put character names in label, age, appearance, body, attire, expression, action, situation, camera, place, supplement, or negative.",
    "### age",
    "Visual age category only: child, aged down, mature male, mature female, aged up, or old. Based on appearance only.",
    "If characters appear late teens to early thirties, leave age blank.",
    "Exception: when the current source explicitly identifies every participant in sexual content as an adult, never leave age blank. Use mature female, mature male, aged up, or another clearly adult nonnumeric visual category for each visible participant.",
    "That adult marker exception applies to every shot in an adult sexual sequence, including quiet setup shots before the explicit action. Repeat a clearly adult nonnumeric age category for each visible participant in every such shot.",
    "Never output numeric ages such as 18, 21, or 25.",
    "### identity",
    "Legacy compatibility field. Leave identity empty in new output.",
    "Put every durable recognition trait in appearance or body instead, including species/race, furry traits, fur color or pattern, muzzle, animal ears, horns, wings, tails, notable scars or tattoos, and permanent non-clothing accessories.",
    "Do not include names, attire, expression, pose, action, camera, place, or supplement in identity.",
    "### appearance",
    "Identity traits: hair, eyes, skin, species/race, and distinguishing features.",
    "Hair: length, color, style. Always include when known.",
    "Eyes: color, shape, and visual modifiers such as heterochromia, tareme, tsurime, jitome, empty eyes, or dashed eyes. Always include when known.",
    "Skin: color and visible texture, such as dark skin, tan, red skin, metal skin, see-through body, or patchwork skin.",
    "Other: freckles, facial hair, scars, tattoos with location, symbol in eye, elf, demon, furry, androgynous, and other persistent identity traits.",
    "A current-source transformation that remains visibly present after the final paragraph belongs in the complete appearance or body baseline and terminalState even when described as magical or temporary. Do not leave wings, changed eyes, horns, tails, or transformed limbs only in composition, visibleTags, or shotPlan.",
    structuredAnima ? "Do not include names, attire, expression, pose, action, camera, place, supplement, blush, flushed cheeks, tears, sweat, or any other transient state in appearance." : "Do not include names, attire, expression, pose, action, camera, place, or supplement in appearance.",
    "### body",
    "Physique, height, body shape, build, and persistent body traits. Exclude normal/default traits.",
    "Examples: muscular, toned, skinny, plump, fat, curvy, petite, shortstack, pear-shaped figure, giant, tall, short, flat chest, small breasts, medium breasts, large breasts, broad shoulders, wide hips, thick thighs.",
    hasPreviousVisualState ? "appearance + body + attire form the rolling character baseline. The backend restores unchanged stored fields exactly when visualChanges is empty. Camera framing affects only visibleTags and never changes the stored baseline." : "appearance + body + attire form the rolling character baseline. Copy the SAME tags for the same character across all shots unless the current message clearly changes their present visual state. Camera framing never justifies omitting known baseline traits.",
    "Do not include clothing, expression, action, camera, place, or supplement in body.",
    "### attire",
    "All visible clothing and accessories, or visible lack of clothing, with color, material, and style for each.",
    "Disassemble uniforms into individual items. Always include color details using color names. Do not use vague color traits like colorful or gradient unless the text clearly describes them.",
    "Examples: white loose button-up shirt, black silk dress, side slit, sleeveless, long sleeves, oversized, gray tight jeans, pleated mini skirt, white ankle socks, bare feet, red baseball cap, small blue gem necklace, open shirt, torn clothes, unzipped, midriff.",
    "Use no shirt, no pants, bare feet, or similar absence tags when visually relevant.",
    "If a visible character has no established attire in the current source, previous visual state, or durable baseline, choose one conservative visually coherent outfit supported by their role and setting. Set attireInferred to true. Copy attireInferred from previous visual state when retaining that inferred outfit; otherwise set it to false.",
    "Inferred attire is scene continuity only and must not become durable character memory.",
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
    hasPreviousVisualState ? "- Keep persistent facts represented in every resolved shot. Raw unchanged character baseline fields may remain empty only because Previous Visual State is injected deterministically before rendering; environment fields remain explicit." : "- If a detail appears in one shot and persists, tag it in all subsequent shots.",
    "- If an action or attire is still in motion or still present, repeat it in later shots.",
    "- Continuity moves forward only. Never copy a later paragraph's transformation, prop, attire, action, or environment detail backward into an earlier shot.",
    "- Preserve a continuous pov only when the narrative establishes an ongoing viewpoint. Otherwise choose the strongest perspective for each visual beat.",
    hasPreviousVisualState ? "- visualChanges must be empty for unchanged baseline fields and name only explicit current-source changes or final user-instruction baseline changes; deterministic inheritance preserves exact identity." : "- appearance + body + attire must be identical for the same character across all shots unless the current message explicitly changes their present visual state.",
    "## Data Priority",
    "1. Client comments or explicit user instructions in the current message override all instructions.",
    structuredAnima ? "2. Current message [P#] paragraphs are authoritative for scene content, action, visible emotion, interpersonal tone, and movement direction. Never soften, romanticize, or replace those facts with an inferred atmosphere. Never restore outdated clothing, props, location, or actions from context." : "2. Current message [P#] paragraphs are authoritative for scene content. Never restore outdated clothing, props, location, or actions from context.",
    hasPreviousVisualState ? "3. Previous Visual State is the immediate visual continuity layer. Leave unchanged raw character baseline values empty so the backend injects them exactly, and copy unchanged environment values explicitly; it never overrides an explicit current-source change or a final user-instruction baseline change marked in visualChanges." : "",
    config.characterTagContextEnabled ? `${hasPreviousVisualState ? "4" : "3"}. Character tag history is the durable visual baseline for returning characters: label, age, appearance, body, and explicit base attire.` : "",
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
function fastPerspectiveContract(config) {
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
  if (!config.adaptiveMode) {
    const contract = config.perspectiveMode === "creative" ? creat : config.perspectiveMode === "static" ? stat : config.perspectiveMode === "asset" ? asset : dynamic;
    return ["### Perspective mode - fixed", `Set perspectiveMode to exactly ${config.perspectiveMode} for every shot.`, contract, fixed].join(`
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
function parserInstructionFast(config, options = {}) {
  const fixedAsset = !config.adaptiveMode && config.perspectiveMode === "asset";
  const maxCharacters = fixedAsset ? 1 : config.maxCharacters;
  const structuredAnima = config.promptStyle === "anima";
  const hasPreviousVisualState = config.previousVisualStateEnabled && options.hasPreviousVisualState === true;
  const fixedStatic = !config.adaptiveMode && config.perspectiveMode === "static";
  const staticBackgroundPossible = fixedStatic || config.adaptiveMode;
  const shotInstruction = [
    fixedAsset ? "One shot per selected paragraph, each containing exactly one visible character." : `Generate ${config.minImages}-${config.maxImages} shots total when possible.`,
    "Choose the most visually consequential changes, actions, interactions, or emotional beats across the entire current source; do not favor earlier paragraphs merely because they appear first.",
    fixedAsset ? "Every shot must reference a different selected source paragraph. Never return two shots for the same paragraph." : fixedStatic ? "Keep the visual-novel framing fixed across Static shots. Distinguish additional shots through source-supported changes in primary character, expression, simple pose, or background instead of dramatic cinematography." : "Each additional shot must differ from the other shots in at least two of these dimensions: (1) perspective or framing, (2) focal subject or visible action, and (3) composition, depth, or foreground occlusion.",
    fixedAsset ? "Do not invent narrative events or add a second visible character." : "If the source contains too few distinct visual paragraphs, return fewer shots. Do not repeat a paragraph or invent narrative events.",
    fixedAsset ? "" : "Every shot must reference a different source paragraph. Never return two shots for the same paragraph. Order shots by their visual importance, not paragraph number.",
    structuredAnima ? "Preserve the source's explicit action, direction of movement, visible emotional state, and interpersonal tone. Never replace irritation, fear, conflict, or urgency with romance, serenity, or another inferred mood." : ""
  ].join(`
`);
  const schema = parserSchema(config);
  return [
    "# Image Tagging System",
    "Tag the current message's paragraphs as Danbooru-style English image prompts. Output a single JSON object.",
    "## JSON Format",
    schema.join(`
`),
    structuredAnima ? "- negative is optional. All other displayed fields and nested objects are required except shotPlan, which is required only for Dynamic and must be absent for Static or Creative. Use empty strings or arrays inside required objects when a field does not apply; never collapse an object into a string." : "- negative is optional. All other fields are required, though values may be empty strings when a field does not apply.",
    "- These are the ONLY allowed fields. Adding any unlisted field is a schema violation.",
    coverDirectionContract(config),
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
    structuredAnima ? "Read every original paragraph in order and record the physical environment and stable baselines (label, age, appearance, body, attire) of characters still present after the final paragraph. Use only environment, environmentChanges, and the listed stable character fields; never include action, expression, pose, camera, shotPlan, renderScope, visibleTags, or supplement." : "Read every original paragraph in order and record the final place and stable baselines of characters still present after the final paragraph. Use only place, environmentChanges, and the listed stable character fields; never include action, expression, pose, camera, renderScope, visibleTags, or supplement.",
    "Apply explicit location, attire, appearance, and body changes from unselected paragraphs to terminalState. Do not let an earlier illustrated paragraph overwrite a later narrative change.",
    "## Tag Rules",
    "Use common, objective, visualizable Danbooru-style English tags. Never fabricate tag vocabulary; use simpler well-known equivalents if unsure. Never output placeholder tags or phrases such as unknown, unspecified, not specified, unmentioned, undetermined, default clothing, or unspecified time; leave genuinely nonvisual fields empty instead.",
    structuredAnima ? "Tag fields are comma-separated tags. Atomic composition and sharedComposition values are concise comma-free natural-language phrases. Environment arrays contain one comma-free visual snippet per item." : "All fields are comma-separated tags except supplement, which is a short objective visual sentence.",
    "Character names are private memory keys. Outside characters[].name, never write a full name or first name in any field, including situation, renderScope, visibleTags, composition, sharedComposition, camera, environment, place, supplement, or negative. Use visual descriptors such as left woman, right man, foreground character, or background character.",
    `Character limit: max ${maxCharacters} character object(s) per shot. Do not add another character object beyond this limit; refer to an additional anonymous out-of-frame person only through visible composition when the source requires it.`,
    hasPreviousVisualState ? "Previous Visual State is injected after parsing. For an unchanged returning character, leave age, appearance, body, and attire empty and leave visualChanges empty; the backend restores the exact stored baseline before rendering and persistence. For a new character, or when no matching previous character exists, output the complete baseline. For an explicit current-source change or a final user instruction that adds or replaces durable character tags, list that field in visualChanges and output its complete new value." : "Repeat stable appearance, body, and attire tags for returning characters across all shots unless the current message clearly changes their present visual state.",
    "Continuity does not require repeating camera angle, framing, composition, depth, or occlusion. Vary those deliberately between shots while preserving narrative facts.",
    "Before returning the batch, compare Dynamic cameras as a soft camera ledger. When two equally suitable cameras would contain their focal actions, prefer different framing + angle + perspective tuples. Never choose a worse, more extreme, or action-cropping camera merely to create variety.",
    fastPerspectiveContract(config),
    structuredAnima ? "### Camera values" : "",
    structuredAnima ? "- camera.framing must be empty or exactly one of: portrait, close-up, medium close-up, upper body, medium shot, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, body-part focus. camera.angle must be empty or exactly one of: eye level, low angle, high angle, dutch angle. camera.perspective must be empty or exactly one of: straight-on, from above, from behind, from below, from side, sideways, three-quarter view, pov. camera.focus may contain at most two of: shallow depth of field, deep focus, background blur, foreground blur, motion blur, fisheye, wide-angle lens, telephoto lens. Do not add any other camera keys or values." : "- Framing tags: portrait, upper body, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, close-up, body-part focus. Perspective tags: from above, from behind, from below, from side, high up, sideways, straight-on, upside-down, pov.",
    structuredAnima ? "### Atomic Natural Composition" : config.supplement ? "### Natural Language Supplement" : "Do not include supplement text.",
    structuredAnima ? "characters[].composition is always required and uses its four atomic fields (position, pose, actions, gaze), rendered in that exact order. Each phrase is concise, comma-free, independently visual, and never repeats a fact from another field. Never use names; say viewer, left girl, right boy, foreground character, or background character. Never put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle, appearance, attire, or facial-expression adjectives in any composition field." : config.supplement ? "In supplement, describe visible details in concise objective telegraphic sentences: composition, framing, positions, interactions, unusual vantage points, or objective atmosphere/lighting. Separate phrases with commas, never semicolons. No names, no smell, sound, internal sensation, invisible emotion, or prose narration." : "Do not write supplement.",
    structuredAnima ? "Use sharedComposition.interaction for shared contact or combined actions only, and spatialRelation for one spatial relationship phrase. Do not repeat individual character actions." : "",
    structuredAnima ? config.supplement ? "Environment target budget: exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements. Prefer the source's exact concrete noun phrase over a generic paraphrase; never add a plausible prop the current paragraph does not establish. When the source does not establish time/weather, choose one conservative visually coherent value supported by the setting; never leave timeWeather empty or write unknown or unspecified." : staticBackgroundPossible ? "Environment target budget: exactly one location, exactly one time/weather phrase, empty lightingMood, and 2-3 backgroundElements for every scene containing a Static shot. Prefer the source's exact concrete noun phrase; never add a prop the paragraph does not establish. When the source does not establish time/weather, choose one conservative visually coherent value; never leave timeWeather empty." : "Environment target budget: exactly one location, exactly one time/weather phrase, empty lightingMood and backgroundElements. Prefer the source's exact concrete noun phrase; never add a prop the paragraph does not establish. When the source does not establish time/weather, choose one conservative visually coherent value; never leave timeWeather empty." : "",
    "## Data Priority",
    "1. Client comments or explicit user instructions in the current message override all instructions.",
    "2. Current message [P#] paragraphs are authoritative for scene content. Never restore outdated clothing, props, location, or actions from context.",
    hasPreviousVisualState ? "3. Previous Visual State is the immediate visual continuity layer. It never overrides an explicit current-source change or a final user-instruction baseline change marked in visualChanges." : "",
    config.characterTagContextEnabled ? "4. Character tag history is the durable visual baseline for returning characters: label, age, appearance, body, and explicit base attire. The current message can update the baseline when it clearly changes clothing, lack of clothing, appearance, or body traits." : "",
    "## Output Format",
    "- Output raw JSON only. One JSON object. No XML, HTML, YAML, markdown fences, comments, or prose.",
    "- Double-quoted keys and values. No trailing commas. Validate bracket balance: every { has }, every [ has ].",
    "- Positive tags only unless client says otherwise. English only.",
    "## Character Names",
    "Use names only for the JSON name field as private memory keys. Names will not be included in final prompts. If the narrative provides a multi-word name, copy that full name exactly in characters[].name. If unnamed, use a consistent identifier such as girl A, boy B, shopkeeper, guard, or stranger. Never empty; this is used for cross-message appearance tracking.",
    ...config.originalReference ? [
      "Original Creation Tag:",
      config.originalCreationName || "(empty)",
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
  const object = asRecord(result);
  if (typeof object.finish_reason === "string")
    return object.finish_reason;
  const choices = Array.isArray(object.choices) ? object.choices : [];
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
function dynamicShot(shot, config) {
  if (!config.adaptiveMode)
    return config.perspectiveMode === "dynamic";
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
var ATOMIC_DIRECTION_END = /[.!?:,;]\s*$/;
function dynamicPayloadIssues(payload, config, required = true) {
  if (config.promptStyle !== "anima" || !required)
    return [];
  const issues = [];
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  scenes.forEach((scene, sceneIndex) => {
    const shots = Array.isArray(scene.shots) ? scene.shots : [scene];
    shots.forEach((shot, shotIndex) => {
      if (!dynamicShot(shot, config))
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
  const record = asRecord(camera);
  const framing = cleanString2(record.framing).toLowerCase();
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
function repairDynamicProjectionLocally(payload, config, required) {
  if (config.promptStyle !== "anima" || !required)
    return payload;
  const repaired = JSON.parse(JSON.stringify(payload));
  let shotPlanSanitized = 0;
  let primaryActionsSynthesized = 0;
  let renderScopesDefaulted = 0;
  let visibleTagsSynthesized = 0;
  for (const scene of cleanArray(repaired.scenes)) {
    const shots = Array.isArray(scene.shots) ? scene.shots : [scene];
    for (const shot of shots) {
      if (!dynamicShot(shot, config))
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
    logStage(config, "dynamic_projection_repaired", {
      method: "local",
      shotPlanSanitized,
      primaryActionsSynthesized,
      renderScopesDefaulted,
      visibleTagsSynthesized
    });
  }
  return repaired;
}
function coverPayloadIssues(payload, config) {
  if (!config.coverImageEnabled)
    return [];
  const cover = asRecord(payload.cover);
  if (Object.keys(cover).length === 0)
    return ["cover is missing or is not an object"];
  const issues = [];
  const camera = cover.camera;
  if (config.promptStyle === "anima") {
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
function coverRepairInstruction(issues, config) {
  return [
    "Repair or add only the top-level cover key visual while preserving every existing numbered Scene and terminalState exactly. Return the complete JSON object and no other text.",
    "The cover is a whole-message promotional prompt with no paragraph field. Capture the current message's overall theme or emotional core rather than recreating one Scene.",
    "Use bold magazine-cover or album-art composition, source-grounded symbolic synthesis, and a camera and focal arrangement distinct from every numbered Scene. Do not add readable text, logos, captions, or watermarks.",
    config.promptStyle === "anima" ? "Use exactly the structured cover fields shown in the original schema: environment, camera, shotPlan, situation, characters, sharedComposition, and optional negative." : "Use exactly the flat cover fields shown in the original schema: place, camera, situation, action, characters, supplement, and optional negative.",
    `Problems to repair:
- ${issues.join(`
- `)}`
  ].join(`
`);
}
function modePayloadIssues(payload, config, requireDynamicProjection = true) {
  return [
    ...coverPayloadIssues(payload, config),
    ...staticPayloadIssues(payload, config),
    ...dynamicPayloadIssues(payload, config, requireDynamicProjection)
  ];
}
function modeRepairInstruction(payload, config, issues, requireDynamicProjection = true) {
  const coverIssues = coverPayloadIssues(payload, config);
  const dynamicIssues = dynamicPayloadIssues(payload, config, requireDynamicProjection);
  const staticIssues = staticPayloadIssues(payload, config);
  const hasDynamic = dynamicIssues.length > 0;
  const hasStatic = staticIssues.length > 0;
  if (coverIssues.length > 0 && !hasDynamic && !hasStatic)
    return coverRepairInstruction(coverIssues, config);
  if (coverIssues.length === 0 && hasDynamic && !hasStatic)
    return dynamicRepairInstruction(issues);
  if (coverIssues.length === 0 && hasStatic && !hasDynamic)
    return staticRepairInstruction(issues);
  return [
    "Repair this valid JSON so its cover, Static shots, and Dynamic shots satisfy the listed semantic requirements. Return only valid JSON and preserve all source facts and continuity values.",
    ...coverIssues.length > 0 ? [coverRepairInstruction(coverIssues, config)] : [],
    ...staticIssues.length > 0 ? [staticRepairInstruction(staticIssues)] : [],
    ...dynamicIssues.length > 0 ? [dynamicRepairInstruction(dynamicIssues)] : []
  ].join(`

`);
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
async function resolveParserConnection(config, userId) {
  logStage(config, "parser_connection_resolve_start", { configuredConnectionId: config.parserConnectionId, modelOverride: Boolean(config.parserModel) });
  if (!config.parserConnectionId)
    throw new Error("Select a parser connection before generating.");
  const cacheKey = JSON.stringify([userId ?? null, config.parserConnectionId]);
  const cached = parserConnectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now())
    return cached.connection;
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
  const resolved = { id: connection.id, name: connection.name, provider: connection.provider, model: connection.model };
  cacheParserConnection(cacheKey, resolved);
  return resolved;
}
var unsupportedStructuredOutput = new Set;
function parserStageTokenBudget(model, config, stage) {
  const promptCount = Math.max(1, config.maxImages) + (config.coverImageEnabled ? 1 : 0);
  const budgets = {
    main: Math.min(config.coverImageEnabled ? 7900 : 7000, 1800 + promptCount * 900),
    ideation: Math.min(5000, 1200 + Math.max(1, config.maxImages) * 700),
    preprocess: 2400,
    repair: Math.min(config.coverImageEnabled ? 6800 : 6000, 1600 + promptCount * 800),
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
  if (config.fastMode) {
    const heavyReasoner = /kimi[^\n]*k2[.\-_ ]?7[^\n]*code|claude[^\n]*sonnet[^\n]*5|deepseek[^\n]*v4[^\n]*pro/i.test(model);
    const perImage = 1400 + promptCount * 600;
    const fast = stage === "main" || stage === "repair" ? heavyReasoner ? base : Math.min(base, Math.min(perImage, 5200)) : Math.min(base, 2400);
    return config.parserMaxTokens > 0 ? Math.min(config.parserMaxTokens, fast) : fast;
  }
  if (config.parserMaxTokens > 0)
    return config.parserMaxTokens;
  return base;
}
function parserStageParameters(connection, config, stage, structured = stage !== "preprocess") {
  const parameters = { ...config.parserParameters };
  if (parameters.max_tokens === undefined && parameters.max_completion_tokens === undefined) {
    parameters.max_tokens = parserStageTokenBudget(config.parserModel || connection.model, config, stage);
  }
  const capabilityKey = JSON.stringify([connection.provider, config.parserModel || connection.model]);
  const providerModel = `${connection.provider} ${config.parserModel || connection.model}`.toLowerCase();
  const canRequestJson = /openai|gpt-|gemini|deepseek/.test(providerModel);
  const injectedStructuredOutput = structured && canRequestJson && parameters.response_format === undefined && !unsupportedStructuredOutput.has(capabilityKey);
  if (injectedStructuredOutput)
    parameters.response_format = { type: "json_object" };
  return { parameters, injectedStructuredOutput };
}
async function generateParserText(connection, config, messages, userId, stage = "main", signal) {
  const startedAt = Date.now();
  const selected = parserStageParameters(connection, config, stage);
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
        model: config.parserModel || connection.model,
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
    logStage(config, "parser_llm_start", {
      provider: connection.provider,
      model: config.parserModel || connection.model,
      connectionId: connection.id,
      stage,
      parameterKeys: keysOf(selected.parameters),
      messageCount: messages.length,
      messageLengths: messages.map((message) => message.content.length)
    });
    let result;
    try {
      result = await run(selected.parameters);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!selected.injectedStructuredOutput || !/\b400\b|invalid.*(?:response|argument|format)|response_format/i.test(reason))
        throw error;
      const capabilityKey = JSON.stringify([connection.provider, config.parserModel || connection.model]);
      unsupportedStructuredOutput.add(capabilityKey);
      const fallbackParameters = { ...selected.parameters };
      delete fallbackParameters.response_format;
      logStage(config, "parser_structured_output_fallback", { stage, reason }, "warn");
      result = await run(fallbackParameters);
    }
    const text = extractText(result);
    const usage = extractUsage(result);
    const finishReason = extractFinishReason(result);
    logStage(config, "parser_llm_done", {
      stage,
      outputLength: text.length,
      elapsedMs: Date.now() - startedAt,
      ...finishReason ? { finishReason } : {},
      ...Object.keys(usage).length ? { usage } : {}
    });
    if (finishReason === "length" && !text.trim())
      throw new Error("Parser response was truncated before producing JSON.");
    return text;
  } catch (error) {
    if (signal?.aborted)
      throw abortError(typeof signal.reason === "string" ? signal.reason : undefined);
    logStage(config, "parser_llm_error", {
      stage,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    }, "error");
    throw new Error(`Parser generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function generateCreativeConcepts(parserConnection, config, paragraphs, targetSource, context, previousConcepts = [], userId, signal) {
  try {
    logStage(config, "creative_ideation_start", {
      paragraphCount: paragraphs.length,
      previousConceptCount: previousConcepts.length,
      adaptiveMode: config.adaptiveMode
    });
    const raw = await generateParserText(parserConnection, config, parserMessages(creativeIdeationInstruction(config, previousConcepts), continuityReference(context.preprocessingSystemContext ?? context.systemContext, context.recentContext), creativeIdeationRequest(targetSource), context.override, "auxiliary"), userId, "ideation", signal);
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
    throwIfAborted(signal);
    logStage(config, "creative_ideation_fallback", {
      reason: error instanceof Error ? error.message : String(error)
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
function preprocessingInstruction(paragraphs, config) {
  const minimum = Math.min(config.minImages, paragraphs.length);
  const maximum = Math.min(config.maxImages, paragraphs.length);
  const perspectiveGuidance = config.adaptiveMode ? "Select varied candidates that give the main parser strong options for Creative, Static, or Dynamic treatment." : config.perspectiveMode === "creative" ? "Favor concrete but easily overlooked visual anchors: partial subjects, objects, reflections, silhouettes, foreground fragments, environmental details, or unusual spatial relationships." : config.perspectiveMode === "asset" ? "One shot per selected paragraph, each containing exactly one visible character." : config.perspectiveMode === "static" ? "Favor stable clearly readable beats with conventional framing, limited motion, and limited occlusion." : "Favor significant visible action, movement, interaction, and cinematic changes.";
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
function validatePreprocessedTarget(value, paragraphs, config) {
  const summary = cleanString2(value);
  if (!summary)
    return null;
  const lines = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const minimum = Math.min(config.minImages, paragraphs.length);
  const maximum = Math.min(config.maxImages, paragraphs.length);
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
async function preprocessTargetParagraphs(parserConnection, config, paragraphs, context, userId, signal) {
  const rawTarget = formatTargetParagraphs(paragraphs);
  if (!config.preprocessingEnabled)
    return rawTarget;
  try {
    const summary = await generateParserText(parserConnection, config, parserMessages(preprocessingInstruction(paragraphs, config), continuityReference(context.preprocessingSystemContext ?? context.systemContext, context.recentContext), preprocessingUserRequest(rawTarget), context.override, "auxiliary"), userId, "preprocess", signal);
    const selection = validatePreprocessedTarget(summary, paragraphs, config);
    if (selection) {
      logStage(config, "preprocessing_done", {
        summaryLength: selection.summary.length,
        candidateCount: paragraphs.length,
        selectedCount: selection.selectedParagraphs.length,
        selectedParagraphs: selection.selectedParagraphs,
        cameraNotes: selection.cameraNotes
      });
      return routedTargetSource(rawTarget, selection);
    }
    logStage(config, "preprocessing_fallback", { reason: "invalid_selection", summaryLength: cleanString2(summary).length }, "warn");
  } catch (error) {
    throwIfAborted(signal);
    logStage(config, "preprocessing_fallback", { reason: error instanceof Error ? error.message : String(error) }, "warn");
  }
  return rawTarget;
}
function terminalParagraphNumber(value) {
  const match = String(value ?? "").match(/\d+/);
  if (!match)
    return null;
  const paragraph = Number(match[0]);
  return Number.isSafeInteger(paragraph) && paragraph > 0 ? paragraph : null;
}
function terminalStateIssues(payload, config, currentParagraphs, required) {
  if (!required)
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
  if (config.promptStyle === "anima") {
    if (!terminal.environment || typeof terminal.environment !== "object" || Array.isArray(terminal.environment)) {
      issues.push("terminalState.environment must remain an object");
    }
  } else if (!Object.prototype.hasOwnProperty.call(terminal, "place")) {
    issues.push("terminalState.place is required for Default prompt style");
  }
  return issues;
}
function terminalStateRepairInstruction(issues, config, currentParagraphs) {
  const finalParagraph = currentParagraphs.at(-1);
  return [
    "Repair or add only the non-rendered terminalState object while preserving every existing scene and shot exactly. Return the complete JSON object and no other text.",
    finalParagraph ? `Set terminalState.paragraph to P${finalParagraph}, the final original numbered paragraph.` : "Use the final original numbered paragraph for terminalState.paragraph.",
    config.promptStyle === "anima" ? "terminalState contains paragraph, a complete environment object, environmentChanges, and characters still present after all source paragraphs." : "terminalState contains paragraph, place, environmentChanges, and characters still present after all source paragraphs.",
    "Terminal characters contain only name, label, age, appearance, body, attire, attireInferred, and visualChanges. Never add actions, expressions, camera, composition, or rendering fields.",
    "Use the full current source chronology. Later source changes override earlier illustrated scenes.",
    `Problems to repair:
- ${issues.join(`
- `)}`
  ].join(`
`);
}
function payloadRepairInput(payload, messages, includeCurrentSource) {
  if (!includeCurrentSource)
    return JSON.stringify(payload);
  return [
    "## Current Numbered Paragraph Source",
    currentSourceText(messages),
    "## JSON to Repair",
    JSON.stringify(payload)
  ].join(`

`);
}
async function parsePayloadWithRepair(parserConnection, config, messages, userId, signal) {
  const raw = await generateParserText(parserConnection, config, messages, userId, "main", signal);
  if (!raw.trim())
    throw new Error("Parser returned an empty response.");
  const requireDynamicProjection = messages.some((message) => message.role === "system" && message.content.includes("shotPlan.primaryAction"));
  const requireTerminalState = messages.some((message) => message.role === "system" && message.content.includes("## Terminal Visual State"));
  const currentParagraphs = currentParagraphReferences(messages);
  const routedParagraphs = routedParagraphReferences(messages);
  const allowedParagraphs = routedParagraphs.length > 0 ? routedParagraphs : currentParagraphs;
  const fallbackParagraph = allowedParagraphs.length === 1 ? allowedParagraphs[0] : undefined;
  let repairSystem = "Repair malformed JSON. Return only valid JSON.";
  let repairInput = raw;
  try {
    logStage(config, "json_parse_start", { rawLength: raw.length, repair: false });
    const parsed = normalizeAtomicCompositionTerms(dedupeExactShotCharacters(recoverSceneParagraphs(parseParserJson(raw), fallbackParagraph)));
    const structuralIssues = structuralPayloadIssues(parsed, allowedParagraphs);
    const terminalIssues = terminalStateIssues(parsed, config, currentParagraphs, requireTerminalState);
    if (structuralIssues.length > 0) {
      repairSystem = [
        structuralRepairInstruction(structuralIssues, allowedParagraphs),
        ...terminalIssues.length > 0 ? [terminalStateRepairInstruction(terminalIssues, config, currentParagraphs)] : []
      ].join(`

`);
      repairInput = payloadRepairInput(parsed, messages, terminalIssues.length > 0);
      throw new Error("Parser payload has no usable numbered shots.");
    }
    const locallyRepaired = repairDynamicProjectionLocally(parsed, config, requireDynamicProjection);
    const issues = modePayloadIssues(locallyRepaired, config, requireDynamicProjection);
    if (terminalIssues.length > 0) {
      repairSystem = [
        terminalStateRepairInstruction(terminalIssues, config, currentParagraphs),
        ...issues.length > 0 ? [modeRepairInstruction(parsed, config, issues, requireDynamicProjection)] : []
      ].join(`

`);
      repairInput = payloadRepairInput(parsed, messages, true);
      throw new Error("Terminal visual state is incomplete.");
    }
    if (issues.length > 0) {
      repairSystem = modeRepairInstruction(parsed, config, issues, requireDynamicProjection);
      repairInput = coverPayloadIssues(parsed, config).length > 0 ? payloadRepairInput(parsed, messages, true) : JSON.stringify(parsed);
      throw new Error("Mode-specific payload is incomplete.");
    }
    logStage(config, "json_parse_done", { repair: false });
    return locallyRepaired;
  } catch {
    logStage(config, "json_parse_failed", { rawLength: raw.length, repairWillRun: true }, "warn");
    const repaired = await generateParserText(parserConnection, config, [
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
    const locallyRepaired = repairDynamicProjectionLocally(parsed, config, requireDynamicProjection);
    const remainingIssues = modePayloadIssues(locallyRepaired, config, requireDynamicProjection);
    const remainingTerminalIssues = terminalStateIssues(parsed, config, currentParagraphs, requireTerminalState);
    if (remainingIssues.length > 0 || remainingTerminalIssues.length > 0) {
      throw new Error(`Parser did not return a complete payload: ${[...remainingIssues, ...remainingTerminalIssues].join("; ")}`);
    }
    logStage(config, "json_parse_done", { repair: true });
    return locallyRepaired;
  }
}
async function repairDynamicCameraDiversity(parserConnection, config, payload, targetSource, userId, signal) {
  const audit = auditDynamicCameraDiversity(payload, config);
  logStage(config, "camera_diversity_audit", audit);
  if (audit.exactCollisions.length === 0)
    return payload;
  const hasProjectedDynamicShot = normalizeScenePayload(payload).some(({ shot }) => {
    const perspective = config.adaptiveMode ? cleanString2(shot.perspectiveMode).toLowerCase() : config.perspectiveMode;
    return perspective === "dynamic" && Boolean(cleanString2(asRecord(shot.shotPlan).primaryAction));
  });
  if (hasProjectedDynamicShot) {
    logStage(config, "camera_diversity_soft_collision_preserved", {
      reason: "camera and crop-visible projection must remain aligned",
      signatures: audit.signatures,
      exactCollisions: audit.exactCollisions
    });
    return payload;
  }
  const local = repairDynamicCameraDiversityLocally(payload, config, audit);
  if (local) {
    logStage(config, "camera_diversity_repaired", {
      method: "local",
      before: audit.signatures,
      after: auditDynamicCameraDiversity(local, config).signatures,
      remainingExactCollisions: 0
    });
    return local;
  }
  if (config.fastMode) {
    logStage(config, "camera_diversity_remote_repair_skipped", {
      reason: "fast_mode",
      signatures: audit.signatures,
      exactCollisions: audit.exactCollisions
    }, "warn");
    return payload;
  }
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
    ], userId, "camera", signal);
    if (!raw.trim())
      throw new Error("empty camera repair response");
    const repaired = parseParserJson(raw);
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
    throwIfAborted(signal);
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
function renderInlayBlock(url, _prompt, _negativePrompt, perspectiveMode, _perspectiveSource, _creativeConcept, imageId, chatId, messageId, swipeId, index, config, placement = "paragraph", illustrationNumber = index + 1) {
  const label = placement === "cover" ? "Cover image" : `Inlay ${illustrationNumber}`;
  const asset = perspectiveMode === "asset";
  const width = clampInt2(asset ? config.assetImageWidth : placement === "cover" ? config.coverImageWidth : config.inlayImageWidth, 120, 2400, asset ? DEFAULT_CONFIG.assetImageWidth : placement === "cover" ? DEFAULT_CONFIG.coverImageWidth : DEFAULT_CONFIG.inlayImageWidth);
  const maxHeight = clampInt2(placement === "cover" ? config.coverImageMaxHeightVh : config.inlayImageMaxHeightVh, 10, 100, placement === "cover" ? DEFAULT_CONFIG.coverImageMaxHeightVh : DEFAULT_CONFIG.inlayImageMaxHeightVh);
  return `${MARKER}
<div class="inlay-illustrator-image" data-inlay-illustrator="true" style="display:flex;justify-content:center;align-items:center;margin:10px 0;width:100%;"><img src="${htmlAttr(url)}" alt="${htmlAttr(label)}" data-inlay-illustrator-image-id="${htmlAttr(imageId)}" data-inlay-illustrator-chat-id="${htmlAttr(chatId)}" data-inlay-illustrator-message-id="${htmlAttr(messageId)}" data-inlay-illustrator-swipe-id="${swipeId}" data-inlay-illustrator-image-index="${index}" style="display:block;width:min(100%, ${width}px);max-height:${maxHeight}vh;height:auto;object-fit:contain;border-radius:8px;cursor:zoom-in;"/></div>`;
}
function renderSlotPlaceholder(status, index, placement = "paragraph", illustrationNumber = index + 1) {
  const subject = placement === "cover" ? "Cover image" : `Illustration ${illustrationNumber}`;
  const label = status === "failed" ? `${subject} failed. Use Generate latest to retry.` : status === "cancelled" ? `${subject} cancelled.` : `Generating ${subject.toLowerCase()}…`;
  return `${MARKER}
<div class="inlay-illustrator-placeholder" data-inlay-illustrator="true" data-inlay-illustrator-image-index="${index}" role="status">${htmlAttr(label)}</div>`;
}
function renderInlaidMessage(original, record, config) {
  const cleanOriginal = stripInlayContent(original);
  const blocks = new Map;
  const coverBlocks = [];
  const count = Math.max(1, paragraphCount(cleanOriginal));
  const slotCount = Math.max(record.imageUrls.length, record.paragraphs.length, record.slotStatuses?.length || 0);
  for (let index = 0;index < slotCount; index += 1) {
    const url = record.imageUrls[index] || "";
    const status = record.slotStatuses?.[index];
    if (!url && !status)
      continue;
    const placement = record.placements?.[index] === "cover" ? "cover" : "paragraph";
    const illustrationNumber = record.placements ? record.placements.slice(0, index + 1).filter((candidate) => candidate !== "cover").length : index + 1;
    const paragraph2 = clampInt2(record.paragraphs[index], 1, count, Math.min(index + 1, count));
    const existing = placement === "cover" ? coverBlocks : blocks.get(paragraph2) || [];
    existing.push(url ? renderInlayBlock(url, record.prompts[index] || "", record.negativePrompts?.[index] || "", record.perspectiveModes?.[index], record.perspectiveSources?.[index], record.creativeConcepts?.[index], record.imageIds?.[index] || "", record.chatId || "", record.messageId || "", record.swipeId || 0, index, config, placement, illustrationNumber) : renderSlotPlaceholder(status || "pending", index, placement, illustrationNumber));
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
function workflowPath(hash) {
  return `workflows/${hash}.json`;
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
async function ensureWorkflowStored(hash, workflow, userId) {
  const cacheKey = JSON.stringify([userId ?? null, hash]);
  const existing = storedWorkflowWrites.get(cacheKey);
  if (existing)
    return existing;
  const operation = (async () => {
    const path = workflowPath(hash);
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
  } catch (error) {
    if (storedWorkflowWrites.get(cacheKey) === operation)
      storedWorkflowWrites.delete(cacheKey);
    throw error;
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
  const hash = await contentHash(serialized);
  await ensureWorkflowStored(hash, workflow, userId);
  const compact = { ...parameters };
  compact.workflow = { [WORKFLOW_REFERENCE_KEY]: hash };
  return compact;
}
async function hydrateParameters(parameters, userId) {
  const workflow = parameters.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow))
    return parameters;
  const hash = workflow[WORKFLOW_REFERENCE_KEY];
  if (typeof hash !== "string" || !hash)
    return parameters;
  const hydrated = await readJson(workflowPath(hash), {}, userId);
  if (Object.keys(hydrated).length === 0)
    throw new Error(`Stored ComfyUI workflow ${hash} is unavailable.`);
  return { ...parameters, workflow: hydrated };
}
function isGeneratedRecordReference(value) {
  if (!value || typeof value !== "object")
    return false;
  const record = value;
  return record.storageVersion === 2 && typeof record.recordPath === "string" && typeof record.messageId === "string";
}
function generatedRecordReference(record, path) {
  return {
    storageVersion: 2,
    recordPath: path,
    chatId: record.chatId,
    messageId: record.messageId,
    swipeId: record.swipeId,
    paragraphs: record.paragraphs,
    imageIds: record.imageIds,
    imageUrls: record.imageUrls,
    createdAt: record.createdAt,
    operationId: record.operationId,
    generationStatus: record.generationStatus
  };
}
async function storeGeneratedRecord(chatId, key, record, userId) {
  const path = recordPath(chatId, key);
  const imageParameters = record.imageParameters ? await Promise.all(record.imageParameters.map((parameters) => compactParameters(parameters, userId))) : undefined;
  await writeJson(path, { ...record, imageParameters }, userId);
  return generatedRecordReference(record, path);
}
async function loadGeneratedRecord(value, userId, hydrateWorkflows = true) {
  let record = value;
  if (isGeneratedRecordReference(value)) {
    record = await readJson(value.recordPath, null, userId);
  }
  if (!record || typeof record !== "object")
    return null;
  const candidate = record;
  if (!Array.isArray(candidate.prompts) || !Array.isArray(candidate.paragraphs) || !Array.isArray(candidate.imageUrls) || typeof candidate.messageId !== "string")
    return null;
  if (hydrateWorkflows && candidate.imageParameters) {
    candidate.imageParameters = await Promise.all(candidate.imageParameters.map((parameters) => hydrateParameters(parameters, userId)));
  }
  return candidate;
}
async function migrateLegacyGeneratedRecords(chatId, state, userId) {
  for (const [key, value] of Object.entries(state.generated)) {
    if (isGeneratedRecordReference(value) || !value || typeof value !== "object")
      continue;
    const candidate = value;
    if (typeof candidate.messageId !== "string" || !Array.isArray(candidate.prompts) || !Array.isArray(candidate.paragraphs) || !Array.isArray(candidate.imageUrls))
      continue;
    state.generated[key] = await storeGeneratedRecord(chatId, key, candidate, userId);
  }
}
function rebuildGeneratedImageIndex(state) {
  const index = {};
  for (const [key, value] of Object.entries(state.generated)) {
    if (!value || typeof value !== "object")
      continue;
    const record = value;
    const ids = Array.isArray(record.imageIds) ? record.imageIds : [];
    const urls = Array.isArray(record.imageUrls) ? record.imageUrls : [];
    ids.forEach((id, imageIndex) => {
      if (id)
        index[`id:${id}`] = { key, index: imageIndex };
    });
    urls.forEach((url, imageIndex) => {
      if (url)
        index[`url:${url}`] = { key, index: imageIndex };
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
  } catch (error) {
    spindle.log.warn(`Parser connection list unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
async function sendState(userId, chatId, preparedConfig) {
  const [state, config, parserConnections] = await Promise.all([
    chatId ? getState(chatId, userId) : Promise.resolve(null),
    preparedConfig ? Promise.resolve(preparedConfig) : getConfig(userId),
    getParserConnections(userId)
  ]);
  spindle.sendToFrontend({
    type: "state",
    config,
    parserConnections,
    chatId: chatId || "",
    characterAppearance: state?.characterAppearance || {}
  }, userId);
}

// src/backend/runtime-lock.ts
var REGISTRY_KEY2 = Symbol.for("inlay-illustrator.runtime-locks");
var globalRegistry2 = globalThis;
function registry() {
  const existing = globalRegistry2[REGISTRY_KEY2];
  if (existing && typeof existing === "object" && existing.locks instanceof Set) {
    return existing;
  }
  const created = { locks: new Set };
  globalRegistry2[REGISTRY_KEY2] = created;
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
    const record = await loadGeneratedRecord(state.generated[key], userId, hydrateWorkflows);
    if (!record || record.chatId !== request.chatId)
      continue;
    if (request.messageId && record.messageId !== request.messageId)
      continue;
    if (request.swipeId !== undefined && record.swipeId !== request.swipeId)
      continue;
    const preferredIndex = direct?.key === key ? direct.index : request.imageIndex;
    if (preferredIndex !== undefined && Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < record.imageUrls.length) {
      const idMatches = !request.imageId || record.imageIds?.[preferredIndex] === request.imageId;
      const urlMatches = !request.imageUrl || sameImageUrl(record.imageUrls[preferredIndex] || "", request.imageUrl);
      if (idMatches && urlMatches)
        return { key, record, index: preferredIndex };
    }
    const matchedIndex = record.imageUrls.findIndex((url, index) => request.imageId && record.imageIds?.[index] === request.imageId || request.imageUrl && sameImageUrl(url, request.imageUrl));
    if (matchedIndex >= 0)
      return { key, record, index: matchedIndex };
  }
  throw new Error("The selected image is not present in this chat's generated-image history.");
}
async function getStoredImageDetails(request, userId) {
  const state = await getState(request.chatId, userId);
  const located = await locateStoredGeneratedImage(state, request, userId, false);
  const concept = located.record.creativeConcepts?.[located.index];
  return {
    prompt: located.record.prompts[located.index] || "",
    negativePrompt: located.record.negativePrompts?.[located.index] || "",
    perspectiveMode: located.record.perspectiveModes?.[located.index] || null,
    perspectiveSource: located.record.perspectiveSources?.[located.index] || null,
    creativeConcept: concept ? `${concept.anchor}: ${concept.concept}` : ""
  };
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
function retryClassification(error) {
  const message = error instanceof Error ? error.message : String(error);
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
  const { chatId, messageId, messages, paragraphs, state, config, userId, signal } = input;
  throwIfAborted(signal);
  const targetIndex = Math.max(0, messages.findIndex((message) => message.id === messageId));
  let parsed = null;
  let selected = [];
  let lastParserError = null;
  let conceptCandidates = [...input.creativeCandidates || []];
  let conceptSelections = null;
  let ideationAttempted = false;
  let creativeTargetSource = null;
  const usedConceptIds = new Set(input.usedCreativeConceptIds || []);
  const manualCreative = !config.adaptiveMode && config.perspectiveMode === "creative";
  const creativePipeline = manualCreative || config.adaptiveMode;
  const [parserConnection, lorebookSnapshot, contextSources] = await Promise.all([
    input.preparedParserConnection || resolveParserConnection(config, userId),
    buildLorebookContextSnapshot(chatId, paragraphs.map((paragraph) => paragraph.text).join(`

`), config, userId),
    loadParserContextSources(chatId, config, userId, {
      fastBootstrapCharacter: input.fastBootstrapCharacter === true
    })
  ]);
  for (let attempt = 0;attempt <= config.parserRetries; attempt += 1) {
    try {
      throwIfAborted(signal);
      const context = await buildParserContext(chatId, messages, targetIndex, state.characterAppearance, config, attempt, userId, lorebookSnapshot, config.previousVisualStateEnabled ? state.previousVisualState : undefined, contextSources);
      if (manualCreative && conceptSelections === null) {
        if (config.fastMode) {
          logStage(config, "creative_ideation_skipped", { reason: "fast_mode", mode: "manual_creative" });
          conceptSelections = new Map;
        } else {
          if (!hasUnusedCreativeConcepts(conceptCandidates, usedConceptIds) && !ideationAttempted) {
            const previousConcepts = conceptCandidates.filter((concept) => usedConceptIds.has(concept.id)).map((concept) => concept.concept);
            conceptCandidates = await generateCreativeConcepts(parserConnection, config, paragraphs, formatTargetParagraphs(paragraphs), context, previousConcepts, userId, signal);
            ideationAttempted = true;
          }
          conceptSelections = chooseCreativeConcepts(conceptCandidates, usedConceptIds);
          if (conceptSelections.size === 0 && conceptCandidates.length > 0) {
            conceptSelections = chooseCreativeConcepts(conceptCandidates);
          }
        }
      }
      if (creativePipeline && creativeTargetSource === null) {
        const candidateParagraphs = new Set(conceptCandidates.map((concept) => concept.paragraph));
        if (manualCreative && config.preprocessingEnabled && candidateParagraphs.size > 0) {
          const selectedParagraphs = [...candidateParagraphs].sort((left, right) => left - right);
          const notes = selectedParagraphs.map((paragraph) => {
            const concept = conceptSelections?.get(paragraph) || conceptCandidates.find((candidate) => candidate.paragraph === paragraph);
            return `[P${paragraph}]: Visual thesis: ${concept?.concept || concept?.anchor || "selected Creative focal beat"}; Camera intent: ${concept?.camera || "identity-safe Creative framing"}`;
          });
          creativeTargetSource = routedTargetSource(formatTargetParagraphs(paragraphs), {
            summary: notes.join(`
`),
            selectedParagraphs,
            cameraNotes: selectedParagraphs.map((paragraph) => conceptSelections?.get(paragraph)?.camera || conceptCandidates.find((candidate) => candidate.paragraph === paragraph)?.camera || "identity-safe Creative framing")
          });
          logStage(config, "creative_preprocessing_done", {
            candidateCount: conceptCandidates.length,
            selectedParagraphs
          });
        } else {
          creativeTargetSource = await preprocessTargetParagraphs(parserConnection, config, paragraphs, context, userId, signal);
        }
      }
      const targetSource = creativePipeline ? creativeTargetSource || formatTargetParagraphs(paragraphs) : await preprocessTargetParagraphs(parserConnection, config, paragraphs, context, userId, signal);
      const instruction = parserInstruction(config, {
        hasPreviousVisualState: Boolean(config.previousVisualStateEnabled && state.previousVisualState)
      });
      const referenceContext = continuityReference(context.systemContext, context.recentContext);
      const userRequest = parserUserRequest(targetSource, manualCreative ? creativeConceptConstraint(conceptSelections || new Map, false) : "");
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
      parsed = await parsePayloadWithRepair(parserConnection, config, parserMessages(instruction, referenceContext, userRequest, context.override), userId, signal);
      parsed = applyPreviousVisualState(parsed, config.previousVisualStateEnabled ? state.previousVisualState : undefined);
      parsed = await repairDynamicCameraDiversity(parserConnection, config, parsed, targetSource, userId, signal);
      if (config.adaptiveMode && config.fastMode) {
        logStage(config, "creative_ideation_skipped", { reason: "fast_mode", mode: "adaptive" });
        conceptSelections = new Map;
      } else if (config.adaptiveMode) {
        const creativeParagraphs = new Set(normalizeScenePayload(parsed).filter(({ shot }) => cleanString2(shot.perspectiveMode).toLowerCase() === "creative").map(({ parserParagraph }) => parserParagraph));
        if (creativeParagraphs.size > 0) {
          const creativeParagraphEntries = paragraphs.filter((paragraph) => creativeParagraphs.has(paragraph.parserIndex));
          if (!hasUnusedCreativeConcepts(conceptCandidates, usedConceptIds) && !ideationAttempted) {
            const previousConcepts = conceptCandidates.filter((concept) => usedConceptIds.has(concept.id)).map((concept) => concept.concept);
            conceptCandidates = await generateCreativeConcepts(parserConnection, config, creativeParagraphEntries, formatTargetParagraphs(creativeParagraphEntries), context, previousConcepts, userId, signal);
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
      selected = selectPromptEntries(parsed, paragraphs, config, conceptSelections || new Map, conceptCandidates);
      if (!config.adaptiveMode && config.perspectiveMode === "creative" && (conceptSelections?.size || 0) > 0) {
        selected = selected.filter((entry) => Boolean(entry.creativeConcept));
      }
      if (selected.length === 0)
        throw new Error("No usable prompts were parsed.");
      const cover = selectCoverPromptEntry(parsed, paragraphs, config);
      if (cover)
        selected = [cover, ...selected];
      if (attempt === 0 && config.parserRetries > 0 && compactLorebookNeedsFullRetry(parsed, lorebookSnapshot)) {
        throw new Error("Compact lorebook context did not produce durable character tags; retrying with full lorebook context.");
      }
      break;
    } catch (error) {
      throwIfAborted(signal);
      lastParserError = error;
      const classification = retryClassification(error);
      logStage(config, "parser_attempt_failed", { attempt, retries: config.parserRetries, classification, error: error instanceof Error ? error.message : String(error) }, attempt >= config.parserRetries ? "error" : "warn");
      if (attempt >= config.parserRetries || classification === "terminal")
        throw error;
      if (classification === "transient")
        await waitForParserRetry(attempt, signal);
    }
  }
  if (!parsed)
    throw new Error(lastParserError instanceof Error ? lastParserError.message : "Parser did not return usable prompts.");
  return { parsed, selected };
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
    placements: selected.map((entry) => entry.placement || "paragraph"),
    promptLengths: selected.map((entry) => renderPrompt(entry.prompt, config.promptSyntax).length),
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
function pendingGenerationRecord(context, selected, parsed) {
  return {
    chatId: context.chatId,
    messageId: context.messageId,
    swipeId: context.swipeId,
    prompts: selected.map((entry) => renderPrompt(entry.prompt, context.config.promptSyntax)),
    negativePrompts: selected.map((entry) => entry.negative || ""),
    perspectiveModes: selected.map((entry) => entry.perspectiveMode),
    perspectiveSources: selected.map((entry) => entry.perspectiveSource),
    imageParameters: selected.map(() => ({})),
    corePrompts: selected.map((entry) => renderPrompt(entry.corePrompt, context.config.promptSyntax)),
    shotNegatives: selected.map((entry) => entry.shotNegative),
    promptFormats: selected.map((entry) => entry.corePrompt.format || "ordered"),
    creativeConcepts: selected.map((entry) => entry.creativeConcept || null),
    creativeConceptCandidates: selected.map((entry) => entry.creativeCandidates || []),
    creativeConceptHistory: selected.map((entry) => entry.creativeConcept ? [entry.creativeConcept.id] : []),
    placements: selected.map((entry) => entry.placement || "paragraph"),
    paragraphs: selected.map((entry) => entry.paragraph),
    imageIds: selected.map(() => ""),
    imageUrls: selected.map(() => ""),
    slotStatuses: selected.map(() => "pending"),
    slotErrors: selected.map(() => ""),
    operationId: context.operation.id,
    generationStatus: "pending",
    sourceFingerprint: context.sourceFingerprint,
    rawJson: parsed,
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
function recordMetadata(message, record) {
  return {
    ...message.metadata || {},
    inlayIllustratorImageIds: record.imageIds,
    inlayIllustratorParagraphs: record.paragraphs,
    inlayIllustratorGeneratedAt: record.createdAt,
    inlayIllustratorOperationId: record.operationId,
    inlayIllustratorGenerationStatus: record.generationStatus
  };
}
async function renderProgressiveRecord(message, record, context) {
  await spindle.chat.updateMessage(context.chatId, context.messageId, {
    content: renderInlaidMessage(String(message.content || ""), record, context.config),
    metadata: recordMetadata(message, record),
    skipChunkRebuild: true
  });
}
async function initializeProgressiveGeneration(context, record) {
  await enqueueMessageCommit(context, async () => {
    const messages = await spindle.chat.getMessages(context.chatId);
    const current = messages.find((message) => message.id === context.messageId);
    assertCurrentSource(current, context);
    const reference = await storeGeneratedRecord(context.chatId, context.key, record, context.userId);
    const committed = await updateState(context.chatId, context.userId, async (state) => {
      await migrateLegacyGeneratedRecords(context.chatId, state, context.userId);
      updateCharacterMemory(state, record.rawJson);
      state.generated[context.key] = reference;
      rebuildGeneratedImageIndex(state);
    });
    await renderProgressiveRecord(current, record, context);
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
    const record = committedRecord;
    if (!record)
      throw new Error("The progressive illustration record could not be persisted.");
    await renderProgressiveRecord(currentMessage, record, context);
    return record;
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
  await mutateProgressiveGeneration(context, (record) => ({
    ...record,
    prompts: replaceAt(record.prompts, job.index, job.prompt, ""),
    negativePrompts: replaceAt(record.negativePrompts, job.index, job.negative, ""),
    perspectiveModes: replaceAt(record.perspectiveModes, job.index, job.perspectiveMode || context.config.perspectiveMode, "dynamic"),
    perspectiveSources: replaceAt(record.perspectiveSources, job.index, job.perspectiveSource || "manual", "manual"),
    imageParameters: replaceAt(record.imageParameters, job.index, job.parameters, {}),
    corePrompts: replaceAt(record.corePrompts, job.index, job.corePrompt || "", ""),
    shotNegatives: replaceAt(record.shotNegatives, job.index, job.shotNegative || "", ""),
    promptFormats: replaceAt(record.promptFormats, job.index, job.promptFormat || "ordered", "ordered"),
    creativeConcepts: replaceAt(record.creativeConcepts, job.index, job.creativeConcept || null, null),
    creativeConceptCandidates: replaceAt(record.creativeConceptCandidates, job.index, job.creativeCandidates || [], []),
    placements: replaceAt(record.placements, job.index, job.placement || "paragraph", "paragraph"),
    paragraphs: replaceAt(record.paragraphs, job.index, job.paragraph, 1),
    imageIds: replaceAt(record.imageIds, job.index, imageId, ""),
    imageUrls: replaceAt(record.imageUrls, job.index, imageUrl, ""),
    slotStatuses: replaceAt(record.slotStatuses, job.index, status, "pending"),
    slotErrors: replaceAt(record.slotErrors, job.index, reason.slice(0, 500), "")
  }));
  return completed;
}
async function finalizeProgressiveGeneration(context, parsed, successfulParserParagraphs, cancelled) {
  const visualState = successfulParserParagraphs.length > 0 ? buildPreviousVisualState(parsed, successfulParserParagraphs) : null;
  return mutateProgressiveGeneration(context, (record) => {
    const slotStatuses = (record.slotStatuses || record.imageUrls.map((url) => url ? "completed" : "pending")).map((status) => status === "pending" || status === "generating" ? cancelled ? "cancelled" : "failed" : status);
    const hasSuccess = slotStatuses.includes("completed");
    return {
      ...record,
      slotStatuses,
      generationStatus: cancelled ? "cancelled" : hasSuccess ? "completed" : "failed"
    };
  }, (state) => {
    if (successfulParserParagraphs.length > 0) {
      if (visualState)
        state.previousVisualState = visualState;
      else
        delete state.previousVisualState;
    }
  });
}
async function prepareAndDispatchImages(chatId, selected, config, userId, preparedImageConnection, options = {}) {
  throwIfAborted(options.signal);
  const imageConnection = await (preparedImageConnection || resolveImageConnection(config, userId));
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
      placement: entry.placement || "paragraph",
      paragraph: entry.paragraph,
      parserParagraph: entry.parserParagraph,
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
      userId,
      includeDataUrl: false
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
  }, options);
}
async function commitImageReplacement(request, replacement, config, userId, parsedForMemory) {
  let committedKey = "";
  let committedIndex = -1;
  let committedRecord = null;
  const state = await updateState(request.chatId, userId, async (current) => {
    await migrateLegacyGeneratedRecords(request.chatId, current, userId);
    const located = await locateStoredGeneratedImage(current, request, userId);
    committedKey = located.key;
    committedIndex = located.index;
    const record2 = located.record;
    committedRecord = {
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
    current.generated[located.key] = await storeGeneratedRecord(request.chatId, located.key, committedRecord, userId);
    if (parsedForMemory)
      updateCharacterMemory(current, parsedForMemory);
    rebuildGeneratedImageIndex(current);
  });
  const record = committedRecord;
  if (!record || committedIndex < 0)
    throw new Error("The replacement image could not be persisted.");
  await enqueueMessageWrite(userId, request.chatId, record.messageId, async () => {
    const latestState = await getState(request.chatId, userId);
    const latestRecord = await loadGeneratedRecord(latestState.generated[committedKey], userId, false) || record;
    const messages = await spindle.chat.getMessages(request.chatId);
    const target = messages.find((message) => message.id === record.messageId);
    if (!target)
      throw new Error("The source assistant message no longer exists.");
    await spindle.chat.updateMessage(request.chatId, record.messageId, {
      content: renderInlaidMessage(String(target.content || ""), latestRecord, config),
      metadata: {
        ...target.metadata || {},
        inlayIllustratorImageIds: latestRecord.imageIds,
        inlayIllustratorParagraphs: latestRecord.paragraphs,
        inlayIllustratorGeneratedAt: latestRecord.createdAt
      },
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
  return { record, index: committedIndex };
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
    const config = preparedConfig || await getConfig(userId);
    const initialState = await getState(request.chatId, userId);
    const located = await locateStoredGeneratedImage(initialState, request, userId);
    const imageConnection = await resolveImageConnection(config, userId);
    let replacement;
    let selectionForMemory;
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
      const isCover = located.record.placements?.[located.index] === "cover";
      const allParagraphs = prepareParagraphs(String(target.content || ""), config);
      const sourceParagraph = allParagraphs.find((paragraph) => paragraph.originalIndex === originalParagraph);
      if (!isCover && !sourceParagraph)
        throw new Error("The source paragraph for this image no longer exists.");
      if (isCover && allParagraphs.length === 0)
        throw new Error("The source message has no usable paragraphs for a cover prompt.");
      const singleConfig = {
        ...effectiveGenerationConfig(config),
        coverImageEnabled: isCover,
        minImages: 1,
        maxImages: 1,
        preprocessingEnabled: false,
        previousVisualStateEnabled: false
      };
      const paragraphs = isCover ? allParagraphs : [{ ...sourceParagraph, parserIndex: 1 }];
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
    const committed = await commitImageReplacement(request, replacement, config, userId, rerunSidecar ? selectionForMemory : undefined);
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
async function runGenerationForMessage(chatId, messageId, content, operation, userId, prepared) {
  const generationStartedAt = Date.now();
  const signal = operation.controller.signal;
  let config = null;
  let context = null;
  let parsed = null;
  let initialized = false;
  let initializationPromise = null;
  let releaseGeneration = null;
  const successfulParserParagraphs = [];
  try {
    throwIfAborted(signal);
    const storedConfig = prepared?.config || await getConfig(userId);
    config = effectiveGenerationConfig(storedConfig);
    logStage(config, "request_received", { chatId, messageId, contentLength: content.length, enabled: config.enabled, autoGenerate: config.autoGenerate });
    if (config.fastMode) {
      logStage(config, "fast_mode_applied", {
        configuredMinImages: storedConfig.minImages,
        configuredMaxImages: storedConfig.maxImages,
        effectiveMinImages: config.minImages,
        effectiveMaxImages: config.maxImages,
        recentContextSkipped: true,
        preprocessingSkipped: true,
        retriesDisabled: true,
        lorebookSkipped: storedConfig.includeLorebook && !config.includeLorebook
      });
    }
    if (!config.enabled) {
      logStage(config, "request_skipped", { reason: "disabled", chatId, messageId });
      return;
    }
    reportGenerationProgress(operation, "loading", userId);
    const messagesPromise = prepared?.messages ? Promise.resolve(prepared.messages) : spindle.chat.getMessages(chatId);
    const statePromise = getState(chatId, userId);
    const imageConnectionPromise = resolveImageConnection(config, userId);
    const parserConnectionPromise = resolveParserConnection(config, userId);
    imageConnectionPromise.catch(() => {
      return;
    });
    parserConnectionPromise.catch(() => {
      return;
    });
    const [messages, state] = await Promise.all([messagesPromise, statePromise]);
    throwIfAborted(signal);
    const target = messages.find((message) => message.id === messageId);
    logStage(config, "target_checked", {
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
      logStage(config, "request_skipped", { reason: "already_running", key });
      return;
    }
    if (state.generated[key]) {
      const existing = await loadGeneratedRecord(state.generated[key], userId, false);
      const hasIncompleteSlot = existing?.slotStatuses?.some((status) => status !== "completed") || false;
      if (!existing?.generationStatus || existing.generationStatus === "completed" && !hasIncompleteSlot) {
        logStage(config, "request_skipped", { reason: "already_generated", key });
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
      config,
      userId
    };
    const paragraphs = prepareParagraphs(sourceContent, config);
    logStage(config, "paragraph_cleanup_done", {
      originalParagraphs: paragraphCount(sourceContent),
      parserParagraphs: paragraphs.length,
      mappedOriginalParagraphs: paragraphs.map((paragraph) => paragraph.originalIndex),
      ignoredTagCount: ignoredTagNames(config).length
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
      config,
      userId,
      signal,
      preparedParserConnection: parserConnectionPromise,
      fastBootstrapCharacter: config.fastMode && config.includeCharacterInfo && Object.keys(state.characterAppearance).length === 0
    });
    parsed = selection.parsed;
    const selected = selection.selected;
    logParsedSelection(parsed, selected, paragraphs, config);
    operation.total = selected.length;
    reportGenerationProgress(operation, "preparing", userId);
    initializationPromise = initializeProgressiveGeneration(context, pendingGenerationRecord(context, selected, parsed)).then(() => {
      initialized = true;
    });
    initializationPromise.catch(() => {
      return;
    });
    reportGenerationProgress(operation, "generating", userId);
    await prepareAndDispatchImages(chatId, selected, config, userId, imageConnectionPromise, {
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
        } catch (error) {
          throw error;
        }
      }
    });
    await initializationPromise;
    throwIfAborted(signal);
    reportGenerationProgress(operation, "persisting", userId);
    const record = await finalizeProgressiveGeneration(context, parsed, successfulParserParagraphs, false);
    reportGenerationProgress(operation, "completed", userId);
    spindle.sendToFrontend({ type: "status", chatId, operationId: operation.id, status: "Generated", record }, userId);
    logStage(config, "generation_pipeline_done", {
      chatId,
      messageId,
      imageCount: record.imageUrls.filter(Boolean).length,
      elapsedMs: Date.now() - generationStartedAt
    });
  } catch (error) {
    const cancelled = isAbortError(error, signal);
    if (!initialized && initializationPromise) {
      try {
        await initializationPromise;
      } catch {}
    }
    if (initialized && context && parsed) {
      try {
        await finalizeProgressiveGeneration(context, parsed, successfulParserParagraphs, cancelled);
      } catch (finalizeError) {
        logStage(config || { debugLogging: true }, "progressive_finalize_error", {
          error: finalizeError instanceof Error ? finalizeError.message : String(finalizeError)
        }, "error");
      }
    }
    if (cancelled) {
      reportGenerationProgress(operation, "cancelled", userId);
      return;
    }
    reportGenerationProgress(operation, "failed", userId, error instanceof Error ? error.message : String(error));
    throw error;
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
    await generateForMessage(payload.chatId, payload.messageId, payload.content, userId, { config });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStage(configForError || { debugLogging: true }, "auto_generation_error", { error: message }, "error");
    spindle.log.error(`Auto generation failed: ${message}`);
    spindle.sendToFrontend({ type: "status", chatId: payload.chatId, status: "Error", error: message }, userId);
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
      await sendState(userId, chatId, config);
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
      spindle.sendToFrontend({ type: "status", chatId, status: "Generating..." }, userId);
      await generateForMessage(chatId, target.id, target.content, userId, {
        config,
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
      } catch (error) {
        spindle.sendToFrontend({
          type: "inlay_image_details_result",
          requestId: String(message.requestId || ""),
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }, userId);
      }
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
      spindle.sendToFrontend({ type: "status", chatId, status: actionLabel }, userId);
      const result = await rerunStoredImage(request, rerunSidecar, userId, config);
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
      spindle.sendToFrontend({ type: "status", chatId, status: rerunSidecar ? "Sidecar rerun complete" : "Image rerolled", record: result.record }, userId);
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
    spindle.sendToFrontend({ type: "status", chatId: String(message.chatId || ""), status: "Error", error: errorMessage }, userId);
  }
});
spindle.log.info("Inlay Illustrator loaded.");
export {
  __testables
};
