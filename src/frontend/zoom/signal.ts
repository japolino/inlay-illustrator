/**
 * Zoom-viewer visibility shared between the zoom module and the chat-side runtime (one emitter per
 * AppController, so tests with several controllers do not interfere).
 */
import type { AppController } from "../state/app-state.js";

export interface ZoomVisibility {
  isOpen(): boolean;
  set(open: boolean): void;
  subscribe(listener: (open: boolean) => void): () => void;
}

const registry = new WeakMap<AppController, ZoomVisibility>();

export function zoomVisibility(app: AppController): ZoomVisibility {
  let entry = registry.get(app);
  if (!entry) {
    let open = false;
    const listeners = new Set<(open: boolean) => void>();
    entry = {
      isOpen: () => open,
      set: (next) => {
        if (next === open) return;
        open = next;
        for (const listener of [...listeners]) listener(open);
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
    registry.set(app, entry);
  }
  return entry;
}
