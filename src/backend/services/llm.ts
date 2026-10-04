/**
 * LlmService over Lumiverse connection profiles (spec/llm.md; spec/lumiverse-host.md §2).
 *
 * - Transport: `spindle.generate.raw` with an explicit model (`settings.model || connection.model`): the host uses
 *   `input.model` verbatim for raw calls and does not merge preset parameters (lumiverse-host §2).
 * - Reasoning: `config.analysis.reasoning` -> Lumiverse reasoning DTO (inherit / off / custom + effort). Replaces AM `vk`/`iEe`.
 * - JSON mode: `response_format: {type:"json_object"}` for OpenAI-compatible / Gemini / DeepSeek providers (AM forced JSON mode
 *   where the provider had one, Claude got none, spec/llm.md §0.2). A 400-style rejection is remembered per provider/model and the
 *   call is resent once without it (not counted as a retry).
 * - Parsing: the engine's lenient parser (AM `iQe` @79678) -> ANALYZER_JSON_PARSE with `analyzerRaw`.
 * - Vision: `analysis.vision` auto/supported/unsupported + connection metadata + a per connection/model cache (AM `Rde` @81538).
 *   An image-unsupported error (AM `oP` @81557) marks the model unsupported and the call is repeated text-only.
 * - Retries: AM `hw` @81304 / `OQe` @81278: `runtime.generationAutoRetryCount` (0..10, default 5), fixed 100 ms delay (`jQe`),
 *   retryable = HTTP 408/429/5xx, timeout, empty response, JSON parse, provider interrupted, network errors.
 * - Timeout: our own per attempt (`analysis.timeoutMs`, 1000..300000), chained with the caller signal. Aborts never retry.
 *
 * `complete()` throws RpcFailure (`detailCode` = AM code, `cause` = the AnalyzerClientError). `analyzerClient()` throws the
 * engine's AnalyzerClientError (`on` @79248) so the engine's own checks (`Tde` @81611, `Lde`, soft parse results) work, and
 * does NOT retry by default (the V4.5 stage retries twice itself, `Fz` @81986, and the chat loop owns the outer retries).
 */
import { AnalyzerClientErrorClass, parseLenientJson, type AnalyzerClientError } from "../../engine/text/json.js";
import {
  ANALYZER_TIMEOUT_MAX_MS,
  ANALYZER_TIMEOUT_MIN_MS,
  normalizeAnalyzerSettings,
  type AnalyzerSettings,
  type InlayConfig,
  type LlmConnectionSummary,
  type ModelOption,
  type RpcError,
  type RpcErrorCode,
} from "../../shared/contract/index.js";
import { isAbortLike, RpcFailure } from "../rpc/errors.js";
import type {
  AnalyzerClientLike,
  LlmCallOptions,
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmImagePart,
  LlmMessage,
  LlmService,
  LlmTextPart,
  RunLog,
  SpindleHost,
} from "./types.js";
import { abortError, asArray, asRecord, errorMessage, sleep, str, TtlCache } from "./util.js";

export const DEFAULT_RETRY_COUNT = 5;
export const MAX_RETRY_COUNT = 10;
/** AM `jQe` @81290: fixed delay between retries. */
export const RETRY_DELAY_MS = 100;
/** AM `Rwe` (extract/llm/Rwe.txt): "안녕하세요. 짧게 인사해 주세요." */
export const DEFAULT_TEST_MESSAGE = "Hello. Please greet me briefly.";
export const DEFAULT_TEST_MESSAGE_KO = "안녕하세요. 짧게 인사해 주세요.";

export interface LlmServiceDeps {
  host: SpindleHost;
  userId: string | undefined;
  loadConfig: () => Promise<InlayConfig>;
  log?: RunLog;
  /** Same-origin REST JSON through the frontend bridge (model lists). Optional. */
  getJson?: <T>(url: string, options?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<T>;
  /** Test hook for the retry delay. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

interface ResolvedConnection {
  id: string;
  name: string;
  provider: string;
  model: string;
  metadata: Record<string, unknown>;
}

/* ------------------------------------------------------------------------------------------------
 * Pure helpers (exported for tests)
 * ---------------------------------------------------------------------------------------------- */

/** Providers/models known to accept `response_format: {type:"json_object"}`. */
export function supportsJsonMode(provider: string, model: string): boolean {
  const p = `${provider} ${model}`.toLowerCase();
  if (/anthropic|claude/.test(provider.toLowerCase())) return false;
  return /openai|gpt-|gemini|google|deepseek|openrouter|xai|grok|mistral|nanogpt/.test(p);
}

/** Lumiverse reasoning DTO from the analyzer settings (AM thinkingMode default/off/on -> inherit/off/custom). */
export function reasoningDto(reasoning: AnalyzerSettings["reasoning"]): Record<string, unknown> {
  if (reasoning.mode === "off") return { source: "off" };
  if (reasoning.mode === "custom") return { source: "custom", apiReasoning: true, effort: reasoning.effort };
  return { source: "inherit" };
}

function textParts(value: unknown): string {
  if (typeof value === "string") return value;
  return asArray(value)
    .map((part) => {
      const r = asRecord(part);
      if (r.type === "thinking" || r.type === "reasoning") return "";
      return typeof r.text === "string" ? r.text : typeof r.content === "string" ? r.content : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Response text of a host generation result (string, {content}, {text}, OpenAI choices ...). */
export function extractText(result: unknown): string {
  if (typeof result === "string") return result;
  const root = asRecord(result);
  for (const key of ["content", "text", "output_text", "output", "message"]) {
    const value = root[key];
    if (typeof value === "string") return value;
    const text = textParts(value) || (value && typeof value === "object" && !Array.isArray(value) ? textParts(asRecord(value).content) : "");
    if (text) return text;
  }
  const choice = asRecord(asArray(root.choices)[0]);
  return textParts(asRecord(choice.message).content) || (typeof choice.text === "string" ? choice.text : "");
}

export function extractUsage(result: unknown): Record<string, number> {
  const usage = asRecord(asRecord(result).usage);
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(usage)) {
    const n = Number(value);
    if (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) if (Number.isFinite(n)) out[key] = n;
  }
  const details = asRecord(usage.prompt_tokens_details);
  for (const key of ["cached_tokens", "cache_write_tokens"]) {
    const n = Number(details[key]);
    if (Number.isFinite(n) && details[key] !== undefined) out[key] = n;
  }
  return out;
}

export function extractFinishReason(result: unknown): string {
  const root = asRecord(result);
  if (typeof root.finish_reason === "string") return root.finish_reason;
  if (typeof root.finishReason === "string") return root.finishReason;
  const first = asRecord(asArray(root.choices)[0]);
  return typeof first.finish_reason === "string" ? first.finish_reason : "";
}

/** Explicit vision capability in connection metadata: true/false when declared, null when unknown. */
export function declaredVisionSupport(metadata: unknown): boolean | null {
  const record = asRecord(metadata);
  const pick = (root: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) if (typeof root[key] === "boolean") return root[key] as boolean;
    return null;
  };
  const direct = pick(record, ["vision", "supportsVision", "supports_vision", "multimodal", "supportsImages", "supports_images"]);
  if (direct !== null) return direct;
  const capabilities = asRecord(record.capabilities);
  const nested = pick(capabilities, ["vision", "image", "images", "multimodal"]);
  if (nested !== null) return nested;
  const modalities = [record.input_modalities, record.inputModalities, capabilities.input_modalities, capabilities.inputModalities].flatMap((v) => asArray(v).map((x) => str(x).toLowerCase()));
  if (modalities.includes("image") || modalities.includes("vision")) return true;
  if (modalities.length > 0 && modalities.every((v) => v === "text")) return false;
  return null;
}

/** True when a provider error means "images are not accepted" (AM `oP` @81557-81568). */
export function unsupportedVisionError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return /(?:image|vision|multimodal).*(?:unsupported|not supported|not allowed|invalid|not enabled)|(?:unsupported|invalid|does not support|doesn't support|cannot read|can't read).*(?:image|vision|content.*array|input modality)|text[- ]only|no endpoints found that support image/.test(message);
}

function isJsonModeRejection(error: unknown): boolean {
  const message = errorMessage(error);
  return /response_format|json_object|json mode|structured output/i.test(message) || (httpStatusOf(error) === 400 && /format|invalid.*(?:argument|parameter)/i.test(message));
}

/** HTTP status of a host/provider error (`status` field or "(429)" / "HTTP 429" in the message). */
export function httpStatusOf(error: unknown): number {
  const r = asRecord(error);
  for (const key of ["status", "statusCode", "httpStatus"]) {
    const n = Number(r[key]);
    if (Number.isInteger(n) && n >= 100 && n <= 599) return n;
  }
  const message = errorMessage(error);
  const m = /(?:\(|\bHTTP\s*|\bstatus(?: code)?[:\s]*|\berror\s+)([1-5]\d\d)\b/i.exec(message) ?? /\b(400|401|402|403|404|408|409|413|415|422|429|500|502|503|504|529)\b/.exec(message);
  return m ? Number(m[1]) : 0;
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return /fetch failed|network error|failed to fetch|econnreset|econnrefused|socket hang up|socket connection was closed|terminated|etimedout/i.test(errorMessage(error));
}

function makeAnalyzerError(message: string, extra: { code: string; httpStatus?: number; analyzerRaw?: string; responseText?: string; cause?: unknown }): AnalyzerClientError {
  return new AnalyzerClientErrorClass(message, extra);
}

/** Host/provider failure -> AnalyzerClientError with an AM code. */
export function classifyLlmError(error: unknown): AnalyzerClientError {
  if (error instanceof AnalyzerClientErrorClass) return error as AnalyzerClientError;
  const code = str(asRecord(error).code);
  if (/^ANALYZER_/.test(code)) return makeAnalyzerError(errorMessage(error), { code, httpStatus: httpStatusOf(error), cause: error });
  const status = httpStatusOf(error);
  if (status) return makeAnalyzerError(`Analyzer HTTP ${status}: ${errorMessage(error).slice(0, 500)}`, { code: "ANALYZER_HTTP", httpStatus: status, responseText: errorMessage(error).slice(0, 2000), cause: error });
  if (isNetworkError(error)) return makeAnalyzerError(errorMessage(error), { code: "ANALYZER_NETWORK", cause: error });
  return makeAnalyzerError(errorMessage(error) || "Analyzer request failed.", { code: "ANALYZER_ERROR", cause: error });
}

/** AM `OQe` @81278 (+ network errors, port addition for host transport failures). */
export function isRetryableLlmError(error: AnalyzerClientError): boolean {
  switch (error.code) {
    case "ANALYZER_HTTP":
      return error.httpStatus === 408 || error.httpStatus === 429 || error.httpStatus >= 500;
    case "ANALYZER_TIMEOUT":
    case "ANALYZER_EMPTY_RESPONSE":
    case "ANALYZER_JSON_PARSE":
    case "ANALYZER_PROVIDER_INTERRUPTED":
    case "ANALYZER_NETWORK":
      return true;
    default:
      return false;
  }
}

/** AnalyzerClientError -> contract RpcError. */
export function llmErrorToRpc(error: AnalyzerClientError): RpcError {
  let code: RpcErrorCode = "provider-error";
  if (error.code === "ANALYZER_TIMEOUT") code = "timeout";
  else if (error.code === "ANALYZER_VISION_UNSUPPORTED") code = "unsupported";
  else if (error.code === "ANALYZER_CONNECTION_MISSING" || error.code === "ANALYZER_MODEL_MISSING") code = "bad-request";
  else if (error.code === "ANALYZER_HTTP" && (error.httpStatus === 401 || error.httpStatus === 403)) code = "permission-denied";
  const details: Record<string, unknown> = {};
  if (error.httpStatus) details.httpStatus = error.httpStatus;
  if (error.analyzerRaw) details.analyzerRaw = error.analyzerRaw.slice(0, 3000);
  if (error.responseText) details.responseText = error.responseText.slice(0, 3000);
  return {
    code,
    message: error.message,
    detailCode: error.code,
    retryable: isRetryableLlmError(error),
    ...(Object.keys(details).length ? { details } : {}),
  };
}

function hasImages(messages: LlmMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image"));
}

/** Drop image parts (and AM's per-image label parts stay as text). */
export function dropImages(messages: LlmMessage[]): LlmMessage[] {
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const texts = m.content.filter((p): p is LlmTextPart => p.type === "text");
    return { ...m, content: texts.length === 1 ? texts[0]!.text : texts };
  });
}

/** Engine message (AM part shape `{type:"image", data, mimeType}` / `{type:"text", text}`) -> Lumiverse message. */
export function toLlmMessage(message: { role: string; content: unknown }): LlmMessage {
  const role = message.role === "system" || message.role === "assistant" ? message.role : "user";
  if (typeof message.content === "string") return { role, content: message.content };
  const parts: Array<LlmTextPart | LlmImagePart> = [];
  for (const raw of asArray(message.content)) {
    const p = asRecord(raw);
    if (p.type === "image") {
      const data = String(p.data ?? "").replace(/^data:[^;,]+;base64,/, "");
      const mime = str(p.mime_type) || str(p.mimeType) || "image/png";
      if (data) parts.push({ type: "image", data, mime_type: mime });
    } else if (typeof p.text === "string") parts.push({ type: "text", text: p.text });
  }
  return { role, content: parts };
}

function clampRetries(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(MAX_RETRY_COUNT, Math.floor(n)));
}

/* ------------------------------------------------------------------------------------------------
 * Service
 * ---------------------------------------------------------------------------------------------- */

export function createLlmService(deps: LlmServiceDeps): LlmService {
  const { host, userId } = deps;
  const connectionCache = new TtlCache<ResolvedConnection>(5000, 32);
  const jsonModeRejected = new Set<string>();
  const visionCache = new Map<string, boolean>();
  const wait = deps.sleep ?? sleep;
  const log = (level: "debug" | "info" | "warn" | "error", message: string, details?: unknown) => deps.log?.append(level, "llm", message, details);

  async function resolveConnection(connectionId: string): Promise<ResolvedConnection> {
    const key = connectionId || "\u0000default";
    const cached = connectionCache.get(key);
    if (cached) return cached;
    let dto: Record<string, unknown> | null = null;
    try {
      if (connectionId) dto = asRecord(await host.connections.get(connectionId, userId));
      else {
        const list = asArray<Record<string, unknown>>(await host.connections.list(userId));
        dto = list.find((c) => c.is_default === true) ?? list[0] ?? null;
      }
    } catch (error) {
      throw new RpcFailure({ code: "provider-error", message: `Could not read the LLM connection: ${errorMessage(error)}`, detailCode: "ANALYZER_CONNECTION_MISSING" });
    }
    if (!dto || !str(dto.id)) {
      throw new RpcFailure({
        code: "bad-request",
        message: connectionId ? "The selected LLM connection no longer exists. Select another connection in the model settings." : "No LLM connection is configured. Add one in Lumiverse and select it in the model settings.",
        detailCode: "ANALYZER_CONNECTION_MISSING",
      });
    }
    return connectionCache.set(key, { id: str(dto.id), name: str(dto.name), provider: str(dto.provider), model: str(dto.model), metadata: asRecord(dto.metadata) });
  }

  async function effectiveSettings(overrides?: Partial<AnalyzerSettings>): Promise<{ settings: AnalyzerSettings; retryDefault: number }> {
    const config = await deps.loadConfig();
    const settings = normalizeAnalyzerSettings({ ...config.analysis, ...(overrides ?? {}), reasoning: { ...config.analysis.reasoning, ...(overrides?.reasoning ?? {}) } });
    return { settings, retryDefault: clampRetries(config.runtime.generationAutoRetryCount, DEFAULT_RETRY_COUNT) };
  }

  function visionKey(connection: ResolvedConnection, model: string): string {
    return JSON.stringify([connection.id, model]);
  }

  function visionFor(settings: AnalyzerSettings, connection: ResolvedConnection, model: string): boolean {
    if (settings.vision === "supported") return true;
    if (settings.vision === "unsupported") return false;
    const cached = visionCache.get(visionKey(connection, model));
    if (cached !== undefined) return cached;
    const declared = declaredVisionSupport(connection.metadata);
    if (declared !== null) return declared;
    // AM `ym`: deepseek is always "unsupported"; everything else is tried and classified on error.
    return !/deepseek/i.test(`${connection.provider} ${model}`) || /vl|vision/i.test(model);
  }

  async function oneAttempt(input: {
    connection: ResolvedConnection;
    model: string;
    messages: LlmMessage[];
    parameters: Record<string, unknown>;
    reasoning: Record<string, unknown>;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<unknown> {
    if (input.signal?.aborted) throw abortError(input.signal.reason);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, input.timeoutMs);
    const onAbort = () => controller.abort();
    input.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const request = {
        type: "raw",
        // `provider`/`model` are read by the host but missing from GenerationRequestDTO (lumiverse-host §2).
        provider: input.connection.provider,
        model: input.model,
        connection_id: input.connection.id,
        messages: input.messages,
        parameters: input.parameters,
        reasoning: input.reasoning,
        userId,
        signal: controller.signal,
      };
      // Race too: a host that ignores the signal must not keep us waiting past the timeout.
      return await new Promise((resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(abortError()), { once: true });
        host.generate.raw(request as unknown as Parameters<SpindleHost["generate"]["raw"]>[0]).then(resolve, reject);
      });
    } catch (error) {
      if (timedOut && !input.signal?.aborted) throw makeAnalyzerError(`Analyzer timed out after ${input.timeoutMs} ms`, { code: "ANALYZER_TIMEOUT" });
      if (input.signal?.aborted || isAbortLike(error)) throw abortError(input.signal?.reason);
      throw error;
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
    }
  }

  /** Core loop; throws AnalyzerClientError (or AbortError). */
  async function run(request: LlmCompleteRequest, options: LlmCallOptions, defaultRetries: "config" | number): Promise<LlmCompleteResult> {
    const started = Date.now();
    const { settings, retryDefault } = await effectiveSettings(request.settings);
    let connection: ResolvedConnection;
    try {
      connection = await resolveConnection(settings.connectionId);
    } catch (error) {
      if (error instanceof RpcFailure) throw makeAnalyzerError(error.message, { code: error.error.detailCode ?? "ANALYZER_CONNECTION_MISSING", cause: error });
      throw error;
    }
    const model = settings.model || connection.model;
    if (!model) throw makeAnalyzerError("Analyzer model is empty. Select a model in the model settings.", { code: "ANALYZER_MODEL_MISSING" });

    const retries = request.retries !== undefined ? clampRetries(request.retries, 0) : defaultRetries === "config" ? retryDefault : defaultRetries;
    const total = retries + 1;
    const timeoutMs = Math.max(ANALYZER_TIMEOUT_MIN_MS, Math.min(ANALYZER_TIMEOUT_MAX_MS, Math.round(settings.timeoutMs)));
    const reasoning = reasoningDto(settings.reasoning);
    const capKey = JSON.stringify([connection.provider, model]);

    let messages = request.messages;
    let imagesDropped = false;
    if (hasImages(messages) && !visionFor(settings, connection, model)) {
      if (request.visionFallback === "fail") throw makeAnalyzerError("The selected analyzer model cannot read images.", { code: "ANALYZER_VISION_UNSUPPORTED" });
      messages = dropImages(messages);
      imagesDropped = true;
      log("info", `Images dropped: ${model} cannot read images (${request.purpose}).`);
    }

    const baseParameters: Record<string, unknown> = { ...(request.parameters ?? {}) };
    const temperature = request.temperature ?? settings.temperature;
    if (baseParameters.temperature === undefined && Number.isFinite(temperature)) baseParameters.temperature = temperature;
    const maxTokens = request.maxTokens ?? settings.maxTokens;
    if (baseParameters.max_tokens === undefined && maxTokens > 0) baseParameters.max_tokens = Math.floor(maxTokens);

    let attempt = 0;
    for (;;) {
      attempt += 1;
      let jsonMode =
        request.responseMode === "json" && settings.jsonMode && baseParameters.response_format === undefined && supportsJsonMode(connection.provider, model) && !jsonModeRejected.has(capKey);
      try {
        let result: unknown;
        for (;;) {
          const parameters = jsonMode ? { ...baseParameters, response_format: { type: "json_object" } } : baseParameters;
          try {
            result = await oneAttempt({ connection, model, messages, parameters, reasoning, timeoutMs, signal: options.signal });
            break;
          } catch (error) {
            if (isAbortLike(error) || error instanceof AnalyzerClientErrorClass) throw error;
            if (jsonMode && isJsonModeRejection(error)) {
              jsonModeRejected.add(capKey);
              jsonMode = false;
              log("warn", `JSON mode rejected by ${connection.provider}/${model}; resending without it.`, errorMessage(error));
              continue;
            }
            if (!imagesDropped && hasImages(messages) && unsupportedVisionError(error)) {
              visionCache.set(visionKey(connection, model), false);
              if (request.visionFallback === "fail") throw makeAnalyzerError("The selected analyzer model cannot read images.", { code: "ANALYZER_VISION_UNSUPPORTED", cause: error });
              messages = dropImages(messages);
              imagesDropped = true;
              log("warn", `${model} rejected images; resending text-only (${request.purpose}).`, errorMessage(error));
              continue;
            }
            throw classifyLlmError(error);
          }
        }
        if (hasImages(messages) && settings.vision === "auto") visionCache.set(visionKey(connection, model), true);
        const raw = extractText(result);
        const finishReason = extractFinishReason(result);
        if (!raw.trim()) {
          if (finishReason === "length") throw makeAnalyzerError("The analyzer response was truncated before any output.", { code: "ANALYZER_OUTPUT_TRUNCATED" });
          if (finishReason === "content_filter") throw makeAnalyzerError("The provider filtered the analyzer response.", { code: "ANALYZER_CONTENT_FILTERED" });
          throw makeAnalyzerError("The analyzer returned an empty response.", { code: "ANALYZER_EMPTY_RESPONSE" });
        }
        const parsed = request.responseMode === "json" ? parseLenientJson(raw) : raw;
        log("debug", `${request.purpose}: ${model} answered (${raw.length} chars, attempt ${attempt}/${total}).`);
        return { raw, parsed, connectionId: connection.id, model, attempts: attempt, usage: extractUsage(result), finishReason, jsonMode, imagesDropped, latencyMs: Date.now() - started };
      } catch (error) {
        if (isAbortLike(error) || options.signal?.aborted) throw abortError(options.signal?.reason);
        const classified = classifyLlmError(error);
        if (attempt >= total || !isRetryableLlmError(classified)) {
          log("error", `${request.purpose}: ${classified.message}`, { code: classified.code, attempts: attempt, model });
          (classified as AnalyzerClientError & { attempts?: number }).attempts = attempt;
          throw classified;
        }
        options.onRetry?.({ attempt, total: retries, error: llmErrorToRpc(classified) });
        log("warn", `${request.purpose}: retry ${attempt}/${retries} after ${classified.code}.`, classified.message);
        await wait(RETRY_DELAY_MS, options.signal);
      }
    }
  }

  const service: LlmService = {
    async complete(request, options = {}) {
      try {
        return await run(request, options, "config");
      } catch (error) {
        if (isAbortLike(error)) throw error;
        if (error instanceof RpcFailure) throw error;
        const classified = classifyLlmError(error);
        throw new RpcFailure(llmErrorToRpc(classified), { cause: classified });
      }
    },

    analyzerClient(clientOptions = {}): AnalyzerClientLike {
      return {
        async complete(_config, messages, options = {}) {
          const o = asRecord(options);
          const signal = (o.signal as AbortSignal | undefined) ?? clientOptions.signal;
          const timeoutMs = Number(o.timeoutMs);
          const maxOutputTokens = Number(o.maxOutputTokens ?? o.maxTokens);
          const result = await run(
            {
              purpose: str(o.purpose) || clientOptions.purpose || "analyzer",
              messages: messages.map(toLlmMessage),
              responseMode: o.responseMode === "text" ? "text" : "json",
              ...(o.structuredOutputSchema && typeof o.structuredOutputSchema === "object" ? { schema: o.structuredOutputSchema as Record<string, unknown> } : {}),
              ...(Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? { maxTokens: maxOutputTokens } : {}),
              ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { settings: { timeoutMs } } : {}),
              ...(o.retries !== undefined ? { retries: Number(o.retries) } : {}),
            },
            { signal, onRetry: clientOptions.onRetry },
            0,
          );
          return { raw: result.raw, parsed: result.parsed, model: result.model, attempts: result.attempts, usage: result.usage };
        },
      };
    },

    async supportsVision(overrides) {
      const { settings } = await effectiveSettings(overrides);
      if (settings.vision !== "auto") return settings.vision === "supported";
      try {
        const connection = await resolveConnection(settings.connectionId);
        return visionFor(settings, connection, settings.model || connection.model);
      } catch {
        return false;
      }
    },

    async listConnections() {
      try {
        const list = asArray<Record<string, unknown>>(await host.connections.list(userId));
        return list.map(
          (c): LlmConnectionSummary => ({ id: str(c.id), name: str(c.name), provider: str(c.provider), model: str(c.model), isDefault: c.is_default === true, hasApiKey: c.has_api_key === true }),
        );
      } catch (error) {
        throw new RpcFailure({ code: "provider-error", message: `Could not list LLM connections: ${errorMessage(error)}` });
      }
    },

    async listModels(connectionId) {
      const connection = await resolveConnection(str(connectionId));
      const out: ModelOption[] = [];
      const seen = new Set<string>();
      const add = (id: string, label = id) => {
        if (id && !seen.has(id)) {
          seen.add(id);
          out.push({ id, label });
        }
      };
      add(connection.model);
      if (deps.getJson) {
        try {
          const result = asRecord(await deps.getJson(`/api/v1/connections/${encodeURIComponent(connection.id)}/models`, { timeoutMs: 20000 }));
          const labels = asRecord(result.model_labels);
          for (const id of asArray(result.models)) if (typeof id === "string") add(id, str(labels[id]) || id);
        } catch (error) {
          log("warn", `Model list of ${connection.name || connection.id} unavailable.`, errorMessage(error));
        }
      }
      return out;
    },

    async testMessage(text) {
      const started = Date.now();
      try {
        const result = await run(
          { purpose: "message-test", messages: [{ role: "user", content: str(text) || DEFAULT_TEST_MESSAGE }], responseMode: "text", retries: 0 },
          {},
          0,
        );
        return { ok: true, latencyMs: Date.now() - started, reply: result.raw };
      } catch (error) {
        const rpc = isAbortLike(error) ? { code: "cancelled" as const, message: "The test was cancelled." } : error instanceof RpcFailure ? error.error : llmErrorToRpc(classifyLlmError(error));
        return { ok: false, latencyMs: Date.now() - started, error: rpc };
      }
    },
  };
  return service;
}
