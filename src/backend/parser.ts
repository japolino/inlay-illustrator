import type { Config, ParserEngine, PreprocessingMode } from "../shared/config.js";
import { CORE_PREAMBLE } from "./instructions.js";
import { logStage } from "./logging.js";
import { renderCoreInstructionSource, renderImageInstructionSource, renderOriginalCoreInstruction, renderOriginalImageInstruction, renderPreprocessInstructionSource } from "./original-instructions.js";
import {
  ORIGINAL_CORE_INSTRUCTION_SOURCE,
  ORIGINAL_IMAGE_INSTRUCTION_SOURCE,
  ORIGINAL_PREFILL_INSTRUCTION_SOURCE,
  ORIGINAL_PREPROCESS_INSTRUCTION_SOURCE,
} from "./original-instruction-assets.js";
import type { ParsedPayload, ParserConnection, ParserContext, PreparedParagraph, SceneJson } from "./types.js";
import { asRecord } from "./utils.js";
import { decodeResponse, encodePrompt } from "./encoding.js";
import type { LorebookContextSnapshot } from "./context.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const parserConnectionCache = new Map<string, { expiresAt: number; connection: ParserConnection }>();


export function formatTargetParagraphs(paragraphs: PreparedParagraph[]): string {
  return paragraphs.map((paragraph) => `[P${paragraph.parserIndex}]\n${paragraph.text}`).join("\n\n");
}

export function continuityReference(systemContext: string, recentContext: string): string {
  return [systemContext.trim(), recentContext.trim()].filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// User request builder
// Requirement 5: use explicit used flag, not shape check. Keep string overload for compat.
// ---------------------------------------------------------------------------
export function parserUserRequest(targetSource: string, config: Config, used?: boolean): string {
  const constraints = [
    "\n\n## Constraints",
    `- Generate between ${config.minImages} and ${config.maxImages} shots total across all scenes.`,
    config.mode === "asset"
      ? "- Each shot must contain exactly 1 character (asset mode)."
      : `- Each shot must contain at most ${config.maxCharacters} character(s).`,
    ...(config.quotesEnabled
      ? [
          "",
          "## Quote",
          config.quoteInstructions ||
            '- In the "quote" field, include a single line in each shot capturing a short, relevant single line of dialogue or thought from that shot.\n- It must be from the characters\' in the shot.',
        ]
      : []),
  ].join("\n");
  const isPreprocessed = used !== undefined ? used : /^\s*\[Appearance:/i.test(targetSource);
  if (isPreprocessed) {
    return `Analyze the following preprocessed paragraph summaries and generate Image Prompts. Output ONLY one JSON object with a top-level \"scenes\" array. Group shots by location: if no location change, use one scene with multiple shots; if a location change occurs, start a new scene.${constraints}\n\n## Preprocessed Analysis\n${targetSource}`;
  }
  return `Analyze the following numbered paragraphs and generate Image Prompts.\nThe current numbered paragraphs are authoritative for the character's present visual state. Use earlier context only for missing stable identity traits. If the current message states or clearly implies no clothes or no underwear, do NOT add clothing.\nDO NOT reproduce the original text. Output ONLY one JSON object with a top-level \"scenes\" array. Group shots by location: if no location change, use one scene with multiple shots; if a location change occurs, start a new scene.${constraints}\n\n## Current Message\n${targetSource}`;
}

const FUZZY_KEYS = [
  "scenes",
  "place",
  "shots",
  "paragraph",
  "camera",
  "situation",
  "characters",
  "label",
  "age",
  "appearance",
  "body",
  "attire",
  "expression",
  "action",
  "negative",
  "name",
  "scene",
  "positive",
  "quote",
  "supplement",
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
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") starts.push(index);
    else if (character === "}" && starts.length > 0) {
      const start = starts.pop();
      if (start !== undefined) objects.push(text.slice(start, index + 1));
    }
  }
  return [...new Set(objects)];
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

async function resolveParserConnectionById(connectionId: string, userId?: string): Promise<ParserConnection> {
  const cacheKey = JSON.stringify([userId ?? null, connectionId]);
  const cached = parserConnectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.connection;
  const connection = await spindle.connections.get(connectionId, userId);
  if (!connection) throw new Error("Parser connection not found.");
  const resolved = { id: connection.id, name: connection.name, provider: connection.provider, model: connection.model };
  cacheParserConnection(cacheKey, resolved);
  return resolved;
}

// ---------------------------------------------------------------------------
// Dual-engine resolution — narrow required adaptation
// Spindle has no built-in axLLM/LLM globals (unlike Risu's getGlobalVar toggle_Card.LLM / toggle_Card.Preprocessing).
// Original engine choice is a global var switch between two provider entry points (LLM vs axLLM).
// Spindle equivalent is two independently selectable connection IDs; the chosen engine's connection governs.
// Type reason: lumiverse-spindle-types ConnectionProfileDTO / GenerationRequestDTO expose only connection_id.
// There is no axLLM/LLM enum on the platform — we map engine selection to connection_id explicitly.
// ---------------------------------------------------------------------------
export async function resolveParserConnection(config: Config, userId?: string): Promise<ParserConnection> {
  // Main engine selection
  const engine: ParserEngine = config.parserEngine ?? "axllm";
  const id = engine === "llm" ? config.llmParserConnectionId : config.axllmParserConnectionId;
  // Fallback silent migration: if new fields empty but legacy parserConnectionId exists, use it for axllm
  const fallbackId = id ?? (engine === "axllm" ? config.parserConnectionId : null);
  if (!fallbackId) throw new Error(`Select a parser connection for ${engine} before generating.`);
  return resolveParserConnectionById(fallbackId, userId);
}

export async function resolvePreprocessingConnection(config: Config, userId?: string): Promise<ParserConnection | null> {
  const mode: PreprocessingMode = (config.preprocessingMode as PreprocessingMode) ?? "off";
  if (mode === "off") return null;
  const id = mode === "llm" ? config.llmParserConnectionId : config.axllmParserConnectionId;
  const fallbackId = id ?? (mode === "axllm" ? config.parserConnectionId : null);
  if (!fallbackId) throw new Error(`Select a parser connection for preprocessing (${mode}) before generating.`);
  return resolveParserConnectionById(fallbackId, userId);
}

export type ParserStage = "main" | "preprocess";

// No token-budget injection — connection model governs. Parameters {} by default.
// Silent migration fallback parserModel/parameters intentionally not visible and not injected.

function extractText(result: unknown): string {
  if (typeof result === "string") return result;
  const object = asRecord(result);
  for (const key of ["content", "text", "message", "output"]) {
    if (typeof object[key] === "string") return object[key] as string;
  }
  return "";
}


function extractFinishReason(result: unknown): string {
  const object = asRecord(result);
  if (typeof object.finish_reason === "string") return object.finish_reason;
  const choices = Array.isArray(object.choices) ? object.choices : [];
  const first = asRecord(choices[0]);
  return typeof first.finish_reason === "string" ? first.finish_reason : "";
}

async function generateParserText(
  connection: ParserConnection,
  config: Config,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  userId?: string,
  _stage: ParserStage = "main"
): Promise<string> {
  // Use the connection's saved model, passed explicitly on the raw request.
  // The Lumiverse host does NOT resolve provider/model from connection_id alone for
  // custom (OpenAI-compatible) connections — observed as upstream 400 "Model name not
  // specified, model name cannot be empty" / 401 "Model  is not supported" (empty model
  // in the outgoing request body) even though spindle.connections.get reports a model.
  // Mirrors staging generateParserText and the GenerationRequestDTO doc example:
  // generate.raw({ provider, model, connection_id, messages, parameters, ... }).
  // parameters stay {} so connection defaults govern other knobs; parserModel is the
  // silent migration fallback and only applies when the connection has no model.
  const params: Record<string, unknown> = {};
  const effectiveModel = config.parserModel || connection.model;
  logStage(config, "parser_llm_start", {
    stage: _stage,
    connectionId: connection.id,
    provider: connection.provider,
    model: effectiveModel,
  });
  try {
    const result: unknown = await (spindle.generate.raw as unknown as (req: Record<string, unknown>) => Promise<unknown>)({
      type: "raw",
      provider: connection.provider,
      model: effectiveModel,
      connection_id: connection.id,
      messages,
      parameters: params,
      userId,
    });
    const rawText = extractText(result);
    // Decode exactly once per response
    const text = decodeResponse(rawText, (config.encodeMode as "0" | "1" | "2") ?? "0");
    const finishReason = extractFinishReason(result);
    logStage(config, "parser_llm_done", { stage: _stage, outputLength: text.length, ...(finishReason ? { finishReason } : {}) });
    if (finishReason === "length" && !text.trim()) {
      throw new Error("Parser response was truncated before producing JSON.");
    }
    return text;
  } catch (error) {
    throw new Error(`Parser generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Prefill handling (Spindle adaptation)
// Original parsePrefillToMessages returns roles system|user|assistant|tool_call|tool_response|char.
// Spindle LlmMessageDTO only supports system/user/assistant, so we adapt unsupported roles
// narrowly and preserve ordering at absolute end. Documented as unavoidable API adaptation.
// Type citation: node_modules/lumiverse-spindle-types/src/api.ts LlmMessageDTO role union is "system"|"user"|"assistant".
// Unsupported original roles: "char" (Risu alias for assistant), "tool_call", "tool_response".
// Adaptation: char -> assistant, tool_call -> assistant, tool_response -> user; preserve content order and attributes where possible.
// Tool id/name fields beyond role/content cannot be represented in LlmMessageDTO; they are omitted (irreducible difference).
// ---------------------------------------------------------------------------
export type PrefillMessage = { role: "system" | "user" | "assistant"; content: string };

function adaptPrefillRole(role: string): "system" | "user" | "assistant" {
  const lower = role.toLowerCase();
  if (lower === "system") return "system";
  if (lower === "user") return "user";
  if (lower === "assistant" || lower === "char") return "assistant";
  if (lower === "tool_call") return "assistant";
  if (lower === "tool_response") return "user";
  return "assistant";
}

export function parsePrefillMessages(text: string): PrefillMessage[] {
  const msgs: Array<{ role: string; content: string; id?: string }> = [];
  let currentPos = 0;
  while (true) {
    const startMatch = text.slice(currentPos).match(/<([a-zA-Z0-9_]+)([^>]*)>/);
    if (!startMatch || startMatch.index === undefined) break;
    const startPos = currentPos + startMatch.index;
    const tag = startMatch[1];
    const attrs = startMatch[2];
    const endPos = startPos + startMatch[0].length;
    const closingTag = `</${tag}>`;
    const closeStart = text.indexOf(closingTag, endPos);
    let content = "";
    if (closeStart !== -1) {
      content = text.slice(endPos, closeStart);
      currentPos = closeStart + closingTag.length;
    } else {
      content = text.slice(endPos);
      currentPos = text.length;
    }
    let roleStr = tag.toLowerCase();
    if (roleStr === "assistant") roleStr = "char";
    const msg: { role: string; content: string; id?: string } = {
      role: roleStr,
      content: content.replace(/^\s+|\s+$/g, ""),
    };
    const attrRe = /([\w_]+)="([^"]+)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(attrs)) !== null) {
      (msg as Record<string, string>)[am[1]] = am[2];
    }
    msgs.push(msg);
    if (closeStart === -1) break;
  }
  if (msgs.length === 0 && text.trim()) {
    msgs.push({ role: "char", content: text.trim() });
  }
  return msgs.map((m) => ({
    role: adaptPrefillRole(m.role),
    content: m.content,
  }));
}

export function getPrefillMessages(config: Config, snapshot?: LorebookContextSnapshot): PrefillMessage[] {
  if (!config.prefillEnabled) return [];
  // Dynamic exact named source: Card.Prefill.Prompt from snapshot, fallback to bundled asset
  let raw: string | undefined;
  if (snapshot) {
    const entry = snapshot.entries.find((e) => e.comment === "Card.Prefill.Prompt");
    if (entry) raw = entry.content;
    else raw = undefined;
  }
  if (raw === undefined) raw = ORIGINAL_PREFILL_INSTRUCTION_SOURCE;
  if (raw === undefined || raw === "") return [];
  return parsePrefillMessages(raw);
}

// Helpers for dynamic instruction sources
function getFirstEntryContent(snapshot: LorebookContextSnapshot | undefined, comment: string): string | undefined {
  if (!snapshot) return undefined;
  const entry = snapshot.entries.find((e) => e.comment === comment);
  if (!entry) return undefined;
  return entry.content;
}

function resolveCoreInstruction(snapshot: LorebookContextSnapshot | undefined, config: Config): string {
  const raw = getFirstEntryContent(snapshot, "Card.Core.axLLM");
  if (raw !== undefined) return renderCoreInstructionSource(raw, config, false);
  return renderOriginalCoreInstruction(config);
}

function resolveImageInstruction(snapshot: LorebookContextSnapshot | undefined, config: Config): string {
  const raw = getFirstEntryContent(snapshot, "Card.Image.axLLM");
  if (raw !== undefined) return renderImageInstructionSource(raw, config, false);
  return renderOriginalImageInstruction(config);
}

export function resolvePreprocessInstruction(snapshot: LorebookContextSnapshot | undefined, config: Config): string {
  const raw = getFirstEntryContent(snapshot, "Card.Preprocess.Prompt");
  return renderPreprocessInstructionSource(raw !== undefined ? raw : ORIGINAL_PREPROCESS_INSTRUCTION_SOURCE, config);
}

// ---------------------------------------------------------------------------
// Core message builder – fidelity order per task spec
// Order: raw unencoded CORE_PREAMBLE; encoded base blocks (user/char/lorebook/appearance);
// encoded newest-first history only when include>0; encoded Core; encoded Image; encoded user input; encoded override; then enabled prefill at absolute end.
// Each non-preamble message is encoded exactly once via encodePrompt; response decoded exactly once in generateParserText.
// Base blocks are DISTINCT per-entry system messages (original buildBaseSharedChatData per-encode).
// Do not trim base blocks, lorebook entry content, history, Core, Image, or user content before encode.
// Override remains exact wrapper and trimmed contents by source. Prefill at absolute end.
// ---------------------------------------------------------------------------
export function buildParserMessages(
  config: Config,
  context: ParserContext,
  targetSource: string | { text: string; used: boolean },
  _userId?: string,
  snapshot?: LorebookContextSnapshot
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const method = (config.encodeMode as "0" | "1" | "2") ?? "0";
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // 1) Raw unencoded CORE_PREAMBLE
  messages.push({ role: "system", content: CORE_PREAMBLE });

  // 2) Encoded base blocks as DISTINCT system messages — preserve bytes exactly, no trim before encode
  const baseBlocks = (context as ParserContext & { baseBlocks?: string[] }).baseBlocks;
  if (baseBlocks && baseBlocks.length > 1) {
    for (const block of baseBlocks.slice(1)) {
      // Original includes block only if block != "" exact, but we already filtered; preserve whitespace blocks as distinct messages
      // Do NOT trim before encode — preserve bytes. Original buildBaseSharedChatData does encodePrompt(data) where data is raw personaDesc etc including header.
      // We check for non-empty string exact (including whitespace) — only skip exact ""
      if (block !== "" && block != null) messages.push({ role: "system", content: encodePrompt(block, method) });
    }
  } else {
    let baseWithoutPreamble = context.systemContext;
    if (baseWithoutPreamble.startsWith(CORE_PREAMBLE)) {
      baseWithoutPreamble = baseWithoutPreamble.slice(CORE_PREAMBLE.length).replace(/^\n+/, "");
    }
    if (baseWithoutPreamble !== "") messages.push({ role: "system", content: encodePrompt(baseWithoutPreamble, method) });
  }

  // 3) Encoded newest-first history only when include>0 (context.recentContext already gated) — preserve bytes, no trim
  if (context.recentContext !== "" && context.recentContext != null) {
    messages.push({ role: "system", content: encodePrompt(context.recentContext, method) });
  }

  // 4) Original always inserts both Core and Image system messages, even
  // when either runtime lorebook entry is the exact empty string.
  const coreRaw = resolveCoreInstruction(snapshot, config);
  const imageRaw = resolveImageInstruction(snapshot, config);
  messages.push({ role: "system", content: encodePrompt(coreRaw, method) });
  messages.push({ role: "system", content: encodePrompt(imageRaw, method) });

  // 5) Encoded user input — targetSource may be string or PreprocessingResult
  // If PreprocessingResult object, build full user request with correct header using used flag.
  // If plain string, preserve backward compatibility and treat as already full request or fallback to regex.
  let userRequest: string;
  if (typeof targetSource === "object" && targetSource !== null && "text" in (targetSource as any) && "used" in (targetSource as any)) {
    const pr = targetSource as unknown as { text: string; used: boolean };
    userRequest = parserUserRequest(pr.text, config, pr.used);
  } else if (typeof targetSource === "string") {
    // Backward compat: string may already be full request or raw target
    // If it already contains header markers, encode as is; otherwise build via parserUserRequest with used flag from snapshot? Use fallback regex.
    // Heuristic: if string contains "## Preprocessed Analysis" or "## Current Message", it's already full request
    if (targetSource.includes("## Preprocessed Analysis") || targetSource.includes("## Current Message")) {
      userRequest = targetSource;
    } else {
      userRequest = parserUserRequest(targetSource as string, config);
    }
  } else {
    userRequest = parserUserRequest(String(targetSource), config);
  }
  messages.push({ role: "user", content: encodePrompt(userRequest, method) });

  // 6) Encoded override (user) if present — override already built with exact wrapper and trimmed contents, preserve but encode exactly once. Do not trim before encode? The wrapper is already exactly built, we should not trim again. However spec says override remains exact wrapper and trimmed contents by source — so we encode as is without extra trim.
  if (context.override !== "" && context.override != null) {
    const combined = [
      "# Priority: Instructions Override",
      context.override,
      "> These are instructions explicitly given by the Client. If in conflict with previous instructions, this section MUST take precedence.",
    ].join("\n");
    messages.push({ role: "user", content: encodePrompt(combined, method) });
  }

  // 7) Enabled prefill messages at absolute end, each content encoded exactly once, roles adapted
  const prefill = getPrefillMessages(config, snapshot);
  for (const pm of prefill) {
    messages.push({ role: pm.role, content: encodePrompt(pm.content, method) });
  }

  return messages;
}

export function preprocessingInstruction(_paragraphs: PreparedParagraph[], config: Config, snapshot?: LorebookContextSnapshot): string {
  return resolvePreprocessInstruction(snapshot, config);
}

export function preprocessingUserRequest(rawTarget: string): string {
  return rawTarget;
}

// ---------------------------------------------------------------------------
// Preprocessing — fidelity per task spec
// Returns {text, used} where used = true iff template exists (after trim) and at least one transport succeeded and decoded result is non-empty.
// Original pattern: fetch Card.Preprocess.Prompt lorebook, empty guard (trimmed empty => skip), loop attempt 0..retryMax with curInc = min(min+attempt,max),
// build chatData = baseSharedData + history if curInc>0 + user:preprocessInput + prefill, choose axLLM/Main via prepChoice.
// Return decoded response verbatim on success (no trim/clean/compact); on all failures return raw numbered target. Never validate shape.
// ---------------------------------------------------------------------------
export type PreprocessingResult = { text: string; used: boolean };

export async function preprocessTargetParagraphs(
  parserConnection: ParserConnection | null,
  config: Config,
  paragraphs: PreparedParagraph[],
  contextOrBuilder: ParserContext | ((attempt: number) => Promise<ParserContext> | ParserContext),
  userId?: string,
  snapshot?: LorebookContextSnapshot
): Promise<PreprocessingResult> {
  const rawTarget = formatTargetParagraphs(paragraphs);
  const mode: PreprocessingMode = (config.preprocessingMode as PreprocessingMode) ?? "off";
  if (mode === "off") return { text: rawTarget, used: false };
  const templateRaw = preprocessingInstruction(paragraphs, config, snapshot);
  if (!templateRaw || templateRaw === "") return { text: rawTarget, used: false };

  // Resolve the selected preprocessing engine independently. A missing
  // Lumiverse connection is a configuration error, not a successful "off"
  // result; only preprocessingMode="off" may skip the call.
  const prepConnection = await resolvePreprocessingConnection(config, userId) ?? parserConnection;
  if (!prepConnection) throw new Error(`Select a parser connection for preprocessing (${mode}) before generating.`);

  const method = (config.encodeMode as "0" | "1" | "2") ?? "0";

  const getContext = async (attempt: number): Promise<ParserContext> => {
    if (typeof contextOrBuilder === "function") {
      const maybe = (contextOrBuilder as (a: number) => any)(attempt);
      return maybe instanceof Promise ? await maybe : maybe;
    }
    return contextOrBuilder as ParserContext;
  };

  for (let attempt = 0; attempt <= config.parserRetries; attempt += 1) {
    const curContext = await getContext(attempt);
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    messages.push({ role: "system", content: CORE_PREAMBLE });
    const baseForPre = (curContext as ParserContext & { preprocessingBaseBlocks?: string[]; baseBlocks?: string[] }).preprocessingBaseBlocks
      || (curContext as ParserContext & { baseBlocks?: string[] }).baseBlocks;
    if (baseForPre && baseForPre.length > 1) {
      for (const block of baseForPre.slice(1)) {
        if (block !== "" && block != null) messages.push({ role: "system", content: encodePrompt(block, method) });
      }
    } else {
      const fallbackBase = (curContext as any).preprocessingSystemContext ?? curContext.systemContext;
      let baseWithoutPreamble = fallbackBase;
      if (baseWithoutPreamble.startsWith(CORE_PREAMBLE)) {
        baseWithoutPreamble = baseWithoutPreamble.slice(CORE_PREAMBLE.length).replace(/^\n+/, "");
      }
      if (baseWithoutPreamble !== "") messages.push({ role: "system", content: encodePrompt(baseWithoutPreamble, method) });
    }
    const preprocessingHistory = curContext.preprocessingRecentContext ?? curContext.recentContext;
    if (preprocessingHistory !== "" && preprocessingHistory != null) {
      messages.push({ role: "system", content: encodePrompt(preprocessingHistory, method) });
    }
    const preprocessInput = `${templateRaw}\n\n${rawTarget}`;
    messages.push({ role: "user", content: encodePrompt(preprocessInput, method) });
    const prefill = getPrefillMessages(config, snapshot);
    for (const pm of prefill) {
      messages.push({ role: pm.role, content: encodePrompt(pm.content, method) });
    }
    try {
      const summary = await generateParserText(prepConnection, config, messages, userId, "preprocess");
      // Verbatim return — never validate shape. Even if empty string, we return it but mark used accordingly.
      // Empty successful result falls back to numbered branch (used=false)
      if (summary !== "" ) {
        return { text: summary, used: true };
      } else {
        // Successful but empty => treat as not used, fallback to raw (spec: empty successful result falls back)
        return { text: rawTarget, used: false };
      }
    } catch (error) {
      logStage(config, "preprocessing_attempt_failed", { attempt, error: error instanceof Error ? error.message : String(error) }, attempt >= config.parserRetries ? "warn" : "warn");
      if (attempt >= config.parserRetries) break;
    }
  }
  return { text: rawTarget, used: false };
}

// Overload for callers expecting string: provide string result accessor
export async function preprocessTargetParagraphsString(
  parserConnection: ParserConnection | null,
  config: Config,
  paragraphs: PreparedParagraph[],
  contextOrBuilder: ParserContext | ((attempt: number) => Promise<ParserContext> | ParserContext),
  userId?: string,
  snapshot?: LorebookContextSnapshot
): Promise<string> {
  const res = await preprocessTargetParagraphs(parserConnection, config, paragraphs, contextOrBuilder, userId, snapshot);
  return res.text;
}

export async function parsePayloadWithRepair(
  parserConnection: ParserConnection,
  config: Config,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  userId?: string
): Promise<ParsedPayload> {
  const raw = await generateParserText(parserConnection, config, messages, userId, "main");
  if (!raw.trim()) throw new Error("Parser returned an empty response.");
  const parsed = parseParserJson(raw);
  // Original success criterion: scenes && #scenes>0 — no structuralIssues, no allowed-P checks, no paragraph inheritance
  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Parser did not return usable JSON scenes.");
  }
  return parsed;
}

// Expose for generation.ts direct call without repair indirection
export async function parsePayload(
  parserConnection: ParserConnection,
  config: Config,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  userId?: string
): Promise<ParsedPayload> {
  return parsePayloadWithRepair(parserConnection, config, messages, userId);
}

export { generateParserText };
