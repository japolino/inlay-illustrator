/**
 * V3.7.6 Source-Faithful Instruction Generators and Macro Renderer.
 * Evaluates Risu macro conditionals against typed V376Options preserving exact source prose.
 */

import { V376Options } from "./types.js";
import {
  RAW_LOREBOOK_CORE,
  RAW_LOREBOOK_FORMAT,
  RAW_LOREBOOK_IMAGE,
  RAW_LOREBOOK_PREPROCESS,
} from "./data.js";

/**
 * Maps typed V376Options into the exact V3.7.6 module toggle variable dictionary.
 */
export function resolveV376Variables(options: V376Options): Record<string, string> {
  const modeMap: Record<string, string> = {
    illustration: "0",
    asset: "1",
    comic: "2",
  };
  const textMap: Record<string, string> = {
    off: "0",
    free: "1",
    english: "2",
    korean: "3",
    japanese: "4",
    chinese: "5",
  };
  const compatMap: Record<string, string> = {
    nai: "0",
    comfyui: "1",
  };
  const encodeMap: Record<string, string> = {
    plain: "0",
    placeholder: "1",
    base64: "2",
    atbash: "3",
    default: "0",
  };

  const imageMin = Math.max(1, options.imageMin ?? 3);
  const imageMax = Math.max(imageMin, options.imageMax ?? 5);
  const charMax = Math.max(1, options.characterMax ?? 2);
  const panelMin = Math.max(1, options.panelMin ?? 3);

  const charContext = options.characterContext !== undefined
    ? (options.characterContext ? "1" : "0")
    : (options.characterContextDepth !== undefined && options.characterContextDepth > 0 ? "1" : "0");

  return {
    "toggle_Card.Mode": modeMap[options.mode] ?? "0",
    "toggle_Card.Nsfw": options.nsfw ? "1" : "0",
    "toggle_Card.Supplement": options.supplement ? "1" : "0",
    "toggle_Card.Text": textMap[options.text] ?? "0",
    "toggle_Card.Prompt.Compatibility": compatMap[options.syntax] ?? "0",
    "toggle_Card.Quote": options.quote ? "1" : "0",
    "toggle_Card.Original": options.originalReference ? "1" : "0",
    "toggle_Card.Original.Text": options.originalCreationName ?? "",
    "text_Card.Original.Text": options.originalCreationName ?? "",
    "toggle_Card.Encode": encodeMap[options.encodingMode ?? "plain"] ?? "0",
    "toggle_Card.CharAppearance.Context": charContext,
    "toggle_Card.CharAppearance.Depth": String(options.characterContextDepth ?? 5),
    "toggle_Card.Image.Min": String(imageMin),
    "toggle_Card.Image.Max": String(imageMax),
    "toggle_Card.Character.Max": String(charMax),
    "toggle_Card.PanelNum": String(panelMin),
    "toggle_Card.Userchat": options.includeUserMessage ? "1" : "0",
    "toggle_Card.CustomPos": options.customPos ?? "",
    "toggle_Card.CustomNeg": options.customNeg ?? "",
  };
}

/**
 * Replaces keywords (loli -> young girl, shota -> young boy) adhering to Lua applyKeywordReplacements.
 */
/**
 * Replaces keywords ("loli" -> "young girl", "shota" -> "young boy") adhering to Lua applyKeywordReplacements
 * using exact case-sensitive literal replacement.
 */
export function applyV376KeywordReplacements(text: string): string {
  if (!text) return "";
  return text.replaceAll("loli", "young girl").replaceAll("shota", "young boy");
}

/**
 * Evaluates a conditional expression string from Risu macro syntax against variables.
 * Handles equal, notequal, and composite ::and:: conditions.
 */
function evaluateCondition(condStr: string, varsDict: Record<string, string>): boolean {
  const parts = condStr.split("::and::");
  for (const part of parts) {
    let cleanPart = part.trim();
    if (cleanPart.startsWith("{{") && cleanPart.endsWith("}}")) {
      cleanPart = cleanPart.slice(2, -2).trim();
    }
    const match = cleanPart.match(/^(equal|notequal)::(.+?)::([^:]*)$/s);
    if (!match) {
      return false;
    }
    const [, op, rawLeft, rawRight] = match;
    let leftVal = rawLeft.trim();
    const varMatch = leftVal.match(/^\{\{getglobalvar::([^}]+)\}\}$/);
    if (varMatch) {
      leftVal = varsDict[varMatch[1]] ?? "";
    }
    const rightVal = rawRight.trim();

    if (op === "equal") {
      if (leftVal !== rightVal) return false;
    } else if (op === "notequal") {
      if (leftVal === rightVal) return false;
    }
  }
  return true;
}

/**
 * Robust recursive renderer for Risu macro templates.
 * Correctly handles balanced nested conditionals (if, if_pure, when) and dynamic variable injection.
 */
export function renderV376PromptTemplate(
  template: string,
  optionsOrVars: V376Options | Record<string, string>
): string {
  const varsDict = "mode" in optionsOrVars
    ? resolveV376Variables(optionsOrVars as V376Options)
    : (optionsOrVars as Record<string, string>);

  let i = 0;
  const n = template.length;
  const out: string[] = [];

  while (i < n) {
    if (template.slice(i, i + 2) === "{{") {
      // Find matching outer }}
      let depth = 1;
      const start = i;
      i += 2;
      while (i < n && depth > 0) {
        if (template.slice(i, i + 2) === "{{") {
          depth += 1;
          i += 2;
        } else if (template.slice(i, i + 2) === "}}") {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      const tag = template.slice(start, i);
      const inner = tag.slice(2, -2).trim();

      const openMatch = inner.match(/^#(when::|if_pure|if_\s+pure|if|when)\s*(.*)$/s);
      if (openMatch) {
        const condExpr = openMatch[2].trim();
        const blockStart = i;
        let nestLevel = 1;
        let bodyEnd = -1;
        let closeEnd = -1;

        let j = i;
        while (j < n && nestLevel > 0) {
          if (template.slice(j, j + 2) === "{{") {
            let tDepth = 1;
            const tStart = j;
            j += 2;
            while (j < n && tDepth > 0) {
              if (template.slice(j, j + 2) === "{{") {
                tDepth += 1;
                j += 2;
              } else if (template.slice(j, j + 2) === "}}") {
                tDepth -= 1;
                j += 2;
              } else {
                j += 1;
              }
            }
            const subTag = template.slice(tStart, j);
            const subInner = subTag.slice(2, -2).trim();
            if (/^#(when::|if_pure|if_\s+pure|if|when)/.test(subInner)) {
              nestLevel += 1;
            } else if (subInner === "/if" || subInner === "/if_pure" || subInner === "/when") {
              nestLevel -= 1;
              if (nestLevel === 0) {
                bodyEnd = tStart;
                closeEnd = j;
                break;
              }
            }
          } else {
            j += 1;
          }
        }

        if (bodyEnd === -1) {
          out.push(tag);
        } else {
          const body = template.slice(blockStart, bodyEnd);
          i = closeEnd;
          if (evaluateCondition(condExpr, varsDict)) {
            out.push(renderV376PromptTemplate(body, varsDict));
          }
        }
      } else if (inner === "/if" || inner === "/if_pure" || inner === "/when") {
        // Unmatched closing tag outside nesting; ignore
      } else if (inner === "ImageMin") {
        out.push(varsDict["toggle_Card.Image.Min"] ?? "3");
      } else if (inner === "ImageMax") {
        out.push(varsDict["toggle_Card.Image.Max"] ?? "5");
      } else if (inner === "CharMax") {
        out.push(varsDict["toggle_Card.Character.Max"] ?? "2");
      } else if (inner === "PanelMin") {
        out.push(varsDict["toggle_Card.PanelNum"] ?? "3");
      } else if (inner === "user") {
        out.push("{{user}}"); // preserve {{user}} placeholder for runtime substitution
      } else if (inner.startsWith("getglobalvar::")) {
        const varName = inner.slice("getglobalvar::".length);
        out.push(varsDict[varName] ?? "");
      } else {
        out.push(tag);
      }
    } else {
      out.push(template[i]);
      i += 1;
    }
  }

  return out.join("");
}

/**
 * Builds the primary system instruction for V3.7.6 LLM image generation.
 * Evaluates Card.Image.axLLM and Card.Image.Format templates with options.
 */
/**
 * Builds the image system instruction standalone from Card.Image.axLLM.
 */
export function buildV376ImageInstruction(options: V376Options): string {
  return renderV376PromptTemplate(RAW_LOREBOOK_IMAGE, options).trim();
}

/**
 * Builds combined image + format instructions from Card.Image.axLLM and Card.Image.Format.
 */
export function buildV376Instruction(options: V376Options): string {
  const imagePrompt = buildV376ImageInstruction(options);
  const formatPrompt = buildV376FormatInstruction(options);

  const parts: string[] = [];
  if (imagePrompt) parts.push(imagePrompt);
  if (formatPrompt) parts.push(formatPrompt);

  return parts.join("\n\n");
}

/**
 * Builds the preprocess system instruction from Card.Preprocess.Prompt.
 */
export function buildV376PreprocessInstruction(options: V376Options): string {
  return renderV376PromptTemplate(RAW_LOREBOOK_PREPROCESS, options).trim();
}

/**
 * Builds the encoding protocol instruction from Card.Core.axLLM (if encodingMode is base64 or atbash).
 */
export function buildV376CoreInstruction(options: V376Options): string {
  return renderV376PromptTemplate(RAW_LOREBOOK_CORE, options).trim();
}

/**
 * Builds the output format instruction standalone from Card.Image.Format.
 */
export function buildV376FormatInstruction(options: V376Options): string {
  return renderV376PromptTemplate(RAW_LOREBOOK_FORMAT, options).trim();
}
