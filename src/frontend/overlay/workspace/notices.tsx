/**
 * In-pane progress pills above the Command Dock (AM `LO` 155984: `Bvt`, `vwt`, `wwt`, `zvt`, `Kwt`, `Avt`, `gvt`)
 * and the analyzer error modal (`_xt` 145830 -> `ape` 96220). Driven by app state `analysisJobs`.
 */
import { useState } from "preact/hooks";
import type { AnalysisJobState } from "../../state/app-state.js";
import { useAppState } from "../../state/app-state.js";
import { Button, Dialog } from "../ui/index.js";
import { useWorkspaceCtx } from "./context.js";
import { ANALYSIS_LABELS, COMMON_LABELS } from "./labels/common.js";
import { jobTone, progressFraction, progressMessage } from "./model.js";
import { ProgressPill } from "./parts.js";

/** Visible jobs of a character (not dismissed). */
export function useAnalysisJobs(characterId: string | null): AnalysisJobState[] {
  const jobs = useAppState((s) => s.analysisJobs);
  return Object.values(jobs).filter((j) => j.characterId === characterId).sort((a, b) => a.startedAt - b.startedAt);
}

export function useRunningJob(characterId: string | null, kinds: AnalysisJobState["kind"][]): AnalysisJobState | null {
  const jobs = useAnalysisJobs(characterId);
  return jobs.find((j) => !j.finishedAt && kinds.includes(j.kind)) ?? null;
}

/** Row notice of a prompt key from the latest character-prompt analysis job (AM `getRowNotice`). */
export function useRowNotice(characterId: string | null, promptKey: string): { status: string; message?: string } | null {
  const jobs = useAnalysisJobs(characterId);
  for (let i = jobs.length - 1; i >= 0; i -= 1) {
    const job = jobs[i]!;
    if (job.kind !== "character-prompts" && job.kind !== "references") continue;
    const row = job.rows.find((r) => r.promptKey === promptKey);
    if (row && row.status !== "running" && row.status !== "idle") return row;
  }
  return null;
}

export function AnalysisNotices() {
  const ctx = useWorkspaceCtx();
  const { app, characterId, session, sessions } = ctx;
  const jobs = useAnalysisJobs(characterId).filter((j) => !session.dismissedJobs.includes(j.jobId));
  const [errorJob, setErrorJob] = useState<AnalysisJobState | null>(null);
  const dismiss = (jobId: string) => sessions.update(characterId, (s) => ({ dismissedJobs: [...s.dismissedJobs, jobId] }));
  if (!jobs.length && !session.pickResult && !errorJob) return null;
  return (
    <>
      {jobs.map((job) => {
        const running = !job.finishedAt;
        const tone = running ? "running" : jobTone(job.status);
        const kindLabel = ANALYSIS_LABELS.kinds[job.kind] ?? job.kind;
        const message = progressMessage(job.progress, running, job.message) || kindLabel;
        return (
          <ProgressPill
            key={job.jobId}
            message={message}
            tone={tone}
            progress={progressFraction(job.progress, running)}
            onCancel={running ? () => void app.cancelAnalysis(job.jobId) : undefined}
            onDismiss={running ? undefined : () => dismiss(job.jobId)}
            actions={!running && job.error ? (
              <button type="button" class="rounded-full px-2 text-3xs font-bold text-destructive underline-offset-2 hover:underline" onClick={() => setErrorJob(job)}>{ANALYSIS_LABELS.showError}</button>
            ) : undefined}
          />
        );
      })}
      {session.pickResult ? <ProgressPill message={session.pickResult.text} tone={session.pickResult.tone} progress={1} onDismiss={() => sessions.update(characterId, { pickResult: null })} /> : null}
      <Dialog
        open={!!errorJob}
        onOpenChange={(o) => { if (!o) setErrorJob(null); }}
        title={errorJob ? (ANALYSIS_LABELS.errorTitles[errorJob.kind] ?? ANALYSIS_LABELS.errorFallbackTitle) : ""}
        description={ANALYSIS_LABELS.errorDescription}
        className="w-[min(680px,calc(100%-32px))]"
        footer={<Button variant="danger" onClick={() => setErrorJob(null)}>{COMMON_LABELS.close}</Button>}
      >
        <div class="grid gap-1.5">
          <span class="text-2xs font-bold text-muted-foreground">{ANALYSIS_LABELS.errorDetails}</span>
          <pre class="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-card p-3 text-2xs text-destructive">{errorJob?.error?.message ?? ANALYSIS_LABELS.errorUnknown}</pre>
        </div>
      </Dialog>
    </>
  );
}
