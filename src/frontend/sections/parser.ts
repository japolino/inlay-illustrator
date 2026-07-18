import type { SectionContext } from "./section-context.js";

export function renderParserSection({ ui, config, parserConnections, actions }: SectionContext): void {
  const section = ui.section("Parser and context", false);
  const selectedParser = parserConnections.find((connection) => connection.id === config.parserConnectionId);
  const parserOptions = parserConnections.map((connection) => ({
    value: connection.id,
    label: `${connection.name} (${connection.provider}${connection.model ? ` / ${connection.model}` : ""})`
  }));
  if (config.parserConnectionId && !selectedParser) {
    parserOptions.push({ value: config.parserConnectionId, label: `Missing: ${config.parserConnectionId}` });
  }

  ui.addSelect(
    section,
    "parserConnectionId",
    "Parser connection",
    parserOptions,
    selectedParser
      ? `Selected: ${selectedParser.name} / ${selectedParser.provider}`
      : "Choose the model that turns chat text into image prompts."
  );
  ui.addText(
    section,
    "parserModel",
    "Parser model",
    selectedParser?.model ? `Leave empty to use ${selectedParser.model}.` : "Leave empty to use the connection default."
  );

  const parserParameterTarget = ui.row(section, "Parser parameters", "JSON parameters sent to the parser connection.");
  const parserParameterInput = document.createElement("textarea");
  parserParameterInput.value = JSON.stringify(config.parserParameters || {}, null, 2);
  parserParameterInput.spellcheck = false;
  parserParameterInput.addEventListener("change", () => {
    try {
      actions.patchConfig({ parserParameters: JSON.parse(parserParameterInput.value || "{}") as Record<string, unknown> });
    } catch {
      actions.updateStatus("Parser parameters must be valid JSON.");
    }
  });
  parserParameterTarget.append(parserParameterInput);

  ui.addSwitch(section, "preprocessingEnabled", "Illustration preprocessing");
  ui.addNumber(section, "includeMinMessages", "Minimum context", 0, 32);
  ui.addNumber(section, "includeMaxMessages", "Maximum context", 0, 32);
  ui.addNumber(section, "parserRetries", "Parser retries", 0, 5);
  ui.addSubtitle(section, "Context sources");
  ui.addSwitch(section, "includeUserInfo", "User info");
  ui.addSwitch(section, "includeCharacterInfo", "Character info");
  ui.addSwitch(section, "includeLorebook", "Lorebook");
  ui.addSwitch(
    section,
    "previousVisualStateEnabled",
    "Previous visual state",
    "Reuse the prior generated turn's character and environment tags when the current text does not replace them."
  );
  ui.addSwitch(section, "userInstructionsEnabled", "User instructions");
  ui.addTextarea(section, "customParserInstructions", "Parser override");
}
