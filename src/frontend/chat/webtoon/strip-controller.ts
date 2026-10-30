/**
 * Webtoon strips in the chat (experimental webtoon mode): one injected strip per message swipe that has a strip
 * (`ChatMessageUiState.webtoon`), refetched (`webtoon.get`) when its revision changes, so panels appear as they finish.
 * The strip is laid out for the width it is shown at (`stripLayoutWidth`) and fetched again, debounced, when that changes.
 * Reroll a panel (`webtoon.rerollPanel`, a regenerate job with slot id `webtoon:<panelId>`), switch a panel between its
 * takes (`webtoon.selectTake`) or edit a text item (`webtoon.editText`, inline editor).
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { ChatMessageUiState } from "../../../shared/contract/chat-dom.js";
import type { GenerationJobSnapshot } from "../../../shared/contract/rpc.js";
import { mangaLayoutWidth, STRIP_WIDTH, stripLayoutWidth, type WebtoonStripView } from "../../../shared/contract/webtoon.js";
import type { AppController } from "../../state/app-state.js";
import { historyIdOfKey, jobForMessage } from "../dom.js";
import { WEBTOON_LABELS } from "../labels.js";
import { renderStrip, setStripScale } from "./strip-dom.js";

const WRAPPER_ATTR = "data-ii-chat-wrapper";
/** Wait for the resize to settle before laying the strip out again. */
const RELAYOUT_DELAY_MS = 250;
/** A failed `webtoon.get` is retried after 1 s, 2 s, 4 s … up to this. */
const RETRY_MAX_MS = 30_000;

interface StripEntry {
  messageKey: string;
  /** Manga pages: whole pages when the frame is wide enough (`mangaLayoutWidth`), else one panel per line. */
  manga: boolean;
  wrapper: Element;
  frame: HTMLElement;
  view: WebtoonStripView | null;
  fetched: number;
  fetching: boolean;
  /** Failed `webtoon.get` calls in a row; the next one waits until `retryAt`. */
  failures: number;
  retryAt: number;
  retryTimer?: ReturnType<typeof setTimeout>;
  signature: string;
  editing: string | null;
  resize?: ResizeObserver;
  relayoutTimer?: ReturnType<typeof setTimeout>;
}

export interface WebtoonStrips {
  /** Called from the chat reconcile with the visible bubbles and their states. */
  sync(chatId: string, bubbles: ReadonlyArray<{ messageId: string; element: Element; state: ChatMessageUiState | null }>, jobs: Record<string, GenerationJobSnapshot>): void;
  destroy(): void;
}

export function createWebtoonStrips(ctx: SpindleFrontendContext, app: AppController, options: { doc: Document; notice: (title: string, error: unknown) => void; schedule: () => void }): WebtoonStrips {
  const doc = options.doc;
  const entries = new Map<string, StripEntry>();
  let chatId = "";

  const busyPanels = (jobs: Record<string, GenerationJobSnapshot>, messageKey: string) =>
    new Set(
      Object.values(jobs)
        .filter((j) => (j.status === "queued" || j.status === "running") && j.slotId?.startsWith("webtoon:") && historyIdOfKey(j.messageKey) === historyIdOfKey(messageKey))
        .map((j) => j.slotId!.slice("webtoon:".length)),
    );

  function remove(id: string): void {
    const entry = entries.get(id);
    if (!entry) return;
    entry.resize?.disconnect();
    clearTimeout(entry.relayoutTimer);
    clearTimeout(entry.retryTimer);
    try {
      ctx.dom.uninject(entry.wrapper);
    } catch {
      entry.wrapper.remove();
    }
    entries.delete(id);
  }

  const layoutWidth = (entry: StripEntry) => (entry.manga ? mangaLayoutWidth : stripLayoutWidth)(entry.frame.clientWidth || STRIP_WIDTH);
  /** The shown layout is for another width (a resize while it was fetched). */
  const staleWidth = (entry: StripEntry) => !!entry.view?.layout && entry.view.layout.width !== layoutWidth(entry);

  async function fetchStrip(entry: StripEntry, revision: number): Promise<void> {
    if (entry.fetching) return;
    entry.fetching = true;
    const forChat = chatId;
    let again = false;
    try {
      const { strip } = await app.call("webtoon.get", { chatId: forChat, messageKey: entry.messageKey, width: layoutWidth(entry) });
      if (forChat !== chatId) return;
      entry.view = strip;
      entry.fetched = Math.max(revision, strip?.revision ?? revision);
      entry.failures = 0;
      entry.retryAt = 0;
      entry.signature = "";
      again = staleWidth(entry);
    } catch (error) {
      // Not fetched: `sync` asks again once the backoff has passed (the timer reconciles even if nothing else does).
      entry.failures += 1;
      const delay = Math.min(RETRY_MAX_MS, 1_000 * 2 ** (entry.failures - 1));
      entry.retryAt = Date.now() + delay;
      clearTimeout(entry.retryTimer);
      entry.retryTimer = setTimeout(options.schedule, delay);
      console.warn("[Inlay Illustrator] webtoon.get failed:", error);
    } finally {
      entry.fetching = false;
      if (again) void fetchStrip(entry, entry.fetched);
      options.schedule();
    }
  }

  /** Apply a strip returned by a change (text edit, take switch). */
  function showStrip(entry: StripEntry, strip: WebtoonStripView): void {
    entry.view = strip;
    entry.fetched = strip.revision;
    entry.signature = "";
    options.schedule();
  }

  function openEditor(entry: StripEntry, canvas: HTMLElement, item: { panelId: string; textIndex: number; text: string }): void {
    entry.frame.querySelector(".ii-wt-editor")?.remove();
    const key = `${item.panelId}:${item.textIndex}`;
    const target = canvas.querySelector(`[data-ii-wt-text="${key}"]`) as HTMLElement | null;
    const width = entry.view?.layout?.width ?? STRIP_WIDTH;
    const scale = (entry.frame.clientWidth || width) / width;
    const top = target ? (parseFloat(target.style.top) || 0) * scale : 0;
    const editor = doc.createElement("form");
    editor.className = "ii-wt-editor";
    editor.style.top = `${Math.max(0, top)}px`;
    const area = doc.createElement("textarea");
    area.value = item.text;
    area.rows = 3;
    area.setAttribute("aria-label", WEBTOON_LABELS.editText);
    const save = Object.assign(doc.createElement("button"), { type: "submit", textContent: WEBTOON_LABELS.save });
    const cancel = Object.assign(doc.createElement("button"), { type: "button", textContent: WEBTOON_LABELS.cancel });
    const close = () => {
      editor.remove();
      entry.editing = null;
    };
    cancel.addEventListener("click", close);
    editor.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        editor.requestSubmit();
      }
    });
    editor.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = area.value.trim();
      if (!text || text === item.text) return close();
      save.disabled = true;
      app
        .call("webtoon.editText", { chatId, messageKey: entry.messageKey, panelId: item.panelId, textIndex: item.textIndex, text, width: layoutWidth(entry) })
        .then(({ strip }) => {
          close();
          showStrip(entry, strip);
        })
        .catch((error) => {
          save.disabled = false;
          options.notice(WEBTOON_LABELS.editFailed, error);
        });
    });
    const buttons = doc.createElement("div");
    buttons.className = "ii-wt-editor__buttons";
    buttons.append(cancel, save);
    editor.append(area, buttons);
    entry.frame.appendChild(editor);
    entry.editing = key;
    area.focus();
    area.select();
  }

  function render(entry: StripEntry, jobs: Record<string, GenerationJobSnapshot>, state: ChatMessageUiState): void {
    const view = entry.view;
    const busy = busyPanels(jobs, entry.messageKey);
    const stripBusy = !!jobForMessage(jobs, state) || state.busy;
    const signature = JSON.stringify([view?.revision ?? -1, view?.layout?.width, [...busy].sort(), stripBusy]);
    if (signature === entry.signature) return;
    entry.signature = signature;
    const editor = entry.frame.querySelector(".ii-wt-editor");
    entry.frame.replaceChildren();
    entry.frame.setAttribute("data-ii-wt-status", view?.status ?? "planning");
    const canvas = view
      ? renderStrip(doc, view, {
          onReroll: (panelId) => {
            app.call("webtoon.rerollPanel", { chatId, messageKey: entry.messageKey, panelId }).then(options.schedule, (error) => options.notice(WEBTOON_LABELS.rerollFailed, error));
          },
          onSelectTake: (panelId, take) => {
            app.call("webtoon.selectTake", { chatId, messageKey: entry.messageKey, panelId, take, width: layoutWidth(entry) }).then(
              ({ strip }) => showStrip(entry, strip),
              (error) => options.notice(WEBTOON_LABELS.takeFailed, error),
            );
          },
          onEditText: (item) => openEditor(entry, canvas!, item),
        }, { busyPanels: busy, stripBusy, labels: { ...WEBTOON_LABELS, failed: WEBTOON_LABELS.panelFailed } })
      : null;
    if (!canvas || !view?.layout) {
      entry.frame.style.removeProperty("aspect-ratio");
      const note = doc.createElement("div");
      note.className = "ii-wt-note";
      note.textContent = view?.status === "error" ? `${WEBTOON_LABELS.failed}${view.error ? `: ${view.error}` : ""}` : view?.status === "cancelled" ? WEBTOON_LABELS.cancelled : WEBTOON_LABELS.planning;
      entry.frame.appendChild(note);
      return;
    }
    entry.frame.style.setProperty("aspect-ratio", `${view.layout.width} / ${view.layout.height}`);
    entry.frame.appendChild(canvas);
    if (editor) entry.frame.appendChild(editor);
    setStripScale(entry.frame, canvas, view.layout.width);
  }

  return {
    sync(nextChat, bubbles, jobs) {
      if (nextChat !== chatId) {
        for (const id of [...entries.keys()]) remove(id);
        chatId = nextChat;
      }
      const live = new Set<string>();
      for (const { messageId, element, state } of bubbles) {
        if (!state?.webtoon) continue;
        const target = element.querySelector('[data-spindle-mount="message_body_after"]') ?? element;
        let entry = entries.get(messageId);
        if (entry && (entry.messageKey !== state.messageKey || !entry.wrapper.isConnected || !target.contains(entry.wrapper))) {
          remove(messageId);
          entry = undefined;
        }
        if (!entry) {
          const wrapper = ctx.dom.inject(target, "", "beforeend");
          wrapper.setAttribute(WRAPPER_ATTR, "webtoon");
          const frame = doc.createElement("div");
          frame.className = "ii-wt-strip";
          wrapper.appendChild(frame);
          entry = { messageKey: state.messageKey, manga: false, wrapper, frame, view: null, fetched: -1, fetching: false, failures: 0, retryAt: 0, signature: "", editing: null };
          const Observer = (doc.defaultView as unknown as { ResizeObserver?: typeof ResizeObserver } | null)?.ResizeObserver;
          if (Observer) {
            const e = entry;
            e.resize = new Observer(() => {
              const canvas = e.frame.querySelector(".ii-wt-canvas") as HTMLElement | null;
              if (canvas && e.view?.layout) setStripScale(e.frame, canvas, e.view.layout.width);
              clearTimeout(e.relayoutTimer);
              e.relayoutTimer = setTimeout(() => {
                if (staleWidth(e)) void fetchStrip(e, e.fetched);
              }, RELAYOUT_DELAY_MS);
            });
            e.resize.observe(frame);
          }
          entries.set(messageId, entry);
        }
        live.add(messageId);
        entry.manga = state.webtoon.format === "manga";
        if (entry.fetched < state.webtoon.revision && Date.now() >= entry.retryAt) void fetchStrip(entry, state.webtoon.revision);
        render(entry, jobs, state);
      }
      for (const id of [...entries.keys()]) if (!live.has(id)) remove(id);
    },
    destroy() {
      for (const id of [...entries.keys()]) remove(id);
    },
  };
}
