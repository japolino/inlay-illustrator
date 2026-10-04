# Third-party notices

## Asset Maid

Inlay Illustrator is being rebuilt as a port of the RisuAI plugin **Asset Maid** (version 0.9.88) to Lumiverse.

- Source: https://github.com/acahaAM/Asset-Maid
- License: the Asset Maid repository does not publish a license file. No license terms are stated there, so no license is claimed or granted here for material derived from it.
- The port reproduces Asset Maid's behaviour, prompts, data shapes and defaults (see `docs/ARCHITECTURE.md`). It replaces RisuAI APIs with Lumiverse Spindle APIs. No endorsement by the original author is implied.

## Bundled runtime libraries

- Preact (https://preactjs.com), MIT license. Bundled into `dist/frontend.js`.
- Tailwind CSS (https://tailwindcss.com), MIT license. Used at build time; its generated utility CSS is bundled into `dist/frontend.js`.

## Removed material

Earlier versions bundled material derived from Lightboard 4.5.3 (CC BY-NC-SA 4.0) and used `@toon-format/toon` (MIT). Both were removed with the Lightboard pipeline in 0.10.0.
