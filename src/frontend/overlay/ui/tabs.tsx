import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { cn } from "./cn.js";

export type TabItem<T extends string = string> = { id: T; label: ComponentChildren; ariaLabel?: string; disabled?: boolean };

export type TabsProps<T extends string = string> = {
  items: TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  idPrefix: string;
  className?: string;
  tabClassName?: string;
  "aria-label"?: string;
};

/**
 * Tab list with roving tabindex: Left/Right (and Up/Down) move and activate,
 * Home/End jump. Panels use `tabPanelProps(idPrefix, id)`.
 */
export function Tabs<T extends string = string>({ items, value, onValueChange, idPrefix, className, tabClassName, ...aria }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.disabled);
  const move = (from: number, delta: number) => {
    if (enabled.length === 0) return;
    const position = enabled.findIndex(({ index }) => index === from);
    const next = enabled[(position + delta + enabled.length) % enabled.length]!;
    onValueChange(next.item.id);
    refs.current[next.index]?.focus();
  };
  return (
    <div role="tablist" class={cn("flex min-w-0 items-center gap-1", className)} {...aria}>
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(element) => { refs.current[index] = element; }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            aria-label={item.ariaLabel}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            data-state={selected ? "active" : "inactive"}
            onClick={() => onValueChange(item.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(index, 1); }
              else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(index, -1); }
              else if (event.key === "Home") { event.preventDefault(); const first = enabled[0]; if (first) { onValueChange(first.item.id); refs.current[first.index]?.focus(); } }
              else if (event.key === "End") { event.preventDefault(); const last = enabled[enabled.length - 1]; if (last) { onValueChange(last.item.id); refs.current[last.index]?.focus(); } }
            }}
            class={cn("inline-flex h-8 shrink-0 items-center justify-center rounded-md px-3 text-xs font-bold text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 disabled:opacity-45 data-[state=active]:bg-selected data-[state=active]:text-selected-foreground max-md:h-11", tabClassName)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function tabPanelProps(idPrefix: string, id: string) {
  return {
    role: "tabpanel",
    id: `${idPrefix}-panel-${id}`,
    "aria-labelledby": `${idPrefix}-tab-${id}`,
    tabIndex: 0
  } as const;
}
