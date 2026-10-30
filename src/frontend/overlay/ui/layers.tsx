import { createContext, createPortal, type ComponentChildren } from "preact";
import { useContext, useEffect, useLayoutEffect, useRef } from "preact/hooks";

/** Closes an Escape layer; returning false keeps it open and on the stack (e.g. while it is busy). */
export type LayerClose = () => void | false;

/**
 * Escape layers inside the overlay. The top-most layer closes first; the
 * overlay itself is closed only when the stack is empty.
 */
export class LayerStack {
  private readonly layers: Array<{ id: number; close: LayerClose }> = [];
  private nextId = 1;

  push(close: LayerClose): () => void {
    const id = this.nextId++;
    this.layers.push({ id, close });
    return () => this.remove(id);
  }

  get size(): number {
    return this.layers.length;
  }

  /** Closes the top-most layer (a layer that stays open still takes the key). Returns false when the stack is empty. */
  closeTop(): boolean {
    const top = this.layers[this.layers.length - 1];
    if (!top) return false;
    if (top.close() !== false) this.remove(top.id);
    return true;
  }

  /** Closes every layer, top first, including those that would stay open (their host is going away). */
  closeAll(): void {
    for (let top = this.layers.pop(); top; top = this.layers.pop()) top.close();
  }

  private remove(id: number): void {
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index >= 0) this.layers.splice(index, 1);
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

/**
 * Registers an Escape layer while `active` is true; `onClose` returns false to stay open. A layout effect
 * keeps the stack in step with the commit, so an Escape pressed before the next paint already sees it.
 */
export function useLayer(active: boolean, onClose: LayerClose): void {
  const { layers } = useOverlayEnvironment();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
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
