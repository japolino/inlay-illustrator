/**
 * userStorage layout of the port (per user: `{DATA_DIR}/users/{userId}/extensions/inlay_illustrator/`).
 * Maps Asset Maid's stores (pluginStorage keys `asset_maid:v1:*`, the charx lore entry `asset-maid:data`,
 * the chat localLore entry `asset-maid:chat-data`) onto JSON files. Pure path + version helpers; no I/O.
 */
import { CHARACTER_DOCUMENT_SCHEMA, CHARACTER_DOCUMENT_VERSION, normalizeAnimaArtists } from "./character.js";
import { CHAT_DATA_SCHEMA, CHAT_DATA_VERSION } from "./chat.js";
import { asRecord, isPlainObject, trimString } from "./common.js";
import { CONFIG_VERSION } from "./config.js";

/** Marker file at the storage root (AM `asset_maid:v1:schema` = "1"). */
export const STORAGE_SCHEMA_PATH = "storage-schema.json";
export const STORAGE_SCHEMA = "inlay-illustrator.storage";
export const STORAGE_LAYOUT_VERSION = 1;
export interface StorageSchemaMarker { schema: typeof STORAGE_SCHEMA; version: number; createdAt: string }

/**
 * Make an id safe as one path segment. Lumiverse ids are UUID-like; anything else is percent-encoded
 * (also `.`/`..` and empty ids are rejected).
 */
export function safePathSegment(id: string): string {
  const raw = trimString(id);
  if (!raw || raw === "." || raw === "..") throw new Error(`Invalid storage id: "${id}"`);
  return /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/u.test(raw) ? raw : encodeURIComponent(raw).replace(/\./gu, "%2E");
}

/** All paths, relative to the extension's userStorage root. */
export const STORAGE_PATHS = {
  schema: STORAGE_SCHEMA_PATH,
  /** Diff vs defaults of the "model" domain (AM `asset_maid:v1:config:model`). */
  configModel: "config/model.json",
  /** Diff vs defaults of the "settings" domain (AM `asset_maid:v1:config:settings`). */
  configSettings: "config/settings.json",
  /** `{characterPrompt:{artistPrompts}}` (AM `asset_maid:v1:config:artists-global`). */
  artistsGlobal: "config/artists-global.json",
  /** Anima artist entries + default selection (AM `asset_maid:v1:config:anima-artists`, global part). */
  animaArtists: "config/anima-artists.json",
  /** AM `asset_maid:v1:config:chat-image-generation-settings`. */
  chatImageGenerationSettings: "config/chat-image-generation-settings.json",
  /** AM `asset_maid:v1:ui-state` (overlay layout). */
  uiState: "config/ui-state.json",
  /** AM `asset_maid:v1:runtime:asset-reference-bindings`: `Record<bindingKey,{reference, updatedAt}>`. */
  assetReferenceBindings: "config/asset-reference-bindings.json",
  /** AM `asset_maid:v1:runtime:image-prompt-overrides`: `Record<characterId,{overrides, updatedAt}>`. */
  imagePromptOverrides: "config/image-prompt-overrides.json",
  /** AM `asset_maid:v1:source-selection`: last active character `{version:1,current:{sourceId,...}}`. */
  sourceSelection: "config/source-selection.json",
  /** AM `asset_maid:v1:metadata-tag`: `{version:1,sources:{<characterId>:"none"|"partial"|"available"|"deleted"}}`. */
  metadataTag: "config/metadata-tag.json",
  /** Per-character document (AM charx lore entry `asset-maid:data`). */
  characterDocument: (characterId: string) => `characters/${safePathSegment(characterId)}/asset-maid.json`,
  /** Per-character metadata check cache (AM device-local `asset_maid:v1:local:metadata-cache:<sourceId>`). */
  characterMetadataCache: (characterId: string) => `characters/${safePathSegment(characterId)}/metadata-cache.json`,
  /** Cropped reference PNGs (AM `__asset_maid_crop_*` assets). */
  characterReferenceCrop: (characterId: string, cropName: string) => `characters/${safePathSegment(characterId)}/reference-crops/${safePathSegment(cropName)}.png`,
  characterDir: (characterId: string) => `characters/${safePathSegment(characterId)}/`,
  /** Per-chat data: messages/jobs store + Image History + plans + actor state (AM chat localLore entries). */
  chatData: (chatId: string) => `chats/${safePathSegment(chatId)}/chat-data.json`,
  chatDir: (chatId: string) => `chats/${safePathSegment(chatId)}/`,
  /** User-uploaded images (reference/outfit uploads) when not stored as Lumiverse images. */
  upload: (uploadId: string, extension: string) => `uploads/${safePathSegment(uploadId)}.${safePathSegment(extension.replace(/^\./u, "").toLowerCase() || "png")}`,
} as const;

/** Prefixes listed for a full reset (AM factory reset deletes every `asset_maid:v1:*` key). */
export const STORAGE_RESET_PREFIXES = ["config/", "characters/", "chats/", "uploads/", STORAGE_SCHEMA_PATH] as const;
/** Per-character reset (AM "reset current charx"): character document, metadata cache, crops. Chats and images stay. */
export function characterResetPaths(characterId: string): string[] {
  return [STORAGE_PATHS.characterDocument(characterId), STORAGE_PATHS.characterMetadataCache(characterId), `${STORAGE_PATHS.characterDir(characterId)}reference-crops/`];
}

/**
 * Files written by Inlay Illustrator <= 0.9 (Lightboard pipeline). The port never reads them;
 * the backend may delete them after the first successful 0.10 start.
 */
export const LEGACY_LIGHTBOARD_PATHS = ["config.json", "states/", "records/", "workflows/"] as const;

/* ------------------------------------------------------------------------------------------------
 * File kinds, versions, migration hooks
 * ---------------------------------------------------------------------------------------------- */

export type StorageFileKind =
  | "config-model"
  | "config-settings"
  | "artists-global"
  | "anima-artists"
  | "chat-image-generation-settings"
  | "ui-state"
  | "asset-reference-bindings"
  | "image-prompt-overrides"
  | "source-selection"
  | "metadata-tag"
  | "character-document"
  | "character-metadata-cache"
  | "chat-data";

/** Current version of each file kind. Documents carry `version`; diff files carry `version` at the top level too. */
export const STORAGE_FILE_VERSIONS: Readonly<Record<StorageFileKind, number>> = Object.freeze({
  "config-model": CONFIG_VERSION,
  "config-settings": CONFIG_VERSION,
  "artists-global": 1,
  "anima-artists": 1,
  "chat-image-generation-settings": 1,
  "ui-state": 1,
  "asset-reference-bindings": 1,
  "image-prompt-overrides": 1,
  "source-selection": 1,
  "metadata-tag": 1,
  "character-document": CHARACTER_DOCUMENT_VERSION,
  "character-metadata-cache": 1,
  "chat-data": CHAT_DATA_VERSION,
});

/** Schema ids of the self-describing documents. */
export const STORAGE_DOCUMENT_SCHEMAS = { "character-document": CHARACTER_DOCUMENT_SCHEMA, "chat-data": CHAT_DATA_SCHEMA } as const;

export interface StorageMigration {
  kind: StorageFileKind;
  /** Version the migration reads. Absent `version` in a file counts as 0. */
  from: number;
  to: number;
  migrate(raw: Record<string, unknown>): Record<string, unknown>;
}

/** Registered migrations, applied in order by {@link migrateStoredFile}. */
export const STORAGE_MIGRATIONS: StorageMigration[] = [
  // v0 -> v1: anima artists stored as AM's full `animaArtists` object; keep only the global part.
  {
    kind: "anima-artists",
    from: 0,
    to: 1,
    migrate: (raw) => {
      const list = normalizeAnimaArtists(isPlainObject(raw.animaArtists) ? raw.animaArtists : raw);
      return { ...list, selection: { ...list.selection, bySourceId: {} } };
    },
  },
];

export interface MigrationResult {
  value: Record<string, unknown>;
  fromVersion: number;
  toVersion: number;
  applied: string[];
  /** File is newer than this build: callers must not overwrite it. */
  tooNew: boolean;
}

/** Version stored in a file (`version` field; missing = 0). */
export function storedVersion(raw: unknown): number {
  const v = Number(asRecord(raw).version);
  return Number.isSafeInteger(v) && v >= 0 ? v : 0;
}

/**
 * Run migration hooks until the file reaches the current version. Files without a hook for their version
 * are only re-stamped (normalizers of each kind accept older shapes).
 */
export function migrateStoredFile(kind: StorageFileKind, raw: unknown, migrations: readonly StorageMigration[] = STORAGE_MIGRATIONS): MigrationResult {
  const target = STORAGE_FILE_VERSIONS[kind];
  let value = { ...asRecord(raw) };
  const from = storedVersion(value);
  if (from > target) return { value, fromVersion: from, toVersion: from, applied: [], tooNew: true };
  const applied: string[] = [];
  let version = from;
  while (version < target) {
    const step = migrations.find((m) => m.kind === kind && m.from === version);
    if (step) {
      value = step.migrate(value);
      applied.push(`${kind}:${step.from}->${step.to}`);
      version = step.to;
    } else version = target;
  }
  return { value: { ...value, version: target }, fromVersion: from, toVersion: target, applied, tooNew: false };
}

/** Map an Asset Maid pluginStorage key onto the port path (for import tools and documentation). */
export function storagePathForAssetMaidKey(key: string): string | null {
  const k = trimString(key);
  const table: Record<string, string> = {
    "asset_maid:v1:schema": STORAGE_PATHS.schema,
    "asset_maid:v1:config:model": STORAGE_PATHS.configModel,
    "asset_maid:v1:config:settings": STORAGE_PATHS.configSettings,
    "asset_maid:v1:config:artists-global": STORAGE_PATHS.artistsGlobal,
    "asset_maid:v1:config:anima-artists": STORAGE_PATHS.animaArtists,
    "asset_maid:v1:config:chat-image-generation-settings": STORAGE_PATHS.chatImageGenerationSettings,
    "asset_maid:v1:ui-state": STORAGE_PATHS.uiState,
    "asset_maid:v1:runtime:asset-reference-bindings": STORAGE_PATHS.assetReferenceBindings,
    "asset_maid:v1:runtime:image-prompt-overrides": STORAGE_PATHS.imagePromptOverrides,
    "asset_maid:v1:source-selection": STORAGE_PATHS.sourceSelection,
    "asset_maid:v1:metadata-tag": STORAGE_PATHS.metadataTag,
  };
  if (table[k]) return table[k]!;
  const meta = /^asset_maid:v1:local:metadata-cache:(.+)$/u.exec(k);
  if (meta) return STORAGE_PATHS.characterMetadataCache(decodeURIComponent(meta[1]!));
  return null;
}

/** Asset Maid stores that have no file in the port (memory only or dropped). */
export const UNMAPPED_ASSET_MAID_KEYS: Readonly<Record<string, string>> = Object.freeze({
  "asset_maid:v1:active-instance": "Dropped: one extension instance per user worker.",
  "asset_maid:v1:runtime-logs": "Memory only (AM also keeps logs in memory, limit 250).",
  "asset_maid:v1:runtime:display-map": "Memory only (display state).",
  "asset_maid:v1:runtime:display-map-reverse": "Memory only (display state).",
  "asset_maid:v1:runtime:display-slots": "Memory only (display state).",
  "asset_maid:v1:runtime:display-slot-plans": "Memory only (display state).",
  "asset_maid:v1:runtime:zoom-regenerate-seed-fixed": "Memory only.",
  "asset_maid:v1:charx:display-meta": "Memory only; prompt overrides go to config/image-prompt-overrides.json.",
  "asset_maid:v1:charx:visual-continuity": "Virtual key; continuity lives in chats/<chatId>/chat-data.json.",
  "asset_maid:v1:config:chat-image-count": "Legacy; migrated into chat-image-generation-settings.",
  "asset_maid:v1:vertex-cache:*": "Dropped with Asset Maid's direct provider transport.",
  "asset_maid:v1:community-upload:*": "Dropped with the community Maid Library.",
  "asset_maid:v1:local:visitor-id": "Dropped with the community Maid Library.",
  "asset_maid:v1:local:community-owner-id": "Dropped with the community Maid Library.",
  "asset_maid:v1:portable-maintenance-completed": "No writer in Asset Maid 0.9.88; dropped.",
});
