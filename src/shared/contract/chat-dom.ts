/**
 * Chat DOM contract (Asset Maid 0.9.88 port): what the backend bakes into Lumiverse message content and how the
 * frontend decorates it and reports clicks.
 *
 * Asset Maid wrote `<div class="am-illustration-projection">…<img src="{{raw::NAME}}">` blocks into the message text at
 * paragraph offsets (spec/pipeline.md §1.10, `ybt` 121631) and drew its footer / history edge controls with DOM patching
 * (spec/ui.md §5.1, §6.1). The port keeps the existing inlay marker contract instead:
 *
 * - The BACKEND bakes one block per selected entry into the message content (`renderIllustrationBlock`, `bakeIllustrations`).
 *   A block is `<!-- inlay_illustrator -->` + one `div[data-inlay-illustrator="true"]` that contains only a `span` and an `img`
 *   (no nested `div`: the strip regex ends at the first `</div>`). The interceptor removes every block before LLM requests,
 *   so baking is idempotent (`strip -> bake`).
 * - The FRONTEND never edits message content. It injects (ctx.dom.inject) the interactive controls: one footer per
 *   assistant message (generate / reroll / retry / cancel, revision pager) and edge controls over each baked image
 *   (history previous / next, regenerate, zoom). It reads identities from the `data-inlay-illustrator-*` attributes
 *   (`readIllustrationAttributes`) and per-message state from the RPC method `chatDom.getMessageStates`.
 * - Clicks become RPC calls (`CHAT_ACTION_RPC`). After any change the backend re-bakes the message and emits
 *   `chatData.changed {chatId, messageKeys}`; the frontend then refetches `chatDom.getMessageStates`.
 *   Progress arrives as `generation.progress` / `generation.finished` events (busy state of the footer).
 *
 * Pure module: no DOM, no host calls (shared by backend and frontend).
 */
import type { IllustrationPlanStatus } from "./chat.js";
import type { GenerationOrigin, HistoryEntryKind } from "./history.js";
import type { GenerationJobSnapshot, RpcError, RpcMethod } from "./rpc.js";

/* ------------------------------------------------------------------------------------------------
 * Baked block
 * ---------------------------------------------------------------------------------------------- */

/** Marker comment before every baked block (unchanged from 0.9.x). */
export const INLAY_MARKER = "<!-- inlay_illustrator -->";
/** Classes of the baked wrapper: our class + Asset Maid's projection class (kept for AM CSS / selectors). */
export const ILLUSTRATION_BLOCK_CLASS = "inlay-illustrator-image am-illustration-projection";
export const ILLUSTRATION_FRAME_CLASS = "inlay-illustrator-frame am-image";
export const ILLUSTRATION_IMG_CLASS = "inlay-illustrator-img am-image__media";

/** Attribute names on the baked wrapper `div` (all values HTML-escaped strings). */
export const ILLUSTRATION_ATTR = {
  /** Always "true"; the interceptor and the frontend select blocks by it. */
  block: "data-inlay-illustrator",
  /** Always "paragraph" for Asset Maid blocks (legacy 0.9.x blocks may say "cover"). */
  placement: "data-inlay-illustrator-placement",
  chatId: "data-inlay-illustrator-chat-id",
  /** Lumiverse message id (without swipe). */
  messageId: "data-inlay-illustrator-message-id",
  /** Swipe index the block was baked into. */
  swipeId: "data-inlay-illustrator-swipe-id",
  /** Image History message key `illustration:<messageId>@<swipe>` (AM `data-am-chat-history-message-key`). */
  messageKey: "data-inlay-illustrator-message-key",
  /** Revision shown (AM `data-am-chat-history-revision-id`). */
  revisionId: "data-inlay-illustrator-revision-id",
  /** `illustration:<messageId>@<swipe>:slot:<n>` (AM `data-am-slot-id`). */
  slotId: "data-inlay-illustrator-slot-id",
  /** 0-based paragraph gap index (AM `data-am-slot-index`). */
  slotIndex: "data-inlay-illustrator-slot-index",
  /** Selected History entry id. */
  entryId: "data-inlay-illustrator-entry-id",
  /** Generated asset name `<label>.__am__.chat.<uuid>` (AM `data-am-asset`). */
  asset: "data-inlay-illustrator-asset",
  /** Lumiverse image-gen result id (image URL = `/api/v1/image-gen/results/<id>`). */
  imageId: "data-inlay-illustrator-image-id",
  /** 1-based position of the selected entry inside the slot history, and the history size (AM `-index`/`-count`). */
  entryIndex: "data-inlay-illustrator-entry-index",
  entryCount: "data-inlay-illustrator-entry-count",
  /** "true" when the regenerate control may be shown (active revision, generated entry). */
  canRegenerate: "data-inlay-illustrator-can-regenerate",
  /** 0-based index of the block in the message (document order); legacy lightbox attribute. */
  imageIndex: "data-inlay-illustrator-image-index",
} as const;
export type IllustrationAttrKey = keyof typeof ILLUSTRATION_ATTR;

/** Default intrinsic size when an entry has no size (AM 832x1216). */
export const DEFAULT_ILLUSTRATION_WIDTH = 832;
export const DEFAULT_ILLUSTRATION_HEIGHT = 1216;
/** CSS custom property the frontend may set on the chat root to restyle widths live (AM `--am-chat-image-width`). */
export const CHAT_IMAGE_WIDTH_VAR = "--ii-am-chat-image-width";

export interface IllustrationBlockInput {
  chatId: string;
  messageId: string;
  swipeId: number;
  messageKey: string;
  revisionId: string;
  slotId: string;
  slotIndex: number;
  entryId: string;
  assetName: string;
  imageId: string;
  /** Image URL; default `imageResultUrl(imageId)`. */
  url?: string;
  width?: number;
  height?: number;
  entryIndex: number;
  entryCount: number;
  canRegenerate: boolean;
  /** Block position in the message (document order). */
  imageIndex: number;
  /** `runtime.chatImageWidthPercent` (30..100, default 70). */
  widthPercent?: number;
  /** Alt / aria text, default "Illustration <slotIndex+1>". */
  alt?: string;
}

/** Parsed attributes of a baked block (frontend side). Numbers are NaN-safe (-1 / 0 when missing). */
export interface IllustrationAttributes {
  chatId: string;
  messageId: string;
  swipeId: number;
  messageKey: string;
  revisionId: string;
  slotId: string;
  slotIndex: number;
  entryId: string;
  assetName: string;
  imageId: string;
  entryIndex: number;
  entryCount: number;
  canRegenerate: boolean;
  imageIndex: number;
}

export function imageResultUrl(imageId: string): string {
  return `/api/v1/image-gen/results/${encodeURIComponent(imageId)}`;
}
/** Inverse of {@link imageResultUrl} (also accepts absolute URLs and `?size=` queries). */
export function imageIdFromResultUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const match = /\/api\/v1\/image-gen\/results\/([^/?#]+)/u.exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/\r\n?|\n/gu, "&#10;");
}

function clampSize(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(8192, n) : fallback;
}
function clampPercent(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(100, Math.max(30, n)) : 70;
}

/** Inline styles of a baked block (AM `wbt`/`BI` simplified: width % of the message column, aspect from the image). */
export function illustrationBlockStyles(width: number, height: number, widthPercent: number): { wrapper: string; frame: string; image: string } {
  const pct = clampPercent(widthPercent);
  const ratio = `${width}/${height}`;
  return {
    wrapper: "display:flex;flex-direction:column;align-items:center;margin:10px 0;width:100%;",
    frame: `position:relative;display:block;width:var(${CHAT_IMAGE_WIDTH_VAR},${pct}%);max-width:100%;max-height:min(994px,85vh);aspect-ratio:${ratio};overflow:hidden;border-radius:8px;`,
    image: `display:block;width:100%;height:100%;aspect-ratio:${ratio};object-fit:contain;border-radius:8px;cursor:zoom-in;`,
  };
}

/** HTML of one baked block (marker line + div). No trailing blank line. */
export function renderIllustrationBlock(input: IllustrationBlockInput): string {
  const width = clampSize(input.width, DEFAULT_ILLUSTRATION_WIDTH);
  const height = clampSize(input.height, DEFAULT_ILLUSTRATION_HEIGHT);
  const styles = illustrationBlockStyles(width, height, input.widthPercent ?? 70);
  const a = ILLUSTRATION_ATTR;
  const attr = (name: string, value: string | number | boolean) => ` ${name}="${escapeHtmlAttribute(String(value))}"`;
  const url = input.url || imageResultUrl(input.imageId);
  const alt = input.alt ?? `Illustration ${input.slotIndex + 1}`;
  return (
    `${INLAY_MARKER}\n<div class="${ILLUSTRATION_BLOCK_CLASS}"${attr(a.block, "true")} data-no-island${attr(a.placement, "paragraph")}` +
    attr(a.chatId, input.chatId) +
    attr(a.messageId, input.messageId) +
    attr(a.swipeId, Math.max(0, Math.trunc(input.swipeId) || 0)) +
    attr(a.messageKey, input.messageKey) +
    attr(a.revisionId, input.revisionId) +
    attr(a.slotId, input.slotId) +
    attr(a.slotIndex, input.slotIndex) +
    attr(a.entryId, input.entryId) +
    attr(a.asset, input.assetName) +
    attr(a.imageId, input.imageId) +
    attr(a.entryIndex, input.entryIndex) +
    attr(a.entryCount, input.entryCount) +
    attr(a.canRegenerate, input.canRegenerate ? "true" : "false") +
    attr(a.imageIndex, input.imageIndex) +
    ` style="${styles.wrapper}">` +
    `<span class="${ILLUSTRATION_FRAME_CLASS}"${attr(a.slotId, input.slotId)} style="${styles.frame}">` +
    `<img class="${ILLUSTRATION_IMG_CLASS}" src="${escapeHtmlAttribute(url)}" width="${width}" height="${height}" alt="${escapeHtmlAttribute(alt)}" loading="lazy" decoding="async"` +
    attr(a.imageId, input.imageId) +
    attr(a.asset, input.assetName) +
    ` style="${styles.image}"/></span></div>`
  );
}

/** Reads a baked block's attributes through any getter (`el.getAttribute.bind(el)` on the frontend). */
export function readIllustrationAttributes(get: (name: string) => string | null | undefined): IllustrationAttributes | null {
  const a = ILLUSTRATION_ATTR;
  if (get(a.block) !== "true") return null;
  const s = (name: string) => String(get(name) ?? "");
  const n = (name: string, fallback: number) => {
    const raw = get(name);
    const v = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
    return Number.isFinite(v) ? Math.trunc(v) : fallback;
  };
  const slotId = s(a.slotId);
  const messageKey = s(a.messageKey);
  if (!slotId || !messageKey) return null;
  return {
    chatId: s(a.chatId),
    messageId: s(a.messageId),
    swipeId: n(a.swipeId, 0),
    messageKey,
    revisionId: s(a.revisionId),
    slotId,
    slotIndex: n(a.slotIndex, -1),
    entryId: s(a.entryId),
    assetName: s(a.asset),
    imageId: s(a.imageId),
    entryIndex: n(a.entryIndex, 0),
    entryCount: n(a.entryCount, 0),
    canRegenerate: get(a.canRegenerate) === "true",
    imageIndex: n(a.imageIndex, -1),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Paragraph offsets (AM X0e 157581 / oIe 171484)
 * ---------------------------------------------------------------------------------------------- */

/** AM paragraph separator (blank line(s)); not applied inside `<Thoughts>…</Thoughts>`. */
export const PARAGRAPH_SEPARATOR = /\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*/gu;

/**
 * Placement rule (AM `insertionOffsets`): slot `n` is the gap after the (n+1)-th non-empty paragraph of the CLEAN message
 * (strip first). Its blocks are inserted right after that blank-line separator, i.e. at the start of the next paragraph,
 * each followed by one blank line ("\n\n"); several blocks at one offset are joined by a blank line.
 * Slot indices that no longer exist (text edited) are appended at the end, separated by a blank line.
 * The backend owns the implementation (src/backend/pipeline); this type documents the input.
 */
export interface BakeBlock { slotIndex: number; html: string }

/* ------------------------------------------------------------------------------------------------
 * Native asset suppression carrier (AM `Vyt` 120803 / `cH` 120818)
 * ---------------------------------------------------------------------------------------------- */

/**
 * When `nativeAssetVisibility === "hidden"`, the backend wraps each native image markup of an illustrated message in
 * a hidden carrier. The interceptor and re-slotting decode it back to the original markup.
 * `<span class="am-native-asset-suppression" data-inlay-illustrator-suppressed="NAS1<FNV1a32 hex upper><len base36 upper>"
 *  data-inlay-illustrator-suppressed-payload="<encodeURIComponent(original)>" aria-hidden="true" hidden></span>`
 */
export const SUPPRESSION_CLASS = "am-native-asset-suppression";
export const SUPPRESSION_ID_ATTR = "data-inlay-illustrator-suppressed";
export const SUPPRESSION_PAYLOAD_ATTR = "data-inlay-illustrator-suppressed-payload";

/* ------------------------------------------------------------------------------------------------
 * Frontend-injected controls
 * ---------------------------------------------------------------------------------------------- */

/** Attribute that carries the action name on injected controls. */
export const CHAT_ACTION_ATTR = "data-ii-action";
/** Class of the footer root the frontend injects under each eligible assistant message. */
export const CHAT_FOOTER_CLASS = "ii-am-illustration-footer";
/** Class of the edge-control overlay the frontend injects into a baked block's frame. */
export const CHAT_EDGE_CONTROLS_CLASS = "ii-am-chat-history-edge-controls";

/**
 * Chat-side actions. Footer: generate (attempt kind from `ChatMessageUiState.attempt`), cancel, revision pager.
 * Image edge: history pager, regenerate, zoom (click on the image), delete slot (from zoom).
 */
export const CHAT_ACTIONS = [
  "generate",
  "cancel",
  "revision-previous",
  "revision-next",
  "history-previous",
  "history-next",
  "regenerate",
  "zoom",
  "delete-slot",
] as const;
export type ChatAction = (typeof CHAT_ACTIONS)[number];

/**
 * RPC per action:
 * - generate          -> `generation.start {chatId, messageId, swipeIndex, attemptKind: state.attempt}`
 * - cancel            -> `generation.cancel {chatId, messageKey}` (or `{jobId}`)
 * - revision-*        -> `history.selectRevision {chatId, messageKey, revisionId}` (wraps around like AM; the backend re-bakes)
 * - history-*         -> `history.selectEntry {chatId, slotId, entryId}` (wraps around; persisted - port fix; the backend re-bakes)
 * - regenerate        -> `generation.regenerateSlot {chatId, messageKey, slotId, entryId}` (new random seed, AM keepSeed:false)
 * - zoom              -> `zoom.getDetails {chatId, slotId, entryId}` then the overlay's zoom viewer
 * - delete-slot       -> `history.prepareSlotDeletion` then `history.deleteSlot {previewToken}`
 */
export const CHAT_ACTION_RPC: Readonly<Record<ChatAction, readonly RpcMethod[]>> = Object.freeze({
  generate: ["generation.start"],
  cancel: ["generation.cancel"],
  "revision-previous": ["history.selectRevision"],
  "revision-next": ["history.selectRevision"],
  "history-previous": ["history.selectEntry"],
  "history-next": ["history.selectEntry"],
  regenerate: ["generation.regenerateSlot"],
  zoom: ["zoom.getDetails"],
  "delete-slot": ["history.prepareSlotDeletion", "history.deleteSlot"],
});

/** Wrap-around pager step used by both pagers (AM `(i±1+n)%n`). `index` is 0-based. */
export function pagerStep(index: number, count: number, direction: "previous" | "next"): number {
  if (count <= 0) return -1;
  const i = Math.min(Math.max(0, Math.trunc(index) || 0), count - 1);
  return direction === "next" ? (i + 1) % count : (i - 1 + count) % count;
}

/* ------------------------------------------------------------------------------------------------
 * Per-message UI state (`chatDom.getMessageStates`)
 * ---------------------------------------------------------------------------------------------- */

export type FooterAttempt = "initial" | "reroll" | "retry";

/** English footer labels (Korean originals from spec/ui.md §6.1.3). */
export const CHAT_FOOTER_LABELS = Object.freeze({
  initial: { en: "Analyze and generate images for this message", ko: "이 메시지의 이미지 분석 및 생성" },
  reroll: { en: "Re-analyze this message and regenerate everything", ko: "이 메시지를 새로 분석하여 모두 다시 생성" },
  retry: { en: "Continue retrying the failed analysis or image generation", ko: "실패한 분석 또는 이미지 생성을 이어서 재시도" },
  revisionPrevious: { en: "Previous generation revision", ko: "이전 생성 회차" },
  revisionNext: { en: "Next generation revision", ko: "다음 생성 회차" },
  revisionGroup: { en: "Message image generation revision {i}/{n}", ko: "메시지 이미지 생성 회차 {i}/{n}" },
  allSlotsDeleted: { en: "All image slots of this revision were deleted.", ko: "이 회차의 이미지 슬롯이 모두 삭제되었습니다." },
  historyPrevious: { en: "Previous image", ko: "이전 이미지" },
  historyNext: { en: "Next image", ko: "다음 이미지" },
  historyGroup: { en: "Image history {i}/{n}", ko: "이미지 히스토리 {i}/{n}" },
  imageControls: { en: "Image controls", ko: "이미지 제어" },
  regenerate: { en: "Regenerate image", ko: "이미지 재생성" },
  regenerating: { en: "Regenerating image", ko: "이미지 재생성 중" },
  generating: { en: "Generating image", ko: "이미지 생성 중" },
  regenerateFailed: { en: "Image regeneration failed", ko: "이미지 재생성 실패" },
  generateFailed: { en: "Chat image generation failed", ko: "채팅 이미지 생성 실패" },
});

export interface ChatSlotEntryUi {
  entryId: string;
  kind: HistoryEntryKind;
  origin?: GenerationOrigin;
  assetName: string;
  imageId: string;
  url: string;
  width: number;
  height: number;
  createdAt: number;
}
export interface ChatSlotUi {
  slotId: string;
  slotIndex: number;
  /** Entries in history order (oldest first, AM `compareHistoryEntries`). */
  entries: ChatSlotEntryUi[];
  /** Entry baked into the message (the persisted default entry). */
  selectedEntryId: string;
  canRegenerate: boolean;
  /** A single-slot regeneration is running. */
  regenerating: boolean;
}
export interface ChatRevisionUi {
  revisionId: string;
  /** 1-based position. */
  index: number;
  status: "complete" | "error";
  entryCount: number;
  deletedSlotIndices: number[];
  createdAt: number;
}
export interface ChatMessageUiState {
  chatId: string;
  /** Lumiverse message id + swipe; `messageKey` = `illustration:<messageId>@<swipeIndex>`. */
  messageId: string;
  swipeIndex: number;
  messageKey: string;
  /** Assistant message with non-empty text (AM footer eligibility). */
  eligible: boolean;
  /** Footer button (AM `U5`). */
  attempt: FooterAttempt;
  planStatus: IllustrationPlanStatus;
  /** A message job is queued or running (footer busy + spinner; clicks other than revision paging are ignored). */
  busy: boolean;
  job?: GenerationJobSnapshot;
  revisions: ChatRevisionUi[];
  /** Revision currently baked into the message ("" = none). */
  activeRevisionId: string;
  /** Slots of the active revision. */
  slots: ChatSlotUi[];
  /** Active revision has 0 entries and some deleted slots (footer empty text). */
  allSlotsDeleted: boolean;
  /** Last failure of the plan (for the retry tooltip / toast). */
  lastError?: RpcError;
}
