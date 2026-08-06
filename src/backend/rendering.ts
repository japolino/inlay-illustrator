import { DEFAULT_CONFIG, type Config, type PerspectiveMode } from "../shared/config.js";
import { MARKER } from "./constants.js";
import { stripInlayContent } from "./inlay-content.js";
import { paragraphCount } from "./paragraphs.js";
import type { CreativeConcept, GenerationSlotStatus } from "./types.js";
import { clampInt } from "./utils.js";

type InlayRecord = {
  chatId?: string;
  messageId?: string;
  swipeId?: number;
  imageIds?: string[];
  imageUrls: string[];
  prompts: string[];
  negativePrompts?: string[];
  perspectiveModes?: PerspectiveMode[];
  perspectiveSources?: Array<"adaptive" | "manual">;
  creativeConcepts?: Array<CreativeConcept | null>;
  paragraphs: number[];
  slotStatuses?: GenerationSlotStatus[];
};

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

function renderInlayBlock(
  url: string,
  _prompt: string,
  _negativePrompt: string,
  perspectiveMode: PerspectiveMode | undefined,
  _perspectiveSource: "adaptive" | "manual" | undefined,
  _creativeConcept: CreativeConcept | null | undefined,
  imageId: string,
  chatId: string,
  messageId: string,
  swipeId: number,
  index: number,
  config: Config
): string {
  const label = `Inlay ${index + 1}`;
  const asset = perspectiveMode === "asset";
  const width = clampInt(
    asset ? config.assetImageWidth : config.inlayImageWidth,
    120,
    2400,
    asset ? DEFAULT_CONFIG.assetImageWidth : DEFAULT_CONFIG.inlayImageWidth
  );
  const maxHeight = clampInt(config.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh);
  return `${MARKER}\n<div class="inlay-illustrator-image" data-inlay-illustrator="true" style="display:flex;justify-content:center;align-items:center;margin:10px 0;width:100%;"><img src="${htmlAttr(url)}" alt="${htmlAttr(label)}" data-inlay-illustrator-image-id="${htmlAttr(imageId)}" data-inlay-illustrator-chat-id="${htmlAttr(chatId)}" data-inlay-illustrator-message-id="${htmlAttr(messageId)}" data-inlay-illustrator-swipe-id="${swipeId}" data-inlay-illustrator-image-index="${index}" style="display:block;width:min(100%, ${width}px);max-height:${maxHeight}vh;height:auto;object-fit:contain;border-radius:8px;cursor:zoom-in;"/></div>`;
}

function renderSlotPlaceholder(status: GenerationSlotStatus, index: number): string {
  const label = status === "failed"
    ? `Illustration ${index + 1} failed. Use Generate latest to retry.`
    : status === "cancelled"
      ? `Illustration ${index + 1} cancelled.`
      : `Generating illustration ${index + 1}…`;
  return `${MARKER}\n<div class="inlay-illustrator-placeholder" data-inlay-illustrator="true" data-inlay-illustrator-image-index="${index}" role="status">${htmlAttr(label)}</div>`;
}

export function renderInlaidMessage(original: string, record: InlayRecord, config: Config): string {
  const cleanOriginal = stripInlayContent(original);
  const blocks = new Map<number, string[]>();
  const count = Math.max(1, paragraphCount(cleanOriginal));
  const slotCount = Math.max(record.imageUrls.length, record.paragraphs.length, record.slotStatuses?.length || 0);
  for (let index = 0; index < slotCount; index += 1) {
    const url = record.imageUrls[index] || "";
    const status = record.slotStatuses?.[index];
    if (!url && !status) continue;
    const paragraph = clampInt(record.paragraphs[index], 1, count, Math.min(index + 1, count));
    const existing = blocks.get(paragraph) || [];
    existing.push(url
      ? renderInlayBlock(
        url,
        record.prompts[index] || "",
        record.negativePrompts?.[index] || "",
        record.perspectiveModes?.[index],
        record.perspectiveSources?.[index],
        record.creativeConcepts?.[index],
        record.imageIds?.[index] || "",
        record.chatId || "",
        record.messageId || "",
        record.swipeId || 0,
        index,
        config
      )
      : renderSlotPlaceholder(status || "pending", index));
    blocks.set(paragraph, existing);
  }

  const tokens = cleanOriginal.trimEnd().split(/(\r?\n\s*\r?\n)/);
  let paragraph = 0;
  const output: string[] = [];
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
