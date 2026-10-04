/**
 * Run log (AM "실행 로그" / run logs, spec/llm.md §4.6): memory-only ring of 250 entries (AM `dAt` l.166157,
 * `persistence:"memory"` l.180432). Every append emits `log.appended`; warn/error are mirrored to `spindle.log`.
 */
import type { RuntimeLogEntry } from "../../shared/contract/index.js";
import type { EventBus, RunLog, SpindleHost } from "./types.js";

export const RUN_LOG_LIMIT = 250;

/** The ported cores log with the original "[Asset Maid]" / "[Asset Maid React]" prefixes; show our own name instead. */
export function brandLogMessage(message: string): string {
  return message.replace(/^\[Asset Maid(?: React)?\]\s*/u, "[Inlay] ");
}

function safeDetails(details: unknown): unknown {
  if (details === undefined) return undefined;
  if (details instanceof Error) return { name: details.name, message: details.message, code: (details as { code?: unknown }).code };
  try {
    // Drop non-JSON values (functions, cycles) and very long strings so the frontend payload stays small.
    return JSON.parse(JSON.stringify(details, (_k, v) => (typeof v === "string" && v.length > 4000 ? `${v.slice(0, 4000)}...(${v.length} chars)` : v)));
  } catch {
    return String(details);
  }
}

export function createRunLog(options: { events?: EventBus; host?: Pick<SpindleHost, "log">; limit?: number; now?: () => Date } = {}): RunLog {
  const limit = options.limit ?? RUN_LOG_LIMIT;
  const now = options.now ?? (() => new Date());
  let entries: RuntimeLogEntry[] = [];
  let seq = 0;
  return {
    append(level, scope, message, details) {
      seq += 1;
      const entry: RuntimeLogEntry = { seq, at: now().toISOString(), level, scope, message: brandLogMessage(message) };
      const d = safeDetails(details);
      if (d !== undefined) entry.details = d;
      entries.push(entry);
      if (entries.length > limit) entries = entries.slice(entries.length - limit);
      if (level === "warn" || level === "error") {
        try {
          options.host?.log[level](`[Inlay:${scope}] ${entry.message}`);
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
