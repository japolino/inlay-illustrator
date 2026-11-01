/**
 * AI selection history of one image (AM 0.9.90 `yvt` 164987, header `S0e` 165214, chips `I0e` 164908): which scene
 * definitions, interactions and expression elements the analyzer chose. Data: `ZoomDetails.selectionSummary`.
 */
import { useState } from "preact/hooks";
import type { SelectionGroup, SelectionSummary } from "../../shared/contract/atelier.js";
import { cn } from "../overlay/ui/cn.js";
import { fill, ZOOM_LABELS as L } from "./labels.js";

export type SelectionRange = "recorded" | "all";

/** Groups shown for a range: "recorded" keeps only groups with a value (AM `I0e` filter); "all" keeps the offered list. */
export function visibleGroups(groups: readonly SelectionGroup[], range: SelectionRange, inventoryRecorded: boolean): SelectionGroup[] {
  if (range === "all" && inventoryRecorded) return [...groups];
  return groups.filter((g) => g.options.length > 0);
}

function groupKind(group: SelectionGroup): string {
  if (!("kind" in group)) return L.selectionTagGroup;
  return group.kind === "free" ? L.selectionFreeTags : L.selectionText;
}

function groupValue(group: SelectionGroup): { text: string; muted: boolean } {
  if (group.options.length) return { text: group.options.join(", "), muted: false };
  if ("kind" in group) return { text: group.recorded ? L.selectionEmpty : L.selectionNotRecorded, muted: true };
  return { text: L.selectionNone, muted: true };
}

function GroupChips({ groups }: { groups: SelectionGroup[] }) {
  return (
    <ul class="grid gap-1">
      {groups.map((group, i) => {
        const value = groupValue(group);
        return (
          <li key={`${group.id}:${i}`} class="grid gap-0.5 rounded-sm bg-surface-prompt-field px-2 py-1.5" data-selection-group={group.id}>
            <span class="flex items-center gap-1.5 text-3xs font-bold text-muted-foreground">
              <span class="rounded-sm bg-surface-badge px-1 uppercase">{groupKind(group)}</span>
              <span class="truncate font-mono">{group.id}</span>
            </span>
            <span class={cn("text-2xs break-words", value.muted ? "text-muted-foreground italic" : "font-medium text-foreground")}>{value.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Heading({ children, count }: { children: string; count?: number }) {
  return (
    <h3 class="flex items-center gap-1.5 text-xs font-extrabold">
      {children}
      {count !== undefined ? <span class="rounded-full bg-surface-badge px-1.5 text-3xs font-black text-muted-foreground">{fill(L.selectionCount, { n: count })}</span> : null}
    </h3>
  );
}

/** Selection history panel body. `summary` undefined = still loading. */
export function SelectionHistory({ summary }: { summary: SelectionSummary | undefined | null }) {
  const [range, setRange] = useState<SelectionRange>("recorded");
  if (summary === undefined) return <p class="text-xs text-muted-foreground" role="status">{L.selectionLoading}</p>;
  if (!summary || summary.status === "missing") return <p class="text-xs text-muted-foreground" data-selection-state="missing">{L.selectionMissing}</p>;
  if (summary.status === "omitted") return <p class="text-xs text-muted-foreground" data-selection-state="omitted">{L.selectionOmitted}</p>;
  const sections = summary.sections
    .map((s) => ({ ...s, groups: visibleGroups(s.groups, range, summary.inventoryRecorded) }))
    .filter((s) => s.groups.length > 0);
  return (
    <div class="grid min-h-0 content-start gap-4 overflow-y-auto pr-1" data-selection-history="">
      {summary.scenes.length ? (
        <section class="grid gap-1.5" aria-label={L.selectionScenes}>
          <Heading>{L.selectionScenes}</Heading>
          <ul class="grid gap-1">
            {summary.scenes.map((scene) => (
              <li key={scene.key} class="flex items-center gap-2 rounded-sm bg-surface-prompt-field px-2 py-1.5 text-2xs" data-selection-scene={scene.id || "free"}>
                <span class="min-w-0 flex-1 truncate font-bold">{scene.scope}</span>
                {scene.id ? <span class="truncate font-mono">{scene.id}</span> : null}
                <span class={cn("rounded-sm px-1.5 text-3xs font-black", scene.id ? "bg-primary/18 text-primary" : "bg-surface-badge text-muted-foreground")} title={scene.id ? undefined : L.selectionFreeTitle}>
                  {scene.id ? L.selectionDefined : L.selectionFree}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section class="grid gap-1.5" aria-label={L.selectionInteractions}>
        <Heading count={summary.interactions.length}>{L.selectionInteractions}</Heading>
        {summary.interactions.length === 0 ? <p class="text-2xs text-muted-foreground" data-selection-interactions="empty">{L.selectionNoInteractions}</p> : (
          <ul class="grid gap-2">
            {summary.interactions.map((item) => (
              <li key={item.key} class="grid gap-1 rounded-md border border-border p-2" data-selection-interaction={item.id}>
                <div class="flex flex-wrap items-center gap-1.5 text-2xs">
                  <span class="font-mono font-bold">{item.id}</span>
                  <span class="text-muted-foreground">{item.source} {item.mutual ? "↔" : "→"} {item.target}</span>
                  {item.mutual ? <span class="text-3xs text-muted-foreground">({L.selectionMutual})</span> : null}
                  {!item.complete ? <span class="rounded-sm bg-warning/20 px-1 text-3xs font-bold" data-selection-incomplete="">{L.selectionIncomplete}</span> : null}
                </div>
                {item.panels.length ? <span class="text-3xs text-muted-foreground">{fill(L.selectionPanels, { list: item.panels.join(", ") })}</span> : null}
                {item.groups.length ? (
                  <div class="grid gap-1">
                    <span class="text-3xs font-bold text-muted-foreground">{L.selectionDetails}</span>
                    <GroupChips groups={item.groups} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section class="grid gap-1.5" aria-label={L.selectionElements}>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <Heading>{L.selectionElements}</Heading>
          <div role="radiogroup" aria-label={L.selectionRange} class="inline-flex rounded-md bg-surface-control p-0.5">
            {(["recorded", "all"] as SelectionRange[]).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={range === value}
                class={cn("rounded-sm px-2 py-0.5 text-3xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring/55", range === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
                onClick={() => setRange(value)}
                data-selection-range={value}
              >
                {value === "recorded" ? L.selectionRecorded : L.selectionAll}
              </button>
            ))}
          </div>
        </div>
        <p class="text-3xs leading-relaxed text-muted-foreground">{L.selectionRangeNote}</p>
        {sections.length === 0 ? <p class="text-2xs text-muted-foreground" data-selection-elements="empty">{L.selectionNoElements}</p> : sections.map((section) => (
          <div key={section.key} class="grid gap-1" data-selection-section={section.key}>
            <h4 class="text-2xs font-extrabold">{section.title}</h4>
            <GroupChips groups={section.groups} />
          </div>
        ))}
      </section>
    </div>
  );
}
