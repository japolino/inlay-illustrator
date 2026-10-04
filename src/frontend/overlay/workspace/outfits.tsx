/**
 * Outfit list secondary pane, character (AM `mst` 99453 + `ust` rows + `pst` dock) and persona
 * (AM `S_t` 148315 + `I_t` cards + `k_t` dock). Text fields edit the form draft (saved by the dock Save
 * button); Active / Analyze toggles are saved at once; menu actions (promote / move / delete) edit the draft.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import {
  addOutfit,
  deleteOutfit,
  formCollectionRevision,
  moveOutfit,
  patchOutfit,
  promoteOutfitToDefault,
  type FormCollection,
  type Outfit
} from "../../../shared/contract/character.js";
import type { OutfitImageTarget } from "../../../shared/contract/rpc.js";
import { DockLayout } from "../shell/dock.js";
import { IconButton, MoreIcon, PlusIcon, Select, cn } from "../ui/index.js";
import type { WorkspaceCtx } from "./context.js";
import { formSaver } from "./data.js";
import { useFormDraftView } from "./drafts.js";
import { BadgeCheckIcon, ImagePlusIcon, SparklesIcon, ZoomInIcon } from "./icons.js";
import { COMMON_LABELS, FORM_LABELS, OUTFIT_LABELS } from "./labels/common.js";
import { PERSONA_LABELS } from "./labels/persona.js";
import { findForm, formDisplayLabel, outfitDisplayLabel, outfitReferenceAsset, promotableOutfits, toAssetRef, triState } from "./model.js";
import { AssetImage, Badge, ImageViewer, LabeledCheckbox, Menu, OverlayBadge, SaveButton, useAssetUrl, type MenuItem } from "./parts.js";
import { openPicker } from "./picker.js";
import type { GenerationDraft } from "./session.js";

export type OutfitOwner =
  | { kind: "character"; promptKey: string; title: string; aiAuto: boolean }
  | { kind: "persona"; personaId: string; name: string; avatarUrl: string | null };

export function ownerKey(owner: OutfitOwner): string {
  return owner.kind === "character" ? owner.promptKey : `persona::${owner.personaId}`;
}

/** Text input / textarea keeping the typed text while focused (AM draft buffers `dst`). */
export function BufferedField({ value, onChange, placeholder, label, multiline, className, onBlurCommit }: { value: string; onChange: (value: string) => void; placeholder: string; label: string; multiline?: boolean; className?: string; onBlurCommit?: (value: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  const props = {
    value: text ?? value,
    placeholder,
    "aria-label": label,
    onFocus: () => setText(value),
    onBlur: () => { if (text !== null) onBlurCommit?.(text); setText(null); },
    onInput: (e: Event) => { const v = (e.currentTarget as HTMLInputElement).value; setText(v); onChange(v); },
    class: cn("w-full min-w-0 rounded-md bg-surface-prompt-field px-2.5 text-2xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/55 max-md:text-sm", multiline ? "min-h-14 resize-none py-2 leading-relaxed" : "h-7.5 max-md:h-11", className)
  };
  return multiline ? <textarea {...props} /> : <input {...props} />;
}

interface OutfitPaneModel {
  ctx: WorkspaceCtx;
  owner: OutfitOwner;
  draftKey: string;
  source: FormCollection;
}

function useOutfitModel({ ctx, owner, draftKey, source }: OutfitPaneModel) {
  const { drafts, app, characterId, sessions, session, sourceUi, ui } = ctx;
  const draft = useFormDraftView(drafts, draftKey, source);
  const save = formSaver(app);
  const key = ownerKey(owner);
  const filter = session.outfitFormFilter[key] ?? "all";
  const collection = draft.value;
  const activeOutfitId = owner.kind === "character" ? sourceUi.activeOutfitByPromptKey[owner.promptKey] : sourceUi.activePersonaOutfitByPersonaKey[key];
  return {
    draft,
    collection,
    filter,
    activeOutfitId,
    edit: (fn: (c: FormCollection) => FormCollection) => drafts.edit(draftKey, source, fn),
    commit: (fn: (c: FormCollection) => FormCollection) => void drafts.commit(draftKey, source, fn, save),
    save: () => void drafts.save(draftKey, save),
    setFilter: (formId: string) => {
      sessions.update(characterId, (s) => ({ outfitFormFilter: { ...s.outfitFormFilter, [key]: formId }, ...(formId !== "all" ? { formSelection: { ...s.formSelection, [key]: formId } } : {}) }));
    },
    setActive: (outfitId: string) => (owner.kind === "character" ? ui.setActiveOutfit(characterId, owner.promptKey, outfitId) : ui.setActivePersonaOutfit(characterId, key, outfitId)),
    target: (): OutfitImageTarget => (owner.kind === "character" ? { kind: "character", characterId: characterId ?? "", promptKey: owner.promptKey } : { kind: "persona", personaId: owner.personaId, ...(characterId ? { characterId } : {}) }),
    openGeneration: (formId: string, outfitId: string | undefined, replace: boolean) => {
      const form = findForm(collection, formId);
      const outfit = outfitId ? form.outfits.find((o) => o.id === outfitId) : undefined;
      const blank: GenerationDraft = { label: "", description: "", head: "", top: "", bottom: "", legs: "", feet: "", nsfw: false, gender: form.gender };
      const draftValues: GenerationDraft = outfit ? { label: outfitDisplayLabel(outfit, form.outfits.indexOf(outfit)), description: outfit.description, head: outfit.head, top: outfit.top, bottom: outfit.bottom, legs: outfit.legs, feet: outfit.feet, nsfw: false, gender: form.gender } : blank;
      const seedSetting = owner.kind === "character" ? ctx.workspace?.document.characterPrompt.seedSettings[owner.promptKey] : undefined;
      sessions.openGeneration(characterId, {
        target: owner.kind === "character" ? { kind: "character", characterId: characterId ?? "", promptKey: owner.promptKey } : { kind: "persona", personaId: owner.personaId, ...(characterId ? { characterId } : {}) },
        formId: form.id,
        ...(outfitId ? { outfitId } : {}),
        collectionRevision: formCollectionRevision(collection),
        draft: draftValues,
        replaceCurrent: replace && !!outfitId,
        seed: seedSetting?.seed ?? "",
        seedFixed: seedSetting?.fixed ?? false,
        useReference: form.reference?.enabled !== false,
        referenceType: "character",
        strength: ctx.app.state.config?.novelai.characterReferenceStrength ?? 0.6,
        fidelity: ctx.app.state.config?.novelai.characterReferenceFidelity ?? 1
      });
      ui.openSecondary(characterId, "outfit", owner.kind === "character" ? { promptKey: owner.promptKey } : { personaId: owner.personaId });
    }
  };
}

function OutfitTile({ outfit, isDefault, label, onSelect, fallbackUrl, visible }: { outfit: Outfit; isDefault: boolean; label: string; onSelect?: () => void; fallbackUrl?: string | null; visible: boolean }) {
  const asset = outfitReferenceAsset(outfit);
  const url = useAssetUrl(asset);
  const shown = url ?? (isDefault ? fallbackUrl ?? null : null);
  const [zoom, setZoom] = useState(false);
  if (!visible) return null;
  const aiBadge = outfit.origin === "ai-auto" ? (outfit.status === "failed" ? <OverlayBadge tone="danger">{COMMON_LABELS.retry}</OverlayBadge> : outfit.status === "pending" ? <OverlayBadge tone="warning">{COMMON_LABELS.generating}</OverlayBadge> : <OverlayBadge tone="primary">{COMMON_LABELS.aiGenerated}</OverlayBadge>) : null;
  return (
    <div class="relative row-span-4 h-full min-h-40 w-28 shrink-0 overflow-hidden rounded-md bg-surface-control" data-outfit-tile="">
      <button type="button" class="absolute inset-0 grid place-items-center outline-none focus-visible:ring-2 focus-visible:ring-ring/55" aria-label={OUTFIT_LABELS.selectReferenceOf(label)} title={COMMON_LABELS.selectReference} onClick={onSelect} disabled={!onSelect}>
        {shown ? <img src={shown} alt="" class="size-full object-cover" draggable={false} /> : <ImagePlusIcon className="size-5 text-muted-foreground" />}
      </button>
      {isDefault ? <OverlayBadge className="pointer-events-none absolute top-1 left-1">{COMMON_LABELS.defaultBadge}</OverlayBadge> : null}
      {aiBadge ? <span class="pointer-events-none absolute top-1 right-1">{aiBadge}</span> : null}
      {shown ? <IconButton size="icon" label={COMMON_LABELS.zoomOf(asset?.name || label)} title={COMMON_LABELS.zoom} onClick={() => setZoom(true)} className="absolute bottom-1 left-1 size-7 bg-background/70 text-foreground"><ZoomInIcon /></IconButton> : null}
      <ImageViewer open={zoom} url={shown} alt={label} onClose={() => setZoom(false)} />
    </div>
  );
}

function OutfitCard({ model, ctx, owner, formId, outfit, index, active, onActivate }: { model: ReturnType<typeof useOutfitModel>; ctx: WorkspaceCtx; owner: OutfitOwner; formId: string; outfit: Outfit; index: number; active: boolean; onActivate: () => void }) {
  const form = findForm(model.collection, formId);
  const isDefault = form.defaultOutfitId === outfit.id;
  const label = outfitDisplayLabel(outfit, index);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (active) ref.current?.scrollIntoView?.({ block: "nearest" }); }, [active]);
  const otherForms = model.collection.forms.filter((f) => f.id !== formId);
  const moveDisabled = isDefault ? OUTFIT_LABELS.defaultCannotMove : !otherForms.length ? OUTFIT_LABELS.noOtherForm : undefined;
  const [moving, setMoving] = useState(false);
  const items: MenuItem[] = moving ? [
    { id: "back", label: `‹ ${OUTFIT_LABELS.menu}`, keepOpen: true, onSelect: () => setMoving(false) },
    ...model.collection.forms.map((f) => ({
      id: f.id,
      label: formDisplayLabel(f.label),
      checked: f.id === formId,
      badge: f.id === formId ? OUTFIT_LABELS.current : undefined,
      title: f.id === formId ? OUTFIT_LABELS.currentForm : OUTFIT_LABELS.moveTo(formDisplayLabel(f.label)),
      disabled: f.id === formId,
      onSelect: () => { setMoving(false); model.edit((c) => moveOutfit(c, formId, f.id, outfit.id)); if (model.filter !== "all") model.setFilter(f.id); }
    }))
  ] : [
    ...(outfit.origin === "ai-auto" ? [{ id: "register", label: OUTFIT_LABELS.promoteRegistered, disabled: (outfit.status ?? "ready") !== "ready", title: (outfit.status ?? "ready") !== "ready" ? OUTFIT_LABELS.promoteRegisteredDisabled : undefined, onSelect: () => model.edit((c) => patchOutfit(c, formId, outfit.id, { origin: undefined, status: undefined })) }] : []),
    ...(!isDefault ? [{ id: "default", label: OUTFIT_LABELS.promoteDefault, onSelect: () => model.edit((c) => promoteOutfitToDefault(c, formId, outfit.id)) }] : []),
    { id: "move", label: `${OUTFIT_LABELS.moveForm} ›`, disabled: !!moveDisabled, title: moveDisabled, keepOpen: true, onSelect: () => setMoving(true) },
    ...(!isDefault ? [{ id: "delete", label: OUTFIT_LABELS.deleteOutfit, destructive: true, onSelect: () => model.edit((c) => deleteOutfit(c, formId, outfit.id)) }] : [])
  ];
  const set = (patch: Partial<Outfit>) => model.edit((c) => patchOutfit(c, formId, outfit.id, patch));
  const pickerTarget = owner.kind === "character"
    ? { kind: "character-outfit" as const, promptKey: owner.promptKey, formId, outfitId: outfit.id }
    : { kind: "persona" as const, personaId: owner.personaId, formId, outfitId: outfit.id };
  return (
    <article ref={ref} class={cn("grid gap-2 rounded-lg bg-surface-workbench p-2.5 transition-colors", active && "bg-surface-workbench-active ring-1 ring-primary/40")} onPointerDownCapture={onActivate} onFocusCapture={onActivate} data-outfit-card={outfit.id} data-state={active ? "active" : "inactive"}>
      <div class="flex min-w-0 items-center gap-1.5">
        {!isDefault ? <LabeledCheckbox label={COMMON_LABELS.active} background="card" checked={outfit.candidateEnabled} onCheckedChange={(v) => model.commit((c) => patchOutfit(c, formId, outfit.id, { candidateEnabled: v }))} /> : null}
        {ctx.provider.referenceUiVisible ? (
          <LabeledCheckbox label={COMMON_LABELS.analyze} background="card" disabled={!outfit.referenceAsset && !ctx.session.reclass.prompts}
            checked={outfit.referenceAnalysisEnabled !== false} onCheckedChange={(v) => model.commit((c) => patchOutfit(c, formId, outfit.id, { referenceAnalysisEnabled: v }))} />
        ) : null}
        <span class="min-w-0 flex-1" />
        {ctx.provider.outfitGeneration ? (
          <IconButton size="workbenchIcon" variant="commandAction" label={owner.kind === "persona" ? PERSONA_LABELS.outfitGenerate : OUTFIT_LABELS.generateOf(label)} title={owner.kind === "persona" ? PERSONA_LABELS.outfitGenerate : OUTFIT_LABELS.generate}
            onClick={() => model.openGeneration(formId, outfit.id, true)}><SparklesIcon className="text-primary" /></IconButton>
        ) : null}
        <Menu label={OUTFIT_LABELS.menu} trigger={<MoreIcon />} items={items} />
      </div>
      <div class={cn("grid min-w-0 gap-1.5", ctx.provider.referenceUiVisible || owner.kind === "persona" ? "grid-cols-[7rem_minmax(0,1fr)]" : "grid-cols-1")}>
        <OutfitTile outfit={outfit} isDefault={isDefault} label={label} visible={ctx.provider.referenceUiVisible || owner.kind === "persona"} fallbackUrl={owner.kind === "persona" ? owner.avatarUrl : null}
          onSelect={() => { ctx.sessions.update(ctx.characterId, { returnTarget: owner.kind === "persona" ? "persona-outfit" : "outfit" }); openPicker(ctx, pickerTarget); }} />
        <div class="grid min-w-0 content-start gap-1.5">
          <BufferedField label={OUTFIT_LABELS.name} placeholder={OUTFIT_LABELS.name} value={outfit.label === "기본 의상" || /^의상 \d+$/u.test(outfit.label) ? label : outfit.label} onChange={(v) => { if (v.trim()) set({ label: v }); }} />
          <BufferedField label={OUTFIT_LABELS.description} placeholder={OUTFIT_LABELS.description} value={outfit.description} onChange={(v) => set({ description: v })} />
          {(["head", "top", "bottom", "legs", "feet"] as const).map((part) => (
            <BufferedField key={part} label={OUTFIT_LABELS.parts[part]!} placeholder={OUTFIT_LABELS.parts[part]!} value={outfit[part]} onChange={(v) => set({ [part]: v })} />
          ))}
        </div>
      </div>
    </article>
  );
}

export function OutfitPanel(props: OutfitPaneModel) {
  const model = useOutfitModel(props);
  const { owner, ctx } = props;
  const forms = model.filter === "all" ? model.collection.forms : model.collection.forms.filter((f) => f.id === model.filter);
  const total = forms.reduce((n, f) => n + f.outfits.length, 0);
  const firstId = forms[0]?.outfits[0]?.id;
  const activeId = model.activeOutfitId && forms.some((f) => f.outfits.some((o) => o.id === model.activeOutfitId)) ? model.activeOutfitId : firstId;
  const title = owner.kind === "character" ? OUTFIT_LABELS.frameTitle(owner.title) : PERSONA_LABELS.outfitFrame(owner.name);
  const options = [{ value: "all", label: OUTFIT_LABELS.showAll }, ...model.collection.forms.map((f) => ({ value: f.id, label: `${FORM_LABELS.prefix} ${f.id === model.collection.defaultFormId ? "★ " : ""}${formDisplayLabel(f.label)}` }))];
  return (
    <div class="@container mx-auto grid w-full max-w-190 content-start gap-4 px-5 py-5 mobile:px-3" data-outfit-panel={ownerKey(owner)}>
      <header class="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <h1 class="truncate text-lg leading-tight font-extrabold">{title}</h1>
          {owner.kind === "character" && owner.aiAuto ? <Badge tone="primary">{COMMON_LABELS.aiGenerated}</Badge> : null}
        </div>
        <div class="w-48"><Select value={model.filter} options={options} onValueChange={model.setFilter} aria-label={OUTFIT_LABELS.formFilter} /></div>
      </header>
      {total === 0 ? <p class="rounded-lg bg-card px-4 py-6 text-center text-xs text-muted-foreground">{OUTFIT_LABELS.empty}</p> : null}
      {forms.map((form) => (
        <section key={form.id} class="grid gap-2" data-outfit-form={form.id}>
          {model.filter === "all" ? (
            <h2 class="flex items-center gap-2 text-2xs font-black text-muted-foreground" title={form.id === model.collection.defaultFormId ? FORM_LABELS.defaultTitle(formDisplayLabel(form.label)) : undefined}>
              <span class="h-px w-3 bg-border" />{form.id === model.collection.defaultFormId ? "★ " : ""}{formDisplayLabel(form.label)}<span class="h-px flex-1 bg-border" />
            </h2>
          ) : null}
          <div class="grid gap-2 @min-[44rem]:grid-cols-2">
            {form.outfits.map((outfit, i) => (
              <OutfitCard key={outfit.id} model={model} ctx={ctx} owner={owner} formId={form.id} outfit={outfit} index={i} active={outfit.id === activeId} onActivate={() => { if (outfit.id !== activeId) model.setActive(outfit.id); }} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function OutfitDock(props: OutfitPaneModel) {
  const model = useOutfitModel(props);
  const { owner, ctx } = props;
  const formId = model.filter === "all" ? null : model.filter;
  const outfits = model.collection.forms.filter((f) => !formId || f.id === formId).flatMap((f) => f.outfits.filter((o) => o.id !== f.defaultOutfitId).map((o) => ({ formId: f.id, outfit: o })));
  const promotable = promotableOutfits(model.collection, formId);
  const persona = owner.kind === "persona";
  const leading = (
    <>
      <SaveButton label={persona ? PERSONA_LABELS.outfitSave : OUTFIT_LABELS.savePrompts} dirty={model.draft.dirty} saving={model.draft.saving} error={model.draft.error} onSave={model.save} />
      <LabeledCheckbox label={COMMON_LABELS.active} disabled={!outfits.length} checked={triState(outfits.map((o) => o.outfit.candidateEnabled))}
        onCheckedChange={(v) => model.commit((c) => outfits.reduce((acc, o) => patchOutfit(acc, o.formId, o.outfit.id, { candidateEnabled: v }), c))} />
    </>
  );
  const controls = (
    <>
      <IconButton variant="commandAction" size="command" label={persona ? PERSONA_LABELS.outfitBulkPromote(promotable.length) : OUTFIT_LABELS.bulkPromote(promotable.length)}
        title={persona ? PERSONA_LABELS.outfitBulkPromoteTitle(promotable.length) : OUTFIT_LABELS.bulkPromoteTitle(promotable.length)} disabled={!promotable.length}
        onClick={() => model.edit((c) => promotable.reduce((acc, p) => patchOutfit(acc, p.formId, p.outfitId, { origin: undefined, status: undefined }), c))}><BadgeCheckIcon /></IconButton>
      {ctx.provider.outfitGeneration ? (
        <IconButton variant="commandAction" size="command" label={persona ? PERSONA_LABELS.outfitNew : OUTFIT_LABELS.generate} title={formId ? OUTFIT_LABELS.generateNewTitle : OUTFIT_LABELS.selectFormFirst} disabled={!formId}
          onClick={() => formId && model.openGeneration(formId, undefined, false)}><SparklesIcon className="text-primary" /></IconButton>
      ) : null}
    </>
  );
  const trailing = (
      <IconButton variant="command" size="command" label={persona ? PERSONA_LABELS.outfitAdd : OUTFIT_LABELS.addOutfit} title={formId ? (persona ? PERSONA_LABELS.outfitAdd : OUTFIT_LABELS.addOutfit) : OUTFIT_LABELS.selectFormFirst} disabled={!formId}
        onClick={() => {
          if (!formId) return;
          let created = "";
          model.edit((c) => { const r = addOutfit(c, formId); created = r.outfitId; return r.collection; });
          if (created) model.setActive(created);
        }}><PlusIcon /></IconButton>
  );
  return <DockLayout leading={leading} controls={controls} trailing={trailing} />;
}

export { AssetImage, toAssetRef };
