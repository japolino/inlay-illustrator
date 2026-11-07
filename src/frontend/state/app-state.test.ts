import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { h, render } from "preact";
import { createEvent } from "../../shared/contract/rpc.js";
import { createMockBackend } from "../dev/mock-backend.js";
import { coreMockHandlers } from "../dev/mock/core.js";
import { RpcClient, type ClientResult } from "../rpc/client.js";
import { AppContext, AppController, mergePatch, useRpcMutation, useRpcQuery, type MutationState, type QueryState } from "./app-state.js";

function setup() {
  const mock = createMockBackend({ latencyMs: 0, timeScale: 0, handlers: [coreMockHandlers()] });
  const app = new AppController(new RpcClient(mock.transport));
  return { mock, app };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("AppController", () => {
  test("init: handshake, config, characters, active character workspace", async () => {
    const { app } = setup();
    await app.init();
    const s = app.state;
    expect(s.connection).toBe("ready");
    expect(s.config?.analysis.connectionId).toBe("llm-1");
    expect(s.characters?.length).toBe(2);
    expect(s.selectedCharacterId).toBe("char-seoyeon");
    expect(s.workspace?.roster.some((r) => r.kind === "custom")).toBe(true);
  });

  test("the workspace follows the active chat character; a manual pick stays until the next chat change", async () => {
    const { app } = setup();
    await app.init();
    const status = app.state.status!;
    app.setStatus({ ...status, activeChatId: "chat-2", activeCharacterId: "char-aria" });
    await tick();
    expect(app.state.selectedCharacterId).toBe("char-aria");
    expect(app.state.workspace?.characterId).toBe("char-aria");
    await app.selectCharacter("char-seoyeon");
    app.setStatus({ ...status, activeChatId: "chat-2", activeCharacterId: "char-aria" });
    await tick();
    expect(app.state.selectedCharacterId).toBe("char-seoyeon");
  });

  test("resync after a disconnect: jobs that ended meanwhile lose their spinner; settings and running jobs are re-read", async () => {
    const { app, mock } = setup();
    await app.init();
    const handlers = mock.handlers as Record<string, unknown>;
    // Two jobs were running when the page lost its connection.
    mock.emit("analysis.progress", { jobId: "a1", kind: "persona", characterId: "char-seoyeon", status: "running", progress: { label: "Reading", fraction: 0.5 } });
    mock.emit("generation.progress", { jobId: "g1", status: "running", chatId: "chat-1", messageKey: "illustration:m1@0", progress: { label: "Generating", fraction: 0.5 } } as never);
    await tick();
    expect(Object.keys(app.state.generationJobs)).toEqual(["g1"]);
    // While disconnected: both jobs ended, a new one started and a setting changed. None of those events arrived.
    const g2 = { jobId: "g2", status: "running", chatId: "chat-1", messageKey: "illustration:m2@0", progress: { label: "Generating", fraction: 0.1 } };
    handlers["analysis.listActive"] = () => ({ jobs: [] });
    handlers["generation.listActive"] = () => ({ jobs: [g2] });
    mock.db.config.runtime.generationAutoRetryCount = 7;
    await app.resync();
    expect(app.state.analysisJobs.a1).toBeUndefined();
    expect(Object.keys(app.state.generationJobs)).toEqual(["g2"]);
    expect(app.state.config?.runtime.generationAutoRetryCount).toBe(7);
    expect(app.state.resyncCount).toBe(1);
  });

  test("resync before the first handshake does nothing", async () => {
    const { app, mock } = setup();
    await app.resync();
    expect(mock.calls.length).toBe(0);
    expect(app.state.resyncCount).toBe(0);
  });

  test("optimistic config update and rollback", async () => {
    const { app, mock } = setup();
    await app.init();
    const promise = app.updateConfig({ runtime: { generationAutoRetryCount: 3 } });
    expect(app.state.config?.runtime.generationAutoRetryCount).toBe(3);
    await promise;
    expect(mock.db.config.runtime.generationAutoRetryCount).toBe(3);
    const notices: string[] = [];
    app.onNotice((n) => notices.push(n.message));
    delete (mock.handlers as Record<string, unknown>)["config.update"];
    await app.updateConfig({ runtime: { generationAutoRetryCount: 9 } });
    expect(app.state.config?.runtime.generationAutoRetryCount).toBe(3);
    expect(notices[0]).toContain("config.update");
  });

  test("workspace mutation applies the returned snapshot; events update jobs", async () => {
    const { app, mock } = setup();
    await app.init();
    const item = app.state.workspace!.roster.find((r) => r.title.startsWith("강지훈"))!;
    expect(item.workspaceEnabled).toBe(false);
    await app.mutateWorkspace("roster.setActive", { characterId: "char-seoyeon", items: [{ memberKey: item.memberKey, selectionId: item.selectionId }], active: true });
    expect(app.state.workspace!.roster.find((r) => r.promptKey === item.promptKey)!.workspaceEnabled).toBe(true);
    mock.emit("analysis.progress", { jobId: "j1", kind: "persona", characterId: "char-seoyeon", status: "running", progress: { label: "Reading", fraction: 0.5 } });
    await tick();
    expect(app.state.analysisJobs.j1?.progress.fraction).toBe(0.5);
    mock.emit("analysis.finished", { jobId: "j1", kind: "persona", characterId: "char-seoyeon", status: "success", message: "Done" });
    await tick();
    expect(app.state.analysisJobs.j1?.finishedAt).toBeGreaterThan(0);
    expect(app.activeAnalysis()).toHaveLength(0);
  });

  test("analysis.finished reloads the workspace; a document.changed during a load triggers one more load", async () => {
    const { app, mock } = setup();
    await app.init();
    const loads = () => mock.calls.filter((c) => c.method === "workspace.load").length;
    const before = loads();
    const revision = app.state.documentRevision["char-seoyeon"] ?? 0;
    mock.emit("analysis.finished", { jobId: "j2", kind: "metadata-check", characterId: "char-seoyeon", status: "success", message: "Done" });
    await tick();
    expect(loads()).toBe(before + 1);
    expect(app.state.documentRevision["char-seoyeon"]).toBe(revision + 1);
    const pending = app.reloadWorkspace();
    expect(app.state.workspaceState).toBe("loading");
    mock.emit("document.changed", { characterId: "char-seoyeon", updatedAt: "x", reason: "test" });
    await pending;
    await tick();
    expect(loads()).toBe(before + 3);
    expect(app.state.workspaceState).toBe("ready");
  });

  test("init recovers jobs that were running before the page loaded", async () => {
    const { app, mock } = setup();
    const job = { jobId: "g1", chatId: "c1", messageKey: "illustration:m1@0", attemptKind: "initial", status: "running", phase: "generating", progress: { label: "x" }, requestedCount: 1, completedSlots: 0, failedSlots: 0, canRetry: false, canRestart: false } as const;
    mock.handlers["generation.listActive"] = () => ({ jobs: [job] });
    mock.handlers["analysis.listActive"] = () => ({ jobs: [{ jobId: "a1", kind: "persona", characterId: "char-seoyeon", status: "running", progress: { label: "Reading" } }] });
    await app.init();
    await tick();
    expect(app.state.generationJobs.g1?.status).toBe("running");
    expect(app.activeAnalysis({ characterId: "char-seoyeon" }).map((j) => j.jobId)).toEqual(["a1"]);
  });

  test("a failed analysis job outlives the finished-job TTL until its error is dismissed", async () => {
    const { app, mock } = setup();
    await app.init();
    const realSetTimeout = globalThis.setTimeout;
    // The 30 s finished-job TTL runs at once.
    globalThis.setTimeout = ((handler: () => void, delay?: number) => realSetTimeout(handler, delay === 30_000 ? 0 : delay)) as typeof setTimeout;
    try {
      mock.emit("analysis.finished", { jobId: "ok", kind: "persona", characterId: "char-seoyeon", status: "success", message: "Done" });
      mock.emit("analysis.finished", { jobId: "bad", kind: "persona", characterId: "char-seoyeon", status: "error", message: "Failed", error: { code: "internal", message: "boom" } });
      await tick();
      await tick();
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    expect(app.state.analysisJobs.ok).toBeUndefined();
    expect(app.state.analysisJobs.bad?.error?.message).toBe("boom");
    app.dismissAnalysisJob("bad");
    expect(app.state.analysisJobs.bad).toBeUndefined();
  });

  test("a job that finishes while resync reads the job lists is not brought back as running", async () => {
    const { app, mock } = setup();
    await app.init();
    const job = { jobId: "g1", chatId: "c1", messageKey: "illustration:m1@0", attemptKind: "initial", status: "running", phase: "generating", progress: { label: "x" }, requestedCount: 1, completedSlots: 0, failedSlots: 0, canRetry: false, canRestart: false } as const;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mock.handlers["analysis.listActive"] = () => ({ jobs: [{ jobId: "a1", kind: "persona", characterId: "char-seoyeon", status: "running", progress: { label: "Reading" } }] });
    mock.handlers["generation.listActive"] = async () => {
      await gate;
      return { jobs: [job] };
    };
    const resync = app.resync();
    await tick();
    // Both jobs end after the backend read its lists, before the answers arrive.
    mock.emit("generation.finished", { jobId: "g1", chatId: "c1", messageKey: job.messageKey, result: "failed" });
    mock.emit("analysis.finished", { jobId: "a1", kind: "persona", characterId: "char-seoyeon", status: "error", message: "Failed", error: { code: "internal", message: "boom" } });
    await tick();
    release();
    await resync;
    expect(app.state.generationJobs.g1).toBeUndefined();
    expect(app.state.analysisJobs.a1?.status).toBe("error");
    // A progress delivered after the finish does not bring it back either.
    mock.emit("generation.progress", job);
    await tick();
    expect(app.state.generationJobs.g1).toBeUndefined();
  });

  test("a failed config patch drops only itself; an echo does not revert a patch still in flight", async () => {
    const { app, mock } = setup();
    await app.init();
    const original = mock.handlers["config.update"]!;
    const gates: Array<() => void> = [];
    mock.handlers["config.update"] = async (params, ctx) => {
      await new Promise<void>((resolve) => gates.push(resolve));
      if (params.patch.runtime?.generationAutoRetryCount === 9) ctx.fail("internal", "nope");
      return original(params, ctx);
    };
    const failing = app.updateConfig({ runtime: { generationAutoRetryCount: 9 } });
    const succeeding = app.updateConfig({ ui: { developerModeEnabled: true } });
    while (gates.length < 2) await tick();
    mock.emit("config.changed", { config: structuredClone(mock.db.config) });
    await tick();
    expect(app.state.config?.ui.developerModeEnabled).toBe(true);
    expect(app.state.config?.runtime.generationAutoRetryCount).toBe(9);
    gates[1]!();
    await succeeding;
    gates[0]!();
    await failing;
    expect(app.state.config?.ui.developerModeEnabled).toBe(true);
    expect(app.state.config?.runtime.generationAutoRetryCount).not.toBe(9);
  });

  test("a failed chat image settings save does not undo a later successful one", async () => {
    const { app, mock } = setup();
    await app.init();
    const base = app.state.chatImageGeneration!;
    const original = mock.handlers["chatImageGeneration.set"]!;
    const gates: Array<() => void> = [];
    let n = 0;
    mock.handlers["chatImageGeneration.set"] = async (params, ctx) => {
      const failing = n++ === 0;
      await new Promise<void>((resolve) => gates.push(resolve));
      if (failing) ctx.fail("internal", "nope");
      return original(params, ctx);
    };
    const first = { ...base, autoGenerationEnabled: !base.autoGenerationEnabled };
    const second = { ...first, splitAnalysis: { ...first.splitAnalysis, batchSize: first.splitAnalysis.batchSize + 1 } };
    const failing = app.setChatImageGeneration(first);
    const succeeding = app.setChatImageGeneration(second);
    while (gates.length < 2) await tick();
    gates[1]!();
    await succeeding;
    gates[0]!();
    await failing;
    expect(app.state.chatImageGeneration).toEqual(second);
  });

  test("status reads on chat switches: an older answer never replaces a newer read or a status.changed", async () => {
    const { app, mock } = setup();
    await app.init();
    const base = app.state.status!;
    const releases: Array<() => void> = [];
    let answers = [{ ...base, activeChatId: "chat-A" }, { ...base, activeChatId: "chat-B" }];
    mock.handlers["session.getStatus"] = async () => {
      const status = answers.shift()!;
      await new Promise<void>((resolve) => releases.push(resolve));
      return status;
    };
    const first = app.refreshStatus();
    const second = app.refreshStatus();
    while (releases.length < 2) await tick();
    releases[1]!();
    await second;
    releases[0]!();
    await first;
    expect(app.state.status?.activeChatId).toBe("chat-B");
    answers = [{ ...base, activeChatId: "chat-stale" }];
    const third = app.refreshStatus();
    while (releases.length < 3) await tick();
    mock.emit("status.changed", { ...base, activeChatId: "chat-C" });
    await tick();
    releases[2]!();
    await third;
    expect(app.state.status?.activeChatId).toBe("chat-C");
  });

  test("reconnect retries a failed handshake (resync alone did nothing in the error state)", async () => {
    const { app, mock } = setup();
    const hello = mock.handlers["session.hello"]!;
    mock.handlers["session.hello"] = (_params, ctx) => ctx.fail("timeout", "No answer from the backend.");
    await app.init();
    expect(app.state.connection).toBe("error");
    mock.handlers["session.hello"] = hello;
    await app.reconnect();
    expect(app.state.connection).toBe("ready");
    expect(app.state.config).not.toBeNull();
  });

  test("an event sequence break (backend restart) re-reads the state", async () => {
    const { app, mock } = setup();
    await app.init();
    const reads = () => mock.calls.filter((c) => c.method === "session.getStatus").length;
    const before = reads();
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((handler: () => void, delay?: number) => realSetTimeout(handler, delay === 1_000 ? 0 : delay)) as typeof setTimeout;
    try {
      app.client.receive(createEvent("notice", { tone: "info", message: "a" }, 40));
      app.client.receive(createEvent("notice", { tone: "info", message: "b" }, 1));
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    await tick();
    await tick();
    expect(reads()).toBe(before + 1);
  });

  test("mergePatch deep-merges objects and replaces arrays", () => {
    expect(mergePatch({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { c: [3] } })).toEqual({ a: { b: 1, c: [3] }, d: 1 });
  });
});

describe("useRpcMutation", () => {
  test("stays pending while any of several overlapping runs is in flight", async () => {
    const { app, mock } = setup();
    const win = new Window();
    const root = win.document.createElement("div") as unknown as Element;
    let release!: () => void;
    let n = 0;
    mock.handlers["uiState.set"] = async () => {
      if (n++ === 0) await new Promise<void>((resolve) => (release = resolve));
      return { ok: true };
    };
    let mutation!: MutationState<"uiState.set">;
    function Probe() {
      mutation = useRpcMutation("uiState.set");
      return null;
    }
    render(h(AppContext.Provider, { value: app }, h(Probe, {})), root);
    try {
      const params = { uiState: {} } as never;
      const first = mutation.run(params);
      await mutation.run(params);
      await tick();
      expect(mutation.pending).toBe(true);
      release();
      await first;
      await tick();
      expect(mutation.pending).toBe(false);
    } finally {
      render(null, root);
      win.happyDOM.abort();
    }
  });
});

describe("useRpcQuery", () => {
  test("never returns the data of other params: on a switch, a failure, null params or a late answer", async () => {
    const { app, mock } = setup();
    const win = new Window();
    const root = win.document.createElement("div") as unknown as Element;
    let releaseLate: () => void = () => undefined;
    mock.handlers["connections.listImageModels"] = async ({ connectionId }, ctx) => {
      if (connectionId === "offline") ctx.fail("provider-error", "offline");
      if (connectionId === "late") await new Promise<void>((resolve) => (releaseLate = resolve));
      return { models: [{ id: `${connectionId}-model`, label: connectionId }] };
    };
    let query!: QueryState<ClientResult<"connections.listImageModels">>;
    function Probe({ connectionId }: { connectionId: string | null }) {
      query = useRpcQuery("connections.listImageModels", connectionId ? { connectionId } : null);
      return null;
    }
    const show = (connectionId: string | null) => render(h(AppContext.Provider, { value: app }, h(Probe, { connectionId })), root);
    try {
      show("a");
      while (!query.data) await tick();
      show("offline");
      expect(query.data).toBeUndefined();
      expect(query.loading).toBe(true);
      while (!query.error) await tick();
      expect(query.data).toBeUndefined();
      // Params turn null while "late" is in flight: its answer must not land.
      show("late");
      while (!mock.calls.some((call) => (call.params as { connectionId?: string }).connectionId === "late")) await tick();
      show(null);
      while (query.loading) await tick();
      releaseLate();
      await tick();
      expect(query.data).toBeUndefined();
    } finally {
      render(null, root);
      win.happyDOM.abort();
    }
  });
});
