/**
 * Chat-scoped data: a pure port of Asset Maid 0.9.88 chat data (AssetMaid.pretty.js 35995-36444, 52315-52419,
 * 52476-52593, 157525-157655, 171093-171225, 29159-29215) plus the Lumiverse per-chat document.
 *
 * Lumiverse mapping (PORT-PLAN): one JSON document per chat at userStorage `chats/<chatId>/chat-data.json`
 * (`ChatDataDocument`). Asset Maid kept the store in `chat.localLore` (`asset-maid:chat-data`) and re-projected the
 * Image History tree on every load; the port persists the tree directly (see docs/CONTRACT.md "Chat data").
 *
 * Message identity: Lumiverse messages have swipes. A History message id is `<lumiverseMessageId>@<swipeIndex>`.
 */
import { GENERATED_ASSET_NAME_PATTERN, GENERATED_ASSET_NAME_SEPARATOR } from "./character.js";
import type { JsonValue } from "./common.js";
import {
  ASSET_EXTENSION_PATTERN,
  SAVED_PATH_FORBIDDEN,
  canonicalizeHistoryTree,
  createEmptyHistoryTree,
  listHistoryTreeIssues,
  listRevisionSlots,
  projectStoreToTree,
  type GenerationOrigin,
  type HistoryIssue,
  type HistoryRevisionStatus,
  type HistoryTree,
  type IllustrationWorkflow,
  type IllustrationWorkflowSyncInput,
} from "./history.js";

/* ------------------------------------------------------------------------------------------------------------------ */
/* Count policy (pretty 20582-20623, 157525)                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** `Fa`: upper bound of every image count ("unlimited"). */
export const UNLIMITED_IMAGE_COUNT = Number.MAX_SAFE_INTEGER;
/** Asset Maid's chat image settings cap (`Km(e, t, r = 7)`). */
export const MAX_IMAGE_COUNT = 7;
const COUNT_MAX = UNLIMITED_IMAGE_COUNT;

export type CountPolicyMode = "fixed" | "range";
export interface CountPolicyValues {
  fixed: number;
  min: number;
  max: number;
}
export interface CountPolicy {
  mode: CountPolicyMode;
  min: number;
  max: number;
  values?: CountPolicyValues;
}

/** `qj`: round and clamp to 1..max (fallback when not finite). */
export function clampCount(value: unknown, fallback = 1, max = COUNT_MAX): number {
  const n = Number(value);
  return Math.min(max, Math.max(1, Number.isFinite(n) ? Math.round(n) : fallback));
}

/** `_W`: a strictly increasing min/max pair. */
export function countRange(
  min: unknown,
  max: unknown,
  fallbackMin = 1,
  fallbackMax = 2,
  limit = COUNT_MAX,
): { min: number; max: number } {
  const a = clampCount(min, fallbackMin, limit);
  const b = clampCount(max, fallbackMax, limit);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo < hi ? { min: lo, max: hi } : hi < limit ? { min: lo, max: hi + 1 } : { min: lo - 1, max: hi };
}

/** `qf`: fixed count policy. `fixedCountPolicy(1)` is Asset Maid's default. */
export function fixedCountPolicy(count: unknown = 1, limit = COUNT_MAX): CountPolicy {
  const n = clampCount(count, 1, limit);
  return { mode: "fixed", min: n, max: n, values: { fixed: n, ...countRange(n, n, 1, 2, limit) } };
}

/** `Gf`: normalize any count policy input (number, string, legacy shapes, fixed/range records). */
export function normalizeCountPolicy(value: unknown, fallback: unknown = 1, limit = COUNT_MAX): CountPolicy {
  if (typeof value === "number" || typeof value === "string") return fixedCountPolicy(value, limit);
  const n: Record<string, unknown> = isRecord(value) ? value : {};
  const base = typeof fallback === "object" && fallback !== null ? normalizeCountPolicy(fallback, 1, limit) : fixedCountPolicy(fallback, limit);
  const mode: CountPolicyMode = n.mode === "range" ? "range" : "fixed";
  const v: Record<string, unknown> = isRecord(n.values) ? n.values : {};
  const s = base.values ?? { fixed: base.max, min: base.min, max: base.max };
  const fixed = clampCount(v.fixed ?? n.fixed ?? (mode === "fixed" ? (n.min ?? n.max) : n.max) ?? n.count, s.fixed, limit);
  const values: CountPolicyValues = {
    fixed,
    ...countRange(v.min ?? n.rangeMin ?? n.min ?? n.count, v.max ?? n.rangeMax ?? n.max ?? n.count, s.min, s.max, limit),
  };
  return mode === "fixed"
    ? { mode, min: fixed, max: fixed, values }
    : { mode, min: values.min, max: values.max, values };
}

/** `IW`: the remembered fixed/min/max inputs of a policy. */
export function countPolicyValues(value: unknown, limit = COUNT_MAX): CountPolicyValues {
  const p = normalizeCountPolicy(value, 1, limit);
  return p.values ?? { fixed: p.max, min: p.min, max: p.max };
}

/** `SW`: clamp a policy to the number of available slots (0 slots -> fixed 0). Result has no `values`. */
export function clampCountPolicyToResolved(
  value: unknown,
  availableSlots: unknown,
): { mode: CountPolicyMode; min: number; max: number } {
  const p = normalizeCountPolicy(value);
  const n = Math.max(0, Math.floor(Number(availableSlots) || 0));
  if (n === 0) return { mode: "fixed", min: 0, max: 0 };
  const max = Math.min(p.max, n);
  const min = Math.min(p.min, max);
  return p.mode === "fixed" || min === max ? { mode: "fixed", min: max, max } : { mode: "range", min, max };
}

/** `w5`: requested image count, 1..COUNT_MAX. */
export function normalizeRequestedCount(value: unknown, fallback = 1): number {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.min(COUNT_MAX, Math.max(1, Math.round(n)))
    : Math.min(COUNT_MAX, Math.max(1, Math.round(fallback)));
}


/* ------------------------------------------------------------------------------------------------------------------ */
/* Identity: chat key, message ids with swipes, message keys, slot ids                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** `<lumiverseMessageId>@<swipeIndex>`: the stable message id used by the chat store and the History tree. */
export type HistoryMessageId = string;

const SWIPE_INDEX_PATTERN = /^(?:0|[1-9]\d*)$/u;

/** History message id of one swipe of a Lumiverse message. */
export function toHistoryMessageId(messageId: string, swipeIndex: number): HistoryMessageId {
  const id = String(messageId ?? "").trim();
  if (!id) throw new TypeError("A Lumiverse message id is required.");
  if (!Number.isSafeInteger(swipeIndex) || swipeIndex < 0) throw new TypeError("swipeIndex must be a non-negative integer.");
  return `${id}@${swipeIndex}`;
}

/** Inverse of `toHistoryMessageId` (splits at the last `@`). Returns null for anything else. */
export function parseHistoryMessageId(id: unknown): { messageId: string; swipeIndex: number } | null {
  if (typeof id !== "string") return null;
  const at = id.lastIndexOf("@");
  if (at <= 0) return null;
  const messageId = id.slice(0, at);
  const swipe = id.slice(at + 1);
  if (messageId.trim() !== messageId || !SWIPE_INDEX_PATTERN.test(swipe)) return null;
  const swipeIndex = Number(swipe);
  return Number.isSafeInteger(swipeIndex) && !/^(?:id|index):/u.test(messageId) ? { messageId, swipeIndex } : null;
}

/** History tree key of a chat-mode message: `chat:<HistoryMessageId>`. */
export function chatMessageKey(id: HistoryMessageId): string {
  return `chat:${id}`;
}
/** History tree key of an illustration message (`db`): `illustration:<HistoryMessageId>`. */
export function illustrationMessageKey(id: HistoryMessageId): string {
  const t = String(id ?? "").trim();
  if (!t) throw new TypeError("Illustration requires a stable message id.");
  return `illustration:${t}`;
}
/** Illustration slot id (`hSt`): `illustration:<HistoryMessageId>:slot:<n>`. */
export function illustrationSlotId(messageKey: string, slotIndex: number): string {
  const key = String(messageKey ?? "").trim();
  if (!key) throw new TypeError("Illustration slot requires a messageKey.");
  return `${key}:slot:${Math.max(0, Math.round(slotIndex))}`;
}
/** Chat-mode slot id: `chat:<HistoryMessageId>:slot:<n>` (same format as the store projection `cK`). */
export function chatSlotId(id: HistoryMessageId, slotIndex: number): string {
  return `${chatMessageKey(id)}:slot:${Math.max(0, Math.round(slotIndex))}`;
}
/** History `chatKey` of a Lumiverse chat: `chat:<lumiverseChatId>`. */
export function chatKeyForChat(chatId: string): string {
  const id = String(chatId ?? "").trim();
  if (!id) throw new TypeError("A Lumiverse chat id is required.");
  return `chat:${id}`;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Generated asset names (`pMe`, `EZ`, `NZ`, `HE`)                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

export type GeneratedAssetKind = "chat" | "outfit";
export const GENERATED_ASSET_LABEL_MAX_CHARS = 96;
const UUID_SOURCE = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_SOURCE}$`, "u");
const LABEL_FORBIDDEN = /(?:\.__am__\.|\{\{|\}\}|<|>|[\u0000-\u001f\u007f])/giu;
const LABEL_PATH_CHARS = /[:"/\\|?*]/gu;

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
function cleanLabel(value: unknown): string {
  return text(value)
    .normalize("NFKC")
    .replace(LABEL_FORBIDDEN, " ")
    .replace(LABEL_PATH_CHARS, " ")
    .replace(/\s+/gu, " ")
    .replace(/^[.\s]+|[.\s]+$/gu, "")
    .slice(0, GENERATED_ASSET_LABEL_MAX_CHARS)
    .trim();
}

/** `EZ`: sanitize an asset label (NFKC, strips separators/macros/markup/control/path chars, max 96 chars). */
export function sanitizeAssetLabel(label: unknown, fallback = "Asset Maid"): string {
  return cleanLabel(label) || cleanLabel(fallback) || "Asset Maid";
}

function randomUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < b.length; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = ((b[6] as number) & 15) | 64;
  b[8] = ((b[8] as number) & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join("-");
}

/** `pMe`: `<sanitized label>.__am__.<kind>.<uuid>`; `id` is used when it is a lowercase UUID, else a random v4. */
export function createGeneratedAssetName(input: { label?: unknown; kind: GeneratedAssetKind; id?: unknown }): string {
  const label = sanitizeAssetLabel(input.label).replace(/'/gu, "").trim() || "Asset Maid";
  const id = text(input.id).toLowerCase();
  return `${label}${GENERATED_ASSET_NAME_SEPARATOR}${input.kind}.${UUID_PATTERN.test(id) ? id : randomUuid()}`;
}

/** `NZ`: parse a generated asset name (label must already be sanitized). */
export function parseGeneratedAssetName(
  name: unknown,
): { assetName: string; label: string; kind: GeneratedAssetKind; id: string } | null {
  const t = text(name);
  const m = GENERATED_ASSET_NAME_PATTERN.exec(t);
  if (!m) return null;
  const [, label, kind, id] = m as unknown as [string, string, GeneratedAssetKind, string];
  return sanitizeAssetLabel(label, "") !== label ? null : { assetName: t, label, kind, id };
}

/** `HE`. */
export function isGeneratedAssetName(name: unknown): boolean {
  return parseGeneratedAssetName(name) !== null;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Chat store (`uN` / `c5e` / `s5e` / `a5e` / `o5e` / `i5e`, 36210-36375)                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Asset Maid localLore carrier (import of Risu data only; the port stores `ChatDataDocument`). */
export const AM_CHAT_DATA_LORE_ID = "asset-maid:chat-data";
export const AM_CHAT_DATA_LORE_COMMENT = "__ASSET_MAID_CHAT_DATA__";
export const AM_DONT_ACTIVATE_PREFIX = "@@dont_activate";

/** Continuity checkpoint keys (`VD`). */
export const CONTINUITY_KEYS = ["scene", "characters", "modifierRefs", "outfitRefs", "nsfwPositions", "participants"] as const;
export type ContinuityKey = (typeof CONTINUITY_KEYS)[number];
/** `n5e` output: the visual continuity snapshot stored on a generation (owned by the continuity analyst). */
export type VisualContinuityCheckpoint = Partial<Record<ContinuityKey, JsonValue>>;

export interface ChatStoreImage {
  assetName: string;
  savedPath?: string;
  extension?: string;
  kind?: "original";
  width: number;
  height: number;
}
export interface ChatStoreSource {
  assetName: string;
  markup: string;
}
export interface ChatStoreGeneration {
  id: string;
  parentId?: string;
  targetCount: number;
  slots: Record<string, ChatStoreImage[]>;
  deletedSlotIndices?: number[];
  continuity?: VisualContinuityCheckpoint;
  error?: string;
}
export type ChatStoreMessageKind = "inline" | "illustration";
export interface ChatStoreMessage {
  kind: ChatStoreMessageKind;
  /** Inline only; index = token slot index; null = unknown source. Durable copy of the original markup. */
  sources?: (ChatStoreSource | null)[];
  /** Illustration only, integer > 0. */
  requestedCount?: number;
  generations: ChatStoreGeneration[];
}
export interface ChatStoreJob {
  messageId: string;
  generationId: string;
}
/** Asset Maid durable chat store; message keys are `HistoryMessageId`s in the port. */
export interface ChatStore {
  messages: Record<string, ChatStoreMessage>;
  jobs?: Record<string, ChatStoreJob>;
}

export interface ChatStoreIssue {
  code: string;
  path: string;
  message: string;
}

/** `Wk`. */
export function createEmptyChatStore(): ChatStore {
  return { messages: {} };
}

const NUMERIC_KEY = /^(?:0|[1-9]\d*)$/u;
const META_KEYS = new Set([
  "messageId", "messageIndex", "historyRevisionId", "historyRevisionOrder", "capturedAt", "updatedAt",
  "updatedAtChatIndex", "updatedAtMessageIndex", "updatedAtMessageId",
]);
const ZERO_DROP_KEYS = new Set(["cum_count", "_continuity_turn"]);
const SCENE_LAYOUTS = "sceneLayouts";
const CONTINUITY_KEY_SET = new Set<string>(CONTINUITY_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function rec(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
function clip(value: unknown, max = 512): string {
  return value == null ? "" : String(value).trim().slice(0, max);
}
function nonNegative(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/* --- continuity (`WD`, `Vk`, `Rx`, `NQ`, `RQ`, `Q2e`, `e5e`, `t5e`, `r5e`, `n5e`, `Xk`) --- */

function stripMeta(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value))
    return value.flatMap((v) => {
      const n = stripMeta(v);
      return n === undefined ? [] : [n];
    });
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).flatMap(([k, v]) => {
      if (META_KEYS.has(k)) return [];
      const n = stripMeta(v);
      return n === undefined ? [] : [[k, n]];
    }),
  );
}

function compactContinuity(value: unknown, key = ""): JsonValue | undefined {
  if (Array.isArray(value)) {
    if (!value.length) return undefined;
    const items = value.flatMap((v) => {
      const n = compactContinuity(v);
      return n === undefined ? [] : [n];
    });
    return items.length ? items : undefined;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).flatMap(([k, v]) => {
      if (META_KEYS.has(k)) return [];
      if (ZERO_DROP_KEYS.has(k) && Number(v) === 0) return [];
      const n = compactContinuity(v, k);
      return n === undefined ? [] : [[k, n]];
    });
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (
    value !== undefined &&
    !(["description", "characterName"].includes(key) && value === "") &&
    (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))
  )
    return value;
  return undefined;
}

function presetParts(scene: Record<string, unknown>): { category: string; positionId: string } {
  const parts = clip(scene.presetId).split(".").filter(Boolean);
  return {
    category: (clip(scene.compositionId) || parts[0] || "") === "1girl_solo" ? "solo" : (parts[1] ?? ""),
    positionId: parts.at(-1) ?? "",
  };
}
function sameFlatRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}
function compactScene(value: unknown): Record<string, JsonValue> | undefined {
  const t = rec(compactContinuity(value));
  if (!Object.keys(t).length) return undefined;
  const r: Record<string, unknown> = { ...t };
  delete r.maleKey;
  if (!clip(r.presetPath) || clip(r.presetPath) === clip(r.presetId)) delete r.presetPath;
  const p = presetParts(r);
  if (!clip(r.category) || clip(r.category) === p.category) delete r.category;
  if (!clip(r.positionId) || clip(r.positionId) === p.positionId) delete r.positionId;
  return Object.keys(r).length ? (r as Record<string, JsonValue>) : undefined;
}
function activeScenesFromPrimary(scenes: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(scenes).flatMap(([id, s]) => {
      const key = clip(rec(s).primaryFemaleKey);
      return key ? [[key, id]] : [];
    }),
  );
}
function compactNsfwPositions(value: unknown): JsonValue | undefined {
  const t = rec(value);
  const scenes = Object.fromEntries(
    Object.entries(rec(t.scenes)).flatMap(([id, s]) => {
      const c = compactScene(s);
      return c === undefined ? [] : [[id, c]];
    }),
  );
  if (!Object.keys(scenes).length) return undefined;
  const active = rec(compactContinuity(t.activeSceneIdByCharacter));
  return {
    ...(sameFlatRecord(active, activeScenesFromPrimary(scenes)) || !Object.keys(active).length
      ? {}
      : { activeSceneIdByCharacter: active as Record<string, JsonValue> }),
    scenes,
  };
}

/** `Xk`: canonical compact continuity checkpoint (drops meta keys, empties, zero counters, derivable scene fields). */
export function canonicalizeContinuity(value: unknown): VisualContinuityCheckpoint | undefined {
  const t = rec(value);
  const entries = CONTINUITY_KEYS.flatMap((k) => {
    if (!has(t, k)) return [];
    const n = k === "nsfwPositions" ? compactNsfwPositions(t[k]) : compactContinuity(t[k]);
    return n === undefined ? [] : [[k, n]];
  });
  return entries.length ? (Object.fromEntries(entries) as VisualContinuityCheckpoint) : undefined;
}

function isCompact(value: unknown, key = ""): boolean {
  if (Array.isArray(value)) return value.length > 0 && value.every((v) => isCompact(v));
  if (isRecord(value)) {
    const entries = Object.entries(value);
    return (
      entries.length > 0 &&
      entries.every(([k, v]) => !META_KEYS.has(k) && !(ZERO_DROP_KEYS.has(k) && Number(v) === 0) && isCompact(v, k))
    );
  }
  return value === undefined || (["description", "characterName"].includes(key) && value === "")
    ? false
    : typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}
function isCompactNsfwPositions(value: unknown): boolean {
  const t = rec(value);
  if (Object.keys(t).some((k) => !["activeSceneIdByCharacter", "scenes"].includes(k)) || !isRecord(t.scenes) || !Object.keys(t.scenes).length)
    return false;
  for (const s of Object.values(t.scenes)) {
    const n = rec(s);
    if (
      !Object.keys(n).length ||
      has(n, "maleKey") ||
      !isCompact(n) ||
      (has(n, "presetPath") && (!clip(n.presetPath) || clip(n.presetPath) === clip(n.presetId)))
    )
      return false;
    const p = presetParts(n);
    if (
      (has(n, "category") && (!clip(n.category) || clip(n.category) === p.category)) ||
      (has(n, "positionId") && (!clip(n.positionId) || clip(n.positionId) === p.positionId))
    )
      return false;
  }
  return !(
    has(t, "activeSceneIdByCharacter") &&
    (!isCompact(t.activeSceneIdByCharacter) || sameFlatRecord(rec(t.activeSceneIdByCharacter), activeScenesFromPrimary(rec(t.scenes))))
  );
}
/** `r5e`: legacy top-level `sceneLayouts` is moved into `participants`. */
function liftSceneLayouts(value: unknown): Record<string, unknown> | null {
  const t = rec(value);
  const keys = Object.keys(t);
  if (!keys.length || keys.some((k) => !CONTINUITY_KEY_SET.has(k) && k !== SCENE_LAYOUTS)) return null;
  if (!has(t, SCENE_LAYOUTS)) return t;
  const layouts = t[SCENE_LAYOUTS];
  const o: Record<string, unknown> = { ...t };
  delete o[SCENE_LAYOUTS];
  if (isRecord(o.participants) && has(o.participants, SCENE_LAYOUTS)) return o;
  if (!isCompact(layouts)) return null;
  if (has(o, "participants")) {
    if (!isRecord(o.participants)) return null;
    o.participants = { ...o.participants, sceneLayouts: layouts };
    return o;
  }
  o.participants = { sceneLayouts: layouts };
  return o;
}
/** `n5e`: strict continuity checkpoint check; undefined = invalid. */
export function normalizeContinuityCheckpoint(value: unknown): VisualContinuityCheckpoint | undefined {
  const t = liftSceneLayouts(value);
  if (!t) return undefined;
  const entries = CONTINUITY_KEYS.flatMap((k) => {
    if (!has(t, k)) return [];
    const v = t[k];
    if (!(k === "nsfwPositions" ? isCompactNsfwPositions(v) : isCompact(v))) return [];
    const n = stripMeta(v);
    return n === undefined ? [] : [[k, n]];
  });
  if (entries.length === Object.keys(t).length) return entries.length ? (Object.fromEntries(entries) as VisualContinuityCheckpoint) : undefined;
  return undefined;
}

/* --- store validators --- */

const IMAGE_FIELDS = ["assetName", "savedPath", "extension", "kind", "width", "height"];
const GENERATION_FIELDS = ["id", "parentId", "targetCount", "slots", "deletedSlotIndices", "continuity", "error"];
const MESSAGE_FIELDS = ["kind", "sources", "requestedCount", "generations"];

function storeIssue(out: ChatStoreIssue[], code: string, path: string, message: string): null {
  out.push({ code, path, message });
  return null;
}
function isNonNegativeInt(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/** `o5e`. */
function normalizeStoreImage(value: unknown, path: string, out: ChatStoreIssue[]): ChatStoreImage | null {
  const t = rec(value);
  const assetName = clip(t.assetName, 1024);
  const savedPath = clip(t.savedPath, 4096);
  const extension = clip(t.extension, 16).replace(/^\./u, "").toLowerCase();
  const hasPath = has(t, "savedPath");
  const hasExt = has(t, "extension");
  if (!assetName) return storeIssue(out, "image-asset-name", `${path}.assetName`, "assetName must be a non-empty string.");
  const extra = Object.keys(t).find((k) => !IMAGE_FIELDS.includes(k));
  if (extra !== undefined) return storeIssue(out, "unexpected-field", `${path}.${extra}`, "Unknown image field.");
  if (has(t, "kind") && t.kind !== "original") return storeIssue(out, "image-kind", `${path}.kind`, 'kind must be "original" when present.');
  if (hasPath !== hasExt) return storeIssue(out, "image-location-pair", path, "savedPath and extension must be stored together.");
  if (hasPath && (t.kind === "original" || !savedPath || SAVED_PATH_FORBIDDEN.test(savedPath) || !ASSET_EXTENSION_PATTERN.test(extension)))
    return storeIssue(out, "image-location", path, "savedPath/extension must be a host asset key and a lowercase extension (not on originals).");
  if (!isNonNegativeInt(t.width) || !isNonNegativeInt(t.height))
    return storeIssue(out, "image-size", path, "width/height must be integers >= 0.");
  return {
    assetName,
    ...(savedPath ? { savedPath, extension } : {}),
    ...(t.kind === "original" ? { kind: "original" as const } : {}),
    width: nonNegative(t.width),
    height: nonNegative(t.height),
  };
}

/** `a5e`. */
function normalizeStoreSlots(value: unknown, path: string, out: ChatStoreIssue[]): Record<string, ChatStoreImage[]> | null {
  if (!isRecord(value)) return storeIssue(out, "slots-record", path, "slots must be an object.");
  const slots: Record<string, ChatStoreImage[]> = {};
  for (const [key, images] of Object.entries(value)) {
    if (!NUMERIC_KEY.test(key)) return storeIssue(out, "slot-key", `${path}.${key}`, "Slot keys must be canonical non-negative integers.");
    if (!Array.isArray(images) || !images.length) return storeIssue(out, "slot-images", `${path}.${key}`, "A slot must be a non-empty array.");
    const list: ChatStoreImage[] = [];
    for (let i = 0; i < images.length; i += 1) {
      const image = normalizeStoreImage(images[i], `${path}.${key}[${i}]`, out);
      if (!image) return null;
      list.push(image);
    }
    slots[key] = list;
  }
  return slots;
}

/** `s5e`. */
function normalizeStoreGeneration(value: unknown, path: string, out: ChatStoreIssue[]): ChatStoreGeneration | null {
  const t = rec(value);
  const id = clip(t.id);
  if (!id) return storeIssue(out, "generation-id", `${path}.id`, "id must be a non-empty string.");
  const slots = normalizeStoreSlots(t.slots, `${path}.slots`, out);
  if (slots === null) return null;
  const target = Number(t.targetCount);
  const extra = Object.keys(t).find((k) => !GENERATION_FIELDS.includes(k));
  if (extra !== undefined) return storeIssue(out, "unexpected-field", `${path}.${extra}`, "Unknown generation field.");
  if (typeof t.targetCount !== "number" || !Number.isInteger(target) || target < 0)
    return storeIssue(out, "target-count", `${path}.targetCount`, "targetCount must be an integer >= 0.");
  if (Object.keys(slots).some((k) => Number(k) >= target))
    return storeIssue(out, "slot-range", `${path}.slots`, "Slot keys must be below targetCount.");
  if (has(t, "parentId") && !clip(t.parentId)) return storeIssue(out, "parent-id", `${path}.parentId`, "parentId must be non-empty when present.");
  if (has(t, "error") && !clip(t.error, 512)) return storeIssue(out, "error", `${path}.error`, "error must be non-empty when present.");
  const deleted = t.deletedSlotIndices;
  if (
    deleted !== undefined &&
    (!Array.isArray(deleted) ||
      deleted.some(
        (d: unknown, i: number) =>
          !Number.isSafeInteger(d) ||
          (d as number) < 0 ||
          (d as number) >= target ||
          has(slots, String(d)) ||
          (i > 0 && (d as number) <= (deleted[i - 1] as number)),
      ))
  )
    return storeIssue(
      out,
      "deleted-slots",
      `${path}.deletedSlotIndices`,
      "deletedSlotIndices must be strictly ascending, below targetCount and not live slots.",
    );
  const hasContinuity = has(t, "continuity");
  const continuity = hasContinuity ? normalizeContinuityCheckpoint(t.continuity) : undefined;
  if (hasContinuity && !continuity) return storeIssue(out, "continuity", `${path}.continuity`, "Invalid continuity checkpoint.");
  const error = clip(t.error, 512);
  return {
    id,
    ...(clip(t.parentId) ? { parentId: clip(t.parentId) } : {}),
    targetCount: target,
    slots,
    ...(Array.isArray(deleted) && deleted.length ? { deletedSlotIndices: [...(deleted as number[])] } : {}),
    ...(continuity ? { continuity } : {}),
    ...(error ? { error } : {}),
  };
}

/** `i5e`. */
function normalizeStoreSource(value: unknown): ChatStoreSource | null {
  if (value === null) return null;
  const t = rec(value);
  const assetName = clip(t.assetName, 1024);
  const markup = typeof t.markup === "string" ? t.markup : "";
  return assetName && markup && Object.keys(t).every((k) => ["assetName", "markup"].includes(k)) ? { assetName, markup } : null;
}

/** `c5e`. */
function normalizeStoreMessage(value: unknown, path: string, out: ChatStoreIssue[]): ChatStoreMessage | null {
  const t = rec(value);
  const kind: ChatStoreMessageKind | null = t.kind === "inline" ? "inline" : t.kind === "illustration" ? "illustration" : null;
  if (!kind) return storeIssue(out, "message-kind", `${path}.kind`, 'kind must be "inline" or "illustration".');
  const extra = Object.keys(t).find((k) => !MESSAGE_FIELDS.includes(k));
  if (extra !== undefined) return storeIssue(out, "unexpected-field", `${path}.${extra}`, "Unknown message field.");
  if (!Array.isArray(t.generations)) return storeIssue(out, "generations-array", `${path}.generations`, "generations must be an array.");
  const generations: ChatStoreGeneration[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < t.generations.length; i += 1) {
    const gp = `${path}.generations[${i}]`;
    const g = normalizeStoreGeneration(t.generations[i], gp, out);
    if (!g) return null;
    if (ids.has(g.id)) return storeIssue(out, "generation-duplicate", `${gp}.id`, "Generation ids must be unique.");
    const { parentId, ...rest } = g;
    if (parentId && !ids.has(parentId)) return storeIssue(out, "generation-parent", `${gp}.parentId`, "parentId must point to an earlier generation.");
    generations.push({ ...rest, ...(parentId ? { parentId } : {}) });
    ids.add(g.id);
    if (kind === "inline" && g.deletedSlotIndices?.length)
      return storeIssue(out, "inline-deleted-slots", `${gp}.deletedSlotIndices`, "Inline messages cannot delete slots.");
  }
  const requested = nonNegative(t.requestedCount);
  if (
    has(t, "requestedCount") &&
    (kind !== "illustration" || typeof t.requestedCount !== "number" || !Number.isInteger(t.requestedCount) || requested <= 0)
  )
    return storeIssue(out, "requested-count", `${path}.requestedCount`, "requestedCount is an integer > 0 on illustration messages only.");
  if (has(t, "sources") && !Array.isArray(t.sources)) return storeIssue(out, "sources", `${path}.sources`, "sources must be an array.");
  const raw = Array.isArray(t.sources) ? t.sources : [];
  const sources = raw.map(normalizeStoreSource);
  if (sources.some((s, i) => s === null && raw[i] !== null) || (kind !== "inline" && raw.length))
    return storeIssue(out, "sources", `${path}.sources`, "sources hold {assetName, markup} or null, on inline messages only.");
  return {
    kind,
    ...(kind === "inline" && sources.length ? { sources } : {}),
    ...(kind === "illustration" && requested > 0 ? { requestedCount: requested } : {}),
    generations,
  };
}

export type ChatStoreValidationResult = { ok: true; store: ChatStore } | { ok: false; issues: ChatStoreIssue[] };

/**
 * `uN`: validate and normalize the chat store. Same accept/reject rules and the same normalized output as Asset Maid;
 * returns issues instead of null (one issue per failing message / job rule).
 */
export function validateChatStore(value: unknown): ChatStoreValidationResult {
  const out: ChatStoreIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [{ code: "store-record", path: "$", message: "The chat store must be an object." }] };
  const extra = Object.keys(value).find((k) => !["messages", "jobs"].includes(k));
  if (extra !== undefined) out.push({ code: "unexpected-field", path: `$.${extra}`, message: "Unknown chat store field." });
  if (!isRecord(value.messages)) {
    out.push({ code: "messages-record", path: "$.messages", message: "messages must be an object." });
    return { ok: false, issues: out };
  }
  const messages: Record<string, ChatStoreMessage> = {};
  for (const [rawKey, raw] of Object.entries(value.messages)) {
    const key = clip(rawKey);
    const path = `$.messages.${rawKey}`;
    if (!key || /^(?:id|index):/u.test(key)) {
      out.push({ code: "message-key", path, message: "Message keys must be stable message ids (no id:/index: prefix)." });
      continue;
    }
    const m = normalizeStoreMessage(raw, path, out);
    if (m) messages[key] = m;
  }
  const generationIds = (messageId: string): Set<string> => new Set(messages[messageId]?.generations.map((g) => g.id) ?? []);
  const jobs: Record<string, ChatStoreJob> = {};
  if (has(value, "jobs") && !isRecord(value.jobs)) out.push({ code: "jobs-record", path: "$.jobs", message: "jobs must be an object." });
  for (const [rawKey, raw] of Object.entries(rec(value.jobs))) {
    const key = clip(rawKey);
    const j = rec(raw);
    const messageId = clip(j.messageId);
    const generationId = clip(j.generationId);
    if (Object.keys(j).some((k) => !["messageId", "generationId"].includes(k)))
      out.push({ code: "unexpected-field", path: `$.jobs.${rawKey}`, message: "A job holds only messageId and generationId." });
    if (key && has(jobs, key)) out.push({ code: "job-duplicate", path: `$.jobs.${rawKey}`, message: "Job keys must be unique after trimming." });
    else if (!key || !generationIds(messageId).has(generationId))
      out.push({ code: "job-target", path: `$.jobs.${rawKey}`, message: "A job must point to an existing message generation." });
    else jobs[key] = { messageId, generationId };
  }
  if (out.length) return { ok: false, issues: out };
  return { ok: true, store: { messages, ...(Object.keys(jobs).length ? { jobs } : {}) } };
}

/** `l5e`: parse an Asset Maid localLore carrier content (`@@dont_activate {json}`); null if unreadable. */
export function parseAssetMaidChatStoreContent(content: unknown): ChatStore | null {
  if (typeof content !== "string") return null;
  const t = content.trim();
  if (!t.startsWith(AM_DONT_ACTIVATE_PREFIX)) return null;
  const json = t.slice(AM_DONT_ACTIVATE_PREFIX.length).trim();
  if (!json) return null;
  try {
    const parsed = rec(JSON.parse(json));
    if (!has(parsed, "messages")) return null;
    const r = validateChatStore(parsed);
    return r.ok ? r.store : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Current actor state (`asset-maid:current-actor-state`, 52315-52419)                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

export const AM_ACTOR_STATE_LORE_ID = "asset-maid:current-actor-state";
export const AM_ACTOR_STATE_LORE_COMMENT = "__ASSET_MAID_CURRENT_ACTOR_STATE__";
/** `Zu`: tracked state groups. */
export const ACTOR_STATE_GROUPS = ["state.fluid.cum.location", "actor.injury"] as const;
export type ActorStateGroup = (typeof ACTOR_STATE_GROUPS)[number];
/** Reserved slot-like actor keys that cannot hold state. */
export const ACTOR_STATE_RESERVED_KEY = /^(?:primary|secondary|actor_\d+|female_\d+|male_\d+)$/u;

export interface ActorStateRecord {
  groups: Record<ActorStateGroup, string[]>;
  count: number;
  /** Remaining turns per `state.fluid.cum.location` value. */
  ttl: Record<string, number>;
}
/** Current actor state of a chat. `{revision: 0, actors: {}}` = no state yet (Asset Maid's "absent"). */
export interface CurrentActorState {
  revision: number;
  actors: Record<string, ActorStateRecord>;
}

export function createEmptyActorState(): CurrentActorState {
  return { revision: 0, actors: {} };
}

function uniqueStrings(value: unknown): string[] {
  return [...new Set((Array.isArray(value) ? value : []).filter((v) => typeof v === "string" && !!v.trim()).map((v: string) => v.trim()))];
}
function floorCount(value: unknown): number {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

export type ActorStateValidationResult = { ok: true; state: CurrentActorState } | { ok: false; issues: ChatStoreIssue[] };

/**
 * `Wv` parse rules: revision safe int >= 1, actor keys non-reserved, groups are string arrays (non-blank items),
 * count safe int >= 0, ttl values safe ints >= 0. Output is normalized (trimmed, de-duplicated). The empty state
 * `{revision: 0, actors: {}}` is accepted.
 */
export function validateCurrentActorState(value: unknown): ActorStateValidationResult {
  const bad = (code: string, path: string, message: string): ActorStateValidationResult => ({ ok: false, issues: [{ code, path, message }] });
  const o = rec(value);
  if (!isRecord(o.actors)) return bad("actors-record", "$.actors", "actors must be an object.");
  if (o.revision === 0 && !Object.keys(o.actors).length) return { ok: true, state: createEmptyActorState() };
  if (!Number.isSafeInteger(o.revision) || Number(o.revision) < 1) return bad("revision", "$.revision", "revision must be a safe integer >= 1.");
  const actors: Record<string, ActorStateRecord> = {};
  for (const [key, raw] of Object.entries(o.actors)) {
    const p = `$.actors.${key}`;
    const c = rec(raw);
    if (!key || ACTOR_STATE_RESERVED_KEY.test(key)) return bad("actor-key", p, "Actor keys must be real actor keys.");
    if (!isRecord(c.groups) || !isRecord(c.ttl) || !Number.isSafeInteger(c.count) || Number(c.count) < 0)
      return bad("actor-record", p, "An actor needs groups, ttl and a count >= 0.");
    for (const g of ACTOR_STATE_GROUPS) {
      const list = c.groups[g];
      if (!Array.isArray(list) || list.some((v) => typeof v !== "string" || !v.trim()))
        return bad("actor-group", `${p}.groups.${g}`, "Groups must be arrays of non-blank strings.");
    }
    if (Object.values(c.ttl).some((v) => !Number.isSafeInteger(v) || Number(v) < 0)) return bad("actor-ttl", `${p}.ttl`, "ttl values must be integers >= 0.");
    actors[key] = {
      groups: Object.fromEntries(ACTOR_STATE_GROUPS.map((g) => [g, uniqueStrings(rec(c.groups)[g])])) as Record<ActorStateGroup, string[]>,
      count: floorCount(c.count),
      ttl: Object.fromEntries(Object.entries(c.ttl).map(([k, v]) => [k, floorCount(v)])),
    };
  }
  return { ok: true, state: { revision: Number(o.revision), actors } };
}

/** `zne`: actor record from a continuity state object (`cum_count`, `_continuity_turn`, `_continuity_expires`). */
export function actorStateFromContinuityRecord(value: unknown): ActorStateRecord {
  const t = rec(value);
  const expires = rec(rec(t._continuity_expires)[ACTOR_STATE_GROUPS[0]]);
  const turn = floorCount(t._continuity_turn);
  const groups = Object.fromEntries(
    ACTOR_STATE_GROUPS.map((g) => [
      g,
      uniqueStrings(t[g]).filter((v) => g !== ACTOR_STATE_GROUPS[0] || expires[v] === undefined || floorCount(expires[v]) >= turn),
    ]),
  ) as Record<ActorStateGroup, string[]>;
  return {
    groups,
    count: floorCount(t.cum_count),
    ttl: Object.fromEntries(
      Object.entries(expires).flatMap(([k, v]) =>
        groups[ACTOR_STATE_GROUPS[0]].includes(k) && floorCount(v) >= turn ? [[k, floorCount(v) - turn]] : [],
      ),
    ),
  };
}

/** `Lne`: write a state into per-actor continuity records (turn >= 1, expiry = turn + ttl). */
export function applyActorStateToContinuity(
  records: Readonly<Record<string, unknown>>,
  state: CurrentActorState,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = { ...(records as Record<string, Record<string, unknown>>) };
  for (const [key, actor] of Object.entries(state.actors)) {
    const current = rec(out[key]);
    const turn = Math.max(1, floorCount(current._continuity_turn));
    const expires: Record<string, unknown> = { ...rec(current._continuity_expires) };
    expires[ACTOR_STATE_GROUPS[0]] = Object.fromEntries(Object.entries(actor.ttl).map(([k, v]) => [k, turn + v]));
    out[key] = { ...current, ...actor.groups, cum_count: actor.count, _continuity_turn: turn, _continuity_expires: expires };
  }
  return out;
}

/** `Dne`: keep only the group values still present in `allowed`; the count drops by the removed locations. */
export function filterActorStateRecord(record: ActorStateRecord, allowed: Partial<Record<ActorStateGroup, readonly string[]>>): ActorStateRecord {
  const groups = Object.fromEntries(
    ACTOR_STATE_GROUPS.map((g) => [g, record.groups[g].filter((v) => allowed[g]?.includes(v))]),
  ) as Record<ActorStateGroup, string[]>;
  const kept = groups[ACTOR_STATE_GROUPS[0]];
  const removed = record.groups[ACTOR_STATE_GROUPS[0]].length - kept.length;
  return {
    groups,
    count: kept.length ? Math.max(0, record.count - removed) : 0,
    ttl: Object.fromEntries(Object.entries(record.ttl).filter(([k]) => kept.includes(k))),
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Generation journal (types + constants only; inert in Asset Maid, see spec pipeline §7)                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export const JOURNAL_VERSION = 1;
export const JOURNAL_MAX_ACTIVE_JOBS = 16;
export const JOURNAL_MAX_EVENTS_PER_JOB = 8;
export const JOURNAL_MAX_EVENTS = 128;
export const JOURNAL_MAX_SERIALIZED_CHARS = 131072;
export const JOURNAL_MAX_ERROR_MESSAGE_CHARS = 512;
export const JOURNAL_MAX_ID_CHARS = 256;
export const JOURNAL_MAX_SLOT_IDS = 39;
export const JOURNAL_FLUSH_DEBOUNCE_MS = 180;

export type JournalAttemptKind = "automatic" | GenerationOrigin;
export type JournalPhase = "planned" | "analyzing-preset" | "analyzing-modifiers" | "planning" | "generating" | "committing";
export type JournalJobStatus = "running" | "interrupted" | "failed";
export type JournalEventType =
  | "failed" | "cancelled" | "interrupted"
  | "retry-started" | "retry-completed" | "reroll-started" | "reroll-completed" | "regenerate-started" | "regenerate-completed";
export interface JournalError {
  code: string;
  message: string;
  retryable: boolean;
  provider?: string;
}
export interface JournalActiveJob {
  jobId: string;
  messageKey: string;
  messageId: string;
  messageIndex: number;
  revisionId: string;
  attemptKind: JournalAttemptKind;
  status: JournalJobStatus;
  phase: JournalPhase;
  requestedCount: number;
  completedSlotIds: string[];
  failedSlotIds: string[];
  updatedAt: number;
  error?: JournalError;
}
export interface JournalEvent {
  sequence: number;
  jobId: string;
  messageKey: string;
  messageId: string;
  messageIndex: number;
  revisionId: string;
  attemptKind: JournalAttemptKind;
  type: JournalEventType;
  phase: JournalPhase;
  occurredAt: number;
  error?: JournalError;
}
export interface GenerationJournal {
  version: 1;
  nextSequence: number;
  active: Record<string, JournalActiveJob>;
  events: JournalEvent[];
}
/** `Bne`. */
export function createEmptyJournal(): GenerationJournal {
  return { version: 1, nextSequence: 1, active: {}, events: [] };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Illustration plans (`wSt` 157635, `aO` 171093, `Z_e` 171193, `B1t` 171211, `U5` 171716, `fq` 171181)              */
/* ------------------------------------------------------------------------------------------------------------------ */

export type IllustrationPlanStatus = "idle" | "generating" | "complete" | "error";
export interface IllustrationPlanSlot {
  slotId: string;
  sourceImageToken: string;
  index: number;
  beforeText: string;
  afterText: string;
}
/** `F1t`: the selected entry of one slot. */
export interface IllustrationPlanEntry {
  slotId: string;
  sourceImageToken: string;
  slotIndex: number;
  assetName: string;
  savedPath?: string;
  extension?: string;
  entryId: string;
  width?: number;
  height?: number;
  generationOrigin?: GenerationOrigin;
  parentEntryId?: string;
}
/** `K1t`. */
export interface IllustrationPlanAssetHint {
  occurrenceId: string;
  tokenName: string;
  characterName: string;
  sourceMarkup: string;
  markupType: string;
  detectorName: string;
  sourceOffset: number;
}
export interface IllustrationPlanRevision {
  revisionId: string;
  deletedSlotIndices?: number[];
  parentRevisionId: string;
  requestedCount: number;
  status: HistoryRevisionStatus;
  entries: IllustrationPlanEntry[];
  error: string;
  createdAt: number;
}
export interface IllustrationPlan {
  /** `illustration:<HistoryMessageId>`. */
  key: string;
  chatKey?: string;
  /** Risu location fields kept for shape parity; -1 when unknown in Lumiverse. */
  characterIndex: number;
  chatIndex: number;
  messageIndex: number;
  messageId: HistoryMessageId;
  countPolicy: CountPolicy;
  requestedCount: number;
  status: IllustrationPlanStatus;
  slots: IllustrationPlanSlot[];
  entries: IllustrationPlanEntry[];
  assetHints: IllustrationPlanAssetHint[];
  nativeAssetSuppressed: boolean;
  revisions: IllustrationPlanRevision[];
  activeRevisionId: string;
  error: string;
  updatedAt: number;
}

/** `wSt`: default plan for a message (`count` = count policy input, default fixed 1). */
export function createIllustrationPlan(
  input: { messageId: HistoryMessageId; messageIndex: number; characterIndex?: number; chatIndex?: number },
  count: unknown = 1,
  now: number = Date.now(),
): IllustrationPlan {
  const policy = normalizeCountPolicy(count);
  return {
    key: illustrationMessageKey(input.messageId),
    characterIndex: input.characterIndex ?? -1,
    chatIndex: input.chatIndex ?? -1,
    messageIndex: input.messageIndex,
    messageId: text(input.messageId),
    countPolicy: policy,
    requestedCount: normalizeRequestedCount(policy.max),
    status: "idle",
    slots: [],
    entries: [],
    assetHints: [],
    nativeAssetSuppressed: false,
    revisions: [],
    activeRevisionId: "",
    error: "",
    updatedAt: now,
  };
}

/** `U5`: attempt kind of the next manual run. */
export function nextIllustrationAttempt(plan: Pick<IllustrationPlan, "status" | "entries" | "revisions">): "retry" | "reroll" | "initial" {
  return plan.status === "error"
    ? "retry"
    : plan.entries.length > 0 || plan.revisions.some((r) => r.entries.length > 0 || !!r.deletedSlotIndices?.length)
      ? "reroll"
      : "initial";
}

/** `Z_e`: workflow stored in the History tree for a plan (asset hints de-duplicated by offset+markup). */
export function workflowFromPlan(plan: IllustrationPlan): IllustrationWorkflow {
  const hints = [
    ...new Map(
      plan.assetHints.flatMap((h) => {
        const markup = String(h.sourceMarkup ?? "");
        const offset = Math.max(0, Math.round(Number(h.sourceOffset) || 0));
        return markup ? [[`${offset}:${markup}`, { sourceMarkup: markup, sourceOffset: offset }] as const] : [];
      }),
    ).values(),
  ];
  return {
    countPolicy: { ...plan.countPolicy, ...(plan.countPolicy.values ? { values: { ...plan.countPolicy.values } } : {}) },
    requestedCount: plan.requestedCount,
    nativeAssetSuppressed: plan.nativeAssetSuppressed,
    assetHints: hints,
    lastError: plan.status === "error" ? plan.error : "",
  };
}

/** `B1t`: plans worth persisting into the tree (message still live, and something to keep). */
export function workflowSyncInputs(
  plans: readonly IllustrationPlan[],
  tree: HistoryTree,
  liveMessageIds: ReadonlySet<string>,
): IllustrationWorkflowSyncInput[] {
  return plans.flatMap((p) =>
    !p.messageId || !liveMessageIds.has(p.messageId)
      ? []
      : tree.messagesByKey[p.key] ||
          p.revisions.length ||
          p.entries.length ||
          p.nativeAssetSuppressed ||
          (p.status === "idle" && p.slots.length) ||
          (p.status === "error" && p.slots.length)
        ? [{ messageKey: p.key, messageId: p.messageId, messageIndex: p.messageIndex, workflow: workflowFromPlan(p) }]
        : [],
  );
}

function planEntry(slotId: string, slotIndex: number, e: HistoryTree["entriesById"][string]): IllustrationPlanEntry {
  return {
    slotId,
    sourceImageToken: `slot:${slotId}`,
    slotIndex,
    assetName: e.assetName,
    ...(e.savedPath ? { savedPath: e.savedPath, extension: e.extension as string } : {}),
    entryId: e.entryId,
    ...(e.width > 0 ? { width: e.width } : {}),
    ...(e.height > 0 ? { height: e.height } : {}),
    ...(e.generationOrigin ? { generationOrigin: e.generationOrigin } : {}),
    ...(e.parentEntryId ? { parentEntryId: e.parentEntryId } : {}),
  };
}

/** `aO`: illustration plans derived from the tree (ordered by messageIndex, then key). */
export function plansFromHistoryTree(
  tree: HistoryTree,
  location: { characterIndex: number; chatIndex: number } = { characterIndex: -1, chatIndex: -1 },
): IllustrationPlan[] {
  return Object.values(tree.messagesByKey)
    .filter((m) => m.mode === "illustration")
    .sort((a, b) => a.messageIndex - b.messageIndex || a.messageKey.localeCompare(b.messageKey))
    .map((m) => {
      if (m.mode !== "illustration") throw new Error("unreachable");
      const slots = Object.values(tree.slotsById)
        .filter((s) => s.messageKey === m.messageKey)
        .sort((a, b) => a.slotIndex - b.slotIndex || a.slotId.localeCompare(b.slotId))
        .map((s) => ({ slotId: s.slotId, sourceImageToken: `slot:${s.slotId}`, index: s.slotIndex, beforeText: "", afterText: "" }));
      const revisions: IllustrationPlanRevision[] = m.revisions.map((r) => ({
        revisionId: r.revisionId,
        ...(r.deletedSlotIndices?.length ? { deletedSlotIndices: [...r.deletedSlotIndices] } : {}),
        parentRevisionId: r.parentRevisionId,
        requestedCount: r.requestedCount ?? m.workflow.requestedCount,
        status: r.status,
        entries: listRevisionSlots(tree, m.messageKey, r.revisionId).map((c) => planEntry(c.slot.slotId, c.slot.slotIndex, c.defaultEntry)),
        error: r.error ?? "",
        createdAt: r.createdAt,
      }));
      const active = revisions.find((r) => r.revisionId === m.activeRevisionId);
      const error = m.workflow.lastError || active?.error || "";
      return {
        key: m.messageKey,
        characterIndex: location.characterIndex,
        chatIndex: location.chatIndex,
        messageIndex: m.messageIndex,
        messageId: m.messageId,
        countPolicy: { ...m.workflow.countPolicy, ...(m.workflow.countPolicy.values ? { values: { ...m.workflow.countPolicy.values } } : {}) },
        requestedCount: m.workflow.requestedCount,
        status: error || active?.status === "error" ? "error" : active ? "complete" : "idle",
        slots,
        entries: active?.entries.map((e) => ({ ...e })) ?? [],
        assetHints: m.workflow.assetHints.map((h, i) => ({
          occurrenceId: `${m.messageKey}:asset-hint:${i}`,
          tokenName: "",
          characterName: "",
          sourceMarkup: h.sourceMarkup,
          markupType: "",
          detectorName: "",
          sourceOffset: h.sourceOffset,
        })),
        nativeAssetSuppressed: m.workflow.nativeAssetSuppressed,
        revisions,
        activeRevisionId: m.activeRevisionId,
        error,
        updatedAt: Math.max(0, ...revisions.map((r) => r.createdAt)),
      };
    });
}

function planFingerprint(p: Pick<IllustrationPlan, "activeRevisionId" | "revisions">): string {
  return [
    p.activeRevisionId,
    p.revisions.map((r) =>
      [
        r.revisionId,
        r.parentRevisionId,
        r.status,
        r.requestedCount,
        r.deletedSlotIndices?.join(",") ?? "",
        r.error,
        r.entries
          .map((e) => [e.slotId, e.entryId, e.assetName, e.savedPath ?? "", e.extension ?? "", e.generationOrigin ?? "", e.parentEntryId ?? ""].join(":"))
          .join(","),
      ].join("|"),
    ),
  ].join("\n");
}

/** `fq` (+ `$1t`): refresh a plan's entries/revisions/active revision from the tree (same object if unchanged). */
export function reconcilePlanWithTree(plan: IllustrationPlan, tree: HistoryTree): IllustrationPlan {
  const fromTree = plansFromHistoryTree(tree, { characterIndex: plan.characterIndex, chatIndex: plan.chatIndex }).find((p) => p.key === plan.key);
  const activeRevisionId = fromTree?.activeRevisionId ?? "";
  const slots = plan.slots.length ? plan.slots : (fromTree?.slots ?? []);
  const byIndex = new Map(slots.map((s) => [s.index, s]));
  const remap = (entries: IllustrationPlanEntry[]): IllustrationPlanEntry[] =>
    entries.map((e) => {
      const s = byIndex.get(e.slotIndex);
      return s ? { ...e, sourceImageToken: s.sourceImageToken } : { ...e };
    });
  const next: IllustrationPlan = {
    ...plan,
    slots: slots.map((s) => ({ ...s })),
    entries: remap(fromTree?.entries ?? []),
    revisions: (fromTree?.revisions ?? []).map((r) => ({ ...r, entries: remap(r.entries) })),
    activeRevisionId,
  };
  return planFingerprint(next) === planFingerprint(plan) ? plan : next;
}

const PLAN_STATUSES = new Set<IllustrationPlanStatus>(["idle", "generating", "complete", "error"]);

/** Lenient plan normalizer for persisted plans (unknown status -> "idle"; numbers clamped; arrays defaulted). */
export function normalizeIllustrationPlan(value: unknown, key: string): IllustrationPlan | null {
  if (!isRecord(value)) return null;
  const messageId = text(value.messageId);
  if (!messageId || text(value.key) !== key || key !== `illustration:${messageId}`) return null;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v.filter(isRecord) as unknown as T[]) : []);
  const int = (v: unknown, fallback: number): number => (Number.isSafeInteger(v) ? (v as number) : fallback);
  const status = PLAN_STATUSES.has(value.status as IllustrationPlanStatus) ? (value.status as IllustrationPlanStatus) : "idle";
  return {
    key,
    ...(typeof value.chatKey === "string" && value.chatKey ? { chatKey: value.chatKey } : {}),
    characterIndex: int(value.characterIndex, -1),
    chatIndex: int(value.chatIndex, -1),
    messageIndex: int(value.messageIndex, -1),
    messageId,
    countPolicy: normalizeCountPolicy(value.countPolicy),
    requestedCount: normalizeRequestedCount(value.requestedCount),
    status,
    slots: arr<IllustrationPlanSlot>(value.slots),
    entries: arr<IllustrationPlanEntry>(value.entries),
    assetHints: arr<IllustrationPlanAssetHint>(value.assetHints),
    nativeAssetSuppressed: value.nativeAssetSuppressed === true,
    revisions: arr<IllustrationPlanRevision>(value.revisions).map((r) => ({ ...r, entries: arr<IllustrationPlanEntry>(r.entries) })),
    activeRevisionId: typeof value.activeRevisionId === "string" ? value.activeRevisionId : "",
    error: typeof value.error === "string" ? value.error : "",
    updatedAt: Number.isFinite(value.updatedAt) ? Math.max(0, Number(value.updatedAt)) : 0,
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lumiverse per-chat document                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export const CHAT_DATA_SCHEMA = "inlay-illustrator.chat-data";
export const CHAT_DATA_VERSION = 1;

/**
 * One document per chat (userStorage `chats/<chatId>/chat-data.json`).
 * - `store`: Asset Maid durable chat store; message keys are `HistoryMessageId`s. Keeps `sources`, continuity, jobs.
 * - `history`: the Image History tree persisted directly (port fix: entry ids, origins, parent entries, chosen
 *   defaults, asset hints and range count policies are durable). `store` is kept in sync with `foldTreeIntoStore`.
 * - `plans`: illustration plans keyed by `illustration:<HistoryMessageId>`.
 * - `actorState`: current actor state (`asset-maid:current-actor-state`).
 */
export interface ChatDataDocument {
  schema: typeof CHAT_DATA_SCHEMA;
  version: typeof CHAT_DATA_VERSION;
  chatId: string;
  updatedAt: string;
  store: ChatStore;
  history: HistoryTree;
  plans: Record<string, IllustrationPlan>;
  actorState: CurrentActorState;
}

export interface ChatDataIssue {
  /** Document part that the issue belongs to. */
  part: "document" | "store" | "history" | "plans" | "actorState";
  code: string;
  path: string;
  message: string;
}

export function createEmptyChatData(chatId: string, now: string = new Date().toISOString()): ChatDataDocument {
  return {
    schema: CHAT_DATA_SCHEMA,
    version: CHAT_DATA_VERSION,
    chatId: text(chatId),
    updatedAt: now,
    store: createEmptyChatStore(),
    history: createEmptyHistoryTree(chatKeyForChat(chatId)),
    plans: {},
    actorState: createEmptyActorState(),
  };
}

const fromHistoryIssue = (i: HistoryIssue): ChatDataIssue => ({ part: "history", code: i.code, path: i.path, message: i.message });
const fromStoreIssue = (part: ChatDataIssue["part"]) => (i: ChatStoreIssue): ChatDataIssue => ({ part, ...i });

function messageIdIssues(store: ChatStore | null, history: HistoryTree | null): ChatDataIssue[] {
  const out: ChatDataIssue[] = [];
  if (store)
    for (const id of Object.keys(store.messages))
      if (!parseHistoryMessageId(id))
        out.push({ part: "store", code: "message-id-swipe", path: `$.messages.${id}`, message: "Message keys must be <messageId>@<swipeIndex>." });
  if (history)
    for (const [key, m] of Object.entries(history.messagesByKey))
      if (!parseHistoryMessageId(m.messageId))
        out.push({ part: "history", code: "message-id-swipe", path: `$.messagesByKey.${key}.messageId`, message: "messageId must be <messageId>@<swipeIndex>." });
  return out;
}

interface CheckedParts {
  issues: ChatDataIssue[];
  store: ChatStore | null;
  history: HistoryTree | null;
  plans: Record<string, IllustrationPlan>;
  plansValid: boolean;
  actorState: CurrentActorState | null;
}

function checkParts(raw: Record<string, unknown>, chatId: string): CheckedParts {
  const issues: ChatDataIssue[] = [];
  const s = validateChatStore(raw.store);
  if (!s.ok) issues.push(...s.issues.map(fromStoreIssue("store")));
  let store = s.ok ? s.store : null;
  const hIssues = listHistoryTreeIssues(raw.history);
  let history = hIssues.length ? null : canonicalizeHistoryTree(raw.history as HistoryTree);
  issues.push(...hIssues.map(fromHistoryIssue));
  if (history && history.chatKey !== chatKeyForChat(chatId)) {
    issues.push({ part: "history", code: "chat-key", path: "$.chatKey", message: `chatKey must be ${chatKeyForChat(chatId)}.` });
    history = null;
  }
  const idIssues = messageIdIssues(store, history);
  issues.push(...idIssues);
  if (idIssues.some((i) => i.part === "store")) store = null;
  if (idIssues.some((i) => i.part === "history")) history = null;
  const plans: Record<string, IllustrationPlan> = {};
  let plansValid = true;
  if (!isRecord(raw.plans)) {
    plansValid = false;
    issues.push({ part: "plans", code: "plans-record", path: "$.plans", message: "plans must be an object." });
  } else
    for (const [key, value] of Object.entries(raw.plans)) {
      const plan = normalizeIllustrationPlan(value, key);
      if (plan) plans[key] = plan;
      else {
        plansValid = false;
        issues.push({ part: "plans", code: "plan-invalid", path: `$.plans.${key}`, message: "Plan key/messageId mismatch or not an object." });
      }
    }
  const a = validateCurrentActorState(raw.actorState);
  if (!a.ok) issues.push(...a.issues.map(fromStoreIssue("actorState")));
  return { issues, store, history, plans, plansValid, actorState: a.ok ? a.state : null };
}

export type ChatDataValidationResult = { ok: true; data: ChatDataDocument } | { ok: false; issues: ChatDataIssue[] };

/** Strict validation (no repair). On success returns the normalized document. */
export function validateChatData(value: unknown, chatId?: string): ChatDataValidationResult {
  if (!isRecord(value)) return { ok: false, issues: [{ part: "document", code: "document-record", path: "$", message: "The chat data document must be an object." }] };
  const issues: ChatDataIssue[] = [];
  if (value.schema !== CHAT_DATA_SCHEMA) issues.push({ part: "document", code: "schema", path: "$.schema", message: `schema must be ${CHAT_DATA_SCHEMA}.` });
  if (value.version !== CHAT_DATA_VERSION) issues.push({ part: "document", code: "version", path: "$.version", message: `version must be ${CHAT_DATA_VERSION}.` });
  const id = typeof value.chatId === "string" ? value.chatId.trim() : "";
  if (!id || (chatId !== undefined && id !== chatId))
    issues.push({ part: "document", code: "chat-id", path: "$.chatId", message: "chatId must match the chat that owns the document." });
  if (typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt)))
    issues.push({ part: "document", code: "updated-at", path: "$.updatedAt", message: "updatedAt must be an ISO date string." });
  const extra = Object.keys(value).filter((k) => !["schema", "version", "chatId", "updatedAt", "store", "history", "plans", "actorState"].includes(k));
  for (const k of extra) issues.push({ part: "document", code: "unexpected-field", path: `$.${k}`, message: "Unknown document field." });
  if (!id) return { ok: false, issues };
  const parts = checkParts(value, id);
  issues.push(...parts.issues);
  if (issues.length || !parts.store || !parts.history || !parts.actorState) return { ok: false, issues };
  return {
    ok: true,
    data: {
      schema: CHAT_DATA_SCHEMA,
      version: CHAT_DATA_VERSION,
      chatId: id,
      updatedAt: value.updatedAt as string,
      store: parts.store,
      history: parts.history,
      plans: parts.plans,
      actorState: parts.actorState,
    },
  };
}

export interface NormalizedChatData {
  data: ChatDataDocument;
  issues: ChatDataIssue[];
  /** True when any part was reset or rebuilt (the caller should write the document back). */
  repaired: boolean;
}

/**
 * Lenient load: every invalid part is reset to its empty value and reported. If the history is invalid but the
 * store is valid, the history is rebuilt from the store with `projectStoreToTree` (Asset Maid's projection; lossy).
 * A document of another schema/version, or not an object, becomes an empty document.
 */
export function normalizeChatData(value: unknown, chatId: string, now: string = new Date().toISOString()): NormalizedChatData {
  const id = text(chatId);
  if (value === undefined || value === null) return { data: createEmptyChatData(id, now), issues: [], repaired: false };
  if (!isRecord(value) || value.schema !== CHAT_DATA_SCHEMA || value.version !== CHAT_DATA_VERSION)
    return {
      data: createEmptyChatData(id, now),
      issues: [{ part: "document", code: "document-reset", path: "$", message: "Unknown chat data document; it was reset." }],
      repaired: true,
    };
  const issues: ChatDataIssue[] = [];
  if (text(value.chatId) !== id)
    issues.push({ part: "document", code: "chat-id", path: "$.chatId", message: "chatId did not match the owning chat; it was replaced." });
  const updatedAt = typeof value.updatedAt === "string" && !Number.isNaN(Date.parse(value.updatedAt)) ? value.updatedAt : now;
  if (updatedAt !== value.updatedAt) issues.push({ part: "document", code: "updated-at", path: "$.updatedAt", message: "updatedAt was reset." });
  const parts = checkParts(value, id);
  issues.push(...parts.issues);
  const store = parts.store ?? createEmptyChatStore();
  let history = parts.history;
  if (!history) {
    const chatKey = chatKeyForChat(id);
    if (parts.store && Object.keys(parts.store.messages).length) {
      try {
        history = projectStoreToTree(parts.store, chatKey);
        issues.push({ part: "history", code: "history-rebuilt", path: "$", message: "History was rebuilt from the chat store (lossy projection)." });
      } catch (error) {
        issues.push({ part: "history", code: "history-reset", path: "$", message: `History could not be rebuilt: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
    history ??= createEmptyHistoryTree(chatKey);
  }
  return {
    data: {
      schema: CHAT_DATA_SCHEMA,
      version: CHAT_DATA_VERSION,
      chatId: id,
      updatedAt,
      store,
      history,
      plans: parts.plans,
      actorState: parts.actorState ?? createEmptyActorState(),
    },
    issues,
    repaired: issues.length > 0,
  };
}
