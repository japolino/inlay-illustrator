/**
 * userStorage helpers: strict/lenient JSON reads, JSON writes with
 * getJson/setJson feature detection, per-path serialized read-modify-write,
 * serialized config updates and content-hash ComfyUI workflow dedupe.
 *
 * LEGACY (0.9.x): still used by src/backend.ts until it is rewired to src/backend/services (createServices).
 * The storage layout of the Asset Maid port (characters/<id>/asset-maid.json,
 * chats/<chatId>/chat-data.json, config/*.json) is defined in
 * `src/shared/contract/**`; this module only provides the primitives.
 */
import { DEFAULT_CONFIG, normalizeConfig, type Config, type RawConfig } from "../shared/config.js";
import type { ImageConnection } from "./types.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

export const CONFIG_PATH = "config.json";

const jsonUpdateQueues = new Map<string, Promise<void>>();

function mergeFallback<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object" && !Array.isArray(value) && fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
    return { ...fallback, ...(value as object) } as T;
  }
  return (value ?? fallback) as T;
}

/** Reads JSON; throws on storage or parse errors. Missing files yield `fallback`. */
export async function readJsonStrict<T>(path: string, fallback: T, userId?: string): Promise<T> {
  if (typeof spindle.userStorage.getJson === "function") {
    const value = await spindle.userStorage.getJson<T>(path, { fallback, userId });
    return mergeFallback(value, fallback);
  }
  if (!(await spindle.userStorage.exists(path, userId))) return fallback;
  const text = await spindle.userStorage.read(path, userId);
  return mergeFallback(JSON.parse(text), fallback);
}

/** Lenient read for display paths: any failure yields `fallback`. */
export async function readJson<T>(path: string, fallback: T, userId?: string): Promise<T> {
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

/** Lists stored paths under a prefix, or [] when the host has no `list`. */
export async function listPaths(prefix: string, userId?: string): Promise<string[]> {
  try {
    if (typeof spindle.userStorage.list !== "function") return [];
    const paths = await spindle.userStorage.list(prefix, userId);
    return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === "string" && path.length > 0) : [];
  } catch {
    return [];
  }
}

/**
 * Serialized read-modify-write of one JSON file per user. The mutator gets a
 * fresh strict read (a read failure rejects without writing). A throwing
 * mutator writes nothing; later queued updates still run.
 */
export async function updateJson<T>(
  path: string,
  fallback: () => T,
  mutator: (value: T) => T | void | Promise<T | void>,
  userId?: string
): Promise<T> {
  const queueKey = JSON.stringify([userId ?? null, path]);
  const previous = jsonUpdateQueues.get(queueKey) || Promise.resolve();
  const operation = previous.then(async () => {
    const current = await readJsonStrict<T>(path, fallback(), userId);
    const returned = await mutator(current);
    const next = (returned === undefined ? current : returned) as T;
    await writeJson(path, next, userId);
    return next;
  });
  const tail = operation.then(() => undefined, () => undefined);
  jsonUpdateQueues.set(queueKey, tail);
  try {
    return await operation;
  } finally {
    if (jsonUpdateQueues.get(queueKey) === tail) jsonUpdateQueues.delete(queueKey);
  }
}

export async function getConfig(userId?: string): Promise<Config> {
  return normalizeConfig(await readJson<RawConfig>(CONFIG_PATH, DEFAULT_CONFIG, userId));
}

/** Serialized config patch. Rejects (and writes nothing) when the stored config cannot be read. */
export async function setConfig(patch: Partial<Config>, userId?: string): Promise<Config> {
  return updateJson<Config>(
    CONFIG_PATH,
    () => ({ ...DEFAULT_CONFIG }),
    (current) => normalizeConfig({ ...normalizeConfig(current), ...patch }),
    userId
  );
}

// --- Content-hash dedupe of ComfyUI workflow graphs in stored parameters ---

const WORKFLOW_REFERENCE_KEY = "__inlayIllustratorWorkflowRef";
const storedWorkflowWrites = new Map<string, Promise<void>>();

function workflowPath(hash: string): string {
  return `workflows/${hash}.json`;
}

export async function contentHash(value: string): Promise<string> {
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

/** Replaces an inline `workflow` graph with a reference to a deduplicated stored copy. */
export async function compactWorkflowParameters(parameters: Record<string, unknown>, userId?: string): Promise<Record<string, unknown>> {
  const workflow = parameters.workflow;
  if (!workflow || typeof workflow !== "object") return parameters;
  if (!Array.isArray(workflow) && typeof (workflow as Record<string, unknown>)[WORKFLOW_REFERENCE_KEY] === "string") {
    return parameters;
  }
  const serialized = JSON.stringify(workflow);
  const hash = await contentHash(serialized);
  await ensureWorkflowStored(hash, workflow, userId);
  return { ...parameters, workflow: { [WORKFLOW_REFERENCE_KEY]: hash } };
}

/** Restores a workflow reference written by `compactWorkflowParameters`. */
export async function hydrateWorkflowParameters(parameters: Record<string, unknown>, userId?: string): Promise<Record<string, unknown>> {
  const workflow = parameters.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) return parameters;
  const hash = (workflow as Record<string, unknown>)[WORKFLOW_REFERENCE_KEY];
  if (typeof hash !== "string" || !hash) return parameters;
  const hydrated = await readJsonStrict<Record<string, unknown>>(workflowPath(hash), {}, userId);
  if (Object.keys(hydrated).length === 0) throw new Error(`Stored ComfyUI workflow ${hash} is unavailable.`);
  return { ...parameters, workflow: hydrated };
}

// --- Connection lists and the frontend state snapshot ---

async function listLlmConnections(userId?: string): Promise<Array<{ id: string; name: string; provider: string; model: string }>> {
  try {
    return (await spindle.connections.list(userId)).map((c) => ({ id: c.id, name: c.name, provider: c.provider, model: c.model }));
  } catch {
    return [];
  }
}

export async function getImageConnections(userId?: string): Promise<ImageConnection[]> {
  try {
    if (!spindle?.imageGen || typeof spindle.imageGen.listConnections !== "function") return [];
    return (await spindle.imageGen.listConnections(userId)) as ImageConnection[];
  } catch (error) {
    spindle.log.warn(`Image connection list unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/** Sends `{type:"state"}` with the config and connection lists to the frontend. */
export async function sendState(userId?: string, chatId?: string, preparedConfig?: Config): Promise<void> {
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
