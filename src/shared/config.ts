export type PromptPreset = {
  id: string;
  name: string;
  positivePrefix: string;
  negativePrefix: string;
};

export type ParserEngine = "axllm" | "llm";
export type PreprocessingMode = "off" | "axllm" | "llm";

export type Config = {
  enabled: boolean;
  autoGenerate: boolean;
  debugLogging: boolean;
  mode: "illustration" | "asset";
  parserEngine: ParserEngine;
  preprocessingMode: PreprocessingMode;
  axllmParserConnectionId: string | null;
  llmParserConnectionId: string | null;
  // Silent migration fallbacks — not exposed in UI, must not affect default calls
  parserConnectionId: string | null;
  parserModel: string;
  parserParameters: Record<string, unknown>;
  parserMaxTokens: number;
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
  prefillEnabled: boolean;
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
  quotesEnabled: boolean;
  quoteInstructions: string;
  ignoredTags: string;
  customPositivePrefix: string;
  customPositiveSuffix: string;
  customNegative: string;
  promptPresets: PromptPreset[];
  activePromptPresetId: string | null;
  encodeMode: "0" | "1" | "2";
  presetNumber: string;
  imageRerollCount: number;
  /** Original toggle_Card.Display.Max raw text; tonumber parsing happens at display time. */
  displayMax: string;
  /** Floating action button corner: bottom-right default; user-selectable among all four corners. */
  fabCorner: "bottom-right" | "bottom-left" | "top-right" | "top-left";
};

export type RawConfig = Partial<Config> & {
  // legacy dual-engine fields may appear under old keys
  parserEngine?: unknown;
  preprocessingMode?: unknown;
  axllmParserConnectionId?: unknown;
  llmParserConnectionId?: unknown;
  preprocessingEnabled?: unknown;
  adaptiveMode?: unknown;
  perspectiveMode?: unknown;
  previousVisualStateEnabled?: unknown;
  danbooruCleanup?: unknown;
  danbooruEndpoint?: unknown;
  imageGeneration?: {
    promptParserConnectionId?: string | null;
    promptParserModel?: string;
    promptParserParameters?: Record<string, unknown>;
    activeImageGenConnectionId?: string | null;
    model?: string;
    parameters?: Record<string, unknown>;
  };
};

export const DEFAULT_CONFIG: Config = {
  enabled: false,
  autoGenerate: true,
  debugLogging: false,
  mode: "illustration",
  parserEngine: "axllm",
  preprocessingMode: "off",
  axllmParserConnectionId: null,
  llmParserConnectionId: null,
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
  includeMaxMessages: 0,
  parserRetries: 0,
  preprocessingEnabled: false,
  prefillEnabled: false,
  inlayImageWidth: 640,
  assetImageWidth: 400,
  inlayImageMaxHeightVh: 70,
  promptStyle: "default",
  promptSyntax: "nai",
  includeUserInfo: false,
  includeCharacterInfo: false,
  includeLorebook: false,
  characterTagContextEnabled: false,
  userInstructionsEnabled: true,
  customParserInstructions: "",
  originalReference: false,
  originalCreationName: "",
  supplement: false,
  quotesEnabled: false,
  quoteInstructions: "",
  ignoredTags: "",
  customPositivePrefix: "",
  customPositiveSuffix: "",
  customNegative: "",
  promptPresets: [],
  activePromptPresetId: null,
  encodeMode: "0",
  presetNumber: "1",
  imageRerollCount: 1,
  displayMax: "0",
  fabCorner: "bottom-right",
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullableString(value: unknown): string | null {
  return cleanString(value) || null;
}

function cleanParameters(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizePromptPresets(value: unknown): PromptPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const presets: PromptPreset[] = [];
  for (const candidate of value as Record<string, unknown>[]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const id = cleanString(candidate.id);
    const name = cleanString(candidate.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    presets.push({
      id,
      name,
      positivePrefix: cleanString(candidate.positivePrefix),
      negativePrefix: cleanString(candidate.negativePrefix),
    });
  }
  return presets;
}

function normalizeEncodeMode(value: unknown): Config["encodeMode"] {
  const s = String(value ?? "").trim();
  if (s === "1" || s === "2") return s;
  return "0";
}

function normalizePresetNumber(value: unknown): string {
  const raw = value == null ? "" : String(value);
  if (raw === "" || raw === "null") return "1";
  return raw;
}

function normalizeDisplayMax(value: unknown): string {
  return value == null ? "0" : String(value);
}

export function normalizeFabCorner(value: unknown): Config["fabCorner"] {
  const raw = value == null ? "" : String(value).trim().toLowerCase();
  if (raw === "bottom-left" || raw === "top-right" || raw === "top-left") return raw;
  return "bottom-right";
}

function normalizeParserEngine(value: unknown): ParserEngine {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "llm") return "llm";
  return "axllm";
}

function normalizePreprocessingMode(value: unknown): PreprocessingMode | null {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "off" || s === "axllm" || s === "llm") return s as PreprocessingMode;
  return null;
}

export function normalizeConfig(raw: RawConfig): Config {
  const imageGeneration = raw.imageGeneration || {};
  const includeMin = clampInt(raw.includeMinMessages, 0, 32, DEFAULT_CONFIG.includeMinMessages);
  const includeMax = clampInt(raw.includeMaxMessages, 0, 32, DEFAULT_CONFIG.includeMaxMessages);
  const minImages = clampInt(raw.minImages, 1, 12, DEFAULT_CONFIG.minImages);
  const maxImages = clampInt(raw.maxImages, 1, 12, DEFAULT_CONFIG.maxImages);
  const promptPresets = normalizePromptPresets(raw.promptPresets);
  const activePromptPresetId = cleanNullableString(raw.activePromptPresetId);
  const parserParameters = cleanParameters(raw.parserParameters);
  const imageParameters = cleanParameters(raw.imageParameters);

  // Parser engine: explicit, else default axllm
  const parserEngine = normalizeParserEngine((raw as Record<string, unknown>).parserEngine);

  // Preprocessing mode: explicit else migrate from boolean
  let preprocessingMode = normalizePreprocessingMode((raw as Record<string, unknown>).preprocessingMode);
  if (preprocessingMode === null) {
    // Silent migration: preprocessingEnabled true => axllm, else off. Also handle string "1"/"2" legacy toggle values
    const legacy = (raw as Record<string, unknown>).preprocessingEnabled;
    const rawToggle = (raw as Record<string, unknown>).preprocessingMode ?? legacy;
    if (typeof rawToggle === "string" && (rawToggle === "1" || rawToggle === "2")) {
      preprocessingMode = rawToggle === "1" ? "axllm" : "llm";
    } else if (legacy === true) {
      preprocessingMode = "axllm";
    } else if (legacy === false) {
      preprocessingMode = "off";
    } else {
      preprocessingMode = "off";
    }
    // Also handle numeric legacy 1/2 stored as number
    const legacyModeRaw = (raw as Record<string, unknown>).preprocessingMode;
    if (typeof legacyModeRaw === "number") {
      if (legacyModeRaw === 1) preprocessingMode = "axllm";
      else if (legacyModeRaw === 2) preprocessingMode = "llm";
      else if (legacyModeRaw === 0) preprocessingMode = "off";
    }
  }

  // Dual connections: migrate parserConnectionId -> axllmParserConnectionId
  const rawAxllm = cleanNullableString((raw as Record<string, unknown>).axllmParserConnectionId);
  const rawLlm = cleanNullableString((raw as Record<string, unknown>).llmParserConnectionId);
  const legacyParserConn = cleanNullableString(raw.parserConnectionId) || cleanNullableString(imageGeneration.promptParserConnectionId);
  const axllmParserConnectionId = rawAxllm ?? legacyParserConn;
  const llmParserConnectionId = rawLlm;

  return {
    ...DEFAULT_CONFIG,
    enabled: raw.enabled === true,
    autoGenerate: raw.autoGenerate !== false,
    debugLogging: raw.debugLogging === true,
    mode: raw.mode === "asset" ? "asset" : "illustration",
    parserEngine,
    preprocessingMode: preprocessingMode as PreprocessingMode,
    axllmParserConnectionId,
    llmParserConnectionId,
    parserConnectionId: legacyParserConn,
    parserModel: cleanString(raw.parserModel) || cleanString(imageGeneration.promptParserModel),
    parserParameters:
      Object.keys(parserParameters).length > 0
        ? parserParameters
        : cleanParameters(imageGeneration.promptParserParameters),
    parserMaxTokens: clampInt(raw.parserMaxTokens, 0, 32768, DEFAULT_CONFIG.parserMaxTokens),
    imageConnectionId:
      cleanNullableString(raw.imageConnectionId) ||
      cleanNullableString(imageGeneration.activeImageGenConnectionId),
    imageModel: cleanString(raw.imageModel) || cleanString(imageGeneration.model),
    imageParameters:
      Object.keys(imageParameters).length > 0
        ? imageParameters
        : cleanParameters(imageGeneration.parameters),
    minImages: Math.min(minImages, maxImages),
    maxImages: Math.max(minImages, maxImages),
    maxCharacters: clampInt(raw.maxCharacters, 1, 3, DEFAULT_CONFIG.maxCharacters),
    includeMinMessages: Math.min(includeMin, includeMax),
    includeMaxMessages: Math.max(includeMin, includeMax),
    parserRetries: clampInt(raw.parserRetries, 0, 5, DEFAULT_CONFIG.parserRetries),
    preprocessingEnabled: preprocessingMode !== "off",
    prefillEnabled: (raw as Record<string, unknown>).prefillEnabled === true,
    inlayImageWidth: clampInt(raw.inlayImageWidth, 120, 2400, DEFAULT_CONFIG.inlayImageWidth),
    assetImageWidth: clampInt(raw.assetImageWidth, 120, 2400, DEFAULT_CONFIG.assetImageWidth),
    inlayImageMaxHeightVh: clampInt(raw.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh),
    promptStyle: raw.promptStyle === "anima" ? "anima" : "default",
    promptSyntax: raw.promptSyntax === "comfyui" ? "comfyui" : "nai",
    includeUserInfo: raw.includeUserInfo === true,
    includeCharacterInfo: raw.includeCharacterInfo === true,
    includeLorebook: raw.includeLorebook === true,
    characterTagContextEnabled: raw.characterTagContextEnabled === true,
    userInstructionsEnabled: raw.userInstructionsEnabled !== false,
    customParserInstructions: cleanString(raw.customParserInstructions),
    originalReference: raw.originalReference === true,
    originalCreationName: cleanString(raw.originalCreationName),
    supplement: raw.supplement === true,
    quotesEnabled: raw.quotesEnabled === true,
    quoteInstructions: cleanString(raw.quoteInstructions),
    ignoredTags: cleanString(raw.ignoredTags),
    customPositivePrefix: cleanString(raw.customPositivePrefix),
    customPositiveSuffix: cleanString(raw.customPositiveSuffix),
    customNegative: cleanString(raw.customNegative),
    promptPresets,
    activePromptPresetId:
      activePromptPresetId && promptPresets.some((preset) => preset.id === activePromptPresetId)
        ? activePromptPresetId
        : null,
    encodeMode: normalizeEncodeMode((raw as Record<string, unknown>).encodeMode),
    presetNumber: normalizePresetNumber((raw as Record<string, unknown>).presetNumber),
    imageRerollCount: clampInt((raw as Record<string, unknown>).imageRerollCount, 1, 8, DEFAULT_CONFIG.imageRerollCount),
    displayMax: normalizeDisplayMax((raw as Record<string, unknown>).displayMax),
    fabCorner: normalizeFabCorner((raw as Record<string, unknown>).fabCorner),
  };
}
