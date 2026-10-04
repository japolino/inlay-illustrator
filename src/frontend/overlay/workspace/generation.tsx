/**
 * Outfit image generation secondary pane, character (AM `bst` 100026 + dock `yst` 99909 + tile `gst` 99849,
 * session `Qct` 105304) and persona (AM `C_t` 148741 + dock `P_t` 148625, session `E_t`).
 * The session lives in the workspace session store; jobs come from `outfitImage.generate` + app `outfitJobs`.
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import { findOutfit, type FormCollection } from "../../../shared/contract/character.js";
import type { OutfitImageDraft, OutfitImageResult } from "../../../shared/contract/rpc.js";
import { useAppState } from "../../state/app-state.js";
import { DockLayout } from "../shell/dock.js";
import { Button, ChevronDownIcon, ChevronUpIcon, IconButton, Select, Slider, cn } from "../ui/index.js";
import type { WorkspaceCtx } from "./context.js";
import { applySavedCollection, usePersonas } from "./data.js";
import { useFormDraftView } from "./drafts.js";
import { ReferenceCard } from "./form-editor.js";
import { SparklesIcon } from "./icons.js";
import { COMMON_LABELS, GENDER_LABELS, GENERATION_LABELS, OUTFIT_LABELS } from "./labels/common.js";
import { PERSONA_LABELS } from "./labels/persona.js";
import { findForm, formReferenceAsset, outfitReferenceAsset, toAssetRef } from "./model.js";
import { Badge, Checkbox, GenderToggle, ImageViewer, LabeledCheckbox, RatingToggle, SaveButtonIcon, Spinner, useAssetUrl } from "./generation-parts.js";
import { BufferedField, type OutfitOwner } from "./outfits.js";
import { openPicker } from "./picker.js";
import type { GenerationSession } from "./session.js";

export const MAX_GENERATION_HISTORY = 8;

interface GenerationProps { ctx: WorkspaceCtx; owner: OutfitOwner; draftKey: string; source: FormCollection }

/** Merges a finished job into the session (newest first, capped at 8). */
export function addResult(session: GenerationSession, result: OutfitImageResult): Partial<GenerationSession> {
  const results = [result, ...session.results.filter((r) => r.resultId !== result.resultId)].slice(0, MAX_GENERATION_HISTORY);
  return {
    results,
    shownResultId: result.resultId,
    jobId: null,
    seed: session.seedFixed ? session.seed : result.seed,
    historyExpanded: true,
    selectedResultIds: session.replaceCurrent ? [result.resultId] : [...session.selectedResultIds.filter((id) => results.some((r) => r.resultId === id)), result.resultId]
  };
}

/** Selection toggle (replace mode = single select). */
export function toggleSelection(session: GenerationSession, resultId: string): string[] {
  if (session.savedResultIds.includes(resultId)) return session.selectedResultIds;
  const on = session.selectedResultIds.includes(resultId);
  if (session.replaceCurrent) return on ? [] : [resultId];
  return on ? session.selectedResultIds.filter((id) => id !== resultId) : [...session.selectedResultIds, resultId];
}

function useGenerationJob(ctx: WorkspaceCtx, session: GenerationSession) {
  const job = useAppState((s) => (session.jobId ? s.outfitJobs[session.jobId] : undefined));
  useEffect(() => {
    if (!job?.done || !session.jobId) return;
    if (job.result) ctx.sessions.updateGeneration(ctx.characterId, (g) => (g.id === session.id ? addResult(g, job.result!) : {}));
    else ctx.sessions.updateGeneration(ctx.characterId, { jobId: null, error: job.error?.message ?? GENERATION_LABELS.unsupported });
  }, [job?.done]);
  return job;
}

export function GenerationPanel({ ctx, owner, draftKey, source }: GenerationProps) {
  const session = ctx.session.generation!;
  const job = useGenerationJob(ctx, session);
  const draft = useFormDraftView(ctx.drafts, draftKey, source);
  const { personas } = usePersonas(ctx.app, ctx.characterId);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    ctx.app.call("outfitImage.history", { target: session.target, formId: session.formId, ...(session.outfitId ? { outfitId: session.outfitId } : {}) })
      .then((r) => { if (!cancelled && r.results.length) ctx.sessions.updateGeneration(ctx.characterId, (g) => (g.id === session.id ? { results: [...g.results, ...r.results.filter((x) => !g.results.some((y) => y.resultId === x.resultId))].slice(0, MAX_GENERATION_HISTORY) } : {})); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [session.id]);
  const form = findForm(draft.value, session.formId);
  const outfit = session.outfitId ? findOutfit(draft.value, session.formId, session.outfitId) : null;
  const savedAsset = outfit ? outfitReferenceAsset(outfit) : null;
  const savedUrl = useAssetUrl(savedAsset);
  const shown = session.results.find((r) => r.resultId === session.shownResultId) ?? null;
  const previewUrl = shown?.url ?? savedUrl;
  const generating = !!session.jobId;
  const persona = owner.kind === "persona" ? personas?.find((p) => p.personaId === owner.personaId) : null;
  const update = (patch: Partial<GenerationSession>) => ctx.sessions.updateGeneration(ctx.characterId, patch);
  const patchDraft = (patch: Partial<GenerationSession["draft"]>) => ctx.sessions.updateGeneration(ctx.characterId, (g) => ({ draft: { ...g.draft, ...patch } }));
  const title = owner.kind === "character" ? GENERATION_LABELS.frameTitle(owner.title) : PERSONA_LABELS.generationFrame(owner.name);
  const referenceAsset = owner.kind === "character" ? formReferenceAsset(ctx.workspace?.document, draft.value, owner.promptKey, form.id) : toAssetRef(form.reference?.defaultAsset ?? null);
  const parts = ["head", "top", "bottom", "legs", "feet"] as const;
  return (
    <div class="mx-auto grid w-full min-w-0 max-w-190 grid-cols-[minmax(0,1fr)] content-start gap-4 px-5 py-5 mobile:px-3" data-outfit-generation="">
      <header class="flex min-h-8 items-center justify-between gap-3">
        <h1 class="truncate text-lg leading-tight font-extrabold">{title}</h1>
        <Badge>{`${session.results.length}/${MAX_GENERATION_HISTORY}`}</Badge>
      </header>
      {session.error ? <p role="alert" class="rounded-md bg-destructive/12 px-3 py-2 text-xs text-destructive">{session.error}</p> : null}
      <div class="grid gap-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <section aria-label={owner.kind === "persona" ? PERSONA_LABELS.generationResult : GENERATION_LABELS.result} class="relative aspect-[832/1216] overflow-hidden rounded-lg bg-surface-control mobile:max-h-96 mobile:justify-self-center mobile:w-60">
          {previewUrl ? (
            <button type="button" class="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/55" aria-label={GENERATION_LABELS.zoomGenerated} title={GENERATION_LABELS.zoomGenerated} onClick={() => setZoomUrl(previewUrl)}>
              <img src={previewUrl} alt="" class="size-full object-cover" />
            </button>
          ) : <p class="absolute inset-0 grid place-items-center p-4 text-center text-2xs text-muted-foreground">{GENERATION_LABELS.placeholder}</p>}
          {generating ? (
            <div class="absolute inset-0 grid place-items-center bg-background/60">
              <div class="grid justify-items-center gap-2"><Spinner className="size-6 text-primary" />{job?.progress ? <span class="text-2xs font-bold">{job.progress.label}</span> : null}</div>
            </div>
          ) : null}
        </section>
        <section aria-label={owner.kind === "persona" ? PERSONA_LABELS.generationPrompt : GENERATION_LABELS.prompts} class="grid content-start gap-1.5">
          {parts.map((part) => (
            <div key={part} class="flex items-start gap-1.5">
              <BufferedField multiline className="min-h-11" label={OUTFIT_LABELS.parts[part]!} placeholder={OUTFIT_LABELS.parts[part]!} value={session.draft[part]} onChange={(v) => patchDraft({ [part]: v })} />
              {part === "head" ? <RatingToggle nsfw={session.draft.nsfw} onChange={(nsfw) => patchDraft({ nsfw })} /> : null}
            </div>
          ))}
        </section>
      </div>
      <section aria-label={owner.kind === "persona" ? PERSONA_LABELS.generationInfo : GENERATION_LABELS.info} class="grid gap-3 rounded-lg bg-surface-workbench p-2.5">
        {owner.kind === "persona" ? (
          <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
            <div class="h-36"><ReferenceCard asset={referenceAsset} fallbackUrl={persona?.avatarUrl} selectLabel={COMMON_LABELS.selectReferenceOf(owner.name)}
              onSelect={() => { ctx.sessions.update(ctx.characterId, { returnTarget: "persona-outfit-generation" }); openPicker(ctx, { kind: "persona", personaId: owner.personaId, formId: form.id }); }} onZoom={setZoomUrl} /></div>
            <div class="grid min-w-0 content-start gap-1">
              <strong class="text-xs">{owner.name}</strong>
              <p class="max-h-28 overflow-y-auto whitespace-pre-wrap text-2xs leading-relaxed text-muted-foreground">{persona?.description?.trim() || PERSONA_LABELS.noBody}</p>
            </div>
          </div>
        ) : ctx.provider.referenceUiVisible ? (
          <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
            <div class="h-36"><ReferenceCard asset={referenceAsset} selectLabel={COMMON_LABELS.selectReferenceOf(owner.title)}
              onSelect={() => { ctx.sessions.update(ctx.characterId, { returnTarget: "outfit-generation" }); openPicker(ctx, { kind: "character-form", promptKey: owner.promptKey, formId: form.id }, owner.promptKey); }} onZoom={setZoomUrl} /></div>
            <div class="grid content-start gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <LabeledCheckbox label={COMMON_LABELS.reference} background="card" disabled={!ctx.provider.referencesEnabled || !referenceAsset} checked={session.useReference && !!referenceAsset} onCheckedChange={(v) => update({ useReference: v })} />
                <div class="w-44"><Select value={session.referenceType} aria-label={GENERATION_LABELS.referenceType} onValueChange={(v) => update({ referenceType: v as GenerationSession["referenceType"] })}
                  options={Object.entries(GENERATION_LABELS.referenceTypes).map(([value, label]) => ({ value, label }))} /></div>
              </div>
              {([["strength", GENERATION_LABELS.strength], ["fidelity", GENERATION_LABELS.fidelity]] as const).map(([field, label]) => (
                <label key={field} class="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-2xs font-bold text-muted-foreground">
                  {label}
                  <Slider min={0} max={1} step={0.05} value={session[field]} onValueChange={(v) => update({ [field]: v })} aria-label={label} />
                  <output class="tabular-nums text-foreground">{session[field].toFixed(2)}</output>
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <BufferedField label={owner.kind === "persona" ? OUTFIT_LABELS.name : GENERATION_LABELS.name} placeholder={OUTFIT_LABELS.name} value={session.draft.label} onChange={(v) => patchDraft({ label: v })} />
          <GenderToggle value={session.draft.gender} label={owner.kind === "persona" ? GENDER_LABELS.personaGender : GENDER_LABELS.characterGender} onChange={(gender) => patchDraft({ gender })} />
        </div>
        <BufferedField multiline label={GENERATION_LABELS.description} placeholder={GENERATION_LABELS.description} value={session.draft.description} onChange={(v) => patchDraft({ description: v })} />
      </section>
      <ImageViewer open={!!zoomUrl} url={zoomUrl} alt={title} onClose={() => setZoomUrl(null)} />
    </div>
  );
}

export function GenerationDock({ ctx, owner, draftKey, source }: GenerationProps) {
  const session = ctx.session.generation!;
  useGenerationJob(ctx, session);
  const draft = useFormDraftView(ctx.drafts, draftKey, source);
  const generating = !!session.jobId;
  const update = (patch: Partial<GenerationSession>) => ctx.sessions.updateGeneration(ctx.characterId, patch);
  const persona = owner.kind === "persona";
  const selectedCount = session.selectedResultIds.length;
  const imageDraft = useMemo((): OutfitImageDraft & { gender: string; referenceType: string; referenceStrength: number; referenceFidelity: number } => ({
    label: session.draft.label,
    description: session.draft.description,
    head: session.draft.head,
    top: session.draft.top,
    bottom: session.draft.bottom,
    legs: session.draft.legs,
    feet: session.draft.feet,
    nsfw: session.draft.nsfw,
    seed: session.seed,
    seedFixed: session.seedFixed,
    useCharacterReference: session.useReference,
    gender: session.draft.gender,
    referenceType: session.referenceType,
    referenceStrength: session.strength,
    referenceFidelity: session.fidelity
  }), [session]);

  const generate = async () => {
    update({ error: null });
    try {
      const { jobId } = await ctx.app.call("outfitImage.generate", { target: session.target, formId: session.formId, ...(session.outfitId ? { outfitId: session.outfitId } : {}), draft: imageDraft });
      update({ jobId });
    } catch (error) {
      update({ error: error instanceof Error ? error.message : String(error) });
    }
  };
  const save = async () => {
    if (session.outfitId && !findOutfit(draft.value, session.formId, session.outfitId)) {
      update({ error: GENERATION_LABELS.saveAborted });
      return;
    }
    update({ saving: true, error: null });
    try {
      const { collection } = await ctx.app.call("outfitImage.save", {
        target: session.target,
        formId: session.formId,
        ...(session.outfitId ? { outfitId: session.outfitId } : {}),
        resultIds: session.selectedResultIds,
        mode: session.replaceCurrent && session.outfitId ? "replace" : "add",
        draft: imageDraft
      });
      applySavedCollection(ctx.app, ctx.characterId, owner.kind === "character" ? { kind: "character", promptKey: owner.promptKey } : { kind: "persona", personaId: owner.personaId }, collection);
      ctx.sessions.closeGeneration(ctx.characterId);
    } catch (error) {
      update({ saving: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  const history = session.results.length ? (
    <section aria-label={persona ? PERSONA_LABELS.generationHistory : GENERATION_LABELS.history} class="scrollbar-none flex w-full gap-1.5 overflow-x-auto px-2 pt-2" data-generation-history="">
      {session.results.map((r) => {
        const selected = session.selectedResultIds.includes(r.resultId);
        const saved = session.savedResultIds.includes(r.resultId);
        return (
          <button key={r.resultId} type="button" aria-pressed={selected} disabled={saved} aria-label={GENERATION_LABELS.seedTarget(r.seed, selected)} title={GENERATION_LABELS.seedTitle(r.seed)}
            onClick={() => update({ selectedResultIds: toggleSelection(session, r.resultId), shownResultId: r.resultId })}
            class={cn("relative h-24 w-16 shrink-0 overflow-hidden rounded-md bg-surface-control outline-none focus-visible:ring-2 focus-visible:ring-ring/55", selected ? "ring-2 ring-primary" : "opacity-60")}>
            <img src={r.url} alt={persona ? PERSONA_LABELS.generationResult : GENERATION_LABELS.result} class="size-full object-cover" />
            {saved ? <span class="absolute inset-x-0 bottom-0 bg-background/80 text-3xs font-bold">{GENERATION_LABELS.saved}</span> : r.resultId === session.shownResultId ? <span class="absolute inset-x-0 bottom-0 bg-background/80 text-3xs font-bold">{GENERATION_LABELS.shown}</span> : null}
          </button>
        );
      })}
    </section>
  ) : null;
  const leading = (
    <>
      <IconButton variant="commandAction" size="command" disabled={!selectedCount || generating || session.saving} onClick={() => void save()}
        label={session.replaceCurrent ? (persona ? PERSONA_LABELS.replaceSave : GENERATION_LABELS.replaceSave) : (persona ? PERSONA_LABELS.addSave : GENERATION_LABELS.addSave(selectedCount))}>
        {session.saving ? <Spinner /> : <SaveButtonIcon />}
      </IconButton>
      <LabeledCheckbox label={GENERATION_LABELS.replace} title={GENERATION_LABELS.replaceTitle} disabled={generating || session.saving || !session.outfitId} checked={session.replaceCurrent}
        onCheckedChange={(v) => update({ replaceCurrent: v, selectedResultIds: v ? session.selectedResultIds.slice(0, 1) : session.selectedResultIds })} />
      <Badge>{GENERATION_LABELS.selectedN(selectedCount)}</Badge>
    </>
  );
  const controls = (
    <>
      <Badge title={session.seed ? GENERATION_LABELS.currentSeed(session.seed) : GENERATION_LABELS.noSeed}>{GENERATION_LABELS.seedBadge(session.seed)}</Badge>
      <span class="inline-flex items-center gap-1.5 px-1.5 text-2xs font-bold text-secondary-foreground">
        <Checkbox checked={session.seedFixed} label={GENERATION_LABELS.fixed} onCheckedChange={(v) => update({ seedFixed: v })} />{GENERATION_LABELS.fixed}
      </span>
    </>
  );
  const trailing = (
    <Button size="command" variant="command" disabled={generating || session.saving} onClick={() => void generate()} aria-label={persona ? PERSONA_LABELS.generateImage : GENERATION_LABELS.generateImage} title={GENERATION_LABELS.generateImage}>
      {generating ? <Spinner /> : <SparklesIcon className="text-primary" />}
    </Button>
  );
  return (
    <div class="relative grid w-full" data-generation-dock="">
      {session.results.length ? (
        <button type="button" class="absolute -top-6 left-1/2 grid h-5 w-16 -translate-x-1/2 place-items-center rounded-t-lg bg-surface-command text-muted-foreground hover:text-foreground" aria-expanded={session.historyExpanded}
          aria-label={session.historyExpanded ? GENERATION_LABELS.collapseHistory : GENERATION_LABELS.expandHistory} title={session.historyExpanded ? GENERATION_LABELS.collapseHistory : GENERATION_LABELS.expandHistory}
          onClick={() => update({ historyExpanded: !session.historyExpanded })}>
          {session.historyExpanded ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </button>
      ) : null}
      {session.historyExpanded ? history : null}
      <DockLayout leading={leading} controls={controls} trailing={trailing} />
    </div>
  );
}
