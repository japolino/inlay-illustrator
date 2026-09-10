import { FAB_CORNER_OPTIONS } from "../../shared/config.js";
import type { SectionContext } from "./section-context.js";

export function renderDisplaySection({ ui, actions }: SectionContext): void {
  const section = ui.section("Display", false, {
    description: "Floating action button placement and gallery actions."
  });

  ui.addSelect(
    section,
    "fabCorner",
    "Action button corner",
    FAB_CORNER_OPTIONS,
    "Corner of the chat screen anchoring the floating action button. Its menu opens toward the screen center."
  );

  ui.addActions(section, [
    {
      label: "Open Inlay gallery",
      primary: true,
      onClick: () => {
        actions.openGallery?.();
      }
    }
  ]);
}
