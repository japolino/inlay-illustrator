# Architecture (Asset Maid port, 0.10.x)

Inlay Illustrator 0.10 is a port of the RisuAI plugin **Asset Maid 0.9.88** to Lumiverse.
The Lightboard pipeline of 0.9.x is gone. This document describes the target layout, the toolchain,
how the overlay UI is mounted and styled, file ownership during the port, and how to build and test.

## Target layout

| Path | Contents |
|---|---|
| `src/engine/**` | Pure, deterministic port of Asset Maid core (no host calls): V5 config/compiler/rule runtime/prompt projection/analyzer request and recovery; V4.5 catalog/analyzer/parsing; compose (rule-IR compile, provider prompt codecs, weights, NSFW prefix, coordinates); continuity; paragraph slots; count policy; lenient JSON parser. Parity-tested against the original bundle. |
| `src/shared/contract/**` | Shared types, defaults and normalizers: config, character document, chat data / Image History, RPC protocol, storage layout. |
| `src/backend.ts` | Backend entry: per-user runtime (services + pipeline + analysis + RPC router), interceptor, host events, fetch bridge. See docs/BACKEND.md. |
| `src/backend/**` | `services/` (storage, LLM, images, image bytes, sources, events, run log), `pipeline/` (chat illustration jobs over the engine), `analysis/` (asset analysis and character features), `rpc/` (router + handler groups), `testing/` (fake host / services). See docs/BACKEND.md. |
| `src/frontend.tsx` | Frontend entry: injects styles, fetch bridge, chat side (footer, history edge controls, zoom), FAB, launchers, overlay controller. |
| `src/frontend/overlay/**` | The Preact overlay app: `controller.tsx` (mount, open/close, Escape), `host.ts` (mount fallbacks), `App.tsx` (shell), `settings/`, `workspace/`, `roster/`, `launcher.tsx`, `labels.ts` (English labels per screen), `ui/` (component kit), `styles/` (Tailwind input + generated CSS). |
| `src/frontend/{rpc,state,chat,zoom}/**` | RPC client, app state layer, chat-side controls, zoom workspace. |
| `src/build/**` | Build-time tools: `build-css.ts` (Tailwind CLI + scoping), `css-scope.ts` (scoper and scope checker). Never bundled. |
| `src/dev/lumiverse-mcp/**` | Optional stdio MCP driver for live testing against a running Lumiverse. |

## Toolchain

- **Bun** runs tests, scripts and the bundler (`bun build`, target browser, ESM). `dist/backend.js` and `dist/frontend.js` are the extension entry points listed in `spindle.json`.
- **TypeScript** (`tsc`, strict, `moduleResolution: Bundler`). `.tsx` files use `jsx: react-jsx` with `jsxImportSource: preact`.
- **Preact** with hooks for the overlay UI. Use `class` or `className`; Preact 11 passes `ref` as a normal prop. Portals use `createPortal` from `preact`.
- **Tailwind CSS v4** via `@tailwindcss/cli`, compiled at build time. `tailwind-merge` resolves class conflicts in `cn()` (Asset Maid's `ut`).
- **Tests** use `bun test`. DOM tests use a private `happy-dom` `Window` (not global registration, because other test files install DOM fakes on `globalThis`).

## Overlay CSS scoping

Source: `src/frontend/overlay/styles/overlay.css`. `bun run css` (`src/build/build-css.ts`) compiles it with the Tailwind CLI and then scopes the result (`src/build/css-scope.ts`):

1. **No preflight.** Only `tailwindcss/theme.css` and `tailwindcss/utilities.css` are imported. A scoped reset in `overlay.css` replaces preflight. It first reverts host author styles inside the root (`all: revert`, except SVG and replaced elements), then applies box-sizing, margins and form-control resets.
2. **Every rule is anchored to `.ii-am-root`.** `:root`/`:host`/`html`/`body` become `.ii-am-root` (so theme variables live on the overlay root). Every other selector gets `.ii-am-root ` as an ancestor. The root element itself carries no utility classes.
3. **Layers are flattened.** Layered CSS always loses to the host's unlayered CSS, so `@layer` blocks are unwrapped in source order.
4. **Keyframes are renamed** to `ii-am-*` (and `animation`/`--animate-*` values follow). `@property` rules stay global.
5. **Check.** The build fails, and `src/build/css-scope.test.ts` fails, if any style rule could match outside the root (root class missing at the top level, or followed by a sibling combinator).

The compiled file `src/frontend/overlay/styles/overlay.generated.css` is git-ignored. `src/frontend/overlay/styles/index.ts` imports it as text (`with { type: "text" }`) and `src/frontend.tsx` injects it with `ctx.dom.addStyle`. Any element with the class `ii-am-root` gets the theme and utilities (the overlay root and the drawer launcher panel use it).

**Theme.** Asset Maid's token names (`extract/ui/theme-tokens.json`: `--color-primary`, `--color-card`, `--color-surface-*`, `--text-2xs`, …) are kept so its className strings work unchanged. Colours, radii and fonts map onto Lumiverse tokens with Asset Maid's values as fallbacks, for example `--color-primary: var(--lumiverse-primary, #d7b86f)` and `--radius-md: var(--lumiverse-radius-md, .375rem)`. Text sizes follow `--lumiverse-font-scale`. Colours without a Lumiverse equivalent (gender, analyzer, coordinate markers, toast gradients) keep Asset Maid's values. `dark:` always applies. `mobile:` is a custom variant for `<=600px` or `pointer: coarse`. Asset Maid's own `max-md:` (`<48rem`) still works.

## Overlay mounting

`createOverlayController` (`src/frontend/overlay/controller.tsx`) mounts the overlay once, on the first open, and keeps the Preact tree alive while hidden.

1. `ctx.ui.mountApp({ position: "app-overlay" })` (permission `app_manipulation`, host z-index 9990).
2. Fallback: `ctx.ui.createFloatWidget({ fullscreen: true, chromeless: true })` (permission `ui_panels`).
3. Last resort: a `div` appended to `document.body`.

The root element is `div.ii-am-root.ii-am-overlay[data-state]`. It is `position: fixed`, sized by `--app-scaled-viewport-width/height` (fallback `100vw`/`100dvh`), padded by the safe-area insets plus `--ii-am-keyboard-inset` (tracked from `visualViewport`). Dialogs, popovers and toasts render through a portal into a layer element inside the root, so they are styled and stay inside the overlay.

**Escape.** While the overlay is open, a capture-phase `keydown` listener on `window` handles Escape that comes from inside the root (or from the page body). It calls `preventDefault` and `stopPropagation` (the host uses Escape to stop generation) and closes only the top-most layer from the `LayerStack` (dialog, popover, select, mobile drawer). With no layer open it closes the overlay.

**Launchers.** The drawer tab is a small status panel with an "Open Inlay Illustrator" button. An input-bar action opens the overlay. The FAB "settings" item opens the overlay on the settings area.

**Mobile.** `useIsMobile()` mirrors the host rule (`<=600px` or `pointer: coarse`). On mobile the rail is hidden, the sidebar becomes a drawer, and the tabs move below the header.

## File ownership during the port

| Worker | Owns |
|---|---|
| `contract` | `src/shared/contract/**` |
| `engine` | `src/engine/**` |
| `scaffold` (this skeleton) | everything else at the time of the skeleton |
| later `backend`, `ui-*` workers | assigned per task by the root agent |

Rules: commit on your own `wt/<area>` branch, never push, never commit `dist/` (the root agent rebuilds it), and do not edit files you do not own (report the needed change instead).

## Build and test

```sh
bun install --frozen-lockfile
bun test                 # all unit tests (includes the CSS scope test, which runs the Tailwind CLI)
bun run typecheck        # tsc over src/** including tests
bun run css              # compile + scope the overlay CSS into overlay.generated.css
bun run build            # css + typecheck:build + bun build -> dist/backend.js, dist/frontend.js
bun run dev:mcp          # optional live-test MCP driver (see src/dev/lumiverse-mcp/README.md)
```

`bun run typecheck` works without the generated CSS (`src/types/assets.d.ts` declares `*.css` text modules). Run `bun run css` (or `bun run build`) before bundling.
