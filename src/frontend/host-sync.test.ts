import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { RESYNC_AFTER_HIDDEN_MS, watchConnection } from "./host-sync.js";
import type { AppController } from "./state/app-state.js";

function rig(connection: AppController["state"]["connection"]) {
  const win = new Window();
  const doc = win.document as unknown as Document;
  let visibility: "visible" | "hidden" = "visible";
  Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => visibility });
  const handlers = new Map<string, (payload: unknown) => void>();
  const events = { on: (name: string, handler: (payload: unknown) => void) => (handlers.set(name, handler), () => handlers.delete(name)) };
  const app = { state: { connection }, reconnects: 0, reconnect: async () => void (app.reconnects += 1) };
  const stop = watchConnection(events, app as unknown as AppController, doc);
  const show = (state: "visible" | "hidden") => {
    visibility = state;
    doc.dispatchEvent(new win.Event("visibilitychange") as unknown as Event);
  };
  return { app, handlers, show, stop, close: () => win.happyDOM.abort() };
}

describe("host connection signals", () => {
  test("CONNECTED reconnects (resync, or a new handshake after a failed one)", () => {
    const r = rig("ready");
    r.handlers.get("CONNECTED")!(undefined);
    expect(r.app.reconnects).toBe(1);
    r.stop();
    expect(r.handlers.has("CONNECTED")).toBe(false);
    r.close();
  });

  test("a tab shown again reconnects after a long hide, or at once while the handshake is failed", () => {
    const ready = rig("ready");
    ready.show("hidden");
    ready.show("visible");
    expect(ready.app.reconnects).toBe(0);
    const realNow = Date.now;
    const hiddenAt = realNow();
    ready.show("hidden");
    Date.now = () => hiddenAt + RESYNC_AFTER_HIDDEN_MS;
    try {
      ready.show("visible");
    } finally {
      Date.now = realNow;
    }
    expect(ready.app.reconnects).toBe(1);
    ready.close();

    const failed = rig("error");
    failed.show("hidden");
    failed.show("visible");
    expect(failed.app.reconnects).toBe(1);
    failed.close();
  });
});
