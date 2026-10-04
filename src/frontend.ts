import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { DEFAULT_CONFIG, type Config } from "./shared/config.js";
import { respondToAvatarImageRequest } from "./frontend/avatar-image.js";
import { applyInlayDisplaySettings } from "./frontend/inlay-display.js";
import { CLEANUP_KEY, DRAWER_TAB_OPTIONS, HOST_STYLES } from "./frontend/constants.js";
import type { BackendMessage } from "./frontend/contracts.js";
import { routeBackendMessage } from "./frontend/message-router.js";
import { installInlayLightbox } from "./frontend/lightbox.js";
import { installInlayFab } from "./frontend/fab.js";
import { createInlayGallery } from "./frontend/gallery.js";
import { cleanupModalStyles } from "./frontend/modal.js";
import { OVERLAY_CSS } from "./frontend/overlay/styles/index.js";

export function setup(ctx: SpindleFrontendContext) {
  const previousCleanup = (globalThis as Record<string, unknown>)[CLEANUP_KEY];
  if (typeof previousCleanup === "function") previousCleanup();

  let config: Config = { ...DEFAULT_CONFIG };
  const tab = ctx.ui.registerDrawerTab(DRAWER_TAB_OPTIONS);
  const status = document.createElement("p");
  status.textContent = "Asset Maid port in progress.";
  tab.root.replaceChildren(status);
  const removeStyle = ctx.dom.addStyle(HOST_STYLES);
  const removeOverlayStyle = ctx.dom.addStyle(OVERLAY_CSS);
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
    openSettings: () => undefined
  });

  let inlayDisplayTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleInlayDisplayRefresh(delayMs = 40): void {
    if (inlayDisplayTimer) clearTimeout(inlayDisplayTimer);
    inlayDisplayTimer = setTimeout(() => {
      inlayDisplayTimer = null;
      try {
        applyInlayDisplaySettings(config);
      } catch {
        // The chat DOM may not be mounted yet; the next pass retries.
      }
    }, delayMs);
  }

  const unsub = ctx.onBackendMessage((payload: unknown) => {
    const message = payload as BackendMessage & Record<string, unknown>;
    if (message.type === "avatar_image_request") {
      void respondToAvatarImageRequest(message, (response) => ctx.sendToBackend(response));
      return;
    }
    routeBackendMessage(message, activeChatId, {
      replaceConfig: (next) => { config = next; scheduleInlayDisplayRefresh(0); },
      replaceState: (next) => { config = next.config; status.textContent = next.status; scheduleInlayDisplayRefresh(0); },
      updateStatus: (next) => { status.textContent = next; },
      refreshParserConnections: () => undefined
    });
    scheduleInlayDisplayRefresh();
  });
  const unsubChatSwitched = ctx.events.on("CHAT_SWITCHED", (payload) => {
    const chatId = (payload as { chatId?: unknown } | null)?.chatId;
    ctx.sendToBackend({ type: "get_state", chatId: typeof chatId === "string" ? chatId : "" });
    scheduleInlayDisplayRefresh(80);
  });

  ctx.sendToBackend({ type: "get_state", chatId: activeChatId() });
  ctx.ready();

  const cleanup = () => {
    unsub();
    unsubChatSwitched();
    if (inlayDisplayTimer) clearTimeout(inlayDisplayTimer);
    removeFab();
    gallery.destroy();
    cleanupModalStyles();
    removeLightbox();
    removeStyle();
    removeOverlayStyle();
    tab.destroy();
    if ((globalThis as Record<string, unknown>)[CLEANUP_KEY] === cleanup) {
      delete (globalThis as Record<string, unknown>)[CLEANUP_KEY];
    }
  };
  (globalThis as Record<string, unknown>)[CLEANUP_KEY] = cleanup;
  return cleanup;
}
