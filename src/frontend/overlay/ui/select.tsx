import { useId, useRef, useState } from "preact/hooks";
import { cn } from "./cn.js";
import { CheckIcon, ChevronDownIcon } from "./icons.js";
import { Floating } from "./popover.js";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  disabled?: boolean;
  description?: string;
};

export type SelectProps<T extends string = string> = {
  value: T | null;
  options: SelectOption<T>[];
  onValueChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

function nextEnabled<T extends string>(options: SelectOption<T>[], from: number, direction: 1 | -1): number {
  if (options.length === 0) return -1;
  for (let step = 1; step <= options.length; step += 1) {
    const index = (from + direction * step + options.length * 2) % options.length;
    if (!options[index]!.disabled) return index;
  }
  return -1;
}

/**
 * Listbox select styled like Asset Maid's Radix select (`ld`/`dd`/`ji`).
 * Keyboard: Enter/Space/ArrowDown open; arrows, Home/End and type-ahead move;
 * Enter/Space select; Escape/Tab close.
 */
export function Select<T extends string = string>({ value, options, onValueChange, placeholder = "Select…", disabled, id, className, ...aria }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const typeahead = useRef({ text: "", at: 0 });
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : nextEnabled(options, -1, 1));
    setOpen(true);
  };
  const close = (focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    close();
  };

  const onListKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => nextEnabled(options, current, 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => nextEnabled(options, current, -1)); }
    else if (event.key === "Home") { event.preventDefault(); setActive(nextEnabled(options, -1, 1)); }
    else if (event.key === "End") { event.preventDefault(); setActive(nextEnabled(options, 0, -1)); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(active); }
    else if (event.key === "Tab") { close(false); }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      typeahead.current = { text: (now - typeahead.current.at < 700 ? typeahead.current.text : "") + event.key.toLowerCase(), at: now };
      const match = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(typeahead.current.text));
      if (match >= 0) setActive(match);
    }
  };

  const activeId = active >= 0 ? `${listId}-option-${active}` : undefined;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        data-state={open ? "open" : "closed"}
        data-placeholder={selected ? undefined : ""}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openList();
          }
        }}
        class={cn("flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border-0 bg-input px-3 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-45 max-md:h-11 max-md:text-sm [&_svg]:shrink-0", className)}
        {...aria}
      >
        <span class={cn("min-w-0 truncate text-left", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </button>
      <Floating open={open} anchor={trigger} onClose={() => close()} matchWidth className="max-h-[22rem] p-1.5" initialFocus={list}>
        <div
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={activeId}
          aria-labelledby={aria["aria-labelledby"]}
          aria-label={aria["aria-label"]}
          onKeyDown={onListKeyDown}
          class="outline-none"
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              aria-disabled={option.disabled || undefined}
              data-highlighted={index === active ? "" : undefined}
              data-disabled={option.disabled ? "" : undefined}
              title={option.description}
              onPointerMove={() => { if (!option.disabled) setActive(index); }}
              onClick={() => choose(index)}
              class="relative flex min-h-8 cursor-default select-none items-center rounded-md py-1.5 pr-8 pl-2.5 text-xs font-semibold wrap-anywhere whitespace-normal outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-white/7 data-[disabled]:opacity-45 max-md:min-h-11 max-md:text-sm"
            >
              <span>{option.label}</span>
              {index === selectedIndex ? (
                <span class="absolute right-2 grid size-4 place-items-center"><CheckIcon className="size-3.5 text-primary" /></span>
              ) : null}
            </div>
          ))}
        </div>
      </Floating>
    </>
  );
}
