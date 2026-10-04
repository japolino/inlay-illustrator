/**
 * RPC router: validates request envelopes from the frontend, dispatches to the handler table and sends exactly one response
 * envelope per request (`okResponse` / `errorResponse`) with `host.sendToFrontend(envelope, userId)`.
 *
 * - Non-RPC messages (other `type`) return false so the caller can route them elsewhere (fetch bridge).
 * - Wrong protocol -> `protocol-mismatch`; unknown method -> `unknown-method`; method without handler -> `unsupported`;
 *   non-object params -> `bad-request`. Thrown errors go through `toRpcError` (RpcFailure kept, aborts -> cancelled).
 * - Failures are written to the user's RunLog (scope "rpc").
 */
import {
  errorResponse,
  isRpcMethod,
  okResponse,
  RPC_MESSAGE_TYPE,
  RPC_PROTOCOL_VERSION,
  rpcError,
  type RpcError,
  type RpcMethod,
  type RpcResponseEnvelope,
} from "../../shared/contract/index.js";
import type { SpindleHost } from "../services/types.js";
import { toRpcError } from "./errors.js";
import type { HandlerGroup, RpcContext } from "./types.js";

export interface RequestMeta {
  method: RpcMethod;
  requestId: string;
  frontendSessionId?: string;
  /** `params.clientId` of `session.hello` (other requests: undefined). */
  clientId?: string;
}

export interface RouterOptions {
  host: Pick<SpindleHost, "sendToFrontend">;
  getContext: (userId: string, meta: RequestMeta) => Promise<RpcContext> | RpcContext;
  handlers: HandlerGroup;
  /** Called for every failed request (after the error response was sent). */
  onError?: (error: RpcError, meta: RequestMeta & { userId: string }) => void;
}

export interface Router {
  /** True when the payload was an RPC request envelope (answered here), false for anything else. */
  handleFrontendMessage(payload: unknown, userId: string, frontendSessionId?: string): Promise<boolean>;
  /** Methods with a handler. */
  readonly methods: RpcMethod[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function createRouter(options: RouterOptions): Router {
  const { host, handlers } = options;

  function send(userId: string, envelope: RpcResponseEnvelope): void {
    try {
      host.sendToFrontend(envelope, userId);
    } catch {
      /* frontend gone: nothing to do */
    }
  }

  return {
    get methods() {
      return Object.keys(handlers).filter(isRpcMethod) as RpcMethod[];
    },
    async handleFrontendMessage(payload, userId, frontendSessionId) {
      const message = record(payload);
      if (!message || message.type !== RPC_MESSAGE_TYPE || message.kind !== "request") return false;
      const requestId = typeof message.requestId === "string" ? message.requestId : "";
      const rawMethod = typeof message.method === "string" ? message.method : "";
      if (!requestId) return true; // cannot answer a request without id: dropped
      const method = rawMethod as RpcMethod;
      const meta: RequestMeta = { method, requestId, frontendSessionId };
      const reply = (error: RpcError) => {
        send(userId, errorResponse({ requestId, method }, error));
        options.onError?.(error, { ...meta, userId });
      };

      if (message.protocol !== RPC_PROTOCOL_VERSION) {
        reply(rpcError("protocol-mismatch", `Protocol ${String(message.protocol)} is not supported (backend speaks ${RPC_PROTOCOL_VERSION}). Reload the page.`, { details: { backend: RPC_PROTOCOL_VERSION, frontend: message.protocol } }));
        return true;
      }
      if (!isRpcMethod(rawMethod)) {
        reply(rpcError("unknown-method", `Unknown method: ${rawMethod || "(none)"}`));
        return true;
      }
      const handler = (handlers as Record<string, ((params: unknown, ctx: RpcContext) => unknown) | undefined>)[method];
      if (!handler) {
        reply(rpcError("unsupported", `${method} is not available in this version.`));
        return true;
      }
      const params = record(message.params);
      if (!params) {
        reply(rpcError("bad-request", "Request params must be an object."));
        return true;
      }
      if (method === "session.hello" && typeof params.clientId === "string") meta.clientId = params.clientId;

      let ctx: RpcContext | null = null;
      try {
        ctx = await options.getContext(userId, meta);
        const result = await handler(params, ctx);
        send(userId, okResponse({ requestId, method }, (result ?? { ok: true }) as never));
      } catch (error) {
        const rpc = toRpcError(error);
        try {
          if (rpc.code !== "cancelled") ctx?.log.append(rpc.code === "internal" ? "error" : "warn", "rpc", `${method} failed: ${rpc.message}`, { code: rpc.code, detailCode: rpc.detailCode });
        } catch {
          /* logging must not break the response */
        }
        reply(rpc);
      }
      return true;
    },
  };
}
