import { describe, expect, test } from "bun:test";
import { createFullMockBackend } from "../../dev/mock/index.js";
import { RpcClient } from "../../rpc/client.js";
import { AppController } from "../../state/app-state.js";
import { parsePreset } from "./model.js";
import { AtelierStore } from "./store.js";

async function until<T>(read: () => T | null | undefined | false, timeoutMs = 3000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error("until: timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function openStore() {
  const mock = createFullMockBackend({ timeScale: 0 });
  const app = new AppController(new RpcClient(mock.transport));
  await app.init();
  const store = new AtelierStore(app);
  await store.open();
  store.selectDocument("mock-1");
  return { mock, app, store };
}

describe("Maid Atelier store", () => {
  test("edits made while a save is in flight survive it; toggles made meanwhile are saved next", async () => {
    const { mock, app, store } = await openStore();
    const original = mock.handlers["atelier.documents.save"]!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mock.handlers["atelier.documents.save"] = async (params, ctx) => {
      await gate;
      return original(params, ctx);
    };
    const saves = () => mock.calls.filter((c) => c.method === "atelier.documents.save").map((c) => parsePreset((c.params as { json: string }).json).doc?.title);
    store.edit((doc) => ({ ...doc, title: "A" }), "auto");
    await until(() => saves().length === 1);
    store.edit((doc) => ({ ...doc, title: "B" }), "auto");
    release();
    await until(() => saves().length === 2);
    expect(saves()).toEqual(["A", "B"]);
    expect(store.snapshot.draft?.doc?.title).toBe("B");
    await until(() => !store.snapshot.saving && !store.snapshot.draft?.dirty);
    expect(parsePreset(app.state.atelier!.catalog.documents.find((d) => d.id === "mock-1")!.json).doc?.title).toBe("B");
    app.destroy();
  });

  test("busy stays on while any of several overlapping calls runs", async () => {
    const { mock, app, store } = await openStore();
    let release!: () => void;
    let n = 0;
    mock.handlers["atelier.instructions.setOption"] = async () => {
      if (n++ === 0) await new Promise<void>((resolve) => (release = resolve));
      return { state: app.state.atelier! } as never;
    };
    const first = store.setOption("default", "a", true);
    await store.setOption("default", "b", true);
    expect(store.snapshot.busy).toBe(true);
    release();
    await first;
    expect(store.snapshot.busy).toBe(false);
    app.destroy();
  });
});
