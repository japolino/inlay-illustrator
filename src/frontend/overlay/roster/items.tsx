/**
 * Roster items: card with thumbnail (AM `ect`/`rct` 101270/101483), row/tile (`tct`/`oct` 101294/101609),
 * remove-from-roster button (`TT` 100277), person menu with inline delete confirm (`whe` 101331).
 */
import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";
import { Button, Floating, cn, ArrowUpCircleIcon, InfoIcon, MoreIcon, PencilIcon, TrashIcon, UserMinusIcon } from "../ui/index.js";
import { ROSTER_LABELS as L } from "./labels.js";

export interface RosterItemActions {
  onToggle: () => void;
  onInfo?: () => void;
  onEdit?: () => void;
  onPromote?: () => void;
  onDelete?: () => Promise<void>;
  onDeselect?: () => Promise<void>;
}

export interface RosterItemProps extends RosterItemActions {
  title: string;
  selected: boolean;
  pending?: boolean;
  referenceMode?: boolean;
  badge?: string;
  thumbnailUrl?: string | null;
  customId?: string;
  dataKey: string;
}

const INFO_BUTTON = "absolute z-30 grid size-7 place-items-center rounded-full bg-background/78 text-foreground opacity-0 outline-none backdrop-blur-md transition-colors hover:bg-background/92 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/55 group-hover:opacity-100 max-md:size-9 max-md:opacity-100 mobile:opacity-100";

function InfoButton({ title, className, onInfo, custom }: { title: string; className: string; onInfo: () => void; custom: boolean }) {
  return (
    <button
      type="button"
      class={cn(INFO_BUTTON, className)}
      data-lorebook-info-button={custom ? undefined : ""}
      data-custom-character-info-button={custom ? "" : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onInfo();
      }}
      aria-label={L.infoOf(title)}
      title={L.info}
    >
      <span class="text-[11px]/none font-extrabold" aria-hidden="true">i</span>
    </button>
  );
}

/** AM `TT`: unregister from the roster. */
export function RemoveFromRosterButton({ title, onDeselect, disabled, className }: { title: string; onDeselect: () => Promise<void>; disabled?: boolean; className?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <button
      type="button"
      class={cn(
        "absolute top-1.5 left-1.5 z-30 grid size-7 place-items-center rounded-full bg-background/78 text-muted-foreground outline-none backdrop-blur-md transition-[color,opacity] hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/55 max-md:size-9 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100",
        error && "text-destructive opacity-100",
        className
      )}
      disabled={disabled || pending}
      aria-label={L.removeFromRosterOf(title)}
      title={error ?? L.removeFromRoster}
      data-roster-remove=""
      onClick={async (event) => {
        event.stopPropagation();
        setPending(true);
        setError(null);
        try {
          await onDeselect();
        } catch (caught) {
          setError(caught instanceof Error && caught.message ? caught.message : L.removeFailed);
        } finally {
          setPending(false);
        }
      }}
    >
      <UserMinusIcon className="size-3.5" />
      {error ? <span class="sr-only" role="alert">{error}</span> : null}
    </button>
  );
}

/** AM `whe`: person menu (edit / info / promote / delete with inline confirm). */
export function PersonMenu({ title, pending, className, onEdit, onInfo, onPromote, onDelete }: { title: string; pending?: boolean; className?: string } & Pick<RosterItemActions, "onEdit" | "onInfo" | "onPromote" | "onDelete">) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const close = () => {
    setOpen(false);
    setConfirming(false);
    setError(null);
  };
  const item = "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-semibold outline-none hover:bg-accent focus-visible:bg-accent";
  return (
    <>
      <button
        ref={anchor}
        type="button"
        class={cn("absolute z-30 grid size-7 place-items-center rounded-full bg-background/78 text-foreground outline-none backdrop-blur-md hover:bg-background/92 focus-visible:ring-2 focus-visible:ring-ring/55 max-md:size-9", className)}
        aria-label={L.personMenuOf(title)}
        title={L.personMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <MoreIcon className="size-4" />
      </button>
      <Floating open={open} anchor={anchor} onClose={close} align="end" role="menu" aria-label={L.personMenuOf(title)} className="min-w-44 p-1">
        {confirming ? (
          <div class="grid gap-2 p-2" data-person-delete-confirm="">
            <p class="text-xs font-semibold">{L.deleteConfirm}</p>
            {error ? <p role="alert" class="text-2xs text-destructive">{error}</p> : null}
            <div class="flex gap-1.5">
              <Button size="sm" variant="danger" disabled={busy} onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onDelete?.();
                  close();
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : String(caught));
                } finally {
                  setBusy(false);
                }
              }}>{busy ? L.deleting : L.confirmDelete}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>{L.cancel}</Button>
            </div>
          </div>
        ) : (
          <div class="grid">
            {onEdit ? <button type="button" role="menuitem" class={item} onClick={() => { close(); onEdit(); }}><PencilIcon className="size-3.5" />{L.editPerson}</button> : null}
            {onInfo ? <button type="button" role="menuitem" class={item} onClick={() => { close(); onInfo(); }}><InfoIcon className="size-3.5" />{L.viewInfo}</button> : null}
            {onPromote ? <><div class="my-1 h-px bg-border" role="separator" /><button type="button" role="menuitem" class={item} onClick={() => { close(); onPromote(); }}><ArrowUpCircleIcon className="size-3.5" />{L.promote}</button></> : null}
            {onDelete ? <><div class="my-1 h-px bg-border" role="separator" /><button type="button" role="menuitem" class={cn(item, "text-destructive")} onClick={() => setConfirming(true)}><TrashIcon className="size-3.5" />{L.deletePerson}</button></> : null}
          </div>
        )}
      </Floating>
    </>
  );
}

function Badge({ children, className }: { children: ComponentChildren; className?: string }) {
  return <span class={cn("inline-flex items-center rounded-full bg-background/82 px-1.5 py-0.5 text-3xs font-bold text-foreground", className)} data-character-description-badge="">{children}</span>;
}

/** Card with thumbnail (grid layout + preview). */
export function RosterCard(props: RosterItemProps) {
  const { title, selected, pending, referenceMode, badge, thumbnailUrl, customId, onToggle, onInfo, onEdit, onPromote, onDelete, onDeselect, dataKey } = props;
  return (
    <article
      class={cn(
        "group relative aspect-lorebook-thumbnail min-w-0 overflow-hidden rounded-md bg-surface-workbench",
        selected && "bg-surface-media-selected after:pointer-events-none after:absolute after:inset-0 after:z-40 after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-primary"
      )}
      data-state={selected ? "checked" : "unchecked"}
      aria-busy={pending || undefined}
      data-roster-item={dataKey}
      data-custom-character-id={customId || undefined}
      data-selection-mode={referenceMode ? "reference" : undefined}
    >
      <button type="button" class="absolute inset-0 z-10 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/55" disabled={pending} onClick={onToggle} aria-label={referenceMode ? L.selectAsReference(title) : title} aria-pressed={selected} />
      {onDeselect ? <RemoveFromRosterButton title={title} onDeselect={onDeselect} disabled={pending} /> : null}
      {thumbnailUrl ? <img src={thumbnailUrl} alt="" loading="lazy" class="absolute inset-0 size-full object-cover object-top" draggable={false} /> : null}
      <div class={cn("pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t px-2 pt-8 pb-2 text-center", selected ? "from-surface-lorebook-selected via-surface-lorebook-selected/38 to-transparent text-selected-foreground" : "from-background via-background/76 to-transparent")}>
        <strong class="block truncate text-2xs/3 font-bold max-md:text-xs/4">{title}</strong>
      </div>
      {badge ? <Badge className={cn("pointer-events-none absolute top-1.5 z-20", onDeselect ? "left-10 max-md:left-12" : "left-1.5")}>{badge}</Badge> : null}
      {customId && onDelete ? (
        <PersonMenu title={title} pending={pending} className="top-1.5 right-1.5" onEdit={onEdit} onInfo={onInfo} onPromote={onPromote} onDelete={onDelete} />
      ) : onInfo ? (
        <InfoButton title={title} className="top-1.5 right-1.5" onInfo={onInfo} custom={!!customId} />
      ) : null}
    </article>
  );
}

/** Row (list layout) or text tile (grid layout without preview). */
export function RosterRow(props: RosterItemProps & { tile: boolean }) {
  const { title, selected, pending, referenceMode, badge, customId, onToggle, onInfo, onEdit, onPromote, onDelete, onDeselect, tile, dataKey } = props;
  return (
    <div
      class={cn(
        "group relative rounded-lg bg-transparent transition-colors hover:bg-surface-navigation-hover",
        selected && "bg-surface-navigation-selected ring-1 ring-inset ring-primary",
        tile ? "min-h-18 bg-surface-workbench" : "min-h-9"
      )}
      data-state={selected ? "checked" : "unchecked"}
      aria-busy={pending || undefined}
      data-roster-item={dataKey}
      data-custom-character-id={customId || undefined}
      data-selection-mode={referenceMode ? "reference" : undefined}
    >
      <button
        type="button"
        class={cn(
          "absolute inset-0 z-10 flex pl-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/55",
          onDeselect && "pl-10 max-md:pl-12",
          tile ? (onInfo || onDelete ? "items-start py-1.5 pr-12" : "items-start py-1.5 pr-2.5") : onDelete ? "items-center pr-12" : onInfo ? "items-center pr-10" : "items-center pr-2.5"
        )}
        disabled={pending}
        onClick={onToggle}
        aria-label={referenceMode ? L.selectAsReference(title) : title}
        aria-pressed={selected}
      >
        <div class={cn("min-w-0", tile ? "grid gap-1" : "flex items-center gap-1.5")}>
          {badge ? <Badge className="w-fit">{badge}</Badge> : null}
          <strong data-lorebook-row-title="" class="line-clamp-2 min-w-0 text-xs/4 font-bold">{title}</strong>
        </div>
      </button>
      {onDeselect ? <RemoveFromRosterButton title={title} onDeselect={onDeselect} disabled={pending} className={tile ? undefined : "top-1/2 -translate-y-1/2"} /> : null}
      {customId && onDelete ? (
        <PersonMenu title={title} pending={pending} className={tile ? "top-1.5 right-2" : "top-1/2 right-2 -translate-y-1/2"} onEdit={onEdit} onInfo={onInfo} onPromote={onPromote} onDelete={onDelete} />
      ) : onInfo ? (
        <InfoButton title={title} className={cn("right-2", tile ? "top-1.5" : "top-1/2 -translate-y-1/2")} onInfo={onInfo} custom={!!customId} />
      ) : null}
    </div>
  );
}
