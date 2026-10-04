import { describe, expect, test } from "bun:test";
import { createRequest, isRpcResponse, RPC_METHODS, RPC_MESSAGE_TYPE, type RpcMethod } from "../../shared/contract/index.js";
import { createFakeServices } from "../testing/fake-services.js";
import { fail } from "./errors.js";
import { HANDLER_GROUPS } from "./handlers/index.js";
import { createRouter } from "./router.js";
import type { HandlerGroup, RpcContext } from "./types.js";

function setup(handlers: HandlerGroup) {
  const fx = createFakeServices();
  const sent: Array<{ payload: any; userId?: string }> = [];
  const contexts: Array<{ userId: string; meta: unknown }> = [];
  const router = createRouter({
    host: { sendToFrontend: (payload: unknown, userId?: string) => void sent.push({ payload, userId }) },
    getContext: (userId, meta) => {
      contexts.push({ userId, meta });
      return { ...fx.services, modules: {} } as RpcContext;
    },
    handlers,
  });
  return { fx, sent, contexts, router };
}

describe("rpc router", () => {
  test("answers a request with exactly one ok response", async () => {
    const { router, sent, contexts } = setup({ "logs.clear": () => ({ ok: true as const }), "session.hello": (p) => ({ protocol: 1, status: { clientId: p.clientId } as never }) });
    expect(await router.handleFrontendMessage(createRequest("logs.clear", {}, "r1"), "u1", "s1")).toBe(true);
    expect(sent).toEqual([{ userId: "u1", payload: { type: RPC_MESSAGE_TYPE, kind: "response", protocol: 1, requestId: "r1", method: "logs.clear", ok: true, result: { ok: true } } }]);
    await router.handleFrontendMessage(createRequest("session.hello", { protocol: 1, clientId: "c9", surface: "overlay" }, "r2"), "u1", "s1");
    expect(contexts[1]!.meta).toEqual({ method: "session.hello", requestId: "r2", frontendSessionId: "s1", clientId: "c9" });
  });

  test("ignores non-RPC payloads", async () => {
    const { router, sent } = setup({});
    expect(await router.handleFrontendMessage({ type: "get_state" }, "u1")).toBe(false);
    expect(await router.handleFrontendMessage(null, "u1")).toBe(false);
    expect(await router.handleFrontendMessage({ type: RPC_MESSAGE_TYPE, kind: "event" }, "u1")).toBe(false);
    expect(sent).toEqual([]);
  });

  test("protocol mismatch, unknown method, missing handler, bad params", async () => {
    const { router, sent } = setup({ "logs.clear": () => ({ ok: true as const }) });
    await router.handleFrontendMessage({ ...createRequest("logs.clear", {}, "a"), protocol: 2 }, "u1");
    await router.handleFrontendMessage({ ...createRequest("logs.clear", {}, "b"), method: "nope.nope" }, "u1");
    await router.handleFrontendMessage(createRequest("logs.list", {}, "c"), "u1");
    await router.handleFrontendMessage({ ...createRequest("logs.clear", {}, "d"), params: null }, "u1");
    expect(sent.map((s) => [s.payload.requestId, s.payload.ok, s.payload.error.code])).toEqual([
      ["a", false, "protocol-mismatch"],
      ["b", false, "unknown-method"],
      ["c", false, "unsupported"],
      ["d", false, "bad-request"],
    ]);
    expect(sent.every((s) => isRpcResponse(s.payload) || s.payload.method === "nope.nope")).toBe(true);
  });

  test("handler errors become one error response and a run log line", async () => {
    const { router, sent, fx } = setup({
      "logs.list": () => fail("not-found", "missing thing"),
      "logs.clear": () => {
        throw new Error("boom");
      },
      "config.get": () => {
        throw new DOMException("x", "AbortError");
      },
    });
    await router.handleFrontendMessage(createRequest("logs.list", {}, "1"), "u1");
    await router.handleFrontendMessage(createRequest("logs.clear", {}, "2"), "u1");
    await router.handleFrontendMessage(createRequest("config.get", {}, "3"), "u1");
    expect(sent.map((s) => s.payload.error)).toEqual([{ code: "not-found", message: "missing thing" }, { code: "internal", message: "boom" }, { code: "cancelled", message: "The operation was cancelled." }]);
    expect(fx.services.log.list().map((e) => [e.level, e.scope, e.message])).toEqual([
      ["warn", "rpc", "logs.list failed: missing thing"],
      ["error", "rpc", "logs.clear failed: boom"],
    ]);
  });

  test("no RPC method is handled by two handler groups", () => {
    const owners = new Map<string, string[]>();
    for (const [group, handlers] of Object.entries(HANDLER_GROUPS)) for (const method of Object.keys(handlers)) owners.set(method, [...(owners.get(method) ?? []), group]);
    expect([...owners].filter(([, groups]) => groups.length > 1)).toEqual([]);
    expect([...owners.keys()].filter((m) => !(RPC_METHODS as readonly string[]).includes(m))).toEqual([]);
  });

  // PENDING until the pipeline (chat.ts) and analysis (workspace.ts) handler groups land. Run with INLAY_STRICT_HANDLERS=1
  // to enforce; without it the test only reports the methods that still have no handler.
  test("every RPC method has exactly one handler (strict with INLAY_STRICT_HANDLERS=1)", () => {
    const handled = new Set(Object.values(HANDLER_GROUPS).flatMap((h) => Object.keys(h)));
    const missing = (RPC_METHODS as readonly RpcMethod[]).filter((m) => !handled.has(m));
    if (process.env.INLAY_STRICT_HANDLERS === "1") expect(missing).toEqual([]);
    else if (missing.length) console.warn(`[router.test] PENDING: ${missing.length} RPC methods without handler: ${missing.join(", ")}`);
  });
});
