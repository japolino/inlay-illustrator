import type { SectionContext } from "./section-context.js";

export function renderGenerationSection({ ui, config, actions, rerender }: SectionContext): void {
  const section = ui.section("Generation", true);
  ui.addSwitch(section, "enabled", "Power");
  ui.addSwitch(section, "autoGenerate", "Auto generate");
  ui.addRangeChoice(section, "mode", "Mode", [
    { value: "illustration", label: "Illustration" },
    { value: "asset", label: "Asset" }
  ], false, config.mode === "asset"
    ? "One reusable character asset per selected paragraph on a simple white background."
    : "Faithful v3.5 narrative illustration generation.", rerender);
  ui.addNumber(section, "minImages", "Minimum images", 1, 12);
  ui.addNumber(section, "maxImages", "Maximum images", 1, 12);
  if (config.mode === "illustration") ui.addNumber(section, "maxCharacters", "Maximum characters", 1, 8);
  ui.addActions(section, [{
    label: "Generate latest",
    primary: true,
    onClick: () => {
      actions.updateStatus("Generating...");
      actions.sendToBackend({ type: "generate_latest", chatId: actions.activeChatId() });
    }
  }]);
}
