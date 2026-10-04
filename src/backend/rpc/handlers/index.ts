/**
 * Handler table = union of the module groups. Each method belongs to exactly one group (checked by router tests).
 * - core.ts      (services): session, config, chat image settings, ui state, connections, tests, characters list,
 *                charx settings, character reset, logs, artists, personas
 * - chat.ts      (pipeline): generation, history, zoom, chat state, chat DOM
 * - workspace.ts (analysis): workspace load, roster, recognition keys, custom characters, prompts, assets, analysis,
 *                unique tags, outfit images
 */
import type { HandlerGroup } from "../types.js";
import { coreHandlers } from "./core.js";
import { chatHandlers } from "./chat.js";
import { workspaceHandlers } from "./workspace.js";

export const HANDLER_GROUPS: Readonly<Record<string, HandlerGroup>> = Object.freeze({
  core: coreHandlers,
  chat: chatHandlers,
  workspace: workspaceHandlers,
});

export function allHandlers(): HandlerGroup {
  return { ...coreHandlers, ...chatHandlers, ...workspaceHandlers };
}
