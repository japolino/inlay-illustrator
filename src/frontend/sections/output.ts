import { outputSummary } from "../view-model.js";
import type { SectionContext } from "./section-context.js";

export function renderOutputSection({ ui, config }: SectionContext): void {
  const section = ui.section("Image output", false, {
    description: "Set in-chat image dimensions and output filtering.",
    badge: outputSummary(config)
  });
  if (!config.adaptiveMode && config.perspectiveMode === "asset") {
    ui.addNumber(section, "assetImageWidth", "Asset width", 120, 2400);
  } else {
    ui.addNumber(section, "inlayImageWidth", "Illustration width", 120, 2400);
  }
  ui.addNumber(section, "inlayImageMaxHeightVh", "Maximum height", 10, 100, "Viewport height percentage.");
  ui.addTextarea(section, "ignoredTags", "Ignored tags", "Separate tags with commas or semicolons.");
}
