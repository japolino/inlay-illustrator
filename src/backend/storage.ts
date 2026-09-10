import { DEFAULT_CONFIG, normalizeConfig, type Config, type RawConfig } from "../shared/config.js";
import {
  adaptGeneratedRecord,
  isGeneratedRecordReferenceV3,
  toGeneratedRecordReferenceV3,
  toGeneratedRecordV3,
  type GeneratedRecordReferenceV3,
  type GeneratedRecordV3
} from "./generated-record.js";
import type { LegacyGeneratedRecord, LegacyGeneratedRecordReference } from "./generated-record-legacy.js";
import type { ImageConnection, ParserConnection, State } from "./types.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

type StateMutator = (state: State) => void | Promise<void>;

const stateUpdateQueues = new Map<string, Promise<void>>();
const configUpdateQueues = new Map<string, Promise<void>>();

async function readJsonStrict<T>(path: string, fallback: T, userId?: string): Promise<T> {
  if (typeof spindle.userStorage.getJson === "function") {
    const value = await spindle.userStorage.getJson<T>(path, { fallback, userId });
    return value && typeof value === "object" && fallback && typeof fallback === "object"
      ? { ...fallback, ...value }
      : value ?? fallback;
  }
  if (!(await spindle.userStorage.exists(path, userId))) return fallback;
  const text = await spindle.userStorage.read(path, userId);
  const value = JSON.parse(text) as T;
  return value && typeof value === "object" && fallback && typeof fallback === "object"
    ? { ...fallback, ...value }
    : value ?? fallback;
}

async function readJson<T>(path: string, fallback: T, userId?: string): Promise<T> {
  try {
    return await readJsonStrict(path, fallback, userId);
  } catch {
    return fallback;
  }
}

export async function writeJson(path: string, value: unknown, userId?: string): Promise<void> {
  if (typeof spindle.userStorage.setJson === "function") {
    await spindle.userStorage.setJson(path, value, { indent: 0, userId });
    return;
  }
  const slash = path.lastIndexOf("/");
  if (slash > 0) await spindle.userStorage.mkdir(path.slice(0, slash), userId).catch(() => undefined);
  await spindle.userStorage.write(path, JSON.stringify(value), userId);
}

export async function getConfig(userId?: string): Promise<Config> {
  return normalizeConfig(await readJson<RawConfig>("config.json", DEFAULT_CONFIG, userId));
}

async function getConfigForUpdate(userId?: string): Promise<Config> {
  return normalizeConfig(await readJsonStrict<RawConfig>("config.json", DEFAULT_CONFIG, userId));
}

export async function setConfig(patch: Partial<Config>, userId?: string): Promise<Config> {
  const queueKey = userId ?? "";
  const previous = configUpdateQueues.get(queueKey) || Promise.resolve();
  const operation = previous.then(async () => {
    const next = normalizeConfig({ ...(await getConfigForUpdate(userId)), ...patch });
    await writeJson("config.json", next, userId);
    return next;
  });
  const tail = operation.then(() => undefined, () => undefined);
  configUpdateQueues.set(queueKey, tail);

  try {
    return await operation;
  } finally {
    if (configUpdateQueues.get(queueKey) === tail) configUpdateQueues.delete(queueKey);
  }
}

export async function getState(chatId: string, userId?: string): Promise<State> {
  return readJson<State>(`states/${chatId}.json`, { characterAppearance: {}, generated: {} }, userId);
}

async function getStateForUpdate(chatId: string, userId?: string): Promise<State> {
  const fallback: State = { characterAppearance: {}, generated: {} };
  const path = `states/${chatId}.json`;
  if (typeof spindle.userStorage.getJson === "function") {
    const value = await spindle.userStorage.getJson<State>(path, { fallback, userId });
    return { ...fallback, ...value };
  }
  if (!(await spindle.userStorage.exists(path, userId))) return fallback;
  return { ...fallback, ...JSON.parse(await spindle.userStorage.read(path, userId)) } as State;
}

function safePathPart(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "_");
}

function recordPath(chatId: string, key: string): string {
  return `records/${safePathPart(chatId)}/${safePathPart(key)}.json`;
}

function workflowPath(hash: string): string {
  return `workflows/${hash}.json`;
}

async function contentHash(value: string): Promise<string> {
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

const WORKFLOW_REFERENCE_KEY = "__inlayIllustratorWorkflowRef";
const storedWorkflowWrites = new Map<string, Promise<void>>();

async function ensureWorkflowStored(hash: string, workflow: object, userId?: string): Promise<void> {
  const cacheKey = JSON.stringify([userId ?? null, hash]);
  const existing = storedWorkflowWrites.get(cacheKey);
  if (existing) return existing;
  const operation = (async () => {
    const path = workflowPath(hash);
    if (!(await spindle.userStorage.exists(path, userId))) await writeJson(path, workflow, userId);
  })();
  if (storedWorkflowWrites.size >= 64) {
    const oldest = storedWorkflowWrites.keys().next().value;
    if (typeof oldest === "string") storedWorkflowWrites.delete(oldest);
  }
  storedWorkflowWrites.set(cacheKey, operation);
  try {
    await operation;
  } catch (error) {
    if (storedWorkflowWrites.get(cacheKey) === operation) storedWorkflowWrites.delete(cacheKey);
    throw error;
  }
}

async function compactParameters(parameters: Record<string, unknown>, userId?: string): Promise<Record<string, unknown>> {
  const workflow = parameters.workflow;
  if (!workflow || typeof workflow !== "object") return parameters;
  if (!Array.isArray(workflow) && typeof (workflow as Record<string, unknown>)[WORKFLOW_REFERENCE_KEY] === "string") {
    return parameters;
  }
  const serialized = JSON.stringify(workflow);
  const hash = await contentHash(serialized);
  await ensureWorkflowStored(hash, workflow, userId);
  const compact = { ...parameters };
  compact.workflow = { [WORKFLOW_REFERENCE_KEY]: hash };
  return compact;
}

async function hydrateParameters(parameters: Record<string, unknown>, userId?: string): Promise<Record<string, unknown>> {
  const workflow = parameters.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) return parameters;
  const hash = (workflow as Record<string, unknown>)[WORKFLOW_REFERENCE_KEY];
  if (typeof hash !== "string" || !hash) return parameters;
  const hydrated = await readJsonStrict<Record<string, unknown>>(workflowPath(hash), {}, userId);
  if (Object.keys(hydrated).length === 0) throw new Error(`Stored ComfyUI workflow ${hash} is unavailable.`);
  return { ...parameters, workflow: hydrated };
}

export function isGeneratedRecordReference(
  value: unknown
): value is LegacyGeneratedRecordReference | GeneratedRecordReferenceV3 {
  return toGeneratedRecordReferenceV3(value) !== null;
}

export function generatedRecordReference(record: GeneratedRecordV3, path: string): GeneratedRecordReferenceV3 {
  return {
    storageVersion: 3,
    recordPath: path,
    chatId: record.chatId,
    messageId: record.messageId,
    swipeId: record.swipeId,
    slots: record.slots.map((slot) => ({
      paragraph: slot.paragraph,
      imageId: slot.imageId,
      imageUrl: slot.imageUrl,
      status: slot.status
    })),
    createdAt: record.createdAt,
    operationId: record.operationId,
    generationStatus: record.generationStatus
  };
}

export async function storeGeneratedRecord(
  chatId: string,
  key: string,
  record: GeneratedRecordV3 | LegacyGeneratedRecord,
  userId?: string
): Promise<GeneratedRecordReferenceV3> {
  const canonical = toGeneratedRecordV3(record);
  if (!canonical) throw new Error("Cannot store an invalid or ragged generated record.");
  const path = recordPath(chatId, key);
  const slots = await Promise.all(canonical.slots.map(async (slot) => ({
    ...slot,
    ...(slot.imageParameters
      ? { imageParameters: await compactParameters(slot.imageParameters, userId) }
      : {})
  })));
  await writeJson(path, { ...canonical, slots }, userId);
  return generatedRecordReference(canonical, path);
}

export async function loadGeneratedRecord(
  value: unknown,
  userId?: string,
  hydrateWorkflows = true
): Promise<GeneratedRecordV3 | null> {
  let stored = value;
  if (isGeneratedRecordReference(value)) {
    stored = await readJson<unknown>(value.recordPath, null, userId);
  }
  const record = toGeneratedRecordV3(stored);
  if (!record) return null;
  if (!hydrateWorkflows) return record;
  return {
    ...record,
    slots: await Promise.all(record.slots.map(async (slot) => ({
      ...slot,
      ...(slot.imageParameters
        ? { imageParameters: await hydrateParameters(slot.imageParameters, userId) }
        : {})
    })))
  };
}

/** Move legacy inline records and compact V2 references to the V3 slot boundary. */
export async function migrateLegacyGeneratedRecords(chatId: string, state: State, userId?: string): Promise<void> {
  for (const [key, value] of Object.entries(state.generated)) {
    if (isGeneratedRecordReferenceV3(value)) continue;
    const reference = toGeneratedRecordReferenceV3(value);
    if (reference) {
      state.generated[key] = reference;
      continue;
    }
    const record = toGeneratedRecordV3(value);
    if (record) state.generated[key] = await storeGeneratedRecord(chatId, key, record, userId);
  }
}

export function rebuildGeneratedImageIndex(state: State): void {
  const index: NonNullable<State["generatedImageIndex"]> = {};
  for (const [key, value] of Object.entries(state.generated)) {
    const adapted = adaptGeneratedRecord(value);
    if (!adapted) continue;
    adapted.slots.forEach((slot, imageIndex) => {
      if (slot.imageId) index[`id:${slot.imageId}`] = { key, index: imageIndex };
      if (slot.imageUrl) index[`url:${slot.imageUrl}`] = { key, index: imageIndex };
    });
  }
  state.generatedImageIndex = index;
}

/** Serializes read-modify-write state changes for one user's chat. */
export async function updateState(chatId: string, userId: string | undefined, mutator: StateMutator): Promise<State> {
  const queueKey = JSON.stringify([userId ?? null, chatId]);
  const previous = stateUpdateQueues.get(queueKey) || Promise.resolve();
  const operation = previous.then(async () => {
    const state = await getStateForUpdate(chatId, userId);
    await mutator(state);
    await writeJson(`states/${chatId}.json`, state, userId);
    return state;
  });
  const tail = operation.then(() => undefined, () => undefined);
  stateUpdateQueues.set(queueKey, tail);

  try {
    return await operation;
  } finally {
    if (stateUpdateQueues.get(queueKey) === tail) stateUpdateQueues.delete(queueKey);
  }
}

async function getParserConnections(userId?: string): Promise<ParserConnection[]> {
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

export async function getImageConnections(userId?: string): Promise<ImageConnection[]> {
  try {
    if (!spindle || !spindle.imageGen || typeof spindle.imageGen.listConnections !== "function") {
      return [];
    }
    return (await spindle.imageGen.listConnections(userId)) as ImageConnection[];
  } catch (error) {
    spindle.log.warn(`Image connection list unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export async function sendState(userId?: string, chatId?: string, preparedConfig?: Config): Promise<void> {
  const [state, config, parserConnections, imageConnections] = await Promise.all([
    chatId ? getState(chatId, userId) : Promise.resolve(null),
    preparedConfig ? Promise.resolve(preparedConfig) : getConfig(userId),
    getParserConnections(userId),
    getImageConnections(userId)
  ]);
  spindle.sendToFrontend({
    type: "state",
    config,
    parserConnections,
    imageConnections,
    chatId: chatId || "",
    characterAppearance: state?.characterAppearance || {},
    avatarVisualSupplements: state?.avatarVisualSupplements || {},
    avatarVisionAttempts: state?.avatarVisionAttempts || {}
  }, userId);
}

export async function findLatestGeneratedTurn(
  chatId: string,
  userId?: string
): Promise<{ messageId: string; swipeId: number } | null> {
  const state = await getState(chatId, userId);
  let latest: { messageId: string; swipeId: number; createdAt: number } | null = null;
  for (const [key, value] of Object.entries(state.generated)) {
    if (!value || typeof value !== "object") continue;
    let messageId = "";
    let swipeId = 0;
    let createdAt = 0;
    if (isGeneratedRecordReference(value)) {
      messageId = (value as { messageId?: string }).messageId || "";
      swipeId = Number((value as { swipeId?: number }).swipeId || 0);
    } else {
      const rec = value as Partial<GeneratedRecordV3>;
      messageId = rec.messageId || "";
      swipeId = Number(rec.swipeId || 0);
      const parsedTs = Date.parse(rec.createdAt || "");
      createdAt = Number.isFinite(parsedTs) ? parsedTs : 0;
    }
    if (!messageId) {
      const parts = key.split(":");
      if (parts.length >= 3) {
        messageId = parts[1];
        swipeId = Number(parts[2]) || 0;
      }
    }
    if (!messageId) continue;
    if (!latest || createdAt > latest.createdAt) {
      latest = { messageId, swipeId, createdAt };
    }
  }
  return latest ? { messageId: latest.messageId, swipeId: latest.swipeId } : null;
}

export type InlayGalleryImage = {
  chatId: string;
  messageId: string;
  swipeId: number;
  imageId: string;
  imageUrl: string;
  imageIndex: number;
  paragraph: number;
  prompt: string;
  negativePrompt: string;
  quote: string;
};

export type InlayGalleryChat = {
  chatId: string;
  name?: string;
  cardName?: string;
  messageCount: number;
  branchCount: number;
  quoteStyle?: string;
  images: InlayGalleryImage[];
};

export type InlayGalleryResult = {
  page: number;
  totalChats: number;
  totalPages: number;
  chatIds: string[];
  chats: InlayGalleryChat[];
  records?: InlayGalleryChat[];
};

const GALLERY_CHATS_PER_PAGE = 5;

function chatIdFromStatePath(path: string): string | null {
  if (!path.startsWith("states/") || !path.endsWith(".json")) return null;
  return path.slice(7, -5);
}

function compareChatIds(a: string, b: string): number {
  const aNum = /^-?\d+$/.test(a);
  const bNum = /^-?\d+$/.test(b);
  if (aNum && bNum) {
    const diff = Number(a) - Number(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  }
  return a.localeCompare(b);
}

async function enrichChatInfo(
  chatId: string,
  images: InlayGalleryImage[],
  quoteStyle: string | undefined,
  userId?: string
): Promise<InlayGalleryChat> {
  let name: string | undefined;
  let cardName: string | undefined;
  try {
    const { chats, characters } = spindle as unknown as {
      chats?: { get?: (id: string, user?: string) => Promise<{ name?: string; character_id?: string } | null> };
      characters?: { get?: (id: string, user?: string) => Promise<{ name?: string } | null> };
    };
    if (chats && typeof chats.get === "function") {
      const meta = await chats.get(chatId, userId);
      if (meta) {
        if (typeof meta.name === "string" && meta.name) name = meta.name;
        const charId = meta.character_id;
        if (charId && characters && typeof characters.get === "function") {
          const char = await characters.get(charId, userId);
          if (char && typeof char.name === "string" && char.name) cardName = char.name;
        }
      }
    }
  } catch {
    // metadata is optional
  }
  const messageIds = new Set<string>();
  const branchIds = new Set<string>();
  for (const img of images) {
    if (img.messageId) messageIds.add(img.messageId);
    const swipe = typeof img.swipeId === "number" ? img.swipeId : 0;
    if (swipe > 0) branchIds.add(`${img.messageId}:${swipe}`);
  }
  return {
    chatId,
    name,
    cardName,
    messageCount: messageIds.size,
    branchCount: branchIds.size,
    quoteStyle,
    images
  };
}

export async function listInlayGallery(
  userId: string | undefined,
  page: number,
  selectedChatId?: string
): Promise<InlayGalleryResult> {
  const sanitizedSelectedChatId = typeof selectedChatId === "string" && /^[a-zA-Z0-9_-]+$/.test(selectedChatId.trim())
    ? selectedChatId.trim()
    : undefined;

  let statePaths: string[] = [];
  try {
    if (typeof (spindle.userStorage as unknown as { list?: unknown }).list === "function") {
      statePaths = await (spindle.userStorage as unknown as { list: (prefix?: string, userId?: string) => Promise<string[]> }).list("states/", userId);
    }
  } catch {
    statePaths = [];
  }

  const allChatIdsSet = new Set<string>();
  const seenPaths = new Set<string>();
  for (const raw of statePaths) {
    if (typeof raw !== "string" || !raw) continue;
    const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    const path = normalized.startsWith("states/") ? normalized : `states/${normalized}`;
    if (!path.endsWith(".json")) continue;
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    const cid = chatIdFromStatePath(path);
    if (cid) allChatIdsSet.add(cid);
  }

  if (sanitizedSelectedChatId) {
    allChatIdsSet.add(sanitizedSelectedChatId);
  }

  const sortedChatIds = [...allChatIdsSet].sort(compareChatIds);
  const totalChats = sortedChatIds.length;
  const totalPages = Math.max(1, Math.ceil(totalChats / GALLERY_CHATS_PER_PAGE));

  let requestedPage = Math.floor(Number(page));
  if (!Number.isFinite(requestedPage) || requestedPage < 1) requestedPage = 1;
  if (requestedPage > totalPages) requestedPage = totalPages;

  const targetChatIds = sanitizedSelectedChatId
    ? [sanitizedSelectedChatId]
    : sortedChatIds.slice((requestedPage - 1) * GALLERY_CHATS_PER_PAGE, requestedPage * GALLERY_CHATS_PER_PAGE);

  const grouped = new Map<string, InlayGalleryImage[]>();
  const seen = new Set<string>();

  for (const cid of targetChatIds) {
    const path = `states/${cid}.json`;
    let state: State | null = null;
    try {
      state = await readJson<State>(path, { characterAppearance: {}, generated: {} } as State, userId);
    } catch {
      continue;
    }
    if (!state || typeof state.generated !== "object" || state.generated === null) continue;

    for (const [key, value] of Object.entries(state.generated)) {
      if (!value || typeof value !== "object") continue;

      const isRef = isGeneratedRecordReference(value);
      const dedupKey = isRef
        ? `ref:${(value as GeneratedRecordReferenceV3).recordPath}`
        : `key:${cid}:${key}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      let record: GeneratedRecordV3 | null = null;
      try {
        record = await loadGeneratedRecord(value, userId, false);
      } catch {
        continue;
      }
      if (!record) continue;
      if (!Array.isArray(record.slots)) continue;
      if (typeof record.messageId !== "string" || !record.messageId) continue;

      const chatKey = typeof record.chatId === "string" && record.chatId ? record.chatId : cid;
      const messageId = record.messageId;
      const swipeId = typeof record.swipeId === "number" && Number.isInteger(record.swipeId) ? record.swipeId : 0;

      for (let idx = 0; idx < record.slots.length; idx++) {
        const slot = record.slots[idx];
        if (!slot || !slot.imageUrl) continue;
        const galleryImg: InlayGalleryImage = {
          chatId: chatKey,
          messageId,
          swipeId,
          imageId: slot.imageId || "",
          imageUrl: slot.imageUrl,
          imageIndex: idx,
          paragraph: slot.paragraph || idx + 1,
          prompt: slot.prompt || "",
          negativePrompt: slot.negativePrompt || "",
          quote: ""
        };
        const list = grouped.get(chatKey) || [];
        list.push(galleryImg);
        grouped.set(chatKey, list);
      }
    }
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => {
      const msgDiff = compareChatIds(a.messageId, b.messageId);
      if (msgDiff !== 0) return msgDiff;
      if (a.swipeId !== b.swipeId) return a.swipeId - b.swipeId;
      if (a.paragraph !== b.paragraph) return a.paragraph - b.paragraph;
      if (a.imageIndex !== b.imageIndex) return a.imageIndex - b.imageIndex;
      return a.imageUrl.localeCompare(b.imageUrl);
    });
  }

  let chats: InlayGalleryChat[] = [];
  if (sanitizedSelectedChatId) {
    const images = grouped.get(sanitizedSelectedChatId) || [];
    chats = [await enrichChatInfo(sanitizedSelectedChatId, images, undefined, userId)];
  } else {
    chats = await Promise.all(
      targetChatIds.map((cid) => enrichChatInfo(cid, grouped.get(cid) || [], undefined, userId))
    );
  }

  return {
    page: requestedPage,
    totalChats,
    totalPages,
    chatIds: sortedChatIds,
    chats,
    records: chats
  };
}
