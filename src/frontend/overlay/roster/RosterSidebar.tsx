/**
 * Roster sidebar (AM `lct` 102154-103025): views characters (Roster) / lorebooks + custom (Register people) /
 * modules (Load modules), search + layout toggle + display filter, bulk register/activate, sections
 * (thumbnail / description / no thumbnail / custom manual / AI generated) and the footer tabs.
 */
import { useMemo, useState } from "preact/hooks";
import type { RosterItem, RosterSource, WorkspaceSnapshot } from "../../../shared/contract/rpc.js";
import { matchesQuery } from "../../lib/text-match.js";
import { useApp, useAppState } from "../../state/app-state.js";
import { FilterPopover, SearchField, matchFlag, useFilteredList, type FilterGroup, type FilterValues } from "../shell/filters.js";
import { ArrowLeftIcon, Button, GridIcon, IconButton, ListIcon, PackageIcon, PlusIcon, UserPlusIcon, UsersIcon, cn } from "../ui/index.js";
import { useSourceUi, useWorkspaceUi, useWorkspaceUiStore, type NavigationView } from "../workspace-ui.js";
import { RosterCard, RosterRow, type RosterItemProps } from "./items.js";
import { ROSTER_LABELS as L } from "./labels.js";

type Origin = "lorebook" | "module" | "custom" | "ai-auto";

export function rosterOrigin(item: RosterItem, sources: RosterSource[]): Origin {
  if (item.kind === "custom") return item.origin === "ai-auto" ? "ai-auto" : "custom";
  const source = sources.find((s) => s.worldBookId === item.worldBookId);
  return source && !source.attached ? "module" : "lorebook";
}

/** Selection meaning of a view (AM: roster = active, registration views = registered). */
export function isSelected(item: RosterItem, view: NavigationView): boolean {
  return view === "characters" ? item.workspaceEnabled : item.registered;
}

export function itemsForView(snapshot: WorkspaceSnapshot, view: NavigationView): RosterItem[] {
  switch (view) {
    case "characters":
      return snapshot.roster.filter((item) => item.registered);
    case "lorebooks":
      return snapshot.roster.filter((item) => item.kind !== "custom");
    case "custom":
      return snapshot.roster.filter((item) => item.kind === "custom");
    default:
      return [];
  }
}

function filterGroups(view: NavigationView): FilterGroup[] {
  if (view === "characters") {
    return [
      { id: "selected", label: L.filterActive, yes: L.filterActive, no: L.filterInactive },
      {
        id: "origin",
        label: L.filterSource,
        options: [
          { id: "all", label: L.originAll },
          { id: "lorebook", label: L.originLorebook },
          { id: "module", label: L.originModule },
          { id: "custom", label: L.originCustom },
          { id: "ai-auto", label: L.originAi }
        ]
      }
    ];
  }
  return [{ id: "selected", label: L.filterRegistered, yes: L.filterRegistered, no: L.filterUnregistered }];
}

type Section = { id: string; items: RosterItem[]; badge?: string };

/** Section split (AM `fhe` 100821). */
export function rosterSections(items: RosterItem[], view: NavigationView): Section[] {
  const lore = items.filter((i) => i.kind !== "custom");
  const custom = items.filter((i) => i.kind === "custom");
  const thumb = (i: RosterItem) => !!(i as RosterItem & { thumbnailUrl?: string | null }).thumbnailUrl;
  const sections: Section[] = [];
  if (view !== "custom") {
    sections.push({ id: "withThumbnail", items: lore.filter((i) => i.kind === "lore" && thumb(i)) });
    sections.push({ id: "characterDescription", items: lore.filter((i) => i.kind === "description"), badge: L.descriptionBadge });
    sections.push({ id: "withoutThumbnail", items: lore.filter((i) => i.kind === "lore" && !thumb(i)) });
  }
  if (view !== "lorebooks") {
    const manual = custom.filter((i) => i.origin !== "ai-auto");
    const ai = custom.filter((i) => i.origin === "ai-auto");
    sections.push({ id: "customWithThumbnail", items: manual.filter(thumb) });
    sections.push({ id: "customWithoutThumbnail", items: manual.filter((i) => !thumb(i)) });
    sections.push({ id: "aiWithThumbnail", items: ai.filter(thumb), badge: L.aiGenerated });
    sections.push({ id: "aiWithoutThumbnail", items: ai.filter((i) => !thumb(i)), badge: L.aiGenerated });
  }
  return sections.filter((s) => s.items.length > 0);
}

function bulkLabel(view: NavigationView, allSelected: boolean, filterActive: boolean, query: boolean): string {
  if (view === "characters") {
    if (allSelected) return filterActive ? L.deactivateShown : query ? L.deactivateSearch : L.deactivateAll;
    return filterActive ? L.activateShown : query ? L.activateSearch : L.activateAll;
  }
  if (allSelected) return filterActive ? L.unregisterShown : query ? L.unregisterSearch : L.unregisterAll;
  return filterActive ? L.registerShown : query ? L.registerSearch : L.registerAll;
}

export function RosterSidebar({ referenceMode = false }: { referenceMode?: boolean }) {
  const app = useApp();
  const ui = useWorkspaceUiStore();
  const characterId = useAppState((s) => s.selectedCharacterId);
  const snapshot = useAppState((s) => s.workspace);
  const workspaceState = useAppState((s) => s.workspaceState);
  const sourceUi = useSourceUi(characterId);
  const layout = useWorkspaceUi((w) => w.navigationLayout);
  const view = sourceUi.navigationView;
  const scope = `roster:${view}`;
  const query = sourceUi.search[scope] ?? "";
  const values: FilterValues = sourceUi.filters[scope] ?? {};
  const [pending, setPending] = useState<Set<string>>(new Set());
  const ready = !!snapshot && snapshot.characterId === characterId;

  const setView = (next: NavigationView) => {
    ui.updateSource(characterId, next === "lorebooks" || next === "custom" ? { navigationView: next, lastRegistrationView: next } : { navigationView: next });
  };

  const viewItems = useMemo(() => (ready ? itemsForView(snapshot!, view) : []), [snapshot, view, ready]);
  const { visible, refresh } = useFilteredList({
    items: viewItems,
    id: (item) => item.promptKey,
    query,
    queryFields: (item) => [item.title, ...item.keys, ...item.recognitionKeys],
    values,
    match: (item, v) => matchFlag(v.selected, isSelected(item, view)) && (!v.origin || v.origin === "all" || rosterOrigin(item, snapshot?.sources ?? []) === v.origin),
    scopeKey: `${characterId}:${view}`
  });
  const filterActive = Object.values(values).some((v) => v && v !== "all");
  const selectedCount = viewItems.filter((item) => isSelected(item, view)).length;

  async function run(keys: string[], action: () => Promise<unknown>): Promise<void> {
    setPending((p) => new Set([...p, ...keys]));
    try {
      await action();
    } finally {
      setPending((p) => {
        const next = new Set(p);
        for (const key of keys) next.delete(key);
        return next;
      });
    }
  }

  /** Toggles a set of items to `value` in the current view (lore rows and custom rows go to different methods). */
  async function setItems(items: RosterItem[], value: boolean, mode: "active" | "registered" = view === "characters" ? "active" : "registered"): Promise<void> {
    if (!characterId || items.length === 0) return;
    const lore = items.filter((i) => i.kind !== "custom").map((i) => ({ memberKey: i.memberKey, selectionId: i.selectionId }));
    const custom = items.filter((i) => i.kind === "custom").map((i) => i.selectionId);
    await run(items.map((i) => i.promptKey), async () => {
      if (lore.length) await app.mutateWorkspace(mode === "active" ? "roster.setActive" : "roster.setRegistered", mode === "active" ? { characterId, items: lore, active: value } : { characterId, items: lore, registered: value } as never);
      if (custom.length) {
        if (mode === "active") await app.mutateWorkspace("customCharacters.setWorkspaceEnabled", { characterId, customIds: custom, enabled: value });
        else await app.mutateWorkspace("customCharacters.setRosterRegistered", { characterId, customIds: custom, registered: value });
      }
    });
  }

  const openInfo = (item: RosterItem) => ui.updateSource(characterId, (s) => ({ infoPromptKey: s.infoPromptKey === item.promptKey ? null : item.promptKey }));
  const openEditor = (customId?: string) => ui.runGuarded(() => ui.updateSource(characterId, { editor: customId ? { mode: "edit", customId } : { mode: "create" }, infoPromptKey: null, navigationView: "lorebooks" }));

  function itemProps(item: RosterItem, badge?: string): RosterItemProps {
    const custom = item.kind === "custom";
    return {
      dataKey: item.promptKey,
      title: item.title,
      selected: referenceMode ? sourceUi.infoPromptKey === item.promptKey : isSelected(item, view),
      pending: pending.has(item.promptKey),
      referenceMode,
      badge,
      thumbnailUrl: (item as RosterItem & { thumbnailUrl?: string | null }).thumbnailUrl ?? null,
      customId: custom ? item.selectionId : undefined,
      onToggle: () => (referenceMode ? openInfo(item) : void setItems([item], !isSelected(item, view)).catch(() => undefined)),
      onInfo: () => openInfo(item),
      ...(custom
        ? {
            onEdit: () => openEditor(item.selectionId),
            onPromote: item.origin === "ai-auto" ? () => void app.mutateWorkspace("customCharacters.promote", { characterId: characterId!, customIds: [item.selectionId] }).catch(() => undefined) : undefined,
            onDelete: async () => {
              await app.mutateWorkspace("customCharacters.remove", { characterId: characterId!, customId: item.selectionId });
            }
          }
        : {}),
      onDeselect: view === "characters" && !referenceMode ? () => setItems([item], false, "registered") : undefined
    };
  }

  const sections = rosterSections(visible, view);
  const grid = layout === "grid";
  const bulkItems = visible;
  const bulkAllSelected = bulkItems.length > 0 && bulkItems.every((item) => isSelected(item, view));

  const title = referenceMode ? L.references : view === "characters" ? L.roster : view === "modules" ? L.loadModules : L.registerPeople;
  const badge = view === "modules" ? null : view === "characters" ? L.active(selectedCount) : L.registered(selectedCount);

  let body;
  if (!characterId) {
    body = <p class="px-3 py-6 text-center text-xs text-muted-foreground">{L.noCharacter}</p>;
  } else if (!ready) {
    body = (
      <div class="grid grid-cols-3 gap-2 p-3" aria-busy="true" aria-label={L.loading} data-roster-loading="">
        <span class="sr-only">{L.loading}</span>
        {Array.from({ length: 6 }, (_, i) => <div key={i} class="aspect-lorebook-thumbnail animate-pulse rounded-md bg-surface-workbench" />)}
      </div>
    );
    if (workspaceState === "error") body = <p class="px-3 py-6 text-center text-xs text-destructive" role="alert">{app.state.workspaceError?.message}</p>;
  } else if (view === "modules") {
    body = <ModulesView snapshot={snapshot!} query={query} />;
  } else if (sections.length === 0) {
    const text = query || filterActive ? L.emptyFiltered : view === "custom" ? L.emptyCustom : view === "characters" ? L.emptyCharacters : L.emptyLorebooks;
    body = <p class="px-3 py-6 text-center text-xs text-muted-foreground" data-roster-empty="">{text}</p>;
  } else {
    body = (
      <div class="grid gap-3 px-2.5 pb-4">
        {sections.map((section) => {
          const cards = grid && /^withThumbnail$|WithThumbnail$/u.test(section.id);
          return (
            <section key={section.id} data-roster-section={section.id} {...(section.id.startsWith("custom") || section.id.startsWith("ai") ? { "data-roster-custom-section": "" } : {})}>
              <div class={cn(cards ? "grid grid-cols-3 gap-1.5 max-md:grid-cols-2" : grid ? "grid grid-cols-2 gap-1.5" : "grid gap-0.5")}>
                {section.items.map((item) => (cards
                  ? <RosterCard key={item.promptKey} {...itemProps(item, section.badge)} />
                  : <RosterRow key={item.promptKey} tile={grid} {...itemProps(item, section.badge)} />))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div class="flex h-full min-h-0 flex-col" data-roster-sidebar={view}>
      <header class="grid shrink-0 grid-cols-[minmax(0,1fr)] gap-2 px-2.5 pt-3 pb-2">
        <div class="flex min-h-7 items-center gap-2 px-0.5">
          {view === "modules" ? <IconButton label={L.backToLorebooks} size="sm" className="w-7 px-0" onClick={() => setView("lorebooks")}><ArrowLeftIcon /></IconButton> : null}
          <h2 class="min-w-0 truncate text-xs font-extrabold">{snapshot?.characterName ?? L.roster}</h2>
        </div>
        {(view === "lorebooks" || view === "custom") && !referenceMode ? (
          <nav aria-label={L.registrationMethod}>
            <div role="tablist" class="grid grid-cols-2 gap-1 rounded-md bg-secondary p-0.5">
              {(["lorebooks", "custom"] as const).map((id) => (
                <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
                  class={cn("h-7 rounded-[5px] text-2xs font-bold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-9", view === id && "bg-surface-navigation-selected text-selected-foreground")}>
                  {id === "lorebooks" ? L.lorebook : L.custom}
                </button>
              ))}
            </div>
          </nav>
        ) : null}
        <div class="flex items-center gap-1">
          <SearchField
            className="flex-1"
            label={view === "modules" ? L.moduleSearch : L.sidebarSearch}
            placeholder={view === "modules" ? L.moduleSearchPlaceholder : undefined}
            value={query}
            onChange={(q) => ui.setSearch(characterId, scope, q)}
          />
          {view !== "modules" ? (
            <IconButton label={grid ? L.listView : L.gridView} onClick={() => ui.updateGlobal({ navigationLayout: grid ? "list" : "grid" })}>{grid ? <ListIcon /> : <GridIcon />}</IconButton>
          ) : null}
          {view !== "modules" ? (
            <FilterPopover
              label={L.sidebarFilter}
              groups={filterGroups(view)}
              values={values}
              onChange={(group, value) => ui.setFilter(characterId, scope, { ...values, [group]: value })}
              onReset={() => ui.setFilter(characterId, scope, {})}
              onRefresh={refresh}
            />
          ) : null}
        </div>
        <div class="flex min-h-7 items-center gap-1.5 px-0.5">
          <span class="truncate text-2xs font-black text-muted-foreground uppercase">{title}</span>
          {badge ? <span class="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-3xs font-bold text-muted-foreground tabular-nums" data-roster-count="">{badge}</span> : null}
        </div>
        {!referenceMode && ready && view !== "modules" ? (
          <div class="flex flex-wrap items-center justify-between gap-1" data-roster-collection-header="">
            {view === "custom" ? <Button size="sm" variant="ghost" className="px-1.5" onClick={() => openEditor()}><PlusIcon />{L.addPerson}</Button> : null}
            {view === "lorebooks" ? <Button size="sm" variant="ghost" className="px-1.5" onClick={() => setView("modules")}><PackageIcon />{L.loadModules}</Button> : null}
            {bulkItems.length > 0 ? (
              <Button size="sm" variant="ghost" className="ml-auto px-1.5" data-roster-bulk="" disabled={pending.size > 0} onClick={() => void setItems(bulkItems, !bulkAllSelected).catch(() => undefined)}>
                {bulkLabel(view, bulkAllSelected, filterActive, query.trim() !== "")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto" data-roster-scroll="">{body}</div>
      {!referenceMode ? (
        <footer class="shrink-0 border-t border-border p-2">
          <div role="tablist" aria-label={L.characterTasks} class="grid grid-cols-2 gap-1">
            <button type="button" role="tab" aria-selected={view === "characters"} onClick={() => setView("characters")}
              class={cn("flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-bold text-muted-foreground outline-none hover:bg-surface-navigation-hover focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-11", view === "characters" && "bg-surface-navigation-selected text-selected-foreground")}>
              <UsersIcon />{L.roster}
            </button>
            <button type="button" role="tab" aria-selected={view !== "characters"} onClick={() => setView(sourceUi.lastRegistrationView)}
              class={cn("flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-bold text-muted-foreground outline-none hover:bg-surface-navigation-hover focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-11", view !== "characters" && "bg-surface-navigation-selected text-selected-foreground")}>
              <UserPlusIcon />{L.registerPeople}
            </button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

/** Module badge (AM `Yst`). */
function metaBadge(source: RosterSource): { label: string; tone: string } {
  switch (source.metadata) {
    case "available":
      return { label: L.metaPresent, tone: "text-success bg-success/14" };
    case "partial":
      return { label: L.metaPartial, tone: "text-warning bg-warning/14" };
    case "none":
      return { label: L.metaNone, tone: "text-destructive bg-destructive/14" };
    default:
      return { label: L.metaUnanalyzed, tone: "text-muted-foreground bg-secondary" };
  }
}

/** Modules view (AM `ict`): extra world books connectable as roster sources. */
function ModulesView({ snapshot, query }: { snapshot: WorkspaceSnapshot; query: string }) {
  const app = useApp();
  const [pending, setPending] = useState<string | null>(null);
  const modules = snapshot.sources.filter((s) => matchesQuery(query, [s.name]));
  if (snapshot.sources.length === 0) return <p class="px-3 py-6 text-center text-xs text-muted-foreground">{L.emptyModules}</p>;
  if (modules.length === 0) return <p class="px-3 py-6 text-center text-xs text-muted-foreground">{L.emptyModulesSearch}</p>;
  return (
    <div class="grid gap-1 px-2.5 pb-4">
      {modules.map((source) => {
        const active = source.connected;
        const badge = metaBadge(source);
        return (
          <div key={source.worldBookId} class={cn("relative grid gap-1 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-navigation-hover", active && "bg-surface-navigation-selected ring-1 ring-inset ring-primary")} data-module-id={source.worldBookId}>
            <button
              type="button"
              class="absolute inset-0 z-10 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-default"
              aria-label={source.attached ? `${source.name} · ${L.moduleAttached}` : active ? L.moduleDisconnect(source.name) : L.moduleLoad(source.name)}
              aria-pressed={active}
              aria-busy={pending === source.worldBookId}
              disabled={source.attached || pending !== null}
              onClick={async () => {
                setPending(source.worldBookId);
                try {
                  await app.mutateWorkspace("roster.setSourceConnected", { characterId: snapshot.characterId, worldBookId: source.worldBookId, connected: !active });
                } catch {
                  /* toast shown */
                } finally {
                  setPending(null);
                }
              }}
            />
            <strong class="truncate pr-16 text-xs font-bold">{source.name}</strong>
            <span class="text-2xs text-muted-foreground">{source.attached ? L.moduleAttached : L.moduleCounts(source.entryCount, source.assetCount)}</span>
            <span class={cn("absolute top-2.5 right-3 rounded-full px-1.5 py-0.5 text-3xs font-bold", badge.tone)}>{badge.label}</span>
          </div>
        );
      })}
    </div>
  );
}
