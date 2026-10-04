# src/backend/analysis — asset analysis, workspace and outfit images (Asset Maid 0.9.88 port)

Owner: `analysis` (sub-agent of the backend lead). Specs: `spec/data.md` Part A + "Asset analysis", `spec/ui.md` §1-§3,
`spec/novelai.md` §9 F. RPC handlers: `src/backend/rpc/handlers/workspace.ts`.

## How it is built

- `core/analysis-core.ts` is a **generated verbatim slice** of `AssetMaid.pretty.js` (same slicer as `src/engine/core`,
  copy in `core/tooling/`; it also follows top-level `for (var ...)` declarations). Roots: the analysis controllers
  `iwt` (character prompts), `Awt` (references), `bwt` (persona), `Uwt` (asset matching), `$vt` (metadata check),
  `Mvt` (artist extraction), `ope` (reclassification), `sve`/`cve` (representative pick), the metadata reader `Int`,
  the image loader `aat`, the asset index `Hnt` + matching `unt`, and helpers (`Hy`, `Ife`, `rI`, `Ky`, `ki`, `g2`, `C7`,
  `uOt`, `xj`, ...). Prompts, schemas and algorithms are therefore byte-identical. `vW` is imported from the engine core.
  Regenerate: `cd asset-maid-port/scratch/engine && node slice-analysis.mjs ../analysis-backend/slice-config.json`.
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
| character-prompts | `iwt.analyzePrompts` | `promptKeys` = UI order only (AM Assets tab); targets = registered + checked rows |
| references | `Awt.analyzeReferences`; text mode -> `iwt` with explicit keys | Prompts tab |
| persona | `bwt.analyze` (`assetSelection: "analysis"`) | `personaIds` |
| asset-matching | `Uwt.analyzeMatching` | `force`, `promptKeys` -> `onlyPromptKeys` |
| metadata-check | `$vt.analyzeMetadata` | stealth (alpha LSB) metadata is not read in the worker (no `createImageBitmap`) |
| artist-extraction | `Mvt.extractArtistPrompt` | `asset` sets `artistExtractionAssetBySourceId` first |
| representative-pick | `sve` + toast `hvt` | no LLM |
| reclassification | `ope` + `Hct`/`v_t` adapters | `promptKeys` or `personaIds`; checked areas = reference analysis checks |
| charx-regex | `Owt.analyzeRegex` (`Lyt`/`Fyt`, system `mPe`) | scripts: host `regex_scripts` (character scope) else card `extensions.regex_scripts`; none -> no-evidence. Manual edit: `charxRegex.setDetectors` |
| unique-tag-search | dropped | `unsupported` |

## Gaps / TODO
- Persona reference targets need a character id (AM `sourceScopes`): `assets.setReference` uses
  `target.characterId` when present, else the active chat's character (contract has no field yet).
- Outfit images: non-artist weight is applied to the request texts (AM `Cut`); ComfyUI reference uses
  `comfy.sourceImage` (no workflow role mapping). Generated outfit images are not added to the character gallery.
- `uniqueTags.apply` is implemented; the Danbooru search itself is not.
