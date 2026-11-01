# src/engine — Asset Maid 0.9.90 core (pure, deterministic, parity-tested)

The engine is a faithful port of Asset Maid's pure core: the NovelAI V5 catalog and Maid Atelier presets, the
directing document, the V5 rule runtime, analyzer request building and response recovery, prompt composition and
provider prompt codecs, V5 continuity, paragraph slots and the lenient JSON parser. It makes **no host calls**. Every
effect (LLM call, image generation, storage, clock, randomness) is injected.

0.9.90 removed V4.5 (`v4-5` profile, rule-IR prompt compiler, V4.5 catalog), local state accumulation, Chan Server and
the NSFW prefix (replaced by a per-source fixed rating). The port follows: there is no `v45/` area any more.

## How the port is built (read this first)

- `core/asset-maid-core.ts` is **generated**. It is a verbatim slice of the ORIGINAL AM 0.9.90 bundle
  (`0.9.90.p120.js`: prettier 3.7.4, width 120, original minified names; there is no rename layer any more), made by
  `core/tooling/slice.mjs` (acorn + eslint-scope) with `core/tooling/slice-config.json` (174 roots, 140 renames).
  The slicer emits the full top-level dependency closure of the roots in original order: **1715 declarations,
  36381 lines** (0.9.89.6: ~2450 / ~54k), including the data literals (`Gl`, `Od`, `nw`, prompt texts). Algorithms,
  prompt texts and data tables are byte-identical by construction.
- Only top-level identifiers listed in `renames` get readable names; the semantic names are the same as in the 0.9.89
  port wherever the concept still exists. Every other unit is exported under its **p120 name**. Every declaration has the
  comment `// AM <p120 name> @<p120 line>`. `core/names.json` lists every unit (`orig`, `name`, `line`).
  Beware: p120 reuses short names for different functions than 0.9.89 did (e.g. `Vi` is now isAnimaFlat, `pbt` is now
  the split detail payload) — always check `names.json` before importing a minified name.
- `Date.now`, `Math.random`, `crypto.*` and `performance.now` in the slice are rewritten to `amEnv.*` (`core/env.ts`).
  `setEngineEnv(source)` / `withEngineEnv(source, fn)` make runs deterministic.
- The area folders (`context/ v5/ compose/ continuity/ text/`) are **typed facades** over the core. They mirror Asset
  Maid's runtime shapes and field names; they do not re-implement algorithms (the few compositions of core calls, e.g.
  `buildV5AnalyzerRequest`, `planV5Scene`, `commitContinuityCheckpoint`, mirror inline code of the original and are
  parity-tested against it).
- `core/data/`: `v5-raw-config.json` (`Gl`, raw), `v5-normalized-raw-config.json` (`Od = L2e(Gl)`, the source of the
  bundled catalog), `default-preset.json` (`{builtin: r2, document: nw}`).
- Regenerate the core: `bun core/tooling/slice.mjs core/tooling/slice-config.json` (needs acorn + eslint-scope; the
  `source` / `out` paths are absolute). Do not edit `asset-maid-core.ts` by hand.
- Golden fixtures are recorded from the ORIGINAL 0.9.90 bundle through an eval harness (`am_harness990.js` = p120 with
  the boot call replaced by an eval hook). Generators live in the scratch folder `S/engine-build/gen/**`
  (S = `.../scratchpad/am990`); they use p120 names directly.

## Module map

| Path | Content |
|---|---|
| `index.ts` | Public API: `createAssetMaidEngine`, env injection, area namespaces, convenience re-exports |
| `engine.ts` | `createAssetMaidEngine(options)`: the original boot object graph (p120 @185030-185085) with injected transports |
| `core/` | generated slice, `env.ts`, `names.json`, `data/*.json`, `tooling/` |
| `context/` | analyzer context building `gxt` (+ `pxt`, `jwe`, `mxt`, `OYe`, `Sx`, `xi`, `pO`, ...), `analyzerInput` assembly. **Field-read list: `context/README.md`** |
| `v5/` | V5 raw config + catalog + Atelier presets, directing document, rule runtime + scene compiler + prompt projection, analyzer request/messages/recovery/split, composition (`Ubt`) |
| `compose/` | provider codecs (`UG`, novelai `ygt`, anima-flat `xgt`/`vgt`/`MG`), weights `x4`/`Bft`/`Hft`, fixed rating `XG`/`OG`/`yS`, coordinates `Vye`/`Wye`, size/count/seed, batch executor `vht`, retry records `dj`/`JG` |
| `continuity/` | continuity document `UE`/`B3e`/`K3e`/`G3e`/`j3e`/`BE`, chat store `txt`/`gwe`/`Qyt`/`rxt` + history commit |
| `text/` | paragraph slots `awe`/`lke`, markup strip/detect `fB`/`wM`/`Nme`, lenient JSON `afe` |
| `testing/` | `toPlain` (fixture projection), seeded env, end-to-end driver |
| `__fixtures__/` | golden outputs produced by running the ORIGINAL 0.9.90 bundle |

## Main API

### 1. Whole pipeline: `createAssetMaidEngine(options)` → `{ run(input), cancel(session, reason), prepareAnalysisFor(config), parts, dispose() }`
Same graph as Asset Maid's boot code: `fht` sessions → `Oht`+`Lxe` dispatcher → `vht` batch executor → `c0e` analyzer →
`Ubt` V5 orchestrator with `prepareAnalysis`.

Options (injected host effects):
- `analyzerClient.complete(config, messages, options) → {raw, parsed}` (LLM transport). The V5 analyzer passes
  `options.structuredOutputSchema`, `cachePartition`, `cacheSourceId`, `purpose: "image-generation"`.
- `imageProviders: { novelai?, "comfy-ui"? }`: adapters `{provider, serializesRequests?, generate(request, {signal, onEvent}) → result}`.
  NovelAI request: `{provider, providerRef, prompt, negativePrompt, seed, width, height, maxAttempts, config, forceRating,
  session, references, imageToImage?, queueMeta}`; ComfyUI adds `transport: "direct-workflow", endpoint, profile,
  outfitReference, characterReference, completionTimeoutMs`. The NovelAI adapter must do what AM's NovelAI client does:
  apply the non-artist weight (`applyNonArtistWeightToRequest`, `Hft`, which also returns `sampling`), prepend the fixed
  rating (`prependRatingTag`, `OG`) when `request.forceRating`, and map `config.characterPrompts` to v4 captions
  (`toNovelAICharacterCaptions`).
- `comfyUIReferences.prepare(reference) → {bytes, mimeType, extension}`.
- `getRetryCount`, `getIntervalMs`, `jev` (roster pre-pass), `onSplitResumeState`, `prepareBatchItems` (port addition).
- **New**: `getConfig()` → the current AM config. Every run then does what AM's `rW` does: compile the active Atelier
  preset `aZ(nZ(config.presetCatalog))` (cached by `kind + json`), use an analyzer over that catalog, check the directing
  rules (`C8(zc(config), catalog, selected)`), and apply `yAe(config)` (directions, custom sizes, execution) to the run
  input (`qbt`). `prepareAnalysis` overrides it. Without either, the bundled catalog and the run input's own
  `novelAIConfig.v5UserDirections` are used.
- Removed: `rawCatalogJson`, `resolveProfile` (no V4.5). `onAnalyzerDiagnostic` is accepted but unused.

`run(input)` takes the V5 orchestrator run input. Build it with `context.buildAnalyzerContextInputs` +
`context.assembleAnalyzerInput` + `context.resolveNovelAIRunConfig` / `resolveSourceGenerationSettings`. Fixed rating:
`forceRating = compose.resolveFixedRating(sourceSettings)` (`yS`). Callbacks: `persistGeneratedImage`,
`applyV5Continuity`, `onEvent`, `references`, `seedSetting`, ... It returns `{session, analyzer, continuity, images}`.
`parts`: `v5Analyzer`, `sessions`, `dispatcher`, `executor`, `v5`, `activePreset` (`{key, json, catalog, diagnostics}`).

### 2. Step-by-step pure functions
- Context: `buildAnalyzerContextInputs(input)`, `assembleAnalyzerInput(options)`.
- Presets / directing: `v5.compileAtelierPreset(json)`, `compileActiveAtelierPresetCatalog(presetCatalog)`,
  `resolveAnalysisDirections(config)`, `resolveAnalysisDocument(config)`, `assertDirectingRules`, `applyAnalysisToRunInput`.
- V5 analyzer: `buildV5AnalyzerRequest({runtime, context, continuitySnapshot, userDirections, ...})` →
  `buildV5AnalyzerMessages(request, options)` → `recoverV5AnalyzerResponse(raw, build, options)`. Split analysis:
  `planV5SplitBatches`, `renderV5SplitPhaseSystemInstruction`, `createV5SplitAnalysisRunner`.
- V5 composition: `composeV5Images({run, client | analysis, runtime?, preparedAnalysis?})`; parts `buildV5PromptContext`,
  `createV5NovelAIConfig`, `prepareV5ProviderPrompt`, `finalizeV5ProviderPrompt`, `planV5Scene`.
- Codecs: `formatProviderPrompt`, `applyRatingPolicy`, `prependRatingTag`, weight math, size/count.
- Continuity: `persistV5ContinuityState`, `getLatestContinuityCheckpointSnapshot`, `rebuildContinuityAtMessage`,
  `rebuildContinuityFromChatStore`, `commitContinuityCheckpoint`.
- Text: `splitParagraphSlots`, `buildIllustrationSlots`, `parseLenientJson`.

## Parity coverage (`bun test src/engine`: 207 tests, 1227 assertions)
All golden fixtures come from the ORIGINAL 0.9.90 bundle with the seeded clock/RNG installed on both sides.
- core (5): raw / normalized config dumps, bundled and default-preset catalog hashes + fingerprints, compiler `-v3`.
- engine e2e (3): `createAssetMaidEngine` against the original boot wiring (v5 novelai, v5 comfy-ui comic, and a
  config-driven run with a non-default active Atelier preset, a POV + portrait directing document and fixed rating `nsfw`).
- v5 (111): catalog diagnostics/hashes/vectors + 7 Atelier preset compiles; 6 ratio + 4 directing-document configs;
  10 scene plans + 2 compile edge cases; 12 request variants; 13 fake-client analyzer runs; 13 recoveries; split
  batching/prompts/runner; 12 orchestrator compositions (incl. fixed ratings and a prepared analysis); split
  multi-depiction unit checks.
- compose (18), context (4), continuity (3: two-turn chat sequence through persist / commit / rebuild, checkpoint
  push, normalization), text (63).

## Gaps / known limits
- Fixture inputs reuse the 0.9.89 scenarios (context, prompt context, analyzer responses). Responses were translated to
  the 0.9.90 catalog ids; sexual modifiers/interactions moved to downloadable presets, so recoveries drop them with
  diagnostics. Classic / Comfy Atelier presets are not bundled and not fixture-tested.
- Not covered end to end: JEV roster pre-pass, free character/outfit preparation callbacks, references/img2img with
  real bytes, the NovelAI HTTP body (adapter side).
- The core is `// @ts-nocheck`. Types live in the area facades.
