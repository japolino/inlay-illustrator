import { parserSummary } from "../view-model.js";
import type { SectionContext } from "./section-context.js";

export function renderParserSection({ ui, config, parserConnections, actions, rerender }: SectionContext): void {
  const section = ui.section("Parser and context", false, {
    description: "Configure the sidecar model and continuity sources.",
    badge: parserSummary(config, parserConnections)
  });
  ui.addSwitch(
    section,
    "fastMode",
    "Fast mode",
    "Use a compact single-pass sidecar with reduced context. Skips lorebook, history, shot routing, Creative ideation, and remote camera repair. Keeps your configured image count but may reduce prompt detail, continuity, and shot variety.",
    rerender
  );

  const selectedParser = parserConnections.find((connection) => connection.id === config.parserConnectionId);
  if (parserConnections.length === 0) {
    ui.addNotice(section, "No parser connections are available. Add a connection in Lumiverse, then refresh state.", "warning");
  }

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

  const parserParameterTarget = ui.row(section, "Parser parameters", "JSON parameters sent to the parser connection.", true);
  parserParameterTarget.classList.add("inlay-json-field");
  const parserParameterInput = document.createElement("textarea");
  parserParameterInput.value = JSON.stringify(config.parserParameters || {}, null, 2);
  parserParameterInput.spellcheck = false;
  parserParameterInput.setAttribute("aria-label", "Parser parameters JSON");
  const parserParameterValidation = document.createElement("div");
  parserParameterValidation.className = "inlay-field-message";
  const validateParameters = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(parserParameterInput.value || "{}") as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected an object");
      parserParameterInput.setAttribute("aria-invalid", "false");
      parserParameterValidation.dataset.tone = "success";
      parserParameterValidation.textContent = "Valid JSON object";
      return parsed as Record<string, unknown>;
    } catch {
      parserParameterInput.setAttribute("aria-invalid", "true");
      parserParameterValidation.dataset.tone = "error";
      parserParameterValidation.textContent = "Enter a valid JSON object before leaving this field.";
      return null;
    }
  };
  parserParameterInput.addEventListener("input", validateParameters);
  parserParameterInput.addEventListener("change", () => {
    const parsed = validateParameters();
    if (parsed) actions.patchConfig({ parserParameters: parsed });
    else actions.updateStatus("Parser parameters must be a valid JSON object.");
  });
  validateParameters();
  parserParameterTarget.append(parserParameterInput, parserParameterValidation);

  ui.addNumber(
    section,
    "parserMaxTokens",
    "Maximum token budget",
    0,
    32768,
    "0 uses the automatic model and parser-stage budget. Explicit max_tokens or max_completion_tokens in Parser parameters takes precedence."
  );

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
