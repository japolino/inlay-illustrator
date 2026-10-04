/**
 * Assets tab (AM `uvt` 133715 list, `avt` 133315 CharX row, `ivt` 133484 persona row, `pve` 133270 thumbnail,
 * `ovt` 133231 view tabs, `$It` 153952 dock, bulk controls `lvt`/`dvt`/`svt`/`cvt`, metadata control `Tvt` 134685).
 */
import { useMemo, useState } from "preact/hooks";
import { personaPromptKey, type AssetRef } from "../../../shared/contract/character.js";
import type { PersonaSummary, RosterItem } from "../../../shared/contract/rpc.js";
import { useAppState } from "../../state/app-state.js";
import { FilterPopover, SearchField, useFilteredList, type FilterValues } from "../shell/filters.js";
import { DockLayout } from "../shell/dock.js";
import { Button, IconButton, PlusIcon, XIcon, cn } from "../ui/index.js";
import { useWorkspaceCtx, type WorkspaceCtx } from "./context.js";
import { usePersonas, writeSelection } from "./data.js";
import { ImagePlusIcon, RotateCcwIcon, SparklesIcon, ZoomInIcon } from "./icons.js";
import { ASSETS_LABELS } from "./labels/assets.js";
import { COMMON_LABELS } from "./labels/common.js";
import { MetadataBadge } from "./metadata.js";
import { useAnalysisJobs, useRowNotice, useRunningJob } from "./notices.js";
import {
  FILTER_GROUPS,
  characterCollection,
  hasEmptyForm,
  isRosterActive,
  isUnanalyzed,
  matchesFilters,
  personaDisplayName,
  registeredRows,
  rosterOrigin,
  selectedAssets,
  triState
} from "./model.js";
import { openPicker } from "./picker.js";
import { AssetImage, AssetViewer, Badge, CommandButton, EmptyCard, EvidenceToggle, LabeledCheckbox, Spinner, WorkbenchRow } from "./parts.js";
import { ExclusionButton, RosterToggle } from "./roster-actions.js";

export const SEARCH_SCOPE_CHARX = "charx";
export const SEARCH_SCOPE_PERSONA = "persona";

function filterScope(view: "charx" | "persona"): string {
  return `assets:${view}`;
}

/* ------------------------------------------------------------------------------------------------
 * Header end: view tabs + search
 * ---------------------------------------------------------------------------------------------- */

export function AssetsHeaderEnd() {
  const { ui, characterId, sourceUi, session, sessions } = useWorkspaceCtx();
  const view = session.assetsView;
  const scope = view === "persona" ? SEARCH_SCOPE_PERSONA : SEARCH_SCOPE_CHARX;
  return (
    <>
      <div role="tablist" aria-label={ASSETS_LABELS.viewTabs} class="inline-flex h-8 items-center rounded-md bg-surface-control p-0.5 max-md:h-11" data-assets-view="">
        {(["charx", "persona"] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => sessions.update(characterId, { assetsView: id })}
            class={cn("h-7 rounded px-2.5 text-2xs font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-10", view === id && "bg-selected text-selected-foreground")}>
            {id === "charx" ? ASSETS_LABELS.viewCharx : ASSETS_LABELS.viewPersona}
          </button>
        ))}
      </div>
      <SearchField className="w-56 mobile:w-32" value={sourceUi.search[scope] ?? ""} onChange={(q) => ui.setSearch(characterId, scope, q)} label={view === "persona" ? ASSETS_LABELS.searchPersona : ASSETS_LABELS.searchCharx} />
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Thumbnail strip
 * ---------------------------------------------------------------------------------------------- */

function Thumb({ asset, onRemove, onZoom, priority, hasMetadata, characterId }: { asset: AssetRef; onRemove: () => void; onZoom: () => void; priority: boolean; hasMetadata?: boolean; characterId: string | null }) {
  return (
    <div class="group/thumb relative h-51 w-36 shrink-0 overflow-hidden rounded-md bg-surface-control" data-asset-thumb="">
      <button type="button" class="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/55" aria-label={COMMON_LABELS.zoomOf(asset.name)} title={COMMON_LABELS.zoomImage} onClick={onZoom}>
        <AssetImage asset={asset} alt="" className={priority ? "" : undefined} />
      </button>
      <IconButton size="icon" label={ASSETS_LABELS.removeAssetOf(asset.name)} title={ASSETS_LABELS.removeAsset} onClick={onRemove}
        className="absolute top-1 right-1 size-7 bg-background/70 text-foreground opacity-0 group-hover/thumb:opacity-100 focus-visible:opacity-100 hover:bg-background/90 mobile:opacity-100">
        <XIcon />
      </IconButton>
      {hasMetadata !== undefined ? <span class="absolute right-1 bottom-1"><MetadataBadge asset={asset} hasMetadata={hasMetadata} characterId={characterId} /></span> : null}
    </div>
  );
}

function ThumbStrip({ assets, onRemove, characterId, metadata }: { assets: AssetRef[]; onRemove: (asset: AssetRef) => void; characterId: string | null; metadata: Record<string, string> }) {
  const [zoom, setZoom] = useState<AssetRef | null>(null);
  return (
    <>
      <div class="scrollbar-none flex h-full min-w-0 items-start gap-2 overflow-x-auto overscroll-x-contain" data-asset-strip="">
        {assets.map((asset, i) => {
          const state = metadata[asset.name];
          return <Thumb key={`${asset.key}|${asset.name}`} asset={asset} priority={i < 4} characterId={characterId} onRemove={() => onRemove(asset)} onZoom={() => setZoom(asset)}
            hasMetadata={state === "available" ? true : state === "none" ? false : undefined} />;
        })}
      </div>
      <AssetViewer asset={zoom} onClose={() => setZoom(null)} />
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Rows
 * ---------------------------------------------------------------------------------------------- */

function CharxRow({ ctx, item, hidden }: { ctx: WorkspaceCtx; item: RosterItem; hidden: boolean }) {
  const { app, characterId, workspace, sourceUi, ui } = ctx;
  const assets = selectedAssets(workspace?.document, item.promptKey);
  const notice = useRowNotice(characterId, item.promptKey);
  const active = sourceUi.secondaryOpen && sourceUi.secondaryMode === "asset-picker" && sourceUi.pickerTarget?.kind === "selection" && sourceUi.pickerTarget.promptKey === item.promptKey;
  return (
    <WorkbenchRow
      hidden={hidden}
      active={active}
      data-prompt-key={item.promptKey}
      title={<span class={cn(!isRosterActive(item) && "text-muted-foreground")}>{item.title}</span>}
      exclusionAction={<ExclusionButton ctx={ctx} item={item} />}
      titleStart={<RosterToggle ctx={ctx} item={item} />}
      titleEnd={item.origin === "ai-auto" ? <Badge tone="primary">{COMMON_LABELS.aiGenerated}</Badge> : undefined}
      status={notice?.status === "success" ? (
        <Button size="sm" variant="ghost" className="text-success" onClick={() => ui.updateSource(characterId, { activeTab: "prompts", activePromptKey: item.promptKey, secondaryOpen: false })}>{ASSETS_LABELS.analysisDone}</Button>
      ) : notice?.status === "no_evidence" ? <span role="status" class="text-2xs font-bold text-warning">{ASSETS_LABELS.noEvidence}</span> : null}
      actions={
        <>
          <IconButton variant="subtle" size="workbenchIcon" label={ASSETS_LABELS.addNextOf(item.title)} title={ASSETS_LABELS.addNext}
            onClick={() => characterId && void app.startAnalysis({ kind: "representative-pick", characterId, promptKeys: [item.promptKey] })}>
            <ImagePlusIcon />
          </IconButton>
          <IconButton variant="subtle" size="workbenchIcon" label={ASSETS_LABELS.clearRowOf(item.title)} title={ASSETS_LABELS.clearRow} disabled={!assets.length}
            onClick={() => characterId && void writeSelection(app, characterId, item.promptKey, [])}>
            <RotateCcwIcon />
          </IconButton>
          <LabeledCheckbox label={COMMON_LABELS.analyze} background="control" checked={item.analyzeEnabled}
            onCheckedChange={(v) => characterId && void app.mutateWorkspace("prompts.setAnalyzeEnabled", { characterId, promptKeys: [item.promptKey], enabled: v }).catch(() => undefined)} />
          <IconButton variant={active ? "default" : "subtle"} size="workbenchIcon" label={ASSETS_LABELS.selectAssetsOf(item.title)} title={ASSETS_LABELS.selectAssets}
            onClick={() => (active ? ui.closeSecondary(characterId) : openPicker(ctx, { kind: "selection", promptKey: item.promptKey }, item.promptKey))}>
            <PlusIcon />
          </IconButton>
        </>
      }
    >
      <ThumbStrip assets={assets} characterId={characterId} metadata={(workspace?.metadataAvailability ?? {}) as Record<string, string>}
        onRemove={(asset) => characterId && void writeSelection(app, characterId, item.promptKey, assets.filter((a) => a !== asset))} />
    </WorkbenchRow>
  );
}

function PersonaAssetRow({ ctx, persona, index, hidden, completed }: { ctx: WorkspaceCtx; persona: PersonaSummary; index: number; hidden: boolean; completed: boolean }) {
  const { app, characterId, workspace, session, sessions, sourceUi, ui } = ctx;
  const key = personaPromptKey(persona.personaId);
  const assets = selectedAssets(workspace?.document, key);
  const name = personaDisplayName(persona, index);
  const selected = session.personaSelection.includes(persona.personaId);
  const target = sourceUi.pickerTarget;
  const active = sourceUi.secondaryOpen && sourceUi.secondaryMode === "asset-picker" && target?.kind === "persona" && target.personaId === persona.personaId && !target.formId;
  return (
    <WorkbenchRow
      hidden={hidden}
      active={active}
      data-persona-id={persona.personaId}
      title={name}
      status={completed ? <Button size="sm" variant="ghost" className="text-success" onClick={() => ui.updateSource(characterId, { activeTab: "persona", activePersonaId: persona.personaId, secondaryOpen: false })}>{ASSETS_LABELS.analysisDone}</Button> : null}
      actions={
        <>
          <IconButton variant="subtle" size="workbenchIcon" label={ASSETS_LABELS.clearRowOf(name)} title={ASSETS_LABELS.clearPersonaRow} disabled={!assets.length}
            onClick={() => characterId && void writeSelection(app, characterId, key, [])}><RotateCcwIcon /></IconButton>
          <LabeledCheckbox label={COMMON_LABELS.analyze} background="control" checked={selected}
            onCheckedChange={(v) => sessions.update(characterId, (s) => ({ personaSelection: v ? [...new Set([...s.personaSelection, persona.personaId])] : s.personaSelection.filter((id) => id !== persona.personaId) }))} />
          <IconButton variant={active ? "default" : "subtle"} size="workbenchIcon" label={ASSETS_LABELS.selectAssetsOf(name)} title={ASSETS_LABELS.selectAssets} disabled={!characterId}
            onClick={() => (active ? ui.closeSecondary(characterId) : openPicker(ctx, { kind: "persona", personaId: persona.personaId }, undefined, persona.personaId))}><PlusIcon /></IconButton>
        </>
      }
    >
      {assets.length || !persona.avatarUrl ? (
        <ThumbStrip assets={assets} characterId={characterId} metadata={{}} onRemove={(asset) => characterId && void writeSelection(app, characterId, key, assets.filter((a) => a !== asset))} />
      ) : (
        <div class="h-51 w-36 overflow-hidden rounded-md opacity-60" title={name}><img src={persona.avatarUrl} alt="" class="size-full object-cover" /></div>
      )}
    </WorkbenchRow>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Content
 * ---------------------------------------------------------------------------------------------- */

export function AssetsContent() {
  const ctx = useWorkspaceCtx();
  const { app, characterId, workspace, sourceUi, session } = ctx;
  const workspaceState = useAppState((s) => s.workspaceState);
  const workspaceError = useAppState((s) => s.workspaceError);
  const { personas, loading: personasLoading } = usePersonas(app, characterId);
  const jobs = useAnalysisJobs(characterId);
  const view = session.assetsView;
  const query = sourceUi.search[view === "persona" ? SEARCH_SCOPE_PERSONA : SEARCH_SCOPE_CHARX] ?? "";
  const filters: FilterValues = sourceUi.filters[filterScope(view)] ?? {};
  const items = useMemo(() => registeredRows(workspace?.roster ?? []), [workspace]);
  const refresh = session.filterRefresh[filterScope(view)] ?? 0;
  const charx = useFilteredList({
    items,
    id: (i) => i.promptKey,
    query,
    queryFields: (i) => [i.title, ...i.keys],
    values: view === "charx" ? filters : {},
    match: (i, v) => matchesFilters({
      roster: isRosterActive(i),
      origin: rosterOrigin(i, workspace?.sources ?? []),
      assets: selectedAssets(workspace?.document, i.promptKey).length > 0,
      empty: hasEmptyForm(characterCollection(workspace?.document, i.promptKey)),
      checked: i.analyzeEnabled
    }, v),
    scopeKey: `${characterId}:charx:${refresh}`
  });
  const personaList = personas ?? [];
  const personaFiltered = useFilteredList({
    items: personaList,
    id: (p) => p.personaId,
    query,
    queryFields: (p) => [p.name],
    values: view === "persona" ? filters : {},
    match: (p, v) => matchesFilters({
      assets: selectedAssets(workspace?.document, personaPromptKey(p.personaId)).length > 0,
      empty: hasEmptyForm(p.forms),
      checked: session.personaSelection.includes(p.personaId)
    }, v),
    scopeKey: `${characterId}:persona:${refresh}`
  });
  const completedPersonas = new Set(jobs.filter((j) => j.kind === "persona" && j.status === "success").flatMap(() => personaList.map((p) => p.personaId)));

  if (!characterId) return <EmptyCard>{ASSETS_LABELS.noCharacter}</EmptyCard>;
  if (workspaceState === "error") return <EmptyCard tone="danger">{workspaceError?.message ?? ASSETS_LABELS.loadFailed}</EmptyCard>;
  if (!workspace) return <div class="grid place-items-center py-10"><Spinner className="size-6 text-muted-foreground" /></div>;
  const filtering = query.trim() !== "" || Object.values(filters).some((v) => v && v !== "all");

  if (view === "persona") {
    if (!personas) return personasLoading ? <div class="grid place-items-center py-10"><Spinner className="size-6 text-muted-foreground" /></div> : <EmptyCard>{ASSETS_LABELS.noPersona}</EmptyCard>;
    if (!personaList.length) return <EmptyCard>{query ? ASSETS_LABELS.noResults : ASSETS_LABELS.noPersona}</EmptyCard>;
    const visible = new Set(personaFiltered.visible.map((p) => p.personaId));
    return (
      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1" data-assets-list="persona">
        {filtering && visible.size === 0 ? <p class="py-6 text-center text-xs text-muted-foreground">{query ? ASSETS_LABELS.noResults : ASSETS_LABELS.noMatch}</p> : null}
        {personaList.map((p, i) => <PersonaAssetRow key={p.personaId} ctx={ctx} persona={p} index={i} hidden={!visible.has(p.personaId)} completed={completedPersonas.has(p.personaId)} />)}
      </div>
    );
  }
  if (!items.length) return <EmptyCard>{query ? ASSETS_LABELS.noResults : ASSETS_LABELS.noLorebook}</EmptyCard>;
  const visible = new Set(charx.visible.map((i) => i.promptKey));
  const ordered = [...items].sort((a, b) => Number(visible.has(b.promptKey)) - Number(visible.has(a.promptKey)));
  return (
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1" data-assets-list="charx">
      {filtering && visible.size === 0 ? <p class="py-6 text-center text-xs text-muted-foreground">{query ? ASSETS_LABELS.noResults : ASSETS_LABELS.noMatch}</p> : null}
      {ordered.map((item) => <CharxRow key={item.promptKey} ctx={ctx} item={item} hidden={!visible.has(item.promptKey)} />)}
    </div>
  );
}

/** Count badge of the Assets tab ("Selected N"). */
export function useAssetsCount(ctx: WorkspaceCtx, personaCount: number): number | undefined {
  if (!ctx.workspace) return undefined;
  return ctx.session.assetsView === "persona" ? personaCount : registeredRows(ctx.workspace.roster).length;
}

/* ------------------------------------------------------------------------------------------------
 * Dock
 * ---------------------------------------------------------------------------------------------- */

const META_STATE_LABEL: Record<string, string> = ASSETS_LABELS.meta as unknown as Record<string, string>;

function MetadataControl({ ctx, disabled }: { ctx: WorkspaceCtx; disabled: boolean }) {
  const { app, characterId, workspace } = ctx;
  const job = useRunningJob(characterId, ["metadata-check"]);
  const values = Object.values(workspace?.metadataAvailability ?? {});
  const state = values.length === 0 ? "unknown" : values.every((v) => v === "deleted") ? "deleted" : values.every((v) => v === "available") ? "available" : values.some((v) => v === "available") ? "partial" : "none";
  const label = META_STATE_LABEL[state] ?? ASSETS_LABELS.meta.unknown;
  const tone = state === "none" ? "text-destructive" : state === "partial" ? "text-warning" : state === "available" ? "text-success" : "text-muted-foreground";
  const button = job ? ASSETS_LABELS.meta.stop : state === "unknown" || state === "deleted" ? ASSETS_LABELS.meta.check : ASSETS_LABELS.meta.recheck;
  return (
    <div class="flex shrink-0 items-center gap-1" data-metadata-control="">
      <span class={cn("inline-flex h-6 items-center gap-1 rounded-full bg-surface-badge px-2 text-2xs font-bold", job ? "text-primary" : tone)} title={`${ASSETS_LABELS.meta.sourceName} · ${label}`}>
        {job ? ASSETS_LABELS.meta.checking : label}
        {state !== "unknown" && state !== "deleted" ? (
          <button type="button" class="grid size-4 place-items-center rounded-full hover:bg-white/10 disabled:opacity-45" aria-label={ASSETS_LABELS.meta.deleteRecord} title={ASSETS_LABELS.meta.deleteRecord} disabled={disabled || !!job}
            onClick={() => characterId && void app.call("assets.clearMetadataRecords", { characterId }).then(() => app.reloadWorkspace(), (e) => app.notifyError(e))}>
            <XIcon className="size-3" />
          </button>
        ) : null}
      </span>
      <Button size="sm" variant="commandAction" disabled={disabled && !job} onClick={() => (job ? void app.cancelAnalysis(job.jobId) : characterId && void app.startAnalysis({ kind: "metadata-check", characterId }))}>
        {job ? <Spinner /> : null}{button}
      </Button>
    </div>
  );
}

export function AssetsDock() {
  const ctx = useWorkspaceCtx();
  const { app, characterId, workspace, session, sessions, sourceUi, ui } = ctx;
  const { personas } = usePersonas(app, characterId);
  const view = session.assetsView;
  const evidence = session.evidence.assets;
  const running = useRunningJob(characterId, ["character-prompts", "persona"]);
  const items = registeredRows(workspace?.roster ?? []);
  const doc = workspace?.document;
  const scope = filterScope(view);
  const analyzable = items.filter((i) => isRosterActive(i) && i.analyzeEnabled);
  const anyAssets = items.some((i) => selectedAssets(doc, i.promptKey).length > 0);
  const unanalyzed = items.filter((i) => isUnanalyzed(characterCollection(doc, i.promptKey)));
  const personaList = personas ?? [];
  const unanalyzedPersonas = personaList.filter((p) => isUnanalyzed(p.forms));
  const count = view === "charx" ? analyzable.length : session.personaSelection.length;
  const busy = !!running;

  const setAnalyze = (keys: string[], enabled: boolean) => characterId && keys.length && void app.mutateWorkspace("prompts.setAnalyzeEnabled", { characterId, promptKeys: keys, enabled }).catch(() => undefined);
  const run = () => {
    if (running) {
      void app.cancelAnalysis(running.jobId);
      return;
    }
    if (!characterId) return;
    if (view === "charx") void app.startAnalysis({ kind: "character-prompts", characterId, evidenceMode: evidence, promptKeys: analyzable.map((i) => i.promptKey) });
    else void app.startAnalysis({ kind: "persona", characterId, evidenceMode: evidence, personaIds: session.personaSelection });
  };

  const leading = (
    <>
      {view === "charx" ? (
        <>
          <IconButton variant="commandAction" size="command" label={ASSETS_LABELS.autoPick} title={ASSETS_LABELS.autoPickTitle} disabled={!characterId || !items.length}
            onClick={() => characterId && void app.startAnalysis({ kind: "representative-pick", characterId, promptKeys: items.filter(isRosterActive).map((i) => i.promptKey) })}><ImagePlusIcon /></IconButton>
          <IconButton variant="commandAction" size="command" label={ASSETS_LABELS.clearAll} title={ASSETS_LABELS.clearAllTitle} disabled={!anyAssets}
            onClick={() => characterId && void app.call("assets.clearSelections", { characterId, promptKeys: items.map((i) => i.promptKey) }).then(() => app.reloadWorkspace(), (e) => app.notifyError(e))}><RotateCcwIcon /></IconButton>
        </>
      ) : null}
      <FilterPopover
        compact={false}
        label={ASSETS_LABELS.filter}
        groups={view === "charx" ? FILTER_GROUPS.assetsCharx : FILTER_GROUPS.assetsPersona}
        values={sourceUi.filters[scope] ?? {}}
        onChange={(group, value) => ui.setFilter(characterId, scope, { ...(sourceUi.filters[scope] ?? {}), [group]: value })}
        onReset={() => ui.setFilter(characterId, scope, {})}
        onRefresh={() => sessions.bumpFilter(characterId, scope)}
      />
    </>
  );
  const controls = (
    <>
      {view === "charx" && evidence === "metadata" ? <MetadataControl ctx={ctx} disabled={busy || !characterId} /> : null}
      <EvidenceToggle value={evidence} onChange={(mode) => sessions.update(characterId, (s) => ({ evidence: { ...s.evidence, assets: mode } }))} disabled={busy} />
      {view === "charx" ? (
        <>
          <span title={ASSETS_LABELS.selectUnanalyzedCharsTitle(unanalyzed.length)}>
            <Button size="sm" variant="ghost" aria-label={ASSETS_LABELS.selectUnanalyzedChars} disabled={!unanalyzed.length}
              onClick={() => {
                const un = new Set(unanalyzed.map((i) => i.promptKey));
                setAnalyze(items.filter((i) => un.has(i.promptKey)).map((i) => i.promptKey), true);
                setAnalyze(items.filter((i) => !un.has(i.promptKey)).map((i) => i.promptKey), false);
              }}>
              <span class="mobile:hidden">{ASSETS_LABELS.selectUnanalyzed}</span><span class="hidden mobile:inline">{ASSETS_LABELS.unanalyzedShort}</span>
            </Button>
          </span>
          <LabeledCheckbox label={COMMON_LABELS.analyze} disabled={!items.length} checked={triState(items.map((i) => i.analyzeEnabled))} onCheckedChange={(v) => setAnalyze(items.map((i) => i.promptKey), v)} />
        </>
      ) : (
        <>
          <span title={ASSETS_LABELS.selectUnanalyzedPersonasTitle(unanalyzedPersonas.length)}>
            <Button size="sm" variant="ghost" aria-label={ASSETS_LABELS.selectUnanalyzedPersonas} disabled={!unanalyzedPersonas.length}
              onClick={() => sessions.update(characterId, { personaSelection: unanalyzedPersonas.map((p) => p.personaId) })}>
              <span class="mobile:hidden">{ASSETS_LABELS.selectUnanalyzed}</span><span class="hidden mobile:inline">{ASSETS_LABELS.unanalyzedShort}</span>
            </Button>
          </span>
          <LabeledCheckbox label={COMMON_LABELS.analyze} disabled={!personaList.length} checked={triState(personaList.map((p) => session.personaSelection.includes(p.personaId)))}
            onCheckedChange={(v) => sessions.update(characterId, { personaSelection: v ? personaList.map((p) => p.personaId) : [] })} />
        </>
      )}
    </>
  );
  const trailing = (
    <CommandButton
      running={busy}
      label={view === "charx" ? ASSETS_LABELS.analyzeCharx : ASSETS_LABELS.analyzePersona}
      stopLabel={ASSETS_LABELS.stopAnalysis}
      title={view === "charx" ? ASSETS_LABELS.analyzeCharxTitle : ASSETS_LABELS.analyzePersonaTitle}
      disabled={!busy && (!characterId || count === 0)}
      onClick={run}
      icon={<SparklesIcon className="text-primary" />}
    />
  );
  return <DockLayout leading={leading} controls={controls} trailing={trailing} />;
}
