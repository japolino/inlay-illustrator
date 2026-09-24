import { parserSummary } from "../view-model.js";
import type { SectionContext } from "./section-context.js";

export function renderParserSection({ ui, config, parserConnections, actions, rerender }: SectionContext): void {
  const section = ui.section("Parser and context", false, {
    description: "Configure the Lightboard 4.5.3 parser and its context sources.",
    badge: parserSummary(config, parserConnections)
  });

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
    "0 keeps the provider default output budget. Explicit max_tokens or max_completion_tokens in Parser parameters takes precedence."
  );

  ui.addSummary(section, "Lightboard 4.5.3 returns slot-based TOON descriptors. Saved 3.7.6 images remain available in the gallery and lightbox.");
  ui.addNumber(section, "includeMinMessages", "Prior context messages", 0, 32, "Previous turns included in the parser request.");
  ui.addNumber(section, "includeMaxMessages", "Maximum context messages", 0, 32, "Upper limit on prior turns included in the request.");
  ui.addSwitch(section, "includeUserMessage", "Include user messages", "Include user turns in prior context.");
  ui.addNumber(section, "parserRetries", "Parser retries", 0, 5, "Send the previous response and validation error back for correction, preserving its data.");
  ui.addSubtitle(section, "Source prompt options");
  ui.addSwitch(section, "nsfwInstructions", "NSFW prompts", "Enable the original Lightboard NSFW prompt instructions.");
  ui.addSelect(section, "lightboardJailbreak", "Jailbreak method", [
    { value: "none", label: "None" },
    { value: "memoir", label: "Memoir (Freya)" },
    { value: "authority", label: "Authority" }
  ], "Original 4.5.3 methods and prefills. Memoir ends with a user turn; Authority ends with an assistant prefill and needs a compatible provider.");
  ui.addSelect(section, "lightboardThoughts", "Planning assistance", [
    { value: "draft", label: "Write draft, then remove" },
    { value: "internal", label: "Internal guide" },
    { value: "off", label: "Off" }
  ], "Original scene-planning checklist. Provider reasoning settings are inherited from the parser connection.");
  ui.addSwitch(section, "lightboardForcedInsertion", "Tag splitting", "Original tag-obfuscation option. Restores split tags before image generation. The source recommends Internal guide with this option.");
  ui.addSwitch(section, "lightboardJapanese", "Japanese output", "Original Japanese prompt-output option; field names remain unchanged.");
  ui.addNumber(section, "lightboardReiterations", "Refinement passes", 0, 10, "Original multi-turn review before validation. Each pass makes another parser request.");
  ui.addSelect(section, "lightboardDescription", "Description detail", [
    { value: "high", label: "Tags and detailed prose" },
    { value: "low", label: "Tags and concise prose" },
    { value: "full", label: "Natural language" }
  ]);
  ui.addSelect(section, "lightboardAppearance", "Appearance instructions", [
    { value: "reference", label: "Use as a reference" },
    { value: "locked", label: "Preserve specified traits" },
    { value: "closed", label: "Only specified traits" }
  ]);
  ui.addNumber(section, "lightboardCamera", "Camera direction strength", 0, 2, "0: restrained, 1: stronger, 2: strongest source camera guidance.");
  ui.addText(section, "lightboardFocus", "Character focus", "Optional names to prioritize.");
  ui.addTextarea(section, "lightboardDirection", "Author direction", "Scene and composition requests for the parser.");

  ui.addSubtitle(section, "Context sources");
  ui.addSwitch(section, "includeUserInfo", "User info", "Include {{user}} persona in prompt generation.");
  ui.addSwitch(section, "includeCharacterInfo", "Character info", "Include {{char}} definition in prompt generation.");
  ui.addSwitch(section, "includeLorebook", "Lorebook", "Include active lorebook entries in prompt generation.");
  ui.addSwitch(
    section,
    "characterTagContextEnabled",
    "Character appearance continuity",
    "Pass recent Lightboard descriptors and saved appearance tags into the next request.",
    rerender
  );
  if (config.characterTagContextEnabled) {
    ui.addNumber(
      section,
      "characterContextDepth",
      "Character memory depth",
      0,
      1000,
      "Number of prior descriptor sets kept in parser context. Zero disables descriptor history."
    );
  }
  ui.addActions(section, [{ label: "Clear descriptor history for this chat", onClick: () => {
    const chatId = actions.activeChatId();
    if (!chatId) { actions.updateStatus("Open a chat first."); return; }
    actions.sendToBackend({ type: "clear_lightboard_history", chatId });
  } }]);
  ui.addSwitch(section, "userInstructionsEnabled", "Character-specific instructions", "Include extra image instructions stored on the character, chat, or persona. The parser override below is independent.");
  ui.addTextarea(section, "customParserInstructions", "Parser instructions override", "Additional instructions for prompt generation. Activated lb-xnai.lb.extra entries are also read when lorebook context is enabled.");
}
