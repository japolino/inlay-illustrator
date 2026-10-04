import { Button } from "./ui/index.js";
import { LAUNCHER_LABELS } from "./labels.js";
import { useStore, type FrontendStore } from "./store.js";

/** Drawer-tab panel: a short description, the backend status and the overlay launcher. */
export function LauncherPanel({ store, onOpen }: { store: FrontendStore; onOpen: () => void }) {
  const snapshot = useStore(store);
  return (
    <div class="grid gap-3 p-3 text-foreground">
      <div class="grid gap-1">
        <h2 class="text-sm font-extrabold">{LAUNCHER_LABELS.title}</h2>
        <p class="text-xs leading-relaxed text-muted-foreground">{LAUNCHER_LABELS.subtitle}</p>
      </div>
      <Button className="w-full" onClick={onOpen} aria-pressed={snapshot.overlayOpen}>{LAUNCHER_LABELS.open}</Button>
      <div class="grid gap-0.5 rounded-md bg-card px-3 py-2" role="status" aria-live="polite">
        <span class="text-3xs font-black uppercase text-muted-foreground">{LAUNCHER_LABELS.status}</span>
        <span class="text-xs wrap-anywhere">{snapshot.status}</span>
      </div>
    </div>
  );
}
