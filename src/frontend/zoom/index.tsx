/**
 * Fullscreen image viewer / workspace ("zoom", spec/ui.md §5.3-§5.4): history navigation, prompt editor with
 * $name mentions, coordinate board, delete, regenerate. Owner: chat-zoom sub-agent.
 * Mounted in its own `.ii-am-root` layer so the scoped overlay CSS applies.
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { AppController } from "../state/app-state.js";

export interface ZoomTarget { chatId: string; slotId: string; entryId?: string; messageKey?: string }

export interface ZoomViewer {
  open(target: ZoomTarget): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

export function createZoomViewer(ctx: SpindleFrontendContext, app: AppController): ZoomViewer {
  void ctx;
  void app;
  let open = false;
  return {
    open: () => {
      open = true;
    },
    close: () => {
      open = false;
    },
    isOpen: () => open,
    destroy: () => {
      open = false;
    }
  };
}
