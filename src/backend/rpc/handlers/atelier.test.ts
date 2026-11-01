import { describe, expect, test } from "bun:test";
import { isRpcEvent, PRESET_FORMAT, RPC_EVENTS, RPC_METHODS, STORAGE_PATHS, type RpcMethod, type RpcParams, type RpcResult } from "../../../shared/contract/index.js";
import { createServices } from "../../services/index.js";
import { createFakeHost } from "../../testing/fake-host.js";
import type { RpcContext } from "../types.js";
import { atelierHandlers } from "./atelier.js";
import { coreHandlers } from "./core.js";

function setup(files: Record<string, unknown> = {}) {
  const fake = createFakeHost();
  for (const [path, value] of Object.entries(files)) fake.files.set(path, JSON.stringify(value));
  const services = createServices(fake.host, fake.userId);
  const ctx: RpcContext = { ...services, modules: {} as RpcContext["modules"] };
  const call = async <M extends RpcMethod>(method: M, params: RpcParams<M>): Promise<RpcResult<M>> => {
    const handler = (atelierHandlers[method] ?? coreHandlers[method]) as ((p: RpcParams<M>, c: RpcContext) => Promise<RpcResult<M>> | RpcResult<M>) | undefined;
    if (!handler) throw new Error(`no handler ${method}`);
    return handler(params, ctx);
  };
  const events = () => fake.sent.map((s) => s.payload).filter(isRpcEvent);
  return { fake, services, call, events };
}

describe("atelier RPC handlers", () => {
  test("every atelier.* method of the contract has a handler and atelier.changed is a contract event", () => {
    const methods = RPC_METHODS.filter((m) => m.startsWith("atelier."));
    expect(methods.length).toBe(25);
    for (const m of methods) expect(typeof atelierHandlers[m]).toBe("function");
    expect(RPC_EVENTS).toContain("atelier.changed");
  });

  test("document flow over RPC emits atelier.changed to the frontend", async () => {
    const { call, events } = setup();
    const { state } = await call("atelier.get", {});
    const json = JSON.stringify({ format: PRESET_FORMAT, title: "Mine", content: {} });
    const created = await call("atelier.documents.import", { baseRevision: state.revision, fileName: "mine.json", json });
    expect(created.state.catalog.activeId).toBe(created.id);
    const changed = events().filter((e) => e.event === "atelier.changed");
    expect(changed.length).toBe(1);
    expect(changed[0]!.payload).toMatchObject({ reason: "documents", revision: created.state.revision, storeRevision: 1 });
    await expect(call("atelier.documents.rename", { baseRevision: state.revision, id: created.id, name: "x" })).rejects.toMatchObject({ error: { code: "conflict", detailCode: "atelier-conflict" } });
  });

  test("parameter checks", async () => {
    const { call } = setup();
    await expect(call("atelier.documents.save", { baseRevision: -1, id: "default", json: "{}" })).rejects.toMatchObject({ error: { code: "bad-request" } });
    await expect(call("atelier.instructions.select", { kind: "nope" as never, id: "default" })).rejects.toMatchObject({ error: { code: "bad-request" } });
    await expect(call("atelier.repair", { part: "library", confirm: false as unknown as true })).rejects.toMatchObject({ error: { code: "bad-request" } });
    expect((await call("atelier.getBaseline", {})).builtInJson).toContain(PRESET_FORMAT);
  });

  test("config.update cannot patch the Atelier fields", async () => {
    const { call } = setup();
    for (const patch of [
      { presetCatalog: { atelier: {} } },
      { runtime: { instructionChanges: {} } },
      { runtime: { freeGenerationLibrary: {} } },
      { runtime: { analysisExecution: { mode: "comic" } } },
    ]) {
      await expect(call("config.update", { patch: patch as never })).rejects.toMatchObject({ error: { code: "bad-request", detailCode: "atelier-field" } });
    }
    // The chat toolbar resolution / AI coordinates stay ordinary settings.
    const { config } = await call("config.update", { patch: { runtime: { analysisExecution: { aiCoordinates: false } } } as never });
    expect(config.runtime.analysisExecution?.aiCoordinates).toBe(false);
  });

  test("repair keeps the old file and resets the part", async () => {
    const { call, fake } = setup();
    const { id } = await call("atelier.instructions.create", { kind: "scene" });
    const { state } = await call("atelier.repair", { part: "library", confirm: true });
    expect(state.library.scene.items[id]).toBeUndefined();
    const backups = [...fake.files.keys()].filter((k) => k.startsWith("config/legacy/atelier-"));
    expect(backups.length).toBe(1);
  });
});

describe("presetCatalog.rawJson (dead since AM 0.9.90)", () => {
  test("a stored raw catalog is backed up once and dropped from the settings on the next write", async () => {
    const rawJson = JSON.stringify({ version: 3, modifiers: [{ id: "custom" }] });
    const { call, fake } = setup({ [STORAGE_PATHS.configSettings]: { version: 1, presetCatalog: { rawJson }, ui: { language: "en" } } });
    const { config } = await call("config.get", {});
    expect("presetCatalog" in config).toBe(false);
    const backup = JSON.parse(fake.files.get(STORAGE_PATHS.legacyRawCatalog) as string);
    expect(backup.rawJson).toBe(rawJson);
    await call("config.update", { patch: { analysis: { temperature: 0.5 } } });
    expect(JSON.parse(fake.files.get(STORAGE_PATHS.configSettings) as string).presetCatalog).toBeUndefined();
    // A second load does not overwrite the backup.
    fake.files.set(STORAGE_PATHS.legacyRawCatalog, JSON.stringify({ movedAt: "kept", rawJson }));
    await call("config.get", {});
    expect(JSON.parse(fake.files.get(STORAGE_PATHS.legacyRawCatalog) as string).movedAt).toBe("kept");
  });
});
