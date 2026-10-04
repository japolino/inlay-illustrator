/**
 * Named preview scenes (`#scene=<name>`): small scripts that drive the UI into a state for screenshots.
 * Each area keeps its scenes in its own file (dev/scenes/<area>.ts).
 */
import type { MockBackend } from "./mock-backend.js";
import type { FrontendHandles } from "../../frontend.js";
import { SETTINGS_SCENES } from "./scenes/settings.js";
import { WORKSPACE_SCENES } from "./scenes/workspace.js";
import { CHAT_SCENES } from "./scenes/chat.js";

export type PreviewScene = (input: { mock: MockBackend; frontend: FrontendHandles; params: URLSearchParams; doc: Document }) => void | Promise<void>;

export const PREVIEW_SCENES: Record<string, PreviewScene> = { ...SETTINGS_SCENES, ...WORKSPACE_SCENES, ...CHAT_SCENES };
