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

/** Waits until `selector` matches (polling, max `timeoutMs`). Shared helper for area scenes. */
export async function waitFor<T extends Element = HTMLElement>(doc: Document, selector: string, timeoutMs = 4000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const element = doc.querySelector<T>(selector);
    if (element) return element;
    if (Date.now() - started > timeoutMs) throw new Error(`waitFor timed out: ${selector}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function clickWhenReady(doc: Document, selector: string): Promise<HTMLElement> {
  const element = await waitFor<HTMLElement>(doc, selector);
  element.click();
  return element;
}

/** Waits until the overlay shows the loaded workspace of the selected character. */
export function workspaceReady(doc: Document): Promise<HTMLElement> {
  return waitFor(doc, "[data-roster-item]");
}

/** Shell / roster scenes (ui lead). */
const SHELL_SCENES: Record<string, PreviewScene> = {
  "roster-lorebooks": async ({ doc }) => {
    await workspaceReady(doc);
    await clickWhenReady(doc, '[data-roster-sidebar] footer [role="tab"]:nth-child(2)');
  },
  "roster-custom": async ({ doc }) => {
    await workspaceReady(doc);
    await clickWhenReady(doc, '[data-roster-sidebar] footer [role="tab"]:nth-child(2)');
    await clickWhenReady(doc, '[aria-label="Person registration method"] [role="tab"]:nth-child(2)');
  },
  "roster-modules": async ({ doc }) => {
    await workspaceReady(doc);
    await clickWhenReady(doc, '[data-roster-sidebar] footer [role="tab"]:nth-child(2)');
    const buttons = [...(await waitFor(doc, "[data-roster-sidebar]")).querySelectorAll("button")];
    buttons.find((b) => b.textContent?.includes("Load modules"))?.click();
  },
  "roster-info": async ({ doc }) => {
    await workspaceReady(doc);
    await clickWhenReady(doc, "[data-lorebook-info-button]");
  },
  "roster-filter": async ({ doc }) => {
    await workspaceReady(doc);
    await clickWhenReady(doc, "[data-roster-sidebar] [data-filter-trigger]");
  },
  "roster-search": async ({ doc }) => {
    await workspaceReady(doc);
    const input = await waitFor<HTMLInputElement>(doc, '[data-roster-sidebar] input[type="search"]');
    input.value = "ㅅㅇ";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  },
  "editor-create": async ({ doc }) => {
    await workspaceReady(doc);
    await clickWhenReady(doc, '[data-roster-sidebar] footer [role="tab"]:nth-child(2)');
    await clickWhenReady(doc, '[aria-label="Person registration method"] [role="tab"]:nth-child(2)');
    const buttons = [...(await waitFor(doc, "[data-roster-sidebar]")).querySelectorAll("button")];
    buttons.find((b) => b.textContent?.includes("Add person"))?.click();
  },
  "roster-expanded": async ({ doc }) => {
    await workspaceReady(doc);
    await clickWhenReady(doc, "[data-roster-expand]");
  },
  "mobile-drawer": async ({ doc }) => {
    await workspaceReady(doc);
    await clickWhenReady(doc, '[data-ii-am-shell="mobile"] header button');
  },
  "mobile-picker": async ({ doc }) => {
    await workspaceReady(doc);
    await clickWhenReady(doc, '[data-ii-am-shell="mobile"] header [data-source-transition-control]');
  }
};

export const PREVIEW_SCENES: Record<string, PreviewScene> = { ...SHELL_SCENES, ...SETTINGS_SCENES, ...WORKSPACE_SCENES, ...CHAT_SCENES };
