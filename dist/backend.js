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
      const content = stripInlayContent(message.content);
      return content === message.content ? message : { ...message, content };
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

// src/shared/config.ts
var INLAY_IMAGE_ASPECT_PRESETS = [
  { value: "auto", label: "Auto (Image ratio)" },
  { value: "wide", label: "Wide 16:9" },
  { value: "standard", label: "Standard 4:3" },
  { value: "square", label: "Square 1:1" },
  { value: "portrait", label: "Portrait 3:4" },
  { value: "vertical", label: "Vertical 9:16" },
  { value: "classic", label: "Classic 2:3" }
];
var INLAY_IMAGE_ASPECT_RATIOS = {
  wide: { w: 16, h: 9 },
  standard: { w: 4, h: 3 },
  square: { w: 1, h: 1 },
  portrait: { w: 3, h: 4 },
  vertical: { w: 9, h: 16 },
  classic: { w: 2, h: 3 }
};
function positiveDimension(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}
function resolveInlayImageAspect(value, intrinsicDimensions) {
  const key = String(value ?? "").toLowerCase();
  if (key === "auto" || !key) {
    const w = positiveDimension(intrinsicDimensions?.width);
    const h = positiveDimension(intrinsicDimensions?.height);
    if (w && h)
      return { w, h };
    return INLAY_IMAGE_ASPECT_RATIOS.wide;
  }
  return INLAY_IMAGE_ASPECT_RATIOS[key] ?? INLAY_IMAGE_ASPECT_RATIOS.wide;
}
function normalizeInlayImageAspect(value) {
  const key = String(value ?? "").toLowerCase();
  if (key === "auto")
    return "auto";
  return key in INLAY_IMAGE_ASPECT_RATIOS ? key : "auto";
}
var FAB_CORNER_OPTIONS = [
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" }
];
function normalizeFabCorner(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "bottom-left" || normalized === "top-right" || normalized === "top-left") {
    return normalized;
  }
  return "bottom-right";
}
var DEFAULT_CONFIG = {
  enabled: true,
  debugLogging: false,
  parserConnectionId: null,
  parserModel: "",
  parserParameters: {},
  parserMaxTokens: 0,
  imageConnectionId: null,
  imageModel: "",
  imageParameters: {},
  imageAlignment: "center",
  inlayImageAspect: "auto",
  inlayImageMaxHeightVh: 70,
  coverImagePosition: "top",
  coverImageAspect: "wide",
  coverImageWidth: 1200,
  coverImageMaxHeightVh: 80,
  fabCorner: "bottom-right"
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
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}
function normalizeConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const legacy = source.imageGeneration || {};
  const parserParameters = cleanParameters(source.parserParameters);
  const imageParameters = cleanParameters(source.imageParameters);
  return {
    enabled: source.enabled !== false,
    debugLogging: source.debugLogging === true,
    parserConnectionId: cleanNullableString(source.parserConnectionId) || cleanNullableString(legacy.promptParserConnectionId),
    parserModel: cleanString(source.parserModel) || cleanString(legacy.promptParserModel),
    parserParameters: Object.keys(parserParameters).length > 0 ? parserParameters : cleanParameters(legacy.promptParserParameters),
    parserMaxTokens: clampInt(source.parserMaxTokens, 0, 131072, DEFAULT_CONFIG.parserMaxTokens),
    imageConnectionId: cleanNullableString(source.imageConnectionId) || cleanNullableString(legacy.activeImageGenConnectionId),
    imageModel: cleanString(source.imageModel) || cleanString(legacy.model),
    imageParameters: Object.keys(imageParameters).length > 0 ? imageParameters : cleanParameters(legacy.parameters),
    imageAlignment: source.imageAlignment === "left" ? "left" : "center",
    inlayImageAspect: normalizeInlayImageAspect(source.inlayImageAspect),
    inlayImageMaxHeightVh: clampInt(source.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh),
    coverImagePosition: source.coverImagePosition === "bottom" ? "bottom" : "top",
    coverImageAspect: source.coverImageAspect === undefined ? "wide" : normalizeInlayImageAspect(source.coverImageAspect),
    coverImageWidth: clampInt(source.coverImageWidth, 120, 2400, DEFAULT_CONFIG.coverImageWidth),
    coverImageMaxHeightVh: clampInt(source.coverImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.coverImageMaxHeightVh),
    fabCorner: normalizeFabCorner(source.fabCorner)
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

// src/backend/operation-manager.ts
var REGISTRY_KEY = Symbol.for("inlay-illustrator.generation-operations");

// src/backend/utils.ts
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function keysOf(value) {
  return Object.keys(asRecord(value));
}
function cleanArray(value) {
  return Array.isArray(value) ? value : [];
}

// src/backend/llm-client.ts
var connectionCache = new Map;
var unsupportedStructuredOutput = new Set;
async function listLlmConnections(userId) {
  try {
    return (await spindle.connections.list(userId)).map((connection) => ({
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      model: connection.model
    }));
  } catch (error) {
    spindle.log.warn(`LLM connection list unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

// src/backend/storage.ts
var CONFIG_PATH = "config.json";
var jsonUpdateQueues = new Map;
function mergeFallback(value, fallback) {
  if (value && typeof value === "object" && !Array.isArray(value) && fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
    return { ...fallback, ...value };
  }
  return value ?? fallback;
}
async function readJsonStrict(path, fallback, userId) {
  if (typeof spindle.userStorage.getJson === "function") {
    const value = await spindle.userStorage.getJson(path, { fallback, userId });
    return mergeFallback(value, fallback);
  }
  if (!await spindle.userStorage.exists(path, userId))
    return fallback;
  const text = await spindle.userStorage.read(path, userId);
  return mergeFallback(JSON.parse(text), fallback);
}
async function readJson(path, fallback, userId) {
  try {
    return await readJsonStrict(path, fallback, userId);
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
async function listPaths(prefix, userId) {
  try {
    if (typeof spindle.userStorage.list !== "function")
      return [];
    const paths = await spindle.userStorage.list(prefix, userId);
    return Array.isArray(paths) ? paths.filter((path) => typeof path === "string" && path.length > 0) : [];
  } catch {
    return [];
  }
}
async function updateJson(path, fallback, mutator, userId) {
  const queueKey = JSON.stringify([userId ?? null, path]);
  const previous = jsonUpdateQueues.get(queueKey) || Promise.resolve();
  const operation = previous.then(async () => {
    const current = await readJsonStrict(path, fallback(), userId);
    const returned = await mutator(current);
    const next = returned === undefined ? current : returned;
    await writeJson(path, next, userId);
    return next;
  });
  const tail = operation.then(() => {
    return;
  }, () => {
    return;
  });
  jsonUpdateQueues.set(queueKey, tail);
  try {
    return await operation;
  } finally {
    if (jsonUpdateQueues.get(queueKey) === tail)
      jsonUpdateQueues.delete(queueKey);
  }
}
async function getConfig(userId) {
  return normalizeConfig(await readJson(CONFIG_PATH, DEFAULT_CONFIG, userId));
}
async function setConfig(patch, userId) {
  return updateJson(CONFIG_PATH, () => ({ ...DEFAULT_CONFIG }), (current) => normalizeConfig({ ...normalizeConfig(current), ...patch }), userId);
}
var storedWorkflowWrites = new Map;
async function getImageConnections(userId) {
  try {
    if (!spindle?.imageGen || typeof spindle.imageGen.listConnections !== "function")
      return [];
    return await spindle.imageGen.listConnections(userId);
  } catch (error) {
    spindle.log.warn(`Image connection list unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
async function sendState(userId, chatId, preparedConfig) {
  const [config, parserConnections, imageConnections] = await Promise.all([
    preparedConfig ? Promise.resolve(preparedConfig) : getConfig(userId),
    listLlmConnections(userId),
    getImageConnections(userId)
  ]);
  spindle.sendToFrontend({
    type: "state",
    config,
    parserConnections,
    imageConnections,
    chatId: chatId || ""
  }, userId);
}

// src/backend/legacy-records.ts
var STATE_FALLBACK = { generated: {} };
function str(value) {
  return typeof value === "string" ? value : "";
}
function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}
function conceptText(value) {
  const concept = asRecord(value);
  const anchor = str(concept.anchor);
  const text = str(concept.concept);
  return anchor && text ? `${anchor}: ${text}` : text || anchor;
}
function legacySlotsOf(value) {
  const record = asRecord(value);
  if (Array.isArray(record.slots)) {
    return record.slots.map((entry, index) => {
      const slot = asRecord(entry);
      return {
        imageId: str(slot.imageId),
        imageUrl: str(slot.imageUrl),
        paragraph: integer(slot.paragraph, index + 1),
        prompt: str(slot.prompt),
        negativePrompt: str(slot.negativePrompt),
        perspectiveMode: str(slot.perspectiveMode) || null,
        perspectiveSource: str(slot.perspectiveSource) || null,
        creativeConcept: conceptText(slot.creativeConcept)
      };
    });
  }
  const urls = cleanArray(record.imageUrls);
  const ids = cleanArray(record.imageIds);
  const count = Math.max(urls.length, ids.length);
  return Array.from({ length: count }, (_value, index) => ({
    imageId: str(ids[index]),
    imageUrl: str(urls[index]),
    paragraph: integer(cleanArray(record.paragraphs)[index], index + 1),
    prompt: str(cleanArray(record.prompts)[index]),
    negativePrompt: str(cleanArray(record.negativePrompts)[index]),
    perspectiveMode: str(cleanArray(record.perspectiveModes)[index]) || null,
    perspectiveSource: str(cleanArray(record.perspectiveSources)[index]) || null,
    creativeConcept: conceptText(cleanArray(record.creativeConcepts)[index])
  }));
}
async function loadRecord(key, value, chatId, userId) {
  let stored = asRecord(value);
  const recordPath = str(stored.recordPath);
  if (recordPath) {
    const full = asRecord(await readJson(recordPath, null, userId));
    if (Object.keys(full).length > 0)
      stored = { ...stored, ...full };
  }
  const slots = legacySlotsOf(stored);
  if (slots.length === 0)
    return null;
  let messageId = str(stored.messageId);
  let swipeId = integer(stored.swipeId, 0);
  if (!messageId) {
    const parts = key.split(":");
    if (parts.length >= 3) {
      messageId = parts[1] || "";
      swipeId = integer(parts[2], 0);
    }
  }
  return {
    key,
    chatId: str(stored.chatId) || chatId,
    messageId,
    swipeId,
    createdAt: str(stored.createdAt),
    slots
  };
}
async function loadLegacyRecords(chatId, userId) {
  const state = await readJson(`states/${chatId}.json`, STATE_FALLBACK, userId);
  const generated = asRecord(state.generated);
  const records = [];
  const seenPaths = new Set;
  for (const [key, value] of Object.entries(generated)) {
    const path = str(asRecord(value).recordPath);
    if (path) {
      if (seenPaths.has(path))
        continue;
      seenPaths.add(path);
    }
    try {
      const record = await loadRecord(key, value, chatId, userId);
      if (record)
        records.push(record);
    } catch {}
  }
  return records;
}
async function findLegacyImage(lookup, userId) {
  if (!lookup.chatId)
    return null;
  const records = await loadLegacyRecords(lookup.chatId, userId);
  for (const record of records) {
    const index = record.slots.findIndex((slot) => lookup.imageId && slot.imageId === lookup.imageId || lookup.imageUrl && slot.imageUrl === lookup.imageUrl);
    if (index >= 0)
      return { record, index };
  }
  if (lookup.messageId && lookup.imageIndex !== undefined) {
    const record = records.find((candidate) => candidate.messageId === lookup.messageId && (lookup.swipeId === undefined || candidate.swipeId === lookup.swipeId));
    if (record && record.slots[lookup.imageIndex])
      return { record, index: lookup.imageIndex };
  }
  return null;
}
var GALLERY_CHATS_PER_PAGE = 5;
function compareIds(a, b) {
  if (/^-?\d+$/.test(a) && /^-?\d+$/.test(b)) {
    const diff = Number(a) - Number(b);
    if (diff !== 0)
      return diff;
  }
  return a.localeCompare(b);
}
async function chatInfo(chatId, images, userId) {
  let name;
  let cardName;
  try {
    const host = spindle;
    const meta = typeof host.chats?.get === "function" ? await host.chats.get(chatId, userId) : null;
    if (meta?.name)
      name = meta.name;
    if (meta?.character_id && typeof host.characters?.get === "function") {
      const character = await host.characters.get(meta.character_id, userId);
      if (character?.name)
        cardName = character.name;
    }
  } catch {}
  const messages = new Set(images.map((image) => image.messageId).filter(Boolean));
  const branches = new Set(images.filter((image) => image.swipeId > 0).map((image) => `${image.messageId}:${image.swipeId}`));
  return { chatId, name, cardName, messageCount: messages.size, branchCount: branches.size, images };
}
async function listInlayGallery(userId, page, selectedChatId) {
  const selected = typeof selectedChatId === "string" && /^[a-zA-Z0-9_-]+$/.test(selectedChatId.trim()) ? selectedChatId.trim() : undefined;
  const chatIds = new Set;
  for (const raw of await listPaths("states/", userId)) {
    const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    const path = normalized.startsWith("states/") ? normalized : `states/${normalized}`;
    if (!path.endsWith(".json"))
      continue;
    const chatId = path.slice(7, -5);
    if (chatId && !chatId.includes("/"))
      chatIds.add(chatId);
  }
  if (selected)
    chatIds.add(selected);
  const sorted = [...chatIds].sort(compareIds);
  const totalPages = Math.max(1, Math.ceil(sorted.length / GALLERY_CHATS_PER_PAGE));
  let requested = Math.floor(Number(page));
  if (!Number.isFinite(requested) || requested < 1)
    requested = 1;
  if (requested > totalPages)
    requested = totalPages;
  const targets = selected ? [selected] : sorted.slice((requested - 1) * GALLERY_CHATS_PER_PAGE, requested * GALLERY_CHATS_PER_PAGE);
  const chats = await Promise.all(targets.map(async (chatId) => {
    const images = [];
    for (const record of await loadLegacyRecords(chatId, userId)) {
      if (!record.messageId)
        continue;
      record.slots.forEach((slot, index) => {
        if (!slot.imageUrl)
          return;
        images.push({
          chatId: record.chatId,
          messageId: record.messageId,
          swipeId: record.swipeId,
          imageId: slot.imageId,
          imageUrl: slot.imageUrl,
          imageIndex: index,
          paragraph: slot.paragraph || index + 1,
          prompt: slot.prompt,
          negativePrompt: slot.negativePrompt,
          quote: ""
        });
      });
    }
    images.sort((a, b) => compareIds(a.messageId, b.messageId) || a.swipeId - b.swipeId || a.paragraph - b.paragraph || a.imageIndex - b.imageIndex || a.imageUrl.localeCompare(b.imageUrl));
    return chatInfo(chatId, images, userId);
  }));
  return { page: requested, totalChats: sorted.length, totalPages, chatIds: sorted, chats, records: chats };
}

// src/backend.ts
spindle.registerInterceptor(async (messages) => stripInlayFromMessages(messages));
function optionalInteger(value, minimum = 0) {
  const parsed = Number(value);
  return value !== undefined && value !== null && value !== "" && Number.isInteger(parsed) && parsed >= minimum ? parsed : undefined;
}
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
async function handleFrontendMessage(message, userId) {
  const chatId = String(message.chatId || "");
  switch (message.type) {
    case "get_state": {
      const config = await getConfig(userId);
      logStage(config, "frontend_get_state", { chatId: chatId || null });
      await sendState(userId, chatId, config);
      return;
    }
    case "set_config": {
      const patch = message.patch && typeof message.patch === "object" ? message.patch : {};
      const next = await setConfig(patch, userId);
      logStage(next, "frontend_set_config", { patchKeys: keysOf(patch) });
      spindle.sendToFrontend({ type: "config_updated", chatId, config: next }, userId);
      return;
    }
    case "get_inlay_image_details": {
      const requestId = String(message.requestId || "");
      try {
        const found = await findLegacyImage({
          chatId,
          messageId: String(message.messageId || "") || undefined,
          swipeId: optionalInteger(message.swipeId),
          imageIndex: optionalInteger(message.imageIndex),
          imageId: String(message.imageId || "") || undefined,
          imageUrl: String(message.imageUrl || "") || undefined
        }, userId);
        if (!found)
          throw new Error("No stored details for this image.");
        const slot = found.record.slots[found.index];
        spindle.sendToFrontend({
          type: "inlay_image_details_result",
          requestId,
          ok: true,
          prompt: slot.prompt,
          negativePrompt: slot.negativePrompt,
          perspectiveMode: slot.perspectiveMode,
          perspectiveSource: slot.perspectiveSource,
          creativeConcept: slot.creativeConcept
        }, userId);
      } catch (error) {
        spindle.sendToFrontend({ type: "inlay_image_details_result", requestId, ok: false, error: errorText(error) }, userId);
      }
      return;
    }
    case "list_inlay_gallery": {
      const requestId = String(message.requestId || "");
      const page = Math.max(1, Math.floor(Number(message.page)) || 1);
      const selectedChatId = typeof message.selectedChatId === "string" && message.selectedChatId.trim() ? message.selectedChatId.trim() : undefined;
      try {
        const result = await listInlayGallery(userId, page, selectedChatId);
        spindle.sendToFrontend({ type: "inlay_gallery_result", requestId, ok: true, ...result }, userId);
      } catch (error) {
        spindle.sendToFrontend({ type: "inlay_gallery_result", requestId, ok: false, error: errorText(error) }, userId);
      }
      return;
    }
    default:
      return;
  }
}
spindle.onFrontendMessage(async (payload, userId) => {
  const message = payload && typeof payload === "object" ? payload : {};
  if (acceptAvatarImageResponse(message))
    return;
  try {
    await handleFrontendMessage(message, userId);
  } catch (error) {
    const text = errorText(error);
    logStage({ debugLogging: true }, "frontend_message_error", { type: String(message.type || ""), error: text }, "error");
    spindle.sendToFrontend({ type: "status", chatId: String(message.chatId || ""), status: "Error", error: text }, userId);
  }
});
spindle.log.info("Inlay Illustrator loaded.");
