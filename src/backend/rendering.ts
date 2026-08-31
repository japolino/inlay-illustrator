import { DEFAULT_CONFIG, resolveInlayImageAspect, type Config, type PerspectiveMode } from "../shared/config.js";
import { MARKER } from "./constants.js";
import { stripInlayContent } from "./inlay-content.js";
import { paragraphCount } from "./paragraphs.js";
import type { CreativeConcept, GenerationSlotStatus } from "./types.js";
import { clampInt } from "./utils.js";

type InlaySlot = {
  imageId?: string;
  imageUrl?: string;
  prompt?: string;
  negativePrompt?: string;
  perspectiveMode?: PerspectiveMode;
  perspectiveSource?: "adaptive" | "manual";
  creativeConcept?: CreativeConcept | null;
  imageParameters?: Record<string, unknown>;
  placement?: "cover" | "paragraph";
  paragraph?: number;
  status?: GenerationSlotStatus;
};

type InlayRecord = {
  chatId?: string;
  messageId?: string;
  swipeId?: number;
  slots?: InlaySlot[];
  /** V2 compatibility fields. New records use slots exclusively. */
  imageIds?: string[];
  imageUrls?: string[];
  prompts?: string[];
  negativePrompts?: string[];
  perspectiveModes?: PerspectiveMode[];
  perspectiveSources?: Array<"adaptive" | "manual">;
  creativeConcepts?: Array<CreativeConcept | null>;
  placements?: Array<"cover" | "paragraph">;
  paragraphs?: number[];
  slotStatuses?: GenerationSlotStatus[];
};

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
    prompt: record.prompts?.[index] || "",
    negativePrompt: record.negativePrompts?.[index] || "",
    perspectiveMode: record.perspectiveModes?.[index],
    perspectiveSource: record.perspectiveSources?.[index],
    creativeConcept: record.creativeConcepts?.[index],
    placement: record.placements?.[index] || "paragraph",
    paragraph: record.paragraphs?.[index],
    status: record.slotStatuses?.[index]
  }));
}

export function imageUrlFromId(imageId: string): string {
  return `/api/v1/image-gen/results/${encodeURIComponent(imageId)}`;
}

function htmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r\n?|\n/g, "&#10;");
}

function positiveDimension(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function frameGeometry(
  imageParameters: Record<string, unknown> | undefined,
  placement: "cover" | "paragraph",
  config: Config
): { wrapperStyle: string; frameStyle: string; placeholderFrameStyle: string; intrinsicAttributes: string } {
  const maxHeight = clampInt(
    placement === "cover" ? config.coverImageMaxHeightVh : config.inlayImageMaxHeightVh,
    10,
    100,
    placement === "cover" ? DEFAULT_CONFIG.coverImageMaxHeightVh : DEFAULT_CONFIG.inlayImageMaxHeightVh
  );
  const aspect = resolveInlayImageAspect(config.inlayImageAspect);
  const viewportWidth = `calc(${maxHeight}vh * ${aspect.w} / ${aspect.h})`;
  // Preserve staging's optional cover-width cap. Paragraph and Asset slots use
  // the Legacy display contract: aspect ratio + viewport-height cap only.
  const boxWidth = placement === "cover"
    ? `min(100%, ${clampInt(config.coverImageWidth, 120, 2400, DEFAULT_CONFIG.coverImageWidth)}px, ${viewportWidth})`
    : `min(100%, ${viewportWidth})`;
  const parameters = imageParameters && Object.keys(imageParameters).length > 0
    ? imageParameters
    : config.imageParameters;
  const intrinsicWidth = positiveDimension(parameters.width);
  const intrinsicHeight = positiveDimension(parameters.height);
  const commonFrameStyle = `width:${boxWidth};max-width:100%;aspect-ratio:${aspect.w}/${aspect.h};`;
  return {
    wrapperStyle: "display:flex;flex-direction:column;justify-content:center;align-items:center;margin:10px 0;width:100%;",
    frameStyle: `display:block;${commonFrameStyle}`,
    placeholderFrameStyle: `display:flex;justify-content:center;align-items:center;${commonFrameStyle}`,
    intrinsicAttributes: intrinsicWidth && intrinsicHeight
      ? ` width="${intrinsicWidth}" height="${intrinsicHeight}"`
      : ""
  };
}

function renderInlayBlock(
  url: string,
  _prompt: string,
  _negativePrompt: string,
  _perspectiveMode: PerspectiveMode | undefined,
  _perspectiveSource: "adaptive" | "manual" | undefined,
  _creativeConcept: CreativeConcept | null | undefined,
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
  const frame = frameGeometry(imageParameters, placement, config);
  return `${MARKER}\n<div class="inlay-illustrator-image" data-inlay-illustrator="true" style="${frame.wrapperStyle}"><span class="inlay-illustrator-frame" style="${frame.frameStyle}"><img src="${htmlAttr(url)}" alt="${htmlAttr(label)}"${frame.intrinsicAttributes} data-inlay-illustrator-image-id="${htmlAttr(imageId)}" data-inlay-illustrator-chat-id="${htmlAttr(chatId)}" data-inlay-illustrator-message-id="${htmlAttr(messageId)}" data-inlay-illustrator-swipe-id="${swipeId}" data-inlay-illustrator-image-index="${index}" style="display:block;width:100%;height:100%;object-fit:cover;border-radius:8px;cursor:zoom-in;"/></span></div>`;
}

function renderSlotPlaceholder(
  status: GenerationSlotStatus,
  _perspectiveMode: PerspectiveMode | undefined,
  imageParameters: Record<string, unknown> | undefined,
  index: number,
  config: Config,
  placement: "cover" | "paragraph" = "paragraph",
  illustrationNumber = index + 1
): string {
  const subject = placement === "cover" ? "Cover image" : `Illustration ${illustrationNumber}`;
  const label = status === "failed"
    ? `${subject} failed. Use Generate latest to retry.`
    : status === "cancelled"
      ? `${subject} cancelled.`
      : `Generating ${subject.toLowerCase()}…`;
  const frame = frameGeometry(imageParameters, placement, config);
  return `${MARKER}\n<div class="inlay-illustrator-placeholder" data-inlay-illustrator="true" data-inlay-illustrator-image-index="${index}" role="status" style="${frame.wrapperStyle}"><span class="inlay-illustrator-frame" style="${frame.placeholderFrameStyle}">${htmlAttr(label)}</span></div>`;
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
        slot.prompt || "",
        slot.negativePrompt || "",
        slot.perspectiveMode,
        slot.perspectiveSource,
        slot.creativeConcept,
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
        slot.perspectiveMode,
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
  if (coverBlocks.length) output.push(`${coverBlocks.join("\n\n")}\n\n`);
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
  return output.join("");
}
