/** Preview scenes of the chat area (chat-side UI + zoom viewer). Each scene draws the preview chat first. */
import { renderChatFixture } from "../chat-fixture.js";
import { mockChat } from "../mock/chat.js";
import type { PreviewScene } from "../scenes.js";
import { clickWhenReady, waitFor } from "../scenes.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Shows the hover-only edge controls (screenshots cannot hover). */
function forceEdges(doc: Document): void {
  const style = doc.createElement("style");
  style.textContent = ".inlay-illustrator-frame .ii-am-root.ii-am-chat-edge{opacity:1!important}";
  doc.head.appendChild(style);
}

const chat: PreviewScene = async ({ doc, mock }) => {
  renderChatFixture(doc, mock);
  await waitFor(doc, ".ii-am-chat-footer");
};

async function openZoom(input: Parameters<PreviewScene>[0], slotIndex = 0): Promise<void> {
  const { doc, mock, frontend } = input;
  renderChatFixture(doc, mock);
  const data = mockChat(mock.db);
  const message = data.messages.find((m) => m.messageId === "msg-2")!;
  const revision = message.revisions.find((r) => r.revisionId === message.activeRevisionId)!;
  const slot = revision.slots[slotIndex]!;
  frontend.zoom.open({ chatId: data.chatId, slotId: slot.slotId, entryId: slot.selectedEntryId, messageKey: `illustration:${message.messageId}@0` });
  await waitFor(doc, "[data-ii-zoom-stage] img");
}

export const CHAT_SCENES: Record<string, PreviewScene> = {
  chat: async (input) => {
    await chat(input);
    forceEdges(input.doc);
  },
  "chat-busy": async (input) => {
    const { doc, mock } = input;
    mockChat(mock.db).holdJobs = true;
    await chat(input);
    forceEdges(doc);
    await clickWhenReady(doc, '[data-message-id="msg-4"] .ii-am-chat-footer__generate');
    await sleep(600);
    await clickWhenReady(doc, '[data-message-id="msg-2"] .ii-am-chat-edge__regenerate');
    await sleep(2200);
  },
  "chat-count": async (input) => {
    const { doc } = input;
    await chat(input);
    await clickWhenReady(doc, ".ii-am-chat-count__toggle");
    await sleep(100);
    await clickWhenReady(doc, ".ii-am-chat-count__mode .ii-am-chat-count__option");
  },
  "chat-count-range": async (input) => {
    const { doc, mock } = input;
    mock.db.chatImageGeneration = { ...mock.db.chatImageGeneration, countPolicy: { mode: "range", min: 2, max: 4, values: { fixed: 1, min: 2, max: 4 } } };
    await chat(input);
    await clickWhenReady(doc, ".ii-am-chat-count__toggle");
  },
  "chat-toasts": async (input) => {
    const { doc, mock } = input;
    const data = mockChat(mock.db);
    data.holdJobs = true;
    await chat(input);
    await clickWhenReady(doc, '[data-message-id="msg-4"] .ii-am-chat-footer__generate');
    await sleep(2600);
    mock.emit("generation.finished", { jobId: "job-old-1", chatId: data.chatId, messageKey: "illustration:msg-5@0", result: "failed", error: { code: "provider-error", message: "NovelAI returned HTTP 429 (Too Many Requests) for image 2 of 2.", retryable: true } });
    mock.emit("generation.finished", { jobId: "job-old-2", chatId: data.chatId, messageKey: "illustration:msg-2@0", result: "completed" });
    mock.emit("notice", { tone: "success", message: "Slot deleted · registrations cleaned 3 · kept (shared) 0 · kept (unverifiable) 0 · cleanup failed 0" });
    await sleep(300);
    (doc.querySelector('.ii-am-chat-toast[data-ii-tone="danger"] .ii-am-chat-toast__error-toggle') as HTMLElement | null)?.click();
  },
  "chat-error": async (input) => {
    const { mock } = input;
    await chat(input);
    mock.emit("error", { error: { code: "provider-error", message: "NovelAI image generation failed: HTTP 402 Payment Required\n{\"statusCode\":402,\"message\":\"An active subscription is required to access this endpoint.\"}", detailCode: "NOVELAI_IMAGE_REQUEST_FAILED" }, context: "NovelAI image generation failed" });
  },
  zoom: async (input) => {
    await openZoom(input);
  },
  "zoom-info": async (input) => {
    await openZoom(input);
    await clickWhenReady(input.doc, "[data-ii-zoom-info-toggle]");
  },
  "zoom-edit": async (input) => {
    await openZoom(input);
    await clickWhenReady(input.doc, "[data-ii-zoom-info-toggle]");
    await clickWhenReady(input.doc, "[data-ii-zoom-edit-prompts]");
  },
  "zoom-coordinates": async (input) => {
    await openZoom(input);
    await clickWhenReady(input.doc, "[data-ii-zoom-info-toggle]");
    await clickWhenReady(input.doc, "[data-ii-zoom-coordinate-button]");
  },
  "zoom-ai": async (input) => {
    await openZoom(input);
    await clickWhenReady(input.doc, "[data-ii-zoom-info-toggle]");
    await clickWhenReady(input.doc, "[data-ii-zoom-ai-toggle]");
  },
  "zoom-mention": async (input) => {
    const { doc } = input;
    await openZoom(input);
    await clickWhenReady(doc, "[data-ii-zoom-info-toggle]");
    await clickWhenReady(doc, "[data-ii-zoom-ai-toggle]");
    const area = await waitFor<HTMLTextAreaElement>(doc, "[data-ii-zoom-ai-instruction]");
    area.focus();
    area.value = "make $ㅅ";
    area.setSelectionRange(area.value.length, area.value.length);
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(doc, "[data-ii-zoom-mentions]");
  },
  "zoom-delete-slot": async (input) => {
    await openZoom(input);
    await clickWhenReady(input.doc, "[data-ii-zoom-delete-slot]");
  },
  "zoom-state": async (input) => {
    await openZoom(input);
    await clickWhenReady(input.doc, "[data-ii-zoom-state-toggle]");
  },
  "zoom-mobile-panel": async (input) => {
    await openZoom(input);
    await clickWhenReady(input.doc, '[data-ii-zoom-dock] [data-ii-zoom-panel="info"]');
  }
};
