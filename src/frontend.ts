import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { DEFAULT_CONFIG, type Config } from "./shared/config.js";
import { fetchImageGenerationSettings, fetchParserConnections } from "./frontend/api.js";
import { CLEANUP_KEY, PANEL_STYLES } from "./frontend/constants.js";
import type { BackendMessage, FrontendActions, ParserConnection } from "./frontend/contracts.js";
import { routeBackendMessage } from "./frontend/message-router.js";
import { SettingsRenderer } from "./frontend/renderer.js";
import { installInlayLightbox } from "./frontend/lightbox.js";
import { installInlayMessageDisplay } from "./frontend/message-display.js";
import { installInlayFab } from "./frontend/fab.js";
import { createInlayGallery } from "./frontend/gallery.js";
import { mountInlaySettingsHost } from "./frontend/settings-host.js";
import { applyDisplaySettingsSnapshot } from "./frontend/display-settings.js";
import { applyQuoteSettingsSnapshot } from "./frontend/caption-settings.js";

export function setup(ctx: SpindleFrontendContext) {
  const previousCleanup = (globalThis as Record<string, unknown>)[CLEANUP_KEY];
  if (typeof previousCleanup === "function") previousCleanup();

  let config: Config = { ...DEFAULT_CONFIG };
  let parserConnections: ParserConnection[] = [];
  let characterAppearance: Record<string, string> = {};
  let quoteStyle = "";
  let quoteExample = "";
  let status = "Loading...";
  let triedImageGenerationParserDefault = false;
  const settingsHost = mountInlaySettingsHost(ctx.ui);
  const removeStyle = ctx.dom.addStyle(PANEL_STYLES);
  const removeLightbox = installInlayLightbox(ctx);
  const removeMessageDisplay = installInlayMessageDisplay(ctx);
  const gallery = createInlayGallery(ctx);
  const removeFab = installInlayFab(ctx, { getCorner: () => config.fabCorner, openGallery: () => gallery.open(activeChatId()) });

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
    const node = settingsHost.root.querySelector<HTMLElement>(".inlay-status");
    if (node) node.textContent = status;
  }

  function patchConfig(patch: Partial<Config>): void {
    config = { ...config, ...patch };
    ctx.sendToBackend({ type: "set_config", patch, chatId: activeChatId() });
  }

  function patchQuoteSettings(patch: { quoteStyle?: string; quoteExample?: string }): void {
    if (typeof patch.quoteStyle === "string") quoteStyle = patch.quoteStyle;
    if (typeof patch.quoteExample === "string") quoteExample = patch.quoteExample;
    const chatId = activeChatId();
    applyQuoteSettingsSnapshot(chatId, quoteStyle, quoteExample);
    ctx.sendToBackend({ type: "set_quote_settings", requestId: `quote-settings-${Date.now()}`, chatId, patch });
  }

  const actions: FrontendActions = {
    activeChatId,
    patchConfig,
    patchQuoteSettings,
    requestState: () => requestState(),
    sendToBackend: (payload) => ctx.sendToBackend(payload),
    updateStatus,
    openGallery: () => gallery.open()
  };
  const renderer = new SettingsRenderer(
    ctx,
    settingsHost.root,
    () => ({ config, parserConnections, characterAppearance, quoteStyle, quoteExample, status }),
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
    const displayMessage = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    if (displayMessage.type === "state") {
      const stateConfig = displayMessage.config && typeof displayMessage.config === "object"
        ? displayMessage.config as Record<string, unknown>
        : {};
      const stateChatId = typeof displayMessage.chatId === "string" ? displayMessage.chatId : activeChatId();
      applyDisplaySettingsSnapshot({
        displayMax: stateConfig.displayMax
      });
      applyQuoteSettingsSnapshot(stateChatId, displayMessage.quoteStyle, displayMessage.quoteExample);
    } else if (displayMessage.type === "quote_settings_updated" && displayMessage.ok === true) {
      const stateChatId = typeof displayMessage.chatId === "string" ? displayMessage.chatId : activeChatId();
      const nextQuoteStyle = typeof displayMessage.quoteStyle === "string" ? displayMessage.quoteStyle : "";
      const nextQuoteExample = typeof displayMessage.quoteExample === "string" ? displayMessage.quoteExample : "";
      applyQuoteSettingsSnapshot(stateChatId, nextQuoteStyle, nextQuoteExample);
      if (stateChatId === activeChatId()) {
        quoteStyle = nextQuoteStyle;
        quoteExample = nextQuoteExample;
        renderer.render();
      }
    } else if (displayMessage.type === "config_updated") {
      const nextConfig = displayMessage.config && typeof displayMessage.config === "object"
        ? displayMessage.config as Record<string, unknown>
        : {};
      applyDisplaySettingsSnapshot({ displayMax: nextConfig.displayMax });
    }
    routeBackendMessage(payload as BackendMessage, activeChatId, {
      replaceConfig: (next) => {
        config = next;
      },
      replaceState: (next) => {
        config = next.config;
        parserConnections = next.parserConnections;
        characterAppearance = next.characterAppearance;
        quoteStyle = next.quoteStyle;
        quoteExample = next.quoteExample;
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

  const unsubChatSwitched = ctx.events.on("CHAT_SWITCHED", (payload) => {
    const chatId = (payload as { chatId?: unknown } | null)?.chatId;
    requestState(typeof chatId === "string" ? chatId : "");
  });

  renderer.render();
  requestState();
  ctx.ready();

  const cleanup = () => {
    unsub();
    unsubChatSwitched();
    renderer.destroy();
    gallery.destroy();
    removeFab();
    removeMessageDisplay();
    removeLightbox();
    removeStyle();
    settingsHost.destroy();
    if ((globalThis as Record<string, unknown>)[CLEANUP_KEY] === cleanup) {
      delete (globalThis as Record<string, unknown>)[CLEANUP_KEY];
    }
  };
  (globalThis as Record<string, unknown>)[CLEANUP_KEY] = cleanup;
  return cleanup;
}
