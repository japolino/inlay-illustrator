/** Crop frame geometry of the reference crop dialogs (AM 146035-146216): pure functions. */
export interface Rect { x: number; y: number; width: number; height: number }
export type DragMode = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | "move" | "new";
export interface DragState { mode: DragMode; startPoint: { x: number; y: number }; startRect: Rect }

export const MIN_CROP_SIZE = 16; // kxt
export const HANDLE_HIT_PX = 24; // Axt
export const MAX_CROP_EXPORT_SIDE = 1536; // Uwe

/** AM `kd`: normalize negative sizes, clamp to the image, minimum size. */
export function clampRect(rect: Partial<Rect>, imageWidth: number, imageHeight: number): Rect {
  const w = Math.max(1, imageWidth);
  const h = Math.max(1, imageHeight);
  const min = Math.max(1, Math.min(MIN_CROP_SIZE, w, h));
  let x = Number.isFinite(rect.x) ? rect.x! : 0;
  let y = Number.isFinite(rect.y) ? rect.y! : 0;
  let width = Number.isFinite(rect.width) ? rect.width! : w;
  let height = Number.isFinite(rect.height) ? rect.height! : h;
  if (width < 0) { x += width; width = Math.abs(width); }
  if (height < 0) { y += height; height = Math.abs(height); }
  width = Math.max(min, Math.min(width, w));
  height = Math.max(min, Math.min(height, h));
  x = Math.max(0, Math.min(x, Math.max(0, w - width)));
  y = Math.max(0, Math.min(y, Math.max(0, h - height)));
  return { x, y, width, height };
}

/** AM `$we`: rect from two corners. */
export function rectFromPoints(x1: number, y1: number, x2: number, y2: number, imageWidth: number, imageHeight: number): Rect {
  return clampRect({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }, imageWidth, imageHeight);
}

/** AM `Bwe`: hit test in source pixels (`scale` = CSS px per source px). */
export function hitTest(point: { x: number; y: number }, rect: Rect, scale: number): DragMode {
  const tol = Math.max(6, HANDLE_HIT_PX / 2 / Math.max(0.001, scale));
  const left = Math.abs(point.x - rect.x) <= tol;
  const right = Math.abs(point.x - (rect.x + rect.width)) <= tol;
  const top = Math.abs(point.y - rect.y) <= tol;
  const bottom = Math.abs(point.y - (rect.y + rect.height)) <= tol;
  const withinX = point.x >= rect.x - tol && point.x <= rect.x + rect.width + tol;
  const withinY = point.y >= rect.y - tol && point.y <= rect.y + rect.height + tol;
  const inside = point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  if (left && top) return "nw";
  if (right && top) return "ne";
  if (left && bottom) return "sw";
  if (right && bottom) return "se";
  if (left && withinY) return "w";
  if (right && withinY) return "e";
  if (top && withinX) return "n";
  if (bottom && withinX) return "s";
  return inside ? "move" : "new";
}

/** AM `Pxt`: cursor of a drag mode. */
export function cursorFor(mode: DragMode): string {
  if (mode === "nw" || mode === "se") return "nwse-resize";
  if (mode === "ne" || mode === "sw") return "nesw-resize";
  if (mode === "w" || mode === "e") return "ew-resize";
  if (mode === "n" || mode === "s") return "ns-resize";
  return mode === "move" ? "move" : "crosshair";
}

/** AM `Hwe`: rect while dragging. */
export function dragRect(drag: DragState, point: { x: number; y: number }, imageWidth: number, imageHeight: number): Rect {
  if (drag.mode === "new") return rectFromPoints(drag.startPoint.x, drag.startPoint.y, point.x, point.y, imageWidth, imageHeight);
  if (drag.mode === "move") {
    return clampRect({ ...drag.startRect, x: drag.startRect.x + point.x - drag.startPoint.x, y: drag.startRect.y + point.y - drag.startPoint.y }, imageWidth, imageHeight);
  }
  let x1 = drag.startRect.x;
  let y1 = drag.startRect.y;
  let x2 = drag.startRect.x + drag.startRect.width;
  let y2 = drag.startRect.y + drag.startRect.height;
  if (drag.mode.includes("w")) x1 = point.x;
  if (drag.mode.includes("e")) x2 = point.x;
  if (drag.mode.includes("n")) y1 = point.y;
  if (drag.mode.includes("s")) y2 = point.y;
  return rectFromPoints(x1, y1, x2, y2, imageWidth, imageHeight);
}

/** AM `UH`: letterbox metrics of the image inside the canvas box. */
export function letterbox(boxWidth: number, boxHeight: number, sourceWidth: number, sourceHeight: number) {
  const cssWidth = Math.max(1, boxWidth);
  const cssHeight = Math.max(1, boxHeight);
  const sw = Math.max(1, sourceWidth);
  const sh = Math.max(1, sourceHeight);
  const scale = Math.min(cssWidth / sw, cssHeight / sh) || 1;
  const drawWidth = sw * scale;
  const drawHeight = sh * scale;
  return { cssWidth, cssHeight, sourceWidth: sw, sourceHeight: sh, scale, drawX: (cssWidth - drawWidth) / 2, drawY: (cssHeight - drawHeight) / 2, drawWidth, drawHeight };
}

/** Pointer position (CSS px relative to the box) -> source pixel, clamped. */
export function toSourcePoint(cssX: number, cssY: number, metrics: ReturnType<typeof letterbox>): { x: number; y: number } {
  const x = (cssX - metrics.drawX) / metrics.scale;
  const y = (cssY - metrics.drawY) / metrics.scale;
  return { x: Math.max(0, Math.min(metrics.sourceWidth, x)), y: Math.max(0, Math.min(metrics.sourceHeight, y)) };
}

/** AM `VH`: the frame covers the whole image (= no crop). */
export function isFullImage(rect: Rect, imageWidth: number, imageHeight: number): boolean {
  return Math.round(rect.x) <= 0 && Math.round(rect.y) <= 0 && Math.round(rect.width) >= imageWidth - 1 && Math.round(rect.height) >= imageHeight - 1;
}

/** AM `GH`: integer source rect + export size (max side 1536). */
export function exportGeometry(rect: Rect, imageWidth: number, imageHeight: number): { sx: number; sy: number; sw: number; sh: number; width: number; height: number } {
  const r = clampRect(rect, imageWidth, imageHeight);
  const sx = Math.max(0, Math.min(imageWidth - 1, Math.round(r.x)));
  const sy = Math.max(0, Math.min(imageHeight - 1, Math.round(r.y)));
  const sw = Math.max(1, Math.min(imageWidth - sx, Math.round(r.width)));
  const sh = Math.max(1, Math.min(imageHeight - sy, Math.round(r.height)));
  const side = Math.max(sw, sh);
  const factor = side > MAX_CROP_EXPORT_SIDE ? MAX_CROP_EXPORT_SIDE / side : 1;
  return { sx, sy, sw, sh, width: Math.max(1, Math.round(sw * factor)), height: Math.max(1, Math.round(sh * factor)) };
}

/** Same relative frame on another image ("Save all"). */
export function scaleRect(rect: Rect, fromW: number, fromH: number, toW: number, toH: number): Rect {
  return clampRect({ x: (rect.x / fromW) * toW, y: (rect.y / fromH) * toH, width: (rect.width / fromW) * toW, height: (rect.height / fromH) * toH }, toW, toH);
}
