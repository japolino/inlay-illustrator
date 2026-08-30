import { DEFAULT_CONFIG, resolveInlayImageAspect, type Config } from "../shared/config.js";
import { MARKER } from "./constants.js";
import { stripInlayContent } from "./inlay-content.js";
import { paragraphCount } from "./paragraphs.js";
import { clampInt } from "./utils.js";

type InlayRecord = {
  chatId?: string;
  messageId?: string;
  swipeId?: number;
  imageIds?: string[];
  imageUrls: string[];
  prompts: string[];
  negativePrompts?: string[];
  quotes?: string[];
  paragraphs: number[];
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
  quote: string,
  imageId: string,
  chatId: string,
  messageId: string,
  swipeId: number,
  index: number,
  config: Config
): string {
  const label = `Inlay ${index + 1}`;
  // Absolute pixel width is capped by the chat column, so it is not a useful
  // control. Size the box by a preset aspect ratio and a viewport-height cap
  // instead: the box keeps the chosen aspect and object-fit:cover crops the
  // generator output into it.
  const aspect = resolveInlayImageAspect(config.inlayImageAspect);
  const maxHeight = clampInt(config.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh);
  const boxWidth = `min(100%, calc(${maxHeight}vh * ${aspect.w} / ${aspect.h}))`;
  const quoteHtml = quote.trim()
    ? `<blockquote class="inlay-illustrator-inline-quote" style="width:${boxWidth};margin:8px auto 0;padding:8px 12px;text-align:center;font-style:italic;opacity:.9;">${htmlAttr(quote.trim())}</blockquote>`
    : "";
  return `${MARKER}\n<div class="inlay-illustrator-image" data-inlay-illustrator="true" style="display:flex;flex-direction:column;justify-content:center;align-items:center;margin:10px 0;width:100%;"><img alt="${htmlAttr(label)}" data-inlay-illustrator-quote="${htmlAttr(quote)}" data-inlay-illustrator-image-id="${htmlAttr(imageId)}" data-inlay-illustrator-chat-id="${htmlAttr(chatId)}" data-inlay-illustrator-message-id="${htmlAttr(messageId)}" data-inlay-illustrator-swipe-id="${swipeId}" data-inlay-illustrator-image-index="${index}" data-inlay-illustrator-image-url="${htmlAttr(url)}" style="display:block;width:${boxWidth};aspect-ratio:${aspect.w}/${aspect.h};object-fit:cover;border-radius:8px;cursor:zoom-in;"/>${quoteHtml}</div>`;
}

export function renderInlaidMessage(original: string, record: InlayRecord, config: Config): string {
  const cleanOriginal = stripInlayContent(original);
  const blocks = new Map<number, string[]>();
  const count = Math.max(1, paragraphCount(cleanOriginal));
  record.imageUrls.forEach((url, index) => {
    const raw = record.paragraphs[index];
    if (!Number.isFinite(raw) || raw < 1 || raw > count) return;
    const paragraph = raw;
    const existing = blocks.get(paragraph) || [];
    existing.push(renderInlayBlock(
      url,
      record.prompts[index] || "",
      record.negativePrompts?.[index] || "",
      record.quotes?.[index] || "",
      record.imageIds?.[index] || "",
      record.chatId || "",
      record.messageId || "",
      record.swipeId || 0,
      index,
      config
    ));
    blocks.set(paragraph, existing);
  });

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
  return output.join("");
}
