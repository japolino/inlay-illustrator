# Inlay Illustrator

**Work in progress:** the `testing` branch is a port of the RisuAI plugin [Asset Maid](https://github.com/acahaAM/Asset-Maid) (0.9.88) to Lumiverse: scene illustration and a character asset manager with its own full-screen workspace.

The Lightboard pipeline of 0.9.x has been removed. This branch is a skeleton: the extension loads, strips its inlay markup from LLM requests, shows existing illustrations (gallery, lightbox details) and opens the new overlay, but it does not generate images yet.

## Open the workspace

- Drawer tab **Inlay Illustrator** → **Open Inlay Illustrator**.
- Input-bar action **Inlay Illustrator**.
- Floating Inlay button → **Settings**.

## Development

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
```

`build` compiles the scoped Tailwind CSS, type-checks the runtime code and bundles `dist/backend.js` and `dist/frontend.js`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the layout, the toolchain and the CSS scoping rules, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution.
