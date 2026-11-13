# src/backend/analysis — asset analysis, workspace and outfit images (Asset Maid port; analysis slice from 0.9.91)

> The generated slice now comes from Asset Maid 0.9.91 with the port's 0.9.90 names (`src/engine/core/tooling/README.md`).
> The unit names in the text below were written for 0.9.89 and several differ today: trust the `// AM <name>` tags in
> `core/analysis-core.ts`. Regenerate from the repository root with
> `bun src/backend/analysis/core/tooling/slice-analysis.mjs src/backend/analysis/core/tooling/slice-config.json`.

Owner: `analysis` (sub-agent of the backend lead). Specs: `spec/data.md` Part A + "Asset analysis", `spec/ui.md` §1-§3,
`spec/novelai.md` §9 F. RPC handlers: `src/backend/rpc/handlers/workspace.ts`.

## How it is built

- `core/analysis-core.ts` is a **generated verbatim slice** of AM 0.9.89.6 (`E:/Asset-Maid-upstream/pretty-versions/0.9.89.6.as95.js`, top-level names translated to 0.9.89.5 as described in `src/engine/README.md`;
  same slicer as `src/engine/core`, copy in `core/tooling/`; it also follows top-level `for (var ...)` declarations and
  rewrites `const x = globalThis` to `Object(globalThis)` for Lumiverse's backend fetch scan). Roots: the analysis
  controllers `Gwt` (character prompts), `f0t` (references), `o0t` (persona), `C0t` (asset matching), `Pwt` (metadata
  check), `wwt` (artist extraction), `dhe` (reclassification, prompts collection `R8e`), `Fve`/`Kve` (representative
  pick), the metadata reader `s3e`, the image loader `Qit`, the asset index `X$e` + matching `G2e`, and helpers (`ib`,
  `Loe`, `y_`, `nb`, `Ci`, `J2`, `PH`, `XOt`, `uN`, ...). Prompts, schemas and algorithms are therefore byte-identical.
  `FQ` is imported from the engine core. 0.9.88 names: see `git log` (the 0.9.88 config is in history).
  Regenerate: copy `core/tooling/slice-analysis.mjs` to `asset-maid-port/scratch/engine/slice-analysis95.mjs` (it needs
  that folder's `acorn`/`eslint-scope`), fill `<worktree>`/`<scratch>` in `core/tooling/slice-config.json`
  (`slice-config.auto-core.json` for `pipeline/core/auto-core.ts`) and run `node slice-analysis95.mjs <config>`.
  Never edit the generated file.
- `data/` holds unchanged copies of `extract/data/analysis-*` and `extract/llm/*` (prefixed `llm-`). `data.test.ts`
  checks them against the extracts and against the slice output (`lat`, `cat`, prompt constants, contracts).
- `bridge/` adapts the port services to the AM dependency graph (AM boot L180596-180714):
  - `config-store.ts`: AM config store `N` over `buildRuntimeConfig(global, document)` + metadata cache. Updates apply in
    memory and are written back per changed map entry: scoped `characterPrompt` fields -> character document,
    global ones (artistPrompts, personaSettings) -> `storage.updateConfig`, `assetMetadataAvailability` ->
    `characters/<id>/metadata-cache.json`, `animaArtists.selection.bySourceId[id]` -> `document.animaArtistId`.
    `mutateAmConfig` = one-shot RPC write with an AM mutator.
  - `asset-index.ts`: AM `priorityAssets` (reduced `wot`): pages via `Hnt`, `resolveSelection`, thumbnails.
  - `session.ts`: source catalog (`rI(source, customCharacters, "all")`), persona catalog (`Trt` shape, key = persona id),
    metadata reader, image loader, reference crops, analyzer client over `services.llm.complete`
    (`visionFallback: "fail"`; an `unsupported` failure becomes an error AM `oP` treats as "image input not supported",
    so AM's own metadata/text fallback runs). `storage:<path>` asset keys = userStorage uploads / crops.
- `runs.ts`: one function per `AnalysisKind`, each drives the verbatim controller and maps its snapshot to
  `analysis.progress` (English label + `labelKo`, done/total, retry, row notices) and `analysis.finished`.
- `jobs.ts`: job registry (one run per kind and character, AbortController, events). `labels.ts`: English labels.
- `workspace.ts`: roster projection (`FT`/`R6`), roster / module / recognition key (`Ife`) writes, custom characters
  (`A5e` store semantics + AM error texts with `messageKo`), prompts tab writes (`saveForms` guard = `formCollectionRevision`).
- `assets.ts`: asset list (filters all/candidate/chat/outfit/original/generated, cursor = offset), selections and
  references (`Hy`), metadata inspect, meta-check record delete, uploads (host image, fallback userStorage), crops.
- `outfit.ts`: outfit / reference image generation (`fOt`/`hOt` recipe, 832x1216, history of 8 per target in
  `characters/<id>/outfit-images.json` / `config/persona-outfit-images.json`, add/replace save with revision guard).
- `index.ts`: `createAnalysisModule(services)` -> `{ analysis }` (declared into `BackendModules`).

## Kinds

| kind | AM | notes |
|---|---|---|
| character-prompts | `Gwt.analyzePrompts` | `promptKeys` = UI order only (AM Assets tab); targets = registered + checked rows; nothing selected -> error (AM 0.9.89.5 throws) |
| references | `f0t.analyzeReferences`; text mode -> `Gwt` with explicit keys | Prompts tab |
| persona | `o0t.analyze` (`assetSelection: "analysis"`) | `personaIds` |
| asset-matching | `C0t.analyzeMatching` | `force`, `promptKeys` -> `onlyPromptKeys`; progress = phase units while running |
| metadata-check | `Pwt.analyzeMetadata` | stealth (alpha LSB) metadata is not read in the worker (no `createImageBitmap`) |
| artist-extraction | `wwt.extractArtistPrompt` | `asset` sets `artistExtractionAssetBySourceId` first |
| representative-pick | `Fve` + toast `ewt` | no LLM |
| reclassification | `dhe` + `Ddt`/`oIt` adapters (0.9.89.5 L107990 / L149087) | `promptKeys` or `personaIds`; checked areas = reference analysis checks |
| charx-regex | `h0t.analyzeRegex` | scripts: host `regex_scripts` (character scope) else card `extensions.regex_scripts`; none -> no-evidence. Manual edit: `charxRegex.setDetectors` |
| unique-tag-search | dropped | `unsupported` |

## Gaps / TODO
- Persona reference targets need a character id (AM `sourceScopes`): `assets.setReference` uses
  `target.characterId` when present, else the active chat's character (contract has no field yet).
- Outfit images: non-artist weight is applied to the request texts (AM `Cut`); ComfyUI reference uses
  `comfy.sourceImage` (no workflow role mapping). Generated outfit images are not added to the character gallery.
- `uniqueTags.apply` is implemented; the Danbooru search itself is not.
