/**
 * Chat-side stylesheet (injected with ctx.dom.addStyle). Ported from Asset Maid's chat runtime CSS
 * (extract/ui/chat-runtime.css: `gPt` footer, `vbt` edge controls, `kq` toasts + count panel, `LIe` error dialog).
 * Every selector is anchored on our own markup: `.ii-am-root` containers we render, or our baked
 * `.inlay-illustrator-frame` / `[data-inlay-illustrator]` blocks. Host elements are never styled.
 * Colours use Lumiverse tokens where one exists, with Asset Maid's values as fallbacks.
 */
export const CHAT_SIDE_CSS = String.raw`
.ii-am-root.ii-am-chat-footer,
.ii-am-root.ii-am-chat-edge,
.ii-am-root.ii-am-chat-pending,
.ii-am-root.ii-am-chat-runtime-host {
  --ii-am-chat-fg: #f1e5cf;
  --ii-am-chat-muted: #bca98c;
  --ii-am-chat-hover: #fff5df;
  --ii-am-chat-control-bg: rgba(13, 10, 12, .42);
  --ii-am-chat-depth-bg: rgba(13, 10, 12, .72);
  --ii-am-chat-shell-bg: rgba(33, 29, 32, .86);
  --ii-am-chat-blur: 24px;
  --ii-am-chat-retry-icon: #7f373a;
  --ii-am-chat-font: 600 12px/1.25 var(--lumiverse-font-family, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
}

/* ---------------- footer (AM gPt) ---------------- */
.ii-am-root.ii-am-chat-footer {
  position: relative !important;
  display: flex !important;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  width: max-content !important;
  max-width: 100%;
  min-height: 40px;
  margin: .75rem auto .1rem 0 !important;
  padding: 4px !important;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ii-am-chat-fg);
  font: var(--ii-am-chat-font);
  text-align: left;
}
.ii-am-root.ii-am-chat-footer::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: var(--ii-am-chat-shell-bg);
  backdrop-filter: blur(var(--ii-am-chat-blur));
  -webkit-backdrop-filter: blur(var(--ii-am-chat-blur));
  pointer-events: none;
}
.ii-am-root.ii-am-chat-footer > * { position: relative; z-index: 1; }
.ii-am-root.ii-am-chat-footer button {
  display: inline-grid;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  place-items: center;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: var(--ii-am-chat-control-bg);
  color: var(--ii-am-chat-fg);
  font: 600 16px/1 ui-sans-serif, system-ui, sans-serif;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background .14s ease, color .14s ease;
}
.ii-am-root.ii-am-chat-footer button:hover { background: color-mix(in oklab, var(--ii-am-chat-control-bg) 90%, white 10%); color: var(--ii-am-chat-hover); }
.ii-am-root.ii-am-chat-footer button:focus-visible { outline: none; background: color-mix(in oklab, var(--ii-am-chat-control-bg) 84%, var(--ii-am-chat-fg) 16%); color: var(--ii-am-chat-hover); }
.ii-am-root.ii-am-chat-footer button:active { background: color-mix(in oklab, var(--ii-am-chat-control-bg) 82%, black 18%); }
.ii-am-root.ii-am-chat-footer .ii-am-chat-footer__generate svg { display: block; width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; pointer-events: none; }
.ii-am-root.ii-am-chat-footer .ii-am-chat-footer__retry-icon,
.ii-am-root.ii-am-chat-footer .ii-am-chat-footer__retry-icon * { stroke: var(--ii-am-chat-retry-icon); }
.ii-am-root.ii-am-chat-footer .ii-am-chat-footer__generate .ii-am-chat-footer__retry-icon { stroke: #e07a7f; }
.ii-am-root.ii-am-chat-footer .ii-am-chat-footer__revisions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border-radius: 8px;
  background: var(--ii-am-chat-control-bg);
}
.ii-am-root.ii-am-chat-footer .ii-am-chat-footer__revision-action { width: 24px; background: transparent; }
.ii-am-root.ii-am-chat-footer .ii-am-chat-footer__revision-count {
  display: grid;
  min-width: 32px;
  height: 32px;
  place-items: center;
  color: var(--ii-am-chat-muted);
  font: var(--ii-am-chat-font);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ii-am-root.ii-am-chat-footer .ii-am-chat-footer__empty { padding: 0 8px; color: var(--ii-am-chat-muted); font: var(--ii-am-chat-font); }
.ii-am-root .ii-am-chat-spinner {
  display: block;
  width: .9rem;
  height: .9rem;
  box-sizing: border-box;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 999px;
  animation: ii-am-chat-spin .8s linear infinite;
}
@media (max-width: 640px) {
  .ii-am-root.ii-am-chat-footer { min-height: 48px; }
  .ii-am-root.ii-am-chat-footer .ii-am-chat-footer__generate { width: 40px; height: 40px; }
  .ii-am-root.ii-am-chat-footer .ii-am-chat-footer__revision-action { width: 36px; height: 40px; }
  .ii-am-root.ii-am-chat-footer .ii-am-chat-footer__revision-count { min-width: 28px; height: 40px; }
}

/* ---------------- pending placeholder (AM hbt) ---------------- */
.ii-am-root.ii-am-chat-pending {
  display: grid !important;
  justify-items: center;
  gap: 6px;
  margin: 10px 0 0 !important;
  padding: 0 !important;
  color: var(--ii-am-chat-muted);
  font: var(--ii-am-chat-font);
}
.ii-am-root.ii-am-chat-pending .ii-am-chat-pending__frames { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; width: 100%; }
.ii-am-root.ii-am-chat-pending .ii-am-chat-pending__frame {
  position: relative;
  display: block;
  width: min(var(--ii-am-chat-image-width, 70%), 240px);
  aspect-ratio: 832 / 1216;
  max-height: 340px;
  overflow: hidden;
  border-radius: 8px;
}
.ii-am-root.ii-am-chat-pending .ii-am-chat-pending__skeleton {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: linear-gradient(110deg, rgba(241, 229, 207, .05) 20%, rgba(241, 229, 207, .12) 40%, rgba(241, 229, 207, .05) 60%) 0 0 / 220% 100%, rgba(12, 10, 14, .18);
  backdrop-filter: blur(18px) saturate(1.18);
  -webkit-backdrop-filter: blur(18px) saturate(1.18);
  animation: ii-am-chat-shimmer 1.6s linear infinite;
}
.ii-am-root.ii-am-chat-pending .ii-am-chat-pending__spinner {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  border-width: 3px;
  border-color: rgba(242, 223, 204, .26);
  border-top-color: #f2dfcc;
  color: #f2dfcc;
}
.ii-am-root.ii-am-chat-pending .ii-am-chat-pending__label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------------- image edge controls (AM Ybe / vbt) ---------------- */
.ii-am-root.ii-am-chat-edge {
  --ii-am-chat-control-fg: #f1e5cf;
  position: absolute !important;
  inset: 0 !important;
  z-index: 16;
  margin: 0 !important;
  padding: 0 !important;
  pointer-events: none;
  opacity: 0;
  transition: opacity .16s ease;
}
/* Host prose CSS caps message images (max-height: var(--prose-image-max-height, 240px)); blocks baked before the inline
   max-height:none fix still need this override. */
.inlay-illustrator-frame > img.inlay-illustrator-img { max-height: none !important; max-width: 100% !important; height: 100% !important; }
.inlay-illustrator-frame:hover .ii-am-root.ii-am-chat-edge,
.ii-am-root.ii-am-chat-edge:focus-within,
.ii-am-root.ii-am-chat-edge[data-ii-busy="true"] { opacity: 1; }
@media (hover: none) { .ii-am-root.ii-am-chat-edge { opacity: .9; } }
.ii-am-root.ii-am-chat-edge[data-ii-dimmed="true"] button { opacity: .42; filter: grayscale(1); cursor: wait; }
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__action {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 17;
  display: flex;
  width: min(72px, 22%);
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ii-am-chat-control-fg);
  cursor: pointer;
  pointer-events: auto;
}
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__action > span {
  display: grid;
  width: 38px;
  height: 56px;
  place-items: center;
  border-radius: 999px;
  background: rgba(32, 21, 27, .38);
  box-shadow: 0 4px 14px rgba(0, 0, 0, .32);
  color: var(--ii-am-chat-control-fg);
  font: 800 24px/1 Consolas, Menlo, monospace;
  text-shadow: 0 1px 5px rgba(0, 0, 0, .72);
}
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__action:hover > span { filter: brightness(1.12); background: rgba(72, 33, 42, .72); }
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__action:focus-visible { outline: none; }
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__action:focus-visible > span { outline: 2px solid var(--ii-am-chat-control-fg); }
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__action--previous { left: 0; }
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__action--next { right: 0; }
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__bottom {
  position: absolute;
  left: 50%;
  bottom: 10px;
  z-index: 18;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transform: translateX(-50%);
  pointer-events: none;
}
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__count {
  display: flex;
  min-width: 42px;
  height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
  border-radius: 999px;
  background: rgba(32, 21, 27, .72);
  box-shadow: 0 8px 20px rgba(0, 0, 0, .24);
  color: var(--ii-am-chat-control-fg);
  font: 700 12px/1 Consolas, Menlo, monospace;
  white-space: nowrap;
}
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__regenerate {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(32, 21, 27, .72);
  box-shadow: 0 8px 20px rgba(0, 0, 0, .24);
  color: var(--ii-am-chat-control-fg);
  font: 15px/1 Consolas, Menlo, monospace;
  cursor: pointer;
  pointer-events: auto;
}
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__regenerate:hover { background: rgba(72, 33, 42, .96); }
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__loading {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 20;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 999px;
  background: rgba(32, 21, 27, .6);
}
.ii-am-root.ii-am-chat-edge .ii-am-chat-edge__spinner {
  display: block;
  width: 26px;
  height: 26px;
  box-sizing: border-box;
  border: 3px solid rgba(242, 223, 204, .26);
  border-top-color: #f2dfcc;
  border-radius: 999px;
  animation: ii-am-chat-spin .8s linear infinite;
}
@media (max-width: 640px) {
  .ii-am-root.ii-am-chat-edge .ii-am-chat-edge__regenerate { width: 36px; height: 36px; }
  .ii-am-root.ii-am-chat-edge .ii-am-chat-edge__count { height: 32px; }
}

/* ---------------- runtime host: toasts + count panel + error dialog (AM kq / LIe) ---------------- */
.ii-am-root.ii-am-chat-runtime-host {
  position: fixed;
  right: 18px;
  /* Above the host composer: src/frontend/composer-inset.ts measures it (fallback 66px). */
  bottom: var(--ii-am-composer-inset, 66px);
  z-index: 9989;
  display: block;
  width: min(380px, calc(100vw - 36px));
  pointer-events: none;
  font: 500 12px/1.35 var(--lumiverse-font-family, ui-sans-serif, system-ui, sans-serif);
  color: var(--ii-am-chat-fg);
}
.ii-am-root.ii-am-chat-runtime-host[data-ii-zoom="true"] { z-index: 9996; }
.ii-am-root.ii-am-chat-runtime-host[data-ii-overlay="true"] { display: none; }
.ii-am-root .ii-am-chat-runtime { display: grid; gap: 8px; pointer-events: none; }
.ii-am-root .ii-am-chat-toast-stack {
  display: grid;
  min-width: 0;
  max-height: calc(100vh - 140px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  gap: 8px;
  pointer-events: none;
}
.ii-am-root .ii-am-chat-toast-stack::-webkit-scrollbar { display: none; }
.ii-am-root .ii-am-chat-toast {
  --ii-am-toast-soft: rgba(241, 229, 207, .09);
  --ii-am-toast-fill: rgba(241, 229, 207, .10);
  --ii-am-toast-lead: rgba(241, 229, 207, .16);
  position: relative;
  min-height: 36px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--ii-am-chat-shell-bg);
  color: var(--ii-am-chat-fg);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  pointer-events: auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
}
.ii-am-root .ii-am-chat-toast[data-ii-tone="success"] { --ii-am-toast-soft: rgba(84, 158, 112, .14); --ii-am-toast-fill: rgba(84, 158, 112, .16); --ii-am-toast-lead: rgba(84, 158, 112, .22); }
.ii-am-root .ii-am-chat-toast[data-ii-tone="warning"] { --ii-am-toast-soft: rgba(196, 148, 72, .14); --ii-am-toast-fill: rgba(196, 148, 72, .16); --ii-am-toast-lead: rgba(196, 148, 72, .22); }
.ii-am-root .ii-am-chat-toast[data-ii-tone="danger"] { --ii-am-toast-soft: rgba(186, 84, 102, .16); --ii-am-toast-fill: rgba(186, 84, 102, .18); --ii-am-toast-lead: rgba(186, 84, 102, .24); }
.ii-am-root .ii-am-chat-toast__progress {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--ii-am-toast-progress, 0%);
  background: linear-gradient(90deg, var(--ii-am-toast-soft) 0%, var(--ii-am-toast-fill) 64%, var(--ii-am-toast-lead) 100%);
  transition: width .28s cubic-bezier(.4, 0, .2, 1);
  pointer-events: none;
}
.ii-am-root .ii-am-chat-toast__content {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) 28px;
  align-items: center;
  min-height: 36px;
  padding: 4px 5px 4px 12px;
  gap: 8px;
}
.ii-am-root .ii-am-chat-toast__content[data-ii-indexed="true"] { grid-template-columns: 14px minmax(0, 1fr) max-content auto; }
.ii-am-root .ii-am-chat-toast__spinner {
  width: 14px;
  height: 14px;
  justify-self: center;
  box-sizing: border-box;
  border: 2px solid #fff3dd;
  border-bottom-color: transparent;
  border-radius: 999px;
  animation: ii-am-chat-spin .75s linear infinite;
}
.ii-am-root .ii-am-chat-toast:not([data-ii-tone="running"]) .ii-am-chat-toast__spinner { animation: none; }
.ii-am-root .ii-am-chat-toast[data-ii-tone="success"] .ii-am-chat-toast__spinner { position: relative; border-color: #a9e6bd; }
.ii-am-root .ii-am-chat-toast[data-ii-tone="success"] .ii-am-chat-toast__spinner::after {
  content: "";
  position: absolute;
  top: 1px;
  left: 3px;
  width: 4px;
  height: 7px;
  border: solid #a9e6bd;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.ii-am-root .ii-am-chat-toast[data-ii-tone="warning"] .ii-am-chat-toast__spinner { border-color: #e1b86d; }
.ii-am-root .ii-am-chat-toast[data-ii-tone="danger"] .ii-am-chat-toast__spinner { border-color: #efa5ae; color: #efa5ae; text-align: center; font: 700 10px/10px sans-serif; }
.ii-am-root .ii-am-chat-toast[data-ii-tone="danger"] .ii-am-chat-toast__spinner::after { content: "!"; }
.ii-am-root .ii-am-chat-toast__copy { display: flex; min-width: 0; align-items: baseline; gap: 7px; white-space: nowrap; }
.ii-am-root .ii-am-chat-toast__message { min-width: 0; flex: 1 1 auto; overflow: hidden; font-weight: 700; text-overflow: ellipsis; }
.ii-am-root .ii-am-chat-toast__detail { min-width: 0; overflow: hidden; color: rgba(241, 229, 207, .68); text-overflow: ellipsis; }
.ii-am-root .ii-am-chat-toast__identifier { color: rgba(241, 229, 207, .68); font: 600 11px/1.2 ui-sans-serif, system-ui, sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ii-am-root .ii-am-chat-toast__actions { display: flex; min-width: 28px; align-items: center; justify-content: flex-end; }
.ii-am-root .ii-am-chat-toast__action {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(241, 229, 207, .7);
  font: 700 15px/1 ui-sans-serif, system-ui, sans-serif;
  cursor: pointer;
  transition: background .14s ease, color .14s ease;
}
.ii-am-root .ii-am-chat-toast__action[data-ii-toast-action="cancel"]::before { content: ""; width: 12px; height: 12px; border-radius: 1px; background: currentColor; }
.ii-am-root .ii-am-chat-toast__action:hover { background: rgba(241, 229, 207, .12); color: #fff8eb; }
.ii-am-root .ii-am-chat-toast__action svg { width: 16px; height: 16px; }
.ii-am-root .ii-am-chat-toast__error-toggle { width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.ii-am-root .ii-am-chat-toast__error-details {
  position: relative;
  z-index: 1;
  max-height: 180px;
  overflow-y: auto;
  padding: 0 12px 10px 34px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.ii-am-root .ii-am-chat-toast__error-details p { margin: 0 0 8px; white-space: pre-wrap; }
.ii-am-root .ii-am-chat-toast__error-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.ii-am-root .ii-am-chat-toast__error-buttons button { padding: 4px 8px; border: 0; border-radius: 6px; background: rgba(255, 255, 255, .08); color: inherit; font: inherit; cursor: pointer; }
.ii-am-root .ii-am-chat-toast__error-buttons button:hover { background: rgba(255, 255, 255, .14); }

/* generation-count panel */
.ii-am-root .ii-am-chat-count {
  position: relative;
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: flex-end;
  color: var(--ii-am-chat-fg);
  font: 600 12px/1.2 ui-sans-serif, system-ui, sans-serif;
  pointer-events: none;
}
.ii-am-root .ii-am-chat-count__panel {
  position: absolute;
  top: 0;
  right: 50px;
  display: flex;
  height: 42px;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  pointer-events: auto;
}
.ii-am-root .ii-am-chat-count__panel::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: var(--ii-am-chat-shell-bg);
  backdrop-filter: blur(var(--ii-am-chat-blur));
  -webkit-backdrop-filter: blur(var(--ii-am-chat-blur));
  pointer-events: none;
}
.ii-am-root .ii-am-chat-count__panel > * { position: relative; z-index: 1; }
.ii-am-root .ii-am-chat-count[data-ii-expanded="false"] .ii-am-chat-count__panel { display: none; }
.ii-am-root .ii-am-chat-count__option,
.ii-am-root .ii-am-chat-count__step-button,
.ii-am-root .ii-am-chat-count__toggle,
.ii-am-root .ii-am-chat-count__scene-button,
.ii-am-root .ii-am-chat-count__menu-item {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ii-am-chat-fg);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background .14s ease, color .14s ease;
}
.ii-am-root .ii-am-chat-count__option { flex: 0 0 auto; width: 42px; height: 32px; border-radius: 8px; background: var(--ii-am-chat-control-bg); font: var(--ii-am-chat-font); }
.ii-am-root .ii-am-chat-count__scene { position: relative; flex: 0 0 auto; }
.ii-am-root .ii-am-chat-count__scene-button { width: auto; min-width: 66px; max-width: 104px; height: 32px; overflow: hidden; padding: 0 8px; border-radius: 8px; background: var(--ii-am-chat-control-bg); font: var(--ii-am-chat-font); white-space: nowrap; }
.ii-am-root .ii-am-chat-count__scene-label { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.ii-am-root .ii-am-chat-count__mode { position: relative; flex: 0 0 auto; }
.ii-am-root .ii-am-chat-count__values { display: flex; min-width: 0; align-items: center; gap: 4px; }
.ii-am-root .ii-am-chat-count__stepper { display: flex; flex: 0 0 auto; align-items: center; border-radius: 8px; background: var(--ii-am-chat-control-bg); }
.ii-am-root .ii-am-chat-count__step-button { width: 24px; height: 32px; border-radius: 9px; font: 600 16px/1 ui-sans-serif, system-ui, sans-serif; }
.ii-am-root .ii-am-chat-count__step-button:disabled { color: rgba(241, 229, 207, .24); cursor: default; }
.ii-am-root .ii-am-chat-count__step-output { display: grid; min-width: 23px; height: 32px; place-items: center; font: var(--ii-am-chat-font); font-variant-numeric: tabular-nums; }
.ii-am-root .ii-am-chat-count__separator { color: var(--ii-am-chat-muted); }
.ii-am-root .ii-am-chat-count__option:hover,
.ii-am-root .ii-am-chat-count__scene-button:hover,
.ii-am-root .ii-am-chat-count__step-button:hover:not(:disabled) { background: color-mix(in oklab, var(--ii-am-chat-control-bg) 90%, white 10%); color: var(--ii-am-chat-hover); }
.ii-am-root .ii-am-chat-count__toggle {
  position: relative;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: var(--ii-am-chat-depth-bg);
  backdrop-filter: blur(var(--ii-am-chat-blur));
  -webkit-backdrop-filter: blur(var(--ii-am-chat-blur));
  font: 700 14px/1 ui-sans-serif, system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  pointer-events: auto;
}
.ii-am-root .ii-am-chat-count__toggle:hover { background: color-mix(in oklab, var(--ii-am-chat-depth-bg) 93%, white 7%); color: var(--ii-am-chat-hover); }
.ii-am-root .ii-am-chat-count__toggle[data-ii-save-status="failed"] { box-shadow: inset 0 0 0 1px rgba(239, 105, 112, .6); }
.ii-am-root .ii-am-chat-count__toggle-icon { display: none; }
.ii-am-root .ii-am-chat-count__menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  z-index: 4;
  display: grid;
  min-width: 132px;
  max-width: min(220px, calc(100vw - 24px));
  max-height: min(352px, calc(100vh - 120px));
  overflow-y: auto;
  padding: 6px;
  border-radius: 8px;
  background: var(--ii-am-chat-depth-bg);
  backdrop-filter: blur(var(--ii-am-chat-blur));
  -webkit-backdrop-filter: blur(var(--ii-am-chat-blur));
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, .35);
}
.ii-am-root .ii-am-chat-count__menu-item { display: flex; width: 100%; min-height: 32px; justify-content: flex-start; padding: 6px 10px; border-radius: 6px; font: var(--ii-am-chat-font); text-align: left; white-space: nowrap; }
.ii-am-root .ii-am-chat-count__menu-item:hover,
.ii-am-root .ii-am-chat-count__menu-item:focus-visible { background: rgba(255, 255, 255, .07); outline: none; }
.ii-am-root .ii-am-chat-count__menu-item[aria-checked="true"] { background: rgba(241, 229, 207, .12); }
.ii-am-root .ii-am-chat-count__menu-item:disabled,
.ii-am-root .ii-am-chat-count__menu-item[aria-disabled="true"] { opacity: .45; cursor: default; }
.ii-am-root .ii-am-chat-count[data-ii-floating="true"] {
  position: fixed;
  left: var(--ii-am-floating-left);
  top: var(--ii-am-floating-top);
  width: 44px;
  height: 44px;
  min-height: 0;
}
.ii-am-root .ii-am-chat-count[data-ii-floating="true"] .ii-am-chat-count__toggle { width: 44px; height: 44px; cursor: grab; touch-action: none; }
.ii-am-root .ii-am-chat-count[data-ii-floating="true"] .ii-am-chat-count__panel {
  position: fixed;
  top: clamp(8px, var(--ii-am-floating-panel-top), calc(100vh - 56px));
  left: clamp(8px, calc(var(--ii-am-floating-left) - 240px), calc(100vw - 340px));
  right: auto;
  height: 48px;
}
.ii-am-root .ii-am-chat-count[data-ii-floating-below="true"] .ii-am-chat-count__menu { top: calc(100% + 6px); bottom: auto; }

/* error dialog */
.ii-am-root .ii-am-chat-error-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(7, 5, 7, .62);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  pointer-events: auto;
}
.ii-am-root .ii-am-chat-error {
  width: min(680px, calc(100vw - 36px));
  max-height: min(76vh, 620px);
  overflow: hidden;
  border: 1px solid rgba(239, 105, 112, .3);
  border-top: 3px solid rgba(215, 184, 111, .9);
  border-radius: 12px;
  background: rgba(27, 22, 25, .98);
  color: #f4ebde;
  box-shadow: 0 28px 80px rgba(0, 0, 0, .58);
}
.ii-am-root .ii-am-chat-error__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 16px 10px; }
.ii-am-root .ii-am-chat-error__heading { display: flex; min-width: 0; align-items: center; gap: 11px; }
.ii-am-root .ii-am-chat-error__icon { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border-radius: 999px; background: rgba(239, 105, 112, .14); color: #ef6970; font: 700 18px/1 sans-serif; }
.ii-am-root .ii-am-chat-error__titles { display: grid; min-width: 0; }
.ii-am-root .ii-am-chat-error__kicker { color: var(--lumiverse-primary, #d7b86f); font-size: 10px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
.ii-am-root .ii-am-chat-error__title { margin-top: 2px; overflow: hidden; font-size: 14px; font-weight: 750; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.ii-am-root .ii-am-chat-error__close { display: grid; width: 32px; height: 32px; flex: 0 0 32px; place-items: center; border: 0; border-radius: 8px; background: transparent; color: #cdbfaf; cursor: pointer; font: 600 20px/1 sans-serif; }
.ii-am-root .ii-am-chat-error__close:hover { background: rgba(255, 255, 255, .07); color: #fff7eb; }
.ii-am-root .ii-am-chat-error__description { margin: 0 16px 10px; padding: 9px 11px; border-radius: 8px; background: rgba(239, 105, 112, .08); color: #ef9ca0; font-size: 12px; line-height: 1.5; }
.ii-am-root .ii-am-chat-error__message {
  max-height: min(48vh, 380px);
  margin: 0 16px 16px;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: rgba(14, 11, 13, .9);
  color: #f4ebde;
  font: 12px/1.55 var(--lumiverse-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .ii-am-root.ii-am-chat-runtime-host { inset: auto 0 0 0; width: auto; }
  .ii-am-root .ii-am-chat-toast-stack {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 56px);
    right: max(12px, env(safe-area-inset-right, 0px));
    left: max(12px, env(safe-area-inset-left, 0px));
    max-height: min(216px, calc(100dvh - 132px));
    gap: 6px;
  }
  .ii-am-root .ii-am-chat-toast { min-height: 44px; }
  .ii-am-root .ii-am-chat-toast__content { grid-template-columns: 16px minmax(0, 1fr) 44px; min-height: 44px; padding: 4px 4px 4px 12px; gap: 6px; }
  .ii-am-root .ii-am-chat-toast__action { width: 44px; height: 44px; }
  .ii-am-root .ii-am-chat-count:not([data-ii-floating="true"]) { position: fixed; right: max(12px, env(safe-area-inset-right, 0px)); bottom: var(--ii-am-composer-inset, calc(64px + env(safe-area-inset-bottom, 0px))); display: grid; justify-items: end; }
  .ii-am-root .ii-am-chat-count:not([data-ii-floating="true"]) .ii-am-chat-count__panel { top: auto; right: 0; bottom: calc(100% + 8px); height: 48px; max-width: calc(100vw - 24px); overflow-x: auto; scrollbar-width: none; }
  .ii-am-root .ii-am-chat-count[data-ii-menu="count"] .ii-am-chat-count__panel,
  .ii-am-root .ii-am-chat-count[data-ii-menu="scene"] .ii-am-chat-count__panel { overflow: visible; }
  .ii-am-root .ii-am-chat-count__option { width: 44px; height: 40px; }
  .ii-am-root .ii-am-chat-count__step-button { width: 36px; height: 40px; }
  .ii-am-root .ii-am-chat-count__step-output { min-width: 28px; height: 40px; }
  .ii-am-root .ii-am-chat-count__menu-item { min-height: 44px; font-size: 14px; }
  .ii-am-root .ii-am-chat-count__toggle { grid-auto-flow: column; width: auto; min-width: 44px; height: 44px; padding: 0 10px; gap: 5px; }
  .ii-am-root .ii-am-chat-count__toggle-icon { display: grid; width: 16px; height: 16px; place-items: center; color: var(--ii-am-chat-muted); }
  .ii-am-root .ii-am-chat-count__toggle-icon svg { display: block; width: 16px; height: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .ii-am-root .ii-am-chat-spinner,
  .ii-am-root .ii-am-chat-toast__spinner,
  .ii-am-root .ii-am-chat-edge__spinner,
  .ii-am-root .ii-am-chat-pending__skeleton { animation: none; }
  .ii-am-root .ii-am-chat-toast__progress { transition: none; }
}
@keyframes ii-am-chat-spin { to { transform: rotate(360deg); } }
@keyframes ii-am-chat-shimmer { to { background-position: -220% 0, 0 0; } }
`;

/** Selector prefixes every rule must start from (checked by tests). */
export const CHAT_SIDE_SELECTOR_ANCHORS = [".ii-am-root", ".inlay-illustrator-frame"] as const;
