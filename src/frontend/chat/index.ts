/**
 * Chat-side UI (spec/ui.md §5 §6, contract src/shared/contract/chat-dom.ts): footer controls, image
 * history ‹ ›, regenerate, pending placeholder, generation-count panel, runtime toast stack,
 * runtime error dialog. Implementation: ./controller.tsx.
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { AppController } from "../state/app-state.js";
import { createChatSide, type ChatSideOptions } from "./controller.js";

export type { ChatSideOptions, ChatSideController, ZoomOpenTarget } from "./controller.js";
export { createChatSide } from "./controller.js";

/** Installs the chat-side UI. Returns the cleanup function. */
export function installChatSide(ctx: SpindleFrontendContext, app: AppController, options: ChatSideOptions): () => void {
  const controller = createChatSide(ctx, app, options);
  return () => controller.destroy();
}
