/**
 * Dev preview page: runs the real frontend `setup()` against a fake Spindle context wired to the
 * mock backend (src/frontend/dev/mock). Built by build-preview.ts into .cache/ui-preview/.
 *
 * URL hash options (combine with `&`):
 *   open=assets|prompts|artists|persona   open the overlay on a workspace tab
 *   settings=<section>                    open the overlay on a settings page
 *   character=<id>                        workspace character
 *   dev=1                                 developer mode
 *   latency=<ms>                          mock latency (default 120)
 *   scene=<name>                          extra scene set up by an area (see PREVIEW_SCENES)
 */
import { setup } from "../../frontend.js";
import { createFullMockBackend } from "./mock/index.js";
import { createFakeSpindleContext } from "./fake-context.js";
import { PREVIEW_SCENES } from "./scenes.js";

const params = new URLSearchParams(location.hash.replace(/^#/, ""));
const latency = Number(params.get("latency") ?? 120);
const mock = createFullMockBackend({ latencyMs: latency, timeScale: Number(params.get("timescale") ?? 1) });
if (params.get("dev") === "1") mock.db.config.ui.developerModeEnabled = true;
const characterId = params.get("character");
if (characterId) mock.db.status.activeCharacterId = characterId;

const fake = createFakeSpindleContext(document, mock);
(globalThis as Record<string, unknown>).__iiMock = mock;
const handles = setup(fake.ctx, {
  onReady: (frontend) => {
    (globalThis as Record<string, unknown>).__iiFrontend = frontend;
    const tab = params.get("open");
    const settings = params.get("settings");
    if (settings) frontend.overlay.open({ settings: settings as never });
    else if (tab) frontend.overlay.open({ tab: tab as never });
    const scene = params.get("scene");
    if (scene && PREVIEW_SCENES[scene]) void PREVIEW_SCENES[scene]!({ mock, frontend, params, doc: document });
  }
});
void handles;
