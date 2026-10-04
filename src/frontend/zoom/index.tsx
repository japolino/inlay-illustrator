/**
 * Fullscreen image viewer / workspace ("zoom", spec/ui.md §5.3-§5.6): history navigation, prompt editor,
 * `$name` mentions in the AI edit panel, coordinate board, seed / size, drafts, delete, regenerate, download,
 * chat state window. Mounted in its own body-level `.ii-am-root` layer (z-index 9995: above the overlay and
 * the drawer, below host modals) so the scoped overlay CSS applies. Escape closes the top-most layer, then
 * the viewer (capture phase, like the overlay; the host uses Escape to stop generation).
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { render } from "preact";
import { handleOverlayEscape } from "../overlay/escape.js";
import { ConfirmProvider, LayerStack, OverlayEnvironmentContext } from "../overlay/ui/index.js";
import { trackKeyboardInset } from "../overlay/viewport.js";
import { AppContext, type AppController } from "../state/app-state.js";
import { ZOOM_LABELS } from "./labels.js";
import { buildImageGroups, flattenItems } from "./model.js";
import type { ZoomTarget } from "./session.js";
import { zoomVisibility } from "./signal.js";
import { ZoomApp } from "./ZoomApp.js";

export type { ZoomTarget } from "./session.js";

export interface ZoomViewer {
  open(target: ZoomTarget): void;
  /** Opens the viewer on the newest image of a chat (gallery entry point). Resolves false when the chat has no image. */
  openChat(chatId: string): Promise<boolean>;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

export const ZOOM_ROOT_CLASS = "ii-am-zoom";

export function createZoomViewer(ctx: SpindleFrontendContext, app: AppController, options: { doc?: Document } = {}): ZoomViewer {
  const doc = options.doc ?? document;
  const win = doc.defaultView ?? window;
  const layers = new LayerStack();
  const visibility = zoomVisibility(app);
  let root: HTMLElement | null = null;
  let mount: HTMLElement | null = null;
  let layer: HTMLElement | null = null;
  let stopInset: (() => void) | null = null;
  let open = false;
  let target: ZoomTarget | null = null;
  let restoreFocus: HTMLElement | null = null;

  const onKeyDown = (event: KeyboardEvent) => {
    handleOverlayEscape(event, { open, root, layers, closeOverlay: () => viewer.close() });
  };

  function ensureRoot(): void {
    if (root) return;
    try {
      root = ctx.dom.createElement("div");
    } catch {
      root = doc.createElement("div");
    }
    root.className = `ii-am-root ${ZOOM_ROOT_CLASS}`;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", ZOOM_LABELS.dialog);
    root.tabIndex = -1;
    root.style.cssText = [
      "position:fixed", "inset:0", "z-index:9995", "display:none", "flex-direction:column", "overflow:hidden",
      "width:var(--app-scaled-viewport-width,100vw)", "height:var(--app-scaled-viewport-height,100dvh)",
      "background:var(--color-background)",
      "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) calc(env(safe-area-inset-bottom,0px) + var(--ii-am-keyboard-inset,0px)) env(safe-area-inset-left,0px)",
      "isolation:isolate"
    ].join(";");
    mount = doc.createElement("div");
    mount.style.cssText = "display:flex;flex:1 1 auto;min-height:0;min-width:0;flex-direction:column;";
    layer = doc.createElement("div");
    layer.setAttribute("data-ii-am-layer", "");
    root.append(mount, layer);
    doc.body.appendChild(root);
    stopInset = trackKeyboardInset(root, win);
  }

  function renderApp(): void {
    if (!mount) return;
    if (!open || !target) {
      render(null, mount);
      return;
    }
    render(
      <AppContext.Provider value={app}>
        <OverlayEnvironmentContext.Provider value={{ layers, portal: () => layer }}>
          <ConfirmProvider>
            <ZoomApp target={target} onClose={() => viewer.close()} doc={doc} />
          </ConfirmProvider>
        </OverlayEnvironmentContext.Provider>
      </AppContext.Provider>,
      mount
    );
  }

  const viewer: ZoomViewer = {
    open(next) {
      if (!next?.chatId || !next.slotId) return;
      ensureRoot();
      target = { ...next };
      if (!open) {
        open = true;
        restoreFocus = doc.activeElement instanceof win.HTMLElement ? doc.activeElement : null;
        root!.style.display = "flex";
        root!.setAttribute("data-state", "open");
        win.addEventListener("keydown", onKeyDown, true);
        visibility.set(true);
      }
      renderApp();
      root!.focus({ preventScroll: true });
    },
    async openChat(chatId) {
      if (!chatId) return false;
      try {
        const { messages } = await app.call("chatDom.getMessageStates", { chatId });
        const items = flattenItems(buildImageGroups(messages));
        const last = items[items.length - 1];
        if (!last) return false;
        viewer.open({ chatId, slotId: last.slotId, entryId: last.entryId, messageKey: last.messageKey });
        return true;
      } catch (error) {
        app.notifyError(error);
        return false;
      }
    },
    close() {
      if (!open) return;
      open = false;
      win.removeEventListener("keydown", onKeyDown, true);
      while (layers.size > 0) layers.closeTop();
      target = null;
      renderApp();
      if (root) {
        root.style.display = "none";
        root.setAttribute("data-state", "closed");
      }
      visibility.set(false);
      if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
      restoreFocus = null;
    },
    isOpen: () => open,
    destroy() {
      viewer.close();
      stopInset?.();
      if (mount) render(null, mount);
      root?.remove();
      root = null;
      mount = null;
      layer = null;
    }
  };
  return viewer;
}
