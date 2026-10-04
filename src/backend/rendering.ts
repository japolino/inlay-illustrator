/**
 * Bakes inlay images into message HTML using the marker contract:
 * `<!-- inlay_illustrator -->` followed by one `div[data-inlay-illustrator]`
 * per image, placed before its target paragraph. `stripInlayContent` removes
 * every block again, so rendering is idempotent and the interceptor can strip
 * the markup before LLM requests.
 */
import type { Config } from "../shared/config.js";
import { inlayFrameGeometry } from "../shared/inlay-frame.js";
import { MARKER } from "./constants.js";
import { stripInlayContent } from "./inlay-content.js";
import type { GenerationSlotStatus } from "./types.js";

export type InlaySlot = {
  imageId?: string;
  imageUrl?: string;
  imageParameters?: Record<string, unknown>;
  placement?: "cover" | "paragraph";
  /** 1-based target paragraph (blank-line separated blocks of the clean message). */
  paragraph?: number;
  status?: GenerationSlotStatus;
  /** Callers may pass richer slot objects; extra fields are ignored. */
  [key: string]: unknown;
};

export type InlayRecord = {
  chatId?: string;
  messageId?: string;
  swipeId?: number;
  slots?: InlaySlot[];
  /** Pre-V3 parallel-array fields, still accepted for old stored records. */
  imageIds?: string[];
  imageUrls?: string[];
  placements?: Array<"cover" | "paragraph">;
  paragraphs?: number[];
  slotStatuses?: GenerationSlotStatus[];
  [key: string]: unknown;
};

/** Number of non-empty blank-line separated paragraphs. */
export function paragraphCount(content: string): number {
  return content.split(/(\r?\n\s*\r?\n)/).filter((part) => part.trim()).length;
}

function normalizedInlaySlots(record: InlayRecord): InlaySlot[] {
  if (record.slots) return record.slots;
  const count = Math.max(
    record.imageUrls?.length || 0,
    record.paragraphs?.length || 0,
    record.slotStatuses?.length || 0
  );
  return Array.from({ length: count }, (_value, index) => ({
    imageId: record.imageIds?.[index] || "",
    imageUrl: record.imageUrls?.[index] || "",
    placement: record.placements?.[index] || "paragraph",
    paragraph: record.paragraphs?.[index],
    status: record.slotStatuses?.[index]
  }));
}

export function imageUrlFromId(imageId: string): string {
  return `/api/v1/image-gen/results/${encodeURIComponent(imageId)}`;
}

function clampInt(value: unknown, min: number, max: number, fallback = min): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function htmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r\n?|\n/g, "&#10;");
}

function renderInlayBlock(
  url: string,
  imageParameters: Record<string, unknown> | undefined,
  imageId: string,
  chatId: string,
  messageId: string,
  swipeId: number,
  index: number,
  config: Config,
  placement: "cover" | "paragraph" = "paragraph",
  illustrationNumber = index + 1
): string {
  const label = placement === "cover" ? "Cover image" : `Inlay ${illustrationNumber}`;
  const frame = inlayFrameGeometry(imageParameters, placement, config);
  return `${MARKER}\n<div class="inlay-illustrator-image" data-inlay-illustrator="true" data-no-island data-inlay-illustrator-placement="${placement}" style="${frame.wrapperStyle}"><span class="inlay-illustrator-frame" style="${frame.frameStyle}"><img src="${htmlAttr(url)}" alt="${htmlAttr(label)}"${frame.intrinsicAttributes} data-inlay-illustrator-image-id="${htmlAttr(imageId)}" data-inlay-illustrator-chat-id="${htmlAttr(chatId)}" data-inlay-illustrator-message-id="${htmlAttr(messageId)}" data-inlay-illustrator-swipe-id="${swipeId}" data-inlay-illustrator-image-index="${index}" style="${frame.imageStyle}"/></span></div>`;
}

function renderSlotPlaceholder(
  status: GenerationSlotStatus,
  imageParameters: Record<string, unknown> | undefined,
  index: number,
  config: Config,
  placement: "cover" | "paragraph" = "paragraph",
  illustrationNumber = index + 1
): string {
  const subject = placement === "cover" ? "Cover image" : `Illustration ${illustrationNumber}`;
  const label = status === "planned" ? `${subject} is planned.` : status === "failed"
    ? `${subject} failed.`
    : status === "cancelled"
      ? `${subject} cancelled.`
      : `Generating ${subject.toLowerCase()}…`;
  const frame = inlayFrameGeometry(imageParameters, placement, config);
  return `${MARKER}\n<div class="inlay-illustrator-placeholder" data-inlay-illustrator="true" data-no-island data-inlay-illustrator-placement="${placement}" data-inlay-illustrator-image-index="${index}" role="status" style="${frame.wrapperStyle}"><span class="inlay-illustrator-frame" style="${frame.placeholderFrameStyle}">${htmlAttr(label)}</span></div>`;
}

export function renderInlaidMessage(original: string, record: InlayRecord, config: Config): string {
  const cleanOriginal = stripInlayContent(original);
  const blocks = new Map<number, string[]>();
  const coverBlocks: string[] = [];
  const count = Math.max(1, paragraphCount(cleanOriginal));
  const slots = normalizedInlaySlots(record);
  for (const [index, slot] of slots.entries()) {
    const url = slot.imageUrl || "";
    const status = slot.status;
    if (!url && !status) continue;
    const placement = slot.placement === "cover" ? "cover" : "paragraph";
    const illustrationNumber = slots
      .slice(0, index + 1)
      .filter((candidate) => candidate.placement !== "cover").length;
    const paragraph = clampInt(slot.paragraph, 1, count, Math.min(index + 1, count));
    const existing = placement === "cover" ? coverBlocks : blocks.get(paragraph) || [];
    existing.push(url
      ? renderInlayBlock(
        url,
        slot.imageParameters,
        slot.imageId || "",
        record.chatId || "",
        record.messageId || "",
        record.swipeId || 0,
        index,
        config,
        placement,
        illustrationNumber
      )
      : renderSlotPlaceholder(
        status || "pending",
        slot.imageParameters,
        index,
        config,
        placement,
        illustrationNumber
      ));
    if (placement === "paragraph") blocks.set(paragraph, existing);
  }

  const tokens = cleanOriginal.trimEnd().split(/(\r?\n\s*\r?\n)/);
  let paragraph = 0;
  const output: string[] = [];
  if (coverBlocks.length && config.coverImagePosition !== "bottom") output.push(`${coverBlocks.join("\n\n")}\n\n`);
  for (const token of tokens) {
    if (!token.trim()) {
      output.push(token);
      continue;
    }
    paragraph += 1;
    const inlays = blocks.get(paragraph);
    if (inlays?.length) output.push(`${inlays.join("\n\n")}\n\n`);
    output.push(token);
  }
  const unused = [...blocks.entries()].filter(([number]) => number > paragraph).flatMap(([, inlays]) => inlays);
  if (unused.length) output.push(`\n\n${unused.join("\n\n")}`);
  if (coverBlocks.length && config.coverImagePosition === "bottom") output.push(`\n\n${coverBlocks.join("\n\n")}`);
  return output.join("");
}
