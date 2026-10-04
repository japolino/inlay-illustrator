/**
 * Chat-side UI (spec/ui.md §5 §6, contract src/shared/contract/chat-dom.ts): footer controls, image
 * history ‹ ›, regenerate, pending/manual generate, generation-count panel, runtime toast stack,
 * runtime error dialog. Owner: chat-zoom sub-agent.
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { AppController } from "../state/app-state.js";

export interface ChatSideOptions {
  /** Opens the zoom viewer for a baked image. */
  openZoom(target: { chatId: string; slotId: string; entryId?: string; messageKey?: string }): void;
  /** Active chat id (host). */
  getActiveChatId(): string;
}

/** Installs the chat-side UI. Returns the cleanup function. */
export function installChatSide(ctx: SpindleFrontendContext, app: AppController, options: ChatSideOptions): () => void {
  void ctx;
  void app;
  void options;
  return () => undefined;
}
