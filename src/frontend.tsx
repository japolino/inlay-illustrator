import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { render } from "preact";
import type { Config } from "./shared/config.js";
import { respondToAvatarImageRequest } from "./frontend/avatar-image.js";
import { fetchParserConnections } from "./frontend/api.js";
import { applyInlayDisplaySettings } from "./frontend/inlay-display.js";
import { CLEANUP_KEY, DRAWER_TAB_OPTIONS, HOST_STYLES } from "./frontend/constants.js";
import type { BackendMessage } from "./frontend/contracts.js";
import { routeBackendMessage } from "./frontend/message-router.js";
import { installInlayLightbox } from "./frontend/lightbox.js";
import { installInlayFab } from "./frontend/fab.js";
import { createInlayGallery } from "./frontend/gallery.js";
import { cleanupModalStyles } from "./frontend/modal.js";
import { INPUT_BAR_ACTION_ID, OVERLAY_ROOT_CLASS } from "./frontend/overlay/constants.js";
import { createOverlayController } from "./frontend/overlay/controller.js";
import { LAUNCHER_LABELS } from "./frontend/overlay/labels.js";
import { LauncherPanel } from "./frontend/overlay/launcher.js";
import { FrontendStore } from "./frontend/overlay/store.js";
import { OVERLAY_CSS } from "./frontend/overlay/styles/index.js";
import { RpcClient, spindleTransport } from "./frontend/rpc/client.js";
import { AppController } from "./frontend/state/app-state.js";
import type { OverlayController } from "./frontend/overlay/controller.js";
import { installChatSide } from "./frontend/chat/index.js";
import { createZoomViewer, type ZoomViewer } from "./frontend/zoom/index.js";

/** Handles exposed to dev tools (preview page, tests). */
export type FrontendHandles = { app: AppController; client: RpcClient; overlay: OverlayController; zoom: ZoomViewer };
export type SetupOptions = { onReady?: (handles: FrontendHandles) => void };

export function setup(ctx: SpindleFrontendContext, options: SetupOptions = {}) {
  const previousCleanup = (globalThis as Record<string, unknown>)[CLEANUP_KEY];
  if (typeof previousCleanup === "function") previousCleanup();

  const client = new RpcClient(spindleTransport(ctx), { clientId: "ui" });
  const app = new AppController(client, { surface: "overlay" });
  const store = new FrontendStore();
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

  function requestState(chatId = activeChatId()): void {
    store.set({ chatId });
    ctx.sendToBackend({ type: "get_state", chatId });
  }

  function patchConfig(patch: Partial<Config>): void {
    store.set({ config: { ...store.get().config, ...patch } });
    ctx.sendToBackend({ type: "set_config", patch, chatId: activeChatId() });
    scheduleInlayDisplayRefresh();
  }

  const overlay = createOverlayController(ctx, {
    store,
    app,
    patchConfig,
    onHostFallback: (kind, error) => {
      console.warn(`[Inlay Illustrator] overlay mount fell back to ${kind}:`, error);
    }
  });

  // Chat side: zoom viewer + controls around baked illustrations.
  const zoom = createZoomViewer(ctx, app);
  const removeChatSide = installChatSide(ctx, app, { openZoom: (target) => zoom.open(target), getActiveChatId: activeChatId });

  // Launcher 1: the drawer tab is a small status panel with an "Open" button.
  const tab = ctx.ui.registerDrawerTab(DRAWER_TAB_OPTIONS);
  const launcherRoot = document.createElement("div");
  launcherRoot.className = OVERLAY_ROOT_CLASS;
  tab.root.replaceChildren(launcherRoot);
  render(<LauncherPanel store={store} onOpen={() => overlay.open()} />, launcherRoot);

  // Launcher 2: an input-bar action (optional host feature).
  let inputBarAction: ReturnType<SpindleFrontendContext["ui"]["registerInputBarAction"]> | null = null;
  let removeInputBarClick: (() => void) | null = null;
  try {
    inputBarAction = ctx.ui.registerInputBarAction({
      id: INPUT_BAR_ACTION_ID,
      label: LAUNCHER_LABELS.inputBarLabel,
      subtitle: LAUNCHER_LABELS.inputBarSubtitle,
      iconSvg: DRAWER_TAB_OPTIONS.iconSvg
    });
    removeInputBarClick = inputBarAction.onClick(() => overlay.open());
  } catch (error) {
    console.warn("[Inlay Illustrator] input-bar action unavailable:", error);
  }

  // Launcher 3: the floating button's "settings" item opens the overlay.
  const removeFab = installInlayFab(ctx, {
    getCorner: () => store.get().config.fabCorner,
    openGallery: () => gallery.open(activeChatId()),
    openSettings: () => overlay.open({ settings: true })
  });

  let inlayDisplayTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleInlayDisplayRefresh(delayMs = 40): void {
    if (inlayDisplayTimer) clearTimeout(inlayDisplayTimer);
    inlayDisplayTimer = setTimeout(() => {
      inlayDisplayTimer = null;
      try {
        applyInlayDisplaySettings(store.get().config);
      } catch {
        // The chat DOM may not be mounted yet; the next pass retries.
      }
    }, delayMs);
  }

  // Legacy (non-RPC) backend messages: avatar bridge and the interim state/config messages.
  const unsub = client.onForeign((payload: unknown) => {
    const message = payload as BackendMessage & Record<string, unknown>;
    if (message.type === "avatar_image_request") {
      void respondToAvatarImageRequest(message, (response) => ctx.sendToBackend(response));
      return;
    }
    routeBackendMessage(message, activeChatId, {
      replaceConfig: (config) => { store.set({ config }); scheduleInlayDisplayRefresh(0); },
      replaceState: (next) => {
        store.set({
          config: next.config,
          parserConnections: next.parserConnections,
          imageConnections: next.imageConnections,
          status: next.status
        });
        scheduleInlayDisplayRefresh(0);
      },
      updateStatus: (status) => store.set({ status }),
      refreshParserConnections: () => {
        void fetchParserConnections().then((parserConnections) => {
          if (parserConnections.length > 0) store.set({ parserConnections });
        });
      }
    });
    scheduleInlayDisplayRefresh();
  });
  const unsubChatSwitched = ctx.events.on("CHAT_SWITCHED", (payload) => {
    const chatId = (payload as { chatId?: unknown } | null)?.chatId;
    requestState(typeof chatId === "string" ? chatId : "");
    scheduleInlayDisplayRefresh(80);
  });

  requestState();
  void app.init();
  ctx.ready();
  options.onReady?.({ app, client, overlay, zoom });

  const cleanup = () => {
    unsub();
    unsubChatSwitched();
    removeChatSide();
    zoom.destroy();
    app.destroy();
    client.destroy();
    if (inlayDisplayTimer) clearTimeout(inlayDisplayTimer);
    removeInputBarClick?.();
    inputBarAction?.destroy();
    overlay.destroy();
    removeFab();
    gallery.destroy();
    cleanupModalStyles();
    removeLightbox();
    render(null, launcherRoot);
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
