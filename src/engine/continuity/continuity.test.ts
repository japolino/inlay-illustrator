// Fixtures: bun S/engine-build/gen/continuity.mjs (ORIGINAL 0.9.90 bundle; S = the am990 scratch dir). The V5
// continuity states of the two turns come from real orchestrator runs (v5/compose.default.novelai.json and
// v5/compose.continuity.turn2.json).
import { describe, expect, test } from "bun:test";
import fixture from "../__fixtures__/continuity/sequence.json";
import { toPlain } from "../testing/plain";
import {
  commitContinuityCheckpoint,
  createEmptyContinuityState,
  createV5ContinuityBasis,
  getLatestContinuityCheckpointSnapshot,
  hasStoredContinuity,
  isStableContinuityMessageId,
  normalizeContinuityState,
  persistV5ContinuityState,
  pushContinuityCheckpoint,
  readGenerationContinuityCheckpoint,
  rebuildContinuityAtMessage,
  rebuildContinuityFromChatStore,
  type ContinuityChatStore,
  type ContinuityState,
} from "./index";

/* eslint-disable @typescript-eslint/no-explicit-any */
const plain = (v: unknown) => JSON.parse(JSON.stringify(toPlain(v)));
const seq = fixture.sequence as any;
const exp = fixture.expected as any;
const chatKey: string = seq.chatKey;

describe("continuity chat sequence (0.9.90 chat-lore document + chat store)", () => {
  test("two V5 turns: persist, snapshot, commit, rebuild", () => {
    const s0 = createEmptyContinuityState();
    expect(plain(s0)).toEqual(exp.empty);
    const s1 = persistV5ContinuityState({ basisState: s0, chatKey, ...seq.turn1 });
    expect(plain(s1)).toEqual(exp.s1);
    const snap1 = getLatestContinuityCheckpointSnapshot(s1, chatKey, "novelai-v5");
    expect(plain(snap1 ?? null)).toEqual(exp.snapshot1);
    expect(plain(createV5ContinuityBasis(snap1))).toEqual(exp.basis1);
    expect({ s0: hasStoredContinuity(s0, chatKey), s1: hasStoredContinuity(s1, chatKey), other: hasStoredContinuity(s1, "other-chat") }).toEqual(exp.hasStored);

    const store: ContinuityChatStore = {
      messages: { "msg-1": { kind: "inline", generations: [{ id: "rev-1" }, { id: "rev-1b" }] }, "msg-3": { kind: "inline", generations: [{ id: "rev-3" }] } },
    } as any;
    expect({
      first: commitContinuityCheckpoint(store, s1, chatKey, "msg-1", "rev-1"),
      again: commitContinuityCheckpoint(store, s1, chatKey, "msg-1", "rev-1"),
      otherRevision: commitContinuityCheckpoint(store, s1, chatKey, "msg-1", "rev-1b"),
      unknownMessage: commitContinuityCheckpoint(store, s1, chatKey, "msg-9", "rev-1"),
    }).toEqual(exp.commit1);
    expect(plain(store)).toEqual(exp.store1);
    expect(
      plain(readGenerationContinuityCheckpoint({ messageId: "id:msg-1", messageIndex: 1, generation: store.messages["msg-1"]!.generations[0]!, generationIndex: 0 }) ?? null),
    ).toEqual(exp.readCheckpoint);

    const rebuilt = rebuildContinuityFromChatStore(store, chatKey, seq.transcript.slice(0, 3));
    expect(plain(rebuilt)).toEqual(exp.rebuiltFromTranscript);
    const ids = seq.transcript.map((m: { chatId: string }) => "id:" + m.chatId);
    expect(plain(rebuildContinuityAtMessage(store, chatKey, ids, "id:msg-3"))).toEqual(exp.rebuiltAtMsg3);
    expect(plain(rebuildContinuityAtMessage(store, chatKey, ids, "id:msg-1"))).toEqual(exp.rebuiltAtMsg1);

    const s2 = persistV5ContinuityState({ basisState: rebuilt, chatKey, ...seq.turn2 });
    expect(plain(s2)).toEqual(exp.s2);
    expect(plain(getLatestContinuityCheckpointSnapshot(s2, chatKey) ?? null)).toEqual(exp.snapshot2);
    expect(commitContinuityCheckpoint(store, s2, chatKey, "msg-3", "rev-3")).toBe(exp.commit2);
    expect(plain(store)).toEqual(exp.store2);
    expect(plain(rebuildContinuityFromChatStore(store, chatKey, seq.transcript))).toEqual(exp.rebuiltFull);
  });

  test("checkpoint push: stable ids only, promotion", () => {
    const s1 = persistV5ContinuityState({ basisState: createEmptyContinuityState(), chatKey, ...seq.turn1 });
    const s2 = persistV5ContinuityState({ basisState: s1, chatKey, ...seq.turn2 });
    const k = plain(s1) as ContinuityState;
    const pushes: Record<string, boolean> = {};
    for (const [name, id] of [["stable", "id:msg-5"], ["index", "index:5"], ["request", "request:abc"], ["response", "response-1"]] as const)
      pushes[name] = pushContinuityCheckpoint(k, { chatKey, messageId: id, messageIndex: 5, historyRevisionId: "rev-5", historyRevisionOrder: 1, capturedAt: 1700000200000, participants: { actors: [] } });
    pushes.promote = pushContinuityCheckpoint(k, {
      chatKey,
      messageId: "id:msg-6",
      messageIndex: 6,
      historyRevisionId: "rev-6",
      capturedAt: 1700000300000,
      sourceState: s2,
      participants: {},
      promoteToCurrentState: true,
    });
    expect(pushes).toEqual(exp.pushes);
    expect(plain(k)).toEqual(exp.afterPushes);
  });

  test("stable message ids and normalization", () => {
    for (const [value, expected] of Object.entries(exp.stableIds as Record<string, boolean>))
      expect(isStableContinuityMessageId(value === "7" ? 7 : value)).toBe(expected);
    expect(plain(normalizeContinuityState({ version: 9, scenes: 3, characters: { "chat-key": { alice: { groups: { x: "bad" } } } } }))).toEqual(exp.normalized.garbage);
    expect(plain(normalizeContinuityState(exp.s2))).toEqual(exp.normalized.s2);
    expect(plain(normalizeContinuityState(null))).toEqual(exp.normalized.null);
  });
});
