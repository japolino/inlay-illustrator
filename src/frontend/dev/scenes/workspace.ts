/** Preview scenes of the workspace tabs (assets / prompts / artists / persona + secondary panes). */
import type { PreviewScene } from "../scenes.js";
import { clickWhenReady, waitFor } from "../scenes.js";
import { seedWorkspaceDemo, workspaceMockState } from "../mock/workspace.js";
import { reloadPersonas } from "../../overlay/workspace/data.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for the tab content of the loaded character. */
async function ready(doc: Document, selector: string): Promise<HTMLElement> {
  return waitFor(doc, selector, 8000);
}

async function clickLabel(doc: Document, scope: string, labelEnd: string): Promise<void> {
  const root = await ready(doc, scope);
  for (let i = 0; i < 80; i += 1) {
    const button = [...root.querySelectorAll<HTMLElement>("[aria-label]")].find((el) => el.getAttribute("aria-label")!.endsWith(labelEnd));
    if (button) { button.click(); return; }
    await sleep(50);
  }
  throw new Error(`no element with label ending ${labelEnd}`);
}

/** Selects a workspace tab once the character is loaded (the `open=` hash may run before the character exists). */
async function tab(doc: Document, id: "assets" | "prompts" | "artists" | "persona"): Promise<void> {
  await ready(doc, "[data-workspace-content]");
  await sleep(300);
  (await ready(doc, `#ii-am-workspace-tab-${id}`)).click();
  await sleep(100);
}

const SCENES: Record<string, PreviewScene> = {
  "ws-assets": async () => undefined,
  "ws-prompts": async ({ doc }) => tab(doc, "prompts"),
  "ws-artists": async ({ doc }) => tab(doc, "artists"),
  "ws-persona": async ({ doc }) => tab(doc, "persona"),
  "assets-picker": async ({ doc }) => {
    await ready(doc, '[data-assets-list="charx"]');
    await clickLabel(doc, '[data-assets-list="charx"]', "select assets");
    await ready(doc, "[data-picker-card]");
  },
  "assets-persona": async ({ doc }) => {
    await ready(doc, "[data-assets-view]");
    await clickWhenReady(doc, '[data-assets-view] [role="tab"]:nth-child(2)');
  },
  "assets-analysis": async ({ mock, doc }) => {
    workspaceMockState(mock.db).jobStepMs = 60_000;
    await ready(doc, '[data-assets-list="charx"]');
    await sleep(200);
    await clickWhenReady(doc, "[data-command-dock] [data-command-button]");
  },
  "assets-filter": async ({ doc }) => {
    await ready(doc, '[data-assets-list="charx"]');
    await clickWhenReady(doc, "[data-command-dock] [data-filter-trigger]");
  },
  "prompts-outfit": async ({ doc }) => {
    await tab(doc, "prompts");
    await ready(doc, "[data-prompts-list]");
    await clickLabel(doc, "[data-prompts-list]", "Outfit prompt");
    await ready(doc, "[data-outfit-panel]");
  },
  "prompts-generation": async ({ mock, doc }) => {
    await tab(doc, "prompts");
    workspaceMockState(mock.db).jobStepMs = 150;
    await ready(doc, "[data-prompts-list]");
    await clickLabel(doc, "[data-prompts-list]", "Outfit prompt");
    await ready(doc, "[data-outfit-card]");
    await clickLabel(doc, "[data-outfit-panel]", "Generate outfit outfit_1");
    await ready(doc, "[data-outfit-generation]");
    await clickLabel(doc, "[data-generation-dock]", "Generate outfit image");
    await ready(doc, "[data-generation-history]");
  },
  "prompts-reference": async ({ doc }) => {
    await tab(doc, "prompts");
    await ready(doc, "[data-prompts-list]");
    await clickLabel(doc, "[data-prompts-list]", "Select reference for 한서연 (Han Seo-yeon)");
    await ready(doc, "[data-picker-card]");
  },
  "prompts-crop": async ({ doc }) => {
    await tab(doc, "prompts");
    await ready(doc, "[data-prompts-list]");
    await clickLabel(doc, "[data-prompts-list]", "Select reference for 한서연 (Han Seo-yeon)");
    await ready(doc, "[data-picker-card]");
    (await ready(doc, "[data-picker-card] button[aria-pressed]")).click();
    await sleep(400);
    await clickLabel(doc, "[data-picker-dock]", "Reference crop");
  },
  "prompts-unique-tags": async ({ doc }) => {
    await tab(doc, "prompts");
    await ready(doc, "[data-prompts-list]");
    await clickLabel(doc, "[data-command-dock]", "Open unique tag search");
  },
  "prompts-form-edit": async ({ doc }) => {
    await tab(doc, "prompts");
    await ready(doc, "[data-prompts-list]");
    await clickLabel(doc, "[data-prompts-list]", "Add form");
  },
  "persona-outfit": async ({ doc }) => {
    await tab(doc, "persona");
    await ready(doc, "[data-persona-list]");
    await clickLabel(doc, "[data-persona-list]", "Joon outfit edit");
    await ready(doc, "[data-outfit-panel]");
  },
  "persona-generation": async ({ doc }) => {
    await tab(doc, "persona");
    await ready(doc, "[data-persona-list]");
    await clickLabel(doc, "[data-persona-list]", "Joon outfit edit");
    await ready(doc, "[data-outfit-card]");
    await clickLabel(doc, "[data-outfit-panel]", "Generate outfit image");
  },
  "artists-edit": async ({ doc }) => {
    await tab(doc, "artists");
    await ready(doc, '[data-artist-list="novelai"]');
    await clickLabel(doc, '[data-artist-list="novelai"]', "v5 verified style settings");
  },
  "artists-anima": async ({ frontend, doc }) => {
    await tab(doc, "artists");
    await ready(doc, "[data-artist-list]");
    await frontend.app.updateConfig({ image: { provider: "comfyui", connectionId: "img-comfy" } });
    await ready(doc, '[data-artist-list="anima"]');
  }
};

/** Every workspace scene first seeds demo data (selections, references, a persona profile) and reloads. */
export const WORKSPACE_SCENES: Record<string, PreviewScene> = Object.fromEntries(Object.entries(SCENES).map(([name, scene]) => [name, async (input) => {
  seedWorkspaceDemo(input.mock.db);
  await waitFor(input.doc, "[data-workspace-content]", 8000);
  await input.frontend.app.reloadWorkspace();
  await reloadPersonas(input.frontend.app, input.frontend.app.state.selectedCharacterId, -2);
  await scene(input);
}]));
