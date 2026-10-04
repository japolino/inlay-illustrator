/**
 * State of the chat-side runtime surfaces (toast stack, error dialog) that does not live in the app store:
 * finished generations, notices, dismissed / expanded toasts, the error-dialog queue, visibility flags.
 */
import type { AttemptKind, GenerationJobSnapshot, RpcError, RpcEvents } from "../../shared/contract/rpc.js";
import type { FinishedGeneration, NoticeEntry } from "./toast-model.js";

export interface ErrorDialogItem { id: string; title: string; message: string; jobId?: string }

const MAX_ERRORS = 20;
const MAX_FINISHED = 12;
const MAX_NOTICES = 8;

export class ChatRuntimeStore {
  finished: FinishedGeneration[] = [];
  notices: NoticeEntry[] = [];
  dismissed = new Set<string>();
  expanded = new Set<string>();
  errors: ErrorDialogItem[] = [];
  readonly displayIndex = new Map<string, number>();
  /** Host overlay open (the chat runtime hides under it). */
  overlayOpen = false;
  /** Zoom viewer open (toasts move above it; the count panel hides). */
  zoomOpen = false;
  /** A chat is active (count panel only on the chat screen). */
  chatActive = false;
  private readonly jobs = new Map<string, { attemptKind: AttemptKind; requestedCount: number; completedSlots: number; canRetry: boolean; canRestart: boolean }>();
  private readonly seenErrorIds: string[] = [];
  private readonly listeners = new Set<() => void>();
  private noticeCounter = 0;
  private version = 0;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Changes on every emit (for useSyncExternalStore-style hooks). */
  get revision(): number {
    return this.version;
  }

  emit(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }

  setFlags(flags: Partial<Pick<ChatRuntimeStore, "overlayOpen" | "zoomOpen" | "chatActive">>): void {
    let changed = false;
    for (const [key, value] of Object.entries(flags) as Array<["overlayOpen" | "zoomOpen" | "chatActive", boolean]>) {
      if (this[key] !== value) {
        this[key] = value;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  /** Remembers job facts so a finished event can still name the attempt kind and counts. */
  trackJob(job: GenerationJobSnapshot): void {
    this.jobs.set(job.jobId, { attemptKind: job.attemptKind, requestedCount: job.requestedCount, completedSlots: job.completedSlots, canRetry: job.canRetry, canRestart: job.canRestart });
  }

  finish(payload: RpcEvents["generation.finished"], fallbackKind: AttemptKind = "initial"): FinishedGeneration {
    const known = this.jobs.get(payload.jobId);
    this.jobs.delete(payload.jobId);
    const entry: FinishedGeneration = {
      jobId: payload.jobId,
      chatId: payload.chatId,
      messageKey: payload.messageKey,
      result: payload.result,
      attemptKind: known?.attemptKind ?? fallbackKind,
      requestedCount: known?.requestedCount ?? 0,
      completedSlots: known?.completedSlots ?? 0,
      canRetry: payload.result === "failed" && (payload.error?.retryable !== false) && (known?.canRetry ?? true),
      canRestart: payload.result === "failed" && (known?.canRestart ?? false),
      ...(payload.error ? { error: payload.error } : {}),
      finishedAt: Date.now()
    };
    this.finished = [...this.finished.filter((f) => f.jobId !== entry.jobId), entry].slice(-MAX_FINISHED);
    this.dismissed.delete(`generation:${entry.jobId}`);
    this.emit();
    return entry;
  }

  notice(input: { tone: NoticeEntry["tone"]; message: string; detail?: string; key?: string }): string {
    const key = input.key ?? `n${++this.noticeCounter}`;
    const entry: NoticeEntry = { key, tone: input.tone, message: input.message, detail: input.detail, createdAt: Date.now() };
    this.notices = [...this.notices.filter((n) => n.key !== key), entry].slice(-MAX_NOTICES);
    this.dismissed.delete(`notice:${key}`);
    this.emit();
    return key;
  }

  dismiss(toastKey: string): void {
    this.dismissed.add(toastKey);
    if (toastKey.startsWith("notice:")) this.notices = this.notices.filter((n) => `notice:${n.key}` !== toastKey);
    if (toastKey.startsWith("generation:")) this.finished = this.finished.filter((f) => `generation:${f.jobId}` !== toastKey);
    this.expanded.delete(toastKey);
    this.emit();
  }

  toggleExpanded(toastKey: string): void {
    if (this.expanded.has(toastKey)) this.expanded.delete(toastKey);
    else this.expanded.add(toastKey);
    this.emit();
  }

  /** Queues an error dialog item (de-duplicated by id, max 20, AM `aOt`). */
  pushError(item: ErrorDialogItem): void {
    if (this.seenErrorIds.includes(item.id) || this.errors.some((e) => e.id === item.id)) return;
    this.seenErrorIds.push(item.id);
    if (this.seenErrorIds.length > 120) this.seenErrorIds.splice(0, 40);
    this.errors = [...this.errors, item].slice(0, MAX_ERRORS);
    this.emit();
  }

  dismissError(): ErrorDialogItem | undefined {
    const [first, ...rest] = this.errors;
    this.errors = rest;
    this.emit();
    return first;
  }
}

/** Error-dialog title for a failure (AM 178761). */
export function errorDialogTitle(error: RpcError, labels: { apiKeyRequired: string; analysisFailed: string; imageFailed: string; defaultTitle: string }, context?: string): string {
  if (error.detailCode === "NOVELAI_API_KEY_REQUIRED") return labels.apiKeyRequired;
  if (/ANALYZER/u.test(error.detailCode ?? "")) return labels.analysisFailed;
  if (error.code === "provider-error") return labels.imageFailed;
  return context?.trim() || labels.defaultTitle;
}
