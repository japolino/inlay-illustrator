/**
 * Zoom viewer panels: chat images sidebar (AM `$kt`/`Rkt`), generation log (AM `Bkt`/`Ukt`), generation
 * settings footer (AM `KU`), prompt fields (AM `e_e`/`Dkt`), analyzer text (AM `Zxe`), slot-delete dialog
 * (AM `T0e`) and the chat state window (AM `WIt`, on `chatState.get/set/clear`).
 */
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useSelector } from "../state/store.js";
import { outfitDisplayLabel } from "../overlay/workspace/model.js";
import type { CurrentActorState } from "../../shared/contract/chat.js";
import type { SlotDeletionPreview, ZoomDetails, ZoomPromptSection } from "../../shared/contract/rpc.js";
import { cn } from "../overlay/ui/cn.js";
import { Button, Dialog, IconButton, Select, useConfirm } from "../overlay/ui/index.js";
import type { AppController } from "../state/app-state.js";
import { AlertIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, LoaderIcon, RefreshIcon, SaveIcon, TrashIcon } from "./icons.js";
import { fill, ZOOM_LABELS } from "./labels.js";
import { formatCenter, type CoordinateMarker, type SizeOption, type ZoomImageGroup, type ZoomImageItem } from "./model.js";
import { markerColor } from "./stage.js";

/* ------------------------------------------------------------------------------------------------
 * Thumbnails
 * ---------------------------------------------------------------------------------------------- */

function Thumb({ url, label, selected, disabled, badge, onClick, className, data }: { url: string; label: string; selected: boolean; disabled?: boolean; badge?: string; onClick: () => void; className?: string; data?: Record<string, string> }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={label}
      aria-label={label}
      disabled={disabled && !selected}
      onClick={onClick}
      class={cn(
        "relative block aspect-[832/1216] w-full overflow-hidden rounded-md bg-muted outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45",
        selected ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100",
        className
      )}
      {...data}
    >
      <img src={url} alt="" loading="lazy" decoding="async" class="absolute inset-0 size-full object-cover" style={{ maxWidth: "none", height: "100%" }} />
      {badge ? <span class="absolute left-1 top-1 rounded-sm bg-background/82 px-1 text-3xs font-black">{badge}</span> : null}
    </button>
  );
}

export function itemLabel(item: ZoomImageItem): string {
  return item.assetName.split(".__am__.")[0] || item.assetName;
}

/* ------------------------------------------------------------------------------------------------
 * Chat images
 * ---------------------------------------------------------------------------------------------- */

export function RevisionPager({ group, disabled, onStep }: { group: ZoomImageGroup; disabled?: boolean; onStep: (delta: number) => void }) {
  if (group.revisionCount < 2) return null;
  return (
    <span class="inline-flex items-center rounded-md bg-surface-badge" role="group" aria-label={fill(ZOOM_LABELS.revisionGroup, { n: group.ordinal, i: group.revisionPosition + 1, k: group.revisionCount })}>
      <IconButton label={ZOOM_LABELS.previousRevision} size="sm" className="h-6 w-6 px-0" disabled={disabled} onClick={() => onStep(-1)}><ChevronLeftIcon className="size-3.5" /></IconButton>
      <span class="min-w-8 text-center font-mono text-2xs text-muted-foreground">{group.revisionPosition + 1}/{group.revisionCount}</span>
      <IconButton label={ZOOM_LABELS.nextRevision} size="sm" className="h-6 w-6 px-0" disabled={disabled} onClick={() => onStep(1)}><ChevronRightIcon className="size-3.5" /></IconButton>
    </span>
  );
}

export function ChatImagesList({ groups, items, currentSlotId, disabled, layout, onSelect, onStepRevision }: { groups: ZoomImageGroup[]; items: ZoomImageItem[]; currentSlotId: string; disabled?: boolean; layout: "sidebar" | "strip"; onSelect: (item: ZoomImageItem) => void; onStepRevision: (group: ZoomImageGroup, delta: number) => void }) {
  if (groups.length === 0) return <p class="px-1 py-3 text-xs text-muted-foreground">{ZOOM_LABELS.none}</p>;
  return (
    <div class={cn(layout === "sidebar" ? "grid gap-3" : "flex gap-3 overflow-x-auto pb-1")}>
      {groups.map((group) => (
        <section key={group.groupId} aria-label={fill(ZOOM_LABELS.messageImages, { n: group.ordinal })} class={cn("group/msg grid gap-1.5", layout === "strip" && "shrink-0 auto-cols-[80px] grid-flow-col items-end")}>
          <div class={cn("flex min-h-6 items-center justify-between gap-1 text-2xs font-bold text-muted-foreground", layout === "strip" && "col-span-full")}>
            <span class="truncate">{fill(ZOOM_LABELS.message, { n: group.ordinal })}</span>
            <RevisionPager group={group} disabled={disabled} onStep={(delta) => onStepRevision(group, delta)} />
          </div>
          {group.items.map((item) => (
            <Thumb
              key={item.itemId}
              url={item.url}
              label={itemLabel(item)}
              selected={item.slotId === currentSlotId}
              disabled={disabled}
              onClick={() => onSelect(item)}
              className={layout === "strip" ? "w-20" : undefined}
              data={{ "data-ii-zoom-chat-image": item.slotId }}
            />
          ))}
        </section>
      ))}
      {items.length === 0 ? <p class="text-xs text-muted-foreground">{ZOOM_LABELS.none}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Generation log
 * ---------------------------------------------------------------------------------------------- */

export function HistoryList({ details, disabled, layout, onSelect }: { details: ZoomDetails; disabled?: boolean; layout: "sidebar" | "strip"; onSelect: (entryId: string) => void }) {
  return (
    <div class={cn(layout === "sidebar" ? "grid gap-2" : "flex gap-2 overflow-x-auto pb-1")}>
      {details.history.map((entry) => (
        <Thumb
          key={entry.entryId}
          url={entry.url}
          label={entry.kind === "original" ? ZOOM_LABELS.original : entry.assetName.split(".__am__.")[0] || entry.assetName}
          selected={entry.entryId === details.entryId}
          disabled={disabled}
          badge={entry.kind === "original" ? ZOOM_LABELS.original : details.promptDraftActive && entry.entryId === details.entryId ? ZOOM_LABELS.promptSourceBadge : undefined}
          onClick={() => onSelect(entry.entryId)}
          className={layout === "strip" ? "w-20 shrink-0" : undefined}
          data={{ "data-ii-zoom-history-entry": entry.entryId }}
        />
      ))}
    </div>
  );
}

export function HistoryActions({ details, disabled, onSave, onDelete }: { details: ZoomDetails; disabled?: boolean; onSave: () => void; onDelete: () => void }) {
  const confirm = useConfirm();
  return (
    <>
      <IconButton label={ZOOM_LABELS.saveImage} disabled={disabled || !details.url} onClick={onSave} data-ii-zoom-save=""><SaveIcon /></IconButton>
      <IconButton
        label={ZOOM_LABELS.deleteLogImage}
        disabled={disabled || !details.canDelete}
        onClick={async () => {
          const ok = await confirm({ title: ZOOM_LABELS.deleteLogConfirmTitle, description: ZOOM_LABELS.deleteLogConfirmDescription, confirmLabel: ZOOM_LABELS.delete, cancelLabel: ZOOM_LABELS.cancel });
          if (ok) onDelete();
        }}
        data-ii-zoom-delete-entry=""
      >
        <TrashIcon />
      </IconButton>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Generation settings footer (KU)
 * ---------------------------------------------------------------------------------------------- */

export function GenerationFooter({ details, sizes, disabled, layout, regenerating, onSeedFixed, onSize, onRegenerate }: { details: ZoomDetails; sizes: SizeOption[]; disabled?: boolean; layout: "sidebar" | "info" | "gallery"; regenerating: boolean; onSeedFixed: (fixed: boolean) => void; onSize: (sizeId: number) => void; onRegenerate: () => void }) {
  const options = sizes.map((s) => ({ value: String(s.id), label: `${s.width} × ${s.height}${s.custom ? ` · ${ZOOM_LABELS.custom}` : ""}` }));
  if (!sizes.some((s) => s.id === details.sizeId)) options.unshift({ value: String(details.sizeId), label: `${details.width} × ${details.height}` });
  return (
    <div class={cn("grid gap-2", layout === "sidebar" ? "border-t border-border pt-2" : layout === "info" ? "grid-cols-[auto_minmax(0,1fr)_auto] items-center border-t border-border pt-2" : "")} data-ii-zoom-generation-footer={layout}>
      <div class="flex min-w-0 items-center gap-2">
        <span class="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-surface-badge px-2 py-1 text-2xs" title={details.seed || ZOOM_LABELS.noSeed}>
          <span class="font-black text-muted-foreground">{ZOOM_LABELS.seed}</span>
          <span class="truncate font-mono">{details.seed || "—"}</span>
        </span>
        <label class="inline-flex shrink-0 items-center gap-1.5 text-2xs font-bold" title={ZOOM_LABELS.fixSeedTitle}>
          <input type="checkbox" class="size-3.5 accent-[var(--color-primary)]" checked={details.seedFixed} disabled={disabled || !details.seed || !details.canRegenerate} onChange={(e) => onSeedFixed((e.currentTarget as HTMLInputElement).checked)} />
          {ZOOM_LABELS.fix}
        </label>
      </div>
      <div class="flex min-w-0 items-center gap-1.5">
        <div class="min-w-0 flex-1">
          <Select value={String(details.sizeId)} options={options} onValueChange={(v) => onSize(Number(v))} disabled={disabled || !details.canRegenerate} aria-label={ZOOM_LABELS.imageSize} className="w-full" />
        </div>
        {layout !== "gallery" ? (
          <IconButton label={ZOOM_LABELS.regenerate} title={ZOOM_LABELS.regenerateTitle} variant="subtle" disabled={disabled || !details.canRegenerate || regenerating} onClick={onRegenerate} data-ii-zoom-regenerate="">
            {regenerating ? <LoaderIcon /> : <RefreshIcon />}
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Prompt fields (e_e)
 * ---------------------------------------------------------------------------------------------- */

export function sectionAria(section: ZoomPromptSection): string {
  if (section.target === "provider") return ZOOM_LABELS.positivePrompt;
  if (section.target === "main") return ZOOM_LABELS.mainPrompt;
  return fill(ZOOM_LABELS.actorPrompt, { label: section.label });
}

export interface PromptFieldProps {
  section: ZoomPromptSection;
  ordinal: number;
  editing: boolean;
  draft: ZoomPromptSection;
  onDraft: (next: ZoomPromptSection) => void;
  providerLabel: string;
  excluded: boolean;
  includeDisabled: boolean;
  onIncluded: (included: boolean) => void;
  marker?: CoordinateMarker;
  coordinateActive: boolean;
  coordinateDisabled: boolean;
  onCoordinate: () => void;
  compact?: boolean;
  /** Artist / outfit selects (zoom choices); disabled while busy, editing or locked. */
  choicesDisabled?: boolean;
  onArtist?: (artistId: string) => void;
  onOutfit?: (actorKey: string, outfitId: string) => void;
}

export function PromptField({ section, ordinal, editing, draft, onDraft, providerLabel, excluded, includeDisabled, onIncluded, marker, coordinateActive, coordinateDisabled, onCoordinate, compact, choicesDisabled, onArtist, onOutfit }: PromptFieldProps) {
  const [negativeOpen, setNegativeOpen] = useState(false);
  const aria = sectionAria(section);
  const actor = section.target === "actor";
  const readOnly = !editing || excluded;
  return (
    <article class={cn("flex min-h-0 flex-col gap-2 rounded-lg bg-card p-2.5", excluded && "opacity-45", !compact && (actor ? "min-h-48" : "min-h-56"))} data-ii-zoom-prompt-field={section.id}>
      <header class="flex min-h-6 items-center justify-between gap-2">
        <span class="truncate text-xs font-extrabold">{section.target === "main" ? ZOOM_LABELS.mainPrompt : section.target === "provider" ? ZOOM_LABELS.positivePrompt : section.label}</span>
        {actor ? (
          <label class="inline-flex shrink-0 items-center gap-1.5 text-2xs font-bold" title={ZOOM_LABELS.includeTitle}>
            <input type="checkbox" class="size-3.5 accent-[var(--color-primary)]" checked={!excluded} disabled={includeDisabled} onChange={(e) => onIncluded((e.currentTarget as HTMLInputElement).checked)} />
            {ZOOM_LABELS.include}
            <span class="sr-only">{fill(ZOOM_LABELS.includeSr, { n: ordinal, label: section.label })}</span>
          </label>
        ) : null}
      </header>
      <div class="flex flex-wrap items-center gap-1.5 text-2xs">
        {actor ? (
          marker ? (
            <button
              type="button"
              class={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45", coordinateActive ? "bg-selected" : "bg-surface-badge hover:bg-accent")}
              disabled={coordinateDisabled}
              aria-label={fill(coordinateActive ? ZOOM_LABELS.cancelCoordinate : ZOOM_LABELS.editCoordinate, { label: section.label })}
              title={coordinateActive ? ZOOM_LABELS.cancelCoordinateTitle : ZOOM_LABELS.editCoordinateTitle}
              onClick={onCoordinate}
              data-ii-zoom-coordinate-button=""
            >
              <span class="text-muted-foreground">{ZOOM_LABELS.coordinate}</span>
              <span class="font-mono">{formatCenter(marker.center, ZOOM_LABELS.aiChoice)}</span>
              <span class={cn("grid size-5 place-items-center rounded-full border-2 border-white/90 text-3xs font-black text-white", markerColor(marker.colorIndex))} aria-hidden="true">{marker.ordinal}</span>
            </button>
          ) : null
        ) : (
          <span class="inline-flex items-center gap-1.5 rounded-md bg-surface-badge px-2 py-1 font-bold"><span class="text-muted-foreground">{ZOOM_LABELS.provider}</span>{providerLabel}</span>
        )}
        {!actor && section.artistChoices?.length && onArtist ? (
          <span class="inline-flex min-w-0 items-center gap-1.5" data-ii-zoom-artist-select="">
            <span class="font-bold text-muted-foreground">{ZOOM_LABELS.artist}</span>
            <Select
              value={section.selectedArtistId || null}
              options={section.artistChoices.map((c) => ({ value: c.id, label: c.label }))}
              onValueChange={(id) => onArtist(id)}
              disabled={choicesDisabled}
              aria-label={ZOOM_LABELS.artistSelect}
              className="h-7 min-w-32 max-w-56 text-2xs"
            />
          </span>
        ) : null}
        {actor && section.actorKey && section.outfitChoices?.length && onOutfit ? (
          <span class="inline-flex min-w-0 items-center gap-1.5" data-ii-zoom-outfit-select={section.actorKey}>
            <span class="font-bold text-muted-foreground">{ZOOM_LABELS.outfit}</span>
            <Select
              value={section.selectedOutfitId || null}
              options={section.outfitChoices.map((c, i) => ({ value: c.id, label: outfitDisplayLabel({ id: c.id, label: c.label === c.id ? "" : c.label }, i) }))}
              onValueChange={(id) => onOutfit(section.actorKey!, id)}
              disabled={choicesDisabled || excluded}
              aria-label={fill(ZOOM_LABELS.outfitSelect, { label: section.label })}
              className="h-7 min-w-28 max-w-48 text-2xs"
            />
          </span>
        ) : null}
      </div>
      <textarea
        aria-label={aria}
        readOnly={readOnly}
        value={editing ? draft.value : section.value}
        onInput={(e) => onDraft({ ...draft, value: (e.currentTarget as HTMLTextAreaElement).value })}
        class={cn("min-h-24 w-full flex-1 resize-none rounded-md bg-surface-prompt-field px-2.5 py-2 font-mono text-2xs leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/55 mobile:text-sm", editing && !excluded && "ring-1 ring-primary/40")}
      />
      {negativeOpen ? (
        <textarea
          aria-label={fill(ZOOM_LABELS.negativeAria, { label: aria })}
          placeholder={ZOOM_LABELS.negativePlaceholder}
          readOnly={readOnly}
          value={editing ? draft.negativeValue : section.negativeValue}
          onInput={(e) => onDraft({ ...draft, negativeValue: (e.currentTarget as HTMLTextAreaElement).value })}
          class="min-h-16 w-full resize-none rounded-md bg-surface-prompt-field px-2.5 py-2 font-mono text-2xs leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/55 mobile:text-sm"
        />
      ) : null}
      <footer class="flex justify-end">
        <button type="button" class={cn("rounded-sm px-1.5 text-2xs font-bold", negativeOpen ? "text-primary" : "text-muted-foreground hover:text-foreground")} aria-expanded={negativeOpen} onClick={() => setNegativeOpen(!negativeOpen)}>
          {ZOOM_LABELS.negative}
        </button>
      </footer>
    </article>
  );
}

export function StatusBox({ tone, children }: { tone: "loading" | "error" | "empty"; children: ComponentChildren }) {
  return (
    <div role="status" class={cn("flex items-center gap-2 rounded-md p-3 text-xs", tone === "error" ? "bg-destructive/12 text-destructive" : "bg-card text-muted-foreground")}>
      {tone === "loading" ? <LoaderIcon /> : tone === "error" ? <AlertIcon /> : null}
      <span>{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Analyzer text (Zxe)
 * ---------------------------------------------------------------------------------------------- */

export function AnalyzerText({ text }: { text: string }) {
  const lines = (text || ZOOM_LABELS.noAnalyzer).split("\n");
  return (
    <pre class="min-h-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-prompt-field p-3 font-mono text-2xs leading-relaxed">
      {lines.map((line, i) => {
        if (/^\[.+\]$/u.test(line.trim())) return <div key={i} class="font-black">{line}</div>;
        const m = /^([\w.]+):\s?(.*)$/u.exec(line);
        if (!m) return <div key={i}>{line || "\u00a0"}</div>;
        return (
          <div key={i}>
            <span class="text-analyzer-key">{m[1]}:</span>{" "}
            <span class={m[2] === "(none)" ? "text-analyzer-none" : "text-analyzer-value"}>{m[2]}</span>
          </div>
        );
      })}
    </pre>
  );
}

export function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <IconButton label={label} title={copied ? copiedLabel : label} disabled={!text.trim()} onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => undefined)}>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </IconButton>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Slot delete dialog (T0e)
 * ---------------------------------------------------------------------------------------------- */

export function SlotDeleteDialog({ preview, deleting, onCancel, onConfirm }: { preview: SlotDeletionPreview | null; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog
      open={!!preview}
      onOpenChange={(open) => { if (!open && !deleting) onCancel(); }}
      role="alertdialog"
      title={ZOOM_LABELS.deleteSlotTitle}
      description={<>{ZOOM_LABELS.deleteSlotDescription}<br />{ZOOM_LABELS.deleteSlotIrreversible}</>}
      showCloseButton={false}
      dismissible={!deleting}
      footer={
        <>
          <Button variant="subtle" disabled={deleting} onClick={onCancel} data-ii-zoom-slot-cancel="">{ZOOM_LABELS.cancel}</Button>
          <Button variant="danger" disabled={deleting} onClick={onConfirm} data-ii-zoom-slot-confirm="">
            {deleting ? <LoaderIcon /> : <TrashIcon />}
            {deleting ? ZOOM_LABELS.deleting : ZOOM_LABELS.delete}
          </Button>
        </>
      }
    >
      {preview ? (
        <p class="rounded-md bg-card px-3 py-2 text-xs text-muted-foreground">
          {fill(ZOOM_LABELS.deleteSlotSummary, { n: preview.imageCount, r: preview.revisionNumber })}
          {preview.lastSlot ? <><br />{ZOOM_LABELS.deleteSlotLast}</> : null}
        </p>
      ) : null}
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Chat state window (WIt)
 * ---------------------------------------------------------------------------------------------- */

const GROUP_LABEL: Record<string, { label: string; tone: "blue" | "red"; raw: boolean }> = {
  "state.fluid.cum.location": { label: ZOOM_LABELS.groupCum, tone: "blue", raw: false },
  "actor.injury": { label: ZOOM_LABELS.groupInjury, tone: "red", raw: true }
};

function tagLabel(tag: string, raw: boolean): string {
  if (raw) return tag;
  const parts = tag.split("_");
  return parts[parts.length - 1] || tag;
}

const chipKey = (actor: string, group: string, tag: string) => `${actor}\u0000${group}\u0000${tag}`;

/** Actor state with the deselected chips removed (AM `zBe` save: keep only the selected tags; ttl follows its tag). */
export function keepSelectedTags(state: CurrentActorState, deselected: ReadonlySet<string>): CurrentActorState {
  const actors: CurrentActorState["actors"] = {};
  for (const [key, record] of Object.entries(state.actors)) {
    const groups = Object.fromEntries(
      Object.entries(record.groups).map(([group, tags]) => [group, tags.filter((tag) => !deselected.has(chipKey(key, group, tag)))])
    ) as typeof record.groups;
    const kept = new Set(Object.values(groups).flat());
    const ttl = Object.fromEntries(Object.entries(record.ttl).filter(([tag]) => kept.has(tag)));
    actors[key] = { ...record, groups, ttl };
  }
  return { revision: state.revision, actors };
}

export function ChatStatePanel({ app, chatId, actorNames }: { app: AppController; chatId: string; actorNames?: Record<string, string> }) {
  const confirm = useConfirm();
  const [state, setState] = useState<CurrentActorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Chips the user deselected (selection = keep; AM `WIt`). */
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(new Set());
  // A generation job in this chat may rewrite the state: block edits while it runs (AM `subscribeBusy`).
  const generating = useSelector(app.store, (s) =>
    Object.values(s.generationJobs).some((job) => job.chatId === chatId && (job.status === "queued" || job.status === "running"))
  );
  const load = async () => {
    setBusy(true);
    try {
      const { actorState } = await app.call("chatState.get", { chatId });
      setState(actorState);
      setDeselected(new Set());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [chatId]);
  // Auto-reload when a generation finishes and nothing is unsaved.
  const [wasGenerating, setWasGenerating] = useState(generating);
  useEffect(() => {
    if (wasGenerating && !generating && deselected.size === 0) void load();
    setWasGenerating(generating);
  }, [generating]);
  const toggle = (key: string) =>
    setDeselected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const save = async () => {
    if (!state || deselected.size === 0) return;
    setSaving(true);
    try {
      const { actorState } = await app.call("chatState.set", { chatId, actorState: keepSelectedTags(state, deselected), baseRevision: state.revision });
      setState(actorState);
      setDeselected(new Set());
      setError(null);
    } catch (caught) {
      const code = (caught as { error?: { code?: string } } | null)?.error?.code ?? (caught as { code?: string } | null)?.code;
      setError(code === "conflict" ? ZOOM_LABELS.stateConflict : caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };
  const clear = async (actorKeys?: string[]) => {
    const ok = await confirm({ title: ZOOM_LABELS.clearConfirm, description: ZOOM_LABELS.clearConfirmDescription, confirmLabel: actorKeys ? fill(ZOOM_LABELS.clearActor, { actor: actorNames?.[actorKeys[0]!] ?? actorKeys[0]! }) : ZOOM_LABELS.clearAll, cancelLabel: ZOOM_LABELS.cancel });
    if (!ok) return;
    setBusy(true);
    try {
      const { actorState } = await app.call("chatState.clear", { chatId, ...(actorKeys ? { actorKeys } : {}) });
      setState(actorState);
      setDeselected(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  const actors = Object.entries(state?.actors ?? {});
  const locked = busy || saving || generating;
  return (
    <section aria-label={ZOOM_LABELS.chatState} class="grid gap-3" data-ii-zoom-state="">
      {!state && busy ? <StatusBox tone="loading">{ZOOM_LABELS.loadingState}</StatusBox> : null}
      {state && actors.length === 0 ? <StatusBox tone="empty">{ZOOM_LABELS.stateEmpty}</StatusBox> : null}
      {actors.map(([key, record]) => (
        <article key={key} class="grid gap-2 rounded-lg bg-card p-3">
          <header class="flex items-center justify-between gap-2">
            <span class="truncate text-xs font-extrabold">{actorNames?.[key] ?? key}</span>
            <Button variant="ghost" size="sm" disabled={locked} onClick={() => void clear([key])}>{fill(ZOOM_LABELS.clearActor, { actor: "" }).trim()}</Button>
          </header>
          {Object.entries(record.groups).filter(([, tags]) => tags.length > 0).map(([group, tags]) => {
            const meta = GROUP_LABEL[group] ?? { label: group, tone: "blue" as const, raw: true };
            return (
              <div key={group} class="grid gap-1">
                <span class="text-2xs font-bold text-muted-foreground">{meta.label}</span>
                <div class="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const id = chipKey(key, group, tag);
                    const selected = !deselected.has(id);
                    return (
                      <button
                        type="button"
                        key={tag}
                        title={tag}
                        aria-label={tag.replace(/_/gu, " ")}
                        aria-pressed={selected}
                        disabled={locked}
                        data-ii-zoom-state-tag={tag}
                        onClick={() => toggle(id)}
                        class={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold transition disabled:cursor-not-allowed",
                          meta.tone === "red" ? "bg-destructive/18 text-destructive" : "bg-coordinate-1/22 text-coordinate-1",
                          selected ? "" : "opacity-45"
                        )}
                      >
                        {selected ? <CheckIcon /> : null}
                        {tagLabel(tag, meta.raw).replace(/_/gu, " ")}
                        {record.ttl[tag] ? <span class="font-mono text-3xs opacity-75">{fill(ZOOM_LABELS.stateCount, { n: record.ttl[tag]! })}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </article>
      ))}
      <footer class="flex items-center justify-between gap-2">
        {error ? <span role="alert" class="inline-flex items-center gap-1 text-2xs text-destructive" title={error}><AlertIcon />{error}</span> : <span />}
        <div class="flex items-center gap-1">
          <IconButton label={ZOOM_LABELS.refreshState} title={ZOOM_LABELS.refresh} disabled={busy || saving} onClick={() => void load()}>{busy ? <LoaderIcon /> : <RefreshIcon />}</IconButton>
          <IconButton
            label={saving ? ZOOM_LABELS.savingState : ZOOM_LABELS.saveState}
            title={ZOOM_LABELS.save}
            disabled={locked || deselected.size === 0}
            data-ii-zoom-state-save=""
            onClick={() => void save()}
          >
            {saving ? <LoaderIcon /> : <SaveIcon />}
          </IconButton>
          <Button variant="danger" size="sm" disabled={locked || actors.length === 0} onClick={() => void clear()}><TrashIcon />{ZOOM_LABELS.clearAll}</Button>
        </div>
      </footer>
    </section>
  );
}
