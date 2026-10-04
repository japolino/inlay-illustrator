/**
 * LLM call plumbing over Lumiverse connection profiles.
 *
 * Moved out of the retired Lightboard parser (`parser.ts`). It is provider
 * plumbing only and knows nothing about prompts:
 * - connection resolution with a short per-user cache,
 * - `spindle.generate.raw` with an explicit model (the host uses `input.model`
 *   verbatim for raw calls, so we always send `override || connection.model`),
 * - optional JSON-mode injection (`response_format: json_object`) for providers
 *   known to support it, with an automatic retry without it on a 400-style
 *   rejection (remembered per provider/model),
 * - our own timeout (default 180 s) chained to the caller's AbortSignal,
 * - `reasoning: { source: "off" }`,
 * - text / usage / finish-reason extraction from the host result.
 */
import { logStage } from "./logging.js";
import { abortError, throwIfAborted } from "./operation-manager.js";
import type { LlmConnection } from "./types.js";
import { asRecord, cleanArray, cleanString, keysOf } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

export const DEFAULT_LLM_TIMEOUT_MS = 180_000;

export type LlmTextPart = { type: "text"; text: string };
/** Lumiverse multimodal image part (base64 without the data: prefix). */
export type LlmImagePart = { type: "image"; data: string; mime_type: string };
export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<LlmTextPart | LlmImagePart>;
};

export type LlmCallOptions = {
  connection: LlmConnection;
  /** Model override; empty = connection model. */
  model?: string;
  messages: LlmMessage[];
  /** Extra provider parameters (temperature, max_tokens, ...). Copied, never mutated. */
  parameters?: Record<string, unknown>;
  /** Request JSON output when the provider supports `response_format`. */
  json?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  userId?: string;
  /** Label used in debug logs. */
  stage?: string;
  /** Enables debug logging (errors are always logged). */
  debugLogging?: boolean;
};

export type LlmResult = {
  text: string;
  usage: Record<string, number>;
  finishReason: string;
  /** True when JSON mode was requested and actually sent. */
  structuredOutput: boolean;
};

const connectionCache = new Map<string, { expiresAt: number; connection: LlmConnection }>();
const unsupportedStructuredOutput = new Set<string>();

function cacheConnection(key: string, connection: LlmConnection): void {
  if (connectionCache.size >= 32) {
    const oldest = connectionCache.keys().next().value;
    if (typeof oldest === "string") connectionCache.delete(oldest);
  }
  connectionCache.set(key, { expiresAt: Date.now() + 5000, connection });
}

/** Test helper: forget cached connections and JSON-mode capability results. */
export function resetLlmClientCaches(): void {
  connectionCache.clear();
  unsupportedStructuredOutput.clear();
}

/** Resolves a connection profile by id (cached for 5 s per user). */
export async function resolveLlmConnection(connectionId: string | null | undefined, userId?: string): Promise<LlmConnection> {
  const id = cleanString(connectionId);
  if (!id) throw new Error("Select an LLM connection first.");
  const cacheKey = JSON.stringify([userId ?? null, id]);
  const cached = connectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.connection;
  const connection = await spindle.connections.get(id, userId);
  if (!connection) throw new Error("LLM connection not found.");
  const resolved: LlmConnection = {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    model: connection.model,
    metadata: connection.metadata
  };
  cacheConnection(cacheKey, resolved);
  return resolved;
}

/** Lists connection profiles; returns [] when the host call fails. */
export async function listLlmConnections(userId?: string): Promise<LlmConnection[]> {
  try {
    return (await spindle.connections.list(userId)).map((connection) => ({
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      model: connection.model
    }));
  } catch (error) {
    spindle.log.warn(`LLM connection list unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

export function effectiveModel(connection: LlmConnection, override?: string): string {
  return cleanString(override) || connection.model;
}

function capabilityKey(connection: LlmConnection, model: string): string {
  return JSON.stringify([connection.provider, model]);
}

/** Providers/models known to accept `response_format: {type:"json_object"}`. */
export function supportsJsonMode(connection: LlmConnection, model: string): boolean {
  const providerModel = `${connection.provider} ${model}`.toLowerCase();
  return /openai|gpt-|gemini|deepseek/.test(providerModel);
}

/** Builds request parameters and reports whether JSON mode was injected. */
export function buildLlmParameters(
  connection: LlmConnection,
  model: string,
  parameters: Record<string, unknown> | undefined,
  json: boolean
): { parameters: Record<string, unknown>; injectedStructuredOutput: boolean } {
  const next = { ...(parameters || {}) };
  const injectedStructuredOutput = json
    && next.response_format === undefined
    && supportsJsonMode(connection, model)
    && !unsupportedStructuredOutput.has(capabilityKey(connection, model));
  if (injectedStructuredOutput) next.response_format = { type: "json_object" };
  return { parameters: next, injectedStructuredOutput };
}

function textParts(value: unknown): string {
  if (typeof value === "string") return value;
  return cleanArray<unknown>(value)
    .map((part) => cleanString(asRecord(part).text) || cleanString(asRecord(part).content))
    .filter(Boolean)
    .join("\n");
}

/** Extracts the response text from a host generation result. */
export function extractText(result: unknown): string {
  if (typeof result === "string") return result;
  const root = asRecord(result);
  for (const key of ["content", "text", "output", "message"]) {
    const value = root[key];
    if (typeof value === "string") return value;
    const text = textParts(value);
    if (text) return text;
  }
  const choice = asRecord(cleanArray<unknown>(root.choices)[0]);
  return textParts(asRecord(choice.message).content);
}

export function extractUsage(result: unknown): Record<string, number> {
  const usage = asRecord(asRecord(result).usage);
  const output: Record<string, number> = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens", "total_cached_tokens",
    "prompt_cache_hit_tokens", "prompt_cache_miss_tokens", "cache_write_tokens"]) {
    const value = Number(usage[key]);
    if (Number.isFinite(value)) output[key] = value;
  }
  const promptDetails = asRecord(usage.prompt_tokens_details);
  for (const key of ["cached_tokens", "cache_write_tokens"]) {
    const value = Number(promptDetails[key]);
    if (Number.isFinite(value)) output[key] = value;
  }
  return output;
}

export function extractFinishReason(result: unknown): string {
  const object = asRecord(result);
  if (typeof object.finish_reason === "string") return object.finish_reason;
  const first = asRecord(cleanArray<unknown>(object.choices)[0]);
  return typeof first.finish_reason === "string" ? first.finish_reason : "";
}

function isJsonModeRejection(reason: string): boolean {
  return /\b400\b|invalid.*(?:response|argument|format)|response_format/i.test(reason);
}

/**
 * One raw generation through a connection profile. Throws
 * `Error("LLM generation failed: ...")` on failure, or an AbortError when the
 * caller's signal aborted.
 */
export async function callLlm(options: LlmCallOptions): Promise<LlmResult> {
  const { connection, messages, signal, userId } = options;
  const model = effectiveModel(connection, options.model);
  const stage = options.stage || "llm";
  const log = { debugLogging: options.debugLogging === true };
  const timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_LLM_TIMEOUT_MS;
  const selected = buildLlmParameters(connection, model, options.parameters, options.json === true);
  const startedAt = Date.now();

  const run = async (parameters: Record<string, unknown>): Promise<unknown> => {
    throwIfAborted(signal);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error(`LLM request timed out after ${timeoutMs} ms.`)), timeoutMs);
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      // `provider` and `model` are read by the host but missing from the DTO type.
      return await spindle.generate.raw({
        type: "raw",
        provider: connection.provider,
        model,
        connection_id: connection.id,
        messages,
        parameters,
        reasoning: { source: "off" },
        userId,
        signal: controller.signal
      } as unknown as Parameters<typeof spindle.generate.raw>[0]);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  };

  try {
    logStage(log, `${stage}_start`, {
      provider: connection.provider,
      model,
      connectionId: connection.id,
      parameterKeys: keysOf(selected.parameters),
      messageCount: messages.length
    });
    let structuredOutput = selected.injectedStructuredOutput;
    let result: unknown;
    try {
      result = await run(selected.parameters);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!selected.injectedStructuredOutput || signal?.aborted || !isJsonModeRejection(reason)) throw error;
      unsupportedStructuredOutput.add(capabilityKey(connection, model));
      const fallback = { ...selected.parameters };
      delete fallback.response_format;
      structuredOutput = false;
      logStage(log, `${stage}_structured_output_fallback`, { reason }, "warn");
      result = await run(fallback);
    }
    const text = extractText(result);
    const usage = extractUsage(result);
    const finishReason = extractFinishReason(result);
    logStage(log, `${stage}_done`, {
      outputLength: text.length,
      elapsedMs: Date.now() - startedAt,
      ...(finishReason ? { finishReason } : {}),
      ...(Object.keys(usage).length ? { usage } : {})
    });
    if (finishReason === "length" && !text.trim()) throw new Error("The response was truncated before producing any output.");
    return { text, usage, finishReason, structuredOutput };
  } catch (error) {
    if (signal?.aborted) throw abortError(typeof signal.reason === "string" ? signal.reason : undefined);
    const message = error instanceof Error ? error.message : String(error);
    logStage(log, `${stage}_error`, { elapsedMs: Date.now() - startedAt, error: message }, "error");
    throw new Error(`LLM generation failed: ${message}`);
  }
}
