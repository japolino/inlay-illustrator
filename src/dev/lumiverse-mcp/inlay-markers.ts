/**
 * Inlay Illustrator marker detection for the live test driver.
 *
 * Reuses the production helpers where they are exported:
 * - MARKER from backend/constants.js (every Inlay block starts with it),
 * - stripInlayContent from backend/inlay-content.js for clean narrative text.
 *
 * Block structure is inspected from src/backend/rendering.ts:
 * - image blocks:  <div class="inlay-illustrator-image" data-inlay-illustrator="true" ...><img src="..." data-inlay-illustrator-image-id="..." .../></div>
 * - placeholders:  <div class="inlay-illustrator-placeholder" data-inlay-illustrator="true" ...>Generating illustration 1…</div>
 */

import { MARKER } from "../../backend/constants.js";
import { stripInlayContent } from "../../backend/inlay-content.js";

export type InlayBlock = {
  kind: "image" | "placeholder";
  imageId?: string;
  imageUrl?: string;
  label?: string;
  status?: "pending" | "failed" | "cancelled" | "completed";
};

const IMAGE_BLOCK_PATTERN = /<div\b[^>]*\bclass="inlay-illustrator-image"[^>]*>[\s\S]*?<img\b[^>]*>[\s\S]*?<\/div\s*>/g;
const PLACEHOLDER_BLOCK_PATTERN = /<div\b[^>]*\bclass="inlay-illustrator-placeholder"[^>]*>([\s\S]*?)<\/div\s*>/g;
const IMAGE_ID_ATTR = /\bdata-inlay-illustrator-image-id="([^"]*)"/;
const SRC_ATTR = /\bsrc="([^"]+)"/;
const ALT_ATTR = /\balt="([^"]*)"/;

function placeholderStatus(label: string): "pending" | "failed" | "cancelled" {
  if (/failed/i.test(label)) return "failed";
  if (/cancelled/i.test(label)) return "cancelled";
  return "pending";
}

/** True when the assistant message content carries any Inlay-owned block. */
export function hasInlayMarkup(content: string): boolean {
  return content.includes(MARKER) || content.includes('data-inlay-illustrator="true"');
}

/** Compact representation of the Inlay blocks embedded in a message. */
export function extractInlayBlocks(content: string): InlayBlock[] {
  const blocks: InlayBlock[] = [];
  for (const match of content.matchAll(IMAGE_BLOCK_PATTERN)) {
    const block = match[0];
    const imageId = IMAGE_ID_ATTR.exec(block)?.[1];
    const imageUrl = SRC_ATTR.exec(block)?.[1];
    const label = ALT_ATTR.exec(block)?.[1];
    blocks.push({ kind: "image", imageId, imageUrl, label, status: "completed" });
  }
  for (const match of content.matchAll(PLACEHOLDER_BLOCK_PATTERN)) {
    const label = match[1].replace(/<[^>]*>/g, "").trim();
    blocks.push({ kind: "placeholder", label, status: placeholderStatus(label) });
  }
  return blocks;
}

/** Clean narrative text with Inlay presentation markup removed. */
export function cleanNarrative(content: string): string {
  return stripInlayContent(content);
}

/** Inlay lifecycle status inferred from message content and stored metadata. */
export function inferInlayStatus(content: string, metadata?: Record<string, unknown>): string {
  const stored = metadata?.["inlayIllustratorGenerationStatus"];
  if (typeof stored === "string" && stored) return stored;
  const blocks = extractInlayBlocks(content);
  if (blocks.length === 0) return "none";
  if (blocks.some((block) => block.status === "failed")) return "failed";
  if (blocks.some((block) => block.status === "cancelled")) return "cancelled";
  if (blocks.some((block) => block.status === "pending")) return "pending";
  return "completed";
}
