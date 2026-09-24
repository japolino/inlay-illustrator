# Lightboard 4.5.3 source provenance

Copyright (c) 2026 amonamona. Source license: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), as declared in `illustration/runtime.lua`.

Extracted from the user-provided archives:

- `🔦라이트보드 - 4.5.3.charx`: SHA-256 `91fb006b4892aae99dbd188b5cb3786b15c4fdc1f14c94613f651457a95c3f6e`
- `🔦라이트보드 🌠 삽화 4.5.3.charx`: SHA-256 `21ecb30ebf6012e06ad49dbc8982082dfc72146d8e8d5a559b3d742ec8699a20`

`core/entries.json` and `illustration/entries.json` preserve the lorebook entries. Numbered `.txt` files contain each corresponding entry's content. `toggles.txt` preserves the configuration definitions. `illustration/runtime.lua` contains the source trigger implementation.

The TypeScript adaptation lives in `src/backend/v453/`. Changes replace Risu macros, Lua callbacks, chat variables, image APIs, and inline UI with Lumiverse context loading, storage, provider requests, settings, and lightbox editing. Dedicated reference snapshots are an addition. See `docs/V453_PIPELINE_PORT.md` for the behavior mapping and platform differences.

Reference checkouts inspected, but not included:

- Lumiverse: https://github.com/prolix-oc/Lumiverse/tree/7398fa5f4fc73eaee1aaa767804312765e84ea79
- cue-living-novel: https://github.com/japolino/cue-living-novel/tree/172798841ace60020ac29305e9c473e81f566489
