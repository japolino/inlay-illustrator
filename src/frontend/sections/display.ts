import type { SectionContext } from "./section-context.js";
import { getDisplayMaxRaw, parseDisplayMax, setDisplayMax } from "../display-settings.js";

export function renderDisplaySection({ ui, config, actions }: SectionContext): void {
  const section = ui.section("Display", false);

  const info = document.createElement("div");
  info.className = "inlay-parser-summary";
  info.textContent = "Floating action button placement and the global fold cap for older chat illustrations.";
  section.append(info);

  ui.addSelect(section, "fabCorner", "Action button corner", [
    { value: "bottom-right", label: "Bottom right" },
    { value: "bottom-left", label: "Bottom left" },
    { value: "top-right", label: "Top right" },
    { value: "top-left", label: "Top left" }
  ], "Corner of the chat screen anchoring the floating action button. Its menu opens toward the screen center.");

  const maxRow = document.createElement("div");
  maxRow.className = "inlay-row";
  const maxLabel = document.createElement("label");
  maxLabel.textContent = "Displayed illustrations";
  const maxControl = document.createElement("div");
  maxControl.className = "inlay-control";
  const maxInput = document.createElement("input");
  // The original Card.Display.Max control is a raw text field. Preserve its
  // value exactly and apply Lua tonumber parsing only when deciding to fold.
  maxInput.type = "text";
  maxInput.inputMode = "numeric";
  maxInput.value = getDisplayMaxRaw();
  maxInput.setAttribute("aria-label", "Displayed illustrations");
  maxInput.addEventListener("change", () => {
    const raw = maxInput.value;
    setDisplayMax(raw);
    actions.patchConfig({ displayMax: raw });
    const parsed = parseDisplayMax(raw);
    actions.updateStatus(parsed > 0 ? `Showing at most ${parsed} unfolded character messages.` : "Folding disabled (show all).");
  });
  maxControl.append(maxInput);
  const maxHint = document.createElement("div");
  maxHint.className = "inlay-hint";
  maxHint.textContent = "Collapse older chat illustrations (default: show all).";
  maxRow.append(maxLabel, maxControl, maxHint);
  section.append(maxRow);
}
