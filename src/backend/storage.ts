import { DEFAULT_CONFIG, normalizeConfig, type Config, type RawConfig } from "../shared/config.js";
import type { GeneratedRecord, GeneratedRecordReference, ParserConnection, State } from "./types.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

type StateMutator = (state: State) => void | Promise<void>;

const stateUpdateQueues = new Map<string, Promise<void>>();
const configUpdateQueues = new Map<string, Promise<void>>();

async function readJson<T>(path: string, fallback: T, userId?: string): Promise<T> {
  try {
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

export async function setConfig(patch: Partial<Config>, userId?: string): Promise<Config> {
  const queueKey = userId ?? "";
  const previous = configUpdateQueues.get(queueKey) || Promise.resolve();
  const operation = previous.then(async () => {
    const next = normalizeConfig({ ...(await getConfig(userId)), ...patch });
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
  const hydrated = await readJson<Record<string, unknown>>(workflowPath(hash), {}, userId);
  if (Object.keys(hydrated).length === 0) throw new Error(`Stored ComfyUI workflow ${hash} is unavailable.`);
  return { ...parameters, workflow: hydrated };
}

export function isGeneratedRecordReference(value: unknown): value is GeneratedRecordReference {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<GeneratedRecordReference>;
  return record.storageVersion === 2 && typeof record.recordPath === "string" && typeof record.messageId === "string";
}

export function generatedRecordReference(record: GeneratedRecord, path: string): GeneratedRecordReference {
  return {
    storageVersion: 2,
    recordPath: path,
    chatId: record.chatId,
    messageId: record.messageId,
    swipeId: record.swipeId,
    paragraphs: record.paragraphs,
    imageIds: record.imageIds,
    imageUrls: record.imageUrls,
    createdAt: record.createdAt
  };
}

export async function storeGeneratedRecord(
  chatId: string,
  key: string,
  record: GeneratedRecord,
  userId?: string
): Promise<GeneratedRecordReference> {
  const path = recordPath(chatId, key);
  const imageParameters = record.imageParameters
    ? await Promise.all(record.imageParameters.map((parameters) => compactParameters(parameters, userId)))
    : undefined;
  await writeJson(path, { ...record, imageParameters }, userId);
  return generatedRecordReference(record, path);
}

export async function loadGeneratedRecord(
  value: unknown,
  userId?: string,
  hydrateWorkflows = true
): Promise<GeneratedRecord | null> {
  let record = value;
  if (isGeneratedRecordReference(value)) {
    record = await readJson<GeneratedRecord | null>(value.recordPath, null, userId);
  }
  if (!record || typeof record !== "object") return null;
  const candidate = record as GeneratedRecord;
  if (!Array.isArray(candidate.prompts) || !Array.isArray(candidate.paragraphs)
    || !Array.isArray(candidate.imageUrls) || typeof candidate.messageId !== "string") return null;
  if (hydrateWorkflows && candidate.imageParameters) {
    candidate.imageParameters = await Promise.all(candidate.imageParameters.map((parameters) => hydrateParameters(parameters, userId)));
  }
  return candidate;
}

export async function migrateLegacyGeneratedRecords(chatId: string, state: State, userId?: string): Promise<void> {
  for (const [key, value] of Object.entries(state.generated)) {
    if (isGeneratedRecordReference(value) || !value || typeof value !== "object") continue;
    const candidate = value as Partial<GeneratedRecord>;
    if (typeof candidate.messageId !== "string" || !Array.isArray(candidate.prompts)
      || !Array.isArray(candidate.paragraphs) || !Array.isArray(candidate.imageUrls)) continue;
    state.generated[key] = await storeGeneratedRecord(chatId, key, candidate as GeneratedRecord, userId);
  }
}

export function rebuildGeneratedImageIndex(state: State): void {
  const index: NonNullable<State["generatedImageIndex"]> = {};
  for (const [key, value] of Object.entries(state.generated)) {
    if (!value || typeof value !== "object") continue;
    const record = value as Partial<GeneratedRecordReference & GeneratedRecord>;
    const ids = Array.isArray(record.imageIds) ? record.imageIds : [];
    const urls = Array.isArray(record.imageUrls) ? record.imageUrls : [];
    ids.forEach((id, imageIndex) => { if (id) index[`id:${id}`] = { key, index: imageIndex }; });
    urls.forEach((url, imageIndex) => { if (url) index[`url:${url}`] = { key, index: imageIndex }; });
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

export async function sendState(userId?: string, chatId?: string, preparedConfig?: Config): Promise<void> {
  const state = chatId ? await getState(chatId, userId) : null;
  spindle.sendToFrontend({
    type: "state",
    config: preparedConfig || await getConfig(userId),
    parserConnections: await getParserConnections(userId),
    chatId: chatId || "",
    characterAppearance: state?.characterAppearance || {},
    quoteStyle: state?.quoteStyle ?? "",
    quoteExample: state?.quoteExample ?? ""
  }, userId);
}

export const GALLERY_CHATS_PER_PAGE = 5;

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

function isNumericChatId(value: string): boolean {
  return /^-?\d+$/.test(value);
}

function compareChatIds(left: string, right: string): number {
  const leftNumeric = isNumericChatId(left);
  const rightNumeric = isNumericChatId(right);
  if (leftNumeric && rightNumeric) {
    const diff = Number(left) - Number(right);
    if (diff !== 0) return diff;
    return left.localeCompare(right);
  }
  return left.localeCompare(right);
}

function chatIdFromStatePath(path: string): string | null {
  if (!path.startsWith("states/") || !path.endsWith(".json")) return null;
  return path.slice("states/".length, -".json".length);
}


/**
 * Newest generated turn in a chat: the stored record with the greatest
 * createdAt. Used by the floating action button's "from this turn" actions
 * when no specific message is targeted.
 */
export async function findLatestGeneratedTurn(
  chatId: string,
  userId?: string
): Promise<{ messageId: string; swipeId: number } | null> {
  const state = await getState(chatId, userId);
  let best: { messageId: string; swipeId: number; createdAt: number } | null = null;
  for (const [key, value] of Object.entries(state.generated)) {
    const reference = isGeneratedRecordReference(value) ? value : null;
    const inline = !reference && value && typeof value === "object" ? value as Partial<GeneratedRecord> : null;
    const messageId = reference?.messageId ?? (inline?.messageId as string | undefined) ?? "";
    const swipeId = Number(reference?.swipeId ?? inline?.swipeId ?? 0);
    const createdAtRaw = reference?.createdAt ?? (inline?.createdAt as string | undefined) ?? "";
    const createdAt = Date.parse(createdAtRaw);
    if (!messageId) continue;
    // Prefer the newest record; stable tie-break on the state key so repeated
    // calls return the same turn even when timestamps collide.
    const candidate = { messageId, swipeId, createdAt: Number.isFinite(createdAt) ? createdAt : 0 };
    if (!best || candidate.createdAt > best.createdAt
      || (candidate.createdAt === best.createdAt && key > `${chatId}:${best.messageId}:${best.swipeId}`)) {
      best = candidate;
    }
  }
  return best ? { messageId: best.messageId, swipeId: best.swipeId } : null;
}

export async function listInlayGallery(
  userId: string | undefined,
  page: number,
  selectedChatId?: string
): Promise<InlayGalleryResult> {
  let statePaths: string[] = [];
  try {
    if (typeof (spindle.userStorage as unknown as { list?: unknown }).list === "function") {
      statePaths = await (spindle.userStorage as unknown as { list: (prefix?: string, userId?: string) => Promise<string[]> }).list("states/", userId);
    }
  } catch {
    statePaths = [];
  }

  // Host `userStorage.list("states/")` returns paths relative to the prefix
  // directory (e.g. "<chatId>.json"); other list implementations may return the
  // full prefixed path. Normalize both shapes so the gallery finds state files
  // regardless of which surface runs underneath.
  const filtered: string[] = [];
  const seenPaths = new Set<string>();
  for (const raw of statePaths) {
    if (typeof raw !== "string" || !raw) continue;
    const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    let path = normalized;
    if (path.startsWith("states/")) {
      // already full
    } else {
      // prefix-relative listing or nested artifact: treat as relative to states/
      path = `states/${path}`;
    }
    if (!path.endsWith(".json")) continue;
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    filtered.push(path);
  }

  const grouped = new Map<string, InlayGalleryImage[]>();
  const quoteStyles = new Map<string, string>();
  const seen = new Set<string>();

  for (const path of filtered) {
    const pathChatId = chatIdFromStatePath(path);
    if (!pathChatId) continue;

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
        ? `ref:${(value as GeneratedRecordReference).recordPath}`
        : `key:${pathChatId}:${key}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      let record: GeneratedRecord | null = null;
      try {
        record = await loadGeneratedRecord(value, userId, false);
      } catch {
        continue;
      }
      if (!record) continue;
      if (!Array.isArray(record.imageUrls) || !Array.isArray(record.paragraphs) || !Array.isArray(record.prompts)) continue;
      if (typeof record.messageId !== "string" || !record.messageId) continue;

      const chatId = typeof record.chatId === "string" && record.chatId ? record.chatId : pathChatId;
      if (!quoteStyles.has(chatId)) quoteStyles.set(chatId, typeof state.quoteStyle === "string" ? state.quoteStyle : "");
      const messageId = record.messageId;
      const swipeId = typeof record.swipeId === "number" && Number.isInteger(record.swipeId) ? record.swipeId : 0;
      const imageIds = Array.isArray(record.imageIds) ? record.imageIds : [];
      const imageUrls = record.imageUrls;
      const prompts = Array.isArray(record.prompts) ? record.prompts : [];
      const negativePrompts = Array.isArray(record.negativePrompts) ? record.negativePrompts : [];
      const quotes = Array.isArray(record.quotes) ? record.quotes : [];
      const paragraphs = Array.isArray(record.paragraphs) ? record.paragraphs : [];

      for (let i = 0; i < imageUrls.length; i += 1) {
        const rawUrl = imageUrls[i];
        if (typeof rawUrl !== "string" || !rawUrl) continue;
        const imageId = typeof imageIds[i] === "string" ? String(imageIds[i]) : "";
        const paragraphRaw = paragraphs[i];
        const paragraph = Number.isInteger(Number(paragraphRaw)) && Number(paragraphRaw) >= 1 ? Number(paragraphRaw) : i + 1;
        const prompt = typeof prompts[i] === "string" ? String(prompts[i]) : "";
        const negativePrompt = typeof negativePrompts[i] === "string" ? String(negativePrompts[i]) : "";
        const quote = typeof quotes[i] === "string" ? String(quotes[i]) : "";

        const image: InlayGalleryImage = {
          chatId,
          messageId,
          swipeId,
          imageId,
          imageUrl: rawUrl,
          imageIndex: i,
          paragraph,
          prompt,
          negativePrompt,
          quote
        };

        const bucket = grouped.get(chatId) || [];
        bucket.push(image);
        grouped.set(chatId, bucket);
      }
    }
  }

  // Sort images within each chat by paragraph ascending, stable
  for (const images of grouped.values()) {
    images.sort((a, b) => {
      if (a.paragraph !== b.paragraph) return a.paragraph - b.paragraph;
      if (a.imageIndex !== b.imageIndex) return a.imageIndex - b.imageIndex;
      return a.imageUrl.localeCompare(b.imageUrl);
    });
  }

  const chatIds = [...grouped.keys()].sort(compareChatIds);
  const totalChats = chatIds.length;
  const totalPages = Math.max(1, Math.ceil(totalChats / GALLERY_CHATS_PER_PAGE));

  let clampedPage = Math.floor(Number(page));
  if (!Number.isFinite(clampedPage) || clampedPage < 1) clampedPage = 1;
  if (clampedPage > totalPages) clampedPage = totalPages;

  let chats: InlayGalleryChat[] = [];

  if (selectedChatId) {
    const selected = String(selectedChatId);
    const images = grouped.get(selected);
    if (images) chats = [{ chatId: selected, quoteStyle: quoteStyles.get(selected) || "", images }];
    else chats = [];
  } else {
    const start = (clampedPage - 1) * GALLERY_CHATS_PER_PAGE;
    const end = start + GALLERY_CHATS_PER_PAGE;
    const pageIds = chatIds.slice(start, end);
    chats = pageIds.map((cid) => ({ chatId: cid, quoteStyle: quoteStyles.get(cid) || "", images: grouped.get(cid) || [] }));
  }

  return {
    page: clampedPage,
    totalChats,
    totalPages,
    chatIds,
    chats,
    records: chats
  };
}
