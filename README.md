# Inlay Illustrator

Inlay Illustrator draws illustrations into your Lumiverse chats and manages the look of your characters. Version 0.10
replaces the old Lightboard pipeline of 0.9.x.

## What it does

- **Scene illustrations.** After a reply, an LLM analyzer reads the message and plans images for its paragraphs. The images
  are generated with your Lumiverse image connection and shown between the paragraphs. The image blocks are removed
  from the prompt before every LLM request, so the model never sees them.
- **Chat controls.** Under each reply: generate, reroll, retry and cancel, plus a revision pager. On each image: previous /
  next image, regenerate, and a click opens the zoom viewer.
- **Zoom viewer.** Image history, prompt editing, character coordinates, seed and size, artist and outfit choice,
  AI prompt edit, delete image or slot, and the accumulated chat state.
- **Character asset manager.** A full-screen workspace per character: roster (lorebook characters, custom characters,
  personas), prompt analysis from text or images, forms and outfits, reference images, outfit image generation,
  artist presets, per-character settings.
- **Count panel** in the chat: how many images per reply (fixed, range or automatic) and the scene preset.

## Setup

1. Install the extension and grant its permissions. `app_manipulation` is a privileged permission: an admin must
   approve it. Without it, the workspace opens in a full-screen float widget (`ui_panels`) instead.
2. Open the workspace and go to **Settings**.
3. **Model settings:** choose the Lumiverse connection profile (and model) for the analyzer. JSON mode and a vision
   model give the best results. Use **Message test** to check it.
4. **Image generation model settings:** choose a Lumiverse image generation connection. NovelAI (V4.5 / V4) gets the full
   feature set (character prompts, coordinates, director references). ComfyUI and other providers get a flat prompt.
5. In the workspace, select the character, register the roster entries you want illustrated, and run the prompt
   analysis on the **Assets** or **Prompts** tab.
6. Automatic generation is on by default. Turn it on or off in the drawer tab.

## Open the workspace

- Drawer tab **Inlay Illustrator** → **Open Inlay Illustrator**.
- Input-bar action **Inlay Illustrator**.
- Click an illustration in a message to open the image viewer (zoom) on that chat's images.

The count toggle above the composer sets how many images a message gets. Its expanded panel also has a button that
illustrates the latest reply (or rerolls it when it has images). The drawer tab sets the screen corner of the toggle and
its toast stack.

### Choose a persona form for one chat

With **Inlay V5** illustration analysis, open the **Inlay Illustrator** drawer tab and use **Persona form**. Select
**Auto** to keep normal scene-based selection, or choose a registered form to restrict this chat's active persona to
that form and its outfits during the next scene analysis. This is separate from the form dropdown used to edit
appearances in the workspace. Choices are saved separately for each chat and persona; global defaults stay unchanged.

To apply a new choice to an existing reply, reroll the whole reply's illustrations. Regenerating an individual image
reuses its saved prompt, including its original form and any prompt edits. Selection does not require an offscreen
persona to appear. If a selected form is deleted, choose another form or Auto before generating. Manual selection
is unavailable for V4.5 analysis and experimental webtoon mode.

## Known gaps

- Unique tag search (Danbooru) and community preset sharing are not available.
- All LLM calls go through Lumiverse connection profiles: there are no direct provider settings, prompt caching or PDF
  transport.
- Settings and character data from 0.9.x are not migrated. Old 0.9.x images stay in the messages but have no controls.
- The UI is in English only.

## Development

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
```

`build` compiles the scoped Tailwind CSS, type-checks the runtime code and bundles `dist/backend.js` (readable) and
`dist/frontend.js` (minified, identifiers kept). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/BACKEND.md](docs/BACKEND.md) and [docs/CONTRACT.md](docs/CONTRACT.md), and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution.

## Credits

The analyzer, prompt engine and workspace design are ported from the RisuAI plugin
[Asset Maid](https://github.com/acahaAM/Asset-Maid) by acahaAM (ported from 0.9.88, kept in step with upstream up to 0.9.89.6).
