import { INLAY_IMAGE_ASPECT_PRESETS } from "../../shared/config.js";
import { outputSummary } from "../view-model.js";
import type { SectionContext } from "./section-context.js";

export function renderOutputSection({ ui, config }: SectionContext): void {
  const section = ui.section("Image output", false, {
    description: "Set the in-chat frame shape, height, crop, and output filtering.",
    badge: outputSummary(config)
  });
  ui.addSelect(section, "inlayImageAspect", "Aspect ratio", INLAY_IMAGE_ASPECT_PRESETS,
    "The shape of the in-chat image frame. Auto matches the generated image dimensions.");
  ui.addSelect(section, "coverImageAspect", "Key visual aspect ratio", INLAY_IMAGE_ASPECT_PRESETS);
  ui.addSelect(section, "coverImagePosition", "Key visual position", [
    { value: "top", label: "Above the message" }, { value: "bottom", label: "Below the message" }
  ]);
  ui.addSelect(section, "imageAlignment", "Image alignment", [
    { value: "center", label: "Center" }, { value: "left", label: "Left" }
  ]);
  ui.addNumber(section, "inlayImageMaxHeightVh", "Maximum height", 10, 100,
    "Viewport-height cap. The frame keeps the selected aspect ratio and fits the chat column.");
  ui.addTextarea(section, "ignoredTags", "Ignored tags", "Separate tags with commas or semicolons.");
}
