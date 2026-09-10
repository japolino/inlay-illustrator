import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { DEFAULT_CONFIG, type Config } from "./shared/config.js";
import { respondToAvatarImageRequest } from "./frontend/avatar-image.js";
import { applyInlayDisplaySettings } from "./frontend/inlay-display.js";
import { fetchImageGenerationSettings, fetchParserConnections } from "./frontend/api.js";
import { CLEANUP_KEY, DRAWER_TAB_OPTIONS, PANEL_STYLES } from "./frontend/constants.js";
import type { BackendMessage, FrontendActions, ImageConnection, ParserConnection } from "./frontend/contracts.js";
import { routeBackendMessage } from "./frontend/message-router.js";
import { SettingsRenderer } from "./frontend/renderer.js";
import { installInlayLightbox } from "./frontend/lightbox.js";
import { installInlayFab } from "./frontend/fab.js";
import { createInlayGallery } from "./frontend/gallery.js";
import { cleanupModalStyles } from "./frontend/modal.js";

export function setup(ctx: SpindleFrontendContext) {
  const previousCleanup = (globalThis as Record<string, unknown>)[CLEANUP_KEY];
  if (typeof previousCleanup === "function") previousCleanup();

  let config: Config = { ...DEFAULT_CONFIG };
  let parserConnections: ParserConnection[] = [];
  let imageConnections: ImageConnection[] = [];
  let characterAppearance: Record<string, string> = {};
  let status = "Loading...";
  let triedImageGenerationParserDefault = false;
  let drawerWasActive = false;
  let renderer: SettingsRenderer | null = null;

  const tab = ctx.ui.registerDrawerTab(DRAWER_TAB_OPTIONS);
  const removeStyle = ctx.dom.addStyle(PANEL_STYLES);
  const removeLightbox = installInlayLightbox(ctx);
  const gallery = createInlayGallery(ctx);

  function activeChatId(): string {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }

  const removeFab = installInlayFab(ctx, {
    getCorner: () => config.fabCorner,
    openGallery: () => gallery.open(activeChatId()),
    openSettings: () => {
      const maybeDrawer = ctx as unknown as { openDrawer?: () => void };
      if (typeof maybeDrawer.openDrawer === "function") {
        maybeDrawer.openDrawer();
      }
    }
  });

  function requestState(chatId = activeChatId()): void {
    ctx.sendToBackend({ type: "get_state", chatId });
  }

  function updateStatus(next: string): void {
    status = next;
    renderer?.updateStatus(next);
  }

  function patchConfig(patch: Partial<Config>): void {
    config = { ...config, ...patch };
    ctx.sendToBackend({ type: "set_config", patch, chatId: activeChatId() });
    // Display settings restyle images that are already in the chat.
    scheduleInlayDisplayRefresh();
  }

  // Message HTML is generated once, when an image is produced. Re-apply the
  // current Image output geometry so changing the aspect ratio or height cap
  // affects existing inlays instead of only future generations.
  let inlayDisplayTimer: ReturnType<typeof setTimeout> | null = null;
  let applyingInlayDisplay = false;
  function refreshInlayDisplay(): void {
    if (applyingInlayDisplay) return;
    applyingInlayDisplay = true;
    try {
      applyInlayDisplaySettings(config);
    } catch {
      // The chat DOM may not be mounted yet; the next pass retries.
    } finally {
      applyingInlayDisplay = false;
    }
  }
  function scheduleInlayDisplayRefresh(delayMs = 40): void {
    if (inlayDisplayTimer) clearTimeout(inlayDisplayTimer);
    inlayDisplayTimer = setTimeout(() => {
      inlayDisplayTimer = null;
      refreshInlayDisplay();
    }, delayMs);
  }

  const actions: FrontendActions = {
    activeChatId,
    patchConfig,
    requestState: () => requestState(),
    sendToBackend: (payload) => ctx.sendToBackend(payload),
    updateStatus,
    openGallery: () => gallery.open(activeChatId())
  };
  renderer = new SettingsRenderer(
    ctx,
    tab.root,
    () => ({ config, parserConnections, imageConnections, characterAppearance, status }),
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
      // Only inherit the app-level image setup on a blank extension config.
      // The legacy settings blob also carries a stale model and a ComfyUI-era
      // parameter bag; copying those over would replace the image connection
      // profile's own resolution, steps, guidance, and seed.
      const hasStoredImageSetup = Boolean(config.imageConnectionId)
        || Object.keys(config.imageParameters || {}).length > 0;
      if (!hasStoredImageSetup && imageGeneration.activeImageGenConnectionId) {
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
      renderer?.render();
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
        scheduleInlayDisplayRefresh(0);
      },
      replaceState: (next) => {
        config = next.config;
        parserConnections = next.parserConnections;
        imageConnections = next.imageConnections;
        characterAppearance = next.characterAppearance;
        status = next.status;
        renderer?.render();
        scheduleInlayDisplayRefresh(0);
      },
      replaceCharacterMemory: (nextAppearance, nextStatus) => {
        characterAppearance = nextAppearance;
        status = nextStatus;
        renderer?.render();
      },
      updateStatus,
      refreshParserConnections: () => { void refreshParserConnectionsFromApi(); },
      applyImageGenerationDefaults: () => { void applyImageGenerationDefaults(); }
    });
    // New or refreshed images arrive with baked geometry from the backend;
    // re-apply the current display settings after the host paints them.
    scheduleInlayDisplayRefresh();
  });

  const unsubDrawer = ctx.ui.events.onDrawerChange((drawer) => {
    const active = drawer.open && drawer.tabId === tab.tabId;
    if (active && !drawerWasActive) requestState();
    drawerWasActive = active;
  });
  const unsubChatSwitched = ctx.events.on("CHAT_SWITCHED", (payload) => {
    const chatId = (payload as { chatId?: unknown } | null)?.chatId;
    requestState(typeof chatId === "string" ? chatId : "");
    scheduleInlayDisplayRefresh(80);
  });

  // The host re-renders message HTML from stored content, so watch the chat for
  // inlay frames that appear after a generation, a swipe, or a chat reload.
  let inlayObserver: MutationObserver | null = null;
  if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.body) {
    try {
      inlayObserver = new MutationObserver(() => {
        // Ignore the mutations this restyler causes itself.
        if (applyingInlayDisplay) return;
        scheduleInlayDisplayRefresh(60);
      });
      inlayObserver.observe(document.body, { childList: true, subtree: true });
    } catch {
      inlayObserver = null;
    }
  }

  renderer?.render();
  requestState();
  ctx.ready();

  const cleanup = () => {
    unsub();
    unsubDrawer();
    unsubChatSwitched();
    if (inlayDisplayTimer) clearTimeout(inlayDisplayTimer);
    inlayObserver?.disconnect();
    removeFab();
    gallery.destroy();
    cleanupModalStyles();
    renderer?.destroy();
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
