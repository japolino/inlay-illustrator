/** Lorebook info (AM `xhe` 101882) and custom person info (AM `sct` 102022) panels over the main pane. */
import type { RosterItem } from "../../../shared/contract/rpc.js";
import { useApp, useAppState } from "../../state/app-state.js";
import { Button, IconButton, SpinnerIcon, XIcon } from "../ui/index.js";
import { useSourceUi, useWorkspaceUiStore } from "../workspace-ui.js";
import { ROSTER_LABELS as L } from "./labels.js";
import { useState } from "preact/hooks";

export function RosterInfoPanel() {
  const app = useApp();
  const ui = useWorkspaceUiStore();
  const characterId = useAppState((s) => s.selectedCharacterId);
  const snapshot = useAppState((s) => s.workspace);
  const { infoPromptKey } = useSourceUi(characterId);
  const [promoting, setPromoting] = useState(false);
  const item: RosterItem | undefined = snapshot?.roster.find((r) => r.promptKey === infoPromptKey);
  if (!item || !characterId) return null;
  const close = () => ui.updateSource(characterId, { infoPromptKey: null });
  const custom = item.kind === "custom";
  return (
    <aside
      class="absolute top-3 right-3 left-3 z-40 mx-auto grid max-h-[calc(100%-1.5rem)] max-w-120 content-start gap-3 overflow-y-auto rounded-lg bg-popover p-4 shadow-2xl backdrop-blur-2xl"
      data-lorebook-info={custom ? undefined : item.promptKey}
      data-custom-character-info={custom ? item.promptKey : undefined}
    >
      <header class="flex items-start gap-2">
        <h2 class="min-w-0 flex-1 text-sm font-extrabold">{item.title}</h2>
        {custom && item.origin === "ai-auto" ? <span class="rounded-full bg-primary/18 px-1.5 py-0.5 text-3xs font-bold text-primary">{L.aiGenerated}</span> : null}
        <IconButton label={custom ? L.closeCustomInfo : L.closeLorebookInfo} title={L.close} size="sm" className="w-7 px-0" onClick={close}><XIcon /></IconButton>
      </header>
      {custom && item.origin === "ai-auto" ? (
        <Button size="sm" variant="subtle" className="w-fit" disabled={promoting} onClick={async () => {
          setPromoting(true);
          try {
            await app.mutateWorkspace("customCharacters.promote", { characterId, customIds: [item.selectionId] });
          } catch {
            /* toast */
          } finally {
            setPromoting(false);
          }
        }}>{promoting ? <SpinnerIcon /> : null}{L.promote}</Button>
      ) : null}
      {custom ? (
        <>
          <div class="grid gap-1">
            <span class="text-2xs font-bold text-muted-foreground">{L.recognitionKeys}</span>
            <div class="flex flex-wrap gap-1">{item.recognitionKeys.map((key) => <span key={key} class="rounded-full bg-secondary px-2 py-0.5 text-2xs">{key}</span>)}</div>
          </div>
          {item.content ? <div class="grid gap-1"><span class="text-2xs font-bold text-muted-foreground">{L.appearance}</span><p class="text-xs leading-relaxed whitespace-pre-wrap">{item.content}</p></div> : null}
        </>
      ) : (
        <>
          {item.keys.length ? <p class="text-2xs text-muted-foreground"><strong class="font-bold">{L.keys}</strong> {item.keys.join(", ")}</p> : null}
          <p class="text-xs leading-relaxed whitespace-pre-wrap">{item.content || L.noContent}</p>
        </>
      )}
    </aside>
  );
}
