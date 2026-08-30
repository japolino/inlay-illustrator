import type { SectionContext } from "./section-context.js";

export function renderPromptSection({ ui, config, actions, rerender }: SectionContext): void {
  const section = ui.section("Prompt output", false);
  ui.addSelect(section, "promptStyle", "Prompt style", [
    { value: "default", label: "Default" },
    { value: "anima", label: "Anima" }
  ], "", rerender);
  ui.addSelect(section, "promptSyntax", "Prompt syntax", [
    { value: "nai", label: "NovelAI" },
    { value: "comfyui", label: "ComfyUI" }
  ]);
  ui.addSwitch(section, "originalReference", "Source reference", "Include the original creation reference branch from v3.5.", rerender);
  if (config.originalReference) ui.addText(section, "originalCreationName", "Creation name");
  ui.addSwitch(section, "supplement", config.promptStyle === "anima" ? "Natural/shared detail" : "Natural supplement");
  ui.addSwitch(section, "quotesEnabled", "Image captions", "Ask the parser for one short source-relevant line per image.", rerender);
  if (config.quotesEnabled) {
    ui.addTextarea(section, "quoteInstructions", "Caption instructions", "Optional instructions that replace the original default quote guidance.");
  }
  ui.addText(section, "presetNumber", "Preset number (original dynamic preset: uses lorebook comment \uD504\uB9AC\uC14B N, fallback 1)");
  ui.addText(section, "imageRerollCount", "Image reroll count (1..8, used for multi-candidate reroll)");
  ui.addText(section, "customPositivePrefix", "Positive prefix (customPos front)");
  ui.addText(section, "customNegative", "Negative additions (customNeg appended to positive - original defect)");
}
