/**
 * Frontend RPC client (spec: docs/CONTRACT.md §7, src/shared/contract/rpc.ts).
 * - Requests are paired with responses by `requestId`; each call has a timeout.
 * - Events are dispatched to per-event and catch-all listeners.
 * - Non-RPC backend messages (fetch bridge requests, ...) go to `onForeign` listeners.
 */
import {
  RPC_MESSAGE_TYPE,
  RPC_PROTOCOL_VERSION,
  createRequest,
  createRequestId,
  isRpcEvent,
  rpcError,
  type RpcError,
  type RpcEventEnvelope,
  type RpcEventName,
  type RpcEvents,
  type RpcMethods,
  type RpcResponseEnvelope
} from "../../shared/contract/rpc.js";
/** Methods the client can call (the contract, src/shared/contract/rpc.ts). */
export type ClientMethods = RpcMethods;
export type ClientMethod = keyof ClientMethods & string;
export type ClientParams<M extends ClientMethod> = ClientMethods[M] extends { params: infer P } ? P : never;
export type ClientResult<M extends ClientMethod> = ClientMethods[M] extends { result: infer R } ? R : never;

/** Minimal message channel (Spindle `ctx.sendToBackend` / `ctx.onBackendMessage`, or the dev mock). */
export interface RpcTransport {
  send(message: unknown): void;
  subscribe(handler: (message: unknown) => void): () => void;
}

/** Error thrown by {@link RpcClient.call}; `error` is the backend's RpcError. */
export class RpcCallError extends Error {
  readonly error: RpcError;
  readonly method: string;
  constructor(method: string, error: RpcError) {
    super(error.message);
    this.name = "RpcCallError";
    this.method = method;
    this.error = error;
  }
  get code() {
    return this.error.code;
  }
}

/** Normalizes anything thrown by a call into an RpcError. */
export function toRpcError(value: unknown): RpcError {
  if (value instanceof RpcCallError) return value.error;
  if (value && typeof value === "object" && "code" in value && "message" in value) return value as RpcError;
  if (value instanceof Error) return rpcError("internal", value.message || String(value));
  return rpcError("internal", String(value));
}

export type CallOptions = { timeoutMs?: number; signal?: AbortSignal };
type Pending = { method: string; resolve: (value: unknown) => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout> | null; cleanup: () => void };
type AnyEventHandler = (event: RpcEventName, payload: unknown, seq: number) => void;

export type RpcClientOptions = {
  clientId?: string;
  /** Default call timeout (ms). Long jobs return a jobId quickly and report progress by events. */
  timeoutMs?: number;
};

export const DEFAULT_RPC_TIMEOUT_MS = 60_000;

export class RpcClient {
  readonly clientId: string;
  private readonly transport: RpcTransport;
  private readonly timeoutMs: number;
  private readonly pending = new Map<string, Pending>();
  private readonly eventHandlers = new Map<string, Set<(payload: unknown, seq: number) => void>>();
  private readonly anyHandlers = new Set<AnyEventHandler>();
  private readonly foreignHandlers = new Set<(message: unknown) => void>();
  private readonly unsubscribe: () => void;
  private lastSeq = -1;
  private destroyed = false;

  constructor(transport: RpcTransport, options: RpcClientOptions = {}) {
    this.transport = transport;
    this.clientId = options.clientId ?? `ui-${Math.random().toString(36).slice(2, 8)}`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
    this.unsubscribe = transport.subscribe((message) => this.receive(message));
  }

  /** Sends a request and resolves with its result (rejects with {@link RpcCallError}). */
  call<M extends ClientMethod>(method: M, params: ClientParams<M>, options: CallOptions = {}): Promise<ClientResult<M>> {
    if (this.destroyed) return Promise.reject(new RpcCallError(method, rpcError("cancelled", "The client was closed.")));
    const requestId = createRequestId(this.clientId);
    return new Promise<ClientResult<M>>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? this.timeoutMs;
      const onAbort = () => this.settle(requestId, false, rpcError("cancelled", "The request was cancelled."));
      const entry: Pending = {
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer: timeoutMs > 0 ? setTimeout(() => this.settle(requestId, false, rpcError("timeout", `No answer from the backend for ${method}.`, { retryable: true })), timeoutMs) : null,
        cleanup: () => options.signal?.removeEventListener("abort", onAbort)
      };
      if (options.signal?.aborted) {
        reject(new RpcCallError(method, rpcError("cancelled", "The request was cancelled.")));
        return;
      }
      options.signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(requestId, entry);
      try {
        this.transport.send(createRequest(method as never, params as never, requestId));
      } catch (error) {
        this.settle(requestId, false, rpcError("internal", `Could not send ${method}: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }

  /** Subscribes to one event. Returns the unsubscribe function. */
  on<E extends RpcEventName>(event: E, handler: (payload: RpcEvents[E], seq: number) => void): () => void {
    let set = this.eventHandlers.get(event);
    if (!set) this.eventHandlers.set(event, (set = new Set()));
    const entry = handler as (payload: unknown, seq: number) => void;
    set.add(entry);
    return () => set!.delete(entry);
  }

  onAny(handler: AnyEventHandler): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  /** Messages on the channel that are not RPC envelopes (fetch bridge requests). */
  onForeign(handler: (message: unknown) => void): () => void {
    this.foreignHandlers.add(handler);
    return () => this.foreignHandlers.delete(handler);
  }

  pendingCount(): number {
    return this.pending.size;
  }

  /** Feeds one incoming message (also used by tests). */
  receive(message: unknown): void {
    if (isResponseEnvelope(message)) {
      if (message.protocol !== RPC_PROTOCOL_VERSION) {
        this.settle(message.requestId, false, rpcError("protocol-mismatch", "The backend speaks another protocol version. Reload the page."));
        return;
      }
      if (message.ok) this.settle(message.requestId, true, message.result);
      else this.settle(message.requestId, false, message.error);
      return;
    }
    if (isRpcEvent(message)) {
      this.dispatchEvent(message);
      return;
    }
    if (message && typeof message === "object" && (message as { type?: unknown }).type === RPC_MESSAGE_TYPE) return; // our own echoes / requests
    for (const handler of this.foreignHandlers) safe(() => handler(message));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    for (const id of [...this.pending.keys()]) this.settle(id, false, rpcError("cancelled", "The client was closed."));
    this.eventHandlers.clear();
    this.anyHandlers.clear();
    this.foreignHandlers.clear();
  }

  private dispatchEvent(envelope: RpcEventEnvelope): void {
    // A smaller seq than the last one means the backend restarted; accept it and restart the counter.
    this.lastSeq = envelope.seq;
    const set = this.eventHandlers.get(envelope.event);
    if (set) for (const handler of [...set]) safe(() => handler(envelope.payload, envelope.seq));
    for (const handler of [...this.anyHandlers]) safe(() => handler(envelope.event, envelope.payload, envelope.seq));
  }

  /** Last event sequence number seen (-1 = none). */
  get lastEventSeq(): number {
    return this.lastSeq;
  }

  private settle(requestId: string, ok: boolean, value: unknown): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.pending.delete(requestId);
    if (entry.timer) clearTimeout(entry.timer);
    entry.cleanup();
    if (ok) entry.resolve(value);
    else entry.reject(new RpcCallError(entry.method, value as RpcError));
  }
}

/** Response guard that also accepts pending (not yet contracted) method names. */
function isResponseEnvelope(value: unknown): value is RpcResponseEnvelope {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.type === RPC_MESSAGE_TYPE && v.kind === "response" && typeof v.requestId === "string" && typeof v.method === "string" && typeof v.ok === "boolean";
}

function safe(run: () => void): void {
  try {
    run();
  } catch (error) {
    console.error("[Inlay Illustrator] RPC listener failed:", error);
  }
}

/** Transport over the Spindle frontend context. */
export function spindleTransport(ctx: { sendToBackend(payload: unknown): void; onBackendMessage(handler: (payload: unknown) => void): () => void }): RpcTransport {
  return {
    send: (message) => ctx.sendToBackend(message),
    subscribe: (handler) => ctx.onBackendMessage(handler)
  };
}

export { createRequestId };
