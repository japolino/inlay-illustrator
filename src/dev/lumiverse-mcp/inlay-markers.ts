/**
 * Inlay Illustrator marker detection for the live test driver.
 *
 * Follows the chat DOM contract (src/shared/contract/chat-dom.ts): the backend bakes one block per selected Image History
 * entry into the assistant message content:
 *   <!-- inlay_illustrator -->
 *   <div class="inlay-illustrator-image am-illustration-projection" data-inlay-illustrator="true" data-inlay-illustrator-slot-id="..." ...>
 *     <span ...><img src="/api/v1/image-gen/results/<id>" .../></span></div>
 * Pending / failed generations are NOT baked (the frontend shows them in the footer); they live in the chat data document.
 * Clean narrative text comes from the backend strip used by the interceptor (blocks removed, suppression carriers decoded).
 */

import { INLAY_MARKER, ILLUSTRATION_ATTR, readIllustrationAttributes } from "../../shared/contract/index.js";
import { cleanInlayText } from "../../backend/inlay-content.js";

export type InlayBlock = {
  kind: "image";
  imageId?: string;
  imageUrl?: string;
  label?: string;
  slotId?: string;
  slotIndex?: number;
  entryId?: string;
  messageKey?: string;
  status: "completed";
};

/** Opening tag of a baked block (attribute order is free; `data-inlay-illustrator="true"` is required). */
const BLOCK_PATTERN = /<div\b(?=[^>]*\sdata-inlay-illustrator="true")[^>]*>[\s\S]*?<\/div\s*>/g;
const OPEN_TAG = /^<div\b[^>]*>/;
const ATTRIBUTE = /\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g;
const IMG_TAG = /<img\b[^>]*>/;

function decodeAttribute(value: string): string {
  return value
    .replace(/&#10;/g, "\n")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function attributesOf(tag: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of tag.matchAll(ATTRIBUTE)) map.set(match[1]!.toLowerCase(), decodeAttribute(match[2] ?? ""));
  return map;
}

/** True when the assistant message content carries any Inlay-owned block. */
export function hasInlayMarkup(content: string): boolean {
  return content.includes(INLAY_MARKER) || content.includes(`${ILLUSTRATION_ATTR.block}="true"`);
}

/** Compact representation of the Inlay blocks embedded in a message (document order). */
export function extractInlayBlocks(content: string): InlayBlock[] {
  const blocks: InlayBlock[] = [];
  for (const match of content.matchAll(BLOCK_PATTERN)) {
    const html = match[0];
    const wrapper = attributesOf(OPEN_TAG.exec(html)?.[0] ?? "");
    const img = attributesOf(IMG_TAG.exec(html)?.[0] ?? "");
    const parsed = readIllustrationAttributes((name) => wrapper.get(name));
    const imageId = parsed?.imageId || img.get(ILLUSTRATION_ATTR.imageId) || undefined;
    blocks.push({
      kind: "image",
      imageId,
      imageUrl: img.get("src") || undefined,
      label: img.get("alt") || undefined,
      slotId: parsed?.slotId,
      slotIndex: parsed?.slotIndex,
      entryId: parsed?.entryId || undefined,
      messageKey: parsed?.messageKey,
      status: "completed",
    });
  }
  return blocks;
}

/** Clean narrative text with Inlay presentation markup removed (a block baked after the last paragraph leaves a blank line). */
export function cleanNarrative(content: string): string {
  return cleanInlayText(content).replace(/\s+$/u, "");
}

/** Inlay lifecycle status inferred from message content and stored metadata (0.9.x metadata is still honoured). */
export function inferInlayStatus(content: string, metadata?: Record<string, unknown>): string {
  const stored = metadata?.["inlayIllustratorGenerationStatus"];
  if (typeof stored === "string" && stored) return stored;
  return extractInlayBlocks(content).length ? "completed" : "none";
}
