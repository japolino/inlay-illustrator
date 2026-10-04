import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import { cn } from "./cn.js";
import { CheckIcon, StopIcon, XIcon } from "./icons.js";

export type ToastTone = "running" | "success" | "warning" | "danger" | "info";

export type ToastInput = {
  message: string;
  tone?: ToastTone;
  /** 0..1, drawn as a left-to-right fill (min 0.02 while running). */
  progress?: number;
  /** Auto-dismiss after this many ms (default 10000; 0 = stay). Running toasts never auto-dismiss. */
  durationMs?: number;
  onCancel?: () => void;
};

export type ToastRecord = ToastInput & { id: number; tone: ToastTone };

export type ToastLabels = { stopTask: string; closeNotification: string };

/** Small observable toast store (one per overlay). */
export class ToastStore {
  private toasts: ToastRecord[] = [];
  private readonly listeners = new Set<() => void>();
  private nextId = 1;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(): ToastRecord[] {
    return this.toasts;
  }

  show(input: ToastInput): number {
    const id = this.nextId++;
    this.toasts = [...this.toasts, { ...input, tone: input.tone ?? "info", id }].slice(-5);
    this.emit();
    return id;
  }

  update(id: number, patch: Partial<ToastInput>): void {
    this.toasts = this.toasts.map((toast) => (toast.id === id ? { ...toast, ...patch, tone: patch.tone ?? toast.tone } : toast));
    this.emit();
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
    this.emit();
  }

  clear(): void {
    this.toasts = [];
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const ToastContext = createContext<ToastStore>(new ToastStore());

export function useToasts(): ToastStore {
  return useContext(ToastContext);
}

const FILL: Record<ToastTone, string> = {
  running: "bg-gradient-to-r from-toast-running-soft via-toast-running-fill to-toast-running-lead",
  info: "bg-gradient-to-r from-toast-running-soft via-toast-running-fill to-toast-running-lead",
  success: "bg-gradient-to-r from-toast-success-soft via-toast-success-fill to-toast-success-lead",
  warning: "bg-gradient-to-r from-toast-warning-soft via-toast-warning-fill to-toast-warning-lead",
  danger: "bg-gradient-to-r from-toast-danger-soft via-toast-danger-fill to-toast-danger-lead"
};

/** One pill toast, styled like Asset Maid's in-app progress toast (`Gp`). */
export function Toast({ toast, onDismiss, labels }: { toast: ToastRecord; onDismiss: () => void; labels: ToastLabels }) {
  const duration = toast.tone === "running" ? 0 : toast.durationMs ?? 10_000;
  useEffect(() => {
    if (duration <= 0) return undefined;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, toast.id]);
  const danger = toast.tone === "danger";
  const progress = Math.min(1, Math.max(0, toast.progress ?? (toast.tone === "running" ? 0 : 1)));
  const scale = toast.tone === "running" ? Math.max(0.02, progress) : progress;
  return (
    <div
      class="pointer-events-auto relative flex h-7 w-[70%] max-w-133 min-w-0 items-center overflow-hidden rounded-full bg-toast-surface pl-3 pr-1.5 backdrop-blur-[18px]"
      role={danger ? "alert" : "status"}
      aria-live={danger ? "assertive" : "polite"}
      title={toast.message}
    >
      <span aria-hidden="true" class={cn("absolute inset-y-0 left-0 w-full origin-left transition-transform duration-150 ease-out", FILL[toast.tone])} style={{ transform: `scaleX(${scale})` }} />
      {toast.tone === "running" ? (
        <span aria-hidden="true" class="relative mr-2 size-3.5 shrink-0 animate-spin rounded-full border-2 border-toast-spinner border-b-transparent motion-reduce:animate-none" />
      ) : toast.tone === "success" ? (
        <CheckIcon className="relative mr-2 size-3.5 shrink-0 text-success" />
      ) : null}
      <span class={cn("relative min-w-0 flex-1 truncate text-xs/3 font-semibold", danger ? "text-destructive" : toast.tone === "success" ? "text-success" : toast.tone === "warning" ? "text-warning" : "text-foreground")}>
        {toast.message}
      </span>
      {toast.onCancel ? (
        <button type="button" onClick={toast.onCancel} aria-label={labels.stopTask} title={labels.stopTask}
          class="relative ml-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-white/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55">
          <StopIcon className="size-3.5" />
        </button>
      ) : null}
      <button type="button" onClick={onDismiss} aria-label={labels.closeNotification} title={labels.closeNotification}
        class="relative ml-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-white/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55">
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

/** Bottom-centred toast stack. Render once inside the overlay root. */
export function ToastHost({ labels, className }: { labels: ToastLabels; className?: string }) {
  const store = useToasts();
  const [, setVersion] = useState(0);
  useEffect(() => store.subscribe(() => setVersion((value) => value + 1)), [store]);
  const toasts = store.list();
  return (
    <div class={cn("pointer-events-none fixed inset-x-0 bottom-4 z-140 flex flex-col items-center gap-2", className)} data-ii-am-toasts="">
      {toasts.map((toast) => <Toast key={toast.id} toast={toast} labels={labels} onDismiss={() => store.dismiss(toast.id)} />)}
    </div>
  );
}

export function ToastProvider({ store, children }: { store: ToastStore; children: ComponentChildren }) {
  return <ToastContext.Provider value={store}>{children}</ToastContext.Provider>;
}
