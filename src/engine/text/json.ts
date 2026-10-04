/**
 * Lenient JSON extraction for LLM responses (spec/llm.md §4.2).
 */
import { parseLenientJson as coreParseLenientJson, on as AnalyzerClientErrorCore } from "../core/asset-maid-core";

/** Error thrown when no JSON can be recovered. Original class `on` @79248 ("AnalyzerClientError"). */
export interface AnalyzerClientError extends Error {
  name: "AnalyzerClientError";
  code: string;
  httpStatus: number;
  retryAfterMs: number;
  analyzerRaw?: string;
  responseText?: string;
  context?: unknown;
}

/** Constructor of the core `AnalyzerClientError` (`on`). */
export const AnalyzerClientErrorClass = AnalyzerClientErrorCore as unknown as new (
  message: string,
  options?: { code?: string; httpStatus?: number; retryAfterMs?: number; analyzerRaw?: string; responseText?: string; context?: unknown; cause?: unknown },
) => AnalyzerClientError;

/**
 * Parse an LLM reply as JSON:
 * trim (strings/numbers only, anything else becomes ""), strip a leading ```` ```json ```` / ```` ``` ```` fence and a
 * trailing ```` ``` ````, try `JSON.parse`; on failure scan for balanced `{…}` / `[…]` blocks (string-aware, `xce`
 * @63430) and return the LAST block that parses (a parsed block is skipped over as a whole).
 * Throws {@link AnalyzerClientError} with `code: "ANALYZER_JSON_PARSE"`, message
 * `Analyzer did not return JSON: <first 300 chars>` and `analyzerRaw` = the cleaned text.
 * Original: `iQe` @79678.
 */
export function parseLenientJson(raw: unknown): unknown {
  return coreParseLenientJson(raw);
}

/** True when `error` is the lenient parser failure (`code === "ANALYZER_JSON_PARSE"`). */
export function isLenientJsonParseError(error: unknown): error is AnalyzerClientError {
  return error instanceof AnalyzerClientErrorCore && (error as AnalyzerClientError).code === "ANALYZER_JSON_PARSE";
}
