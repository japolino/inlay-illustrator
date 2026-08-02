# Inlay Illustrator

Lumiverse extension providing a faithful port of **Inlay Image v3.5 (jalapeno
version)** with a small set of modern quality-of-life features.

## Main features

- Archived v3.5 image and preprocessing instructions loaded directly from the
  tracked original card and resolved with its original mode switches
- Illustration Mode with deterministic one-image-per-paragraph selection
- Restored Asset Mode with one viewer-facing character on a simple white
  portrait background and an independently configurable display width
- Persistent character appearance tags using the v3.5 identity fields
- Default and Anima-compatible prompt assembly, prompt presets, and custom
  positive/negative affixes
- Optional shot quotes displayed in the image lightbox
- Fresh-seed rerolls and one-paragraph sidecar reruns
- Optional user, character, lorebook, and recent-message parser context
- Configurable parser/image connections, models, parameters, retries, and token
  budget

## Install from source

Clone or download this repository into your Lumiverse extension data folder:

```powershell
data\extensions\inlay_illustrator\repo
```

The built extension files are included in `dist/`, so no build step is required
for normal installation.

## Development

```powershell
$env:BUN_INSTALL_CACHE_DIR = "$PWD\.cache\bun"
bun install --frozen-lockfile
bun run verify
bun run build
```

`verify` runs the Bun test suite and strict TypeScript checking. `build`
type-checks the runtime sources, then bundles the backend and frontend
entrypoints into `dist/`.

## Fidelity boundary

The runtime intentionally does not include the later Adaptive/Creative/Static/
Dynamic router, creative candidate generation, atomic composition schema,
semantic camera repair, or previous-visual-state system. The original card's
assistant prefill is also excluded: it fabricated a provider-facing approval
exchange rather than defining image parsing behavior. Provider settings remain
explicit Lumiverse connection/model/parameter controls.
