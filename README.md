# Inlay Illustrator

Lumiverse extension for persistent, context-aware character image generation.

## Main features

- Persistent character image generation across a chat
- Dynamic visual memory for returning characters, including base attire
- Image prompts generated from current and recent chat context
- Progressive illustration slots that fill as each image finishes without changing paragraph order
- Per-chat FIFO scheduling, scoped progress, duplicate suppression, and cooperative cancellation
- Manual Creative concept exploration, visual-novel-style Static, action-focused Dynamic, or Original-style single-character Asset generation
- Optional Adaptive Mode that selects Creative, Static, or Dynamic independently for each illustration; Asset remains manual-only
- Identity-safe Creative candidate slates for objects, environments, shadows, silhouettes, spatial details, and non-identifying fragments
- Atomic Anima composition, structured environments, and ComfyUI-friendly prompt output
- Image lightbox with prompt metadata, fresh-seed rerolls, and per-image sidecar reruns
- Optional activated-lorebook context with macro resolution, compact first-pass references, and full-context retry
- Configurable maximum parser token budget with automatic allowances for reasoning-heavy sidecars

## Install from source

Clone or download this repository into your Lumiverse extension data folder:

```powershell
data\extensions\inlay_illustrator\repo
```

The built extension files are included in `dist/`, so no build step is required for normal installation.

## Development

```powershell
$env:BUN_INSTALL_CACHE_DIR = "$PWD\.cache\bun"
bun install --frozen-lockfile
bun run verify
bun run build
```

`verify` runs the Bun test suite and strict TypeScript checking. `build` type-checks
the runtime sources, then bundles the backend and frontend entrypoints into `dist/`.
