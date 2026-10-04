import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { render } from "preact";
import { CLEANUP_KEY, DRAWER_TAB_OPTIONS } from "./frontend/constants.js";
import { installInlayFab, loadFabCorner, saveFabCorner, type FabCorner } from "./frontend/fab.js";
import { INPUT_BAR_ACTION_ID, OVERLAY_ROOT_CLASS } from "./frontend/overlay/constants.js";
import { createOverlayController, type OverlayController } from "./frontend/overlay/controller.js";
import { LAUNCHER_LABELS } from "./frontend/overlay/labels.js";
import { LauncherPanel } from "./frontend/overlay/launcher.js";
import { FrontendStore } from "./frontend/overlay/store.js";
import { OVERLAY_CSS } from "./frontend/overlay/styles/index.js";
import { RpcClient, spindleTransport } from "./frontend/rpc/client.js";
import { AppController } from "./frontend/state/app-state.js";
import { installChatSide } from "./frontend/chat/index.js";
import { answerFetchBridge } from "./frontend/fetch-bridge.js";
import { createZoomViewer, type ZoomViewer } from "./frontend/zoom/index.js";
import { zoomVisibility } from "./frontend/zoom/signal.js";
import { isFetchBridgeRequest } from "./shared/contract/bridge.js";

/** Handles exposed to dev tools (preview page, tests). */
export type FrontendHandles = { app: AppController; client: RpcClient; overlay: OverlayController; zoom: ZoomViewer };
export type SetupOptions = { onReady?: (handles: FrontendHandles) => void };

export function setup(ctx: SpindleFrontendContext, options: SetupOptions = {}) {
  const previousCleanup = (globalThis as Record<string, unknown>)[CLEANUP_KEY];
  if (typeof previousCleanup === "function") previousCleanup();

  const client = new RpcClient(spindleTransport(ctx), { clientId: "ui" });
  const app = new AppController(client, { surface: "overlay" });
  const store = new FrontendStore();
  const removeOverlayStyle = ctx.dom.addStyle(OVERLAY_CSS);

  function activeChatId(): string {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }
  store.set({ chatId: activeChatId() });

  const overlay = createOverlayController(ctx, {
    store,
    app,
    onHostFallback: (kind, error) => {
      console.warn(`[Inlay Illustrator] overlay mount fell back to ${kind}:`, error);
    }
  });

  // Chat side: zoom viewer + controls around baked illustrations.
  const zoom = createZoomViewer(ctx, app);
  const removeChatSide = installChatSide(ctx, app, {
    openZoom: (target) => zoom.open(target),
    getActiveChatId: activeChatId,
    subscribeOverlay: (listener) => store.subscribe(() => listener(store.get().overlayOpen))
  });

  // FAB corner is a device preference; the launcher panel edits it.
  const cornerListeners = new Set<(corner: FabCorner) => void>();
  const fabCorner = {
    get: () => loadFabCorner(),
    set: (corner: FabCorner) => {
      saveFabCorner(corner);
      for (const listener of cornerListeners) listener(corner);
    }
  };

  // Launcher 1: the drawer tab is a status panel with "Open" buttons.
  const tab = ctx.ui.registerDrawerTab(DRAWER_TAB_OPTIONS);
  const launcherRoot = document.createElement("div");
  launcherRoot.className = OVERLAY_ROOT_CLASS;
  tab.root.replaceChildren(launcherRoot);
  render(
    <LauncherPanel app={app} store={store} fabCorner={fabCorner} onOpen={() => overlay.open()} onOpenSettings={() => overlay.open({ settings: true })} />,
    launcherRoot
  );

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

  /** Latest eligible assistant message of the active chat (chatDom states are in chat order). */
  async function latestTarget(): Promise<{ chatId: string; messageId: string; swipeIndex: number } | null> {
    const chatId = activeChatId();
    if (!chatId) return null;
    // getMessageStates without ids only returns messages that already have data; ask for the last mounted bubbles too.
    let messageIds: string[] | undefined;
    try {
      messageIds = ctx.dom.listMessageElements().map((bubble) => bubble.messageId).filter(Boolean).slice(-6);
    } catch {
      messageIds = undefined;
    }
    const { messages } = await app.call("chatDom.getMessageStates", { chatId, ...(messageIds?.length ? { messageIds } : {}) });
    const last = [...messages].reverse().find((message) => message.eligible);
    return last ? { chatId, messageId: last.messageId, swipeIndex: last.swipeIndex } : null;
  }
  async function generateLatest(attemptKind?: "reroll"): Promise<void> {
    try {
      const target = await latestTarget();
      if (target) await app.call("generation.start", { ...target, ...(attemptKind ? { attemptKind } : {}) });
    } catch (error) {
      app.notifyError(error);
    }
  }

  // Launcher 3: the floating button (generate / reroll / gallery / open the overlay).
  const removeFab = installInlayFab(ctx, {
    getCorner: () => fabCorner.get(),
    openGallery: () => {
      void zoom.openChat(activeChatId()).then((opened) => {
        if (!opened) app.notify({ tone: "info", message: "No images in this chat yet." });
      });
    },
    openSettings: () => overlay.open(),
    generateLatest: () => generateLatest(),
    rerollLatest: () => generateLatest("reroll"),
    subscribeBusy: (listener) => app.store.subscribe(() => listener(Object.keys(app.state.generationJobs).length > 0)),
    subscribeCorner: (listener) => {
      cornerListeners.add(listener);
      return () => cornerListeners.delete(listener);
    },
    subscribeHidden: (listener) => {
      const zoomSignal = zoomVisibility(app);
      const update = () => listener(store.get().overlayOpen || zoomSignal.isOpen());
      const offStore = store.subscribe(update);
      const offZoom = zoomSignal.subscribe(update);
      update();
      return () => {
        offStore();
        offZoom();
      };
    }
  });

  // Non-RPC backend messages: the fetch bridge (image bytes, gallery and model lists depend on it).
  const unsubForeign = client.onForeign((payload: unknown) => {
    if (isFetchBridgeRequest(payload)) void answerFetchBridge(payload).then((response) => ctx.sendToBackend(response));
  });
  const unsubChatSwitched = ctx.events.on("CHAT_SWITCHED", (payload) => {
    const chatId = (payload as { chatId?: unknown } | null)?.chatId;
    store.set({ chatId: typeof chatId === "string" ? chatId : "" });
    void app.call("session.getStatus", {}).then((status) => app.store.patch({ status })).catch(() => undefined);
  });

  void app.init();
  ctx.ready();
  options.onReady?.({ app, client, overlay, zoom });

  const cleanup = () => {
    unsubForeign();
    unsubChatSwitched();
    removeChatSide();
    zoom.destroy();
    removeInputBarClick?.();
    inputBarAction?.destroy();
    overlay.destroy();
    removeFab();
    render(null, launcherRoot);
    app.destroy();
    client.destroy();
    removeOverlayStyle();
    tab.destroy();
    if ((globalThis as Record<string, unknown>)[CLEANUP_KEY] === cleanup) {
      delete (globalThis as Record<string, unknown>)[CLEANUP_KEY];
    }
  };
  (globalThis as Record<string, unknown>)[CLEANUP_KEY] = cleanup;
  return cleanup;
}
