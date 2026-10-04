/**
 * Search field (AM `N6` 100519) and display filter popover (AM `LT` 100369 + state hook `nhe` 100470).
 * Shared by the roster sidebar and the workspace tabs.
 */
import { useMemo, useRef, useState } from "preact/hooks";
import { matchesQuery } from "../../lib/text-match.js";
import { Button, FilterIcon, IconButton, Popover, RefreshIcon, ResetIcon, SearchIcon, XIcon, cn } from "../ui/index.js";

export const FILTER_LABELS = {
  displayFilter: "Display filter", // 표시 필터
  all: "All", // 전체
  reset: "Reset filter", // 필터 초기화
  refresh: "Refresh filter list", // 필터 목록 새로고침
  refreshTitle: "Refresh the list with the current conditions", // 현재 조건으로 목록 새로고침
  searchPeople: "Search people…", // 인물 검색…
  clear: (label: string) => `${label} clear` // ${r} 지우기
} as const;

/** Search input with clear button; Escape clears (not during IME composition). */
export function SearchField({ value, onChange, label, placeholder = FILTER_LABELS.searchPeople, className }: { value: string; onChange: (value: string) => void; label: string; placeholder?: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div class={cn("relative flex min-w-0 items-center", className)} data-search-field="">
      <SearchIcon className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
      <input
        ref={input}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onInput={(event) => onChange((event.currentTarget as HTMLInputElement).value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.isComposing && value) {
            event.preventDefault();
            event.stopPropagation();
            onChange("");
          }
        }}
        class="h-8 w-full min-w-0 rounded-md bg-input pr-8 pl-8 text-xs font-semibold text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-11 max-md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          class="absolute right-1.5 grid size-5 place-items-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55"
          aria-label={FILTER_LABELS.clear(label)}
          title={FILTER_LABELS.clear(label)}
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export interface FilterOption { id: string; label: string }
export interface FilterGroup { id: string; label: string; yes?: string; no?: string; options?: FilterOption[] }
export type FilterValues = Record<string, string>;

export function filterOptions(group: FilterGroup): FilterOption[] {
  return group.options ?? [{ id: "all", label: FILTER_LABELS.all }, { id: "yes", label: group.yes ?? "Yes" }, { id: "no", label: group.no ?? "No" }];
}

/** AM `vI`: all -> true; yes -> bool; no -> !bool. */
export function matchFlag(value: string | undefined, flag: boolean): boolean {
  return !value || value === "all" ? true : value === "yes" ? flag : !flag;
}

export function isFilterActive(values: FilterValues): boolean {
  return Object.values(values).some((value) => value && value !== "all");
}

/** Popover with filter groups, reset and refresh. */
export function FilterPopover({ groups, values, onChange, onReset, onRefresh, label = FILTER_LABELS.displayFilter, compact = true }: {
  groups: FilterGroup[];
  values: FilterValues;
  onChange: (groupId: string, value: string) => void;
  onReset: () => void;
  onRefresh?: () => void;
  label?: string;
  compact?: boolean;
}) {
  const active = isFilterActive(values);
  return (
    <Popover
      align="start"
      aria-label={label}
      trigger={(props) => (
        <Button {...props} variant={active ? "subtle" : "ghost"} size={compact ? "icon" : "command"} aria-label={label} title={label} className="relative" data-filter-trigger="">
          <FilterIcon />
          {active ? <span class="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" aria-hidden="true" /> : null}
        </Button>
      )}
    >
      <div class="grid gap-3" data-filter-popover="">
        {groups.map((group) => (
          <div key={group.id} class="grid gap-1.5" role="group" aria-label={group.label}>
            <span class="text-2xs font-bold text-muted-foreground">{group.label}</span>
            <div class="flex flex-wrap gap-1">
              {filterOptions(group).map((option) => {
                const selected = (values[group.id] ?? "all") === option.id;
                return (
                  <Button key={option.id} size="sm" variant={selected ? "subtle" : "ghost"} aria-pressed={selected} onClick={() => onChange(group.id, option.id)} className={cn(selected && "text-foreground")}>
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
        <div class="flex items-center justify-end gap-1 border-t border-border pt-2">
          <IconButton label={FILTER_LABELS.reset} disabled={!active} onClick={onReset}><ResetIcon /></IconButton>
          {onRefresh ? <IconButton label={FILTER_LABELS.refresh} title={FILTER_LABELS.refreshTitle} onClick={onRefresh}><RefreshIcon /></IconButton> : null}
        </div>
      </div>
    </Popover>
  );
}

/**
 * Filter + search state with AM's snapshot semantics (`nhe`): the matching id list is recomputed only when
 * scope, query, values, revision or the refresh counter change, so toggling an item does not hide it until "Refresh".
 */
export function useFilteredList<T>(input: {
  items: T[];
  id: (item: T) => string;
  query: string;
  queryFields: (item: T) => Array<string | null | undefined>;
  values: FilterValues;
  match: (item: T, values: FilterValues) => boolean;
  /** Changing this key resets the snapshot (e.g. character or view switch). */
  scopeKey: string;
}): { visible: T[]; refresh: () => void } {
  const [refreshCounter, setRefreshCounter] = useState(0);
  const itemsRef = useRef(input.items);
  itemsRef.current = input.items;
  const filtering = input.query.trim() !== "" || isFilterActive(input.values);
  const snapshot = useMemo(() => {
    if (!filtering) return null;
    return new Set(itemsRef.current.filter((item) => matchesQuery(input.query, input.queryFields(item)) && input.match(item, input.values)).map(input.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.scopeKey, input.query, JSON.stringify(input.values), refreshCounter, filtering, itemsRef.current.length]);
  const visible = snapshot ? input.items.filter((item) => snapshot.has(input.id(item))) : input.items;
  return { visible, refresh: () => setRefreshCounter((n) => n + 1) };
}
