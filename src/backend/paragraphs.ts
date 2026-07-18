import type { Config } from "../shared/config.js";
import { stripInlayContent } from "./inlay-content.js";
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

type IgnoredTagPattern = { paired: RegExp; element: RegExp; bracket: RegExp };
const ignoredPatternCache = new Map<string, IgnoredTagPattern[]>();

function ignoredTagPatterns(config: Config): IgnoredTagPattern[] {
  const key = String(config.ignoredTags || "");
  const cached = ignoredPatternCache.get(key);
  if (cached) return cached;
  const patterns = ignoredTagNames(config).map((tag) => {
    const name = escapeRegExp(tag);
    return {
      paired: new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, "gi"),
      element: new RegExp(`<\\/?${name}\\b[^>]*>`, "gi"),
      bracket: new RegExp(`^\\s*\\[${name}\\b[^\\]]*\\]\\s*$`, "gim")
    };
  });
  if (ignoredPatternCache.size >= 32) {
    const oldest = ignoredPatternCache.keys().next().value;
    if (typeof oldest === "string") ignoredPatternCache.delete(oldest);
  }
  ignoredPatternCache.set(key, patterns);
  return patterns;
}

function stripIgnoredTags(text: string, patterns: IgnoredTagPattern[]): string {
  let output = text;
  for (const pattern of patterns) {
    output = output
      .replace(pattern.paired, "")
      .replace(pattern.element, "")
      .replace(pattern.bracket, "");
  }
  return output;
}

function cleanParagraphText(text: string, patterns: IgnoredTagPattern[]): string {
  const stripped = stripIgnoredTags(text, patterns)
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
  const originalBlocks = splitParagraphBlocks(stripInlayContent(content));
  const patterns = ignoredTagPatterns(config);
  for (const [index, block] of originalBlocks.entries()) {
    const cleaned = cleanParagraphText(block, patterns);
    if (cleaned) paragraphs.push({ parserIndex: paragraphs.length + 1, originalIndex: index + 1, text: cleaned });
  }
  return paragraphs;
}

export function paragraphCount(content: string): number {
  return content.split(/(\r?\n\s*\r?\n)/).filter((part) => part.trim()).length;
}
