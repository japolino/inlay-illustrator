# Inlay Illustrator

Lumiverse extension for persistent, context-aware character image generation.

## Main features

- Persistent character image generation across a chat
- Dynamic visual memory for returning characters, including base attire
- Image prompts generated from current and recent chat context
- Inline illustration batches attached to chat messages
- Manual Creative concept exploration, visual-novel-style Static, or action-focused Dynamic perspective selection
- Optional Adaptive Mode that selects a perspective independently for each illustration
- Creative candidate slates with weighted selection, authoritative crops, and visible-only tag projection without modifying persistent character memory
- Atomic Anima composition, structured environments, and ComfyUI-friendly prompt output
- Image lightbox with prompt metadata, fresh-seed rerolls, and per-image sidecar reruns
- Optional activated-lorebook context with macro resolution, compact first-pass references, and full-context retry

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
