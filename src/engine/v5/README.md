# `src/engine/v5` — NovelAI V5 ("v5-hybrid") engine facade

Typed TypeScript facade over the verbatim Asset Maid 0.9.88 core (`../core/asset-maid-core.ts`).
No algorithm is re-implemented. Each exported function delegates to the original declaration
named in its JSDoc (minified name + line in `AssetMaid.pretty.js`). The only glue code mirrors
call order that the original does inline:

- `buildV5AnalyzerRequest` mirrors `Egt.run` 117383-117489.
- `planV5Scene` mirrors the per-graph step of `Ygt.run` 118896-119010.
- `finalizeV5ProviderPrompt` mirrors `lht` 114091-114105.

Specs: `spec/novelai.md` §1-§5, `spec/pipeline.md` §2.4 and §3.8.

## Module map

| File | Content |
|---|---|
| `types.ts` | Runtime shapes: raw diagnostics, compiled catalog, scene graph, rule context, draft, ledger, prompt plan, external entries. |
| `catalog.ts` | Raw config validation, catalog compilation, default catalog, hashes, fingerprint, canonical JSON, FNV-1a-64. |
| `runtime.ts` | Rule runtime, scene compiler, continuity hooks, prompt projection, `planV5Scene`. |
| `analyzer.ts` | Directing modes, request + messages + cache partition + schema, recovery, analyzer run over an LLM client, split helpers. |
| `compose.ts` | Prompt context (identity/outfit/artist/fixed), NovelAI config, provider prompts, prompt view / segments / actors, `composeV5Images`. |
| `index.ts` | Barrel re-export. |

## API

### catalog.ts
- `validateV5RawConfig(raw)` → `{valid, diagnostics[]}` (`y1e` 1359).
- `assertV5RawConfig(raw)` (`b1e` 1638).
- `compileV5Catalog(raw)` (`E1e` 2059). Both throw `NovelAIV5RawValidationError` (`uV` 29).
- `isV5RawValidationError(e)`.
- `getDefaultV5Catalog()` (`uF` 48531), `getDefaultV5CatalogHashes()`, `getV5CatalogFingerprint(catalog)` (`WFe` 48466).
- `V5_RAW_CONFIG` (`dg`), `V5_COMPILER_VERSION` (`qAe`).
- `canonicalizeV5` (`_i`), `canonicalV5Json` (`p3`), `fnv1a64V5` (`np`).

### runtime.ts
- `createV5RuleRuntime({checkpoints?})` (`_re` 48534) → `{catalog, catalogFingerprint, checkpoints, sceneCompiler, buildAnalyzerRequest, recoverAnalyzerResponse}`.
- `getSharedV5RuleRuntime()`.
- `createV5Compiler(catalog?)` (`I8e`), `compileV5Scene(graph, ruleContext)` (`s8e` + `_8e`), `runV5RulePhases`, `evaluateV5RuleCondition` (`Jx`).
- `createV5ContinuityBasis(snapshot)` (`vN`), `toV5ContinuitySnapshot(state)` (`VQ(…, "novelai-v5")`), `continuityStorageKey(identity)` (`om`).
- `applyV5Continuity` (`Wte`), `reconcileV5Continuity` (`A8e`).
- `buildV5PromptProjection` (`uFe`), `serializeV5PromptPlan` (`gFe`), `buildV5ExecutedPromptPlan` (`Dht.build`).
- `planV5Scene({graph, promptContext, selectionKey, provider, state, eventScopeId, requestedSizeId?, advanceTurn?, stateAccumulationEnabled?, includeRegisteredActorSexTags?})`
  → `{ruleContext, draft, applied, reconciled, promptPlan, state}`. Order: compile → `Wte` → `A8e` → `fbe` → `Tte` → `Dht.build`.

### analyzer.ts
- Directions:
  - `createDefaultV5DirectionSettings()` (`RPe`), `selectV5DirectionPreset(list, id, mode)` (`Td`).
  - `resolveV5UserDirections({novelAIConfig})` (`qgt`), `resolveV5Directions(settings)`.
  - `V5_ANALYSIS_PRESETS` (`bPe`).
- `buildV5AnalyzerRequest({context, continuitySnapshot?, config?, userDirections?, splitStage?, runtime?})`
  → `{runtime, candidates (nbe), imageCount (Cgt), scene (Pgt), requestContext, request (tMe), structuredOutputSchema (eje/mgt/hgt), slotNumbers}`.
- `buildV5AnalyzerMessages(request, {imageParts?, revisionDirection?, revisionPromptChannels?, splitStage?, rosterSnapshot?, rosterDetail?})` (`abe`)
  → `{payload, wirePayload, messages, cachePartition}`.
- `toV5WirePayload` (`KE`), `buildV5ResponseSchema` (`eje`), `renderV5AnalyzerSystemInstruction` (`nX`), `buildV5InstructionModules` (`rX`).
- `recoverV5AnalyzerResponse(raw, build, {mode?, freeCharacterGenerationEnabled?})` (`_re().recoverAnalyzerResponse` → `KRe`). It uses the same arguments as `Egt`.
- `createV5Analyzer(client, runtime?)` (`Egt` 117357). `client.complete(config, messages, options)` → `{raw, parsed, transportDiagnostic?}`.
  It throws `NovelAIV5AnalyzerResultError` / `V5_ANALYZER_NO_USABLE_ILLUSTRATION` when no illustration is usable.
- Split helpers:
  - `planV5SplitBatches(total, batchSize)` (`Dgt` 118145).
  - `renderV5SplitPhaseSystemInstruction(request, phase)` (`wgt`).
  - `createV5SplitAnalysisRunner(analyzer, onResumeState?)` (`Bgt` 118287). The analyzer is injected, so a fake can drive it.

### compose.ts
- `buildV5PromptContext` (`Rgt` 117760), `buildV5IdentityEntries` (`Ngt` 117721).
- `createV5NovelAIConfig(run, plan, seed, characterCoordinates?, activePersonaCandidateKey?)` (`Wgt` 118751).
- `prepareV5ProviderPrompt` (`sbe`: `zgt` for novelai, `g2` anima-flat for comfy-ui / chan-server), `formatV5NovelAIPrompt` (`zgt`).
- `finalizeV5ProviderPrompt` (`C7` + `cht`, as sent by `lht`).
- `buildV5PromptView` (`ibe`), `buildV5PromptSegments` (`Lgt`), `buildV5ImageActors` (`Mgt`), `buildV5HistoryDecision` (`Bht`).
- `V5_BUNDLED_COMFY_PROFILE` (`n2`). This is the only profile id that `t7` accepts.
- `composeV5Images({run, client? | analysis?, runtime?, fakeResult?})` runs the real `Ygt.run` with:
  - the real sessions (`nht`),
  - the real batch executor (`lht`),
  - a capturing dispatcher (`ye.generate`).
  It returns:
  - `images[]` = `{image (decision, actors, promptPlan view, novelAIConfig, providerPrompt, promptSegments, analysisMetadata, generationRecord), executedPromptPlan, request}`,
  - `analysis`, `continuity` + `continuitySnapshot`, `executedPromptPlans`, `requests`, `events`.

## Input fields read

- Analyzer context (`buildV5AnalyzerRequest`, `createV5Analyzer`):
  - Slots and counts: `candidateSlots[{slot_id, slot_number, before, after, actor_hints?}]`, `targetImageCount`, `imageCountConstraint{min,max}`.
  - Candidates: `actorCandidates[]`, `personaCandidates[]`, `v5PersonaCatalogCandidates`, `v5OutfitCatalogCandidates`, `personaPromptKey`.
  - Generation flags: `freeCharacterGenerationEnabled`, `freeOutfitGenerationEnabled`, `knownCharacterIdentities`, `replayGeneratedOutfits`.
  - Other: `cacheSourceId`, `scope`, `rosterSelectionEnabled`, `splitAnalysis`.
  - Candidate records (lorebook/persona `IdentityCandidate`):
    - `key`, `lorebookPromptKey`, `characterName`, `aliases`, `gender`, `source`, `allowOutfitCreation`, `defaultFormId`, `identityMetadata`, `origin`.
    - `appearanceForms[{formId, label, humanlike, basePromptGroups, gender, defaultOutfitId, outfits[{outfitId, label, candidateEnabled, status, head..feet}]}]`.
- Analysis config: `provider` (`ollama_local` / `ollama_cloud` → slot-map envelope).
- Directions: `novelAIConfig.v5UserDirections` (`scene`, `imageRatio`).
- Compose run input (`V5ComposeRunInput`):
  - Session: `sessionContext`, `generationType` (`ai-prompt-edit` disables sex tags), `skipSlotNumbers` / `skipSourceImageTokens`.
  - Configs: `analysisConfig`, `novelAIConfig` (`apiKey` required for NovelAI, `naiModel`, `seed`, `v5UserDirections`, ...).
  - Provider and size: `generationProvider` / `generationProviderForImage`, `requestedSizeId` / `requestedSize`, `forceAiChoiceCoordinates`, `forceNsfwPrefix`.
  - Continuity: `stateAccumulationEnabled`, `previousContinuitySnapshot` / `previousCharacterStateMap`, `advanceContinuityTurn`.
  - Revision: `revisionDirection` (+ `revisionPromptChannels`, `revisionEvidenceKey`).
  - Analyzer: `analyzerInput{context, checkpointContext, checkpointPolicy, imageParts}`.
  - Host callbacks: `v5PromptContext(keys)`, `seedSetting(actors)`, `comfyUI{workflowProfileId, endpoint, chanServer*, completionTimeoutMs, anima*Prefix}`.
- `v5PromptContext(keys)` result:
  - `identities[]` and `persona` with `{key, prompt, basePromptGroups, negativePrompt, outfits[{id, parts[{part,prompt}]}], defaultOutfitId, forms[], defaultFormId}`.
  - Prompt fields: `artistId`, `artistName`, `artistPrompt`, `artistNegativePrompt`, `fixedPositivePrompt`, `globalNegativePrompt`.

## Injection points

- LLM transport:
  - `V5AnalyzerClient.complete(config, messages, options)`. The options are `purpose`, `cachePartition`, `cacheSourceId`, `structuredOutputSchema`, `diagnostic`, `signal`.
  - Return `{raw, parsed}`. A thrown parse error with raw text is recovered by `Ogt`.
- Image dispatch: `composeV5Images` captures requests. The backend replaces the capture with `spindle.imageGen`.
  To do this, use the `request` objects: `provider`, `prompt`, `negativePrompt`, `seed`, `width`, `height`, and NovelAI `config.characterPrompts`.
- Host data callbacks:
  - `v5PromptContext`, `seedSetting`, `references` / `outfitReference` / `characterReference`, `prepareCharacters`, `prepareOutfits`.
  - `persistGeneratedImage`. `composeV5Images` passes it through when it is set.
  - `applyV5Continuity`. `composeV5Images` always replaces it, so its result is not used.
- Determinism: install `setEngineEnv(seededEnv(seed))` (`../core/env`, `../testing/env`). The core reads the clock and RNG only through `amEnv`.

## Parity coverage (82 tests, `bun test src/engine/v5`)

Generators run the ORIGINAL bundle (`scratch/pipeline/analyzer/am_harness.js`). They are in
`C:/Users/eme4/asset-maid-port/scratch/engine/v5/`:
- `gen-inputs.mjs` (run first), `gen-catalog.mjs`, `gen-runtime.mjs`, `gen-analyzer.mjs`, `gen-compose.mjs`.
- Shared helpers: `lib.mjs`, `inputs.mjs`, `responses.mjs` (hand-written responses that follow the contract), `compose-lib.mjs`.

| Area | Fixtures | Covered |
|---|---|---|
| catalog | `catalog.json` | Default hashes/stats/fingerprint/sizes/weights. 7 broken raw configs: validator result + compiler error. 3 edited valid configs: hashes, stats, fingerprint. Canonical/FNV vectors, including errors. |
| runtime | `runtime.cases-{a,b}.json`, `runtime.errors.json` | 12 scenes: default 2-slot chain, continuity turn 2 (with and without accumulation), pov (+ size 5), ensemble on comfy-ui (collision fallback, mutual, free interaction, rain, facing away), comic multi-frame, adult routing (bound routing, female target, rating upgrade) on novelai and chan-server, generated actor. Compared: prompt context, rule context, draft, applied continuity, reconciled, executed plan, next state, snapshot. |
| analyzer | `analyzer.request.*.json` (12), `analyzer.runs.json`, `analyzer.recovery.json`, `analyzer.split.json`, `analyzer.misc.json` | Request variants: default, pov, ensemble, comic, comic no-bubble + landscape + min 3 panels, ratio unspecified + custom instruction, custom ratio preset, slot-map, free character, revision, continuity snapshot, single fixed slot. Full payload/messages/schema for default/pov/comic; hashes for the rest. 13 `Egt` runs with a fake client: exact options + message/schema/partition hashes + recovered result or error. The standalone builder equals what `Egt` sent. 13 recovery cases: valid, partial, fenced text, unusable, invalid JSON, slot map, generated actors, preserve mode. Split batch vectors, phase prompts, runner over a fake analyzer. |
| compose | `compose.*.json` (11) | Real `Ygt` + `lht`. Scenarios: default on novelai, comfy-ui and chan-server; pov with fixed coordinates (persona-automatic); comic; ensemble on comfy-ui; routing with forced NSFW prefix; continuity turn 2 from the turn-1 snapshot with accumulation; revision; skip slot + requested size; generated actor. Compared: analysis, executed plans, image requests, images, continuity, snapshot, events. `decision`, `generationRecord` and `analysisMetadata` are compared in full for `default.novelai` and by FNV hash elsewhere. Also: the individual `createV5NovelAIConfig` / `finalizeV5ProviderPrompt` match, and analysis-injection mode matches. |

## Gaps / notes

- Original behaviour kept as is (not port bugs):
  - Recovery (`PRe` 27511) drops `framing.crop` / `framing.head_crop` / `orientation.facing` from `frame_placement.modifiers` with the diagnostic `frame-scene-modifier-omitted`, and `camera.modifiers` rejects them.
  - So single-frame framing crops never reach the V5 prompt from the analyzer.
- JEV (TypeSafe) roster pre-selection is not wired. `createV5Analyzer` gets no JEV dependencies, so `rosterSelectionEnabled` fails with `JEV_UNAVAILABLE`. This matches the "dropped external services" decision.
- Not covered by fixtures:
  - The analyzer checkpoint-hit path (`checkpointPolicy` other than `restart-analysis`).
  - Image parts / vision fallback (the `F_` / `ym` capability cache is module state in the core).
  - The real `Egt` split phases (`ugt` initial-plan validation, `fgt` / `pgt` detail merge) and `Ygt` split streaming (`I` path). Only the runner, batch sizes and phase prompts are tested.
  - The host callbacks `prepareCharacters` / `prepareOutfits` (generated outfit proposals) and the references / img2img paths.
  - The non-artist weight path (`fge`, when `nonArtistPromptWeight` is set).
- The host must blank `fixedPositivePrompt` and `globalNegativePrompt` in `v5PromptContext` for Anima providers (`MAt` 167638). The engine does not do this.
- Slice requests: none. All needed roots were already in the slice.
