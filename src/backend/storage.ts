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
    createdAt: record.createdAt,
    operationId: record.operationId,
    generationStatus: record.generationStatus
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
