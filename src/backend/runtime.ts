/**
 * Per-user backend runtime: services (createServicesRegistry) + feature modules (pipeline, analysis) + the RPC router.
 * `src/backend.ts` wires it to the Spindle host; tests build it over the fake host.
 */
import { createRouter, type Router } from "./rpc/router.js";
import { allHandlers } from "./rpc/handlers/index.js";
import type { BackendModules, HandlerGroup, RpcContext } from "./rpc/types.js";
import { createServicesRegistry, type ServicesRegistry } from "./services/index.js";
import type { BackendServices, SpindleHost } from "./services/types.js";

/** Builds part of a user's BackendModules. `getModules` resolves lazily (modules may call each other after creation). */
export type ModuleFactory = (services: BackendServices, getModules: () => BackendModules) => Partial<BackendModules>;

export interface BackendRuntime {
  registry: ServicesRegistry;
  router: Router;
  services(userId: string | undefined): BackendServices;
  modules(userId: string | undefined): BackendModules;
  context(userId: string | undefined, meta?: { clientId?: string; frontendSessionId?: string }): RpcContext;
  /** Every user that has a runtime (host events without userId fan out to these). */
  users(): Array<string | undefined>;
  /** Fetch-bridge answers, then RPC requests. True when consumed. */
  handleFrontendMessage(payload: unknown, userId: string, frontendSessionId?: string): Promise<boolean>;
  dispose(): void;
}

export interface BackendRuntimeOptions {
  host: SpindleHost;
  modules: ModuleFactory[];
  handlers?: HandlerGroup;
  createServices?: (host: SpindleHost, userId: string | undefined) => BackendServices;
}

interface Disposable { dispose?: () => void }

export function createBackendRuntime(options: BackendRuntimeOptions): BackendRuntime {
  const registry = createServicesRegistry(options.host, options.createServices);
  const modulesByUser = new Map<string, BackendModules>();

  const modules = (userId: string | undefined): BackendModules => {
    const key = userId ?? "";
    let current = modulesByUser.get(key);
    if (current) return current;
    const services = registry.get(userId);
    current = {} as BackendModules;
    modulesByUser.set(key, current);
    const get = () => modulesByUser.get(key)!;
    for (const factory of options.modules) Object.assign(current, factory(services, get));
    return current;
  };

  const context = (userId: string | undefined, meta: { clientId?: string; frontendSessionId?: string } = {}): RpcContext => ({
    ...registry.get(userId),
    ...meta,
    modules: modules(userId),
  });

  const router = createRouter({
    host: options.host,
    handlers: options.handlers ?? allHandlers(),
    getContext: (userId, meta) => context(userId, { clientId: meta.clientId, frontendSessionId: meta.frontendSessionId }),
    onError: (error, meta) => {
      if (error.code === "cancelled") return;
      registry.get(meta.userId).log.append("warn", "rpc", `${meta.method} failed: ${error.message}`, { code: error.code, detailCode: error.detailCode });
    },
  });

  return {
    registry,
    router,
    services: (userId) => registry.get(userId),
    modules,
    context,
    users: () => [...modulesByUser.keys()].map((key) => (key === "" ? undefined : key)),
    async handleFrontendMessage(payload, userId, frontendSessionId) {
      if (registry.acceptFrontendMessage(payload, userId)) return true;
      return router.handleFrontendMessage(payload, userId, frontendSessionId);
    },
    dispose() {
      for (const mods of modulesByUser.values()) {
        for (const mod of Object.values(mods as unknown as Record<string, Disposable>)) {
          try {
            mod?.dispose?.();
          } catch {
            /* ignore */
          }
        }
      }
      modulesByUser.clear();
    },
  };
}
