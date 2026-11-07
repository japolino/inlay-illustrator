import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { render } from "preact";
import { CLEANUP_KEY, DRAWER_TAB_OPTIONS } from "./frontend/constants.js";
import { startComposerInset } from "./frontend/composer-inset.js";
import { INPUT_BAR_ACTION_ID, OVERLAY_ROOT_CLASS } from "./frontend/overlay/constants.js";
import { createOverlayController, type OverlayController } from "./frontend/overlay/controller.js";
import { LAUNCHER_LABELS } from "./frontend/overlay/labels.js";
import { LauncherPanel } from "./frontend/overlay/launcher.js";
import { FrontendStore } from "./frontend/overlay/store.js";
import { OVERLAY_CSS } from "./frontend/overlay/styles/index.js";
import { RpcClient, spindleTransport } from "./frontend/rpc/client.js";
import { AppController } from "./frontend/state/app-state.js";
import { installChatSide } from "./frontend/chat/index.js";
import { COUNT_LABELS } from "./frontend/chat/labels.js";
import { runtimeCornerPreference } from "./frontend/chat/corner.js";
import { HOST_LAYERING_CSS } from "./frontend/chat/styles.js";
import { answerFetchBridge } from "./frontend/fetch-bridge.js";
import { createZoomViewer, type ZoomViewer } from "./frontend/zoom/index.js";
import { watchConnection } from "./frontend/host-sync.js";
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
  const removeLayeringStyle = ctx.dom.addStyle(HOST_LAYERING_CSS);

  function activeChatId(): string {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }
  store.set({ chatId: activeChatId() });

  /**
   * Roster character of the active chat (count panel button). Group chats: the host's chat character (the greeting
   * character, by default the first member), else the first member; the speaking character is not known here.
   */
  function chatCharacter(): { characterId?: string } {
    let characterId = "";
    try {
      characterId = String(ctx.getActiveChat().characterId || "");
    } catch {
      characterId = "";
    }
    const status = app.state.status;
    if (!characterId && status?.activeChatId === activeChatId()) characterId = status.activeGroupCharacterIds[0] ?? "";
    return characterId ? { characterId } : {};
  }

  const overlay = createOverlayController(ctx, {
    store,
    app,
    onHostFallback: (kind, error) => {
      console.warn(`[Inlay Illustrator] overlay mount fell back to ${kind}:`, error);
    }
  });

  // The host drawer is layered above the app overlay (z-index 9992 > 9990): close it whenever the overlay opens.
  let overlayWasOpen = store.get().overlayOpen;
  const unsubOverlayDrawer = store.subscribe(() => {
    const open = store.get().overlayOpen;
    if (open && !overlayWasOpen) void app.call("session.closeHostDrawer", {}).catch(() => undefined);
    overlayWasOpen = open;
  });

  // Chat side: zoom viewer + controls around baked illustrations, and the body-level runtime host (count toggle,
  // toasts) in the corner chosen in the drawer launcher.
  const zoom = createZoomViewer(ctx, app);
  const runtimeCorner = runtimeCornerPreference();
  const removeChatSide = installChatSide(ctx, app, {
    openZoom: (target) => zoom.open(target),
    getActiveChatId: activeChatId,
    subscribeOverlay: (listener) => store.subscribe(() => listener(store.get().overlayOpen)),
    corner: runtimeCorner,
    generateLatest,
    openOverview: () => overlay.open({ tab: "assets", ...chatCharacter() })
  });

  // The runtime host's bottom corners sit above the host composer, whatever its height.
  const composer = startComposerInset();

  // Launcher 1: the drawer tab is a status panel with "Open" buttons.
  const tab = ctx.ui.registerDrawerTab(DRAWER_TAB_OPTIONS);
  const launcherRoot = document.createElement("div");
  launcherRoot.className = OVERLAY_ROOT_CLASS;
  tab.root.replaceChildren(launcherRoot);
  render(
    <LauncherPanel app={app} store={store} corner={runtimeCorner} onOpen={() => overlay.open()} onOpenSettings={() => overlay.open({ settings: true })} />,
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

  /**
   * Starts the footer action of the latest eligible assistant message of the active chat (count panel button):
   * generate when it has no images, reroll when it has, retry after a failure (chatDom states are in chat order).
   */
  async function generateLatest(): Promise<void> {
    const chatId = activeChatId();
    if (!chatId) return;
    try {
      // getMessageStates without ids only returns messages that already have data; ask for the last mounted bubbles too.
      let messageIds: string[] | undefined;
      try {
        messageIds = ctx.dom.listMessageElements().map((bubble) => bubble.messageId).filter(Boolean).slice(-6);
      } catch {
        messageIds = undefined;
      }
      const { messages } = await app.call("chatDom.getMessageStates", { chatId, ...(messageIds?.length ? { messageIds } : {}) });
      const last = [...messages].reverse().find((message) => message.eligible);
      if (!last) {
        app.notify({ tone: "info", message: COUNT_LABELS.noEligibleMessage });
        return;
      }
      await app.call("generation.start", { chatId, messageId: last.messageId, swipeIndex: last.swipeIndex, attemptKind: last.attempt });
    } catch (error) {
      app.notifyError(error);
    }
  }

  // Non-RPC backend messages: the JSON fetch bridge (character gallery and LLM model lists depend on it).
  const unsubForeign = client.onForeign((payload: unknown) => {
    if (isFetchBridgeRequest(payload)) void answerFetchBridge(payload).then((response) => ctx.sendToBackend(response));
  });
  const unsubChatSwitched = ctx.events.on("CHAT_SWITCHED", (payload) => {
    const chatId = (payload as { chatId?: unknown } | null)?.chatId;
    store.set({ chatId: typeof chatId === "string" ? chatId : "" });
    void app.refreshStatus();
  });

  // Backend events sent while the page was disconnected are lost: re-read the state when the host connection is back,
  // and when the tab is shown again after a while (a failed handshake is retried instead).
  const unwatchConnection = watchConnection(ctx.events, app, document);

  void app.init();
  ctx.ready();
  options.onReady?.({ app, client, overlay, zoom });

  const cleanup = () => {
    unsubForeign();
    unsubChatSwitched();
    unwatchConnection();
    unsubOverlayDrawer();
    composer.stop();
    removeChatSide();
    zoom.destroy();
    removeInputBarClick?.();
    inputBarAction?.destroy();
    overlay.destroy();
    render(null, launcherRoot);
    app.destroy();
    client.destroy();
    removeLayeringStyle();
    removeOverlayStyle();
    tab.destroy();
    if ((globalThis as Record<string, unknown>)[CLEANUP_KEY] === cleanup) {
      delete (globalThis as Record<string, unknown>)[CLEANUP_KEY];
    }
  };
  (globalThis as Record<string, unknown>)[CLEANUP_KEY] = cleanup;
  return cleanup;
}
