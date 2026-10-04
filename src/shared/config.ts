/**
 * Interim host configuration for the Asset Maid port skeleton.
 *
 * This file only carries the settings that the kept host-integration
 * infrastructure needs (in-chat display geometry, FAB corner, the LLM and
 * image connection used by the backend plumbing, debug logging). The Asset
 * Maid configuration model lives in `src/shared/contract/**` and replaces this
 * file once the backend is wired to it.
 */

export type InlayImageAspect = "auto" | "wide" | "standard" | "square" | "portrait" | "vertical" | "classic";

export const INLAY_IMAGE_ASPECT_PRESETS: Array<{ value: InlayImageAspect; label: string }> = [
  { value: "auto", label: "Auto (Image ratio)" },
  { value: "wide", label: "Wide 16:9" },
  { value: "standard", label: "Standard 4:3" },
  { value: "square", label: "Square 1:1" },
  { value: "portrait", label: "Portrait 3:4" },
  { value: "vertical", label: "Vertical 9:16" },
  { value: "classic", label: "Classic 2:3" }
];

const INLAY_IMAGE_ASPECT_RATIOS: Record<Exclude<InlayImageAspect, "auto">, { w: number; h: number }> = {
  wide: { w: 16, h: 9 },
  standard: { w: 4, h: 3 },
  square: { w: 1, h: 1 },
  portrait: { w: 3, h: 4 },
  vertical: { w: 9, h: 16 },
  classic: { w: 2, h: 3 }
};

function positiveDimension(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

/** Resolve an aspect (w/h) for a preset, defaulting to intrinsic image dimensions or wide 16:9. */
export function resolveInlayImageAspect(
  value: unknown,
  intrinsicDimensions?: { width?: unknown; height?: unknown } | null
): { w: number; h: number } {
  const key = String(value ?? "").toLowerCase();
  if (key === "auto" || !key) {
    const w = positiveDimension(intrinsicDimensions?.width);
    const h = positiveDimension(intrinsicDimensions?.height);
    if (w && h) return { w, h };
    return INLAY_IMAGE_ASPECT_RATIOS.wide;
  }
  return INLAY_IMAGE_ASPECT_RATIOS[key as keyof typeof INLAY_IMAGE_ASPECT_RATIOS] ?? INLAY_IMAGE_ASPECT_RATIOS.wide;
}

export function normalizeInlayImageAspect(value: unknown): InlayImageAspect {
  const key = String(value ?? "").toLowerCase();
  if (key === "auto") return "auto";
  return key in INLAY_IMAGE_ASPECT_RATIOS ? (key as InlayImageAspect) : "auto";
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

/** Heuristic NovelAI detection for an image connection (provider, then model/name hints). */
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

export type Config = {
  enabled: boolean;
  debugLogging: boolean;
  /** LLM connection profile used by the backend LLM client. */
  parserConnectionId: string | null;
  /** Model override; empty = the connection's model. */
  parserModel: string;
  parserParameters: Record<string, unknown>;
  /** 0 = automatic budget chosen by the caller. */
  parserMaxTokens: number;
  /** Image-generation connection; null = account default or first available. */
  imageConnectionId: string | null;
  imageModel: string;
  imageParameters: Record<string, unknown>;
  /** In-chat display geometry for baked inlay images. */
  imageAlignment: "center" | "left";
  inlayImageAspect: InlayImageAspect;
  inlayImageMaxHeightVh: number;
  coverImagePosition: "top" | "bottom";
  coverImageAspect: InlayImageAspect;
  coverImageWidth: number;
  coverImageMaxHeightVh: number;
  fabCorner: FabCorner;
};

export type RawConfig = Partial<Config> & {
  /** Lumiverse app-level image settings kept by very old installs. */
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
  debugLogging: false,
  parserConnectionId: null,
  parserModel: "",
  parserParameters: {},
  parserMaxTokens: 0,
  imageConnectionId: null,
  imageModel: "",
  imageParameters: {},
  imageAlignment: "center",
  inlayImageAspect: "auto",
  inlayImageMaxHeightVh: 70,
  coverImagePosition: "top",
  coverImageAspect: "wide",
  coverImageWidth: 1200,
  coverImageMaxHeightVh: 80,
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
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

/**
 * Normalizes a stored config. Unknown keys (for example settings of the
 * retired Lightboard pipeline) are dropped, so the next write cleans the file.
 */
export function normalizeConfig(raw: RawConfig | null | undefined): Config {
  const source: RawConfig = raw && typeof raw === "object" ? raw : {};
  const legacy = source.imageGeneration || {};
  const parserParameters = cleanParameters(source.parserParameters);
  const imageParameters = cleanParameters(source.imageParameters);
  return {
    enabled: source.enabled !== false,
    debugLogging: source.debugLogging === true,
    parserConnectionId: cleanNullableString(source.parserConnectionId) || cleanNullableString(legacy.promptParserConnectionId),
    parserModel: cleanString(source.parserModel) || cleanString(legacy.promptParserModel),
    parserParameters: Object.keys(parserParameters).length > 0 ? parserParameters : cleanParameters(legacy.promptParserParameters),
    parserMaxTokens: clampInt(source.parserMaxTokens, 0, 131072, DEFAULT_CONFIG.parserMaxTokens),
    imageConnectionId: cleanNullableString(source.imageConnectionId) || cleanNullableString(legacy.activeImageGenConnectionId),
    imageModel: cleanString(source.imageModel) || cleanString(legacy.model),
    imageParameters: Object.keys(imageParameters).length > 0 ? imageParameters : cleanParameters(legacy.parameters),
    imageAlignment: source.imageAlignment === "left" ? "left" : "center",
    inlayImageAspect: normalizeInlayImageAspect(source.inlayImageAspect),
    inlayImageMaxHeightVh: clampInt(source.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh),
    coverImagePosition: source.coverImagePosition === "bottom" ? "bottom" : "top",
    coverImageAspect: source.coverImageAspect === undefined ? "wide" : normalizeInlayImageAspect(source.coverImageAspect),
    coverImageWidth: clampInt(source.coverImageWidth, 120, 2400, DEFAULT_CONFIG.coverImageWidth),
    coverImageMaxHeightVh: clampInt(source.coverImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.coverImageMaxHeightVh),
    fabCorner: normalizeFabCorner(source.fabCorner)
  };
}
