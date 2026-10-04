# src/engine — Asset Maid 0.9.88 core (pure, deterministic, parity-tested)

The engine is a faithful port of Asset Maid's pure core: NovelAI V5 and V4.5 catalogs and rule runtimes,
analyzer request building and response recovery, prompt composition and provider prompt codecs, visual
continuity, paragraph slots and the lenient JSON parser. It makes **no host calls**. Every effect (LLM call,
image generation, storage, clock, randomness) is injected.

## How the port is built (read this first)

- `core/asset-maid-core.ts` is **generated**. It is a verbatim slice of `AssetMaid.pretty.js`, made by
  `core/tooling/slice.mjs` (acorn + eslint-scope). The slicer takes the root declarations listed in
  `core/tooling/slice-config.json` and emits their full top-level dependency closure in original order.
  The current slice has about 2450 declarations and about 54k lines, including the data literals (`vW`, `dg`, prompt texts).
  So algorithms, prompt texts and data tables are byte-identical by construction.
- Only top-level identifiers are renamed (about 145 roots and helpers, map in `core/names.json` → `renames`).
  Local identifiers keep their minified names. Every declaration has the comment `// AM <origName> @<prettyLine>`,
  so the spec line references (`spec/*.md`) still work.
- `Date.now`, `Math.random`, `crypto.*` and `performance.now` in the slice are rewritten to `amEnv.*` (`core/env.ts`).
  The defaults use the real globals. `setEngineEnv(source)` / `withEngineEnv(source, fn)` make runs deterministic.
- The area folders (`context/ v5/ v45/ compose/ continuity/ text/`) are **typed facades** over the core. They mirror
  Asset Maid's runtime shapes and field names (snake_case analyzer fields stay snake_case). They do not
  re-implement algorithms.
- Regenerate the core: `cd C:/Users/eme4/asset-maid-port/scratch/engine && bun slice.mjs`. This reads
  `slice-config.json` there (a copy is in `core/tooling/`). Add roots or renames, regenerate, then run the tests.
  Do not edit `asset-maid-core.ts` by hand.

## Module map

| Path | Content |
|---|---|
| `index.ts` | Public API: `createAssetMaidEngine`, env injection, area namespaces, convenience re-exports |
| `engine.ts` | `createAssetMaidEngine(options)`: the original boot object graph (LOt 180714-180783) with injected transports |
| `core/` | generated slice, `env.ts`, `names.json`, `data/v5-raw-config.json` (shipped built-in V5 raw config), `tooling/` |
| `context/` | analyzer context building `MAt` (+ `y_e`, `NAt`, `Sat`, `Ky`, `ki`, `UAt`, `rI`, `g1t`), `analyzerInput` assembly. **Field-read list: `context/README.md`** |
| `v5/` | V5 raw config validate/compile/hashes, rule runtime + scene compiler + prompt projection, analyzer request/messages/recovery/split, composition (`Ygt`) |
| `v45/` | V4.5 catalog (`vW`/`LLe`), staged analyzer (`Ttt`/`VQe`, `KQe`/`BQe`/`$et`), checkpoints, composition (`Tht`) |
| `compose/` | rule-IR + legacy prompt compiler (`pyt`/`myt`), provider codecs `g2`/`wmt` (novelai-structured, anima-flat `p7`/`Oge`/`bmt`/`Hge`), weights `s2`/`Put`/`Cut`, NSFW `C7`/`d7`, coordinates `Mht`/`c7`/`hge`, size/count/seed, batch executor `lht` |
| `continuity/` | `z9e` apply, `fKe`/`mKe` update, checkpoints `K8`/`Pte`, chat-store + local-lore storage adapter, v5 basis |
| `text/` | paragraph slots `X0e`/`nIe`/`hSt`, markup strip/detect `fH`/`H2`/`sH`, lenient JSON `iQe` |
| `testing/` | `toPlain` (fixture projection), seeded env, end-to-end driver |
| `__fixtures__/` | golden outputs produced by running the ORIGINAL bundle (generators in `asset-maid-port/scratch/engine/**`) |

Each area has its own README with the full API, the original names and line numbers, the inputs read, and its gaps.

## Main API

### 1. Whole pipeline: `createAssetMaidEngine(options)` → `{ run(input), cancel(session, reason), parts, dispose() }`
This is the same graph as Asset Maid's boot code: `hlt` catalog source → `pyt` prompt compiler → `Ttt`+`VQe`
V4.5 analyzer → `nht` sessions → `Iyt`+`Sbe` dispatcher → `lht` batch executor → `Tht` (v4-5) / `Ygt`+`Egt` (v5) →
`Lht` profile switch (`novelAIConfig.analysisProfile === "v5-hybrid"`).

Options (injected host effects):
- `analyzerClient.complete(config, messages, options) → {raw, parsed}`. This is the LLM transport (`CQe(...).complete`,
  spec/llm.md §1.4). `parsed = options.responseMode === "text" ? raw : parseLenientJson(raw)`. Errors carry `code`
  (`ANALYZER_JSON_PARSE` with `analyzerRaw`, `ANALYZER_EMPTY_RESPONSE`, `ANALYZER_REFUSAL`, HTTP `status`, ...). The V5
  analyzer passes `options.structuredOutputSchema` (only Ollama used it in the original).
- `imageProviders: { novelai?, "chan-server"?, "comfy-ui"? }`: adapters `{provider, serializesRequests?, generate(request, {signal, onEvent}) → result}`.
  `request` is the `ImageRequest` union (`compose/types.ts`, spec/pipeline.md §3.9). `result` is `{provider, bytes, mimeType, extension, seed, width, height,
  effectivePrompt?, requestId, providerMetadata}`. **The NovelAI adapter must still do what the original NovelAI client did
  when it built the HTTP body**: apply the non-artist weight (`applyNonArtistWeightToRequest`, `Cut`) and `prependNsfwTag`
  when `request.forceNsfwPrefix ?? nsfwAlwaysEnabled`. It also maps `config.characterPrompts` (+ `useCoords`, `coordinateMode`) to
  v4 captions (`toNovelAICharacterCaptions`).
- `comfyUIReferences.prepare(reference) → {bytes, mimeType, extension}` (original `smt`, reads asset bytes).
- `getRetryCount` (runtime.generationAutoRetryCount, default 5), `getIntervalMs`, `rawCatalogJson` ("" = built-in rule IR),
  `onAnalyzerDiagnostic`, `onSplitResumeState`, `resolveProfile`.

`run(input)` takes the `OrchestratorRunInput` (spec/pipeline.md §3.2). Build it with `context.buildAnalyzerContextInputs` +
`context.assembleAnalyzerInput` + `context.resolveNovelAIRunConfig` / `resolveSourceGenerationSettings` (see `context/README.md`
"Injection points" for the exact call order). The input also has the callbacks the backend implements:
`persistGeneratedImage`, `applyContinuity` / `applyV5Continuity`, `onEvent`, `references`, `seedSetting`, ...
It returns `{session, analyzer, continuity, images: GeneratedImage[]}`.
Notes:
- `novelAIConfig.apiKey` must be non-empty when a NovelAI image is planned (`assertNovelAIApiKey`, "NovelAI API 키가 설정되지 않았습니다.").
  In Lumiverse the key stays in the host connection, so pass a placeholder.
- Asset Maid blanks `fixedPositivePrompt` / `negativePrompt` for Anima providers inside `MAt`, so `buildAnalyzerContextInputs` already does it.

### 2. Step-by-step pure functions (no orchestrator)
- Context: `buildAnalyzerContextInputs(input)`, `assembleAnalyzerInput(options)`.
- V5 analyzer: `v5.buildV5AnalyzerRequest({context, continuitySnapshot, userDirections, ...})` → request build
  (systemInstruction, payload, wire payload, structured schema, local recovery/projection). Then `buildV5AnalyzerMessages(build, imageParts,
  revisionDirection, channels)` → `{messages, cachePartition, wirePayload}`. Then `recoverV5AnalyzerResponse(raw, build, options)` → recovered
  illustrations (scene graphs, diagnostics, status). Directing modes come from `v5.resolveV5UserDirections` / `V5_ANALYSIS_PRESETS`
  (default / pov / ensemble / comic with speech bubbles / landscape / minimum panels, image ratio, custom instruction). Split analysis:
  `planV5SplitBatches`, `renderV5SplitPhaseSystemInstruction`, `createV5SplitAnalysisRunner`.
- V5 composition: `composeV5Images({run, client | analysis})` → per image `{decision, actors, promptPlan, executedPromptPlan,
  novelAIConfig, providerPrompt, promptSegments, request}` + continuity state/snapshot. The parts are also exported: `buildV5PromptContext` (Rgt),
  `buildV5IdentityEntries` (Ngt), `createV5NovelAIConfig` (Wgt), `prepareV5ProviderPrompt` (sbe), `planV5Scene`.
- V4.5 analyzer: `buildV45SingleStageRequest(context)` / `buildV45PresetSelectionRequest`, `buildV45IllustrationMessages` (BQe), `buildV45StageMessages` (KQe),
  the state machine `createV45AnalyzerEngine` (start / accept* / repair), and the runner `createV45AnalyzerRunner(engine, client)`.
- V4.5 composition: `planV45Images` / `composeV45Images(input, {seed, provider})` → per image NovelAI config (`Mht` + `c7` coordinates) and the
  provider prompt for `novelai` (novelai-structured) or `chan-server` / `comfy-ui` (anima-flat).
- Codecs: `formatProviderPrompt` (g2), `applyNsfwPrefixPolicy` (C7), `createV45NovelAIConfig` (Mht), weight math, size/count:
  `resolveImageSize`, `normalizeImageCountPolicy` (Gf), `resolveImageCountConstraint` (SW).
- Continuity: `applyVisualContinuityToPlan` (z9e), `updateVisualContinuity` (fKe) / `computeDeferredVisualContinuity` (mKe),
  `reconcileContinuityCheckpoints` (Pte), `readContinuityFromChat` / `writeContinuityToChat` (the boot storage adapter, built from verbatim pieces).
- Text: `splitParagraphSlots(messageKey, text)` / `buildIllustrationSlots({messageKey, content, nativeAssetDetectors})` → slots
  `{slotId: "<messageKey>:slot:<i>", sourceImageToken: "slot:<slotId>", index, beforeText, afterText}`. `parseLenientJson(raw)` strips fences
  and takes the LAST balanced `{..}` / `[..]` that parses. Otherwise it throws `ANALYZER_JSON_PARSE` with `analyzerRaw`.

## Inputs the engine reads (summary)
The engine reads Asset Maid shapes. The exact traced list of fields is in `context/README.md` ("Fields read"). Summary:
- **config** (Asset Maid config, `extract/data/config-defaults*.json`): `characterPrompt.*` (lorebook prompts/genders/negatives, `characterForms`,
  `basePromptGroups`, `outfitPrompts`, `personaSettings.profiles`, artist presets, `charxGenerationDefaults` + `charxSettings.overrides.<sourceId>`),
  `animaArtists`, `novelai.*` (model, sampler, size, `analysisProfile`, `v5UserDirections`, `presetCatalog.rawJson`, character reference),
  `runtime.generationProvider`, `customImageSizes`, `chatImageGenerationSettings.countPolicy`, and `analysis` (passed through to the client).
- **source** (character source; Lumiverse: character + attached World Books): `members[].lorebooks[]` (`runtimePromptKey`, title, keys, content, comment),
  member keys/names, custom characters (`rI`).
- **character card**: `name` / `nickname`, `description` / `desc`.
- **persona**: id, name, gender, persona profile (forms, outfits).
- **chat**: messages `{role, content}`, current message text (paragraph slots), image tokens, continuity state (`ContinuityState`, spec/pipeline.md §3.7a).

## Parity coverage (`bun test src/engine`: 273 tests, 1770 assertions)
All golden fixtures come from the ORIGINAL bundle (`scratch/pipeline/analyzer/am_harness.js`). The seeded clock/RNG is installed on both sides.
- core: built-in V5 raw config equals `extract/novelai/v5-raw-config.json`. The compiled catalog reproduces all 7 original hashes (built-in and from JSON).
- engine e2e (6): `createAssetMaidEngine` against the original boot wiring. The tests use a scripted LLM client and capturing provider adapters for v4-5 (novelai,
  comfy-ui, nsfw + fixed seed + fixed size) and v5 (novelai, chan-server, comfy-ui comic). They compare the exact analyzer messages sent, every ImageRequest,
  the events, the persisted images, the continuity and the session.
- v5 (82): broken/edited raw configs, canonical JSON/FNV, 12 scene compiles, 12 analyzer request variants (all directing modes), 13 fake-client analyzer
  runs, 13 recoveries, split batching/phase prompts, 11 orchestrator compositions.
- v45 + context: catalog hashes and fingerprints. 25 analyzer runs: single/two-stage, lenient JSON, retries, repair, checkpoint replay, revision with images.
  3 compositions. 3 context scenarios with traced reads.
- compose (79): 20 end-to-end v4-5 scenarios through the real Tht + lht + Iyt, unit fixtures for every codec and weight function, 40 rule-IR builds.
- continuity (13): 6 multi-turn sequences (ttl, accumulate, counters, clears, persona, deferred, unstable ids, reconcile) with a storage round trip.
- text: 19 tricky texts × 3 detector sets × 6 functions, and 26 lenient-JSON inputs.

## Gaps / known limits
- No golden fixture for the legacy (custom "Preset catalog v1" raw JSON) compile path. No sample ships, and 0.9.88 has no UI for it.
- Not covered end to end: JEV TypeSafe roster pre-pass (dropped by PORT-PLAN), V5 split streaming inside `Ygt`, `prepareCharacters` / `prepareOutfits`
  (free character/outfit generation callbacks), director / ComfyUI references and img2img with real bytes, the non-artist weight in the NovelAI body.
- Only about 145 top-level identifiers have meaningful names. The other core internals keep their minified names (tagged with the original line).
  The facades alias them at the import site.
- The core is `// @ts-nocheck`. Types live in the area facades (`*/types.ts`), not in the generated file.
- Original behaviour kept on purpose: V5 recovery (`PRe`) drops `framing.crop` / `head_crop` from frame_placement. One random seed is used per batch.
  `novelAIConfig.seed` is ignored when `seedSetting` returns `seed:""`.
