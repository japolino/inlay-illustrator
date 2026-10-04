import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { render } from "preact";
import { OVERLAY_FRAME_CLASS, OVERLAY_ROOT_CLASS } from "./constants.js";
import { handleOverlayEscape } from "./escape.js";
import { createOverlayHost, type OverlayHost, type OverlayHostKind } from "./host.js";
import type { SettingsSection, WorkspaceTab } from "./labels.js";
import { OverlayApp, type OverlayNavigation } from "./App.js";
import type { FrontendStore } from "./store.js";
import { LayerStack } from "./ui/layers.js";
import { ToastStore } from "./ui/toast.js";
import { trackKeyboardInset } from "./viewport.js";

export type OverlayOpenOptions = { tab?: WorkspaceTab; settings?: SettingsSection | true };

export type OverlayController = {
  open(options?: OverlayOpenOptions): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /** Mount strategy that succeeded, or null before the first open. */
  hostKind(): OverlayHostKind | null;
  readonly toasts: ToastStore;
  destroy(): void;
};

export type OverlayControllerOptions = {
  store: FrontendStore;
  patchConfig: (patch: Partial<import("../../shared/config.js").Config>) => void;
  doc?: Document;
  onHostFallback?: (kind: OverlayHostKind, error: unknown) => void;
};

/**
 * Owns the full-screen overlay: mounts it once (lazily on first open), keeps
 * the Preact tree alive while hidden, and handles Escape in the capture phase.
 */
export function createOverlayController(ctx: SpindleFrontendContext, options: OverlayControllerOptions): OverlayController {
  const doc = options.doc ?? document;
  const win = doc.defaultView ?? window;
  const layers = new LayerStack();
  const toasts = new ToastStore();
  let host: OverlayHost | null = null;
  let root: HTMLDivElement | null = null;
  let appMount: HTMLDivElement | null = null;
  let layer: HTMLDivElement | null = null;
  let stopKeyboardTracking: (() => void) | null = null;
  let open = false;
  let navigation: OverlayNavigation = { requestId: 0 };
  let restoreFocus: HTMLElement | null = null;

  const onKeyDown = (event: KeyboardEvent) => {
    handleOverlayEscape(event, { open, root, layers, closeOverlay: () => controller.close() });
  };

  function renderApp(): void {
    if (!appMount) return;
    render(
      <OverlayApp
        store={options.store}
        layers={layers}
        toasts={toasts}
        portal={() => layer}
        navigation={navigation}
        onClose={() => controller.close()}
        patchConfig={options.patchConfig}
      />,
      appMount
    );
  }

  function ensureMounted(): void {
    if (host) return;
    host = createOverlayHost(ctx.ui, doc, options.onHostFallback);
    root = doc.createElement("div");
    root.className = `${OVERLAY_ROOT_CLASS} ${OVERLAY_FRAME_CLASS}`;
    root.setAttribute("data-state", "closed");
    root.setAttribute("data-ii-am-host-kind", host.kind);
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Inlay Illustrator");
    root.tabIndex = -1;
    appMount = doc.createElement("div");
    appMount.className = "ii-am-app";
    appMount.style.cssText = "display:flex;flex:1 1 auto;min-height:0;min-width:0;flex-direction:column;";
    layer = doc.createElement("div");
    layer.setAttribute("data-ii-am-layer", "");
    root.append(appMount, layer);
    host.container.appendChild(root);
    stopKeyboardTracking = trackKeyboardInset(root, win);
    renderApp();
  }

  const controller: OverlayController = {
    open(openOptions) {
      if (openOptions?.tab || openOptions?.settings) {
        navigation = {
          requestId: navigation.requestId + 1,
          tab: openOptions.tab,
          settings: openOptions.settings === true ? "charx" : openOptions.settings
        };
        if (host) renderApp();
      }
      ensureMounted();
      if (open) return;
      open = true;
      restoreFocus = doc.activeElement instanceof win.HTMLElement ? doc.activeElement : null;
      root!.setAttribute("data-state", "open");
      host!.setVisible(true);
      win.addEventListener("keydown", onKeyDown, true);
      options.store.set({ overlayOpen: true });
      root!.focus({ preventScroll: true });
    },
    close() {
      if (!open) return;
      open = false;
      win.removeEventListener("keydown", onKeyDown, true);
      root?.setAttribute("data-state", "closed");
      host?.setVisible(false);
      options.store.set({ overlayOpen: false });
      if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
      restoreFocus = null;
    },
    toggle() {
      if (open) controller.close();
      else controller.open();
    },
    isOpen: () => open,
    hostKind: () => host?.kind ?? null,
    toasts,
    destroy() {
      controller.close();
      stopKeyboardTracking?.();
      if (appMount) render(null, appMount);
      root?.remove();
      host?.destroy();
      host = null;
      root = null;
      appMount = null;
      layer = null;
    }
  };
  return controller;
}
