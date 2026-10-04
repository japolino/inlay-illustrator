/**
 * Body-level chat runtime surfaces (Preact, inside a `.ii-am-root`): runtime toast stack (AM `tOt`/`JCt`,
 * spec/ui.md §6.3), generation-count panel (AM `SCt`/`kCt`, §6.2, incl. floating mode §6.2.6) and the
 * runtime error dialog (AM `aOt`, §6.4). Styles: ./styles.ts.
 */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ChatImageGenerationSettings, InlayConfig } from "../../shared/contract/config.js";
import type { AppController } from "../state/app-state.js";
import { useSelector } from "../state/store.js";
import { applyCountAction, countLimits, countToggleText, countView, floatingStyle, normalizeFloatingPoint, type CountAction, type CountView } from "./count-model.js";
import { COUNT_LABELS, ERROR_DIALOG_LABELS, fill, TOAST_LABELS } from "./labels.js";
import type { ChatRuntimeStore } from "./runtime-store.js";
import { buildToastStack, type RuntimeToastModel } from "./toast-model.js";
import { RetryIcon } from "./widgets.js";

export type ToastCommand = "cancel" | "retry" | "restart" | "dismiss";

export interface ChatRuntimeProps {
  app: AppController;
  store: ChatRuntimeStore;
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
export function ChatRuntime({ app, store, onToastCommand }: ChatRuntimeProps) {
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
      {showCount ? <CountPanel app={app} settings={settings!} config={config!} /> : null}
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
  const toasts = useMemo(
    () => buildToastStack({ running: Object.values(jobs), finished: store.finished, notices: store.notices, dismissed: store.dismissed, displayIndex: store.displayIndex, now: Date.now() }),
    [jobs, store.revision]
  );
  if (store.overlayOpen || toasts.length === 0) return null;
  return (
    <div class="ii-am-chat-toast-stack" role="region" aria-label={TOAST_LABELS.notificationsRegion}>
      {toasts.map((toast) => (
        <RuntimeToast key={toast.key} toast={toast} expanded={store.expanded.has(toast.key)} onToggle={() => store.toggleExpanded(toast.key)} onCommand={(command) => onCommand(toast, command)} />
      ))}
    </div>
  );
}

function RuntimeToast({ toast, expanded, onToggle, onCommand }: { toast: RuntimeToastModel; expanded: boolean; onToggle: () => void; onCommand: (command: ToastCommand) => void }) {
  useEffect(() => {
    if (toast.autoDismissMs <= 0) return undefined;
    const remaining = Math.max(500, toast.autoDismissMs - (Date.now() - toast.createdAt));
    const timer = setTimeout(() => onCommand("dismiss"), remaining);
    return () => clearTimeout(timer);
  }, [toast.key, toast.autoDismissMs, toast.createdAt]);
  const danger = toast.tone === "danger";
  const hasDetails = danger && !!(toast.errorText || toast.detail);
  const copy = (
    <span class="ii-am-chat-toast__copy">
      <span class="ii-am-chat-toast__message" title={toast.message}>{toast.message}</span>
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
          <p>{toast.errorText || toast.detail}</p>
          <div class="ii-am-chat-toast__error-buttons">
            {toast.canRestart ? <button type="button" onClick={() => onCommand("restart")}>{TOAST_LABELS.restart}</button> : null}
            <button type="button" onClick={() => onCommand("dismiss")}>{TOAST_LABELS.dismiss}</button>
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

/** Scene-direction menu options (AM `NIe` 177050: first preset, comic, rest). */
export function sceneOptions(config: InlayConfig): SceneOption[] {
  const presets = config.novelai.v5UserDirections.scene.presets ?? [];
  const label = (id: string, name: string) =>
    id === "scene-default" ? COUNT_LABELS.sceneIllustration
      : id === "scene-comic" ? COUNT_LABELS.sceneComic
        : id === "scene-pov" ? COUNT_LABELS.scenePov
          : id === "scene-ensemble" ? COUNT_LABELS.sceneEnsemble
            : name;
  const all = presets.map((p) => ({ value: p.id, label: label(p.id, p.name) }));
  const comic = all.find((o) => o.value === "scene-comic");
  return comic ? [all[0]!, comic, ...all.slice(1).filter((o) => o.value !== "scene-comic")].filter(Boolean) : all;
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

function CountPanel({ app, settings, config }: { app: AppController; settings: ChatImageGenerationSettings; config: InlayConfig }) {
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState<"none" | "count" | "scene">("none");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "failed">("saved");
  const [sceneSaving, setSceneSaving] = useState(false);
  const failedValue = useRef<ChatImageGenerationSettings | null>(null);
  const limits = countLimits(config.ui.developerModeEnabled, config.novelai.analysisProfile);
  const view: CountView = countView(settings, limits);
  const sceneAvailable = config.novelai.analysisProfile === "v5-hybrid" && (config.novelai.v5UserDirections.scene.presets?.length ?? 0) > 0;
  const options = sceneAvailable ? sceneOptions(config) : [];
  const scene = config.novelai.v5UserDirections.scene;
  const sceneSelection = scene.selectedPresetId ?? scene.presets?.[0]?.id ?? "";
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
  const selectScene = async (id: string) => {
    setMenu("none");
    if (sceneSaving || id === sceneSelection) return;
    const preset = scene.presets.find((p) => p.id === id);
    if (!preset) return;
    setSceneSaving(true);
    await app.updateConfig({
      novelai: { v5UserDirections: { scene: { ...scene, mode: "preset", selectedPresetId: id, presetId: id, customText: preset.instruction, ...(preset.controlOverrides ? { controlOverrides: preset.controlOverrides } : {}) } } }
    } as never);
    setSceneSaving(false);
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
      <div class="ii-am-chat-count__panel" aria-hidden={expanded ? undefined : "true"} {...(expanded ? {} : { inert: true })}>
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
        {saveStatus === "failed" ? (
          <button type="button" class="ii-am-chat-count__option" aria-label={COUNT_LABELS.retrySave} title={COUNT_LABELS.retrySave} onClick={() => { if (failedValue.current) void save(failedValue.current); }}>↻</button>
        ) : (
          <button type="button" class="ii-am-chat-count__option" aria-label={view.auto ? COUNT_LABELS.toManual : COUNT_LABELS.toAuto} title={view.auto ? COUNT_LABELS.toManual : COUNT_LABELS.toAuto} aria-pressed={view.auto} onClick={() => run("toggle-auto")}>
            {view.auto ? COUNT_LABELS.auto : COUNT_LABELS.manual}
          </button>
        )}
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
                  disabled={mode === "split" && !view.splitSupported}
                  title={mode === "split" && !view.splitSupported ? COUNT_LABELS.splitUnsupported : undefined}
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
