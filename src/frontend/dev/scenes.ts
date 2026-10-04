/**
 * Named preview scenes (`#scene=<name>`): small scripts that drive the UI into a state for screenshots.
 * Areas may add scenes in their own files and register them here (one line each).
 */
import type { MockBackend } from "./mock-backend.js";
import type { FrontendHandles } from "../../frontend.js";

export type PreviewScene = (input: { mock: MockBackend; frontend: FrontendHandles; params: URLSearchParams; doc: Document }) => void | Promise<void>;

export const PREVIEW_SCENES: Record<string, PreviewScene> = {};
