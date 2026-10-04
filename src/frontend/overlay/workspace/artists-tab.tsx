/**
 * Artists tab (spec/ui.md §3.2): NovelAI list `H_t` (149766) + dock `q_t` (149907), or the Comfy UI (Anima)
 * list `D_t` (149430) + dock `F_t` (149539), chosen by the image provider codec (anima-flat -> Anima).
 * NovelAI selection is per character (`selectedArtistId`); Anima selection is per character with a global default.
 */
import { useEffect } from "preact/hooks";
import { ARTIST_OVERRIDE_RANGES, NO_ARTIST_ID, type AnimaArtistEntry, type ArtistEntry, type ResolvedNovelAIArtist } from "../../../shared/contract/character.js";
import type { AnimaArtistList } from "../../../shared/contract/character.js";
import type { AppController } from "../../state/app-state.js";
import { useAppState } from "../../state/app-state.js";
import { Store, useSelector } from "../../state/store.js";
import { DockLayout } from "../shell/dock.js";
import { Button, ChevronDownIcon, ChevronUpIcon, IconButton, PencilIcon, PlusIcon, SaveIcon, Slider, TrashIcon, XIcon, cn, SettingsIcon } from "../ui/index.js";
import { useWorkspaceCtx, type WorkspaceCtx } from "./context.js";
import { ImageIcon, MinusIcon, SparklesIcon, TypeIcon } from "./icons.js";
import { ARTISTS_LABELS } from "./labels/artists.js";
import { toAssetRef } from "./model.js";
import { useRunningJob } from "./notices.js";
import { AssetImage, Checkbox, EmptyCard, Spinner } from "./parts.js";
import { openPicker } from "./picker.js";

/* ------------------------------------------------------------------------------------------------
 * Store (list + dock draft)
 * ---------------------------------------------------------------------------------------------- */

export interface ArtistForm {
  title: string;
  prompt: string;
  negative: string;
  custom: boolean;
  steps: number;
  scale: number;
  cfgRescale: number;
  weightEnabled: boolean;
  multiplier: number;
}

interface ArtistsState {
  characterId: string | null;
  novelai: ResolvedNovelAIArtist[];
  anima: AnimaArtistList | null;
  selectedNovelAIId: string;
  selectedAnimaId: string;
  loading: boolean;
  error: string | null;
  pending: boolean;
  saveError: string | null;
  form: ArtistForm;
  revision: number;
}

export function emptyArtistForm(config?: { steps: number; scale: number; cfgRescale: number }): ArtistForm {
  return { title: "", prompt: "", negative: "", custom: false, steps: config?.steps ?? 28, scale: config?.scale ?? 5, cfgRescale: config?.cfgRescale ?? 0, weightEnabled: false, multiplier: 0.7 };
}

/** Form values of an existing NovelAI artist (overrides fall back to the global NovelAI values). */
export function artistToForm(artist: ResolvedNovelAIArtist, global: { steps: number; scale: number; cfgRescale: number }): ArtistForm {
  const o = artist.novelAIOverrides;
  return {
    title: artist.title,
    prompt: artist.prompt,
    negative: artist.negativePrompt,
    custom: !!o,
    steps: o?.steps ?? global.steps,
    scale: o?.scale ?? global.scale,
    cfgRescale: o?.cfgRescale ?? global.cfgRescale,
    weightEnabled: artist.nonArtistPromptWeight?.enabled ?? false,
    multiplier: artist.nonArtistPromptWeight?.multiplier ?? 0.7
  };
}

/** Entry to upsert from the dock form (AM `M_t` 149362): built-ins only store overrides/weights. */
export function formToEntry(id: string, form: ArtistForm, builtIn: boolean): ArtistEntry {
  const overrides = form.custom ? { novelAIOverrides: { steps: form.steps, scale: form.scale, cfgRescale: form.cfgRescale } } : {};
  const weight = form.weightEnabled ? { nonArtistPromptWeight: { enabled: true, multiplier: form.multiplier } } : {};
  if (builtIn) return { id, title: form.title, prompt: "", ...overrides, ...weight };
  return { id, title: form.title.trim(), prompt: form.prompt.trim(), ...(form.negative.trim() ? { negativePrompt: form.negative.trim() } : {}), ...overrides, ...weight };
}

const stores = new WeakMap<object, Store<ArtistsState>>();
function artistsStore(app: AppController): Store<ArtistsState> {
  let s = stores.get(app);
  if (!s) stores.set(app, (s = new Store<ArtistsState>({ characterId: null, novelai: [], anima: null, selectedNovelAIId: "", selectedAnimaId: "", loading: false, error: null, pending: false, saveError: null, form: emptyArtistForm(), revision: -1 })));
  return s;
}

async function reloadArtists(app: AppController, characterId: string | null, revision: number): Promise<void> {
  const store = artistsStore(app);
  store.patch({ loading: true, error: null, characterId, revision });
  try {
    const r = await app.call("artists.list", characterId ? { characterId } : {});
    store.patch({ novelai: r.novelai, anima: r.anima, selectedNovelAIId: r.selectedNovelAIId, selectedAnimaId: r.selectedAnimaId, loading: false });
  } catch (error) {
    store.patch({ loading: false, error: error instanceof Error ? error.message : ARTISTS_LABELS.loadFailed });
  }
}

function useArtists(ctx: WorkspaceCtx) {
  const store = artistsStore(ctx.app);
  const state = useSelector(store, (s) => s);
  const revision = useAppState((s) => (ctx.characterId ? s.documentRevision[ctx.characterId] ?? 0 : 0));
  useEffect(() => {
    const s = store.get();
    if (s.characterId !== ctx.characterId || s.revision !== revision) void reloadArtists(ctx.app, ctx.characterId, revision);
  }, [ctx.characterId, revision]);
  return { store, state, reload: () => reloadArtists(ctx.app, ctx.characterId, revision) };
}

export function artistsTitle(anima: boolean): string {
  return anima ? ARTISTS_LABELS.titleAnima : ARTISTS_LABELS.titleNovelAI;
}

function displayTitle(artist: ResolvedNovelAIArtist): string {
  return artist.userDefined ? artist.displayTitle : (ARTISTS_LABELS.presetTitles[artist.id] ?? artist.displayTitle);
}

/* ------------------------------------------------------------------------------------------------
 * Lists
 * ---------------------------------------------------------------------------------------------- */

function Radio({ on }: { on: boolean }) {
  return <span aria-hidden="true" class={cn("grid size-4 shrink-0 place-items-center rounded-full ring-2 ring-inset", on ? "ring-primary" : "ring-muted-foreground/45")}>{on ? <span class="size-2 rounded-full bg-primary" /> : null}</span>;
}

function useArtistActions(ctx: WorkspaceCtx) {
  const { store, reload } = useArtists(ctx);
  const run = async (fn: () => Promise<unknown>) => {
    store.patch({ saveError: null });
    try { await fn(); await reload(); } catch (error) { store.patch({ saveError: error instanceof Error ? error.message : String(error) }); }
  };
  const startEdit = (id: string) => {
    const s = store.get();
    const global = ctx.app.state.config?.novelai ?? { steps: 28, scale: 5, cfgRescale: 0 };
    if (ctx.provider.anima) {
      const entry = s.anima?.entries.find((e) => e.id === id);
      store.patch({ form: { ...emptyArtistForm(global), title: entry?.title ?? "", prompt: entry?.text ?? "" } });
    } else {
      const artist = s.novelai.find((a) => a.id === id);
      store.patch({ form: artist ? artistToForm(artist, global) : emptyArtistForm(global) });
    }
    ctx.sessions.update(ctx.characterId, (x) => ({ artists: { ...x.artists, editingId: id, mode: "text", expanded: true } }));
  };
  return { run, startEdit };
}

function NovelAIList({ ctx }: { ctx: WorkspaceCtx }) {
  const { state } = useArtists(ctx);
  const { run, startEdit } = useArtistActions(ctx);
  const global = useAppState((s) => s.config?.novelai);
  const select = (id: string) => run(() => ctx.app.call("artists.select", { list: "novelai", artistId: id, ...(ctx.characterId ? { characterId: ctx.characterId } : {}) }));
  return (
    <div class="grid gap-2 md:grid-cols-2" data-artist-list="novelai">
      {state.novelai.map((artist) => {
        const selected = artist.id === state.selectedNovelAIId;
        const title = displayTitle(artist);
        const preview = artist.userDefined ? (artist.description || artist.prompt) : (ARTISTS_LABELS.presetDescriptions[artist.id] ?? artist.description);
        const o = artist.novelAIOverrides;
        return (
          <article key={artist.id} class={cn("grid gap-2 rounded-lg bg-card p-3 transition-colors", selected && "bg-selected")} data-artist-card={artist.id} data-selected={selected ? "true" : "false"}>
            <div class="flex min-w-0 items-start gap-2">
              <button type="button" aria-pressed={selected} aria-label={ARTISTS_LABELS.selectOf(title)} onClick={() => void select(artist.id)} class="flex min-w-0 flex-1 items-start gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/55 rounded-md">
                <span class="mt-0.5"><Radio on={selected} /></span>
                <span class="grid min-w-0 gap-1">
                  <strong class="truncate text-xs">{title}</strong>
                  <span class="line-clamp-2 text-2xs leading-relaxed text-muted-foreground" title={artist.description || artist.prompt}>{preview || ARTISTS_LABELS.emptyPrompt}</span>
                </span>
              </button>
              <div class="flex shrink-0 gap-0.5">
                {artist.id !== NO_ARTIST_ID ? (
                  artist.userDefined
                    ? <IconButton size="workbenchIcon" label={ARTISTS_LABELS.editOf(title)} title={ARTISTS_LABELS.edit} onClick={() => startEdit(artist.id)}><PencilIcon /></IconButton>
                    : <IconButton size="workbenchIcon" label={ARTISTS_LABELS.settingsOf(title)} title={ARTISTS_LABELS.settings} onClick={() => startEdit(artist.id)}><SettingsIcon /></IconButton>
                ) : null}
                {artist.userDefined ? (
                  <IconButton size="workbenchIcon" label={ARTISTS_LABELS.deleteOf(title)} title={ARTISTS_LABELS.delete} onClick={() => void run(async () => {
                    await ctx.app.call("artists.deleteNovelAI", { id: artist.id });
                    if (selected && ctx.characterId) await ctx.app.call("artists.select", { list: "novelai", artistId: NO_ARTIST_ID, characterId: ctx.characterId });
                    if (ctx.session.artists.editingId === artist.id) ctx.sessions.update(ctx.characterId, (s) => ({ artists: { ...s.artists, editingId: "" } }));
                  })}><TrashIcon /></IconButton>
                ) : null}
              </div>
            </div>
            <dl class="grid grid-cols-3 gap-1 text-center">
              {([["STEPS", String(o?.steps ?? global?.steps ?? 28)], ["SCALE", (o?.scale ?? global?.scale ?? 5).toFixed(1)], ["RESCALE", (o?.cfgRescale ?? global?.cfgRescale ?? 0).toFixed(2)]] as const).map(([k, v]) => (
                <div key={k} class="rounded-md bg-surface-control px-1.5 py-1"><dt class="text-3xs font-black text-muted-foreground">{k}</dt><dd class="text-2xs font-bold tabular-nums">{v}</dd></div>
              ))}
            </dl>
          </article>
        );
      })}
    </div>
  );
}

function AnimaList({ ctx }: { ctx: WorkspaceCtx }) {
  const { state } = useArtists(ctx);
  const { run, startEdit } = useArtistActions(ctx);
  const entries: (AnimaArtistEntry & { builtIn?: boolean })[] = [{ id: NO_ARTIST_ID, title: "none", text: "none", builtIn: true }, ...(state.anima?.entries ?? [])];
  return (
    <div class="grid gap-2 md:grid-cols-2" data-artist-list="anima">
      {entries.map((entry) => {
        const selected = entry.id === state.selectedAnimaId;
        return (
          <article key={entry.id} class={cn("flex min-w-0 items-start gap-2 rounded-lg bg-card p-3", selected && "bg-selected")} data-artist-card={entry.id} data-selected={selected ? "true" : "false"}>
            <button type="button" aria-pressed={selected} aria-label={ARTISTS_LABELS.selectOf(entry.title)} class="flex min-w-0 flex-1 items-start gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/55"
              onClick={() => void run(() => ctx.app.call("artists.select", { list: "anima", artistId: entry.id, ...(ctx.characterId ? { characterId: ctx.characterId } : {}) }))}>
              <span class="mt-0.5"><Radio on={selected} /></span>
              <span class="grid min-w-0 gap-1">
                <strong class="truncate text-xs">{entry.title}</strong>
                {!entry.builtIn ? <span class="line-clamp-2 text-2xs text-muted-foreground">{entry.text}</span> : null}
              </span>
            </button>
            {!entry.builtIn ? (
              <div class="flex shrink-0 gap-0.5">
                <IconButton size="workbenchIcon" label={ARTISTS_LABELS.editOf(entry.title)} title={ARTISTS_LABELS.edit} onClick={() => startEdit(entry.id)}><PencilIcon /></IconButton>
                <IconButton size="workbenchIcon" label={ARTISTS_LABELS.deleteOf(entry.title)} title={ARTISTS_LABELS.delete} onClick={() => void run(() => ctx.app.call("artists.deleteAnima", { id: entry.id }))}><TrashIcon /></IconButton>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function ArtistsContent() {
  const ctx = useWorkspaceCtx();
  const { state } = useArtists(ctx);
  return (
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      {state.error ? <EmptyCard tone="danger">{state.error}</EmptyCard> : null}
      {state.saveError ? <p role="alert" class="rounded-md bg-destructive/12 px-3 py-2 text-xs text-destructive">{state.saveError}</p> : null}
      {state.loading && !state.anima ? <div class="grid place-items-center py-10"><Spinner className="size-6 text-muted-foreground" /></div>
        : ctx.provider.anima ? <AnimaList ctx={ctx} /> : <NovelAIList ctx={ctx} />}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Docks
 * ---------------------------------------------------------------------------------------------- */

function Stepper({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  const r = ARTIST_OVERRIDE_RANGES.steps;
  return (
    <div class="inline-flex h-7.5 items-center gap-1 rounded-md bg-surface-control px-1" role="group" aria-label="STEPS">
      <span class="px-1 text-3xs font-black text-muted-foreground">STEPS</span>
      <IconButton size="icon" className="size-6" label={ARTISTS_LABELS.stepDecrease} disabled={disabled || value <= r.min} onClick={() => onChange(Math.max(r.min, value - 1))}><MinusIcon /></IconButton>
      <output class="w-6 text-center text-2xs font-bold tabular-nums">{value}</output>
      <IconButton size="icon" className="size-6" label={ARTISTS_LABELS.stepIncrease} disabled={disabled || value >= r.max} onClick={() => onChange(Math.min(r.max, value + 1))}><PlusIcon /></IconButton>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, digits, disabled, onChange, ariaLabel }: { label: string; value: number; min: number; max: number; step: number; digits: number; disabled: boolean; onChange: (v: number) => void; ariaLabel?: string }) {
  return (
    <label class="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-3xs font-black text-muted-foreground">
      {label}
      <Slider min={min} max={max} step={step} value={value} disabled={disabled} onValueChange={onChange} aria-label={ariaLabel ?? label} />
      <output class="text-2xs font-bold tabular-nums text-foreground">{value.toFixed(digits)}</output>
    </label>
  );
}

const field = "w-full min-w-0 rounded-md bg-input px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/65 focus-visible:ring-2 focus-visible:ring-ring/55 read-only:opacity-60";

export function ArtistsDock() {
  const ctx = useWorkspaceCtx();
  const { state, store, reload } = useArtists(ctx);
  const { app, characterId, session, sessions, provider, workspace } = ctx;
  const ui = session.artists;
  const setUi = (patch: Partial<typeof ui>) => sessions.update(characterId, (s) => ({ artists: { ...s.artists, ...patch } }));
  const form = state.form;
  const setForm = (patch: Partial<ArtistForm>) => store.patch({ form: { ...store.get().form, ...patch } });
  const editing = ui.editingId;
  const extraction = useRunningJob(characterId, ["artist-extraction"]);
  const extractionAsset = toAssetRef(workspace?.document.characterPrompt.artistExtractionAssetBySourceId[characterId ?? ""] ?? null);
  const cancelEdit = () => { setUi({ editingId: "" }); store.patch({ form: emptyArtistForm(app.state.config?.novelai), saveError: null }); };

  if (provider.anima) {
    const save = async () => {
      store.patch({ pending: true, saveError: null });
      try {
        const { entry } = await app.call("artists.upsertAnima", { entry: { id: editing || "", title: form.title.trim(), text: form.prompt.trim() } });
        if (characterId) await app.call("artists.select", { list: "anima", artistId: entry.id, characterId });
        cancelEdit();
        await reload();
      } catch (error) {
        store.patch({ saveError: error instanceof Error ? error.message : String(error) });
      } finally {
        store.patch({ pending: false });
      }
    };
    return (
      <fieldset disabled={state.pending} class="relative grid w-full gap-2 p-1" data-artist-dock="anima">
        <button type="button" class="absolute -top-6 left-1/2 grid h-5 w-16 -translate-x-1/2 place-items-center rounded-t-lg bg-surface-command text-muted-foreground hover:text-foreground" aria-expanded={ui.expanded}
          aria-label={ui.expanded ? ARTISTS_LABELS.animaCollapse : ARTISTS_LABELS.animaExpand} title={ui.expanded ? ARTISTS_LABELS.animaCollapse : ARTISTS_LABELS.animaExpand} onClick={() => setUi({ expanded: !ui.expanded })}>
          {ui.expanded ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </button>
        {ui.expanded ? (
          <div class="grid gap-2 px-2">
            <input class={cn(field, "h-9")} placeholder={ARTISTS_LABELS.animaName} aria-label={ARTISTS_LABELS.animaNameAria} value={form.title} onInput={(e) => setForm({ title: (e.currentTarget as HTMLInputElement).value })} />
            <textarea class={cn(field, "h-24 resize-none py-2")} placeholder={ARTISTS_LABELS.animaTags} aria-label={ARTISTS_LABELS.animaTagsAria} value={form.prompt} onInput={(e) => setForm({ prompt: (e.currentTarget as HTMLTextAreaElement).value })} />
          </div>
        ) : null}
        <div class="flex items-center gap-2 px-1">
          <span class="min-w-0 flex-1 truncate text-2xs text-destructive">{state.saveError ?? ""}</span>
          {editing ? <IconButton label={ARTISTS_LABELS.animaCancel} title={ARTISTS_LABELS.cancelEdit} onClick={cancelEdit}><XIcon /></IconButton> : null}
          <Button size="command" variant="command" disabled={state.pending || !form.title.trim() || !form.prompt.trim()} onClick={() => void save()}
            aria-label={editing ? ARTISTS_LABELS.animaSave : ARTISTS_LABELS.animaAdd} title={editing ? ARTISTS_LABELS.saveShort : ARTISTS_LABELS.addShort}>
            {state.pending ? <Spinner /> : editing ? <SaveIcon /> : <PlusIcon />}
          </Button>
        </div>
      </fieldset>
    );
  }

  const editingArtist = state.novelai.find((a) => a.id === editing);
  const builtIn = !!editingArtist && !editingArtist.userDefined;
  const save = async () => {
    store.patch({ pending: true, saveError: null });
    try {
      if (!(builtIn && editing === NO_ARTIST_ID)) {
        const { entry } = await app.call("artists.upsertNovelAI", { entry: formToEntry(editing || "", form, builtIn) });
        if (characterId) await app.call("artists.select", { list: "novelai", artistId: entry.id, characterId });
      }
      cancelEdit();
      await reload();
    } catch (error) {
      store.patch({ saveError: error instanceof Error ? error.message : String(error) });
    } finally {
      store.patch({ pending: false });
    }
  };
  const toggleMode = (mode: "text" | "image") => setUi(ui.mode === mode && ui.expanded ? { expanded: false } : { mode, expanded: true });
  const custom = form.custom;
  const textBody = (
    <div class="grid gap-2 px-2" data-artist-text-input="">
      <input class={cn(field, "h-9")} placeholder={ARTISTS_LABELS.fieldTitle} aria-label={ARTISTS_LABELS.fieldTitle} readOnly={builtIn} value={builtIn && editingArtist ? displayTitle(editingArtist) : form.title} onInput={(e) => setForm({ title: (e.currentTarget as HTMLInputElement).value })} />
      <div class="grid gap-2 md:grid-cols-2">
        <textarea class={cn(field, "h-20 resize-none py-2")} placeholder={ARTISTS_LABELS.fieldPositive} aria-label={ARTISTS_LABELS.fieldPositive} readOnly={builtIn} value={form.prompt} onInput={(e) => setForm({ prompt: (e.currentTarget as HTMLTextAreaElement).value })} />
        <textarea class={cn(field, "h-20 resize-none py-2")} placeholder={ARTISTS_LABELS.fieldNegative} aria-label={ARTISTS_LABELS.fieldNegativeAria} readOnly={builtIn} value={form.negative} onInput={(e) => setForm({ negative: (e.currentTarget as HTMLTextAreaElement).value })} />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="inline-flex items-center gap-2 text-2xs font-bold" title={ARTISTS_LABELS.customAria}>
          <Checkbox checked={custom} label={ARTISTS_LABELS.customAria} onCheckedChange={(v) => {
            const g = app.state.config?.novelai;
            setForm({ custom: v, ...(v && g ? { steps: form.steps || g.steps, scale: form.scale, cfgRescale: form.cfgRescale } : {}) });
          }} />{ARTISTS_LABELS.custom}
        </span>
        <Stepper value={form.steps} disabled={!custom} onChange={(steps) => setForm({ steps })} />
        <div class="grid min-w-56 flex-1 gap-1">
          <SliderRow label="SCALE" value={form.scale} min={0} max={20} step={0.1} digits={1} disabled={!custom} onChange={(scale) => setForm({ scale })} />
          <SliderRow label="RESCALE" value={form.cfgRescale} min={0} max={1} step={0.01} digits={2} disabled={!custom} onChange={(cfgRescale) => setForm({ cfgRescale })} />
        </div>
      </div>
      <div class="flex items-center gap-2" title={ARTISTS_LABELS.weightTitle}>
        <span class="inline-flex shrink-0 items-center gap-2 text-2xs font-bold">
          <Checkbox checked={form.weightEnabled} label={ARTISTS_LABELS.weightAria} onCheckedChange={(v) => setForm({ weightEnabled: v })} />{ARTISTS_LABELS.weight}
        </span>
        <output class="w-12 text-2xs font-bold tabular-nums">×{form.multiplier.toFixed(2)}</output>
        <div class="min-w-0 flex-1"><Slider min={0.5} max={1} step={0.05} value={form.multiplier} disabled={!form.weightEnabled} onValueChange={(multiplier) => setForm({ multiplier })} aria-label={ARTISTS_LABELS.weightSlider} /></div>
      </div>
    </div>
  );
  const imageBody = (
    <div class="flex justify-center px-2" data-artist-image-input="">
      <button type="button" class="relative h-44 w-33 overflow-hidden rounded-md bg-surface-control outline-none focus-visible:ring-2 focus-visible:ring-ring/55" aria-label={ARTISTS_LABELS.extractImage} title={ARTISTS_LABELS.extractImage}
        onClick={() => { sessions.update(characterId, { returnTarget: "closed" }); openPicker(ctx, { kind: "artist-extraction" }); }}>
        {extractionAsset ? <AssetImage asset={extractionAsset} alt="" /> : <span class="grid size-full place-items-center"><ImageIcon className="size-6 text-muted-foreground" /></span>}
      </button>
    </div>
  );
  const status = editing ? (builtIn ? ARTISTS_LABELS.configuring(editingArtist ? displayTitle(editingArtist) : editing) : ARTISTS_LABELS.editing(form.title || editing)) : "";
  return (
    <fieldset disabled={state.pending} class="relative grid w-full gap-2 p-1" data-artist-dock="novelai">
      <button type="button" class="absolute -top-6 left-1/2 grid h-5 w-16 -translate-x-1/2 place-items-center rounded-t-lg bg-surface-command text-muted-foreground hover:text-foreground" aria-expanded={ui.expanded}
        aria-label={ui.expanded ? ARTISTS_LABELS.collapse : ARTISTS_LABELS.expand} title={ui.expanded ? ARTISTS_LABELS.collapse : ARTISTS_LABELS.expand} onClick={() => setUi({ expanded: !ui.expanded })}>
        {ui.expanded ? <ChevronDownIcon /> : <ChevronUpIcon />}
      </button>
      {ui.expanded ? (ui.mode === "text" ? textBody : imageBody) : null}
      <DockLayout
        leading={
          <div class="inline-flex items-center gap-0.5 rounded-full bg-surface-control p-0.5">
            <IconButton size="commandSm" variant={ui.mode === "text" ? "subtle" : "ghost"} aria-pressed={ui.mode === "text"} label={ui.mode === "text" && ui.expanded ? ARTISTS_LABELS.textCollapse : ARTISTS_LABELS.textExpand} title={ARTISTS_LABELS.textMode} onClick={() => toggleMode("text")}><TypeIcon /></IconButton>
            <IconButton size="commandSm" variant={ui.mode === "image" ? "subtle" : "ghost"} aria-pressed={ui.mode === "image"} label={ui.mode === "image" && ui.expanded ? ARTISTS_LABELS.imageCollapse : ARTISTS_LABELS.imageExpand} title={ARTISTS_LABELS.imageMode} onClick={() => toggleMode("image")}><ImageIcon /></IconButton>
          </div>
        }
        controls={
          <>
            {status ? <span class="max-w-60 truncate text-2xs font-bold text-muted-foreground">{status}</span> : null}
            {state.saveError ? <span class="max-w-60 truncate text-2xs text-destructive" title={state.saveError}>{state.saveError}</span> : null}
            {editing ? <IconButton label={ARTISTS_LABELS.cancelEdit} title={ARTISTS_LABELS.cancelEdit} onClick={cancelEdit}><XIcon /></IconButton> : null}
          </>
        }
        trailing={ui.mode === "text" ? (
          <Button size="command" variant="command" disabled={state.pending || (!builtIn && (!form.title.trim() || !form.prompt.trim()))} onClick={() => void save()}
            aria-label={editing ? ARTISTS_LABELS.save : ARTISTS_LABELS.add} title={editing ? ARTISTS_LABELS.save : ARTISTS_LABELS.add}>
            {state.pending ? <Spinner /> : editing ? <SaveIcon /> : <PlusIcon />}
          </Button>
        ) : (
          <Button size="command" variant="command" disabled={!characterId || (!extractionAsset && !extraction)}
            onClick={() => (extraction ? void app.cancelAnalysis(extraction.jobId) : characterId && extractionAsset && void app.startAnalysis({ kind: "artist-extraction", characterId, asset: extractionAsset }))}
            aria-label={extraction ? ARTISTS_LABELS.stopExtract : ARTISTS_LABELS.extract} title={extraction ? ARTISTS_LABELS.stopExtract : ARTISTS_LABELS.extract}>
            {extraction ? <Spinner /> : <SparklesIcon className="text-primary" />}
          </Button>
        )}
      />
    </fieldset>
  );
}
