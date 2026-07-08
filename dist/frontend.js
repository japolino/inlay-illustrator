// src/frontend.ts
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
  customNegative: ""
};
var CLEANUP_KEY = "__inlayIllustratorCleanup";
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function setup(ctx) {
  const previousCleanup = globalThis[CLEANUP_KEY];
  if (typeof previousCleanup === "function")
    previousCleanup();
  let config = { ...DEFAULT_CONFIG };
  let parserConnections = [];
  let characterAppearance = {};
  let status = "Loading...";
  let triedImageGenerationParserDefault = false;
  const tab = ctx.ui.registerDrawerTab({
    id: "inlay_illustrator",
    title: "Inlay Illustrator",
    shortName: "Inlay",
    headerTitle: "Inlay Illustrator",
    description: "Generate Inlay-style illustration batches from completed messages.",
    keywords: ["image", "illustration", "danbooru", "anima"],
    iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M21 16l-5-5L5 19"/></svg>'
  });
  const removeStyle = ctx.dom.addStyle(`
    .inlay-panel{padding:12px;color:var(--lumiverse-text)}
    .inlay-section{border-top:1px solid var(--lumiverse-border);padding-top:12px;margin-top:12px}
    .inlay-row{display:grid;grid-template-columns:minmax(110px,.9fr) minmax(0,1.1fr);align-items:center;gap:8px;margin:8px 0;font-size:13px}
    .inlay-row label{color:var(--lumiverse-text-muted)}
    .inlay-row input,.inlay-row select,.inlay-row textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:7px 9px;font:inherit}
    .inlay-row textarea{min-height:76px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
    .inlay-parser-summary{margin:8px 0 0;font-size:12px;color:var(--lumiverse-text-muted)}
    .inlay-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
    .inlay-actions button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 10px;cursor:pointer}
    .inlay-actions button:hover{background:var(--lumiverse-fill-hover)}
    .inlay-subtitle{font-size:13px;font-weight:600;margin:0 0 8px}
    .inlay-tag-row{display:grid;grid-template-columns:minmax(72px,.55fr) minmax(112px,1fr);gap:6px;margin:8px 0}
    .inlay-tag-row input{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:7px 9px;font:inherit}
    .inlay-tag-actions{grid-column:1 / -1;display:flex;gap:6px;justify-content:flex-end}
    .inlay-tag-actions button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:6px 9px;cursor:pointer}
    .inlay-tag-actions button:hover{background:var(--lumiverse-fill-hover)}
    .inlay-status{margin-top:10px;font-size:12px;color:var(--lumiverse-text-muted);white-space:pre-wrap}
  `);
  function boolInput(key, label) {
    return `<div class="inlay-row"><label>${label}</label><input data-key="${String(key)}" type="checkbox" ${config[key] ? "checked" : ""}/></div>`;
  }
  function textInput(key, label) {
    return `<div class="inlay-row"><label>${label}</label><input data-key="${String(key)}" value="${escapeHtml(String(config[key] ?? ""))}"/></div>`;
  }
  function numberInput(key, label, min = 1, max = 12) {
    return `<div class="inlay-row"><label>${label}</label><input data-key="${String(key)}" type="number" min="${min}" max="${max}" value="${escapeHtml(String(config[key] ?? ""))}"/></div>`;
  }
  function selectInput(key, label, options) {
    return `<div class="inlay-row"><label>${label}</label><select data-key="${String(key)}">${options.map((option) => `<option value="${option}" ${config[key] === option ? "selected" : ""}>${option}</option>`).join("")}</select></div>`;
  }
  function parserConnectionSelect() {
    const selected = parserConnections.find((connection) => connection.id === config.parserConnectionId);
    const options = [
      `<option value="" ${config.parserConnectionId ? "" : "selected"}>Select parser...</option>`,
      ...parserConnections.map((connection) => {
        const label = `${connection.name} (${connection.provider}${connection.model ? ` / ${connection.model}` : ""})`;
        return `<option value="${escapeHtml(connection.id)}" ${connection.id === config.parserConnectionId ? "selected" : ""}>${escapeHtml(label)}</option>`;
      })
    ];
    if (config.parserConnectionId && !selected) {
      options.push(`<option value="${escapeHtml(config.parserConnectionId)}" selected>Missing: ${escapeHtml(config.parserConnectionId)}</option>`);
    }
    const summary = selected ? `Selected parser: ${selected.name} / ${selected.provider}${config.parserModel ? ` / ${config.parserModel}` : selected.model ? ` / ${selected.model}` : ""}` : config.parserConnectionId ? "Selected parser connection is missing." : "No parser connection selected.";
    return `
      <div class="inlay-row"><label>Parser connection</label><select data-key="parserConnectionId">${options.join("")}</select></div>
      <div class="inlay-parser-summary">${escapeHtml(summary)}</div>`;
  }
  function parserModelInput() {
    const selected = parserConnections.find((connection) => connection.id === config.parserConnectionId);
    const options = selected?.model ? `<option value="${escapeHtml(selected.model)}"></option>` : "";
    return `<div class="inlay-row"><label>Parser model</label><input data-key="parserModel" list="inlay-parser-models" placeholder="${escapeHtml(selected?.model || "Use connection model")}" value="${escapeHtml(config.parserModel || "")}"/><datalist id="inlay-parser-models">${options}</datalist></div>`;
  }
  function parserParametersInput() {
    return `<div class="inlay-row"><label>Parser parameters</label><textarea data-key="parserParameters" spellcheck="false">${escapeHtml(JSON.stringify(config.parserParameters || {}, null, 2))}</textarea></div>`;
  }
  function textareaInput(key, label) {
    return `<div class="inlay-row"><label>${label}</label><textarea data-key="${String(key)}" spellcheck="false">${escapeHtml(String(config[key] ?? ""))}</textarea></div>`;
  }
  function activeChatId() {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }
  function requestState() {
    ctx.sendToBackend({ type: "get_state", chatId: activeChatId() });
  }
  function characterMemorySection() {
    const entries = Object.entries(characterAppearance).filter(([name, tags]) => name.trim() && tags.trim()).sort(([left], [right]) => left.localeCompare(right));
    const rows = entries.map(([name, tags]) => `
      <div class="inlay-tag-row" data-old-name="${escapeHtml(name)}">
        <input class="inlay-tag-name" placeholder="Name" value="${escapeHtml(name)}"/>
        <input class="inlay-tag-tags" placeholder="Tags" value="${escapeHtml(tags)}"/>
        <div class="inlay-tag-actions">
          <button class="inlay-tag-save" type="button">Save</button>
          <button class="inlay-tag-delete" type="button">Delete</button>
        </div>
      </div>`).join("");
    return `
      <div class="inlay-section">
        ${boolInput("characterTagContextEnabled", "Use character tag memory")}
        <div class="inlay-subtitle">Character tag memory (Current chat only)</div>
        ${rows || `<div class="inlay-parser-summary">No character tags saved for this chat.</div>`}
        <div class="inlay-tag-row inlay-tag-add">
          <input class="inlay-tag-name" placeholder="Name"/>
          <input class="inlay-tag-tags" placeholder="Tags"/>
          <div class="inlay-tag-actions">
            <button class="inlay-tag-add-button" type="button">Add character</button>
          </div>
        </div>
      </div>`;
  }
  async function applyImageGenerationDefaults() {
    if (triedImageGenerationParserDefault)
      return;
    triedImageGenerationParserDefault = true;
    try {
      const response = await fetch("/api/v1/settings/imageGeneration", { headers: { Accept: "application/json" } });
      if (!response.ok)
        return;
      const row = await response.json();
      const imageGeneration = row.value || {};
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
        ctx.sendToBackend({ type: "set_config", patch, chatId: activeChatId() });
    } catch {}
  }
  async function refreshParserConnectionsFromApi() {
    try {
      const response = await fetch("/api/v1/connections?limit=100&offset=0", { headers: { Accept: "application/json" } });
      if (!response.ok)
        return;
      const result = await response.json();
      const rows = Array.isArray(result) ? result : result.data || [];
      const next = rows.map((connection) => ({
        id: String(connection.id || ""),
        name: String(connection.name || ""),
        provider: String(connection.provider || ""),
        model: String(connection.model || "")
      })).filter((connection) => connection.id);
      if (next.length === 0)
        return;
      const seen = new Set(parserConnections.map((connection) => connection.id));
      parserConnections = [...parserConnections, ...next.filter((connection) => !seen.has(connection.id))];
      render();
    } catch {}
  }
  function render() {
    tab.root.innerHTML = `
      <div class="inlay-panel">
        ${boolInput("enabled", "Power")}
        ${boolInput("autoGenerate", "Auto generate")}
        ${boolInput("debugLogging", "Debug logging")}
        <div class="inlay-section">
          ${parserConnectionSelect()}
          ${parserModelInput()}
          ${parserParametersInput()}
          ${boolInput("preprocessingEnabled", "Illustration tag preprocessing")}
          ${numberInput("includeMinMessages", "Min included messages", 0, 32)}
          ${numberInput("includeMaxMessages", "Max included messages", 0, 32)}
          ${numberInput("parserRetries", "Parser retries", 0, 5)}
        </div>
        ${selectInput("mode", "Mode", ["illustration", "asset"])}
        ${selectInput("promptStyle", "Prompt style", ["default", "anima"])}
        ${selectInput("promptSyntax", "Prompt syntax", ["nai", "comfyui"])}
        ${numberInput("minImages", "Min images")}
        ${numberInput("maxImages", "Max images")}
        ${numberInput("maxCharacters", "Max characters")}
        <div class="inlay-section">
          ${numberInput("inlayImageWidth", "Image width px", 120, 2400)}
          ${numberInput("assetImageWidth", "Asset width px", 120, 2400)}
          ${numberInput("inlayImageMaxHeightVh", "Max height vh", 10, 100)}
        </div>
        <div class="inlay-section">
          <div class="inlay-subtitle">Reference context</div>
          ${boolInput("includeUserInfo", "Include user info")}
          ${boolInput("includeCharacterInfo", "Include character info")}
          ${boolInput("includeLorebook", "Include lorebook")}
          ${boolInput("userInstructionsEnabled", "User instructions")}
          ${textareaInput("customParserInstructions", "Parser override")}
        </div>
        <div class="inlay-section">
          ${boolInput("originalReference", "Original reference")}
          ${textInput("originalCreationName", "Creation name")}
          ${boolInput("supplement", "Natural supplement")}
        </div>
        ${characterMemorySection()}
        <div class="inlay-section">
          ${boolInput("danbooruCleanup", "Danbooru cleanup")}
          ${textInput("danbooruEndpoint", "Danbooru endpoint")}
          ${textareaInput("ignoredTags", "Ignored tags")}
        </div>
        <div class="inlay-section">
          ${textInput("customPositivePrefix", "Positive prefix")}
          ${textInput("customPositiveSuffix", "Positive suffix")}
          ${textInput("customNegative", "Negative prompt")}
        </div>
        <div class="inlay-actions">
          <button class="inlay-generate">Generate latest</button>
          <button class="inlay-test">Test Danbooru</button>
          <button class="inlay-refresh">Refresh</button>
        </div>
        <div class="inlay-status">${escapeHtml(status)}</div>
      </div>`;
    tab.root.querySelectorAll("input[data-key],select[data-key],textarea[data-key]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.key;
        let value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input instanceof HTMLInputElement && input.type === "number" ? Number(input.value) : input.value;
        if (key === "parserParameters") {
          try {
            value = JSON.parse(String(value || "{}"));
          } catch {
            status = "Parser parameters must be valid JSON.";
            render();
            return;
          }
        }
        ctx.sendToBackend({ type: "set_config", patch: { [key]: value }, chatId: activeChatId() });
      });
    });
    tab.root.querySelectorAll(".inlay-tag-save").forEach((button) => {
      button.addEventListener("click", () => {
        const row = button.closest(".inlay-tag-row");
        if (!row)
          return;
        ctx.sendToBackend({
          type: "character_tags_update",
          chatId: activeChatId(),
          oldName: row.dataset.oldName || "",
          name: row.querySelector(".inlay-tag-name")?.value || "",
          tags: row.querySelector(".inlay-tag-tags")?.value || ""
        });
      });
    });
    tab.root.querySelectorAll(".inlay-tag-delete").forEach((button) => {
      button.addEventListener("click", () => {
        const row = button.closest(".inlay-tag-row");
        if (!row)
          return;
        ctx.sendToBackend({
          type: "character_tags_delete",
          chatId: activeChatId(),
          name: row.dataset.oldName || row.querySelector(".inlay-tag-name")?.value || ""
        });
      });
    });
    tab.root.querySelector(".inlay-tag-add-button")?.addEventListener("click", () => {
      const row = tab.root.querySelector(".inlay-tag-add");
      if (!row)
        return;
      ctx.sendToBackend({
        type: "character_tags_update",
        chatId: activeChatId(),
        oldName: "",
        name: row.querySelector(".inlay-tag-name")?.value || "",
        tags: row.querySelector(".inlay-tag-tags")?.value || ""
      });
    });
    tab.root.querySelector(".inlay-generate")?.addEventListener("click", () => {
      status = "Generating...";
      render();
      ctx.sendToBackend({ type: "generate_latest", chatId: activeChatId() });
    });
    tab.root.querySelector(".inlay-test")?.addEventListener("click", () => {
      status = "Testing Danbooru endpoint...";
      render();
      ctx.sendToBackend({ type: "test_danbooru" });
    });
    tab.root.querySelector(".inlay-refresh")?.addEventListener("click", () => {
      status = "Refreshing...";
      render();
      requestState();
    });
  }
  const unsub = ctx.onBackendMessage((payload) => {
    const msg = payload;
    if (msg.type === "state" && msg.config) {
      config = { ...DEFAULT_CONFIG, ...msg.config };
      parserConnections = msg.parserConnections || [];
      characterAppearance = msg.characterAppearance || {};
      status = "Ready";
      render();
      if (parserConnections.length === 0)
        refreshParserConnectionsFromApi();
      applyImageGenerationDefaults();
    } else if (msg.type === "status") {
      status = msg.error ? `${msg.status}: ${msg.error}` : String(msg.status || "Ready");
      if (msg.record?.imageUrls)
        status += `
${msg.record.imageUrls.length} image(s) generated.`;
      render();
    } else if (msg.type === "danbooru_test") {
      status = `Danbooru endpoint responded.
${JSON.stringify(msg.result, null, 2).slice(0, 1000)}`;
      render();
    }
  });
  render();
  requestState();
  ctx.ready();
  const cleanup = () => {
    unsub();
    removeStyle();
    tab.destroy();
    if (globalThis[CLEANUP_KEY] === cleanup)
      delete globalThis[CLEANUP_KEY];
  };
  globalThis[CLEANUP_KEY] = cleanup;
  return cleanup;
}
export {
  setup
};
