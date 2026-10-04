/**
 * Small building blocks of the workspace tabs, ported from Asset Maid primitives:
 * labeled checkbox `Un` (62328) + `CM`, badges `Bn`/`Vp` (62916/62922), workbench row `I_` (62360),
 * save button `mce` (62837), evidence toggle `rce` (62139), gender toggle `P$` (62717), content rating `nce` (62504),
 * progress pill `Gp` (62222), image viewer `h1` (62609), command button, menu.
 */
import type { ComponentChildren, HTMLAttributes } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { AssetRef, EvidenceMode, Gender } from "../../../shared/contract/character.js";
import { assetIdentity } from "../../../shared/contract/character.js";
import { useApp } from "../../state/app-state.js";
import {
  Button,
  CheckIcon,
  Dialog,
  Floating,
  IconButton,
  MinusIconFallback,
  SaveIcon,
  Select,
  SpinnerIcon,
  StopIcon,
  XIcon,
  cn,
  useLayer,
  Portal,
  type ButtonProps
} from "./parts-kit.js";
import { useIsMobile } from "../viewport.js";
import { ANALYSIS_LABELS, COMMON_LABELS, EVIDENCE_LABELS, GENDER_LABELS, RATING_LABELS, VIEWER_LABELS } from "./labels/common.js";
import type { TriState } from "./model.js";

/* ------------------------------------------------------------------------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return <SpinnerIcon className={cn("animate-spin", className)} />;
}

const CHECKBOX_BG = {
  transparent: "bg-transparent",
  control: "bg-surface-control",
  card: "bg-card",
  secondary: "bg-secondary",
  promptField: "bg-surface-prompt-field"
} as const;

/** Bare checkbox (`CM`): role=checkbox with tri-state. */
export function Checkbox({ checked, disabled, onCheckedChange, label, className }: { checked: TriState; disabled?: boolean; onCheckedChange: (value: boolean) => void; label?: string; className?: string }) {
  const state = checked === "indeterminate" ? "indeterminate" : checked ? "checked" : "unchecked";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked === "indeterminate" ? "mixed" : checked}
      aria-label={label}
      disabled={disabled}
      data-state={state}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCheckedChange(checked !== true); }}
      class={cn("peer grid size-3.5 shrink-0 place-items-center rounded-sm bg-input text-primary-foreground outline-none ring-1 ring-inset ring-white/7 transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary", className)}
    >
      {checked === "indeterminate" ? <MinusIconFallback className="size-2.5" /> : checked ? <CheckIcon className="size-2.5" /> : null}
    </button>
  );
}

/** Labeled checkbox (`Un`). Clicking the label toggles. Indeterminate click -> true. */
export function LabeledCheckbox({ label, checked, disabled, background, size = "compact", className, title, onCheckedChange, ...rest }: {
  label: string;
  checked: TriState;
  disabled?: boolean;
  background?: keyof typeof CHECKBOX_BG;
  size?: "compact" | "default";
  className?: string;
  title?: string;
  onCheckedChange: (value: boolean) => void;
} & Omit<HTMLAttributes<HTMLSpanElement>, "label" | "size">) {
  return (
    <span
      class={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 font-bold text-secondary-foreground select-none",
        size === "compact" ? "h-7.5 text-2xs max-md:h-11 max-md:text-xs" : "h-8 text-xs max-md:h-11",
        background ? CHECKBOX_BG[background] : null,
        disabled && "cursor-not-allowed opacity-45",
        className
      )}
      data-labeled-checkbox=""
      title={title}
      onClick={() => { if (!disabled) onCheckedChange(checked !== true); }}
      {...rest}
    >
      <Checkbox checked={checked} disabled={disabled} label={label} onCheckedChange={onCheckedChange} />
      <span class="whitespace-nowrap">{label}</span>
    </span>
  );
}

export type BadgeTone = "neutral" | "foreground" | "primary" | "success" | "warning" | "danger";
const TONES: Record<BadgeTone, string> = {
  neutral: "text-muted-foreground",
  foreground: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive"
};

/** Pill badge (`Bn`). */
export function Badge({ tone = "neutral", className, children, ...rest }: { tone?: BadgeTone; className?: string; children?: ComponentChildren } & Omit<HTMLAttributes<HTMLSpanElement>, "class">) {
  return <span class={cn("inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-surface-badge font-bold backdrop-blur-md px-2 py-0.5 text-2xs", TONES[tone], className)} {...rest}>{children}</span>;
}

/** Small overlay badge on images (`Vp`). */
export function OverlayBadge({ tone = "neutral", className, children, ...rest }: { tone?: BadgeTone; className?: string; children?: ComponentChildren } & Omit<HTMLAttributes<HTMLSpanElement>, "class">) {
  return <span class={cn("inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-background/82 px-1.5 py-0.5 text-3xs font-semibold", TONES[tone], className)} {...rest}>{children}</span>;
}

/** Workbench row (`I_`): header [exclusion + titleStart + title + titleEnd] [status + actions] + fixed-height body. */
export function WorkbenchRow({ title, titleStart, titleEnd, exclusionAction, status, actions, active = false, hidden = false, className, bodyClassName, children, ...rest }: {
  title: ComponentChildren;
  titleStart?: ComponentChildren;
  titleEnd?: ComponentChildren;
  exclusionAction?: ComponentChildren;
  status?: ComponentChildren;
  actions?: ComponentChildren;
  active?: boolean;
  hidden?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ComponentChildren;
} & { "data-prompt-key"?: string; "data-persona-id"?: string; onFocusCapture?: () => void; onPointerDownCapture?: () => void }) {
  return (
    <article hidden={hidden} class={cn("grid gap-2.5 pt-2.5 pb-4.5", className)} data-state={active ? "active" : "inactive"} data-character-workbench-row="" {...rest}>
      <header class="relative flex min-h-11 items-center gap-2 md:grid md:h-9.5 md:min-h-0 md:grid-cols-[minmax(0,1fr)_auto] md:gap-3" data-character-workbench-header="">
        <div class="flex min-w-0 flex-1 items-center gap-1 text-xs/4 font-extrabold">
          <span class="group/roster inline-flex shrink-0 items-center md:relative" data-roster-action-anchor="">
            {exclusionAction ? (
              <span class="z-20 inline-flex md:absolute md:right-[calc(100%-0.25rem)] md:top-1/2 md:-translate-y-1/2 md:pointer-events-none md:opacity-0 md:group-hover/roster:pointer-events-auto md:group-hover/roster:opacity-100 md:group-focus-within/roster:pointer-events-auto md:group-focus-within/roster:opacity-100" data-character-exclusion-action="">
                {exclusionAction}
              </span>
            ) : null}
            {titleStart}
          </span>
          <span class="min-w-0 truncate">{title}</span>
          {titleEnd}
        </div>
        <div class="scrollbar-none flex min-w-0 shrink items-center gap-1.5 overflow-x-auto overscroll-x-contain [justify-content:safe_flex-end] md:shrink-0 md:gap-2 md:overflow-visible" data-character-workbench-actions="">
          {status}
          {actions}
        </div>
      </header>
      <div class={cn("h-56.5 min-h-56.5 max-h-56.5 overflow-hidden rounded-lg bg-surface-workbench p-2.5", active && "bg-surface-workbench-active", bodyClassName)} data-character-workbench-body="">
        {children}
      </div>
    </article>
  );
}

/** Save button with dirty/error dot (`mce`). */
export function SaveButton({ dirty, saving, error, label, disabled = false, onSave }: { dirty: boolean; saving: boolean; error?: string | null; label: string; disabled?: boolean; onSave: () => void }) {
  const aria = saving ? COMMON_LABELS.savingLabel(label) : error ? COMMON_LABELS.retrySave(label, error) : dirty ? COMMON_LABELS.unsavedChanges(label) : label;
  return (
    <Button
      variant="commandAction"
      size="command"
      className="relative"
      onClick={onSave}
      disabled={disabled || (!dirty && !error) || saving}
      aria-label={aria}
      title={error || (dirty ? COMMON_LABELS.unsavedChanges(label) : label)}
      data-save-button=""
    >
      {saving ? <Spinner /> : <SaveIcon />}
      <span class={cn("pointer-events-none absolute right-2 top-2 size-1.5 rounded-full transition-opacity", error ? "bg-destructive" : "bg-warning", dirty || error ? "opacity-100" : "opacity-0")} aria-hidden="true" />
    </Button>
  );
}

/** Big round command button (run / stop). */
export function CommandButton({ running, label, stopLabel, title, disabled, onClick, icon, className }: { running: boolean; label: string; stopLabel: string; title?: string; disabled?: boolean; onClick: () => void; icon: ComponentChildren; className?: string }) {
  return (
    <Button size="command" variant="command" className={className} disabled={disabled} onClick={onClick} aria-label={running ? stopLabel : label} title={running ? stopLabel : (title ?? label)} data-command-button="">
      {running ? <StopIcon /> : icon}
    </Button>
  );
}

/** Segmented buttons (desktop) / select (mobile). */
export function Segmented<T extends string>({ value, options, onChange, label, disabled, className }: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (value: T) => void; label: string; disabled?: boolean; className?: string }) {
  const mobile = useIsMobile();
  if (mobile) {
    return <Select value={value} options={options.map((o) => ({ value: o.value, label: o.label }))} onValueChange={onChange} disabled={disabled} aria-label={label} className={cn("w-24", className)} />;
  }
  return (
    <div role="group" aria-label={label} class={cn("inline-flex h-7.5 shrink-0 items-center rounded-md bg-surface-control p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          title={option.title ?? option.label}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          class={cn("h-6.5 rounded px-2 text-2xs font-bold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 disabled:opacity-45", option.value === value && "bg-selected text-selected-foreground")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Evidence mode toggle (`rce`). */
export function EvidenceToggle({ value, onChange, disabled }: { value: EvidenceMode; onChange: (mode: EvidenceMode) => void; disabled?: boolean }) {
  const L = EVIDENCE_LABELS;
  return (
    <Segmented
      label={L.group}
      value={value}
      disabled={disabled}
      onChange={onChange}
      options={[
        { value: "image", label: L.image.label, title: L.image.title },
        { value: "metadata", label: L.metadata.label, title: L.metadata.title },
        { value: "text", label: L.text.label, title: L.text.title }
      ]}
    />
  );
}

/** Gender toggle (`P$`). */
export function GenderToggle({ value, onChange, label = GENDER_LABELS.characterGender, allowUnknown = true, disabled }: { value: Gender; onChange: (gender: Gender) => void; label?: string; allowUnknown?: boolean; disabled?: boolean }) {
  const options: { value: Gender; label: string; mark: string }[] = [
    { value: "female", label: GENDER_LABELS.female, mark: "♀" },
    { value: "male", label: GENDER_LABELS.male, mark: "♂" },
    ...(allowUnknown ? [{ value: "unknown" as Gender, label: GENDER_LABELS.unknown, mark: "?" }] : [])
  ];
  return (
    <div role="group" aria-label={label} class="inline-flex h-7.5 shrink-0 items-center gap-0.5 rounded-md bg-surface-control p-0.5 max-md:h-11" data-gender-toggle="">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          aria-label={o.label}
          title={o.label}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          class={cn(
            "grid h-6.5 w-7 place-items-center rounded text-xs font-black text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 disabled:opacity-45 max-md:h-10 max-md:w-10",
            value === o.value && (o.value === "female" ? "bg-gender-female/20 text-gender-female" : o.value === "male" ? "bg-gender-male/20 text-gender-male" : "bg-selected text-selected-foreground")
          )}
        >
          {o.mark}
        </button>
      ))}
    </div>
  );
}

/** Content rating SFW/NSFW (`nce`). */
export function RatingToggle({ nsfw, onChange, disabled }: { nsfw: boolean; onChange: (nsfw: boolean) => void; disabled?: boolean }) {
  return (
    <Segmented
      label={RATING_LABELS.group}
      value={nsfw ? "nsfw" : "sfw"}
      disabled={disabled}
      onChange={(v) => onChange(v === "nsfw")}
      options={[{ value: "sfw", label: RATING_LABELS.sfw }, { value: "nsfw", label: RATING_LABELS.nsfw }]}
    />
  );
}

const FILL = {
  running: "bg-gradient-to-r from-toast-running-soft via-toast-running-fill to-toast-running-lead",
  success: "bg-gradient-to-r from-toast-success-soft via-toast-success-fill to-toast-success-lead",
  warning: "bg-gradient-to-r from-toast-warning-soft via-toast-warning-fill to-toast-warning-lead",
  danger: "bg-gradient-to-r from-toast-danger-soft via-toast-danger-fill to-toast-danger-lead"
} as const;

/** In-pane progress pill (`Gp`): stop while running, close when finished (auto-dismiss 10 s). */
export function ProgressPill({ message, progress = 0, tone, onCancel, onDismiss, actions, autoDismissMs = 10_000 }: {
  message: string;
  progress?: number;
  tone: keyof typeof FILL;
  onCancel?: () => void;
  onDismiss?: () => void;
  actions?: ComponentChildren;
  autoDismissMs?: number;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (!onDismiss || autoDismissMs <= 0 || tone === "running") return undefined;
    const timer = setTimeout(() => dismissRef.current?.(), autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, tone, !!onDismiss]);
  const danger = tone === "danger";
  const p = Math.min(1, Math.max(0, progress));
  const scale = tone === "running" ? Math.max(0.02, p) : p;
  return (
    <div class="pointer-events-auto relative flex h-7 w-[70%] max-w-133 min-w-0 items-center overflow-hidden rounded-full bg-toast-surface pl-3 pr-1.5 backdrop-blur-[18px] mobile:w-full" role={danger ? "alert" : "status"} aria-live={danger ? "assertive" : "polite"} title={message} data-progress-pill={tone}>
      <span aria-hidden="true" class={cn("absolute inset-y-0 left-0 w-full origin-left transition-transform duration-150 ease-out", FILL[tone])} style={{ transform: `scaleX(${scale})` }} />
      {tone === "running" ? <span aria-hidden="true" class="relative mr-2 size-3.5 shrink-0 animate-spin rounded-full border-2 border-toast-spinner border-b-transparent motion-reduce:animate-none" />
        : tone === "success" ? <CheckIcon className="relative mr-2 size-3.5 shrink-0 text-success" /> : null}
      <span class={cn("relative min-w-0 flex-1 truncate text-xs/3 font-semibold", danger ? "text-destructive" : tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground")}>{message}</span>
      {actions ? <span class="relative ml-1 flex shrink-0 items-center">{actions}</span> : null}
      {onCancel ? (
        <button type="button" onClick={onCancel} aria-label={ANALYSIS_LABELS.stopTask} title={ANALYSIS_LABELS.stopTask} class="relative ml-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-white/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55">
          <StopIcon className="size-3.5" />
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label={ANALYSIS_LABELS.closeNotice} title={ANALYSIS_LABELS.closeNotice} class="relative ml-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-white/8 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55">
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Asset URLs (Lumiverse image ids -> URL via `assets.getUrl`, cached per app)
 * ---------------------------------------------------------------------------------------------- */

const urlCaches = new WeakMap<object, Map<string, Promise<string | null> | string | null>>();
function urlCache(owner: object): Map<string, Promise<string | null> | string | null> {
  let cache = urlCaches.get(owner);
  if (!cache) urlCaches.set(owner, (cache = new Map()));
  return cache;
}
/** Seeds known URLs (from `assets.list`). */
export function seedAssetUrls(owner: object, items: { asset: AssetRef; url: string; thumbnailUrl?: string }[]): void {
  const cache = urlCache(owner);
  for (const item of items) cache.set(assetIdentity(item.asset), item.thumbnailUrl || item.url);
}

export function useAssetUrl(asset: AssetRef | null | undefined): string | null {
  const app = useApp();
  const id = asset ? assetIdentity(asset) : "";
  const cache = urlCache(app);
  const known = id ? cache.get(id) : null;
  const [url, setUrl] = useState<string | null>(typeof known === "string" ? known : null);
  useEffect(() => {
    if (!asset || !id) { setUrl(null); return; }
    let cancelled = false;
    let entry = cache.get(id);
    if (entry === undefined) {
      entry = app.call("assets.getUrl", { asset }).then((r) => { cache.set(id, r.url); return r.url; }, () => { cache.delete(id); return null; });
      cache.set(id, entry);
    }
    if (typeof entry === "string" || entry === null) setUrl(entry);
    else void entry.then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [id]);
  return url;
}

/** Image of an asset ref (object-cover). */
export function AssetImage({ asset, url: explicit, alt, className }: { asset?: AssetRef | null; url?: string | null; alt: string; className?: string }) {
  const resolved = useAssetUrl(explicit ? null : asset);
  const url = explicit ?? resolved;
  return url
    ? <img src={url} alt={alt} loading="lazy" decoding="async" draggable={false} class={cn("size-full object-cover", className)} />
    : <span class={cn("block size-full animate-pulse bg-surface-control", className)} aria-hidden="true" />;
}

/** Full-screen image viewer (`h1`). */
export function ImageViewer({ open, url, alt, onClose }: { open: boolean; url: string | null; alt: string; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  useLayer(open, onClose);
  useEffect(() => setFailed(false), [url]);
  if (!open) return null;
  return (
    <Portal>
      <div class="fixed inset-0 z-130 grid place-items-center bg-black/86 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose} data-image-viewer="">
        {url && !failed
          ? <img src={url} alt={alt} class="max-h-full max-w-full rounded-md object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} onError={() => setFailed(true)} />
          : url ? <p class="text-sm text-destructive">{VIEWER_LABELS.loadFailed}</p> : <Spinner className="size-6 text-muted-foreground" />}
        <IconButton label={VIEWER_LABELS.close} title={COMMON_LABELS.close} className="absolute top-3 right-3 bg-black/40 text-white hover:bg-black/60" onClick={onClose}><XIcon /></IconButton>
      </div>
    </Portal>
  );
}

/** Asset viewer: resolves the URL of an asset ref. */
export function AssetViewer({ asset, onClose }: { asset: AssetRef | null; onClose: () => void }) {
  const url = useAssetUrl(asset);
  return <ImageViewer open={!!asset} url={url} alt={asset?.name ?? ""} onClose={onClose} />;
}

/* ------------------------------------------------------------------------------------------------
 * Menu (Radix dropdown stand-in)
 * ---------------------------------------------------------------------------------------------- */

export interface MenuItem { id: string; label: string; onSelect?: () => void; disabled?: boolean; title?: string; destructive?: boolean; checked?: boolean; keepOpen?: boolean; badge?: string }

export function Menu({ label, trigger, items, align = "end" }: { label: string; trigger: ComponentChildren; items: MenuItem[]; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <Button ref={anchor} variant="ghost" size="workbenchIcon" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={(e: Event) => { e.stopPropagation(); setOpen(!open); }}>
        {trigger}
      </Button>
      <Floating open={open} anchor={anchor} onClose={() => setOpen(false)} align={align} role="menu" aria-label={label} className="min-w-48 p-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.title}
            onClick={() => { item.onSelect?.(); if (!item.keepOpen) setOpen(false); }}
            class={cn("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-semibold outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-45 max-md:h-11", item.destructive ? "text-destructive" : "text-foreground")}
          >
            <span class="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge ? <Badge>{item.badge}</Badge> : null}
            {item.checked ? <CheckIcon className="size-3.5 text-primary" /> : null}
          </button>
        ))}
      </Floating>
    </>
  );
}

/** Centered card message (empty states). */
export function EmptyCard({ children, tone = "muted" }: { children: ComponentChildren; tone?: "muted" | "danger" }) {
  return <div class={cn("rounded-lg px-4 py-6 text-center text-xs leading-relaxed", tone === "danger" ? "bg-destructive/12 text-destructive" : "bg-card text-muted-foreground")} role={tone === "danger" ? "alert" : undefined}>{children}</div>;
}

export type { ButtonProps };
export { Dialog };
