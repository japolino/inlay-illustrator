import { generationSummary } from "../view-model.js";
import type { SectionContext } from "./section-context.js";

export function renderGenerationSection({ ui, config, rerender }: SectionContext): void {
  const section = ui.section("Generation", true, {
    description: "Choose when and how many illustrations are created.",
    badge: generationSummary(config)
  });
  ui.addSwitch(
    section,
    "autoGenerate",
    "Auto generate",
    "Automatically illustrate completed assistant messages. You can always use Generate latest above."
  );
  ui.addSwitch(
    section,
    "coverImageEnabled",
    "Cover image",
    "Generate one additional cinematic key visual for the whole message and place it above the first paragraph.",
    rerender
  );
  if (config.coverImageEnabled) {
    ui.addNumber(section, "coverImageWidth", "Cover image width", 120, 2400);
    ui.addNumber(section, "coverImageMaxHeightVh", "Cover image max height (vh)", 10, 100);
  }
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
    { value: "dynamic", label: "Dynamic" },
    { value: "asset", label: "Asset" }
  ], config.adaptiveMode, config.adaptiveMode
    ? "Selected independently by the parser for each image from Creative, Static, or Dynamic. Adaptive never selects Asset."
    : config.perspectiveMode === "asset"
      ? "One reusable viewer-facing character asset per selected paragraph on a simple white background."
      : "Creative explores identity-safe objects, environments, shadows, silhouettes, and non-identifying fragments; Static uses fixed visual-novel framing; Dynamic follows scene action.", rerender);
  ui.addNumber(section, "minImages", "Minimum images", 1, 12);
  ui.addNumber(section, "maxImages", "Maximum images", 1, 12);
  if (config.perspectiveMode !== "asset" || config.adaptiveMode) {
    ui.addNumber(section, "maxCharacters", "Maximum characters", 1, 8);
  }
}
