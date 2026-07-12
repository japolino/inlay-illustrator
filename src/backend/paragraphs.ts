import type { Config } from "../shared/config.js";
import { MARKER } from "./constants.js";
import type { PreparedParagraph } from "./types.js";
import { escapeRegExp, unique } from "./utils.js";

export function ignoredTagNames(config: Config): string[] {
  return unique(String(config.ignoredTags || "")
    .split(/[\n,]/)
    .map((tag) => tag.trim().replace(/^<|>$/g, "").replace(/^\/+/, ""))
    .filter(Boolean));
}

function splitParagraphBlocks(content: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    if (line.trim()) {
      current.push(line);
    } else if (current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

function stripIgnoredTags(text: string, config: Config): string {
  let output = text;
  for (const tag of ignoredTagNames(config)) {
    const name = escapeRegExp(tag);
    output = output
      .replace(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, "gi"), "")
      .replace(new RegExp(`<\\/?${name}\\b[^>]*>`, "gi"), "")
      .replace(new RegExp(`^\\s*\\[${name}\\b[^\\]]*\\]\\s*$`, "gim"), "");
  }
  return output;
}

function cleanParagraphText(text: string, config: Config): string {
  const stripped = stripIgnoredTags(text, config)
    .replace(/CARDDATA:.*$/gim, "")
    .replace(/<Update Log\b[\s\S]*?<\/Update Log>/gi, "")
    .replace(/<Choice\b[\s\S]*?<\/Choice>/gi, "");
  return stripped
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return !/^\[(?:Date|FLOOR|RESERVEDFLOOR)\s*:/i.test(trimmed)
        && !/^<\s*(?:suggestion|scene\s+seed=|check|choice)\b/i.test(trimmed);
    })
    .join("\n")
    .trim();
}

export function prepareParagraphs(content: string, config: Config): PreparedParagraph[] {
  const paragraphs: PreparedParagraph[] = [];
  const originalBlocks = splitParagraphBlocks(content);
  let inInlay = false;
  for (const [index, block] of originalBlocks.entries()) {
    const trimmed = block.trim();
    if (trimmed.includes(MARKER)) {
      inInlay = /<details/i.test(trimmed) && !/<\/details>/i.test(trimmed);
      continue;
    }
    if (/^<details\b[\s\S]*<summary>\s*Prompt\b/i.test(trimmed)) {
      inInlay = !/<\/details>/i.test(trimmed);
      continue;
    }
    if (inInlay) {
      if (/<\/details>/i.test(trimmed)) inInlay = false;
      continue;
    }
    const cleaned = cleanParagraphText(block, config);
    if (cleaned) paragraphs.push({ parserIndex: paragraphs.length + 1, originalIndex: index + 1, text: cleaned });
  }
  return paragraphs;
}

export function paragraphCount(content: string): number {
  return content.split(/(\r?\n\s*\r?\n)/).filter((part) => part.trim()).length;
}
