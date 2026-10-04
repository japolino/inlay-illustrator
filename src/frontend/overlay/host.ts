import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { SHELL_LABELS } from "./labels.js";

export type OverlayHostKind = "app-overlay" | "float-widget" | "body";

export type OverlayHost = {
  kind: OverlayHostKind;
  /** Host-owned element we render into. */
  container: HTMLElement;
  setVisible(visible: boolean): void;
  destroy(): void;
};

type HostUi = Pick<SpindleFrontendContext["ui"], "mountApp" | "createFloatWidget">;

/**
 * Mounts the overlay container, trying in order:
 * 1. `ctx.ui.mountApp({ position: "app-overlay" })` (permission app_manipulation),
 * 2. `ctx.ui.createFloatWidget({ fullscreen: true, chromeless: true })` (permission ui_panels),
 * 3. a node appended to `document.body`.
 */
export function createOverlayHost(ui: HostUi, doc: Document, onFallback?: (kind: OverlayHostKind, error: unknown) => void): OverlayHost {
  try {
    const handle = ui.mountApp({ position: "app-overlay", className: "ii-am-host" });
    handle.setVisible(false);
    return {
      kind: "app-overlay",
      container: handle.root,
      setVisible: (visible) => handle.setVisible(visible),
      destroy: () => handle.destroy()
    };
  } catch (error) {
    onFallback?.("float-widget", error);
  }
  try {
    const widget = ui.createFloatWidget({ fullscreen: true, chromeless: true, snapToEdge: false, tooltip: SHELL_LABELS.appName });
    widget.setVisible(false);
    return {
      kind: "float-widget",
      container: widget.root,
      setVisible: (visible) => {
        widget.setVisible(visible);
        if (visible && !widget.isFullscreen()) widget.setFullscreen(true);
      },
      destroy: () => widget.destroy()
    };
  } catch (error) {
    onFallback?.("body", error);
  }
  const node = doc.createElement("div");
  node.setAttribute("data-ii-am-host", "body");
  node.hidden = true;
  doc.body.appendChild(node);
  return {
    kind: "body",
    container: node,
    setVisible: (visible) => { node.hidden = !visible; },
    destroy: () => node.remove()
  };
}
