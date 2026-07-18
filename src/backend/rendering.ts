import { DEFAULT_CONFIG, type Config, type PerspectiveMode } from "../shared/config.js";
import { MARKER } from "./constants.js";
import { stripInlayContent } from "./inlay-content.js";
import { paragraphCount } from "./paragraphs.js";
import type { CreativeConcept } from "./types.js";
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
  prompt: string,
  negativePrompt: string,
  perspectiveMode: PerspectiveMode | undefined,
  perspectiveSource: "adaptive" | "manual" | undefined,
  creativeConcept: CreativeConcept | null | undefined,
  imageId: string,
  chatId: string,
  messageId: string,
  swipeId: number,
  index: number,
  config: Config
): string {
  const label = `Inlay ${index + 1}`;
  const width = clampInt(config.inlayImageWidth, 120, 2400, DEFAULT_CONFIG.inlayImageWidth);
  const maxHeight = clampInt(config.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh);
  const safePrompt = prompt.replace(/```/g, "'''");
  const safeNegative = negativePrompt.replace(/```/g, "'''");
  const modeAttribute = perspectiveMode ? ` data-inlay-illustrator-perspective="${htmlAttr(perspectiveMode)}"` : "";
  const sourceAttribute = perspectiveSource ? ` data-inlay-illustrator-perspective-source="${htmlAttr(perspectiveSource)}"` : "";
  const conceptAttribute = creativeConcept
    ? ` data-inlay-illustrator-concept="${htmlAttr(`${creativeConcept.anchor}: ${creativeConcept.concept}`)}"`
    : "";
  return `${MARKER}\n<div class="inlay-illustrator-image" data-inlay-illustrator="true" style="display:flex;justify-content:center;align-items:center;margin:10px 0;width:100%;"><img src="${htmlAttr(url)}" alt="${htmlAttr(label)}" data-inlay-illustrator-prompt="${htmlAttr(safePrompt)}" data-inlay-illustrator-negative-prompt="${htmlAttr(safeNegative)}"${modeAttribute}${sourceAttribute}${conceptAttribute} data-inlay-illustrator-image-id="${htmlAttr(imageId)}" data-inlay-illustrator-chat-id="${htmlAttr(chatId)}" data-inlay-illustrator-message-id="${htmlAttr(messageId)}" data-inlay-illustrator-swipe-id="${swipeId}" data-inlay-illustrator-image-index="${index}" style="display:block;width:min(100%, ${width}px);max-height:${maxHeight}vh;height:auto;object-fit:contain;border-radius:8px;cursor:zoom-in;"/><pre class="inlay-illustrator-prompt" hidden>${htmlAttr(safePrompt)}</pre><pre class="inlay-illustrator-negative-prompt" hidden>${htmlAttr(safeNegative)}</pre></div>`;
}

export function renderInlaidMessage(original: string, record: InlayRecord, config: Config): string {
  const cleanOriginal = stripInlayContent(original);
  const blocks = new Map<number, string[]>();
  const count = Math.max(1, paragraphCount(cleanOriginal));
  record.imageUrls.forEach((url, index) => {
    const paragraph = clampInt(record.paragraphs[index], 1, count, Math.min(index + 1, count));
    const existing = blocks.get(paragraph) || [];
    existing.push(renderInlayBlock(
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
  const unused = [...blocks.entries()].filter(([number]) => number > paragraph).flatMap(([, inlays]) => inlays);
  if (unused.length) output.push(`\n\n${unused.join("\n\n")}`);
  return output.join("");
}
