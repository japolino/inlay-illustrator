/**
 * Shared workspace building blocks (Asset Maid `rhe` Command Dock frame 100336, `_$` dock layout 62024,
 * `FIt` command card 153912, `Fc` page header 62928). Used by every tab / secondary pane.
 */
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../ui/index.js";

export type DockStatus = "ready" | "loading" | "error";

export const DOCK_LABELS = {
  loading: "Loading Command Dock", // Command Dock 불러오는 중
  error: "Could not load Command Dock." // Command Dock을 불러오지 못했습니다.
} as const;

/** Command Dock frame: pill bar pinned to the bottom of a pane (AM `rhe`). */
export function CommandDock({ children, expanded = false, status = "ready" }: { children?: ComponentChildren; expanded?: boolean; status?: DockStatus }) {
  const ready = status === "ready" && !!children;
  return (
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-5 pt-8 pb-3 mobile:px-3"
      data-command-dock-frame=""
      aria-busy={status === "loading"}
      aria-label={status === "loading" ? DOCK_LABELS.loading : undefined}
    >
      <div class="absolute inset-y-0 left-0 bg-gradient-to-t from-background via-background/98 to-transparent" style={{ width: "calc(100% - var(--workspace-scrollbar-width, 0px))" }} aria-hidden="true" />
      <div
        class={cn(
          "pointer-events-auto relative flex w-full max-w-190 items-center justify-between bg-surface-command shadow-2xl",
          expanded ? "min-h-11.5 flex-col rounded-3xl p-1" : "h-11.5 items-center justify-between gap-3 rounded-full p-1",
          expanded && !ready && "min-h-70",
          !ready && "pointer-events-none"
        )}
        data-command-dock=""
        data-expanded={expanded ? "true" : "false"}
        style={expanded ? { alignItems: "stretch", justifyContent: "flex-start" } : undefined}
      >
        {ready ? <div class="contents" data-command-dock-content="">{children}</div> : <span class="sr-only">{status === "error" ? DOCK_LABELS.error : DOCK_LABELS.loading}</span>}
      </div>
    </div>
  );
}

/** Dock inner layout (AM `_$`): anchor | leading … controls | trailing. */
export function DockLayout({ anchor, leading, controls, trailing }: { anchor?: ComponentChildren; leading?: ComponentChildren; controls?: ComponentChildren; trailing?: ComponentChildren }) {
  return (
    <div
      class={cn(
        "grid w-full items-center gap-1.5",
        anchor ? (trailing ? "grid-cols-[auto_minmax(0,1fr)_auto]" : "grid-cols-[auto_minmax(0,1fr)]") : trailing ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)]"
      )}
      data-bounded-command-dock=""
    >
      {anchor ? <div class="relative flex size-11 shrink-0 items-center justify-start md:size-9.5" data-command-dock-anchor="">{anchor}</div> : null}
      <div class="scrollbar-none flex h-11 min-w-0 touch-pan-x items-center overflow-x-auto overscroll-x-contain md:h-auto" data-command-dock-scroll-controls="">
        <div class="flex h-full w-max min-w-full shrink-0 items-center justify-between gap-3 md:h-auto" data-command-dock-control-group="">
          <div class="flex shrink-0 items-center gap-1.5" data-command-dock-leading-group="">
            {anchor ? <span class="h-4 w-px shrink-0 bg-foreground/10" aria-hidden="true" /> : null}
            {leading}
          </div>
          <div class="ml-auto flex shrink-0 items-center gap-1.5" data-command-dock-analysis-group="">{controls}</div>
        </div>
      </div>
      {trailing ? <div class="flex size-11 shrink-0 items-center justify-end md:size-9.5">{trailing}</div> : null}
    </div>
  );
}

/** Page frame header (AM `Fc`): title, optional "Selected N" badge, header end slot. */
export function PageHeader({ title, count, countLabel = (n: number) => `Selected ${n}`, end, className }: { title: string; count?: number; countLabel?: (n: number) => string; end?: ComponentChildren; className?: string }) {
  return (
    <header class={cn("flex min-h-8 w-full items-center justify-between gap-3", className)} data-page-header="">
      <div class="flex min-w-0 items-center gap-2">
        <h1 class="truncate text-lg leading-tight font-extrabold">{title}</h1>
        {count !== undefined ? <span class="inline-flex h-5 shrink-0 items-center rounded-full bg-secondary px-2 text-2xs font-bold text-muted-foreground tabular-nums">{countLabel(count)}</span> : null}
      </div>
      {end ? <div class="flex min-w-0 items-center gap-2">{end}</div> : null}
    </header>
  );
}

/** Command card (AM `FIt`): title + run/stop button + description. */
export function CommandCard({ title, description, action, className, ...rest }: { title: string; description?: string; action?: ComponentChildren; className?: string } & Omit<JSX.IntrinsicElements["div"], "title" | "action">) {
  return (
    <div class={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-card px-4 py-3", className)} {...rest}>
      <div class="min-w-0">
        <strong class="block text-xs font-bold">{title}</strong>
        {description ? <span class="mt-0.5 block text-2xs leading-relaxed text-muted-foreground">{description}</span> : null}
      </div>
      {action}
    </div>
  );
}
