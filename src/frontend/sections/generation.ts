import type { SectionContext } from "./section-context.js";

export function renderGenerationSection({ ui, config, actions, rerender }: SectionContext): void {
  const section = ui.section("Generation", true);
  ui.addSwitch(section, "enabled", "Power");
  ui.addSwitch(section, "autoGenerate", "Auto generate");
  ui.addSwitch(
    section,
    "adaptiveMode",
    "Adaptive Mode",
    "Let the parser choose a balanced perspective mix, using Creative only for identity-safe details when appropriate.",
    rerender
  );
  ui.addRangeChoice(section, "perspectiveMode", "Perspective", [
    { value: "creative", label: "Creative" },
    { value: "static", label: "Static" },
    { value: "dynamic", label: "Dynamic" }
  ], config.adaptiveMode, config.adaptiveMode
    ? "Selected independently by the parser for each image."
    : "Creative explores identity-safe objects, environments, shadows, silhouettes, and non-identifying fragments; Static uses fixed visual-novel framing; Dynamic follows scene action.");
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
  }, {
    label: "Cancel generation",
    onClick: () => {
      actions.updateStatus("Requesting cancellation...");
      actions.sendToBackend({ type: "cancel_generation", chatId: actions.activeChatId() });
    }
  }]);
}
