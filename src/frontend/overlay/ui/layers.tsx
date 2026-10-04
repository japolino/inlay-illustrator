import { createContext, createPortal, type ComponentChildren } from "preact";
import { useContext, useEffect, useRef } from "preact/hooks";

/**
 * Escape layers inside the overlay. The top-most layer closes first; the
 * overlay itself is closed only when the stack is empty.
 */
export class LayerStack {
  private readonly layers: Array<{ id: number; close: () => void }> = [];
  private nextId = 1;

  push(close: () => void): () => void {
    const id = this.nextId++;
    this.layers.push({ id, close });
    return () => {
      const index = this.layers.findIndex((layer) => layer.id === id);
      if (index >= 0) this.layers.splice(index, 1);
    };
  }

  get size(): number {
    return this.layers.length;
  }

  /** Closes the top-most layer. Returns false when the stack is empty. */
  closeTop(): boolean {
    const top = this.layers.pop();
    if (!top) return false;
    top.close();
    return true;
  }
}

export type OverlayEnvironment = {
  layers: LayerStack;
  /** Element inside the overlay root that hosts dialogs, popovers and toasts. */
  portal: () => HTMLElement | null;
};

const fallbackEnvironment: OverlayEnvironment = { layers: new LayerStack(), portal: () => null };

export const OverlayEnvironmentContext = createContext<OverlayEnvironment>(fallbackEnvironment);

export function useOverlayEnvironment(): OverlayEnvironment {
  return useContext(OverlayEnvironmentContext);
}

/** Registers an Escape layer while `active` is true. */
export function useLayer(active: boolean, onClose: () => void): void {
  const { layers } = useOverlayEnvironment();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    return layers.push(() => closeRef.current());
  }, [active, layers]);
}

/** Renders children into the overlay's layer element (falls back to in-place rendering). */
export function Portal({ children }: { children: ComponentChildren }) {
  const target = useOverlayEnvironment().portal();
  return target ? createPortal(children, target) : <>{children}</>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((element) => !element.hasAttribute("inert") && element.getAttribute("aria-hidden") !== "true");
}

/** Keeps Tab focus inside `container` while active; restores focus on deactivate. */
export function useFocusTrap(container: { current: HTMLElement | null }, active: boolean, initialFocus?: { current: HTMLElement | null }): void {
  useEffect(() => {
    if (!active) return undefined;
    const element = container.current;
    if (!element) return undefined;
    const previous = element.ownerDocument.activeElement as HTMLElement | null;
    const first = initialFocus?.current || focusableElements(element)[0] || element;
    first.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusableElements(element);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const current = element.ownerDocument.activeElement;
      if (event.shiftKey && (current === firstItem || !element.contains(current))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (current === lastItem || !element.contains(current))) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    element.addEventListener("keydown", onKeyDown);
    return () => {
      element.removeEventListener("keydown", onKeyDown);
      if (previous && typeof previous.focus === "function" && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [active]);
}
