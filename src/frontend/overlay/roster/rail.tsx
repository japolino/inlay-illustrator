/** Charx rail (AM `Qst` 101153 / item `Jst` 101112) and the mobile character picker. */
import { useEffect, useRef } from "preact/hooks";
import type { CharacterSummary } from "../../../shared/contract/rpc.js";
import { useAppState } from "../../state/app-state.js";
import { DiamondIcon, IconButton, SettingsIcon, cn } from "../ui/index.js";
import { ROSTER_LABELS as L } from "./labels.js";

function RailItem({ character, selected, onSelect, large }: { character: CharacterSummary; selected: boolean; onSelect: (id: string) => void; large?: boolean }) {
  return (
    <button
      type="button"
      class={cn("group relative grid place-items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-50", large ? "w-full gap-1" : "size-11")}
      data-charx-source-id={character.characterId}
      onClick={() => onSelect(character.characterId)}
      aria-label={character.name}
      title={character.name}
      aria-pressed={selected}
    >
      {!large ? (
        <span class={cn("absolute top-1/2 -left-1.5 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-[height]", selected ? "h-8" : "h-0 group-hover:h-3")} data-charx-selection-marker="" aria-hidden="true" />
      ) : null}
      {character.avatarUrl ? (
        <img src={character.avatarUrl} alt="" class={cn("rounded-md object-cover", large ? "aspect-square w-full" : "size-11", large && selected && "ring-2 ring-primary")} draggable={false} />
      ) : (
        <span class={cn("grid place-items-center rounded-md bg-secondary text-xs font-black text-muted-foreground", large ? "aspect-square w-full" : "size-11", large && selected && "ring-2 ring-primary")} aria-hidden="true">
          {character.name.slice(0, 1)}
        </span>
      )}
      <span class={cn("min-w-0 truncate text-xs font-bold text-foreground", large ? "block h-6 w-full text-center leading-6" : "hidden")} data-charx-source-name="">{character.name}</span>
    </button>
  );
}

/** Desktop rail: app mark, character list, settings button. */
export function CharxRail({ settingsOpen, onSelect, onToggleSettings }: { settingsOpen: boolean; onSelect: (id: string) => void; onToggleSettings: () => void }) {
  const characters = useAppState((s) => s.characters);
  const selectedId = useAppState((s) => s.selectedCharacterId);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = selectedId ?? "";
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
    list.current?.querySelector(`[data-charx-source-id="${escaped}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId, characters?.length]);
  return (
    <nav aria-label={L.characterSelection} class="flex min-h-0 flex-col items-center gap-2 border-r border-border bg-sidebar py-3" data-source-transition-control="">
      <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-navigation-selected text-primary" title="Inlay Illustrator" aria-hidden="true">
        <DiamondIcon className="size-5" />
      </div>
      <div ref={list} class="scrollbar-none grid min-h-0 w-full flex-1 content-start justify-items-center gap-2 overflow-y-auto px-2 py-1" data-charx-rail="">
        {characters === null ? <span class="sr-only">{L.railLoading}</span> : null}
        {(characters ?? []).map((character) => (
          <RailItem key={character.characterId} character={character} selected={character.characterId === selectedId} onSelect={onSelect} />
        ))}
      </div>
      <IconButton
        label={L.settings}
        aria-pressed={settingsOpen}
        data-charx-settings=""
        onClick={onToggleSettings}
        className={cn("mt-2 size-8 shrink-0", settingsOpen && "bg-surface-navigation-selected text-selected-foreground")}
      >
        <SettingsIcon />
      </IconButton>
    </nav>
  );
}

/** Mobile picker grid (AM: 3 columns, gap 12 px, square items + 24 px label). */
export function CharxPickerGrid({ onSelect }: { onSelect: (id: string) => void }) {
  const characters = useAppState((s) => s.characters);
  const selectedId = useAppState((s) => s.selectedCharacterId);
  if (characters && characters.length === 0) return <p class="p-6 text-center text-xs text-muted-foreground">{L.noCharacters}</p>;
  return (
    <div class="grid grid-cols-3 gap-3 p-4" data-charx-picker="">
      {(characters ?? []).map((character) => (
        <RailItem key={character.characterId} large character={character} selected={character.characterId === selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}
