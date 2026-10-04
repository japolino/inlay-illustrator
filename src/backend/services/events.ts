/**
 * Event bus: backend -> frontend RPC events (`createEvent` envelopes) sent with `host.sendToFrontend(env, userId)`.
 * `seq` is monotonic per bus (one bus per user, created with the services).
 */
import { createEvent, type RpcEventName, type RpcEvents } from "../../shared/contract/index.js";
import type { EventBus, SpindleHost } from "./types.js";

export interface EventBusWithSeq extends EventBus {
  /** Last sequence number sent (0 before the first event). */
  readonly lastSeq: number;
}

export function createEventBus(host: Pick<SpindleHost, "sendToFrontend">, userId: string | undefined): EventBusWithSeq {
  let seq = 0;
  return {
    get lastSeq() {
      return seq;
    },
    emit<E extends RpcEventName>(event: E, payload: RpcEvents[E]) {
      seq += 1;
      try {
        host.sendToFrontend(createEvent(event, payload, seq), userId);
      } catch {
        /* frontend not connected: events are best effort */
      }
    },
  };
}
