/**
 * Right-side editor pane routing (spec/ui.md §3.4, AM `Tl` titles 155851 and back button `Cc`/`jIt` 153190):
 * asset pickers, outfit list / outfit generation (character and persona).
 */
import { useMemo } from "preact/hooks";
import type { TabView } from "../workspace-ui.js";
import type { WorkspaceTab } from "../labels.js";
import { useWorkspaceCtx, type WorkspaceCtx } from "./context.js";
import { usePersonas } from "./data.js";
import { draftKeyForCharacter, draftKeyForPersona } from "./drafts.js";
import { GenerationDock, GenerationPanel } from "./generation.js";
import { GENERATION_LABELS, OUTFIT_LABELS, PICKER_LABELS } from "./labels/common.js";
import { PERSONA_LABELS } from "./labels/persona.js";
import { characterCollection, personaDisplayName, pickerKind, pickerPaneTitle } from "./model.js";
import { OutfitDock, OutfitPanel, type OutfitOwner } from "./outfits.js";
import { PickerDock, PickerPanel, usePickerDockExpanded } from "./picker.js";

/** Back from a picker (AM `Pc` 155542): return target `closed` closes the pane, else back to the outfit pane. */
function backFromPicker(ctx: WorkspaceCtx): void {
  const target = ctx.session.returnTarget;
  if (target === "closed") ctx.ui.closeSecondary(ctx.characterId);
  else ctx.ui.updateSource(ctx.characterId, { secondaryMode: "outfit", pickerTarget: null, secondaryOpen: true });
}

export function useSecondaryView(tab: WorkspaceTab, mobile: boolean): TabView["secondary"] {
  const ctx = useWorkspaceCtx();
  const { sourceUi, characterId, workspace, session, ui, sessions } = ctx;
  const { personas } = usePersonas(ctx.app, characterId);
  const pickerExpanded = usePickerDockExpanded();
  const promptKey = sourceUi.activePromptKey;
  const charSource = useMemo(() => characterCollection(workspace?.document, promptKey ?? ""), [workspace?.document, promptKey]);
  void mobile;
  if (!sourceUi.secondaryOpen || !characterId || !workspace) return null;
  const close = () => { sessions.closeGeneration(characterId); ui.closeSecondary(characterId); };

  // Unique tag search (Danbooru) is not part of the port: a stored "character-tags" pane shows nothing.
  if (sourceUi.secondaryMode === "character-tags") return null;

  if (sourceUi.secondaryMode === "asset-picker") {
    const target = sourceUi.pickerTarget;
    if (!target) return null;
    const kind = pickerKind(target);
    if (tab === "persona" && target.kind !== "persona") return null;
    return {
      title: pickerPaneTitle(kind),
      content: <PickerPanel target={target} />,
      dock: <PickerDock target={target} onDone={() => backFromPicker(ctx)} />,
      dockExpanded: pickerExpanded,
      back: session.returnTarget === "closed" ? { label: PICKER_LABELS.closeWorkspace, onClick: close } : { label: PICKER_LABELS.backPrevious, onClick: () => backFromPicker(ctx) }
    };
  }

  // Outfit pane (list or generation).
  let owner: OutfitOwner | null = null;
  let draftKey = "";
  let source = charSource;
  if (tab === "persona") {
    const list = personas ?? [];
    const index = list.findIndex((p) => p.personaId === sourceUi.activePersonaId);
    const persona = index >= 0 ? list[index]! : null;
    if (!persona) return null;
    owner = { kind: "persona", personaId: persona.personaId, name: personaDisplayName(persona, index), avatarUrl: persona.avatarUrl };
    draftKey = draftKeyForPersona(persona.personaId);
    source = persona.forms;
  } else {
    const row = workspace.roster.find((r) => r.promptKey === promptKey);
    if (!row || !promptKey) return null;
    owner = { kind: "character", promptKey, title: row.title, aiAuto: row.origin === "ai-auto" };
    draftKey = draftKeyForCharacter(characterId, promptKey);
  }
  const generation = session.generation;
  const generationMatches = !!generation && (owner.kind === "persona"
    ? generation.target.kind === "persona" && generation.target.personaId === owner.personaId
    : generation.target.kind === "character" && generation.target.promptKey === owner.promptKey);
  const props = { ctx, owner, draftKey, source };
  if (generationMatches) {
    return {
      title: owner.kind === "persona" ? PERSONA_LABELS.generationPaneTitle : GENERATION_LABELS.panelTitle,
      content: <GenerationPanel {...props} />,
      dock: <GenerationDock {...props} />,
      dockExpanded: generation!.historyExpanded && generation!.results.length > 0,
      back: { label: owner.kind === "persona" ? PERSONA_LABELS.backToList : GENERATION_LABELS.backToList, onClick: () => sessions.closeGeneration(characterId) }
    };
  }
  return {
    title: owner.kind === "persona" ? PERSONA_LABELS.outfitPaneTitle : OUTFIT_LABELS.panelTitle,
    content: <OutfitPanel {...props} />,
    dock: <OutfitDock {...props} />,
    back: { label: PICKER_LABELS.closeWorkspace, onClick: close }
  };
}
