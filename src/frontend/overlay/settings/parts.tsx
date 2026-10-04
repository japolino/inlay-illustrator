/**
 * Shared building blocks of the settings pages (Asset Maid `i5`/`n0`/`XI`/`k0t`/`C0t`/`u5`/`ib`/`FH`/`Bn`/`Un`/`$H`,
 * AssetMaid.pretty.js 141306-141470, 143053-143072, 62305-62359, 62900-62921, 144892).
 */
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useId, useState } from "preact/hooks";
import { Button, CheckIcon, IconButton, Slider, StopIcon, Switch, TextField, cn } from "../ui/index.js";
import { COMMON_LABELS as C } from "./labels.js";
import { MinusIcon, PlusIcon, SaveIcon, SparkleIcon, SpinnerIcon } from "./icons.js";

/** Settings page frame: header (`C0t`) + centred body (max-w-190). */
export function SettingsFrame({ section, title, actions, banner, children, className }: {
  section: string;
  title: string;
  actions?: ComponentChildren;
  banner?: ComponentChildren;
  children?: ComponentChildren;
  className?: string;
}) {
  return (
    <div class="grid content-start gap-6 px-5 pt-5 pb-10 mobile:px-3 mobile:pt-3" data-settings-page={section} data-model-settings-workspace="">
      <header class="mx-auto flex min-h-8 w-full max-w-190 items-center justify-between gap-3" data-settings-page-header="">
        <h1 class="truncate text-lg leading-tight font-extrabold">{title}</h1>
        {actions}
      </header>
      {banner}
      <div class={cn("mx-auto grid w-full min-w-0 max-w-190 content-start gap-6", className)}>{children}</div>
    </div>
  );
}

/** Red strip under the header (`axt` 143559). */
export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div class="mx-auto w-full max-w-190 rounded-md bg-destructive/8 px-4 py-2 text-xs text-destructive" role="alert">{message}</div>;
}

/** Status dot + save icon button (`axt` header actions 143521, `gxt` 145486). */
export function SaveActions({ dirty, saving, error, onSave, label = C.saveChanges, unsavedLabel = C.unsavedChanges, failedLabel = C.saveFailed, children }: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  label?: string;
  unsavedLabel?: string;
  failedLabel?: (message: string) => string;
  children?: ComponentChildren;
}) {
  return (
    <div class="flex shrink-0 items-center gap-1" data-settings-save-actions="">
      {children}
      <span
        class={cn("size-1.5 rounded-full transition-opacity", error ? "bg-destructive" : "bg-warning", dirty || error ? "opacity-100" : "opacity-0")}
        role={dirty || error ? "status" : undefined}
        aria-label={error ? failedLabel(error) : dirty ? unsavedLabel : undefined}
        data-settings-dirty={dirty ? "true" : "false"}
      />
      <IconButton label={label} title={error || label} disabled={(!dirty && !error) || saving} onClick={onSave} data-settings-save="">
        {saving ? <SpinnerIcon /> : <SaveIcon />}
      </IconButton>
    </div>
  );
}

/** Section with h2 + divided card (`i5`). */
export function SectionCard({ title, children, disabled, end, className }: { title: string; children: ComponentChildren; disabled?: boolean; end?: ComponentChildren; className?: string }) {
  return (
    <section class={cn("grid gap-2.5 pt-2.5 pb-4.5 transition-opacity", disabled && "opacity-45", className)} aria-disabled={disabled || undefined} inert={disabled || undefined}>
      <div class="flex h-9.5 items-center justify-between gap-2 px-0.5">
        <h2 class="text-xs font-extrabold">{title}</h2>
        {end}
      </div>
      <div class="divide-y divide-white/5 overflow-hidden rounded-lg bg-card px-4">{children}</div>
    </section>
  );
}

/** Row: title + description left, controls right (`n0`). */
export function Row({ title, titleEnd, description, children, className, ...rest }: {
  title: ComponentChildren;
  titleEnd?: ComponentChildren;
  description?: ComponentChildren;
  children?: ComponentChildren;
  className?: string;
} & Omit<JSX.IntrinsicElements["div"], "title">) {
  return (
    <div class={cn("grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3", className)} {...rest}>
      <div class="min-w-0 pr-4 mobile:pr-0">
        <strong class="flex flex-wrap items-center gap-1.5 text-xs font-bold">{title}{titleEnd}</strong>
        {description ? <span class="mt-0.5 block max-w-140 text-xs leading-relaxed text-muted-foreground">{description}</span> : null}
      </div>
      <div class="flex min-w-0 flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}

/** Switch row (`XI`). */
export function SwitchRow({ title, titleEnd, description, checked, disabled, onCheckedChange, ...rest }: {
  title: string;
  titleEnd?: ComponentChildren;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
} & Record<`data-${string}`, string>) {
  return (
    <Row title={title} titleEnd={titleEnd} description={description} {...rest}>
      <Switch checked={checked} disabled={disabled} aria-label={title} onCheckedChange={onCheckedChange} />
    </Row>
  );
}

/** Slider with a local value that commits on release (`k0t` + `zwe`). */
export function CommitSlider({ value, min, max, step, label, format, disabled, onCommit, className }: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  format: (value: number) => string;
  disabled?: boolean;
  onCommit: (value: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div class={cn("flex h-8 w-full items-center gap-3", className)}>
      <Slider aria-label={label} value={draft} min={min} max={max} step={step} disabled={disabled} onValueChange={setDraft}
        onValueCommit={(next) => { if (next !== value) onCommit(next); }} />
      <span class="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{format(draft)}</span>
    </div>
  );
}

/** Slider row (`k0t`, inline layout). */
export function SliderRow({ title, description, ...slider }: { title: string; description?: string } & Omit<Parameters<typeof CommitSlider>[0], "label">) {
  return (
    <div class="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_minmax(7rem,40%)] items-center gap-4 py-3 mobile:grid-cols-1 mobile:gap-2">
      <div class="min-w-0">
        <strong class="block text-xs font-bold">{title}</strong>
        {description ? <span class="mt-0.5 block max-w-140 text-xs leading-relaxed text-muted-foreground">{description}</span> : null}
      </div>
      <CommitSlider label={title} {...slider} />
    </div>
  );
}

/** Labelled field (label text above the control, `grid gap-1 text-xs font-bold text-muted-foreground`). */
export function Field({ label, hint, children, className, htmlFor }: { label: ComponentChildren; hint?: ComponentChildren; children: ComponentChildren; className?: string; htmlFor?: string }) {
  return (
    <div class={cn("grid min-w-0 gap-1 text-xs font-bold text-muted-foreground", className)}>
      {htmlFor ? <label for={htmlFor}>{label}</label> : <span>{label}</span>}
      {children}
      {hint ? <span class="text-3xs font-medium text-muted-foreground/80">{hint}</span> : null}
    </div>
  );
}

/** Two-column grid (`u5`) and column (`ib`). */
export function Columns({ children, className }: { children: ComponentChildren; className?: string }) {
  return <div class={cn("grid min-w-0 gap-4 md:grid-cols-2 md:items-start", className)} data-model-settings-columns="">{children}</div>;
}
export function Column({ children, className }: { children: ComponentChildren; className?: string }) {
  return <div class={cn("grid min-w-0 content-start gap-3", className)}>{children}</div>;
}

/** Card section (`section rounded-lg bg-card p-4`, `FH`). */
export function Card({ children, className, title, end, ...rest }: { children: ComponentChildren; className?: string; title?: string; end?: ComponentChildren } & Omit<JSX.IntrinsicElements["section"], "title">) {
  return (
    <section class={cn("grid min-w-0 content-start gap-3", className)} {...rest}>
      {title || end ? (
        <header class="flex min-h-8 items-center justify-between gap-3">
          {title ? <h2 class="text-sm font-extrabold">{title}</h2> : <span />}
          {end ? <div class="flex items-center gap-1.5">{end}</div> : null}
        </header>
      ) : null}
      <div class="grid min-w-0 content-start gap-4 rounded-lg bg-card p-4">{children}</div>
    </section>
  );
}

export type BadgeTone = "neutral" | "foreground" | "primary" | "success" | "warning" | "danger";
const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "text-muted-foreground",
  foreground: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive"
};
/** Badge (`Bn`). */
export function Badge({ tone = "neutral", children, className, title }: { tone?: BadgeTone; children: ComponentChildren; className?: string; title?: string }) {
  return <span title={title} class={cn("inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-surface-badge px-2 py-0.5 text-2xs font-bold backdrop-blur-md", BADGE_TONES[tone], className)}>{children}</span>;
}

/** "Selected" pill on radio cards. */
export function SelectedPill({ label = C.selected }: { label?: string }) {
  return (
    <span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] leading-none font-bold text-primary">
      <CheckIcon className="size-2.5" />{label}
    </span>
  );
}

const CHECKBOX_BACKGROUNDS = {
  transparent: "bg-transparent",
  control: "bg-surface-control",
  card: "bg-card",
  secondary: "bg-secondary",
  promptField: "bg-surface-prompt-field"
} as const;

/** Labelled checkbox (`Un` + `CM`). */
export function LabeledCheckbox({ label, checked, disabled, background, className, labelClassName, onCheckedChange, ...rest }: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  background?: keyof typeof CHECKBOX_BACKGROUNDS;
  className?: string;
  labelClassName?: string;
  onCheckedChange: (checked: boolean) => void;
} & Record<`data-${string}`, string>) {
  return (
    <label class={cn("inline-flex h-7.5 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 text-2xs font-bold text-secondary-foreground max-md:h-11 max-md:text-xs", background && CHECKBOX_BACKGROUNDS[background], disabled && "cursor-not-allowed opacity-45", className)} data-labeled-checkbox="" {...rest}>
      <button type="button" role="checkbox" aria-checked={checked} aria-label={label} disabled={disabled} data-state={checked ? "checked" : "unchecked"}
        onClick={(event) => { event.preventDefault(); onCheckedChange(!checked); }}
        class="peer grid size-3.5 shrink-0 place-items-center rounded-sm bg-input text-primary-foreground ring-1 ring-white/7 outline-none ring-inset transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed data-[state=checked]:bg-primary">
        {checked ? <CheckIcon className="size-2.5" /> : null}
      </button>
      <span class={cn("whitespace-nowrap", labelClassName)}>{label}</span>
    </label>
  );
}

/** Round −/value/+ stepper (system page). */
export function Stepper({ value, label, format, min, max, decreaseLabel, increaseLabel, onChange, disabled, ...rest }: {
  value: number;
  label: string;
  format: (value: number) => string;
  min?: number;
  max?: number;
  decreaseLabel: string;
  increaseLabel: string;
  onChange: (value: number) => void;
  disabled?: boolean;
} & Record<`data-${string}`, string>) {
  return (
    <div class="flex items-center gap-1 rounded-full bg-surface-control p-1" role="group" aria-label={label} {...rest}>
      <Button variant="ghost" size="icon" className="size-7 rounded-full max-md:size-9" aria-label={decreaseLabel} title={decreaseLabel}
        disabled={disabled || (min !== undefined && value <= min)} onClick={() => onChange(value - 1)}>
        <MinusIcon />
      </Button>
      <output class="grid h-7 min-w-14 place-items-center rounded-full bg-surface-prompt-field px-2 text-xs font-bold text-foreground tabular-nums" aria-label={label} aria-live="polite">
        {format(value)}
      </output>
      <Button variant="ghost" size="icon" className="size-7 rounded-full max-md:size-9" aria-label={increaseLabel} title={increaseLabel}
        disabled={disabled || (max !== undefined && value >= max)} onClick={() => onChange(value + 1)}>
        <PlusIcon />
      </Button>
    </div>
  );
}

/** Analyze / stop button (`$H`). */
export function AnalyzeButton({ running, disabled, title, labels, onRun, onCancel }: {
  running: boolean;
  disabled?: boolean;
  title?: string;
  labels: { analyze: string; stop: string; stopAnalysis: string };
  onRun: () => void;
  onCancel: () => void;
}) {
  return (
    <Button variant="commandAction" disabled={disabled} onClick={running ? onCancel : onRun}
      aria-label={running ? labels.stopAnalysis : labels.analyze} title={running ? labels.stopAnalysis : title ?? labels.analyze}>
      {running ? <StopIcon /> : <SparkleIcon className="text-primary" />}
      {running ? labels.stop : labels.analyze}
    </Button>
  );
}

/** Large radio card (analysis profile `jwe`, image provider `oxt`). */
export function ChoiceCard({ selected, label, description, onSelect, gradient, image, monogram, disabled, ...rest }: {
  selected: boolean;
  label: string;
  description: string;
  onSelect?: () => void;
  gradient?: string;
  image?: { src: string; className: string };
  /** Large decorative text at the right edge (port replacement for Asset Maid's remote images). */
  monogram?: string;
  disabled?: boolean;
} & Record<`data-${string}`, string>) {
  return (
    <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
      class="group relative isolate min-h-34 min-w-0 overflow-hidden rounded-lg border border-border/70 bg-surface-prompt-field text-left outline-none transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-55 mobile:min-h-28"
      {...rest}>
      {image ? (
        <img src={image.src} alt="" aria-hidden="true" referrerpolicy="no-referrer"
          class={cn("pointer-events-none absolute bottom-0 object-contain object-right-bottom transition-[filter,opacity,transform] duration-300 ease-out group-hover:scale-[1.015]", image.className,
            selected ? "opacity-95 brightness-100 saturate-100" : "opacity-45 brightness-75 saturate-50 group-hover:opacity-60")} />
      ) : null}
      {gradient ? <span aria-hidden="true" class={cn("pointer-events-none absolute inset-0 bg-gradient-to-br transition-opacity duration-300", gradient, selected ? "opacity-100" : "opacity-45 group-hover:opacity-70")} /> : null}
      {monogram ? (
        <span aria-hidden="true" class={cn("pointer-events-none absolute -right-2 -bottom-6 text-[6.5rem] leading-none font-black tracking-tighter transition-[opacity,transform] duration-300 group-hover:scale-[1.015] mobile:text-[5rem]",
          selected ? "text-primary/30" : "text-foreground/8 group-hover:text-foreground/12")}>{monogram}</span>
      ) : null}
      <span aria-hidden="true" class={cn("pointer-events-none absolute inset-0", image ? cn("bg-gradient-to-r", selected ? "from-surface-prompt-field via-surface-prompt-field/72 to-transparent" : "from-surface-prompt-field via-surface-prompt-field/94 to-transparent") : "bg-gradient-to-t from-surface-prompt-field/82 via-transparent to-transparent")} />
      <span class={cn("relative z-10 flex min-h-34 min-w-0 flex-col justify-between gap-4 p-4 mobile:min-h-28 mobile:p-3", (image || monogram) && "max-w-[62%]")}>
        <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span class={cn("min-w-0 truncate text-sm leading-tight font-extrabold", selected ? "text-selected-foreground" : "text-muted-foreground")}>{label}</span>
          {selected ? <SelectedPill /> : null}
        </span>
        <span class="line-clamp-2 text-xs leading-5 font-medium text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

/**
 * Number input bound to a draft value. Shows the text as typed; reports a parsed number (or NaN while invalid).
 */
export function NumberField({ value, onValueChange, min, max, step, id, className, ...aria }: {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
  }, [value]);
  return (
    <TextField id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={text} className={cn("bg-surface-prompt-field", className)}
      onInput={(event) => {
        const next = (event.currentTarget as HTMLInputElement).value;
        setText(next);
        const parsed = next.trim() === "" ? Number.NaN : Number(next);
        if (Number.isFinite(parsed)) onValueChange(parsed);
      }}
      {...aria} />
  );
}

/** Small loading placeholder (`N0e` pending state). */
export function LoadingBox({ label = C.loading }: { label?: string }) {
  return (
    <div class="grid min-h-40 place-items-center rounded-lg bg-card text-muted-foreground" role="status" aria-busy="true">
      <SpinnerIcon className="size-5" />
      <span class="sr-only">{label}</span>
    </div>
  );
}

/** Error box with a reload button (`N0e` error state). */
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div class="grid justify-items-start gap-3 rounded-lg bg-card p-4" role="alert">
      <p class="text-xs text-destructive">{message}</p>
      {onRetry ? <Button variant="subtle" onClick={onRetry}>{C.reload}</Button> : null}
    </div>
  );
}

/** Stable id helper for label/aria wiring. */
export function useFieldId(prefix: string): string {
  return `${prefix}-${useId()}`;
}
