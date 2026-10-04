/**
 * Prompts tab (AM `Cct` 104296 list, `Pct` 103997 row, `BIt` 154107 dock -> `wpe` 97197).
 * Rows edit the form collection draft of each registered person; "Save prompts" saves every dirty draft.
 */
import { useMemo } from "preact/hooks";
import type { RosterItem } from "../../../shared/contract/rpc.js";
import { useAppState } from "../../state/app-state.js";
import { FilterPopover, SearchField, useFilteredList, type FilterValues } from "../shell/filters.js";
import { DockLayout } from "../shell/dock.js";
import { IconButton } from "../ui/index.js";
import { useWorkspaceCtx, type WorkspaceCtx } from "./context.js";
import { formSaver } from "./data.js";
import { draftKeyForCharacter, useDraftsSummary } from "./drafts.js";
import { BadgeCheckIcon, ShirtIcon, ShuffleIcon, SparklesIcon } from "./icons.js";
import { COMMON_LABELS, FORM_LABELS, GENDER_LABELS } from "./labels/common.js";
import { PROMPTS_LABELS } from "./labels/prompts.js";
import { FILTER_GROUPS, characterCollection, findForm, formReferenceAsset, formReferenceEnabled, hasEmptyForm, isRosterActive, matchesFilters, registeredRows, rosterOrigin, triState } from "./model.js";
import { useRunningJob } from "./notices.js";
import { Badge, CommandButton, EmptyCard, EvidenceToggle, LabeledCheckbox, SaveButton, Spinner } from "./parts.js";
import { openPicker } from "./picker.js";
import { ProfileRow, analysisStates, setAllAnalysis } from "./profile-row.js";
import { ExclusionButton, RosterToggle } from "./roster-actions.js";

const SEARCH_SCOPE = "charx";
const FILTER_SCOPE = "prompts";

export function usePromptsCount(ctx: WorkspaceCtx): number | undefined {
  return ctx.workspace ? registeredRows(ctx.workspace.roster).length : undefined;
}

export function PromptsHeaderEnd() {
  const { ui, characterId, sourceUi } = useWorkspaceCtx();
  return <SearchField className="w-56 mobile:w-32" value={sourceUi.search[SEARCH_SCOPE] ?? ""} onChange={(q) => ui.setSearch(characterId, SEARCH_SCOPE, q)} label={PROMPTS_LABELS.search} />;
}

function PromptRow({ ctx, item, hidden, commandLocked }: { ctx: WorkspaceCtx; item: RosterItem; hidden: boolean; commandLocked: boolean }) {
  const { characterId, workspace, sourceUi, ui, provider, session, sessions, app } = ctx;
  const source = useMemo(() => characterCollection(workspace?.document, item.promptKey), [workspace?.document, item.promptKey]);
  const outfitOpen = sourceUi.secondaryOpen && sourceUi.secondaryMode === "outfit" && sourceUi.activePromptKey === item.promptKey;
  const active = sourceUi.activePromptKey === item.promptKey && !session.reclass.prompts;
  const openReference = (formId: string) => {
    sessions.update(characterId, { returnTarget: "outfit" });
    openPicker(ctx, { kind: "character-form", promptKey: item.promptKey, formId }, item.promptKey);
  };
  return (
    <ProfileRow
      ctx={ctx}
      rowKey={item.promptKey}
      draftKey={draftKeyForCharacter(characterId ?? "", item.promptKey)}
      source={source}
      title={item.title}
      titleText={item.title}
      titleStart={<RosterToggle ctx={ctx} item={item} />}
      titleEnd={item.origin === "ai-auto" ? <Badge tone="primary">{COMMON_LABELS.aiGenerated}</Badge> : undefined}
      exclusionAction={<ExclusionButton ctx={ctx} item={item} />}
      leadingActions={item.origin === "ai-auto" ? (
        <IconButton size="workbenchIcon" variant="subtle" label={PROMPTS_LABELS.promote}
          onClick={() => characterId && void app.mutateWorkspace("customCharacters.promote", { characterId, customIds: [item.selectionId] }).catch(() => undefined)}><BadgeCheckIcon /></IconButton>
      ) : undefined}
      trailingActions={
        <IconButton size="workbenchIcon" variant={outfitOpen ? "default" : "subtle"} label={PROMPTS_LABELS.outfitPromptOf(item.title)} title={PROMPTS_LABELS.outfitPrompt} aria-pressed={outfitOpen}
          onClick={() => (outfitOpen ? ui.closeSecondary(characterId) : ui.openSecondary(characterId, "outfit", { promptKey: item.promptKey }))}><ShirtIcon /></IconButton>
      }
      hidden={hidden}
      selected={active}
      onActivate={() => { if (sourceUi.activePromptKey !== item.promptKey) ui.updateSource(characterId, { activePromptKey: item.promptKey }); }}
      referenceVisible={provider.referenceUiVisible}
      referencesEnabled={provider.referencesEnabled}
      referenceAsset={(c, formId) => formReferenceAsset(workspace?.document, c, item.promptKey, formId)}
      onOpenReference={openReference}
      onCropReference={(formId) => {
        sessions.update(characterId, { directCrop: { key: item.promptKey, formId }, returnTarget: "closed" });
        openPicker(ctx, { kind: "character-form", promptKey: item.promptKey, formId }, item.promptKey);
      }}
      genderLabel={GENDER_LABELS.characterGender}
      resetLabel={FORM_LABELS.resetPrompts}
      evidenceText={session.evidence.prompts === "text"}
      reclass={session.reclass.prompts}
      commandLocked={commandLocked}
    />
  );
}

export function PromptsContent() {
  const ctx = useWorkspaceCtx();
  const { characterId, workspace, sourceUi, session } = ctx;
  const workspaceState = useAppState((s) => s.workspaceState);
  const running = useRunningJob(characterId, ["character-prompts", "references", "reclassification"]);
  const query = sourceUi.search[SEARCH_SCOPE] ?? "";
  const filters: FilterValues = sourceUi.filters[FILTER_SCOPE] ?? {};
  const items = useMemo(() => registeredRows(workspace?.roster ?? []), [workspace]);
  const doc = workspace?.document;
  const { visible } = useFilteredList({
    items,
    id: (i) => i.promptKey,
    query,
    queryFields: (i) => [i.title, ...i.keys],
    values: filters,
    match: (i, v) => {
      const c = characterCollection(doc, i.promptKey);
      return matchesFilters({ roster: isRosterActive(i), origin: rosterOrigin(i, workspace?.sources ?? []), empty: hasEmptyForm(c), reference: c.forms.some((f) => !!formReferenceAsset(doc, c, i.promptKey, f.id)) }, v);
    },
    scopeKey: `${characterId}:prompts:${session.filterRefresh[FILTER_SCOPE] ?? 0}`
  });
  if (!characterId || (!workspace && workspaceState !== "error")) return workspaceState === "loading" ? <div class="grid place-items-center py-10"><Spinner className="size-6 text-muted-foreground" /></div> : <EmptyCard>{PROMPTS_LABELS.noLorebook}</EmptyCard>;
  if (!items.length) return <EmptyCard>{query ? COMMON_LABELS.noSearchResults : PROMPTS_LABELS.noLorebook}</EmptyCard>;
  const shown = new Set(visible.map((i) => i.promptKey));
  const filtering = query.trim() !== "" || Object.values(filters).some((v) => v && v !== "all");
  return (
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1" data-prompts-list="">
      {filtering && shown.size === 0 ? <p class="py-6 text-center text-xs text-muted-foreground">{query ? COMMON_LABELS.noSearchResults : PROMPTS_LABELS.noMatch}</p> : null}
      {items.map((item) => <PromptRow key={item.promptKey} ctx={ctx} item={item} hidden={!shown.has(item.promptKey)} commandLocked={!!running} />)}
    </div>
  );
}

export function PromptsDock() {
  const ctx = useWorkspaceCtx();
  const { app, characterId, workspace, session, sessions, sourceUi, ui, drafts, provider } = ctx;
  const summary = useDraftsSummary(drafts, `char:${characterId}:`);
  const running = useRunningJob(characterId, ["character-prompts", "references", "reclassification"]);
  const reclass = session.reclass.prompts;
  const evidence = session.evidence.prompts;
  const doc = workspace?.document;
  const selected = registeredRows(workspace?.roster ?? []).filter(isRosterActive);
  const collections = selected.map((i) => ({ item: i, key: draftKeyForCharacter(characterId ?? "", i.promptKey), source: characterCollection(doc, i.promptKey) }));
  const values = collections.map((c) => drafts.entry(c.key)?.value ?? c.source);
  const save = formSaver(app);
  const busy = !!running;
  const saveAll = async () => {
    const keys = summary.keys.length ? summary.keys : drafts.dirtyKeys(`char:${characterId}:`);
    for (const key of keys) await drafts.save(key, save);
  };
  const referenceStates = values.map((c, i) => formReferenceEnabled(findForm(c, session.formSelection[collections[i]!.item.promptKey] ?? c.defaultFormId)));
  const analysisValues = values.flatMap((c) => analysisStates(c));
  const anyReference = values.some((c, i) => c.forms.some((f) => !!formReferenceAsset(doc, c, collections[i]!.item.promptKey, f.id)));
  const anyBody = selected.some((i) => i.content.trim());
  const run = () => {
    if (running) { void app.cancelAnalysis(running.jobId); return; }
    if (!characterId) return;
    const promptKeys = selected.map((i) => i.promptKey);
    if (reclass) void app.startAnalysis({ kind: "reclassification", characterId, promptKeys, selection: collections.map((c, i) => ({ promptKey: c.item.promptKey, formIds: values[i]!.forms.filter((f) => f.reference?.referenceAnalysisEnabled !== false).map((f) => f.id) })) });
    else if (evidence === "text") void app.startAnalysis({ kind: "character-prompts", characterId, evidenceMode: "text", promptKeys });
    else void app.startAnalysis({ kind: "references", characterId, evidenceMode: evidence, promptKeys });
  };
  const leading = (
    <>
      <SaveButton label={PROMPTS_LABELS.savePrompts} dirty={summary.dirty} saving={summary.saving} error={summary.error} disabled={busy} onSave={() => void saveAll()} />
      <FilterPopover compact={false} label={PROMPTS_LABELS.filter} groups={FILTER_GROUPS.prompts} values={sourceUi.filters[FILTER_SCOPE] ?? {}}
        onChange={(g, v) => ui.setFilter(characterId, FILTER_SCOPE, { ...(sourceUi.filters[FILTER_SCOPE] ?? {}), [g]: v })}
        onReset={() => ui.setFilter(characterId, FILTER_SCOPE, {})} onRefresh={() => sessions.bumpFilter(characterId, FILTER_SCOPE)} />
    </>
  );
  const controls = (
    <>
      <EvidenceToggle value={evidence} disabled={busy} onChange={(mode) => sessions.update(characterId, (s) => ({ evidence: { ...s.evidence, prompts: mode } }))} />
      {provider.referenceUiVisible ? (
        <LabeledCheckbox label={COMMON_LABELS.reference} title={PROMPTS_LABELS.bulkReferenceTitle} disabled={!provider.referencesEnabled || !selected.length} checked={triState(referenceStates)}
          onCheckedChange={(v) => { for (const c of collections) void drafts.commit(c.key, c.source, (col) => ({ ...col, forms: col.forms.map((f) => ({ ...f, reference: { ...(f.reference ?? {}), enabled: v } })) }), save); }} />
      ) : null}
      <LabeledCheckbox label={COMMON_LABELS.analyze} title={evidence === "text" && !reclass ? COMMON_LABELS.notTextApplied : undefined} disabled={busy || !analysisValues.length} checked={triState(analysisValues)}
        onCheckedChange={(v) => { for (const c of collections) void drafts.commit(c.key, c.source, (col) => setAllAnalysis(col, v), save); }} />
    </>
  );
  const trailing = (
    <div class="group/mode relative">
      <IconButton size="commandSm" variant="commandAction" label={reclass ? PROMPTS_LABELS.modeToReference : PROMPTS_LABELS.modeToReclass} disabled={busy || summary.saving}
        className="absolute -top-11 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-hover/mode:opacity-100 focus-visible:opacity-100 mobile:opacity-100"
        onClick={() => sessions.update(characterId, (s) => ({ reclass: { ...s.reclass, prompts: !s.reclass.prompts } }))}><ShuffleIcon /></IconButton>
      <CommandButton
        running={busy}
        label={reclass ? PROMPTS_LABELS.reclass : PROMPTS_LABELS.analyze}
        stopLabel={reclass ? PROMPTS_LABELS.stopReclass : PROMPTS_LABELS.stopAnalyze}
        title={reclass ? PROMPTS_LABELS.reclassTitle : evidence === "text" ? PROMPTS_LABELS.analyzeTextTitle : PROMPTS_LABELS.analyzeReferenceTitle}
        disabled={!busy && (!characterId || summary.saving || (reclass ? !analysisValues.some(Boolean) : evidence === "text" ? !anyBody : !anyReference))}
        onClick={run}
        icon={reclass ? <ShuffleIcon className="text-primary" /> : <SparklesIcon className="text-primary" />}
      />
    </div>
  );
  return <DockLayout leading={leading} controls={controls} trailing={trailing} />;
}

