import { describe, expect, test } from "bun:test";
import { createEvent, errorResponse, okResponse, rpcError } from "../../shared/contract/rpc.js";
import { RpcCallError, RpcClient, type RpcTransport } from "./client.js";

function loopback() {
  const sent: any[] = [];
  let handler: ((message: unknown) => void) | null = null;
  const transport: RpcTransport = {
    send: (message) => sent.push(message),
    subscribe: (h) => {
      handler = h;
      return () => {
        handler = null;
      };
    }
  };
  return { transport, sent, deliver: (message: unknown) => handler?.(message) };
}

describe("RpcClient", () => {
  test("pairs responses by requestId (out of order)", async () => {
    const t = loopback();
    const client = new RpcClient(t.transport, { clientId: "t" });
    const a = client.call("session.getStatus", {});
    const b = client.call("logs.clear", {});
    expect(t.sent).toHaveLength(2);
    expect(t.sent[0].requestId).not.toBe(t.sent[1].requestId);
    t.deliver(okResponse(t.sent[1], { ok: true }));
    t.deliver(errorResponse(t.sent[0], rpcError("busy", "Busy now")));
    expect(await b).toEqual({ ok: true });
    const error = await a.catch((e) => e);
    expect(error).toBeInstanceOf(RpcCallError);
    expect((error as RpcCallError).code).toBe("busy");
    expect(client.pendingCount()).toBe(0);
  });

  test("times out and ignores late answers", async () => {
    const t = loopback();
    const client = new RpcClient(t.transport, { timeoutMs: 10 });
    const error = await client.call("session.getStatus", {}).catch((e) => e);
    expect((error as RpcCallError).code).toBe("timeout");
    t.deliver(okResponse(t.sent[0], {} as never));
    expect(client.pendingCount()).toBe(0);
  });

  test("abort signal cancels", async () => {
    const t = loopback();
    const client = new RpcClient(t.transport);
    const controller = new AbortController();
    const promise = client.call("session.getStatus", {}, { signal: controller.signal });
    controller.abort();
    expect(((await promise.catch((e) => e)) as RpcCallError).code).toBe("cancelled");
  });

  test("dispatches events, any-listeners and foreign messages", () => {
    const t = loopback();
    const client = new RpcClient(t.transport);
    const seen: string[] = [];
    const off = client.on("notice", (payload) => seen.push(`notice:${payload.message}`));
    client.onAny((event) => seen.push(`any:${event}`));
    client.onForeign((message) => seen.push(`foreign:${(message as { type: string }).type}`));
    t.deliver(createEvent("notice", { tone: "info", message: "hi" }, 1));
    off();
    t.deliver(createEvent("notice", { tone: "info", message: "again" }, 2));
    t.deliver({ type: "state" });
    expect(seen).toEqual(["notice:hi", "any:notice", "any:notice", "foreign:state"]);
    expect(client.lastEventSeq).toBe(2);
  });

  test("destroy rejects pending calls", async () => {
    const t = loopback();
    const client = new RpcClient(t.transport);
    const promise = client.call("session.getStatus", {});
    client.destroy();
    expect(((await promise.catch((e) => e)) as RpcCallError).code).toBe("cancelled");
  });
});
