/**
 * V3.7.6 Parser Runtime.
 * Implements requestCardScenes, dynamic retry with context inclusion escalation,
 * source encoding roundtrips, schema normalization, and prompt compilation.
 *
 * NOTE: This active pipeline strictly does NOT run old ANIMA passes:
 * - NO camera repair pass
 * - NO creative ideation pass
 * - NO visibility projection
 * - NO provenance schema or terminalState schema
 */

import { v376OptionsFromConfig } from "../../shared/config.js";
import type { Config } from "../../shared/config.js";
import { abortError, throwIfAborted } from "../operation-manager.js";
import { resolveParserConnection } from "../parser.js";
import type { ParserConnection, ParserGenerationRequest, PreparedParagraph, State } from "../types.js";
import {
  buildV376Context,
  buildV376PreprocessContext,
  decodeResponse,
  encodePrompt,
  getMessageText,
  isCharRole,
  V376ChatMessage,
  V376OutboundMessage,
} from "./context.js";
import {
  buildAppearanceReference,
  loadV376Memory,
  saveV376Memory,
  updateV376Memory,
  V376MemoryMap,
} from "./memory.js";
import { compileV376Payload } from "./prompt.js";
import { parseV376Payload } from "./schema.js";
import {
  V376CompiledShot,
  V376CompileOptions,
  V376EncodingMode,
  V376Options,
  V376Payload,
} from "./types.js";
import {
  applyV376KeywordReplacements,
  buildV376PreprocessInstruction,
} from "./instructions.js";
import { loadV376HostSources } from "./source-context.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

export interface ParseV376Params {
  chatId: string;
  messageId: string;
  messages: V376ChatMessage[];
  paragraphs: PreparedParagraph[];
  state: State;
  config: Config;
  userId?: string;
  userName?: string;
  charName?: string;
  signal?: AbortSignal;
  /** Optional custom connection resolver for tests */
  connectionResolver?: (config: Config, userId?: string) => Promise<ParserConnection>;
  /** Optional custom LLM invoker for tests or alternate transport */
  llmInvoker?: (
    messages: V376OutboundMessage[],
    params: {
      connection: ParserConnection;
      config: Config;
      userId?: string;
      signal?: AbortSignal;
      encodingMode?: V376EncodingMode;
      expectJson?: boolean;
    }
  ) => Promise<string>;
}

export interface ParseV376Result {
  payload: V376Payload;
  compiled: V376CompiledShot[];
}

function extractLlmText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const object = result as Record<string, unknown>;
    for (const key of ["content", "text", "message", "output"]) {
      if (typeof object[key] === "string") return object[key] as string;
    }
    if (Array.isArray(object.choices) && object.choices.length > 0) {
      const first = object.choices[0] as Record<string, unknown>;
      if (first) {
        if (typeof first.text === "string") return first.text;
        if (first.message && typeof (first.message as Record<string, unknown>).content === "string") {
          return (first.message as Record<string, unknown>).content as string;
        }
      }
    }
  }
  return "";
}

/**
 * Default spindle-based LLM invoker.
 * Preserves explicit token parameters contrary to hardcoded overrides,
 * surfaces provider errors directly, and normalizes chat roles to standard
 * "system" | "user" | "assistant" for Spindle API compliance.
 */
async function defaultSpindleInvoker(
  messages: V376OutboundMessage[],
  params: {
    connection: ParserConnection;
    config: Config;
    userId?: string;
    signal?: AbortSignal;
    encodingMode?: V376EncodingMode;
    expectJson?: boolean;
  }
): Promise<string> {
  const { connection, config, userId, signal, encodingMode, expectJson = true } = params;
  throwIfAborted(signal);

  if (typeof spindle === "undefined" || !spindle?.generate?.raw) {
    throw new Error("Spindle API is not available in the current environment.");
  }

  // Preserve explicit token parameters from parserParameters; use budget only if not set
  const explicitParams = config.parserParameters || {};
  const parameters: Record<string, unknown> = { ...explicitParams };
  if (parameters.max_tokens === undefined && parameters.max_completion_tokens === undefined) {
    parameters.max_tokens = config.parserMaxTokens || 4096;
  }

  // Note: trigger_runtime.lua never modifies or injects response_format = { type: "json_object" }.
  // Preserve explicit user-configured parserParameters without implicit format mutations.

  // Normalize outbound roles ("char" -> "assistant") for standard LLM APIs
  const spindleMessages = messages.map((m) => ({
    ...m,
    role: (m.role === "char" ? "assistant" : m.role) as "system" | "user" | "assistant",
    content: m.content,
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    const response = await spindle.generate.raw({
      type: "raw",
      provider: connection.provider,
      model: config.parserModel || connection.model,
      connection_id: connection.id,
      messages: spindleMessages,
      parameters,
      reasoning: { source: "off" },
      userId,
      signal: controller.signal,
    } as ParserGenerationRequest);

    return extractLlmText(response);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

/**
 * Runs preprocessing pass matching Lua executePreprocessing.
 * Strictly scopes history prior to targetIndex, pairs preceding user message
 * if includeUserMessage is active, and escalates context inclusion on retry.
 */
async function runPreprocessing(
  params: {
    connection: ParserConnection;
    config: Config;
    options: V376Options;
    paragraphs: PreparedParagraph[];
    messages: V376ChatMessage[];
    targetIndex: number;
    appearanceReference?: string | null;
    userId?: string;
    userName?: string;
    charName?: string;
    userInfo?: string;
    charInfo?: string;
    lorebooks?: Array<{ content: string; title?: string }>;
    signal?: AbortSignal;
    invoker: (
      messages: V376OutboundMessage[],
      params: {
        connection: ParserConnection;
        config: Config;
        userId?: string;
        signal?: AbortSignal;
        encodingMode?: V376EncodingMode;
        expectJson?: boolean;
      }
    ) => Promise<string>;
  }
): Promise<string> {
  const {
    connection,
    config,
    options,
    paragraphs,
    messages,
    targetIndex,
    appearanceReference,
    userId,
    userName,
    charName,
    userInfo,
    charInfo,
    lorebooks,
    signal,
    invoker,
  } = params;

  if (!config.preprocessingEnabled) return "";

  const minInclude = Math.max(0, config.includeMinMessages ?? 0);
  const maxInclude = Math.max(minInclude, config.includeMaxMessages ?? 0);
  const retryMax = Math.max(0, config.parserRetries ?? 0);
  const enc = options.encodingMode ?? "plain";

  let curInc = minInclude;
  let attempt = 0;

  while (attempt <= retryMax) {
    throwIfAborted(signal);

    const prepMessages = buildV376PreprocessContext({
      paragraphs,
      messages,
      targetIndex,
      options,
      includeCount: curInc,
      includeUserChat: options.includeUserMessage,
      appearanceReference,
      userInfo,
      charInfo,
      lorebooks,
      userName: userName || (typeof options.userName === "string" ? options.userName : undefined),
      charName: charName || (typeof options.charName === "string" ? options.charName : undefined),
    });

    try {
      const raw = await invoker(prepMessages, {
        connection,
        config,
        userId,
        signal,
        encodingMode: enc,
        expectJson: false, // Preprocessing is tag prose, never force JSON
      });

      if (raw && raw.trim()) {
        const decoded = decodeResponse(raw, enc);
        if (decoded && decoded.trim()) {
          // In Lua: preprocessedText = applyKeywordReplacements(preprocessedText)
          return applyV376KeywordReplacements(decoded.trim());
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        throw abortError(typeof signal.reason === "string" ? signal.reason : undefined);
      }
    }

    attempt += 1;
    if (curInc < maxInclude) {
      curInc += 1;
    }
  }

  // Graceful fallback if preprocessing fails
  return "";
}

/**
 * Active V3.7.6 Parser entrypoint for messages.
 * Maps paragraph indexes to 1-based source indexes in compiled shots.
 */
export async function parseV376ForMessage(params: ParseV376Params): Promise<ParseV376Result> {
  const {
    chatId,
    messageId,
    messages,
    paragraphs,
    state,
    config,
    userId,
    userName,
    charName,
    signal,
    llmInvoker,
  } = params;
  throwIfAborted(signal);

  // 1. Map config to typed V376Options
  const options = v376OptionsFromConfig(config);
  const enc = options.encodingMode ?? "plain";

  // 2. Resolve parser connection (check typeof function to avoid TS2774)
  let connection: ParserConnection;
  if (params.connectionResolver) {
    connection = await params.connectionResolver(config, userId);
  } else if (typeof spindle !== "undefined" && typeof spindle?.connections?.get === "function") {
    connection = await resolveParserConnection(config, userId);
  } else {
    connection = {
      id: config.parserConnectionId || "local-connection",
      name: "Local Parser",
      provider: "openai",
      model: config.parserModel || "default-model",
    };
  }

  // 3. Locate target character message with strict boundary scoping
  let targetIndex = -1;
  if (messageId) {
    targetIndex = messages.findIndex((m) => m.id === messageId);
  }
  if (targetIndex === -1) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (isCharRole(messages[i].role)) {
        targetIndex = i;
        break;
      }
    }
  }
  if (targetIndex === -1) {
    targetIndex = Math.max(0, messages.length - 1);
  }

  const targetMessage = messages[targetIndex];
  const targetMessageText = getMessageText(targetMessage);

  // 4. Load host sources (userInfo, charInfo, lorebooks, user overrides, persona/char names)
  const hostSources = await loadV376HostSources({
    chatId,
    targetText: targetMessageText,
    config,
    userId,
  });

  const effectiveUserName = userName || hostSources.userName;
  const effectiveCharName = charName || hostSources.charName;
  if (effectiveUserName) options.userName = effectiveUserName;
  if (effectiveCharName) options.charName = effectiveCharName;

  const userInfo = hostSources.userInfo;
  const charInfo = hostSources.charInfo;
  const lorebooks = hostSources.lorebooks;
  const customOverride = hostSources.customOverride || options.customInstruction || config.customParserInstructions;

  // 5. Load memory & character appearance context
  const memoryMap = loadV376Memory(state, options.characterContextDepth ?? 5);
  let appearanceReference: string | null = null;
  if (options.characterContext !== false) {
    appearanceReference = buildAppearanceReference(memoryMap);
  }

  const invoker = llmInvoker ?? defaultSpindleInvoker;

  // 6. Optional Preprocessing
  let preprocessedText = "";
  if (config.preprocessingEnabled) {
    preprocessedText = await runPreprocessing({
      connection,
      config,
      options,
      paragraphs,
      messages,
      targetIndex,
      appearanceReference,
      userId,
      userName: effectiveUserName,
      charName: effectiveCharName,
      userInfo,
      charInfo,
      lorebooks,
      signal,
      invoker,
    });
  }

  // 7. Dynamic retry loop matching Lua requestCardScenes
  const minInclude = Math.max(0, config.includeMinMessages ?? 0);
  const maxInclude = Math.max(minInclude, config.includeMaxMessages ?? 0);
  const retryMax = Math.max(0, config.parserRetries ?? 0);

  let currentInclude = minInclude;
  let attempt = 0;
  let lastError: Error | null = null;
  let payload: V376Payload | null = null;

  while (attempt <= retryMax) {
    throwIfAborted(signal);

    const outboundMessages = buildV376Context({
      targetMessageText,
      paragraphs,
      messages,
      targetIndex,
      options,
      includeCount: currentInclude,
      includeUserChat: options.includeUserMessage,
      appearanceReference,
      preprocessedText,
      customOverride,
      userInfo,
      charInfo,
      lorebooks,
      userName: effectiveUserName,
      charName: effectiveCharName,
    });

    try {
      const rawText = await invoker(outboundMessages, {
        connection,
        config,
        userId,
        signal,
        encodingMode: enc,
        expectJson: true,
      });

      if (!rawText || !rawText.trim()) {
        throw new Error("Blank Output: LLM returned empty response");
      }

      const decodedText = decodeResponse(rawText, enc);
      if (!decodedText || !decodedText.trim()) {
        throw new Error("Blank Output: Decoded LLM response was empty");
      }

      // Structural parsing only (tolerates fuzzy keys; no camera/creative/visibility rewriting)
      payload = parseV376Payload(decodedText, options);

      if (payload && Array.isArray(payload.scenes) && payload.scenes.length > 0) {
        // Success! Break retry loop
        break;
      }

      throw new Error("Parsing Failed: No valid scenes extracted from response");
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw abortError(typeof signal.reason === "string" ? signal.reason : undefined);
      }

      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= retryMax) {
        // Surface error once retries are exhausted
        throw lastError;
      }

      attempt += 1;
      if (currentInclude < maxInclude) {
        currentInclude += 1;
      }
    }
  }

  if (!payload || !payload.scenes || payload.scenes.length === 0) {
    throw lastError || new Error("Failed to generate valid scenes after retries.");
  }

  // 8. Update character appearance memory (persists to state and returns full V376MemoryMap)
  const updatedMemory = updateV376Memory(state, payload.scenes, options);

  // 9. Compile prompt shots with complete config and source options passed into compiler
  const compileOptions: V376CompileOptions = {
    ...config,
    ...options,
    appearanceMap: updatedMemory,
    activePromptPresetId: config.activePromptPresetId,
    promptPresets: config.promptPresets,
    presetContent: (config as Record<string, unknown>).presetContent as string | undefined,
    customPos: options.customPos ?? config.customPositivePrefix,
    customNeg: options.customNeg ?? config.customPositiveSuffix,
    customNegative: (options.customNegative as string | undefined) ?? config.customNegative,
  };
  const compiled = compileV376Payload(payload, compileOptions);

  return { payload, compiled };
}

// Re-export context and memory helpers for runtime integrator
export {
  buildV376Context,
  buildV376PreprocessContext,
  replaceRuntimeMacros,
  collectRecentCharMessages,
  getImmediateUserMessage,
  encodePrompt,
  decodeResponse,
  decodePlaceholders,
  atbashCipher,
  base64Encode,
  base64Decode,
  decodeBase64Response,
  parsePrefillToMessages,
  buildNumberedText,
} from "./context.js";

export {
  loadV376Memory,
  saveV376Memory,
  updateV376Memory,
  buildAppearanceReference,
  extractCharacterIdentityTags,
  parseMemoryEntryValue,
  serializeMemoryEntryValue,
} from "./memory.js";

export type {
  V376MemoryEntry,
  V376MemoryMap,
} from "./memory.js";

export {
  loadV376HostSources,
} from "./source-context.js";

export type {
  V376LoadedHostSources,
} from "./source-context.js";
