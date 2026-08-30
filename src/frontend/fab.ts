/**
 * Floating action button for the Lumiverse Inlay Illustrator.
 *
 * Replaces the original per-inlay `Card.Inlay.Display` reroll buttons, which
 * never rendered in the Lumiverse chat DOM. One persistent button anchored to
 * a user-selected screen corner (config `fabCorner`), with a menu that opens
 * toward the screen center:
 *  - Reroll images (from this turn) — `reroll_all_images` on the newest
 *    generated turn.
 *  - Reroll images with sidecar (from this turn) — same request with
 *    `sidecar: true`, re-running the parser prompt from the source message.
 *  - Open Gallery — the saved-illustration gallery modal.
 *
 * The button animates while a generation/reroll is running, using the
 * backend `status` messages' `busy` flag (set by every action handler and
 * the auto-generation path).
 */

import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { Config } from "../shared/config.js";
import { normalizeFabCorner } from "../shared/config.js";

export type FabCorner = Config["fabCorner"];
export type Edges = Partial<Record<"left" | "right" | "top" | "bottom", string>>;

/** Screen inset for the button anchor. */
export const FAB_INSET_PX = 20;
/** Gap between the button and its opened menu. */
export const FAB_MENU_GAP_PX = 8;
/** Minimum distance kept from the viewport edges when clamping. */
export const FAB_MENU_MARGIN_PX = 8;

const FAB_CSS = `
.inlay-fab{position:fixed;width:48px;height:48px;border-radius:50%;border:1px solid var(--lumiverse-border);background:var(--lumiverse-primary);color:var(--lumiverse-primary-contrast);display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:9950;box-shadow:var(--lumiverse-shadow-lg);transition:transform .15s ease,box-shadow .15s ease}
.inlay-fab:hover{transform:scale(1.06)}
.inlay-fab:focus-visible{outline:2px solid var(--lumiverse-primary);outline-offset:2px}
.inlay-fab svg{width:24px;height:24px}
.inlay-fab.inlay-fab-busy svg{animation:inlay-fab-spin 1s linear infinite}
.inlay-fab.inlay-fab-busy{cursor:progress}
.inlay-fab-menu{position:fixed;min-width:230px;padding:6px;border:1px solid var(--lumiverse-border);border-radius:12px;background:var(--lumiverse-fill);box-shadow:var(--lumiverse-shadow-lg);display:flex;flex-direction:column;gap:2px;z-index:9951}
.inlay-fab-menu button{display:flex;align-items:center;gap:10px;width:100%;min-height:40px;padding:8px 12px;border:0;border-radius:8px;background:transparent;color:var(--lumiverse-text);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.inlay-fab-menu button:hover{background:var(--lumiverse-fill-hover)}
.inlay-fab-menu button:disabled{opacity:.5;cursor:not-allowed}
.inlay-fab-menu svg{flex:0 0 18px;width:18px;height:18px}
@keyframes inlay-fab-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){
  .inlay-fab{transition:none}
  .inlay-fab:hover{transform:none}
  .inlay-fab.inlay-fab-busy svg{animation-duration:2.5s}
}
`;

const SVG_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" y1="22" x2="12" y2="12"></line></svg>';
const SVG_REFRESH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>';
const SVG_LLM = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01"/></svg>';
const SVG_GALLERY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';

const MENU_REROLL = "reroll";
const MENU_SIDECAR = "sidecar";
const MENU_GALLERY = "gallery";

function px(value: number): string {
  return `${value}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Fixed-position edges anchoring the button to the configured corner. */
export function fabButtonEdges(corner: FabCorner): Edges {
  const inset = px(FAB_INSET_PX);
  if (corner === "bottom-right") return { right: inset, bottom: inset };
  if (corner === "bottom-left") return { left: inset, bottom: inset };
  if (corner === "top-right") return { right: inset, top: inset };
  return { left: inset, top: inset };
}

export type FabRect = { left: number; right: number; top: number; bottom: number; width: number; height: number };

/** Expected fixed-position rect of the 48px button for a corner + viewport. */
export function fabButtonRect(corner: FabCorner, viewport: { width: number; height: number }): FabRect {
  const size = 48;
  const left = corner.endsWith("-right") ? viewport.width - FAB_INSET_PX - size : FAB_INSET_PX;
  const top = corner.startsWith("top") ? FAB_INSET_PX : viewport.height - FAB_INSET_PX - size;
  return { left, top, right: left + size, bottom: top + size, width: size, height: size };
}

/**
 * Menu position for a corner: opens toward the screen center (up from bottom
 * corners, down from top corners, horizontally aligned with the button), and
 * flips or clamps so the menu always stays on screen.
 */
export function fabMenuPosition(
  corner: FabCorner,
  button: FabRect,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = FAB_MENU_GAP_PX,
  margin = FAB_MENU_MARGIN_PX
): { left: number; top: number } {
  const anchorRight = corner.endsWith("-right");
  const opensDownward = corner.startsWith("top");

  let left = anchorRight ? button.right - menu.width : button.left;
  left = clamp(left, margin, Math.max(margin, viewport.width - margin - menu.width));

  let top: number;
  if (opensDownward) {
    top = button.bottom + gap;
    const flipped = button.top - gap - menu.height;
    if (top + menu.height > viewport.height - margin && flipped >= margin) top = flipped;
  } else {
    top = button.top - gap - menu.height;
    const flipped = button.bottom + gap;
    if (top < margin && flipped + menu.height <= viewport.height - margin) top = flipped;
  }
  top = clamp(top, margin, Math.max(margin, viewport.height - margin - menu.height));
  return { left, top };
}

function makeRequestId(prefix = "inlay-fab"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function installInlayFab(
  ctx: SpindleFrontendContext,
  options: { getCorner: () => FabCorner; openGallery: () => void }
): () => void {
  if (typeof document === "undefined") return () => {};

  let corner = normalizeFabCorner(options.getCorner());
  let busy = false;
  let menuOpen = false;

  const removeStyle = ctx.dom.addStyle(FAB_CSS);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "inlay-fab";
  button.title = "Inlay Illustrator";
  button.setAttribute("aria-label", "Inlay Illustrator actions");
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = SVG_ICON;

  const menu = document.createElement("div");
  menu.className = "inlay-fab-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  function menuItem(action: string, label: string, svg: string): HTMLButtonElement {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.innerHTML = svg;
    const text = document.createElement("span");
    text.textContent = label;
    item.append(text);
    item.addEventListener("click", () => {
      closeMenu();
      run(action);
    });
    return item;
  }

  const rerollItem = menuItem(MENU_REROLL, "Reroll images (from this turn)", SVG_REFRESH);
  const sidecarItem = menuItem(MENU_SIDECAR, "Reroll images with sidecar (from this turn)", SVG_LLM);
  const galleryItem = menuItem(MENU_GALLERY, "Open Gallery", SVG_GALLERY);
  menu.append(rerollItem, sidecarItem, galleryItem);

  function applyEdges(element: HTMLElement, edges: Edges): void {
    element.style.left = edges.left ?? "auto";
    element.style.right = edges.right ?? "auto";
    element.style.top = edges.top ?? "auto";
    element.style.bottom = edges.bottom ?? "auto";
  }

  function positionFab(): void {
    applyEdges(button, fabButtonEdges(corner));
  }

  function positionMenu(): void {
    const buttonRect = typeof button.getBoundingClientRect === "function"
      ? button.getBoundingClientRect()
      : fabButtonRect(corner, { width: window.innerWidth, height: window.innerHeight });
    const menuRect = typeof menu.getBoundingClientRect === "function" ? menu.getBoundingClientRect() : { width: 230, height: 140 };
    const position = fabMenuPosition(
      corner,
      {
        left: buttonRect.left,
        top: buttonRect.top,
        right: buttonRect.right,
        bottom: buttonRect.bottom,
        width: buttonRect.width,
        height: buttonRect.height
      },
      { width: menuRect.width, height: menuRect.height },
      { width: window.innerWidth, height: window.innerHeight }
    );
    menu.style.left = px(position.left);
    menu.style.top = px(position.top);
    menu.style.right = "auto";
    menu.style.bottom = "auto";
  }

  function openMenu(): void {
    if (menuOpen) return;
    menuOpen = true;
    menu.hidden = false;
    positionMenu();
    button.setAttribute("aria-expanded", "true");
    rerollItem.disabled = busy;
    sidecarItem.disabled = busy;
  }

  function closeMenu(): void {
    if (!menuOpen) return;
    menuOpen = false;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function setBusy(next: boolean): void {
    busy = next;
    button.classList.toggle("inlay-fab-busy", next);
    if (menuOpen) {
      rerollItem.disabled = next;
      sidecarItem.disabled = next;
    }
  }

  function activeChatId(): string {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }

  function run(action: string): void {
    if (action === MENU_GALLERY) {
      options.openGallery();
      return;
    }
    const chatId = activeChatId();
    if (!chatId) return;
    setBusy(true);
    ctx.sendToBackend({
      type: "reroll_all_images",
      requestId: makeRequestId("inlay-fab-reroll-all"),
      chatId,
      sidecar: action === MENU_SIDECAR
    });
  }

  button.addEventListener("click", () => {
    if (menuOpen) closeMenu();
    else openMenu();
  });

  const onDocumentClick = (event: Event): void => {
    if (!menuOpen) return;
    const target = event.target as Node | null;
    if (menu.contains(target) || button.contains(target)) return;
    closeMenu();
  };
  const onDocumentKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") closeMenu();
  };
  const onResize = (): void => {
    if (menuOpen) positionMenu();
  };
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKey, true);
  window.addEventListener("resize", onResize);

  document.body.append(button, menu);
  positionFab();

  function setCorner(next: FabCorner): void {
    corner = normalizeFabCorner(next);
    positionFab();
    if (menuOpen) positionMenu();
  }

  const unsubscribeBackend = ctx.onBackendMessage((payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const message = payload as Record<string, unknown>;
    if (message.type === "status" && typeof message.busy === "boolean") {
      setBusy(message.busy === true);
    } else if (message.type === "config_updated" || message.type === "state") {
      // The backend broadcasts the full config after every change and state
      // refresh; track the selected corner from it.
      const config = message.config && typeof message.config === "object"
        ? message.config as Record<string, unknown>
        : null;
      if (config && config.fabCorner !== undefined) setCorner(config.fabCorner as FabCorner);
    } else if (message.type === "inlay_reroll_all_result" || message.type === "inlay_image_action_result") {
      // Completed actions always emit a busy:false status afterwards, but be
      // robust: a terminal failure result also clears the busy state.
      if (message.ok === false) setBusy(false);
    }
  });

  return () => {
    unsubscribeBackend();
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onDocumentKey, true);
    window.removeEventListener("resize", onResize);
    closeMenu();
    button.remove();
    menu.remove();
    removeStyle();
  };
}
