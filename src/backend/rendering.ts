import { DEFAULT_CONFIG, type Config } from "../shared/config.js";
import { MARKER } from "./constants.js";
import { stripInlayContent } from "./inlay-content.js";
import { paragraphCount } from "./paragraphs.js";
import { clampInt } from "./utils.js";

type InlayRecord = { imageUrls: string[]; prompts: string[]; paragraphs: number[] };

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

function renderInlayBlock(url: string, prompt: string, index: number, config: Config): string {
  const label = `Inlay ${index + 1}`;
  const configuredWidth = config.mode === "asset" ? config.assetImageWidth : config.inlayImageWidth;
  const fallbackWidth = config.mode === "asset" ? DEFAULT_CONFIG.assetImageWidth : DEFAULT_CONFIG.inlayImageWidth;
  const width = clampInt(configuredWidth, 120, 2400, fallbackWidth);
  const maxHeight = clampInt(config.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh);
  const safePrompt = prompt.replace(/```/g, "'''");
  return `${MARKER}\n<div class="inlay-illustrator-image" data-inlay-illustrator="true" style="display:flex;justify-content:center;align-items:center;margin:10px 0;width:100%;"><img src="${htmlAttr(url)}" alt="${htmlAttr(label)}" data-lightbox data-inlay-illustrator-prompt="${htmlAttr(safePrompt)}" style="display:block;width:min(100%, ${width}px);max-height:${maxHeight}vh;height:auto;object-fit:contain;border-radius:8px;"/><pre class="inlay-illustrator-prompt" hidden>${htmlAttr(safePrompt)}</pre></div>`;
}

export function renderInlaidMessage(original: string, record: InlayRecord, config: Config): string {
  const cleanOriginal = stripInlayContent(original);
  const blocks = new Map<number, string[]>();
  const count = Math.max(1, paragraphCount(cleanOriginal));
  record.imageUrls.forEach((url, index) => {
    const paragraph = clampInt(record.paragraphs[index], 1, count, Math.min(index + 1, count));
    const existing = blocks.get(paragraph) || [];
    existing.push(renderInlayBlock(url, record.prompts[index] || "", index, config));
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
