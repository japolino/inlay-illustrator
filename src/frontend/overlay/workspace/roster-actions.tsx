/** Roster exclusion (`TT` 100277) and roster active toggle (`khe` 103817) used by prompt rows. */
import { useState } from "preact/hooks";
import type { RosterItem } from "../../../shared/contract/rpc.js";
import { EyeIcon, EyeOffIcon, IconButton, UserMinusIcon } from "../ui/index.js";
import type { WorkspaceCtx } from "./context.js";
import { ASSETS_LABELS } from "./labels/assets.js";
import { isRosterActive } from "./model.js";

export function useRosterActions(ctx: WorkspaceCtx, item: RosterItem) {
  const { app, characterId } = ctx;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    if (!characterId) return;
    setPending(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : fallback); } finally { setPending(false); }
  };
  const ref = [{ memberKey: item.memberKey, selectionId: item.selectionId }];
  return {
    pending,
    error,
    setActive: (on: boolean) => run(() => item.kind === "custom"
      ? app.mutateWorkspace("customCharacters.setWorkspaceEnabled", { characterId: characterId!, customIds: [item.selectionId], enabled: on })
      : app.mutateWorkspace("roster.setActive", { characterId: characterId!, items: ref, active: on }), ASSETS_LABELS.rosterFailed),
    exclude: () => run(() => item.kind === "custom"
      ? app.mutateWorkspace("customCharacters.setRosterRegistered", { characterId: characterId!, customIds: [item.selectionId], registered: false })
      : app.mutateWorkspace("roster.setRegistered", { characterId: characterId!, items: ref, registered: false }), ASSETS_LABELS.excludeFailed)
  };
}

export function ExclusionButton({ ctx, item }: { ctx: WorkspaceCtx; item: RosterItem }) {
  const actions = useRosterActions(ctx, item);
  return (
    <>
      <IconButton size="workbenchIcon" label={ASSETS_LABELS.excludeOf(item.title)} title={actions.error ?? ASSETS_LABELS.exclude} disabled={actions.pending}
        className={actions.error ? "text-destructive" : undefined} onClick={() => void actions.exclude()}><UserMinusIcon /></IconButton>
      {actions.error ? <span role="alert" class="sr-only">{actions.error}</span> : null}
    </>
  );
}

export function RosterToggle({ ctx, item }: { ctx: WorkspaceCtx; item: RosterItem }) {
  const actions = useRosterActions(ctx, item);
  const active = isRosterActive(item);
  const label = active ? ASSETS_LABELS.rosterDisable : ASSETS_LABELS.rosterEnable;
  return (
    <>
      <IconButton size="workbenchIcon" label={`${item.title} ${label}`} title={actions.error ?? label} aria-pressed={active} disabled={actions.pending}
        className={active ? "text-primary" : actions.error ? "text-destructive" : undefined} onClick={() => void actions.setActive(!active)}>
        {active ? <EyeIcon /> : <EyeOffIcon />}
      </IconButton>
      {actions.error ? <span role="alert" class="sr-only">{actions.error}</span> : null}
    </>
  );
}
