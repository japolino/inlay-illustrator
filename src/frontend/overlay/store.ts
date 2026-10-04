import { useEffect, useState } from "preact/hooks";
import { DEFAULT_CONFIG, type Config } from "../../shared/config.js";
import type { ImageConnection, ParserConnection } from "../contracts.js";

/** Frontend snapshot shared by the overlay, the launcher panel and chat-side helpers. */
export type FrontendSnapshot = {
  chatId: string;
  status: string;
  config: Config;
  parserConnections: ParserConnection[];
  imageConnections: ImageConnection[];
  overlayOpen: boolean;
};

export class FrontendStore {
  private snapshot: FrontendSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(initial?: Partial<FrontendSnapshot>) {
    this.snapshot = {
      chatId: "",
      status: "Loading…",
      config: { ...DEFAULT_CONFIG },
      parserConnections: [],
      imageConnections: [],
      overlayOpen: false,
      ...initial
    };
  }

  get(): FrontendSnapshot {
    return this.snapshot;
  }

  set(patch: Partial<FrontendSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function useStore(store: FrontendStore): FrontendSnapshot {
  const [snapshot, setSnapshot] = useState(() => store.get());
  useEffect(() => {
    setSnapshot(store.get());
    return store.subscribe(() => setSnapshot(store.get()));
  }, [store]);
  return snapshot;
}
