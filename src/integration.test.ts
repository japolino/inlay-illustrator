/**
 * Boundary test: the real frontend state layer (RpcClient + AppController) against the real backend runtime
 * (router + handlers + pipeline module over fake services / fake host, scripted engine). Catches contract drift that
 * the dev mock hides (shapes, events, busy flags).
 */
import { describe, expect, test } from "bun:test";
import { createEvent } from "./shared/contract/index.js";
import { createBackendRuntime } from "./backend/runtime.js";
import { createPipelineModule } from "./backend/pipeline/index.js";
import { createAnalysisModule } from "./backend/analysis/index.js";
import { CHARACTER_ID, CHAT_ID, createFakeEngine, createPipelineFixture, waitFor } from "./backend/pipeline/testing/fixtures.js";
import { RpcClient, type RpcTransport } from "./frontend/rpc/client.js";
import { AppController } from "./frontend/state/app-state.js";

const USER = "user-1";

function connect() {
  const fx = createPipelineFixture();
  const engine = createFakeEngine();
  const runtime = createBackendRuntime({
    host: fx.fakeHost!.host,
    createServices: () => fx.services,
    modules: [(services, get) => createPipelineModule(services, get, { engine }), (services, get) => createAnalysisModule(services, get)],
  });
  const listeners = new Set<(message: unknown) => void>();
  const deliver = (message: unknown) => queueMicrotask(() => { for (const l of [...listeners]) l(JSON.parse(JSON.stringify(message))); });
  // Backend -> frontend: RPC responses (host.sendToFrontend) and events (services.events).
  fx.fakeHost!.onSend = (payload) => deliver(payload);
  let seq = 0;
  const emit = fx.services.events.emit.bind(fx.services.events);
  fx.services.events.emit = ((event: never, payload: never) => {
    emit(event, payload);
    deliver(createEvent(event, payload, ++seq));
  }) as typeof fx.services.events.emit;
  const transport: RpcTransport = {
    send: (message) => void runtime.handleFrontendMessage(JSON.parse(JSON.stringify(message)), USER),
    subscribe: (handler) => {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
  };
  const client = new RpcClient(transport, { clientId: "boundary" });
  const app = new AppController(client);
  return { fx, engine, runtime, app };
}

describe("frontend state layer <-> real backend router", () => {
  test("init handshake, config round trip and character list", async () => {
    const { app, fx } = connect();
    await app.init();
    expect(app.state.connection).toBe("ready");
    expect(app.state.characters?.map((c) => c.characterId)).toContain(CHARACTER_ID);
    const updated = await app.updateConfig({ runtime: { generationAutoRetryCount: 2 } });
    expect(updated?.runtime.generationAutoRetryCount).toBe(2);
    expect(fx.config.value.runtime.generationAutoRetryCount).toBe(2);
    await waitFor(() => app.state.config?.runtime.generationAutoRetryCount === 2);
  });

  test("footer generate: job events reach the client; the finished job is not busy in the message state", async () => {
    const { app, fx } = connect();
    await app.init();
    const before = await app.call("chatDom.getMessageStates", { chatId: CHAT_ID });
    const target = before.messages.find((m) => m.messageId === "m1")!;
    expect(target).toMatchObject({ eligible: true, busy: false, attempt: "initial" });
    const { jobId, messageKey } = await app.call("generation.start", { chatId: CHAT_ID, messageId: "m1", swipeIndex: 0, attemptKind: target.attempt });
    expect(messageKey).toBe("illustration:m1@0");
    await waitFor(() => (app.state.chatDataRevision[CHAT_ID] ?? 0) > 0 && !app.state.generationJobs[jobId]);
    const after = (await app.call("chatDom.getMessageStates", { chatId: CHAT_ID, messageIds: ["m1"] })).messages[0]!;
    expect(after.busy).toBe(false);
    expect(after.slots.length).toBeGreaterThan(0);
    expect(after.slots[0]!.entries[0]!.url).toMatch(/^\/api\/v1\/image-gen\/results\//u);
    // Zoom opens on the baked slot with the real section ids.
    const details = await app.call("zoom.getDetails", { chatId: CHAT_ID, slotId: after.slots[0]!.slotId });
    expect(details.sections.map((s) => s.id)[0]).toBe("main");
    // A single-slot regeneration does not make the footer busy and carries the slotId.
    const regen = await app.call("generation.regenerateSlot", { chatId: CHAT_ID, messageKey, slotId: after.slots[0]!.slotId });
    const during = (await app.call("chatDom.getMessageStates", { chatId: CHAT_ID, messageIds: ["m1"] })).messages[0]!;
    expect(during.busy).toBe(false);
    await waitFor(() => !app.state.generationJobs[regen.jobId]);
    const progress = fx.events.find((e) => e.event === "generation.progress" && (e.payload as { jobId: string }).jobId === regen.jobId);
    expect((progress?.payload as { slotId?: string } | undefined)?.slotId).toBe(after.slots[0]!.slotId);
  });

  test("errors keep the contract shape (code + message)", async () => {
    const { app } = connect();
    await app.init();
    const failure = await app.call("zoom.getDetails", { chatId: CHAT_ID, slotId: "illustration:nope@0:slot:0" }).catch((e: unknown) => e as { error: { code: string } });
    expect((failure as { error: { code: string } }).error.code).toBe("not-found");
  });
});
