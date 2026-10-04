/**
 * Message markup of the chat pipeline (pure, no host calls):
 * - strip our baked blocks (contract `chat-dom.ts`, legacy 0.9.x blocks too) and decode native-asset suppression carriers
 *   (AM `F5` 168870 = `obt(lbt(...))`: the LLM and the slotter see the original text with the original native tokens);
 * - native asset suppression carriers (AM `Vyt` 120803 / `zbe` 120771 / `cH` 120818 in ../inlay-content.ts, `Yyt` 120824 here);
 * - bake: insert illustration blocks at Asset Maid's paragraph insertion offsets (AM `oIe` 171484-171538).
 */
import type { BakeBlock } from "../../shared/contract/index.js";
import {
  buildIllustrationSlots,
  detectNativeAssetMarkups,
  splitParagraphSlots,
  type IllustrationSlotBuild,
  type NativeAssetDetector,
  type NativeAssetMarkup,
  type ParagraphSlotSplit,
} from "../../engine/text/index.js";
import { cleanInlayText, decodeSuppressionCarriers, encodeSuppressionCarrier, removeSuppressionCarriers, suppressionCarrierId } from "../inlay-content.js";

export { decodeSuppressionCarriers, encodeSuppressionCarrier, removeSuppressionCarriers, suppressionCarrierId };

/** AM `Yyt` 120824: wrap each native markup occurrence (verified at its offset; overlaps keep the first) into a carrier. */
export function suppressNativeMarkups(text: string, markups: readonly NativeAssetMarkup[]): string {
  if (!text || !markups.length) return text;
  const ranges = markups
    .flatMap((m) => {
      const markup = String(m.sourceMarkup ?? "");
      const offset = Number(m.sourceOffset);
      if (!markup || !Number.isFinite(offset) || offset < 0) return [];
      const start = Math.floor(offset);
      const end = start + markup.length;
      return text.slice(start, end) === markup ? [{ start, end, value: encodeSuppressionCarrier(markup) }] : [];
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: typeof ranges = [];
  for (const r of ranges) {
    const last = kept.at(-1);
    if (!(last && r.start < last.end)) kept.push(r);
  }
  return kept.sort((a, b) => b.start - a.start).reduce((acc, r) => `${acc.slice(0, r.start)}${r.value}${acc.slice(r.end)}`, text);
}

/* ------------------------------------------------------------------------------------------------
 * Clean text (what the LLM / analyzer / slotter sees)
 * ---------------------------------------------------------------------------------------------- */

/** Strip every baked block (current + legacy) and decode suppression carriers. Idempotent. */
export function cleanMessageContent(content: string): string {
  return cleanInlayText(String(content ?? ""));
}

/** Interceptor message shape (subset of `LlmMessageDTO`). */
export interface InterceptorMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * Interceptor strip (AM beforeRequest `iq`/`F5` 168867): our blocks are removed and suppression carriers decoded in every
 * message (assistant turns carry the blocks; other roles are processed too in case a user pasted a block). Unchanged
 * messages keep their identity.
 */
export function stripForInterceptor<T extends InterceptorMessage>(messages: readonly T[]): T[] {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      const content = cleanMessageContent(message.content);
      return content === message.content ? message : { ...message, content };
    }
    if (!Array.isArray(message.content)) return message;
    let changed = false;
    const content = message.content.map((part) => {
      if (!part || part.type !== "text" || typeof part.text !== "string") return part;
      const text = cleanMessageContent(part.text);
      if (text === part.text) return part;
      changed = true;
      return { ...part, text };
    });
    return changed ? ({ ...message, content } as T) : message;
  });
}

/* ------------------------------------------------------------------------------------------------
 * Slots
 * ---------------------------------------------------------------------------------------------- */

/** Paragraph slots of a message (AM `nIe` 171443) computed on the clean text. */
export function messageSlots(messageKey: string, content: string, detectors: readonly NativeAssetDetector[] = []): IllustrationSlotBuild & { clean: string } {
  const clean = cleanMessageContent(content);
  return { ...buildIllustrationSlots({ messageKey, content: clean, nativeAssetDetectors: [...detectors] }), clean };
}

/** AM `rIe` 171433 over a text that may contain carriers: paragraph text drops carriers and native markups. */
function splitWithoutMarkups(messageKey: string, text: string, markups: readonly string[]): ParagraphSlotSplit {
  const list = [...new Set(markups.map((m) => String(m ?? "")).filter(Boolean))].sort((a, b) => b.length - a.length);
  return splitParagraphSlots(messageKey, text, {
    paragraphText(raw) {
      let out = removeSuppressionCarriers(raw);
      for (const m of list) out = out.split(m).join("");
      return out;
    },
  });
}

/* ------------------------------------------------------------------------------------------------
 * Bake (publish)
 * ---------------------------------------------------------------------------------------------- */

export interface BakeInput {
  /** Current message content (may already contain baked blocks / carriers). */
  content: string;
  /** Plan key `illustration:<id>@<swipe>` (only used for slot ids). */
  messageKey: string;
  /** One block per selected entry (`renderIllustrationBlock`), slot index = paragraph gap. */
  blocks: readonly BakeBlock[];
  /** `nativeAssetVisibility === "hidden"` and the revision has entries (AM `kr` 173295). */
  suppressNative: boolean;
  nativeAssetDetectors?: readonly NativeAssetDetector[];
}

export interface BakeResult {
  text: string;
  changed: boolean;
  /** Slot indices that no longer exist in the edited text (appended at the end; contract chat-dom.ts). */
  orphanSlotIndices: number[];
}

/**
 * Re-bake a message: strip -> (suppress native markups) -> insert blocks after the blank-line separator of their gap
 * (AM `oIe` 171526-171537: blocks of one offset joined by a blank line, a blank line after the group; "\r\n" kept when the
 * text uses it). Idempotent: `bake(bake(x)) === bake(x)`.
 */
export function bakeMessage(input: BakeInput): BakeResult {
  const clean = cleanMessageContent(input.content);
  const markups = detectNativeAssetMarkups(clean, { customImageTokenDetectors: [...(input.nativeAssetDetectors ?? [])] });
  const blocks = [...input.blocks].filter((b) => b.html).sort((a, b) => a.slotIndex - b.slotIndex);
  if (!blocks.length) return { text: clean, changed: clean !== input.content, orphanSlotIndices: [] };
  const split = splitWithoutMarkups(input.messageKey, clean, markups.map((m) => m.sourceMarkup));
  const nl = clean.includes("\r\n") ? "\r\n" : "\n";
  const sep = `${nl}${nl}`;
  type Edit = { start: number; end: number; value: string; order: number };
  const edits: Edit[] = [];
  if (input.suppressNative)
    for (const m of markups) {
      const start = Math.floor(Number(m.sourceOffset));
      const end = start + m.sourceMarkup.length;
      if (m.sourceMarkup && clean.slice(start, end) === m.sourceMarkup) edits.push({ start, end, value: encodeSuppressionCarrier(m.sourceMarkup), order: 0 });
    }
  // overlapping wraps: keep the first (AM Yyt)
  edits.sort((a, b) => a.start - b.start || b.end - a.end);
  const wraps: Edit[] = [];
  for (const e of edits) {
    const last = wraps.at(-1);
    if (!(last && e.start < last.end)) wraps.push(e);
  }
  const groups = new Map<number, string[]>();
  const orphan: string[] = [];
  const orphanSlotIndices: number[] = [];
  for (const b of blocks) {
    const offset = split.insertionOffsets[b.slotIndex];
    if (offset === undefined || b.slotIndex < 0) {
      orphan.push(b.html);
      orphanSlotIndices.push(b.slotIndex);
      continue;
    }
    const g = groups.get(offset) ?? [];
    g.push(b.html);
    groups.set(offset, g);
  }
  const inserts: Edit[] = [...groups.entries()].map(([offset, html]) => ({
    start: offset,
    end: offset,
    value: (offset === clean.length && clean.trim() && !clean.endsWith(sep) ? sep : "") + html.join(sep) + (offset < clean.length ? sep : ""),
    order: 1,
  }));
  // Right to left; at the same position the wrap (range) is applied first, then the insert goes before it.
  const all = [...wraps, ...inserts].sort((a, b) => b.start - a.start || a.order - b.order);
  let text = all.reduce((acc, e) => `${acc.slice(0, e.start)}${e.value}${acc.slice(e.end)}`, clean);
  if (orphan.length) text = `${text}${text.trim() && !text.endsWith(sep) ? sep : ""}${orphan.join(sep)}`;
  return { text, changed: text !== input.content, orphanSlotIndices };
}
