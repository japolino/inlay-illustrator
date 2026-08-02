import type { Config } from "../shared/config.js";
import {
  ORIGINAL_IMAGE_INSTRUCTION_SOURCE,
  ORIGINAL_PREPROCESS_INSTRUCTION_SOURCE
} from "./original-instruction-assets.js";

/** Exact tracked source text from Inlay Image v3.5. */
export const ORIGINAL_IMAGE_INSTRUCTION_TEMPLATE = ORIGINAL_IMAGE_INSTRUCTION_SOURCE;

/** Exact tracked source text from Inlay Image v3.5. */
export const ORIGINAL_PREPROCESS_INSTRUCTION_TEMPLATE = ORIGINAL_PREPROCESS_INSTRUCTION_SOURCE;

function resolveBlock(
  source: string,
  block: "if" | "when",
  operator: "equal" | "notequal",
  variable: string,
  expected: string,
  actual: string
): string {
  const opening = `{{#${block} {{${operator}::{{getglobalvar::${variable}}}::${expected}}}}}`;
  const closing = `{{/${block}}}`;
  let output = source;
  while (true) {
    const start = output.indexOf(opening);
    if (start < 0) return output;
    const bodyStart = start + opening.length;
    const end = output.indexOf(closing, bodyStart);
    if (end < 0) throw new Error(`Unclosed archived v3.5 ${block} block for ${variable}.`);
    const matches = operator === "equal" ? actual === expected : actual !== expected;
    output = output.slice(0, start) + (matches ? output.slice(bodyStart, end) : "") + output.slice(end + closing.length);
  }
}

function resolveCardConditionals(source: string, values: Record<string, string>): string {
  let output = source;
  for (const [variable, actual] of Object.entries(values)) {
    for (const expected of ["0", "1", "2", "3"]) {
      output = resolveBlock(output, "if", "equal", variable, expected, actual);
      output = resolveBlock(output, "if", "notequal", variable, expected, actual);
      output = resolveBlock(output, "when", "equal", variable, expected, actual);
      output = resolveBlock(output, "when", "notequal", variable, expected, actual);
    }
  }
  return output;
}

function replaceLiteral(source: string, token: string, value: string): string {
  return source.split(token).join(value);
}

/**
 * Resolves only the Risu card variables used by the archived instruction.
 * The instruction prose itself comes directly from card.json without edits.
 */
export function renderOriginalImageInstruction(config: Config): string {
  const values: Record<string, string> = {
    "toggle_Card.Mode": config.mode === "asset" ? "1" : "0",
    "toggle_Card.Supplement": config.supplement ? "1" : "0",
    "toggle_Card.Quote": config.quotesEnabled ? "1" : "0",
    "toggle_Card.Encode": "3",
    "toggle_Card.Prompt.Compatibility": config.promptSyntax === "comfyui" ? "1" : "0",
    "toggle_Card.CharAppearance.Context": config.characterTagContextEnabled ? "1" : "0",
    "toggle_Card.Original": config.originalReference ? "1" : "0"
  };
  let output = resolveCardConditionals(ORIGINAL_IMAGE_INSTRUCTION_TEMPLATE, values);
  output = replaceLiteral(output, "{{getglobalvar::toggle_Card.Image.Min}}", String(config.minImages));
  output = replaceLiteral(output, "{{getglobalvar::toggle_Card.Image.Max}}", String(config.maxImages));
  output = replaceLiteral(output, "{{getglobalvar::toggle_Card.Character.Max}}", String(config.mode === "asset" ? 1 : config.maxCharacters));
  output = replaceLiteral(output, "{{getglobalvar::text_Card.Original.Text}}", config.originalCreationName);
  return output.trim();
}

export function renderOriginalPreprocessInstruction(config: Config): string {
  return ORIGINAL_PREPROCESS_INSTRUCTION_TEMPLATE
    .split("{{getglobalvar::toggle_Card.Image.Min}}").join(String(config.minImages))
    .split("{{getglobalvar::toggle_Card.Image.Max}}").join(String(config.maxImages))
    .trim();
}
