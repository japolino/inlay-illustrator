import { describe, expect, test } from "bun:test";
import { isRpcEvent } from "../../shared/contract/index.js";
import { createFakeHost, TINY_PNG_BASE64 } from "../testing/fake-host.js";
import { createServices, createServicesRegistry } from "./index.js";

describe("createServices", () => {
  test("wires storage events and the run log to the frontend with monotonic seq", async () => {
    const fake = createFakeHost();
    const services = createServices(fake.host, fake.userId);
    await services.storage.updateConfig((c) => ({ ...c, enabled: !c.enabled }));
    services.log.append("warn", "test", "hello");
    const events = fake.sent.map((s) => s.payload).filter(isRpcEvent);
    expect(events.map((e) => [e.event, e.seq])).toEqual([["config.changed", 1], ["log.appended", 2]]);
    expect(fake.sent.every((s) => s.userId === fake.userId)).toBe(true);
    expect(fake.logs).toEqual([{ level: "warn", message: "[Inlay:test] hello" }]);
  });

  test("registry: one service set per user; frontend bridge answers are routed", async () => {
    const fake = createFakeHost();
    const registry = createServicesRegistry(fake.host);
    expect(registry.get("u1")).toBe(registry.get("u1"));
    expect(registry.get("u1")).not.toBe(registry.get("u2"));
    const services = registry.get("u1");
    fake.onSend = (payload) => {
      const p = payload as { type: string; requestId: string };
      if (p.type === "inlay-illustrator:fetch-request") queueMicrotask(() => registry.acceptFrontendMessage({ type: "inlay-illustrator:fetch-response", requestId: p.requestId, data: TINY_PNG_BASE64, mimeType: "image/png" }, "u1"));
    };
    expect((await services.imageBytes.getImage({ url: "/api/v1/images/x" })).data).toBe(TINY_PNG_BASE64);
    expect(registry.acceptFrontendMessage({ type: "unrelated" }, "u1")).toBe(false);
    expect(registry.all()).toHaveLength(2);
  });
});
