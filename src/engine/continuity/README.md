# engine/continuity — V5 continuity document and chat-store checkpoints

Typed facades over the verbatim Asset Maid 0.9.90 core. 0.9.90 removed local state accumulation (and with it the
local-lore actor state, `nsfwPositions`, `historicalStaticBases`) and V4.5 continuity. The 0.9.88 storage bridge
(`storage-core.ts`, a second generated slice) is gone; the port now uses the 0.9.90 functions directly.

## Module map
| file | API | originals (p120) |
|---|---|---|
| `types.ts` | `ContinuityState` (`{version:1, scenes, characters, modifierRefs, outfitRefs, recentCheckpoints}`), `ContinuityCheckpoint`, `StoredContinuityCheckpoint`, `ContinuityChatStore`, `ContinuityChatStoreGeneration`, `ContinuityChatMessage`, `V5ContinuityBasis` | — |
| `state.ts` | `createEmptyContinuityState`, `normalizeContinuityState`, `pushContinuityCheckpoint`, `hasStoredContinuity`, `isStableContinuityMessageId`, `getLatestContinuityCheckpointSnapshot`, `createV5ContinuityBasis`, `persistV5ContinuityState` | `UE`, `B3e`, `K3e`, `$3e`, `qE`, `j3e`, `BE`, `G3e` |
| `storage.ts` | `rebuildContinuityFromChatStore`, `rebuildContinuityAtMessage`, `readGenerationContinuityCheckpoint`, `continuityCheckpointToStore`, `commitContinuityCheckpoint`, `clearContinuityFromChatStore` | `txt`, `gwe`, `Qyt`, `rxt`, history save `bwe` @171608 |

## Flow (AM 0.9.90 chat flow `Vxt`)
1. Basis: `state = messageId ? rebuildContinuityAtMessage(store, chatKey, ids, messageId) : rebuildContinuityFromChatStore(store, chatKey, messages)`.
2. Orchestrator input: `previousContinuitySnapshot = getLatestContinuityCheckpointSnapshot(state, chatKey, "novelai-v5")`.
3. `applyV5Continuity(v5State)` callback: `next = persistV5ContinuityState({basisState: state, continuity: v5State,
   chatKey, chatIndex, messageIndex, messageId: "id:<msg>", historyRevisionId, historyRevisionOrder, now})`.
4. History save: `commitContinuityCheckpoint(store, next, chatKey, messageId, historyRevisionId)` stores the compact
   checkpoint on the generation (only when it has none yet). The store is `{messages: {<id>: {generations: [{id,
   continuity?}]}}, jobs}`; AM keeps it in its chat lore, the port in userStorage.

Removed from the 0.9.89 port API: `applyVisualContinuityToPlan`, `computeDeferredVisualContinuity`,
`updateModifierRefs`, `mergeActorContinuityState`, `stripAccumulationState`, `buildVisualContinuityContext` (moved to
`context`), local-lore `read/write/mergeLocalLoreActorState`, `toLocalLoreActorEntry`, `readContinuityFromChat` /
`writeContinuityToChat` / `clearContinuityFromChat`, `serializeContinuityState`. `commitContinuityCheckpoint` now takes
`(store, next, chatKey, messageId, historyRevisionId)` and returns `"committed" | "already-committed" | "missing"`.

## Tests
`continuity.test.ts` (3 tests; generator `S/engine-build/gen/continuity.mjs`): a two-turn chat sequence whose V5 states
come from real orchestrator runs (persist, snapshot, basis, commit, re-commit, rebuild from transcript and at a message,
second turn on the rebuilt state), checkpoint pushes (stable / unstable ids, promotion), stable-id vectors and normalization.
