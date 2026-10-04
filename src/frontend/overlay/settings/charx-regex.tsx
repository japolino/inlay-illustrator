/**
 * Settings › charx › "Character asset regex" rows (AM `pxt` 145287-145470, spec/ui.md §4.7.4): run the charx regex analysis
 * (`analysis.start {kind: "charx-regex", force: true}`), add / edit / delete detectors (`charxRegex.setDetectors`, AM `Myt`/`zyt`).
 * Rows are `charxAssetRegexAnalysis[characterId].detectors[].in`.
 */
import { useState } from "preact/hooks";
import type { CharxRegexDetector } from "../../../shared/contract/rpc.js";
import { useApp, useAppState } from "../../state/app-state.js";
import { toRpcError } from "../../rpc/client.js";
import { IconButton, TrashIcon, cn } from "../ui/index.js";
import { CheckIcon, XIcon } from "../ui/icons.js";
import { PencilIcon, PlusIcon, SpinnerIcon } from "./icons.js";
import { CHARX_LABELS as X, COMMON_LABELS as C } from "./labels.js";
import { AnalyzeButton, Row } from "./parts.js";

/** Detectors of one character from the document's `charxAssetRegexAnalysis` map. */
export function detectorsOf(analysis: Record<string, unknown> | undefined, characterId: string): CharxRegexDetector[] {
  const entry = analysis?.[characterId];
  const detectors = entry && typeof entry === "object" ? (entry as { detectors?: unknown }).detectors : undefined;
  return Array.isArray(detectors) ? detectors.filter((d): d is CharxRegexDetector => !!d && typeof d === "object" && typeof (d as { in?: unknown }).in === "string") : [];
}

/** AM `Cbe`: a pattern is valid when `new RegExp(pattern, flags)` compiles. */
export function regexError(pattern: string, flags = ""): string | null {
  if (!pattern.trim()) return X.regexInvalid;
  try {
    new RegExp(pattern.trim(), flags || "u");
    return null;
  } catch {
    return X.regexInvalid;
  }
}

/** Next detector list after saving row `index` (-1 = new manual detector) or deleting it (`value === null`). */
export function nextDetectors(detectors: readonly CharxRegexDetector[], index: number, value: string | null): CharxRegexDetector[] {
  if (value === null) return detectors.filter((_, i) => i !== index);
  const pattern = value.trim();
  if (index < 0) return [...detectors, { in: pattern, source: "manual" }];
  return detectors.map((d, i) => (i === index ? { ...d, in: pattern } : d));
}

export function CharxRegexRows({ characterId, analysis, disabled }: { characterId: string | null; analysis: Record<string, unknown> | undefined; disabled: boolean }) {
  const app = useApp();
  const detectors = characterId ? detectorsOf(analysis, characterId) : [];
  const running = useAppState((state) => Object.values(state.analysisJobs).find((job) => !job.finishedAt && job.kind === "charx-regex" && job.characterId === characterId));
  /** Row being edited: detector index, -1 = new draft row. */
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = disabled || !characterId || saving || !!running;
  const invalid = editing ? regexError(editing.value) : null;

  const commit = async (index: number, value: string | null) => {
    if (!characterId) return;
    if (value !== null && regexError(value)) return;
    setSaving(true);
    setError(null);
    try {
      await app.call("charxRegex.setDetectors", { characterId, detectors: nextDetectors(detectors, index, value) });
      setEditing(null);
    } catch (caught) {
      setError(toRpcError(caught).message);
    } finally {
      setSaving(false);
    }
  };
  const remove = (index: number) => {
    if (index < 0) setEditing(null); // draft rows are just discarded
    else void commit(index, null);
  };

  const rows: Array<{ index: number; value: string }> = detectors.map((d, index) => ({ index, value: d.in }));
  if (editing?.index === -1) rows.push({ index: -1, value: editing.value });

  return (
    <div class="grid gap-2 py-3" data-charx-regex="">
      <Row title={X.regex.title} description={X.regex.description} className="py-0">
        <IconButton label={X.regexAdd} title={X.regexAdd} disabled={locked || !!editing} onClick={() => setEditing({ index: -1, value: "" })} data-charx-regex-add="">
          <PlusIcon />
        </IconButton>
        <AnalyzeButton
          running={!!running}
          disabled={disabled || !characterId || saving || !!editing}
          title={X.regexAnalyzeTitle}
          labels={{ analyze: X.analyze, stop: X.stop, stopAnalysis: X.stopAnalysis }}
          onRun={() => { if (characterId) void app.startAnalysis({ kind: "charx-regex", characterId, force: true }); }}
          onCancel={() => running && void app.cancelAnalysis(running.jobId)}
        />
      </Row>
      {rows.length ? (
        <div class="grid gap-1.5">
          {rows.map((row) => {
            const active = editing?.index === row.index;
            return (
              <div key={row.index} class="flex min-w-0 items-center gap-1.5" data-charx-regex-row={row.index}>
                <input
                  class={cn(
                    "h-8 min-w-0 flex-1 rounded-md border-0 bg-surface-prompt-field px-2.5 font-mono text-2xs text-foreground outline-none max-md:h-11 max-md:text-sm",
                    active && (invalid ? "ring-1 ring-destructive" : "ring-1 ring-primary/40")
                  )}
                  readOnly={!active}
                  value={active ? editing!.value : row.value}
                  title={active && invalid ? invalid : undefined}
                  aria-invalid={active && !!invalid}
                  aria-label={X.regexInput}
                  onFocus={(e) => active && (e.currentTarget as HTMLInputElement).select()}
                  onInput={(e) => active && setEditing({ index: row.index, value: (e.currentTarget as HTMLInputElement).value })}
                  onKeyDown={(e) => {
                    if (!active) return;
                    if (e.key === "Enter") { e.preventDefault(); void commit(row.index, (e.currentTarget as HTMLInputElement).value); }
                    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(null); }
                  }}
                />
                {active ? (
                  <IconButton label={X.regexSave} title={C.save} disabled={saving || !!invalid} onClick={() => void commit(row.index, editing!.value)} data-charx-regex-save="">
                    {saving ? <SpinnerIcon /> : <CheckIcon />}
                  </IconButton>
                ) : (
                  <IconButton label={X.regexEdit} title={C.edit} disabled={locked || !!editing} onClick={() => setEditing({ index: row.index, value: row.value })} data-charx-regex-edit="">
                    <PencilIcon />
                  </IconButton>
                )}
                {active && row.index >= 0 ? (
                  <IconButton label={C.cancel} title={C.cancel} disabled={saving} onClick={() => setEditing(null)}><XIcon /></IconButton>
                ) : null}
                <IconButton label={X.regexDelete} title={C.delete} disabled={locked || (!!editing && !active)} onClick={() => remove(row.index)} data-charx-regex-delete="">
                  <TrashIcon />
                </IconButton>
              </div>
            );
          })}
        </div>
      ) : <p class="text-2xs text-muted-foreground" aria-busy={!!running}>{X.regexEmpty}</p>}
      {error ? <p class="text-2xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
