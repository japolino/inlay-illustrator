/**
 * Chat-side controller: decorates Lumiverse chat messages with the injected footer, image edge controls and
 * pending placeholder, keeps per-message UI state (`chatDom.getMessageStates`) fresh, routes clicks to RPC
 * calls (CHAT_ACTION_RPC), opens the zoom viewer on image clicks, and hosts the body-level runtime surfaces
 * (toast stack, generation-count panel, error dialog).
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { render } from "preact";
import { CHAT_IMAGE_WIDTH_VAR, pagerStep, type ChatMessageUiState } from "../../shared/contract/chat-dom.js";
import type { GenerationJobSnapshot } from "../../shared/contract/rpc.js";
import { toRpcError } from "../rpc/client.js";
import type { AppController } from "../state/app-state.js";
import { zoomVisibility } from "../zoom/signal.js";
import { bakedBlocks, findBakedImage, footerTarget, historyIdOfKey, isStreamingBubble, jobForMessage, regenerateJobsForMessage, uniqueBubbles, type BakedBlock, type MessageElementLike } from "./dom.js";
import { CHAT_ERROR_LABELS, ERROR_DIALOG_LABELS } from "./labels.js";
import { ChatRuntime, type ToastCommand } from "./runtime.js";
import { ChatRuntimeStore, errorDialogTitle } from "./runtime-store.js";
import { CHAT_SIDE_CSS } from "./styles.js";
import type { RuntimeToastModel } from "./toast-model.js";
import { ChatFooter, EdgeControls, PendingPlaceholder, revisionPosition, type EdgeAction, type FooterAction } from "./widgets.js";

export interface ZoomOpenTarget { chatId: string; slotId: string; entryId?: string; messageKey?: string }

export interface ChatSideOptions {
  /** Opens the zoom viewer for a baked image. */
  openZoom(target: ZoomOpenTarget): void;
  /** Active chat id (host). */
  getActiveChatId(): string;
}

export interface ChatSideInternalOptions extends ChatSideOptions {
  doc?: Document;
  /** Debounce of DOM reconciles (ms). */
  debounceMs?: number;
  /** Keeps the optimistic busy state of a footer click until a job shows up (ms). */
  pendingTimeoutMs?: number;
}

export interface ChatSideController {
  readonly runtime: ChatRuntimeStore;
  /** Re-reads every visible message state. */
  refresh(): Promise<void>;
  /** Runs a DOM reconcile now (tests). */
  reconcileNow(): void;
  /** Current state of a message (tests / scenes). */
  stateOf(messageId: string): ChatMessageUiState | null | undefined;
  destroy(): void;
}

const WRAPPER_ATTR = "data-ii-chat-wrapper";

function messageIdOfHistoryKey(messageKey: string): string {
  const id = historyIdOfKey(messageKey);
  const at = id.lastIndexOf("@");
  return at > 0 ? id.slice(0, at) : id;
}

function payloadMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const direct = p.messageId ?? p.message_id;
  if (typeof direct === "string") return direct;
  const message = p.message as Record<string, unknown> | undefined;
  return message && typeof message.id === "string" ? message.id : null;
}

export function createChatSide(ctx: SpindleFrontendContext, app: AppController, options: ChatSideInternalOptions): ChatSideController {
  const doc = options.doc ?? document;
  const win = doc.defaultView ?? window;
  const debounceMs = options.debounceMs ?? 60;
  const pendingTimeoutMs = options.pendingTimeoutMs ?? 20_000;
  const runtime = new ChatRuntimeStore();
  const zoom = zoomVisibility(app);
  const disposers: Array<() => void> = [];

  let chatId = "";
  let epoch = 0;
  let destroyed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const states = new Map<string, ChatMessageUiState | null>();
  const inflight = new Set<string>();
  const footers = new Map<string, Element>();
  const edges = new Map<Element, Element>();
  /** messageKey -> click time (optimistic busy until a job arrives). */
  const pendingFooter = new Map<string, number>();
  /** slotId -> local busy (history switch / regenerate request in flight). */
  const busySlots = new Set<string>();
  /** jobId -> slotId of single-slot regenerations started here. */
  const regenJobs = new Map<string, string>();
  const recentErrors = new Map<string, number>();

  disposers.push(ctx.dom.addStyle(CHAT_SIDE_CSS));

  /* ---------------- runtime host (body level) ---------------- */
  let hostRoot: HTMLElement;
  try {
    hostRoot = ctx.dom.createElement("div");
  } catch {
    hostRoot = doc.createElement("div");
  }
  hostRoot.className = "ii-am-root ii-am-chat-runtime-host";
  hostRoot.setAttribute(WRAPPER_ATTR, "runtime");
  doc.body.appendChild(hostRoot);
  const syncHostFlags = () => {
    hostRoot.toggleAttribute("data-ii-zoom", runtime.zoomOpen);
    if (runtime.zoomOpen) hostRoot.setAttribute("data-ii-zoom", "true");
    if (runtime.overlayOpen) hostRoot.setAttribute("data-ii-overlay", "true");
    else hostRoot.removeAttribute("data-ii-overlay");
  };
  disposers.push(runtime.subscribe(syncHostFlags));
  render(<ChatRuntime app={app} store={runtime} onToastCommand={(toast, command) => void onToastCommand(toast, command)} />, hostRoot);
  runtime.setFlags({ zoomOpen: zoom.isOpen() });
  disposers.push(zoom.subscribe((open) => runtime.setFlags({ zoomOpen: open })));

  /* ---------------- helpers ---------------- */
  function schedule(delay = debounceMs): void {
    if (destroyed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      reconcile();
    }, delay);
  }

  function inject(target: Element, position: InsertPosition): Element {
    const wrapper = ctx.dom.inject(target, "", position);
    wrapper.setAttribute(WRAPPER_ATTR, "");
    return wrapper;
  }
  function uninject(wrapper: Element): void {
    try {
      render(null, wrapper);
    } catch {
      // already detached
    }
    try {
      ctx.dom.uninject(wrapper);
    } catch {
      wrapper.remove();
    }
  }

  function chatError(title: string, error: unknown): void {
    const rpc = toRpcError(error);
    if (rpc.code === "cancelled") return;
    runtime.notice({ tone: "danger", message: title, detail: rpc.message });
  }

  function isOverlayOpen(): boolean {
    return !!doc.querySelector('.ii-am-overlay[data-state="open"]');
  }

  function listBubbles(): MessageElementLike[] {
    let list: MessageElementLike[] = [];
    try {
      list = ctx.dom.listMessageElements();
    } catch {
      list = [];
    }
    if (!Array.isArray(list) || list.length === 0) {
      list = [...doc.querySelectorAll("[data-message-id]")].map((element) => ({ messageId: element.getAttribute("data-message-id") ?? "", element }));
    }
    return uniqueBubbles(list);
  }

  async function fetchStates(ids: string[]): Promise<void> {
    const forChat = chatId;
    const forEpoch = epoch;
    if (!forChat || ids.length === 0) return;
    for (const id of ids) inflight.add(id);
    try {
      const { messages } = await app.call("chatDom.getMessageStates", { chatId: forChat, messageIds: ids });
      if (forEpoch !== epoch) return;
      for (const id of ids) if (!states.has(id)) states.set(id, null);
      const answered = new Set<string>();
      for (const message of messages) {
        answered.add(message.messageId);
        states.set(message.messageId, message);
      }
      for (const id of ids) if (!answered.has(id)) states.set(id, null);
    } catch (error) {
      if (forEpoch !== epoch) return;
      for (const id of ids) if (!states.has(id)) states.set(id, null);
      console.warn("[Inlay Illustrator] chatDom.getMessageStates failed:", error);
    } finally {
      for (const id of ids) inflight.delete(id);
      schedule(0);
    }
  }

  /* ---------------- reconcile ---------------- */
  function reconcile(): void {
    if (destroyed) return;
    const activeChat = options.getActiveChatId() || "";
    if (activeChat !== chatId) {
      chatId = activeChat;
      epoch += 1;
      states.clear();
      inflight.clear();
      pendingFooter.clear();
      busySlots.clear();
    }
    runtime.setFlags({ chatActive: !!chatId, overlayOpen: isOverlayOpen() });
    const bubbles = chatId ? listBubbles() : [];
    const missing = bubbles.map((b) => b.messageId).filter((id) => !states.has(id) && !inflight.has(id));
    if (missing.length) void fetchStates(missing);

    const jobs = app.state.generationJobs;
    const now = Date.now();
    for (const [key, at] of pendingFooter) if (now - at > pendingTimeoutMs) pendingFooter.delete(key);
    const liveFooters = new Set<string>();
    const liveFrames = new Set<Element>();
    for (const { messageId, element } of bubbles) {
      const state = states.get(messageId) ?? null;
      const blocks = bakedBlocks(element);
      if (state && state.eligible && !isStreamingBubble(element)) {
        liveFooters.add(messageId);
        renderFooter(messageId, element, state, jobs, blocks.length > 0);
      }
      for (const block of blocks) {
        liveFrames.add(block.frame);
        renderEdge(block, state, jobs);
      }
    }
    for (const [id, wrapper] of footers) {
      if (!liveFooters.has(id) || !wrapper.isConnected) {
        uninject(wrapper);
        footers.delete(id);
      }
    }
    for (const [frame, wrapper] of edges) {
      if (!liveFrames.has(frame) || !frame.isConnected || wrapper.parentElement !== frame) {
        uninject(wrapper);
        edges.delete(frame);
      }
    }
  }

  function renderFooter(messageId: string, bubble: Element, state: ChatMessageUiState, jobs: Record<string, GenerationJobSnapshot>, hasBlocks: boolean): void {
    const { target, position } = footerTarget(bubble);
    let wrapper = footers.get(messageId);
    if (wrapper && (!wrapper.isConnected || !target.contains(wrapper))) {
      uninject(wrapper);
      wrapper = undefined;
    }
    if (!wrapper) {
      wrapper = inject(target, position);
      footers.set(messageId, wrapper);
    }
    // state.job may be the last FINISHED job (kept until dismissed): only a busy state supplies a running job.
    const job = jobForMessage(jobs, state) ?? (state.busy ? state.job : undefined);
    if (job && pendingFooter.has(state.messageKey) && jobs[job.jobId]) pendingFooter.delete(state.messageKey);
    const pending = pendingFooter.has(state.messageKey);
    const busy = state.busy || !!job || pending;
    const showPlaceholder = busy && state.slots.length === 0 && !hasBlocks;
    render(
      <>
        {showPlaceholder ? <PendingPlaceholder job={job} count={job?.requestedCount ?? 1} /> : null}
        <ChatFooter state={state} job={job} pending={pending} onAction={(action) => void onFooterAction(messageId, action)} />
      </>,
      wrapper
    );
  }

  function renderEdge(block: BakedBlock, state: ChatMessageUiState | null, jobs: Record<string, GenerationJobSnapshot>): void {
    let wrapper = edges.get(block.frame);
    if (wrapper && wrapper.parentElement !== block.frame) {
      uninject(wrapper);
      edges.delete(block.frame);
      wrapper = undefined;
    }
    if (!wrapper) {
      wrapper = inject(block.frame, "beforeend");
      edges.set(block.frame, wrapper);
    }
    const slot = state?.slots.find((s) => s.slotId === block.attrs.slotId);
    const slotRegenerating = [...regenJobs.values()].includes(block.attrs.slotId);
    // Per-slot spinner: single-slot jobs carry their slotId (contract GenerationJobSnapshot.slotId); jobs without it fall
    // back to the slot's `regenerating` flag from chatDom.getMessageStates.
    const regenRunning = state
      ? regenerateJobsForMessage(jobs, state.messageKey).some((job) => (job.slotId ? job.slotId === block.attrs.slotId : !!slot?.regenerating))
      : false;
    const busy = busySlots.has(block.attrs.slotId) || slotRegenerating || regenRunning;
    const messageBusy = !!state && (state.busy || !!jobForMessage(jobs, state));
    const attrs = block.attrs;
    render(<EdgeControls attrs={attrs} slot={slot} busy={busy} messageBusy={messageBusy} onAction={(action) => void onEdgeAction(attrs.messageId, block, action)} />, wrapper);
  }

  /* ---------------- actions ---------------- */
  async function onFooterAction(messageId: string, action: FooterAction): Promise<void> {
    const state = states.get(messageId);
    if (!state || !chatId) {
      if (!chatId) runtime.notice({ tone: "warning", message: CHAT_ERROR_LABELS.noChat });
      return;
    }
    if (action === "generate") {
      if (state.busy || pendingFooter.has(state.messageKey)) return;
      pendingFooter.set(state.messageKey, Date.now());
      schedule(0);
      try {
        await app.call("generation.start", { chatId, messageId: state.messageId, swipeIndex: state.swipeIndex, attemptKind: state.attempt });
      } catch (error) {
        pendingFooter.delete(state.messageKey);
        chatError(CHAT_ERROR_LABELS.generateFailed, error);
        schedule(0);
      }
      return;
    }
    if (action === "cancel") {
      const job = jobForMessage(app.state.generationJobs, state) ?? (state.busy ? state.job : undefined);
      pendingFooter.delete(state.messageKey);
      try {
        await app.call("generation.cancel", job ? { jobId: job.jobId } : { chatId, messageKey: state.messageKey });
      } catch (error) {
        chatError(CHAT_ERROR_LABELS.cancelFailed, error);
      }
      schedule(0);
      return;
    }
    // revision pager (allowed while busy, AM 174142)
    const { index, count } = revisionPosition(state);
    if (count < 2) return;
    const target = state.revisions[pagerStep(index, count, action === "revision-next" ? "next" : "previous")];
    if (!target) return;
    states.set(messageId, { ...state, activeRevisionId: target.revisionId });
    schedule(0);
    try {
      await app.call("history.selectRevision", { chatId, messageKey: state.messageKey, revisionId: target.revisionId });
      void fetchStates([messageId]);
    } catch (error) {
      states.set(messageId, state);
      chatError(CHAT_ERROR_LABELS.revisionFailed, error);
      schedule(0);
    }
  }

  async function onEdgeAction(messageId: string, block: BakedBlock, action: EdgeAction): Promise<void> {
    const attrs = block.attrs;
    const targetChat = attrs.chatId || chatId;
    if (!targetChat) return;
    const state = states.get(messageId) ?? null;
    if (action === "regenerate") {
      if (busySlots.has(attrs.slotId)) return;
      busySlots.add(attrs.slotId);
      schedule(0);
      try {
        const { jobId } = await app.call("generation.regenerateSlot", { chatId: targetChat, messageKey: attrs.messageKey, slotId: attrs.slotId, ...(attrs.entryId ? { entryId: attrs.entryId } : {}) });
        regenJobs.set(jobId, attrs.slotId);
      } catch (error) {
        chatError(CHAT_ERROR_LABELS.regenerateFailed, error);
      } finally {
        busySlots.delete(attrs.slotId);
        schedule(0);
      }
      return;
    }
    const slot = state?.slots.find((s) => s.slotId === attrs.slotId);
    if (!slot || slot.entries.length < 2) return;
    const current = slot.entries.findIndex((entry) => entry.entryId === (attrs.entryId || slot.selectedEntryId));
    const next = slot.entries[pagerStep(Math.max(0, current), slot.entries.length, action === "history-next" ? "next" : "previous")];
    if (!next || busySlots.has(attrs.slotId)) return;
    busySlots.add(attrs.slotId);
    schedule(0);
    try {
      await app.call("history.selectEntry", { chatId: targetChat, slotId: attrs.slotId, entryId: next.entryId });
      await fetchStates([messageId]);
    } catch (error) {
      chatError(CHAT_ERROR_LABELS.historyFailed, error);
    } finally {
      busySlots.delete(attrs.slotId);
      schedule(0);
    }
  }

  async function onToastCommand(toast: Pick<RuntimeToastModel, "key" | "jobId" | "kind">, command: ToastCommand): Promise<void> {
    const jobId = toast.jobId;
    if (command === "dismiss") {
      runtime.dismiss(toast.key);
      if (jobId && toast.kind !== "notice") app.call("generation.dismiss", { jobId }).catch(() => undefined);
      return;
    }
    if (!jobId) return;
    try {
      if (command === "cancel") await app.call("generation.cancel", { jobId });
      else if (command === "retry") {
        runtime.dismiss(toast.key);
        await app.call("generation.retry", { jobId });
      } else if (command === "restart") {
        runtime.dismiss(toast.key);
        await app.call("generation.restart", { jobId });
      }
    } catch (error) {
      chatError(command === "cancel" ? CHAT_ERROR_LABELS.cancelFailed : CHAT_ERROR_LABELS.generateFailed, error);
    }
  }

  /* ---------------- zoom on image click ---------------- */
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const hit = findBakedImage(event);
    if (!hit) return;
    const targetChat = hit.attrs.chatId || chatId || options.getActiveChatId();
    if (!targetChat) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    options.openZoom({ chatId: targetChat, slotId: hit.attrs.slotId, entryId: hit.attrs.entryId || undefined, messageKey: hit.attrs.messageKey });
  };
  win.addEventListener("click", onClick, true);
  disposers.push(() => win.removeEventListener("click", onClick, true));

  /* ---------------- events ---------------- */
  const client = app.client;
  disposers.push(client.on("chatData.changed", ({ chatId: changed, messageKeys }) => {
    if (changed !== chatId) return;
    const ids = messageKeys.length ? [...new Set(messageKeys.map(messageIdOfHistoryKey))].filter((id) => states.has(id)) : [...states.keys()];
    void fetchStates(ids.length ? ids : [...states.keys()]);
  }));
  disposers.push(client.on("generation.progress", (job) => {
    runtime.trackJob(job);
    schedule();
  }));
  disposers.push(client.on("generation.finished", (payload) => {
    runtime.finish(payload, regenJobs.has(payload.jobId) ? "regenerate" : "initial");
    regenJobs.delete(payload.jobId);
    for (const [key] of pendingFooter) if (historyIdOfKey(key) === historyIdOfKey(payload.messageKey)) pendingFooter.delete(key);
    if (payload.result === "failed" && payload.error && (payload.error.detailCode === "NOVELAI_API_KEY_REQUIRED" || payload.error.code === "permission-denied")) {
      runtime.pushError({ id: `generation:${payload.jobId}`, jobId: payload.jobId, title: errorDialogTitle(payload.error, ERROR_DIALOG_LABELS), message: payload.error.message || ERROR_DIALOG_LABELS.requestIncomplete });
    }
    if (payload.chatId === chatId) {
      const id = messageIdOfHistoryKey(payload.messageKey);
      void fetchStates(states.has(id) ? [id] : [...states.keys()]);
    }
    schedule();
  }));
  disposers.push(client.on("error", ({ error, context }) => {
    recentErrors.set(error.message, Date.now());
    runtime.pushError({ id: `error:${error.detailCode ?? error.code}:${error.message}`.slice(0, 200), title: errorDialogTitle(error, ERROR_DIALOG_LABELS, context), message: error.message || ERROR_DIALOG_LABELS.defaultMessage });
  }));
  disposers.push(app.onNotice((notice) => {
    if (runtime.overlayOpen || isOverlayOpen()) return;
    const recent = [...recentErrors.entries()].some(([message, at]) => Date.now() - at < 2000 && notice.message.includes(message));
    if (recent) return;
    runtime.notice({ tone: notice.tone, message: notice.message, key: notice.key });
  }));
  // Live image width (AM `wbt`): baked blocks read `--ii-am-chat-image-width`; set it only after the width
  // setting changes in this session (blocks baked earlier carry the old percent inline).
  let widthPercent = app.state.config?.runtime.chatImageWidthPercent ?? null;
  let removeWidthStyle: (() => void) | null = null;
  const syncWidth = () => {
    const next = app.state.config?.runtime.chatImageWidthPercent ?? null;
    if (next === null || next === widthPercent) return;
    const changed = widthPercent !== null;
    widthPercent = next;
    if (!changed) return;
    removeWidthStyle?.();
    removeWidthStyle = ctx.dom.addStyle(`[${"data-inlay-illustrator"}="true"]{${CHAT_IMAGE_WIDTH_VAR}:${Math.min(100, Math.max(30, Math.round(next)))}%}`);
  };
  disposers.push(() => removeWidthStyle?.());
  let lastJobs = app.state.generationJobs;
  let lastSettings = app.state.chatImageGeneration;
  disposers.push(app.store.subscribe(() => {
    syncWidth();
    const s = app.state;
    if (s.generationJobs !== lastJobs || s.chatImageGeneration !== lastSettings) {
      lastJobs = s.generationJobs;
      lastSettings = s.chatImageGeneration;
      schedule();
    }
  }));

  const hostEvents = ctx.events as unknown as { on?: (name: string, handler: (payload: unknown) => void) => () => void } | undefined;
  const onHost = (name: string, handler: (payload: unknown) => void) => {
    try {
      const off = hostEvents?.on?.(name, handler);
      if (typeof off === "function") disposers.push(off);
    } catch {
      // optional host event
    }
  };
  onHost("CHAT_SWITCHED", () => schedule(0));
  for (const name of ["MESSAGE_SWIPED", "MESSAGE_EDITED", "MESSAGE_DELETED", "SWIPE_EDITED", "CHARACTER_MESSAGE_RENDERED"]) {
    onHost(name, (payload) => {
      const id = payloadMessageId(payload);
      if (id && states.has(id)) void fetchStates([id]);
      else schedule();
    });
  }
  for (const name of ["GENERATION_ENDED", "MESSAGE_SENT", "GENERATION_STOPPED"]) {
    onHost(name, () => {
      // A finished reply may become eligible; drop "no footer" answers so they are asked again.
      for (const [id, state] of states) if (state === null) states.delete(id);
      schedule(150);
    });
  }

  const ObserverCtor = (win as unknown as { MutationObserver?: typeof MutationObserver }).MutationObserver;
  if (ObserverCtor) {
    const observer = new ObserverCtor((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target as Element;
        const own = typeof target.closest === "function" ? target.closest(`[${WRAPPER_ATTR}]`) : null;
        if (!own) {
          schedule();
          return;
        }
      }
    });
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state", "data-part", "data-message-id"] });
    disposers.push(() => observer.disconnect());
  }

  schedule(0);

  return {
    runtime,
    refresh: () => fetchStates([...new Set([...states.keys(), ...listBubbles().map((b) => b.messageId)])]),
    reconcileNow: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      reconcile();
    },
    stateOf: (messageId) => states.get(messageId),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (timer) clearTimeout(timer);
      for (const dispose of disposers.splice(0).reverse()) {
        try {
          dispose();
        } catch {
          // ignore
        }
      }
      for (const wrapper of footers.values()) uninject(wrapper);
      for (const wrapper of edges.values()) uninject(wrapper);
      footers.clear();
      edges.clear();
      render(null, hostRoot);
      hostRoot.remove();
    }
  };
}
