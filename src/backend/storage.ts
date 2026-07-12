import { DEFAULT_CONFIG, normalizeConfig, type Config, type RawConfig } from "../shared/config.js";
import type { ParserConnection, State } from "./types.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

async function readJson<T>(path: string, fallback: T, userId?: string): Promise<T> {
  try {
    if (!(await spindle.userStorage.exists(path, userId))) return fallback;
    const text = await spindle.userStorage.read(path, userId);
    return { ...fallback, ...JSON.parse(text) };
  } catch {
    return fallback;
  }
}

export async function writeJson(path: string, value: unknown, userId?: string): Promise<void> {
  const slash = path.lastIndexOf("/");
  if (slash > 0) await spindle.userStorage.mkdir(path.slice(0, slash), userId).catch(() => undefined);
  await spindle.userStorage.write(path, JSON.stringify(value, null, 2), userId);
}

export async function getConfig(userId?: string): Promise<Config> {
  return normalizeConfig(await readJson<RawConfig>("config.json", DEFAULT_CONFIG, userId));
}

export async function setConfig(patch: Partial<Config>, userId?: string): Promise<Config> {
  const next = normalizeConfig({ ...(await getConfig(userId)), ...patch });
  await writeJson("config.json", next, userId);
  return next;
}

export async function getState(chatId: string, userId?: string): Promise<State> {
  return readJson<State>(`states/${chatId}.json`, { characterAppearance: {}, generated: {} }, userId);
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

export async function sendState(userId?: string, chatId?: string): Promise<void> {
  const state = chatId ? await getState(chatId, userId) : null;
  spindle.sendToFrontend({
    type: "state",
    config: await getConfig(userId),
    parserConnections: await getParserConnections(userId),
    chatId: chatId || "",
    characterAppearance: state?.characterAppearance || {}
  }, userId);
}
