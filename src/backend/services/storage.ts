/**
 * StorageService over Spindle `userStorage` with the contract layout (src/shared/contract/storage.ts, docs/CONTRACT.md §5).
 *
 * - JSON reads: missing file -> fallback, corrupt JSON -> RpcFailure `storage-error`.
 * - Writes are serialized per path (FIFO). Config, character documents and chat data are read-modify-write inside that queue.
 * - Versions: every stored file goes through `migrateStoredFile`; files from a newer build (`tooNew`) are read best effort and
 *   never overwritten (RpcFailure `storage-error`, detailCode STORAGE_FILE_TOO_NEW).
 * - The marker `storage-schema.json` is written before the first write (AM `asset_maid:v1:schema`).
 * - Events: `config.changed` (updateConfig / factoryReset), `chatImageGeneration.changed`, `document.changed`
 *   (updateCharacterDocument / resetCharacter). RPC handlers do not emit these again.
 * - The character document revision guard mirrors AM `AssetMaidCharxExternalChangeError` (`Nv`, code
 *   `ASSET_MAID_CHARX_EXTERNAL_CHANGE`, AssetMaid.pretty.js 36811-36823): `expectedUpdatedAt` mismatch -> `conflict`.
 */
import {
  characterResetPaths,
  createEmptyCharacterDocument,
  LEGACY_BUILTIN_ARTIST_PRESETS,
  migrateLegacyBuiltinArtists,
  loadChatImageGenerationSettings,
  mergeStoredConfig,
  migrateStoredFile,
  normalizeCharacterDocument,
  normalizeChatData,
  normalizeConfig,
  normalizeUiState,
  splitConfigForStorage,
  STORAGE_FILE_VERSIONS,
  STORAGE_LAYOUT_VERSION,
  STORAGE_PATHS,
  STORAGE_RESET_PREFIXES,
  STORAGE_SCHEMA,
  storedVersion,
  type CharacterDocument,
  type ChatDataDocument,
  type ChatImageGenerationSettings,
  type InlayConfig,
  type StorageFileKind,
  type StoredGlobalConfig,
  type UiState,
} from "../../shared/contract/index.js";
import { fail, RpcFailure } from "../rpc/errors.js";
import type { EventBus, RunLog, SpindleHost, StorageService } from "./types.js";
import { asRecord, errorMessage, jsonClone, KeyedQueue } from "./util.js";

export interface StorageServiceOptions {
  events?: EventBus;
  log?: RunLog;
  now?: () => Date;
}

/** Extra members of the concrete storage service (beyond the shared interface). */
export interface StorageServiceImpl extends StorageService {
  /** Drop the in-memory config cache (tests / external edits). */
  invalidateCache(): void;
}

const CONFIG_PARTS: ReadonlyArray<{ part: keyof StoredGlobalConfig; kind: StorageFileKind; path: string }> = [
  { part: "model", kind: "config-model", path: STORAGE_PATHS.configModel },
  { part: "settings", kind: "config-settings", path: STORAGE_PATHS.configSettings },
  { part: "artistsGlobal", kind: "artists-global", path: STORAGE_PATHS.artistsGlobal },
  { part: "animaArtists", kind: "anima-artists", path: STORAGE_PATHS.animaArtists },
];
const CONFIG_QUEUE_KEY = "\u0000config";

function storageFailure(message: string, error?: unknown, detailCode?: string): RpcFailure {
  return new RpcFailure(
    { code: "storage-error", message, retryable: true, ...(detailCode ? { detailCode } : {}), ...(error !== undefined ? { details: { cause: errorMessage(error) } } : {}) },
    { cause: error },
  );
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function createStorageService(host: SpindleHost, userId: string | undefined, options: StorageServiceOptions = {}): StorageServiceImpl {
  const us = host.userStorage;
  const queue = new KeyedQueue();
  const now = options.now ?? (() => new Date());
  let schemaChecked: Promise<void> | null = null;
  let configCache: { config: InlayConfig; stored: Partial<Record<keyof StoredGlobalConfig, string>>; tooNew: Set<string> } | null = null;
  /** Bumped on every cache write or reset, so a read that started before a config write never caches its older result. */
  let configGeneration = 0;
  const setConfigCache = (state: typeof configCache) => {
    configCache = state;
    configGeneration += 1;
  };

  const log = (level: "info" | "warn" | "error", message: string, details?: unknown) => options.log?.append(level, "storage", message, details);

  /** Raw read: undefined when missing; throws storage-error on I/O failure or corrupt JSON. */
  async function readRaw(path: string): Promise<unknown> {
    let text: string;
    try {
      text = await us.read(path, userId);
    } catch (error) {
      let exists = true;
      try {
        exists = await us.exists(path, userId);
      } catch {
        /* keep exists = true -> report the read failure */
      }
      if (!exists) return undefined;
      throw storageFailure(`Could not read ${path}.`, error);
    }
    if (!text.trim()) return undefined;
    try {
      return JSON.parse(text);
    } catch (error) {
      throw storageFailure(`Stored file ${path} is not valid JSON.`, error, "STORAGE_CORRUPT_JSON");
    }
  }

  async function ensureSchemaMarker(): Promise<void> {
    if (!schemaChecked) {
      schemaChecked = (async () => {
        const marker = asRecord(await readRaw(STORAGE_PATHS.schema).catch(() => ({ unreadable: true })));
        if (marker.unreadable) return;
        if (marker.schema === STORAGE_SCHEMA) {
          if (Number(marker.version) > STORAGE_LAYOUT_VERSION) log("warn", `Storage layout v${marker.version} is newer than this build (v${STORAGE_LAYOUT_VERSION}).`);
          return;
        }
        await us.write(STORAGE_PATHS.schema, JSON.stringify({ schema: STORAGE_SCHEMA, version: STORAGE_LAYOUT_VERSION, createdAt: now().toISOString() }), userId);
      })().catch((error) => {
        schemaChecked = null;
        log("warn", "Could not write the storage schema marker.", errorMessage(error));
      });
    }
    await schemaChecked;
  }

  async function writeRaw(path: string, value: unknown): Promise<void> {
    await ensureSchemaMarker();
    try {
      await us.write(path, JSON.stringify(value), userId);
    } catch (error) {
      throw storageFailure(`Could not write ${path}.`, error);
    }
  }

  /** Read + migrate one versioned file. */
  async function readVersioned(kind: StorageFileKind, path: string): Promise<{ raw: unknown; value: Record<string, unknown> | undefined; tooNew: boolean; migrated: boolean }> {
    const raw = await readRaw(path);
    if (raw === undefined) return { raw, value: undefined, tooNew: false, migrated: false };
    const result = migrateStoredFile(kind, raw);
    if (result.tooNew) log("warn", `${path} was written by a newer build (v${result.fromVersion}); it is read best effort and will not be overwritten.`);
    else if (result.applied.length) log("info", `Migrated ${path}: ${result.applied.join(", ")}`);
    return { raw, value: result.value, tooNew: result.tooNew, migrated: result.applied.length > 0 };
  }

  function assertWritable(tooNew: boolean, path: string): void {
    if (tooNew) throw storageFailure(`${path} was written by a newer version of Inlay Illustrator and cannot be changed by this version.`, undefined, "STORAGE_FILE_TOO_NEW");
  }

  /**
   * AM 0.9.90 removed the 2 built-in art styles. Before the generic migration of `config/artists-global.json` runs, the
   * stored and referenced built-ins become user styles (`migrateLegacyBuiltinArtists`, port deviation in PORT-MAP.md):
   * the referenced ids include every character's own `selectedArtistId`, so the file is migrated here once and
   * written back right away. A missing file of an existing install (other config files present) still had the old
   * default, so it is migrated from `{}`.
   */
  async function migrateLegacyArtists(): Promise<void> {
    const path = STORAGE_PATHS.artistsGlobal;
    const raw = await readRaw(path);
    if (raw !== undefined && storedVersion(raw) >= STORAGE_FILE_VERSIONS["artists-global"]) return;
    if (raw === undefined) {
      const existing = await Promise.all([STORAGE_PATHS.configSettings, STORAGE_PATHS.configModel].map((p) => us.exists(p, userId).catch(() => false)));
      if (!existing.some(Boolean)) return;
    }
    const legacyIds = new Set(LEGACY_BUILTIN_ARTIST_PRESETS.map((p) => p.id));
    const referenced = new Set<string>();
    let files: string[] = [];
    try {
      files = (await us.list("characters/", userId)).map((e) => `characters/${normalizePath(String(e))}`).filter((e) => e.endsWith("/asset-maid.json"));
    } catch {
      files = [];
    }
    for (const file of files) {
      const doc = asRecord(await readRaw(file).catch(() => undefined));
      const id = String(asRecord(doc.characterPrompt).selectedArtistId ?? "").trim();
      if (legacyIds.has(id)) referenced.add(id);
    }
    const migrated = migrateLegacyBuiltinArtists(raw ?? {}, referenced);
    await writeRaw(path, { ...asRecord(raw), ...migrated });
    const kept = migrated.characterPrompt.artistPrompts.filter((e) => legacyIds.has(String(e.id))).map((e) => e.id);
    log("info", `Migrated ${path}: the removed built-in art styles became user styles${kept.length ? ` (${kept.join(", ")})` : ""}.`);
  }

  /**
   * AM 0.9.90 no longer reads `presetCatalog.rawJson` (the custom V4.5 raw catalog; V4.5 analysis was merged into V5).
   * The port drops the field from the config (the next settings write removes it) after keeping a one-time copy in
   * `config/legacy/preset-raw-catalog.json` (spec atelier-data §4.4 step 1). It is not converted into an Atelier preset
   * (different format; AM does not either).
   */
  async function backupRawPresetCatalog(settingsRaw: unknown): Promise<void> {
    const rawJson = asRecord(asRecord(settingsRaw).presetCatalog).rawJson;
    if (typeof rawJson !== "string" || !rawJson.trim()) return;
    const path = STORAGE_PATHS.legacyRawCatalog;
    try {
      await queue.run(path, async () => {
        if (await us.exists(path, userId).catch(() => false)) return;
        await writeRaw(path, { movedAt: now().toISOString(), rawJson });
        log("info", `The custom V4.5 raw catalog (presetCatalog.rawJson, unused since Asset Maid 0.9.90) was backed up to ${path} and is dropped from the settings.`);
      });
    } catch (error) {
      log("warn", "Could not back up the custom V4.5 raw catalog.", errorMessage(error));
    }
  }

  async function loadConfigState() {
    if (configCache) return configCache;
    const generation = configGeneration;
    await queue.run(STORAGE_PATHS.artistsGlobal, () => migrateLegacyArtists()).catch((error) => log("warn", "Could not migrate the built-in art styles.", errorMessage(error)));
    const parts: Partial<StoredGlobalConfig> = {};
    const stored: Partial<Record<keyof StoredGlobalConfig, string>> = {};
    const tooNew = new Set<string>();
    for (const { part, kind, path } of CONFIG_PARTS) {
      const read = await readVersioned(kind, path);
      if (read.value === undefined) continue;
      if (part === "settings") await backupRawPresetCatalog(read.raw);
      (parts as Record<string, unknown>)[part] = read.value;
      stored[part] = JSON.stringify(read.raw);
      if (read.tooNew) tooNew.add(path);
    }
    const state = { config: mergeStoredConfig(parts), stored, tooNew };
    // loadConfig reads outside the config queue: a write (or reset) during this read wins over the older files read here.
    if (generation !== configGeneration) return configCache ?? state;
    configCache = state;
    return state;
  }

  function withVersion(kind: StorageFileKind, value: Record<string, unknown>): Record<string, unknown> {
    return { ...value, version: STORAGE_FILE_VERSIONS[kind] };
  }

  const service: StorageServiceImpl = {
    invalidateCache() {
      setConfigCache(null);
    },

    async readJson<T>(path: string, fallback: T): Promise<T> {
      const raw = await readRaw(normalizePath(path));
      return raw === undefined ? fallback : (raw as T);
    },
    async writeJson(path, value) {
      const p = normalizePath(path);
      await queue.run(p, () => writeRaw(p, value));
    },
    async updateJson<T>(path: string, fallback: T, mutate: (current: T) => T | Promise<T>): Promise<T> {
      const p = normalizePath(path);
      return queue.run(p, async () => {
        const raw = await readRaw(p);
        const current = raw === undefined ? jsonClone(fallback) : (raw as T);
        const next = await mutate(current);
        await writeRaw(p, next);
        return next;
      });
    },
    async readBinary(path) {
      const p = normalizePath(path);
      try {
        return await us.readBinary(p, userId);
      } catch (error) {
        let exists = true;
        try {
          exists = await us.exists(p, userId);
        } catch {
          /* report the read failure */
        }
        if (!exists) return null;
        throw storageFailure(`Could not read ${p}.`, error);
      }
    },
    async writeBinary(path, data) {
      const p = normalizePath(path);
      await queue.run(p, async () => {
        await ensureSchemaMarker();
        try {
          await us.writeBinary(p, data, userId);
        } catch (error) {
          throw storageFailure(`Could not write ${p}.`, error);
        }
      });
    },
    async delete(path) {
      const p = normalizePath(path);
      await queue.run(p, async () => {
        try {
          await us.delete(p, userId);
        } catch (error) {
          let exists = true;
          try {
            exists = await us.exists(p, userId);
          } catch {
            /* report */
          }
          if (exists) throw storageFailure(`Could not delete ${p}.`, error);
        }
      });
    },
    /** Paths under `prefix`, relative to the storage root, with `/` separators. */
    async list(prefix) {
      const p = normalizePath(prefix);
      let entries: string[];
      try {
        entries = await us.list(p, userId);
      } catch {
        return [];
      }
      const dir = p === "" || p.endsWith("/") ? p : `${p}/`;
      return (Array.isArray(entries) ? entries : []).filter((e): e is string => typeof e === "string" && e.length > 0).map((e) => `${dir}${normalizePath(e)}`);
    },

    async loadConfig() {
      return jsonClone((await loadConfigState()).config);
    },
    async updateConfig(mutate) {
      const config = await queue.run(CONFIG_QUEUE_KEY, async () => {
        const state = await loadConfigState();
        const next = normalizeConfig(await mutate(jsonClone(state.config)));
        const split = splitConfigForStorage(next);
        const stored = { ...state.stored };
        for (const { part, kind, path } of CONFIG_PARTS) {
          const value = withVersion(kind, asRecord(split[part]));
          const text = JSON.stringify(value);
          if (stored[part] === text) continue;
          assertWritable(state.tooNew.has(path), path);
          await writeRaw(path, value);
          stored[part] = text;
        }
        setConfigCache({ config: next, stored, tooNew: state.tooNew });
        return next;
      });
      options.events?.emit("config.changed", { config: jsonClone(config) });
      return jsonClone(config);
    },

    async loadChatImageGenerationSettings() {
      const stored = await readVersioned("chat-image-generation-settings", STORAGE_PATHS.chatImageGenerationSettings);
      const settingsRaw = stored.raw === undefined ? await readRaw(STORAGE_PATHS.configSettings).catch(() => undefined) : undefined;
      const loaded = loadChatImageGenerationSettings(stored.value, { legacySettings: settingsRaw });
      if (loaded.notice) log("info", loaded.notice);
      if (loaded.migrated && !stored.tooNew) {
        await queue.run(STORAGE_PATHS.chatImageGenerationSettings, () => writeRaw(STORAGE_PATHS.chatImageGenerationSettings, withVersion("chat-image-generation-settings", { ...loaded.settings }))).catch((error) => log("warn", "Could not save migrated chat image settings.", errorMessage(error)));
      }
      return loaded.settings;
    },
    async saveChatImageGenerationSettings(settings) {
      const loaded = loadChatImageGenerationSettings(settings ?? {});
      const result: { settings: ChatImageGenerationSettings; notice: string } = { settings: loaded.settings, notice: loaded.notice };
      await queue.run(STORAGE_PATHS.chatImageGenerationSettings, async () => {
        const current = await readVersioned("chat-image-generation-settings", STORAGE_PATHS.chatImageGenerationSettings);
        assertWritable(current.tooNew, STORAGE_PATHS.chatImageGenerationSettings);
        await writeRaw(STORAGE_PATHS.chatImageGenerationSettings, withVersion("chat-image-generation-settings", { ...loaded.settings }));
      });
      options.events?.emit("chatImageGeneration.changed", { settings: jsonClone(result.settings) });
      return result;
    },

    async loadUiState() {
      const read = await readVersioned("ui-state", STORAGE_PATHS.uiState);
      return normalizeUiState(read.value ?? {});
    },
    async saveUiState(state: UiState) {
      const normalized = normalizeUiState(state);
      await queue.run(STORAGE_PATHS.uiState, async () => {
        const current = await readVersioned("ui-state", STORAGE_PATHS.uiState);
        assertWritable(current.tooNew, STORAGE_PATHS.uiState);
        await writeRaw(STORAGE_PATHS.uiState, normalized);
      });
    },

    async loadCharacterDocument(characterId) {
      const path = STORAGE_PATHS.characterDocument(characterId);
      const read = await readVersioned("character-document", path);
      // Same revision as updateCharacterDocument's empty document, so an edit based on this one passes the revision guard.
      if (read.value === undefined) return createEmptyCharacterDocument(characterId, new Date(0));
      const normalized = normalizeCharacterDocument(read.value, characterId);
      if (normalized.issues.length) log("warn", `Character document ${characterId} was repaired on load.`, normalized.issues.slice(0, 20));
      return normalized.value;
    },
    async hasCharacterDocument(characterId) {
      try {
        return await us.exists(STORAGE_PATHS.characterDocument(characterId), userId);
      } catch {
        return false;
      }
    },
    async updateCharacterDocument(characterId, mutate, opts = {}) {
      const path = STORAGE_PATHS.characterDocument(characterId);
      const next = await queue.run(path, async () => {
        const read = await readVersioned("character-document", path);
        assertWritable(read.tooNew, path);
        const current = read.value === undefined ? createEmptyCharacterDocument(characterId, new Date(0)) : normalizeCharacterDocument(read.value, characterId).value;
        if (opts.expectedUpdatedAt !== undefined && opts.expectedUpdatedAt !== current.updatedAt) {
          fail("conflict", "The character data was changed elsewhere. Reload it, then apply your edit again.", {
            messageKo: "Asset Maid 전용 로어북 본문이 외부에서 변경되었습니다. 붙여넣은 본문을 적용하거나 현재 편집값으로 명시적으로 덮어쓸 때까지 자동 저장을 중단합니다.",
            detailCode: "ASSET_MAID_CHARX_EXTERNAL_CHANGE",
            retryable: false,
            details: { expectedUpdatedAt: opts.expectedUpdatedAt, actualUpdatedAt: current.updatedAt },
          });
        }
        const mutated = await mutate(jsonClone(current));
        const normalized = normalizeCharacterDocument(mutated, characterId);
        const doc: CharacterDocument = normalized.value;
        // updatedAt is the revision: strictly increasing even within one millisecond.
        let stamp = now();
        const previous = Date.parse(current.updatedAt);
        if (Number.isFinite(previous) && stamp.getTime() <= previous) stamp = new Date(previous + 1);
        doc.updatedAt = stamp.toISOString();
        await writeRaw(path, doc);
        return doc;
      });
      options.events?.emit("document.changed", { characterId, updatedAt: next.updatedAt, reason: opts.reason ?? "update" });
      return jsonClone(next);
    },

    async loadChatData(chatId) {
      const path = STORAGE_PATHS.chatData(chatId);
      const read = await readVersioned("chat-data", path);
      const normalized = normalizeChatData(read.value, chatId, now().toISOString());
      if (normalized.repaired || normalized.issues.length) log("warn", `Chat data of ${chatId} was repaired on load.`, normalized.issues.slice(0, 20));
      return normalized.data;
    },
    async updateChatData(chatId, mutate) {
      const path = STORAGE_PATHS.chatData(chatId);
      return queue.run(path, async () => {
        const read = await readVersioned("chat-data", path);
        assertWritable(read.tooNew, path);
        const current = normalizeChatData(read.value, chatId, now().toISOString()).data;
        const mutated = await mutate(jsonClone(current));
        const normalized = normalizeChatData(mutated, chatId, now().toISOString());
        if (normalized.repaired || normalized.issues.length) log("warn", `Chat data of ${chatId} was repaired before saving.`, normalized.issues.slice(0, 20));
        const doc: ChatDataDocument = { ...normalized.data, updatedAt: now().toISOString() };
        await writeRaw(path, doc);
        return jsonClone(doc);
      });
    },

    async factoryReset() {
      await queue.run(CONFIG_QUEUE_KEY, async () => {
        for (const prefix of STORAGE_RESET_PREFIXES) {
          try {
            await us.delete(prefix, userId);
          } catch (error) {
            throw storageFailure(`Could not delete ${prefix}.`, error);
          }
        }
        setConfigCache(null);
        schemaChecked = null;
      });
      log("info", "Factory reset: all Inlay Illustrator settings and data were deleted.");
      options.events?.emit("config.changed", { config: normalizeConfig({}) });
    },
    async resetCharacter(characterId) {
      const docPath = STORAGE_PATHS.characterDocument(characterId);
      await queue.run(docPath, async () => {
        for (const path of characterResetPaths(characterId)) {
          try {
            await us.delete(path, userId);
          } catch (error) {
            throw storageFailure(`Could not delete ${path}.`, error);
          }
        }
      });
      log("info", `Character data reset: ${characterId}`);
      options.events?.emit("document.changed", { characterId, updatedAt: now().toISOString(), reason: "reset" });
    },
  };
  return service;
}
