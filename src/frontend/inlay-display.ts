import type { Config } from "../shared/config.js";
import { inlayFrameGeometry, type InlayFramePlacement } from "../shared/inlay-frame.js";

export const INLAY_WRAPPER_SELECTOR = '[data-inlay-illustrator="true"]';
export const INLAY_PLACEMENT_ATTRIBUTE = "data-inlay-illustrator-placement";
export const INLAY_FRAME_SELECTOR = ".inlay-illustrator-frame";
const IMAGE_SELECTOR = "[data-inlay-illustrator-image-id]";

type MinimalElement = {
  style?: { cssText?: string } | null;
  className?: string;
  getAttribute?(name: string): string | null;
  querySelector?(selector: string): MinimalElement | null;
};

type MinimalRoot = {
  querySelectorAll?(selector: string): ArrayLike<MinimalElement>;
};

function placementOf(element: MinimalElement): InlayFramePlacement {
  return element.getAttribute?.(INLAY_PLACEMENT_ATTRIBUTE) === "cover" ? "cover" : "paragraph";
}

function parametersOf(element: MinimalElement): Record<string, unknown> | undefined {
  const image = element.querySelector?.(IMAGE_SELECTOR);
  if (!image) return undefined;
  const width = Number(image.getAttribute?.("width"));
  const height = Number(image.getAttribute?.("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return { width, height };
}

/**
 * Re-applies the Image output settings (frame aspect, height cap, cover width)
 * to every inlay already present in the chat.
 *
 * Message HTML is generated once, when an image is produced, so without this
 * pass a display change would only affect newly generated images. Both the
 * backend renderer and this restyler use the same shared geometry function, so
 * the two can never disagree.
 *
 * Returns the number of frames updated.
 */
export function applyInlayDisplaySettings(config: Config, root?: MinimalRoot | null): number {
  const host = root ?? (typeof document !== "undefined" ? (document as unknown as MinimalRoot) : null);
  if (!host?.querySelectorAll) return 0;

  let updated = 0;
  const wrappers = host.querySelectorAll(INLAY_WRAPPER_SELECTOR);
  const count = Number(wrappers?.length ?? 0);
  for (let index = 0; index < count; index += 1) {
    const wrapper = wrappers[index];
    if (!wrapper) continue;
    const placement = placementOf(wrapper);
    const isPlaceholder = String(wrapper.className || "").includes("inlay-illustrator-placeholder");
    const frame = wrapper.querySelector?.(INLAY_FRAME_SELECTOR) ?? null;
    if (!frame?.style) continue;
    const geometry = inlayFrameGeometry(parametersOf(wrapper), placement, config);
    const nextWrapperStyle = geometry.wrapperStyle;
    const nextFrameStyle = isPlaceholder ? geometry.placeholderFrameStyle : geometry.frameStyle;
    if (wrapper.style && wrapper.style.cssText !== nextWrapperStyle) {
      wrapper.style.cssText = nextWrapperStyle;
      updated += 1;
    }
    if (frame.style.cssText !== nextFrameStyle) {
      frame.style.cssText = nextFrameStyle;
      updated += 1;
    }
    // The image carries the frame aspect too, so it keeps filling the frame
    // after an aspect change and never spills over the following text.
    const image = isPlaceholder ? null : wrapper.querySelector?.(IMAGE_SELECTOR) ?? null;
    if (image?.style && image.style.cssText !== geometry.imageStyle) {
      image.style.cssText = geometry.imageStyle;
      updated += 1;
    }
  }
  return updated;
}
