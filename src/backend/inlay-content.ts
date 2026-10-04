import type { LlmMessageDTO } from "lumiverse-spindle-types";
import { SUPPRESSION_CLASS, SUPPRESSION_ID_ATTR, SUPPRESSION_PAYLOAD_ATTR } from "../shared/contract/index.js";

const MARKER_PATTERN = String.raw`<!--\s*inlay_illustrator\s*-->`;
const CURRENT_DIV_PATTERN = String.raw`<div\b(?=[^>]*[\t\n\f\r ]data-inlay-illustrator\s*=\s*(?:"true"|'true'|true(?=[\s>])))[^>]*>[\s\S]*?<\/div\s*>`;
const MARKDOWN_IMAGE_PATTERN = String.raw`!\[[^\]\r\n]*\]\([^\r\n]*\)`;
const HTML_IMAGE_PATTERN = String.raw`<img\b[^>]*>`;
const LEGACY_DETAILS_PATTERN = String.raw`<details\b[^>]*>\s*<summary\b[^>]*>\s*Prompt\b[\s\S]*?<\/details\s*>`;

function ownedBlock(pattern: string): RegExp {
  // Rendering adds one empty line after each owned block. Consuming that
  // separator restores the narrative's original paragraph boundaries and
  // makes stripping followed by rendering idempotent.
  return new RegExp(`${pattern}(?:(?:[ \\t]*\\r?\\n){2})?`, "gi");
}

const LEGACY_BLOCK = ownedBlock(
  `${MARKER_PATTERN}\\s*(?:(?:${MARKDOWN_IMAGE_PATTERN}|${HTML_IMAGE_PATTERN})\\s*)?${LEGACY_DETAILS_PATTERN}`
);
const CURRENT_BLOCK = ownedBlock(`(?:${MARKER_PATTERN}\\s*)?${CURRENT_DIV_PATTERN}`);
const MARKER_IMAGE_BLOCK = ownedBlock(
  `${MARKER_PATTERN}\\s*(?:${MARKDOWN_IMAGE_PATTERN}|${HTML_IMAGE_PATTERN})`
);
const PROMPT_PRE_BLOCK = ownedBlock(
  String.raw`<pre\b(?=[^>]*[\t\n\f\r ]class\s*=\s*(?:"(?:[^"]*[\t\n\f\r ])?inlay-illustrator-(?:negative-)?prompt(?:[\t\n\f\r ][^"]*)?"|'(?:[^']*[\t\n\f\r ])?inlay-illustrator-(?:negative-)?prompt(?:[\t\n\f\r ][^']*)?'|inlay-illustrator-(?:negative-)?prompt(?=[\s>])))[^>]*>[\s\S]*?<\/pre\s*>`
);
const ORPHAN_MARKER = ownedBlock(MARKER_PATTERN);
const PROMPT_ATTRIBUTE = /\s+data-inlay-illustrator-(?:negative-prompt|perspective-source|concept|image-index|image-id|message-id|swipe-id|chat-id|perspective|prompt)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi;

/**
 * Removes only presentation markup owned by Inlay Illustrator.
 *
 * Stored chat messages remain unchanged; callers use the returned string for
 * model/parser context or as the clean source for a fresh render.
 */
export function stripInlayContent(content: string): string {
  if (!content.includes("inlay-illustrator") && !content.includes("inlay_illustrator")) return content;
  return content
    .replace(LEGACY_BLOCK, "")
    .replace(CURRENT_BLOCK, "")
    .replace(MARKER_IMAGE_BLOCK, "")
    .replace(PROMPT_PRE_BLOCK, "")
    .replace(ORPHAN_MARKER, "")
    .replace(PROMPT_ATTRIBUTE, "");
}

/* ------------------------------------------------------------------------------------------------
 * Native asset suppression carrier
 * ---------------------------------------------------------------------------------------------- */

/** AM `cv` 22226: FNV-1a 32, 8 lowercase hex digits. */
function fnvHex(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** AM `zbe` 120771: `NAS1<FNV1a32 hex upper><length base36 upper>`. */
export function suppressionCarrierId(markup: string): string {
  return `NAS1${fnvHex(markup).toUpperCase()}${markup.length.toString(36).toUpperCase()}`;
}

/** AM `Vyt` 120803 with the port attribute names (contract chat-dom.ts). */
export function encodeSuppressionCarrier(markup: string): string {
  const text = String(markup ?? "");
  if (!text) return text;
  return `<span class="${SUPPRESSION_CLASS}" ${SUPPRESSION_ID_ATTR}="${suppressionCarrierId(text)}" ${SUPPRESSION_PAYLOAD_ATTR}="${encodeURIComponent(text)}" aria-hidden="true" hidden></span>`;
}

/** Carriers in our format and in Asset Maid's original format (imported chats). */
const CARRIER_ATTRS: ReadonlyArray<readonly [string, string]> = [
  [SUPPRESSION_ID_ATTR, SUPPRESSION_PAYLOAD_ATTR],
  ["data-am-native-asset-suppression", "data-am-native-asset-suppression-payload"],
];
const CARRIER_PATTERN = /<span\b(?=[^>]*\b(?:data-inlay-illustrator-suppressed|data-am-native-asset-suppression)\s*=)[^>]*>[\s\S]*?<\/span>/giu;

function readAttr(html: string, name: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu").exec(html);
  return match ? String(match[1] ?? match[2] ?? "").trim() : "";
}

/** AM `Gyt` 120784: payload when the id verifies, else null. */
function decodeCarrier(html: string): string | null {
  for (const [idAttr, payloadAttr] of CARRIER_ATTRS) {
    const id = readAttr(html, idAttr);
    const payload = readAttr(html, payloadAttr);
    if (!id || !payload) continue;
    try {
      const decoded = decodeURIComponent(payload);
      return suppressionCarrierId(decoded) === id ? decoded : null;
    } catch {
      return null;
    }
  }
  return null;
}

function replaceCarriers(text: string, replace: (decoded: string | null) => string): string {
  if (!text || (!text.includes(SUPPRESSION_ID_ATTR) && !text.includes("data-am-native-asset-suppression"))) return text;
  return text.replace(CARRIER_PATTERN, (html) => replace(decodeCarrier(html)));
}

/** AM `cH` 120818: carriers back to their original markup (invalid carriers decode to ""). */
export function decodeSuppressionCarriers(text: string): string {
  return replaceCarriers(text, (decoded) => decoded ?? "");
}

/** AM `Wyt` 120821: carriers removed. */
export function removeSuppressionCarriers(text: string): string {
  return replaceCarriers(text, () => "");
}

/** Strip our blocks (current + legacy) and decode native-asset suppression carriers (AM `F5` 168870). */
export function cleanInlayText(content: string): string {
  return decodeSuppressionCarriers(stripInlayContent(content));
}

/** Returns a context-only copy with Inlay text removed (and suppression carriers decoded) in assistant turns. */
export function stripInlayFromMessages(messages: LlmMessageDTO[]): LlmMessageDTO[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;

    if (typeof message.content === "string") {
      const content = cleanInlayText(message.content);
      return content === message.content ? message : { ...message, content };
    }

    let changed = false;
    const content = message.content.map((part) => {
      if (part.type !== "text") return part;
      const text = cleanInlayText(part.text);
      if (text === part.text) return part;
      changed = true;
      return { ...part, text };
    });
    return changed ? { ...message, content } : message;
  });
}
