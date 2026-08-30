
import type { SectionContext } from "./section-context.js";

export function renderGallerySection({ ui, actions }: SectionContext): void {
  const section = ui.section("Inlay gallery", false);
  const info = document.createElement("div");
  info.className = "inlay-parser-summary";
  info.textContent = "Browse saved Inlay illustrations grouped by chat. Opens in a modal with pagination and lightbox actions.";
  section.append(info);

  const target = document.createElement("div");
  target.className = "inlay-actions";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Open Inlay gallery";
  button.setAttribute("aria-label", "Open Inlay gallery");
  button.className = "inlay-primary";
  button.addEventListener("click", () => {
    if (typeof actions.openGallery === "function") actions.openGallery();
  });
  target.append(button);
  section.append(target);
}
