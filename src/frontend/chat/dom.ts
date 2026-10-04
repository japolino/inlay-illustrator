/**
 * Chat DOM lookups (Lumiverse message bubbles, our baked illustration blocks). Read-only: the chat side
 * never edits message content; it only injects its own wrappers with ctx.dom.inject.
 * Host facts (Lumiverse frontend): bubbles carry `data-message-id` (the virtualized row carries it too),
 * `data-part="character|user|streaming"`, and empty `[data-spindle-mount="message_footer"]` slots.
 */
import { ILLUSTRATION_ATTR, readIllustrationAttributes, type ChatMessageUiState, type IllustrationAttributes } from "../../shared/contract/chat-dom.js";
import type { GenerationJobSnapshot } from "../../shared/contract/rpc.js";

export const MESSAGE_ID_ATTR = "data-message-id";
export const BLOCK_SELECTOR = `[${ILLUSTRATION_ATTR.block}="true"]`;
export const FRAME_SELECTOR = ".inlay-illustrator-frame";
export const BLOCK_IMAGE_SELECTOR = `${BLOCK_SELECTOR} img`;

export interface MessageElementLike { messageId: string; element: Element }

/**
 * One element per message id: the innermost element carrying the id (the bubble, not the virtualized row).
 * Order follows the input (document order).
 */
export function uniqueBubbles(list: readonly MessageElementLike[]): MessageElementLike[] {
  const byId = new Map<string, MessageElementLike>();
  for (const item of list) {
    if (!item.messageId || !item.element) continue;
    const current = byId.get(item.messageId);
    if (!current || current.element.contains(item.element)) byId.set(item.messageId, item);
  }
  return [...byId.values()];
}

/** Where the footer goes: the host's message-footer mount slot, else the bubble end. */
export function footerTarget(bubble: Element): { target: Element; position: InsertPosition } {
  const mount = bubble.querySelector('[data-spindle-mount="message_footer"]') ?? bubble.querySelector('[data-spindle-mount="message_body_after"]');
  return mount ? { target: mount, position: "beforeend" } : { target: bubble, position: "beforeend" };
}

export function isStreamingBubble(bubble: Element): boolean {
  return bubble.getAttribute("data-part") === "streaming" || !!bubble.closest('[data-part="streaming"]');
}

export interface BakedBlock { block: Element; frame: Element; image: HTMLImageElement | null; attrs: IllustrationAttributes }

/** Baked illustration blocks inside an element (document order). */
export function bakedBlocks(root: ParentNode): BakedBlock[] {
  const out: BakedBlock[] = [];
  root.querySelectorAll(BLOCK_SELECTOR).forEach((block) => {
    const attrs = readIllustrationAttributes((name) => block.getAttribute(name));
    if (!attrs) return;
    const frame = block.querySelector(FRAME_SELECTOR) ?? block;
    out.push({ block, frame, image: block.querySelector("img"), attrs });
  });
  return out;
}

/** The baked image clicked (composedPath first, for shadow roots), or null. */
export function findBakedImage(event: Event): { image: HTMLImageElement; attrs: IllustrationAttributes } | null {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const candidates = [...path, event.target];
  for (const target of candidates) {
    const el = target as Element | null;
    if (!el || typeof (el as Element).closest !== "function") continue;
    if (el.closest('[data-ii-action], .ii-am-chat-edge button')) return null;
    const image = el.closest(BLOCK_IMAGE_SELECTOR) as HTMLImageElement | null;
    if (!image) continue;
    const block = image.closest(BLOCK_SELECTOR);
    const attrs = block ? readIllustrationAttributes((name) => block.getAttribute(name)) : null;
    if (attrs) return { image, attrs };
  }
  return null;
}

/** `illustration:<id>@<swipe>` -> `<id>@<swipe>` (also accepts the bare form). */
export function historyIdOfKey(messageKey: string): string {
  const i = messageKey.indexOf(":");
  return i >= 0 && /^(?:illustration|chat)$/u.test(messageKey.slice(0, i)) ? messageKey.slice(i + 1) : messageKey;
}

/** Running job of a message (matches `illustration:`/`chat:` prefixed or bare history ids). */
export function jobForMessage(jobs: Record<string, GenerationJobSnapshot>, state: Pick<ChatMessageUiState, "chatId" | "messageKey">): GenerationJobSnapshot | undefined {
  const id = historyIdOfKey(state.messageKey);
  let found: GenerationJobSnapshot | undefined;
  for (const job of Object.values(jobs)) {
    if (job.chatId && state.chatId && job.chatId !== state.chatId) continue;
    if (job.status !== "queued" && job.status !== "running") continue;
    if (job.messageKey === state.messageKey || historyIdOfKey(job.messageKey) === id) {
      if (job.attemptKind === "regenerate") continue;
      found = job;
    }
  }
  return found;
}

/** Running single-slot regeneration jobs of a message (slot ids are not on the snapshot: any regenerate job). */
export function regenerateJobsForMessage(jobs: Record<string, GenerationJobSnapshot>, messageKey: string): GenerationJobSnapshot[] {
  const id = historyIdOfKey(messageKey);
  return Object.values(jobs).filter((job) => job.attemptKind === "regenerate" && (job.status === "queued" || job.status === "running") && historyIdOfKey(job.messageKey) === id);
}
