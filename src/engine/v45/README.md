# src/engine/v45 — NovelAI V4.5 ("v4-5" analysis profile)

Typed facade over the verbatim Asset Maid 0.9.88 core (`../core/asset-maid-core`): Rule IR catalog,
analyzer (stages, requests, parsing, validation, repair, checkpoints) and compose (plan -> prompts ->
image requests). Spec: `spec/pipeline.md` §2.3 and §3.1-3.7, `spec/novelai.md` §6.4, `spec/llm.md` §4.
Nothing is re-implemented: the facade only adds types, defaults and wiring.

## Module map

| File | Content |
|---|---|
| `catalog.ts` | `NOVELAI_V45_RAW_CATALOG` (`vW` @11758), `compileV45Catalog` (`LLe` @42061), `getDefaultV45Catalog` (`ute` @42136), `createV45RuleRuntime` (`DLe` @42140), `getV45AnalyzerProjection` (`D$e` @51007), `getV45AnalyzerProjectionFingerprint` (`d9e` @51888), `summarizeV45Catalog` (boot "State loaded" values, @181244-181258), `createCatalogSourceResolver` (`hlt` @105876: default vs custom raw catalog), `listV45ContinuityGroups`, `listV45SizePresets` |
| `analyzer.ts` | `createV45AnalyzerEngine` (`Ttt` @85289), `createV45AnalyzerRunner` (`VQe` @82079), `buildV45StageMessages` (`KQe` @81693), `buildV45IllustrationMessages` (`BQe` @81762), `buildV45SingleStageRequest` (`$et` @83875), `buildV45PresetSelectionRequest` (`qet` @84073), `renderV45SystemPrompt` (`Fde(iPe/sPe)`), `toV45CandidateKey` (`vm` @82547), `findV45ResponseIllustrations` (`mP` @85136), `createAnalyzerCheckpointStore` (`YQe` @82611), `analyzerCheckpointKey` (`K9`), `analyzerCheckpointFingerprints` (`WQe`), `AnalyzerClientError` (`on` @79248), `AnalyzerStageError` (`K_` @81580), `isRetryableAnalyzerError` (`Tde`), `isImageUnsupportedError` (`oP`), `resolveAnalyzerExecutionMode` (`M_e` @168762), `resolveCheckpointPolicy` (`u1t` @168814), `assertAnalyzerReady` (`d1t` @168807), `resolveGenerationType` (`f1t` @168821), `V45_SCHEMA_IDS`, `V45_PROTOCOL_VERSIONS`, `V45_CACHE_BOUNDARY_NOTE`; types for stages, plans, client contract, diagnostics, progress |
| `compose.ts` | `planV45Images`, `composeV45Images`, `executeV45Images`, `createV45ComposeRuntime`, `PORT_COMPOSE_CORE` (core DI) |
| `plain.ts` | `v45Plain` = `toPlain` that also understands the V4.5 `ImmutableMap` (`Z5e` @38345) |
| `index.ts` | Re-export |
| `testing/analyzer-replay.ts`, `testing/compose-replay.ts` | Shared parity drivers (generator: original bundle; tests: port) |

Shared input shapes (`AnalyzerContext`, candidates, continuity, slots ...) live in `../context/types.ts`.

## Analyzer API and flow

```ts
const engine = createV45AnalyzerEngine();                 // one per process (owns the checkpoint store: TTL 10 min, 120 entries)
const runner = createV45AnalyzerRunner(engine, client);   // client.complete(config, messages, options) -> {raw, parsed}
const result = await runner.run({ config: analysisConfig, executionMode, checkpointPolicy, context, checkpointContext,
  fingerprintInput, validationOptions, maxAttempts: 1, revisionDirection, revisionPromptChannels, imageParts,
  onDiagnostic, onProgress, afterAnalysisValidated, afterPresetValidated, signal });
// result = { plan, routePlan, resumedFromCheckpoint, attempts, executionMode, timings }
```
- `executionMode`: `resolveAnalyzerExecutionMode({catalogSource, requestedMode:"single-stage"})` -> single-stage for the
  built-in catalog, two-stage (`preset-selection` -> `modifier-selection`, run in parallel with `afterPresetValidated`) for a custom raw catalog.
- Client contract (`V45AnalyzerClient`): `options.cachePartition` carries the cache-segmented form of the same request (the
  transport picks `messages` or the partition); `options.cacheSourceId`, `options.diagnostic.phase` = stage. To let the lenient
  validator try a non-JSON reply, throw `new AnalyzerClientError(msg, {code:"ANALYZER_JSON_PARSE" | "ANALYZER_EMPTY_RESPONSE" | "ANALYZER_REFUSAL", analyzerRaw})`
  (illustration and preset stages only). HTTP errors: `code:"ANALYZER_HTTP", httpStatus` (408/429/5xx and TypeError are retried once after 100 ms unless `maxAttempts:1`).
  Images rejected (400/415/422 + "image not supported" text) -> model marked text-only (process-wide map) and the call is retried without images.
- Unusable modifier envelope (single-stage) -> throws `AnalyzerStageError{code:"ANALYZER_ILLUSTRATION_MODIFIER_STRUCTURE_UNUSABLE", analyzerStage:"modifier-repair", analyzerCheckpointAvailable:true}`;
  the route plan is checkpointed; the next run with policy `resume` performs the `modifier-repair` call. A committed plan is replayed
  without an LLM call (`completed-checkpoint-hit`) until the checkpoint fingerprint changes (continuity only invalidates route-only checkpoints).
- `afterAnalysisValidated` must resolve every `outfit_proposal_id` (auto outfit creation) or the run fails with
  `ANALYZER_POST_ANALYSIS_OUTFIT_UNRESOLVED`.
- An unparseable illustration reply validates to an EMPTY plan (no error) — original behaviour.

## Compose API

```ts
const { plan, images } = await composeV45Images(input, { seed });   // input: V45ComposeInput
// images[i] = { decision, actors, promptPlan, promptSegments, continuityState, novelAIConfig,
//               providerPrompts: { novelai, "comfy-ui", "chan-server" } }
const exec = await executeV45Images(input, dispatcher);             // real batch executor; dispatcher.generate(request)
```
`V45ComposeInput` = orchestrator input without the analyzer: `analyzerResult` (the analyzer run result), `analyzerContext`,
`sessionContext`, `novelAIConfig` (`resolveNovelAIRunConfig`), `generationProvider`, `requestedSizeId/requestedSize`,
`forceAiChoiceCoordinates`, `forceNsfwPrefix`, `stateAccumulationEnabled`, `comfyUI` (Anima prefixes from per-source settings),
`promptInputs`/`references`/`outfitReference`/`characterReference`/`seedSetting` (from `buildAnalyzerContextInputs`),
`previousCharacterStateMap`, `previousGlobalModifierRefs`, `advanceContinuityTurn`, `skipSlotNumbers`, `skipSourceImageTokens`.
The real `Tht` runs: skip filter, `zye` requested size, `z9e` continuity, `kht` frame/variant chance roll (uses the engine RNG),
prompt compilation `pyt`/`myt`, `wht` actors, `Nht` artist segments, `Mht`+`c7` NovelAI config/coordinates; provider prompts
use `g2` -> `C7` (NSFW prefix / zero-actor rating strip) -> `cht` (actor ids). `executeV45Images` additionally runs `lht`
(global FIFO lock, one random u32 seed per batch, resume cache, `k7` request building incl. non-artist weight) and returns
the generated-image records (`generationRecord`, `providerPrompt`, final `promptPlan`).
The continuity result (`z9e`) is returned as `continuity`; persisting it (`updateVisualContinuity` / deferred) is the caller's job.

Injection points for the backend: `client` (Lumiverse connection profile, JSON mode), `dispatcher` (spindle.imageGen;
request shape `V45ImageRequest` = AM `dmt` union), `persistGeneratedImage`, `references` (asset bytes), `novelAIImageToImage`.

## Parity coverage (`bun test src/engine/v45`)

| Test | Fixtures (`src/engine/__fixtures__/v45/`) | Generator (`C:/Users/eme4/asset-maid-port/scratch/engine/v45/`) |
|---|---|---|
| `catalog.test.ts` | `catalog.json`: compiler version, 6 catalog hashes, stats, State-loaded numbers (213 presets / 105 modifiers), analyzer summary (49 presets, 5 features), projection fingerprints (`raw-rule-analyzer-v1.15pob1p` / `...kpv2rr`), fingerprints of wireIds/projection/sizes/definitions/options/presetNodes/continuity/rulesByPhase/weights/presetPaths, sizes, continuity groups, definition ids | `gen-catalog.mjs` |
| `analyzer.test.ts` | `analyzer.<scenario>.json` (7 scenarios, 25 runs): exact client calls (config, full messages, cachePartition, options), diagnostics, progress, hooks, result/error. Scenarios: single-stage (valid, checkpoint replay, restart + fenced JSON lenient parse), errors (empty plan on garbage, 503 retry, 503 with maxAttempts 1, 400, unknown preset/candidate fallback, TypeError retry), modifier-repair (route-only checkpoint -> repair call -> replay), continuity-changed / fingerprint-changed, two-stage (preset -> modifier, replay, unusable modifier reply), revision + image parts + text-only model fallback, outfit proposals (unresolved -> resolved by hook) | `gen-analyzer.mjs` (sample context `scratch/pipeline/analyzer/sample.mjs`) |
| `compose.test.ts` | `compose.<scenario>.json`: plan items, z9e continuity, analyzer input seen by the orchestrator, events, composed images (prompt plan, NovelAI config, novelai/comfy-ui/chan-server prompts), executor requests + generated-image records. Scenarios: novelai 2 images with continuity, fixed size 3 + forced NSFW + accumulation off + skipped slot, comfy-ui Anima | `gen-compose.mjs` (plans built by the original analyzer over `scratch/engine/context/sample.mjs`) |

Both sides run with `seededEnv` (generator: `installGlobalEnv`; tests: `setEngineEnv`), so timings, seeds and chance rolls match.

## Gaps

- Custom (legacy) raw catalogs: `createCatalogSourceResolver` and the engine `legacyCatalog` option are wired, but no golden fixture
  covers the legacy compiler / legacy prompt build yet.
- Higher-level automatic retry (`generationAutoRetryCount` + checkpoint resume across runs) is the pipeline's job; here only the
  per-call attempts are covered.
- `executeV45Images` covers the executor with a fake dispatcher; NovelAI client body building, queues and ComfyUI references belong to the provider area.
- `V45ComposeCore` uses loosely typed function slots (dependency injection for parity); production callers never pass it.
