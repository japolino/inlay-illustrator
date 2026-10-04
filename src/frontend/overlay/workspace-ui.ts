/**
 * Workspace UI state shared by the shell, the roster sidebar and the tab screens
 * (AM `AIt` workspace UI store 153051 + GIt local state 154485). Per character (AM per source).
 * Persisted part (navigationLayout, splitRatio) goes to `uiState.set` through the AppController.
 */
import { createContext, type ComponentChildren, type VNode } from "preact";
import { useContext } from "preact/hooks";
import { Store, useSelector } from "../state/store.js";
import type { WorkspaceTab } from "./labels.js";

export type SecondaryMode = "asset-picker" | "outfit" | "character-tags";
export type NavigationView = "characters" | "lorebooks" | "custom" | "modules";

/** What the asset picker is choosing for (AM picker context kinds `Cit` 97611). */
export type PickerTarget =
  | { kind: "selection"; promptKey: string }
  | { kind: "character-form"; promptKey: string; formId: string }
  | { kind: "character-outfit"; promptKey: string; formId: string; outfitId: string }
  | { kind: "persona"; personaId: string; formId?: string; outfitId?: string }
  | { kind: "artist-extraction" };

export interface SourceUi {
  activeTab: WorkspaceTab;
  secondaryOpen: boolean;
  secondaryMode: SecondaryMode;
  navigationView: NavigationView;
  /** Roster row whose secondary pane is open (prompt key) or persona id. */
  activePromptKey: string | null;
  activePersonaId: string | null;
  pickerTarget: PickerTarget | null;
  activeOutfitByPromptKey: Record<string, string>;
  activePersonaOutfitByPersonaKey: Record<string, string>;
  /** Search query per scope (`assets`, `prompts`, `persona`, `roster`). */
  search: Record<string, string>;
  /** Display filter values per scope (group id -> option id). */
  filters: Record<string, Record<string, string>>;
  /** Roster info panel shown over the main pane (lorebook or custom person prompt key). */
  infoPromptKey: string | null;
  /** Custom character editor (replaces the main pane). */
  editor: { mode: "create" } | { mode: "edit"; customId: string } | null;
  /** Last registration view of the roster footer tab (AM default `lorebooks`). */
  lastRegistrationView: "lorebooks" | "custom";
}

export interface WorkspaceUi {
  sidebarOpen: boolean;
  navigationLayout: "grid" | "list";
  splitRatio: number;
  bySource: Record<string, SourceUi>;
}

export function defaultSourceUi(): SourceUi {
  return {
    activeTab: "assets",
    secondaryOpen: false,
    secondaryMode: "asset-picker",
    navigationView: "characters",
    activePromptKey: null,
    activePersonaId: null,
    pickerTarget: null,
    activeOutfitByPromptKey: {},
    activePersonaOutfitByPersonaKey: {},
    search: {},
    filters: {},
    infoPromptKey: null,
    editor: null,
    lastRegistrationView: "lorebooks"
  };
}

export const SPLIT_MIN = 0.35;
export const SPLIT_MAX = 0.65;
const NO_SOURCE = "__none__";

/** Store + operations. One per overlay. */
export class WorkspaceUiStore {
  readonly store = new Store<WorkspaceUi>({ sidebarOpen: true, navigationLayout: "grid", splitRatio: 0.5, bySource: {} });
  /** Unsaved-editor guard (AM `Te` 154609): the editor reports `dirty`; navigation goes through `runGuarded`. */
  readonly guard = new Store<{ dirty: boolean; pending: (() => void) | null }>({ dirty: false, pending: null });

  /** Runs `action` now, or parks it and asks the editor to show its unsaved-changes prompt. */
  runGuarded(action: () => void): void {
    if (this.guard.get().dirty) this.guard.patch({ pending: action });
    else action();
  }

  /** Called when a persisted field changes (navigationLayout / splitRatio). */
  onPersist: ((ui: WorkspaceUi) => void) | null = null;

  source(sourceId: string | null): SourceUi {
    return this.store.get().bySource[sourceId ?? NO_SOURCE] ?? defaultSourceUi();
  }

  updateSource(sourceId: string | null, patch: Partial<SourceUi> | ((current: SourceUi) => Partial<SourceUi>)): void {
    const key = sourceId ?? NO_SOURCE;
    const current = this.source(sourceId);
    const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
    this.store.patch({ bySource: { ...this.store.get().bySource, [key]: next } });
  }

  updateGlobal(patch: Partial<Omit<WorkspaceUi, "bySource">>): void {
    const before = this.store.get();
    const next = { ...before, ...patch };
    if (next.splitRatio !== undefined) next.splitRatio = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, next.splitRatio));
    this.store.set(next);
    if (before.navigationLayout !== next.navigationLayout || before.splitRatio !== next.splitRatio) this.onPersist?.(next);
  }

  /** Opens the secondary pane (picker / outfit editor / unique tags). */
  openSecondary(sourceId: string | null, mode: SecondaryMode, target: { promptKey?: string | null; personaId?: string | null; picker?: PickerTarget | null } = {}): void {
    this.updateSource(sourceId, {
      secondaryOpen: true,
      secondaryMode: mode,
      ...(target.promptKey !== undefined ? { activePromptKey: target.promptKey } : {}),
      ...(target.personaId !== undefined ? { activePersonaId: target.personaId } : {}),
      pickerTarget: target.picker ?? null
    });
  }

  closeSecondary(sourceId: string | null): void {
    this.updateSource(sourceId, { secondaryOpen: false, pickerTarget: null });
  }

  setSearch(sourceId: string | null, scope: string, query: string): void {
    this.updateSource(sourceId, (s) => ({ search: { ...s.search, [scope]: query } }));
  }

  setFilter(sourceId: string | null, scope: string, values: Record<string, string>): void {
    this.updateSource(sourceId, (s) => ({ filters: { ...s.filters, [scope]: values } }));
  }

  setActiveOutfit(sourceId: string | null, promptKey: string, outfitId: string): void {
    this.updateSource(sourceId, (s) => ({ activeOutfitByPromptKey: { ...s.activeOutfitByPromptKey, [promptKey]: outfitId } }));
  }

  setActivePersonaOutfit(sourceId: string | null, personaKey: string, outfitId: string): void {
    this.updateSource(sourceId, (s) => ({ activePersonaOutfitByPersonaKey: { ...s.activePersonaOutfitByPersonaKey, [personaKey]: outfitId } }));
  }
}

export const WorkspaceUiContext = createContext<WorkspaceUiStore | null>(null);

export function useWorkspaceUiStore(): WorkspaceUiStore {
  const store = useContext(WorkspaceUiContext);
  if (!store) throw new Error("WorkspaceUiContext is missing.");
  return store;
}

/** Selects from the workspace UI state. */
export function useWorkspaceUi<S>(selector: (ui: WorkspaceUi) => S): S {
  return useSelector(useWorkspaceUiStore().store, selector);
}

/** Per-character UI state of the given character (null = no character). */
export function useSourceUi(sourceId: string | null): SourceUi {
  return useWorkspaceUi((ui) => ui.bySource[sourceId ?? NO_SOURCE]) ?? DEFAULT_SOURCE_UI;
}
const DEFAULT_SOURCE_UI = defaultSourceUi();

/**
 * What a workspace tab gives the shell (AM GIt routing 156259-156605): the shell places each slot
 * (page header, primary content, Command Dock, secondary pane + its dock, progress notices).
 */
export interface TabView {
  title: string;
  /** "Selected N" badge next to the title. */
  count?: number;
  headerEnd?: ComponentChildren;
  content: ComponentChildren;
  dock?: ComponentChildren;
  dockExpanded?: boolean;
  /** Layout of the primary pane frame: character-grid (wide) or standard (max-w-190). */
  layout?: "character-grid" | "standard";
  /** Secondary (right) pane when open. */
  secondary?: {
    title: string;
    content: ComponentChildren;
    dock?: ComponentChildren;
    dockExpanded?: boolean;
    /** Desktop header start button (AM `Cc`) and mobile back. */
    back?: { label: string; onClick: () => void };
  } | null;
  /** Progress toasts shown above the dock (AM `LO`). */
  notices?: ComponentChildren;
}

export type TabViewHook = (input: { characterId: string | null; tab: WorkspaceTab; mobile: boolean }) => TabView;
export type { VNode };
