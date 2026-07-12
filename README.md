# Inlay Illustrator

Lumiverse extension for persistent, context-aware character image generation.

## Main features

- Persistent character image generation across a chat
- Dynamic visual memory for returning characters, including base attire
- Image prompts generated from current and recent chat context
- Inline illustration batches attached to chat messages
- Asset mode for focused character images
- Anima-style and ComfyUI-friendly prompt output
- Optional lorebook, character, persona, and user instruction context
- Optional Danbooru tag cleanup

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
