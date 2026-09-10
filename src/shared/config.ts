import type {
  V376EncodingMode,
  V376Mode,
  V376Options,
  V376PromptSeparator,
  V376PromptSyntax,
  V376TextLanguage
} from "../backend/v376/types.js";

export type {
  V376EncodingMode,
  V376Mode,
  V376Options,
  V376PromptSeparator,
  V376PromptSyntax,
  V376TextLanguage
};

export type PromptPreset = {
  id: string;
  name: string;
  positivePrefix: string;
  negativePrefix: string;
};

export type PerspectiveMode = "creative" | "static" | "dynamic" | "asset";

export type InlayImageAspect = "wide" | "standard" | "square" | "portrait" | "vertical" | "classic";

export const INLAY_IMAGE_ASPECT_PRESETS: Array<{ value: InlayImageAspect; label: string }> = [
  { value: "wide", label: "Wide 16:9" },
  { value: "standard", label: "Standard 4:3" },
  { value: "square", label: "Square 1:1" },
  { value: "portrait", label: "Portrait 3:4" },
  { value: "vertical", label: "Vertical 9:16" },
  { value: "classic", label: "Classic 2:3" }
];

const INLAY_IMAGE_ASPECT_RATIOS: Record<InlayImageAspect, { w: number; h: number }> = {
  wide: { w: 16, h: 9 },
  standard: { w: 4, h: 3 },
  square: { w: 1, h: 1 },
  portrait: { w: 3, h: 4 },
  vertical: { w: 9, h: 16 },
  classic: { w: 2, h: 3 }
};

/** Resolve an aspect (w/h) for a preset, defaulting to wide 16:9. */
export function resolveInlayImageAspect(value: unknown): { w: number; h: number } {
  const key = String(value ?? "").toLowerCase();
  return INLAY_IMAGE_ASPECT_RATIOS[key as InlayImageAspect] ?? INLAY_IMAGE_ASPECT_RATIOS.wide;
}

export function normalizeInlayImageAspect(value: unknown): InlayImageAspect {
  const key = String(value ?? "").toLowerCase();
  return key in INLAY_IMAGE_ASPECT_RATIOS ? (key as InlayImageAspect) : "wide";
}

export type FabCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export const FAB_CORNER_OPTIONS: Array<{ value: FabCorner; label: string }> = [
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" }
];

export function normalizeFabCorner(value: unknown): FabCorner {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "bottom-left" || normalized === "top-right" || normalized === "top-left") {
    return normalized;
  }
  return "bottom-right";
}

export type NovelAiSampler =
  | "k_euler_ancestral"
  | "k_euler"
  | "k_dpmpp_2m"
  | "k_dpmpp_2s_ancestral"
  | "k_dpmpp_sde"
  | "ddim";

export const NOVELAI_SAMPLER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "k_euler_ancestral", label: "Euler Ancestral (Default)" },
  { value: "k_euler", label: "Euler" },
  { value: "k_dpmpp_2m", label: "DPM++ 2M" },
  { value: "k_dpmpp_2s_ancestral", label: "DPM++ 2S Ancestral" },
  { value: "k_dpmpp_sde", label: "DPM++ SDE" },
  { value: "ddim_v3", label: "DDIM v3" }
];

export const NOVELAI_RESOLUTION_PRESETS: Array<{ value: string; label: string; width: number; height: number; aspect: InlayImageAspect }> = [
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

export function isNovelAiConnection(connection: { provider?: string; name?: string; model?: string } | null | undefined): boolean {
  if (!connection) return false;
  const provider = String(connection.provider || "").trim().toLowerCase();
  if (provider === "comfyui" || provider === "swarmui") return false;
  if (provider === "novelai" || provider === "nai") return true;
  const naiPattern = /(?:^|[^a-z0-9])nai(?:$|[^a-z0-9])/i;
  const model = String(connection.model || "").trim().toLowerCase();
  if (model.startsWith("nai-") || model.includes("novelai") || naiPattern.test(model)) return true;
  const name = String(connection.name || "").trim().toLowerCase();
  if (name.includes("novelai") || naiPattern.test(name)) return true;
  return false;
}

export const MODULE_MODE_OPTIONS: Array<{ value: V376Mode; label: string }> = [
  { value: "illustration", label: "Illustration (삽화)" },
  { value: "asset", label: "Asset (에셋)" },
  { value: "comic", label: "Comic (만화)" }
];

export function normalizeModuleMode(value: unknown): V376Mode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "illustration" || normalized === "0" || normalized === "삽화") return "illustration";
  if (normalized === "asset" || normalized === "1" || normalized === "에셋") return "asset";
  if (normalized === "comic" || normalized === "2" || normalized === "만화") return "comic";
  return "illustration";
}

export const PROMPT_SEPARATOR_OPTIONS: Array<{ value: V376PromptSeparator; label: string }> = [
  { value: "pipe", label: "Pipe ( | )" },
  { value: "newline", label: "Newline ( \n\n )" },
  { value: "native", label: "NovelAI Native Characters (v4 API)" }
];

export function normalizePromptSeparator(value: unknown): V376PromptSeparator {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pipe" || normalized === "0" || normalized === "파이프") return "pipe";
  if (normalized === "newline" || normalized === "1" || normalized === "줄바꿈") return "newline";
  if (normalized === "native" || normalized === "2" || normalized === "novelai") return "native";
  return "pipe";
}

export const TEXT_LANGUAGE_OPTIONS: Array<{ value: V376TextLanguage; label: string }> = [
  { value: "off", label: "Off (사용 안함)" },
  { value: "free", label: "Free (자유)" },
  { value: "english", label: "English (영어)" },
  { value: "korean", label: "Korean (한국어)" },
  { value: "japanese", label: "Japanese (일본어)" },
  { value: "chinese", label: "Chinese (중국어)" }
];

export function normalizeTextLanguage(value: unknown): V376TextLanguage {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "off" || normalized === "0" || normalized === "사용 안함" || normalized === "none") return "off";
  if (normalized === "free" || normalized === "1" || normalized === "자유") return "free";
  if (normalized === "english" || normalized === "2" || normalized === "영어") return "english";
  if (normalized === "korean" || normalized === "3" || normalized === "한국어") return "korean";
  if (normalized === "japanese" || normalized === "4" || normalized === "일본어") return "japanese";
  if (normalized === "chinese" || normalized === "5" || normalized === "중국어") return "chinese";
  return "off";
}

export const ENCODING_MODE_OPTIONS: Array<{ value: V376EncodingMode; label: string }> = [
  { value: "plain", label: "Standard / Plain (기본)" },
  { value: "placeholder", label: "Placeholder Codes (검열 우회 치환)" },
  { value: "base64", label: "Base64 Protocol (암호화 프로토콜)" },
  { value: "atbash", label: "Atbash Cipher (단일 치환 암호)" }
];

export function normalizeEncodingMode(value: unknown): V376EncodingMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "plain" || normalized === "0" || normalized === "기본" || normalized === "none" || normalized === "default") return "plain";
  if (normalized === "placeholder" || normalized === "1") return "placeholder";
  if (normalized === "base64" || normalized === "2") return "base64";
  if (normalized === "atbash" || normalized === "3") return "atbash";
  return "plain";
}

export function normalizeCharacterContextDepth(value: unknown): number {
  if (value === null || value === undefined || value === "") return DEFAULT_CONFIG.characterContextDepth;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CONFIG.characterContextDepth;
  const rounded = Math.round(parsed);
  if (rounded === -1) return DEFAULT_CONFIG.characterContextDepth;
  if (rounded < 0) return DEFAULT_CONFIG.characterContextDepth;
  return Math.min(100_000, rounded);
}

export function normalizeComicMinPanels(value: unknown): number {
  if (value === null || value === undefined || value === "") return DEFAULT_CONFIG.comicMinPanels;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CONFIG.comicMinPanels;
  const rounded = Math.round(parsed);
  if (rounded < 1) return 1;
  return Math.min(1000, rounded);
}

export type Config = {
  enabled: boolean;
  autoGenerate: boolean;
  debugLogging: boolean;
  /** Generate one additional cinematic key visual and place it above the message. */
  coverImageEnabled: boolean;
  /** V3.7.6 core pipeline mode: illustration, asset, or comic (toggle_Card.Mode). */
  moduleMode: V376Mode;
  /** V3.7.6 NSFW instruction strength booster (toggle_Card.Nsfw). Note: instruction strength, NOT a safety filter. */
  nsfwInstructions: boolean;
  /** V3.7.6 prompt separator: pipe, newline, or native character separation (toggle_Card.PromptSep). */
  promptSeparator: V376PromptSeparator;
  /** V3.7.6 in-image text language: off, free, english, korean, japanese, chinese (toggle_Card.Text). */
  imageTextLanguage: V376TextLanguage;
  /** V3.7.6 minimum comic panels per image in comic mode (toggle_Card.PanelNum). */
  comicMinPanels: number;
  /** V3.7.6 preceding user-message context per turn (toggle_Card.Userchat). */
  includeUserMessage: boolean;
  /** V3.7.6 character appearance context depth turns (toggle_Card.CharAppearance.Depth). */
  characterContextDepth: number;
  /** V3.7.6 quote / caption generation and display switch (toggle_Card.Quote). */
  quoteEnabled: boolean;
  /** V3.7.6 instruction / response encoding mode (toggle_Card.Encode). */
  encodingMode: V376EncodingMode;
  /** V3.7.6 consensual adult roleplay prefill bypass (toggle_Card.Prefill). */
  prefillEnabled: boolean;
  /** Retained legacy field: ANIMA adaptive mode. Inactive in V3.7.6 pipeline. */
  adaptiveMode: boolean;
  /** Retained legacy field: ANIMA fast mode. Inactive in V3.7.6 pipeline. */
  fastMode: boolean;
  /** Retained legacy field: ANIMA perspective mode. Inactive in V3.7.6 pipeline. */
  perspectiveMode: PerspectiveMode;
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
  inlayImageWidth: number;
  assetImageWidth: number;
  inlayImageAspect: InlayImageAspect;
  inlayImageMaxHeightVh: number;
  /** Maximum display width of the optional cover image. */
  coverImageWidth: number;
  /** Maximum display height of the optional cover image. */
  coverImageMaxHeightVh: number;
  /** Retained legacy field: ANIMA prompt style. Inactive in V3.7.6 pipeline. */
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
  /** V3.7.6 CustomPos: tags prepended to [Positive] prompt. */
  customPositivePrefix: string;
  /** V3.7.6 CustomNeg: tags appended to [Positive] prompt (positive suffix, NOT negative prompt!). */
  customPositiveSuffix: string;
  /** Additional tags appended to negative prompt. */
  customNegative: string;
  promptPresets: PromptPreset[];
  activePromptPresetId: string | null;
  fabCorner: FabCorner;
};

export type RawConfig = Partial<Config> & {
  /** Removed settings retained only so legacy persisted records can be ignored. */
  mode?: unknown;
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

  // V3.7.6 mode migration: if legacy mode === "asset" or perspectiveMode === "asset", default moduleMode to "asset"
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
    perspectiveMode: raw.perspectiveMode === "creative" || raw.perspectiveMode === "static" || raw.perspectiveMode === "dynamic" || raw.perspectiveMode === "asset"
      ? raw.perspectiveMode
      : legacyMode === "asset" ? "asset" : "dynamic",
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
    activePromptPresetId: activePromptPresetId && promptPresets.some((preset) => preset.id === activePromptPresetId)
      ? activePromptPresetId
      : null,
    fabCorner: normalizeFabCorner(raw.fabCorner)
  };
}

/**
 * Runtime config applied at the generation pipeline boundary when Fast Mode is
 * enabled. Never mutates the stored config and never changes the configured
 * minImages/maxImages image count.
 *
 * Fast Mode forces out the LLM stages that are redundant or optional for a
 * single compact parser pass: shot routing (preprocessing), outer parser
 * retries, and lorebook loading (which also disables the full-context retry).
 * Recent-context, persona, and metadata skipping are handled by the context
 * builder itself because they need chat state (character-memory bootstrap).
 */
export function effectiveGenerationConfig(config: Config): Config {
  if (!config.fastMode) return config;
  return {
    ...config,
    preprocessingEnabled: false,
    parserRetries: 0,
    includeLorebook: false
  };
}

/**
 * Maps high-level application Config to the shared V3.7.6 pipeline options.
 *
 * Semantic Notes:
 * - customPos maps from customPositivePrefix (prepended to [Positive] prompt tags).
 * - customNeg maps from customPositiveSuffix (appended to [Positive] prompt tags in source Lua, NOT negative prompt!).
 * - customNegative additions remain in generation/prompt compilation for actual negative tags.
 * - nsfwInstructions maps to nsfw (NSFW instruction-strength booster, NOT a content filter).
 * - promptSeparator maps to separator ("pipe" | "newline" | "native").
 */
export function v376OptionsFromConfig(config: Config): V376Options {
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
