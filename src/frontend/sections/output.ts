import type { SectionContext } from "./section-context.js";

export function renderOutputSection({ ui }: SectionContext): void {
  const section = ui.section("Image output", false);
  ui.addNumber(section, "inlayImageWidth", "Illustration width", 120, 2400);
  ui.addNumber(section, "assetImageWidth", "Asset width", 120, 2400);
  ui.addNumber(section, "inlayImageMaxHeightVh", "Maximum height", 10, 100, "Viewport height percentage.");
  ui.addTextarea(section, "ignoredTags", "Ignored tags", "Separate tags with commas or semicolons.");
}
