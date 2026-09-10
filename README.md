# Inlay Illustrator

Lumiverse extension for persistent, context-aware character image generation.

## Main features

- V3.7.6 scene/shot schemas and source-derived conditional parser instructions
- Illustration, single-character Asset, and multi-panel Comic modes
- Source-style scene and character prompt groups, weights, presets, and optional natural-language supplements
- Optional NSFW instruction strengthening, in-image text language, and quote fields
- Plain, placeholder, Base64, and Atbash parser protocols, plus optional source prefill
- Current narrative, optional preceding user messages, character/persona references, and lorebook context
- Persistent character tags with source-style context depth; expired context entries are retained in storage
- NovelAI profile settings and separate positive/negative character channels at the extension request boundary
- Progressive illustration slots, per-chat scheduling, cancellation, and stored-image rerolls
- Existing chat display, floating action button, gallery, and image lightbox

The active image pipeline is being ported from V3.7.6 rather than continuing the
ANIMA-specific planner. See [pipeline scope and compatibility](docs/V376_PIPELINE_PORT.md)
for the source mapping and verification boundary. Native NovelAI character-channel
handling by the Lumiverse host driver still needs end-to-end verification.

## Install from source

Clone or download this repository into your Lumiverse extension data folder:

```powershell
data\extensions\inlay_illustrator\repo
```

The built extension files are included in `dist/`, so no build step is required for normal installation.

## Setup

1. In **Parser and context**, select a parser connection. Leave the model field empty to use that connection's default model.
2. Configure the image provider in Lumiverse's image-generation settings. When no extension-specific connection is saved, Inlay uses the account default or first available image connection.
3. **Auto generate** is enabled by default after setup. Disable it for manual-only use with **Generate latest**. **Cancel** cooperatively stops queued or running work.

If generation does not start, check the panel status first. A setup message means the parser connection is missing. A missing-connection error means a previously selected image connection was deleted or disconnected. Invalid parser parameters must be corrected to a JSON object. Enable **Debug logging** for detailed `[Inlay:stage]` entries.

## Development

```powershell
$env:BUN_INSTALL_CACHE_DIR = "$PWD\.cache\bun"
bun install --frozen-lockfile
bun run verify
bun run eval:v376
bun run build
```

`verify` runs the Bun test suite and strict TypeScript checking. `eval:v376` runs
offline source-derived fixtures. Its pass rate is not a claim of complete source
parity or better image quality. `build` type-checks the runtime sources, then
bundles the backend and frontend entrypoints into `dist/`.
