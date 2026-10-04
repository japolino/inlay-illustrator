/**
 * Preview chat DOM: draws a few Lumiverse-like chat messages (bubbles with `data-message-id`, `data-part`,
 * content and `[data-spindle-mount]` slots) with baked illustration blocks into `#ii-preview-chat`, from the
 * dev mock chat (./mock/chat.ts). On `chatData.changed` it re-renders the affected message content, like the
 * host does after the backend re-bakes a message.
 */
import { renderIllustrationBlock } from "../../shared/contract/chat-dom.js";
import type { RpcEventEnvelope } from "../../shared/contract/rpc.js";
import type { MockBackend } from "./mock-backend.js";
import { activeRevision, messageKeyOf, mockChat, type MockChatMessage } from "./mock/chat.js";

const FIXTURE_CSS = `
#ii-preview-chat { box-sizing: border-box; max-width: 780px; margin: 0 auto; padding: 24px 16px 140px 16px; display: grid; gap: 14px; }
@media (min-width: 1100px) { #ii-preview-chat { margin-left: max(330px, calc(50vw - 390px)); } }
#ii-preview-chat [data-component="BubbleMessage"] { border-radius: 14px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.06); padding: 12px 14px; }
#ii-preview-chat [data-part="user"] { background: rgba(201,164,92,.08); margin-left: 12%; }
#ii-preview-chat .fx-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 13px; font-weight: 700; }
#ii-preview-chat .fx-avatar { width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; background: #3a2c33; color: #f1e5cf; font-size: 12px; }
#ii-preview-chat .fx-content p { margin: 0 0 10px; line-height: 1.6; font-size: 14px; color: #e9e1d2; }
`;

export interface ChatFixture {
  container: HTMLElement;
  rerender(messageId?: string): void;
  destroy(): void;
}

function contentHtml(chatId: string, message: MockChatMessage, widthPercent: number): string {
  const revision = activeRevision(message);
  const blocks = new Map<number, string[]>();
  let imageIndex = 0;
  for (const slot of revision?.slots ?? []) {
    const index = slot.entries.findIndex((e) => e.entryId === slot.selectedEntryId);
    const entry = slot.entries[index >= 0 ? index : slot.entries.length - 1];
    if (!entry) continue;
    const html = renderIllustrationBlock({
      chatId,
      messageId: message.messageId,
      swipeId: message.swipeIndex,
      messageKey: messageKeyOf(message),
      revisionId: revision!.revisionId,
      slotId: slot.slotId,
      slotIndex: slot.slotIndex,
      entryId: entry.entryId,
      assetName: entry.assetName,
      imageId: entry.imageId,
      url: entry.url,
      width: entry.width,
      height: entry.height,
      entryIndex: (index >= 0 ? index : slot.entries.length - 1) + 1,
      entryCount: slot.entries.length,
      canRegenerate: revision!.revisionId === message.activeRevisionId,
      imageIndex: imageIndex++,
      widthPercent
    });
    const at = Math.min(slot.slotIndex, Math.max(0, message.paragraphs.length - 1));
    blocks.set(at, [...(blocks.get(at) ?? []), html]);
  }
  return message.paragraphs.map((p, i) => `<p>${p.replace(/[<&>]/gu, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;" })[c]!)}</p>${(blocks.get(i) ?? []).join("")}`).join("");
}

const fixtures = new WeakMap<Document, ChatFixture>();

/** Draws the preview chat once per document (idempotent: later calls return the same fixture). */
export function renderChatFixture(doc: Document, mock: MockBackend): ChatFixture {
  const existing = fixtures.get(doc);
  if (existing) return existing;
  const container = doc.getElementById("ii-preview-chat") ?? doc.body.appendChild(Object.assign(doc.createElement("div"), { id: "ii-preview-chat" }));
  const style = doc.createElement("style");
  style.textContent = FIXTURE_CSS;
  doc.head.appendChild(style);
  const chat = mockChat(mock.db);
  // Narrower than the 70 % default so a whole conversation fits a screenshot.
  const width = () => Math.min(mock.db.config.runtime.chatImageWidthPercent, 36);

  const bubbles = new Map<string, HTMLElement>();
  for (const message of chat.messages) {
    const card = doc.createElement("div");
    card.setAttribute("data-message-id", message.messageId);
    card.setAttribute("data-component", "BubbleMessage");
    card.setAttribute("data-part", message.role === "user" ? "user" : "character");
    card.innerHTML =
      `<div class="fx-bubble"><div class="fx-header"><span class="fx-avatar">${message.name.slice(0, 1)}</span><span>${message.name}</span></div>` +
      `<div class="fx-content"></div>` +
      `<span data-spindle-mount="message_body_after" style="display:contents"></span>` +
      `<span data-spindle-mount="message_footer" style="display:contents"></span></div>`;
    container.appendChild(card);
    bubbles.set(message.messageId, card);
  }

  const rerender = (messageId?: string) => {
    for (const message of chat.messages) {
      if (messageId && message.messageId !== messageId) continue;
      const content = bubbles.get(message.messageId)?.querySelector(".fx-content");
      if (content) content.innerHTML = contentHtml(chat.chatId, message, width());
    }
  };
  rerender();

  const unsubscribe = mock.transport.subscribe((raw) => {
    const envelope = raw as RpcEventEnvelope;
    if (envelope?.kind !== "event" || envelope.event !== "chatData.changed") return;
    const payload = envelope.payload as { chatId: string; messageKeys: string[] };
    if (payload.chatId !== chat.chatId) return;
    // The host re-renders the message after the backend re-bakes it.
    for (const message of chat.messages) {
      if (payload.messageKeys.length === 0 || payload.messageKeys.includes(messageKeyOf(message))) rerender(message.messageId);
    }
  });

  const fixture: ChatFixture = {
    container,
    rerender,
    destroy() {
      fixtures.delete(doc);
      unsubscribe();
      style.remove();
      for (const bubble of bubbles.values()) bubble.remove();
    }
  };
  fixtures.set(doc, fixture);
  return fixture;
}
