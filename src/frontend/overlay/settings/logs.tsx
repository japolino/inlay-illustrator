/** Run log viewer (Asset Maid `Ywt` 138206), developer mode only. Live entries come from `log.appended`. */
import { useEffect, useMemo, useState } from "preact/hooks";
import type { RuntimeLogEntry } from "../../../shared/contract/rpc.js";
import { useApp } from "../../state/app-state.js";
import { toRpcError } from "../../rpc/client.js";
import { Button, CheckIcon, IconButton, Select, TrashIcon, cn, type SelectOption } from "../ui/index.js";
import { CopyIcon, SpinnerIcon } from "./icons.js";
import { LOG_LABELS as G, PAGE_TITLES } from "./labels.js";
import { Badge, SettingsFrame, type BadgeTone } from "./parts.js";

/** In-memory cap (AM 250). */
export const MAX_LOG_ENTRIES = 250;

export function scopeLabel(scope: string): string {
  return G.scopes[scope] ?? scope;
}

/** Merges entries by `seq`, newest first, capped. */
export function mergeLogEntries(current: readonly RuntimeLogEntry[], incoming: readonly RuntimeLogEntry[]): RuntimeLogEntry[] {
  const bySeq = new Map<number, RuntimeLogEntry>();
  for (const entry of [...current, ...incoming]) bySeq.set(entry.seq, entry);
  return [...bySeq.values()].sort((a, b) => b.seq - a.seq).slice(0, MAX_LOG_ENTRIES);
}

/** Text export of one entry (`Gwt` 138059). */
export function formatLogEntry(entry: RuntimeLogEntry): string {
  const time = formatTime(entry.at);
  const lines = [`[${time}] [${entry.scope}] ${entry.level}`, entry.message || G.noMessage];
  if (entry.details !== undefined) lines.push("data:", safeJson(entry.details));
  return lines.join("\n");
}

/** Copy text for a list (oldest -> newest). */
export function formatLogList(entries: readonly RuntimeLogEntry[]): string {
  return [...entries].sort((a, b) => a.seq - b.seq).map(formatLogEntry).join("\n\n---\n\n");
}

function formatTime(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : date.toLocaleTimeString();
}
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const LEVEL_TONES: Record<RuntimeLogEntry["level"], BadgeTone> = { debug: "neutral", info: "primary", warn: "warning", error: "danger" };

export function LogsPage() {
  const app = useApp();
  const [entries, setEntries] = useState<RuntimeLogEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [scope, setScope] = useState("all");
  const [level, setLevel] = useState("all");
  const [clearing, setClearing] = useState(false);
  const [copied, setCopied] = useState<number | "all" | null>(null);

  useEffect(() => {
    let alive = true;
    const off = app.client.on("log.appended", ({ entry }) => setEntries((current) => mergeLogEntries(current, [entry])));
    app.call("logs.list", { limit: MAX_LOG_ENTRIES })
      .then((result) => {
        if (!alive) return;
        setEntries((current) => mergeLogEntries(current, result.entries));
        setStatus("ready");
      })
      .catch((caught) => {
        if (!alive) return;
        setError(toRpcError(caught).message);
        setStatus("error");
      });
    return () => {
      alive = false;
      off();
    };
  }, [app]);

  const scopes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.scope, (counts.get(entry.scope) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);
  useEffect(() => {
    if (scope !== "all" && !scopes.some(([key]) => key === scope)) setScope("all");
  }, [scopes, scope]);
  const filtered = entries.filter((entry) => (scope === "all" || entry.scope === scope) && (level === "all" || entry.level === level));

  const copy = async (text: string, key: number | "all") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  const clear = async () => {
    setClearing(true);
    try {
      await app.call("logs.clear", {});
      setEntries([]);
    } catch (caught) {
      app.notifyError(caught);
    } finally {
      setClearing(false);
    }
  };

  const scopeOptions: SelectOption[] = [{ value: "all", label: G.all(entries.length) }, ...scopes.map(([key, count]) => ({ value: key, label: `${scopeLabel(key)} (${count})` }))];
  const levelOptions: SelectOption[] = [{ value: "all", label: G.allLevels }, ...(["debug", "info", "warn", "error"] as const).map((l) => ({ value: l, label: G.levels[l] }))];

  return (
    <SettingsFrame section="logs" title={PAGE_TITLES.logs} className="gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-muted-foreground">{G.description}</p>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-1.5 text-2xs font-bold text-muted-foreground">{G.keyPrefix}
            <div class="w-44"><Select aria-label={G.keyFilter} value={scope} options={scopeOptions} onValueChange={setScope} /></div>
          </label>
          <label class="flex items-center gap-1.5 text-2xs font-bold text-muted-foreground">{G.levelPrefix}
            <div class="w-32"><Select aria-label={G.levelFilter} value={level} options={levelOptions} onValueChange={setLevel} /></div>
          </label>
          <Button variant="subtle" disabled={!filtered.length} onClick={() => void copy(formatLogList(filtered), "all")} aria-label={G.copyFiltered} title={G.copyFiltered}>
            {copied === "all" ? <CheckIcon /> : <CopyIcon />}{G.copyFiltered}
          </Button>
          <Button variant="danger" disabled={clearing || !entries.length} onClick={() => void clear()}>
            {clearing ? <SpinnerIcon /> : <TrashIcon />}{G.clear}
          </Button>
        </div>
      </div>
      {status === "error" ? <p class="text-xs text-destructive" role="alert">{G.loadFailed(error)}</p> : null}
      {status === "loading" ? (
        <div class="grid min-h-40 place-items-center rounded-lg bg-card" role="status" aria-label={G.loading}><SpinnerIcon className="size-5" /></div>
      ) : !entries.length ? (
        <p class="rounded-lg bg-card p-6 text-center text-xs text-muted-foreground">{G.empty}</p>
      ) : !filtered.length ? (
        <p class="rounded-lg bg-card p-6 text-center text-xs text-muted-foreground">{G.filteredEmpty}</p>
      ) : (
        <ol class="grid gap-2" data-run-log-list="">
          {filtered.map((entry, index) => (
            <li key={entry.seq} class="grid gap-1.5 rounded-lg bg-card px-4 py-3" data-log-entry={entry.seq}>
              <div class="flex min-w-0 items-center gap-2">
                <Badge>{scopeLabel(entry.scope)}</Badge>
                <Badge tone={LEVEL_TONES[entry.level]}>{G.levels[entry.level]}</Badge>
                <span class="ml-auto shrink-0 text-2xs text-muted-foreground tabular-nums">{formatTime(entry.at)}</span>
                <IconButton label={G.entryCopy(scopeLabel(entry.scope))} title={copied === entry.seq ? "Copied" : G.entryCopyTitle} className="size-7"
                  onClick={() => void copy(formatLogList(filtered.slice(0, index + 1)), entry.seq)}>
                  {copied === entry.seq ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                </IconButton>
              </div>
              <p class={cn("text-xs leading-relaxed whitespace-pre-wrap break-words", entry.level === "error" ? "text-destructive" : "text-foreground")}>{entry.message || G.noMessage}</p>
              {entry.details !== undefined ? (
                <details class="text-2xs text-muted-foreground">
                  <summary class="cursor-pointer select-none font-bold">{G.details}</summary>
                  <pre class="mt-1.5 max-h-96 overflow-auto rounded-md bg-surface-prompt-field p-2.5 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-foreground">{safeJson(entry.details)}</pre>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </SettingsFrame>
  );
}
