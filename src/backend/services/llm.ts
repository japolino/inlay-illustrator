/**
 * LlmService over Lumiverse connection profiles (spec/llm.md; spec/lumiverse-host.md §2).
 *
 * - Transport: `spindle.generate.raw` with an explicit model (`settings.model || connection.model`): the host uses
 *   `input.model` verbatim for raw calls and does not merge preset parameters (lumiverse-host §2).
 * - Reasoning: `config.analysis.reasoning` -> Lumiverse reasoning DTO (inherit / off / custom + effort). Replaces AM `vk`/`iEe`.
 * - JSON mode: `response_format: {type:"json_object"}` for OpenAI-format providers, `responseMimeType: "application/json"`
 *   for Lumiverse's `google` / `google_vertex` providers (`jsonModeParameters`) (AM forced JSON mode
 *   where the provider had one, Claude got none, spec/llm.md §0.2). A rejection is resent once without it (not counted as a
 *   retry) and remembered per provider/model only when the error names JSON mode.
 * - Parsing: the engine's lenient parser (AM `iQe` @79678) -> ANALYZER_JSON_PARSE with `analyzerRaw`.
 * - Vision: `analysis.vision` auto/supported/unsupported + connection metadata + a per connection/model cache (AM `Rde` @81538).
 *   An image-unsupported error (AM `oP` @81557) marks the model unsupported (for CAPABILITY_RETRY_MS) and the call is
 *   repeated text-only. An error about one image's format or MIME type only drops those images from that request.
 * - Retries: AM `hw` @81304 / `Not` (0.9.90): `runtime.generationAutoRetryCount` (0..10, default 5), fixed 100 ms delay
 *   (`jQe`). Only transport failures retry: HTTP 408/429/5xx, timeout, provider interrupted, network errors. Content errors
 *   (empty response, JSON parse, ...) fail at once since 0.9.90.
 * - Timeout: our own per attempt (`analysis.timeoutMs`, 1000..300000), chained with the caller signal. Aborts never retry.
 * - Prompt caching: the analyzer client sends the engine's cache partition (static segments first, live input last) instead
 *   of its flat messages, and Anthropic connections get `cache_control` breakpoints at the segment ends (AM `fUe` @79296).
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
  AnalyzerTarget,
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
  /** Same-origin REST JSON through the frontend bridge (model lists on hosts without `connections.getModels`). Optional. */
  getJson?: <T>(url: string, options?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<T>;
  /** Test hook for the retry delay. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Test hook for the capability caches' clock. */
  now?: () => number;
}

/** A remembered "no vision" / "no JSON mode" is tried again after this long (a provider or model can change). */
export const CAPABILITY_RETRY_MS = 30 * 60_000;

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

/**
 * JSON mode (see `jsonModeParameters` for its form) for every connection except Anthropic, as AM sends it to every
 * OpenAI-format provider including custom endpoints (81884). A provider that rejects it is resent without it and remembered.
 */
export function supportsJsonMode(provider: string, _model: string): boolean {
  return !/anthropic|claude/.test(provider.toLowerCase());
}

/**
 * The JSON mode parameter in the form the connection's Lumiverse provider understands. The `google` and `google_vertex`
 * providers build a Gemini body: they put `responseMimeType` into `generationConfig` and copy every key they don't know
 * (`response_format` included) into the body as it is, which Gemini answers with a 400. Every other provider is OpenAI-format.
 */
export function jsonModeParameters(provider: string): Record<string, unknown> {
  return /^google(?:_vertex)?$/.test(provider.trim().toLowerCase()) ? { responseMimeType: "application/json" } : { response_format: { type: "json_object" } };
}

/**
 * Models sent without `temperature` (AM 0.9.91):
 * - `rYe` @88735: Claude Fable/Mythos 5, Sonnet/Opus/Haiku 5, Opus 4.7/4.8;
 * - `jW` @5662 / `kD_91` @5651: Gemini 3 and Gemini 4 Argon/Carbon/Hydrogen (exact names); testing the last path segment
 *   also covers `lJ_91` @5654 (`google/gemini-4-hydrogen` on OpenRouter / OpenAI-compatible endpoints);
 * - `_S` @5666 `mandatory`, new in the OpenAI-format bodies of 0.9.91 (`fYe` @90174): gpt-oss, o1/o3/o4, GPT-5 (base,
 *   mini, nano, pro), GPT-6 except 6-sol / 6-luna / 6.1-terra, Gemini 3 / 2.5 Pro and GLM 5.3. Only when `provider` is
 *   neither Anthropic nor native Google: AM's Claude and Google bodies do not use it. AM also reads the provider's
 *   `reasoning.mandatory` model metadata, which Lumiverse connections do not carry; testing the model id without its
 *   `vendor/` prefix stands in for it on OpenRouter-style ids.
 * AM picks the rule by request format; Lumiverse hides the format, so the Claude and Gemini lists apply to every provider.
 */
export function omitsTemperature(model: string, provider = ""): boolean {
  const full = model.trim().toLowerCase();
  const m = full.split("/").at(-1) ?? "";
  if (
    /^claude-(?:fable|mythos)-5(?:[-.]|$)/.test(m) ||
    /^claude-(?:sonnet|opus|haiku)-5(?:[-.]|$)/.test(m) ||
    /^claude-opus-4-(?:7|8)(?:[-.]|$)/.test(m) ||
    /^gemini-3(?:[.-]|$)/.test(m) ||
    /^gemini-4-(?:argon|carbon|hydrogen)$/.test(m)
  )
    return true;
  if (/anthropic|claude|google|gemini|vertex/i.test(provider)) return false;
  return (
    /(?:^|\/)gpt-oss(?::|[-.]|$)/.test(full) ||
    (!/^gpt-6(?:\.1-terra|-(?:sol|luna))(?:$|-)/.test(m) && /^(?:o[134](?:[-.]|$)|gpt-5(?:-mini|-nano|-pro)?(?:$|-20)|gpt-6(?:[-.]|$))/.test(m)) ||
    /^gemini-(?:3|2\.5-pro)(?:[.-]|$)/.test(m) ||
    /^glm-5\.3(?:[-:]|$)/.test(m)
  );
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

/**
 * True when a provider error means "images are not accepted" (AM 0.9.89.5 `YP` 114563): HTTP 400/415/422 with one of
 * AM's wordings. Port addition: OpenRouter's "no endpoints found that support image input" (404).
 */
export function unsupportedVisionError(error: unknown): boolean {
  const message = errorMessage(error);
  if (/no endpoints found that support image/i.test(message)) return true;
  if (![400, 415, 422].includes(httpStatusOf(error))) return false;
  return [
    /(?:image|image_url|vision|multimodal|visual|modality).{0,160}(?:not supported|unsupported|does not support|isn't supported|not allowed|only supports? text)/iu,
    /(?:not supported|unsupported|does not support|isn't supported|not allowed|only supports? text).{0,160}(?:image|image_url|vision|multimodal|visual|modality)/iu,
    /(?:image|image_url|vision).{0,160}only supported by.{0,80}models?/iu,
    /model.{0,120}(?:is not multimodal|is text[- ]only)/iu,
  ].some((pattern) => pattern.test(message));
}

const SAFE_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

/**
 * Image types to drop when a vision error is about one image's format or MIME type ("Unsupported MIME type: image/gif",
 * "unsupported image ... formats: ['png', 'jpeg']") rather than the model's vision. Null when the error is not about a
 * format. Named types first, else the non-PNG/JPEG ones, else every type sent (all for this request only).
 */
export function rejectedImageTypes(error: unknown, messages: LlmMessage[]): Set<string> | null {
  const message = errorMessage(error);
  if (!/\bmime\b|\bmedia[ _-]?type|image\/[a-z]|\bformats?\b|\b(?:gif|avif|webp|heic|heif|bmp|tiff?|svg)\b/i.test(message)) return null;
  const sent = new Set(messages.flatMap((m) => (Array.isArray(m.content) ? m.content.filter((p): p is LlmImagePart => p.type === "image").map((p) => p.mime_type.toLowerCase()) : [])));
  const named = [...sent].filter((type) => message.toLowerCase().includes(type));
  const namedUnusual = named.filter((type) => !SAFE_IMAGE_TYPES.has(type));
  if (namedUnusual.length || named.length) return new Set(namedUnusual.length ? namedUnusual : named);
  const unusual = [...sent].filter((type) => !SAFE_IMAGE_TYPES.has(type));
  return new Set(unusual.length ? unusual : sent);
}

function dropImageTypes(messages: LlmMessage[], types: ReadonlySet<string>): LlmMessage[] {
  if (!types.size) return messages;
  return messages.map((m) => {
    if (!Array.isArray(m.content) || !m.content.some((p) => p.type === "image" && types.has(p.mime_type.toLowerCase()))) return m;
    const kept = m.content.filter((p) => p.type !== "image" || !types.has(p.mime_type.toLowerCase()));
    return { ...m, content: kept.every((p) => p.type === "text") && kept.length === 1 ? (kept[0] as LlmTextPart).text : kept };
  });
}

/** A rejection that names JSON mode: remembered per provider/model. */
function isJsonModeRejection(error: unknown): boolean {
  return /response_format|json_object|json[ _-]?mode|response_?mime_?type|structured output/i.test(errorMessage(error));
}

/** A 400 that may be about JSON mode without naming it (Gemini's "invalid argument"): resent once without it, not remembered. */
function mayBeJsonModeRejection(error: unknown): boolean {
  return httpStatusOf(error) === 400 && /format|invalid.*(?:argument|parameter)/i.test(errorMessage(error));
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

/**
 * AM 0.9.90 `Not` (N 97273): network/timeout/interrupted and HTTP 408/429/5xx only. Content errors (empty response, JSON
 * parse, filtered, ...) are no longer retried (0.9.89 `OQe` @81278 retried empty responses and JSON parse errors).
 */
export function isRetryableLlmError(error: AnalyzerClientError): boolean {
  switch (error.code) {
    case "ANALYZER_HTTP":
      return error.httpStatus === 408 || error.httpStatus === 429 || error.httpStatus >= 500;
    case "ANALYZER_TIMEOUT":
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

/**
 * Engine cache partition (AM `Vpe`: `cacheSegments[].messages` + `liveMessages`) -> messages with the static segments
 * first and the live input last, so providers can reuse the static prefix across calls. `cacheBreakpoints` are the
 * indices of each segment's last message. Null when the partition is missing or malformed (send `messages` as is).
 * AM's transport sends the same order (`fUe`/`Pse` @79296).
 */
export function partitionMessages(partition: unknown): { messages: LlmMessage[]; cacheBreakpoints: number[] } | null {
  const p = asRecord(partition);
  if (!Array.isArray(p.cacheSegments) || !Array.isArray(p.liveMessages) || !p.liveMessages.length) return null;
  const messages: LlmMessage[] = [];
  const cacheBreakpoints: number[] = [];
  for (const segment of p.cacheSegments) {
    const segmentMessages = asRecord(segment).messages;
    if (!Array.isArray(segmentMessages)) return null;
    if (!segmentMessages.length) continue;
    messages.push(...segmentMessages.map((m) => toLlmMessage(asRecord(m) as { role: string; content: unknown })));
    cacheBreakpoints.push(messages.length - 1);
  }
  messages.push(...p.liveMessages.map((m) => toLlmMessage(asRecord(m) as { role: string; content: unknown })));
  return { messages, cacheBreakpoints };
}

/**
 * The engine analyzer config of a run. Asset Maid 0.9.91 sends Gemini 4 Argon on Vertex AI a compact response contract:
 * `c0e` tests `config.provider === "vertex_ai"` and `config.model === "gemini-4-argon"`, then `s0e` applies `eyt_91` /
 * `bwe_91`. The port's settings name a Lumiverse connection, not a provider, so that pair is filled in here from the
 * resolved connection (Lumiverse provider id `google_vertex`; the model may carry a Google path prefix). Every other
 * target returns the settings unchanged: no `provider` is set, so the core's other provider checks stay off.
 */
export function engineAnalysisConfig<T extends object>(analysis: T, target: AnalyzerTarget | null | undefined): T {
  if (!target || !/vertex/i.test(target.provider)) return analysis;
  const name = target.model.trim().toLowerCase().split("/").pop();
  return name === "gemini-4-argon" ? { ...analysis, provider: "vertex_ai", model: "gemini-4-argon" } : analysis;
}

/** AM `TK_91` @70456: the Gemini 4 models whose cache partition gets its `prefixPreparation` (exact names, optional Google path prefix). */
export function prefixPreparationModel(model: string): boolean {
  return /^(?:google\/|models\/|(?:projects\/[^/]+\/locations\/[^/]+\/)?publishers\/google\/models\/)?gemini-4-(?:carbon|argon|hydrogen)$/i.test(model.trim());
}

/**
 * AM `fXe_91` @71660: the partition without `prefixPreparation`, with the preparation instruction as a system message at
 * the start of every `app-static` segment, the messages of every other segment turned into system messages when
 * `staticBlocksToSystem`, and the preparation turns put before the live messages. Unchanged when there is no preparation.
 */
export function applyPrefixPreparation(partition: unknown, staticBlocksToSystem: boolean): unknown {
  const { prefixPreparation, ...rest } = asRecord(partition);
  if (!prefixPreparation || !Array.isArray(rest.cacheSegments)) return partition;
  const preparation = asRecord(prefixPreparation);
  const instruction = { role: "system", content: preparation.instruction };
  return {
    ...rest,
    cacheSegments: rest.cacheSegments.map((segment: unknown) => {
      const s = asRecord(segment);
      if (!Array.isArray(s.messages)) return segment;
      if (s.kind === "app-static") return { ...s, messages: [instruction, ...s.messages] };
      return staticBlocksToSystem ? { ...s, messages: s.messages.map((m: unknown) => ({ ...asRecord(m), role: "system" })) } : segment;
    }),
    liveMessages: [...asArray(preparation.turns), ...asArray(rest.liveMessages)],
  };
}

/**
 * AM `vZe_91` @88241: the leading run of system messages (when there are at least two) merged into one. String contents
 * are joined with a blank line; part arrays are concatenated with a blank line before the text of every part after the first.
 * `breakpoints` (message indices) are moved to match.
 */
export function mergeLeadingSystemMessages(messages: LlmMessage[], breakpoints: readonly number[] = []): { messages: LlmMessage[]; cacheBreakpoints: number[] } {
  const firstOther = messages.findIndex((m) => m.role !== "system");
  const run = firstOther < 0 ? messages.length : firstOther;
  if (run < 2) return { messages: [...messages], cacheBreakpoints: [...breakpoints] };
  const head = messages.slice(0, run);
  const content: LlmMessage["content"] = head.every((m) => typeof m.content === "string")
    ? head.map((m) => m.content).join("\n\n")
    : head
        .flatMap((m) => (typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : m.content))
        .map((part, i) => (i && part.type === "text" ? { ...part, text: `\n\n${part.text}` } : part));
  return {
    messages: [{ role: "system", content }, ...messages.slice(run)],
    cacheBreakpoints: [...new Set(breakpoints.map((i) => (i < run ? 0 : i - run + 1)))],
  };
}

/**
 * The messages of AM's Gemini 4 prefix preparation (`fYe` @89233-89243, 0.9.91), or null when it does not apply: the
 * partition has no `prefixPreparation` or the model is not Gemini 4 Argon/Carbon/Hydrogen (`uXe_91` -> `TK_91`).
 * Static blocks go to the system role when the preparation asks for it (`staticBlocksInSystem`) on a provider that can
 * serve Gemini 4: AM allows custom_api, openrouter, google_cloud and vertex_ai (always automatic-prefix for Gemini 4), so
 * every Lumiverse provider but Anthropic qualifies. The leading system messages are then merged into one (`vZe_91`, AM's
 * OpenAI-format body; Lumiverse maps system messages for Google itself, so one merged message is sent to every provider).
 * AM also skips requests with PDF parts (none here) and custom_api with cache mode "off" (no cache mode in Lumiverse).
 */
export function prefixPreparedMessages(partition: unknown, model: string, provider: string): { messages: LlmMessage[]; cacheBreakpoints: number[] } | null {
  const preparation = asRecord(asRecord(partition).prefixPreparation);
  if (!asRecord(partition).prefixPreparation || !prefixPreparationModel(model)) return null;
  const staticToSystem = preparation.staticBlocksInSystem === true && !/anthropic|claude/i.test(provider);
  const prepared = partitionMessages(applyPrefixPreparation(partition, staticToSystem));
  if (!prepared) return null;
  return staticToSystem ? mergeLeadingSystemMessages(prepared.messages, prepared.cacheBreakpoints) : prepared;
}

/** Anthropic allows four cache breakpoints per request. */
const MAX_CACHE_BREAKPOINTS = 4;
const EPHEMERAL = Object.freeze({ type: "ephemeral" });

/**
 * Mark cache breakpoints for Anthropic (the only Lumiverse provider that forwards `cache_control`). When the connection
 * has Lumiverse prompt caching on, the host adds up to two markers of its own (system + conversation tail), so ours
 * drop to two. Over budget, the first breakpoints and the last one are kept: the last covers the whole static prefix.
 */
export function withCacheBreakpoints(
  messages: LlmMessage[],
  breakpoints: readonly number[] | undefined,
  connection: { provider: string; metadata: Record<string, unknown> },
): LlmMessage[] {
  if (!breakpoints?.length || !/anthropic/i.test(connection.provider)) return messages;
  const budget = connection.metadata.prompt_caching ? MAX_CACHE_BREAKPOINTS - 2 : MAX_CACHE_BREAKPOINTS;
  const valid = [...new Set(breakpoints)].filter((i) => Number.isInteger(i) && i >= 0 && i < messages.length).sort((a, b) => a - b);
  const chosen = new Set(valid.length > budget ? [...valid.slice(0, budget - 1), valid.at(-1)!] : valid);
  if (!chosen.size) return messages;
  return messages.map((message, index) => {
    if (!chosen.has(index)) return message;
    if (typeof message.content === "string") return { ...message, cache_control: EPHEMERAL };
    const last = message.content.length - 1;
    if (last < 0) return message;
    return { ...message, content: message.content.map((part, i) => (i === last ? { ...part, cache_control: EPHEMERAL } : part)) };
  });
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
  /** provider/model -> when JSON mode was rejected; tried again after CAPABILITY_RETRY_MS. */
  const jsonModeRejected = new Map<string, number>();
  /** connection/model -> vision verdict; a "no" is tried again after CAPABILITY_RETRY_MS. */
  const visionCache = new Map<string, { value: boolean; at: number }>();
  /** provider/model whose provider rejected the cache partition's message shape but took the flat messages. */
  const partitionRejected = new Set<string>();
  const now = deps.now ?? Date.now;
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
    const key = visionKey(connection, model);
    const cached = visionCache.get(key);
    if (cached && !cached.value && now() - cached.at >= CAPABILITY_RETRY_MS) visionCache.delete(key);
    else if (cached) return cached.value;
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

    // The messages sent = source (partition or flat) minus the images dropped so far.
    const flat = request.flatMessages;
    let partitionFallback = false;
    let source = request.messages;
    let breakpoints = request.cacheBreakpoints;
    const prepared = request.cachePartition === undefined ? null : prefixPreparedMessages(request.cachePartition, model, connection.provider);
    if (prepared) [source, breakpoints] = [prepared.messages, prepared.cacheBreakpoints];
    if (flat && partitionRejected.has(capKey)) [source, breakpoints] = [flat, undefined];
    let textOnly = false;
    const rejectedTypes = new Set<string>();
    const prepare = () => withCacheBreakpoints(textOnly ? dropImages(source) : dropImageTypes(source, rejectedTypes), breakpoints, connection);
    let imagesDropped = false;
    if (hasImages(source) && !visionFor(settings, connection, model)) {
      if (request.visionFallback === "fail") throw makeAnalyzerError("The selected analyzer model cannot read images.", { code: "ANALYZER_VISION_UNSUPPORTED" });
      textOnly = true;
      imagesDropped = true;
      log("info", `Images dropped: ${model} cannot read images (${request.purpose}).`);
    }
    let messages = prepare();

    const baseParameters: Record<string, unknown> = { ...(request.parameters ?? {}) };
    const temperature = request.temperature ?? settings.temperature;
    if (baseParameters.temperature === undefined && Number.isFinite(temperature) && !omitsTemperature(model, connection.provider)) baseParameters.temperature = temperature;
    const maxTokens = request.maxTokens ?? settings.maxTokens;
    if (baseParameters.max_tokens === undefined && maxTokens > 0) baseParameters.max_tokens = Math.floor(maxTokens);

    let attempt = 0;
    for (;;) {
      attempt += 1;
      let jsonMode =
        request.responseMode === "json" && settings.jsonMode && baseParameters.response_format === undefined && baseParameters.responseMimeType === undefined && supportsJsonMode(connection.provider, model) && now() - (jsonModeRejected.get(capKey) ?? -Infinity) >= CAPABILITY_RETRY_MS;
      try {
        let result: unknown;
        for (;;) {
          const parameters = jsonMode ? { ...baseParameters, ...jsonModeParameters(connection.provider) } : baseParameters;
          try {
            result = await oneAttempt({ connection, model, messages, parameters, reasoning, timeoutMs, signal: options.signal });
            break;
          } catch (error) {
            if (isAbortLike(error) || error instanceof AnalyzerClientErrorClass) throw error;
            // Image errors first: their wording ("unsupported image ... formats") must not read as a JSON mode rejection.
            if (hasImages(messages) && unsupportedVisionError(error)) {
              const types = rejectedImageTypes(error, messages);
              if (types) {
                // One image's format, not the model's vision: drop those images for this request only, remember nothing.
                const before = rejectedTypes.size;
                for (const type of types) rejectedTypes.add(type);
                if (rejectedTypes.size === before) textOnly = true;
                messages = prepare();
                if (request.visionFallback === "fail" && !hasImages(messages)) throw classifyLlmError(error);
                imagesDropped = true;
                log("warn", `${model} rejected ${textOnly ? "the images" : [...types].join(", ")}; resending without ${textOnly ? "them" : "those"} (${request.purpose}).`, errorMessage(error));
                continue;
              }
              visionCache.set(visionKey(connection, model), { value: false, at: now() });
              if (request.visionFallback === "fail") throw makeAnalyzerError("The selected analyzer model cannot read images.", { code: "ANALYZER_VISION_UNSUPPORTED", cause: error });
              textOnly = true;
              messages = prepare();
              imagesDropped = true;
              log("warn", `${model} rejected images; resending text-only (${request.purpose}).`, errorMessage(error));
              continue;
            }
            if (jsonMode && (isJsonModeRejection(error) || mayBeJsonModeRejection(error))) {
              const named = isJsonModeRejection(error);
              if (named) jsonModeRejected.set(capKey, now());
              jsonMode = false;
              log("warn", `${named ? "JSON mode rejected" : "Possible JSON mode rejection"} by ${connection.provider}/${model}; resending without it.`, errorMessage(error));
              continue;
            }
            // Some providers (strict role alternation) reject the partition's [system, user, user, ...] shape: resend flat once.
            if (flat && source !== flat && httpStatusOf(error) === 400 && !isJsonModeRejection(error) && !unsupportedVisionError(error)) {
              [source, breakpoints] = [flat, undefined];
              partitionFallback = true;
              messages = prepare();
              log("warn", `${connection.provider}/${model} rejected the cache partition; resending the flat messages.`, errorMessage(error));
              continue;
            }
            throw classifyLlmError(error);
          }
        }
        if (partitionFallback) partitionRejected.add(capKey);
        if (hasImages(messages) && settings.vision === "auto") visionCache.set(visionKey(connection, model), { value: true, at: now() });
        const raw = extractText(result);
        const finishReason = extractFinishReason(result);
        if (!raw.trim()) {
          // AM checks the finish reason only for DeepSeek (`JUe` 80056); elsewhere an empty reply is an empty response (not retried).
          if (finishReason === "length" && /deepseek/i.test(connection.provider)) throw makeAnalyzerError("The analyzer response was truncated before any output.", { code: "ANALYZER_OUTPUT_TRUNCATED" });
          if (finishReason === "content_filter") throw makeAnalyzerError("The provider filtered the analyzer response.", { code: "ANALYZER_CONTENT_FILTERED" });
          throw makeAnalyzerError(`The analyzer returned an empty response${finishReason ? ` (${finishReason})` : ""}.`, { code: "ANALYZER_EMPTY_RESPONSE" });
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
          const partitioned = partitionMessages(o.cachePartition);
          const result = await run(
            {
              purpose: str(o.purpose) || clientOptions.purpose || "analyzer",
              messages: partitioned?.messages ?? messages.map(toLlmMessage),
              ...(partitioned ? { cacheBreakpoints: partitioned.cacheBreakpoints, flatMessages: messages.map(toLlmMessage), cachePartition: o.cachePartition } : {}),
              responseMode: o.responseMode === "text" ? "text" : "json",
              ...(o.structuredOutputSchema && typeof o.structuredOutputSchema === "object" ? { schema: o.structuredOutputSchema as Record<string, unknown> } : {}),
              ...(Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? { maxTokens: maxOutputTokens } : {}),
              ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { settings: { timeoutMs } } : {}),
              ...(o.retries !== undefined ? { retries: Number(o.retries) } : {}),
            },
            { signal, onRetry: clientOptions.onRetry },
            0,
          ).catch((error: unknown) => {
            // AM's nativeFetch fails with a TypeError, which the engine's retry checks (`Ume`, chat `Or`) retry.
            if (error instanceof AnalyzerClientErrorClass && (error as AnalyzerClientError).code === "ANALYZER_NETWORK") throw new TypeError((error as Error).message, { cause: error });
            throw error;
          });
          return { raw: result.raw, parsed: result.parsed, model: result.model, attempts: result.attempts, usage: result.usage };
        },
      };
    },

    async supportsVision(overrides) {
      const { settings } = await effectiveSettings(overrides);
      if (settings.vision !== "auto") return settings.vision === "supported";
      // A connection that can't be read rejects with that error: it says nothing about vision.
      const connection = await resolveConnection(settings.connectionId);
      return visionFor(settings, connection, settings.model || connection.model);
    },

    async analyzerTarget(overrides) {
      const { settings } = await effectiveSettings(overrides);
      const connection = await resolveConnection(settings.connectionId);
      return { provider: connection.provider, model: settings.model || connection.model };
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
      try {
        if (host.connections.getModels) {
          for (const model of await host.connections.getModels(connection.id, userId)) add(model.id, model.label || model.id);
        } else if (deps.getJson) {
          // Older hosts lack connections.getModels: read the REST list through the frontend fetch bridge instead.
          const result = asRecord(await deps.getJson(`/api/v1/connections/${encodeURIComponent(connection.id)}/models`, { timeoutMs: 20000 }));
          const labels = asRecord(result.model_labels);
          for (const id of asArray(result.models)) if (typeof id === "string") add(id, str(labels[id]) || id);
        }
      } catch (error) {
        log("warn", `Model list of ${connection.name || connection.id} unavailable.`, errorMessage(error));
      }
      return out;
    },

    async testMessage(text, settings) {
      const started = Date.now();
      try {
        const result = await run(
          { purpose: "message-test", messages: [{ role: "user", content: str(text) || DEFAULT_TEST_MESSAGE }], responseMode: "text", retries: 0, ...(settings ? { settings } : {}) },
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
