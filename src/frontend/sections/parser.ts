import type { SectionContext } from "./section-context.js";

export function renderParserSection({ ui, config, parserConnections, actions }: SectionContext): void {
  const section = ui.section("Parser and context", false);

  // Parser engine — determines which connection main generation uses
  ui.addSelect(section, "parserEngine", "Parser engine", [
    { value: "axllm", label: "axLLM" },
    { value: "llm", label: "LLM" }
  ], "Main uses the chosen engine connection. Preprocessing uses its own mode below.");

  // Dual connection selectors — Spindle has no axLLM/LLM globals, so two independent connection IDs
  const parserOptions = parserConnections.map((connection) => ({
    value: connection.id,
    label: `${connection.name} (${connection.provider}${connection.model ? ` / ${connection.model}` : ""})`
  }));
  const axSelected = parserConnections.find((c) => c.id === (config as any).axllmParserConnectionId);
  const llmSelected = parserConnections.find((c) => c.id === (config as any).llmParserConnectionId);
  // Preserve missing-entry display
  if ((config as any).axllmParserConnectionId && !axSelected) {
    parserOptions.push({ value: (config as any).axllmParserConnectionId, label: `Missing: ${(config as any).axllmParserConnectionId}` });
  }
  if ((config as any).llmParserConnectionId && !llmSelected && (config as any).llmParserConnectionId !== (config as any).axllmParserConnectionId) {
    parserOptions.push({ value: (config as any).llmParserConnectionId, label: `Missing: ${(config as any).llmParserConnectionId}` });
  }
  ui.addSelect(
    section,
    "axllmParserConnectionId",
    "axLLM parser connection",
    parserOptions,
    axSelected ? `Selected: ${axSelected.name} / ${axSelected.provider}` : "Connection for axLLM engine. Missing selection errors rather than falling back."
  );
  ui.addSelect(
    section,
    "llmParserConnectionId",
    "LLM parser connection",
    parserOptions,
    llmSelected ? `Selected: ${llmSelected.name} / ${llmSelected.provider}` : "Connection for LLM engine. Missing selection errors rather than falling back."
  );

  ui.addSelect(section, "preprocessingMode", "Preprocessing mode", [
    { value: "off", label: "Off" },
    { value: "axllm", label: "axLLM" },
    { value: "llm", label: "LLM" }
  ], "Preprocessing independently uses chosen engine. Off falls back to numbered text.");

  ui.addSelect(section, "encodeMode", "Encode method", [
    { value: "0", label: "0 — None" },
    { value: "1", label: "1 — Base64" },
    { value: "2", label: "2 — Atbash" }
  ], "Original encode modes 0/1/2 only.");

  ui.addSwitch(section, "prefillEnabled", "Prefill", "Enable Card.Prefill.Prompt at absolute end (Spindle adapts unsupported roles narrowly).");
  ui.addNumber(section, "includeMinMessages", "Minimum context", 0, 32);
  ui.addNumber(section, "includeMaxMessages", "Maximum context", 0, 32);
  ui.addNumber(section, "parserRetries", "Parser retries", 0, 5);
  ui.addSubtitle(section, "Context sources");
  ui.addSwitch(section, "includeUserInfo", "User info");
  ui.addSwitch(section, "includeCharacterInfo", "Character info");
  ui.addSwitch(section, "includeLorebook", "Lorebook");
  ui.addSwitch(section, "characterTagContextEnabled", "Character tag context");
  ui.addTextarea(section, "customParserInstructions", "Parser override", "Custom instructions (trimmed, always included when non-empty).");
}
