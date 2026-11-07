/**
 * Run log (AM "실행 로그" / run logs, spec/llm.md §4.6): memory-only ring of 250 entries (AM `dAt` l.166157,
 * `persistence:"memory"` l.180432). Every append emits `log.appended`; warn/error are mirrored to `spindle.log`.
 */
import type { RuntimeLogEntry } from "../../shared/contract/index.js";
import type { EventBus, RunLog, SpindleHost } from "./types.js";

export const RUN_LOG_LIMIT = 250;
export const MAX_LOG_STRING_LENGTH = 4000;

/** The ported cores log with the original "[Asset Maid]" / "[Asset Maid React]" prefixes; show our own name instead. */
export function brandLogMessage(message: string): string {
  return message.replace(/^\[Asset Maid(?: React)?\]\s*/u, "[Inlay] ");
}

/** Redacts sensitive query parameters, HTTP headers, tokens and secrets (AM 0.9.89.3 redaction). */
export function redactSensitive(text: string): string {
  let s = text.replace(
    /((?:authorization)\s*[:=]\s*(?:bearer|basic)\s+)[^\s,}]+/gi,
    "$1[redacted]",
  );
  s = s.replace(
    /([?&](?:key|api[_-]?key|access[_-]?token|token|secret)=)[^&#\s]+/gi,
    "$1[redacted]",
  );
  s = s.replace(
    /("?(?:api[_-]?key|authorization|private[_-]?key|access[_-]?token|token|secret)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^&#\s,}]+)/gi,
    (m, p1, p2) => {
      const clean = p2.toLowerCase().replace(/^["']|["']$/g, "").trim();
      if (clean === "bearer" || clean === "basic" || clean.startsWith("bearer ") || clean.startsWith("basic ")) return m;
      return `${p1}[redacted]`;
    },
  );
  return s;
}

/** Truncates text exceeding the maximum log length with `...(세부 로그 생략)`. */
export function truncateLog(text: string, max = MAX_LOG_STRING_LENGTH): string {
  return text.length > max ? `${text.slice(0, max)}...(세부 로그 생략)` : text;
}

export function safeDetails(details: unknown): unknown {
  if (details === undefined) return undefined;
  if (details instanceof Error) {
    return {
      name: details.name,
      message: truncateLog(redactSensitive(details.message)),
      code: (details as { code?: unknown }).code,
      ...(details.stack ? { stack: truncateLog(redactSensitive(details.stack)) } : {}),
    };
  }
  if (typeof details === "string") {
    return truncateLog(redactSensitive(details));
  }
  try {
    return JSON.parse(
      JSON.stringify(details, (_k, v) => {
        if (typeof v === "string") {
          return truncateLog(redactSensitive(v));
        }
        return v;
      }),
    );
  } catch {
    return truncateLog(redactSensitive(String(details)));
  }
}

/**
 * The error reason inside log details (`{message}` or `{error: {message}}`) for the one-line host log: "code: message",
 * or just the code when the line already says the message.
 */
function detailReason(details: unknown, line: string): string {
  const d = details && typeof details === "object" ? (details as Record<string, unknown>) : {};
  const error = d.error && typeof d.error === "object" ? (d.error as Record<string, unknown>) : d;
  const message = typeof error.message === "string" ? error.message.trim() : "";
  const code = typeof error.code === "string" ? error.code : "";
  if (!message) return "";
  if (line.includes(message)) return code;
  return (code ? `${code}: ${message}` : message).slice(0, 500);
}

export function createRunLog(options: { events?: EventBus; host?: Pick<SpindleHost, "log">; limit?: number; now?: () => Date } = {}): RunLog {
  const limit = options.limit ?? RUN_LOG_LIMIT;
  const now = options.now ?? (() => new Date());
  let entries: RuntimeLogEntry[] = [];
  let seq = 0;
  return {
    append(level, scope, message, details) {
      seq += 1;
      const formattedMessage = brandLogMessage(truncateLog(redactSensitive(message)));
      const entry: RuntimeLogEntry = { seq, at: now().toISOString(), level, scope, message: formattedMessage };
      const d = safeDetails(details);
      if (d !== undefined) entry.details = d;
      entries.push(entry);
      if (entries.length > limit) entries = entries.slice(entries.length - limit);
      if (level === "warn" || level === "error") {
        try {
          const reason = detailReason(d, entry.message);
          options.host?.log[level](`[Inlay:${scope}] ${entry.message}${reason ? ` (${reason})` : ""}`);
        } catch {
          /* host log unavailable */
        }
      }
      options.events?.emit("log.appended", { entry });
      return entry;
    },
    list(opts = {}) {
      const since = opts.sinceSeq ?? 0;
      const filtered = entries.filter((e) => e.seq > since);
      const max = opts.limit && opts.limit > 0 ? Math.floor(opts.limit) : filtered.length;
      return filtered.slice(Math.max(0, filtered.length - max)).map((e) => ({ ...e }));
    },
    clear() {
      entries = [];
    },
  };
}
