# Inlay Illustrator shared contract (Asset Maid 0.9.88 port)

Code: `src/shared/contract/` (no imports outside this directory; JSON data under `data/`, parity fixtures under `fixtures/`).
Import everything from `src/shared/contract/index.ts`.

| File | Content |
|---|---|
| `common.ts` | JSON helpers, deep merge / diff against defaults (AM `VW`/`iv`), FNV-1a (`kE`, `qk`), ids, `ContractIssue`. |
| `character.ts` | Prompt keys, asset refs, appearance catalog (`Wb`), FormCollection + form/outfit operations, custom characters, recognition keys, artists, personas, per-character document. |
| `config.ts` | Global settings (`InlayConfig`), defaults, `normalizeConfig` (port of `fEe`), storage domains, per-character override resolution, runtime config builder, chat image generation settings, overlay UI state. |
| `chat.ts` | Chat data document, AM chat store + validator, continuity checkpoint, current actor state, journal types, illustration plans, count policy, message/slot ids, generated asset names. |
| `history.ts` | Image History tree, validator (69 AM issue codes), command reducer, cleanup/99-cap, commitRevision, store<->tree projections. |
| `storage.ts` | userStorage paths, file versions, migration hooks, AM key mapping. |
| `rpc.ts` | Frontend<->backend protocol: methods (request/response pairs), events, envelopes, guards. |
| `chat-dom.ts` | Baked illustration blocks in message content, chat actions, per-message UI state (§10). |
| `bridge.ts` | Backend -> frontend fetch bridge for image bytes and same-origin REST JSON (§11). |

Source references: `spec/data.md` (Part A, Part C §2-§4), `spec/pipeline.md` §4-§5, `spec/novelai.md` §7/§9, `spec/llm.md` §1,
`spec/ui.md` (action lists). Line numbers in code comments refer to `AssetMaid.pretty.js`.

## 1. Data shapes and field names

Field names and value shapes follow Asset Maid's runtime objects unless this file names a Lumiverse mapping.
Normalizers are ports of the original functions and are parity-tested against the original bundle:

| Port function | AM function | Fixture |
|---|---|---|
| `normalizeConfig` (shared fields) | `fEe(Y0(), raw)` | `fixtures/config-parity.json` `configNormalize` |
| `normalizeV5UserDirections` | `zPe` | `v5Directions` |
| `resolveEffectiveCharxSettings`, `resolveAllCharxSettings`, `setCharxOverride`, `setCharxDefaults`, `clearCharxOverrides`, `resetAllCharxOverrides`, `refreshCharxDirtyFields` | `ki`, `xE`, `ONe`, `jNe`, `NNe`, `ENe`, `RNe` | `charxOps` |
| `normalizeChatImageGenerationSettings` | `Km` | `chatImageSettings` |
| `normalizeBasePromptGroups`, `compileMainPrompt`, `mergeAnalyzedBasePromptGroups` | `Qs`, `Si`, `bW` | `fixtures/character-parity.json` |
| `normalizeFormCollection`, `formCollectionRevision`, `buildLegacyFormCollection` | `go`, `ds`, `LY` | same |
| `addForm`, `patchForm`, `deleteForm`, `setDefaultForm`, `patchOutfit`, `addOutfit`, `replaceEmptyDefaultOutfit`, `deleteOutfit`, `promoteOutfitToDefault`, `moveOutfit`, `resolveFormOutfit`, `resolveFormOutfitByOutfit`, `isFormTargetCurrent`, `isOutfitEmpty`, `isOutfitCandidate` | `BL`, `Pg`, `KY`, `$Y`, `Jf`, `HL`, `BY`, `HY`, `UY`, `qY`, `DY`, `FY`, `GY`, `IE`, `Ik` | same |
| `parseCustomCharacter`, `splitRecognitionKeys`, `validateCustomCharacterInput` | `wTe`, `_x`, `gD` | same |
| `parseCustomLorebookKeys`, `effectiveRecognitionKeys` | `kP`, `vw` | same |
| `normalizeNovelAIArtistOverrides`, `normalizeNonArtistPromptWeight`, `normalizeWeightedPromptSpacing`, `listNovelAIArtists` | `Ja`, `Aa`, `Mu`, `FP` | same |
| `normalizeAssetRef`, `assetIdentity`, `dedupeAssetRefs` | `pn`, `Wt`, `Ai` | same |
| History / chat store (see §6) | `hBe`, `Zne`, `IBe`, `NR`, `lK`, `uN`, ... | `fixtures/history/*.json` |

Fixtures were made by scratch scripts in `C:/Users/eme4/asset-maid-port/scratch/contract/` that load the original
bundle (`scratch/pipeline/analyzer/am_harness.js`, `__AM_eval`) and run the original functions. To regenerate:
`node gen-config-fixtures.mjs <repo>/src/shared/contract/fixtures/config-parity.json` (same for `gen-character-fixtures.mjs`
and `history/gen-fixtures.cjs`).

Static data copied from `extract/` (byte-identical content): `data/appearance-catalog.json` (`Wb`), `data/appearance-ui.json`
(`IT`, labels, part relevance), `data/default-presets.json` (artist presets `_je`, framing weights `Sje`, Anima defaults),
`data/image-size-presets.json`, `data/novelai-models.json`, `data/filename-tag-table.json` (`znt` rows + `Sfe` vocabulary),
`data/v5-directions.json` (built-in scene / image-ratio presets `kj`, comic controls `ek`, default `RPe`; generated from the bundle).
Korean labels in stored data (`기본`, `기본 의상`, `의상 N`, `폼 N`, preset names) are kept as data. The UI translates them for display.

## 2. Prompt keys and ids (Lumiverse mapping)

| Actor | AM key | Port key |
|---|---|---|
| World book entry | `<sourceChaId>::<memberChaId>::lore::<loreId>` | `<characterId>::lore::<worldBookId>:<entryId>` (`lorePromptKey`) |
| Character description pseudo lore | `...::lore::asset-maid:charx-description:v1` | `<characterId>::lore::asset-maid:charx-description:v1` (`descriptionPromptKey`) |
| Custom character | `character_<uuid>` | same (`createCustomCharacter`) |
| Persona | `persona::<id:...|persona:hash>` | `persona::<personaId>` (`personaPromptKey`); `personaSettings.profiles` keyed by Lumiverse persona id |

- Member key (AM `<source>::<member>`) = the Lumiverse character id. Roster maps `selectedLorebooks` / `workspaceDisabledLorebooks`
  are `Record<characterId, selectionId[]>` with selection id `<worldBookId>:<entryId>` (`loreSelectionId`).
- `parsePromptKey` splits a key at the first `::lore::` and then at the first `:` of the lore id (Lumiverse ids contain no `:`).
- Custom character owner key: `<characterId>::custom::<customId>`; virtual member key `virtual-character:<customId>`.
- Local reference binding key: `asset-maid:<enc(owner)>:<enc(semanticId)>` (`referenceBindingKey`, `REFERENCE_SEMANTIC_IDS`).
- Asset refs: `key` = Lumiverse image id (gallery / risu_asset_map / expressions / avatar / image-gen result); `sourceType` adds
  `"persona" | "generated" | "upload"`; AM field `characterTarget.chaId` holds the Lumiverse character id.
- Maps keyed by AM `sourceId`/`chaId` (`charxSettings.overrides`, `activeModules`, `lorebookImageFilters`,
  `artistExtractionAssetBySourceId`, `animaArtists.selection.bySourceId`, `personaSettings.sourceScopes`) are keyed by the Lumiverse character id.
- AM "modules" become extra world books connected to the character (`activeModules[characterId] = worldBookIds`).
- Chat message ids: see §6 (`<lumiverseMessageId>@<swipeIndex>`).

## 3. Global settings (`config.ts`)

`InlayConfig` = AM `Y0` with the Lumiverse mapping:

- `analysis: AnalyzerSettings` = `{connectionId, model, temperature (0..2, 0.2), timeoutMs (1000..300000, 180000),
  reasoning: {mode: "inherit"|"off"|"custom", effort}, jsonMode, vision: "auto"|"supported"|"unsupported", maxTokens}`.
  Legacy AM input: `thinkingMode` default/off/on -> inherit/off/custom; no `thinkingMode` -> `thinkingEnabled ? custom : off`;
  `thinkingLevel` -> effort; the active provider's `providerConfigMap` entry is folded in first (AM `XW`).
- `image: ImageGenerationSettings` = `{connectionId, provider (Lumiverse provider id of the connection), model, comfyuiWorkflowId, parameters}`.
  `runtime.generationProvider` is derived: `novelai` -> `"novelai"`, `comfyui` -> `"comfy-ui"`, anything else -> `"generic"`
  (port addition). Prompt codec: `promptCodecForProvider` -> `novelai-structured` | `anima-flat`. Capabilities table
  `PROVIDER_CAPABILITIES` (AM `W0`); reference gate `isReferenceEnabledForProvider` (AM `Tu`; generic = no references).
- `novelai`: AM NovelAI parameters (analysisProfile, v5UserDirections, width/height, sampler, noiseSchedule, steps, scale,
  cfgRescale, qualityToggle, useCoords, useOrder, characterReference*, characterPrompts, negativePrompt). The model is `image.model`;
  `buildRuntimeConfig` exposes it as `novelai.naiModel` (resolved connection model when no override). V5 models force
  `characterReferenceEnabled=false` (normalize when `image.model` is known, and again in `buildRuntimeConfig`).
- `jevConnection: {rosterSelectionDefault, model}`; `animaArtists` (entries + global default; per-character selection in the document);
  `presetCatalog`; `characterPrompt` = global part (overwriteExistingPrompts, characterReferenceBulkEnabled, personaGender,
  malePersonaPrompt, malePersonaNegativePrompt, personaSettings, fixedPositivePrompt, charxGenerationDefaults, assetRegexEntries,
  artistPrompts); `runtime` (customImageSizes, generationAutoRetryCount 0..10 = 5, nsfwAlwaysEnabled, generationProvider,
  novelaiCallMode "sequential", novelaiParallelIntervalSec 0..30, chatImageWidthPercent 30..100, comfyuiCompletionTimeoutMs
  1000..3600000, comfyuiCharacterReferenceEnabled, comfyuiOutfitReferenceEnabled).
- `DEFAULT_CONFIG` / `createDefaultConfig()`; `normalizeConfig(raw)` / `normalizeConfigWithIssues(raw)`:
  deep merge over defaults, clamps, enums, legacy fallbacks (`v5-hybrid-preview`, `jevConnection.selectionEnabled`, AM `naiModel`
  and `runtime.generationProvider`, removed `imageAutoGenerationEnabled`/`imageGenerationCountPolicy`, `chanServerVirtualImageEnabled`).
  Port additions: NovelAI numbers and enums are clamped to the settings UI ranges (AM kept raw values); unknown keys are dropped;
  `ui.language` default `"en"`.
- Chat image generation settings (separate file, AM `aS`/`Km`): `{autoGenerationEnabled, countPolicy, analysisMode: "single"|"split",
  splitAnalysis: {totalCount|null, batchSize}}`; `loadChatImageGenerationSettings` adds the AM notices and legacy migration
  (`chat-image-count`, old settings fields). Count max 7 (UI) / unlimited (storage, developer mode).
- Overlay UI state (AM `ui-state`): `normalizeUiState` (layout, split ratio 0.35..0.65; per-character tab state kept by the port).

### Per-character override resolution (AM 24584-24900)
- All-character defaults: `characterPrompt.charxGenerationDefaults` (+ `revisionByField`, `dirtyFieldsBySourceId`), global.
- Per-character overrides: `CharacterDocument.characterPrompt.charxSettings.overrides[characterId]` (+ `revisionByField`).
- Fields: `CHARX_SETTING_FIELDS` (nativeAssetVisibility, freeOutfitGeneration, freeCharacterGeneration, rosterSelectionEnabled,
  stateAccumulationEnabled, nsfwAlwaysEnabled, forceAiChoiceCoordinates, autoRemoveConflictingRegex, fixedResolution,
  fixedPositivePrompt, negativePrompt, animaPositivePrompt, animaNegativePrompt).
- Override wins for a field iff it has the field AND (override revision >= default revision, or the field is dirty for this
  character, or (no override revision and default revision 0)).
- `resolveEffectiveConfig(global, {characterId, document | override})` and `charxScopeFor(global, document)` connect the two files.
  The setters are generic over any object with the `CharxScopeConfig` shape (InlayConfig, RuntimeConfig, AM `Y0`).
  `setCharxDefaults` also mirrors `nsfwAlwaysEnabled` -> `runtime`, `negativePrompt` -> `novelai`, `fixedPositivePrompt` -> `characterPrompt`.

### Runtime config for the engine
`buildRuntimeConfig(global, document, {resolvedImageModel})` returns AM's merged `Y0` shape: global fields + the document's
`characterPrompt` fields + `animaArtists.selection.bySourceId[characterId]` + `novelai.naiModel`.

## 4. Per-character document (`character.ts`)

userStorage `characters/<characterId>/asset-maid.json`:

```ts
interface CharacterDocument {
  schema: "inlay-illustrator.character"; version: 1;
  characterId: string; updatedAt: string;
  characterPrompt: CharacterScopedPrompt;   // every source-scoped AM characterPrompt field (domains workspace, prompts, artists
                                            // (selection), asset-selection, asset-analysis, asset-matching, charx-analysis)
  animaArtistId: string | null;             // AM animaArtists.selection.bySourceId[characterId]
  customCharacters: CustomCharacter[];      // AM features.characters.entries (strict wTe validation)
}
```

Decision: the document mirrors Asset Maid's in-memory charx store (`asset-maid.charx` = domain slices of `characterPrompt` +
custom characters) and not the serialized portable v1 text (`asset-maid.portable`, targets `lore:N` + fingerprints). The portable
format exists only to survive RisuAI's device-local asset/lore ids; Lumiverse ids are stable, and the runtime code reads
`characterPrompt` maps keyed by prompt key. A portable v1 import/export can be added later as a converter (AM `rQ`/`ID`).
Values are stored normalized (not as diffs). `normalizeCharacterDocument(raw, characterId)` fills defaults, normalizes forms
(`go`), genders, seeds, recognition keys and framing weights, and drops invalid custom characters with issues.
`removePromptKeyData` removes a prompt key from every per-key map (AM `JJ`). `compactFormCollectionForStorage` is available
when a writer wants AM's compact form (`BW`/`Jje`/`$W`).

Persona appearance lives in the global `personaSettings` (AM "settings" domain), resolved by `resolvePersonaForms`.
NovelAI artist list is global (`characterPrompt.artistPrompts` in `config/artists-global.json`); selection is per character
(`selectedArtistId`). Built-in presets can only store overrides (`listNovelAIArtists`).

## 5. Storage layout (`storage.ts`)

Root: Spindle `userStorage` of the extension (`{DATA_DIR}/users/{userId}/extensions/inlay_illustrator/`).

| Path | Content | AM origin |
|---|---|---|
| `storage-schema.json` | `{schema:"inlay-illustrator.storage", version:1, createdAt}` | `asset_maid:v1:schema` |
| `config/model.json` | diff vs defaults: analysis, jevConnection, novelai (minus negativePrompt/characterPrompts), image | `config:model` |
| `config/settings.json` | diff vs defaults: version, enabled, ui, presetCatalog.rawJson, runtime, novelai.negativePrompt, characterPrompt (global, minus artistPrompts) | `config:settings` |
| `config/artists-global.json` | `{characterPrompt:{artistPrompts}}` | `config:artists-global` |
| `config/anima-artists.json` | entries + `selection.defaultId` | `config:anima-artists` (global part) |
| `config/chat-image-generation-settings.json` | chat image settings | `config:chat-image-generation-settings` |
| `config/ui-state.json` | overlay UI state | `ui-state` |
| `config/asset-reference-bindings.json` | `Record<bindingKey,{reference, updatedAt}>` | `runtime:asset-reference-bindings` |
| `config/image-prompt-overrides.json` | `Record<characterId,{overrides, updatedAt}>` | `runtime:image-prompt-overrides` |
| `config/source-selection.json` | last active character | `source-selection` |
| `config/metadata-tag.json` | metadata state per character | `metadata-tag` |
| `characters/<characterId>/asset-maid.json` | `CharacterDocument` | charx lore entry `asset-maid:data` |
| `characters/<characterId>/metadata-cache.json` | `assetMetadataAvailability` | `local:metadata-cache:<sourceId>` |
| `characters/<characterId>/reference-crops/<name>.png` | crop images | `__asset_maid_crop_*` assets |
| `chats/<chatId>/chat-data.json` | `ChatDataDocument` | chat localLore `asset-maid:chat-data` + `asset-maid:current-actor-state` |
| `uploads/<id>.<ext>` | uploaded reference images (when not stored as Lumiverse images) | `saveAsset` |

- `STORAGE_PATHS` builds the paths; ids go through `safePathSegment` (UUID-like ids unchanged, others percent-encoded, `.`/`..` rejected).
- `splitConfigForStorage(config)` / `mergeStoredConfig(parts)` convert between `InlayConfig` and the four config files.
- Versions: `STORAGE_FILE_VERSIONS`; documents carry `schema` + `version`. `migrateStoredFile(kind, raw)` runs `STORAGE_MIGRATIONS`
  hooks (missing `version` = 0), re-stamps the version, and reports `tooNew` for files from a newer build (do not overwrite them).
- Reset: factory reset = delete `STORAGE_RESET_PREFIXES`; character reset = `characterResetPaths(characterId)` (chats and images stay).
- Not stored (memory only, like AM): display maps, runtime logs, zoom seed flag. Unmapped AM keys: `UNMAPPED_ASSET_MAID_KEYS`.
- Old Lightboard files (`config.json`, `states/`, `records/`, `workflows/`) are listed in `LEGACY_LIGHTBOARD_PATHS`; the port does not read them.
- Generated images are Lumiverse image-gen results (`/api/v1/image-gen/results/<id>`); the chat data stores their names/ids only.

## 6. Chat data and Image History (`src/shared/contract/chat.ts`, `history.ts`)

Port of Asset Maid 0.9.88 chat-scoped data: chat store (`uN`), Image History tree (`hBe`/`Zne`/`IBe`), projections
(`NR`/`lK`), illustration plans (`wSt`/`aO`), current actor state, generation journal types. Parity fixtures in
`src/shared/contract/fixtures/history/*.json` were produced by running the original bundle code.

### Storage

One JSON document per chat: userStorage `chats/<chatId>/chat-data.json`.

```ts
interface ChatDataDocument {
  schema: "inlay-illustrator.chat-data"; version: 1;
  chatId: string;            // Lumiverse chat id (must match the owning chat)
  updatedAt: string;         // ISO date
  store: ChatStore;          // Asset Maid durable chat store (messages + jobs), keys = HistoryMessageId
  history: HistoryTree;      // Image History tree, persisted directly; chatKey = "chat:<chatId>"
  plans: Record<string /* illustration:<HistoryMessageId> */, IllustrationPlan>;
  actorState: CurrentActorState;   // `asset-maid:current-actor-state`; {revision:0, actors:{}} = none yet
}
```

- Asset Maid kept the store in `chat.localLore` (`asset-maid:chat-data`, `@@dont_activate {json}`). The port does not
  use lore entries. `parseAssetMaidChatStoreContent` reads the old carrier for imports only.
- `createEmptyChatData(chatId)` returns the empty document.
- `validateChatData(raw, chatId)` is strict (no repair). `normalizeChatData(raw, chatId)` is the lenient load:
  - A missing document (`undefined`/`null`) gives an empty document with `repaired: false`.
  - Another schema/version, or a non-object, gives an empty document with `repaired: true`.
  - Each invalid part (store, history, plans, actorState) is reset alone and reported as `ChatDataIssue {part, code, path, message}`.
  - If the history is invalid and the store is valid, the history is rebuilt with `projectStoreToTree` (lossy) and the issue `history-rebuilt` is added.
- Write order (backend): mutate the tree (`commitRevision`, `applyHistoryCommand`/`mutateHistoryTree`,
  `appendGeneratedEntry`, `deleteGeneratedEntry`, `syncIllustrationWorkflows`). Then call
  `store = foldTreeIntoStore(store, tree)` so the store keeps `sources`, continuity and jobs in sync. Then write the
  document. All functions are pure and return new objects.

### Message identity (swipes)

- `HistoryMessageId = "<lumiverseMessageId>@<swipeIndex>"`. Use `toHistoryMessageId(id, swipe)` to build it and `parseHistoryMessageId` to read it.
  The split is at the last `@`. The swipe index is a canonical integer (no leading zero).
- Tree message keys: `chatMessageKey(id)` = `chat:<id>` (inline/chat mode) and `illustrationMessageKey(id)` = `illustration:<id>`.
- Slot ids: `illustrationSlotId(key, n)` = `illustration:<id>:slot:<n>` and `chatSlotId(id, n)` = `chat:<id>:slot:<n>`.
  The store projection uses `<messageKey>:slot:<n>` (`historySlotId`).
- History `chatKey` = `chatKeyForChat(chatId)` = `chat:<lumiverseChatId>`.
- Store message keys and tree `messageId`s must parse as `HistoryMessageId`, else the issue code is `message-id-swipe`.
  Asset Maid only forbade the `id:`/`index:` prefixes.
- Generated asset names: `<label>.__am__.<chat|outfit>.<uuid>`. Use `createGeneratedAssetName` (pMe) and `sanitizeAssetLabel` (EZ: NFKC, max 96 chars).
  Use `parseGeneratedAssetName` (NZ) and `isGeneratedAssetName` (HE) to read them. The pattern and separator come from `character.ts`.

### Image History tree (`history.ts`)

- The types use Asset Maid field names: `HistoryTree {chatKey, entriesById, slotsById, messagesByKey}`, `HistoryEntry`,
  `HistorySlot`, `HistoryMessage` (`chat` | `illustration` with `workflow`), `HistoryRevision`, `IllustrationWorkflow`, `CountPolicy`.
- `validateHistoryTree(tree)` returns `{ok:true, tree}` (canonical) or `{ok:false, issues}`. It uses the 69 Asset Maid issue codes
  and paths (`HISTORY_ISSUE_CODES`). Each issue has an English `message` and the original Korean `messageKo`.
  `assertHistoryTree` throws `HistoryInvariantError`.
- Canonical JSON (`serializeHistoryTree`, `parseHistoryTree`): the keys of `entriesById`, `slotsById`, `messagesByKey`
  and revision `slotsById` are sorted with `localeCompare`, as in Asset Maid `Xne`.
- Commands: `applyHistoryCommand(tree, cmd)` / `applyHistoryCommands` (Zne) cover `add-message`, `delete-message`,
  `set-message-identity`, `set-illustration-workflow`, `append-revision`, `append-entry`, `append-slot`,
  `set-revision-outcome`, `set-active-revision`, `set-default-entry`, `delete-slot`, `delete-entry` and `prune-slot`.
  A broken command rule throws `HistoryCommandError`. `originalMessage` holds Asset Maid's text when it was Korean or RisuAI-specific.
  `mutateHistoryTree` also validates and canonicalizes the result, like the Asset Maid repository.
- Cleanup (`PR`): removes empty revisions (child revisions are re-parented), resets a dangling `activeRevisionId`, and removes empty chat messages and orphan slots/entries.
  The cap (`CR`) is `MAX_GENERATED_ENTRIES_PER_SLOT = 99` generated entries per slot. When a slot goes over the cap, its oldest entries are pruned first.
  Pruning does not delete asset files.
- `commitRevision(tree, {message, revision, slots, activate})` is the pure port of the controller's commitRevision.
  For a new revision it runs `append-revision`. For an existing revision it runs `set-revision-outcome` + `append-slot`/`append-entry` + `set-default-entry`.
  If an entry id already exists with different content, it throws a conflict error.
- Entry origins: `initial`, `retry`, `reroll`, `regenerate`. The journal attempt kind `automatic` maps to `initial`.
- Projections: `projectStoreToTree(store, chatKey, indexes?)` (NR) and `foldTreeIntoStore(store, tree)` (lK).

### Port fixes (differences from Asset Maid)

1. The tree is persisted directly. In Asset Maid it was re-projected from the store on every load, so these values were lost:
   entry/slot ids, `createdAt`, `generationOrigin`, `parentEntryId`, the chosen default entry, `assetHints`, range count
   policies and the active revision. In the port they are durable.
2. Illustration plans are persisted in `plans`. Asset Maid rebuilt them from the tree.
3. The empty actor state `{revision:0, actors:{}}` is a valid stored value. Asset Maid represented it as an absent lore entry.
4. Message ids carry the swipe index (`id@swipe`).
5. Validators return issue lists instead of `null`/throwing. The accept/reject decisions and the normalized output are identical (parity-tested).

### Other chat-scoped types (`chat.ts`)

- Count policy (`qf`/`Gf`/`IW`/`SW`/`w5`): `fixedCountPolicy`, `normalizeCountPolicy`, `countPolicyValues`,
  `clampCountPolicyToResolved`, `normalizeRequestedCount`, `MAX_IMAGE_COUNT = 7`, `UNLIMITED_IMAGE_COUNT`.
- Illustration plans: `createIllustrationPlan` (wSt), `plansFromHistoryTree` (aO), `workflowFromPlan` (Z_e),
  `workflowSyncInputs` (B1t), `nextIllustrationAttempt` (U5), `reconcilePlanWithTree` (fq), `normalizeIllustrationPlan`.
- Actor state: `validateCurrentActorState` (Wv rules), `actorStateFromContinuityRecord` (zne),
  `applyActorStateToContinuity` (Lne), `filterActorStateRecord` (Dne).
- Generation journal: types, limits and `createEmptyJournal()` only. The journal had no effect in Asset Maid (spec pipeline §7).

## 7. RPC protocol (`rpc.ts`)

- Transport: Spindle frontend/backend messages; every payload is an envelope with `type: "inlay-illustrator:rpc"` and `protocol: 1`.
- Request `{kind:"request", requestId, method, params}` -> exactly one response `{kind:"response", requestId, method, ok:true, result}`
  or `{ok:false, error: RpcError}`. Events `{kind:"event", event, payload, seq}` are pushed by the backend.
- `RpcMethods` maps each method to `{params, result}`; `RpcRequest`, `RpcResponse`, `RpcEvent` are the discriminated unions.
  `RPC_METHODS` / `RPC_EVENTS` are the runtime lists (compile-time checked for completeness). `RpcHandlers<Ctx>` types the backend router.
- Helpers: `createRequest`, `createRequestId`, `okResponse`, `errorResponse`, `createEvent`, `rpcError`, guards `isRpcRequest/Response/Event`.
- Method groups (from the spec/ui.md action lists): session/status; settings (`config.*`, `chatImageGeneration.set`, `uiState.set`);
  connections and tests; charx rail / workspace / roster / recognition keys; custom characters; prompts (forms saved as a whole
  collection with `baseRevision` = `formCollectionRevision`, edited client-side with the pure form ops); assets / picker / crops /
  uploads / metadata; analysis controllers (`analysis.start` with `AnalysisKind`, `analysis.cancel`); artists; personas; outfit /
  reference image generation; current / all charx settings and data reset; logs; chat-side generation (start/cancel/retry/restart/
  dismiss/regenerateSlot); history (select entry/revision, delete entry/slot with preview token, cleanup retry); zoom (details,
  drafts, import viewed prompts/seed, AI prompt edit); chat state window.
- Errors: `RpcError {code, message (English), messageKo?, retryable?, detailCode?, details?}`; codes `bad-request`, `unknown-method`,
  `not-found`, `conflict`, `busy`, `cancelled`, `timeout`, `permission-denied`, `unsupported`, `provider-error`, `storage-error`,
  `protocol-mismatch`, `internal`.
- Frontend-only actions (no RPC): zoom image download, DOM history browsing previews, filters, layout.

## 8. Dropped Asset Maid fields

| AM field | Reason |
|---|---|
| `analysis.provider`, `format`, `endpoint`, `apiKey`, `providerConfigMap`, `customHeaders` | Replaced by a Lumiverse connection profile (`analysis.connectionId`). |
| `analysis.thinkingEnabled`, `thinkingMode`, `thinkingWire`, `thinkingLevel` | Mapped to `analysis.reasoning` (Lumiverse reasoning DTO); wire variants are the host's job. |
| `analysis.cacheMode`, `modelCacheMetadata` | Prompt caching dropped (PORT-PLAN). |
| `analysis.pdfRequestsEnabled` | PDF transport dropped (PORT-PLAN). |
| `analysis.modelInputMode` | UI detail of AM's model picker; Lumiverse lists models per connection. |
| `auxAnalysis` (whole object) | Never used by any AM call (spec/llm.md §0.9). |
| `jevConnection.apiKey` | JEV pre-selection is optional/later; secrets would go to `spindle.enclave`, not settings. |
| `novelai.apiKey`, `novelai.endpoint` | The Lumiverse image-gen connection owns key and URL. |
| `novelai.naiModel` (stored) | Replaced by `image.model`; exposed again as `naiModel` in `RuntimeConfig`. |
| `runtime.comfyuiTransport` | Only the direct workflow path exists (host ComfyUI connection). |
| `runtime.chanServerRequestUrl`, `chanServerApiKey` | Chan Server provider dropped (PORT-PLAN). |
| `runtime.comfyuiEndpoint` | Host ComfyUI connection owns the URL. |
| `runtime.comfyuiWorkflowProfileId` | Host workflow mapping replaces AM's bundled workflow profile; `image.comfyuiWorkflowId` selects a saved workflow. |
| `runtime.comfyuiWorkflowUiJson` | Dead setting in AM (normalized, never read). |
| `runtime.chanServerVirtualImageEnabled`, `runtime.imageAutoGenerationEnabled`, `charxGenerationDefaults.imageAutoGenerationEnabled/imageGenerationCountPolicy` | Already removed by AM's own normalizer (`uEe`); chat image settings replace them. |
| `ui.language` default "ko" | Port default is "en" (field kept). |
| Community Library keys (`community-upload`, visitor/owner ids, notices) | Maid Library sharing dropped (PORT-PLAN). |
| `vertex-cache:*` | Direct Vertex transport dropped. |
| `active-instance` | One backend worker per user; no multi-instance race. |
| Portable v1 entity fingerprints (`entities.*`) | Lumiverse ids are stable; see §4 decision. |

## 9. Versioning

- `CONFIG_VERSION`, `CHARACTER_DOCUMENT_VERSION`, `CHAT_DATA_VERSION`, `STORAGE_LAYOUT_VERSION`, `RPC_PROTOCOL_VERSION` are all 1.
- A breaking shape change bumps the file version and adds a `StorageMigration` hook (`from` -> `to`); normalizers keep accepting
  older shapes. Files newer than the build are reported `tooNew` and must not be overwritten.
- The RPC handshake (`session.hello`) exchanges `protocol`; mismatches answer `protocol-mismatch`.
- Parity fixtures pin Asset Maid 0.9.88 behaviour; a deliberate deviation must update the fixture test with a comment.

## 10. Chat DOM (`chat-dom.ts`)

- The backend bakes one block per selected History entry into the message content: `<!-- inlay_illustrator -->` + one
  `div.inlay-illustrator-image.am-illustration-projection[data-inlay-illustrator="true"][data-no-island]` holding only
  `span.inlay-illustrator-frame > img` (no nested `div`). Blocks go after the blank line of paragraph gap `slotIndex` (AM
  `insertionOffsets`), each followed by a blank line. The interceptor strips them, so baking is idempotent.
- Wrapper attributes: `ILLUSTRATION_ATTR` (`data-inlay-illustrator-{chat-id,message-id,swipe-id,message-key,revision-id,slot-id,
  slot-index,entry-id,asset,image-id,entry-index,entry-count,can-regenerate,image-index}`); parse with `readIllustrationAttributes`.
- Native asset suppression carrier: `span.am-native-asset-suppression[data-inlay-illustrator-suppressed][data-inlay-illustrator-suppressed-payload]`.
- The frontend injects the controls (footer + edge controls) and maps `CHAT_ACTIONS` to RPC (`CHAT_ACTION_RPC`); state from
  `chatDom.getMessageStates`, refreshed on `chatData.changed`, progress from `generation.progress` / `generation.finished`.
- History entries of generated images: `assetName = <label>.__am__.chat.<uuid>`, `savedPath = /api/v1/image-gen/results/<imageId>`.
- Pipeline sidecar (backend-private): `chats/<chatId>/pipeline.json` (generation records for regeneration / zoom, zoom drafts).

## 11. Fetch bridge (`bridge.ts`)

Backend -> frontend `{type:"inlay-illustrator:fetch-request", requestId, url, as:"base64"|"json"}`; the frontend fetches the
same-origin `/api/...` URL (`isAllowedBridgeUrl`) and answers once with `{type:"inlay-illustrator:fetch-response", requestId,
data+mimeType | json | error, status?}`. Used for image bytes (vision, references) and REST-only data (character gallery,
LLM model lists). The legacy `avatar_image_request/response` pair is still accepted.
