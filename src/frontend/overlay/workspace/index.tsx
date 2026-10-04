/**
 * Workspace tabs (assets / prompts / artists / persona) and their secondary panes (AM `GIt` routing
 * 155830-156605, spec/ui.md §2-§3). The shell (App.tsx) calls `useWorkspaceTabView` once per render
 * and places the returned slots (see `TabView` in ../workspace-ui.ts). Every hook here runs unconditionally;
 * tab bodies are components so switching tabs never changes the hook order.
 */
import { useEffect, useRef } from "preact/hooks";
import { useAppState } from "../../state/app-state.js";
import type { TabView, TabViewHook } from "../workspace-ui.js";
import { WORKSPACE_TABS } from "../labels.js";
import { AssetsContent, AssetsDock, AssetsHeaderEnd, useAssetsCount } from "./assets-tab.js";
import { ArtistsContent, ArtistsDock, artistsTitle } from "./artists-tab.js";
import { useWorkspaceCtx } from "./context.js";
import { usePersonas } from "./data.js";
import { AnalysisNotices } from "./notices.js";
import { PersonaContent, PersonaDock, PersonaHeaderEnd } from "./persona-tab.js";
import { PromptsContent, PromptsDock, PromptsHeaderEnd, usePromptsCount } from "./prompts-tab.js";
import { useSecondaryView } from "./secondary.js";

/** After a successful prompt / persona analysis on the Assets tab, switch to Prompts / Persona after 1.5 s (AM `Uo` 154814). */
function useAutoTabSwitch(): void {
  const ctx = useWorkspaceCtx();
  const jobs = useAppState((s) => s.analysisJobs);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const job of Object.values(jobs)) {
      if (!job.finishedAt || seen.current.has(job.jobId)) continue;
      seen.current.add(job.jobId);
      if (job.status !== "success" || job.characterId !== ctx.characterId) continue;
      if (job.kind !== "character-prompts" && job.kind !== "persona") continue;
      if (Date.now() - job.finishedAt > 5000) continue;
      const characterId = ctx.characterId;
      const tab = job.kind === "persona" ? "persona" : "prompts";
      setTimeout(() => {
        if (ctx.app.state.selectedCharacterId !== characterId || ctx.ui.source(characterId).activeTab !== "assets") return;
        ctx.ui.updateSource(characterId, (s) => ({ activeTab: tab, secondaryOpen: false, search: { ...s.search, [tab === "persona" ? "persona" : "charx"]: "" } }));
      }, 1500);
    }
  }, [jobs]);
}

export const useWorkspaceTabView: TabViewHook = ({ tab, mobile }) => {
  const ctx = useWorkspaceCtx();
  const { personas } = usePersonas(ctx.app, ctx.characterId);
  const assetsCount = useAssetsCount(ctx, personas?.length ?? 0);
  const promptsCount = usePromptsCount(ctx);
  const secondary = useSecondaryView(tab, mobile);
  useAutoTabSwitch();
  const definition = WORKSPACE_TABS.find((entry) => entry.id === tab)!;
  const notices = <AnalysisNotices />;
  const hasCharacter = !!ctx.characterId && !!ctx.workspace;
  const base: Pick<TabView, "secondary" | "notices"> = { secondary, notices };
  switch (tab) {
    case "assets":
      return { ...base, title: definition.label, count: assetsCount, headerEnd: <AssetsHeaderEnd />, layout: "standard", content: <AssetsContent />, dock: hasCharacter ? <AssetsDock /> : undefined };
    case "prompts":
      return { ...base, title: definition.label, count: promptsCount, headerEnd: <PromptsHeaderEnd />, layout: "character-grid", content: <PromptsContent />, dock: hasCharacter ? <PromptsDock /> : undefined };
    case "artists":
      return { ...base, title: artistsTitle(ctx.provider.anima), layout: "standard", content: <ArtistsContent />, dock: <ArtistsDock />, dockExpanded: ctx.session.artists.expanded };
    case "persona":
      return { ...base, title: definition.label, headerEnd: <PersonaHeaderEnd />, layout: "character-grid", content: <PersonaContent />, dock: <PersonaDock /> };
  }
};
