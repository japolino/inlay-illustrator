import { renderDiagnosticsSection } from "./diagnostics.js";
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
  renderMemorySection(context);
  renderDiagnosticsSection(context);
}
