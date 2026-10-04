import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Config } from "../../shared/config.js";
import { CommandDock, PageHeader } from "./shell/dock.js";
import { useWorkspaceTabView } from "./workspace/index.js";
import { WorkspaceUiContext, WorkspaceUiStore, useSourceUi, useWorkspaceUi, type TabView } from "./workspace-ui.js";
import {
  SETTINGS_GROUPS,
  SHELL_LABELS,
  WORKSPACE_TABS,
  DEFAULT_SETTINGS_SECTION,
  type SettingsSection,
  type WorkspaceTab
} from "./labels.js";
import { Placeholder } from "./placeholder.js";
import { SettingsPage } from "./settings/index.js";
import { useStore, type FrontendStore } from "./store.js";
import {
  ArrowLeftIcon,
  Button,
  ConfirmProvider,
  DiamondIcon,
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
  UsersIcon,
  XIcon,
  cn,
  tabPanelProps,
  useFocusTrap,
  useLayer
} from "./ui/index.js";
import { useIsMobile } from "./viewport.js";
import { AppContext, useApp, useAppState, type AppController } from "../state/app-state.js";

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
  patchConfig: (patch: Partial<Config>) => void;
};

const TAB_ID_PREFIX = "ii-am-workspace";
const SIDEBAR_WIDTH = 292;

/** Root of the overlay tree: providers + the Asset Maid shell. */
export function OverlayApp({ layers, toasts, portal, app, ...props }: OverlayAppProps) {
  useEffect(() => app.onNotice((notice) => toasts.show({ message: notice.message, tone: notice.tone, durationMs: notice.durationMs })), [app, toasts]);
  return (
    <AppContext.Provider value={app}>
    <OverlayEnvironmentContext.Provider value={{ layers, portal }}>
      <ToastProvider store={toasts}>
        <ConfirmProvider defaultCancelLabel={SHELL_LABELS.cancel}>
          <Shell {...props} />
          <ToastHost labels={{ stopTask: SHELL_LABELS.stopTask, closeNotification: SHELL_LABELS.closeNotification }} />
        </ConfirmProvider>
      </ToastProvider>
    </OverlayEnvironmentContext.Provider>
    </AppContext.Provider>
  );
}

function Shell({ navigation, onClose }: Omit<OverlayAppProps, "layers" | "toasts" | "portal" | "app">) {
  const app = useApp();
  const workspaceUi = useMemo(() => new WorkspaceUiStore(), []);
  return (
    <WorkspaceUiContext.Provider value={workspaceUi}>
      <ShellInner navigation={navigation} onClose={onClose} app={app} workspaceUi={workspaceUi} />
    </WorkspaceUiContext.Provider>
  );
}

function ShellInner({ navigation, onClose, app, workspaceUi }: { navigation: OverlayNavigation; onClose: () => void; app: AppController; workspaceUi: WorkspaceUiStore }) {
  const mobile = useIsMobile();
  const characterId = useAppState((s) => s.selectedCharacterId);
  const developerMode = useAppState((s) => s.config?.ui.developerModeEnabled ?? false);
  const sourceUi = useSourceUi(characterId);
  const activeTab = sourceUi.activeTab;
  const setActiveTab = (tab: WorkspaceTab) => workspaceUi.updateSource(characterId, { activeTab: tab, secondaryOpen: false });
  const [settingsOpen, setSettingsOpen] = useState(Boolean(navigation.settings));
  const [section, setSection] = useState<SettingsSection>(navigation.settings ?? DEFAULT_SETTINGS_SECTION);
  const sidebarOpen = useWorkspaceUi((ui) => ui.sidebarOpen);
  const setSidebarOpen = (open: boolean) => workspaceUi.updateGlobal({ sidebarOpen: open });
  const [drawerOpen, setDrawerOpen] = useState(false);
  void app;

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
    if (!developerMode && section === "logs") setSection(DEFAULT_SETTINGS_SECTION);
  }, [developerMode, section]);

  const toggleSettings = () => {
    setSettingsOpen((open) => !open);
    setDrawerOpen(false);
  };
  const selectSection = (id: SettingsSection) => {
    setSection(id);
    setDrawerOpen(false);
  };
  const selectTab = (id: WorkspaceTab) => {
    setActiveTab(id);
    setSettingsOpen(false);
  };

  const view = useWorkspaceTabView({ characterId, tab: activeTab, mobile });
  const sidebarLabel = settingsOpen ? SHELL_LABELS.settingsList : SHELL_LABELS.rosterList;
  const sidebar = settingsOpen
    ? <SettingsNavigation active={section} developerMode={developerMode} onSelect={selectSection} onBack={toggleSettings} />
    : <RosterPlaceholder />;
  const main = settingsOpen
    ? <div class="min-h-0 flex-1 overflow-y-auto" data-workspace-scroll=""><SettingsPage section={section} /></div>
    : (
      <div class="flex min-h-0 flex-1">
        <WorkspaceMain tab={activeTab} view={view} />
        {view.secondary && !mobile ? <WorkspaceSecondary secondary={view.secondary} /> : null}
      </div>
    );

  if (mobile) {
    return (
      <div class="flex h-full min-h-0 w-full flex-col bg-workspace-pane text-foreground" data-ii-am-shell="mobile">
        <header class="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2">
          <IconButton label={SHELL_LABELS.sidebarToggle(sidebarLabel)} aria-expanded={drawerOpen} onClick={() => setDrawerOpen(!drawerOpen)}>
            <MenuIcon />
          </IconButton>
          <div class="min-w-0 flex-1 truncate px-1 text-sm font-extrabold">{SHELL_LABELS.appName}</div>
          {!settingsOpen ? (
            <IconButton label={SHELL_LABELS.openSettings} title="Settings" onClick={toggleSettings} data-mobile-settings-entry="">
              <SettingsIcon />
            </IconButton>
          ) : null}
          <IconButton label={SHELL_LABELS.close} onClick={onClose}><XIcon /></IconButton>
        </header>
        {!settingsOpen ? (
          <Tabs
            idPrefix={TAB_ID_PREFIX}
            aria-label={SHELL_LABELS.workspaceNav}
            className="shrink-0 overflow-x-auto border-b border-border px-2 py-1"
            items={WORKSPACE_TABS.map((tab) => ({ id: tab.id, label: tab.mobileLabel, ariaLabel: tab.label }))}
            value={activeTab}
            onValueChange={selectTab}
          />
        ) : null}
        <main class="flex min-h-0 flex-1 flex-col">{view.secondary && !settingsOpen ? <WorkspaceSecondary secondary={view.secondary} /> : main}</main>
        <MobileDrawer open={drawerOpen} label={sidebarLabel} onClose={() => setDrawerOpen(false)}>{sidebar}</MobileDrawer>
      </div>
    );
  }

  const showSidebar = settingsOpen || sidebarOpen;
  return (
    <div
      class="grid h-full min-h-0 w-full bg-workspace-pane text-foreground"
      style={{ gridTemplateColumns: `60px ${showSidebar ? SIDEBAR_WIDTH : 0}px minmax(0,1fr)` }}
      data-ii-am-shell="desktop"
    >
      <Rail settingsOpen={settingsOpen} onToggleSettings={toggleSettings} />
      <aside
        aria-label={sidebarLabel}
        inert={!showSidebar}
        class={cn("min-h-0 min-w-0 overflow-hidden border-r border-border bg-sidebar transition-opacity", !showSidebar && "opacity-0")}
      >
        {sidebar}
      </aside>
      <section class="flex min-h-0 min-w-0 flex-col" data-workspace-pane="primary">
        <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          {!settingsOpen ? (
            <IconButton
              label={SHELL_LABELS.sidebarToggle(sidebarLabel)}
              aria-pressed={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <PanelLeftIcon />
            </IconButton>
          ) : null}
          {!settingsOpen ? (
            <Tabs
              idPrefix={TAB_ID_PREFIX}
              aria-label={SHELL_LABELS.workspaceNav}
              className="min-w-0 flex-1 overflow-x-auto"
              items={WORKSPACE_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
              value={activeTab}
              onValueChange={selectTab}
            />
          ) : <div class="min-w-0 flex-1" />}
          <IconButton label={SHELL_LABELS.close} onClick={onClose}><XIcon /></IconButton>
        </header>
        <div class="flex min-h-0 flex-1 flex-col">{main}</div>
      </section>
    </div>
  );
}

function Rail({ settingsOpen, onToggleSettings }: { settingsOpen: boolean; onToggleSettings: () => void }) {
  return (
    <nav aria-label={SHELL_LABELS.characterSelection} class="flex min-h-0 flex-col items-center gap-2 border-r border-border bg-sidebar py-3">
      <div class="grid size-10 place-items-center rounded-lg bg-surface-navigation-selected text-primary" title={SHELL_LABELS.appName} aria-hidden="true">
        <DiamondIcon className="size-5" />
      </div>
      <div class="min-h-0 w-full flex-1" />
      <IconButton
        label={SHELL_LABELS.settings}
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
                        "flex h-9 w-full items-center rounded-md px-2.5 text-left text-xs font-bold text-muted-foreground outline-none transition-colors hover:bg-surface-navigation-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55",
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

function RosterPlaceholder() {
  return (
    <div class="flex h-full min-h-0 flex-col">
      <header class="flex h-12 shrink-0 items-center gap-2 px-3">
        <UsersIcon className="text-muted-foreground" />
        <h2 class="text-xs font-extrabold">{SHELL_LABELS.rosterTitle}</h2>
      </header>
      <div class="m-3 rounded-lg bg-card p-4 text-xs leading-relaxed text-muted-foreground">{SHELL_LABELS.rosterPlaceholder}</div>
    </div>
  );
}

/** Primary pane of a workspace tab: page header + content + Command Dock (AM `y5` + `Fc`). */
function WorkspaceMain({ tab, view }: { tab: WorkspaceTab; view: TabView }) {
  return (
    <div class="relative flex min-h-0 flex-1 flex-col" data-workspace-pane="primary">
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
function WorkspaceSecondary({ secondary }: { secondary: NonNullable<TabView["secondary"]> }) {
  return (
    <div class="relative flex min-h-0 flex-1 flex-col border-l border-border" data-workspace-pane="secondary">
      <header class="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3" data-workspace-secondary-header="">
        {secondary.back ? <IconButton label={secondary.back.label} title={secondary.back.label} onClick={secondary.back.onClick}><ArrowLeftIcon /></IconButton> : null}
        <h2 class="min-w-0 flex-1 truncate text-sm font-extrabold">{secondary.title}</h2>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto" data-workspace-scroll="" style={{ paddingBottom: secondary.dock ? (secondary.dockExpanded ? "19rem" : "4.375rem") : undefined }}>
        <div class="grid content-start gap-3 p-4">{secondary.content}</div>
      </div>
      {secondary.dock ? <CommandDock expanded={secondary.dockExpanded}>{secondary.dock}</CommandDock> : null}
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
