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

  test("mergePatch deep-merges objects and replaces arrays", () => {
    expect(mergePatch({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { c: [3] } })).toEqual({ a: { b: 1, c: [3] }, d: 1 });
  });
});
