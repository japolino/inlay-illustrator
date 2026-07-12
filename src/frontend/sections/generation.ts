import type { SectionContext } from "./section-context.js";

export function renderGenerationSection({ ui, actions }: SectionContext): void {
  const section = ui.section("Generation", true);
  ui.addSwitch(section, "enabled", "Power");
  ui.addSwitch(section, "autoGenerate", "Auto generate");
  ui.addSelect(section, "mode", "Mode", [
    { value: "illustration", label: "Illustration" },
    { value: "asset", label: "Asset" }
  ]);
  ui.addNumber(section, "minImages", "Minimum images", 1, 12);
  ui.addNumber(section, "maxImages", "Maximum images", 1, 12);
  ui.addNumber(section, "maxCharacters", "Maximum characters", 1, 8);
  ui.addActions(section, [{
    label: "Generate latest",
    primary: true,
    onClick: () => {
      actions.updateStatus("Generating...");
      actions.sendToBackend({ type: "generate_latest", chatId: actions.activeChatId() });
    }
  }]);
}
