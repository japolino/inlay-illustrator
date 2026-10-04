/**
 * Analysis job registry (one AbortController per job, AM rule: one run per controller kind at a time per character).
 * Emits `analysis.progress` / `analysis.finished`.
 */
import { createRequestId, type AnalysisKind, type JobStatus, type ProgressInfo, type RowNotice, type RpcError } from "../../shared/contract/index.js";
import { fail, isAbortLike, toRpcError } from "../rpc/errors.js";
import type { BackendServices } from "../services/types.js";

export interface JobOutcome {
  status: JobStatus;
  /** English final message (AM final label). */
  message: string;
  messageKo?: string;
  error?: RpcError;
}

export interface JobContext {
  services: BackendServices;
  jobId: string;
  kind: AnalysisKind;
  characterId: string;
  signal: AbortSignal;
  /** Progress event (status defaults to running). */
  progress(progress: ProgressInfo, rows?: RowNotice[]): void;
}

export interface JobInfo {
  jobId: string;
  kind: AnalysisKind;
  characterId: string;
  status: JobStatus;
  progress: ProgressInfo;
}

interface JobRecord extends JobInfo {
  controller: AbortController;
  done: Promise<JobOutcome>;
}

export class AnalysisJobs {
  private readonly jobs = new Map<string, JobRecord>();
  private disposed = false;

  constructor(private readonly services: BackendServices) {}

  start(kind: AnalysisKind, characterId: string, run: (ctx: JobContext) => Promise<JobOutcome>): { jobId: string; done: Promise<JobOutcome> } {
    if (this.disposed) fail("internal", "The analysis module was disposed.");
    for (const job of this.jobs.values()) {
      if (job.kind === kind && job.characterId === characterId) {
        fail("busy", "This analysis is already running for this character.", { messageKo: "다른 작업이 진행 중입니다. 완료 후 다시 실행해 주세요.", details: { jobId: job.jobId } });
      }
    }
    const jobId = createRequestId(`analysis-${kind}`);
    const controller = new AbortController();
    const record = { jobId, kind, characterId, status: "running" as JobStatus, progress: { label: "Starting", fraction: 0 } as ProgressInfo, controller, done: Promise.resolve(null as unknown as JobOutcome) };
    const ctx: JobContext = {
      services: this.services,
      jobId,
      kind,
      characterId,
      signal: controller.signal,
      progress: (progress, rows) => {
        record.progress = progress;
        this.services.events.emit("analysis.progress", { jobId, kind, characterId, status: record.status, progress, ...(rows?.length ? { rows } : {}) });
      },
    };
    this.jobs.set(jobId, record);
    record.done = (async (): Promise<JobOutcome> => {
      await Promise.resolve();
      let outcome: JobOutcome;
      try {
        outcome = await run(ctx);
      } catch (error) {
        const rpc = toRpcError(error);
        outcome = isAbortLike(error) || controller.signal.aborted
          ? { status: "cancelled", message: "Analysis cancelled." }
          : { status: "error", message: rpc.message, ...(rpc.messageKo ? { messageKo: rpc.messageKo } : {}), error: rpc };
        if (outcome.status === "error") this.services.log.append("error", "analysis", `${kind} failed: ${rpc.message}`, rpc);
      } finally {
        this.jobs.delete(jobId);
      }
      record.status = outcome.status;
      this.services.events.emit("analysis.finished", { jobId, kind, characterId, status: outcome.status, message: outcome.message, ...(outcome.error ? { error: outcome.error } : {}) });
      return outcome;
    })();
    return { jobId, done: record.done };
  }

  cancel(filter: { jobId?: string; kind?: AnalysisKind; characterId?: string } = {}): number {
    let n = 0;
    for (const job of this.jobs.values()) {
      if (filter.jobId && job.jobId !== filter.jobId) continue;
      if (filter.kind && job.kind !== filter.kind) continue;
      if (filter.characterId && job.characterId !== filter.characterId) continue;
      job.controller.abort();
      n += 1;
    }
    return n;
  }

  list(): JobInfo[] {
    return [...this.jobs.values()].map(({ jobId, kind, characterId, status, progress }) => ({ jobId, kind, characterId, status, progress }));
  }

  get(jobId: string): JobInfo | null {
    const job = this.jobs.get(jobId);
    return job ? { jobId: job.jobId, kind: job.kind, characterId: job.characterId, status: job.status, progress: job.progress } : null;
  }

  dispose(): void {
    this.disposed = true;
    for (const job of this.jobs.values()) job.controller.abort();
  }
}
