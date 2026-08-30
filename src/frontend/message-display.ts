/**
 * Port of the RisuAI Inlay Image v3.5 folding pass
 * (`toggle_Card.Display.Max`).
 *
 * Original behavior (references/original-module/original_script.txt):
 *  - `toggle_Card.Display.Max` (global, default 0 = off): traverse the full
 *    chat backwards counting char messages; at the first message where
 *    charCount > displayMax (1-based index i), every message with
 *    0-based index + 1 <= i folds (the boundary char message itself folds;
 *    newer messages — including interleaved user messages — do not).
 *  - Folding wraps each inlay individually in `FOLD_STYLE_BLOCK` +
 *    `inlay-fold-wrap` (checkbox/label "🖼️ Past Image", collapsed by
 *    default). The fullscreen overlay stays outside the fold.
 *
 * Divergences (documented in tmp-audit/display-modes-folding.md):
 *  - Role data comes from the typed backend `spindle.chat.getMessages` API
 *    and is returned to this renderer as a light role/index projection.
 *  - The per-inlay reroll buttons (`Card.Inlay.Display` modes 0/1/2) and the
 *    dark/light `Card.Theme` are NOT ported: the buttons never rendered in
 *    the Lumiverse chat DOM and Lumiverse owns theming. Reroll actions live
 *    on the floating action button (fab.ts) and the lightbox instead.
 *  - Persistence uses backend per-chat state for quote settings and per-user
 *    config for displayMax, mirroring the original chat/global variable split.
 */

import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { getDisplayMax, subscribeDisplaySettings } from "./display-settings.js";
import { applyQuoteSettingsSnapshot, getQuoteSettings, splitOriginalQuoteCss } from "./caption-settings.js";

const INLAY_WRAPPER_SELECTOR = '[data-inlay-illustrator="true"]';

export type ChatRole = "user" | "char" | "system";

export type ChatRoleList = {
  /** Roles indexed by 0-based message position (index_in_chat). */
  roles: ChatRole[];
  /** 0-based position by message id. */
  indexById: Map<string, number>;
};

export type MessageRow = {
  id?: unknown;
  index_in_chat?: unknown;
  is_user?: unknown;
  extra?: unknown;
  role?: unknown;
};

/** Map one backend role projection to the original Risu role vocabulary. */
export function chatRoleFromRow(row: MessageRow): ChatRole {
  if (row.role === "user") return "user";
  if (row.role === "system") return "system";
  if (row.role === "char" || row.role === "assistant") return "char";
  if (row.is_user === true || row.is_user === 1) return "user";
  const extra = row.extra;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    const spindleRole = (extra as Record<string, unknown>).spindle_role;
    if (spindleRole === "system") return "system";
  }
  return "char";
}

export function buildRoleList(rows: MessageRow[]): ChatRoleList {
  const roles: ChatRole[] = [];
  const indexById = new Map<string, number>();
  for (const row of rows) {
    const indexRaw = Number(row.index_in_chat);
    const index = Number.isInteger(indexRaw) && indexRaw >= 0 ? indexRaw : roles.length;
    const id = typeof row.id === "string" ? row.id : "";
    roles[index] = chatRoleFromRow(row);
    if (id) indexById.set(id, index);
  }
  return { roles, indexById };
}

/**
 * 1-based threshold index from the original backwards traversal: the index of
 * the (displayMax+1)-th newest char message, or null when nothing folds.
 */
export function foldThresholdIndex(roles: ChatRole[], displayMax: number): number | null {
  if (displayMax <= 0) return null;
  let charCount = 0;
  for (let i = roles.length; i >= 1; i--) {
    if (roles[i - 1] === "char") {
      charCount += 1;
      if (charCount > displayMax) return i;
    }
  }
  return null;
}

/** Fold decision for a message at 0-based index (original `(meta.index+1) <= i`). */
export function isMessageFolded(index0: number, threshold: number | null): boolean {
  if (threshold === null) return false;
  return index0 + 1 <= threshold;
}

/**
 * 1-based inlay number for the fold/button uid scheme. The original read the
 * 1-based `<CARDn>` tag from the inlay content; the port stores a 0-based
 * `data-inlay-illustrator-image-index`, so the uid adds one. Missing or
 * unparsable attributes fall back to "1" exactly like the original
 * `inlayIndex == nil then inlayIndex = "1"` fallback.
 */
export function inlayUidIndex(imageIndexAttribute: string | null): string {
  if (imageIndexAttribute === null) return "1";
  const parsed = Number(imageIndexAttribute);
  if (!Number.isInteger(parsed) || parsed < 0) return "1";
  return String(parsed + 1);
}

/** Fold uid mirroring the original `fold-ifs-r-<chatIdx>-<inlayIdx>`. */
export function foldUidFor(index0: number | null, messageId: string, imageIndexAttribute: string | null): string {
  const key = index0 !== null ? String(index0) : messageId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "x";
  return `fold-ifs-r-${key}-${inlayUidIndex(imageIndexAttribute)}`;
}

const FOLD_CSS = `
.inlay-fold-wrap{width:100%;margin:15px 0;display:flex;flex-direction:column;align-items:center}
.inlay-fold-cb{display:none}
.inlay-fold-label{display:flex;align-items:center;width:100%;cursor:pointer;color:rgba(255,255,255,0.4);font-size:11px;font-weight:700;letter-spacing:1.5px;transition:all .3s ease;user-select:none;text-transform:uppercase}
.inlay-fold-label:hover{color:rgba(255,255,255,0.8)}
.inlay-fold-line{flex:1;height:2px;background:rgba(255,255,255,0.1);margin:0 15px;transition:all .4s cubic-bezier(.16,1,.3,1);border-radius:2px}
.inlay-fold-label:hover .inlay-fold-line{background:rgba(255,255,255,0.3)}
.inlay-fold-cb:checked+.inlay-fold-label{margin-bottom:12px;color:#a888ff}
.inlay-fold-cb:checked+.inlay-fold-label .inlay-fold-line{background:linear-gradient(90deg,transparent,rgba(168,136,255,0.7),transparent);box-shadow:0 0 8px rgba(168,136,255,0.4)}
.inlay-fold-inner{width:100%;display:grid;grid-template-rows:0fr;transition:grid-template-rows .5s cubic-bezier(.16,1,.3,1),opacity .4s ease,filter .4s ease;opacity:0;filter:blur(8px);transform-origin:top}
.inlay-fold-inner>div{overflow:hidden}
.inlay-fold-cb:checked~.inlay-fold-inner{grid-template-rows:1fr;opacity:1;filter:blur(0)}
`;

function makeRequestId(prefix = "inlay-display"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type AppliedDecoration = {
  folded: boolean;
  foldShell: HTMLElement | null;
  originalPosition: string;
  quoteElement: HTMLElement | null;
  originalQuoteStyle: string;
  quoteStyle: string;
};

const decorations = new WeakMap<Element, AppliedDecoration>();

function undoInlayDecoration(wrapper: HTMLElement, restorePosition: boolean): AppliedDecoration | null {
  const previous = decorations.get(wrapper) ?? null;
  if (!previous) return null;
  if (previous.foldShell) {
    const hosted = previous.foldShell.querySelector<HTMLElement>(INLAY_WRAPPER_SELECTOR);
    if (hosted) previous.foldShell.replaceWith(hosted);
    else previous.foldShell.remove();
  }
  if (previous.quoteElement) previous.quoteElement.setAttribute("style", previous.originalQuoteStyle);
  if (restorePosition) wrapper.style.position = previous.originalPosition;
  decorations.delete(wrapper);
  return previous;
}

/** Remove only display/fold DOM injected by this module. */
export function clearInlayDecoration(wrapper: HTMLElement): void {
  undoInlayDecoration(wrapper, true);
}

/**
 * Apply (or re-apply) the fold decoration to one inlay wrapper element.
 * Mirrors `changeInlayWithReroll`'s fold output: the individual
 * `inlay-fold-wrap` fold shell for older inlays. The quote overlay styling
 * (Card.Quote.Style) is applied to the `.inlay-illustrator-inline-quote`
 * element on every pass.
 */
export function decorateInlayWrapper(
  wrapper: HTMLElement,
  options: {
    folded: boolean;
    quoteStyle: string;
    index0: number | null;
    messageId: string;
  }
): void {
  const existing = decorations.get(wrapper);
  const originalPosition = existing?.originalPosition ?? wrapper.style.position;
  // Undo any previous decoration (fold shell) so a fold-threshold change
  // re-decorates from the pristine baked markup. Keep the original inline
  // position until final teardown so repeated passes do not accumulate.
  undoInlayDecoration(wrapper, false);
  const next: AppliedDecoration = {
    folded: options.folded,
    foldShell: null,
    originalPosition,
    quoteElement: null,
    originalQuoteStyle: "",
    quoteStyle: options.quoteStyle
  };

  const image = wrapper.querySelector<HTMLImageElement>("img");
  const quote = wrapper.querySelector<HTMLElement>(".inlay-illustrator-inline-quote");
  if (quote) {
    next.quoteElement = quote;
    next.originalQuoteStyle = quote.getAttribute("style") || "";
    wrapper.style.position = "relative";
    const baseStyle = "position:absolute;left:50%;bottom:8%;transform:translateX(-50%);color:#fff;font-size:24px;font-style:italic;font-weight:bold;text-align:center;text-shadow:0 4px 15px rgba(0,0,0,0.9),0 1px 3px rgba(0,0,0,0.8);background:rgba(20,20,25,0.65);padding:15px 30px;border-radius:16px;border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(8px);z-index:3;pointer-events:none;max-width:85%;width:max-content;white-space:pre-wrap;overflow-wrap:anywhere;box-sizing:border-box";
    quote.style.cssText = `${baseStyle};${options.quoteStyle}`;
  }

  if (options.folded) {
    const foldUid = foldUidFor(options.index0, options.messageId, image?.getAttribute("data-inlay-illustrator-image-index") ?? null);

    const shell = document.createElement("div");
    shell.className = "inlay-fold-wrap";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = foldUid;
    checkbox.className = "inlay-fold-cb";

    const label = document.createElement("label");
    label.htmlFor = foldUid;
    label.className = "inlay-fold-label";
    const line1 = document.createElement("div");
    line1.className = "inlay-fold-line";
    const caption = document.createElement("span");
    caption.textContent = "🖼️ Past Image";
    const line2 = document.createElement("div");
    line2.className = "inlay-fold-line";
    label.append(line1, caption, line2);

    const inner = document.createElement("div");
    inner.className = "inlay-fold-inner";
    const clip = document.createElement("div");
    clip.style.width = "100%";
    clip.style.overflow = "hidden";
    clip.style.paddingTop = "4px";

    shell.append(checkbox, label, inner);
    inner.append(clip);

    // The lightbox overlay is host-level and therefore naturally outside the fold.
    wrapper.replaceWith(shell);
    clip.append(wrapper);

    next.foldShell = shell;
  }

  decorations.set(wrapper, next);
}

/**
 * Install the folding pass: styles, mutation observation, role-list
 * fetching and event invalidation.
 */
export function installInlayMessageDisplay(ctx: SpindleFrontendContext): () => void {
  let roleCache: { chatId: string; list: ChatRoleList } | null = null;
  let roleRequest: { requestId: string; chatId: string } | null = null;
  let decorateScheduled = false;
  let currentQuoteGlobalCss = "";
  let removeQuoteGlobalStyle: () => void = () => {};

  const removeStyle = ctx.dom.addStyle(FOLD_CSS);

  function activeChatId(): string {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }

  function scheduleDecorate(): void {
    if (decorateScheduled) return;
    decorateScheduled = true;
    const run = (): void => {
      decorateScheduled = false;
      decorate();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else queueMicrotask(run);
  }

  function decorate(): void {
    const chatId = activeChatId();
    const quoteCss = splitOriginalQuoteCss(getQuoteSettings(chatId).quoteStyle);
    if (quoteCss.globalCss !== currentQuoteGlobalCss) {
      removeQuoteGlobalStyle();
      currentQuoteGlobalCss = quoteCss.globalCss;
      removeQuoteGlobalStyle = currentQuoteGlobalCss.trim() ? ctx.dom.addStyle(currentQuoteGlobalCss) : () => {};
    }
    const displayMax = getDisplayMax();
    let threshold: number | null = null;
    if (displayMax > 0 && roleCache && roleCache.chatId === chatId) {
      threshold = foldThresholdIndex(roleCache.list.roles, displayMax);
    }

    const rolesForChat = roleCache && roleCache.chatId === chatId ? roleCache.list : null;
    for (const mounted of ctx.dom.listMessageElements()) {
      const index0 = rolesForChat ? (rolesForChat.indexById.get(mounted.messageId) ?? null) : null;
      const folded = threshold !== null && index0 !== null && isMessageFolded(index0, threshold);
      const wrappers = mounted.element.querySelectorAll<HTMLElement>(INLAY_WRAPPER_SELECTOR);
      for (const wrapper of wrappers) {
        const applied = decorations.get(wrapper);
        if (applied && applied.folded === folded && applied.quoteStyle === quoteCss.inlineStyle && applied.quoteElement === wrapper.querySelector(".inlay-illustrator-inline-quote")) continue;
        decorateInlayWrapper(wrapper, {
          folded,
          quoteStyle: quoteCss.inlineStyle,
          index0,
          messageId: mounted.messageId
        });
      }
    }
  }

  function ensureRoles(): void {
    const chatId = activeChatId();
    if (!chatId) return;
    if (roleCache?.chatId === chatId) return;
    if (roleRequest?.chatId === chatId) return;
    const requestId = makeRequestId("inlay-display-context");
    roleRequest = { requestId, chatId };
    ctx.sendToBackend({ type: "get_inlay_display_context", requestId, chatId });
  }

  function invalidateRoles(chatId: unknown): void {
    if (typeof chatId !== "string" || chatId === activeChatId()) {
      roleCache = null;
      ensureRoles();
    }
  }

  const unsubscribeBackend = ctx.onBackendMessage((payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const message = payload as Record<string, unknown>;
    if (message.type === "state") {
      applyQuoteSettingsSnapshot(String(message.chatId || activeChatId()), message.quoteStyle, message.quoteExample);
    } else if (message.type === "quote_settings_updated" && message.ok === true) {
      applyQuoteSettingsSnapshot(String(message.chatId || activeChatId()), message.quoteStyle, message.quoteExample);
      scheduleDecorate();
    }
    if (message.type === "inlay_display_context") {
      const requestId = String(message.requestId || "");
      const chatId = String(message.chatId || "");
      if (!roleRequest || roleRequest.requestId !== requestId || roleRequest.chatId !== chatId) return;
      roleRequest = null;
      if (message.ok === true && Array.isArray(message.roles) && chatId === activeChatId()) {
        const rows: MessageRow[] = message.roles.map((candidate) => {
          const row = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
          return { id: row.id, index_in_chat: row.index, role: row.role };
        });
        roleCache = { chatId, list: buildRoleList(rows) };
      } else {
        roleCache = null;
      }
      scheduleDecorate();
      return;
    }
    if (message.type === "state" || message.type === "config_updated") {
      scheduleDecorate();
    }
  });

  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const unsubscribes: Array<() => void> = [
    () => observer.disconnect(),
    unsubscribeBackend,
    ctx.events.on("CHAT_SWITCHED", () => {
      roleCache = null;
      roleRequest = null;
      ensureRoles();
      scheduleDecorate();
    }),
    ctx.events.on("MESSAGE_SENT", (payload) => { invalidateRoles((payload as { chatId?: unknown } | null)?.chatId); }),
    ctx.events.on("MESSAGE_EDITED", (payload) => { invalidateRoles((payload as { chatId?: unknown } | null)?.chatId); }),
    ctx.events.on("MESSAGE_DELETED", (payload) => { invalidateRoles((payload as { chatId?: unknown } | null)?.chatId); }),
    ctx.events.on("MESSAGE_SWIPED", (payload) => { invalidateRoles((payload as { chatId?: unknown } | null)?.chatId); })
  ];

  const unsubscribeSettings = subscribeDisplaySettings(() => {
    // Fold-threshold change: re-decorate only (the original toggled a
    // cache-bust space on stored char messages; that write is unnecessary
    // here because decorations are rebuilt from baked content, and it would
    // corrupt chat history). No reroll is triggered.
    scheduleDecorate();
  });
  unsubscribes.push(unsubscribeSettings);

  ensureRoles();
  scheduleDecorate();

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
    // Restore baked message DOM before styles disappear. Otherwise extension
    // reloads leave collapsed shells behind.
    for (const mounted of ctx.dom.listMessageElements()) {
      const wrappers = mounted.element.querySelectorAll<HTMLElement>(INLAY_WRAPPER_SELECTOR);
      for (const wrapper of wrappers) clearInlayDecoration(wrapper);
    }
    removeQuoteGlobalStyle();
    removeStyle();
    roleCache = null;
    roleRequest = null;
  };
}
