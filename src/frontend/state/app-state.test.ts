import { describe, expect, test } from "bun:test";
import { createMockBackend } from "../dev/mock-backend.js";
import { coreMockHandlers } from "../dev/mock/core.js";
import { RpcClient } from "../rpc/client.js";
import { AppController, mergePatch } from "./app-state.js";

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

  test("mergePatch deep-merges objects and replaces arrays", () => {
    expect(mergePatch({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { c: [3] } })).toEqual({ a: { b: 1, c: [3] }, d: 1 });
  });
});
