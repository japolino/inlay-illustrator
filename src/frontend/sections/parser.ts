import { parserSummary } from "../view-model.js";
import type { SectionContext } from "./section-context.js";

export function renderParserSection({ ui, config, parserConnections, actions, rerender }: SectionContext): void {
  const section = ui.section("Parser and context", false, {
    description: "Configure the sidecar model, bypass protocols, and continuity sources.",
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
    "0 uses the automatic model and parser-stage budget. Explicit max_tokens or max_completion_tokens in Parser parameters takes precedence."
  );

  ui.addSwitch(
    section,
    "preprocessingEnabled",
    "Illustration preprocessing",
    "Use auxiliary preprocessing for scene tagging extraction (V3.7.6 Card.Preprocessing)."
  );
  ui.addNumber(section, "includeMinMessages", "Minimum context messages", 0, 32, "Minimum prior turns included in context (V3.7.6 Card.IncludeMin).");
  ui.addNumber(section, "includeMaxMessages", "Maximum context messages", 0, 32, "Maximum prior turns included in context (V3.7.6 Card.Include).");
  ui.addSwitch(
    section,
    "includeUserMessage",
    "Include preceding user message",
    "Include one preceding user message per turn in context for non-impersonation accuracy (V3.7.6 Card.Userchat)."
  );
  ui.addSwitch(
    section,
    "nsfwInstructions",
    "NSFW instruction strength (🔞NSFW 지침 강화)",
    "Increases explicit interaction instruction intensity in the prompt generation system message (V3.7.6 Card.Nsfw). Note: This is an instruction-strength booster, NOT a safe-content filter."
  );
  ui.addNumber(
    section,
    "parserRetries",
    "Parser retries on refusal / error",
    0,
    5,
    "Number of retries when censorship refusal or format error is detected (V3.7.6 Card.Retry)."
  );

  ui.addSubtitle(section, "Bypass & encoding protocols (탈옥 / 암호화)");
  ui.addSelect(
    section,
    "encodingMode",
    "Refusal bypass encoding",
    [
      { value: "plain", label: "Standard / Plain (기본) - Plain text" },
      { value: "placeholder", label: "Placeholder Codes (단어 치환) - BP/SE body part codes" },
      { value: "base64", label: "Base64 Protocol (연구 프로토콜 암호화)" },
      { value: "atbash", label: "Atbash Cipher (A↔Z 단일 치환 암호)" }
    ],
    "Instruction and response encoding protocol to bypass LLM safety refusals (V3.7.6 Card.Encode)."
  );
  ui.addSwitch(
    section,
    "prefillEnabled",
    "Consensual adult prefill bypass",
    "Inject consensual adult roleplay confirmation prefill into parser prompt (V3.7.6 Card.Prefill)."
  );

  ui.addSubtitle(section, "Context sources");
  ui.addSwitch(section, "includeUserInfo", "User info", "Include {{user}} persona in prompt generation (V3.7.6 Card.UserInfo).");
  ui.addSwitch(section, "includeCharacterInfo", "Character info", "Include {{char}} definition in prompt generation (V3.7.6 Card.CharInfo).");
  ui.addSwitch(section, "includeLorebook", "Lorebook", "Include active lorebook entries in prompt generation (V3.7.6 Card.Lorebook).");
  ui.addSwitch(
    section,
    "characterTagContextEnabled",
    "Character appearance continuity",
    "Track and reuse character appearance tags across turns (V3.7.6 Card.CharAppearance.Context).",
    rerender
  );
  if (config.characterTagContextEnabled) {
    ui.addNumber(
      section,
      "characterContextDepth",
      "Character memory depth",
      0,
      1000,
      "Turns before an unseen character's detailed tags leave parser context. Saved tags are retained (V3.7.6 Card.CharAppearance.Depth, default: 5)."
    );
  }
  ui.addSwitch(section, "userInstructionsEnabled", "Character-specific instructions", "Include extra image instructions stored on the character, chat, or persona. The parser override below is independent.");
  ui.addTextarea(section, "customParserInstructions", "Parser instructions override", "Additional prompt instructions injected into prompt generation (V3.7.6 Card.CustomInst).");
}
