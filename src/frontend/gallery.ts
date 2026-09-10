import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { showNativeModal, type ModalHandle } from "./modal.js";

const CHATS_PER_PAGE = 5;

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type GalleryImageDTO = {
  chatId: string;
  messageId: string;
  swipeId: number;
  imageId: string;
  imageUrl: string;
  imageIndex: number;
  paragraph: number;
  prompt: string;
  negativePrompt: string;
  quote: string;
};

export type GalleryChatDTO = {
  chatId: string;
  name?: string;
  cardName?: string;
  messageCount: number;
  branchCount: number;
  quoteStyle?: string;
  images: GalleryImageDTO[];
};

export type GalleryController = {
  open(initialChatId?: string | null): void;
  destroy(): void;
};

type GalleryResultPayload = {
  type: string;
  requestId: string;
  ok: boolean;
  page?: number;
  totalChats?: number;
  totalPages?: number;
  chatIds?: string[];
  chats?: GalleryChatDTO[];
  records?: GalleryChatDTO[];
  error?: string;
};

const GALLERY_CSS = `
.inlay-gallery {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: inherit;
  color: var(--lumiverse-text, #f0f0f5);
}
.inlay-gallery-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.inlay-gallery-chat-select {
  flex: 1 1 auto;
  max-width: 400px;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: var(--lumiverse-input-bg, #1a1b26);
  color: var(--lumiverse-text, #f0f0f5);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.inlay-gallery-chat-select:focus-visible {
  border-color: var(--lumiverse-primary, #6366f1);
  outline: 2px solid var(--lumiverse-primary, #6366f1);
  outline-offset: 1px;
}
.inlay-gallery-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  font-size: 13px;
  color: var(--lumiverse-text-muted, #8a8d9b);
}
.inlay-gallery-pagination button {
  height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: transparent;
  color: var(--lumiverse-text, #f0f0f5);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.inlay-gallery-pagination button:hover:not(:disabled) {
  background: var(--lumiverse-fill-hover, rgba(255, 255, 255, 0.08));
}
.inlay-gallery-pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.inlay-gallery-status {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 13px;
  color: var(--lumiverse-text-muted, #8a8d9b);
}
.inlay-gallery-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--lumiverse-text-muted, #8a8d9b);
  font-size: 14px;
}
.inlay-gallery-chat {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--lumiverse-border, rgba(255, 255, 255, 0.08));
}
.inlay-gallery-chat:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.inlay-gallery-chat-heading {
  font-size: 15px;
  font-weight: 600;
  color: var(--lumiverse-text, #f0f0f5);
}
.inlay-gallery-chat-meta {
  font-size: 12px;
  color: var(--lumiverse-text-muted, #8a8d9b);
}
.inlay-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.inlay-gallery-card {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: var(--lumiverse-card-bg, #202230);
  overflow: hidden;
  box-shadow: var(--lumiverse-shadow-sm, 0 2px 4px rgba(0, 0, 0, 0.2));
}
.inlay-gallery-badge {
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.3);
  font-size: 11px;
  font-weight: 600;
  color: var(--lumiverse-text-muted, #a0a3b2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.inlay-gallery-image-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  overflow: hidden;
  cursor: pointer;
}
.inlay-gallery-image-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
}
.inlay-gallery-image-wrap:hover img {
  transform: scale(1.04);
}
.inlay-gallery-quote {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  font-style: italic;
  color: var(--lumiverse-text-muted, #cbd0e0);
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
`;

export function createInlayGallery(ctx: SpindleFrontendContext): GalleryController {
  let activeModal: ModalHandle | null = null;
  let activeRoot: HTMLElement | null = null;
  let navRoot: HTMLElement | null = null;
  let paginationRoot: HTMLElement | null = null;
  let contentRoot: HTMLElement | null = null;
  let statusRoot: HTMLElement | null = null;

  let currentPage = 1;
  let selectedChatId: string | null = null;
  let savedAllPage = 1;
  let chatIds: string[] = [];
  const chatLabels = new Map<string, string>();
  let totalChats = 0;
  let totalPages = 1;
  let isDismissed = false;
  let pendingRequestId: string | null = null;

  const removeStyle = ctx.dom.addStyle(GALLERY_CSS);

  function showStatus(message: string, isError = false): void {
    if (!statusRoot) return;
    statusRoot.textContent = message;
    statusRoot.hidden = !message;
    statusRoot.setAttribute("role", isError ? "alert" : "status");
    statusRoot.setAttribute("aria-live", isError ? "assertive" : "polite");
  }

  function clearContent(): void {
    if (contentRoot) contentRoot.replaceChildren();
    if (statusRoot) {
      statusRoot.textContent = "";
      statusRoot.hidden = true;
    }
  }

  function renderLoading(): void {
    clearContent();
    if (!contentRoot) return;
    const node = document.createElement("div");
    node.className = "inlay-gallery-status";
    node.textContent = "Loading gallery…";
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-busy", "true");
    contentRoot.append(node);
    showStatus("Loading gallery…");
  }

  function renderError(message: string): void {
    clearContent();
    if (!contentRoot) return;
    const node = document.createElement("div");
    node.className = "inlay-gallery-status";
    node.textContent = message || "Failed to load gallery.";
    node.setAttribute("role", "alert");
    contentRoot.append(node);
    showStatus(message || "Failed to load gallery.", true);
  }

  function renderEmpty(message = "No saved Inlay history."): void {
    clearContent();
    if (!contentRoot) return;
    const node = document.createElement("div");
    node.className = "inlay-gallery-empty";
    node.textContent = message;
    contentRoot.append(node);
  }

  function createImageCard(image: GalleryImageDTO): HTMLElement {
    const card = document.createElement("div");
    card.className = "inlay-gallery-card";

    const badge = document.createElement("div");
    badge.className = "inlay-gallery-badge";
    badge.textContent = `Paragraph ${image.paragraph}`;
    card.append(badge);

    const wrap = document.createElement("div");
    wrap.className = "inlay-gallery-image-wrap";
    wrap.setAttribute("data-inlay-illustrator", "true");

    const img = document.createElement("img");
    img.src = image.imageUrl;
    img.alt = `Inlay ${image.imageIndex + 1} paragraph ${image.paragraph}`;
    img.loading = "lazy";
    img.setAttribute("data-inlay-illustrator-chat-id", image.chatId);
    img.setAttribute("data-inlay-illustrator-message-id", image.messageId);
    img.setAttribute("data-inlay-illustrator-swipe-id", String(image.swipeId ?? 0));
    img.setAttribute("data-inlay-illustrator-image-index", String(image.imageIndex ?? 0));
    if (image.imageId) img.setAttribute("data-inlay-illustrator-image-id", image.imageId);
    img.setAttribute("data-inlay-illustrator-prompt", image.prompt || "");
    img.setAttribute("data-inlay-illustrator-negative-prompt", image.negativePrompt || "");
    if (image.quote) img.setAttribute("data-inlay-illustrator-quote", image.quote);

    wrap.append(img);
    card.append(wrap);

    if (image.quote) {
      const quote = document.createElement("blockquote");
      quote.className = "inlay-gallery-quote";
      quote.textContent = image.quote;
      card.append(quote);
    }

    return card;
  }

  function renderChatSection(chat: GalleryChatDTO, showHeading: boolean): HTMLElement {
    const section = document.createElement("section");
    section.className = "inlay-gallery-chat";
    if (showHeading) {
      const heading = document.createElement("div");
      heading.className = "inlay-gallery-chat-heading";
      heading.textContent = `💬 ${chat.cardName || chat.name || `Chat #${chat.chatId}`}`;
      section.append(heading);

      const metaBits: string[] = [];
      if (typeof chat.messageCount === "number") {
        metaBits.push(`${chat.messageCount} message${chat.messageCount === 1 ? "" : "s"}`);
      }
      if (chat.images && chat.images.length) {
        metaBits.push(`${chat.images.length} image${chat.images.length === 1 ? "" : "s"}`);
      }
      if (typeof chat.branchCount === "number" && chat.branchCount > 0) {
        metaBits.push(`${chat.branchCount} branch${chat.branchCount === 1 ? "" : "es"}`);
      }
      if (chat.cardName && chat.name && chat.name !== chat.cardName) {
        metaBits.unshift(chat.name);
      }
      if (metaBits.length) {
        const meta = document.createElement("div");
        meta.className = "inlay-gallery-chat-meta";
        meta.textContent = metaBits.join(" · ");
        section.append(meta);
      }
    }

    const grid = document.createElement("div");
    grid.className = "inlay-gallery-grid";
    const sorted = [...chat.images].sort((a, b) => a.paragraph - b.paragraph || a.imageIndex - b.imageIndex);
    for (const image of sorted) {
      grid.append(createImageCard(image));
    }
    section.append(grid);
    return section;
  }

  function renderNav(): void {
    if (!navRoot) return;
    navRoot.replaceChildren();

    const select = document.createElement("select");
    select.className = "inlay-gallery-chat-select";
    select.setAttribute("aria-label", "Filter gallery by chat");

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All chats";
    select.append(allOption);

    for (const cid of chatIds) {
      const option = document.createElement("option");
      option.value = cid;
      option.textContent = chatLabels.get(cid) || `#${cid}`;
      select.append(option);
    }

    select.value = selectedChatId || "";
    select.addEventListener("change", () => {
      const next = select.value;
      if (next === "") {
        selectedChatId = null;
        requestGallery(savedAllPage, null);
      } else {
        selectedChatId = next;
        requestGallery(1, next);
      }
    });

    navRoot.append(select);
    navRoot.setAttribute("role", "navigation");
    navRoot.setAttribute("aria-label", "Chat gallery navigation");
  }

  function renderPagination(): void {
    if (!paginationRoot) return;
    paginationRoot.replaceChildren();
    if (selectedChatId !== null) {
      paginationRoot.hidden = true;
      return;
    }
    paginationRoot.hidden = false;

    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "◀ Prev";
    prev.setAttribute("aria-label", "Previous page");
    prev.disabled = currentPage <= 1;
    prev.addEventListener("click", () => {
      if (currentPage > 1) requestGallery(currentPage - 1, null);
    });

    const info = document.createElement("span");
    info.textContent = `Page ${currentPage} / ${totalPages}`;
    info.setAttribute("aria-live", "polite");

    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next ▶";
    next.setAttribute("aria-label", "Next page");
    next.disabled = currentPage >= totalPages;
    next.addEventListener("click", () => {
      if (currentPage < totalPages) requestGallery(currentPage + 1, null);
    });

    paginationRoot.append(prev, info, next);
    paginationRoot.setAttribute("role", "navigation");
    paginationRoot.setAttribute("aria-label", "Gallery pagination");
  }

  function renderGalleryData(chats: GalleryChatDTO[]): void {
    if (!contentRoot) return;
    clearContent();
    if (totalChats === 0) {
      renderEmpty();
      return;
    }
    if (chats.length === 0) {
      renderEmpty("No images for this selection.");
      return;
    }
    const showHeadings = selectedChatId === null;
    for (const chat of chats) {
      contentRoot.append(renderChatSection(chat, showHeadings));
    }
    showStatus(`Showing ${chats.length} chat(s) · ${chats.reduce((acc, c) => acc + c.images.length, 0)} image(s)`);
  }

  function requestGallery(page: number, selected: string | null): void {
    if (selected === null) {
      savedAllPage = page;
    }
    currentPage = page;
    selectedChatId = selected;
    const requestId = makeRequestId();
    pendingRequestId = requestId;
    renderLoading();
    renderNav();
    renderPagination();
    ctx.sendToBackend({
      type: "list_inlay_gallery",
      requestId,
      page: selected ? 1 : page,
      selectedChatId: selected || undefined
    });
  }

  function handleGalleryResult(payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const msg = payload as GalleryResultPayload;
    if (msg.type !== "inlay_gallery_result") return;
    if (!activeModal || !activeRoot || isDismissed) return;
    if (pendingRequestId && msg.requestId !== pendingRequestId) return;
    pendingRequestId = null;

    if (msg.ok === false) {
      renderError(msg.error || "Failed to load gallery.");
      return;
    }

    totalChats = typeof msg.totalChats === "number" ? msg.totalChats : totalChats;
    totalPages = typeof msg.totalPages === "number" && msg.totalPages >= 1
      ? msg.totalPages
      : Math.max(1, Math.ceil(totalChats / CHATS_PER_PAGE));
    if (selectedChatId === null && Array.isArray(msg.chatIds)) {
      chatIds = msg.chatIds.map(String);
    } else if (chatIds.length === 0 && Array.isArray(msg.chatIds)) {
      chatIds = msg.chatIds.map(String);
    }
    currentPage = typeof msg.page === "number" && msg.page >= 1 ? msg.page : currentPage;
    if (selectedChatId === null) savedAllPage = currentPage;

    const chats = Array.isArray(msg.chats) ? msg.chats : Array.isArray(msg.records) ? msg.records : [];
    for (const chat of chats) {
      if (!chat || typeof chat.chatId !== "string") continue;
      chatLabels.set(chat.chatId, chat.cardName || chat.name || `#${chat.chatId}`);
    }

    renderNav();
    renderPagination();
    renderGalleryData(chats);
  }

  const off = ctx.onBackendMessage((payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const msg = payload as Record<string, unknown>;
    if (msg.type === "inlay_gallery_result") {
      handleGalleryResult(payload);
    } else if (msg.type === "inlay_image_action_result" && activeModal && !isDismissed) {
      if (msg.ok !== false && msg.record) {
        requestGallery(currentPage, selectedChatId);
      }
    }
  });

  function ensureStructure(): void {
    if (!activeModal || !activeRoot) return;
    activeRoot.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "inlay-gallery";

    navRoot = document.createElement("div");
    navRoot.className = "inlay-gallery-nav";

    paginationRoot = document.createElement("div");
    paginationRoot.className = "inlay-gallery-pagination";

    contentRoot = document.createElement("div");
    contentRoot.className = "inlay-gallery-content";
    contentRoot.setAttribute("role", "region");
    contentRoot.setAttribute("aria-label", "Gallery images");

    statusRoot = document.createElement("div");
    statusRoot.className = "inlay-gallery-status";
    statusRoot.hidden = true;
    statusRoot.setAttribute("role", "status");
    statusRoot.setAttribute("aria-live", "polite");

    wrapper.append(navRoot, paginationRoot, statusRoot, contentRoot);
    activeRoot.append(wrapper);
  }

  function open(initialChatId?: string | null): void {
    if (activeModal) {
      try { activeModal.dismiss(); } catch {}
      activeModal = null;
    }
    isDismissed = false;
    const scopeChatId = typeof initialChatId === "string" && initialChatId ? initialChatId : null;

    // Use native modal dialog without external libraries
    const modal = showNativeModal({
      title: scopeChatId ? "Current chat gallery" : "Inlay gallery",
      width: 900,
      maxHeight: 750
    });

    activeModal = modal;
    activeRoot = modal.root;
    ensureStructure();

    chatIds = [];
    chatLabels.clear();
    totalChats = 0;
    totalPages = 1;
    currentPage = 1;
    savedAllPage = 1;
    selectedChatId = scopeChatId;
    pendingRequestId = null;

    renderLoading();
    requestGallery(1, scopeChatId);

    modal.onDismiss(() => {
      isDismissed = true;
      activeModal = null;
      activeRoot = null;
      navRoot = null;
      paginationRoot = null;
      contentRoot = null;
      statusRoot = null;
      pendingRequestId = null;
    });
  }

  function destroy(): void {
    off();
    removeStyle();
    if (activeModal) {
      try { activeModal.dismiss(); } catch {}
      activeModal = null;
    }
    isDismissed = true;
  }

  return { open, destroy };
}
