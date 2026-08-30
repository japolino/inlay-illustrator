/**
 * Port of the RisuAI Inlay Image v3.5 display-mode + folding pass
 * (`Card.Inlay.Display`, `Card.Inlay.Display` buttons and
 * `toggle_Card.Display.Max`).
 *
 * Original behavior (references/original-module/original_script.txt):
 *  - `Card.Inlay.Display` chat var, default "0"; exact "null"/"" read back
 *    as "0". Modes: "0" floating top-right buttons, "1" top tab
 *    (blob-wrap-1), "2" right tab (blob-wrap-2), anything else ("3",
 *    unknown) renders *no* per-inlay buttons.
 *  - Changing the display mode never rerolls. The original forced a
 *    re-render by toggling a trailing space on stored char messages that
 *    contain `INLAY[` (cache-bust) and calling `updateDisplay`. Lumiverse
 *    bakes final inlay HTML into message content, so this port re-runs the
 *    DOM decoration instead of touching stored content.
 *  - `toggle_Card.Display.Max` (global, default 0 = off): traverse the full
 *    chat backwards counting char messages; at the first message where
 *    charCount > displayMax (1-based index i), every message with
 *    0-based index + 1 <= i folds (the boundary char message itself folds;
 *    newer messages — including interleaved user messages — do not).
 *  - Folding wraps each inlay individually in `FOLD_STYLE_BLOCK` +
 *    `inlay-fold-wrap` (checkbox/label "🖼️ Past Image", collapsed by
 *    default). Per-inlay buttons sit inside the fold; the fullscreen
 *    overlay stays outside.
 *
 * Divergences (documented in tmp-audit/display-modes-folding.md):
 *  - Role data comes from the typed backend `spindle.chat.getMessages` API
 *    and is returned to this renderer as a light role/index projection.
 *  - Persistence uses backend per-chat state for display mode and per-user
 *    config for displayMax, mirroring the original chat/global variable split.
 *  - The space-toggle cache-bust is replaced by re-decoration; no message
 *    content is modified when the display mode changes.
 */

import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { getDisplayMax, getDisplayMode, subscribeDisplaySettings } from "./display-settings.js";
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
 * Whether the display mode renders per-inlay buttons. Only "0", "1" and "2"
 * do; "3" and any unknown value render *no* buttons (original quirk).
 */
export function modeHasButtons(mode: string): boolean {
  return mode === "0" || mode === "1" || mode === "2";
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
.inlay-reroll-btn{padding:6px 8px;background:rgba(0,0,0,0.4);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.2);border-radius:5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);opacity:0.6;transition:opacity 0.2s}
.inlay-reroll-btn:hover{opacity:1}
.inlay-reroll-btn.inlay-reroll-busy{opacity:1;pointer-events:none}
.inlay-theme-light .inlay-reroll-btn{background:rgba(255,255,255,0.85);color:#333;border-color:rgba(0,0,0,0.15)}
.blob-wrap-1.inlay-theme-light,.blob-wrap-2.inlay-theme-light{background:rgba(245,245,252,0.95);border-color:#c4a8ff}
.blob-wrap-1.inlay-theme-light .blob-btn-1,.blob-wrap-2.inlay-theme-light .blob-btn-2{color:#8a58ff}
.blob-wrap-1.inlay-theme-light .blob-btn-1:first-child::after,.blob-wrap-2.inlay-theme-light .blob-btn-2:first-child::after{background:rgba(0,0,0,0.1)}
.blob-wrap-1.inlay-theme-light .blob-btn-1:hover,.blob-wrap-2.inlay-theme-light .blob-btn-2:hover{background:rgba(138,88,255,0.15);color:#5522aa;text-shadow:none}
.blob-wrap-1{position:absolute;bottom:100%;right:12px;display:inline-flex;margin-bottom:-30px;z-index:50;background:rgba(30,20,36,0.95);border:1px solid rgba(255,255,255,0.25);border-bottom:none;border-radius:4px 4px 0 0;backdrop-filter:blur(4px);overflow:hidden}
.blob-btn-1{position:relative;color:#c4a8ff;font-weight:bold;font-size:13px;cursor:pointer;background:transparent;border:none;transition:all 0.2s ease;display:inline-flex;justify-content:center;align-items:center;z-index:50;}
.blob-btn-1:first-child{padding:2px 16px;}
.blob-btn-1:last-child{padding:2px 16px;}
.blob-btn-1:first-child::after{content:"";position:absolute;right:0px;top:4px;bottom:4px;width:1px;background:rgba(255,255,255,0.15);z-index:51;}
.blob-btn-1:hover{background:rgba(168,136,255,0.35);color:#fff;text-shadow:0 0 8px rgba(168,136,255,0.8)}
.blob-wrap-2{position:absolute;left:100%;top:40px;display:inline-flex;flex-direction:column;margin-left:2px;z-index:1;background:rgba(30,20,36,0.95);border:1px solid rgba(255,255,255,0.25);border-left:none;border-radius:0 4px 4px 0;backdrop-filter:blur(4px);overflow:hidden}
.blob-btn-2{position:relative;color:#c4a8ff;font-weight:bold;font-size:13px;cursor:pointer;background:transparent;border:none;transition:all 0.2s ease;display:inline-flex;justify-content:center;align-items:center;z-index:2;}
.blob-btn-2:first-child{padding:12px 2px;}
.blob-btn-2:last-child{padding:12px 2px;}
.blob-btn-2:first-child::after{content:"";position:absolute;bottom:0px;left:4px;right:4px;height:1px;background:rgba(255,255,255,0.15);z-index:3;}
.blob-btn-2:hover{background:rgba(168,136,255,0.35);color:#fff;text-shadow:0 0 8px rgba(168,136,255,0.8)}
.inlay-display-picker{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;padding:12px}
.inlay-display-picker figure{margin:0;width:200px;display:flex;flex-direction:column;gap:6px}
.inlay-display-picker img{width:100%;height:auto;border-radius:8px;cursor:pointer;border:2px solid transparent;transition:border-color .15s ease}
.inlay-display-picker img:hover{border-color:#a888ff}
.inlay-display-picker figcaption{font-size:12px;color:var(--lumiverse-text-muted,#888);text-align:center}
.inlay-display-picker-status{padding:8px 12px;font-size:12px;color:var(--lumiverse-text-muted,#888)}
`;

const SVG_NAI = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" y1="22" x2="12" y2="12"></line><path d="M12 7.5h.01"></path><path d="M7.5 12h.01"></path><path d="M7.5 17h.01"></path><path d="M14 11.5h.01"></path><path d="M16.5 14.5h.01"></path><path d="M19 17.5h.01"></path></svg>';
const SVG_LLM = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>';

const NAI_TITLE = "이미지만 다시 생성 (NAI)";
const LLM_TITLE = "프롬프트부터 다시 작성 (LLM)";

type RerollCandidate = { imageId: string; imageUrl: string; parameters: Record<string, unknown> };

type ButtonTarget = {
  chatId: string;
  messageId: string;
  swipeId?: number;
  imageIndex?: number;
  imageId?: string;
  imageUrl: string;
};

function optionalIntegerAttribute(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function buttonTargetFromImage(image: HTMLImageElement, chatId: string): ButtonTarget {
  const imageUrl = image.getAttribute("src") || image.currentSrc || image.src;
  return {
    chatId: image.getAttribute("data-inlay-illustrator-chat-id") || chatId,
    messageId: image.getAttribute("data-inlay-illustrator-message-id") || "",
    swipeId: optionalIntegerAttribute(image.getAttribute("data-inlay-illustrator-swipe-id")),
    imageIndex: optionalIntegerAttribute(image.getAttribute("data-inlay-illustrator-image-index")),
    imageId: image.getAttribute("data-inlay-illustrator-image-id") || undefined,
    imageUrl
  };
}

function makeRequestId(prefix = "inlay-display"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function displayThemeFromConfig(config: unknown): "0" | "1" {
  if (!config || typeof config !== "object") return "0";
  return String((config as Record<string, unknown>).displayTheme ?? "0") === "1" ? "1" : "0";
}

function imageRerollCountFromConfig(config: unknown): number {
  if (config && typeof config === "object" && "imageRerollCount" in (config as Record<string, unknown>)) {
    const parsed = Number((config as Record<string, unknown>).imageRerollCount);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(8, Math.max(1, Math.floor(parsed)));
  }
  return 1;
}

type AppliedDecoration = {
  mode: string;
  folded: boolean;
  theme: "0" | "1";
  buttonGroup: HTMLElement | null;
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
  if (previous.buttonGroup?.parentNode) previous.buttonGroup.remove();
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

function setBusy(button: HTMLButtonElement, busy: boolean): void {
  button.classList.toggle("inlay-reroll-busy", busy);
  button.disabled = busy;
}

function releaseBusyButtons(): void {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll<HTMLButtonElement>("button.inlay-reroll-busy, button.blob-btn-1:disabled, button.blob-btn-2:disabled")
    .forEach((button) => setBusy(button, false));
}

/**
 * Apply (or re-apply) the display-mode + fold decoration to one inlay
 * wrapper element. Mirrors `changeInlayWithReroll` per-inlay output:
 * mode 0 floating buttons, 1 top tab, 2 right tab, 3/unknown no buttons,
 * and the individual `inlay-fold-wrap` fold shell for older inlays.
 */
export function decorateInlayWrapper(
  wrapper: HTMLElement,
  options: {
    mode: string;
    folded: boolean;
    theme: "0" | "1";
    quoteStyle: string;
    index0: number | null;
    messageId: string;
    chatId: string;
    onNaiReroll: (target: ButtonTarget, button: HTMLButtonElement) => void;
    onLlmReroll: (target: ButtonTarget, button: HTMLButtonElement) => void;
  }
): void {
  const existing = decorations.get(wrapper);
  const originalPosition = existing?.originalPosition ?? wrapper.style.position;
  // Undo any previous decoration (button group + fold shell) so a display
  // mode change re-decorates from the pristine baked markup. Keep the original
  // inline position until final teardown so mode switches do not accumulate.
  undoInlayDecoration(wrapper, false);
  const next: AppliedDecoration = {
    mode: options.mode,
    folded: options.folded,
    theme: options.theme,
    buttonGroup: null,
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
  const hasButtons = modeHasButtons(options.mode);

  if (hasButtons && image) {
    const target = buttonTargetFromImage(image, options.chatId);
    const nai = document.createElement("button");
    nai.type = "button";
    nai.title = NAI_TITLE;
    nai.setAttribute("aria-label", NAI_TITLE);
    nai.innerHTML = SVG_NAI;
    nai.addEventListener("click", () => options.onNaiReroll(target, nai));

    const llm = document.createElement("button");
    llm.type = "button";
    llm.title = LLM_TITLE;
    llm.setAttribute("aria-label", LLM_TITLE);
    llm.innerHTML = SVG_LLM;
    llm.addEventListener("click", () => options.onLlmReroll(target, llm));

    const group = document.createElement("div");
    if (options.mode === "1") {
      nai.className = "blob-btn-1";
      llm.className = "blob-btn-1";
      group.className = "blob-wrap-1";
      group.setAttribute("data-inlay-display-buttons", "top-tab");
      wrapper.style.position = "relative";
      wrapper.prepend(group);
    } else if (options.mode === "2") {
      nai.className = "blob-btn-2";
      llm.className = "blob-btn-2";
      group.className = "blob-wrap-2";
      group.setAttribute("data-inlay-display-buttons", "right-tab");
      wrapper.style.position = "relative";
      wrapper.append(group);
    } else {
      // Mode "0": floating top-right (original inline style port).
      nai.className = "inlay-reroll-btn";
      llm.className = "inlay-reroll-btn";
      group.setAttribute("data-inlay-display-buttons", "floating");
      group.style.position = "absolute";
      group.style.top = "30px";
      group.style.right = "12px";
      group.style.display = "flex";
      group.style.gap = "4px";
      group.style.zIndex = "10";
      wrapper.style.position = "relative";
      wrapper.prepend(group);
    }
    if (options.theme === "1") group.classList.add("inlay-theme-light");
    group.append(nai, llm);
    next.buttonGroup = group;
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

    // Buttons stay inside the fold (original order); the lightbox overlay is
    // host-level and therefore naturally outside the fold.
    wrapper.replaceWith(shell);
    clip.append(wrapper);

    next.foldShell = shell;
  }

  decorations.set(wrapper, next);
}

/**
 * Install the display-mode + folding pass: styles, mutation observation,
 * role-list fetching, event invalidation and the per-inlay reroll actions.
 */
export function installInlayMessageDisplay(ctx: SpindleFrontendContext): () => void {
  let roleCache: { chatId: string; list: ChatRoleList } | null = null;
  let roleRequest: { requestId: string; chatId: string } | null = null;
  let decorateScheduled = false;
  let latestConfig: unknown = null;
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
    const mode = getDisplayMode(chatId);
    const theme = displayThemeFromConfig(latestConfig);
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
        if (applied && applied.mode === mode && applied.folded === folded && applied.theme === theme && applied.quoteStyle === quoteCss.inlineStyle && applied.quoteElement === wrapper.querySelector(".inlay-illustrator-inline-quote")) continue;
        decorateInlayWrapper(wrapper, {
          mode,
          folded,
          theme,
          quoteStyle: quoteCss.inlineStyle,
          index0,
          messageId: mounted.messageId,
          chatId,
          onNaiReroll: (target, button) => { void naiReroll(target, button); },
          onLlmReroll: (target, button) => { void llmReroll(target, button); }
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

  async function naiReroll(target: ButtonTarget, button: HTMLButtonElement): Promise<void> {
    const chatId = target.chatId || activeChatId();
    if (!chatId) return;
    const count = imageRerollCountFromConfig(latestConfig);
    setBusy(button, true);
    if (count > 1) {
      const requestId = makeRequestId("inlay-display-candidates");
      activeCandidatePickers.set(requestId, { chatId, button, target });
      ctx.sendToBackend({ type: "reroll_image_candidates", requestId, ...target, chatId, count });
      return;
    }
    ctx.sendToBackend({ type: "reroll_image", requestId: makeRequestId("inlay-display-reroll"), ...target, chatId });
  }

  async function llmReroll(target: ButtonTarget, button: HTMLButtonElement): Promise<void> {
    const chatId = target.chatId || activeChatId();
    if (!chatId) return;
    setBusy(button, true);
    ctx.sendToBackend({ type: "rerun_image_sidecar", requestId: makeRequestId("inlay-display-sidecar"), ...target, chatId });
  }

  const activeCandidatePickers = new Map<string, { chatId: string; button: HTMLButtonElement; target: ButtonTarget }>();

  function showCandidatePicker(
    requestId: string,
    candidates: RerollCandidate[],
    resolved: { messageId?: string; imageIndex?: number }
  ): void {
    const entry = activeCandidatePickers.get(requestId);
    activeCandidatePickers.delete(requestId);
    if (entry) setBusy(entry.button, false);
    if (candidates.length === 0) return;
    if (!entry) return;

    // Prefer the backend-resolved locator fields, keep the original image
    // identity (imageId/imageUrl/swipeId) so the apply request locates the
    // stored record exactly like the lightbox does.
    const target: ButtonTarget = {
      ...entry.target,
      messageId: resolved.messageId || entry.target.messageId,
      imageIndex: resolved.imageIndex ?? entry.target.imageIndex
    };

    // Single successful candidate: apply immediately (original behavior).
    if (candidates.length === 1) {
      applyCandidate(candidates[0], target, entry.chatId);
      return;
    }

    const modal = ctx.ui.showModal({ title: "Reroll candidates", width: 900 });
    const grid = document.createElement("div");
    grid.className = "inlay-display-picker";
    for (const candidate of candidates) {
      const figure = document.createElement("figure");
      const image = document.createElement("img");
      image.src = candidate.imageUrl;
      image.alt = "Reroll candidate";
      image.addEventListener("click", () => {
        modal.dismiss();
        applyCandidate(candidate, target, entry.chatId);
      });
      const caption = document.createElement("figcaption");
      caption.textContent = candidate.imageId ? String(candidate.imageId) : "";
      figure.append(image, caption);
      grid.append(figure);
    }
    modal.root.append(grid);
  }

  function applyCandidate(candidate: RerollCandidate, target: ButtonTarget, chatId: string): void {
    ctx.sendToBackend({
      type: "reroll_image_apply",
      requestId: makeRequestId("inlay-display-apply"),
      chatId,
      messageId: target.messageId,
      swipeId: target.swipeId,
      imageIndex: target.imageIndex,
      imageId: target.imageId,
      imageUrl: target.imageUrl,
      candidate
    });
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
      if (message.config && typeof message.config === "object") latestConfig = message.config;
      scheduleDecorate();
    }
    if (message.type === "inlay_reroll_candidates") {
      const requestId = String(message.requestId || "");
      const pending = activeCandidatePickers.get(requestId);
      if (!pending) return;
      if (message.ok !== true) {
        setBusy(pending.button, false);
        activeCandidatePickers.delete(requestId);
        return;
      }
      const raw = Array.isArray(message.candidates) ? message.candidates as unknown[] : [];
      const candidates = raw.filter((c): c is RerollCandidate =>
        Boolean(c) && typeof c === "object" && typeof (c as RerollCandidate).imageUrl === "string" && (c as RerollCandidate).imageUrl.trim() !== ""
      );
      const messageId = typeof message.messageId === "string" ? message.messageId : undefined;
      const imageIndexRaw = Number(message.imageIndex);
      const imageIndex = Number.isInteger(imageIndexRaw) ? imageIndexRaw : undefined;
      showCandidatePicker(requestId, candidates, { messageId, imageIndex });
    }
    if (message.type === "inlay_image_action_result" || message.type === "inlay_reroll_all_result") {
      // Reroll/apply finished; the host re-renders the message content and
      // the mutation observer re-decorates the fresh inlay markup. On
      // failure no re-render happens, so release disabled buttons.
      if (message.ok === false) releaseBusyButtons();
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
    // Display-mode change: re-decorate only (the original toggled a cache-bust
    // space on stored char messages; that write is unnecessary here because
    // decorations are rebuilt from baked content, and it would corrupt chat
    // history). No reroll is triggered.
    scheduleDecorate();
  });
  unsubscribes.push(unsubscribeSettings);

  ensureRoles();
  scheduleDecorate();

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
    // Restore baked message DOM before styles disappear. Otherwise extension
    // reloads leave collapsed shells and stale click handlers behind.
    for (const mounted of ctx.dom.listMessageElements()) {
      const wrappers = mounted.element.querySelectorAll<HTMLElement>(INLAY_WRAPPER_SELECTOR);
      for (const wrapper of wrappers) clearInlayDecoration(wrapper);
    }
    activeCandidatePickers.clear();
    removeQuoteGlobalStyle();
    removeStyle();
    roleCache = null;
    roleRequest = null;
  };
}
