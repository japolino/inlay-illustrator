# `src/engine/v5` — NovelAI V5 ("v5-hybrid") engine facade

Typed facade over the verbatim Asset Maid 0.9.90 core (`../core/asset-maid-core.ts`). No algorithm is re-implemented.
Each exported function delegates to the original declaration named in its JSDoc (p120 name @ line). The only glue
mirrors call order that the original does inline:

- `buildV5AnalyzerRequest` mirrors the pre-call part of `c0e.run` (@161195).
- `planV5Scene` mirrors the per-graph step of `Ubt.run` (@162706): compile → `ane` → `w8e` → `Kre` → `Lre` → `Mre` → `Tre` → `Tht`.
- `finalizeV5ProviderPrompt` mirrors `vht` (`d0e` → `XG` rating policy → `bht`).

## Module map

| File | Content |
|---|---|
| `types.ts` | Runtime shapes: raw diagnostics, compiled catalog, scene graph, rule context, draft, ledger, prompt plan. |
| `catalog.ts` | Raw config normalize/validate/compile, bundled catalog, hashes, fingerprint, canonical JSON, FNV-1a-64, **Maid Atelier presets**. |
| `runtime.ts` | Rule runtime (`Hne({catalog})`), scene compiler, continuity hooks, prompt projection, `planV5Scene`. |
| `analyzer.ts` | Legacy direction settings, **directing document**, request + messages + schema, recovery, analyzer run, split helpers. |
| `compose.ts` | Prompt context, NovelAI config, provider prompts, prompt view / segments / actors, `composeV5Images`. |

## API (0.9.90 names)

### catalog.ts
- `validateV5RawConfig(raw, ignoreUnknown?)` → `{valid, diagnostics, value}` (`$Y` = `tC` normalize + `_Ce` validate).
- `normalizeV5RawConfig(raw)` (`tC`), `assertV5RawConfig(raw)` (`$Y` + throw `JS`), `compileV5Catalog(raw)` (`WY`, compiler `"novelai-v5-catalog-v3"`).
- `getDefaultV5Catalog()` (`uz` = `WY(Od)`), `getV5CatalogFingerprint(catalog)` (`WDe`), `V5_RAW_CONFIG` (`Gl`),
  `V5_NORMALIZED_RAW_CONFIG` (`Od`), `canonicalizeV5` / `canonicalV5Json` / `fnv1a64V5`.
- Atelier: `parseAtelierPreset(json)` (`_h`), `compileAtelierPreset(json)` (`rZ` → `{valid, diagnostics, catalog, raw,
  document, json}`), `compileAtelierPresetOrThrow` (`Ld`), `selectActiveAtelierPresetJson(presetCatalog)` (`nZ`),
  `compileActiveAtelierPresetCatalog(presetCatalog)` (`aZ(nZ(...))`), `BUILTIN_ATELIER_PRESETS` (`r2`),
  `DEFAULT_ATELIER_PRESET_DOCUMENT` (`nw`). Note: the default preset compiles to a different catalog than `uz()`
  (it adds `nw.content.system`); a run uses the preset catalog. `UCe` (preset migration) is not in the slice.

### runtime.ts
- `createV5RuleRuntime({catalog?, checkpoints?, random?})` (`Hne`) → `{catalog, catalogFingerprint, checkpoints,
  sceneCompiler, buildAnalyzerRequest, recoverAnalyzerResponse}`; `createV5CheckpointStore` (`YDe`).
- `createV5Compiler(catalog?)` (`ine`), `compileV5Scene`, `runV5RulePhases` (`u8e`), `evaluateV5RuleCondition` (`Qw`).
- `createV5ContinuityBasis` (`BE`), `toV5ContinuitySnapshot` (`bre`), `continuityStorageKey` (`fc`).
- `applyV5Continuity` (`ane` → `X3e`; no `stateAccumulationEnabled`), `reconcileV5Continuity` (`w8e`),
  `buildV5PromptProjection` (`uDe`), `serializeV5PromptPlan` (`hDe`), `buildV5ExecutedPromptPlan` (`Tht`).
- `planV5Scene({graph, promptContext, selectionKey, provider, state, basis?, previousState?, eventScopeId,
  requestedSizeId?, allowedSizeIds?, advanceTurn?, catalog?})`.

### analyzer.ts
- Legacy settings (`novelai.v5UserDirections`, fallback when no directing document is stored):
  `createDefaultV5DirectionSettings` (`CV`), `selectV5DirectionPreset` (`Hv`), `resolveV5UserDirections(runInput)` (`Kbt`;
  adds `freeGenerationInstructions`, `freeGenerationDesignInstructions`, `systemExecution`), `V5_ANALYSIS_PRESETS` (`Gl.analysisPresets`).
- Directing document (`config.runtime.instructionChanges` diff over `L0()`): `createDefaultAnalysisDocument` (`L0`),
  `resolveStoredAnalysisDocument` (`w8`), `resolveAnalysisDocument` (`zc`), `validateAnalysisDocument` (`mC`),
  `resolveAnalysisExecution` (`qv`), `resolveAnalysisDirections` (`yAe`), `assertDirectingRules` (`C8`),
  `applyAnalysisToRunInput` (`qbt`).
- Request: `buildV5CandidateBindings` (`o0e`), `buildV5AnalyzerRequest({runtime?, context, continuitySnapshot,
  config, userDirections, splitStage})` (adds `referenceExclusions` `q3e` and `interactionModifierContinuity` `J3e`),
  `buildV5AnalyzerMessages` (`s0e`), `toV5WirePayload` (`KE`), `buildV5ResponseSchema` (`qOe`),
  `renderV5AnalyzerSystemInstruction` (`uZ`), `buildV5InstructionModules` (`dZ`).
- `recoverV5AnalyzerResponse(raw, build, options)` (`Hne().recoverAnalyzerResponse` → `ZTe`; copies `systemDirection`).
- `createV5Analyzer(client, runtime?, jev?)` (`c0e`).
- Split: `planV5SplitBatches` (`Rbt`, batch cap 10), `renderV5SplitPhaseSystemInstruction` (`mbt`), `createV5SplitAnalysisRunner` (`Lbt`).

### compose.ts
- `buildV5PromptContext` (`_bt`), `buildV5IdentityEntries` (`Abt`), `createV5NovelAIConfig` (`Gbt`),
  `prepareV5ProviderPrompt` (`d0e`), `formatV5NovelAIPrompt` (`Pbt`), `finalizeV5ProviderPrompt({..., forceRating})`,
  `buildV5PromptView` (`l0e`), `buildV5PromptSegments` (`Obt`), `buildV5ImageActors` (`jbt`), `buildV5HistoryDecision` (`Kht`),
  `V5_BUNDLED_COMFY_PROFILE` (`P4`).
- `composeV5Images({run, client | analysis, runtime?, preparedAnalysis?, fakeResult?})`: the real `Ubt` + `fht` + `vht`
  with a capturing dispatcher. Run input: `forceRating` replaces `forceNsfwPrefix`; `stateAccumulationEnabled` is gone;
  `prepareAnalysis` may be given per run.

## Tests and fixtures
`bun test src/engine/v5` (111 tests). Generators: `S/engine-build/gen/v5/{inputs,catalog,runtime,analyzer,compose,directions}.mjs`
(ORIGINAL 0.9.90 bundle; runtime/analyzer/compose fixtures use the default Atelier preset catalog). `inputs.json` reuses
the 0.9.89 scenario inputs with analyzer responses translated to 0.9.90 modifier ids. `split.test.ts` holds hand-written
checks of the split multi-depiction units (`B4`, `Jxe`, `abt`, `ibt`, `obt`).
