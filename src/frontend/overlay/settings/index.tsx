/**
 * Settings area pages (Asset Maid settings, spec/ui.md §4). The shell renders the navigation; this module renders
 * the active page. Labels: ./labels.ts.
 */
import type { SettingsSection } from "../labels.js";
import { AnalysisProfilePage } from "./analysis-profile.js";
import { CharxSettingsPage } from "./charx.js";
import { ImageModelSettingsPage } from "./image-model.js";
import { LogsPage } from "./logs.js";
import { ModelSettingsPage } from "./model.js";
import { SystemSettingsPage } from "./system.js";

export type SettingsPageProps = {
  section: SettingsSection;
};

export { AnalyzerErrorNotices } from "./analyzer-errors.js";

/** The active settings page (keyed so drafts are dropped when the section changes, like Asset Maid). */
export function SettingsPage({ section }: SettingsPageProps) {
  switch (section) {
    case "analysis-profile":
      return <AnalysisProfilePage key={section} />;
    case "charx":
      return <CharxSettingsPage key={section} scope="charx" />;
    case "all-charx":
      return <CharxSettingsPage key={section} scope="all" />;
    case "model":
      return <ModelSettingsPage key={section} />;
    case "image-model":
      return <ImageModelSettingsPage key={section} />;
    case "system":
      return <SystemSettingsPage key={section} />;
    case "logs":
      return <LogsPage key={section} />;
    default:
      return null;
  }
}
