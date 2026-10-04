/**
 * Image History tree: a pure port of Asset Maid 0.9.88 (AssetMaid.pretty.js 52910-54415).
 *
 * - Schema, field sets and invariants: `hBe` validator (same issue codes and paths; Korean text kept as `messageKo`).
 * - Commands: `Zne` reducer + `PR` cleanup + `CR` 99-cap pruning.
 * - Controller updaters (`commitRevision`, `syncIllustrationWorkflowsAt`, `appendGenerated`) as pure functions.
 * - Projections `NR` (chat store -> tree) and `lK` (tree -> chat store).
 *
 * No host calls, no runtime dependencies. Parity fixtures: ./fixtures/history/*.json (generated from the original code).
 */
import type { ChatStore, ChatStoreGeneration, ChatStoreImage, ChatStoreMessage, CountPolicy } from "./chat.js";

/* ------------------------------------------------------------------------------------------------------------------ */
/* Count policy: public helpers live in chat.ts; this private `qf` copy avoids a runtime import cycle.                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** `Fa`. */
const COUNT_MAX = Number.MAX_SAFE_INTEGER;

/** `qf` (same as chat.ts `fixedCountPolicy`; used by the store projection). */
function fixedPolicy(count: unknown): CountPolicy {
  const n0 = Number(count);
  const n = Math.min(COUNT_MAX, Math.max(1, Number.isFinite(n0) ? Math.round(n0) : 1));
  const hi = n < COUNT_MAX ? n + 1 : n;
  const lo = n < COUNT_MAX ? n : n - 1;
  return { mode: "fixed", min: n, max: n, values: { fixed: n, min: lo, max: hi } };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Schema                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

export const MAX_GENERATED_ENTRIES_PER_SLOT = 99;
export const HISTORY_ENTRY_SIZE_MAX = 8192;
export const HISTORY_SAVED_PATH_MAX = 4096;

export type HistoryMessageMode = "chat" | "illustration";
export type HistoryEntryKind = "original" | "generated";
/** Stored entry origins. Journal attempt kind "automatic" maps to "initial". */
export type GenerationOrigin = "initial" | "retry" | "reroll" | "regenerate";
export const GENERATION_ORIGINS: readonly GenerationOrigin[] = ["initial", "retry", "reroll", "regenerate"];
export type HistoryRevisionStatus = "complete" | "error";

export interface HistoryEntry {
  entryId: string;
  slotId: string;
  kind: HistoryEntryKind;
  assetName: string;
  savedPath?: string;
  extension?: string;
  createdAt: number;
  width: number;
  height: number;
  generationOrigin?: GenerationOrigin;
  parentEntryId?: string;
}
export interface HistorySlot {
  slotId: string;
  messageKey: string;
  slotIndex: number;
}
export interface HistoryAssetHint {
  sourceMarkup: string;
  sourceOffset: number;
}
export interface IllustrationWorkflow {
  countPolicy: CountPolicy;
  requestedCount: number;
  nativeAssetSuppressed: boolean;
  assetHints: HistoryAssetHint[];
  lastError: string;
}
export interface HistoryRevisionSlot {
  entryIds: string[];
  defaultEntryId: string;
}
export interface HistoryRevision {
  revisionId: string;
  parentRevisionId: string;
  status: HistoryRevisionStatus;
  requestedCount?: number;
  error?: string;
  createdAt: number;
  slotsById: Record<string, HistoryRevisionSlot>;
  deletedSlotIndices?: number[];
}
interface HistoryMessageBase {
  messageKey: string;
  messageId: string;
  messageIndex: number;
  activeRevisionId: string;
  revisions: HistoryRevision[];
}
export interface HistoryChatMessage extends HistoryMessageBase {
  mode: "chat";
  workflow?: undefined;
}
export interface HistoryIllustrationMessage extends HistoryMessageBase {
  mode: "illustration";
  workflow: IllustrationWorkflow;
}
export type HistoryMessage = HistoryChatMessage | HistoryIllustrationMessage;
export interface HistoryTree {
  chatKey: string;
  entriesById: Record<string, HistoryEntry>;
  slotsById: Record<string, HistorySlot>;
  messagesByKey: Record<string, HistoryMessage>;
}

export const HISTORY_TREE_FIELDS = ["chatKey", "entriesById", "slotsById", "messagesByKey"] as const;
export const HISTORY_ENTRY_FIELDS = [
  "entryId", "slotId", "kind", "assetName", "savedPath", "extension", "createdAt", "width", "height", "generationOrigin", "parentEntryId",
] as const;
export const HISTORY_SLOT_FIELDS = ["slotId", "messageKey", "slotIndex"] as const;
export const HISTORY_MESSAGE_FIELDS = ["messageKey", "messageId", "messageIndex", "mode", "activeRevisionId", "workflow", "revisions"] as const;
export const ILLUSTRATION_WORKFLOW_FIELDS = ["countPolicy", "requestedCount", "nativeAssetSuppressed", "assetHints", "lastError"] as const;
export const COUNT_POLICY_FIELDS = ["mode", "min", "max", "values"] as const;
export const COUNT_POLICY_VALUES_FIELDS = ["fixed", "min", "max"] as const;
export const ASSET_HINT_FIELDS = ["sourceMarkup", "sourceOffset"] as const;
export const HISTORY_REVISION_FIELDS = [
  "revisionId", "parentRevisionId", "status", "requestedCount", "error", "createdAt", "slotsById", "deletedSlotIndices",
] as const;
export const HISTORY_REVISION_SLOT_FIELDS = ["entryIds", "defaultEntryId"] as const;

const TREE_FIELD_SET = new Set<string>(HISTORY_TREE_FIELDS);
const ENTRY_FIELD_SET = new Set<string>(HISTORY_ENTRY_FIELDS);
const SLOT_FIELD_SET = new Set<string>(HISTORY_SLOT_FIELDS);
const MESSAGE_FIELD_SET = new Set<string>(HISTORY_MESSAGE_FIELDS);
const WORKFLOW_FIELD_SET = new Set<string>(ILLUSTRATION_WORKFLOW_FIELDS);
const COUNT_POLICY_FIELD_SET = new Set<string>(COUNT_POLICY_FIELDS);
const COUNT_VALUES_FIELD_SET = new Set<string>(COUNT_POLICY_VALUES_FIELDS);
const ASSET_HINT_FIELD_SET = new Set<string>(ASSET_HINT_FIELDS);
const REVISION_FIELD_SET = new Set<string>(HISTORY_REVISION_FIELDS);
const REVISION_SLOT_FIELD_SET = new Set<string>(HISTORY_REVISION_SLOT_FIELDS);

/** `cBe`: assetName must not be a URL. */
export const ASSET_NAME_FORBIDDEN_URL = /^(?:blob|data|https?):/iu;
/** `lBe`: assetName must not contain raw-token / HTML characters. */
export const ASSET_NAME_FORBIDDEN_CHARS = /[{}<>"']/u;
/** `dBe` / `Z2e`: savedPath must be a host asset key (no URL, no markup, no control chars). */
export const SAVED_PATH_FORBIDDEN = /^(?:blob|data|https?):|[{}<>"'\u0000-\u001f\u007f]/iu;
/** `uBe` / `J2e`: file extension without a dot. */
export const ASSET_EXTENSION_PATTERN = /^[a-z0-9]{1,16}$/u;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Issues                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const ISSUE_TEXT = {
  "unexpected-field": { en: "Field is not defined in the persisted History schema.", ko: "History 영속 스키마에 정의되지 않은 필드입니다." },
  "required-string": { en: "Must be a non-empty string.", ko: "비어 있지 않은 문자열이어야 합니다." },
  "string": { en: "Must be a string.", ko: "문자열이어야 합니다." },
  "count-policy-record": { en: "Must be an object.", ko: "객체여야 합니다." },
  "count-policy-mode": { en: "Must be fixed or range.", ko: "fixed 또는 range여야 합니다." },
  "count-policy-count": { en: "Must be an integer from 1 to 9007199254740991.", ko: "1~9007199254740991 정수여야 합니다." },
  "count-policy-range": { en: "min cannot be greater than max.", ko: "min은 max보다 클 수 없습니다." },
  "count-values-record": { en: "Must be an object.", ko: "객체여야 합니다." },
  "count-values-count": { en: "Must be an integer from 1 to 9007199254740991.", ko: "1~9007199254740991 정수여야 합니다." },
  "workflow-record": { en: "Illustration messages require a workflow object.", ko: "삽화 메시지에는 workflow 객체가 필요합니다." },
  "workflow-requested-count": { en: "Must be an integer from 1 to 9007199254740991.", ko: "1~9007199254740991 정수여야 합니다." },
  "workflow-native-suppressed": { en: "Must be a boolean.", ko: "boolean이어야 합니다." },
  "workflow-asset-hints": { en: "Must be an array.", ko: "배열이어야 합니다." },
  "asset-hint-record": { en: "Must be an object.", ko: "객체여야 합니다." },
  "asset-hint-offset": { en: "Must be a safe integer of 0 or more.", ko: "0 이상의 안전한 정수여야 합니다." },
  "tree-record": { en: "The History tree must be an object.", ko: "History Tree는 객체여야 합니다." },
  "entries-record": { en: "Must be an object.", ko: "객체여야 합니다." },
  "slots-record": { en: "Must be an object.", ko: "객체여야 합니다." },
  "messages-record": { en: "Must be an object.", ko: "객체여야 합니다." },
  "entry-record": { en: "An entry must be an object.", ko: "엔트리는 객체여야 합니다." },
  "entry-key": { en: "entryId must match its entriesById key.", ko: "entriesById 키와 entryId가 일치해야 합니다." },
  "entry-kind": { en: "Must be original or generated.", ko: "original 또는 generated여야 합니다." },
  "entry-generation-origin": { en: "Must be initial, retry, reroll or regenerate.", ko: "initial, retry, reroll 또는 regenerate여야 합니다." },
  "entry-parent-entry-id": { en: "parentEntryId must be a non-empty string.", ko: "parentEntryId는 비어 있지 않은 문자열이어야 합니다." },
  "original-entry-generation-metadata": { en: "An original entry cannot have generation-only fields.", ko: "original 엔트리는 생성 전용 필드를 가질 수 없습니다." },
  "entry-asset-location-pair": { en: "savedPath and extension must be stored together.", ko: "savedPath와 extension은 함께 저장해야 합니다." },
  "entry-saved-path": { en: "savedPath can only hold a non-empty host asset key.", ko: "savedPath에는 비어 있지 않은 host asset key만 저장할 수 있습니다." },
  "entry-extension": { en: "extension must be lowercase alphanumeric without a dot.", ko: "extension은 점이 없는 소문자 영숫자여야 합니다." },
  "asset-reference": { en: "assetName cannot hold a URL, a raw token or HTML.", ko: "assetName에는 URL, raw 토큰 또는 HTML을 저장할 수 없습니다." },
  "entry-created-at": { en: "Must be a safe integer of 0 or more.", ko: "0 이상의 안전한 정수여야 합니다." },
  "entry-size": { en: "width/height must be integers from 0 to 8192.", ko: "width/height는 0~8192 정수여야 합니다." },
  "slot-record": { en: "A slot must be an object.", ko: "슬롯은 객체여야 합니다." },
  "slot-key": { en: "slotId must match its slotsById key.", ko: "slotsById 키와 slotId가 일치해야 합니다." },
  "slot-index": { en: "Must be a safe integer of 0 or more.", ko: "0 이상의 안전한 정수여야 합니다." },
  "slot-index-duplicate": { en: "slotIndex must be unique within a message.", ko: "같은 메시지 안에서 slotIndex는 고유해야 합니다." },
  "message-record": { en: "A message must be an object.", ko: "메시지는 객체여야 합니다." },
  "message-id-format": { en: "Only the real stable message id can be stored.", ko: "RisuAI 메시지의 실제 안정 ID만 저장할 수 있습니다." },
  "message-key": { en: "messageKey must match its messagesByKey key.", ko: "messagesByKey 키와 messageKey가 일치해야 합니다." },
  "message-index": { en: "Must be a safe integer of -1 or more.", ko: "-1 이상의 안전한 정수여야 합니다." },
  "chat-workflow": { en: "A chat message cannot store an illustration workflow.", ko: "chat 메시지에는 illustration workflow를 저장할 수 없습니다." },
  "message-mode": { en: "Must be chat or illustration.", ko: "chat 또는 illustration이어야 합니다." },
  "message-identity": { en: "messageKey must be derived from the stable messageId.", ko: "messageKey는 안정적인 messageId에서 만들어져야 합니다." },
  "revisions-array": { en: "Must be an array.", ko: "배열이어야 합니다." },
  "revision-record": { en: "A revision must be an object.", ko: "revision은 객체여야 합니다." },
  "revision-duplicate": { en: "revisionId must be unique within a message.", ko: "같은 메시지 안에서 revisionId는 고유해야 합니다." },
  "revision-root-parent": { en: "The first revision cannot have a parent.", ko: "첫 revision에는 부모가 없어야 합니다." },
  "revision-parent": { en: "Must point to an earlier revision of the same message.", ko: "앞에서 선언된 같은 메시지 revision을 가리켜야 합니다." },
  "revision-status": { en: "Must be complete or error.", ko: "complete 또는 error여야 합니다." },
  "revision-created-at": { en: "Must be a safe integer of 0 or more.", ko: "0 이상의 안전한 정수여야 합니다." },
  "revision-requested-count": { en: "An illustration revision requires a requestedCount from 1 to 9007199254740991.", ko: "삽화 revision에는 1~9007199254740991 requestedCount가 필요합니다." },
  "chat-revision-workflow": { en: "A chat revision cannot store illustration attempt results.", ko: "chat revision에는 삽화 시도 결과를 저장할 수 없습니다." },
  "deleted-slots": { en: "Deleted slots must be unique ascending positions that do not overlap live slots.", ko: "삭제 슬롯은 중복 없는 오름차순 위치이며 살아 있는 슬롯과 겹칠 수 없습니다." },
  "revision-slots": { en: "A committed revision requires at least one slot.", ko: "커밋된 revision에는 최소 하나의 슬롯이 필요합니다." },
  "revision-slot-record": { en: "Must be an object.", ko: "객체여야 합니다." },
  "revision-slot-owner": { en: "Must be a slot owned by the same message.", ko: "같은 메시지가 소유한 슬롯이어야 합니다." },
  "revision-entry-ids": { en: "Must be a non-empty array.", ko: "비어 있지 않은 배열이어야 합니다." },
  "revision-entry-duplicate": { en: "Duplicate entryId.", ko: "중복 entryId가 있습니다." },
  "revision-default-entry": { en: "Must point to an entry inside entryIds.", ko: "entryIds 안의 엔트리를 가리켜야 합니다." },
  "revision-entry-owner": { en: "Can only reference entries of the same slot.", ko: "같은 슬롯에 속한 엔트리만 참조할 수 있습니다." },
  "revision-entry-order": { en: "Must be ordered original first, then by creation time.", ko: "original 우선, 생성 시각 순으로 정렬되어야 합니다." },
  "active-revision": { en: "Must point to an existing revision.", ko: "존재하는 revision을 가리켜야 합니다." },
  "empty-active-revision": { en: "Must be empty when there are no revisions.", ko: "revision이 없으면 비어 있어야 합니다." },
  "slot-message": { en: "Must point to an existing message.", ko: "존재하는 메시지를 가리켜야 합니다." },
  "slot-orphan": { en: "Must be referenced by at least one revision.", ko: "최소 하나의 revision에서 참조되어야 합니다." },
  "chat-original": { en: "A chat slot requires exactly one original entry.", ko: "chat 슬롯에는 original 엔트리가 정확히 하나 필요합니다." },
  "illustration-original": { en: "An illustration slot cannot have an original entry.", ko: "삽화 슬롯은 original 엔트리를 가질 수 없습니다." },
  "generated-entry-cap": { en: "A slot can hold at most 99 generated entries.", ko: "generated 엔트리는 슬롯당 최대 99개입니다." },
  "entry-slot": { en: "Must point to an existing slot.", ko: "존재하는 슬롯을 가리켜야 합니다." },
  "entry-orphan": { en: "Must be referenced by at least one revision.", ko: "최소 하나의 revision에서 참조되어야 합니다." },
} as const;

export type HistoryIssueCode = keyof typeof ISSUE_TEXT;
/** All 69 validator issue codes (history-validation-issues.json). */
export const HISTORY_ISSUE_CODES = Object.keys(ISSUE_TEXT) as HistoryIssueCode[];

export interface HistoryIssue {
  code: HistoryIssueCode;
  /** JSONPath-like location, same format as Asset Maid (`$.messagesByKey.<key>.revisions[0].status`). */
  path: string;
  /** English message. */
  message: string;
  /** Original Asset Maid message (Korean). */
  messageKo: string;
}

function issue(code: HistoryIssueCode, path: string): HistoryIssue {
  return { code, path, message: ISSUE_TEXT[code].en, messageKo: ISSUE_TEXT[code].ko };
}

/** `Z9e` ImageHistoryInvariantError. */
export class HistoryInvariantError extends Error {
  readonly issues: HistoryIssue[];
  constructor(issues: HistoryIssue[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
    this.name = "HistoryInvariantError";
    this.issues = issues;
  }
}

/**
 * `yBe` ImageHistoryCommandError. `originalMessage` holds Asset Maid's text when the port's English text differs
 * (Korean originals, RisuAI wording).
 */
export class HistoryCommandError extends Error {
  readonly originalMessage?: string;
  constructor(message: string, originalMessage?: string) {
    super(message);
    this.name = "HistoryCommandError";
    if (originalMessage !== undefined) this.originalMessage = originalMessage;
  }
}

function fail(message: string, originalMessage?: string): never {
  throw new HistoryCommandError(message, originalMessage);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Identity, empty tree, clone                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `Gne`: empty tree for a chat key (`chat:<lumiverseChatId>`). */
export function createEmptyHistoryTree(chatKey: string): HistoryTree {
  const key = String(chatKey ?? "").trim();
  if (!key) throw new TypeError("Image History chatKey is required.");
  return { chatKey: key, entriesById: {}, slotsById: {}, messagesByKey: {} };
}

/** `IR`: a stable message id is non-empty and is not an `id:`/`index:` placeholder. */
export function isStableHistoryMessageId(messageId: unknown): boolean {
  const id = String(messageId ?? "").trim();
  return !!id && !/^(?:id|index):/u.test(id);
}

/** `_R`: `<mode>:<messageId>` (`chat:<id>` or `illustration:<id>`). */
export function historyMessageKey(input: { mode: HistoryMessageMode; messageId: string }): string {
  const id = String(input.messageId ?? "").trim();
  if (!isStableHistoryMessageId(id)) throw new TypeError("Image History requires the raw stable message id.");
  return `${input.mode}:${id}`;
}

function cloneWorkflow(w: IllustrationWorkflow): IllustrationWorkflow {
  return {
    ...w,
    countPolicy: { ...w.countPolicy, ...(w.countPolicy.values ? { values: { ...w.countPolicy.values } } : {}) },
    assetHints: w.assetHints.map((h) => ({ ...h })),
  };
}

function cloneRevision(r: HistoryRevision): HistoryRevision {
  return {
    ...r,
    ...(r.deletedSlotIndices ? { deletedSlotIndices: [...r.deletedSlotIndices] } : {}),
    slotsById: Object.fromEntries(Object.entries(r.slotsById).map(([k, s]) => [k, { ...s, entryIds: [...s.entryIds] }])),
  };
}

/** `Ju`: structural clone of a valid tree. */
export function cloneHistoryTree(tree: HistoryTree): HistoryTree {
  return {
    chatKey: tree.chatKey,
    entriesById: Object.fromEntries(Object.entries(tree.entriesById).map(([k, e]) => [k, { ...e }])),
    slotsById: Object.fromEntries(Object.entries(tree.slotsById).map(([k, s]) => [k, { ...s }])),
    messagesByKey: Object.fromEntries(
      Object.entries(tree.messagesByKey).map(([k, m]) => [
        k,
        {
          ...m,
          ...(m.mode === "illustration" ? { workflow: cloneWorkflow(m.workflow) } : {}),
          revisions: m.revisions.map(cloneRevision),
        } as HistoryMessage,
      ]),
    ),
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Validator (`hBe`, 53104-53480)                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}
function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function isIntIn(value: unknown, min: number, max: number): boolean {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}
function checkFields(record: Record<string, unknown>, allowed: Set<string>, path: string, out: HistoryIssue[]): void {
  for (const key of Object.keys(record)) if (!allowed.has(key)) out.push(issue("unexpected-field", `${path}.${key}`));
}
function requiredString(value: unknown, path: string, out: HistoryIssue[]): string {
  const s = trimmed(value);
  if (!s) out.push(issue("required-string", path));
  return s;
}
function plainString(value: unknown, path: string, out: HistoryIssue[]): string {
  if (typeof value !== "string") {
    out.push(issue("string", path));
    return "";
  }
  return value.trim();
}

/** `fBe` / `Wne`: original first, then createdAt, then entryId. */
export function compareHistoryEntries(a: HistoryEntry, b: HistoryEntry): number {
  return a.kind !== b.kind ? (a.kind === "original" ? -1 : 1) : a.createdAt - b.createdAt || a.entryId.localeCompare(b.entryId);
}

function validateCountPolicy(value: unknown, path: string, out: HistoryIssue[]): void {
  const n = asRecord(value);
  if (!n) {
    out.push(issue("count-policy-record", path));
    return;
  }
  checkFields(n, COUNT_POLICY_FIELD_SET, path, out);
  if (n.mode !== "fixed" && n.mode !== "range") out.push(issue("count-policy-mode", `${path}.mode`));
  for (const k of ["min", "max"]) if (!isIntIn(n[k], 1, COUNT_MAX)) out.push(issue("count-policy-count", `${path}.${k}`));
  if (Number(n.min) > Number(n.max)) out.push(issue("count-policy-range", path));
  if (n.values === undefined) return;
  const v = asRecord(n.values);
  if (!v) {
    out.push(issue("count-values-record", `${path}.values`));
    return;
  }
  checkFields(v, COUNT_VALUES_FIELD_SET, `${path}.values`, out);
  for (const k of ["fixed", "min", "max"])
    if (!isIntIn(v[k], 1, COUNT_MAX)) out.push(issue("count-values-count", `${path}.values.${k}`));
}

function validateWorkflow(value: unknown, path: string, out: HistoryIssue[]): void {
  const n = asRecord(value);
  if (!n) {
    out.push(issue("workflow-record", path));
    return;
  }
  checkFields(n, WORKFLOW_FIELD_SET, path, out);
  validateCountPolicy(n.countPolicy, `${path}.countPolicy`, out);
  if (!isIntIn(n.requestedCount, 1, COUNT_MAX)) out.push(issue("workflow-requested-count", `${path}.requestedCount`));
  if (typeof n.nativeAssetSuppressed !== "boolean") out.push(issue("workflow-native-suppressed", `${path}.nativeAssetSuppressed`));
  plainString(n.lastError, `${path}.lastError`, out);
  if (!Array.isArray(n.assetHints)) {
    out.push(issue("workflow-asset-hints", `${path}.assetHints`));
    return;
  }
  n.assetHints.forEach((hint, index) => {
    const p = `${path}.assetHints[${index}]`;
    const h = asRecord(hint);
    if (!h) {
      out.push(issue("asset-hint-record", p));
      return;
    }
    checkFields(h, ASSET_HINT_FIELD_SET, p, out);
    requiredString(h.sourceMarkup, `${p}.sourceMarkup`, out);
    if (!isIntIn(h.sourceOffset, 0, Number.MAX_SAFE_INTEGER)) out.push(issue("asset-hint-offset", `${p}.sourceOffset`));
  });
}

/** `hBe`: list every invariant violation of a persisted tree (empty list = valid). */
export function listHistoryTreeIssues(value: unknown): HistoryIssue[] {
  const out: HistoryIssue[] = [];
  const tree = asRecord(value);
  if (!tree) return [issue("tree-record", "$")];
  checkFields(tree, TREE_FIELD_SET, "$", out);
  requiredString(tree.chatKey, "$.chatKey", out);
  const entries = asRecord(tree.entriesById);
  const slots = asRecord(tree.slotsById);
  const messages = asRecord(tree.messagesByKey);
  if (!entries) out.push(issue("entries-record", "$.entriesById"));
  if (!slots) out.push(issue("slots-record", "$.slotsById"));
  if (!messages) out.push(issue("messages-record", "$.messagesByKey"));
  if (!entries || !slots || !messages) return out;

  const validEntries = new Map<string, HistoryEntry>();
  const generatedBySlot = new Map<string, string[]>();
  const originalsBySlot = new Map<string, string[]>();
  for (const [key, raw] of Object.entries(entries)) {
    const p = `$.entriesById.${key}`;
    const v = asRecord(raw);
    if (!v) {
      out.push(issue("entry-record", p));
      continue;
    }
    checkFields(v, ENTRY_FIELD_SET, p, out);
    const entryId = requiredString(v.entryId, `${p}.entryId`, out);
    const slotId = requiredString(v.slotId, `${p}.slotId`, out);
    const assetName = requiredString(v.assetName, `${p}.assetName`, out);
    const savedPath = trimmed(v.savedPath);
    const extension = trimmed(v.extension);
    const hasPath = v.savedPath !== undefined;
    const hasExt = v.extension !== undefined;
    if (entryId && entryId !== key) out.push(issue("entry-key", `${p}.entryId`));
    if (v.kind !== "original" && v.kind !== "generated") out.push(issue("entry-kind", `${p}.kind`));
    if (
      v.generationOrigin !== undefined &&
      v.generationOrigin !== "initial" &&
      v.generationOrigin !== "retry" &&
      v.generationOrigin !== "reroll" &&
      v.generationOrigin !== "regenerate"
    )
      out.push(issue("entry-generation-origin", `${p}.generationOrigin`));
    if (v.parentEntryId !== undefined && !trimmed(v.parentEntryId)) out.push(issue("entry-parent-entry-id", `${p}.parentEntryId`));
    if (v.kind === "original" && (v.generationOrigin !== undefined || v.parentEntryId !== undefined || hasPath || hasExt))
      out.push(issue("original-entry-generation-metadata", p));
    if (hasPath !== hasExt) out.push(issue("entry-asset-location-pair", p));
    else if (hasPath && (!savedPath || savedPath.length > HISTORY_SAVED_PATH_MAX || SAVED_PATH_FORBIDDEN.test(savedPath)))
      out.push(issue("entry-saved-path", `${p}.savedPath`));
    if (hasExt && (extension !== extension.toLowerCase() || !ASSET_EXTENSION_PATTERN.test(extension)))
      out.push(issue("entry-extension", `${p}.extension`));
    if (assetName && (ASSET_NAME_FORBIDDEN_URL.test(assetName) || ASSET_NAME_FORBIDDEN_CHARS.test(assetName)))
      out.push(issue("asset-reference", `${p}.assetName`));
    if (!isIntIn(v.createdAt, 0, Number.MAX_SAFE_INTEGER)) out.push(issue("entry-created-at", `${p}.createdAt`));
    if (!isIntIn(v.width, 0, HISTORY_ENTRY_SIZE_MAX) || !isIntIn(v.height, 0, HISTORY_ENTRY_SIZE_MAX)) out.push(issue("entry-size", p));
    if (!entryId || !slotId || !assetName || (v.kind !== "original" && v.kind !== "generated")) continue;
    const entry = v as unknown as HistoryEntry;
    validEntries.set(entryId, entry);
    const bucket = entry.kind === "generated" ? generatedBySlot : originalsBySlot;
    const list = bucket.get(slotId) ?? [];
    list.push(entryId);
    bucket.set(slotId, list);
  }

  const validSlots = new Map<string, Record<string, unknown>>();
  const slotIndexesByMessage = new Map<string, Set<number>>();
  for (const [key, raw] of Object.entries(slots)) {
    const p = `$.slotsById.${key}`;
    const v = asRecord(raw);
    if (!v) {
      out.push(issue("slot-record", p));
      continue;
    }
    checkFields(v, SLOT_FIELD_SET, p, out);
    const slotId = requiredString(v.slotId, `${p}.slotId`, out);
    const messageKey = requiredString(v.messageKey, `${p}.messageKey`, out);
    if (slotId && slotId !== key) out.push(issue("slot-key", `${p}.slotId`));
    if (!isIntIn(v.slotIndex, 0, Number.MAX_SAFE_INTEGER)) out.push(issue("slot-index", `${p}.slotIndex`));
    else if (messageKey) {
      const seen = slotIndexesByMessage.get(messageKey) ?? new Set<number>();
      if (seen.has(Number(v.slotIndex))) out.push(issue("slot-index-duplicate", `${p}.slotIndex`));
      seen.add(Number(v.slotIndex));
      slotIndexesByMessage.set(messageKey, seen);
    }
    if (slotId && messageKey) validSlots.set(slotId, v);
  }

  const referencedEntries = new Set<string>();
  const referencedSlots = new Set<string>();
  for (const [key, raw] of Object.entries(messages)) {
    const p = `$.messagesByKey.${key}`;
    const v = asRecord(raw);
    if (!v) {
      out.push(issue("message-record", p));
      continue;
    }
    checkFields(v, MESSAGE_FIELD_SET, p, out);
    const messageKey = requiredString(v.messageKey, `${p}.messageKey`, out);
    const messageId = requiredString(v.messageId, `${p}.messageId`, out);
    const stable = isStableHistoryMessageId(messageId);
    if (messageId && !stable) out.push(issue("message-id-format", `${p}.messageId`));
    if (messageKey && messageKey !== key) out.push(issue("message-key", `${p}.messageKey`));
    if (!isIntIn(v.messageIndex, -1, Number.MAX_SAFE_INTEGER)) out.push(issue("message-index", `${p}.messageIndex`));
    const activeRevisionId = plainString(v.activeRevisionId, `${p}.activeRevisionId`, out);
    if (v.mode === "illustration") validateWorkflow(v.workflow, `${p}.workflow`, out);
    else if (v.mode === "chat") {
      if (v.workflow !== undefined) out.push(issue("chat-workflow", `${p}.workflow`));
    } else out.push(issue("message-mode", `${p}.mode`));
    if (
      messageKey &&
      stable &&
      (v.mode === "chat" || v.mode === "illustration") &&
      messageKey !== historyMessageKey({ mode: v.mode, messageId })
    )
      out.push(issue("message-identity", `${p}.messageKey`));
    if (!Array.isArray(v.revisions)) {
      out.push(issue("revisions-array", `${p}.revisions`));
      continue;
    }
    const revisionIds = new Set<string>();
    for (let index = 0; index < v.revisions.length; index += 1) {
      const rp = `${p}.revisions[${index}]`;
      const rev = asRecord(v.revisions[index]);
      if (!rev) {
        out.push(issue("revision-record", rp));
        continue;
      }
      checkFields(rev, REVISION_FIELD_SET, rp, out);
      const revisionId = requiredString(rev.revisionId, `${rp}.revisionId`, out);
      const parentId = plainString(rev.parentRevisionId, `${rp}.parentRevisionId`, out);
      if (revisionId && revisionIds.has(revisionId)) out.push(issue("revision-duplicate", `${rp}.revisionId`));
      if (index === 0 && parentId) out.push(issue("revision-root-parent", `${rp}.parentRevisionId`));
      else if (index > 0 && (!parentId || !revisionIds.has(parentId))) out.push(issue("revision-parent", `${rp}.parentRevisionId`));
      if (revisionId) revisionIds.add(revisionId);
      if (rev.status !== "complete" && rev.status !== "error") out.push(issue("revision-status", `${rp}.status`));
      if (!isIntIn(rev.createdAt, 0, Number.MAX_SAFE_INTEGER)) out.push(issue("revision-created-at", `${rp}.createdAt`));
      const countOk = isIntIn(rev.requestedCount, 1, COUNT_MAX);
      if (v.mode === "illustration") {
        if (!countOk) out.push(issue("revision-requested-count", `${rp}.requestedCount`));
        plainString(rev.error, `${rp}.error`, out);
      } else if ((rev.requestedCount !== undefined && !countOk) || rev.error !== undefined) {
        out.push(issue("chat-revision-workflow", rp));
      }
      const revSlots = asRecord(rev.slotsById);
      const deleted = rev.deletedSlotIndices;
      const deletedOk =
        Array.isArray(deleted) &&
        deleted.length > 0 &&
        v.mode === "illustration" &&
        deleted.every(
          (d: unknown, i: number) =>
            isIntIn(d, 0, Number(rev.requestedCount) - 1) &&
            (i === 0 || (d as number) > (deleted[i - 1] as number)) &&
            !Object.keys(revSlots ?? {}).some((slotId) => validSlots.get(slotId)?.slotIndex === d),
        );
      if (deleted !== undefined && !deletedOk) out.push(issue("deleted-slots", `${rp}.deletedSlotIndices`));
      if (!revSlots || (!Object.keys(revSlots).length && !deletedOk)) {
        out.push(issue("revision-slots", `${rp}.slotsById`));
        continue;
      }
      for (const [slotId, rawSlot] of Object.entries(revSlots)) {
        const sp = `${rp}.slotsById.${slotId}`;
        const rs = asRecord(rawSlot);
        if (!rs) {
          out.push(issue("revision-slot-record", sp));
          continue;
        }
        checkFields(rs, REVISION_SLOT_FIELD_SET, sp, out);
        const owner = validSlots.get(slotId);
        if (!owner || trimmed(owner.messageKey) !== key) out.push(issue("revision-slot-owner", sp));
        if (!Array.isArray(rs.entryIds) || !rs.entryIds.length) {
          out.push(issue("revision-entry-ids", `${sp}.entryIds`));
          continue;
        }
        const ids = rs.entryIds.map(trimmed);
        if (new Set(ids).size !== ids.length) out.push(issue("revision-entry-duplicate", `${sp}.entryIds`));
        const defaultId = requiredString(rs.defaultEntryId, `${sp}.defaultEntryId`, out);
        if (defaultId && !ids.includes(defaultId)) out.push(issue("revision-default-entry", `${sp}.defaultEntryId`));
        const owned = ids.flatMap((id) => {
          const e = validEntries.get(id);
          if (!e || e.slotId !== slotId) {
            out.push(issue("revision-entry-owner", `${sp}.entryIds`));
            return [];
          }
          referencedEntries.add(id);
          return [e];
        });
        if (owned.sort(compareHistoryEntries).map((e) => e.entryId).join("\n") !== ids.join("\n"))
          out.push(issue("revision-entry-order", `${sp}.entryIds`));
        referencedSlots.add(slotId);
      }
    }
    if (v.revisions.length) {
      if (!activeRevisionId || !revisionIds.has(activeRevisionId)) out.push(issue("active-revision", `${p}.activeRevisionId`));
    } else if (activeRevisionId) out.push(issue("empty-active-revision", `${p}.activeRevisionId`));
  }

  for (const [slotId, slot] of validSlots) {
    const p = `$.slotsById.${slotId}`;
    const message = asRecord(messages[trimmed(slot.messageKey)]);
    if (!messages[trimmed(slot.messageKey)]) {
      out.push(issue("slot-message", `${p}.messageKey`));
      continue;
    }
    if (!referencedSlots.has(slotId)) out.push(issue("slot-orphan", p));
    const originals = originalsBySlot.get(slotId) ?? [];
    const mode = message?.mode;
    if (mode === "chat" && originals.length !== 1) out.push(issue("chat-original", p));
    if (mode === "illustration" && originals.length) out.push(issue("illustration-original", p));
    if ((generatedBySlot.get(slotId) ?? []).length > MAX_GENERATED_ENTRIES_PER_SLOT) out.push(issue("generated-entry-cap", p));
  }
  for (const [entryId, entry] of validEntries) {
    if (!validSlots.has(entry.slotId)) out.push(issue("entry-slot", `$.entriesById.${entryId}.slotId`));
    if (!referencedEntries.has(entryId)) out.push(issue("entry-orphan", `$.entriesById.${entryId}`));
  }
  return out;
}

export type HistoryValidationResult = { ok: true; tree: HistoryTree } | { ok: false; issues: HistoryIssue[] };

/** Validate a persisted tree. On success the tree is returned canonicalized (keys sorted, see `canonicalizeHistoryTree`). */
export function validateHistoryTree(value: unknown): HistoryValidationResult {
  const issues = listHistoryTreeIssues(value);
  return issues.length ? { ok: false, issues } : { ok: true, tree: canonicalizeHistoryTree(value as HistoryTree) };
}

/** `Vne`: throw `HistoryInvariantError` when the tree breaks an invariant. */
export function assertHistoryTree(value: unknown): asserts value is HistoryTree {
  const issues = listHistoryTreeIssues(value);
  if (issues.length) throw new HistoryInvariantError(issues);
}

function sortedRecord<T, U>(record: Record<string, T>, map: (value: T) => U): Record<string, U> {
  return Object.fromEntries(
    Object.keys(record)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => [k, map(record[k] as T)]),
  );
}

/** `Xne`: canonical clone (entriesById, slotsById, messagesByKey and revision slotsById sorted by key, `localeCompare`). */
export function canonicalizeHistoryTree(tree: HistoryTree): HistoryTree {
  const t = cloneHistoryTree(tree);
  return {
    ...t,
    entriesById: sortedRecord(t.entriesById, (e) => ({ ...e })),
    slotsById: sortedRecord(t.slotsById, (s) => ({ ...s })),
    messagesByKey: sortedRecord(t.messagesByKey, (m) => ({
      ...m,
      revisions: m.revisions.map((r) => ({
        ...r,
        slotsById: sortedRecord(r.slotsById, (s) => ({ ...s, entryIds: [...s.entryIds] })),
      })),
    })),
  };
}

/** `gBe`: validate and serialize to canonical JSON. */
export function serializeHistoryTree(tree: HistoryTree): string {
  assertHistoryTree(tree);
  return JSON.stringify(canonicalizeHistoryTree(tree));
}

/** `AR`: parse (object or JSON string), validate (throws `HistoryInvariantError`) and canonicalize. */
export function parseHistoryTree(value: unknown): HistoryTree {
  let data = value;
  if (typeof value === "string") {
    try {
      data = JSON.parse(value);
    } catch (error) {
      throw new TypeError(`Image History JSON parsing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  assertHistoryTree(data);
  return canonicalizeHistoryTree(data);
}

/** `aK`: field-by-field entry equality. */
export function historyEntriesEqual(a: HistoryEntry, b: HistoryEntry): boolean {
  return (
    a.entryId === b.entryId &&
    a.slotId === b.slotId &&
    a.kind === b.kind &&
    a.assetName === b.assetName &&
    a.savedPath === b.savedPath &&
    a.extension === b.extension &&
    a.createdAt === b.createdAt &&
    a.width === b.width &&
    a.height === b.height &&
    a.generationOrigin === b.generationOrigin &&
    a.parentEntryId === b.parentEntryId
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Commands (`Zne`, 53682-53790) with `PR` cleanup and `CR` pruning                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface HistoryMessageInput {
  messageKey: string;
  messageId: string;
  messageIndex: number;
  mode: HistoryMessageMode;
  workflow?: IllustrationWorkflow;
}

export type HistoryCommand =
  | { type: "add-message"; message: HistoryMessageInput }
  | { type: "delete-message"; messageKey: string }
  | { type: "set-message-identity"; messageKey: string; messageId: string; messageIndex: number }
  | { type: "set-illustration-workflow"; messageKey: string; workflow: IllustrationWorkflow }
  | {
      type: "append-revision";
      messageKey: string;
      revision: HistoryRevision;
      newSlots: HistorySlot[];
      newEntries: HistoryEntry[];
      activate?: boolean;
    }
  | {
      type: "append-entry";
      messageKey: string;
      revisionId: string;
      slotId: string;
      entry: HistoryEntry;
      selectAsDefault?: boolean;
    }
  | {
      type: "append-slot";
      messageKey: string;
      revisionId: string;
      slot: HistorySlot;
      entries: HistoryEntry[];
      entryIds: string[];
      defaultEntryId: string;
    }
  | {
      type: "set-revision-outcome";
      messageKey: string;
      revisionId: string;
      status: HistoryRevisionStatus;
      requestedCount?: number;
      error?: string;
    }
  | { type: "set-active-revision"; messageKey: string; revisionId: string }
  | { type: "set-default-entry"; messageKey: string; revisionId: string; slotId: string; entryId: string }
  | { type: "delete-slot"; messageKey: string; revisionId: string; slotIndex: number }
  | { type: "delete-entry"; entryId: string }
  | { type: "prune-slot"; slotId: string; maxGeneratedEntries: number };

export type HistoryCommandType = HistoryCommand["type"];

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function findRevision(tree: HistoryTree, messageKey: string, revisionId: string): HistoryRevision {
  const message = tree.messagesByKey[messageKey] ?? fail(`Image History message does not exist: ${messageKey}`);
  return message.revisions.find((r) => r.revisionId === revisionId) ?? fail(`Image History revision does not exist: ${revisionId}`);
}

function slotReferenced(tree: HistoryTree, slotId: string): boolean {
  for (const m of Object.values(tree.messagesByKey)) for (const r of m.revisions) if (r.slotsById[slotId]) return true;
  return false;
}

/** `Yne`: remove one entry from the tree and every revision slot (default falls back to the last remaining id). */
function removeEntry(tree: HistoryTree, entryId: string): void {
  const entry = tree.entriesById[entryId];
  if (!entry) return;
  delete tree.entriesById[entryId];
  for (const m of Object.values(tree.messagesByKey))
    for (const r of m.revisions) {
      const slot = r.slotsById[entry.slotId];
      if (slot?.entryIds.includes(entryId)) {
        slot.entryIds = slot.entryIds.filter((id) => id !== entryId);
        if (!slot.entryIds.length) {
          delete r.slotsById[entry.slotId];
          continue;
        }
        if (!slot.entryIds.includes(slot.defaultEntryId)) slot.defaultEntryId = slot.entryIds.at(-1) as string;
      }
    }
  if (!slotReferenced(tree, entry.slotId)) delete tree.slotsById[entry.slotId];
}

/**
 * `PR`: drop empty revisions (children are re-parented to the nearest kept ancestor), reset a dangling
 * `activeRevisionId` to the last revision, delete empty chat messages, orphan slots and orphan entries.
 */
export function cleanupHistoryTree(tree: HistoryTree): void {
  for (const [key, message] of Object.entries(tree.messagesByKey)) {
    const parents = new Map(message.revisions.map((r) => [r.revisionId, r.parentRevisionId]));
    const kept = message.revisions.filter((r) => Object.keys(r.slotsById).length > 0 || !!r.deletedSlotIndices?.length);
    const keptIds = new Set(kept.map((r) => r.revisionId));
    for (const r of kept) {
      let parent = r.parentRevisionId;
      const seen = new Set<string>();
      while (parent && !keptIds.has(parent)) {
        if (seen.has(parent)) {
          parent = "";
          break;
        }
        seen.add(parent);
        parent = parents.get(parent) ?? "";
      }
      r.parentRevisionId = parent;
    }
    message.revisions = kept;
    if (!keptIds.has(message.activeRevisionId)) message.activeRevisionId = kept.at(-1)?.revisionId ?? "";
    if (!kept.length && message.mode === "chat") delete tree.messagesByKey[key];
  }
  const liveSlots = new Set<string>();
  const liveEntries = new Set<string>();
  for (const m of Object.values(tree.messagesByKey))
    for (const r of m.revisions)
      for (const [slotId, slot] of Object.entries(r.slotsById)) {
        liveSlots.add(slotId);
        slot.entryIds.forEach((id) => liveEntries.add(id));
      }
  for (const slotId of Object.keys(tree.slotsById)) if (!liveSlots.has(slotId)) delete tree.slotsById[slotId];
  for (const entryId of Object.keys(tree.entriesById)) if (!liveEntries.has(entryId)) delete tree.entriesById[entryId];
}

/** `CR`: keep the newest `limit` generated entries of a slot (oldest first are removed), then cleanup. */
function pruneSlot(tree: HistoryTree, slotId: string, limit: number): void {
  if (!Number.isInteger(limit) || limit < 0) fail("Image History prune limit must be a non-negative integer.");
  const generated = Object.values(tree.entriesById)
    .filter((e) => e.slotId === slotId && e.kind === "generated")
    .sort(compareHistoryEntries);
  const excess = Math.max(0, generated.length - limit);
  for (let i = 0; i < excess; i += 1) removeEntry(tree, (generated[i] as HistoryEntry).entryId);
  if (excess) cleanupHistoryTree(tree);
}

function appendRevision(tree: HistoryTree, c: Extract<HistoryCommand, { type: "append-revision" }>): void {
  const key = str(c.messageKey);
  const message = tree.messagesByKey[key] ?? fail(`Image History message does not exist: ${key}`);
  if (c.revision.revisionId && message.revisions.some((r) => r.revisionId === c.revision.revisionId))
    fail(`Image History revision already exists: ${c.revision.revisionId}`);
  for (const slot of c.newSlots) {
    if (tree.slotsById[slot.slotId]) fail(`Image History slot already exists: ${slot.slotId}`);
    tree.slotsById[slot.slotId] = { ...slot };
  }
  for (const entry of c.newEntries) {
    if (tree.entriesById[entry.entryId]) fail(`Image History entry already exists: ${entry.entryId}`);
    tree.entriesById[entry.entryId] = { ...entry };
  }
  const revision = cloneRevision(c.revision);
  message.revisions.push(revision);
  if (c.activate) message.activeRevisionId = revision.revisionId;
  const touched = new Set([...c.newSlots.map((s) => s.slotId), ...c.newEntries.map((e) => e.slotId)]);
  for (const slotId of touched) pruneSlot(tree, slotId, MAX_GENERATED_ENTRIES_PER_SLOT);
}

function appendEntry(tree: HistoryTree, c: Extract<HistoryCommand, { type: "append-entry" }>): void {
  const key = str(c.messageKey);
  const revisionId = str(c.revisionId);
  const slotId = str(c.slotId);
  const entryId = str(c.entry.entryId);
  if ((tree.slotsById[slotId] ?? fail(`Image History slot does not exist: ${slotId}`)).messageKey !== key)
    fail("Image History slot belongs to another message.");
  if (c.entry.kind !== "generated") fail("append-entry accepts generated entries only; originals are established with a revision.");
  if (c.entry.slotId !== slotId) fail("Image History entry belongs to another slot.");
  if (tree.entriesById[entryId]) fail(`Image History entry already exists: ${entryId}`);
  const slot = findRevision(tree, key, revisionId).slotsById[slotId] ?? fail(`Image History revision does not contain slot: ${slotId}`);
  tree.entriesById[entryId] = { ...c.entry };
  slot.entryIds = [...slot.entryIds, entryId].sort((a, b) =>
    compareHistoryEntries(tree.entriesById[a] as HistoryEntry, tree.entriesById[b] as HistoryEntry),
  );
  if (c.selectAsDefault) slot.defaultEntryId = entryId;
  pruneSlot(tree, slotId, MAX_GENERATED_ENTRIES_PER_SLOT);
}

function appendSlot(tree: HistoryTree, c: Extract<HistoryCommand, { type: "append-slot" }>): void {
  const key = str(c.messageKey);
  const revisionId = str(c.revisionId);
  const slotId = str(c.slot.slotId);
  const revision = findRevision(tree, key, revisionId);
  if (revision.deletedSlotIndices?.includes(c.slot.slotIndex))
    fail("Cannot add a result to a deleted slot.", "삭제된 슬롯에 결과를 추가할 수 없습니다.");
  if (revision.slotsById[slotId]) fail(`Image History revision already contains slot: ${slotId}`);
  const existing = tree.slotsById[slotId];
  if (existing) {
    if (existing.messageKey !== c.slot.messageKey || existing.slotIndex !== c.slot.slotIndex)
      fail(`Image History slot conflicts with an existing slot: ${slotId}`);
  } else tree.slotsById[slotId] = { ...c.slot };
  for (const entry of c.entries) {
    const current = tree.entriesById[entry.entryId];
    if (current) {
      if (!historyEntriesEqual(current, entry)) fail(`Image History entry conflicts with an existing entry: ${entry.entryId}`);
      continue;
    }
    tree.entriesById[entry.entryId] = { ...entry };
  }
  revision.slotsById[slotId] = { entryIds: [...c.entryIds], defaultEntryId: str(c.defaultEntryId) };
  pruneSlot(tree, slotId, MAX_GENERATED_ENTRIES_PER_SLOT);
}

/** `Zne`: apply one command in place (no validation of the result). */
function reduceInPlace(tree: HistoryTree, c: HistoryCommand): void {
  switch (c.type) {
    case "add-message": {
      const key = str(c.message.messageKey);
      if (!key) fail("Image History messageKey is required.");
      const id = str(c.message.messageId);
      if (!isStableHistoryMessageId(id)) fail("Image History requires the raw stable message id.", "Image History requires the raw stable RisuAI messageId.");
      if (key !== historyMessageKey({ mode: c.message.mode, messageId: id }))
        fail("Image History messageKey must be derived from its stable messageId.");
      if (tree.messagesByKey[key]) fail(`Image History message already exists: ${key}`);
      tree.messagesByKey[key] = { ...c.message, messageKey: key, messageId: id, activeRevisionId: "", revisions: [] } as HistoryMessage;
      break;
    }
    case "delete-message": {
      const key = str(c.messageKey);
      if (!tree.messagesByKey[key]) fail(`Image History message does not exist: ${key}`);
      const slotIds = new Set(Object.values(tree.slotsById).filter((s) => s.messageKey === key).map((s) => s.slotId));
      for (const [id, e] of Object.entries(tree.entriesById)) if (slotIds.has(e.slotId)) delete tree.entriesById[id];
      for (const id of slotIds) delete tree.slotsById[id];
      delete tree.messagesByKey[key];
      break;
    }
    case "set-message-identity": {
      const key = str(c.messageKey);
      const message = tree.messagesByKey[key] ?? fail(`Image History message does not exist: ${key}`);
      const id = str(c.messageId);
      if (!isStableHistoryMessageId(id)) fail("Image History requires the raw stable message id.", "Image History requires the raw stable RisuAI messageId.");
      if (key !== historyMessageKey({ mode: message.mode, messageId: id })) fail("Image History message identity cannot change its messageKey.");
      message.messageId = id;
      message.messageIndex = c.messageIndex;
      break;
    }
    case "set-illustration-workflow": {
      const message = tree.messagesByKey[str(c.messageKey)] ?? fail(`Image History message does not exist: ${c.messageKey}`);
      if (message.mode !== "illustration") fail("Image History workflow can only be set on illustration messages.");
      message.workflow = cloneWorkflow(c.workflow);
      break;
    }
    case "append-revision":
      appendRevision(tree, c);
      break;
    case "append-entry":
      appendEntry(tree, c);
      break;
    case "append-slot":
      appendSlot(tree, c);
      break;
    case "set-revision-outcome": {
      const r = findRevision(tree, str(c.messageKey), str(c.revisionId));
      r.status = c.status;
      if (c.requestedCount === undefined) delete r.requestedCount;
      else r.requestedCount = c.requestedCount;
      if (c.error === undefined) delete r.error;
      else r.error = str(c.error);
      break;
    }
    case "set-active-revision": {
      const key = str(c.messageKey);
      const revisionId = str(c.revisionId);
      findRevision(tree, key, revisionId);
      (tree.messagesByKey[key] as HistoryMessage).activeRevisionId = revisionId;
      break;
    }
    case "set-default-entry": {
      const slot =
        findRevision(tree, str(c.messageKey), str(c.revisionId)).slotsById[str(c.slotId)] ??
        fail(`Image History revision does not contain slot: ${c.slotId}`);
      const entryId = str(c.entryId);
      if (!slot.entryIds.includes(entryId)) fail(`Image History entry is outside the revision slot: ${entryId}`);
      slot.defaultEntryId = entryId;
      break;
    }
    case "delete-slot": {
      if (tree.messagesByKey[c.messageKey]?.mode !== "illustration")
        fail("Only illustration slots can be deleted.", "일러스트 슬롯만 삭제할 수 있습니다.");
      const revision = findRevision(tree, c.messageKey, c.revisionId);
      if (revision.deletedSlotIndices?.includes(c.slotIndex)) break;
      const slot = Object.values(tree.slotsById).find(
        (s) => s.messageKey === c.messageKey && s.slotIndex === c.slotIndex && revision.slotsById[s.slotId],
      );
      if (!slot) fail("The slot to delete was not found.", "삭제할 슬롯을 찾을 수 없습니다.");
      delete revision.slotsById[slot.slotId];
      revision.deletedSlotIndices = [...(revision.deletedSlotIndices ?? []), c.slotIndex].sort((a, b) => a - b);
      cleanupHistoryTree(tree);
      break;
    }
    case "delete-entry": {
      const entryId = str(c.entryId);
      if ((tree.entriesById[entryId] ?? fail(`Image History entry does not exist: ${entryId}`)).kind === "original")
        fail("Image History original entries cannot be deleted.");
      removeEntry(tree, entryId);
      cleanupHistoryTree(tree);
      break;
    }
    case "prune-slot":
      if (!tree.slotsById[str(c.slotId)]) fail(`Image History slot does not exist: ${c.slotId}`);
      pruneSlot(tree, str(c.slotId), Math.min(c.maxGeneratedEntries, MAX_GENERATED_ENTRIES_PER_SLOT));
      cleanupHistoryTree(tree);
      break;
  }
}

/**
 * `iK`: apply one command to a clone of the tree and return it. Command rule violations throw `HistoryCommandError`.
 * The result is not validated; use `mutateHistoryTree` for a repository-style write (validate + canonicalize).
 */
export function applyHistoryCommand(tree: HistoryTree, command: HistoryCommand): HistoryTree {
  const next = cloneHistoryTree(tree);
  reduceInPlace(next, command);
  return next;
}

/** `OR`: apply commands in order to one clone. */
export function applyHistoryCommands(tree: HistoryTree, commands: readonly HistoryCommand[]): HistoryTree {
  const next = cloneHistoryTree(tree);
  for (const c of commands) reduceInPlace(next, c);
  return next;
}

/**
 * Repository-style write (`SBe.mutateAt`): apply commands, then validate and canonicalize (`AR`).
 * Throws `HistoryCommandError` (command rules) or `HistoryInvariantError` (result invalid).
 */
export function mutateHistoryTree(tree: HistoryTree, commands: readonly HistoryCommand[]): HistoryTree {
  const next = parseHistoryTree(applyHistoryCommands(tree, commands));
  if (next.chatKey !== tree.chatKey) fail("Image History mutation changed the chatKey.");
  return next;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Controller updaters as pure functions (IBe 53937-54154)                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface CommitRevisionSlotInput {
  slot: HistorySlot;
  entries: HistoryEntry[];
  entryIds: string[];
  defaultEntryId: string;
}
export interface CommitRevisionInput {
  message: HistoryMessageInput;
  /** Revision header; `slotsById` is built from `slots`. */
  revision: Omit<HistoryRevision, "slotsById">;
  slots: CommitRevisionSlotInput[];
  activate: boolean;
}

/**
 * `IBe.commitRevision` updater (53937-54054) + repository validation. New revision -> `append-revision`;
 * existing revision -> `set-revision-outcome` + `append-slot`/`append-entry` + `set-default-entry` (+ `set-active-revision`).
 * Returns the new canonical tree. Throws `HistoryCommandError` / `HistoryInvariantError`.
 */
export function commitRevision(tree: HistoryTree, input: CommitRevisionInput): HistoryTree {
  const commands: HistoryCommand[] = [];
  const current = tree.messagesByKey[input.message.messageKey];
  const messageId = input.message.messageId.trim();
  const owner = messageId
    ? Object.values(tree.messagesByKey).find((m) => m.messageId === messageId && m.messageKey !== input.message.messageKey)
    : undefined;
  if (owner) fail(`Image History message ${input.message.messageId} is already owned by ${owner.mode}.`);
  if (!current) commands.push({ type: "add-message", message: input.message });
  else {
    if (current.mode !== input.message.mode)
      fail("Image History message mode does not match the existing tree.", "Image History message mode가 기존 트리와 일치하지 않습니다.");
    commands.push({
      type: "set-message-identity",
      messageKey: input.message.messageKey,
      messageId: input.message.messageId,
      messageIndex: input.message.messageIndex,
    });
    if (input.message.mode === "illustration")
      commands.push({
        type: "set-illustration-workflow",
        messageKey: input.message.messageKey,
        workflow: input.message.workflow as IllustrationWorkflow,
      });
  }
  const existing = current?.revisions.find((r) => r.revisionId === input.revision.revisionId);
  if (!existing) {
    const newSlots = input.slots.map((s) => s.slot).filter((s) => !tree.slotsById[s.slotId]);
    const newEntries = input.slots
      .flatMap((s) => s.entries)
      .filter((e) => {
        const known = tree.entriesById[e.entryId];
        if (!known) return true;
        if (!historyEntriesEqual(known, e)) fail(`Image History entry conflict: ${e.entryId}`, `Image History entry 충돌: ${e.entryId}`);
        return false;
      });
    commands.push({
      type: "append-revision",
      messageKey: input.message.messageKey,
      revision: {
        ...input.revision,
        slotsById: Object.fromEntries(
          input.slots.map((s) => [s.slot.slotId, { entryIds: [...s.entryIds], defaultEntryId: s.defaultEntryId }]),
        ),
      },
      newSlots,
      newEntries,
      activate: input.activate,
    });
    return mutateHistoryTree(tree, commands);
  }
  commands.push({
    type: "set-revision-outcome",
    messageKey: input.message.messageKey,
    revisionId: existing.revisionId,
    status: input.revision.status,
    ...(input.revision.requestedCount !== undefined ? { requestedCount: input.revision.requestedCount } : {}),
    ...(input.revision.error !== undefined ? { error: input.revision.error } : {}),
  });
  for (const s of input.slots) {
    if (!existing.slotsById[s.slot.slotId]) {
      commands.push({
        type: "append-slot",
        messageKey: input.message.messageKey,
        revisionId: existing.revisionId,
        slot: s.slot,
        entries: s.entries,
        entryIds: s.entryIds,
        defaultEntryId: s.defaultEntryId,
      });
      continue;
    }
    for (const e of s.entries) {
      const known = tree.entriesById[e.entryId];
      if (known) {
        if (!historyEntriesEqual(known, e)) fail(`Image History entry conflict: ${e.entryId}`, `Image History entry 충돌: ${e.entryId}`);
        continue;
      }
      commands.push({
        type: "append-entry",
        messageKey: input.message.messageKey,
        revisionId: existing.revisionId,
        slotId: s.slot.slotId,
        entry: e,
        selectAsDefault: e.entryId === s.defaultEntryId,
      });
    }
    commands.push({
      type: "set-default-entry",
      messageKey: input.message.messageKey,
      revisionId: existing.revisionId,
      slotId: s.slot.slotId,
      entryId: s.defaultEntryId,
    });
  }
  if (input.activate) commands.push({ type: "set-active-revision", messageKey: input.message.messageKey, revisionId: existing.revisionId });
  return mutateHistoryTree(tree, commands);
}

export interface IllustrationWorkflowSyncInput {
  messageKey: string;
  messageId: string;
  messageIndex: number;
  workflow: IllustrationWorkflow;
}

/**
 * `IBe.syncIllustrationWorkflowsAt` updater: delete illustration messages without revisions that are not in the
 * list, add or update the listed ones. Returns the new canonical tree (unchanged input is returned canonicalized).
 */
export function syncIllustrationWorkflows(tree: HistoryTree, workflows: readonly IllustrationWorkflowSyncInput[]): HistoryTree {
  const commands: HistoryCommand[] = [];
  const listed = new Set(workflows.map((w) => w.messageKey));
  for (const m of Object.values(tree.messagesByKey))
    if (m.mode === "illustration" && !m.revisions.length && !listed.has(m.messageKey))
      commands.push({ type: "delete-message", messageKey: m.messageKey });
  for (const w of workflows) {
    const m = tree.messagesByKey[w.messageKey];
    if (!m) {
      commands.push({
        type: "add-message",
        message: { messageKey: w.messageKey, messageId: w.messageId, messageIndex: w.messageIndex, mode: "illustration", workflow: w.workflow },
      });
      continue;
    }
    if (m.mode !== "illustration")
      fail(`Image History workflow message mode conflict: ${w.messageKey}`, `Image History workflow message mode 충돌: ${w.messageKey}`);
    commands.push(
      { type: "set-message-identity", messageKey: w.messageKey, messageId: w.messageId, messageIndex: w.messageIndex },
      { type: "set-illustration-workflow", messageKey: w.messageKey, workflow: w.workflow },
    );
  }
  return commands.length ? mutateHistoryTree(tree, commands) : parseHistoryTree(tree);
}

/** `IBe.appendGenerated` updater: append a generated entry to a resolved slot (regeneration). */
export function appendGeneratedEntry(
  tree: HistoryTree,
  input: { slotId: string; messageKey?: string; revisionId?: string; entry: HistoryEntry; selectAsDefault?: boolean },
): HistoryTree {
  const target = resolveHistorySlot(tree, { slotId: input.slotId, messageKey: input.messageKey, revisionId: input.revisionId });
  if (!target) fail(`Image History regeneration target is missing: ${input.slotId}`, `Image History regeneration target이 없습니다: ${input.slotId}`);
  return mutateHistoryTree(tree, [
    {
      type: "append-entry",
      messageKey: target.message.messageKey,
      revisionId: target.revision.revisionId,
      slotId: target.slot.slotId,
      entry: input.entry,
      ...(input.selectAsDefault !== undefined ? { selectAsDefault: input.selectAsDefault } : {}),
    },
  ]);
}

/** `IBe.deleteGenerated` updater. */
export function deleteGeneratedEntry(tree: HistoryTree, entryId: string): HistoryTree {
  return mutateHistoryTree(tree, [{ type: "delete-entry", entryId }]);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Read helpers (`Ca`, `_Be`, `l_`, `Jne`)                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface ResolvedHistorySlot {
  message: HistoryMessage;
  revision: HistoryRevision;
  slot: HistorySlot;
  revisionSlot: HistoryRevisionSlot;
  entries: HistoryEntry[];
  defaultEntry: HistoryEntry;
}

/** `Ca`: resolve a slot in a revision (default: the active revision). */
export function resolveHistorySlot(
  tree: HistoryTree,
  query: { slotId: string; messageKey?: string; revisionId?: string },
): ResolvedHistorySlot | null {
  const slotId = query.slotId.trim();
  const slot = tree.slotsById[slotId];
  if (!slot) return null;
  const messageKey = query.messageKey?.trim() || slot.messageKey;
  if (messageKey !== slot.messageKey) return null;
  const message = tree.messagesByKey[messageKey];
  if (!message) return null;
  const revisionId = query.revisionId?.trim() || message.activeRevisionId;
  const revision = message.revisions.find((r) => r.revisionId === revisionId);
  const revisionSlot = revision?.slotsById[slotId];
  if (!revision || !revisionSlot) return null;
  const entries = revisionSlot.entryIds.flatMap((id) => {
    const e = tree.entriesById[id];
    return e ? [e] : [];
  });
  const defaultEntry = tree.entriesById[revisionSlot.defaultEntryId];
  return !entries.length || !defaultEntry ? null : { message, revision, slot, revisionSlot, entries, defaultEntry };
}

/** `_Be`: messages ordered by messageIndex, then messageKey. */
export function listHistoryMessages(tree: HistoryTree): HistoryMessage[] {
  return Object.values(tree.messagesByKey).sort((a, b) => a.messageIndex - b.messageIndex || a.messageKey.localeCompare(b.messageKey));
}

/** `l_`: resolved slots of one revision ordered by slotIndex. */
export function listRevisionSlots(tree: HistoryTree, messageKey: string, revisionId: string): ResolvedHistorySlot[] {
  const message = tree.messagesByKey[messageKey.trim()];
  const revision = message?.revisions.find((r) => r.revisionId === revisionId.trim());
  if (!message || !revision) return [];
  return Object.keys(revision.slotsById)
    .flatMap((slotId) => {
      const r = resolveHistorySlot(tree, { slotId, messageKey: message.messageKey, revisionId: revision.revisionId });
      return r ? [r] : [];
    })
    .sort((a, b) => a.slot.slotIndex - b.slot.slotIndex || a.slot.slotId.localeCompare(b.slot.slotId));
}

/** `Jne`: newest generated entry of a resolved slot, else its default entry. */
export function latestGeneratedEntry(resolved: ResolvedHistorySlot): HistoryEntry {
  return [...resolved.entries].reverse().find((e) => e.kind === "generated") ?? resolved.defaultEntry;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Projections between the chat store and the tree (`NR` 54255-54324, `lK` 54344-54415)                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** `sK`: tree message key of a store message (`inline` -> `chat:`). */
export function storeMessageHistoryKey(messageId: string, message: Pick<ChatStoreMessage, "kind">): string {
  return `${message.kind === "illustration" ? "illustration" : "chat"}:${messageId}`;
}
/** `cK`: `<messageKey>:slot:<n>`. */
export function historySlotId(messageKey: string, slotIndex: number): string {
  return `${messageKey}:slot:${slotIndex}`;
}
/** `eoe`: projected entry id `<messageKey>:generation:<genId>:slot:<n>:image:<k>` (k is 0-based). */
export function projectedEntryId(messageKey: string, generationId: string, slotIndex: number, imageIndex: number): string {
  return `${messageKey}:generation:${generationId}:slot:${slotIndex}:image:${imageIndex}`;
}
/** `LA`: placeholder generation id of a journal job. */
export function draftGenerationId(jobId: string): string {
  return `draft:${jobId}`;
}

/** `qD`: slot map entries as `[index, images]` sorted by numeric index. */
export function sortedStoreSlots<T>(slots: Record<string, T>): Array<[number, T]> {
  return Object.entries(slots)
    .map(([k, v]) => [Number(k), v] as [number, T])
    .sort(([a], [b]) => a - b);
}

/** `toe`: a generation that holds images or deletions. */
function generationHasContent(g: ChatStoreGeneration): boolean {
  return Object.values(g.slots).some((images) => images.length > 0) || !!g.deletedSlotIndices?.length;
}

function generationsById(message: ChatStoreMessage | undefined): Map<string, ChatStoreGeneration> {
  const map = new Map<string, ChatStoreGeneration>();
  for (const g of message?.generations ?? []) if (!map.has(g.id)) map.set(g.id, g);
  return map;
}

function jobGenerationsByMessage(jobs: ChatStore["jobs"]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const job of Object.values(jobs ?? {})) {
    const set = map.get(job.messageId) ?? new Set<string>();
    set.add(job.generationId);
    map.set(job.messageId, set);
  }
  return map;
}

function toIndexMap(indexes?: ReadonlyMap<string, number> | Readonly<Record<string, number>>): ReadonlyMap<string, number> {
  if (!indexes) return new Map();
  if (indexes instanceof Map) return indexes;
  return new Map(Object.entries(indexes as Record<string, number>));
}

/**
 * `NR`: chat store -> tree (Asset Maid's only load path). Lossy: projected entry ids, `createdAt = k+1`, no origin /
 * parent entry, default entry = last image, `countPolicy` fixed. Validates the result (throws `HistoryInvariantError`).
 */
export function projectStoreToTree(
  store: ChatStore,
  chatKey: string,
  messageIndexById?: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
): HistoryTree {
  const indexes = toIndexMap(messageIndexById);
  const entriesById: Record<string, HistoryEntry> = {};
  const slotsById: Record<string, HistorySlot> = {};
  const messagesByKey: Record<string, HistoryMessage> = {};
  for (const [messageId, message] of Object.entries(store.messages)) {
    const key = storeMessageHistoryKey(messageId, message);
    const messageIndex = indexes.get(messageId) ?? 0;
    const withContent = message.generations.filter(generationHasContent);
    for (const g of withContent)
      for (const [slotIndex, images] of sortedStoreSlots(g.slots)) {
        const slotId = historySlotId(key, slotIndex);
        slotsById[slotId] = { slotId, messageKey: key, slotIndex };
        images.forEach((image, k) => {
          const entryId = projectedEntryId(key, g.id, slotIndex, k);
          entriesById[entryId] = {
            entryId,
            slotId,
            kind: image.kind ?? "generated",
            assetName: image.assetName,
            ...(image.savedPath ? { savedPath: image.savedPath, extension: image.extension as string } : {}),
            createdAt: k + 1,
            width: image.width,
            height: image.height,
          };
        });
      }
    const lastWithContent = withContent.at(-1);
    const last = message.generations.at(-1);
    const activeRevisionId = lastWithContent?.id ?? "";
    const revisions: HistoryRevision[] = withContent.map((g, index) => {
      const count = fixedPolicy(g.targetCount || Object.keys(g.slots).length || 1);
      return {
        revisionId: g.id,
        parentRevisionId: g.parentId ?? "",
        status: message.kind === "illustration" && g.error ? "error" : "complete",
        requestedCount: count.min,
        ...(message.kind === "illustration" ? { error: g.error ?? "" } : {}),
        createdAt: index + 1,
        ...(g.deletedSlotIndices?.length ? { deletedSlotIndices: [...g.deletedSlotIndices] } : {}),
        slotsById: Object.fromEntries(
          sortedStoreSlots(g.slots).map(([slotIndex, images]) => {
            const slotId = historySlotId(key, slotIndex);
            const ids = images.map((_, k) => projectedEntryId(key, g.id, slotIndex, k));
            return [slotId, { entryIds: ids, defaultEntryId: ids.at(-1) ?? "" }];
          }),
        ),
      };
    });
    const policy = fixedPolicy(message.requestedCount || last?.targetCount || 1);
    messagesByKey[key] =
      message.kind === "illustration"
        ? {
            messageKey: key,
            messageId,
            messageIndex,
            mode: "illustration",
            activeRevisionId,
            revisions,
            workflow: {
              countPolicy: policy,
              requestedCount: policy.min,
              nativeAssetSuppressed: !!lastWithContent,
              assetHints: [],
              lastError: last?.error ?? "",
            },
          }
        : { messageKey: key, messageId, messageIndex, mode: "chat", activeRevisionId, revisions };
  }
  return parseHistoryTree({ chatKey, entriesById, slotsById, messagesByKey });
}

/** `CBe`: store images of one revision slot. */
function revisionSlotImages(tree: HistoryTree, revision: HistoryRevision, slotId: string): ChatStoreImage[] | null {
  const slot = revision.slotsById[slotId];
  if (!slot) return null;
  const images = slot.entryIds.flatMap((id) => {
    const e = tree.entriesById[id];
    return e
      ? [
          {
            assetName: e.assetName,
            ...(e.savedPath ? { savedPath: e.savedPath, extension: e.extension as string } : {}),
            ...(e.kind === "original" ? { kind: "original" as const } : {}),
            width: e.width,
            height: e.height,
          },
        ]
      : [];
  });
  return images.length ? images : null;
}

/**
 * `lK`: fold the tree back into the chat store (pure: returns a new store; `jobs` and continuity are kept).
 * Per tree message the store generations are rebuilt from revisions; old generations referenced by `jobs` or carrying
 * deletions are kept; `sources` are kept. A messageId that is both chat and illustration throws.
 * Store messages not in the tree survive only when a job references them (Asset Maid behaviour).
 */
export function foldTreeIntoStore(store: ChatStore, tree: HistoryTree | null): ChatStore {
  const e = structuredClone(store);
  const result: Record<string, ChatStoreMessage> = {};
  const jobGenerations = jobGenerationsByMessage(e.jobs);
  if (tree)
    for (const m of Object.values(tree.messagesByKey)) {
      const old = e.messages[m.messageId];
      const oldById = generationsById(old);
      const rebuilt: ChatStoreGeneration[] = m.revisions.map((rev) => {
        const prev = oldById.get(rev.revisionId);
        const deleted = [...new Set([...(prev?.deletedSlotIndices ?? []), ...(rev.deletedSlotIndices ?? [])])].sort((a, b) => a - b);
        const slotIds = Object.keys(rev.slotsById).sort(
          (a, b) => (tree.slotsById[a]?.slotIndex ?? 0) - (tree.slotsById[b]?.slotIndex ?? 0),
        );
        const maxIndex = slotIds.reduce((acc, id) => Math.max(acc, tree.slotsById[id]?.slotIndex ?? -1), -1);
        const targetCount = Math.max(
          rev.requestedCount ?? 0,
          m.mode === "illustration" ? m.workflow.requestedCount : 0,
          prev?.targetCount ?? 0,
          maxIndex + 1,
        );
        const slots: Record<string, ChatStoreImage[]> = {};
        for (const id of slotIds) {
          const index = tree.slotsById[id]?.slotIndex ?? -1;
          const images = revisionSlotImages(tree, rev, id);
          if (index >= 0 && images && !deleted.includes(index)) slots[String(index)] = images;
        }
        return {
          id: rev.revisionId,
          ...(rev.parentRevisionId ? { parentId: rev.parentRevisionId } : {}),
          targetCount,
          slots,
          ...(deleted.length ? { deletedSlotIndices: deleted } : {}),
          ...(prev?.continuity ? { continuity: structuredClone(prev.continuity) } : {}),
          ...(rev.error ? { error: rev.error } : {}),
        };
      });
      const rebuiltIds = new Set(rebuilt.map((g) => g.id));
      const keptOld =
        old?.generations.filter(
          (g) => !rebuiltIds.has(g.id) && (g.deletedSlotIndices?.length || jobGenerations.get(m.messageId)?.has(g.id)),
        ) ?? [];
      const generations = [...rebuilt, ...structuredClone(keptOld)];
      if (keptOld.some((g) => g.deletedSlotIndices?.length)) {
        const order = new Map(old?.generations.map((g, i) => [g.id, i]));
        generations.sort(
          (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        );
        const ids = new Set(generations.map((g) => g.id));
        for (const g of generations) {
          const parent = oldById.get(g.id)?.parentId;
          if (parent && ids.has(parent)) g.parentId = parent;
        }
      }
      const kind = m.mode === "illustration" ? "illustration" : "inline";
      const existing = result[m.messageId];
      if (existing && existing.kind !== kind)
        throw new HistoryCommandError(`ChatStore message ${m.messageId} cannot be both ${existing.kind} and ${kind}.`);
      result[m.messageId] = {
        kind,
        ...(old?.sources ? { sources: structuredClone(old.sources) } : {}),
        ...(m.mode === "illustration" && m.workflow.requestedCount > 0 ? { requestedCount: m.workflow.requestedCount } : {}),
        generations,
      };
    }
  for (const job of Object.values(e.jobs ?? {})) {
    if (result[job.messageId]) continue;
    const message = e.messages[job.messageId];
    if (message) result[job.messageId] = structuredClone(message);
  }
  return { ...e, messages: result };
}
