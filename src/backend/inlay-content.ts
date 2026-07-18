import type { LlmMessageDTO } from "lumiverse-spindle-types";

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

/** Returns a context-only copy with Inlay text removed from assistant turns. */
export function stripInlayFromMessages(messages: LlmMessageDTO[]): LlmMessageDTO[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;

    if (typeof message.content === "string") {
      const content = stripInlayContent(message.content);
      return content === message.content ? message : { ...message, content };
    }

    let changed = false;
    const content = message.content.map((part) => {
      if (part.type !== "text") return part;
      const text = stripInlayContent(part.text);
      if (text === part.text) return part;
      changed = true;
      return { ...part, text };
    });
    return changed ? { ...message, content } : message;
  });
}
