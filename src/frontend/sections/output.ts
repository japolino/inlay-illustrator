import type { SectionContext } from "./section-context.js";

export function renderOutputSection({ ui, actions }: SectionContext): void {
  const section = ui.section("Image output and cleanup", false);
  ui.addNumber(section, "inlayImageWidth", "Illustration width", 120, 2400);
  ui.addNumber(section, "assetImageWidth", "Asset width", 120, 2400);
  ui.addNumber(section, "inlayImageMaxHeightVh", "Maximum height", 10, 100, "Viewport height percentage.");
  ui.addSwitch(section, "danbooruCleanup", "Danbooru cleanup");
  ui.addText(section, "danbooruEndpoint", "Danbooru endpoint");
  ui.addTextarea(section, "ignoredTags", "Ignored tags", "Separate tags with commas or semicolons.");
  ui.addActions(section, [{
    label: "Test endpoint",
    onClick: () => {
      actions.updateStatus("Testing Danbooru endpoint...");
      actions.sendToBackend({ type: "test_danbooru" });
    }
  }]);
}
