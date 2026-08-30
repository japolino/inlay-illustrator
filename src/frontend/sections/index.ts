import { renderCaptionsSection } from "./captions.js";
import { renderDiagnosticsSection } from "./diagnostics.js";
import { renderDisplaySection } from "./display.js";
import { renderGallerySection } from "./gallery.js";
import { renderGenerationSection } from "./generation.js";
import { renderMemorySection } from "./memory.js";
import { renderOutputSection } from "./output.js";
import { renderParserSection } from "./parser.js";
import { renderPromptSection } from "./prompt.js";
import type { SectionContext } from "./section-context.js";

export function renderSettingsSections(context: SectionContext): void {
  renderGenerationSection(context);
  renderParserSection(context);
  renderPromptSection(context);
  renderOutputSection(context);
  renderDisplaySection(context);
  renderCaptionsSection(context);
  renderMemorySection(context);
  renderGallerySection(context);
  renderDiagnosticsSection(context);
}
