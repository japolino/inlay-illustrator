import { describe, expect, test } from "bun:test";
import { createFakeHost } from "../testing/fake-host.js";
import { createDecisionService } from "./decisions.js";
import { createRunLog } from "./run-log.js";
import { createEventBus } from "./events.js";

describe("DecisionService", () => {
  test("listConnections maps profiles from host.decisions with userId", async () => {
    const fake = createFakeHost({ userId: "test-user-123" });
    fake.decisionConnections = [
      {
        id: "dec-1",
        name: "TypeSafe Main",
        provider: "typesafe",
        model: "typesafe/jev-latest",
        api_url: "https://api.typesafe.ai/v1",
        is_default: true,
        has_api_key: true,
        default_parameters: {},
        metadata: {},
        created_at: 1000,
        updated_at: 1000,
      },
    ];
    let capturedOptions: any = null;
    (fake.host.decisions as any).listConnections = async (opts: any) => {
      capturedOptions = opts;
      return fake.decisionConnections;
    };
    const log = createRunLog({ events: createEventBus(fake.host, fake.userId), host: fake.host });
    const svc = createDecisionService(fake.host, log, fake.userId);

    const list = await svc.listConnections();
    expect(list).toEqual([
      {
        id: "dec-1",
        name: "TypeSafe Main",
        provider: "typesafe",
        model: "typesafe/jev-latest",
        isDefault: true,
        hasApiKey: true,
      },
    ]);
    expect(capturedOptions).toEqual({ userId: "test-user-123" });
  });

  test("testConnection evaluates a ping question passing userId", async () => {
    const fake = createFakeHost({ userId: "test-user-456" });
    let capturedInput: any = null;
    (fake.host.decisions as any).evaluate = async (input: any) => {
      capturedInput = input;
      return { model: input.model, answers: { test: { type: "noul", noul: 1 } } };
    };
    const log = createRunLog({ events: createEventBus(fake.host, fake.userId), host: fake.host });
    const svc = createDecisionService(fake.host, log, fake.userId);

    const result = await svc.testConnection({ connectionId: "dec-1", model: "typesafe/jev-latest" });
    expect(result.ok).toBe(true);
    expect(result.model).toBe("typesafe/jev-latest");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(capturedInput.userId).toBe("test-user-456");
  });

  test("createJevAdapter answers the TypeSafe systemone request through host.decisions with userId", async () => {
    const fake = createFakeHost({ userId: "test-user-789" });
    let capturedInput: any = null;
    (fake.host.decisions as any).evaluate = async (input: any) => {
      capturedInput = input;
      return { model: input.model, answers: { q1: { type: "noul", noul: 1 } }, usage: { input_tokens: 3, output_tokens: 1 } };
    };
    const log = createRunLog({ events: createEventBus(fake.host, fake.userId), host: fake.host });
    const svc = createDecisionService(fake.host, log, fake.userId);

    const adapter = svc.createJevAdapter(() => ({ connectionId: "dec-1", model: "typesafe/jev-latest", rosterSelectionDefault: true }));
    expect(adapter.getConfig().apiKey).toBe("lumiverse");
    const res = await adapter.network.fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {},
      body: JSON.stringify({ model: "typesafe/jev-latest", state: "story text", questions: { q1: { type: "noul", instructions: "Present?" } } }),
    });
    expect(await res.json()).toEqual({ model: "typesafe/jev-latest", answers: { q1: { type: "noul", noul: 1 } }, usage: { input_tokens: 3, output_tokens: 1 } });
    expect(capturedInput).toMatchObject({ connection_id: "dec-1", model: "typesafe/jev-latest", userId: "test-user-789" });
  });

  test("createJevAdapter answers host decision errors with a TypeSafe-style status and logs the host message", async () => {
    const fake = createFakeHost({ userId: "test-user-789" });
    let hostError: unknown;
    (fake.host.decisions as any).evaluate = async () => {
      throw hostError;
    };
    const log = createRunLog({ events: createEventBus(fake.host, fake.userId), host: fake.host });
    const adapter = createDecisionService(fake.host, log, fake.userId).createJevAdapter(() => ({ connectionId: "dec-1", model: "typesafe/jev-latest", rosterSelectionDefault: true }));
    const send = (signal?: AbortSignal) => adapter.network.fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: {}, body: JSON.stringify({ model: "m", state: "s", questions: {} }), signal });

    const statusOf = async (error: unknown) => {
      hostError = error;
      return (await send()).status;
    };
    expect(await statusOf(new Error("TypeSafe decision request failed (401): Unauthorized"))).toBe(401);
    expect(await statusOf(new Error("PERMISSION_DENIED: decisions - Decision model permission not granted"))).toBe(403);
    expect(await statusOf(new Error("Rate limit exceeded"))).toBe(429);
    expect(await statusOf(new Error("Decision connection not found"))).toBe(400);
    expect(await statusOf(new Error("socket closed"))).toBe(502);
    expect(log.list().map((e) => e.message)).toContain("JEV decision request failed: PERMISSION_DENIED: decisions - Decision model permission not granted");

    // An aborted request still throws, so AM reports its own cancel / timeout.
    const controller = new AbortController();
    controller.abort();
    hostError = new DOMException("aborted", "AbortError");
    await expect(send(controller.signal)).rejects.toThrow("aborted");
  });
});
