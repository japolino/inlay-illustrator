/** RPC handler typing for the backend router. */
import type { RpcHandlers, RpcMethod } from "../../shared/contract/index.js";
import type { BackendServices } from "../services/types.js";

/** Per-request context: the user's services + request metadata. Modules attach their controllers via `modules`. */
export interface RpcContext extends BackendServices {
  /** Frontend client id from `session.hello` (if any). */
  clientId?: string;
  frontendSessionId?: string;
  /** Feature modules registered at startup (pipeline, analysis, ...), looked up by handlers. */
  modules: BackendModules;
}

/** Feature controllers per user. Each module owner declares its entry by declaration merging (see pipeline/analysis index). */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface BackendModules {}

/** A handler group owned by one module. */
export type HandlerGroup = Partial<RpcHandlers<RpcContext>>;
export type HandlerFor<M extends RpcMethod> = RpcHandlers<RpcContext>[M];
