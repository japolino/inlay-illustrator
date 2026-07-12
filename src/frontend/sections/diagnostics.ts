import type { SectionContext } from "./section-context.js";

export function renderDiagnosticsSection({ ui, actions }: SectionContext): void {
  const section = ui.section("Diagnostics", false);
  ui.addSwitch(section, "debugLogging", "Debug logging");
  ui.addSummary(section, "Status appears below this section and updates after parser, image, and endpoint operations.");
  ui.addActions(section, [{
    label: "Refresh state",
    onClick: () => {
      actions.updateStatus("Refreshing...");
      actions.requestState();
    }
  }]);
}
