/**
 * Parity driver for v4-5 visual continuity sequences. The SAME driver runs in the fixture generator (ORIGINAL bundle
 * functions via `__AM_eval`) and in the bun tests (port core exports).
 *
 * Per turn (mirrors E1t 169508-169524 / 169812-169856):
 *   reconcile?  reconcileContinuityCheckpoints(state, chatKey, liveIds)                         Pte
 *   context     buildVisualContinuityContext(state, chatKey, [primaryKey, secondaryKey], ...)   NAt
 *   apply       applyVisualContinuityToPlan(plan, ruleRuntime, {previousCharacterStateMap, ...}) z9e
 *   update      live: updateVisualContinuity (fKe) | deferred: computeDeferredVisualContinuity (mKe)
 *   storage     setItem: writeContinuityCheckpointsToChatStore (NBe) + readContinuityCheckpointsFromChatStore (OBe)
 *               + toLocalLoreActorEntry (zne) + writeLocalLoreActorState (Tne)
 *               getItem: rebuildContinuityFromChatStore (aoe) + mergeLocalLoreActorState (Lne) + readLocalLoreActorState (Wv)
 *   v5 basis    createV5ContinuityBasis(getLatestContinuityCheckpointSnapshot(state, chatKey, "novelai-v5"))  vN / D5e
 */
import { toPlain } from "../../testing/plain";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Fn = (...args: any[]) => any;

export interface ContinuityCoreFns {
  createV45RuleRuntime: Fn; // DLe
  createEmptyContinuityState: Fn; // $g
  applyVisualContinuityToPlan: Fn; // z9e
  updateVisualContinuity: Fn; // fKe
  computeDeferredVisualContinuity: Fn; // mKe
  reconcileContinuityCheckpoints: Fn; // Pte
  buildVisualContinuityContext: Fn; // NAt
  writeContinuityCheckpointsToChatStore: Fn; // NBe
  readContinuityCheckpointsFromChatStore: Fn; // OBe
  rebuildContinuityFromChatStore: Fn; // aoe
  rebuildContinuityAtMessage: Fn; // ooe
  readLocalLoreActorState: Fn; // Wv
  writeLocalLoreActorState: Fn; // Tne
  mergeLocalLoreActorState: Fn; // Lne
  toLocalLoreActorEntry: Fn; // zne
  getLatestContinuityCheckpointSnapshot: Fn; // D5e
  createV5ContinuityBasis: Fn; // vN
  stripAccumulationState: Fn; // TA
}

export interface ContinuityTurn {
  plan: { images: Array<Record<string, any>>; [key: string]: unknown };
  messageId: string;
  messageIndex: number;
  chatIndex?: number;
  advanceTurn?: boolean;
  mode: "live" | "deferred" | "none";
  historyRevisionId?: string;
  historyRevisionOrder?: number;
  outfitReferences?: unknown[];
  /** Run Pte before the turn with these live message ids (chat message ids in order). */
  reconcileLiveIds?: string[];
  /** Run the storage round trip (setItem then getItem) after the turn. */
  storageRoundTrip?: boolean;
}

export interface ContinuitySequence {
  name: string;
  seed: number;
  chatKey: string;
  stateAccumulationEnabled?: boolean;
  turns: ContinuityTurn[];
  /** Message ids of the chat after the sequence (for the final reconcile / rebuild checks). */
  finalLiveIds?: string[][];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function memoryController(state: any) {
  return {
    state,
    async mutate(fn: (s: any) => void) {
      fn(this.state);
    },
  };
}

export async function runContinuitySequence(fns: ContinuityCoreFns, seq: ContinuitySequence): Promise<unknown[]> {
  const rt = fns.createV45RuleRuntime();
  const controller = memoryController(fns.createEmptyContinuityState());
  const chat: any = { message: [], localLore: [] };
  const store: any = { messages: {} };
  const out: unknown[] = [];
  const ck = seq.chatKey;
  for (const [index, turn] of seq.turns.entries()) {
    const rec: Record<string, unknown> = { turn: index };
    if (turn.reconcileLiveIds) {
      rec.reconcile = fns.reconcileContinuityCheckpoints(controller.state, ck, turn.reconcileLiveIds);
    }
    const state = controller.state;
    const plan = clone(turn.plan);
    const first = plan.images[0] ?? {};
    const keyOf = (slot: string) => String(first.actors?.[slot]?.lorebook_prompt_key ?? "");
    rec.context = fns.buildVisualContinuityContext(
      state,
      ck,
      [keyOf("primary"), keyOf("secondary")].filter(Boolean),
      ["lore:alice", "lore:bob"],
      ["persona::p1"],
      {},
    );
    if (seq.stateAccumulationEnabled === false) rec.strippedContext = fns.stripAccumulationState(rec.context);
    const continuity = fns.applyVisualContinuityToPlan(plan, rt, {
      previousCharacterStateMap: state.characters[ck] ?? {},
      previousGlobalModifierRefs: state.modifierRefs[ck]?.global ?? {},
      advanceTurn: turn.advanceTurn,
      stateAccumulationEnabled: seq.stateAccumulationEnabled,
    });
    rec.apply = {
      characterStates: continuity.characterStates,
      imageActorStates: continuity.imageActorStates,
      imagePromptSelections: continuity.imagePromptSelections,
      nsfwSourceImageTokens: continuity.nsfwSourceImageTokens,
      modifiers: continuity.plan.images.map((i: any) => i.modifiers),
    };
    const common = {
      controller,
      continuity,
      chatKey: ck,
      chatIndex: turn.chatIndex ?? 0,
      messageIndex: turn.messageIndex,
      messageId: turn.messageId,
      outfitReferences: turn.outfitReferences ?? [],
    };
    if (turn.mode === "live") await fns.updateVisualContinuity(common);
    else if (turn.mode === "deferred")
      await fns.computeDeferredVisualContinuity({
        ...common,
        basisState: clone(controller.state),
        historyRevisionId: turn.historyRevisionId,
        historyRevisionOrder: turn.historyRevisionOrder,
      });
    // keep a chat transcript + chat-store generation per message (shape read by aoe / NBe)
    const rawId = String(turn.messageId).replace(/^id:/u, "");
    if (!chat.message.some((m: any) => m.chatId === rawId)) chat.message.push({ role: "char", data: `message ${rawId}`, chatId: rawId });
    store.messages[rawId] ??= { generations: [] };
    const gens = store.messages[rawId].generations;
    gens.push({ id: turn.historyRevisionId ?? `gen-${index}`, slots: { "0": [{ assetName: `img-${index}` }] } });
    if (turn.storageRoundTrip) {
      // setItem (180489-180508)
      fns.writeContinuityCheckpointsToChatStore(store, controller.state, ck);
      const indexById = new Map<string, number>(chat.message.map((m: any, i: number) => [m.chatId, i]));
      const fromStore = fns.readContinuityCheckpointsFromChatStore(store, ck, indexById);
      const lore = fns.readLocalLoreActorState(chat);
      const actors = { ...lore.actors };
      for (const [key, value] of Object.entries(fromStore.characters[ck] ?? {})) actors[key] = fns.toLocalLoreActorEntry(value);
      fns.writeLocalLoreActorState(chat, { revision: lore.revision + 1, actors });
      // getItem (180470-180478)
      const rebuilt = fns.rebuildContinuityFromChatStore(store, ck, chat.message);
      rebuilt.characters[ck] = fns.mergeLocalLoreActorState(rebuilt.characters[ck] ?? {}, fns.readLocalLoreActorState(chat));
      rec.storage = { store: clone(store), localLore: clone(chat.localLore), rebuilt };
      rec.rebuiltAtMessage = fns.rebuildContinuityAtMessage(store, ck, chat.message.map((m: any) => m.chatId), rawId);
    }
    rec.v5Basis = fns.createV5ContinuityBasis(fns.getLatestContinuityCheckpointSnapshot(controller.state, ck, "novelai-v5"));
    rec.v5BasisFromCharacters = fns.createV5ContinuityBasis({ characters: controller.state.characters[ck] ?? {} });
    rec.state = clone(toPlain(controller.state));
    out.push(toPlain(rec));
  }
  for (const live of seq.finalLiveIds ?? []) {
    const copy = clone(controller.state);
    const status = fns.reconcileContinuityCheckpoints(copy, ck, live);
    out.push(toPlain({ reconcile: live, status, state: copy }));
  }
  return out;
}
