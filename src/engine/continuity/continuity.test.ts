// Fixtures: bun C:/Users/eme4/asset-maid-port/scratch/engine/continuity/gen.mjs  (runs the ORIGINAL bundle)
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as core from "../core/asset-maid-core";
import { setEngineEnv } from "../core/env";
import { seededEnv } from "../testing/env";
import { toPlain } from "../testing/plain";
import units from "../__fixtures__/continuity/units.json";
import { runContinuitySequence, type ContinuityCoreFns, type ContinuitySequence } from "./testing/sequence";
import {
  createEmptyContinuityState,
  mergeActorContinuityState,
  mergeLocalLoreActorState,
  readLocalLoreActorState,
  stripAccumulationState,
  toLocalLoreActorEntry,
  writeLocalLoreActorState,
  readContinuityFromChat,
  writeContinuityToChat,
} from "./index";

/* eslint-disable @typescript-eslint/no-explicit-any */
const fns: ContinuityCoreFns = {
  createV45RuleRuntime: core.createV45RuleRuntime,
  createEmptyContinuityState: core.createEmptyContinuityState,
  applyVisualContinuityToPlan: core.applyVisualContinuityToPlan,
  updateVisualContinuity: core.updateVisualContinuity,
  computeDeferredVisualContinuity: core.computeDeferredVisualContinuity,
  reconcileContinuityCheckpoints: core.reconcileContinuityCheckpoints,
  buildVisualContinuityContext: core.buildVisualContinuityContext,
  writeContinuityCheckpointsToChatStore: core.writeContinuityCheckpointsToChatStore,
  readContinuityCheckpointsFromChatStore: core.readContinuityCheckpointsFromChatStore,
  rebuildContinuityFromChatStore: core.rebuildContinuityFromChatStore,
  rebuildContinuityAtMessage: core.rebuildContinuityAtMessage,
  readLocalLoreActorState: core.readLocalLoreActorState,
  writeLocalLoreActorState: core.writeLocalLoreActorState,
  mergeLocalLoreActorState: core.mergeLocalLoreActorState,
  toLocalLoreActorEntry: core.toLocalLoreActorEntry,
  getLatestContinuityCheckpointSnapshot: core.getLatestContinuityCheckpointSnapshot,
  createV5ContinuityBasis: core.createV5ContinuityBasis,
  stripAccumulationState: core.stripAccumulationState,
};
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function capture(fn: () => unknown): unknown {
  try {
    return { ok: toPlain(fn()) };
  } catch (e) {
    const err = e as { name?: string; message?: string; code?: string };
    return { error: { name: err?.name, message: err?.message, code: err?.code } };
  }
}

describe("continuity sequences parity", () => {
  const dir = join(import.meta.dir, "../__fixtures__/continuity");
  for (const file of readdirSync(dir).filter((f) => f.startsWith("sequence-")).sort()) {
    const fx = JSON.parse(readFileSync(join(dir, file), "utf8")) as { sequence: ContinuitySequence; expected: any };
    test(fx.sequence.name, async () => {
      setEngineEnv(seededEnv(fx.sequence.seed));
      try {
        const out = await runContinuitySequence(fns, fx.sequence);
        const turns = out as any[];
        // compare turn by turn for readable failures
        expect(turns.length).toBe(fx.expected.ok.length);
        turns.forEach((t, i) => expect(plain(t)).toEqual(fx.expected.ok[i]));
      } finally {
        setEngineEnv(null);
      }
    });
  }
});

describe("continuity units parity", () => {
  test("createEmptyContinuityState ($g)", () => expect(plain(toPlain(createEmptyContinuityState()))).toEqual(units.empty));
  test("mergeActorContinuityState (iKe)", () => {
    for (const c of units.merge as any[]) expect(plain(capture(() => mergeActorContinuityState(clone(c.input))))).toEqual(c.expected);
  });
  test("stripAccumulationState (TA)", () => {
    for (const c of units.strip as any[]) expect(plain(capture(() => stripAccumulationState(clone(c.input))))).toEqual(c.expected);
  });
  test("writeLocalLoreActorState (Tne) + readLocalLoreActorState (Wv)", () => {
    for (const c of units.lore as any[])
      expect(
        plain(
          capture(() => {
            const chat = clone(c.input.chat);
            writeLocalLoreActorState(chat, clone(c.input.payload));
            return { chat, read: readLocalLoreActorState(chat) };
          }),
        ),
      ).toEqual(c.expected);
    for (const c of units.badLore as any[]) expect(plain(capture(() => readLocalLoreActorState(clone(c.input))))).toEqual(c.expected);
  });
  test("mergeLocalLoreActorState (Lne)", () => {
    for (const c of units.mergeLore as any[]) expect(plain(capture(() => mergeLocalLoreActorState(clone(c.input[0]), clone(c.input[1]))))).toEqual(c.expected);
  });
  test("toLocalLoreActorEntry (zne)", () => {
    for (const c of units.toEntry as any[]) expect(plain(capture(() => toLocalLoreActorEntry(clone(c.input))))).toEqual(c.expected);
  });
});

describe("continuity storage adapter (composed getItem/setItem) equals the driver's verbatim sequence", () => {
  const fx = JSON.parse(readFileSync(join(import.meta.dir, "../__fixtures__/continuity/sequence-accumulate-enabled.json"), "utf8")) as { sequence: ContinuitySequence; expected: any };
  const turns = fx.expected.ok.filter((t: any) => "turn" in t) as any[];
  test("writeContinuityToChat + readContinuityFromChat", () => {
    let previousLore: unknown[] = [];
    turns.forEach((t: any, i: number) => {
      const store = clone(t.storage.store);
      for (const m of Object.values(store.messages) as any[]) for (const g of m.generations) delete g.continuity;
      const chat: any = { message: fx.sequence.turns.slice(0, i + 1).map((turn) => ({ role: "char", data: "", chatId: turn.messageId.replace(/^id:/u, "") })), localLore: clone(previousLore) };
      chat.message = chat.message.filter((m: any, idx: number, all: any[]) => all.findIndex((x) => x.chatId === m.chatId) === idx);
      writeContinuityToChat(store, chat, clone(t.state), fx.sequence.chatKey);
      expect(plain(store)).toEqual(t.storage.store);
      expect(plain(chat.localLore)).toEqual(t.storage.localLore);
      expect(plain(toPlain(readContinuityFromChat(store, chat, fx.sequence.chatKey)))).toEqual(t.storage.rebuilt);
      previousLore = t.storage.localLore;
    });
  });
});
