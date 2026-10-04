# engine/continuity — v4-5 visual continuity

Typed facades over the verbatim Asset Maid 0.9.88 core. Spec: spec/pipeline.md §3.7.

## Module map
| file | API | originals |
|---|---|---|
| `types.ts` | ContinuityState, ContinuityCheckpoint, ActorContinuityState, VisualContinuityResult, VisualContinuityContext, LocalLoreActorState, ContinuityChatStore | — |
| `state.ts` | `createEmptyContinuityState`, `pushContinuityCheckpoint`, `reconcileContinuityCheckpoints`, `hasContinuityData`, `serializeContinuityState`, `isStableContinuityMessageId`, `getLatestContinuityCheckpointSnapshot`, `createV5ContinuityBasis` | $g 42944, K8 42761, Pte 42905, hDe 42968, Ete 43321, Kg 42658, D5e 38084, vN 38066 |
| `apply.ts` | `applyVisualContinuityToPlan`, `mergeActorContinuityState`, `stripAccumulationState`, `buildVisualContinuityContext` | z9e 52249, iKe 48719, TA 52318, NAt 167494 |
| `update.ts` | `updateVisualContinuity` (live), `computeDeferredVisualContinuity` (deferred), `updateModifierRefs` | fKe 48903, mKe 48945, Ore 48786 |
| `storage.ts` | chat store: `writeContinuityCheckpointsToChatStore`, `readContinuityCheckpointsFromChatStore`, `rebuildContinuityFromChatStore`, `rebuildContinuityAtMessage`; local lore: `readLocalLoreActorState`, `writeLocalLoreActorState`, `mergeLocalLoreActorState`, `toLocalLoreActorEntry`, `applyActorStateEdit`, `CURRENT_ACTOR_STATE_LORE_ID`; adapter: `readContinuityFromChat` (getItem), `writeContinuityToChat` (setItem), `clearContinuityFromChat` (removeItem), `createMemoryContinuityController` | NBe 54505, OBe 54434, aoe 54489, ooe 54458, Wv 52355, Tne 52403, Lne 52420, zne 52340, Dne 52431; boot adapter 180461-180536 |
| `testing/sequence.ts` | multi-turn parity driver shared by generator and tests | — |

## Flow (where the backend calls what)
1. beforeRequest: `reconcileContinuityCheckpoints(state, chatKey, liveMessageIds)` inside `controller.mutate` (message deletion/reorder).
2. Analysis input: state = `readContinuityFromChat(store, chat, chatKey)` (or `rebuildContinuityAtMessage` for history rebuilds);
   context = `buildVisualContinuityContext(...)`; `previousCharacterStateMap = state.characters[chatKey]`;
   `previousGlobalModifierRefs = visualContinuity.previous_modifiers.global`; `stripAccumulationState` when accumulation is off.
3. The orchestrator calls `applyVisualContinuityToPlan` (z9e) itself; `applyContinuity(result)` is the host callback.
4. After all images are saved: live → `updateVisualContinuity`; deferred (history commit) → `computeDeferredVisualContinuity`.
5. Persist: `writeContinuityToChat(store, chat, state, chatKey)` (Lumiverse: `chats/<chatId>/chat-data.json` store + the
   "local lore" actor entry; the port may keep the local-lore entry inside chat-data instead of the Risu chat localLore).

## Inputs read
- Plan images: `actors.*.{lorebook_prompt_key, gender, source}`, `modifiers.{global,actors}`, `visual_continuity_clear`,
  `visual_continuity_counts` (`{primary:{cum_count}}`), `source_image_token`, `preset_id` (NSFW presets for nsfwPositions).
- Run flags: `advanceContinuityTurn` (`W.advanceContinuityTurn ?? !forceGeneration`), `stateAccumulationEnabled` (per source, default false).
- Message ids: `id:<messageId>` only; `index:` / `request:` / `response-` ids update state without a checkpoint.

## Parity coverage (`bun test src/engine/continuity`, 13 tests / 220+ assertions)
Generator `scratch/engine/continuity/gen.mjs` (original bundle, seeded clock):
- 6 multi-turn sequences (9/9/5/8/6/10 turns): cum_count accumulation 1→7 and reset by clear, option clear and `*` clear,
  global scene clear, accumulation enabled / disabled / default, ttl expiry (`state.after_activity` ttl 1, saliva ttl 2) with
  `advanceTurn:false`, female/male `when`, persona + secondary actors, two identities in one message, deferred checkpoints with
  history revisions, unstable message ids, reconcile before turns (restored), skipped stale updates. Every turn compares: Pte result,
  NAt context, z9e result (states, selections, rewritten modifiers), full state, chat store + local lore after the storage round trip,
  rebuilt state (aoe+Lne), ooe, v5 basis (vN from D5e and from characters). Final reconcile variants (unchanged/restored/cleared).
- Units: iKe (144 combinations), TA, Tne/Wv incl. invalid payloads, Lne, zne, $g.
- The composed `writeContinuityToChat` / `readContinuityFromChat` reproduce the driver's verbatim boot sequence for every turn.

## Gaps
- The debounced persistence controller (`pKe`/`Rre`, 1200 ms debounce) is host-side and not ported; use your own
  controller with `mutate` (see `createMemoryContinuityController`).
- Legacy-catalog continuity (`E9e`/`N9e`) is not fixture-tested (no legacy catalog sample, see compose README).
- V5 continuity commit (`Wte`/`A8e`/`ODe`) belongs to the v5 area; only `vN`/`D5e` are covered here.
