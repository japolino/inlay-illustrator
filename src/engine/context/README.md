# src/engine/context — analyzer context building (Asset Maid 0.9.88 `MAt` and helpers)

Typed facade over the verbatim core (`../core/asset-maid-core`). It builds everything the planner
(V4.5 and V5) can see, plus the late callbacks the orchestrator uses for prompts and references.
Spec: `spec/pipeline.md` §2.1-2.2, §3.2, §3.5, §3.7c; `spec/data.md` §1.5-1.7, §2.2.

## Module map

| File | Content |
|---|---|
| `types.ts` | Asset Maid runtime shapes: `IdentityCandidate`, `AppearanceForm/Outfit`, `OutfitCandidate`, `VisualContinuityContext`, `ChatContext`, `CandidateSlot`, `ImageCountConstraint`, `AnalyzerContext`, `AnalyzerCheckpointContext`, `AnalyzerFingerprintInput`, `AnalyzerValidationOptions`, `RevisionPromptChannel`. Shared with `../v45`. |
| `context.ts` | The functions below + input shapes (`AssetMaidConfig`, `CharacterSource`, `PersonaRecord`, `PlannerImageToken`, `ContinuityState`, `PromptInputs`, ...). |
| `index.ts` | Re-export. |
| `testing/trace.ts` | Proxy read tracer (documents and pins the fields read). |
| `testing/context-replay.ts` | Shared parity driver (generator runs it on the original bundle, the test on the port). |

## API (original name @ pretty line)

| Function | AM | What |
|---|---|---|
| `buildAnalyzerContextInputs(input)` | `MAt` @167588 | identity / persona / outfit candidates, persona key + default outfit + gender, `visualContinuity`, `previousCharacterStateMap`, `chatContext`, callbacks `promptInputs(decision)`, `v5PromptContext(keys)`, `references(actors)`, `outfitReference`, `characterReference`, `seedSetting` (stub, always `{key:"",seed:"",fixed:false}`), `outfitContinuityReferences(images)` |
| `buildOutfitCandidates(candidates)` | `y_e` @167359 | outfit wire records (candidate-enabled, non-empty; ai-auto only when `status:"ready"`) |
| `buildVisualContinuityContext(...)` | `NAt` @167494 | `previous_modifiers / previous_preset_refs / previous_outfit_refs / previous_*_tags / previous_message_participants` |
| `buildChatContext(messages, content, includePrevious)` | `RAt` @167561 | last non-empty user message; previous assistant message only when the chat has no stored continuity |
| `hasStoredContinuity(state, chatKey)` | `B8` @42956 | gate for `previous_assistant_response` |
| `resolveSourceGenerationSettings(config, sourceId)` / `getDefaultSourceGenerationSettings(config)` | `ki` @24725 / `xE` @24772 | per character-source settings (fixed prompts, anima prefixes, nsfw, coordinates, accumulation, free outfit/character generation, roster selection, fixed resolution) |
| `isFreeOutfitGenerationEnabled` | `jE` @25542 | |
| `resolveArtistPromptSelection(config, {provider, promptKey, sourceId})` | `Ky` @94951 | NovelAI artist preset / Anima artist |
| `resolveNovelAIRunConfig(config, {sourceId})` | `Sat` @94971 | `novelAIConfig` of the orchestrator input |
| `resolvePersonaProfile(config, personaKey)` | `lS` @167430 | persona appearance; default prompt `1::kazehaya shouta::` |
| `isAnimaFlatProvider(provider)` | `Nc` @20644 | chan-server / comfy-ui |
| `toPlannerImageToken(token)` | `g1t` @168873 | detected chat image token -> `imageTokens[]` entry |
| `withCustomCharacterMembers(source, customCharacters, mode)` | `rI` @93161 | append custom characters as virtual members (do this BEFORE `buildAnalyzerContextInputs`) |
| `resolveIdentityEvidence(input)` (async) | `UAt` @167957 | per-slot identity evidence; `actorHintsBySlot` -> `candidateSlots[].actor_hints` |
| `buildCandidateSlots(slots, evidence)` | E1t @169621 | paragraph slots -> `CandidateSlot[]` |
| `assembleAnalyzerInput(options)` | E1t @169706-169762 | `analyzerInput.{context, checkpointContext, fingerprintInput, validationOptions}` (object assembly only) |
| `previousGlobalModifierRefs(visualContinuity)` | E1t @169805 (`mb`) | orchestrator `previousGlobalModifierRefs` |
| `resolvePresetScope` | `OW` @20663 | always `"all"` in 0.9.88 |
| `resolveOutfitCreationMode(config)` | `ZAt` @168328 | auto-outfit `"tags-only" | "reference-image"` |
| `buildKnownIdentities(source, personas)` | `c1t` @168769 | free character generation known identities |

## Injection points (what the backend must supply)

Call order in Asset Maid's chat pipeline (E1t @169508-169762):
1. `continuity` = stored visual continuity state of this chat (after checkpoint reconcile; `mergeLocalLoreActorState` already applied).
2. `source` = `withCustomCharacterMembers(sourceCatalogEntry, customCharacters)`.
3. `inputs = buildAnalyzerContextInputs({config, getConfig, continuity, chatKey, messages, content, imageTokens, character, source, activePersona, personaRecords})`.
4. Readiness gate: `assertAnalyzerReady` (in `../v45/analyzer.ts`) with `inputs.analyzerIdentityCandidates/PersonaCandidates`.
5. `evidence = await resolveIdentityEvidence({candidates: inputs.analyzerIdentityCandidates, slots, originalAssetTokens, source: rawSource, previousMessageParticipantKeys})`.
6. `assembleAnalyzerInput({config, sourceId, inputs, candidateSlots: buildCandidateSlots(slots, evidence), targetImageCount, imageCountConstraint, checkpoint, ...})`.
7. Orchestrator input: `promptInputs`, `references`, `outfitReference`, `characterReference`, `seedSetting` = the callbacks; `previousCharacterStateMap`; `previousGlobalModifierRefs(inputs.visualContinuity)`; `novelAIConfig = resolveNovelAIRunConfig(config, {sourceId})`; per-source settings from `resolveSourceGenerationSettings`.

Lumiverse mapping (PORT-PLAN.md): `source.members[].lorebooks[]` come from the World Books attached to the character
(plus global/persona/chat books); `promptKey = lore.runtimePromptKey || "<member.key>::lore::<lore.id>"` (AM `Fs` @85966);
`activePersona`/`personaRecords` from Lumiverse personas; `messages` from the chat (role user|assistant, content string).

## Fields read (traced on the original bundle; pinned by the parity test)

Collected with `testing/trace.ts` over the 3 fixture scenarios while calling `buildAnalyzerContextInputs` and every callback.
`<promptKey>` = lore prompt key, `<memberKey>` = source member key, `<sourceId>` = character source id, `<personaKey>` = persona key,
`<personaPromptKey>` = `persona::<key>`, `<groupId>` = appearance group id (13-group catalog `Wb` + `custom`). `?` = existence check only.
Also read but not visible in the trace because the sample provides the primary field: `character.nickname` (when `name` is empty),
`character.desc` (when `description` is empty). With `config.novelai.characterReferenceEnabled` (or ComfyUI character reference)
true, the reference callbacks additionally read `config.novelai.characterReferenceType/Strength/Fidelity`, form `reference`
(`enabled|referenceEnabled|reference`, `defaultAsset|asset|referenceAsset`) and outfit `referenceAsset|reference_asset|referenceEnabled`,
and persona host image settings (AM `p_e` @167230, `Aw`, `Fy`).

### config
```
config.animaArtists.entries[].id
config.animaArtists.entries[].text
config.animaArtists.entries[].title
config.animaArtists.selection.bySourceId.<sourceId>?
config.animaArtists.selection.defaultId
config.characterPrompt.artistPrompts[].description
config.characterPrompt.artistPrompts[].id
config.characterPrompt.artistPrompts[].negativePrompt
config.characterPrompt.artistPrompts[].nonArtistPromptWeight
config.characterPrompt.artistPrompts[].novelAIOverrides
config.characterPrompt.artistPrompts[].prompt
config.characterPrompt.artistPrompts[].sourceCharacterName
config.characterPrompt.artistPrompts[].sourceName
config.characterPrompt.artistPrompts[].source_character_name
config.characterPrompt.artistPrompts[].source_name
config.characterPrompt.artistPrompts[].title
config.characterPrompt.basePromptGroups.<promptKey>
config.characterPrompt.characterForms.<promptKey>.defaultFormId
config.characterPrompt.characterForms.<promptKey>.forms[].basePromptGroups.<groupId>
config.characterPrompt.characterForms.<promptKey>.forms[].defaultOutfitId
config.characterPrompt.characterForms.<promptKey>.forms[].description
config.characterPrompt.characterForms.<promptKey>.forms[].gender
config.characterPrompt.characterForms.<promptKey>.forms[].humanlike
config.characterPrompt.characterForms.<promptKey>.forms[].id
config.characterPrompt.characterForms.<promptKey>.forms[].label
config.characterPrompt.characterForms.<promptKey>.forms[].negativePrompt
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].bottom
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].candidateEnabled
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].candidate_enabled
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].description
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].feet
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].head
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].id
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].label
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].legs
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].origin
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].status
config.characterPrompt.characterForms.<promptKey>.forms[].outfits[].top
config.characterPrompt.characterForms.<promptKey>.forms[].reference
config.characterPrompt.characterReferenceBulkEnabled
config.characterPrompt.characterReferences.<promptKey>
config.characterPrompt.charxGenerationDefaults.animaNegativePrompt
config.characterPrompt.charxGenerationDefaults.animaPositivePrompt
config.characterPrompt.charxGenerationDefaults.autoRemoveConflictingRegex
config.characterPrompt.charxGenerationDefaults.dirtyFieldsBySourceId
config.characterPrompt.charxGenerationDefaults.fixedPositivePrompt
config.characterPrompt.charxGenerationDefaults.fixedResolution.enabled
config.characterPrompt.charxGenerationDefaults.fixedResolution.sizeId
config.characterPrompt.charxGenerationDefaults.forceAiChoiceCoordinates
config.characterPrompt.charxGenerationDefaults.freeCharacterGeneration
config.characterPrompt.charxGenerationDefaults.freeOutfitGeneration
config.characterPrompt.charxGenerationDefaults.nativeAssetVisibility
config.characterPrompt.charxGenerationDefaults.negativePrompt
config.characterPrompt.charxGenerationDefaults.nsfwAlwaysEnabled
config.characterPrompt.charxGenerationDefaults.revisionByField
config.characterPrompt.charxGenerationDefaults.rosterSelectionEnabled
config.characterPrompt.charxGenerationDefaults.stateAccumulationEnabled
config.characterPrompt.charxSettings.overrides.<sourceId>.animaNegativePrompt?
config.characterPrompt.charxSettings.overrides.<sourceId>.animaPositivePrompt?
config.characterPrompt.charxSettings.overrides.<sourceId>.autoRemoveConflictingRegex?
config.characterPrompt.charxSettings.overrides.<sourceId>.fixedPositivePrompt
config.characterPrompt.charxSettings.overrides.<sourceId>.fixedResolution?
config.characterPrompt.charxSettings.overrides.<sourceId>.forceAiChoiceCoordinates?
config.characterPrompt.charxSettings.overrides.<sourceId>.freeCharacterGeneration?
config.characterPrompt.charxSettings.overrides.<sourceId>.freeOutfitGeneration
config.characterPrompt.charxSettings.overrides.<sourceId>.freeOutfitGeneration?
config.characterPrompt.charxSettings.overrides.<sourceId>.nativeAssetVisibility?
config.characterPrompt.charxSettings.overrides.<sourceId>.negativePrompt
config.characterPrompt.charxSettings.overrides.<sourceId>.nsfwAlwaysEnabled?
config.characterPrompt.charxSettings.overrides.<sourceId>.revisionByField
config.characterPrompt.charxSettings.overrides.<sourceId>.rosterSelectionEnabled?
config.characterPrompt.charxSettings.overrides.<sourceId>.stateAccumulationEnabled
config.characterPrompt.customLorebookKeys.<promptKey>[]
config.characterPrompt.genders
config.characterPrompt.lorebookImageFilters.
config.characterPrompt.lorebookImageFilters.<sourceId>
config.characterPrompt.lorebookNegativePrompts.<promptKey>
config.characterPrompt.lorebookPromptGenders.<promptKey>
config.characterPrompt.lorebookPrompts.<promptKey>
config.characterPrompt.malePersonaNegativePrompt
config.characterPrompt.malePersonaPrompt
config.characterPrompt.negativePrompts
config.characterPrompt.outfitPrompts.<promptKey>
config.characterPrompt.personaGender
config.characterPrompt.personaSettings.profiles.
config.characterPrompt.personaSettings.profiles.<personaKey>.analysisEnabled
config.characterPrompt.personaSettings.profiles.<personaKey>.basePromptGroups
config.characterPrompt.personaSettings.profiles.<personaKey>.defaultOutfitId
config.characterPrompt.personaSettings.profiles.<personaKey>.default_outfit_id
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.defaultFormId
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].basePromptGroups.<groupId>
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].defaultOutfitId
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].description
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].gender
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].humanlike
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].id
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].label
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].negativePrompt
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].outfits[].bottom
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].outfits[].candidateEnabled
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].outfits[].candidate_enabled
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].outfits[].description
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].outfits[].feet
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].outfits[].head
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].outfits[].id
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].outfits[].label
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].outfits[].legs
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].outfits[].top
config.characterPrompt.personaSettings.profiles.<personaKey>.forms.forms[].reference
config.characterPrompt.personaSettings.profiles.<personaKey>.gender
config.characterPrompt.personaSettings.profiles.<personaKey>.mainPrompt
config.characterPrompt.personaSettings.profiles.<personaKey>.mainPrompt?
config.characterPrompt.personaSettings.profiles.<personaKey>.negativePrompt
config.characterPrompt.personaSettings.profiles.<personaKey>.negative_prompt
config.characterPrompt.personaSettings.profiles.<personaKey>.outfits
config.characterPrompt.personaSettings.profiles.<personaKey>.prompt?
config.characterPrompt.personaSettings.profiles.<personaKey>.reference
config.characterPrompt.personaSettings.profiles.<personaKey>.referenceAnalysisEnabled
config.characterPrompt.personaSettings.profiles.<personaKey>.referenceAsset?
config.characterPrompt.personaSettings.profiles.<personaKey>.referenceEnabled
config.characterPrompt.personaSettings.profiles.<personaKey>.reference_analysis_enabled
config.characterPrompt.personaSettings.profiles.<personaKey>.reference_asset
config.characterPrompt.personaSettings.profiles.<personaKey>.reference_enabled
config.characterPrompt.personaSettings.sourceScopes.<sourceId>
config.characterPrompt.selectedArtistId
config.characterPrompt.selectedLorebooks.<memberKey>[]
config.characterPrompt.workspaceDisabledLorebooks.<memberKey>[]
config.jevConnection.rosterSelectionDefault
config.novelai.characterReferenceEnabled
config.runtime.comfyuiCharacterReferenceEnabled
config.runtime.customImageSizes
config.runtime.generationProvider
```
### source (character source, spec/data.md `Source` / `Member` / `LoreRecord`)
```
source.id
source.members[].key
source.members[].lorebooks[].alwaysActive
source.members[].lorebooks[].content
source.members[].lorebooks[].id
source.members[].lorebooks[].keys[]
source.members[].lorebooks[].kind
source.members[].lorebooks[].primaryKeys[]
source.members[].lorebooks[].runtimeBasePrompt
source.members[].lorebooks[].runtimeOrigin
source.members[].lorebooks[].runtimePromptKey
source.members[].lorebooks[].runtimeSelected
source.members[].lorebooks[].secondaryKeys[]
source.members[].lorebooks[].selectionId
source.members[].lorebooks[].selective
source.members[].lorebooks[].title
source.members[].lorebooks[].useRegex
source.members[].name
```
### character (card)
```
character.description
character.name
```
### continuity (ContinuityState)
```
continuity.characters.<chatKey>
continuity.historicalStaticBases.<chatKey>
continuity.modifierRefs.<chatKey>.actors.<promptKey>
continuity.modifierRefs.<chatKey>.actors.__persona__
continuity.modifierRefs.<chatKey>.global
continuity.nsfwPositions.<chatKey>.activeSceneIdByCharacter.<promptKey>
continuity.nsfwPositions.<chatKey>.activeSceneIdByCharacter.__persona__
continuity.nsfwPositions.<chatKey>.scenes.<sceneId>.presetPath
continuity.outfitRefs.<chatKey>.actors.
continuity.outfitRefs.<chatKey>.actors.<personaPromptKey>.formId
continuity.outfitRefs.<chatKey>.actors.<personaPromptKey>.outfitId
continuity.outfitRefs.<chatKey>.actors.<promptKey>.formId
continuity.outfitRefs.<chatKey>.actors.<promptKey>.outfitId
continuity.recentCheckpoints.<chatKey>[].participants.characterKeys[]
continuity.recentCheckpoints.<chatKey>[].participants.personaKeys[]
continuity.recentCheckpoints.<chatKey>[].participants.sceneLayouts
continuity.recentCheckpoints.<chatKey>[].participants.scene_layouts
continuity.scenes.<chatKey>.backgroundTags[]
continuity.scenes.<chatKey>.locationTags[]
```
### activePersona / messages / imageTokens
```
activePersona.id
activePersona.imageAsset
activePersona.key
activePersona.name
messages[].content
messages[].role
imageTokens[].characterName
imageTokens[].matchedPromptKeys
imageTokens[].sourceImageToken
```

## Parity coverage

`bun test src/engine/context` — fixtures in `src/engine/__fixtures__/context/`, generator
`bun C:/Users/eme4/asset-maid-port/scratch/engine/context/gen-context.mjs` (sample data: `scratch/engine/context/sample.mjs`).
Scenarios: `novelai-rich-continuity` (stored continuity: modifier/outfit/preset refs, checkpoints, participants),
`comfyui-empty-continuity` (Anima provider: fixed prompts forced empty, Anima artist; empty continuity -> previous assistant reply sent),
`no-persona-v5` (no active persona, v5 profile, per-source override `freeOutfitGeneration:false`).
Each compares: all static MAt outputs, `promptInputs` for 2 decisions, `v5PromptContext`, references (2 actor sets),
`seedSetting`, `outfitContinuityReferences`, 17 helper results, `resolveIdentityEvidence`, and the read traces.
Plus a unit test of `buildCandidateSlots` + `assembleAnalyzerInput`.

## Gaps

- `assembleAnalyzerInput` / `buildCandidateSlots` are object assembly copied from E1t (not runnable in isolation in the bundle);
  covered by unit assertions, not by a golden fixture.
- Reference callbacks are exercised only with references disabled (default config) -> they return `[]` / `null`. Asset
  bytes / reference assets need the host asset reader (out of scope).
- `getConfig` live-snapshot semantics (Asset Maid merges generated `characterForms` during free character generation,
  E1t @169543-169551) are the caller's job.
