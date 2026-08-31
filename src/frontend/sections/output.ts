import { INLAY_IMAGE_ASPECT_PRESETS } from "../../shared/config.js";
import { outputSummary } from "../view-model.js";
import type { SectionContext } from "./section-context.js";

export function renderOutputSection({ ui, config }: SectionContext): void {
  const section = ui.section("Image output", false, {
    description: "Set the in-chat frame shape, height, crop, and output filtering.",
    badge: outputSummary(config)
  });
  ui.addSelect(section, "inlayImageAspect", "Aspect ratio", INLAY_IMAGE_ASPECT_PRESETS,
    "The shape of the in-chat image frame. Generated images are cropped to fill it (object-fit: cover).");
  ui.addNumber(section, "inlayImageMaxHeightVh", "Maximum height", 10, 100,
    "Viewport-height cap. The frame keeps the selected aspect ratio and fits the chat column.");
  ui.addTextarea(section, "ignoredTags", "Ignored tags", "Separate tags with commas or semicolons.");
}
