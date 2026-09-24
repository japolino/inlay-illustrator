# Inlay Illustrator

Lightboard 4.5.3 illustration and comic generation adapted to Lumiverse.

- Source-derived TOON scene descriptors, camera and appearance controls, and optional key visuals.
- Original jailbreak methods, prefills, planning modes, tag splitting, Japanese output, refinement passes and response repair.
- Saved style presets with selection, editing, renaming and deletion; NovelAI and ComfyUI prompt formatting.
- Lumiverse character, persona and activated lorebook context, plus recent descriptor history.
- Dedicated reference portraits for character continuity. Reference images are generated separately and never taken from chat illustrations.
- Immediate generation or prepare-first mode, progressive delivery, gallery, lightbox prompt editing and rerolls.
- NovelAI connection/profile detection and ComfyUI workflow selection.
- Existing saved images and legacy rerolls remain readable.

## Setup

Install this repository's `staging` branch as a Lumiverse extension. Built entrypoints are included in `dist/`.

1. Select a connection in **Parser and context**. An empty model uses its default model.
2. Select an image connection in **Generation**. Without an explicit selection, the account default or first available connection is used.
3. Choose a saved style in **Prompt formatting**, or keep the Lightboard default.
4. Use **Generate latest**, or leave **Auto generate** on. Turn off **Generate images immediately** to prepare prompts first, then use **Generate prepared images**.
5. Open an image's lightbox to reroll, reparse, or edit its scene and character prompts.

Reference snapshots are optional and require extra image generations when first created. Enable **Character reference snapshots** to reuse dedicated portraits within a chat. NovelAI uses individual character references; ComfyUI and SwarmUI use one dedicated cast sheet for a multi-character scene. **Refresh snapshots on next generation** starts fresh references.

For ComfyUI references, select a workflow with `init_image` and `denoise` mappings. The workflow must treat zero in the mapped conditioning control as reference-off and support generation without an uploaded source. This preserves cue-living-novel's convention; ordinary sampler denoise is not automatically a reference on/off switch. Strength zero or disabling snapshots sends zero, including when generating the initial portraits.

See [port behavior and compatibility](docs/V453_PIPELINE_PORT.md) and [source attribution](THIRD_PARTY_NOTICES.md).

## Development

```powershell
bun install --frozen-lockfile
bun run verify
bun run build
```

`verify` runs tests and TypeScript checking. `build` checks the runtime and bundles both entrypoints. Tests use mocked host/provider responses; they do not spend image-generation credits. The retained `eval:v376` command evaluates legacy fixtures, not the active 4.5.3 pipeline.
