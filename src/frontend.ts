import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { DEFAULT_CONFIG, type Config } from "./shared/config.js";
import { respondToAvatarImageRequest } from "./frontend/avatar-image.js";
import { fetchImageGenerationSettings, fetchParserConnections } from "./frontend/api.js";
import { CLEANUP_KEY, DRAWER_TAB_OPTIONS, PANEL_STYLES } from "./frontend/constants.js";
import type { BackendMessage, FrontendActions, ParserConnection } from "./frontend/contracts.js";
import { routeBackendMessage } from "./frontend/message-router.js";
import { SettingsRenderer } from "./frontend/renderer.js";
import { installInlayLightbox } from "./frontend/lightbox.js";

export function setup(ctx: SpindleFrontendContext) {
  const previousCleanup = (globalThis as Record<string, unknown>)[CLEANUP_KEY];
  if (typeof previousCleanup === "function") previousCleanup();

  let config: Config = { ...DEFAULT_CONFIG };
  let parserConnections: ParserConnection[] = [];
  let characterAppearance: Record<string, string> = {};
  let status = "Loading...";
  let triedImageGenerationParserDefault = false;
  let drawerWasActive = false;

  const tab = ctx.ui.registerDrawerTab(DRAWER_TAB_OPTIONS);
  const removeStyle = ctx.dom.addStyle(PANEL_STYLES);
  const removeLightbox = installInlayLightbox(ctx);

  function activeChatId(): string {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }

  function requestState(chatId = activeChatId()): void {
    ctx.sendToBackend({ type: "get_state", chatId });
  }

  function updateStatus(next: string): void {
    status = next;
    const node = tab.root.querySelector<HTMLElement>(".inlay-status");
    if (node) node.textContent = status;
  }

  function patchConfig(patch: Partial<Config>): void {
    config = { ...config, ...patch };
    ctx.sendToBackend({ type: "set_config", patch, chatId: activeChatId() });
  }

  const actions: FrontendActions = {
    activeChatId,
    patchConfig,
    requestState: () => requestState(),
    sendToBackend: (payload) => ctx.sendToBackend(payload),
    updateStatus
  };
  const renderer = new SettingsRenderer(
    ctx,
    tab.root,
    () => ({ config, parserConnections, characterAppearance, status }),
    actions
  );

  async function applyImageGenerationDefaults(): Promise<void> {
    if (triedImageGenerationParserDefault) return;
    triedImageGenerationParserDefault = true;
    try {
      const imageGeneration = await fetchImageGenerationSettings();
      if (!imageGeneration) return;

      const patch: Partial<Config> = {};
      if (!config.parserConnectionId && imageGeneration.promptParserConnectionId) {
        patch.parserConnectionId = imageGeneration.promptParserConnectionId;
        patch.parserModel = imageGeneration.promptParserModel || "";
        patch.parserParameters = imageGeneration.promptParserParameters || {};
      }
      if (imageGeneration.activeImageGenConnectionId) {
        patch.imageConnectionId = imageGeneration.activeImageGenConnectionId;
        patch.imageModel = imageGeneration.model || "";
        patch.imageParameters = imageGeneration.parameters || {};
      }
      if (Object.keys(patch).length > 0) patchConfig(patch);
    } catch {
      // Explicit extension configuration remains authoritative when app settings are unavailable.
    }
  }

  async function refreshParserConnectionsFromApi(): Promise<void> {
    try {
      const next = await fetchParserConnections();
      if (next.length === 0) return;
      const seen = new Set(parserConnections.map((connection) => connection.id));
      parserConnections = [...parserConnections, ...next.filter((connection) => !seen.has(connection.id))];
      renderer.render();
    } catch {
      // The backend connection list remains the primary source.
    }
  }

  const unsub = ctx.onBackendMessage((payload: unknown) => {
    const message = payload as BackendMessage & Record<string, unknown>;
    if (message.type === "avatar_image_request") {
      void respondToAvatarImageRequest(message, (response) => ctx.sendToBackend(response));
      return;
    }
    routeBackendMessage(message, activeChatId, {
      replaceConfig: (next) => {
        config = next;
      },
      replaceState: (next) => {
        config = next.config;
        parserConnections = next.parserConnections;
        characterAppearance = next.characterAppearance;
        status = next.status;
        renderer.render();
      },
      replaceCharacterMemory: (nextAppearance, nextStatus) => {
        characterAppearance = nextAppearance;
        status = nextStatus;
        renderer.render();
      },
      updateStatus,
      refreshParserConnections: () => { void refreshParserConnectionsFromApi(); },
      applyImageGenerationDefaults: () => { void applyImageGenerationDefaults(); }
    });
  });

  const unsubDrawer = ctx.ui.events.onDrawerChange((drawer) => {
    const active = drawer.open && drawer.tabId === tab.tabId;
    if (active && !drawerWasActive) requestState();
    drawerWasActive = active;
  });
  const unsubChatSwitched = ctx.events.on("CHAT_SWITCHED", (payload) => {
    const chatId = (payload as { chatId?: unknown } | null)?.chatId;
    requestState(typeof chatId === "string" ? chatId : "");
  });

  renderer.render();
  requestState();
  ctx.ready();

  const cleanup = () => {
    unsub();
    unsubDrawer();
    unsubChatSwitched();
    renderer.destroy();
    removeLightbox();
    removeStyle();
    tab.destroy();
    if ((globalThis as Record<string, unknown>)[CLEANUP_KEY] === cleanup) {
      delete (globalThis as Record<string, unknown>)[CLEANUP_KEY];
    }
  };
  (globalThis as Record<string, unknown>)[CLEANUP_KEY] = cleanup;
  return cleanup;
}
