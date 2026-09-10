// src/shared/config.ts
var INLAY_IMAGE_ASPECT_PRESETS = [
  { value: "wide", label: "Wide 16:9" },
  { value: "standard", label: "Standard 4:3" },
  { value: "square", label: "Square 1:1" },
  { value: "portrait", label: "Portrait 3:4" },
  { value: "vertical", label: "Vertical 9:16" },
  { value: "classic", label: "Classic 2:3" }
];
var INLAY_IMAGE_ASPECT_RATIOS = {
  wide: { w: 16, h: 9 },
  standard: { w: 4, h: 3 },
  square: { w: 1, h: 1 },
  portrait: { w: 3, h: 4 },
  vertical: { w: 9, h: 16 },
  classic: { w: 2, h: 3 }
};
function resolveInlayImageAspect(value) {
  const key = String(value ?? "").toLowerCase();
  return INLAY_IMAGE_ASPECT_RATIOS[key] ?? INLAY_IMAGE_ASPECT_RATIOS.wide;
}
function normalizeInlayImageAspect(value) {
  const key = String(value ?? "").toLowerCase();
  return key in INLAY_IMAGE_ASPECT_RATIOS ? key : "wide";
}
var FAB_CORNER_OPTIONS = [
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" }
];
function normalizeFabCorner(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "bottom-left" || normalized === "top-right" || normalized === "top-left") {
    return normalized;
  }
  return "bottom-right";
}
var NOVELAI_SAMPLER_OPTIONS = [
  { value: "k_euler_ancestral", label: "Euler Ancestral (Default)" },
  { value: "k_euler", label: "Euler" },
  { value: "k_dpmpp_2m", label: "DPM++ 2M" },
  { value: "k_dpmpp_2s_ancestral", label: "DPM++ 2S Ancestral" },
  { value: "k_dpmpp_sde", label: "DPM++ SDE" },
  { value: "ddim", label: "DDIM" }
];
var NOVELAI_RESOLUTION_PRESETS = [
  { value: "832x1216", label: "Normal Portrait (832 × 1216)", width: 832, height: 1216, aspect: "portrait" },
  { value: "1216x832", label: "Normal Landscape (1216 × 832)", width: 1216, height: 832, aspect: "wide" },
  { value: "1024x1024", label: "Normal Square (1024 × 1024)", width: 1024, height: 1024, aspect: "square" },
  { value: "512x768", label: "Small Portrait (512 × 768)", width: 512, height: 768, aspect: "classic" },
  { value: "768x512", label: "Small Landscape (768 × 512)", width: 768, height: 512, aspect: "standard" },
  { value: "640x640", label: "Small Square (640 × 640)", width: 640, height: 640, aspect: "square" },
  { value: "1024x1536", label: "Large Portrait (1024 × 1536)", width: 1024, height: 1536, aspect: "classic" },
  { value: "1536x1024", label: "Large Landscape (1536 × 1024)", width: 1536, height: 1024, aspect: "wide" },
  { value: "1472x1472", label: "Large Square (1472 × 1472)", width: 1472, height: 1472, aspect: "square" },
  { value: "1920x1088", label: "Wallpaper (1920 × 1088)", width: 1920, height: 1088, aspect: "wide" }
];
function isNovelAiConnection(connection) {
  if (!connection)
    return false;
  const provider = String(connection.provider || "").trim().toLowerCase();
  if (provider === "comfyui" || provider === "swarmui")
    return false;
  if (provider === "novelai" || provider === "nai")
    return true;
  const naiPattern = /(?:^|[^a-z0-9])nai(?:$|[^a-z0-9])/i;
  const model = String(connection.model || "").trim().toLowerCase();
  if (model.startsWith("nai-") || model.includes("novelai") || naiPattern.test(model))
    return true;
  const name = String(connection.name || "").trim().toLowerCase();
  if (name.includes("novelai") || naiPattern.test(name))
    return true;
  return false;
}
function normalizeModuleMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "illustration" || normalized === "0" || normalized === "삽화")
    return "illustration";
  if (normalized === "asset" || normalized === "1" || normalized === "에셋")
    return "asset";
  if (normalized === "comic" || normalized === "2" || normalized === "만화")
    return "comic";
  return "illustration";
}
function normalizePromptSeparator(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pipe" || normalized === "0" || normalized === "파이프")
    return "pipe";
  if (normalized === "newline" || normalized === "1" || normalized === "줄바꿈")
    return "newline";
  if (normalized === "native" || normalized === "2" || normalized === "novelai")
    return "native";
  return "pipe";
}
function normalizeTextLanguage(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "off" || normalized === "0" || normalized === "사용 안함" || normalized === "none")
    return "off";
  if (normalized === "free" || normalized === "1" || normalized === "자유")
    return "free";
  if (normalized === "english" || normalized === "2" || normalized === "영어")
    return "english";
  if (normalized === "korean" || normalized === "3" || normalized === "한국어")
    return "korean";
  if (normalized === "japanese" || normalized === "4" || normalized === "일본어")
    return "japanese";
  if (normalized === "chinese" || normalized === "5" || normalized === "중국어")
    return "chinese";
  return "off";
}
function normalizeEncodingMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "plain" || normalized === "0" || normalized === "기본" || normalized === "none" || normalized === "default")
    return "plain";
  if (normalized === "placeholder" || normalized === "1")
    return "placeholder";
  if (normalized === "base64" || normalized === "2")
    return "base64";
  if (normalized === "atbash" || normalized === "3")
    return "atbash";
  return "plain";
}
function normalizeCharacterContextDepth(value) {
  if (value === null || value === undefined || value === "")
    return DEFAULT_CONFIG.characterContextDepth;
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    return DEFAULT_CONFIG.characterContextDepth;
  const rounded = Math.round(parsed);
  if (rounded === -1)
    return DEFAULT_CONFIG.characterContextDepth;
  if (rounded < 0)
    return DEFAULT_CONFIG.characterContextDepth;
  return Math.min(1e5, rounded);
}
function normalizeComicMinPanels(value) {
  if (value === null || value === undefined || value === "")
    return DEFAULT_CONFIG.comicMinPanels;
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    return DEFAULT_CONFIG.comicMinPanels;
  const rounded = Math.round(parsed);
  if (rounded < 1)
    return 1;
  return Math.min(1000, rounded);
}
var DEFAULT_CONFIG = {
  enabled: true,
  autoGenerate: true,
  debugLogging: false,
  coverImageEnabled: false,
  moduleMode: "illustration",
  nsfwInstructions: false,
  promptSeparator: "pipe",
  imageTextLanguage: "off",
  comicMinPanels: 3,
  includeUserMessage: false,
  characterContextDepth: 5,
  quoteEnabled: false,
  encodingMode: "plain",
  prefillEnabled: false,
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
  inlayImageAspect: "wide",
  inlayImageMaxHeightVh: 70,
  coverImageWidth: 1200,
  coverImageMaxHeightVh: 80,
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
  activePromptPresetId: null,
  fabCorner: "bottom-right"
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
    mode: legacyMode,
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
  const rawModuleMode = raw.moduleMode ?? (legacyMode === "asset" || raw.perspectiveMode === "asset" ? "asset" : undefined);
  const moduleMode = normalizeModuleMode(rawModuleMode);
  const promptSeparator = normalizePromptSeparator(raw.promptSeparator);
  const imageTextLanguage = normalizeTextLanguage(raw.imageTextLanguage);
  const encodingMode = normalizeEncodingMode(raw.encodingMode);
  const comicMinPanels = normalizeComicMinPanels(raw.comicMinPanels);
  const characterContextDepth = normalizeCharacterContextDepth(raw.characterContextDepth);
  return {
    ...DEFAULT_CONFIG,
    ...current,
    moduleMode,
    nsfwInstructions: raw.nsfwInstructions === true,
    promptSeparator,
    imageTextLanguage,
    comicMinPanels,
    includeUserMessage: raw.includeUserMessage === true,
    characterContextDepth,
    quoteEnabled: raw.quoteEnabled === true,
    encodingMode,
    prefillEnabled: raw.prefillEnabled === true,
    coverImageEnabled: raw.coverImageEnabled === true,
    adaptiveMode: raw.adaptiveMode === true,
    fastMode: raw.fastMode === true,
    perspectiveMode: raw.perspectiveMode === "creative" || raw.perspectiveMode === "static" || raw.perspectiveMode === "dynamic" || raw.perspectiveMode === "asset" ? raw.perspectiveMode : legacyMode === "asset" ? "asset" : "dynamic",
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
    inlayImageAspect: normalizeInlayImageAspect(raw.inlayImageAspect),
    inlayImageMaxHeightVh: clampInt(raw.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh),
    coverImageWidth: clampInt(raw.coverImageWidth, 120, 2400, DEFAULT_CONFIG.coverImageWidth),
    coverImageMaxHeightVh: clampInt(raw.coverImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.coverImageMaxHeightVh),
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
    activePromptPresetId: activePromptPresetId && promptPresets.some((preset) => preset.id === activePromptPresetId) ? activePromptPresetId : null,
    fabCorner: normalizeFabCorner(raw.fabCorner)
  };
}
function v376OptionsFromConfig(config) {
  return {
    mode: config.moduleMode,
    nsfw: config.nsfwInstructions,
    supplement: config.supplement,
    text: config.imageTextLanguage,
    quote: config.quoteEnabled,
    syntax: config.promptSyntax,
    separator: config.promptSeparator,
    imageMin: config.minImages,
    imageMax: config.maxImages,
    characterMax: config.maxCharacters,
    panelMin: config.comicMinPanels,
    originalReference: config.originalReference,
    originalCreationName: config.originalCreationName,
    encodingMode: config.encodingMode,
    prefillEnabled: config.prefillEnabled,
    characterContext: config.characterTagContextEnabled,
    characterContextDepth: config.characterContextDepth,
    customInstruction: config.customParserInstructions,
    includeUserMessage: config.includeUserMessage,
    customPos: config.customPositivePrefix,
    customNeg: config.customPositiveSuffix
  };
}

// src/frontend/avatar-image.ts
var MAX_AVATAR_BYTES = 8000000;
function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 32768;
  for (let offset = 0;offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
async function respondToAvatarImageRequest(message, sendToBackend, fetchFn = fetch) {
  const requestId = String(message.requestId || "");
  const imageUrl = String(message.imageUrl || "");
  const chatId = String(message.chatId || "");
  const respond = (payload) => sendToBackend({
    type: "avatar_image_response",
    requestId,
    chatId,
    ...payload
  });
  if (!requestId || !/^\/api\/v1\/images\//.test(imageUrl)) {
    respond({ error: "Invalid avatar image request." });
    return;
  }
  try {
    const response = await fetchFn(imageUrl, { credentials: "include", headers: { Accept: "image/*" } });
    if (!response.ok)
      throw new Error(`Avatar fetch failed (${response.status}).`);
    const blob = await response.blob();
    const mimeType = String(blob.type || response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(?:png|jpe?g|webp|gif)$/.test(mimeType))
      throw new Error("Avatar response was not a supported image.");
    if (blob.size <= 0 || blob.size > MAX_AVATAR_BYTES)
      throw new Error("Avatar image is empty or too large.");
    const data = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    respond({ data, mimeType });
  } catch (error) {
    respond({ error: error instanceof Error ? error.message.slice(0, 300) : "Avatar fetch failed." });
  }
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
  .inlay-panel{width:100%;padding:12px;color:var(--lumiverse-text);display:flex;flex-direction:column;gap:12px;min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-overview{position:relative;overflow:hidden;padding:14px;border:1px solid var(--lumiverse-border);border-radius:12px;background:linear-gradient(145deg,var(--lumiverse-fill-subtle),var(--lumiverse-fill));box-shadow:0 10px 28px rgba(0,0,0,.08)}
  .inlay-overview::before{content:"";position:absolute;inset:0 0 auto;height:3px;background:var(--lumiverse-primary)}
  .inlay-overview-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
  .inlay-overview h2{margin:2px 0 4px;font-size:18px;line-height:1.2;color:var(--lumiverse-text)}
  .inlay-overview p{max-width:42ch;margin:0;color:var(--lumiverse-text-muted);font-size:12px;line-height:1.45}
  .inlay-eyebrow{color:var(--lumiverse-primary);font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}
  .inlay-power-button{flex:none;min-width:62px;border:1px solid var(--lumiverse-border);border-radius:999px;padding:6px 10px;background:var(--lumiverse-fill);color:var(--lumiverse-text-muted);font:inherit;font-size:12px;font-weight:700;cursor:pointer}
  .inlay-power-button[data-enabled="true"]{border-color:var(--lumiverse-primary);background:var(--lumiverse-primary);color:var(--lumiverse-primary-contrast)}
  .inlay-overview-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
  .inlay-overview-meta span,.inlay-section-badge{border:1px solid var(--lumiverse-border);border-radius:999px;background:var(--lumiverse-fill);color:var(--lumiverse-text-muted);font-size:10px;line-height:1;padding:5px 7px;white-space:nowrap}
  .inlay-overview-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:12px}
  .inlay-overview-actions button,.inlay-memory-card button{border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 11px;cursor:pointer;font:inherit;font-size:12px;font-weight:600}
  .inlay-overview-actions button:hover:not(:disabled),.inlay-memory-card button:hover:not(:disabled){background:var(--lumiverse-fill-hover)}
  .inlay-overview-actions button:disabled,.inlay-memory-card button:disabled,.inlay-actions button:disabled{opacity:.48;cursor:not-allowed}
  .inlay-status{display:flex;align-items:flex-start;gap:9px;padding:10px 11px;border:1px solid var(--lumiverse-border);border-radius:9px;background:var(--lumiverse-fill-subtle);font-size:12px;color:var(--lumiverse-text);white-space:pre-wrap;min-height:20px}
  .inlay-status-dot{flex:none;width:8px;height:8px;margin-top:4px;border-radius:50%;background:var(--lumiverse-text-muted);box-shadow:0 0 0 3px color-mix(in srgb,var(--lumiverse-text-muted) 15%,transparent)}
  .inlay-status-label{display:block;margin-bottom:2px;color:var(--lumiverse-text-muted);font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .inlay-status-text{display:block;line-height:1.4;overflow-wrap:anywhere}
  .inlay-status[data-tone="active"] .inlay-status-dot{background:var(--lumiverse-primary);animation:inlay-pulse 1.5s ease-in-out infinite}
  .inlay-status[data-tone="success"] .inlay-status-dot{background:#34a853}.inlay-status[data-tone="warning"] .inlay-status-dot{background:#e2a93b}.inlay-status[data-tone="error"] .inlay-status-dot{background:#d9534f}
  @keyframes inlay-pulse{50%{opacity:.4;transform:scale(.8)}}
  .inlay-sections,.inlay-section-host,.inlay-section-body,.inlay-row,.inlay-control{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-sections{display:flex;flex-direction:column;gap:8px}
  .inlay-section-host{width:100%;contain:inline-size;overflow:hidden;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle)}
  .inlay-section-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:11px 12px;border:0;background:transparent;color:var(--lumiverse-text);font:inherit;text-align:left;cursor:pointer}
  .inlay-section-heading{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.inlay-section-title{font-size:13px;font-weight:700}.inlay-section-description{color:var(--lumiverse-text-muted);font-size:11px;font-weight:400;line-height:1.3}
  .inlay-section-trailing{display:flex;align-items:center;gap:6px;min-width:0}
  .inlay-section-toggle:hover{background:var(--lumiverse-fill-hover)}
  .inlay-section-toggle:focus-visible{outline:2px solid var(--lumiverse-primary);outline-offset:-2px}
  .inlay-section-chevron{flex:none;font-size:20px;line-height:1;transform:rotate(0deg);transition:transform .15s ease}
  .inlay-section-host[data-expanded="true"] .inlay-section-chevron{transform:rotate(90deg)}
  .inlay-section-body{display:flex;flex-direction:column;gap:10px;padding:4px 12px 12px}
  .inlay-section-body[hidden]{display:none}
  .inlay-row{display:grid;grid-template-columns:minmax(116px,.9fr) minmax(0,1.1fr);align-items:center;gap:8px;font-size:13px}
  .inlay-row>*{min-width:0;max-width:100%;box-sizing:border-box}
  .inlay-row-full{grid-template-columns:1fr}.inlay-row-full .inlay-control,.inlay-row-full .inlay-hint{grid-column:1}.inlay-row-full>label{font-weight:600;color:var(--lumiverse-text)}
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
  .inlay-actions button:hover:not(:disabled){background:var(--lumiverse-fill-hover)}
  .inlay-panel button:focus-visible,.inlay-panel input:focus-visible,.inlay-panel textarea:focus-visible,.inlay-panel select:focus-visible{outline:2px solid var(--lumiverse-primary);outline-offset:2px}
  .inlay-primary{background:var(--lumiverse-primary)!important;color:var(--lumiverse-primary-contrast)!important;border-color:var(--lumiverse-primary)!important}
  .inlay-subtitle{font-size:13px;font-weight:600;margin:2px 0}
  .inlay-parser-summary{font-size:12px;color:var(--lumiverse-text-muted);line-height:1.4}
  .inlay-notice{padding:9px 10px;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-fill);color:var(--lumiverse-text-muted);font-size:11px;line-height:1.45}.inlay-notice[data-tone="warning"]{border-color:#b78a32;color:var(--lumiverse-text)}.inlay-notice[data-tone="error"]{border-color:#b94a48;color:var(--lumiverse-text)}
  .inlay-field-message{margin-top:5px;color:var(--lumiverse-text-muted);font-size:10px;line-height:1.35}.inlay-field-message[data-tone="success"]{color:#4cae6a}.inlay-field-message[data-tone="error"]{color:#e06b67}.inlay-json-field textarea[aria-invalid="true"]{border-color:#d9534f}
  .inlay-memory-list{display:flex;flex-direction:column;gap:8px}.inlay-memory-card{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill)}.inlay-memory-card-new{border-style:dashed;background:transparent}
  .inlay-memory-card-header{display:flex;align-items:center;gap:8px}.inlay-memory-name{font-weight:700}.inlay-memory-card input,.inlay-memory-card textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill-subtle);color:var(--lumiverse-text);padding:7px 9px;font:inherit}.inlay-memory-card textarea{resize:vertical;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
  .inlay-memory-field{display:flex;flex-direction:column;gap:5px;color:var(--lumiverse-text-muted);font-size:11px}.inlay-memory-card-header .inlay-icon-button{flex:none;padding:7px 9px}.inlay-danger{color:#e06b67!important}.inlay-memory-save{align-self:flex-start}
  [data-inlay-illustrator="true"] img[role="button"]{cursor:zoom-in}[data-inlay-illustrator="true"] img[role="button"]:focus-visible{outline:3px solid var(--lumiverse-primary);outline-offset:3px}
  .inlay-illustrator-placeholder{box-sizing:border-box;margin:10px auto;width:min(100%,720px);padding:12px 14px;border:1px dashed currentColor;border-radius:8px;text-align:center;opacity:.72}
  .inlay-lightbox-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,420px);gap:16px;align-items:start;min-width:0}
  .inlay-lightbox-image{display:block;width:100%;height:auto;max-height:calc(100vh - 150px);object-fit:contain;border-radius:8px;background:#080808}
  .inlay-lightbox-prompt-panel{display:flex;flex-direction:column;min-width:0;max-height:calc(100vh - 150px);border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-fill-subtle);overflow:auto}
  .inlay-lightbox-prompt-panel h3{flex:none;margin:0;padding:12px 14px;border-bottom:1px solid var(--lumiverse-border);font-size:14px;color:var(--lumiverse-text)}
  .inlay-lightbox-meta{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 0}
  .inlay-lightbox-meta span{padding:4px 8px;border:1px solid var(--lumiverse-border);border-radius:999px;background:var(--lumiverse-fill);font-size:11px;color:var(--lumiverse-text-muted)}
  .inlay-lightbox-prompt-block{min-width:0;padding:12px 14px 0}
  .inlay-lightbox-prompt-block:last-child{padding-bottom:14px}
  .inlay-lightbox-prompt-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px}.inlay-lightbox-prompt-block h4{margin:0;font-size:12px;color:var(--lumiverse-text-muted)}
  .inlay-lightbox-prompt-heading button{border:0;background:transparent;color:var(--lumiverse-primary);padding:3px 5px;cursor:pointer;font:inherit;font-size:11px;font-weight:600}
  .inlay-lightbox-prompt{min-height:80px;margin:0;padding:10px;border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--lumiverse-text)}
  .inlay-lightbox-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px}
  .inlay-lightbox-actions button{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-fill);color:var(--lumiverse-text);padding:8px 10px;cursor:pointer;font:inherit}
  .inlay-lightbox-actions button:hover:not(:disabled){background:var(--lumiverse-fill-hover)}
  .inlay-lightbox-actions button:disabled{opacity:.55;cursor:wait}
  .inlay-lightbox-action-status{grid-column:1/-1;min-height:16px;color:var(--lumiverse-text-muted);font-size:11px;line-height:1.35}
  @media(max-width:800px){.inlay-lightbox-layout{grid-template-columns:1fr}.inlay-lightbox-image{max-height:55vh}.inlay-lightbox-prompt-panel{max-height:35vh}}
  @media(max-width:520px){.inlay-panel{padding:9px}.inlay-row{grid-template-columns:1fr;gap:5px}.inlay-hint{grid-column:1}.inlay-section-description{display:none}.inlay-section-badge{max-width:140px;overflow:hidden;text-overflow:ellipsis}.inlay-overview-heading{gap:8px}}
  @media(max-width:340px){.inlay-overview-actions{grid-template-columns:1fr}.inlay-overview-actions button{width:100%}}
  @media(prefers-reduced-motion:reduce){.inlay-section-chevron,.inlay-status-dot{transition:none!important;animation:none!important}}
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
    const imageConnections = message.imageConnections || [];
    actions.replaceState({
      config: { ...DEFAULT_CONFIG, ...message.config },
      parserConnections,
      imageConnections,
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
    const recordImages = message.record?.slots ? message.record.slots.filter((slot) => Boolean(slot.imageUrl)).length : message.record?.imageUrls?.filter(Boolean).length;
    if (recordImages !== undefined) {
      status += `
${recordImages} image(s) generated.`;
    }
    actions.updateStatus(status);
    return;
  }
}

// src/frontend/sections/diagnostics.ts
function renderDiagnosticsSection({ ui, actions }) {
  const section = ui.section("Diagnostics", false, {
    description: "Inspect activity and refresh extension state.",
    badge: "Advanced"
  });
  ui.addSwitch(section, "debugLogging", "Debug logging", "Write detailed parser and image-stage events to the Lumiverse server log.");
  ui.addSummary(section, "Status appears below this section and updates after parser, image, and endpoint operations.");
  ui.addActions(section, [{
    label: "Refresh state",
    onClick: () => {
      actions.updateStatus("Refreshing...");
      actions.requestState();
    }
  }]);
}

// src/frontend/sections/display.ts
function renderDisplaySection({ ui, actions }) {
  const section = ui.section("Display", false, {
    description: "Floating action button placement and gallery actions."
  });
  ui.addSelect(section, "fabCorner", "Action button corner", FAB_CORNER_OPTIONS, "Corner of the chat screen anchoring the floating action button. Its menu opens toward the screen center.");
  ui.addActions(section, [
    {
      label: "Open Inlay gallery",
      primary: true,
      onClick: () => {
        actions.openGallery?.();
      }
    }
  ]);
}

// src/frontend/view-model.ts
function statusTone(status) {
  const normalized = status.toLowerCase();
  if (/error|failed|invalid|must be|required|unavailable/.test(normalized))
    return "error";
  if (/cancelled|canceled|paused|disabled/.test(normalized))
    return "warning";
  if (/complete|ready|saved|updated|generated/.test(normalized))
    return "success";
  if (/loading|parsing|preparing|generating|saving|deleting|queued|requesting|refreshing/.test(normalized))
    return "active";
  return "neutral";
}
function isBusyStatus(status) {
  return /queued|loading chat context|parsing illustration prompts|preparing image jobs|generating|saving illustrations|requesting cancellation/i.test(status);
}
function generationSummary(config) {
  const modeLabel = config.moduleMode === "comic" ? `Comic (${config.comicMinPanels}+ panels)` : config.moduleMode === "asset" ? "Asset" : "Illustration";
  const count = config.minImages === config.maxImages ? `${config.maxImages} image${config.maxImages === 1 ? "" : "s"}` : `${config.minImages}–${config.maxImages} images`;
  return `${modeLabel} · ${count}`;
}
function parserSummary(config, connections) {
  const selected = connections.find((connection) => connection.id === config.parserConnectionId);
  const base = selected?.name || (config.parserConnectionId ? "Missing connection" : "Not configured");
  if (config.encodingMode && config.encodingMode !== "plain") {
    const enc = config.encodingMode.charAt(0).toUpperCase() + config.encodingMode.slice(1);
    return `${base} · [${enc}]`;
  }
  return base;
}
function promptSummary(config) {
  const syntax = config.promptSyntax === "nai" ? "NovelAI" : "ComfyUI";
  const sep = config.promptSeparator === "native" ? "Native" : config.promptSeparator === "newline" ? "Newline" : "Pipe";
  return `${syntax} · ${sep}`;
}
function outputSummary(config) {
  const aspect = INLAY_IMAGE_ASPECT_PRESETS.find((preset) => preset.value === config.inlayImageAspect)?.label || "Wide 16:9";
  return `${aspect} · ${config.inlayImageMaxHeightVh}vh`;
}

// src/frontend/sections/generation.ts
function novelAiResolutionPatch(currentParameters, value) {
  const found = NOVELAI_RESOLUTION_PRESETS.find((preset) => preset.value === value);
  if (!found)
    return null;
  return {
    imageParameters: {
      ...currentParameters || {},
      width: found.width,
      height: found.height,
      resolution: found.value
    }
  };
}
function renderGenerationSection({ ui, config, imageConnections, actions, rerender }) {
  const activeImgConn = imageConnections?.find((c) => c.id === config.imageConnectionId) || imageConnections?.find((c) => c.is_default) || imageConnections?.[0] || null;
  const isNai = isNovelAiConnection(activeImgConn);
  const section = ui.section("Generation", true, {
    description: "Choose when and how many illustrations are created.",
    badge: generationSummary(config)
  });
  const selectedImageConn = imageConnections?.find((c) => c.id === config.imageConnectionId);
  const imageConnOptions = (imageConnections || []).map((conn) => ({
    value: conn.id,
    label: `${conn.name}${conn.is_default ? " (default)" : ""} (${conn.provider}${conn.model ? ` / ${conn.model}` : ""})`
  }));
  if (config.imageConnectionId && !selectedImageConn) {
    imageConnOptions.push({ value: config.imageConnectionId, label: `Missing: ${config.imageConnectionId}` });
  }
  if (imageConnOptions.length > 0) {
    ui.addSelect(section, "imageConnectionId", "Image connection", imageConnOptions, selectedImageConn ? `Active: ${selectedImageConn.name} (${selectedImageConn.provider})` : "Choose the image generator profile for illustrations.", rerender);
  }
  ui.addSwitch(section, "autoGenerate", "Auto generate", "Automatically illustrate completed assistant messages. You can always use Generate latest above.");
  ui.addSwitch(section, "coverImageEnabled", "Cover image", "Generate one additional cinematic key visual for the whole message and place it above the first paragraph.", rerender);
  if (config.coverImageEnabled) {
    ui.addNumber(section, "coverImageWidth", "Cover image width", 120, 2400);
    ui.addNumber(section, "coverImageMaxHeightVh", "Cover image max height (vh)", 10, 100);
  }
  ui.addSelect(section, "moduleMode", "Pipeline mode", [
    { value: "illustration", label: "Illustration (삽화) - Full scene with characters" },
    { value: "asset", label: "Asset (에셋) - Isolated character portrait/sprites" },
    { value: "comic", label: "Comic (만화) - Multi-panel manga style" }
  ], "V3.7.6 module generation mode (Card.Mode): multi-shot illustration, isolated character assets, or multi-panel manga.", rerender);
  if (config.moduleMode === "comic") {
    ui.addNumber(section, "comicMinPanels", "Minimum comic panels", 1, 100, "Minimum number of manga panels per comic illustration (V3.7.6 Card.PanelNum, default: 3).");
  }
  ui.addNumber(section, "minImages", "Minimum images", 1, 12);
  ui.addNumber(section, "maxImages", "Maximum images", 1, 12);
  if (config.moduleMode !== "asset") {
    ui.addNumber(section, "maxCharacters", "Maximum characters", 1, 8, "Maximum number of characters detected per illustration (default: 2).");
  }
  if (isNai) {
    ui.addSubtitle(section, "NovelAI settings");
    ui.addSummary(section, "NovelAI connection detected. Basic generation settings are exposed and applied automatically.");
    const params = config.imageParameters || {};
    const connectionParams = activeImgConn?.default_parameters || {};
    const curWidth = Number(params.width) || Number(connectionParams.width) || 832;
    const curHeight = Number(params.height) || Number(connectionParams.height) || 1216;
    const sizeIsInherited = params.width === undefined && params.height === undefined;
    const matchedPreset = NOVELAI_RESOLUTION_PRESETS.find((p) => p.width === curWidth && p.height === curHeight) || NOVELAI_RESOLUTION_PRESETS[0];
    ui.addCustomSelect(section, "Resolution", matchedPreset.value, NOVELAI_RESOLUTION_PRESETS.map((p) => ({ value: p.value, label: p.label })), sizeIsInherited ? "Currently inherited from the NovelAI connection profile. Choosing a value here sends that canvas size to NovelAI for generation. This does not change the in-chat frame size; use Image output → Aspect ratio for that." : "Canvas size sent to NovelAI for generation (resolution, width, and height). This does not change the in-chat frame size; use Image output → Aspect ratio for that.", (val) => {
      const patch = novelAiResolutionPatch(config.imageParameters, val);
      if (patch) {
        actions.patchConfig(patch);
        rerender();
      }
    });
    const currentSampler = String(params.sampler || connectionParams.sampler || "k_euler_ancestral");
    ui.addCustomSelect(section, "Sampler", currentSampler, NOVELAI_SAMPLER_OPTIONS, "Diffusion sampler algorithm.", (val) => {
      actions.patchConfig({
        imageParameters: {
          ...config.imageParameters,
          sampler: val
        }
      });
    });
    const currentSteps = Number(params.steps) || Number(connectionParams.steps) || 28;
    ui.addCustomNumber(section, "Steps", currentSteps, 1, 50, "Sampling steps (1–50, default 28).", (val) => {
      if (val !== null) {
        actions.patchConfig({
          imageParameters: {
            ...config.imageParameters,
            steps: val
          }
        });
      }
    });
    const currentScale = Number(params.scale) || Number(params.cfg) || Number(connectionParams.scale) || Number(connectionParams.cfg) || 5;
    ui.addCustomNumber(section, "Guidance scale (CFG)", currentScale, 1, 20, "Prompt guidance scale (1–20, default 5.0).", (val) => {
      if (val !== null) {
        actions.patchConfig({
          imageParameters: {
            ...config.imageParameters,
            scale: val,
            cfg: val
          }
        });
      }
    }, false);
    const currentSeed = params.seed !== undefined ? String(params.seed) : connectionParams.seed !== undefined ? String(connectionParams.seed) : "-1";
    ui.addCustomText(section, "Seed", currentSeed, "RNG seed. Set to -1 for a fresh random seed on each turn.", (val) => {
      const trimmed = (val || "").trim();
      const parsed = Number(trimmed);
      const seedVal = trimmed === "" || !Number.isFinite(parsed) || parsed <= 0 ? -1 : Math.floor(parsed);
      actions.patchConfig({
        imageParameters: {
          ...config.imageParameters,
          seed: seedVal
        }
      });
    });
    const currentSmea = params.smea === true || params.smea === "true";
    ui.addCustomSwitch(section, "Auto-SMEA", currentSmea, "Enable SMEA sampling optimization for higher resolutions.", (checked) => {
      actions.patchConfig({
        imageParameters: {
          ...config.imageParameters,
          smea: checked
        }
      });
    });
    const currentSmeaDyn = params.smea_dyn === true || params.smea_dyn === "true";
    ui.addCustomSwitch(section, "Auto-SMEA Dynamic", currentSmeaDyn, "Dynamically applies SMEA for high resolutions with enhanced visual details and dramatic contrast.", (checked) => {
      actions.patchConfig({
        imageParameters: {
          ...config.imageParameters,
          smea_dyn: checked
        }
      });
    });
  }
}

// src/frontend/sections/memory-actions.ts
function sendCharacterMemoryMutation(actions, mutation) {
  actions.updateStatus(mutation.type === "character_tags_delete" ? "Deleting character baseline…" : "Saving character baseline…");
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
function createTagsInput(ariaLabel, value = "", placeholder = "") {
  const input = document.createElement("textarea");
  input.ariaLabel = ariaLabel;
  input.value = value;
  input.placeholder = placeholder;
  input.rows = 3;
  return input;
}
function renderMemorySection({ ui, characterAppearance, actions }) {
  const entries = Object.entries(characterAppearance).filter(([name, tags]) => name.trim() && tags.trim()).sort(([left], [right]) => left.localeCompare(right));
  const section = ui.section("Character memory", false, {
    description: "Review exact visual baselines saved for the active chat.",
    badge: `${entries.length} saved`
  });
  ui.addSwitch(section, "characterTagContextEnabled", "Use visual baselines", "Provide these tags to the parser for returning characters. Current narrative changes remain authoritative.");
  if (entries.length === 0) {
    ui.addNotice(section, "No visual baseline is saved for this chat yet. Add one below or let a generation discover characters automatically.");
  }
  const list = document.createElement("div");
  list.className = "inlay-memory-list";
  for (const [name, tags] of entries) {
    const card = document.createElement("article");
    card.className = "inlay-memory-card";
    const header = document.createElement("div");
    header.className = "inlay-memory-card-header";
    const nameInput = createTextInput("Character name", name);
    nameInput.className = "inlay-memory-name";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "inlay-icon-button inlay-danger";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${name} visual baseline`);
    remove.addEventListener("click", () => {
      (async () => {
        const confirmed = await ui.confirmDestructive("Delete character baseline?", `Delete the saved visual baseline for "${name}"? This cannot be undone.`, "Delete baseline");
        if (!confirmed)
          return;
        sendCharacterMemoryMutation(actions, {
          type: "character_tags_delete",
          name
        });
      })();
    });
    header.append(nameInput, remove);
    const label = document.createElement("label");
    label.className = "inlay-memory-field";
    const labelText = document.createElement("span");
    labelText.textContent = "Appearance tags";
    const tagsInput = createTagsInput("Character appearance tags", tags, "hair, eyes, body, attire");
    label.append(labelText, tagsInput);
    const save = document.createElement("button");
    save.type = "button";
    save.className = "inlay-memory-save";
    save.textContent = "Save changes";
    save.addEventListener("click", () => {
      if (!nameInput.value.trim() || !tagsInput.value.trim()) {
        actions.updateStatus("Character name and appearance tags are required.");
        return;
      }
      sendCharacterMemoryMutation(actions, {
        type: "character_tags_update",
        oldName: name,
        name: nameInput.value,
        tags: tagsInput.value
      });
    });
    card.append(header, label, save);
    list.append(card);
  }
  section.append(list);
  const addCard = document.createElement("article");
  addCard.className = "inlay-memory-card inlay-memory-card-new";
  const addTitle = document.createElement("div");
  addTitle.className = "inlay-subtitle";
  addTitle.textContent = "Add a character";
  const newNameInput = createTextInput("New character name", "", "Character name");
  const newTagsInput = createTagsInput("New character appearance tags", "", "hair, eyes, body, attire");
  const add = document.createElement("button");
  add.type = "button";
  add.className = "inlay-primary";
  add.textContent = "Add baseline";
  add.addEventListener("click", () => {
    if (!newNameInput.value.trim() || !newTagsInput.value.trim()) {
      actions.updateStatus("Character name and appearance tags are required.");
      return;
    }
    sendCharacterMemoryMutation(actions, {
      type: "character_tags_update",
      oldName: "",
      name: newNameInput.value,
      tags: newTagsInput.value
    });
  });
  addCard.append(addTitle, newNameInput, newTagsInput, add);
  section.append(addCard);
}

// src/frontend/sections/output.ts
function renderOutputSection({ ui, config }) {
  const section = ui.section("Image output", false, {
    description: "Set the in-chat frame shape, height, crop, and output filtering.",
    badge: outputSummary(config)
  });
  ui.addSelect(section, "inlayImageAspect", "Aspect ratio", INLAY_IMAGE_ASPECT_PRESETS, "The shape of the in-chat image frame. Generated images are cropped to fill it (object-fit: cover).");
  ui.addNumber(section, "inlayImageMaxHeightVh", "Maximum height", 10, 100, "Viewport-height cap. The frame keeps the selected aspect ratio and fits the chat column.");
  ui.addTextarea(section, "ignoredTags", "Ignored tags", "Separate tags with commas or semicolons.");
}

// src/frontend/sections/parser.ts
function renderParserSection({ ui, config, parserConnections, actions, rerender }) {
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
  ui.addSelect(section, "parserConnectionId", "Parser connection", parserOptions, selectedParser ? `Selected: ${selectedParser.name} / ${selectedParser.provider}` : "Choose the model that turns chat text into image prompts.");
  ui.addText(section, "parserModel", "Parser model", selectedParser?.model ? `Leave empty to use ${selectedParser.model}.` : "Leave empty to use the connection default.");
  const parserParameterTarget = ui.row(section, "Parser parameters", "JSON parameters sent to the parser connection.", true);
  parserParameterTarget.classList.add("inlay-json-field");
  const parserParameterInput = document.createElement("textarea");
  parserParameterInput.value = JSON.stringify(config.parserParameters || {}, null, 2);
  parserParameterInput.spellcheck = false;
  parserParameterInput.setAttribute("aria-label", "Parser parameters JSON");
  const parserParameterValidation = document.createElement("div");
  parserParameterValidation.className = "inlay-field-message";
  const validateParameters = () => {
    try {
      const parsed = JSON.parse(parserParameterInput.value || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Expected an object");
      parserParameterInput.setAttribute("aria-invalid", "false");
      parserParameterValidation.dataset.tone = "success";
      parserParameterValidation.textContent = "Valid JSON object";
      return parsed;
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
    if (parsed)
      actions.patchConfig({ parserParameters: parsed });
    else
      actions.updateStatus("Parser parameters must be a valid JSON object.");
  });
  validateParameters();
  parserParameterTarget.append(parserParameterInput, parserParameterValidation);
  ui.addNumber(section, "parserMaxTokens", "Maximum token budget", 0, 32768, "0 uses the automatic model and parser-stage budget. Explicit max_tokens or max_completion_tokens in Parser parameters takes precedence.");
  ui.addSwitch(section, "preprocessingEnabled", "Illustration preprocessing", "Use auxiliary preprocessing for scene tagging extraction (V3.7.6 Card.Preprocessing).");
  ui.addNumber(section, "includeMinMessages", "Minimum context messages", 0, 32, "Minimum prior turns included in context (V3.7.6 Card.IncludeMin).");
  ui.addNumber(section, "includeMaxMessages", "Maximum context messages", 0, 32, "Maximum prior turns included in context (V3.7.6 Card.Include).");
  ui.addSwitch(section, "includeUserMessage", "Include preceding user message", "Include one preceding user message per turn in context for non-impersonation accuracy (V3.7.6 Card.Userchat).");
  ui.addSwitch(section, "nsfwInstructions", "NSFW instruction strength (\uD83D\uDD1ENSFW 지침 강화)", "Increases explicit interaction instruction intensity in the prompt generation system message (V3.7.6 Card.Nsfw). Note: This is an instruction-strength booster, NOT a safe-content filter.");
  ui.addNumber(section, "parserRetries", "Parser retries on refusal / error", 0, 5, "Number of retries when censorship refusal or format error is detected (V3.7.6 Card.Retry).");
  ui.addSubtitle(section, "Bypass & encoding protocols (탈옥 / 암호화)");
  ui.addSelect(section, "encodingMode", "Refusal bypass encoding", [
    { value: "plain", label: "Standard / Plain (기본) - Plain text" },
    { value: "placeholder", label: "Placeholder Codes (단어 치환) - BP/SE body part codes" },
    { value: "base64", label: "Base64 Protocol (연구 프로토콜 암호화)" },
    { value: "atbash", label: "Atbash Cipher (A↔Z 단일 치환 암호)" }
  ], "Instruction and response encoding protocol to bypass LLM safety refusals (V3.7.6 Card.Encode).");
  ui.addSwitch(section, "prefillEnabled", "Consensual adult prefill bypass", "Inject consensual adult roleplay confirmation prefill into parser prompt (V3.7.6 Card.Prefill).");
  ui.addSubtitle(section, "Context sources");
  ui.addSwitch(section, "includeUserInfo", "User info", "Include {{user}} persona in prompt generation (V3.7.6 Card.UserInfo).");
  ui.addSwitch(section, "includeCharacterInfo", "Character info", "Include {{char}} definition in prompt generation (V3.7.6 Card.CharInfo).");
  ui.addSwitch(section, "includeLorebook", "Lorebook", "Include active lorebook entries in prompt generation (V3.7.6 Card.Lorebook).");
  ui.addSwitch(section, "characterTagContextEnabled", "Character appearance continuity", "Track and reuse character appearance tags across turns (V3.7.6 Card.CharAppearance.Context).", rerender);
  if (config.characterTagContextEnabled) {
    ui.addNumber(section, "characterContextDepth", "Character memory depth", 0, 1000, "Turns before an unseen character's detailed tags leave parser context. Saved tags are retained (V3.7.6 Card.CharAppearance.Depth, default: 5).");
  }
  ui.addSwitch(section, "userInstructionsEnabled", "Character-specific instructions", "Include extra image instructions stored on the character, chat, or persona. The parser override below is independent.");
  ui.addTextarea(section, "customParserInstructions", "Parser instructions override", "Additional prompt instructions injected into prompt generation (V3.7.6 Card.CustomInst).");
}

// src/frontend/sections/prompt.ts
function createPresetId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function renderPromptSection({ ui, config, imageConnections, actions, rerender }) {
  const activeImgConn = imageConnections?.find((c) => c.id === config.imageConnectionId) || imageConnections?.find((c) => c.is_default) || imageConnections?.[0] || null;
  const isNai = isNovelAiConnection(activeImgConn);
  let effectiveConfig = config;
  if (isNai && config.promptSyntax !== "nai") {
    actions.patchConfig({ promptSyntax: "nai" });
    effectiveConfig = { ...config, promptSyntax: "nai" };
  }
  const section = ui.section("Prompt output", false, {
    description: "Control renderer syntax, tag separators, reusable presets, and prompt affixes.",
    badge: promptSummary(effectiveConfig)
  });
  ui.addSelect(section, "promptSeparator", "Prompt separator", [
    { value: "pipe", label: "Pipe ( | ) - Scene | Character tags" },
    { value: "newline", label: `Newline ( 

 ) - Multi-line tag groups` },
    { value: "native", label: "NovelAI Native Characters (v4 API)" }
  ], config.promptSeparator === "native" ? "Keeps scene and character prompts separate in parameters.characters. Host NovelAI V4 support is unverified. Use pipe mode unless your host supports native character channels." : "Delimiter separating scene tags and character definitions (V3.7.6 Card.PromptSep).", rerender);
  if (isNai) {
    ui.addSummary(section, "Prompt syntax is automatically locked to NovelAI based on your active connection profile.");
  } else {
    ui.addSelect(section, "promptSyntax", "Prompt syntax", [
      { value: "nai", label: "NovelAI ({ } weights)" },
      { value: "comfyui", label: "ComfyUI (( ) weights)" }
    ], "", rerender);
  }
  ui.addSelect(section, "imageTextLanguage", "In-image text language", [
    { value: "off", label: "Off (사용 안함) - No text" },
    { value: "free", label: "Free (자유) - Model chooses language" },
    { value: "english", label: "English (영어)" },
    { value: "korean", label: "Korean (한국어)" },
    { value: "japanese", label: "Japanese (일본어)" },
    { value: "chinese", label: "Chinese (중국어)" }
  ], "Add speech bubbles, sound effects, or dialogue text inside the image (V3.7.6 Card.Text).");
  ui.addSwitch(section, "originalReference", "Source reference", "Include the configured creation name as an explicit source-style reference.", rerender);
  if (config.originalReference)
    ui.addText(section, "originalCreationName", "Creation name");
  ui.addSwitch(section, "supplement", "Natural language supplement", "Add natural language pose and action descriptions to character tags (V3.7.6 Card.Supplement).");
  ui.addSwitch(section, "quoteEnabled", "Extract image dialogue quotes", "Include a short per-shot dialogue quote in parser output (V3.7.6 Card.Quote). Quotes are saved as metadata; existing image display is unchanged.");
  ui.addSubtitle(section, "Prompt presets");
  if (config.promptPresets.length === 0) {
    ui.addSummary(section, "The original V3.7.6 preset is used by default. Save a preset to replace its positive and negative templates.");
  }
  const selectedPreset = config.promptPresets.find((preset) => preset.id === config.activePromptPresetId) || null;
  const presetSelectTarget = ui.row(section, "Active preset", "CustomPos is placed before the preset output. CustomNeg is a positive suffix. With no selection, the original V3.7.6 preset is used.");
  const presetSelect = document.createElement("select");
  presetSelect.className = "inlay-native-select";
  presetSelect.setAttribute("aria-label", "Active prompt preset");
  presetSelect.innerHTML = '<option value="">V3.7.6 default preset</option>';
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
  const presetPositiveTarget = ui.row(section, "Preset positive template", "Use {prompt} for the full generated prompt, or {setup} and {char} for scene and character groups. Plain tags automatically get the generated prompt appended.");
  const presetPositive = document.createElement("textarea");
  presetPositive.value = selectedPreset?.positivePrefix || "";
  presetPositive.placeholder = "masterpiece, best quality";
  presetPositive.setAttribute("aria-label", "Preset positive template");
  presetPositiveTarget.append(presetPositive);
  const presetNegativeTarget = ui.row(section, "Preset negative template", "Negative quality tags. Character negatives and your custom negative additions are appended. Source {prompt} expands to empty in this template.");
  const presetNegative = document.createElement("textarea");
  presetNegative.value = selectedPreset?.negativePrefix || "";
  presetNegative.placeholder = "lowres, bad anatomy";
  presetNegative.setAttribute("aria-label", "Preset negative template");
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
      disabled: !selectedPreset,
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
      disabled: !selectedPreset,
      onClick: () => {
        if (!selectedPreset) {
          actions.updateStatus("Select a preset to rename.");
          return;
        }
        const name = presetName.value.trim();
        if (!name) {
          actions.updateStatus("A preset name is required.");
          return null;
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
      danger: true,
      disabled: !selectedPreset,
      onClick: async () => {
        if (!selectedPreset) {
          actions.updateStatus("Select a preset to delete.");
          return;
        }
        const confirmed = await ui.confirmDestructive("Delete prompt preset?", `Delete "${selectedPreset.name}"? This cannot be undone.`, "Delete preset");
        if (!confirmed)
          return;
        actions.patchConfig({
          promptPresets: config.promptPresets.filter((preset) => preset.id !== selectedPreset.id),
          activePromptPresetId: null
        });
        actions.updateStatus(`Deleted preset "${selectedPreset.name}".`);
        rerender();
      }
    }
  ]);
  ui.addText(section, "customPositivePrefix", "Custom author tags (Positive prefix / CustomPos)", "Tags prepended to the [Positive] prompt (V3.7.6 toggle_Card.CustomPos / 커스텀 작가 태그).");
  ui.addText(section, "customPositiveSuffix", "Custom quality tags (Positive suffix / CustomNeg)", "Tags appended to the [Positive] prompt (V3.7.6 toggle_Card.CustomNeg / 커스텀 퀄리티 태그 - source positive suffix, NOT negative prompt!).");
  ui.addText(section, "customNegative", "Negative prompt additions", "Additional tags appended to the negative prompt.");
}

// src/frontend/sections/index.ts
function renderSettingsSections(context) {
  renderGenerationSection(context);
  renderParserSection(context);
  renderPromptSection(context);
  renderOutputSection(context);
  renderDisplaySection(context);
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
  section(title, defaultExpanded, options = {}) {
    const host = document.createElement("section");
    host.className = "inlay-section-host";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "inlay-section-toggle";
    const heading = document.createElement("span");
    heading.className = "inlay-section-heading";
    const label = document.createElement("span");
    label.className = "inlay-section-title";
    label.textContent = title;
    heading.append(label);
    if (options.description) {
      const description = document.createElement("span");
      description.className = "inlay-section-description";
      description.textContent = options.description;
      heading.append(description);
    }
    const trailing = document.createElement("span");
    trailing.className = "inlay-section-trailing";
    if (options.badge) {
      const badge = document.createElement("span");
      badge.className = "inlay-section-badge";
      badge.textContent = options.badge;
      trailing.append(badge);
    }
    const chevron = document.createElement("span");
    chevron.className = "inlay-section-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";
    trailing.append(chevron);
    toggle.append(heading, trailing);
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
  row(parent, label, hint = "", fullWidth = false) {
    const wrapper = document.createElement("div");
    wrapper.className = "inlay-row";
    if (fullWidth)
      wrapper.classList.add("inlay-row-full");
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
    labels.style.gridTemplateColumns = `repeat(${Math.max(1, choices.length)}, minmax(0, 1fr))`;
    const labelNodes = choices.map((choice) => {
      const node = document.createElement("span");
      node.textContent = choice.label;
      labels.append(node);
      return node;
    });
    const update = () => {
      const index = Number(input.value);
      labelNodes.forEach((node, candidate) => node.classList.toggle("is-active", candidate === index));
      input.setAttribute("aria-valuetext", choices[index]?.label || String(index));
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
      ariaLabel: label,
      onChange: (value) => {
        if (value === null)
          return;
        const patch = { [key]: value };
        if (key === "minImages" && value > this.config.maxImages)
          patch.maxImages = value;
        else if (key === "maxImages" && value < this.config.minImages)
          patch.minImages = value;
        else if (key === "includeMinMessages" && value > this.config.includeMaxMessages)
          patch.includeMaxMessages = value;
        else if (key === "includeMaxMessages" && value < this.config.includeMinMessages)
          patch.includeMinMessages = value;
        Object.assign(this.config, patch);
        this.patchConfig(patch);
      }
    }));
  }
  addSelect(parent, key, label, options, hint = "", afterChange) {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountSelect(target, {
      value: String(this.config[key] || ""),
      options,
      placeholder: `Select ${label.toLowerCase()}`,
      emptyMessage: "No options available",
      ariaLabel: label,
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
      button.disabled = action.disabled === true;
      if (action.title)
        button.title = action.title;
      if (action.primary)
        button.classList.add("inlay-primary");
      if (action.danger)
        button.classList.add("inlay-danger");
      button.addEventListener("click", () => {
        action.onClick();
      });
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
  async confirmDestructive(title, message, confirmLabel = "Delete") {
    if (typeof this.ctx.ui.showConfirm !== "function")
      return window.confirm(message);
    const result = await this.ctx.ui.showConfirm({
      title,
      message,
      variant: "danger",
      confirmLabel,
      cancelLabel: "Cancel"
    });
    return result.confirmed;
  }
  addNotice(parent, text, tone = "info") {
    const notice = document.createElement("div");
    notice.className = "inlay-notice";
    notice.dataset.tone = tone;
    notice.textContent = text;
    parent.append(notice);
  }
  addSummary(parent, text) {
    const summary = document.createElement("div");
    summary.className = "inlay-parser-summary";
    summary.textContent = text;
    parent.append(summary);
  }
  addCustomSelect(parent, label, value, options, hint = "", onChange) {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountSelect(target, {
      value,
      options,
      placeholder: `Select ${label.toLowerCase()}`,
      emptyMessage: "No options available",
      ariaLabel: label,
      className: "inlay-select-control",
      triggerClassName: "inlay-select-trigger",
      portal: true,
      onChange: (next) => {
        onChange?.(next);
      }
    }));
  }
  addCustomNumber(parent, label, value, min, max, hint = "", onChange, integer = true) {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountNumericInput(target, {
      value,
      min,
      max,
      integer,
      ariaLabel: label,
      onChange: (next) => {
        onChange?.(next);
      }
    }));
  }
  addCustomSwitch(parent, label, checked, hint = "", onChange) {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountSwitch(target, {
      checked,
      ariaLabel: label,
      onChange: (next) => {
        onChange?.(next);
      }
    }));
  }
  addCustomText(parent, label, value, hint = "", onChange) {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountTextInput(target, {
      value,
      ariaLabel: label,
      onChange: (next) => {
        onChange?.(next);
      }
    }));
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
    this.root.innerHTML = `
      <div class="inlay-panel">
        <header class="inlay-overview">
          <div class="inlay-overview-heading">
            <div>
              <div class="inlay-eyebrow">Illustration sidecar</div>
              <h2>Inlay Illustrator</h2>
              <p>Turn the latest assistant response into source-faithful illustrations.</p>
            </div>
            <button type="button" class="inlay-power-button"></button>
          </div>
          <div class="inlay-overview-meta"></div>
          <div class="inlay-overview-actions">
            <button type="button" class="inlay-primary inlay-generate-action">Generate latest</button>
            <button type="button" class="inlay-cancel-action">Cancel</button>
          </div>
        </header>
        <div class="inlay-status" role="status" aria-live="polite" aria-atomic="true">
          <span class="inlay-status-dot" aria-hidden="true"></span>
          <div><span class="inlay-status-label">Status</span><span class="inlay-status-text"></span></div>
        </div>
        <div class="inlay-sections"></div>
      </div>`;
    const snapshot = this.getSnapshot();
    const sections = this.root.querySelector(".inlay-sections");
    const power = this.root.querySelector(".inlay-power-button");
    const generate = this.root.querySelector(".inlay-generate-action");
    const cancel = this.root.querySelector(".inlay-cancel-action");
    const meta = this.root.querySelector(".inlay-overview-meta");
    power.textContent = snapshot.config.enabled ? "On" : "Paused";
    power.setAttribute("aria-pressed", String(snapshot.config.enabled));
    power.setAttribute("aria-label", snapshot.config.enabled ? "Pause Inlay Illustrator" : "Enable Inlay Illustrator");
    power.dataset.enabled = String(snapshot.config.enabled);
    power.addEventListener("click", () => {
      this.actions.patchConfig({ enabled: !snapshot.config.enabled });
      this.render();
    });
    for (const label of [
      generationSummary(snapshot.config),
      snapshot.config.autoGenerate ? "Auto generation" : "Manual generation",
      snapshot.config.fastMode ? "Fast mode" : "Full context"
    ]) {
      const chip = document.createElement("span");
      chip.textContent = label;
      meta.append(chip);
    }
    const chatId = this.actions.activeChatId();
    generate.disabled = !chatId || isBusyStatus(snapshot.status);
    generate.title = chatId ? "Generate illustrations for the latest assistant response" : "Open a chat to generate illustrations";
    generate.addEventListener("click", () => {
      this.actions.updateStatus("Generating…");
      this.actions.sendToBackend({ type: "generate_latest", chatId: this.actions.activeChatId() });
    });
    cancel.disabled = !isBusyStatus(snapshot.status);
    cancel.addEventListener("click", () => {
      this.actions.updateStatus("Requesting cancellation…");
      this.actions.sendToBackend({ type: "cancel_generation", chatId: this.actions.activeChatId() });
    });
    this.updateStatus(snapshot.status);
    const ui = new UiBuilder(this.ctx, sections, snapshot.config, this.actions.patchConfig, this.expandedSections, (component) => this.mountedComponents.push(component));
    renderSettingsSections({
      ui,
      config: snapshot.config,
      parserConnections: snapshot.parserConnections,
      imageConnections: snapshot.imageConnections,
      characterAppearance: snapshot.characterAppearance,
      actions: this.actions,
      rerender: () => this.render()
    });
  }
  updateStatus(status) {
    const host = this.root.querySelector(".inlay-status");
    const text = this.root.querySelector(".inlay-status-text");
    if (!host || !text)
      return;
    host.dataset.tone = statusTone(status);
    text.textContent = status || "Ready";
    const busy = isBusyStatus(status);
    const cancel = this.root.querySelector(".inlay-cancel-action");
    const generate = this.root.querySelector(".inlay-generate-action");
    if (cancel)
      cancel.disabled = !busy || /requesting cancellation/i.test(status);
    if (generate)
      generate.disabled = busy || !this.actions.activeChatId();
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
  root.querySelectorAll(INLAY_IMAGE_SELECTOR).forEach((image) => {
    image.removeAttribute("data-lightbox");
    if (!image.hasAttribute("tabindex"))
      image.setAttribute("tabindex", "0");
    if (!image.hasAttribute("role"))
      image.setAttribute("role", "button");
    if (!image.hasAttribute("aria-label"))
      image.setAttribute("aria-label", "Open illustration details");
  });
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
  const headingRow = document.createElement("div");
  headingRow.className = "inlay-lightbox-prompt-heading";
  const heading = document.createElement("h4");
  heading.textContent = label;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy";
  copy.setAttribute("aria-label", `Copy ${label.toLowerCase()}`);
  const content = document.createElement("pre");
  content.className = "inlay-lightbox-prompt";
  content.textContent = value || fallback;
  copy.addEventListener("click", () => {
    const pending = navigator.clipboard?.writeText(content.textContent || "");
    if (!pending) {
      copy.textContent = "Select text";
      return;
    }
    pending.then(() => {
      copy.textContent = "Copied";
      window.setTimeout(() => {
        copy.textContent = "Copy";
      }, 1400);
    }).catch(() => {
      copy.textContent = "Select text";
    });
  });
  headingRow.append(heading, copy);
  block.append(headingRow, content);
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
  const onKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ")
      return;
    const image = findInlayImage(event.target);
    if (!image)
      return;
    event.preventDefault();
    image.click();
  };
  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKeyDown, true);
  return () => {
    observer.disconnect();
    unsubscribeResults();
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("keydown", onKeyDown, true);
    activeModal?.dismiss();
    activeModal = null;
  };
}

// src/frontend/fab.ts
var FAB_INSET_PX = 20;
var FAB_MENU_GAP_PX = 8;
var FAB_MENU_MARGIN_PX = 8;
var FAB_CSS = `
.inlay-fab {
  position: fixed;
  width: 48px;
  height: 48px;
  border-radius: 24px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: var(--lumiverse-primary, #6366f1);
  color: var(--lumiverse-primary-contrast, #ffffff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 9950;
  box-shadow: var(--lumiverse-shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.3));
  overflow: hidden;
  white-space: nowrap;
  padding: 0;
  box-sizing: border-box;
  font-family: inherit;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              padding 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.15s ease,
              box-shadow 0.15s ease,
              background-color 0.2s ease;
}
.inlay-fab:focus-visible {
  outline: 2px solid var(--lumiverse-primary, #6366f1);
  outline-offset: 2px;
}
.inlay-fab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.inlay-fab-icon svg {
  width: 24px;
  height: 24px;
}
.inlay-fab-label {
  display: inline-block;
  max-width: 0;
  opacity: 0;
  margin-left: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: inherit;
  pointer-events: none;
  transition: max-width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.2s ease,
              margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Normal state (images present) hover */
.inlay-fab:not(.inlay-fab-empty-turn):hover,
.inlay-fab:not(.inlay-fab-empty-turn):focus-visible {
  transform: scale(1.06);
}

/* Empty turn (no images yet): smooth expansion from circle to pill with text on hover or keyboard focus */
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):hover,
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):focus-visible {
  width: 176px;
  padding: 0 16px 0 12px;
  background: var(--lumiverse-primary-hover, #4f46e5);
  box-shadow: var(--lumiverse-shadow-xl, 0 15px 30px rgba(0, 0, 0, 0.4));
}
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):hover .inlay-fab-label,
.inlay-fab.inlay-fab-empty-turn:not(.inlay-fab-busy):focus-visible .inlay-fab-label {
  max-width: 120px;
  opacity: 1;
  margin-left: 8px;
}

/* Busy indicator */
.inlay-fab.inlay-fab-busy {
  cursor: progress;
}
.inlay-fab.inlay-fab-busy .inlay-fab-icon svg {
  animation: inlay-fab-spin 1s linear infinite;
}

/* Action Popup Menu */
.inlay-fab-menu {
  position: fixed;
  min-width: 230px;
  padding: 6px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  border-radius: 12px;
  background: var(--lumiverse-card-bg, #1a1b26);
  color: var(--lumiverse-text, #f0f0f5);
  box-shadow: var(--lumiverse-shadow-xl, 0 15px 30px rgba(0, 0, 0, 0.4));
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 9951;
}
.inlay-fab-menu[hidden] {
  display: none;
}
.inlay-fab-menu[aria-hidden="true"] {
  display: none;
}
.inlay-fab-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--lumiverse-text, #f0f0f5);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}
.inlay-fab-menu button:hover {
  background: var(--lumiverse-fill-hover, rgba(255, 255, 255, 0.08));
}
.inlay-fab-menu button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.inlay-fab-menu svg {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
}
@keyframes inlay-fab-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .inlay-fab {
    transition: none;
  }
  .inlay-fab:hover {
    transform: none;
  }
  .inlay-fab-label {
    transition: none;
  }
  .inlay-fab.inlay-fab-busy .inlay-fab-icon svg {
    animation-duration: 2.5s;
  }
}
`;
var SVG_INLAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" y1="22" x2="12" y2="12"></line></svg>`;
var SVG_GENERATE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/></svg>`;
var SVG_REFRESH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
var SVG_LLM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01"/></svg>`;
var SVG_GALLERY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
var MENU_REROLL = "reroll";
var MENU_SIDECAR = "sidecar";
var MENU_GALLERY = "gallery";
var MENU_SETTINGS = "settings";
var SVG_SETTINGS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
function px(value) {
  return `${value}px`;
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function fabButtonEdges(corner) {
  const inset = px(FAB_INSET_PX);
  if (corner === "bottom-right")
    return { right: inset, bottom: inset, left: "auto", top: "auto" };
  if (corner === "bottom-left")
    return { left: inset, bottom: inset, right: "auto", top: "auto" };
  if (corner === "top-right")
    return { right: inset, top: inset, left: "auto", bottom: "auto" };
  return { left: inset, top: inset, right: "auto", bottom: "auto" };
}
function fabButtonRect(corner, viewport) {
  const size = 48;
  const left = corner.endsWith("-right") ? viewport.width - FAB_INSET_PX - size : FAB_INSET_PX;
  const top = corner.startsWith("top") ? FAB_INSET_PX : viewport.height - FAB_INSET_PX - size;
  return { left, top, right: left + size, bottom: top + size, width: size, height: size };
}
function fabMenuPosition(corner, button, menu, viewport, gap = FAB_MENU_GAP_PX, margin = FAB_MENU_MARGIN_PX) {
  const anchorRight = corner.endsWith("-right");
  const opensDownward = corner.startsWith("top");
  let left = anchorRight ? button.right - menu.width : button.left;
  left = clamp(left, margin, Math.max(margin, viewport.width - margin - menu.width));
  let top;
  if (opensDownward) {
    top = button.bottom + gap;
    const flipped = button.top - gap - menu.height;
    if (top + menu.height > viewport.height - margin && flipped >= margin)
      top = flipped;
  } else {
    top = button.top - gap - menu.height;
    const flipped = button.bottom + gap;
    if (top < margin && flipped + menu.height <= viewport.height - margin)
      top = flipped;
  }
  top = clamp(top, margin, Math.max(margin, viewport.height - margin - menu.height));
  return { left, top };
}
function makeRequestId(prefix = "inlay-fab") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function installInlayFab(ctx, options) {
  if (typeof document === "undefined")
    return () => {};
  let corner = normalizeFabCorner(options.getCorner());
  let busy = false;
  let menuOpen = false;
  let hasImagesThisTurn = null;
  const removeStyle = ctx.dom.addStyle(FAB_CSS);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "inlay-fab";
  button.setAttribute("aria-label", "Inlay Illustrator actions");
  const iconWrap = document.createElement("span");
  iconWrap.className = "inlay-fab-icon";
  iconWrap.innerHTML = SVG_INLAY;
  const labelSpan = document.createElement("span");
  labelSpan.className = "inlay-fab-label";
  labelSpan.textContent = "Generate images";
  button.append(iconWrap, labelSpan);
  const menu = document.createElement("div");
  menu.className = "inlay-fab-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-hidden", "true");
  menu.hidden = true;
  function menuItem(action, label, svg) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.innerHTML = `${svg}<span>${label}</span>`;
    item.addEventListener("click", () => {
      closeMenu();
      run(action);
    });
    return item;
  }
  const rerollItem = menuItem(MENU_REROLL, "Reroll images (from this turn)", SVG_REFRESH);
  const sidecarItem = menuItem(MENU_SIDECAR, "Reroll images with sidecar (from this turn)", SVG_LLM);
  const galleryItem = menuItem(MENU_GALLERY, "Open Gallery", SVG_GALLERY);
  const settingsItem = menuItem(MENU_SETTINGS, "Open Settings", SVG_SETTINGS);
  menu.append(rerollItem, sidecarItem, galleryItem, settingsItem);
  function applyEdges(element, edges) {
    element.style.left = edges.left ?? "auto";
    element.style.right = edges.right ?? "auto";
    element.style.top = edges.top ?? "auto";
    element.style.bottom = edges.bottom ?? "auto";
  }
  function positionFab() {
    applyEdges(button, fabButtonEdges(corner));
  }
  function positionMenu() {
    const buttonRect = typeof button.getBoundingClientRect === "function" ? button.getBoundingClientRect() : fabButtonRect(corner, { width: window.innerWidth, height: window.innerHeight });
    const measured = typeof menu.getBoundingClientRect === "function" ? menu.getBoundingClientRect() : { width: 0, height: 0 };
    const menuWidth = measured && measured.width > 0 ? measured.width : 230;
    const menuHeight = measured && measured.height > 0 ? measured.height : 140;
    const position = fabMenuPosition(corner, {
      left: buttonRect.left,
      top: buttonRect.top,
      right: buttonRect.right,
      bottom: buttonRect.bottom,
      width: buttonRect.width,
      height: buttonRect.height
    }, { width: menuWidth, height: menuHeight }, { width: window.innerWidth, height: window.innerHeight });
    menu.style.left = px(position.left);
    menu.style.top = px(position.top);
    menu.style.right = "auto";
    menu.style.bottom = "auto";
  }
  function openMenu() {
    if (menuOpen || busy)
      return;
    menuOpen = true;
    menu.hidden = false;
    menu.setAttribute("aria-hidden", "false");
    positionMenu();
    button.setAttribute("aria-expanded", "true");
    rerollItem.disabled = busy;
    sidecarItem.disabled = busy;
  }
  function closeMenu() {
    if (!menuOpen)
      return;
    menuOpen = false;
    menu.hidden = true;
    menu.setAttribute("aria-hidden", "true");
    button.setAttribute("aria-expanded", "false");
  }
  function updateTurnState(hasImages) {
    if (hasImagesThisTurn === hasImages && button.classList.contains("inlay-fab-empty-turn") !== hasImages) {
      return;
    }
    hasImagesThisTurn = hasImages;
    button.classList.toggle("inlay-fab-empty-turn", !hasImages);
    if (!hasImages) {
      iconWrap.innerHTML = SVG_GENERATE;
      button.title = "Generate illustrations for this message";
      button.setAttribute("aria-label", "Generate illustrations for this message");
      button.removeAttribute("aria-haspopup");
      button.removeAttribute("aria-expanded");
      closeMenu();
    } else {
      iconWrap.innerHTML = SVG_INLAY;
      button.title = "Inlay Illustrator actions";
      button.setAttribute("aria-label", "Inlay Illustrator actions");
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", String(menuOpen));
    }
  }
  function setBusy(next) {
    busy = next;
    button.classList.toggle("inlay-fab-busy", next);
    if (menuOpen) {
      rerollItem.disabled = next;
      sidecarItem.disabled = next;
    }
  }
  function activeChatId() {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }
  function detectCurrentTurnImages() {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function")
      return false;
    try {
      const messages = Array.from(document.querySelectorAll("[data-message-id], .chat-message, .message")).filter((el) => {
        if (typeof el.closest === "function") {
          return !el.closest(".inlay-gallery") && !el.closest(".inlay-modal-dialog");
        }
        return true;
      });
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && typeof lastMsg.querySelector === "function") {
          const img = lastMsg.querySelector('[data-inlay-illustrator="true"] img');
          return Boolean(img && (img.currentSrc || img.src || img.getAttribute("data-inlay-illustrator-image-url")));
        }
        return false;
      }
      const inlays = Array.from(document.querySelectorAll('[data-inlay-illustrator="true"]')).filter((el) => {
        if (typeof el.closest === "function") {
          return !el.closest(".inlay-gallery") && !el.closest(".inlay-modal-dialog");
        }
        return true;
      });
      if (inlays.length === 0)
        return false;
      const lastInlay = inlays[inlays.length - 1];
      if (!lastInlay || typeof lastInlay.querySelector !== "function")
        return false;
      const img = lastInlay.querySelector("img");
      return Boolean(img && (img.currentSrc || img.src || img.getAttribute("data-inlay-illustrator-image-url")));
    } catch {
      return false;
    }
  }
  function checkTurnState() {
    const hasImages = detectCurrentTurnImages();
    updateTurnState(hasImages);
  }
  function run(action) {
    if (action === MENU_SETTINGS) {
      if (typeof options.openSettings === "function") {
        options.openSettings();
      }
      return;
    }
    if (action === MENU_GALLERY) {
      options.openGallery();
      return;
    }
    const chatId = activeChatId();
    if (!chatId)
      return;
    setBusy(true);
    ctx.sendToBackend({
      type: "reroll_all_images",
      requestId: makeRequestId("inlay-fab-reroll-all"),
      chatId,
      sidecar: action === MENU_SIDECAR
    });
  }
  function handleButtonClick() {
    if (busy)
      return;
    if (!hasImagesThisTurn) {
      const chatId = activeChatId();
      if (!chatId)
        return;
      setBusy(true);
      ctx.sendToBackend({
        type: "generate_latest",
        chatId
      });
      return;
    }
    if (menuOpen)
      closeMenu();
    else
      openMenu();
  }
  button.addEventListener("click", handleButtonClick);
  const onDocumentClick = (event) => {
    if (!menuOpen)
      return;
    const target = event.target;
    if (menu.contains(target) || button.contains(target))
      return;
    closeMenu();
  };
  const onDocumentKey = (event) => {
    if (event.key === "Escape")
      closeMenu();
  };
  const onResize = () => {
    if (menuOpen)
      positionMenu();
  };
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKey, true);
  window.addEventListener("resize", onResize);
  document.body.append(button, menu);
  positionFab();
  checkTurnState();
  let chatObserver = null;
  let checkDebounceTimer = null;
  if (typeof MutationObserver !== "undefined" && document.body) {
    try {
      chatObserver = new MutationObserver((mutations) => {
        const external = mutations.some((m) => {
          const target = m.target;
          return !button.contains(target) && !menu.contains(target);
        });
        if (!external)
          return;
        if (checkDebounceTimer)
          clearTimeout(checkDebounceTimer);
        checkDebounceTimer = setTimeout(() => {
          checkTurnState();
        }, 50);
      });
      chatObserver.observe(document.body, { childList: true, subtree: true });
    } catch {
      chatObserver = null;
    }
  }
  function setCorner(next) {
    corner = normalizeFabCorner(next);
    positionFab();
    if (menuOpen)
      positionMenu();
  }
  const unsubscribeBackend = ctx.onBackendMessage((payload) => {
    if (!payload || typeof payload !== "object")
      return;
    const message = payload;
    if (message.type === "status") {
      if (typeof message.busy === "boolean") {
        setBusy(message.busy === true);
      } else {
        const s = String(message.status || "");
        if (s === "Generated" || s === "Error" || s === "Ready" || s === "Skipped" || s === "No image generated" || s === "Already generated" || s.startsWith("Error:") || Boolean(message.error)) {
          setBusy(false);
        }
      }
      checkTurnState();
    } else if (message.type === "generation_progress") {
      const stage = String(message.stage || "");
      if (stage === "completed" || stage === "failed" || stage === "cancelled") {
        setBusy(false);
      }
      checkTurnState();
    } else if (message.type === "config_updated" || message.type === "state") {
      const config = message.config && typeof message.config === "object" ? message.config : null;
      if (config && config.fabCorner !== undefined) {
        setCorner(config.fabCorner);
      }
      checkTurnState();
    } else if (message.type === "inlay_reroll_all_result" || message.type === "inlay_image_action_result") {
      setBusy(false);
      checkTurnState();
    }
  });
  return () => {
    unsubscribeBackend();
    if (checkDebounceTimer)
      clearTimeout(checkDebounceTimer);
    chatObserver?.disconnect();
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onDocumentKey, true);
    window.removeEventListener("resize", onResize);
    closeMenu();
    button.remove();
    menu.remove();
    removeStyle();
  };
}

// src/frontend/modal.ts
var activeModalCount = 0;
var previousBodyOverflow = "";
var modalStack = [];
var MODAL_CSS = `
.inlay-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9980;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.inlay-modal-backdrop.is-open {
  opacity: 1;
}
.inlay-modal-dialog {
  position: relative;
  width: 100%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--lumiverse-card-bg, #1a1b26);
  color: var(--lumiverse-text, #f0f0f5);
  border: 1px solid var(--lumiverse-border, #2e3048);
  border-radius: 14px;
  box-shadow: var(--lumiverse-shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.5));
  overflow: hidden;
  outline: none;
  transform: scale(0.96) translateY(8px);
  opacity: 0;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.inlay-modal-backdrop.is-open .inlay-modal-dialog {
  transform: scale(1) translateY(0);
  opacity: 1;
}
.inlay-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--lumiverse-border, #2e3048);
  background: var(--lumiverse-header-bg, rgba(255, 255, 255, 0.03));
  flex-shrink: 0;
}
.inlay-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--lumiverse-text, #f0f0f5);
  line-height: 1.4;
}
.inlay-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--lumiverse-text-muted, #8a8d9b);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.inlay-modal-close:hover {
  background: var(--lumiverse-fill-hover, rgba(255, 255, 255, 0.08));
  color: var(--lumiverse-text, #ffffff);
}
.inlay-modal-close:focus-visible {
  outline: 2px solid var(--lumiverse-primary, #6366f1);
  outline-offset: 2px;
}
.inlay-modal-body {
  flex: 1 1 auto;
  padding: 16px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
@media (prefers-reduced-motion: reduce) {
  .inlay-modal-backdrop,
  .inlay-modal-dialog {
    transition: none;
  }
}
`;
function ensureModalStyles() {
  if (typeof document === "undefined")
    return;
  const styleId = "inlay-native-modal-styles";
  if (typeof document.getElementById === "function") {
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = MODAL_CSS;
      if (document.head && typeof document.head.append === "function") {
        document.head.append(styleEl);
      }
    }
  }
}
function cleanupModalStyles() {
  if (typeof document === "undefined")
    return;
  const styleEl = document.getElementById("inlay-native-modal-styles");
  if (styleEl && typeof styleEl.remove === "function") {
    styleEl.remove();
  }
  activeModalCount = 0;
  modalStack.length = 0;
  if (document.body) {
    document.body.style.overflow = previousBodyOverflow || "";
    previousBodyOverflow = "";
  }
}
function showNativeModal(options) {
  if (typeof document === "undefined") {
    return {
      root: {},
      dialog: {},
      overlay: {},
      dismiss: () => {},
      onDismiss: (cb) => {
        cb();
      }
    };
  }
  ensureModalStyles();
  const activeElementBefore = typeof document !== "undefined" && typeof HTMLElement !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const backdrop = document.createElement("div");
  backdrop.className = "inlay-modal-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  const dialog = document.createElement("div");
  dialog.className = `inlay-modal-dialog ${options.className || ""}`.trim();
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.tabIndex = -1;
  if (options.width) {
    dialog.style.maxWidth = typeof options.width === "number" ? `${options.width}px` : options.width;
  }
  if (options.maxHeight) {
    dialog.style.maxHeight = typeof options.maxHeight === "number" ? `${options.maxHeight}px` : options.maxHeight;
  }
  const titleId = `inlay-modal-title-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  dialog.setAttribute("aria-labelledby", titleId);
  const header = document.createElement("div");
  header.className = "inlay-modal-header";
  const title = document.createElement("h3");
  title.id = titleId;
  title.className = "inlay-modal-title";
  title.textContent = options.title;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "inlay-modal-close";
  closeBtn.setAttribute("aria-label", "Close dialog");
  closeBtn.innerHTML = "&times;";
  header.append(title, closeBtn);
  const body = document.createElement("div");
  body.className = "inlay-modal-body";
  dialog.append(header, body);
  backdrop.append(dialog);
  let isDismissed = false;
  let mouseDownTarget = null;
  const dismissCallbacks = [];
  const handle = {
    root: body,
    dialog,
    overlay: backdrop,
    dismiss,
    onDismiss(cb) {
      if (isDismissed) {
        cb();
      } else {
        dismissCallbacks.push(cb);
      }
    }
  };
  modalStack.push(handle);
  if (typeof document !== "undefined" && document.body) {
    if (activeModalCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    activeModalCount++;
    document.body.append(backdrop);
  }
  requestAnimationFrame(() => {
    if (isDismissed)
      return;
    backdrop.classList.add("is-open");
    backdrop.removeAttribute("aria-hidden");
    dialog.focus();
  });
  function dismiss() {
    if (isDismissed)
      return;
    isDismissed = true;
    const stackIndex = modalStack.indexOf(handle);
    if (stackIndex >= 0)
      modalStack.splice(stackIndex, 1);
    backdrop.classList.remove("is-open");
    backdrop.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKeyDown, false);
    backdrop.removeEventListener("click", onBackdropClick);
    backdrop.removeEventListener("mousedown", onBackdropMouseDown);
    activeModalCount = Math.max(0, activeModalCount - 1);
    if (activeModalCount === 0 && typeof document !== "undefined" && document.body) {
      document.body.style.overflow = previousBodyOverflow || "";
    }
    setTimeout(() => {
      backdrop.remove();
      for (const cb of dismissCallbacks) {
        try {
          cb();
        } catch {}
      }
      dismissCallbacks.length = 0;
      activeElementBefore?.focus();
    }, 200);
  }
  function onBackdropMouseDown(e) {
    mouseDownTarget = e.target;
  }
  function onBackdropClick(e) {
    if (e.target === backdrop && mouseDownTarget === backdrop) {
      dismiss();
    }
    mouseDownTarget = null;
  }
  function getFocusableElements() {
    return Array.from(dialog.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), a[href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hidden && (!el.style || el.style.display !== "none") && (typeof el.closest !== "function" || el.closest("[hidden]") === null));
  }
  function onKeyDown(e) {
    if (isDismissed)
      return;
    if (modalStack.length > 0 && modalStack[modalStack.length - 1] !== handle) {
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key === "Tab") {
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === dialog) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }
  closeBtn.addEventListener("click", () => dismiss());
  backdrop.addEventListener("mousedown", onBackdropMouseDown);
  backdrop.addEventListener("click", onBackdropClick);
  document.addEventListener("keydown", onKeyDown, false);
  return handle;
}

// src/frontend/gallery.ts
var CHATS_PER_PAGE = 5;
function makeRequestId2() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
var GALLERY_CSS = `
.inlay-gallery {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: inherit;
  color: var(--lumiverse-text, #f0f0f5);
}
.inlay-gallery-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.inlay-gallery-chat-select {
  flex: 1 1 auto;
  max-width: 400px;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: var(--lumiverse-input-bg, #1a1b26);
  color: var(--lumiverse-text, #f0f0f5);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.inlay-gallery-chat-select:focus-visible {
  border-color: var(--lumiverse-primary, #6366f1);
  outline: 2px solid var(--lumiverse-primary, #6366f1);
  outline-offset: 1px;
}
.inlay-gallery-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  font-size: 13px;
  color: var(--lumiverse-text-muted, #8a8d9b);
}
.inlay-gallery-pagination button {
  height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: transparent;
  color: var(--lumiverse-text, #f0f0f5);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.inlay-gallery-pagination button:hover:not(:disabled) {
  background: var(--lumiverse-fill-hover, rgba(255, 255, 255, 0.08));
}
.inlay-gallery-pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.inlay-gallery-status {
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 13px;
  color: var(--lumiverse-text-muted, #8a8d9b);
}
.inlay-gallery-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--lumiverse-text-muted, #8a8d9b);
  font-size: 14px;
}
.inlay-gallery-chat {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--lumiverse-border, rgba(255, 255, 255, 0.08));
}
.inlay-gallery-chat:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.inlay-gallery-chat-heading {
  font-size: 15px;
  font-weight: 600;
  color: var(--lumiverse-text, #f0f0f5);
}
.inlay-gallery-chat-meta {
  font-size: 12px;
  color: var(--lumiverse-text-muted, #8a8d9b);
}
.inlay-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.inlay-gallery-card {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--lumiverse-border, #3b3b44);
  background: var(--lumiverse-card-bg, #202230);
  overflow: hidden;
  box-shadow: var(--lumiverse-shadow-sm, 0 2px 4px rgba(0, 0, 0, 0.2));
}
.inlay-gallery-badge {
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.3);
  font-size: 11px;
  font-weight: 600;
  color: var(--lumiverse-text-muted, #a0a3b2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.inlay-gallery-image-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  overflow: hidden;
  cursor: pointer;
}
.inlay-gallery-image-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
}
.inlay-gallery-image-wrap:hover img {
  transform: scale(1.04);
}
.inlay-gallery-quote {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  font-style: italic;
  color: var(--lumiverse-text-muted, #cbd0e0);
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
`;
function createInlayGallery(ctx) {
  let activeModal = null;
  let activeRoot = null;
  let navRoot = null;
  let paginationRoot = null;
  let contentRoot = null;
  let statusRoot = null;
  let currentPage = 1;
  let selectedChatId = null;
  let savedAllPage = 1;
  let chatIds = [];
  const chatLabels = new Map;
  let totalChats = 0;
  let totalPages = 1;
  let isDismissed = false;
  let pendingRequestId = null;
  const removeStyle = ctx.dom.addStyle(GALLERY_CSS);
  function showStatus(message, isError = false) {
    if (!statusRoot)
      return;
    statusRoot.textContent = message;
    statusRoot.hidden = !message;
    statusRoot.setAttribute("role", isError ? "alert" : "status");
    statusRoot.setAttribute("aria-live", isError ? "assertive" : "polite");
  }
  function clearContent() {
    if (contentRoot)
      contentRoot.replaceChildren();
    if (statusRoot) {
      statusRoot.textContent = "";
      statusRoot.hidden = true;
    }
  }
  function renderLoading() {
    clearContent();
    if (!contentRoot)
      return;
    const node = document.createElement("div");
    node.className = "inlay-gallery-status";
    node.textContent = "Loading gallery…";
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-busy", "true");
    contentRoot.append(node);
    showStatus("Loading gallery…");
  }
  function renderError(message) {
    clearContent();
    if (!contentRoot)
      return;
    const node = document.createElement("div");
    node.className = "inlay-gallery-status";
    node.textContent = message || "Failed to load gallery.";
    node.setAttribute("role", "alert");
    contentRoot.append(node);
    showStatus(message || "Failed to load gallery.", true);
  }
  function renderEmpty(message = "No saved Inlay history.") {
    clearContent();
    if (!contentRoot)
      return;
    const node = document.createElement("div");
    node.className = "inlay-gallery-empty";
    node.textContent = message;
    contentRoot.append(node);
  }
  function createImageCard(image) {
    const card = document.createElement("div");
    card.className = "inlay-gallery-card";
    const badge = document.createElement("div");
    badge.className = "inlay-gallery-badge";
    badge.textContent = `Paragraph ${image.paragraph}`;
    card.append(badge);
    const wrap = document.createElement("div");
    wrap.className = "inlay-gallery-image-wrap";
    wrap.setAttribute("data-inlay-illustrator", "true");
    const img = document.createElement("img");
    img.src = image.imageUrl;
    img.alt = `Inlay ${image.imageIndex + 1} paragraph ${image.paragraph}`;
    img.loading = "lazy";
    img.setAttribute("data-inlay-illustrator-chat-id", image.chatId);
    img.setAttribute("data-inlay-illustrator-message-id", image.messageId);
    img.setAttribute("data-inlay-illustrator-swipe-id", String(image.swipeId ?? 0));
    img.setAttribute("data-inlay-illustrator-image-index", String(image.imageIndex ?? 0));
    if (image.imageId)
      img.setAttribute("data-inlay-illustrator-image-id", image.imageId);
    img.setAttribute("data-inlay-illustrator-prompt", image.prompt || "");
    img.setAttribute("data-inlay-illustrator-negative-prompt", image.negativePrompt || "");
    if (image.quote)
      img.setAttribute("data-inlay-illustrator-quote", image.quote);
    wrap.append(img);
    card.append(wrap);
    if (image.quote) {
      const quote = document.createElement("blockquote");
      quote.className = "inlay-gallery-quote";
      quote.textContent = image.quote;
      card.append(quote);
    }
    return card;
  }
  function renderChatSection(chat, showHeading) {
    const section = document.createElement("section");
    section.className = "inlay-gallery-chat";
    if (showHeading) {
      const heading = document.createElement("div");
      heading.className = "inlay-gallery-chat-heading";
      heading.textContent = `\uD83D\uDCAC ${chat.cardName || chat.name || `Chat #${chat.chatId}`}`;
      section.append(heading);
      const metaBits = [];
      if (typeof chat.messageCount === "number") {
        metaBits.push(`${chat.messageCount} message${chat.messageCount === 1 ? "" : "s"}`);
      }
      if (chat.images && chat.images.length) {
        metaBits.push(`${chat.images.length} image${chat.images.length === 1 ? "" : "s"}`);
      }
      if (typeof chat.branchCount === "number" && chat.branchCount > 0) {
        metaBits.push(`${chat.branchCount} branch${chat.branchCount === 1 ? "" : "es"}`);
      }
      if (chat.cardName && chat.name && chat.name !== chat.cardName) {
        metaBits.unshift(chat.name);
      }
      if (metaBits.length) {
        const meta = document.createElement("div");
        meta.className = "inlay-gallery-chat-meta";
        meta.textContent = metaBits.join(" · ");
        section.append(meta);
      }
    }
    const grid = document.createElement("div");
    grid.className = "inlay-gallery-grid";
    const sorted = [...chat.images].sort((a, b) => a.paragraph - b.paragraph || a.imageIndex - b.imageIndex);
    for (const image of sorted) {
      grid.append(createImageCard(image));
    }
    section.append(grid);
    return section;
  }
  function renderNav() {
    if (!navRoot)
      return;
    navRoot.replaceChildren();
    const select = document.createElement("select");
    select.className = "inlay-gallery-chat-select";
    select.setAttribute("aria-label", "Filter gallery by chat");
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All chats";
    select.append(allOption);
    for (const cid of chatIds) {
      const option = document.createElement("option");
      option.value = cid;
      option.textContent = chatLabels.get(cid) || `#${cid}`;
      select.append(option);
    }
    select.value = selectedChatId || "";
    select.addEventListener("change", () => {
      const next = select.value;
      if (next === "") {
        selectedChatId = null;
        requestGallery(savedAllPage, null);
      } else {
        selectedChatId = next;
        requestGallery(1, next);
      }
    });
    navRoot.append(select);
    navRoot.setAttribute("role", "navigation");
    navRoot.setAttribute("aria-label", "Chat gallery navigation");
  }
  function renderPagination() {
    if (!paginationRoot)
      return;
    paginationRoot.replaceChildren();
    if (selectedChatId !== null) {
      paginationRoot.hidden = true;
      return;
    }
    paginationRoot.hidden = false;
    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "◀ Prev";
    prev.setAttribute("aria-label", "Previous page");
    prev.disabled = currentPage <= 1;
    prev.addEventListener("click", () => {
      if (currentPage > 1)
        requestGallery(currentPage - 1, null);
    });
    const info = document.createElement("span");
    info.textContent = `Page ${currentPage} / ${totalPages}`;
    info.setAttribute("aria-live", "polite");
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next ▶";
    next.setAttribute("aria-label", "Next page");
    next.disabled = currentPage >= totalPages;
    next.addEventListener("click", () => {
      if (currentPage < totalPages)
        requestGallery(currentPage + 1, null);
    });
    paginationRoot.append(prev, info, next);
    paginationRoot.setAttribute("role", "navigation");
    paginationRoot.setAttribute("aria-label", "Gallery pagination");
  }
  function renderGalleryData(chats) {
    if (!contentRoot)
      return;
    clearContent();
    if (totalChats === 0) {
      renderEmpty();
      return;
    }
    if (chats.length === 0) {
      renderEmpty("No images for this selection.");
      return;
    }
    const showHeadings = selectedChatId === null;
    for (const chat of chats) {
      contentRoot.append(renderChatSection(chat, showHeadings));
    }
    showStatus(`Showing ${chats.length} chat(s) · ${chats.reduce((acc, c) => acc + c.images.length, 0)} image(s)`);
  }
  function requestGallery(page, selected) {
    if (selected === null) {
      savedAllPage = page;
    }
    currentPage = page;
    selectedChatId = selected;
    const requestId = makeRequestId2();
    pendingRequestId = requestId;
    renderLoading();
    renderNav();
    renderPagination();
    ctx.sendToBackend({
      type: "list_inlay_gallery",
      requestId,
      page: selected ? 1 : page,
      selectedChatId: selected || undefined
    });
  }
  function handleGalleryResult(payload) {
    if (!payload || typeof payload !== "object")
      return;
    const msg = payload;
    if (msg.type !== "inlay_gallery_result")
      return;
    if (!activeModal || !activeRoot || isDismissed)
      return;
    if (pendingRequestId && msg.requestId !== pendingRequestId)
      return;
    pendingRequestId = null;
    if (msg.ok === false) {
      renderError(msg.error || "Failed to load gallery.");
      return;
    }
    totalChats = typeof msg.totalChats === "number" ? msg.totalChats : totalChats;
    totalPages = typeof msg.totalPages === "number" && msg.totalPages >= 1 ? msg.totalPages : Math.max(1, Math.ceil(totalChats / CHATS_PER_PAGE));
    if (selectedChatId === null && Array.isArray(msg.chatIds)) {
      chatIds = msg.chatIds.map(String);
    } else if (chatIds.length === 0 && Array.isArray(msg.chatIds)) {
      chatIds = msg.chatIds.map(String);
    }
    currentPage = typeof msg.page === "number" && msg.page >= 1 ? msg.page : currentPage;
    if (selectedChatId === null)
      savedAllPage = currentPage;
    const chats = Array.isArray(msg.chats) ? msg.chats : Array.isArray(msg.records) ? msg.records : [];
    for (const chat of chats) {
      if (!chat || typeof chat.chatId !== "string")
        continue;
      chatLabels.set(chat.chatId, chat.cardName || chat.name || `#${chat.chatId}`);
    }
    renderNav();
    renderPagination();
    renderGalleryData(chats);
  }
  const off = ctx.onBackendMessage((payload) => {
    if (!payload || typeof payload !== "object")
      return;
    const msg = payload;
    if (msg.type === "inlay_gallery_result") {
      handleGalleryResult(payload);
    } else if (msg.type === "inlay_image_action_result" && activeModal && !isDismissed) {
      if (msg.ok !== false && msg.record) {
        requestGallery(currentPage, selectedChatId);
      }
    }
  });
  function ensureStructure() {
    if (!activeModal || !activeRoot)
      return;
    activeRoot.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "inlay-gallery";
    navRoot = document.createElement("div");
    navRoot.className = "inlay-gallery-nav";
    paginationRoot = document.createElement("div");
    paginationRoot.className = "inlay-gallery-pagination";
    contentRoot = document.createElement("div");
    contentRoot.className = "inlay-gallery-content";
    contentRoot.setAttribute("role", "region");
    contentRoot.setAttribute("aria-label", "Gallery images");
    statusRoot = document.createElement("div");
    statusRoot.className = "inlay-gallery-status";
    statusRoot.hidden = true;
    statusRoot.setAttribute("role", "status");
    statusRoot.setAttribute("aria-live", "polite");
    wrapper.append(navRoot, paginationRoot, statusRoot, contentRoot);
    activeRoot.append(wrapper);
  }
  function open(initialChatId) {
    if (activeModal) {
      try {
        activeModal.dismiss();
      } catch {}
      activeModal = null;
    }
    isDismissed = false;
    const scopeChatId = typeof initialChatId === "string" && initialChatId ? initialChatId : null;
    const modal = showNativeModal({
      title: scopeChatId ? "Current chat gallery" : "Inlay gallery",
      width: 900,
      maxHeight: 750
    });
    activeModal = modal;
    activeRoot = modal.root;
    ensureStructure();
    chatIds = [];
    chatLabels.clear();
    totalChats = 0;
    totalPages = 1;
    currentPage = 1;
    savedAllPage = 1;
    selectedChatId = scopeChatId;
    pendingRequestId = null;
    renderLoading();
    requestGallery(1, scopeChatId);
    modal.onDismiss(() => {
      isDismissed = true;
      activeModal = null;
      activeRoot = null;
      navRoot = null;
      paginationRoot = null;
      contentRoot = null;
      statusRoot = null;
      pendingRequestId = null;
    });
  }
  function destroy() {
    off();
    removeStyle();
    if (activeModal) {
      try {
        activeModal.dismiss();
      } catch {}
      activeModal = null;
    }
    isDismissed = true;
  }
  return { open, destroy };
}

// src/frontend.ts
function setup(ctx) {
  const previousCleanup = globalThis[CLEANUP_KEY];
  if (typeof previousCleanup === "function")
    previousCleanup();
  let config = { ...DEFAULT_CONFIG };
  let parserConnections = [];
  let imageConnections = [];
  let characterAppearance = {};
  let status = "Loading...";
  let triedImageGenerationParserDefault = false;
  let drawerWasActive = false;
  let renderer = null;
  const tab = ctx.ui.registerDrawerTab(DRAWER_TAB_OPTIONS);
  const removeStyle = ctx.dom.addStyle(PANEL_STYLES);
  const removeLightbox = installInlayLightbox(ctx);
  const gallery = createInlayGallery(ctx);
  function activeChatId() {
    try {
      return String(ctx.getActiveChat().chatId || "");
    } catch {
      return "";
    }
  }
  const removeFab = installInlayFab(ctx, {
    getCorner: () => config.fabCorner,
    openGallery: () => gallery.open(activeChatId()),
    openSettings: () => {
      const maybeDrawer = ctx;
      if (typeof maybeDrawer.openDrawer === "function") {
        maybeDrawer.openDrawer();
      }
    }
  });
  function requestState(chatId = activeChatId()) {
    ctx.sendToBackend({ type: "get_state", chatId });
  }
  function updateStatus(next) {
    status = next;
    renderer?.updateStatus(next);
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
    updateStatus,
    openGallery: () => gallery.open(activeChatId())
  };
  renderer = new SettingsRenderer(ctx, tab.root, () => ({ config, parserConnections, imageConnections, characterAppearance, status }), actions);
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
      const hasStoredImageSetup = Boolean(config.imageConnectionId) || Object.keys(config.imageParameters || {}).length > 0;
      if (!hasStoredImageSetup && imageGeneration.activeImageGenConnectionId) {
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
      renderer?.render();
    } catch {}
  }
  const unsub = ctx.onBackendMessage((payload) => {
    const message = payload;
    if (message.type === "avatar_image_request") {
      respondToAvatarImageRequest(message, (response) => ctx.sendToBackend(response));
      return;
    }
    routeBackendMessage(message, activeChatId, {
      replaceConfig: (next) => {
        config = next;
      },
      replaceState: (next) => {
        config = next.config;
        parserConnections = next.parserConnections;
        imageConnections = next.imageConnections;
        characterAppearance = next.characterAppearance;
        status = next.status;
        renderer?.render();
      },
      replaceCharacterMemory: (nextAppearance, nextStatus) => {
        characterAppearance = nextAppearance;
        status = nextStatus;
        renderer?.render();
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
  renderer?.render();
  requestState();
  ctx.ready();
  const cleanup = () => {
    unsub();
    unsubDrawer();
    unsubChatSwitched();
    removeFab();
    gallery.destroy();
    cleanupModalStyles();
    renderer?.destroy();
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
