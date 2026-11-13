/**
 * Body-level chat runtime surfaces (Preact, inside a `.ii-am-root`): runtime toast stack (AM `tOt`/`JCt`,
 * spec/ui.md §6.3), generation-count panel (AM `SCt`/`kCt`, §6.2, incl. floating mode §6.2.6) and the
 * runtime error dialog (AM `aOt`, §6.4). Styles: ./styles.ts.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { analysisExecutionNeedsSeed, generationProviderFromLumiverse, type AnalysisExecution, type ChatImageGenerationSettings, type EffectiveCharxSettings, type InlayConfig } from "../../shared/contract/config.js";
import type { AppController } from "../state/app-state.js";
import { useSelector } from "../state/store.js";
import { applyCountAction, applyExecutionAction, countLimits, countToggleText, countView, executionView, floatingStyle, normalizeFloatingPoint, placeCountMenu, resolutionIconRect, type CountAction, type CountView, type ExecutionAction } from "./count-model.js";
import { COUNT_LABELS, ERROR_DIALOG_LABELS, fill, TOAST_LABELS } from "./labels.js";
import type { ChatRuntimeStore } from "./runtime-store.js";
import { buildToastStack, errorDetailText, errorLogText, hasErrorDetails, type RuntimeToastModel } from "./toast-model.js";
import { CrosshairIcon, GenerateIcon, OverviewIcon, ResolutionIcon, RetryIcon } from "./widgets.js";
import type { AtelierState } from "../../shared/contract/atelier.js";

export type ToastCommand = "cancel" | "retry" | "restart" | "dismiss";

export interface ChatRuntimeProps {
  app: AppController;
  store: ChatRuntimeStore;
  getActiveChatId: () => string;
  /** Count panel action (illustrate or reroll the latest assistant message); no button without it. */
  generateLatest?: () => Promise<void>;
  /** Count panel action: open the overlay on the active chat's character; no button without it. */
  openOverview?: () => void;
  onToastCommand: (toast: RuntimeToastModel, command: ToastCommand) => void;
}

function useRuntimeRevision(store: ChatRuntimeStore): number {
  const [revision, setRevision] = useState(store.revision);
  useEffect(() => {
    setRevision(store.revision);
    return store.subscribe(() => setRevision(store.revision));
  }, [store]);
  return revision;
}

/** Root of the body-level runtime host. */
export function ChatRuntime({ app, store, getActiveChatId, generateLatest, openOverview, onToastCommand }: ChatRuntimeProps) {
  useRuntimeRevision(store);
  const settings = useSelector(app.store, (s) => s.chatImageGeneration);
  const config = useSelector(app.store, (s) => s.config);
  const showCount = !!settings && !!config && store.chatActive && !store.zoomOpen && !store.overlayOpen;
  const floating = !!config?.ui.floatingGenerationCountEnabled;
  return (
    <div
      class="ii-am-chat-runtime"
      data-ii-hidden={store.overlayOpen ? "true" : undefined}
      data-ii-zoom={store.zoomOpen ? "true" : undefined}
      data-ii-count={showCount && !floating ? "true" : undefined}
    >
      {showCount ? <CountPanel key={getActiveChatId()} app={app} settings={settings!} config={config!} chatId={getActiveChatId()} generateLatest={generateLatest} openOverview={openOverview} /> : null}
      <ToastStack app={app} store={store} onCommand={onToastCommand} />
      <ErrorDialog store={store} onDismiss={(item) => { if (item?.jobId) onToastCommand({ key: `generation:${item.jobId}`, jobId: item.jobId } as RuntimeToastModel, "dismiss"); }} />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Toast stack
 * ---------------------------------------------------------------------------------------------- */

function ToastStack({ app, store, onCommand }: { app: AppController; store: ChatRuntimeStore; onCommand: ChatRuntimeProps["onToastCommand"] }) {
  const jobs = useSelector(app.store, (s) => s.generationJobs);
  const developerMode = useSelector(app.store, (s) => s.config?.ui.developerModeEnabled === true);
  const toasts = useMemo(
    () => buildToastStack({ running: Object.values(jobs), finished: store.finished, notices: store.notices, dismissed: store.dismissed, displayIndex: store.displayIndex, seenAt: store.seenAt, now: Date.now(), developerMode }),
    [jobs, store.revision, developerMode]
  );
  if (store.overlayOpen || toasts.length === 0) return null;
  return (
    <div class="ii-am-chat-toast-stack" role="region" aria-label={TOAST_LABELS.notificationsRegion}>
      {toasts.map((toast) => {
        const row = (
          <RuntimeToast
            key={toast.key}
            toast={toast}
            expanded={store.expanded.has(toast.key)}
            historyExpanded={store.historyExpanded.has(toast.key)}
            lastCopy={store.copyStatus.get(toast.key)}
            onToggle={() => store.toggleExpanded(toast.key)}
            onToggleHistory={() => store.toggleHistory(toast.key)}
            onCopied={(text, status) => store.setCopyStatus(toast.key, text, status)}
            onCommand={(command) => onCommand(toast, command)}
          />
        );
        return toast.parentKey ? (
          <div key={toast.key} class="ii-am-chat-toast-child">
            <span class="ii-am-chat-toast-child__branch" aria-hidden="true">ㄴ</span>
            {row}
          </div>
        ) : row;
      })}
    </div>
  );
}

/** AM `J0` 662: clipboard API, else a hidden textarea and `execCommand("copy")`. */
async function copyText(doc: Document, text: string): Promise<void> {
  try {
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return;
    }
  } catch {
    // fall through to execCommand
  }
  const area = doc.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.inset = "0 auto auto -9999px";
  doc.body.append(area);
  area.select();
  const copied = doc.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("Clipboard copy failed.");
}

interface RuntimeToastProps {
  toast: RuntimeToastModel;
  expanded: boolean;
  historyExpanded: boolean;
  lastCopy: { text: string; status: string } | undefined;
  onToggle: () => void;
  onToggleHistory: () => void;
  onCopied: (text: string, status: string) => void;
  onCommand: (command: ToastCommand) => void;
}

function RuntimeToast({ toast, expanded, historyExpanded, lastCopy, onToggle, onToggleHistory, onCopied, onCommand }: RuntimeToastProps) {
  useEffect(() => {
    if (toast.autoDismissMs <= 0) return undefined;
    const remaining = Math.max(500, toast.autoDismissMs - (Date.now() - toast.createdAt));
    const timer = setTimeout(() => onCommand("dismiss"), remaining);
    return () => clearTimeout(timer);
  }, [toast.key, toast.autoDismissMs, toast.createdAt]);
  const danger = toast.tone === "danger";
  const hasDetails = hasErrorDetails(toast);
  const log = errorLogText(toast);
  const copyStatus = lastCopy?.text === log ? lastCopy.status : undefined;
  const copyLog = async (event: MouseEvent) => {
    let status: string = TOAST_LABELS.copied;
    try {
      await copyText((event.currentTarget as HTMLElement).ownerDocument, log);
    } catch {
      status = TOAST_LABELS.copyFailed;
    }
    onCopied(log, status);
  };
  const previousCount = toast.previousErrors?.length ?? 0;
  const displayMessage = toast.retryCount && toast.message.endsWith(` · ${toast.retryCount}`)
    ? toast.message.slice(0, -(` · ${toast.retryCount}`.length))
    : toast.message;
  const copy = (
    <span class="ii-am-chat-toast__copy">
      <span class="ii-am-chat-toast__message" title={toast.message}>
        {toast.retryCount ? (
          <>
            <span class="x-risu-am-runtime-toast__message-label ii-am-chat-toast__message-label">{displayMessage}</span>
            {" · "}
            <span class="x-risu-am-runtime-toast__retry-count ii-am-chat-toast__retry-count">{toast.retryCount}</span>
          </>
        ) : (
          toast.message
        )}
      </span>
      {toast.detail && !danger ? <span class="ii-am-chat-toast__detail" title={toast.detail}>{toast.detail}</span> : null}
    </span>
  );
  const actionLabel = toast.action === "cancel" ? TOAST_LABELS.stop : toast.action === "retry" ? TOAST_LABELS.retry : TOAST_LABELS.dismiss;
  return (
    <section
      class="ii-am-chat-toast"
      data-ii-tone={toast.tone}
      data-ii-kind={toast.kind}
      data-ii-toast-key={toast.key}
      role={danger ? "alert" : "status"}
      style={{ "--ii-am-toast-progress": `${(Math.min(1, Math.max(0, toast.progress)) * 100).toFixed(2)}%` }}
    >
      <span class="ii-am-chat-toast__progress" aria-hidden="true" />
      <div class="ii-am-chat-toast__content" data-ii-indexed={toast.displayIndex ? "true" : undefined}>
        <span class="ii-am-chat-toast__spinner" aria-hidden="true" />
        {hasDetails ? (
          <button type="button" class="ii-am-chat-toast__error-toggle" aria-expanded={expanded} aria-label={expanded ? TOAST_LABELS.hideErrorDetails : TOAST_LABELS.showErrorDetails} onClick={onToggle}>
            {copy}
          </button>
        ) : copy}
        {toast.technologyBadge ? <span class="ii-am-chat-toast__technology-badge" title={toast.technologyBadgeTitle ?? toast.technologyBadge}>{toast.technologyBadge}</span> : null}
        {toast.displayIndex ? (
          <span class="ii-am-chat-toast__identifier" aria-label={fill(TOAST_LABELS.jobNumber, { n: toast.displayIndex })}>#{toast.displayIndex}</span>
        ) : null}
        <span class="ii-am-chat-toast__actions">
          {toast.action !== "none" ? (
            <button
              type="button"
              class="ii-am-chat-toast__action"
              data-ii-toast-action={toast.action}
              aria-label={actionLabel}
              title={actionLabel}
              onClick={() => onCommand(toast.action === "cancel" ? "cancel" : toast.action === "retry" ? "retry" : "dismiss")}
            >
              {toast.action === "retry" ? <RetryIcon /> : toast.action === "dismiss" ? <span aria-hidden="true">×</span> : null}
            </button>
          ) : null}
        </span>
      </div>
      {hasDetails && expanded ? (
        <div class="ii-am-chat-toast__error-details">
          <p>{errorDetailText(toast)}</p>
          {previousCount ? (
            <div class="ii-am-chat-toast__previous-errors">
              <button type="button" data-ii-toast-action="history" aria-expanded={historyExpanded} onClick={onToggleHistory}>
                {fill(historyExpanded ? TOAST_LABELS.hidePreviousErrors : TOAST_LABELS.showPreviousErrors, { n: previousCount })}
              </button>
              {historyExpanded ? toast.previousErrors!.map((text, index) => <p key={index}>{text}</p>) : null}
            </div>
          ) : null}
          <div class="ii-am-chat-toast__error-buttons">
            {toast.canRestart ? <button type="button" onClick={() => onCommand("restart")}>{TOAST_LABELS.restart}</button> : null}
            <button type="button" data-ii-toast-action="copy-error" onClick={(event) => void copyLog(event)}>{TOAST_LABELS.copyErrorLog}</button>
            {copyStatus ? <span class="ii-am-chat-toast__copy-status" role="status">{copyStatus}</span> : null}
            {toast.tone === "running" ? (
              <button type="button" data-ii-toast-action="details" onClick={onToggle}>{TOAST_LABELS.hideDetails}</button>
            ) : (
              <button type="button" onClick={() => onCommand("dismiss")}>{TOAST_LABELS.dismiss}</button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Generation-count panel
 * ---------------------------------------------------------------------------------------------- */

const ImageIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

interface SceneOption { value: string; label: string }

/**
 * Directing-guideline menu options (AM 0.9.90 `hAe`): the Maid Atelier library's directing guidelines, in the order the
 * backend's `directionMenu` lists them. Built-in guidelines keep their short toolbar labels.
 */
export function sceneOptions(menu: AtelierState["directionMenu"] | null | undefined): SceneOption[] {
  const builtIn: Record<string, string> = {
    default: COUNT_LABELS.sceneIllustration,
    "default-comic": COUNT_LABELS.sceneComic,
    "system-pov": COUNT_LABELS.scenePov,
    "system-ensemble": COUNT_LABELS.sceneEnsemble,
  };
  return (menu?.options ?? []).map((o) => ({ value: o.value, label: builtIn[o.value] ?? (o.shortLabel || o.label) }));
}

const MODE_LABEL = { fixed: COUNT_LABELS.fixed, range: COUNT_LABELS.range, split: COUNT_LABELS.split } as const;

function Stepper({ value, bounds, label, decLabel, incLabel, onStep }: { value: number; bounds: { min: number; max: number }; label: string; decLabel: string; incLabel: string; onStep: (delta: -1 | 1) => void }) {
  return (
    <span class="ii-am-chat-count__stepper" role="group" aria-label={label} title={label}>
      <button type="button" class="ii-am-chat-count__step-button" aria-label={decLabel} disabled={value <= bounds.min} onClick={() => onStep(-1)}>−</button>
      <output class="ii-am-chat-count__step-output">{value}</output>
      <button type="button" class="ii-am-chat-count__step-button" aria-label={incLabel} disabled={value >= bounds.max} onClick={() => onStep(1)}>+</button>
    </span>
  );
}

/** Debounced save of the toolbar resolution / AI coordinates (AM 0.9.90 N 182030: 300 ms on the settings domain). */
const EXECUTION_SAVE_DELAY_MS = 300;

/**
 * Toolbar resolution / AI coordinates (AM 0.9.90 `runtime.analysisExecution`). Until both are saved, the current
 * character's old CharX values (`charxSettings.get`) seed the view; the first save persists both (AM `PPe$990`).
 */
function useExecutionSettings(app: AppController, config: InlayConfig) {
  const characterId = useSelector(app.store, (s) => s.selectedCharacterId);
  const needsSeed = analysisExecutionNeedsSeed(config.runtime);
  const [source, setSource] = useState<{ characterId: string; settings: EffectiveCharxSettings } | null>(null);
  const [pending, setPending] = useState<Required<AnalysisExecution> | null>(null);
  const [failed, setFailed] = useState(false);
  const failedValue = useRef<Required<AnalysisExecution> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Value waiting for the debounce, and the latest `persist` (the unmount flush uses both). */
  const queued = useRef<Required<AnalysisExecution> | null>(null);
  const persistRef = useRef<(next: Required<AnalysisExecution>) => Promise<void>>(async () => undefined);
  useEffect(() => {
    if (!needsSeed || !characterId || source?.characterId === characterId) return;
    let live = true;
    void app.call("charxSettings.get", { characterId }).then(
      (r) => { if (live) setSource({ characterId, settings: r.effective }); },
      () => undefined
    );
    return () => { live = false; };
  }, [needsSeed, characterId]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    // Unmounted within the debounce (overlay opened, chat switched, ...): save now instead of dropping the pick.
    if (queued.current) void persistRef.current(queued.current);
  }, []);
  const provider = (config.image.provider ? generationProviderFromLumiverse(config.image.provider) : null) ?? config.runtime.generationProvider;
  const seed = needsSeed && source?.characterId === characterId ? source.settings : null;
  const view = executionView(pending ? { ...config.runtime, analysisExecution: pending } : config.runtime, seed, COUNT_LABELS.resolutionAuto);
  const persist = async (next: Required<AnalysisExecution>) => {
    const saved = await app.updateConfig({ runtime: { analysisExecution: next } } as never);
    if (saved === null) {
      failedValue.current = next;
      setFailed(true);
    } else {
      failedValue.current = null;
      setFailed(false);
      setPending((current) => (current === next ? null : current));
    }
  };
  persistRef.current = persist;
  const apply = (action: ExecutionAction) => {
    const next = applyExecutionAction(view, action);
    if (!next) return;
    setPending(next);
    queued.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; queued.current = null; void persist(next); }, EXECUTION_SAVE_DELAY_MS);
  };
  const retry = () => { if (failedValue.current) void persist(failedValue.current); };
  return { view, novelai: provider === "novelai", apply, retry, failed };
}

interface CountPanelProps {
  app: AppController;
  settings: ChatImageGenerationSettings;
  config: InlayConfig;
  chatId: string;
  generateLatest?: () => Promise<void>;
  openOverview?: () => void;
}

function CountPanel({ app, settings, config, chatId, generateLatest, openOverview }: CountPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [starting, setStarting] = useState(false);
  const chatBusy = useSelector(app.store, (s) => Object.values(s.generationJobs).some((job) => job.chatId === chatId && (job.status === "queued" || job.status === "running")));
  const [menu, setMenu] = useState<"none" | "count" | "scene" | "resolution">("none");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "failed">("saved");
  const [sceneSaving, setSceneSaving] = useState(false);
  const failedValue = useRef<ChatImageGenerationSettings | null>(null);
  const execution = useExecutionSettings(app, config);
  const limits = countLimits(config.ui.developerModeEnabled);
  const view: CountView = countView(settings, limits);
  // The directing menu reads the Maid Atelier library (loaded once; `atelier.changed` keeps it current).
  const directionMenu = useSelector(app.store, (s) => s.atelier?.directionMenu ?? null);
  useEffect(() => {
    if (app.state.atelierState === "idle") void app.loadAtelier();
  }, [app]);
  const options = sceneOptions(directionMenu);
  const sceneAvailable = options.length > 0;
  const sceneSelection = directionMenu?.selected ?? options[0]?.value ?? "";
  const sceneLabel = options.find((o) => o.value === sceneSelection)?.label ?? options[0]?.label ?? "";
  const floating = config.ui.floatingGenerationCountEnabled;
  const toggleLabel = expanded ? COUNT_LABELS.collapse : COUNT_LABELS.expand;
  const toggleAria = `${toggleLabel}: ${fill(COUNT_LABELS.toggleValue, { mode: MODE_LABEL[view.mode], value: countToggleText(view) })}`;

  const save = async (next: ChatImageGenerationSettings) => {
    setSaveStatus("saving");
    const notice = await app.setChatImageGeneration(next);
    if (notice === null) {
      failedValue.current = next;
      setSaveStatus("failed");
    } else {
      failedValue.current = null;
      setSaveStatus("saved");
    }
  };
  const run = (action: CountAction) => {
    const next = applyCountAction(settings, action, limits);
    if (next) void save(next);
  };
  const retrySave = () => {
    if (failedValue.current) void save(failedValue.current);
    else execution.retry();
  };
  const failed = saveStatus === "failed" || execution.failed;
  const selectScene = async (id: string) => {
    setMenu("none");
    if (sceneSaving || id === sceneSelection) return;
    if (!options.some((o) => o.value === id)) return;
    setSceneSaving(true);
    try {
      const result = await app.call("atelier.instructions.select", { kind: "scene", id });
      app.applyAtelier(result.state);
    } catch (error) {
      app.notifyError(error);
    } finally {
      setSceneSaving(false);
    }
  };

  // Floating drag (AM `pCt`): drag the toggle after 6px; a click right after a drag is swallowed.
  const drag = useRef<{ x: number; y: number; dragging: boolean; pointerId: number } | null>(null);
  const [livePosition, setLivePosition] = useState<{ x: number; y: number } | null>(null);
  const swallowClickUntil = useRef(0);
  const position = livePosition ?? config.ui.floatingGenerationCountPosition;
  const onPointerDown = (event: PointerEvent) => {
    if (!floating || event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, dragging: false, pointerId: event.pointerId };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.dragging && Math.hypot(event.clientX - state.x, event.clientY - state.y) < 6) return;
    state.dragging = true;
    const view = (event.currentTarget as HTMLElement).ownerDocument.defaultView ?? window;
    setLivePosition(normalizeFloatingPoint(event.clientX, event.clientY, view.innerWidth, view.innerHeight));
  };
  const onPointerUp = (event: PointerEvent) => {
    const state = drag.current;
    drag.current = null;
    if (!state?.dragging) return;
    swallowClickUntil.current = Date.now() + 1000;
    const view = (event.currentTarget as HTMLElement).ownerDocument.defaultView ?? window;
    const next = normalizeFloatingPoint(event.clientX, event.clientY, view.innerWidth, view.innerHeight);
    void app.updateConfig({ ui: { floatingGenerationCountPosition: next } }).then(() => setLivePosition(null));
  };

  // Open menus are placed from the whole panel edge (AM 0.9.91 `Fke`): the panel can wrap onto two rows, and a menu
  // anchored to its own button would cover the other row. Without a measurable layout the CSS position stays.
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const win = panel?.ownerDocument.defaultView;
    if (!panel || !win || !expanded || menu === "none") return;
    const place = () => {
      const menuEl = panel.querySelector<HTMLElement>(".ii-am-chat-count__menu");
      const button = menuEl?.parentElement?.querySelector<HTMLElement>('[aria-haspopup="menu"]');
      if (!menuEl || !button) return;
      menuEl.style.maxHeight = "";
      const panelRect = panel.getBoundingClientRect();
      const menuRect = menuEl.getBoundingClientRect();
      if (!panelRect.width || !menuRect.width || !menuRect.height) return;
      const at = placeCountMenu(panelRect, button.getBoundingClientRect(), menuRect, { width: win.innerWidth, height: win.innerHeight });
      Object.assign(menuEl.style, {
        position: "fixed",
        top: at.top === null ? "auto" : `${at.top}px`,
        bottom: at.bottom === null ? "auto" : `${at.bottom}px`,
        left: `${at.left}px`,
        right: "auto",
        maxHeight: `${at.maxHeight}px`
      });
    };
    place();
    win.addEventListener("resize", place);
    return () => win.removeEventListener("resize", place);
  }, [expanded, menu, position?.x, position?.y, view.mode, sceneLabel, failed]);

  const style = floating ? floatingStyle(position ?? null) : undefined;
  return (
    <section
      class="ii-am-chat-count"
      aria-label={COUNT_LABELS.section}
      data-ii-expanded={expanded ? "true" : "false"}
      data-ii-count-mode={view.mode}
      data-ii-scene-available={sceneAvailable ? "true" : "false"}
      data-ii-menu={menu}
      data-ii-floating={floating ? "true" : undefined}
      data-ii-floating-below={floating && position && position.y < 0.5 ? "true" : undefined}
      style={style}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (menu !== "none") setMenu("none");
        else setExpanded(false);
      }}
    >
      <div class="ii-am-chat-count__panel-anchor">
        <div ref={panelRef} class="ii-am-chat-count__panel" aria-hidden={expanded ? undefined : "true"} {...(expanded ? {} : { inert: true })}>
          <div class="ii-am-chat-count__settings">
            {generateLatest ? (
              <button
                type="button"
                class="ii-am-chat-count__option ii-am-chat-count__generate"
                aria-label={COUNT_LABELS.generateLatest}
                title={COUNT_LABELS.generateLatest}
                disabled={chatBusy || starting}
                onClick={() => {
                  setStarting(true);
                  void generateLatest().finally(() => setStarting(false));
                }}
              >
                <GenerateIcon />
              </button>
            ) : null}
            {openOverview ? (
              <button
                type="button"
                class="ii-am-chat-count__option ii-am-chat-count__overview"
                aria-label={COUNT_LABELS.openOverview}
                title={COUNT_LABELS.openOverview}
                onClick={openOverview}
              >
                <OverviewIcon />
              </button>
            ) : null}
            {sceneAvailable ? (
              <span class="ii-am-chat-count__scene">
                <button
                  type="button"
                  class="ii-am-chat-count__scene-button"
                  aria-label={COUNT_LABELS.sceneButton}
                  title={COUNT_LABELS.sceneButton}
                  aria-haspopup="menu"
                  aria-expanded={menu === "scene"}
                  aria-disabled={sceneSaving ? "true" : undefined}
                  onClick={() => { if (!sceneSaving) setMenu(menu === "scene" ? "none" : "scene"); }}
                >
                  <span class="ii-am-chat-count__scene-label">{sceneLabel}</span>
                </button>
                {menu === "scene" ? (
                  <div class="ii-am-chat-count__menu ii-am-chat-count__scene-menu" role="menu" aria-label={COUNT_LABELS.sceneMenu}>
                    {options.map((option) => (
                      <button key={option.value} type="button" role="menuitemradio" aria-checked={option.value === sceneSelection} class="ii-am-chat-count__menu-item" aria-disabled={sceneSaving ? "true" : undefined} onClick={() => void selectScene(option.value)}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </span>
            ) : null}
            <span class="ii-am-chat-count__resolution">
              <button
                type="button"
                class="ii-am-chat-count__option ii-am-chat-count__resolution-button"
                aria-label={fill(COUNT_LABELS.resolutionButton, { value: execution.view.resolutionLabel })}
                title={COUNT_LABELS.resolution}
                aria-haspopup="menu"
                aria-expanded={menu === "resolution"}
                data-am-action="toggle-resolution"
                onClick={() => setMenu(menu === "resolution" ? "none" : "resolution")}
              >
                <ResolutionIcon rect={resolutionIconRect(execution.view.resolution)} auto={!execution.view.resolution} />
              </button>
              {menu === "resolution" ? (
                <div class="ii-am-chat-count__menu ii-am-chat-count__resolution-menu" role="menu" aria-label={COUNT_LABELS.resolutionMenu}>
                  {execution.view.options.map((option) => (
                    <button key={option.value} type="button" role="menuitemradio" aria-checked={option.value === execution.view.resolutionValue} class="ii-am-chat-count__menu-item"
                      data-am-action="select-resolution" data-am-resolution={option.value}
                      onClick={() => { setMenu("none"); execution.apply({ type: "resolution", value: option.value }); }}>
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </span>
            {execution.novelai ? (
              <button
                type="button"
                class="ii-am-chat-count__option ii-am-chat-count__coordinates"
                aria-label={COUNT_LABELS.aiCoordinates}
                title={COUNT_LABELS.aiCoordinatesTitle}
                aria-pressed={execution.view.aiCoordinates}
                data-am-action="toggle-coordinates"
                onClick={() => execution.apply({ type: "coordinates" })}
              >
                <CrosshairIcon />
              </button>
            ) : null}
            <button type="button" class="ii-am-chat-count__option ii-am-chat-count__auto" aria-label={view.auto ? COUNT_LABELS.toManual : COUNT_LABELS.toAuto} title={view.auto ? COUNT_LABELS.toManual : COUNT_LABELS.toAuto} aria-pressed={view.auto} onClick={() => run("toggle-auto")}>
              {view.auto ? COUNT_LABELS.auto : COUNT_LABELS.manual}
            </button>
          </div>
          <div class="ii-am-chat-count__quantity">
            <span class="ii-am-chat-count__mode">
              <button
                type="button"
                class="ii-am-chat-count__option"
                aria-label={fill(COUNT_LABELS.modeButton, { mode: MODE_LABEL[view.mode] })}
                title={COUNT_LABELS.modeTitle}
                aria-haspopup="menu"
                aria-expanded={menu === "count"}
                onClick={() => setMenu(menu === "count" ? "none" : "count")}
              >
                {MODE_LABEL[view.mode]}
              </button>
              {menu === "count" ? (
                <div class="ii-am-chat-count__menu ii-am-chat-count__mode-menu" role="menu" aria-label={COUNT_LABELS.modeMenu}>
                  {(["fixed", "range", "split"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="menuitemradio"
                      aria-checked={view.mode === mode}
                      class="ii-am-chat-count__menu-item"
                      onClick={() => { setMenu("none"); run(`select-${mode}`); }}
                    >
                      {MODE_LABEL[mode]}
                    </button>
                  ))}
                </div>
              ) : null}
            </span>
            <span class="ii-am-chat-count__values">
              {view.mode === "fixed" ? (
                <Stepper value={view.fixed} bounds={view.bounds.fixed} label={COUNT_LABELS.count} decLabel={COUNT_LABELS.countDecrease} incLabel={COUNT_LABELS.countIncrease} onStep={(d) => run(d > 0 ? "fixed-increment" : "fixed-decrement")} />
              ) : view.mode === "range" ? (
                <>
                  <Stepper value={view.min} bounds={view.bounds.min} label={COUNT_LABELS.min} decLabel={COUNT_LABELS.minDecrease} incLabel={COUNT_LABELS.minIncrease} onStep={(d) => run(d > 0 ? "min-increment" : "min-decrement")} />
                  <span class="ii-am-chat-count__separator" aria-hidden="true">–</span>
                  <Stepper value={view.max} bounds={view.bounds.max} label={COUNT_LABELS.max} decLabel={COUNT_LABELS.maxDecrease} incLabel={COUNT_LABELS.maxIncrease} onStep={(d) => run(d > 0 ? "max-increment" : "max-decrement")} />
                </>
              ) : (
                <>
                  <Stepper value={view.total} bounds={view.bounds.total} label={COUNT_LABELS.total} decLabel={COUNT_LABELS.totalDecrease} incLabel={COUNT_LABELS.totalIncrease} onStep={(d) => run(d > 0 ? "total-increment" : "total-decrement")} />
                  <span class="ii-am-chat-count__separator" aria-hidden="true">/</span>
                  <Stepper value={view.batch} bounds={view.bounds.batch} label={COUNT_LABELS.batch} decLabel={COUNT_LABELS.batchDecrease} incLabel={COUNT_LABELS.batchIncrease} onStep={(d) => run(d > 0 ? "batch-increment" : "batch-decrement")} />
                </>
              )}
            </span>
          </div>
          {failed ? (
            <button type="button" class="ii-am-chat-count__option ii-am-chat-count__retry" aria-label={COUNT_LABELS.retrySave} title={COUNT_LABELS.retrySaveTitle} onClick={retrySave}>{COUNT_LABELS.retrySaveText}</button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        class="ii-am-chat-count__toggle"
        aria-label={toggleAria}
        title={floating ? `${toggleLabel} · ${COUNT_LABELS.dragHint}` : toggleLabel}
        aria-expanded={expanded}
        data-ii-save-status={saveStatus}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; setLivePosition(null); }}
        onClick={() => {
          if (Date.now() < swallowClickUntil.current) return;
          if (expanded) setMenu("none");
          setExpanded(!expanded);
        }}
      >
        <span class="ii-am-chat-count__toggle-icon"><ImageIcon /></span>
        <span>{countToggleText(view)}</span>
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Runtime error dialog
 * ---------------------------------------------------------------------------------------------- */

function ErrorDialog({ store, onDismiss }: { store: ChatRuntimeStore; onDismiss: (item: ReturnType<ChatRuntimeStore["dismissError"]>) => void }) {
  const item = store.errors[0];
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (item) closeRef.current?.focus({ preventScroll: true });
  }, [item?.id]);
  if (!item || store.overlayOpen) return null;
  const titleId = `ii-am-chat-error-title-${item.id.replace(/[^\w-]/gu, "")}`;
  return (
    <div class="ii-am-chat-error-backdrop">
      <div class="ii-am-chat-error" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div class="ii-am-chat-error__header">
          <div class="ii-am-chat-error__heading">
            <span class="ii-am-chat-error__icon" aria-hidden="true">!</span>
            <span class="ii-am-chat-error__titles">
              <span class="ii-am-chat-error__kicker">{ERROR_DIALOG_LABELS.kicker}</span>
              <span class="ii-am-chat-error__title" id={titleId} title={item.title}>{item.title}</span>
            </span>
          </div>
          <button ref={closeRef} type="button" class="ii-am-chat-error__close" aria-label={ERROR_DIALOG_LABELS.close} title={ERROR_DIALOG_LABELS.closeTitle} onClick={() => onDismiss(store.dismissError())}>×</button>
        </div>
        <p class="ii-am-chat-error__description">{ERROR_DIALOG_LABELS.description}</p>
        <pre class="ii-am-chat-error__message">{item.message}</pre>
      </div>
    </div>
  );
}
