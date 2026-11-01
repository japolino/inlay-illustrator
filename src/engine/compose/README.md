# engine/compose — provider prompts, weights, fixed rating, sizes, batch executor

Typed facades over the verbatim Asset Maid 0.9.90 core (`../core/asset-maid-core.ts`). Nothing is re-implemented.
0.9.90 removed the V4.5 rule-IR prompt compiler (`prompt-plan.ts`), the NSFW prefix (`nsfw.ts`) and Chan Server.

## Module map
| file | content | originals (p120) |
|---|---|---|
| `types.ts` | runtime shapes: PromptPlan, ProviderPrompt, ImageRequest (novelai / comfy-ui), NovelAIRunConfig, ImageActor, `RatingTag`, count/size types | — |
| `provider-prompt.ts` | `formatProviderPrompt`, `PROVIDER_PROMPT_FORMATTERS`, `formatNovelAIProviderPrompt`, `formatAnimaProviderPrompt` (comfy-ui only), `buildAnimaFlatPrompts`, `formatAnimaFlatPrompt`, `parseAnimaPromptNodes`, `attachActorIdsToCharacterPrompts`, `resolveComfyWorkflowProfile`, `isOutfitRestylerWorkflowProfile`, `usesAnimaFlatCodec`, `ANIMA_DEFAULT_*_PREFIX`, `IMAGE_PROVIDER_TABLE`, `BUNDLED_COMFY_WORKFLOW_PROFILE` | `UG`, `wgt`, `ygt`, `xgt`, `vgt`, `MG`, `fxe`, `bht`, `CG`/`emt`, `j4`, `Vi`, `$8`/`B8`, `F0`, `P4` |
| `weights.ts` | `applyNovelAIPromptWeight`, `applyNonArtistWeightToPrompt`, `applyNonArtistWeightToRequest` (also returns `sampling`), weight normalizers | `x4`, `Bft`, `Hft`, `Im`, `hm` |
| `rating.ts` | `RATING_TAGS`, `normalizeRatingTag`, `resolveFixedRating(sourceSettings)`, `prependRatingTag`, `stripPromptTags`, `applyRatingPolicy(prompt, rating, actorCount)` | `vC`, `O8`, `yS`, `OG`, `hh`, `XG` |
| `coordinates.ts` | `applyAiChoiceCoordinates`, `toNovelAICharacterCaptions` | `Vye`, `Wye` |
| `size-count-seed.ts` | `resolveImageSize`, `resolveBuiltInImageSize`, `normalizeImageCountPolicy`, `resolveImageCountConstraint`, `createSeedResolver`, `randomSeed`, `normalizeSeed`, `IMAGE_SIZE_PRESETS` | `aC`, `hht`, `Uf`, `$Ae`, `Oxe`, `w4`, `Wi` |
| `batch.ts` | `createGenerationBatchExecutor`, `resolveImageProviderRef`, `retryErrorRecord`, `appendRetryError` | `vht`, `Ebt`, `dj`, `JG` |

Removed: `createV45NovelAIConfig`, `applyRequestedSizeToPlan`, `resolveGenerationProvider`, `assertNovelAIApiKey`,
`applyNsfwPrefixPolicy` / `prependNsfwTag` / `ZERO_ACTOR_RATING_TAGS` (→ `rating.ts`), the whole `prompt-plan.ts`.

## Fixed rating (replaces the NSFW prefix)
Per source: `nsfwAlwaysEnabled` + `fixedRating` (`"sfw"` | `"nsfw"`). `resolveFixedRating` → rating or `false`; the run
input carries it as `forceRating`. The batch executor applies `applyRatingPolicy` (zero actors: strip every rating tag;
fixed rating: prepend it to the global/positive prompt and strip rating tags from character prompts) and forwards
`forceRating` to the NovelAI request (`false` for zero-actor images). The NovelAI adapter prepends the rating to the
final prompt as AM's `Mht` client wrapper does.

## Tests
`units.test.ts` (18 tests; generator `S/engine-build/gen/compose-units.mjs`): weights, rating, coordinates,
size/count/seed and provider formatters, all recorded from the original 0.9.90 bundle. The batch executor and
orchestrator are covered end to end by `../v5/compose.test.ts` and `../engine.test.ts`.
