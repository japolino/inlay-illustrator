/**
 * Reference crop dialog (AM `Vwe` 146266 / `Gxt` 147058): canvas with a draggable frame (8 handles),
 * "Select all" and "Save crop". Full-image frame = no crop. Export: natural resolution, max side 1536, PNG,
 * stored through `assets.saveCrop`; the caller writes the returned asset (with `cropReference`) as reference.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { normalizeAssetRef, type AssetRef, type CropReference } from "../../../shared/contract/character.js";
import { useApp } from "../../state/app-state.js";
import { Button, Dialog, SaveIcon } from "../ui/index.js";
import { clampRect, cursorFor, dragRect, exportGeometry, hitTest, isFullImage, letterbox, toSourcePoint, type DragState, type Rect } from "./crop-geometry.js";
import { RotateCcwIcon } from "./icons.js";
import { CROP_LABELS } from "./labels/common.js";
import { Spinner, useAssetUrl } from "./parts.js";

function existingRect(asset: AssetRef): Rect | null {
  const crop = asset.cropReference as CropReference | undefined;
  return crop && typeof crop === "object" && crop.cropRect ? crop.cropRect : null;
}

/** Original asset without its crop (the crop is re-made from the source image). */
function sourceAsset(asset: AssetRef): AssetRef {
  const { cropReference: _drop, ...rest } = asset;
  return normalizeAssetRef(rest);
}

export function CropDialog({ asset, characterId, open, onClose, onSave, description = CROP_LABELS.description }: {
  asset: AssetRef | null;
  characterId: string;
  open: boolean;
  onClose: () => void;
  /** Receives the asset to store as reference: with `cropReference`, or without it for a full frame. */
  onSave: (asset: AssetRef) => Promise<void> | void;
  description?: string;
}) {
  const app = useApp();
  const source = asset ? sourceAsset(asset) : null;
  const url = useAssetUrl(source);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const rectRef = useRef<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const dragRef = useRef<DragState | null>(null);
  const frame = useRef(0);
  const [ready, setReady] = useState(false);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const metrics = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return null;
    const box = canvas.getBoundingClientRect();
    return { box, m: letterbox(box.width || canvas.clientWidth, box.height || canvas.clientHeight, image.naturalWidth, image.naturalHeight) };
  };

  const draw = () => {
    frame.current = 0;
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const info = metrics();
    if (!canvas || !image || !info) return;
    const { m } = info;
    const dpr = (canvas.ownerDocument.defaultView?.devicePixelRatio) || 1;
    canvas.width = Math.round(m.cssWidth * dpr);
    canvas.height = Math.round(m.cssHeight * dpr);
    const g = canvas.getContext("2d");
    if (!g) { setError(CROP_LABELS.canvasFailed); return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#080a0c";
    g.fillRect(0, 0, m.cssWidth, m.cssHeight);
    g.drawImage(image, m.drawX, m.drawY, m.drawWidth, m.drawHeight);
    g.fillStyle = "rgba(0,0,0,.56)";
    g.fillRect(m.drawX, m.drawY, m.drawWidth, m.drawHeight);
    const r = rectRef.current;
    const x = m.drawX + r.x * m.scale, y = m.drawY + r.y * m.scale, w = r.width * m.scale, h = r.height * m.scale;
    g.drawImage(image, r.x, r.y, r.width, r.height, x, y, w, h);
    const primary = getComputedStyle(canvas).getPropertyValue("--color-primary").trim() || "#d7b86f";
    g.strokeStyle = primary;
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
    g.fillStyle = primary;
    for (const [hx, hy] of [[x, y], [x + w / 2, y], [x + w, y], [x, y + h / 2], [x + w, y + h / 2], [x, y + h], [x + w / 2, y + h], [x + w, y + h]] as const) g.fillRect(hx - 3.5, hy - 3.5, 7, 7);
  };
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  };
  const updateDetails = () => {
    const image = imageRef.current;
    if (image) setDetails(CROP_LABELS.details(image.naturalWidth, image.naturalHeight, Math.round(rectRef.current.width), Math.round(rectRef.current.height)));
  };

  useEffect(() => {
    if (!open || !url || !asset) return undefined;
    setReady(false);
    setError(null);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      imageRef.current = image;
      rectRef.current = clampRect(existingRect(asset) ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }, image.naturalWidth, image.naturalHeight);
      setReady(true);
      updateDetails();
      schedule();
    };
    image.onerror = () => setError(CROP_LABELS.loadFailed);
    image.src = url;
    return () => { image.onload = null; image.onerror = null; };
  }, [open, url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => schedule());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [ready]);

  const pointer = (event: PointerEvent) => {
    const info = metrics();
    if (!info) return null;
    return { point: toSourcePoint(event.clientX - info.box.left, event.clientY - info.box.top, info.m), m: info.m };
  };
  const onPointerDown = (event: PointerEvent) => {
    const image = imageRef.current;
    const p = pointer(event);
    if (!image || !p || saving) return;
    event.preventDefault();
    (event.currentTarget as HTMLCanvasElement).setPointerCapture?.(event.pointerId);
    const start = clampRect(rectRef.current, image.naturalWidth, image.naturalHeight);
    const mode = hitTest(p.point, start, p.m.scale);
    dragRef.current = { mode, startPoint: p.point, startRect: start };
    if (mode === "new") rectRef.current = { x: p.point.x, y: p.point.y, width: 1, height: 1 };
    (event.currentTarget as HTMLCanvasElement).style.cursor = cursorFor(mode);
    schedule();
  };
  const onPointerMove = (event: PointerEvent) => {
    const image = imageRef.current;
    const p = pointer(event);
    if (!image || !p) return;
    const drag = dragRef.current;
    if (!drag) {
      (event.currentTarget as HTMLCanvasElement).style.cursor = cursorFor(hitTest(p.point, rectRef.current, p.m.scale));
      return;
    }
    event.preventDefault();
    rectRef.current = dragRect(drag, p.point, image.naturalWidth, image.naturalHeight);
    schedule();
  };
  const endDrag = (event: PointerEvent) => {
    const image = imageRef.current;
    const p = pointer(event);
    if (!image || !p || !dragRef.current) return;
    rectRef.current = dragRect(dragRef.current, p.point, image.naturalWidth, image.naturalHeight);
    dragRef.current = null;
    updateDetails();
    schedule();
  };

  const selectAll = () => {
    const image = imageRef.current;
    if (!image) return;
    rectRef.current = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
    updateDetails();
    schedule();
  };

  const save = async () => {
    const image = imageRef.current;
    if (!image || !source || saving) return;
    setSaving(true);
    setError(null);
    try {
      const rect = clampRect(rectRef.current, image.naturalWidth, image.naturalHeight);
      if (isFullImage(rect, image.naturalWidth, image.naturalHeight)) {
        await onSave(source);
      } else {
        const geo = exportGeometry(rect, image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = geo.width;
        canvas.height = geo.height;
        const g = canvas.getContext("2d");
        if (!g) throw new Error(CROP_LABELS.canvasFailed);
        g.drawImage(image, geo.sx, geo.sy, geo.sw, geo.sh, 0, 0, geo.width, geo.height);
        let dataUrl = "";
        try { dataUrl = canvas.toDataURL("image/png"); } catch { throw new Error(CROP_LABELS.createFailed); }
        const dataBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        if (!dataBase64) throw new Error(CROP_LABELS.createFailed);
        const result = await app.call("assets.saveCrop", {
          characterId,
          asset: source,
          cropRect: { x: geo.sx, y: geo.sy, width: geo.sw, height: geo.sh },
          sourceSize: { width: image.naturalWidth, height: image.naturalHeight },
          dataBase64
        });
        await onSave(result.asset);
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : CROP_LABELS.createFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open && !!asset} onOpenChange={(o) => { if (!o) onClose(); }} title={CROP_LABELS.title} description={description}
      className="h-[min(820px,calc(100%-32px))] w-[min(920px,calc(100%-32px))] grid-rows-[auto_minmax(0,1fr)_auto] mobile:h-full mobile:w-full mobile:max-h-full mobile:rounded-none">
      <div class="relative min-h-60 overflow-hidden rounded-md bg-[#080a0c]" data-reference-crop-dialog="">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={CROP_LABELS.canvas(asset?.name ?? "")}
          class="absolute inset-0 size-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        {!ready && !error ? <div class="absolute inset-0 grid place-items-center"><Spinner className="size-6 text-muted-foreground" /></div> : null}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class={error ? "min-w-0 flex-1 text-2xs text-destructive" : "min-w-0 flex-1 text-2xs text-muted-foreground"} role={error ? "alert" : undefined}>{error ?? (ready ? details : CROP_LABELS.loading)}</span>
        <Button variant="ghost" disabled={!ready || saving} onClick={selectAll}><RotateCcwIcon />{CROP_LABELS.selectAll}</Button>
        <Button disabled={!ready || saving} onClick={() => void save()}>{saving ? <Spinner /> : <SaveIcon />}{CROP_LABELS.save}</Button>
      </div>
    </Dialog>
  );
}
