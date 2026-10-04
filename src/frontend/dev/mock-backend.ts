/**
 * Dev mock backend: answers RPC envelopes in memory so the UI can run without Lumiverse
 * (tests, the preview page and screenshots). Handler modules live in ./mock/*.ts, one per screen
 * area, and share one {@link MockDb}. Unknown methods answer `unsupported`.
 */
import {
  createEvent,
  okResponse,
  errorResponse,
  rpcError,
  RPC_MESSAGE_TYPE,
  type RpcError,
  type RpcErrorCode,
  type RpcEventName,
  type RpcEvents
} from "../../shared/contract/rpc.js";
import type { ClientMethod, ClientParams, ClientResult, RpcTransport } from "../rpc/client.js";
import { createMockDb, type MockDb } from "./mock/fixtures.js";

export class MockRpcError extends Error {
  readonly error: RpcError;
  constructor(code: RpcErrorCode, message: string, extra: Omit<RpcError, "code" | "message"> = {}) {
    super(message);
    this.error = rpcError(code, message, extra);
  }
}

export interface MockContext {
  db: MockDb;
  emit<E extends RpcEventName>(event: E, payload: RpcEvents[E]): void;
  /** Resolves after `ms` (uses the mock's timer so tests can run fast). */
  delay(ms: number): Promise<void>;
  fail(code: RpcErrorCode, message: string, extra?: Omit<RpcError, "code" | "message">): never;
  /** Calls another mock handler. */
  call<M extends ClientMethod>(method: M, params: ClientParams<M>): Promise<ClientResult<M>>;
}

export type MockHandler<M extends ClientMethod> = (params: ClientParams<M>, ctx: MockContext) => ClientResult<M> | Promise<ClientResult<M>>;
export type MockHandlers = { [M in ClientMethod]?: MockHandler<M> };

export interface MockBackendOptions {
  db?: MockDb;
  handlers?: MockHandlers[];
  /** Simulated response latency (ms). 0 answers on the next microtask. */
  latencyMs?: number;
  /** Time scale for ctx.delay (0 = instant). */
  timeScale?: number;
  /** Logs every request/response to the console. */
  log?: boolean;
}

export interface MockBackend {
  transport: RpcTransport;
  db: MockDb;
  emit<E extends RpcEventName>(event: E, payload: RpcEvents[E]): void;
  handlers: MockHandlers;
  /** Requests seen (method + params), newest last. */
  calls: Array<{ method: string; params: unknown }>;
}

export function createMockBackend(options: MockBackendOptions = {}): MockBackend {
  const db = options.db ?? createMockDb();
  const handlers: MockHandlers = Object.assign({}, ...(options.handlers ?? []));
  const listeners = new Set<(message: unknown) => void>();
  const calls: Array<{ method: string; params: unknown }> = [];
  let seq = 0;
  const latency = options.latencyMs ?? 0;
  const scale = options.timeScale ?? 1;

  const deliver = (message: unknown) => {
    for (const listener of [...listeners]) listener(message);
  };
  const emit = <E extends RpcEventName>(event: E, payload: RpcEvents[E]) => {
    const envelope = createEvent(event, payload, seq++);
    setTimeout(() => deliver(envelope), 0);
  };
  const ctx: MockContext = {
    db,
    emit,
    delay: (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms * scale))),
    fail: (code, message, extra) => {
      throw new MockRpcError(code, message, extra);
    },
    call: async (method, params) => {
      const handler = handlers[method] as MockHandler<typeof method> | undefined;
      if (!handler) throw new MockRpcError("unknown-method", `Mock has no handler for ${method}.`);
      return handler(params, ctx);
    }
  };

  async function handle(message: unknown): Promise<void> {
    const request = message as { type?: unknown; kind?: unknown; requestId: string; method: ClientMethod; params: unknown };
    if (!request || request.type !== RPC_MESSAGE_TYPE || request.kind !== "request") return;
    calls.push({ method: request.method, params: request.params });
    const handler = handlers[request.method] as MockHandler<ClientMethod> | undefined;
    let response: unknown;
    try {
      if (!handler) throw new MockRpcError("unsupported", `Not available in the dev mock: ${request.method}.`);
      const result = await handler(request.params as never, ctx);
      response = okResponse(request as never, result as never);
    } catch (error) {
      const rpc = error instanceof MockRpcError ? error.error : rpcError("internal", error instanceof Error ? error.message : String(error));
      response = errorResponse(request as never, rpc);
    }
    if (options.log) console.log("[mock]", request.method, request.params, response);
    if (latency > 0) setTimeout(() => deliver(response), latency);
    else queueMicrotask(() => deliver(response));
  }

  return {
    db,
    emit,
    handlers,
    calls,
    transport: {
      send: (message) => void handle(message),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    }
  };
}
