/**
 * Host signals that make the backend state stale: the host connection coming back (CONNECTED) and a tab shown again
 * after a while (a backgrounded phone tab can miss events without a reconnect). Both re-read the state, or retry the
 * handshake when it failed (`AppController.reconnect`).
 */
import type { AppController } from "./state/app-state.js";

/** A tab hidden at least this long re-reads the backend state when it is shown again. */
export const RESYNC_AFTER_HIDDEN_MS = 5_000;

type HostEvents = { on(name: string, handler: (payload: unknown) => void): () => void };

export function watchConnection(events: HostEvents, app: Pick<AppController, "reconnect" | "state">, doc: Document): () => void {
  const off = events.on("CONNECTED", () => void app.reconnect());
  let hiddenAt = 0;
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") hiddenAt = Date.now();
    else if (app.state.connection === "error" || (hiddenAt && Date.now() - hiddenAt >= RESYNC_AFTER_HIDDEN_MS)) void app.reconnect();
  };
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    off();
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
