/**
 * Persona tab (AM `b_t` 147967 list, `g_t` 147580 row, `y_t` 147851 dock). Persona forms are edited in the
 * draft store (`persona:<personaId>`) and saved with `personas.saveForms`.
 */
import type { PersonaSummary } from "../../../shared/contract/rpc.js";
import { FilterPopover, SearchField, useFilteredList, type FilterValues } from "../shell/filters.js";
import { DockLayout } from "../shell/dock.js";
import { IconButton } from "../ui/index.js";
import { useWorkspaceCtx, type WorkspaceCtx } from "./context.js";
import { formSaver, usePersonas } from "./data.js";
import { draftKeyForPersona, useDraftsSummary } from "./drafts.js";
import { ShirtIcon, ShuffleIcon, SparklesIcon } from "./icons.js";
import { COMMON_LABELS, GENDER_LABELS } from "./labels/common.js";
import { PERSONA_LABELS } from "./labels/persona.js";
import { PROMPTS_LABELS } from "./labels/prompts.js";
import { FILTER_GROUPS, findForm, formReferenceEnabled, hasEmptyForm, matchesFilters, personaDisplayName, toAssetRef, triState } from "./model.js";
import { useRunningJob } from "./notices.js";
import { Badge, CommandButton, EmptyCard, EvidenceToggle, LabeledCheckbox, SaveButton, Spinner } from "./parts.js";
import { openPicker } from "./picker.js";
import { ProfileRow, analysisStates, setAllAnalysis } from "./profile-row.js";

const SEARCH_SCOPE = "persona";
const FILTER_SCOPE = "persona";

export function PersonaHeaderEnd() {
  const { ui, characterId, sourceUi } = useWorkspaceCtx();
  return <SearchField className="w-56 mobile:w-full" value={sourceUi.search[SEARCH_SCOPE] ?? ""} onChange={(q) => ui.setSearch(characterId, SEARCH_SCOPE, q)} label={PERSONA_LABELS.search} />;
}

function scopeBadge(persona: PersonaSummary, anyBound: boolean) {
  if (persona.isBound) return <Badge tone="primary">{PERSONA_LABELS.activeInChat}</Badge>;
  if (persona.isActive && !anyBound) return <Badge>{PERSONA_LABELS.globalDefault}</Badge>;
  return undefined;
}

function PersonaRow({ ctx, persona, index, hidden, anyBound, commandLocked }: { ctx: WorkspaceCtx; persona: PersonaSummary; index: number; hidden: boolean; anyBound: boolean; commandLocked: boolean }) {
  const { characterId, sourceUi, ui, provider, session, sessions } = ctx;
  const name = personaDisplayName(persona, index);
  const outfitOpen = sourceUi.secondaryOpen && sourceUi.secondaryMode === "outfit" && sourceUi.activePersonaId === persona.personaId;
  return (
    <ProfileRow
      ctx={ctx}
      rowKey={`persona::${persona.personaId}`}
      draftKey={draftKeyForPersona(persona.personaId)}
      source={persona.forms}
      title={name}
      titleText={name}
      titleEnd={scopeBadge(persona, anyBound)}
      trailingActions={
        <IconButton size="workbenchIcon" variant={outfitOpen ? "default" : "subtle"} label={PERSONA_LABELS.outfitEditOf(name)} title={PERSONA_LABELS.outfitEdit} aria-pressed={outfitOpen}
          onClick={() => {
            sessions.update(characterId, (s) => ({ generation: s.generation?.target.kind === "persona" ? null : s.generation, outfitFormFilter: { ...s.outfitFormFilter, [`persona::${persona.personaId}`]: "all" } }));
            if (outfitOpen) ui.closeSecondary(characterId);
            else ui.openSecondary(characterId, "outfit", { personaId: persona.personaId });
          }}><ShirtIcon /></IconButton>
      }
      hidden={hidden}
      selected={sourceUi.activePersonaId === persona.personaId}
      onActivate={() => { if (sourceUi.activePersonaId !== persona.personaId) ui.updateSource(characterId, { activePersonaId: persona.personaId }); }}
      referenceVisible
      referencesEnabled={provider.referencesEnabled}
      referenceTitle={PERSONA_LABELS.referenceTitle}
      referenceAsset={(c, formId) => toAssetRef(findForm(c, formId)?.reference?.defaultAsset ?? null)}
      referenceFallbackUrl={persona.avatarUrl}
      onOpenReference={(formId) => {
        sessions.update(characterId, { returnTarget: "persona-outfit" });
        openPicker(ctx, { kind: "persona", personaId: persona.personaId, formId }, undefined, persona.personaId);
      }}
      onCropReference={(formId) => {
        sessions.update(characterId, { returnTarget: "closed", directCrop: { key: `persona::${persona.personaId}`, formId } });
        openPicker(ctx, { kind: "persona", personaId: persona.personaId, formId }, undefined, persona.personaId);
      }}
      genderLabel={GENDER_LABELS.personaGender}
      resetLabel={PERSONA_LABELS.resetOf(name)}
      evidenceText={session.evidence.persona === "text"}
      reclass={session.reclass.persona}
      commandLocked={commandLocked}
    />
  );
}

export function PersonaContent() {
  const ctx = useWorkspaceCtx();
  const { app, characterId, sourceUi, session } = ctx;
  const { personas, loading } = usePersonas(app, characterId);
  const running = useRunningJob(characterId, ["persona", "reclassification"]);
  const list = personas ?? [];
  const query = sourceUi.search[SEARCH_SCOPE] ?? "";
  const filters: FilterValues = sourceUi.filters[FILTER_SCOPE] ?? {};
  const { visible } = useFilteredList({
    items: list,
    id: (p) => p.personaId,
    query,
    queryFields: (p) => [p.name],
    values: filters,
    match: (p, v) => matchesFilters({ empty: hasEmptyForm(p.forms), reference: p.forms.forms.some((f) => !!f.reference?.defaultAsset) || !!p.avatarUrl }, v),
    scopeKey: `${characterId}:persona:${session.filterRefresh[FILTER_SCOPE] ?? 0}`
  });
  if (!personas) return loading ? <div class="grid place-items-center py-10" aria-label={PERSONA_LABELS.loading}><Spinner className="size-6 text-muted-foreground" /></div> : <EmptyCard>{PERSONA_LABELS.empty}</EmptyCard>;
  if (!list.length) return <EmptyCard>{PERSONA_LABELS.empty}</EmptyCard>;
  const shown = new Set(visible.map((p) => p.personaId));
  const filtering = query.trim() !== "" || Object.values(filters).some((v) => v && v !== "all");
  const anyBound = list.some((p) => p.isBound);
  return (
    <div class="grid gap-1" data-persona-list="">
      {filtering && shown.size === 0 ? <p class="py-6 text-center text-xs text-muted-foreground">{query ? COMMON_LABELS.noSearchResults : PERSONA_LABELS.noMatch}</p> : null}
      {list.map((p, i) => <PersonaRow key={p.personaId} ctx={ctx} persona={p} index={i} hidden={!shown.has(p.personaId)} anyBound={anyBound} commandLocked={!!running} />)}
    </div>
  );
}

export function PersonaDock() {
  const ctx = useWorkspaceCtx();
  const { app, characterId, session, sessions, sourceUi, ui, drafts, provider } = ctx;
  const { personas } = usePersonas(app, characterId);
  const summary = useDraftsSummary(drafts, "persona:");
  const running = useRunningJob(characterId, ["persona", "reclassification"]);
  const list = personas ?? [];
  const reclass = session.reclass.persona;
  const evidence = session.evidence.persona;
  const save = formSaver(app);
  const busy = !!running;
  const entries = list.map((p) => ({ persona: p, key: draftKeyForPersona(p.personaId), value: drafts.entry(draftKeyForPersona(p.personaId))?.value ?? p.forms }));
  const referenceStates = entries.flatMap((e) => e.value.forms.map((f) => formReferenceEnabled(f)));
  const analysisValues = entries.flatMap((e) => analysisStates(e.value));
  const saveAll = async () => { for (const key of summary.keys) await drafts.save(key, save); };
  const run = () => {
    if (running) { void app.cancelAnalysis(running.jobId); return; }
    if (!characterId) return;
    const personaIds = list.map((p) => p.personaId);
    if (reclass) void app.startAnalysis({ kind: "reclassification", characterId, personaIds, selection: entries.map((e) => ({ personaId: e.persona.personaId, formIds: e.value.forms.filter((f) => f.reference?.referenceAnalysisEnabled !== false).map((f) => f.id) })) });
    else void app.startAnalysis({ kind: "persona", characterId, evidenceMode: evidence, personaIds });
  };
  const hasText = list.some((p) => p.description.trim());
  const leading = (
    <>
      <SaveButton label={PERSONA_LABELS.save} dirty={summary.dirty} saving={summary.saving} error={summary.error} disabled={busy} onSave={() => void saveAll()} />
      <FilterPopover compact={false} label={PERSONA_LABELS.filter} groups={FILTER_GROUPS.persona} values={sourceUi.filters[FILTER_SCOPE] ?? {}}
        onChange={(g, v) => ui.setFilter(characterId, FILTER_SCOPE, { ...(sourceUi.filters[FILTER_SCOPE] ?? {}), [g]: v })}
        onReset={() => ui.setFilter(characterId, FILTER_SCOPE, {})} onRefresh={() => sessions.bumpFilter(characterId, FILTER_SCOPE)} />
    </>
  );
  const controls = (
    <>
      <EvidenceToggle value={evidence} disabled={busy} onChange={(mode) => sessions.update(characterId, (s) => ({ evidence: { ...s.evidence, persona: mode } }))} />
      <LabeledCheckbox label={COMMON_LABELS.reference} title={PERSONA_LABELS.bulkReferenceTitle} disabled={busy || !list.length || !provider.referencesEnabled} checked={triState(referenceStates)}
        onCheckedChange={(v) => { for (const e of entries) void drafts.commit(e.key, e.persona.forms, (c) => ({ ...c, forms: c.forms.map((f) => ({ ...f, reference: { ...(f.reference ?? {}), enabled: v } })) }), save); }} />
      <LabeledCheckbox label={COMMON_LABELS.analyze} title={evidence === "text" && !reclass ? COMMON_LABELS.notTextApplied : undefined} disabled={busy || !characterId || !analysisValues.length} checked={triState(analysisValues)}
        onCheckedChange={(v) => { for (const e of entries) void drafts.commit(e.key, e.persona.forms, (c) => setAllAnalysis(c, v), save); }} />
    </>
  );
  const trailing = (
    <div class="group/mode relative">
      <IconButton size="commandSm" variant="commandAction" label={reclass ? PROMPTS_LABELS.modeToReference : PROMPTS_LABELS.modeToReclass} disabled={busy || summary.saving}
        className="absolute -top-11 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-hover/mode:opacity-100 focus-visible:opacity-100 mobile:opacity-100"
        onClick={() => sessions.update(characterId, (s) => ({ reclass: { ...s.reclass, persona: !s.reclass.persona } }))}><ShuffleIcon /></IconButton>
      <CommandButton
        running={busy}
        label={reclass ? PROMPTS_LABELS.reclass : PERSONA_LABELS.analyze}
        stopLabel={reclass ? PROMPTS_LABELS.stopReclass : PERSONA_LABELS.stopAnalyze}
        title={reclass ? PERSONA_LABELS.reclassTitle : PERSONA_LABELS.analyzeTitle}
        disabled={!busy && (!characterId || summary.saving || !list.length || (reclass ? !analysisValues.some(Boolean) : evidence === "text" && !hasText))}
        onClick={run}
        icon={reclass ? <ShuffleIcon className="text-primary" /> : <SparklesIcon className="text-primary" />}
      />
    </div>
  );
  return <DockLayout leading={leading} controls={controls} trailing={trailing} />;
}
