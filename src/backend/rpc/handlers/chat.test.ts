import { describe, expect, test } from "bun:test";
import { RPC_METHODS } from "../../../shared/contract/index.js";
import { createPipelineModule } from "../../pipeline/index.js";
import { CHAT_ID, createFakeEngine, createPipelineFixture, finished, waitFor } from "../../pipeline/testing/fixtures.js";
import type { RpcContext } from "../types.js";
import { chatHandlers } from "./chat.js";

const OWNED = /^(generation|history|zoom|chatState|chatDom)\./u;

function context() {
  const fx = createPipelineFixture();
  const { pipeline } = createPipelineModule(fx.services, undefined, { engine: createFakeEngine() });
  const ctx = { ...fx.services, modules: { pipeline } } as unknown as RpcContext;
  return { fx, ctx };
}

describe("chat handler group", () => {
  test("covers exactly the pipeline-owned methods", () => {
    expect(Object.keys(chatHandlers).sort()).toEqual(RPC_METHODS.filter((m) => OWNED.test(m)).sort());
  });

  test("generation.start -> chatDom.getMessageStates -> history.get -> zoom.getDetails", async () => {
    const { fx, ctx } = context();
    const started = await chatHandlers["generation.start"]!({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 }, ctx);
    await waitFor(() => finished(fx, started.jobId).length > 0);
    const states = await chatHandlers["chatDom.getMessageStates"]!({ chatId: CHAT_ID }, ctx);
    expect(states.messages.map((m) => m.messageKey)).toEqual(["illustration:m1@0"]);
    const slot = states.messages[0]!.slots[0]!;
    const history = await chatHandlers["history.get"]!({ chatId: CHAT_ID, messageKeys: ["illustration:m1@0"] }, ctx);
    expect(Object.keys(history.plans)).toEqual(["illustration:m1@0"]);
    expect(history.tree.slotsById[slot.slotId]).toBeDefined();
    const details = await chatHandlers["zoom.getDetails"]!({ chatId: CHAT_ID, slotId: slot.slotId }, ctx);
    expect(details.entryId).toBe(slot.selectedEntryId);
    expect((await chatHandlers["generation.listActive"]!({ chatId: CHAT_ID }, ctx)).jobs).toEqual([]);
  });

  test("bad params are rejected with bad-request", async () => {
    const { ctx } = context();
    expect(() => chatHandlers["history.deleteSlot"]!({ previewToken: "" }, ctx)).toThrow();
    await expect(Promise.resolve().then(() => chatHandlers["zoom.clearDraft"]!({ chatId: CHAT_ID, slotId: "s", part: "x" as never }, ctx))).rejects.toMatchObject({ error: { code: "bad-request" } });
  });

  test("missing pipeline module -> unsupported", () => {
    const fx = createPipelineFixture();
    const ctx = { ...fx.services, modules: {} } as unknown as RpcContext;
    expect(() => chatHandlers["generation.listActive"]!({}, ctx)).toThrow("The chat pipeline is not available.");
  });
});
