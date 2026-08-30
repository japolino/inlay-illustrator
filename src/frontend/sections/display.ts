import type { SectionContext } from "./section-context.js";
import { getDisplayMaxRaw, getDisplayMode, parseDisplayMax, setDisplayMax, setDisplayMode } from "../display-settings.js";

const DISPLAY_MODE_LABELS: Record<string, string> = {
  "0": "Floating",
  "1": "Top tab",
  "2": "Right tab",
  "3": "None"
};

export function renderDisplaySection({ ui, actions }: SectionContext): void {
  const section = ui.section("Display", false);

  const info = document.createElement("div");
  info.className = "inlay-parser-summary";
  info.textContent = "Per-chat button style for generated illustrations, plus the global fold cap for older chat illustrations.";
  section.append(info);

  ui.addSelect(section, "displayTheme", "Illustration theme", [
    { value: "0", label: "Dark" },
    { value: "1", label: "Light" }
  ], "Matches the original dark/light reroll-button chrome.");

  const chatId = actions.activeChatId();
  const activeMode = getDisplayMode(chatId);

  const modeRow = document.createElement("div");
  modeRow.className = "inlay-row";
  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Button display style";
  const modeControl = document.createElement("div");
  modeControl.className = "inlay-control";
  const modeButtons = document.createElement("div");
  modeButtons.className = "inlay-actions";
  for (const mode of ["0", "1", "2", "3"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${mode} · ${DISPLAY_MODE_LABELS[mode]}`;
    button.setAttribute("aria-label", `Display ${mode} (${DISPLAY_MODE_LABELS[mode]})`);
    button.setAttribute("aria-pressed", String(mode === activeMode));
    if (mode === activeMode) button.classList.add("inlay-primary");
    button.addEventListener("click", () => {
      const currentChat = actions.activeChatId();
      setDisplayMode(currentChat, mode);
      // Original alert: "✅ 인레이 디스플레이가 N 번으로 바뀌었습니다."
      // Changing the display mode never rerolls — it only re-renders.
      actions.updateStatus(`✅ 인레이 디스플레이가 ${mode} 번으로 바뀌었습니다.`);
      for (const sibling of modeButtons.querySelectorAll("button")) {
        sibling.classList.toggle("inlay-primary", sibling === button);
        sibling.setAttribute("aria-pressed", String(sibling === button));
      }
    });
    modeButtons.append(button);
  }
  modeControl.append(modeButtons);
  modeRow.append(modeLabel, modeControl);
  section.append(modeRow);

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
