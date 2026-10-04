/**
 * Workspace tabs (assets / prompts / artists / persona) and their secondary panes.
 * Owner: workspace-tabs sub-agent. The shell (App.tsx) calls `useWorkspaceTabView` once per render
 * and places the returned slots (see `TabView` in ../workspace-ui.ts).
 */
import { Placeholder } from "../placeholder.js";
import { WORKSPACE_TABS } from "../labels.js";
import type { TabViewHook } from "../workspace-ui.js";

export const useWorkspaceTabView: TabViewHook = ({ tab }) => {
  const definition = WORKSPACE_TABS.find((entry) => entry.id === tab)!;
  return {
    title: definition.label,
    layout: "standard",
    content: <Placeholder>{definition.description}</Placeholder>
  };
};
