/**
 * Asset picker secondary pane (AM `Zwe` 146688 grid, `Kwe` 145862 card, `Uxt` 146862 dock, `Mit` 97850
 * controller, `$wt` 137674 key manager). Context kinds come from the shell's PickerTarget (see `pickerKind`).
 * Selections are written immediately (`assets.setSelection`); character / persona form references go through
 * the form draft store (saved at once, so a dirty prompt draft keeps a valid base revision); outfit references
 * are staged and committed with the dock ✓ button; the artist image uses `assets.setReference`.
 */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  findOutfit,
  patchForm,
  patchOutfit,
  personaPromptKey,
  toStoredAssetRef,
  type AssetRef,
  type FormCollection
} from "../../../shared/contract/character.js";
import type { AssetFilter, AssetListItem } from "../../../shared/contract/rpc.js";
import type { AppController } from "../../state/app-state.js";
import { useAppState } from "../../state/app-state.js";
import { Store, useSelector } from "../../state/store.js";
import type { PickerTarget } from "../workspace-ui.js";
import { Button, CheckIcon, IconButton, XIcon, cn } from "../ui/index.js";
import { DockLayout } from "../shell/dock.js";
import { useWorkspaceCtx, type WorkspaceCtx } from "./context.js";
import { CropDialog } from "./crop.js";
import { formSaver, usePersonas, writeSelection } from "./data.js";
import { draftKeyForCharacter, draftKeyForPersona, useFormDraftView } from "./drafts.js";
import { CropIcon, KeyIcon, SparklesIcon, UploadIcon, ZoomInIcon } from "./icons.js";
import { COMMON_LABELS, PICKER_LABELS } from "./labels/common.js";
import { MetadataBadge } from "./metadata.js";
import {
  characterCollection,
  findForm,
  formReferenceAsset,
  outfitReferenceAsset,
  pickerFilters,
  pickerKind,
  pickerMultiSelect,
  pickerTitle,
  sameAsset,
  selectedAssets,
  toAssetRef,
  type PickerKind
} from "./model.js";
import { Badge, CommandButton, EmptyCard, ImageViewer, LabeledCheckbox, Segmented, Spinner, seedAssetUrls } from "./parts.js";

const PAGE = 30;

interface PickerState {
  key: string;
  filter: AssetFilter;
  metadataOnly: boolean;
  userFilterTouched: boolean;
  items: AssetListItem[];
  total: number;
  cursor: string | null;
  loading: boolean;
  error: string | null;
  staged: AssetRef | null;
  stagedTouched: boolean;
  request: number;
}

const stores = new WeakMap<object, Store<PickerState>>();
function pickerStore(app: AppController): Store<PickerState> {
  let s = stores.get(app);
  if (!s) stores.set(app, (s = new Store<PickerState>({ key: "", filter: "all", metadataOnly: false, userFilterTouched: false, items: [], total: 0, cursor: null, loading: false, error: null, staged: null, stagedTouched: false, request: 0 })));
  return s;
}

function targetKey(characterId: string | null, target: PickerTarget | null): string {
  return `${characterId ?? ""}|${JSON.stringify(target)}`;
}

async function loadPage(app: AppController, characterId: string, target: PickerTarget, reset: boolean): Promise<void> {
  const store = pickerStore(app);
  const s = store.get();
  const request = s.request + 1;
  const kind = pickerKind(target);
  store.patch({ loading: true, error: null, request, ...(reset ? { items: [], cursor: null, total: 0 } : {}) });
  const promptKey = target.kind === "selection" || target.kind === "character-form" || target.kind === "character-outfit" ? target.promptKey : target.kind === "persona" ? personaPromptKey(target.personaId) : undefined;
  try {
    const page = await app.call("assets.list", {
      characterId,
      ...(promptKey ? { promptKey } : {}),
      filter: s.filter,
      metadataOnly: kind === "artist-reference" ? true : s.metadataOnly,
      cursor: reset ? null : s.cursor,
      limit: PAGE
    });
    if (store.get().request !== request) return;
    seedAssetUrls(app, page.items);
    store.patch({ items: reset ? page.items : [...store.get().items, ...page.items], cursor: page.nextCursor, total: page.total, loading: false });
  } catch (error) {
    if (store.get().request !== request) return;
    store.patch({ loading: false, error: error instanceof Error ? error.message : String(error) });
  }
}

/** Opens the picker pane for a target (AM `assetPicker.open` + secondary `asset-picker`). */
export function openPicker(ctx: Pick<WorkspaceCtx, "ui" | "characterId">, target: PickerTarget, promptKey?: string | null, personaId?: string | null): void {
  ctx.ui.openSecondary(ctx.characterId, "asset-picker", { picker: target, ...(promptKey !== undefined ? { promptKey } : {}), ...(personaId !== undefined ? { personaId } : {}) });
}

/* ------------------------------------------------------------------------------------------------
 * Selection model per target
 * ---------------------------------------------------------------------------------------------- */

interface PickerModel {
  kind: PickerKind;
  name: string;
  promptKey: string | null;
  selected: AssetRef[];
  toggle: (asset: AssetRef) => void;
  /** Writes the staged outfit reference (dock ✓). */
  commit: () => Promise<void>;
  /** Applies a cropped (or uncropped) asset as the reference. */
  applyCrop: (asset: AssetRef) => Promise<void>;
  saving: boolean;
}

function usePickerModel(ctx: WorkspaceCtx, target: PickerTarget): PickerModel {
  const { app, characterId, workspace, drafts } = ctx;
  const kind = pickerKind(target);
  const store = pickerStore(app);
  const picker = useSelector(store, (s) => s);
  const doc = workspace?.document ?? null;
  const { personas } = usePersonas(app, characterId);
  const [saving, setSaving] = useState(false);
  const save = formSaver(app);

  const promptKey = target.kind === "selection" || target.kind === "character-form" || target.kind === "character-outfit" ? target.promptKey : null;
  const personaId = target.kind === "persona" ? target.personaId : null;
  const persona = personaId ? personas?.find((p) => p.personaId === personaId) ?? null : null;
  const charSource = useMemo(() => characterCollection(doc, promptKey ?? ""), [doc, promptKey]);
  const charKey = draftKeyForCharacter(characterId ?? "", promptKey ?? "");
  const charDraft = useFormDraftView(drafts, charKey, charSource);
  const personaSource = persona?.forms ?? charSource;
  const personaKey = draftKeyForPersona(personaId ?? "");
  const personaDraft = useFormDraftView(drafts, personaKey, personaSource);

  const row = promptKey ? workspace?.roster.find((r) => r.promptKey === promptKey) : null;
  const name = row?.title ?? persona?.name ?? "";

  let committed: AssetRef[] = [];
  if (kind === "asset-selection") committed = selectedAssets(doc, promptKey ?? "");
  else if (kind === "persona-asset-selection") committed = selectedAssets(doc, personaPromptKey(personaId ?? ""));
  else if (kind === "character-reference" && target.kind === "character-form") {
    const ref = formReferenceAsset(doc, charDraft.value, target.promptKey, target.formId);
    committed = ref ? [ref] : [];
  } else if (kind === "outfit-reference" && target.kind === "character-outfit") {
    const outfit = findOutfit(charDraft.value, target.formId, target.outfitId);
    const ref = outfit ? toAssetRef(outfit.referenceAsset ?? null) : null;
    committed = ref ? [ref] : [];
  } else if (kind === "persona-reference" && target.kind === "persona") {
    const form = findForm(personaDraft.value, target.formId);
    const ref = toAssetRef(form?.reference?.defaultAsset ?? null);
    committed = ref ? [ref] : [];
  } else if (kind === "persona-outfit-reference" && target.kind === "persona" && target.outfitId) {
    const outfit = findOutfit(personaDraft.value, target.formId ?? personaDraft.value.defaultFormId, target.outfitId);
    const ref = outfit ? outfitReferenceAsset(outfit) : null;
    committed = ref ? [ref] : [];
  } else if (kind === "artist-reference") {
    const ref = toAssetRef(doc?.characterPrompt.artistExtractionAssetBySourceId[characterId ?? ""] ?? null);
    committed = ref ? [ref] : [];
  }
  const staging = kind === "outfit-reference" || kind === "persona-outfit-reference";
  const selected = staging && picker.stagedTouched ? (picker.staged ? [picker.staged] : []) : committed;

  const commitCharacter = async (fn: (c: FormCollection) => FormCollection) => {
    if (!characterId || !promptKey) return;
    setSaving(true);
    await drafts.commit(charKey, charSource, fn, save);
    setSaving(false);
  };
  const commitPersona = async (fn: (c: FormCollection) => FormCollection) => {
    if (!personaId) return;
    setSaving(true);
    await drafts.commit(personaKey, personaSource, fn, save);
    setSaving(false);
  };
  const setFormReference = (formId: string, asset: AssetRef | null) => (c: FormCollection) => {
    const form = findForm(c, formId);
    return patchForm(c, form.id, { reference: { ...(form.reference ?? {}), defaultAsset: asset ? toStoredAssetRef(asset) : null } });
  };

  const applyReference = async (asset: AssetRef | null) => {
    if (target.kind === "character-form") await commitCharacter(setFormReference(target.formId, asset));
    else if (target.kind === "persona" && !target.outfitId && target.formId) await commitPersona(setFormReference(target.formId, asset));
    else if (target.kind === "artist-extraction" && characterId) {
      setSaving(true);
      try {
        await app.call("assets.setReference", { target: { kind: "artist-extraction", characterId }, asset: asset ? toStoredAssetRef(asset) : null });
        const ws = app.state.workspace;
        if (ws && ws.characterId === characterId) {
          const cp = ws.document.characterPrompt;
          const map = { ...cp.artistExtractionAssetBySourceId };
          if (asset) map[characterId] = toStoredAssetRef(asset);
          else delete map[characterId];
          app.applyWorkspace({ ...ws, document: { ...ws.document, characterPrompt: { ...cp, artistExtractionAssetBySourceId: map } } });
        }
      } catch (error) {
        app.notifyError(error);
      } finally {
        setSaving(false);
      }
    }
  };

  return {
    kind,
    name,
    promptKey,
    selected,
    saving,
    toggle: (asset) => {
      const isSelected = selected.some((a) => sameAsset(a, asset));
      if (pickerMultiSelect(kind)) {
        const next = isSelected ? selected.filter((a) => !sameAsset(a, asset)) : [...selected, asset];
        const key = kind === "asset-selection" ? promptKey! : personaPromptKey(personaId!);
        if (characterId) void writeSelection(app, characterId, key, next);
        return;
      }
      if (staging) {
        store.patch({ staged: isSelected ? null : asset, stagedTouched: true });
        return;
      }
      // Character reference keeps at least one selection.
      if (isSelected && kind === "character-reference") return;
      void applyReference(isSelected ? null : asset);
    },
    commit: async () => {
      if (!staging || !picker.stagedTouched) return;
      const stored = picker.staged ? toStoredAssetRef(picker.staged) : null;
      if (target.kind === "character-outfit") await commitCharacter((c) => patchOutfit(c, target.formId, target.outfitId, { referenceAsset: stored }));
      else if (target.kind === "persona" && target.outfitId) {
        const formId = target.formId ?? personaDraft.value.defaultFormId;
        await commitPersona((c) => patchOutfit(c, formId, target.outfitId!, { referenceAsset: stored }));
      }
      store.patch({ staged: null, stagedTouched: false });
    },
    applyCrop: async (asset) => {
      await applyReference(asset);
    }
  };
}

/* ------------------------------------------------------------------------------------------------
 * Panel
 * ---------------------------------------------------------------------------------------------- */

function PickerCard({ item, selected, onToggle, onZoom, characterId, priority }: { item: AssetListItem; selected: boolean; onToggle: () => void; onZoom: () => void; characterId: string | null; priority: boolean }) {
  const name = item.asset.name;
  return (
    <article class={cn("group relative grid gap-1 rounded-lg p-1 transition-colors", selected && "bg-surface-media-selected ring-2 ring-primary")} data-picker-card="" data-selected={selected ? "true" : "false"}>
      <div class="relative aspect-[2/3] overflow-hidden rounded-md bg-surface-control">
        <button type="button" class="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/55" aria-label={selected ? PICKER_LABELS.deselect(name) : PICKER_LABELS.select(name)} aria-pressed={selected} onClick={onToggle}>
          <img src={item.thumbnailUrl || item.url} alt="" loading={priority ? "eager" : "lazy"} decoding="async" draggable={false} class="size-full object-cover" />
        </button>
        {selected ? <span class="pointer-events-none absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><CheckIcon className="size-3" /></span> : null}
        <IconButton size="icon" label={COMMON_LABELS.zoomOf(name)} title={COMMON_LABELS.zoom} onClick={onZoom} className="absolute bottom-1 left-1 size-7 bg-background/70 text-foreground hover:bg-background/90"><ZoomInIcon /></IconButton>
        <span class="absolute right-1 bottom-1"><MetadataBadge asset={item.asset} hasMetadata={item.hasMetadata} characterId={characterId} /></span>
      </div>
      <span class="truncate px-0.5 text-3xs font-semibold text-muted-foreground" title={name}>{name}</span>
    </article>
  );
}

export function PickerPanel({ target }: { target: PickerTarget }) {
  const ctx = useWorkspaceCtx();
  const { app, characterId } = ctx;
  const store = pickerStore(app);
  const state = useSelector(store, (s) => s);
  const model = usePickerModel(ctx, target);
  const [zoom, setZoom] = useState<AssetListItem | null>(null);
  const cropRequest = ctx.session.cropRequest;
  const [cropAsset, setCropAsset] = useState<AssetRef | null>(null);
  const lastCrop = useRef(cropRequest);
  const docRevision = useAppState((s) => (characterId ? s.documentRevision[characterId] ?? 0 : 0));
  const key = targetKey(characterId, target);

  // Reset filter / staged selection when the target changes (AM 98084).
  useEffect(() => {
    const s = store.get();
    if (s.key !== key) {
      const filters = pickerFilters(model.kind);
      store.patch({ key, filter: s.userFilterTouched && filters.includes(s.filter as never) ? s.filter : filters[0]!, staged: null, stagedTouched: false });
    }
  }, [key]);
  useEffect(() => {
    if (characterId) void loadPage(app, characterId, target, true);
  }, [key, state.filter, state.metadataOnly, docRevision]);
  // Dock crop button (AM `Hxt`): exactly one selected reference.
  useEffect(() => {
    if (cropRequest !== lastCrop.current) {
      lastCrop.current = cropRequest;
      if (model.selected.length === 1) setCropAsset(model.selected[0]!);
    }
  }, [cropRequest]);
  // Direct crop request from a prompt row.
  useEffect(() => {
    const direct = ctx.session.directCrop;
    const key = target.kind === "character-form" ? target.promptKey : target.kind === "persona" ? `persona::${target.personaId}` : null;
    if (direct && key && direct.key === key && model.selected[0]) {
      setCropAsset(model.selected[0]);
      ctx.sessions.update(characterId, { directCrop: null });
    }
  }, [ctx.session.directCrop, model.selected.length]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined" || !state.cursor) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !store.get().loading && characterId) void loadPage(app, characterId, target, false);
    }, { rootMargin: "360px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [state.cursor, key]);

  const title = pickerTitle(model.kind, model.name);
  return (
    <div class="mx-auto grid w-full min-w-0 max-w-190 grid-cols-[minmax(0,1fr)] content-start gap-4 px-5 py-5 mobile:px-3" data-asset-picker={model.kind}>
      <header class="flex min-h-8 items-center justify-between gap-3">
        <h1 class="truncate text-lg leading-tight font-extrabold">{title}</h1>
        <Badge>{PICKER_LABELS.count(state.total)}</Badge>
      </header>
      {state.error ? <EmptyCard tone="danger">{state.error}</EmptyCard> : null}
      {state.loading && state.items.length === 0 ? (
        <div class="grid place-items-center py-10"><Spinner className="size-6 text-muted-foreground" /></div>
      ) : state.items.length === 0 ? (
        <EmptyCard>{state.filter === "candidate" && state.loading ? PICKER_LABELS.calculating : PICKER_LABELS.empty}</EmptyCard>
      ) : (
        <div class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 mobile:grid-cols-3" data-picker-grid="">
          {state.items.map((item, index) => (
            <PickerCard key={`${item.asset.key}|${item.asset.name}`} item={item} priority={index < 10} characterId={characterId}
              selected={model.selected.some((a) => sameAsset(a, item.asset))} onToggle={() => model.toggle(item.asset)} onZoom={() => setZoom(item)} />
          ))}
        </div>
      )}
      {state.cursor ? (
        <div ref={sentinel} class="flex justify-center py-2">
          <Button variant="ghost" size="sm" disabled={state.loading} onClick={() => characterId && void loadPage(app, characterId, target, false)}>{state.loading ? <Spinner /> : null}{PICKER_LABELS.loadMore}</Button>
        </div>
      ) : null}
      <ImageViewer open={!!zoom} url={zoom?.url ?? null} alt={zoom?.asset.name ?? ""} onClose={() => setZoom(null)} />
      {characterId ? <CropDialog open={!!cropAsset} asset={cropAsset} characterId={characterId} onClose={() => setCropAsset(null)} onSave={(asset) => model.applyCrop(asset)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Key manager (`$wt`, dock variant)
 * ---------------------------------------------------------------------------------------------- */

function KeyManager({ ctx, promptKey, disabled }: { ctx: WorkspaceCtx; promptKey: string | null; disabled: boolean }) {
  const row = promptKey ? ctx.workspace?.roster.find((r) => r.promptKey === promptKey) : null;
  const stored = (row?.recognitionKeys ?? []).join(", ");
  const [value, setValue] = useState(stored);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(stored), [stored, promptKey]);
  const changed = value.trim() !== stored;
  const enabled = !!row && !disabled;
  const save = async () => {
    if (!ctx.characterId || !promptKey) return;
    setSaving(true);
    try {
      const keys = value.split(/[,\n]/u).map((k) => k.trim()).filter(Boolean);
      await ctx.app.mutateWorkspace("recognitionKeys.set", { characterId: ctx.characterId, promptKey, keys });
    } catch { /* toast shown */ } finally {
      setSaving(false);
    }
  };
  return (
    <section aria-label={PICKER_LABELS.keyManager} class="grid w-full gap-2 p-2" data-key-manager="">
      <p class="text-2xs leading-relaxed text-muted-foreground">{PICKER_LABELS.keyHelp1}<br />{PICKER_LABELS.keyHelp2}</p>
      <textarea
        aria-label={PICKER_LABELS.keyField(row?.title ?? "")}
        placeholder={row ? PICKER_LABELS.keyPlaceholder : PICKER_LABELS.keySelectFirst}
        disabled={!enabled}
        value={value}
        onInput={(e) => setValue((e.currentTarget as HTMLTextAreaElement).value)}
        class="h-24 w-full resize-none rounded-md bg-input px-3 py-2 text-2xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:opacity-45"
      />
      <div class="flex justify-end gap-1">
        <IconButton label={PICKER_LABELS.keyCancel} disabled={!changed || saving} onClick={() => setValue(stored)}><XIcon /></IconButton>
        <IconButton variant="subtle" label={PICKER_LABELS.keySave} disabled={!changed || saving || !enabled} onClick={() => void save()}>{saving ? <Spinner /> : <CheckIcon />}</IconButton>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Dock (`Uxt`)
 * ---------------------------------------------------------------------------------------------- */

export function usePickerDockExpanded(): boolean {
  const ctx = useWorkspaceCtx();
  const target = ctx.sourceUi.pickerTarget;
  return !!target && ctx.session.keyManagerOpen && target.kind !== "artist-extraction" && target.kind !== "persona";
}

export function PickerDock({ target, onDone }: { target: PickerTarget; onDone: () => void }) {
  const ctx = useWorkspaceCtx();
  const { app, characterId } = ctx;
  const model = usePickerModel(ctx, target);
  const store = pickerStore(app);
  const state = useSelector(store, (s) => s);
  const jobs = useAppState((s) => s.analysisJobs);
  const matching = Object.values(jobs).find((j) => !j.finishedAt && j.characterId === characterId && j.kind === "asset-matching");
  const metaCheck = Object.values(jobs).find((j) => !j.finishedAt && j.characterId === characterId && j.kind === "metadata-check");
  const upload = useRef<HTMLInputElement>(null);
  const kind = model.kind;
  const promptKey = model.promptKey;
  const keyable = kind !== "artist-reference" && kind !== "persona-asset-selection" && kind !== "persona-reference" && kind !== "persona-outfit-reference";
  const keysOpen = ctx.session.keyManagerOpen && keyable;
  useEffect(() => {
    if (!promptKey && ctx.session.keyManagerOpen) ctx.sessions.update(characterId, { keyManagerOpen: false });
  }, [promptKey]);

  const filters = pickerFilters(kind);
  const classify = () => {
    if (matching) void app.cancelAnalysis(matching.jobId);
    else if (characterId && promptKey) void app.startAnalysis({ kind: "asset-matching", characterId, promptKeys: [promptKey], force: true });
  };
  const onUpload = async (file: File) => {
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
      const result = await app.call("assets.upload", { ...(target.kind === "persona" ? { personaId: target.personaId } : { characterId: characterId ?? undefined }), fileName: file.name, mimeType: file.type || "image/png", dataBase64: btoa(binary) });
      model.toggle(result.asset);
      if (characterId) void loadPage(app, characterId, target, true);
    } catch (error) {
      app.notifyError(error, PICKER_LABELS.uploadFailed);
    }
  };

  const controls = (
    <>
      <Segmented
        label={PICKER_LABELS.filterGroup}
        value={state.filter}
        onChange={(f) => store.patch({ filter: f, userFilterTouched: true })}
        options={filters.map((f) => ({ value: f, label: PICKER_LABELS.filters[f] ?? f }))}
      />
      {kind !== "artist-reference" ? (
        <LabeledCheckbox label={PICKER_LABELS.hasMeta} checked={state.metadataOnly} onCheckedChange={(v) => store.patch({ metadataOnly: v })} />
      ) : (
        <Button variant="commandAction" size="sm" disabled={!characterId} onClick={() => (metaCheck ? void app.cancelAnalysis(metaCheck.jobId) : characterId && void app.startAnalysis({ kind: "metadata-check", characterId }))}
          aria-label={metaCheck ? PICKER_LABELS.stopMetaCheck : PICKER_LABELS.metaCheck} title={metaCheck ? PICKER_LABELS.stopMetaCheck : PICKER_LABELS.metaCheck}>
          {metaCheck ? <Spinner /> : null}{PICKER_LABELS.metaCheck}
        </Button>
      )}
    </>
  );
  const leading = (
    <>
      {kind !== "artist-reference" ? (
        <CommandButton running={!!matching} label={PICKER_LABELS.classify} stopLabel={PICKER_LABELS.stopClassify} title={PICKER_LABELS.classifyTitle} disabled={!matching && !promptKey} onClick={classify} icon={<SparklesIcon className="text-analyzer-key" />} className="bg-surface-command-action text-secondary-foreground hover:bg-surface-command-action/82" />
      ) : null}
      {keyable ? (
        <Button size="sm" variant={keysOpen ? "subtle" : "ghost"} disabled={!promptKey} aria-expanded={keysOpen} aria-pressed={keysOpen}
          title={!promptKey ? PICKER_LABELS.noLorebook : keysOpen ? PICKER_LABELS.keysClose : PICKER_LABELS.keysOpen}
          onClick={() => ctx.sessions.update(characterId, { keyManagerOpen: !ctx.session.keyManagerOpen })} data-mobile-icon-label="">
          <KeyIcon /><span class="mobile:sr-only">{PICKER_LABELS.keys}</span>
        </Button>
      ) : null}
      <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void onUpload(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
      <IconButton label={PICKER_LABELS.upload} onClick={() => upload.current?.click()}><UploadIcon /></IconButton>
    </>
  );
  const trailing = kind === "character-reference" || kind === "persona-reference" ? (
    <IconButton variant="commandAction" size="command" label={PICKER_LABELS.cropReference} disabled={model.selected.length !== 1 || model.saving}
      onClick={() => ctx.sessions.update(characterId, (s) => ({ cropRequest: s.cropRequest + 1 }))}><CropIcon /></IconButton>
  ) : kind === "outfit-reference" || kind === "persona-outfit-reference" ? (
    <IconButton variant="command" size="command" label={PICKER_LABELS.outfitDone} disabled={model.saving} onClick={() => void model.commit().then(onDone)}>{model.saving ? <Spinner /> : <CheckIcon />}</IconButton>
  ) : undefined;
  return (
    <div class="grid w-full gap-1" data-picker-dock="">
      {keysOpen ? <KeyManager ctx={ctx} promptKey={promptKey} disabled={!!matching} /> : null}
      <DockLayout leading={leading} controls={controls} trailing={trailing} />
    </div>
  );
}

export { pickerStore };
