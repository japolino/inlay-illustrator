/**
 * Standalone native DOM modal overlay (zero external libraries).
 *
 * Implements accessible modal dialogs with backdrop blur, focus trapping,
 * keyboard escape dismiss, body scroll locking, and ARIA attributes.
 *
 * Conforms to the Spindle modal handle contract:
 *   { root: HTMLElement; dismiss(): void; onDismiss(cb: () => void): void }
 */

export type ModalOptions = {
  title: string;
  width?: number | string;
  maxHeight?: number | string;
  className?: string;
};

export type ModalHandle = {
  root: HTMLElement;
  dialog: HTMLElement;
  overlay: HTMLElement;
  dismiss(): void;
  onDismiss(callback: () => void): void;
};

let activeModalCount = 0;
let previousBodyOverflow = "";
const modalStack: ModalHandle[] = [];

const MODAL_CSS = `
.inlay-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9980;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.inlay-modal-backdrop.is-open {
  opacity: 1;
}
.inlay-modal-dialog {
  position: relative;
  width: 100%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--lumiverse-card-bg, #1a1b26);
  color: var(--lumiverse-text, #f0f0f5);
  border: 1px solid var(--lumiverse-border, #2e3048);
  border-radius: 14px;
  box-shadow: var(--lumiverse-shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.5));
  overflow: hidden;
  outline: none;
  transform: scale(0.96) translateY(8px);
  opacity: 0;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.inlay-modal-backdrop.is-open .inlay-modal-dialog {
  transform: scale(1) translateY(0);
  opacity: 1;
}
.inlay-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--lumiverse-border, #2e3048);
  background: var(--lumiverse-header-bg, rgba(255, 255, 255, 0.03));
  flex-shrink: 0;
}
.inlay-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--lumiverse-text, #f0f0f5);
  line-height: 1.4;
}
.inlay-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--lumiverse-text-muted, #8a8d9b);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.inlay-modal-close:hover {
  background: var(--lumiverse-fill-hover, rgba(255, 255, 255, 0.08));
  color: var(--lumiverse-text, #ffffff);
}
.inlay-modal-close:focus-visible {
  outline: 2px solid var(--lumiverse-primary, #6366f1);
  outline-offset: 2px;
}
.inlay-modal-body {
  flex: 1 1 auto;
  padding: 16px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
@media (prefers-reduced-motion: reduce) {
  .inlay-modal-backdrop,
  .inlay-modal-dialog {
    transition: none;
  }
}
`;

function ensureModalStyles(): void {
  if (typeof document === "undefined") return;
  const styleId = "inlay-native-modal-styles";
  if (typeof document.getElementById === "function") {
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = MODAL_CSS;
      if (document.head && typeof document.head.append === "function") {
        document.head.append(styleEl);
      }
    }
  }
}

export function cleanupModalStyles(): void {
  if (typeof document === "undefined") return;
  const styleEl = document.getElementById("inlay-native-modal-styles");
  if (styleEl && typeof styleEl.remove === "function") {
    styleEl.remove();
  }
  // Reset modal tracking state and restore body overflow if needed
  activeModalCount = 0;
  modalStack.length = 0;
  if (document.body) {
    document.body.style.overflow = previousBodyOverflow || "";
    previousBodyOverflow = "";
  }
}

/** Creates and opens a native DOM modal dialog overlay. */
export function showNativeModal(options: ModalOptions): ModalHandle {
  if (typeof document === "undefined") {
    return {
      root: {} as HTMLElement,
      dialog: {} as HTMLElement,
      overlay: {} as HTMLElement,
      dismiss: () => {},
      onDismiss: (cb: () => void) => { cb(); }
    };
  }

  ensureModalStyles();

  const activeElementBefore = typeof document !== "undefined" && typeof HTMLElement !== "undefined" && document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  const backdrop = document.createElement("div");
  backdrop.className = "inlay-modal-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const dialog = document.createElement("div");
  dialog.className = `inlay-modal-dialog ${options.className || ""}`.trim();
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.tabIndex = -1;

  if (options.width) {
    dialog.style.maxWidth = typeof options.width === "number" ? `${options.width}px` : options.width;
  }
  if (options.maxHeight) {
    dialog.style.maxHeight = typeof options.maxHeight === "number" ? `${options.maxHeight}px` : options.maxHeight;
  }

  const titleId = `inlay-modal-title-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  dialog.setAttribute("aria-labelledby", titleId);

  const header = document.createElement("div");
  header.className = "inlay-modal-header";

  const title = document.createElement("h3");
  title.id = titleId;
  title.className = "inlay-modal-title";
  title.textContent = options.title;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "inlay-modal-close";
  closeBtn.setAttribute("aria-label", "Close dialog");
  closeBtn.innerHTML = "&times;";

  header.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "inlay-modal-body";

  dialog.append(header, body);
  backdrop.append(dialog);

  let isDismissed = false;
  let mouseDownTarget: EventTarget | null = null;
  const dismissCallbacks: Array<() => void> = [];

  const handle: ModalHandle = {
    root: body,
    dialog,
    overlay: backdrop,
    dismiss,
    onDismiss(cb: () => void) {
      if (isDismissed) {
        cb();
      } else {
        dismissCallbacks.push(cb);
      }
    }
  };

  modalStack.push(handle);

  // Lock body scroll
  if (typeof document !== "undefined" && document.body) {
    if (activeModalCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    activeModalCount++;
    document.body.append(backdrop);
  }

  // Animate in
  requestAnimationFrame(() => {
    if (isDismissed) return;
    backdrop.classList.add("is-open");
    backdrop.removeAttribute("aria-hidden");
    dialog.focus();
  });

  function dismiss(): void {
    if (isDismissed) return;
    isDismissed = true;

    const stackIndex = modalStack.indexOf(handle);
    if (stackIndex >= 0) modalStack.splice(stackIndex, 1);

    backdrop.classList.remove("is-open");
    backdrop.setAttribute("aria-hidden", "true");

    // Clean up event listeners
    document.removeEventListener("keydown", onKeyDown, false);
    backdrop.removeEventListener("click", onBackdropClick);
    backdrop.removeEventListener("mousedown", onBackdropMouseDown);

    // Decrement modal count and restore overflow
    activeModalCount = Math.max(0, activeModalCount - 1);
    if (activeModalCount === 0 && typeof document !== "undefined" && document.body) {
      document.body.style.overflow = previousBodyOverflow || "";
    }

    setTimeout(() => {
      backdrop.remove();
      for (const cb of dismissCallbacks) {
        try { cb(); } catch {}
      }
      dismissCallbacks.length = 0;
      activeElementBefore?.focus();
    }, 200);
  }

  function onBackdropMouseDown(e: MouseEvent): void {
    mouseDownTarget = e.target;
  }

  function onBackdropClick(e: MouseEvent): void {
    // Only dismiss if both mousedown and click originated directly on the backdrop (prevents text-selection drag dismissal)
    if (e.target === backdrop && mouseDownTarget === backdrop) {
      dismiss();
    }
    mouseDownTarget = null;
  }

  function getFocusableElements(): HTMLElement[] {
    return Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), a[href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hidden && (!el.style || el.style.display !== "none") && (typeof el.closest !== "function" || el.closest("[hidden]") === null));
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (isDismissed) return;
    // Only the top-most modal handles the keydown event
    if (modalStack.length > 0 && modalStack[modalStack.length - 1] !== handle) {
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key === "Tab") {
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      // If focus somehow escaped the dialog, trap it back inside
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === dialog) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  closeBtn.addEventListener("click", () => dismiss());
  backdrop.addEventListener("mousedown", onBackdropMouseDown);
  backdrop.addEventListener("click", onBackdropClick);
  document.addEventListener("keydown", onKeyDown, false);

  return handle;
}
