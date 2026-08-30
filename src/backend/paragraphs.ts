import type { Config } from "../shared/config.js";
import { stripInlayContent } from "./inlay-content.js";
import type { PreparedParagraph } from "./types.js";
import { unique } from "./utils.js";

function splitParagraphBlocks(content: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*$/.test(line)) {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

export function ignoredTagNames(config: Config): string[] {
  return unique(
    String(config.ignoredTags || "")
      .split(";")
      .map((token) => {
        const m = token.match(/<?\s*(\w+)\s*>?/);
        return m ? m[1] : "";
      })
      .filter(Boolean)
  );
}

function stripIgnoredTags(text: string, tagNames: string[]): string {
  let output = text;
  for (const tag of tagNames) {
    const re = new RegExp(`<${tag}>[^\\n]*?</${tag}>`, "g");
    output = output.replace(re, "");
  }
  return output;
}

function stripTaggedBlock(text: string, tagName: string): string {
  let out = text;
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;
  let startPos = out.indexOf(openTag);
  while (startPos !== -1) {
    const endPos = out.indexOf(closeTag, startPos);
    if (endPos !== -1) {
      out = out.slice(0, startPos) + out.slice(endPos + closeTag.length);
    } else {
      out = out.slice(0, startPos);
      break;
    }
    startPos = out.indexOf(openTag);
  }
  return out;
}

function stripNonNarrativeSections(text: string): string {
  let cleaned = text ?? "";
  cleaned = stripTaggedBlock(cleaned, "Update Log");
  cleaned = stripTaggedBlock(cleaned, "Choice");
  const kept: string[] = [];
  for (const line of (cleaned + "\n").split("\n").slice(0, -1)) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    const drop =
      /^(\[Date:|\[FLOOR:|\[RESERVEDFLOOR:|\[ClimaxHPointDamage:|\[Development:)/.test(trimmed) ||
      /^●.+●$/.test(trimmed) ||
      lower.includes("<suggestion") ||
      lower.includes("</suggestion>") ||
      lower.includes("<scene seed=") ||
      lower.includes("</scene>") ||
      lower.includes("<check ") ||
      lower.includes("</choice>") ||
      lower.includes("<choice>");
    if (!drop) kept.push(line);
  }
  cleaned = kept.join("\n");
  cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, "\n\n");
  return cleaned;
}

function stripCardData(text: string): string {
  return text.replace(/\nCARDDATA:[^\n]*/g, "");
}

function stripExistingInlays(text: string): string {
  return text.replace(/INLAY\[[^\]]*\]\s*\n?/g, "");
}

function stripLoadingTags(text: string): string {
  if (!text) return "";
  return text.replace(/\s*\{\{Card\.Loading[^}]*\}\}/g, "").replace(/\s*\{\{global::Card\.Loading[^}]*\}\}/g, "");
}

export function prepareParagraphs(content: string, config: Config): PreparedParagraph[] {
  // Original order: loading first, then Inlays/CardData/NonNarrative/Ignored (see original_script.txt 1702)
  // Spindle adaptation: stripInlayContent handles Lumiverse {{inlay::}} blocks before original pipeline.
  const withoutSpindleInlays = stripInlayContent(content);
  const withoutLoading = stripLoadingTags(withoutSpindleInlays);
  const withoutInlays = stripExistingInlays(withoutLoading);
  const withoutCardData = stripCardData(withoutInlays);
  const withoutNarrative = stripNonNarrativeSections(withoutCardData);
  const tagNames = ignoredTagNames(config);
  const withoutIgnored = stripIgnoredTags(withoutNarrative, tagNames);
  const originalBlocks = splitParagraphBlocks(withoutIgnored);
  const paragraphs: PreparedParagraph[] = [];
  for (const [index, block] of originalBlocks.entries()) {
    const cleaned = block.trim();
    if (cleaned) {
      paragraphs.push({
        parserIndex: paragraphs.length + 1,
        originalIndex: index + 1,
        text: cleaned,
      });
    }
  }
  return paragraphs;
}

export function paragraphCount(content: string): number {
  return content.split(/(\r?\n\s*\r?\n)/).filter((part) => part.trim()).length;
}
