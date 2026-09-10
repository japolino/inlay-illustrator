/**
 * Floating action button for the Lumiverse Inlay Illustrator.
 *
 * Implements a persistent button anchored to a user-selected screen corner
 * (config `fabCorner`), with turn-aware dynamic behavior:
 *  - When images exist for the current turn: 48px circular FAB. Clicking opens
 *    the action menu:
 *      * Reroll images (from this turn)
 *      * Reroll images with sidecar (from this turn)
 *      * Open Gallery (native modal)
 *  - When NO images exist for the current turn: 48px circular button at rest.
 *    On mouse hover, it smoothly expands into an animated capsule/pill with
 *    the text "Generate images". Clicking directly triggers manual illustration
 *    generation for this turn.
 *
 * All animations use smooth CSS transitions with zero external libraries.
 */

import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { Config, FabCorner } from "../shared/config.js";
import { normalizeFabCorner } from "../shared/config.js";

export type Edges = Partial<Record<"left" | "right" | "top" | "bottom", string>>;

export const FAB_INSET_PX = 20;
export const FAB_MENU_GAP_PX = 8;
export const FAB_MENU_MARGIN_PX = 8;

const FAB_CSS = `
.inlay-fab {
  position: fixed;
  width: 48px;
  height: 48px;
  border-radius: 24px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: var(--lumiverse-primary, #6366f1);
  color: var(--lumiverse-primary-contrast, #ffffff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 9950;
  box-shadow: var(--lumiverse-shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.3));
  overflow: hidden;
  white-space: nowrap;
  padding: 0;
  box-sizing: border-box;
  font-family: inherit;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              padding 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.15s ease,
              box-shadow 0.15s ease,
              background-color 0.2s ease;
}
.inlay-fab:focus-visible {
  outline: 2px solid var(--lumiverse-primary, #6366f1);
  outline-offset: 2px;
}
.inlay-fab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.inlay-fab-icon svg {
  width: 24px;
  height: 24px;
}
.inlay-fab-label {
  display: inline-block;
  max-width: 0;
  opacity: 0;
  margin-left: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: inherit;
  pointer-events: none;
  transition: max-width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.2s ease,
              margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Normal state (images present) hover */
.inlay-fab:not(.inlay-fab-empty-turn):hover,
.inlay-fab:not(.inlay-fab-empty-turn):focus-visible {
  transform: scale(1.06);
}

/* Empty turn (no images yet): smooth expansion from circle to pill with text on hover or keyboard focus */
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):hover,
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):focus-visible {
  width: 176px;
  padding: 0 16px 0 12px;
  background: var(--lumiverse-primary-hover, #4f46e5);
  box-shadow: var(--lumiverse-shadow-xl, 0 15px 30px rgba(0, 0, 0, 0.4));
}
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):hover .inlay-fab-label,
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):focus-visible .inlay-fab-label {
  max-width: 120px;
  opacity: 1;
  margin-left: 8px;
}

/* Busy indicator */
.inlay-fab.inlay-fab-busy {
  cursor: progress;
}
.inlay-fab.inlay-fab-busy .inlay-fab-icon svg {
  animation: inlay-fab-spin 1s linear infinite;
}

/* Action Popup Menu */
.inlay-fab-menu {
  position: fixed;
  min-width: 230px;
  padding: 6px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  border-radius: 12px;
  background: var(--lumiverse-card-bg, #1a1b26);
  color: var(--lumiverse-text, #f0f0f5);
  box-shadow: var(--lumiverse-shadow-xl, 0 15px 30px rgba(0, 0, 0, 0.4));
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 9951;
}
.inlay-fab-menu[hidden] {
  display: none;
}
.inlay-fab-menu[aria-hidden="true"] {
  display: none;
}
.inlay-fab-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--lumiverse-text, #f0f0f5);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}
.inlay-fab-menu button:hover {
  background: var(--lumiverse-fill-hover, rgba(255, 255, 255, 0.08));
}
.inlay-fab-menu button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.inlay-fab-menu svg {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
}
@keyframes inlay-fab-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .inlay-fab {
    transition: none;
  }
  .inlay-fab:hover {
    transform: none;
  }
  .inlay-fab-label {
    transition: none;
  }
  .inlay-fab.inlay-fab-busy .inlay-fab-icon svg {
    animation-duration: 2.5s;
  }
}
`;

const SVG_INLAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" y1="22" x2="12" y2="12"></line></svg>`;
const SVG_GENERATE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/></svg>`;
const SVG_REFRESH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
const SVG_LLM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01"/></svg>`;
const SVG_GALLERY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;

const MENU_REROLL = "reroll";
const MENU_SIDECAR = "sidecar";
const MENU_GALLERY = "gallery";
const MENU_SETTINGS = "settings";

const SVG_SETTINGS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

function px(value: number): string {
  return `${value}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function fabButtonEdges(corner: FabCorner): Edges {
  const inset = px(FAB_INSET_PX);
  if (corner === "bottom-right") return { right: inset, bottom: inset, left: "auto", top: "auto" };
  if (corner === "bottom-left") return { left: inset, bottom: inset, right: "auto", top: "auto" };
  if (corner === "top-right") return { right: inset, top: inset, left: "auto", bottom: "auto" };
  return { left: inset, top: inset, right: "auto", bottom: "auto" };
}

export type FabRect = { left: number; right: number; top: number; bottom: number; width: number; height: number };

export function fabButtonRect(corner: FabCorner, viewport: { width: number; height: number }): FabRect {
  const size = 48;
  const left = corner.endsWith("-right") ? viewport.width - FAB_INSET_PX - size : FAB_INSET_PX;
  const top = corner.startsWith("top") ? FAB_INSET_PX : viewport.height - FAB_INSET_PX - size;
  return { left, top, right: left + size, bottom: top + size, width: size, height: size };
}

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
  options: {
    getCorner: () => FabCorner;
    openGallery: () => void;
    openSettings?: () => void;
  }
): () => void {
  if (typeof document === "undefined") return () => {};

  let corner = normalizeFabCorner(options.getCorner());
  let busy = false;
  let menuOpen = false;
  let hasImagesThisTurn: boolean | null = null;

  const removeStyle = ctx.dom.addStyle(FAB_CSS);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "inlay-fab";
  button.setAttribute("aria-label", "Inlay Illustrator actions");

  const iconWrap = document.createElement("span");
  iconWrap.className = "inlay-fab-icon";
  iconWrap.innerHTML = SVG_INLAY;

  const labelSpan = document.createElement("span");
  labelSpan.className = "inlay-fab-label";
  labelSpan.textContent = "Generate images";

  button.append(iconWrap, labelSpan);

  const menu = document.createElement("div");
  menu.className = "inlay-fab-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-hidden", "true");
  menu.hidden = true;

  function menuItem(action: string, label: string, svg: string): HTMLButtonElement {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.innerHTML = `${svg}<span>${label}</span>`;
    item.addEventListener("click", () => {
      closeMenu();
      run(action);
    });
    return item;
  }

  const rerollItem = menuItem(MENU_REROLL, "Reroll images (from this turn)", SVG_REFRESH);
  const sidecarItem = menuItem(MENU_SIDECAR, "Reroll images with sidecar (from this turn)", SVG_LLM);
  const galleryItem = menuItem(MENU_GALLERY, "Open Gallery", SVG_GALLERY);
  const settingsItem = menuItem(MENU_SETTINGS, "Open Settings", SVG_SETTINGS);
  menu.append(rerollItem, sidecarItem, galleryItem, settingsItem);

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
    const measured = typeof menu.getBoundingClientRect === "function" ? menu.getBoundingClientRect() : { width: 0, height: 0 };
    const menuWidth = measured && measured.width > 0 ? measured.width : 230;
    const menuHeight = measured && measured.height > 0 ? measured.height : 140;
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
      { width: menuWidth, height: menuHeight },
      { width: window.innerWidth, height: window.innerHeight }
    );
    menu.style.left = px(position.left);
    menu.style.top = px(position.top);
    menu.style.right = "auto";
    menu.style.bottom = "auto";
  }

  function openMenu(): void {
    if (menuOpen || busy) return;
    menuOpen = true;
    menu.hidden = false;
    menu.setAttribute("aria-hidden", "false");
    positionMenu();
    button.setAttribute("aria-expanded", "true");
    rerollItem.disabled = busy;
    sidecarItem.disabled = busy;
  }

  function closeMenu(): void {
    if (!menuOpen) return;
    menuOpen = false;
    menu.hidden = true;
    menu.setAttribute("aria-hidden", "true");
    button.setAttribute("aria-expanded", "false");
  }

  function updateTurnState(hasImages: boolean): void {
    if (hasImagesThisTurn === hasImages && button.classList.contains("inlay-fab-empty-turn") !== hasImages) {
      return;
    }
    hasImagesThisTurn = hasImages;
    button.classList.toggle("inlay-fab-empty-turn", !hasImages);
    if (!hasImages) {
      iconWrap.innerHTML = SVG_GENERATE;
      button.title = "Generate illustrations for this message";
      button.setAttribute("aria-label", "Generate illustrations for this message");
      button.removeAttribute("aria-haspopup");
      button.removeAttribute("aria-expanded");
      closeMenu();
    } else {
      iconWrap.innerHTML = SVG_INLAY;
      button.title = "Inlay Illustrator actions";
      button.setAttribute("aria-label", "Inlay Illustrator actions");
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", String(menuOpen));
    }
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

  /** Detects whether the latest assistant message contains generated inlay illustrations. */
  function detectCurrentTurnImages(): boolean {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return false;
    try {
      const messages = Array.from(document.querySelectorAll('[data-message-id], .chat-message, .message'))
        .filter((el) => {
          if (typeof el.closest === "function") {
            return !el.closest(".inlay-gallery") && !el.closest(".inlay-modal-dialog");
          }
          return true;
        });

      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && typeof lastMsg.querySelector === "function") {
          const img = lastMsg.querySelector('[data-inlay-illustrator="true"] img');
          return Boolean(img && ((img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src || img.getAttribute("data-inlay-illustrator-image-url")));
        }
        return false;
      }

      // Fallback only if message containers are completely unidentifiable in DOM
      const inlays = Array.from(document.querySelectorAll('[data-inlay-illustrator="true"]'))
        .filter((el) => {
          if (typeof el.closest === "function") {
            return !el.closest(".inlay-gallery") && !el.closest(".inlay-modal-dialog");
          }
          return true;
        });
      if (inlays.length === 0) return false;

      const lastInlay = inlays[inlays.length - 1];
      if (!lastInlay || typeof lastInlay.querySelector !== "function") return false;
      const img = lastInlay.querySelector("img");
      return Boolean(img && ((img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src || img.getAttribute("data-inlay-illustrator-image-url")));
    } catch {
      return false;
    }
  }

  function checkTurnState(): void {
    const hasImages = detectCurrentTurnImages();
    updateTurnState(hasImages);
  }

  function run(action: string): void {
    if (action === MENU_SETTINGS) {
      if (typeof options.openSettings === "function") {
        options.openSettings();
      }
      return;
    }
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

  function handleButtonClick(): void {
    if (busy) return;
    if (!hasImagesThisTurn) {
      // Empty turn: trigger generation for this turn!
      const chatId = activeChatId();
      if (!chatId) return;
      setBusy(true);
      ctx.sendToBackend({
        type: "generate_latest",
        chatId
      });
      return;
    }
    // Normal state: toggle popup menu
    if (menuOpen) closeMenu();
    else openMenu();
  }

  button.addEventListener("click", handleButtonClick);

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
  checkTurnState();

  // Watch for chat DOM changes (e.g. assistant message finishes generating or inlays added)
  let chatObserver: MutationObserver | null = null;
  let checkDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  if (typeof MutationObserver !== "undefined" && document.body) {
    try {
      chatObserver = new MutationObserver((mutations) => {
        const external = mutations.some((m) => {
          const target = m.target as Node | null;
          return !button.contains(target) && !menu.contains(target);
        });
        if (!external) return;
        if (checkDebounceTimer) clearTimeout(checkDebounceTimer);
        checkDebounceTimer = setTimeout(() => {
          checkTurnState();
        }, 50);
      });
      chatObserver.observe(document.body, { childList: true, subtree: true });
    } catch {
      chatObserver = null;
    }
  }

  function setCorner(next: FabCorner): void {
    corner = normalizeFabCorner(next);
    positionFab();
    if (menuOpen) positionMenu();
  }

  const unsubscribeBackend = ctx.onBackendMessage((payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const message = payload as Record<string, unknown>;
    if (message.type === "status") {
      if (typeof message.busy === "boolean") {
        setBusy(message.busy === true);
      } else {
        const s = String(message.status || "");
        if (
          s === "Generated" ||
          s === "Error" ||
          s === "Ready" ||
          s === "Skipped" ||
          s === "No image generated" ||
          s === "Already generated" ||
          s.startsWith("Error:") ||
          Boolean(message.error)
        ) {
          setBusy(false);
        }
      }
      checkTurnState();
    } else if (message.type === "generation_progress") {
      const stage = String(message.stage || "");
      if (stage === "completed" || stage === "failed" || stage === "cancelled") {
        setBusy(false);
      }
      checkTurnState();
    } else if (message.type === "config_updated" || message.type === "state") {
      const config = message.config && typeof message.config === "object"
        ? message.config as Record<string, unknown>
        : null;
      if (config && config.fabCorner !== undefined) {
        setCorner(config.fabCorner as FabCorner);
      }
      checkTurnState();
    } else if (
      message.type === "inlay_reroll_all_result" ||
      message.type === "inlay_image_action_result"
    ) {
      setBusy(false);
      checkTurnState();
    }
  });

  return () => {
    unsubscribeBackend();
    if (checkDebounceTimer) clearTimeout(checkDebounceTimer);
    chatObserver?.disconnect();
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onDocumentKey, true);
    window.removeEventListener("resize", onResize);
    closeMenu();
    button.remove();
    menu.remove();
    removeStyle();
  };
}
