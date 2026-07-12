// src/shared/config.ts
var DEFAULT_CONFIG = {
  enabled: true,
  autoGenerate: true,
  debugLogging: true,
  mode: "illustration",
  parserConnectionId: null,
  parserModel: "",
  parserParameters: {},
  imageConnectionId: null,
  imageModel: "",
  imageParameters: {},
  minImages: 3,
  maxImages: 5,
  maxCharacters: 2,
  includeMinMessages: 0,
  includeMaxMessages: 8,
  parserRetries: 1,
  preprocessingEnabled: false,
  inlayImageWidth: 640,
  assetImageWidth: 400,
  inlayImageMaxHeightVh: 70,
  promptStyle: "anima",
  promptSyntax: "comfyui",
  includeUserInfo: true,
  includeCharacterInfo: true,
  includeLorebook: false,
  characterTagContextEnabled: true,
  userInstructionsEnabled: true,
  customParserInstructions: "",
  originalReference: false,
  originalCreationName: "",
  supplement: true,
  danbooruCleanup: false,
  danbooruEndpoint: "http://127.0.0.1:8000/tools/validate_tags",
  ignoredTags: "",
  customPositivePrefix: "",
  customPositiveSuffix: "",
  customNegative: "",
  promptPresets: [],
  activePromptPresetId: null
};
function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}
function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function cleanNullableString(value) {
  return cleanString(value) || null;
}
function cleanParameters(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalizePromptPresets(value) {
  if (!Array.isArray(value))
    return [];
  const seen = new Set;
  const presets = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      continue;
    const id = cleanString(candidate.id);
    const name = cleanString(candidate.name);
    if (!id || !name || seen.has(id))
      continue;
    seen.add(id);
    presets.push({
      id,
      name,
      positivePrefix: cleanString(candidate.positivePrefix),
      negativePrefix: cleanString(candidate.negativePrefix)
    });
  }
  return presets;
}
function normalizeConfig(raw) {
  const imageGeneration = raw.imageGeneration || {};
  const includeMin = clampInt(raw.includeMinMessages, 0, 32, DEFAULT_CONFIG.includeMinMessages);
  const includeMax = clampInt(raw.includeMaxMessages, 0, 32, DEFAULT_CONFIG.includeMaxMessages);
  const minImages = clampInt(raw.minImages, 1, 12, DEFAULT_CONFIG.minImages);
  const maxImages = clampInt(raw.maxImages, 1, 12, DEFAULT_CONFIG.maxImages);
  const promptPresets = normalizePromptPresets(raw.promptPresets);
  const activePromptPresetId = cleanNullableString(raw.activePromptPresetId);
  const parserParameters = cleanParameters(raw.parserParameters);
  const imageParameters = cleanParameters(raw.imageParameters);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    mode: raw.mode === "asset" ? "asset" : "illustration",
    parserConnectionId: cleanNullableString(raw.parserConnectionId) || cleanNullableString(imageGeneration.promptParserConnectionId),
    parserModel: cleanString(raw.parserModel) || cleanString(imageGeneration.promptParserModel),
    parserParameters: Object.keys(parserParameters).length > 0 ? parserParameters : cleanParameters(imageGeneration.promptParserParameters),
    imageConnectionId: cleanNullableString(raw.imageConnectionId) || cleanNullableString(imageGeneration.activeImageGenConnectionId),
    imageModel: cleanString(raw.imageModel) || cleanString(imageGeneration.model),
    imageParameters: Object.keys(imageParameters).length > 0 ? imageParameters : cleanParameters(imageGeneration.parameters),
    minImages: Math.min(minImages, maxImages),
    maxImages: Math.max(minImages, maxImages),
    maxCharacters: clampInt(raw.maxCharacters, 1, 8, DEFAULT_CONFIG.maxCharacters),
    includeMinMessages: Math.min(includeMin, includeMax),
    includeMaxMessages: Math.max(includeMin, includeMax),
    parserRetries: clampInt(raw.parserRetries, 0, 5, DEFAULT_CONFIG.parserRetries),
    preprocessingEnabled: raw.preprocessingEnabled === true,
    inlayImageWidth: clampInt(raw.inlayImageWidth, 120, 2400, DEFAULT_CONFIG.inlayImageWidth),
    assetImageWidth: clampInt(raw.assetImageWidth, 120, 2400, DEFAULT_CONFIG.assetImageWidth),
    inlayImageMaxHeightVh: clampInt(raw.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh),
    promptStyle: raw.promptStyle === "default" ? "default" : "anima",
    promptSyntax: raw.promptSyntax === "nai" ? "nai" : "comfyui",
    includeUserInfo: raw.includeUserInfo !== false,
    includeCharacterInfo: raw.includeCharacterInfo !== false,
    includeLorebook: raw.includeLorebook === true,
    characterTagContextEnabled: raw.characterTagContextEnabled !== false,
    userInstructionsEnabled: raw.userInstructionsEnabled !== false,
    customParserInstructions: cleanString(raw.customParserInstructions),
    ignoredTags: cleanString(raw.ignoredTags),
    customPositivePrefix: cleanString(raw.customPositivePrefix),
    customPositiveSuffix: cleanString(raw.customPositiveSuffix),
    customNegative: cleanString(raw.customNegative),
    promptPresets,
    activePromptPresetId: activePromptPresetId && promptPresets.some((preset) => preset.id === activePromptPresetId) ? activePromptPresetId : null
  };
}

// src/frontend/api.ts
var JSON_HEADERS = { Accept: "application/json" };
async function fetchImageGenerationSettings() {
  try {
    const response = await fetch("/api/v1/settings/imageGeneration", { headers: JSON_HEADERS });
    if (!response.ok)
      return null;
    const row = await response.json();
    return row.value || {};
  } catch {
    return null;
  }
}
async function fetchParserConnections() {
  try {
    const response = await fetch("/api/v1/connections?limit=100&offset=0", { headers: JSON_HEADERS });
    if (!response.ok)
      return [];
    const result = await response.json();
    const rows = Array.isArray(result) ? result : result.data || [];
    return rows.map((connection) => ({
      id: String(connection.id || ""),
      name: String(connection.name || ""),
      provider: String(connection.provider || ""),
      model: String(connection.model || "")
    })).filter((connection) => connection.id);
  } catch {
    return [];
  }
}

// src/frontend/constants.ts
var CLEANUP_KEY = "__inlayIllustratorCleanup";
var DRAWER_TAB_OPTIONS = {
  id: "inlay_illustrator",
  title: "Inlay Illustrator",
  shortName: "Inlay",
  headerTitle: "Inlay Illustrator",
  description: "Generate Inlay-style illustration batches from completed messages.",
  keywords: ["image", "illustration", "danbooru", "anima"],
  iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M21 16l-5-5L5 19"/></svg>'
};
var PANEL_STYLES = `
  .inlay-panel{width:100%;padding:12px;color:var(--lumiverse-text);display:flex;flex-direction:column;gap:10px;min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-sections,.inlay-section-host,.inlay-section-body,.inlay-row,.inlay-control{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-section-host{width:100%;contain:inline-size;overflow-x:clip;overflow-y:visible}
  .inlay-section-body{display:flex;flex-direction:column;gap:10px;padding:4px 0}
  .inlay-row{display:grid;grid-template-columns:minmax(116px,.9fr) minmax(0,1.1fr);align-items:center;gap:8px;font-size:13px}
  .inlay-row>*{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-row label{color:var(--lumiverse-text-muted)}
  .inlay-select-control,.inlay-select-trigger,.inlay-native-select{width:100%;min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-row input,.inlay-row textarea,.inlay-row select{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:7px 9px;font:inherit}
  .inlay-row textarea{min-height:76px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
  .inlay-hint{grid-column:2;color:var(--lumiverse-text-muted);font-size:12px;line-height:1.35}
  .inlay-actions{display:flex;flex-wrap:wrap;gap:8px}
  .inlay-actions button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 10px;cursor:pointer;font:inherit}
  .inlay-actions button:hover{background:var(--lumiverse-fill-hover)}
  .inlay-primary{background:var(--lumiverse-primary)!important;color:var(--lumiverse-primary-contrast)!important;border-color:var(--lumiverse-primary)!important}
  .inlay-subtitle{font-size:13px;font-weight:600;margin:2px 0}
  .inlay-parser-summary{font-size:12px;color:var(--lumiverse-text-muted);line-height:1.4}
  .inlay-status{padding:9px 10px;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-fill-subtle);font-size:12px;color:var(--lumiverse-text-muted);white-space:pre-wrap;min-height:18px}
`;

// src/frontend/message-router.ts
function routeBackendMessage(message, getActiveChatId, actions) {
  if (message.type === "state" && message.config) {
    const parserConnections = message.parserConnections || [];
    actions.replaceState({
      config: { ...DEFAULT_CONFIG, ...message.config },
      parserConnections,
      characterAppearance: message.characterAppearance || {},
      status: "Ready"
    });
    if (parserConnections.length === 0)
      actions.refreshParserConnections();
    actions.applyImageGenerationDefaults();
    return;
  }
  if (message.type === "character_memory_updated") {
    if (message.chatId && message.chatId === getActiveChatId()) {
      actions.replaceCharacterMemory(message.characterAppearance || {}, "Character visual baseline updated.");
    }
    return;
  }
  if (message.type === "status") {
    let status = message.error ? `${message.status}: ${message.error}` : String(message.status || "Ready");
    if (message.record?.imageUrls) {
      status += `
${message.record.imageUrls.length} image(s) generated.`;
    }
    actions.updateStatus(status);
    return;
  }
  if (message.type === "danbooru_test") {
    actions.updateStatus(`Danbooru endpoint responded.
${JSON.stringify(message.result, null, 2).slice(0, 1000)}`);
  }
}

// src/frontend/sections/diagnostics.ts
function renderDiagnosticsSection({ ui, actions }) {
  const section = ui.section("Diagnostics", false);
  ui.addSwitch(section, "debugLogging", "Debug logging");
  ui.addSummary(section, "Status appears below this section and updates after parser, image, and endpoint operations.");
  ui.addActions(section, [{
    label: "Refresh state",
    onClick: () => {
      actions.updateStatus("Refreshing...");
      actions.requestState();
    }
  }]);
}

// src/frontend/sections/generation.ts
function renderGenerationSection({ ui, actions }) {
  const section = ui.section("Generation", true);
  ui.addSwitch(section, "enabled", "Power");
  ui.addSwitch(section, "autoGenerate", "Auto generate");
  ui.addSelect(section, "mode", "Mode", [
    { value: "illustration", label: "Illustration" },
    { value: "asset", label: "Asset" }
  ]);
  ui.addNumber(section, "minImages", "Minimum images", 1, 12);
  ui.addNumber(section, "maxImages", "Maximum images", 1, 12);
  ui.addNumber(section, "maxCharacters", "Maximum characters", 1, 8);
  ui.addActions(section, [{
    label: "Generate latest",
    primary: true,
    onClick: () => {
      actions.updateStatus("Generating...");
      actions.sendToBackend({ type: "generate_latest", chatId: actions.activeChatId() });
    }
  }]);
}

// src/frontend/sections/memory.ts
function createTextInput(ariaLabel, value = "", placeholder = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.ariaLabel = ariaLabel;
  input.value = value;
  input.placeholder = placeholder;
  return input;
}
function renderMemorySection({ ui, characterAppearance, actions }) {
  const section = ui.section("Character memory", true);
  ui.addSwitch(section, "characterTagContextEnabled", "Use character visual baseline");
  ui.addSubtitle(section, "Current-chat visual baseline");
  const entries = Object.entries(characterAppearance).filter(([name, tags]) => name.trim() && tags.trim()).sort(([left], [right]) => left.localeCompare(right));
  for (const [name, tags] of entries) {
    const nameInput = createTextInput("Character name", name);
    ui.row(section, "Character name").append(nameInput);
    const tagsInput = createTextInput("Character appearance tags", tags);
    ui.row(section, "Appearance tags").append(tagsInput);
    const actionTarget = ui.row(section, "");
    actionTarget.classList.add("inlay-actions");
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save";
    save.addEventListener("click", () => actions.sendToBackend({
      type: "character_tags_update",
      chatId: actions.activeChatId(),
      oldName: name,
      name: nameInput.value,
      tags: tagsInput.value
    }));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => actions.sendToBackend({
      type: "character_tags_delete",
      chatId: actions.activeChatId(),
      name
    }));
    actionTarget.append(save, remove);
  }
  if (entries.length === 0) {
    ui.addSummary(section, "No character baseline is saved for this chat yet.");
  }
  const newNameInput = createTextInput("New character name", "", "Name");
  ui.row(section, "Character name").append(newNameInput);
  const newTagsInput = createTextInput("New character appearance tags", "", "Appearance tags");
  ui.row(section, "Appearance tags").append(newTagsInput);
  const addTarget = ui.row(section, "");
  addTarget.classList.add("inlay-actions");
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "Add character";
  add.addEventListener("click", () => actions.sendToBackend({
    type: "character_tags_update",
    chatId: actions.activeChatId(),
    oldName: "",
    name: newNameInput.value,
    tags: newTagsInput.value
  }));
  addTarget.append(add);
}

// src/frontend/sections/output.ts
function renderOutputSection({ ui, actions }) {
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

// src/frontend/sections/parser.ts
function renderParserSection({ ui, config, parserConnections, actions }) {
  const section = ui.section("Parser and context", false);
  const selectedParser = parserConnections.find((connection) => connection.id === config.parserConnectionId);
  const parserOptions = parserConnections.map((connection) => ({
    value: connection.id,
    label: `${connection.name} (${connection.provider}${connection.model ? ` / ${connection.model}` : ""})`
  }));
  if (config.parserConnectionId && !selectedParser) {
    parserOptions.push({ value: config.parserConnectionId, label: `Missing: ${config.parserConnectionId}` });
  }
  ui.addSelect(section, "parserConnectionId", "Parser connection", parserOptions, selectedParser ? `Selected: ${selectedParser.name} / ${selectedParser.provider}` : "Choose the model that turns chat text into image prompts.");
  ui.addText(section, "parserModel", "Parser model", selectedParser?.model ? `Leave empty to use ${selectedParser.model}.` : "Leave empty to use the connection default.");
  const parserParameterTarget = ui.row(section, "Parser parameters", "JSON parameters sent to the parser connection.");
  const parserParameterInput = document.createElement("textarea");
  parserParameterInput.value = JSON.stringify(config.parserParameters || {}, null, 2);
  parserParameterInput.spellcheck = false;
  parserParameterInput.addEventListener("change", () => {
    try {
      actions.patchConfig({ parserParameters: JSON.parse(parserParameterInput.value || "{}") });
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
  ui.addSwitch(section, "userInstructionsEnabled", "User instructions");
  ui.addTextarea(section, "customParserInstructions", "Parser override");
}

// src/frontend/sections/prompt.ts
function createPresetId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function renderPromptSection({ ui, config, actions, rerender }) {
  const section = ui.section("Prompt output", false);
  ui.addSelect(section, "promptStyle", "Prompt style", [
    { value: "default", label: "Default" },
    { value: "anima", label: "Anima" }
  ]);
  ui.addSelect(section, "promptSyntax", "Prompt syntax", [
    { value: "nai", label: "NovelAI" },
    { value: "comfyui", label: "ComfyUI" }
  ]);
  ui.addSwitch(section, "originalReference", "Source reference");
  ui.addText(section, "originalCreationName", "Creation name");
  ui.addSwitch(section, "supplement", "Natural supplement");
  ui.addSubtitle(section, "Prompt presets");
  const selectedPreset = config.promptPresets.find((preset) => preset.id === config.activePromptPresetId) || null;
  const presetSelectTarget = ui.row(section, "Active preset", "Preset prefixes are inserted before the custom prompt fields below.");
  const presetSelect = document.createElement("select");
  presetSelect.className = "inlay-native-select";
  presetSelect.setAttribute("aria-label", "Active prompt preset");
  presetSelect.innerHTML = '<option value="">No preset</option>';
  for (const preset of config.promptPresets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    option.selected = preset.id === config.activePromptPresetId;
    presetSelect.append(option);
  }
  presetSelect.addEventListener("change", () => {
    actions.patchConfig({ activePromptPresetId: presetSelect.value || null });
    rerender();
  });
  presetSelectTarget.append(presetSelect);
  const presetNameTarget = ui.row(section, "Preset name", "Save a new preset or update the selected preset with these values.");
  const presetName = document.createElement("input");
  presetName.type = "text";
  presetName.value = selectedPreset?.name || "";
  presetName.placeholder = "e.g. Cinematic anime";
  presetName.setAttribute("aria-label", "Preset name");
  presetNameTarget.append(presetName);
  const presetPositiveTarget = ui.row(section, "Preset positive", "Tags placed before the custom positive prefix and generated prompt.");
  const presetPositive = document.createElement("textarea");
  presetPositive.value = selectedPreset?.positivePrefix || "";
  presetPositive.placeholder = "masterpiece, best quality";
  presetPositive.setAttribute("aria-label", "Preset positive prefix");
  presetPositiveTarget.append(presetPositive);
  const presetNegativeTarget = ui.row(section, "Preset negative", "Tags placed before the custom negative additions and shot negatives.");
  const presetNegative = document.createElement("textarea");
  presetNegative.value = selectedPreset?.negativePrefix || "";
  presetNegative.placeholder = "lowres, bad anatomy";
  presetNegative.setAttribute("aria-label", "Preset negative prefix");
  presetNegativeTarget.append(presetNegative);
  const readPresetValues = (forNew = false) => {
    const name = presetName.value.trim();
    if (!name) {
      actions.updateStatus("A preset name is required.");
      return null;
    }
    const duplicate = config.promptPresets.find((preset) => preset.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0 && (forNew || preset.id !== selectedPreset?.id));
    if (duplicate) {
      actions.updateStatus(`A preset named "${name}" already exists.`);
      return null;
    }
    return {
      id: forNew ? createPresetId() : selectedPreset?.id || createPresetId(),
      name,
      positivePrefix: presetPositive.value.trim(),
      negativePrefix: presetNegative.value.trim()
    };
  };
  ui.addActions(section, [
    {
      label: "Save new",
      primary: true,
      onClick: () => {
        const next = readPresetValues(true);
        if (!next)
          return;
        actions.patchConfig({ promptPresets: [...config.promptPresets, next], activePromptPresetId: next.id });
        actions.updateStatus(`Saved preset "${next.name}".`);
        rerender();
      }
    },
    {
      label: "Update selected",
      onClick: () => {
        if (!selectedPreset) {
          actions.updateStatus("Select a preset to update.");
          return;
        }
        const next = readPresetValues();
        if (!next)
          return;
        actions.patchConfig({
          promptPresets: config.promptPresets.map((preset) => preset.id === selectedPreset.id ? next : preset)
        });
        actions.updateStatus(`Updated preset "${next.name}".`);
        rerender();
      }
    },
    {
      label: "Rename",
      onClick: () => {
        if (!selectedPreset) {
          actions.updateStatus("Select a preset to rename.");
          return;
        }
        const name = presetName.value.trim();
        if (!name) {
          actions.updateStatus("A preset name is required.");
          return;
        }
        const duplicate = config.promptPresets.find((preset) => preset.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0 && preset.id !== selectedPreset.id);
        if (duplicate) {
          actions.updateStatus(`A preset named "${name}" already exists.`);
          return;
        }
        actions.patchConfig({
          promptPresets: config.promptPresets.map((preset) => preset.id === selectedPreset.id ? { ...preset, name } : preset)
        });
        actions.updateStatus(`Renamed preset to "${name}".`);
        rerender();
      }
    },
    {
      label: "Delete",
      onClick: () => {
        if (!selectedPreset) {
          actions.updateStatus("Select a preset to delete.");
          return;
        }
        actions.patchConfig({
          promptPresets: config.promptPresets.filter((preset) => preset.id !== selectedPreset.id),
          activePromptPresetId: null
        });
        actions.updateStatus(`Deleted preset "${selectedPreset.name}".`);
        rerender();
      }
    }
  ]);
  ui.addText(section, "customPositivePrefix", "Positive prefix");
  ui.addText(section, "customPositiveSuffix", "Positive suffix");
  ui.addText(section, "customNegative", "Negative additions");
}

// src/frontend/sections/index.ts
function renderSettingsSections(context) {
  renderGenerationSection(context);
  renderParserSection(context);
  renderPromptSection(context);
  renderOutputSection(context);
  renderMemorySection(context);
  renderDiagnosticsSection(context);
}

// src/frontend/ui-builder.ts
class UiBuilder {
  ctx;
  sections;
  config;
  patchConfig;
  track;
  constructor(ctx, sections, config, patchConfig, track) {
    this.ctx = ctx;
    this.sections = sections;
    this.config = config;
    this.patchConfig = patchConfig;
    this.track = track;
  }
  section(title, defaultExpanded) {
    const host = document.createElement("div");
    host.className = "inlay-section-host";
    this.sections.append(host);
    const component = this.ctx.components.mountCollapsibleSection(host, { title, defaultExpanded });
    this.track(component);
    component.body.classList.add("inlay-section-body");
    return component.body;
  }
  row(parent, label, hint = "") {
    const wrapper = document.createElement("div");
    wrapper.className = "inlay-row";
    const labelNode = document.createElement("label");
    labelNode.textContent = label;
    const target = document.createElement("div");
    target.className = "inlay-control";
    wrapper.append(labelNode, target);
    if (hint) {
      const hintNode = document.createElement("div");
      hintNode.className = "inlay-hint";
      hintNode.textContent = hint;
      wrapper.append(hintNode);
    }
    parent.append(wrapper);
    return target;
  }
  addSwitch(parent, key, label, hint = "") {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountSwitch(target, {
      checked: Boolean(this.config[key]),
      ariaLabel: label,
      onChange: (checked) => this.patchConfig({ [key]: checked })
    }));
  }
  addNumber(parent, key, label, min, max, hint = "") {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountNumericInput(target, {
      value: Number(this.config[key]),
      min,
      max,
      integer: true,
      onChange: (value) => {
        if (value !== null)
          this.patchConfig({ [key]: value });
      }
    }));
  }
  addSelect(parent, key, label, options, hint = "") {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountSelect(target, {
      value: String(this.config[key] || ""),
      options,
      className: "inlay-select-control",
      triggerClassName: "inlay-select-trigger",
      portal: true,
      onChange: (value) => this.patchConfig({ [key]: value })
    }));
  }
  addText(parent, key, label, hint = "") {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountTextInput(target, {
      value: String(this.config[key] || ""),
      ariaLabel: label,
      onChange: (value) => this.patchConfig({ [key]: value })
    }));
  }
  addTextarea(parent, key, label, hint = "") {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountTextArea(target, {
      value: String(this.config[key] || ""),
      ariaLabel: label,
      onChange: (value) => this.patchConfig({ [key]: value })
    }));
  }
  addActions(parent, actions) {
    const container = document.createElement("div");
    container.className = "inlay-actions";
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      if (action.primary)
        button.classList.add("inlay-primary");
      button.addEventListener("click", action.onClick);
      container.append(button);
    }
    parent.append(container);
  }
  addSubtitle(parent, text) {
    const subtitle = document.createElement("div");
    subtitle.className = "inlay-subtitle";
    subtitle.textContent = text;
    parent.append(subtitle);
  }
  addSummary(parent, text) {
    const summary = document.createElement("div");
    summary.className = "inlay-parser-summary";
    summary.textContent = text;
    parent.append(summary);
  }
}

// src/frontend/renderer.ts
class SettingsRenderer {
  ctx;
  root;
  getSnapshot;
  actions;
  mountedComponents = [];
  constructor(ctx, root, getSnapshot, actions) {
    this.ctx = ctx;
    this.root = root;
    this.getSnapshot = getSnapshot;
    this.actions = actions;
  }
  render() {
    this.destroyMountedComponents();
    this.root.innerHTML = '<div class="inlay-panel"><div class="inlay-sections"></div><div class="inlay-status"></div></div>';
    const sections = this.root.querySelector(".inlay-sections");
    const statusNode = this.root.querySelector(".inlay-status");
    const snapshot = this.getSnapshot();
    statusNode.textContent = snapshot.status;
    const ui = new UiBuilder(this.ctx, sections, snapshot.config, this.actions.patchConfig, (component) => this.mountedComponents.push(component));
    renderSettingsSections({
      ui,
      config: snapshot.config,
      parserConnections: snapshot.parserConnections,
      characterAppearance: snapshot.characterAppearance,
      actions: this.actions,
      rerender: () => this.render()
    });
  }
  destroy() {
    this.destroyMountedComponents();
  }
  destroyMountedComponents() {
    for (const component of this.mountedComponents)
      component.destroy();
    this.mountedComponents = [];
  }
}

// src/frontend.ts
function setup(ctx) {
  const previousCleanup = globalThis[CLEANUP_KEY];
  if (typeof previousCleanup === "function")
    previousCleanup();
  let config = { ...DEFAULT_CONFIG };
  let parserConnections = [];
  let characterAppearance = {};
  let status = "Loading...";
  let triedImageGenerationParserDefault = false;
  let drawerWasActive = false;
  const tab = ctx.ui.registerDrawerTab(DRAWER_TAB_OPTIONS);
  const removeStyle = ctx.dom.addStyle(PANEL_STYLES);
  function activeChatId() {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }
  function requestState(chatId = activeChatId()) {
    ctx.sendToBackend({ type: "get_state", chatId });
  }
  function updateStatus(next) {
    status = next;
    const node = tab.root.querySelector(".inlay-status");
    if (node)
      node.textContent = status;
  }
  function patchConfig(patch) {
    config = { ...config, ...patch };
    ctx.sendToBackend({ type: "set_config", patch, chatId: activeChatId() });
  }
  const actions = {
    activeChatId,
    patchConfig,
    requestState: () => requestState(),
    sendToBackend: (payload) => ctx.sendToBackend(payload),
    updateStatus
  };
  const renderer = new SettingsRenderer(ctx, tab.root, () => ({ config, parserConnections, characterAppearance, status }), actions);
  async function applyImageGenerationDefaults() {
    if (triedImageGenerationParserDefault)
      return;
    triedImageGenerationParserDefault = true;
    try {
      const imageGeneration = await fetchImageGenerationSettings();
      if (!imageGeneration)
        return;
      const patch = {};
      if (!config.parserConnectionId && imageGeneration.promptParserConnectionId) {
        patch.parserConnectionId = imageGeneration.promptParserConnectionId;
        patch.parserModel = imageGeneration.promptParserModel || "";
        patch.parserParameters = imageGeneration.promptParserParameters || {};
      }
      if (imageGeneration.activeImageGenConnectionId) {
        patch.imageConnectionId = imageGeneration.activeImageGenConnectionId;
        patch.imageModel = imageGeneration.model || "";
        patch.imageParameters = imageGeneration.parameters || {};
      }
      if (Object.keys(patch).length > 0)
        patchConfig(patch);
    } catch {}
  }
  async function refreshParserConnectionsFromApi() {
    try {
      const next = await fetchParserConnections();
      if (next.length === 0)
        return;
      const seen = new Set(parserConnections.map((connection) => connection.id));
      parserConnections = [...parserConnections, ...next.filter((connection) => !seen.has(connection.id))];
      renderer.render();
    } catch {}
  }
  const unsub = ctx.onBackendMessage((payload) => {
    routeBackendMessage(payload, activeChatId, {
      replaceState: (next) => {
        config = next.config;
        parserConnections = next.parserConnections;
        characterAppearance = next.characterAppearance;
        status = next.status;
        renderer.render();
      },
      replaceCharacterMemory: (nextAppearance, nextStatus) => {
        characterAppearance = nextAppearance;
        status = nextStatus;
        renderer.render();
      },
      updateStatus,
      refreshParserConnections: () => {
        refreshParserConnectionsFromApi();
      },
      applyImageGenerationDefaults: () => {
        applyImageGenerationDefaults();
      }
    });
  });
  const unsubDrawer = ctx.ui.events.onDrawerChange((drawer) => {
    const active = drawer.open && drawer.tabId === tab.tabId;
    if (active && !drawerWasActive)
      requestState();
    drawerWasActive = active;
  });
  const unsubChatSwitched = ctx.events.on("CHAT_SWITCHED", (payload) => {
    const chatId = payload?.chatId;
    requestState(typeof chatId === "string" ? chatId : "");
  });
  renderer.render();
  requestState();
  ctx.ready();
  const cleanup = () => {
    unsub();
    unsubDrawer();
    unsubChatSwitched();
    renderer.destroy();
    removeStyle();
    tab.destroy();
    if (globalThis[CLEANUP_KEY] === cleanup) {
      delete globalThis[CLEANUP_KEY];
    }
  };
  globalThis[CLEANUP_KEY] = cleanup;
  return cleanup;
}
export {
  setup
};
