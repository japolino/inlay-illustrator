/** Drawer-tab launcher + status panel: backend status, running jobs, quick settings, open buttons. */
import { useState } from "preact/hooks";
import { AppContext, useAppState, type AppController } from "../state/app-state.js";
import { FAB_CORNER_OPTIONS, type FabCorner } from "../fab.js";
import { LAUNCHER_LABELS as L } from "./labels.js";
import { useStore, type FrontendStore } from "./store.js";
import { Button, Select, SettingsIcon, Switch, cn } from "./ui/index.js";

export type LauncherPanelProps = {
  app: AppController;
  store: FrontendStore;
  onOpen: () => void;
  onOpenSettings: () => void;
  fabCorner: { get: () => FabCorner; set: (corner: FabCorner) => void };
};

export function LauncherPanel(props: LauncherPanelProps) {
  return (
    <AppContext.Provider value={props.app}>
      <LauncherBody {...props} />
    </AppContext.Provider>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warning" | "success" }) {
  return (
    <div class="flex items-baseline justify-between gap-3 py-1">
      <span class="shrink-0 text-2xs font-bold text-muted-foreground">{label}</span>
      <span class={cn("min-w-0 truncate text-right text-xs", tone === "danger" && "text-destructive", tone === "warning" && "text-warning", tone === "success" && "text-success")} title={value}>{value}</span>
    </div>
  );
}

function LauncherBody({ app, store, onOpen, onOpenSettings, fabCorner }: LauncherPanelProps) {
  const snapshot = useStore(store);
  const connection = useAppState((s) => s.connection);
  const connectionError = useAppState((s) => s.connectionError);
  const status = useAppState((s) => s.status);
  const characterName = useAppState((s) => s.characters?.find((c) => c.characterId === s.status?.activeCharacterId)?.name ?? null);
  const generationJobs = useAppState((s) => Object.values(s.generationJobs));
  const analysisJobs = useAppState((s) => Object.values(s.analysisJobs).filter((job) => !job.finishedAt));
  const chatSettings = useAppState((s) => s.chatImageGeneration);
  const imageConnected = useAppState((s) => !!s.config?.image.connectionId);
  const [corner, setCorner] = useState<FabCorner>(fabCorner.get());

  const connectionText = connection === "ready" ? L.ready : connection === "error" ? `${L.error}: ${connectionError?.message ?? ""}` : L.connecting;
  const jobs = [...generationJobs.map((job) => job.progress.label), ...analysisJobs.map((job) => job.progress.label)];
  return (
    <div class="grid gap-3 p-3 text-foreground" data-ii-launcher="">
      <div class="grid gap-1">
        <h2 class="text-sm font-extrabold">{L.title}</h2>
        <p class="text-xs leading-relaxed text-muted-foreground">{L.subtitle}</p>
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Button className="w-full" onClick={onOpen} aria-pressed={snapshot.overlayOpen}>{L.open}</Button>
        <Button variant="subtle" size="icon" aria-label={L.settings} title={L.settings} onClick={onOpenSettings}><SettingsIcon /></Button>
      </div>
      <section class="grid rounded-md bg-card px-3 py-2" role="status" aria-live="polite" aria-label={L.status}>
        <StatusRow label={L.backend} value={connectionText} tone={connection === "error" ? "danger" : connection === "ready" ? "success" : undefined} />
        <StatusRow label={L.character} value={characterName ?? L.none} />
        <StatusRow label={L.imageProvider} value={!imageConnected ? L.notConnected : status?.generationProvider ?? "-"} tone={!imageConnected ? "warning" : undefined} />
        {status?.missingPermissions.length ? <StatusRow label={L.permissions} value={L.missing(status.missingPermissions.join(", "))} tone="warning" /> : null}
        <StatusRow label={L.jobs} value={jobs.length ? jobs.join(" · ") : L.idle} />
      </section>
      {chatSettings ? (
        <label class="flex items-center justify-between gap-3 rounded-md bg-card px-3 py-2">
          <span class="grid gap-0.5">
            <span class="text-xs font-bold">{L.autoGeneration}</span>
            <span class="text-2xs text-muted-foreground">{L.autoGenerationHint}</span>
          </span>
          <Switch aria-label={L.autoGeneration} checked={chatSettings.autoGenerationEnabled} onCheckedChange={(checked) => void app.setChatImageGeneration({ ...chatSettings, autoGenerationEnabled: checked })} />
        </label>
      ) : null}
      <div class="flex items-center justify-between gap-3 rounded-md bg-card px-3 py-2">
        <span class="text-xs font-bold" id="ii-launcher-fab-corner">{L.fabCorner}</span>
        <div class="w-36">
          <Select<FabCorner> aria-labelledby="ii-launcher-fab-corner" value={corner} options={FAB_CORNER_OPTIONS} onValueChange={(value) => { setCorner(value); fabCorner.set(value); }} />
        </div>
      </div>
    </div>
  );
}
