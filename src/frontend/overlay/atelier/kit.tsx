/**
 * Maid Atelier table kit and shared fields (AM `wf` table CSS 120150, `hg`/`T_` active column, `xf` row actions with a
 * two-step delete, `HM` empty states, `OH` 124474 drag reorder with a move menu, `rH` weight field, `cbe` scope picker,
 * `bH` format restriction, `ibe` attribute table, prompt rows with extra expressions).
 */
import type { ComponentChildren, HTMLAttributes, TdHTMLAttributes } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { Button, Floating, IconButton, PlusIcon, Switch, TextArea, TextField, TrashIcon, cn } from "../ui/index.js";
import { Badge, Checkbox } from "../workspace/parts.js";
import { ATELIER_LABELS as L } from "./labels.js";
import { dropIndex, parseWeight, promptPairs, SCOPES, setPromptPair, type FormatRestriction, type OutputFormat, type PromptPair, type Scope } from "./model.js";

/* ------------------------------------------------------------------------------------------------ layout */

export function Section({ title, description, end, children, className, ...rest }: { title?: ComponentChildren; description?: ComponentChildren; end?: ComponentChildren; children: ComponentChildren; className?: string } & Omit<HTMLAttributes<HTMLElement>, "title">) {
  return (
    <section class={cn("grid min-w-0 content-start gap-2", className)} {...rest}>
      {title || end ? (
        <header class="flex min-h-8 flex-wrap items-center justify-between gap-2">
          {title ? <h3 class="text-xs font-extrabold text-foreground">{title}</h3> : <span />}
          {end ? <div class="flex flex-wrap items-center gap-1.5">{end}</div> : null}
        </header>
      ) : null}
      {description ? <p class="text-2xs leading-relaxed text-muted-foreground">{description}</p> : null}
      {children}
    </section>
  );
}

export function FieldRow({ label, hint, error, children, htmlFor, className }: { label: ComponentChildren; hint?: ComponentChildren; error?: string | null; children: ComponentChildren; htmlFor?: string; className?: string }) {
  return (
    <div class={cn("grid min-w-0 gap-1 text-xs font-bold text-muted-foreground", className)}>
      {htmlFor ? <label for={htmlFor}>{label}</label> : <span>{label}</span>}
      {children}
      {error ? <span class="text-3xs font-semibold text-destructive" role="alert">{error}</span> : hint ? <span class="text-3xs font-medium text-muted-foreground/80">{hint}</span> : null}
    </div>
  );
}

export function Notice({ tone = "info", children, actions, ...rest }: { tone?: "info" | "warning" | "danger"; children: ComponentChildren; actions?: ComponentChildren } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      class={cn("grid gap-2 rounded-md px-3 py-2 text-2xs leading-relaxed", tone === "danger" ? "bg-destructive/12 text-destructive" : tone === "warning" ? "bg-warning/12 text-warning" : "bg-card text-muted-foreground")}
      {...rest}
    >
      <div>{children}</div>
      {actions ? <div class="flex flex-wrap gap-1.5">{actions}</div> : null}
    </div>
  );
}

export function HelpCard({ text, children }: { text: string; children?: ComponentChildren }) {
  return (
    <aside class="grid gap-2 rounded-md bg-card px-3 py-2.5 text-2xs leading-relaxed text-muted-foreground" data-atelier-help="">
      <p>{text}</p>
      {children}
    </aside>
  );
}

/* ------------------------------------------------------------------------------------------------ table */

export function Table({ label, description, head, children, className }: { label: string; description?: string; head: ComponentChildren; children: ComponentChildren; className?: string }) {
  const id = useId();
  return (
    <div class={cn("min-w-0 overflow-x-auto rounded-md bg-card", className)} data-atelier-table="">
      <table class="w-full min-w-120 border-collapse text-left text-2xs" aria-label={label} aria-describedby={description ? id : undefined}>
        {description ? <caption id={id} class="sr-only">{description}</caption> : null}
        <thead class="sticky top-0 bg-card text-3xs font-black uppercase text-muted-foreground">
          <tr class="border-b border-border">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Th({ children, className }: { children?: ComponentChildren; className?: string }) {
  return <th scope="col" class={cn("h-8 px-2 align-middle font-black", className)}>{children}</th>;
}
export function Td({ children, className, ...rest }: { children?: ComponentChildren; className?: string } & TdHTMLAttributes<HTMLTableCellElement>) {
  return <td class={cn("px-2 py-1.5 align-middle", className)} {...rest}>{children}</td>;
}

/** Table row that opens its editor on click / Enter (AM `data-atelier-row-entry`). */
export function Row({ onOpen, label, inactive, selected, children, rowKey, ...rest }: { onOpen?: () => void; label?: string; inactive?: boolean; selected?: boolean; children: ComponentChildren; rowKey?: string } & HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      data-atelier-row={rowKey}
      data-atelier-row-entry={onOpen ? "" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={label}
      aria-selected={selected || undefined}
      class={cn("border-b border-border/50 outline-none last:border-b-0", onOpen && "cursor-pointer hover:bg-accent/40 focus-visible:bg-accent/50", inactive && "opacity-55", selected && "bg-surface-navigation-selected")}
      onClick={(event) => {
        if (!onOpen) return;
        const target = event.target as HTMLElement;
        if (target.closest("button, input, textarea, select, [role=switch], [role=checkbox], a")) return;
        onOpen();
      }}
      onKeyDown={(event) => {
        if (onOpen && event.key === "Enter" && event.target === event.currentTarget) {
          event.preventDefault();
          onOpen();
        }
      }}
      {...rest}
    >
      {children}
    </tr>
  );
}

/** Empty state row (AM `HM`): filtered vs unfiltered. */
export function EmptyRow({ colSpan, filtered, hint, onClear, onAdd, addLabel }: { colSpan: number; filtered: boolean; hint: string; onClear?: () => void; onAdd?: () => void; addLabel?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} class="px-3 py-6 text-center text-2xs text-muted-foreground" data-atelier-empty={filtered ? "filtered" : "empty"}>
        <div class="grid justify-items-center gap-2">
          <span>{filtered ? L.table.noMatch : hint}</span>
          {filtered && onClear ? <Button size="sm" variant="subtle" onClick={onClear}>{L.table.clear}</Button> : null}
          {!filtered && onAdd ? <Button size="sm" variant="subtle" onClick={onAdd}><PlusIcon />{addLabel}</Button> : null}
        </div>
      </td>
    </tr>
  );
}

/** Row switch "Active" / "Inactive, excluded from generation" (AM `T_`). */
export function ActiveSwitch({ checked, onChange, disabled, locked, name }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; locked?: boolean; name: string }) {
  const title = locked ? L.table.requiredGroup : checked ? L.table.active : L.table.inactive;
  return <Switch checked={locked ? true : checked} disabled={disabled || locked} onCheckedChange={onChange} aria-label={`${name}: ${title}`} className="size-8" />;
}

/** Header tri-state over the shown rows (AM `hg`). */
export function ActiveHeader({ state, onChange, disabled }: { state: boolean | "mixed"; onChange: (value: boolean) => void; disabled?: boolean }) {
  const label = state === true ? L.table.allActive : state === "mixed" ? L.table.someActive : L.table.inactive;
  return (
    <span class="inline-flex items-center gap-1.5" title={disabled ? L.table.nothingToChange : L.table.controlShown}>
      <Checkbox checked={state === "mixed" ? "indeterminate" : state} disabled={disabled} label={`${L.table.controlShown}: ${label}`} onCheckedChange={onChange} />
    </span>
  );
}

/** Duplicate + delete with a two-step confirm (AM `xf`). */
export function RowActions({ name, onDuplicate, onDelete, disabled }: { name: string; onDuplicate?: () => void; onDelete?: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <span class="inline-flex items-center gap-0.5">
      {onDuplicate ? <Button size="sm" variant="ghost" disabled={disabled} aria-label={`${L.table.duplicate} ${name}`} onClick={onDuplicate}>{L.table.duplicate}</Button> : null}
      {onDelete ? (
        armed ? (
          <>
            <Button size="sm" variant="danger" aria-label={`${L.table.confirmDelete} ${name}`} data-atelier-confirm-delete="" onClick={() => { setArmed(false); onDelete(); }}>{L.table.confirmDelete}</Button>
            <Button size="sm" variant="ghost" aria-label={`${L.table.cancelDelete} ${name}`} onClick={() => setArmed(false)}>{L.table.cancelDelete}</Button>
          </>
        ) : (
          <IconButton label={`${L.table.delete} ${name}`} size="iconCompact" disabled={disabled} onClick={() => setArmed(true)} data-atelier-delete=""><TrashIcon /></IconButton>
        )
      ) : null}
    </span>
  );
}

/**
 * Reorder handle (AM `OH`): drag with pointer capture (4 px threshold, Escape cancels, a drop outside the table cancels),
 * or click / Enter to open a "Move up / Move down" menu. Disabled under a filter or with fewer than 2 rows.
 */
export function ReorderHandle({ name, index, count, disabled, onMove }: { name: string; index: number; count: number; disabled?: boolean; onMove: (from: number, to: number) => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const drag = useRef<{ y: number; active: boolean; pointerId: number } | null>(null);
  const off = disabled || count < 2;
  const rects = () => {
    const body = button.current?.closest("tbody, [data-atelier-order-lane]");
    const rows = body ? [...body.querySelectorAll<HTMLElement>("[data-atelier-reorder-row]")] : [];
    return rows.map((r) => r.getBoundingClientRect());
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        disabled={off}
        aria-label={L.table.reorder(name)}
        title={L.table.reorder(name)}
        aria-haspopup="menu"
        aria-expanded={menu}
        data-atelier-reorder=""
        class="grid h-7 w-6 cursor-grab touch-none place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-35"
        onPointerDown={(event) => {
          if (off || event.button !== 0) return;
          drag.current = { y: event.clientY, active: false, pointerId: event.pointerId };
          (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const d = drag.current;
          if (d && !d.active && Math.abs(event.clientY - d.y) >= 4) d.active = true;
        }}
        onPointerUp={(event) => {
          const d = drag.current;
          drag.current = null;
          if (!d?.active) return;
          event.preventDefault();
          const list = rects();
          if (!list.length) return;
          const first = list[0]!;
          const last = list[list.length - 1]!;
          if (event.clientY < first.top - 24 || event.clientY > last.bottom + 24) return;
          const to = dropIndex(list, event.clientY, index);
          if (to !== index) onMove(index, to);
        }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && drag.current) { drag.current = null; event.stopPropagation(); }
        }}
        onClick={() => { if (!off) setMenu(true); }}
      >
        <svg viewBox="0 0 24 24" class="size-3.5" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></svg>
      </button>
      <Floating open={menu} anchor={button} onClose={() => setMenu(false)} role="menu" aria-label={L.table.reorder(name)} className="min-w-36 p-1">
        <button type="button" role="menuitem" disabled={index === 0} class="flex h-8 w-full items-center rounded-md px-2.5 text-left text-xs font-semibold outline-none hover:bg-accent focus-visible:bg-accent disabled:opacity-45" onClick={() => { setMenu(false); onMove(index, index - 1); }}>{L.table.moveUp}</button>
        <button type="button" role="menuitem" disabled={index >= count - 1} class="flex h-8 w-full items-center rounded-md px-2.5 text-left text-xs font-semibold outline-none hover:bg-accent focus-visible:bg-accent disabled:opacity-45" onClick={() => { setMenu(false); onMove(index, index + 1); }}>{L.table.moveDown}</button>
      </Floating>
    </>
  );
}

export function CountChip({ shown, total }: { shown: number; total: number }) {
  return <Badge className="font-mono" aria-label={L.table.count(shown, total)}>{L.table.count(shown, total)}</Badge>;
}

/* ------------------------------------------------------------------------------------------------ fields */

/** Text input that commits on change, with an optional validator (invalid values stay local and mark the store incomplete). */
export function CommitText({ value, onCommit, validate, label, placeholder, multiline, rows = 4, className, disabled, onInvalid, mono }: {
  value: string;
  onCommit: (value: string) => void;
  validate?: (value: string) => string | null;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  disabled?: boolean;
  onInvalid?: (invalid: boolean) => void;
  mono?: boolean;
}) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(value);
    setError(null);
  }, [value]);
  const change = (next: string) => {
    setText(next);
    const problem = validate ? validate(next) : null;
    setError(problem);
    onInvalid?.(!!problem);
    if (!problem && next !== value) onCommit(next);
  };
  return (
    <span class={cn("grid min-w-0 gap-1", className)}>
      {multiline ? (
        <TextArea aria-label={label} placeholder={placeholder} rows={rows} value={text} disabled={disabled} className={cn(mono && "font-mono text-2xs")} onInput={(e) => change((e.currentTarget as HTMLTextAreaElement).value)} aria-invalid={!!error} />
      ) : (
        <TextField aria-label={label} placeholder={placeholder} value={text} disabled={disabled} className={cn(mono && "font-mono")} onInput={(e) => change((e.currentTarget as HTMLInputElement).value)} aria-invalid={!!error} />
      )}
      {error ? <span class="text-3xs font-semibold text-destructive" role="alert">{error}</span> : null}
    </span>
  );
}

/** Weight input (AM `rH`) with the below/above warnings. */
export function WeightInput({ value, onCommit, label = L.fields.weight, disabled }: { value: number; onCommit: (value: number) => void; label?: string; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const parsed = parseWeight(text);
  return (
    <span class="grid gap-0.5">
      <TextField aria-label={label} value={text} disabled={disabled} className="w-16 font-mono" inputMode="decimal" aria-invalid={!!parsed.error} onInput={(e) => {
        const next = (e.currentTarget as HTMLInputElement).value;
        setText(next);
        const p = parseWeight(next);
        if (p.value !== undefined && p.value !== value) onCommit(p.value);
      }} />
      {parsed.error ? <span class="text-3xs text-destructive" role="alert">{parsed.error}</span> : parsed.warning ? <span class="text-3xs text-muted-foreground">{parsed.warning}</span> : null}
    </span>
  );
}

/** Prompt pairs editor: main prompt + weight, extra expressions (추가 표현) with add / delete. */
export function PromptEditor({ prompt, onChange, name, disabled }: { prompt: unknown; onChange: (prompt: PromptPair[] | null) => void; name: string; disabled?: boolean }) {
  const pairs = promptPairs(prompt);
  const main = pairs[0] ?? [1, ""];
  return (
    <div class="grid gap-1.5" data-atelier-prompt={name}>
      <div class="flex items-start gap-1.5">
        <CommitText className="flex-1" label={`${name} ${L.fields.prompt}`} placeholder={L.fields.noOutput} value={main[1]} disabled={disabled} onCommit={(tag) => onChange(setPromptPair(prompt, 0, [main[0], tag]))} />
        <WeightInput label={`${name} ${L.fields.weight}`} value={main[0]} disabled={disabled} onCommit={(w) => onChange(setPromptPair(prompt, 0, [w, main[1]]))} />
      </div>
      {pairs.slice(1).map((pair, i) => (
        <div key={i} class="flex items-start gap-1.5 pl-3">
          <CommitText className="flex-1" label={`${name} ${L.fields.extraExpressions} ${i + 1}`} value={pair[1]} disabled={disabled} onCommit={(tag) => onChange(setPromptPair(prompt, i + 1, [pair[0], tag]))} />
          <WeightInput label={`${name} ${L.fields.extraExpressions} ${i + 1} ${L.fields.weight}`} value={pair[0]} disabled={disabled} onCommit={(w) => onChange(setPromptPair(prompt, i + 1, [w, pair[1]]))} />
          <IconButton label={L.fields.removeExpression(name, i + 1)} size="iconCompact" disabled={disabled} onClick={() => onChange(setPromptPair(prompt, i + 1, null))}><TrashIcon /></IconButton>
        </div>
      ))}
      <div>
        <Button size="sm" variant="ghost" disabled={disabled || !main[1].trim()} onClick={() => onChange([...pairs.length ? pairs : [main], [1, ""]] as PromptPair[])}><PlusIcon />{L.fields.addExpression}</Button>
      </div>
    </div>
  );
}

/** Scope checkbox grid (AM `cbe`): scene / character / female / male. */
export function ScopePicker({ value, onChange, disabled, legacy }: { value: readonly Scope[]; onChange: (scopes: Scope[]) => void; disabled?: boolean; legacy?: boolean }) {
  return (
    <div class="grid gap-1">
      <div class="flex flex-wrap gap-1.5" role="group" aria-label={L.tagGroup.scope}>
        {SCOPES.map((scope) => {
          const checked = value.includes(scope) || (scope !== "actor" && scope !== "scene" && value.includes("actor"));
          return (
            <label key={scope} class={cn("inline-flex h-7.5 items-center gap-2 rounded-md bg-surface-control px-2.5 text-2xs font-bold", disabled && "opacity-45")}>
              <Checkbox checked={checked} disabled={disabled || (scope !== "actor" && scope !== "scene" && value.includes("actor"))} label={L.scopes[scope]} onCheckedChange={(on) => onChange(on ? [...value.filter((s) => s !== scope), scope] : value.filter((s) => s !== scope))} />
              {L.scopes[scope]}
            </label>
          );
        })}
      </div>
      {legacy ? <span class="text-3xs text-muted-foreground">{L.scopes.pickOne}</span> : null}
    </div>
  );
}

/** Format restriction (AM `bH`): off = common, on = illustration or comic. */
export function FormatField({ value, onChange, disabled }: { value: FormatRestriction | undefined; onChange: (value: FormatRestriction | undefined) => void; disabled?: boolean }) {
  const enabled = !!value?.enabled;
  const selected = value?.selected?.[0];
  return (
    <div class="grid gap-1.5">
      <label class="inline-flex items-center gap-2 text-2xs font-bold">
        <Checkbox checked={enabled} disabled={disabled} label={L.fields.formatRestrict} onCheckedChange={(on) => onChange(on ? { enabled: true, selected: ["illustration"] } : undefined)} />
        {L.fields.formatRestrict}
      </label>
      {enabled ? (
        <div class="flex gap-1.5" role="radiogroup" aria-label={L.fields.format}>
          {(["illustration", "comic"] as OutputFormat[]).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={selected === f} disabled={disabled} class={cn("h-7.5 rounded-md px-2.5 text-2xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring/55", selected === f ? "bg-primary text-primary-foreground" : "bg-surface-control text-secondary-foreground")} onClick={() => onChange({ enabled: true, selected: [f] })}>
              {L.fields[f]}
            </button>
          ))}
        </div>
      ) : null}
      {enabled && !selected ? <span class="text-3xs text-destructive" role="alert">{L.fields.formatRequired}</span> : null}
    </div>
  );
}

/** Built-in attribute keys (AM `ibe`: body_part, visible_from). */
const BUILTIN_ATTRIBUTES = ["body_part", "visible_from"];
/** Attribute table (AM `ibe`): key / value rows, add, delete; duplicate or empty keys are refused. */
export function AttributeTable({ value, onChange, label, disabled }: { value: Record<string, string> | undefined; onChange: (value: Record<string, string> | undefined) => void; label: string; disabled?: boolean }) {
  const entries = Object.entries(value ?? {});
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const write = (next: Array<[string, string]>) => onChange(next.length ? Object.fromEntries(next) : undefined);
  return (
    <div class="grid gap-1.5" role="group" aria-label={label}>
      {entries.length === 0 ? <span class="text-3xs text-muted-foreground">{L.attributes.empty}</span> : null}
      {entries.map(([key, v], i) => (
        <div key={key} class="flex items-center gap-1.5">
          <code class="min-w-24 rounded-sm bg-surface-control px-1.5 py-1 text-3xs">{key}</code>
          <CommitText className="flex-1" label={`${label} ${key} ${L.attributes.value}`} value={v} disabled={disabled} onCommit={(nv) => write(entries.map((e, j) => (j === i ? [key, nv] : e)))} />
          <IconButton label={`${L.attributes.remove} ${key}`} size="iconCompact" disabled={disabled} onClick={() => write(entries.filter((_, j) => j !== i))}><TrashIcon /></IconButton>
        </div>
      ))}
      <div class="flex items-center gap-1.5">
        <TextField aria-label={`${label} ${L.attributes.key}`} list="ii-atelier-attribute-keys" placeholder={BUILTIN_ATTRIBUTES.join(" / ")} value={newKey} disabled={disabled} className="flex-1" onInput={(e) => { setNewKey((e.currentTarget as HTMLInputElement).value); setError(null); }} />
        <datalist id="ii-atelier-attribute-keys">{BUILTIN_ATTRIBUTES.map((k) => <option key={k} value={k} />)}</datalist>
        <Button size="sm" variant="subtle" disabled={disabled} onClick={() => {
          const key = newKey.trim();
          if (!key || entries.some(([k]) => k === key)) { setError(L.attributes.duplicate); return; }
          write([...entries, [key, ""]]);
          setNewKey("");
        }}><PlusIcon />{L.attributes.add}</Button>
      </div>
      {error ? <span class="text-3xs text-destructive" role="alert">{error}</span> : null}
    </div>
  );
}

/** Two-choice segmented radio group. */
export function Choice<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; disabled?: boolean }) {
  return (
    <div class="inline-flex flex-wrap gap-1 rounded-md bg-surface-control p-1" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={disabled} onClick={() => onChange(o.value)} class={cn("h-6.5 rounded-sm px-2.5 text-2xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:opacity-45 max-md:h-9", value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
