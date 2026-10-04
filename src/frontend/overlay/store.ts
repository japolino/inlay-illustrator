import { useEffect, useState } from "preact/hooks";

/** Host-side snapshot shared by the overlay controller and the launchers (no backend data: see AppController). */
export type FrontendSnapshot = {
  chatId: string;
  overlayOpen: boolean;
};

export class FrontendStore {
  private snapshot: FrontendSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(initial?: Partial<FrontendSnapshot>) {
    this.snapshot = { chatId: "", overlayOpen: false, ...initial };
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
