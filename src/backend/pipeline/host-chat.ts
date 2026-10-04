/**
 * Lumiverse chat access for the pipeline: message views with swipes, swipe content read/write, and a tracker of host
 * generations in progress (Lumiverse has no `chat.isStreaming`; AM 172542 / 173589 waited while the chat streamed).
 * Host access only through the injected `SpindleHost`.
 */
import { toHistoryMessageId } from "../../shared/contract/index.js";
import type { SpindleHost } from "../services/types.js";

export interface ChatMessageView {
  id: string;
  index: number;
  role: "system" | "user" | "assistant";
  isUser: boolean;
  /** Speaker name (group chats: the member character's name). */
  name: string;
  swipeId: number;
  swipes: string[];
  /** Active swipe content. */
  content: string;
  extra: Record<string, unknown>;
}

type RawMessage = {
  id?: unknown;
  index_in_chat?: unknown;
  role?: unknown;
  is_user?: unknown;
  name?: unknown;
  swipe_id?: unknown;
  swipes?: unknown;
  content?: unknown;
  extra?: unknown;
};

export function toMessageView(raw: RawMessage, fallbackIndex: number): ChatMessageView | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) return null;
  const isUser = raw.is_user === true;
  const role = raw.role === "system" || raw.role === "user" || raw.role === "assistant" ? raw.role : isUser ? "user" : "assistant";
  const content = typeof raw.content === "string" ? raw.content : "";
  const swipes = Array.isArray(raw.swipes) && raw.swipes.length ? raw.swipes.map((s) => (typeof s === "string" ? s : "")) : [content];
  const swipeId = Number.isSafeInteger(raw.swipe_id) && (raw.swipe_id as number) >= 0 && (raw.swipe_id as number) < swipes.length ? (raw.swipe_id as number) : 0;
  return {
    id,
    index: Number.isSafeInteger(raw.index_in_chat) ? (raw.index_in_chat as number) : fallbackIndex,
    role,
    isUser,
    name: typeof raw.name === "string" ? raw.name : "",
    swipeId,
    swipes,
    content,
    extra: raw.extra && typeof raw.extra === "object" && !Array.isArray(raw.extra) ? (raw.extra as Record<string, unknown>) : {},
  };
}

export async function loadMessages(host: SpindleHost, chatId: string): Promise<ChatMessageView[]> {
  const raw = (await host.chat.getMessages(chatId)) as unknown as RawMessage[];
  return (Array.isArray(raw) ? raw : []).flatMap((m, i) => {
    const v = toMessageView(m, i);
    return v ? [v] : [];
  });
}

/** Content of one swipe (active swipe: `content`, which mirrors `swipes[swipe_id]`). null when the swipe does not exist. */
export function swipeContent(view: ChatMessageView, swipeIndex: number): string | null {
  if (swipeIndex === view.swipeId) return view.content;
  return swipeIndex >= 0 && swipeIndex < view.swipes.length ? view.swipes[swipeIndex]! : null;
}

/** AM footer eligibility (`Th` 22258 + non-empty text): assistant message (not system) with text. */
export function isIllustratableMessage(view: ChatMessageView | undefined, swipeIndex = view?.swipeId ?? 0): boolean {
  if (!view || view.role !== "assistant" || view.isUser) return false;
  const text = swipeContent(view, swipeIndex);
  return !!text && !!text.trim();
}

/** History ids of the active swipes of all messages, in chat order (continuity "live message ids", AM `O1t`). */
export function liveHistoryIds(messages: readonly ChatMessageView[]): string[] {
  return messages.map((m) => toHistoryMessageId(m.id, m.swipeId));
}

/**
 * Write the content of one swipe: the active swipe through `content`; another swipe through the whole `swipes` array
 * (the active content is re-derived from `swipes[swipe_id]`, so it does not change). `skipChunkRebuild` keeps the
 * host's memory chunks (display-only rewrite).
 */
export async function writeSwipeContent(host: SpindleHost, chatId: string, view: ChatMessageView, swipeIndex: number, content: string): Promise<void> {
  if (swipeIndex === view.swipeId) {
    await host.chat.updateMessage(chatId, view.id, { content, skipChunkRebuild: true });
    return;
  }
  const swipes = [...view.swipes];
  swipes[swipeIndex] = content;
  await host.chat.updateMessage(chatId, view.id, { swipes, skipChunkRebuild: true });
}

/**
 * Host generations in progress per chat (GENERATION_STARTED / ENDED / STOPPED). A generation with a `targetMessageId`
 * (swipe, regenerate, continue) rewrites that message: publishing into it waits (AM "streaming" retries).
 */
export class HostGenerationTracker {
  private readonly active = new Map<string, Map<string, string>>();

  started(payload: { generationId?: unknown; chatId?: unknown; targetMessageId?: unknown }): void {
    const chatId = typeof payload.chatId === "string" ? payload.chatId : "";
    const generationId = typeof payload.generationId === "string" ? payload.generationId : "";
    if (!chatId || !generationId) return;
    const map = this.active.get(chatId) ?? new Map<string, string>();
    map.set(generationId, typeof payload.targetMessageId === "string" ? payload.targetMessageId : "");
    this.active.set(chatId, map);
  }

  ended(payload: { generationId?: unknown; chatId?: unknown }): void {
    const chatId = typeof payload.chatId === "string" ? payload.chatId : "";
    const map = this.active.get(chatId);
    if (!map) return;
    if (typeof payload.generationId === "string") map.delete(payload.generationId);
    if (!map.size) this.active.delete(chatId);
  }

  /** A host generation is writing into this message (or, without a message id, any generation runs in the chat). */
  isStreaming(chatId: string, messageId?: string): boolean {
    const map = this.active.get(chatId);
    if (!map?.size) return false;
    if (!messageId) return true;
    for (const target of map.values()) if (target === messageId) return true;
    return false;
  }

  clear(): void {
    this.active.clear();
  }
}
