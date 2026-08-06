// src/shared/config.ts
var DEFAULT_CONFIG = {
  enabled: true,
  autoGenerate: true,
  debugLogging: false,
  coverImageEnabled: false,
  adaptiveMode: false,
  fastMode: false,
  perspectiveMode: "dynamic",
  parserConnectionId: null,
  parserModel: "",
  parserParameters: {},
  parserMaxTokens: 0,
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
  previousVisualStateEnabled: true,
  userInstructionsEnabled: true,
  customParserInstructions: "",
  originalReference: false,
  originalCreationName: "",
  supplement: true,
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
  const {
    danbooruCleanup: _legacyDanbooruCleanup,
    danbooruEndpoint: _legacyDanbooruEndpoint,
    mode: _legacyMode,
    imageGeneration: _legacyImageGeneration,
    ...current
  } = raw;
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
    ...current,
    coverImageEnabled: raw.coverImageEnabled === true,
    adaptiveMode: raw.adaptiveMode === true,
    fastMode: raw.fastMode === true,
    perspectiveMode: raw.perspectiveMode === "creative" || raw.perspectiveMode === "static" || raw.perspectiveMode === "dynamic" || raw.perspectiveMode === "asset" ? raw.perspectiveMode : raw.mode === "asset" ? "asset" : "dynamic",
    parserConnectionId: cleanNullableString(raw.parserConnectionId) || cleanNullableString(imageGeneration.promptParserConnectionId),
    parserModel: cleanString(raw.parserModel) || cleanString(imageGeneration.promptParserModel),
    parserParameters: Object.keys(parserParameters).length > 0 ? parserParameters : cleanParameters(imageGeneration.promptParserParameters),
    parserMaxTokens: clampInt(raw.parserMaxTokens, 0, 32768, DEFAULT_CONFIG.parserMaxTokens),
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
    previousVisualStateEnabled: raw.previousVisualStateEnabled !== false,
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
function effectiveGenerationConfig(config) {
  if (!config.fastMode)
    return config;
  return {
    ...config,
    preprocessingEnabled: false,
    parserRetries: 0,
    includeLorebook: false
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
  keywords: ["image", "illustration", "anima"],
  iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M21 16l-5-5L5 19"/></svg>'
};
var PANEL_STYLES = `
  .inlay-panel{width:100%;padding:12px;color:var(--lumiverse-text);display:flex;flex-direction:column;gap:10px;min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-sections,.inlay-section-host,.inlay-section-body,.inlay-row,.inlay-control{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-sections{display:flex;flex-direction:column;gap:8px}
  .inlay-section-host{width:100%;contain:inline-size;overflow:hidden;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle)}
  .inlay-section-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:10px 12px;border:0;background:transparent;color:var(--lumiverse-text);font:inherit;font-size:13px;font-weight:600;text-align:left;cursor:pointer}
  .inlay-section-toggle:hover{background:var(--lumiverse-fill-hover)}
  .inlay-section-toggle:focus-visible{outline:2px solid var(--lumiverse-primary);outline-offset:-2px}
  .inlay-section-chevron{flex:none;font-size:20px;line-height:1;transform:rotate(0deg);transition:transform .15s ease}
  .inlay-section-host[data-expanded="true"] .inlay-section-chevron{transform:rotate(90deg)}
  .inlay-section-body{display:flex;flex-direction:column;gap:10px;padding:4px 12px 12px}
  .inlay-section-body[hidden]{display:none}
  .inlay-row{display:grid;grid-template-columns:minmax(116px,.9fr) minmax(0,1.1fr);align-items:center;gap:8px;font-size:13px}
  .inlay-row>*{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-row label{color:var(--lumiverse-text-muted)}
  .inlay-select-control,.inlay-select-trigger,.inlay-native-select{width:100%;min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-row input,.inlay-row textarea,.inlay-row select{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:7px 9px;font:inherit}
  .inlay-row textarea{min-height:76px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
  .inlay-range-choice{display:flex;flex-direction:column;gap:4px;width:100%}
  .inlay-range-choice input[type="range"]{padding:0;border:0;background:transparent;accent-color:var(--lumiverse-accent)}
  .inlay-range-choice input[type="range"]:disabled{opacity:.55}
  .inlay-range-labels{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;color:var(--lumiverse-text-muted);font-size:11px;text-align:center}
  .inlay-range-labels span:first-child{text-align:left}.inlay-range-labels span:last-child{text-align:right}
  .inlay-range-labels .is-active{color:var(--lumiverse-text);font-weight:600}
  .inlay-hint{grid-column:2;color:var(--lumiverse-text-muted);font-size:12px;line-height:1.35}
  .inlay-actions{display:flex;flex-wrap:wrap;gap:8px}
  .inlay-actions button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 10px;cursor:pointer;font:inherit}
  .inlay-actions button:hover{background:var(--lumiverse-fill-hover)}
  .inlay-primary{background:var(--lumiverse-primary)!important;color:var(--lumiverse-primary-contrast)!important;border-color:var(--lumiverse-primary)!important}
  .inlay-subtitle{font-size:13px;font-weight:600;margin:2px 0}
  .inlay-parser-summary{font-size:12px;color:var(--lumiverse-text-muted);line-height:1.4}
  .inlay-status{padding:9px 10px;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-fill-subtle);font-size:12px;color:var(--lumiverse-text-muted);white-space:pre-wrap;min-height:18px}
  .inlay-illustrator-placeholder{box-sizing:border-box;margin:10px auto;width:min(100%,720px);padding:12px 14px;border:1px dashed currentColor;border-radius:8px;text-align:center;opacity:.72}
  .inlay-lightbox-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,420px);gap:16px;align-items:start;min-width:0}
  .inlay-lightbox-image{display:block;width:100%;height:auto;max-height:calc(100vh - 150px);object-fit:contain;border-radius:8px;background:#080808}
  .inlay-lightbox-prompt-panel{display:flex;flex-direction:column;min-width:0;max-height:calc(100vh - 150px);border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle);overflow:auto}
  .inlay-lightbox-prompt-panel h3{flex:none;margin:0;padding:12px 14px;border-bottom:1px solid var(--lumiverse-border);font-size:14px;color:var(--lumiverse-text)}
  .inlay-lightbox-meta{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 0}
  .inlay-lightbox-meta span{padding:4px 8px;border:1px solid var(--lumiverse-border);border-radius:999px;background:var(--lumiverse-fill);font-size:11px;color:var(--lumiverse-text-muted)}
  .inlay-lightbox-prompt-block{min-width:0;padding:12px 14px 0}
  .inlay-lightbox-prompt-block:last-child{padding-bottom:14px}
  .inlay-lightbox-prompt-block h4{margin:0 0 6px;font-size:12px;color:var(--lumiverse-text-muted)}
  .inlay-lightbox-prompt{min-height:80px;margin:0;padding:10px;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lumiverse-text)}
  .inlay-lightbox-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px}
  .inlay-lightbox-actions button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 10px;cursor:pointer;font:inherit}
  .inlay-lightbox-actions button:hover:not(:disabled){background:var(--lumiverse-fill-hover)}
  .inlay-lightbox-actions button:disabled{opacity:.55;cursor:wait}
  .inlay-lightbox-action-status{grid-column:1/-1;min-height:16px;color:var(--lumiverse-text-muted);font-size:11px;line-height:1.35}
  @media(max-width:800px){.inlay-lightbox-layout{grid-template-columns:1fr}.inlay-lightbox-image{max-height:55vh}.inlay-lightbox-prompt-panel{max-height:35vh}}
`;

// src/frontend/message-router.ts
function routeBackendMessage(message, getActiveChatId, actions) {
  if (message.type === "config_updated" && message.config) {
    if (message.chatId && message.chatId !== getActiveChatId())
      return;
    actions.replaceConfig({ ...DEFAULT_CONFIG, ...message.config });
    return;
  }
  if (message.type === "state" && message.config) {
    if (message.chatId && message.chatId !== getActiveChatId())
      return;
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
    if (message.chatId && message.chatId !== getActiveChatId())
      return;
    actions.replaceCharacterMemory(message.characterAppearance || {}, "Character visual baseline updated.");
    return;
  }
  if (message.type === "generation_progress" && message.stage) {
    if (message.chatId && message.chatId !== getActiveChatId())
      return;
    const labels = {
      queued: "Queued…",
      loading: "Loading chat context…",
      parsing: "Parsing illustration prompts…",
      preparing: "Preparing image jobs…",
      generating: message.total ? `Generating illustrations ${message.completed || 0}/${message.total}…` : "Generating illustrations…",
      persisting: "Saving illustrations…",
      completed: "Generation complete.",
      failed: "Generation failed.",
      cancelled: "Generation cancelled."
    };
    actions.updateStatus(message.detail ? `${labels[message.stage]}
${message.detail}` : labels[message.stage]);
    return;
  }
  if (message.type === "status") {
    if (message.chatId && message.chatId !== getActiveChatId())
      return;
    let status = message.error ? `${message.status}: ${message.error}` : String(message.status || "Ready");
    if (message.record?.imageUrls) {
      status += `
${message.record.imageUrls.filter(Boolean).length} image(s) generated.`;
    }
    actions.updateStatus(status);
    return;
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
function renderGenerationSection({ ui, config, actions, rerender }) {
  const section = ui.section("Generation", true);
  ui.addSwitch(section, "enabled", "Power");
  ui.addSwitch(section, "autoGenerate", "Auto generate");
  ui.addSwitch(section, "coverImageEnabled", "Cover image", "Generate one additional cinematic key visual for the whole message and place it above the first paragraph.");
  ui.addSwitch(section, "adaptiveMode", "Adaptive Mode", "Let the parser choose a balanced perspective mix, using Creative only for identity-safe details when appropriate.", rerender);
  ui.addRangeChoice(section, "perspectiveMode", "Perspective", [
    { value: "creative", label: "Creative" },
    { value: "static", label: "Static" },
    { value: "dynamic", label: "Dynamic" },
    { value: "asset", label: "Asset" }
  ], config.adaptiveMode, config.adaptiveMode ? "Selected independently by the parser for each image from Creative, Static, or Dynamic. Adaptive never selects Asset." : config.perspectiveMode === "asset" ? "One reusable viewer-facing character asset per selected paragraph on a simple white background." : "Creative explores identity-safe objects, environments, shadows, silhouettes, and non-identifying fragments; Static uses fixed visual-novel framing; Dynamic follows scene action.", rerender);
  ui.addNumber(section, "minImages", "Minimum images", 1, 12);
  ui.addNumber(section, "maxImages", "Maximum images", 1, 12);
  if (config.perspectiveMode !== "asset" || config.adaptiveMode) {
    ui.addNumber(section, "maxCharacters", "Maximum characters", 1, 8);
  }
  ui.addActions(section, [{
    label: "Generate latest",
    primary: true,
    onClick: () => {
      actions.updateStatus("Generating...");
      actions.sendToBackend({ type: "generate_latest", chatId: actions.activeChatId() });
    }
  }, {
    label: "Cancel generation",
    onClick: () => {
      actions.updateStatus("Requesting cancellation...");
      actions.sendToBackend({ type: "cancel_generation", chatId: actions.activeChatId() });
    }
  }]);
}

// src/frontend/sections/memory-actions.ts
function sendCharacterMemoryMutation(actions, mutation) {
  actions.updateStatus("Saving character baseline…");
  actions.sendToBackend({ ...mutation, chatId: actions.activeChatId() });
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
    save.addEventListener("click", () => sendCharacterMemoryMutation(actions, {
      type: "character_tags_update",
      oldName: name,
      name: nameInput.value,
      tags: tagsInput.value
    }));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => sendCharacterMemoryMutation(actions, {
      type: "character_tags_delete",
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
  add.addEventListener("click", () => sendCharacterMemoryMutation(actions, {
    type: "character_tags_update",
    oldName: "",
    name: newNameInput.value,
    tags: newTagsInput.value
  }));
  addTarget.append(add);
}

// src/frontend/sections/output.ts
function renderOutputSection({ ui, config }) {
  const section = ui.section("Image output", false);
  if (!config.adaptiveMode && config.perspectiveMode === "asset") {
    ui.addNumber(section, "assetImageWidth", "Asset width", 120, 2400);
  } else {
    ui.addNumber(section, "inlayImageWidth", "Illustration width", 120, 2400);
  }
  ui.addNumber(section, "inlayImageMaxHeightVh", "Maximum height", 10, 100, "Viewport height percentage.");
  ui.addTextarea(section, "ignoredTags", "Ignored tags", "Separate tags with commas or semicolons.");
}

// src/frontend/sections/parser.ts
function renderParserSection({ ui, config, parserConnections, actions }) {
  const section = ui.section("Parser and context", false);
  ui.addSwitch(section, "fastMode", "Fast mode", "Use a compact single-pass sidecar with reduced context. Skips lorebook, history, shot routing, Creative ideation, and remote camera repair. Keeps your configured image count but may reduce prompt detail, continuity, and shot variety.");
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
  ui.addNumber(section, "parserMaxTokens", "Maximum token budget", 0, 32768, "0 uses the automatic model and parser-stage budget. Explicit max_tokens or max_completion_tokens in Parser parameters takes precedence.");
  ui.addSwitch(section, "preprocessingEnabled", "Illustration preprocessing");
  ui.addNumber(section, "includeMinMessages", "Minimum context", 0, 32);
  ui.addNumber(section, "includeMaxMessages", "Maximum context", 0, 32);
  ui.addNumber(section, "parserRetries", "Parser retries", 0, 5);
  ui.addSubtitle(section, "Context sources");
  ui.addSwitch(section, "includeUserInfo", "User info");
  ui.addSwitch(section, "includeCharacterInfo", "Character info");
  ui.addSwitch(section, "includeLorebook", "Lorebook");
  ui.addSwitch(section, "previousVisualStateEnabled", "Previous visual state", "Reuse the prior generated turn's character and environment tags when the current text does not replace them.");
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
  ], "", rerender);
  ui.addSelect(section, "promptSyntax", "Prompt syntax", [
    { value: "nai", label: "NovelAI" },
    { value: "comfyui", label: "ComfyUI" }
  ]);
  ui.addSwitch(section, "originalReference", "Source reference");
  ui.addText(section, "originalCreationName", "Creation name");
  ui.addSwitch(section, "supplement", config.promptStyle === "anima" ? "Natural/shared detail" : "Natural supplement");
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
  expandedSections;
  track;
  sectionSequence = 0;
  constructor(ctx, sections, config, patchConfig, expandedSections, track) {
    this.ctx = ctx;
    this.sections = sections;
    this.config = config;
    this.patchConfig = patchConfig;
    this.expandedSections = expandedSections;
    this.track = track;
  }
  section(title, defaultExpanded) {
    const host = document.createElement("section");
    host.className = "inlay-section-host";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "inlay-section-toggle";
    const label = document.createElement("span");
    label.textContent = title;
    const chevron = document.createElement("span");
    chevron.className = "inlay-section-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";
    toggle.append(label, chevron);
    const body = document.createElement("div");
    body.className = "inlay-section-body";
    body.id = `inlay-section-body-${++this.sectionSequence}`;
    toggle.setAttribute("aria-controls", body.id);
    let expanded = this.expandedSections.get(title) ?? defaultExpanded;
    const applyState = () => {
      body.hidden = !expanded;
      toggle.setAttribute("aria-expanded", String(expanded));
      host.setAttribute("data-expanded", String(expanded));
    };
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      this.expandedSections.set(title, expanded);
      applyState();
    });
    applyState();
    host.append(toggle, body);
    this.sections.append(host);
    return body;
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
  addSwitch(parent, key, label, hint = "", afterChange) {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountSwitch(target, {
      checked: Boolean(this.config[key]),
      ariaLabel: label,
      onChange: (checked) => {
        this.patchConfig({ [key]: checked });
        afterChange?.();
      }
    }));
  }
  addRangeChoice(parent, key, label, choices, disabled = false, hint = "", afterChange) {
    const target = this.row(parent, label, hint);
    const wrapper = document.createElement("div");
    wrapper.className = "inlay-range-choice";
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = String(Math.max(0, choices.length - 1));
    input.step = "1";
    input.disabled = disabled;
    input.setAttribute("aria-label", label);
    const selectedIndex = Math.max(0, choices.findIndex((choice) => choice.value === String(this.config[key])));
    input.value = String(selectedIndex);
    const labels = document.createElement("div");
    labels.className = "inlay-range-labels";
    const labelNodes = choices.map((choice) => {
      const node = document.createElement("span");
      node.textContent = choice.label;
      labels.append(node);
      return node;
    });
    const update = () => {
      const index = Number(input.value);
      labelNodes.forEach((node, candidate) => node.classList.toggle("is-active", candidate === index));
    };
    input.addEventListener("input", update);
    input.addEventListener("change", () => {
      const choice = choices[Number(input.value)];
      if (choice) {
        this.patchConfig({ [key]: choice.value });
        afterChange?.();
      }
    });
    update();
    wrapper.append(input, labels);
    target.append(wrapper);
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
  addSelect(parent, key, label, options, hint = "", afterChange) {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountSelect(target, {
      value: String(this.config[key] || ""),
      options,
      className: "inlay-select-control",
      triggerClassName: "inlay-select-trigger",
      portal: true,
      onChange: (value) => {
        this.patchConfig({ [key]: value });
        afterChange?.();
      }
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
  expandedSections = new Map;
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
    const ui = new UiBuilder(this.ctx, sections, snapshot.config, this.actions.patchConfig, this.expandedSections, (component) => this.mountedComponents.push(component));
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

// src/frontend/lightbox.ts
var INLAY_IMAGE_SELECTOR = '[data-inlay-illustrator="true"] img';
var INLAY_WRAPPER_SELECTOR = '[data-inlay-illustrator="true"]';
function disableNativeInlayLightboxes(root) {
  root.querySelectorAll(`${INLAY_WRAPPER_SELECTOR} img[data-lightbox]`).forEach((image) => image.removeAttribute("data-lightbox"));
}
function resolveInlayPrompt(attributePrompt, fallbackPrompt) {
  return (attributePrompt || fallbackPrompt || "").trim();
}
function resolveInlayDetails(attributePrompt, fallbackPrompt, attributeNegative, fallbackNegative, perspectiveMode, perspectiveSource, creativeConcept = null) {
  const normalizedMode = perspectiveMode?.trim().toLowerCase();
  const normalizedSource = perspectiveSource?.trim().toLowerCase();
  return {
    prompt: resolveInlayPrompt(attributePrompt, fallbackPrompt),
    negativePrompt: resolveInlayPrompt(attributeNegative, fallbackNegative),
    perspectiveMode: normalizedMode === "creative" || normalizedMode === "static" || normalizedMode === "dynamic" || normalizedMode === "asset" ? normalizedMode : null,
    perspectiveSource: normalizedSource === "adaptive" || normalizedSource === "manual" ? normalizedSource : null,
    creativeConcept: (creativeConcept || "").trim()
  };
}
function findInlayImage(target) {
  if (!(target instanceof Element))
    return null;
  const image = target.closest(INLAY_IMAGE_SELECTOR);
  if (!image?.closest(INLAY_WRAPPER_SELECTOR))
    return null;
  return image;
}
function detailsForImage(image) {
  const wrapper = image.closest(INLAY_WRAPPER_SELECTOR);
  const fallback = wrapper?.querySelector(".inlay-illustrator-prompt")?.textContent || null;
  const fallbackNegative = wrapper?.querySelector(".inlay-illustrator-negative-prompt")?.textContent || null;
  return resolveInlayDetails(image.getAttribute("data-inlay-illustrator-prompt"), fallback, image.getAttribute("data-inlay-illustrator-negative-prompt"), fallbackNegative, image.getAttribute("data-inlay-illustrator-perspective"), image.getAttribute("data-inlay-illustrator-perspective-source"), image.getAttribute("data-inlay-illustrator-concept"));
}
function optionalInteger(value) {
  if (value === null || value.trim() === "")
    return;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
function imageIdFromResultUrl(value) {
  const match = value.match(/\/api\/v1\/image-gen\/results\/([^?#]+)/i);
  if (!match?.[1])
    return;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
function actionTargetForImage(image) {
  const imageUrl = image.getAttribute("src") || image.currentSrc || image.src;
  return {
    chatId: image.getAttribute("data-inlay-illustrator-chat-id") || undefined,
    messageId: image.getAttribute("data-inlay-illustrator-message-id") || undefined,
    swipeId: optionalInteger(image.getAttribute("data-inlay-illustrator-swipe-id")),
    imageIndex: optionalInteger(image.getAttribute("data-inlay-illustrator-image-index")),
    imageId: image.getAttribute("data-inlay-illustrator-image-id") || imageIdFromResultUrl(imageUrl),
    imageUrl
  };
}
function promptBlock(label, value, fallback) {
  const block = document.createElement("section");
  block.className = "inlay-lightbox-prompt-block";
  const heading = document.createElement("h4");
  heading.textContent = label;
  const content = document.createElement("pre");
  content.className = "inlay-lightbox-prompt";
  content.textContent = value || fallback;
  block.append(heading, content);
  return block;
}
function appendLightboxContent(root, image, details, onAction) {
  const layout = document.createElement("div");
  layout.className = "inlay-lightbox-layout";
  const preview = document.createElement("img");
  preview.className = "inlay-lightbox-image";
  preview.src = image.currentSrc || image.src;
  preview.alt = image.alt || "Generated illustration";
  const panel = document.createElement("section");
  panel.className = "inlay-lightbox-prompt-panel";
  const heading = document.createElement("h3");
  heading.textContent = "Generation details";
  panel.append(heading);
  if (details.perspectiveMode || details.perspectiveSource) {
    const metadata = document.createElement("div");
    metadata.className = "inlay-lightbox-meta";
    if (details.perspectiveMode) {
      const mode = document.createElement("span");
      mode.textContent = `Perspective: ${details.perspectiveMode[0].toUpperCase()}${details.perspectiveMode.slice(1)}`;
      metadata.append(mode);
    }
    if (details.perspectiveSource) {
      const source = document.createElement("span");
      source.textContent = `Selection: ${details.perspectiveSource === "adaptive" ? "Adaptive" : "Manual"}`;
      metadata.append(source);
    }
    panel.append(metadata);
  }
  if (details.creativeConcept) {
    panel.append(promptBlock("Creative concept", details.creativeConcept, ""));
  }
  panel.append(promptBlock("Positive prompt", details.prompt, "No prompt was recorded for this image."), promptBlock("Negative prompt", details.negativePrompt, "No negative prompt was recorded for this image."));
  const actions = document.createElement("div");
  actions.className = "inlay-lightbox-actions";
  const reroll = document.createElement("button");
  reroll.type = "button";
  reroll.textContent = "Reroll image";
  const sidecar = document.createElement("button");
  sidecar.type = "button";
  sidecar.textContent = "Rerun sidecar";
  const status = document.createElement("div");
  status.className = "inlay-lightbox-action-status";
  status.setAttribute("aria-live", "polite");
  const controls = { status, buttons: [reroll, sidecar] };
  reroll.addEventListener("click", () => onAction("reroll", controls));
  sidecar.addEventListener("click", () => onAction("sidecar", controls));
  actions.append(reroll, sidecar, status);
  panel.append(actions);
  layout.append(preview, panel);
  root.replaceChildren(layout);
}
function installInlayLightbox(ctx) {
  let activeModal = null;
  let activeRequest = null;
  let activeDetailsRequest = null;
  disableNativeInlayLightboxes(document);
  const observer = new MutationObserver(() => disableNativeInlayLightboxes(document));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const unsubscribeResults = ctx.onBackendMessage((payload) => {
    if (!payload || typeof payload !== "object")
      return;
    const result = payload;
    if (result.type === "inlay_image_details_result" && String(result.requestId || "") === activeDetailsRequest?.id) {
      if (result.ok === true) {
        activeDetailsRequest.render(resolveInlayDetails(typeof result.prompt === "string" ? result.prompt : null, null, typeof result.negativePrompt === "string" ? result.negativePrompt : null, null, typeof result.perspectiveMode === "string" ? result.perspectiveMode : null, typeof result.perspectiveSource === "string" ? result.perspectiveSource : null, typeof result.creativeConcept === "string" ? result.creativeConcept : null));
      }
      activeDetailsRequest = null;
      return;
    }
    if (result.type !== "inlay_image_action_result" || String(result.requestId || "") !== activeRequest?.id)
      return;
    if (result.ok === true) {
      activeRequest.controls.status.textContent = "Image replaced. Reopening will show its updated details.";
      activeRequest.modal.dismiss();
      activeRequest = null;
      return;
    }
    activeRequest.controls.status.textContent = String(result.error || "Image regeneration failed.");
    activeRequest.controls.buttons.forEach((button) => {
      button.disabled = false;
    });
    activeRequest = null;
  });
  const onClick = (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    const image = event.composedPath().map((target) => findInlayImage(target ?? null)).find((candidate) => Boolean(candidate)) || findInlayImage(event.target);
    if (!image)
      return;
    const details = detailsForImage(image);
    const actionTarget = actionTargetForImage(image);
    try {
      activeModal?.dismiss();
      const modal = ctx.ui.showModal({
        title: image.alt || "Inlay illustration",
        width: 1440,
        maxHeight: Math.max(480, window.innerHeight - 48)
      });
      activeModal = modal;
      const render = (nextDetails) => appendLightboxContent(modal.root, image, nextDetails, (operation, controls) => {
        let chatId = actionTarget.chatId || "";
        if (!chatId) {
          try {
            chatId = String(ctx.getActiveChat().chatId || "");
          } catch {
            chatId = "";
          }
        }
        if (!chatId) {
          controls.status.textContent = "Open the image's chat before regenerating it.";
          return;
        }
        const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `inlay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        controls.buttons.forEach((button) => {
          button.disabled = true;
        });
        controls.status.textContent = operation === "sidecar" ? "Rerunning sidecar and generating..." : "Rerolling with a fresh seed...";
        activeRequest = { id: requestId, modal, controls };
        ctx.sendToBackend({
          type: operation === "sidecar" ? "rerun_image_sidecar" : "reroll_image",
          requestId,
          ...actionTarget,
          chatId
        });
      });
      render(details);
      if (!details.prompt && (actionTarget.imageId || actionTarget.messageId)) {
        let chatId = actionTarget.chatId || "";
        if (!chatId) {
          try {
            chatId = String(ctx.getActiveChat().chatId || "");
          } catch {
            chatId = "";
          }
        }
        if (chatId) {
          const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `inlay-details-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          activeDetailsRequest = { id: requestId, modal, render };
          ctx.sendToBackend({ type: "get_inlay_image_details", requestId, ...actionTarget, chatId });
        }
      }
      modal.onDismiss(() => {
        if (activeModal === modal)
          activeModal = null;
        if (activeRequest?.modal === modal)
          activeRequest = null;
        if (activeDetailsRequest?.modal === modal)
          activeDetailsRequest = null;
      });
    } catch {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  };
  window.addEventListener("click", onClick, true);
  return () => {
    observer.disconnect();
    unsubscribeResults();
    window.removeEventListener("click", onClick, true);
    activeModal?.dismiss();
    activeModal = null;
  };
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
  const removeLightbox = installInlayLightbox(ctx);
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
      replaceConfig: (next) => {
        config = next;
      },
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
    removeLightbox();
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
