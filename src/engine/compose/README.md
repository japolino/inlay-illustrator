# engine/compose — analyzer plan → image request (v4-5 path)

Typed facades over the verbatim Asset Maid 0.9.88 core (`../core/asset-maid-core.ts`). Nothing is re-implemented;
parity comes from the verbatim core and is checked against the original bundle.

## Module map
| file | content | originals |
|---|---|---|
| `types.ts` | runtime shapes: PromptPlan, PromptBuildSpec, PromptInputs, ProviderPrompt, ImageRequest, NovelAIRunConfig, ImageActor, count/size types | — |
| `prompt-plan.ts` | `createPromptCompiler`, `createDefaultPromptCompiler`, `buildRuleIRPromptPlan`, `buildV45PromptPlan`, `buildV45ImageActors`, `buildPromptSegments`, `resolveV45FramesAndVariants` | pyt 119794, myt 119667, Eht 114786, wht 114609, Nht 114811, kht 114683 |
| `provider-prompt.ts` | `formatProviderPrompt`, `PROVIDER_PROMPT_FORMATTERS`, `formatNovelAIProviderPrompt`, `formatAnimaProviderPrompt`, `buildAnimaFlatPrompts`, `formatAnimaFlatPrompt`, `parseAnimaPromptNodes`, `attachActorIdsToCharacterPrompts`, `resolveComfyWorkflowProfile`, `isOutfitRestylerWorkflowProfile`, `usesAnimaFlatCodec`, `ANIMA_DEFAULT_*_PREFIX`, `IMAGE_PROVIDER_TABLE`, `BUNDLED_COMFY_WORKFLOW_PROFILE` | g2 110993, wmt 110984, vmt 110916, Hge 110961, bmt 110887, p7 109525, Oge 109510, cht 113979, t7 107757, r2 107585, Nc 20644, lL/dL 20730, W0 20554, n2 107748 |
| `weights.ts` | `applyNovelAIPromptWeight`, `applyNonArtistWeightToPrompt`, `applyNonArtistWeightToRequest`, `normalizeNonArtistPromptWeight`, `normalizeNovelAIWeightSyntax` | s2 108640, Put 108722, Cut 108742, Aa 24565, Mu 7452 |
| `nsfw.ts` | `applyNsfwPrefixPolicy`, `prependNsfwTag`, `ZERO_ACTOR_RATING_TAGS` | C7 110998, d7 109306 |
| `coordinates.ts` | `createV45NovelAIConfig`, `applyAiChoiceCoordinates`, `toNovelAICharacterCaptions` | Mht 114829, c7 108846, hge 108855 |
| `size-count-seed.ts` | `resolveImageSize`, `resolveBuiltInImageSize`, `applyRequestedSizeToPlan`, `normalizeImageCountPolicy`, `resolveImageCountConstraint`, `createSeedResolver`, `randomSeed`, `normalizeSeed`, `IMAGE_SIZE_PRESETS` | cE 21379, sht 113975, zye 114851, Gf 20598, SW 20616, Pye 113913, c2 108822, Ii 7544 |
| `batch.ts` | `createGenerationBatchExecutor` (+ BatchItem / reservation types), `resolveGenerationProvider`, `resolveImageProviderRef`, `assertNovelAIApiKey` | lht 113992, Aht 114721, Eye 114638, Rye 114714 |
| `testing/v45-scenario.ts` | parity driver shared by the fixture generator (original bundle) and the tests (port) | — |

The full object graph (Tht + lht + Iyt + pyt) is wired by `../engine.ts` (`createAssetMaidEngine`).

## Inputs read (config / character fields)
- `PromptInputs` = `MAt.promptInputs(decision)` (167610-167634; built by the context area):
  `identityCandidates` (u_e: lorebook prompts, basePromptGroups, characterForms, outfitPrompts, genders, negatives),
  `outfitsByPromptKey`, persona (`personaSettings.profiles[id]`, `malePersonaPrompt`, `personaGender`),
  artist (`characterPrompt.selectedArtistId` + `artistPrompts` for NovelAI, `animaArtists` for Anima),
  `fixedPositivePrompt` / `negativePrompt` (per-source `charxSettings.overrides[sourceId]` over `charxGenerationDefaults`; "" for Anima).
- Run input: `novelAIConfig` (`Sat`: `config.novelai` + artist `novelAIOverrides` + `nonArtistPromptWeight(Artist)`), `forceNsfwPrefix`
  (`nsfwAlwaysEnabled`), `forceAiChoiceCoordinates`, `stateAccumulationEnabled`, `requestedSizeId`/`requestedSize`
  (`fixedResolution`, `runtime.customImageSizes`), `comfyUI.{workflowProfileId, endpoint, chanServer*, animaPositivePrefix, animaNegativePrefix, completionTimeoutMs}`,
  `seedSetting(actors)` (chat path: `{seed:""}` → random seed per batch), `references(actors)`, `outfitReference/characterReference(actors)`,
  `novelAIImageToImage()` + strength/noise.

## Injection points
- Image providers: the dispatcher adapters (`ImageRequest` in `types.ts`, captured unchanged by the parity driver). NovelAI character
  prompts travel in `request.config.characterPrompts`; the NovelAI client must still apply `applyNonArtistWeightToRequest` (Cut) and the
  `nsfw` prefix (`request.forceNsfwPrefix ?? config getter`) when it builds the body (novelai area, `jut`/`Kut`).
- Randomness / clock: `amEnv` (`setEngineEnv`). The batch seed comes from `crypto.getRandomValues` through `amEnv`.
- ComfyUI reference bytes: `comfyUIReferences.prepare(ref, {signal})`.

## Parity coverage (`bun test src/engine/compose`, 79 tests)
- `pipeline.test.ts`: 20 end-to-end scenarios through the real `createV45Orchestrator` + `lht` + `Iyt` with capturing adapters
  (validated plans from the real analyzer acceptance `Ttt`): NovelAI default artist, weighted custom artist + forced NSFW +
  accumulation + fixed positive/negative, AI-choice vs fixed coordinates, previous continuity state + global refs, comic artist,
  effective-prompt finalisation (`Age`), fixed / unfixed / config seeds, preset and custom requested sizes, skip by slot and token,
  director references, missing API key, chan-server Anima with custom prefixes + Anima artist, comfy-ui bundled profile, comfy-ui with
  outfit/character references, unknown profile, unregistered provider. Compared: every ImageRequest, analyzer input (TA stripping),
  phase events, persisted images (GeneratedImage incl. generationRecord), continuity result, session.
  Generator: `scratch/engine/compose/gen-pipeline.mjs`.
- `units.test.ts` (generator `scratch/engine/compose/gen-units.mjs`): s2 (80 cases), Put (56), Cut (14), C7 (35), d7, Mht (20), hge, c7, cht,
  cE, zye, Gf (36), SW (108), Pye/c2 with seeded env, g2 for all providers/profiles/V5 errors (36), Oge, p7, and 40 rule-IR
  `compiler.build` cases (6 plans × 5 prompt-input variants incl. continuity prompts, plus error edges: unknown preset/size, no identity,
  no participants, missing rule selections).

## Gaps
- Legacy (custom raw catalog) build path of `pyt` (119809-119946) has no fixture: it needs a "Preset catalog v1" raw JSON
  (`compileCustomV45Catalog`), there is no shipped sample (the built-in `vW` is the rule-IR raw format and is rejected), and
  `presetCatalog` has no UI in 0.9.88. The facade supports it (`createPromptCompiler(compileCustomV45Catalog(raw))`).
- Zero-actor images cannot occur on the v4-5 rule-IR path (no identity → `GenerationPromptInvariantError`); `C7` zero-actor stripping is unit-tested only.
- `novelAIImageToImage` (img2img) is not exercised end-to-end (function input); `imageToImage` shape documented in `ImageRequest`.
- V5 compose (Ygt / Wgt / zgt / sbe) belongs to the v5 area.
