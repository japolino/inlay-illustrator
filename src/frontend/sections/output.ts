import type { SectionContext } from "./section-context.js";
import { INLAY_IMAGE_ASPECT_PRESETS } from "../../shared/config.js";

export function renderOutputSection({ ui }: SectionContext): void {
  const section = ui.section("Image output", false);
  ui.addSelect(section, "inlayImageAspect", "Aspect ratio", INLAY_IMAGE_ASPECT_PRESETS,
    "The shape of the in-chat image box. The generated image is cropped to fill it (object-fit: cover).");
  ui.addNumber(section, "inlayImageMaxHeightVh", "Maximum height", 10, 100,
    "Viewport-height cap. The box height never exceeds this; the aspect ratio sets its width, fitting the chat column.");
  ui.addTextarea(section, "ignoredTags", "Ignored tags", "Separate multiple tags with ;");
}