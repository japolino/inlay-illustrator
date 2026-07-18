export type PromptPreset = {
  id: string;
  name: string;
  positivePrefix: string;
  negativePrefix: string;
};

export type PerspectiveMode = "creative" | "static" | "dynamic";

export type Config = {
  enabled: boolean;
  autoGenerate: boolean;
  debugLogging: boolean;
  adaptiveMode: boolean;
  perspectiveMode: PerspectiveMode;
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
  inlayImageMaxHeightVh: number;
  promptStyle: "default" | "anima";
  promptSyntax: "nai" | "comfyui";
  includeUserInfo: boolean;
  includeCharacterInfo: boolean;
  includeLorebook: boolean;
  characterTagContextEnabled: boolean;
  previousVisualStateEnabled: boolean;
  userInstructionsEnabled: boolean;
  customParserInstructions: string;
  originalReference: boolean;
  originalCreationName: string;
  supplement: boolean;
  ignoredTags: string;
  customPositivePrefix: string;
  customPositiveSuffix: string;
  customNegative: string;
  promptPresets: PromptPreset[];
  activePromptPresetId: string | null;
};

export type RawConfig = Partial<Config> & {
  /** Removed settings retained only so legacy persisted records can be ignored. */
  mode?: unknown;
  assetImageWidth?: unknown;
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
  enabled: true,
  autoGenerate: true,
  debugLogging: true,
  adaptiveMode: false,
  perspectiveMode: "dynamic",
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
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
      negativePrefix: cleanString(candidate.negativePrefix)
    });
  }
  return presets;
}

export function normalizeConfig(raw: RawConfig): Config {
  const imageGeneration = raw.imageGeneration || {};
  const {
    danbooruCleanup: _legacyDanbooruCleanup,
    danbooruEndpoint: _legacyDanbooruEndpoint,
    mode: _legacyMode,
    assetImageWidth: _legacyAssetImageWidth,
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
    adaptiveMode: raw.adaptiveMode === true,
    perspectiveMode: raw.perspectiveMode === "creative" || raw.perspectiveMode === "static" || raw.perspectiveMode === "dynamic"
      ? raw.perspectiveMode
      : raw.mode === "asset" ? "static" : "dynamic",
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
    activePromptPresetId: activePromptPresetId && promptPresets.some((preset) => preset.id === activePromptPresetId)
      ? activePromptPresetId
      : null
  };
}
