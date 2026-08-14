import type { SectionContext } from "./section-context.js";

export function renderDiagnosticsSection({ ui, actions }: SectionContext): void {
  const section = ui.section("Diagnostics", false, {
    description: "Inspect activity and refresh extension state.",
    badge: "Advanced"
  });
  ui.addSwitch(section, "debugLogging", "Debug logging", "Write detailed parser and image-stage events to the Lumiverse server log.");
  ui.addSummary(section, "Status appears below this section and updates after parser, image, and endpoint operations.");
  ui.addActions(section, [{
    label: "Refresh state",
    onClick: () => {
      actions.updateStatus("Refreshing...");
      actions.requestState();
    }
  }]);
}
