/**
 * Analyzer error notices (Asset Maid `_xt` 145828 -> modal `ape` 96220). Shows the first finished analysis job with an
 * error; closing dismisses that job's notice. Rendered globally by the shell (export only; the shell mounts it).
 */
import { useState } from "preact/hooks";
import { useAppState, type AnalysisJobState } from "../../state/app-state.js";
import { Button, Dialog } from "../ui/index.js";
import { ANALYZER_ERROR_LABELS as E } from "./labels.js";

/** First job that should open the modal (status error, not dismissed). */
export function pickAnalyzerError(jobs: Record<string, AnalysisJobState>, dismissed: ReadonlySet<string>): AnalysisJobState | null {
  return Object.values(jobs)
    .filter((job) => job.finishedAt && E.errorStatuses.includes(job.status) && !dismissed.has(job.jobId))
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))[0] ?? null;
}

export function AnalyzerErrorNotices() {
  const jobs = useAppState((state) => state.analysisJobs);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const job = pickAnalyzerError(jobs, dismissed);
  const close = () => {
    if (job) setDismissed((current) => new Set(current).add(job.jobId));
  };
  const message = job?.error?.message || job?.message || E.unknown;
  return (
    <Dialog open={!!job} onOpenChange={(open) => { if (!open) close(); }} className="w-[min(680px,calc(100%-32px))]" closeLabel={E.close}
      title={<span class="grid gap-1"><span class="text-2xs font-bold tracking-wide text-muted-foreground uppercase">{E.eyebrow}</span>{(job && E.titles[job.kind]) || E.fallbackTitle}</span>}
      description={E.description}
      footer={<Button variant="danger" onClick={close}>{E.closeButton}</Button>}>
      <div class="grid gap-1.5" data-analyzer-error-modal="">
        <span class="text-xs font-bold text-muted-foreground">{E.details}</span>
        <pre class="max-h-72 overflow-auto rounded-md bg-surface-prompt-field p-3 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-foreground">{message}</pre>
      </div>
    </Dialog>
  );
}
