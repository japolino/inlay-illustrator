import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  SETTINGS_GROUPS,
  SHELL_LABELS,
  WORKSPACE_TABS,
  DEFAULT_SETTINGS_SECTION,
  type SettingsSection,
  type WorkspaceTab
} from "./labels.js";
import { SettingsPage } from "./settings/index.js";
import type { FrontendStore } from "./store.js";
import {
  ArrowLeftIcon,
  Button,
  ConfirmProvider,
  IconButton,
  LayerStack,
  MenuIcon,
  OverlayEnvironmentContext,
  PanelLeftIcon,
  SettingsIcon,
  Tabs,
  ToastHost,
  ToastProvider,
  ToastStore,
  XIcon,
  ChevronDownIcon,
  cn,
  tabPanelProps,
  useFocusTrap,
  useLayer
} from "./ui/index.js";
import { useIsMobile } from "./viewport.js";
import { AppContext, useApp, useAppState, type AppController } from "../state/app-state.js";
import { CommandDock, PageHeader } from "./shell/dock.js";
import { useWorkspaceTabView } from "./workspace/index.js";
import { SPLIT_MAX, SPLIT_MIN, WorkspaceUiContext, WorkspaceUiStore, useSourceUi, useWorkspaceUi, type TabView } from "./workspace-ui.js";
import { CharxPickerGrid, CharxRail, CustomCharacterEditor, EDITOR_LABELS, RosterInfoPanel, RosterSidebar, ROSTER_LABELS } from "./roster/index.js";

/** External navigation request (launchers may ask for a tab or a settings page). */
export type OverlayNavigation = { requestId: number; tab?: WorkspaceTab; settings?: SettingsSection };

export type OverlayAppProps = {
  store: FrontendStore;
  app: AppController;
  layers: LayerStack;
  toasts: ToastStore;
  portal: () => HTMLElement | null;
  navigation: OverlayNavigation;
  onClose: () => void;
};

const TAB_ID_PREFIX = "ii-am-workspace";
/** AM `tS` / `dU`: sidebar default/max and min width. */
const SIDEBAR_MAX = 292;
const SIDEBAR_MIN = 72;
const RAIL = 60;

/** Root of the overlay tree: providers + the Asset Maid shell. */
export function OverlayApp({ layers, toasts, portal, app, navigation, onClose }: OverlayAppProps) {
  useEffect(() => app.onNotice((notice) => toasts.show({ message: notice.message, tone: notice.tone, durationMs: notice.durationMs })), [app, toasts]);
  return (
    <AppContext.Provider value={app}>
      <OverlayEnvironmentContext.Provider value={{ layers, portal }}>
        <ToastProvider store={toasts}>
          <ConfirmProvider defaultCancelLabel={SHELL_LABELS.cancel}>
            <Shell navigation={navigation} onClose={onClose} />
            <ToastHost labels={{ stopTask: SHELL_LABELS.stopTask, closeNotification: SHELL_LABELS.closeNotification }} />
          </ConfirmProvider>
        </ToastProvider>
      </OverlayEnvironmentContext.Provider>
    </AppContext.Provider>
  );
}

function Shell({ navigation, onClose }: { navigation: OverlayNavigation; onClose: () => void }) {
  const app = useApp();
  const workspaceUi = useMemo(() => new WorkspaceUiStore(), []);
  const uiState = useAppState((s) => s.uiState);
  // Persisted layout (AM: navigationLayout + splitRatio only).
  useEffect(() => {
    if (!uiState) return;
    workspaceUi.updateGlobal({ navigationLayout: uiState.global.navigationLayout, splitRatio: uiState.global.splitRatio });
  }, [uiState === null]);
  useEffect(() => {
    workspaceUi.onPersist = (ui) => {
      const current = app.state.uiState;
      if (current) app.setUiState({ ...current, global: { ...current.global, navigationLayout: ui.navigationLayout, splitRatio: ui.splitRatio } });
    };
    return () => {
      workspaceUi.onPersist = null;
    };
  }, [app, workspaceUi]);
  return (
    <WorkspaceUiContext.Provider value={workspaceUi}>
      <ShellInner navigation={navigation} onClose={onClose} workspaceUi={workspaceUi} />
    </WorkspaceUiContext.Provider>
  );
}

function sectionVisible(section: SettingsSection, developerMode: boolean): boolean {
  return section !== "logs" || developerMode;
}

function ShellInner({ navigation, onClose, workspaceUi }: { navigation: OverlayNavigation; onClose: () => void; workspaceUi: WorkspaceUiStore }) {
  const app = useApp();
  const mobile = useIsMobile();
  const characterId = useAppState((s) => s.selectedCharacterId);
  const characterName = useAppState((s) => s.characters?.find((c) => c.characterId === s.selectedCharacterId)?.name ?? null);
  const developerMode = useAppState((s) => s.config?.ui.developerModeEnabled ?? false);
  const connection = useAppState((s) => s.connection);
  const connectionError = useAppState((s) => s.connectionError);
  const sourceUi = useSourceUi(characterId);
  const activeTab: WorkspaceTab = sourceUi.activeTab === ("settings" as string) ? "assets" : sourceUi.activeTab;
  const [settingsOpen, setSettingsOpen] = useState(Boolean(navigation.settings));
  const [section, setSection] = useState<SettingsSection>(navigation.settings ?? DEFAULT_SETTINGS_SECTION);
  const sidebarOpen = useWorkspaceUi((ui) => ui.sidebarOpen);
  const splitRatio = useWorkspaceUi((ui) => ui.splitRatio);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MAX);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const editorOpen = !!sourceUi.editor && !settingsOpen;
  const navigationCount = useAppState((s) => s.workspace?.roster.filter((r) => r.registered && r.workspaceEnabled).length);

  const setActiveTab = (tab: WorkspaceTab) => workspaceUi.updateSource(characterId, { activeTab: tab, secondaryOpen: false, infoPromptKey: null });

  useEffect(() => {
    if (!navigation.requestId) return;
    if (navigation.settings) {
      setSection(navigation.settings);
      setSettingsOpen(true);
    } else if (navigation.tab) {
      setActiveTab(navigation.tab);
      setSettingsOpen(false);
    }
  }, [navigation.requestId]);

  useEffect(() => {
    if (!sectionVisible(section, developerMode)) setSection(DEFAULT_SETTINGS_SECTION);
  }, [developerMode, section]);

  const guarded = (action: () => void) => workspaceUi.runGuarded(action);
  const toggleSettings = () => guarded(() => {
    setSettingsOpen((open) => !open);
    setDrawerOpen(false);
    setPickerOpen(false);
  });
  const selectSection = (id: SettingsSection) => {
    setSection(id);
    setDrawerOpen(false);
  };
  const selectTab = (id: WorkspaceTab) => {
    setActiveTab(id);
    setSettingsOpen(false);
  };
  const selectCharacter = (id: string) => {
    setPickerOpen(false);
    if (id === characterId) return;
    guarded(() => {
      workspaceUi.updateSource(characterId, { editor: null });
      void app.selectCharacter(id);
    });
  };
  const closeOverlay = () => guarded(onClose);
  const closeEditor = () => guarded(() => workspaceUi.updateSource(characterId, { editor: null }));

  const view = useWorkspaceTabView({ characterId, tab: activeTab, mobile });
  const secondary = !settingsOpen && !editorOpen ? view.secondary ?? null : null;

  const sidebarLabel = settingsOpen ? SHELL_LABELS.settingsList : editorOpen ? ROSTER_LABELS.references : SHELL_LABELS.rosterList;
  const sidebar = settingsOpen
    ? <SettingsNavigation active={section} developerMode={developerMode} onSelect={selectSection} onBack={toggleSettings} />
    : <RosterSidebar referenceMode={editorOpen} />;

  const primary = settingsOpen
    ? <div class="min-h-0 flex-1 overflow-y-auto" data-workspace-scroll=""><SettingsPage section={section} /></div>
    : editorOpen
      ? <CustomCharacterEditor />
      : <WorkspaceGate tab={activeTab}><WorkspaceMain tab={activeTab} view={view} /></WorkspaceGate>;

  if (connection === "error") {
    return <ConnectionError message={connectionError?.message ?? ""} onRetry={() => void app.init()} onClose={onClose} />;
  }

  if (mobile) {
    const secondaryOnMobile = secondary;
    return (
      <div class="flex h-full min-h-0 w-full flex-col bg-workspace-pane text-foreground" data-ii-am-shell="mobile">
        <header class="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2">
          {secondaryOnMobile ? (
            <>
              <IconButton label={secondaryOnMobile.back?.label ?? returnLabel(activeTab)} onClick={secondaryOnMobile.back?.onClick ?? (() => workspaceUi.closeSecondary(characterId))}><ArrowLeftIcon /></IconButton>
              <div class="min-w-0 flex-1 truncate px-1 text-sm font-extrabold">{secondaryOnMobile.title}</div>
            </>
          ) : (
            <>
              <IconButton label={SHELL_LABELS.sidebarToggle(sidebarLabel)} aria-expanded={drawerOpen} onClick={() => setDrawerOpen(!drawerOpen)} className="relative">
                <MenuIcon />
                {navigationCount ? <span class="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-3xs leading-4 font-black text-primary-foreground">{navigationCount}</span> : null}
              </IconButton>
              {editorOpen ? (
                <Button variant="ghost" onClick={closeEditor} title={EDITOR_LABELS.backTitle} aria-label={EDITOR_LABELS.backTitle}><ArrowLeftIcon />{EDITOR_LABELS.back}</Button>
              ) : (
                <Button variant="ghost" className="min-w-0 flex-1 shrink justify-start px-1" aria-label={ROSTER_LABELS.characterSelectionOf(characterName ?? SHELL_LABELS.noCharacter)} title={characterName ?? undefined} onClick={() => setPickerOpen(true)} data-source-transition-control="">
                  <span class="min-w-0 truncate text-sm font-extrabold text-foreground">{characterName ?? SHELL_LABELS.appName}</span>
                  <ChevronDownIcon className="size-3.5" />
                </Button>
              )}
              {editorOpen ? <div class="flex-1" /> : null}
              {!settingsOpen && !editorOpen ? (
                <IconButton label={SHELL_LABELS.openSettings} title="Settings" onClick={toggleSettings} data-mobile-settings-entry="">
                  <SettingsIcon />
                </IconButton>
              ) : null}
            </>
          )}
          <IconButton label={SHELL_LABELS.close} onClick={closeOverlay} data-source-transition-control=""><XIcon /></IconButton>
        </header>
        {!settingsOpen && !editorOpen && !secondaryOnMobile ? (
          <Tabs
            idPrefix={TAB_ID_PREFIX}
            aria-label={SHELL_LABELS.workspaceNav}
            className="shrink-0 overflow-x-auto border-b border-border px-2 py-1"
            items={WORKSPACE_TABS.map((tab) => ({ id: tab.id, label: tab.mobileLabel, ariaLabel: tab.label }))}
            value={activeTab}
            onValueChange={selectTab}
          />
        ) : null}
        <main class="relative flex min-h-0 flex-1 flex-col">
          {secondaryOnMobile ? <WorkspaceSecondary secondary={secondaryOnMobile} mobile /> : primary}
          {!settingsOpen && !editorOpen ? <RosterInfoPanel /> : null}
        </main>
        <MobileDrawer open={drawerOpen} label={sidebarLabel} onClose={() => setDrawerOpen(false)}>{sidebar}</MobileDrawer>
        <CharxPickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={selectCharacter} onSettings={() => { setPickerOpen(false); toggleSettings(); }} />
      </div>
    );
  }

  const showSidebar = settingsOpen || editorOpen || sidebarOpen;
  const width = showSidebar ? sidebarWidth : 0;
  return (
    <div
      class="grid h-full min-h-0 w-full bg-workspace-pane text-foreground"
      style={{ gridTemplateColumns: `${RAIL}px ${width}px minmax(0,1fr)`, ["--character-navigation-width" as string]: `${width}px` }}
      data-ii-am-shell="desktop"
    >
      <CharxRail settingsOpen={settingsOpen} onSelect={selectCharacter} onToggleSettings={toggleSettings} />
      <aside
        aria-label={sidebarLabel}
        inert={!showSidebar}
        class={cn("relative min-h-0 min-w-0 overflow-hidden border-r border-border bg-sidebar transition-opacity", !showSidebar && "opacity-0")}
      >
        {sidebar}
        {showSidebar && !settingsOpen ? <WidthResizer label={sidebarLabel} value={sidebarWidth} onChange={setSidebarWidth} /> : null}
      </aside>
      <section class="flex min-h-0 min-w-0 flex-col">
        <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3" data-workspace-header="">
          {!settingsOpen && !editorOpen ? (
            <IconButton label={SHELL_LABELS.sidebarToggle(sidebarLabel)} aria-pressed={sidebarOpen} onClick={() => workspaceUi.updateGlobal({ sidebarOpen: !sidebarOpen })}>
              <PanelLeftIcon />
            </IconButton>
          ) : null}
          {editorOpen ? (
            <Button variant="ghost" onClick={closeEditor} title={EDITOR_LABELS.backTitle} aria-label={EDITOR_LABELS.backTitle}><ArrowLeftIcon />{EDITOR_LABELS.back}</Button>
          ) : null}
          {!settingsOpen && !editorOpen ? (
            <nav aria-label={SHELL_LABELS.workspaceNav} class="min-w-0 flex-1 overflow-x-auto">
              <Tabs idPrefix={TAB_ID_PREFIX} items={WORKSPACE_TABS.map((tab) => ({ id: tab.id, label: tab.label }))} value={activeTab} onValueChange={selectTab} />
            </nav>
          ) : <div class="min-w-0 flex-1" />}
          {secondary ? (
            <IconButton label={SHELL_LABELS.closeWorkspace} onClick={() => workspaceUi.closeSecondary(characterId)} data-close-secondary=""><PanelLeftIcon className="rotate-180" /></IconButton>
          ) : null}
          <IconButton label={SHELL_LABELS.close} onClick={closeOverlay} data-source-transition-control=""><XIcon /></IconButton>
        </header>
        <div class="relative flex min-h-0 flex-1">
          {secondary ? (
            <SplitPanes ratio={splitRatio} onCommit={(ratio) => workspaceUi.updateGlobal({ splitRatio: ratio })}
              first={primary} second={<WorkspaceSecondary secondary={secondary} />} />
          ) : primary}
          {!settingsOpen && !editorOpen ? <RosterInfoPanel /> : null}
        </div>
      </section>
    </div>
  );
}

function returnLabel(tab: WorkspaceTab): string {
  return WORKSPACE_TABS.find((t) => t.id === tab)?.returnLabel ?? SHELL_LABELS.backToWorkspaceShort;
}

/** Loading / error gate in front of the workspace tabs (AM `N0e` 153844). The persona tab does not need a character. */
function WorkspaceGate({ tab, children }: { tab: WorkspaceTab; children: ComponentChildren }) {
  const app = useApp();
  const characterId = useAppState((s) => s.selectedCharacterId);
  const state = useAppState((s) => s.workspaceState);
  const error = useAppState((s) => s.workspaceError);
  const ready = useAppState((s) => !!s.workspace && s.workspace.characterId === s.selectedCharacterId);
  const connection = useAppState((s) => s.connection);
  if (tab === "persona" || ready) return <>{children}</>;
  if (!characterId && connection === "ready") {
    return <div class="grid flex-1 place-items-center p-6 text-center text-xs text-muted-foreground" data-workspace-empty="">{SHELL_LABELS.noCharacterSelected}</div>;
  }
  if (state === "error") {
    return (
      <div class="grid flex-1 content-center justify-items-center gap-3 p-6 text-center" data-workspace-error="">
        <p class="max-w-120 text-xs text-destructive" role="alert">{error?.message}</p>
        <Button size="sm" variant="subtle" data-source-transition-control="" onClick={() => void app.reloadWorkspace()}>{SHELL_LABELS.reload}</Button>
      </div>
    );
  }
  return (
    <div class="mx-auto grid w-full max-w-190 content-start gap-3 px-5 py-5" role="status" aria-live="polite" aria-busy="true" data-workspace-loading="">
      <span class="sr-only">{SHELL_LABELS.loadingData}</span>
      <div class="h-8 w-48 animate-pulse rounded-md bg-surface-workbench" />
      {Array.from({ length: 4 }, (_, i) => <div key={i} class="h-24 animate-pulse rounded-lg bg-surface-workbench" />)}
    </div>
  );
}

/** Primary pane of a workspace tab: page header + content + Command Dock (AM `y5` + `Fc`). */
function WorkspaceMain({ tab, view }: { tab: WorkspaceTab; view: TabView }) {
  return (
    <div class="relative flex min-h-0 min-w-0 flex-1 flex-col" data-workspace-pane="primary">
      <div {...tabPanelProps(TAB_ID_PREFIX, tab)} class="min-h-0 flex-1 overflow-y-auto outline-none" data-workspace-scroll="" style={{ paddingBottom: view.dock ? (view.dockExpanded ? "19rem" : "4.375rem") : undefined }}>
        <div class={cn("mx-auto grid w-full content-start gap-4 px-5 py-5 mobile:px-3", view.layout === "character-grid" ? "max-w-none" : "max-w-190")} data-workspace-content="">
          <PageHeader title={view.title} count={view.count} end={view.headerEnd} />
          {view.content}
        </div>
      </div>
      {view.notices ? <div class="pointer-events-none absolute inset-x-0 bottom-16 z-40 grid justify-items-center gap-1.5 px-5" data-workspace-progress-notices="">{view.notices}</div> : null}
      {view.dock ? <CommandDock expanded={view.dockExpanded}>{view.dock}</CommandDock> : null}
    </div>
  );
}

/** Secondary (right) pane (AM secondary `y5`). */
function WorkspaceSecondary({ secondary, mobile = false }: { secondary: NonNullable<TabView["secondary"]>; mobile?: boolean }) {
  return (
    <div class="relative flex min-h-0 min-w-0 flex-1 flex-col animate-mobile-workspace-in" data-workspace-pane="secondary">
      {!mobile ? (
        <header class="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3" data-workspace-secondary-header="">
          {secondary.back ? <IconButton label={secondary.back.label} title={secondary.back.label} onClick={secondary.back.onClick}><ArrowLeftIcon /></IconButton> : null}
          <h2 class="min-w-0 flex-1 truncate text-sm font-extrabold">{secondary.title}</h2>
        </header>
      ) : null}
      <div class="min-h-0 flex-1 overflow-y-auto" data-workspace-scroll="" style={{ paddingBottom: secondary.dock ? (secondary.dockExpanded ? "19rem" : "4.375rem") : undefined }}>
        <div class="grid content-start gap-3 p-4 mobile:p-3">{secondary.content}</div>
      </div>
      {secondary.dock ? <CommandDock expanded={secondary.dockExpanded}>{secondary.dock}</CommandDock> : null}
    </div>
  );
}

/** Main / secondary split with a keyboard + pointer separator (AM 152814-152853). */
function SplitPanes({ ratio, onCommit, first, second }: { ratio: number; onCommit: (ratio: number) => void; first: ComponentChildren; second: ComponentChildren }) {
  const [live, setLive] = useState(ratio);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => setLive(ratio), [ratio]);
  const clamp = (value: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value));
  const commit = (value: number) => {
    const next = clamp(value);
    setLive(next);
    onCommit(next);
  };
  return (
    <div ref={container} class="grid min-h-0 min-w-0 flex-1" style={{ gridTemplateColumns: `minmax(0,${live}fr) 6px minmax(0,${1 - live}fr)` }} data-workspace-split="">
      <div class="flex min-h-0 min-w-0">{first}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={SHELL_LABELS.splitAdjust}
        aria-valuemin={35}
        aria-valuemax={65}
        aria-valuenow={Math.round(live * 100)}
        tabIndex={0}
        class="cursor-col-resize bg-border/40 outline-none hover:bg-primary/30 focus-visible:bg-primary/50"
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.05 : 0.02;
          if (event.key === "ArrowLeft") { event.preventDefault(); commit(live - step); }
          else if (event.key === "ArrowRight") { event.preventDefault(); commit(live + step); }
          else if (event.key === "Home") { event.preventDefault(); commit(SPLIT_MIN); }
          else if (event.key === "End") { event.preventDefault(); commit(SPLIT_MAX); }
        }}
        onPointerDown={(event) => {
          const element = event.currentTarget as HTMLElement;
          element.setPointerCapture?.(event.pointerId);
          const rect = container.current!.getBoundingClientRect();
          let value = live;
          const move = (e: PointerEvent) => {
            value = clamp((e.clientX - rect.left) / Math.max(1, rect.width));
            setLive(value);
          };
          const up = () => {
            element.removeEventListener("pointermove", move);
            element.removeEventListener("pointerup", up);
            element.removeEventListener("pointercancel", up);
            commit(value);
          };
          element.addEventListener("pointermove", move);
          element.addEventListener("pointerup", up);
          element.addEventListener("pointercancel", up);
        }}
      />
      <div class="flex min-h-0 min-w-0">{second}</div>
    </div>
  );
}

/** Sidebar width resizer (AM 152559-152597; local state, not persisted). */
function WidthResizer({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const clamp = (v: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(v)));
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={SHELL_LABELS.widthAdjust(label)}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={value}
      tabIndex={0}
      class="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize outline-none hover:bg-primary/30 focus-visible:bg-primary/50"
      onKeyDown={(event) => {
        const step = event.shiftKey ? 24 : 8;
        if (event.key === "ArrowLeft") { event.preventDefault(); onChange(clamp(value - step)); }
        else if (event.key === "ArrowRight") { event.preventDefault(); onChange(clamp(value + step)); }
        else if (event.key === "Home") { event.preventDefault(); onChange(SIDEBAR_MIN); }
        else if (event.key === "End") { event.preventDefault(); onChange(SIDEBAR_MAX); }
      }}
      onPointerDown={(event) => {
        const element = event.currentTarget as HTMLElement;
        element.setPointerCapture?.(event.pointerId);
        const startX = event.clientX;
        const start = value;
        const move = (e: PointerEvent) => onChange(clamp(start + e.clientX - startX));
        const up = () => {
          element.removeEventListener("pointermove", move);
          element.removeEventListener("pointerup", up);
        };
        element.addEventListener("pointermove", move);
        element.addEventListener("pointerup", up);
      }}
    />
  );
}

function SettingsNavigation({ active, developerMode, onSelect, onBack }: {
  active: SettingsSection;
  developerMode: boolean;
  onSelect: (id: SettingsSection) => void;
  onBack: () => void;
}) {
  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="shrink-0 p-2.5">
        <Button variant="ghost" className="w-full justify-start" onClick={onBack} aria-label={SHELL_LABELS.backToWorkspace} title={SHELL_LABELS.backToWorkspace}>
          <ArrowLeftIcon />
          {SHELL_LABELS.backToWorkspace}
        </Button>
      </div>
      <nav class="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4" aria-label={SHELL_LABELS.settings}>
        {SETTINGS_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.developerOnly || developerMode);
          if (items.length === 0) return null;
          return (
            <section key={group.label} class="grid gap-1 pb-4">
              <h2 class="flex h-7.5 items-center px-2 text-3xs font-black uppercase text-muted-foreground">{group.label}</h2>
              <div class="grid gap-0.5">
                {items.map((item) => {
                  const current = item.id === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-settings-navigation-item={item.id}
                      aria-current={current ? "page" : undefined}
                      onClick={() => onSelect(item.id)}
                      class={cn(
                        "flex h-9 w-full items-center rounded-md px-2.5 text-left text-xs font-bold text-muted-foreground outline-none transition-colors hover:bg-surface-navigation-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-11",
                        current && "bg-surface-navigation-selected text-selected-foreground hover:bg-surface-navigation-selected"
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </div>
  );
}

function ConnectionError({ message, onRetry, onClose }: { message: string; onRetry: () => void; onClose: () => void }) {
  return (
    <div class="grid h-full w-full place-items-center bg-workspace-pane p-6 text-foreground" data-connection-error="">
      <div class="grid max-w-120 justify-items-center gap-3 text-center">
        <h1 class="text-lg font-extrabold">{SHELL_LABELS.connectionFailed}</h1>
        <p class="text-xs text-muted-foreground" role="alert">{message}</p>
        <div class="flex gap-2">
          <Button onClick={onRetry}>{SHELL_LABELS.retry}</Button>
          <Button variant="ghost" onClick={onClose}>{SHELL_LABELS.close}</Button>
        </div>
      </div>
    </div>
  );
}

function MobileDrawer({ open, label, onClose, children }: { open: boolean; label: string; onClose: () => void; children: ComponentChildren }) {
  const panel = useRef<HTMLDivElement>(null);
  useLayer(open, onClose);
  useFocusTrap(panel, open);
  if (!open) return null;
  return (
    <div class="fixed inset-0 z-90">
      <button type="button" tabIndex={-1} aria-label={SHELL_LABELS.sidebarClose(label)} class="absolute inset-0 bg-black/50" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} class="absolute inset-y-0 left-0 flex w-[min(320px,86%)] flex-col bg-sidebar shadow-2xl animate-mobile-workspace-in">
        {children}
      </div>
    </div>
  );
}

/** Mobile full-screen character picker (AM charx picker dialog). */
function CharxPickerDialog({ open, onClose, onSelect, onSettings }: { open: boolean; onClose: () => void; onSelect: (id: string) => void; onSettings: () => void }) {
  const panel = useRef<HTMLElement>(null);
  useLayer(open, onClose);
  useFocusTrap(panel, open);
  if (!open) return null;
  return (
    <section ref={panel} role="dialog" aria-modal="true" aria-label={ROSTER_LABELS.characterSelection} class="fixed inset-0 z-90 flex flex-col bg-workspace-pane animate-mobile-workspace-in">
      <header class="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2">
        <IconButton label={ROSTER_LABELS.backToWorkspace} onClick={onClose}><ArrowLeftIcon /></IconButton>
        <h2 class="min-w-0 flex-1 truncate px-1 text-sm font-extrabold">{ROSTER_LABELS.characterSelection}</h2>
        <IconButton label={ROSTER_LABELS.settings} data-charx-settings="" onClick={onSettings}><SettingsIcon /></IconButton>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <CharxPickerGrid onSelect={onSelect} />
      </div>
    </section>
  );
}
