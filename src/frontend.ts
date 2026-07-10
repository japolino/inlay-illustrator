import type { SpindleFrontendContext } from "lumiverse-spindle-types";

type PromptPreset = {
  id: string;
  name: string;
  positivePrefix: string;
  negativePrefix: string;
};

type Config = {
  enabled: boolean;
  autoGenerate: boolean;
  debugLogging: boolean;
  mode: "illustration" | "asset";
  parserConnectionId: string | null;
  parserModel: string;
  parserParameters: Record<string, unknown>;
  imageConnectionId: string | null;
  imageModel: string;
  imageParameters: Record<string, unknown>;
  minImages: number;
  maxImages: number;
  maxCharacters: number;
  includeMinMessages: number;
  includeMaxMessages: number;
  parserRetries: number;
  preprocessingEnabled: boolean;
  inlayImageWidth: number;
  assetImageWidth: number;
  inlayImageMaxHeightVh: number;
  promptStyle: "default" | "anima";
  promptSyntax: "nai" | "comfyui";
  includeUserInfo: boolean;
  includeCharacterInfo: boolean;
  includeLorebook: boolean;
  characterTagContextEnabled: boolean;
  userInstructionsEnabled: boolean;
  customParserInstructions: string;
  originalReference: boolean;
  originalCreationName: string;
  supplement: boolean;
  danbooruCleanup: boolean;
  danbooruEndpoint: string;
  ignoredTags: string;
  customPositivePrefix: string;
  customPositiveSuffix: string;
  customNegative: string;
  promptPresets: PromptPreset[];
  activePromptPresetId: string | null;
};

type ParserConnection = {
  id: string;
  name: string;
  provider: string;
  model: string;
};

type MountedComponent = { destroy(): void };

const DEFAULT_CONFIG: Config = {
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
  minImages: 1,
  maxImages: 3,
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

const CLEANUP_KEY = "__inlayIllustratorCleanup";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function setup(ctx: SpindleFrontendContext) {
  const previousCleanup = (globalThis as Record<string, unknown>)[CLEANUP_KEY];
  if (typeof previousCleanup === "function") previousCleanup();

  let config: Config = { ...DEFAULT_CONFIG };
  let parserConnections: ParserConnection[] = [];
  let characterAppearance: Record<string, string> = {};
  let status = "Loading...";
  let triedImageGenerationParserDefault = false;
  let drawerWasActive = false;
  let mountedComponents: MountedComponent[] = [];

  const tab = ctx.ui.registerDrawerTab({
    id: "inlay_illustrator",
    title: "Inlay Illustrator",
    shortName: "Inlay",
    headerTitle: "Inlay Illustrator",
    description: "Generate Inlay-style illustration batches from completed messages.",
    keywords: ["image", "illustration", "danbooru", "anima"],
    iconSvg: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><circle cx=\"8\" cy=\"10\" r=\"2\"/><path d=\"M21 16l-5-5L5 19\"/></svg>"
  });

  const removeStyle = ctx.dom.addStyle(`
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
    .inlay-actions button,.inlay-tag-actions button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 10px;cursor:pointer;font:inherit}
    .inlay-actions button:hover,.inlay-tag-actions button:hover{background:var(--lumiverse-fill-hover)}
    .inlay-primary{background:var(--lumiverse-primary)!important;color:var(--lumiverse-primary-contrast)!important;border-color:var(--lumiverse-primary)!important}
    .inlay-subtitle{font-size:13px;font-weight:600;margin:2px 0}
    .inlay-parser-summary{font-size:12px;color:var(--lumiverse-text-muted);line-height:1.4}
    .inlay-tag-row{display:grid;grid-template-columns:minmax(72px,.55fr) minmax(112px,1fr);gap:6px}
    .inlay-tag-actions{grid-column:1 / -1;display:flex;gap:6px;justify-content:flex-end}
    .inlay-status{padding:9px 10px;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-fill-subtle);font-size:12px;color:var(--lumiverse-text-muted);white-space:pre-wrap;min-height:18px}
  `);

  function activeChatId(): string {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }

  function requestState(chatId = activeChatId()): void {
    ctx.sendToBackend({ type: "get_state", chatId });
  }

  function updateStatus(next: string): void {
    status = next;
    const node = tab.root.querySelector<HTMLElement>(".inlay-status");
    if (node) node.textContent = status;
  }

  function patchConfig(patch: Partial<Config>): void {
    config = { ...config, ...patch };
    ctx.sendToBackend({ type: "set_config", patch, chatId: activeChatId() });
  }

  function presetId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function applyImageGenerationDefaults(): Promise<void> {
    if (triedImageGenerationParserDefault) return;
    triedImageGenerationParserDefault = true;
    try {
      const response = await fetch("/api/v1/settings/imageGeneration", { headers: { "Accept": "application/json" } });
      if (!response.ok) return;
      const row = await response.json() as { value?: {
        promptParserConnectionId?: string | null;
        promptParserModel?: string;
        promptParserParameters?: Record<string, unknown>;
        activeImageGenConnectionId?: string | null;
        model?: string;
        parameters?: Record<string, unknown>;
      } };
      const imageGeneration = row.value || {};
      const patch: Partial<Config> = {};
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
      if (Object.keys(patch).length > 0) patchConfig(patch);
    } catch {
      // Explicit extension configuration remains authoritative when app settings are unavailable.
    }
  }

  async function refreshParserConnectionsFromApi(): Promise<void> {
    try {
      const response = await fetch("/api/v1/connections?limit=100&offset=0", { headers: { "Accept": "application/json" } });
      if (!response.ok) return;
      const result = await response.json() as { data?: ParserConnection[] } | ParserConnection[];
      const rows = Array.isArray(result) ? result : result.data || [];
      const next = rows.map((connection) => ({
        id: String(connection.id || ""),
        name: String(connection.name || ""),
        provider: String(connection.provider || ""),
        model: String(connection.model || "")
      })).filter((connection) => connection.id);
      if (next.length === 0) return;
      const seen = new Set(parserConnections.map((connection) => connection.id));
      parserConnections = [...parserConnections, ...next.filter((connection) => !seen.has(connection.id))];
      render();
    } catch {
      // The backend connection list remains the primary source.
    }
  }

  function destroyMountedComponents(): void {
    for (const component of mountedComponents) component.destroy();
    mountedComponents = [];
  }

  function render() {
    destroyMountedComponents();
    tab.root.innerHTML = '<div class="inlay-panel"><div class="inlay-sections"></div><div class="inlay-status"></div></div>';
    const sections = tab.root.querySelector<HTMLElement>(".inlay-sections")!;
    updateStatus(status);

    const section = (title: string, defaultExpanded: boolean): HTMLElement => {
      const host = document.createElement("div");
      host.className = "inlay-section-host";
      sections.append(host);
      const component = ctx.components.mountCollapsibleSection(host, { title, defaultExpanded });
      mountedComponents.push(component);
      component.body.classList.add("inlay-section-body");
      return component.body;
    };
    const row = (parent: HTMLElement, label: string, hint = ""): HTMLElement => {
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
    };
    const addSwitch = (parent: HTMLElement, key: keyof Config, label: string, hint = "") => {
      const target = row(parent, label, hint);
      const component = ctx.components.mountSwitch(target, {
        checked: Boolean(config[key]),
        ariaLabel: label,
        onChange: (checked) => patchConfig({ [key]: checked } as Partial<Config>)
      });
      mountedComponents.push(component);
    };
    const addNumber = (parent: HTMLElement, key: keyof Config, label: string, min: number, max: number, hint = "") => {
      const target = row(parent, label, hint);
      const component = ctx.components.mountNumericInput(target, {
        value: Number(config[key]), min, max, integer: true,
        onChange: (value) => { if (value !== null) patchConfig({ [key]: value } as Partial<Config>); }
      });
      mountedComponents.push(component);
    };
    const addSelect = (parent: HTMLElement, key: keyof Config, label: string, options: Array<{ value: string; label: string }>, hint = "") => {
      const target = row(parent, label, hint);
      const component = ctx.components.mountSelect(target, {
        value: String(config[key] || ""), options,
        className: "inlay-select-control",
        triggerClassName: "inlay-select-trigger",
        portal: true,
        onChange: (value) => patchConfig({ [key]: value } as Partial<Config>)
      });
      mountedComponents.push(component);
    };
    const addText = (parent: HTMLElement, key: keyof Config, label: string, hint = "") => {
      const target = row(parent, label, hint);
      const component = ctx.components.mountTextInput(target, {
        value: String(config[key] || ""), ariaLabel: label,
        onChange: (value) => patchConfig({ [key]: value } as Partial<Config>)
      });
      mountedComponents.push(component);
    };
    const addTextarea = (parent: HTMLElement, key: keyof Config, label: string, hint = "") => {
      const target = row(parent, label, hint);
      const component = ctx.components.mountTextArea(target, {
        value: String(config[key] || ""), ariaLabel: label,
        onChange: (value) => patchConfig({ [key]: value } as Partial<Config>)
      });
      mountedComponents.push(component);
    };
    const addActions = (parent: HTMLElement, actions: Array<{ label: string; primary?: boolean; onClick: () => void }>) => {
      const container = document.createElement("div");
      container.className = "inlay-actions";
      for (const action of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = action.label;
        if (action.primary) button.classList.add("inlay-primary");
        button.addEventListener("click", action.onClick);
        container.append(button);
      }
      parent.append(container);
    };

    const generation = section("Generation", true);
    addSwitch(generation, "enabled", "Power");
    addSwitch(generation, "autoGenerate", "Auto generate");
    addSelect(generation, "mode", "Mode", [{ value: "illustration", label: "Illustration" }, { value: "asset", label: "Asset" }]);
    addNumber(generation, "minImages", "Minimum images", 1, 12);
    addNumber(generation, "maxImages", "Maximum images", 1, 12);
    addNumber(generation, "maxCharacters", "Maximum characters", 1, 8);
    addActions(generation, [{
      label: "Generate latest", primary: true, onClick: () => {
        updateStatus("Generating...");
        ctx.sendToBackend({ type: "generate_latest", chatId: activeChatId() });
      }
    }]);

    const parser = section("Parser and context", false);
    const selectedParser = parserConnections.find((connection) => connection.id === config.parserConnectionId);
    const parserOptions = parserConnections.map((connection) => ({
      value: connection.id,
      label: `${connection.name} (${connection.provider}${connection.model ? ` / ${connection.model}` : ""})`
    }));
    if (config.parserConnectionId && !selectedParser) parserOptions.push({ value: config.parserConnectionId, label: `Missing: ${config.parserConnectionId}` });
    addSelect(parser, "parserConnectionId", "Parser connection", parserOptions, selectedParser ? `Selected: ${selectedParser.name} / ${selectedParser.provider}` : "Choose the model that turns chat text into image prompts.");
    addText(parser, "parserModel", "Parser model", selectedParser?.model ? `Leave empty to use ${selectedParser.model}.` : "Leave empty to use the connection default.");
    const parserParameterTarget = row(parser, "Parser parameters", "JSON parameters sent to the parser connection.");
    const parserParameterInput = document.createElement("textarea");
    parserParameterInput.value = JSON.stringify(config.parserParameters || {}, null, 2);
    parserParameterInput.spellcheck = false;
    parserParameterInput.addEventListener("change", () => {
      try {
        patchConfig({ parserParameters: JSON.parse(parserParameterInput.value || "{}") as Record<string, unknown> });
      } catch {
        updateStatus("Parser parameters must be valid JSON.");
      }
    });
    parserParameterTarget.append(parserParameterInput);
    addSwitch(parser, "preprocessingEnabled", "Illustration preprocessing");
    addNumber(parser, "includeMinMessages", "Minimum context", 0, 32);
    addNumber(parser, "includeMaxMessages", "Maximum context", 0, 32);
    addNumber(parser, "parserRetries", "Parser retries", 0, 5);
    const sources = document.createElement("div");
    sources.className = "inlay-subtitle";
    sources.textContent = "Context sources";
    parser.append(sources);
    addSwitch(parser, "includeUserInfo", "User info");
    addSwitch(parser, "includeCharacterInfo", "Character info");
    addSwitch(parser, "includeLorebook", "Lorebook");
    addSwitch(parser, "userInstructionsEnabled", "User instructions");
    addTextarea(parser, "customParserInstructions", "Parser override");

    const prompt = section("Prompt output", false);
    addSelect(prompt, "promptStyle", "Prompt style", [{ value: "default", label: "Default" }, { value: "anima", label: "Anima" }]);
    addSelect(prompt, "promptSyntax", "Prompt syntax", [{ value: "nai", label: "NovelAI" }, { value: "comfyui", label: "ComfyUI" }]);
    addSwitch(prompt, "originalReference", "Source reference");
    addText(prompt, "originalCreationName", "Creation name");
    addSwitch(prompt, "supplement", "Natural supplement");
    const presetsTitle = document.createElement("div");
    presetsTitle.className = "inlay-subtitle";
    presetsTitle.textContent = "Prompt presets";
    prompt.append(presetsTitle);
    const selectedPreset = config.promptPresets.find((preset) => preset.id === config.activePromptPresetId) || null;
    const presetSelectTarget = row(prompt, "Active preset", "Preset prefixes are inserted before the custom prompt fields below.");
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
      patchConfig({ activePromptPresetId: presetSelect.value || null });
      render();
    });
    presetSelectTarget.append(presetSelect);
    const presetNameTarget = row(prompt, "Preset name", "Save a new preset or update the selected preset with these values.");
    const presetName = document.createElement("input");
    presetName.type = "text";
    presetName.value = selectedPreset?.name || "";
    presetName.placeholder = "e.g. Cinematic anime";
    presetName.setAttribute("aria-label", "Preset name");
    presetNameTarget.append(presetName);
    const presetPositiveTarget = row(prompt, "Preset positive", "Tags placed before the custom positive prefix and generated prompt.");
    const presetPositive = document.createElement("textarea");
    presetPositive.value = selectedPreset?.positivePrefix || "";
    presetPositive.placeholder = "masterpiece, best quality";
    presetPositive.setAttribute("aria-label", "Preset positive prefix");
    presetPositiveTarget.append(presetPositive);
    const presetNegativeTarget = row(prompt, "Preset negative", "Tags placed before the custom negative additions and shot negatives.");
    const presetNegative = document.createElement("textarea");
    presetNegative.value = selectedPreset?.negativePrefix || "";
    presetNegative.placeholder = "lowres, bad anatomy";
    presetNegative.setAttribute("aria-label", "Preset negative prefix");
    presetNegativeTarget.append(presetNegative);
    const presetValues = (forNew = false): PromptPreset | null => {
      const name = presetName.value.trim();
      if (!name) {
        updateStatus("A preset name is required.");
        return null;
      }
      const duplicate = config.promptPresets.find((preset) => preset.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0 && (forNew || preset.id !== selectedPreset?.id));
      if (duplicate) {
        updateStatus(`A preset named \"${name}\" already exists.`);
        return null;
      }
      return {
        id: forNew ? presetId() : selectedPreset?.id || presetId(),
        name,
        positivePrefix: presetPositive.value.trim(),
        negativePrefix: presetNegative.value.trim()
      };
    };
    addActions(prompt, [
      {
        label: "Save new", primary: true, onClick: () => {
          const next = presetValues(true);
          if (!next) return;
          patchConfig({ promptPresets: [...config.promptPresets, next], activePromptPresetId: next.id });
          updateStatus(`Saved preset \"${next.name}\".`);
          render();
        }
      },
      {
        label: "Update selected", onClick: () => {
          if (!selectedPreset) {
            updateStatus("Select a preset to update.");
            return;
          }
          const next = presetValues();
          if (!next) return;
          patchConfig({ promptPresets: config.promptPresets.map((preset) => preset.id === selectedPreset.id ? next : preset) });
          updateStatus(`Updated preset \"${next.name}\".`);
          render();
        }
      },
      {
        label: "Rename", onClick: () => {
          if (!selectedPreset) {
            updateStatus("Select a preset to rename.");
            return;
          }
          const name = presetName.value.trim();
          if (!name) {
            updateStatus("A preset name is required.");
            return;
          }
          const duplicate = config.promptPresets.find((preset) => preset.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0 && preset.id !== selectedPreset.id);
          if (duplicate) {
            updateStatus(`A preset named \"${name}\" already exists.`);
            return;
          }
          patchConfig({ promptPresets: config.promptPresets.map((preset) => preset.id === selectedPreset.id ? { ...preset, name } : preset) });
          updateStatus(`Renamed preset to \"${name}\".`);
          render();
        }
      },
      {
        label: "Delete", onClick: () => {
          if (!selectedPreset) {
            updateStatus("Select a preset to delete.");
            return;
          }
          patchConfig({
            promptPresets: config.promptPresets.filter((preset) => preset.id !== selectedPreset.id),
            activePromptPresetId: null
          });
          updateStatus(`Deleted preset \"${selectedPreset.name}\".`);
          render();
        }
      }
    ]);
    addText(prompt, "customPositivePrefix", "Positive prefix");
    addText(prompt, "customPositiveSuffix", "Positive suffix");
    addText(prompt, "customNegative", "Negative additions");

    const output = section("Image output and cleanup", false);
    addNumber(output, "inlayImageWidth", "Illustration width", 120, 2400);
    addNumber(output, "assetImageWidth", "Asset width", 120, 2400);
    addNumber(output, "inlayImageMaxHeightVh", "Maximum height", 10, 100, "Viewport height percentage.");
    addSwitch(output, "danbooruCleanup", "Danbooru cleanup");
    addText(output, "danbooruEndpoint", "Danbooru endpoint");
    addTextarea(output, "ignoredTags", "Ignored tags", "Separate tags with commas or semicolons.");
    addActions(output, [{
      label: "Test endpoint", onClick: () => {
        updateStatus("Testing Danbooru endpoint...");
        ctx.sendToBackend({ type: "test_danbooru" });
      }
    }]);

    const memory = section("Character memory", true);
    addSwitch(memory, "characterTagContextEnabled", "Use character visual baseline");
    const memoryTitle = document.createElement("div");
    memoryTitle.className = "inlay-subtitle";
    memoryTitle.textContent = "Current-chat visual baseline";
    memory.append(memoryTitle);
    const entries = Object.entries(characterAppearance)
      .filter(([name, tags]) => name.trim() && tags.trim())
      .sort(([left], [right]) => left.localeCompare(right));
    for (const [name, tags] of entries) {
      const memoryRow = document.createElement("div");
      memoryRow.className = "inlay-tag-row";
      memoryRow.innerHTML = `<input class="inlay-tag-name" aria-label="Character name" value="${escapeHtml(name)}"/><input class="inlay-tag-tags" aria-label="Character appearance tags" value="${escapeHtml(tags)}"/>`;
      const actions = document.createElement("div");
      actions.className = "inlay-tag-actions";
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Save";
      save.addEventListener("click", () => ctx.sendToBackend({
        type: "character_tags_update", chatId: activeChatId(), oldName: name,
        name: memoryRow.querySelector<HTMLInputElement>(".inlay-tag-name")?.value || "",
        tags: memoryRow.querySelector<HTMLInputElement>(".inlay-tag-tags")?.value || ""
      }));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => ctx.sendToBackend({ type: "character_tags_delete", chatId: activeChatId(), name }));
      actions.append(save, remove);
      memoryRow.append(actions);
      memory.append(memoryRow);
    }
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "inlay-parser-summary";
      empty.textContent = "No character baseline is saved for this chat yet.";
      memory.append(empty);
    }
    const addRow = document.createElement("div");
    addRow.className = "inlay-tag-row";
    addRow.innerHTML = '<input class="inlay-tag-name" aria-label="New character name" placeholder="Name"/><input class="inlay-tag-tags" aria-label="New character appearance tags" placeholder="Appearance tags"/>';
    const addMemoryActions = document.createElement("div");
    addMemoryActions.className = "inlay-tag-actions";
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Add character";
    add.addEventListener("click", () => ctx.sendToBackend({
      type: "character_tags_update", chatId: activeChatId(), oldName: "",
      name: addRow.querySelector<HTMLInputElement>(".inlay-tag-name")?.value || "",
      tags: addRow.querySelector<HTMLInputElement>(".inlay-tag-tags")?.value || ""
    }));
    addMemoryActions.append(add);
    addRow.append(addMemoryActions);
    memory.append(addRow);

    const diagnostics = section("Diagnostics", false);
    addSwitch(diagnostics, "debugLogging", "Debug logging");
    const diagnosticStatus = document.createElement("div");
    diagnosticStatus.className = "inlay-parser-summary";
    diagnosticStatus.textContent = "Status appears below this section and updates after parser, image, and endpoint operations.";
    diagnostics.append(diagnosticStatus);
    addActions(diagnostics, [{ label: "Refresh state", onClick: () => { updateStatus("Refreshing..."); requestState(); } }]);
  }

  const unsub = ctx.onBackendMessage((payload: unknown) => {
    const msg = payload as {
      type?: string;
      chatId?: string;
      config?: Config;
      parserConnections?: ParserConnection[];
      characterAppearance?: Record<string, string>;
      status?: string;
      error?: string;
      result?: unknown;
      record?: { imageUrls?: string[] };
    };
    if (msg.type === "state" && msg.config) {
      config = { ...DEFAULT_CONFIG, ...msg.config };
      parserConnections = msg.parserConnections || [];
      characterAppearance = msg.characterAppearance || {};
      status = "Ready";
      render();
      if (parserConnections.length === 0) void refreshParserConnectionsFromApi();
      void applyImageGenerationDefaults();
    } else if (msg.type === "character_memory_updated") {
      if (msg.chatId && msg.chatId === activeChatId()) {
        characterAppearance = msg.characterAppearance || {};
        status = "Character visual baseline updated.";
        render();
      }
    } else if (msg.type === "status") {
      let next = msg.error ? `${msg.status}: ${msg.error}` : String(msg.status || "Ready");
      if (msg.record?.imageUrls) next += `\n${msg.record.imageUrls.length} image(s) generated.`;
      updateStatus(next);
    } else if (msg.type === "danbooru_test") {
      updateStatus(`Danbooru endpoint responded.\n${JSON.stringify(msg.result, null, 2).slice(0, 1000)}`);
    }
  });

  const unsubDrawer = ctx.ui.events.onDrawerChange((drawer) => {
    const active = drawer.open && drawer.tabId === tab.tabId;
    if (active && !drawerWasActive) requestState();
    drawerWasActive = active;
  });
  const unsubChatSwitched = ctx.events.on("CHAT_SWITCHED", (payload) => {
    const chatId = (payload as { chatId?: unknown } | null)?.chatId;
    requestState(typeof chatId === "string" ? chatId : "");
  });

  render();
  requestState();
  ctx.ready();

  const cleanup = () => {
    unsub();
    unsubDrawer();
    unsubChatSwitched();
    destroyMountedComponents();
    removeStyle();
    tab.destroy();
    if ((globalThis as Record<string, unknown>)[CLEANUP_KEY] === cleanup) delete (globalThis as Record<string, unknown>)[CLEANUP_KEY];
  };
  (globalThis as Record<string, unknown>)[CLEANUP_KEY] = cleanup;
  return cleanup;
}
