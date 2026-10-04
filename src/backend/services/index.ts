/**
 * Service factory: everything per user (`createServices(host, userId)`), plus a per-user registry so queues, caches and the
 * fetch bridge are shared by all requests of one user.
 */
import { createEventBus } from "./events.js";
import { createImageBytesService } from "./image-bytes.js";
import { createImageService } from "./images.js";
import { createLlmService } from "./llm.js";
import { createRunLog } from "./run-log.js";
import { createSourcesService } from "./sources.js";
import { createStorageService } from "./storage.js";
import type { BackendServices, SpindleHost } from "./types.js";

export * from "./types.js";
export { createEventBus } from "./events.js";
export { createImageBytesService } from "./image-bytes.js";
export { createImageService } from "./images.js";
export { createLlmService } from "./llm.js";
export { createRunLog } from "./run-log.js";
export { createSourcesService } from "./sources.js";
export { createStorageService } from "./storage.js";

export function createServices(host: SpindleHost, userId: string | undefined): BackendServices {
  const events = createEventBus(host, userId);
  const log = createRunLog({ events, host });
  const storage = createStorageService(host, userId, { events, log });
  const loadConfig = () => storage.loadConfig();
  const imageBytes = createImageBytesService({ host, userId, storage, log });
  const llm = createLlmService({ host, userId, loadConfig, log, getJson: (url, options) => imageBytes.getJson(url, options) });
  const images = createImageService({ host, userId, loadConfig, log });
  const sources = createSourcesService({ host, userId, imageBytes, storage, log });
  return { host, userId, storage, llm, images, imageBytes, sources, events, log };
}

export interface ServicesRegistry {
  /** Services of a user (created on first use). `undefined` = the extension owner (user-scoped extensions). */
  get(userId: string | undefined): BackendServices;
  /** Feed a frontend message to that user's services (fetch-bridge answers); true when consumed. */
  acceptFrontendMessage(payload: unknown, userId: string | undefined): boolean;
  /** Every user with services (for broadcast invalidation). */
  all(): BackendServices[];
}

export function createServicesRegistry(host: SpindleHost, factory: (host: SpindleHost, userId: string | undefined) => BackendServices = createServices): ServicesRegistry {
  const byUser = new Map<string, BackendServices>();
  const get = (userId: string | undefined) => {
    const key = userId ?? "";
    let services = byUser.get(key);
    if (!services) byUser.set(key, (services = factory(host, userId)));
    return services;
  };
  return {
    get,
    acceptFrontendMessage(payload, userId) {
      if (!payload || typeof payload !== "object") return false;
      return get(userId).imageBytes.acceptFrontendMessage(payload as Record<string, unknown>);
    },
    all: () => [...byUser.values()],
  };
}
