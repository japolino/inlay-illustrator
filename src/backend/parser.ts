import type { Config } from "../shared/config.js";
import { parserInstruction } from "./instructions.js";
import { logStage } from "./logging.js";
import { renderOriginalPreprocessInstruction } from "./original-instructions.js";
import { normalizeScenePayload, recoverSceneParagraphs } from "./scenes.js";
import type { ParsedPayload, ParserConnection, ParserContext, ParserGenerationRequest, PreparedParagraph, SceneJson } from "./types.js";
import { asRecord, cleanString, compactBlock, keysOf } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const parserConnectionCache = new Map<string, { expiresAt: number; connection: ParserConnection }>();
const unsupportedStructuredOutput = new Set<string>();

export { parserInstruction };

export function formatTargetParagraphs(paragraphs: PreparedParagraph[]): string {
  return paragraphs.map((paragraph) => `[P${paragraph.parserIndex}]\n${paragraph.text}`).join("\n\n");
}

export function continuityReference(systemContext: string, recentContext: string): string {
  return [systemContext.trim(), recentContext.trim()].filter(Boolean).join("\n\n");
}

export function parserUserRequest(targetSource: string, config: Config): string {
  const constraints = [
    "\n\n## Constraints",
    `- Generate between ${config.minImages} and ${config.maxImages} shots total across all scenes.`,
    config.mode === "asset"
      ? "- Each shot must contain exactly 1 character (asset mode)."
      : `- Each shot must contain at most ${config.maxCharacters} character(s).`,
    ...(config.quotesEnabled ? [
      "",
      "## Quote",
      config.quoteInstructions || "- In the \"quote\" field, include a single line in each shot capturing a short, relevant single line of dialogue or thought from that shot.\n- It must be from the characters' in the shot."
    ] : [])
  ].join("\n");
  if (/^\s*\[Appearance:/i.test(targetSource)) {
    return `Analyze the following preprocessed paragraph summaries and generate Image Prompts. Output ONLY one JSON object with a top-level \"scenes\" array. Group shots by location: if no location change, use one scene with multiple shots; if a location change occurs, start a new scene.${constraints}\n\n## Preprocessed Analysis\n${targetSource}`;
  }
  return `Analyze the following numbered paragraphs and generate Image Prompts.\nThe current numbered paragraphs are authoritative for the character's present visual state. Use earlier context only for missing stable identity traits. If the current message states or clearly implies no clothes or no underwear, do NOT add clothing.\nDO NOT reproduce the original text. Output ONLY one JSON object with a top-level \"scenes\" array. Group shots by location: if no location change, use one scene with multiple shots; if a location change occurs, start a new scene.${constraints}\n\n## Current Message\n${targetSource}`;
}

const FUZZY_KEYS = [
  "scenes", "place", "shots", "paragraph", "camera", "situation", "characters", "label", "age",
  "appearance", "body", "attire", "expression", "action", "negative", "name", "scene", "positive", "quote", "supplement"
];

function levenshtein(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_value, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const next = [row];
    for (let column = 1; column <= right.length; column += 1) {
      next[column] = Math.min(
        next[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
    }
    previous = next;
  }
  return previous[right.length];
}

function fuzzyKey(key: string): string {
  if (FUZZY_KEYS.includes(key)) return key;
  let best = key;
  let bestDistance = 3;
  for (const candidate of FUZZY_KEYS) {
    const distance = levenshtein(key.toLowerCase(), candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= 2 ? best : key;
}

function fuzzyRepair(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fuzzyRepair);
  if (!value || typeof value !== "object") return value;
  const repaired: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const fixed = fuzzyKey(key);
    repaired[repaired[fixed] === undefined ? fixed : key] = fuzzyRepair(child);
  }
  return repaired;
}

function hasScenes(value: unknown): value is ParsedPayload {
  return Boolean(value && typeof value === "object" && Array.isArray((value as ParsedPayload).scenes));
}

function tryParseObject(text: string): unknown | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? fuzzyRepair(parsed) : null;
  } catch {
    return null;
  }
}

function stripJsonFences(text: string): string {
  return text.replace(/```(?:json|JSON)?/g, "").replace(/```/g, "").trim();
}

function balancedObjects(text: string): string[] {
  const objects: string[] = [];
  const starts: number[] = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === "{") starts.push(index);
    else if (character === "}" && starts.length > 0) {
      const start = starts.pop();
      if (start !== undefined) objects.push(text.slice(start, index + 1));
    }
  }
  return [...new Set(objects.sort((left, right) => right.length - left.length))];
}

export function parseParserJson(text: string): ParsedPayload {
  const trimmed = text.trim().replace(/\\\(/g, "(").replace(/\\\)/g, ")");
  const whole = tryParseObject(trimmed);
  if (hasScenes(whole)) return whole;
  const candidates = balancedObjects(stripJsonFences(trimmed));
  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (hasScenes(parsed)) return parsed;
  }
  const groups: SceneJson[] = [];
  const shots: SceneJson[] = [];
  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (!parsed || typeof parsed !== "object") continue;
    const object = parsed as SceneJson;
    if (Array.isArray(object.shots)) groups.push(object);
    else if (object.paragraph !== undefined) shots.push(object);
  }
  if (groups.length > 0) return { scenes: groups };
  if (shots.length > 0) return { scenes: shots };
  throw new Error("Parser did not return usable JSON scenes.");
}

function cacheParserConnection(key: string, connection: ParserConnection): void {
  if (parserConnectionCache.size >= 32) {
    const oldest = parserConnectionCache.keys().next().value;
    if (typeof oldest === "string") parserConnectionCache.delete(oldest);
  }
  parserConnectionCache.set(key, { expiresAt: Date.now() + 5000, connection });
}

export async function resolveParserConnection(config: Config, userId?: string): Promise<ParserConnection> {
  if (!config.parserConnectionId) throw new Error("Select a parser connection before generating.");
  const cacheKey = JSON.stringify([userId ?? null, config.parserConnectionId]);
  const cached = parserConnectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.connection;
  const connection = await spindle.connections.get(config.parserConnectionId, userId);
  if (!connection) throw new Error("Parser connection not found.");
  const resolved = { id: connection.id, name: connection.name, provider: connection.provider, model: connection.model };
  cacheParserConnection(cacheKey, resolved);
  return resolved;
}

export type ParserStage = "main" | "preprocess" | "repair";

export function parserStageTokenBudget(model: string, config: Config, stage: ParserStage): number {
  if (config.parserMaxTokens > 0) return config.parserMaxTokens;
  const base = stage === "preprocess"
    ? 2400
    : stage === "repair"
      ? Math.min(6000, 1600 + Math.max(1, config.maxImages) * 800)
      : Math.min(7000, 1800 + Math.max(1, config.maxImages) * 900);
  if (/kimi[^\n]*k2[.\-_ ]?7[^\n]*code/i.test(model)) return Math.max(base, stage === "main" ? 16000 : 8000);
  if (/claude[^\n]*sonnet[^\n]*5|deepseek[^\n]*v4[^\n]*pro/i.test(model)) return Math.max(base, stage === "preprocess" ? 4000 : stage === "repair" ? 7000 : 9000);
  return base;
}

function parserStageParameters(connection: ParserConnection, config: Config, stage: ParserStage): { parameters: Record<string, unknown>; injected: boolean } {
  const parameters = { ...config.parserParameters };
  if (parameters.max_tokens === undefined && parameters.max_completion_tokens === undefined) {
    parameters.max_tokens = parserStageTokenBudget(config.parserModel || connection.model, config, stage);
  }
  const key = JSON.stringify([connection.provider, config.parserModel || connection.model]);
  const canRequestJson = /openai|gpt-|gemini|deepseek/i.test(`${connection.provider} ${config.parserModel || connection.model}`);
  const injected = stage !== "preprocess" && canRequestJson && parameters.response_format === undefined && !unsupportedStructuredOutput.has(key);
  if (injected) parameters.response_format = { type: "json_object" };
  return { parameters, injected };
}

function extractText(result: unknown): string {
  if (typeof result === "string") return result;
  const object = asRecord(result);
  for (const key of ["content", "text", "message", "output"]) {
    if (typeof object[key] === "string") return object[key];
  }
  return "";
}

async function generateParserText(
  connection: ParserConnection,
  config: Config,
  messages: ParserGenerationRequest["messages"],
  userId?: string,
  stage: ParserStage = "main"
): Promise<string> {
  const selected = parserStageParameters(connection, config, stage);
  const run = async (parameters: Record<string, unknown>): Promise<unknown> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      return await spindle.generate.raw({
        type: "raw",
        provider: connection.provider,
        model: config.parserModel || connection.model,
        connection_id: connection.id,
        messages,
        parameters,
        reasoning: { source: "off" },
        userId,
        signal: controller.signal
      } as ParserGenerationRequest);
    } finally {
      clearTimeout(timeout);
    }
  };
  logStage(config, "parser_llm_start", { stage, provider: connection.provider, model: config.parserModel || connection.model, parameterKeys: keysOf(selected.parameters) });
  try {
    let result: unknown;
    try {
      result = await run(selected.parameters);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!selected.injected || !/\b400\b|invalid.*(?:response|argument|format)|response_format/i.test(reason)) throw error;
      unsupportedStructuredOutput.add(JSON.stringify([connection.provider, config.parserModel || connection.model]));
      const fallback = { ...selected.parameters };
      delete fallback.response_format;
      result = await run(fallback);
    }
    const text = extractText(result);
    logStage(config, "parser_llm_done", { stage, outputLength: text.length });
    return text;
  } catch (error) {
    throw new Error(`Parser generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parserMessages(
  stableInstruction: string,
  referenceContext: string,
  userRequest: string,
  override: string,
  _stage: "parser" | "auxiliary" = "parser"
): ParserGenerationRequest["messages"] {
  const messages: ParserGenerationRequest["messages"] = [{ role: "system", content: stableInstruction.trim() }];
  if (referenceContext.trim()) messages.push({ role: "system", content: referenceContext.trim() });
  messages.push({ role: "user", content: userRequest.trim() });
  if (override.trim()) messages.push({
    role: "user",
    content: [
      "# Priority: Instructions Override",
      override.trim(),
      "> These are instructions explicitly given by the Client. If in conflict with previous instructions, this section MUST take precedence."
    ].join("\n")
  });
  return messages;
}

export function preprocessingInstruction(_paragraphs: PreparedParagraph[], config: Config): string {
  return renderOriginalPreprocessInstruction(config);
}

export function preprocessingUserRequest(rawTarget: string): string {
  return rawTarget;
}

export type PreprocessedSelection = { summary: string; selectedParagraphs: number[]; cameraNotes: string[] };

export function routedTargetSource(_rawTarget: string, selection: PreprocessedSelection): string {
  return selection.summary;
}

export function validatePreprocessedTarget(value: string, paragraphs: PreparedParagraph[], config: Config): PreprocessedSelection | null {
  const summary = cleanString(value);
  if (!summary) return null;
  const lines = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!/^\[Appearance:[^\]\r\n]*\]$/i.test(lines[0] || "")) return null;
  const paragraphLines = lines.slice(1);
  const minimum = Math.min(config.minImages, paragraphs.length);
  const maximum = Math.min(config.maxImages, paragraphs.length);
  if (paragraphLines.length < minimum || paragraphLines.length > maximum) return null;
  const valid = new Set(paragraphs.map((paragraph) => paragraph.parserIndex));
  const selectedParagraphs: number[] = [];
  const cameraNotes: string[] = [];
  const seen = new Set<number>();
  for (const line of paragraphLines) {
    const match = line.match(/^\[P(\d+)\]\s*:\s*(.+)$/i);
    if (!match) return null;
    const paragraph = Number(match[1]);
    const note = match[2].trim();
    if (!valid.has(paragraph) || seen.has(paragraph) || !note) return null;
    seen.add(paragraph);
    selectedParagraphs.push(paragraph);
    cameraNotes.push(note);
  }
  return { summary: compactBlock(summary, 12000), selectedParagraphs, cameraNotes };
}

export async function preprocessTargetParagraphs(
  parserConnection: ParserConnection,
  config: Config,
  paragraphs: PreparedParagraph[],
  context: ParserContext,
  userId?: string
): Promise<string> {
  const rawTarget = formatTargetParagraphs(paragraphs);
  if (!config.preprocessingEnabled) return rawTarget;
  try {
    const messages: ParserGenerationRequest["messages"] = [];
    const reference = continuityReference(context.preprocessingSystemContext ?? context.systemContext, context.recentContext);
    if (reference) messages.push({ role: "system", content: reference });
    messages.push({ role: "user", content: `${preprocessingInstruction(paragraphs, config)}\n\n${rawTarget}` });
    const summary = await generateParserText(parserConnection, config, messages, userId, "preprocess");
    const selection = validatePreprocessedTarget(summary, paragraphs, config);
    if (selection) {
      logStage(config, "preprocessing_done", { selectedParagraphs: selection.selectedParagraphs, summaryLength: selection.summary.length });
      return selection.summary;
    }
    logStage(config, "preprocessing_fallback", { reason: "invalid_selection", summaryLength: cleanString(summary).length }, "warn");
  } catch (error) {
    logStage(config, "preprocessing_fallback", { reason: error instanceof Error ? error.message : String(error) }, "warn");
  }
  return rawTarget;
}

function sourceParagraphs(messages: ParserGenerationRequest["messages"]): number[] {
  const source = [...messages].reverse().find((message) => message.role === "user" && /## (?:Current Message|Preprocessed Analysis)/.test(message.content));
  if (!source) return [];
  return [...new Set([...source.content.matchAll(/\[P(\d+)\]/gi)].map((match) => Number(match[1])).filter(Number.isFinite))];
}

function structuralIssues(payload: ParsedPayload, allowed: number[]): string[] {
  if (!Array.isArray(payload.scenes)) return ["top-level scenes must be an array"];
  const normalized = normalizeScenePayload(payload);
  if (normalized.length === 0) return ["no numbered shots were returned"];
  if (allowed.length > 0 && !normalized.some((entry) => allowed.includes(entry.parserParagraph))) {
    return ["no shot references an allowed paragraph"];
  }
  return [];
}

export async function parsePayloadWithRepair(
  parserConnection: ParserConnection,
  config: Config,
  messages: ParserGenerationRequest["messages"],
  userId?: string
): Promise<ParsedPayload> {
  const raw = await generateParserText(parserConnection, config, messages, userId, "main");
  if (!raw.trim()) throw new Error("Parser returned an empty response.");
  const allowed = sourceParagraphs(messages);
  const fallback = allowed.length === 1 ? allowed[0] : undefined;
  try {
    const parsed = recoverSceneParagraphs(parseParserJson(raw), fallback);
    const issues = structuralIssues(parsed, allowed);
    if (issues.length) throw new Error(issues.join("; "));
    return parsed;
  } catch {
    const repaired = await generateParserText(parserConnection, config, [
      { role: "system", content: "Repair malformed JSON. Return only valid JSON." },
      { role: "user", content: raw }
    ], userId, "repair");
    const parsed = recoverSceneParagraphs(parseParserJson(repaired), fallback);
    const issues = structuralIssues(parsed, allowed);
    if (issues.length) throw new Error(`Parser did not return usable numbered scenes: ${issues.join("; ")}`);
    return parsed;
  }
}
