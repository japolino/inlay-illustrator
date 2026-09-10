import { DEFAULT_CONFIG, resolveInlayImageAspect, type Config } from "./config.js";

export type InlayFramePlacement = "cover" | "paragraph";

export type InlayFrameGeometry = {
  wrapperStyle: string;
  frameStyle: string;
  placeholderFrameStyle: string;
  intrinsicAttributes: string;
};

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function positiveDimension(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

/**
 * Computes the in-chat frame geometry for one inlay.
 *
 * This is the single source of truth for the display contract, shared by the
 * server-side message renderer and the frontend live restyler, so changing the
 * Image output settings updates existing images without regenerating them.
 */
export function inlayFrameGeometry(
  imageParameters: Record<string, unknown> | undefined,
  placement: InlayFramePlacement,
  config: Config
): InlayFrameGeometry {
  const maxHeight = clampInteger(
    placement === "cover" ? config.coverImageMaxHeightVh : config.inlayImageMaxHeightVh,
    10,
    100,
    placement === "cover" ? DEFAULT_CONFIG.coverImageMaxHeightVh : DEFAULT_CONFIG.inlayImageMaxHeightVh
  );
  const aspect = resolveInlayImageAspect(config.inlayImageAspect);
  const viewportWidth = `calc(${maxHeight}vh * ${aspect.w} / ${aspect.h})`;
  // Preserve staging's optional cover-width cap. Paragraph and Asset slots use
  // the Legacy display contract: aspect ratio + viewport-height cap only.
  const boxWidth = placement === "cover"
    ? `min(100%, ${clampInteger(config.coverImageWidth, 120, 2400, DEFAULT_CONFIG.coverImageWidth)}px, ${viewportWidth})`
    : `min(100%, ${viewportWidth})`;
  const parameters = imageParameters && Object.keys(imageParameters).length > 0
    ? imageParameters
    : config.imageParameters;
  const intrinsicWidth = positiveDimension(parameters.width);
  const intrinsicHeight = positiveDimension(parameters.height);
  const commonFrameStyle = `width:${boxWidth};max-width:100%;aspect-ratio:${aspect.w}/${aspect.h};`;
  return {
    wrapperStyle: "display:flex;flex-direction:column;justify-content:center;align-items:center;margin:10px 0;width:100%;",
    frameStyle: `display:block;${commonFrameStyle}`,
    placeholderFrameStyle: `display:flex;justify-content:center;align-items:center;${commonFrameStyle}`,
    intrinsicAttributes: intrinsicWidth && intrinsicHeight
      ? ` width="${intrinsicWidth}" height="${intrinsicHeight}"`
      : ""
  };
}
