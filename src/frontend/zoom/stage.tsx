/**
 * Zoom stage (AM `Yxe` 163272): the image (object-contain), hover/tap step zones, loading / error states and
 * the character coordinate board (AM `Tkt` 163107-163271) drawn over the displayed image rect.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cn } from "../overlay/ui/cn.js";
import { IconButton } from "../overlay/ui/index.js";
import { ChevronLeftIcon, ChevronRightIcon, ImageOffIcon, LoaderIcon, SaveIcon, UndoIcon } from "./icons.js";
import { fill, ZOOM_LABELS } from "./labels.js";
import { aiChoiceZoneTop, AI_CHOICE_ZONE, clampCoordinate, containRect, formatCenter, isRemovalPoint, parkedX, pointToCenter, type CoordinateMarker, type Rect } from "./model.js";

const MARKER_COLORS = ["bg-coordinate-1", "bg-coordinate-2", "bg-coordinate-3", "bg-coordinate-4", "bg-coordinate-5", "bg-coordinate-6", "bg-coordinate-7", "bg-coordinate-8"];
export function markerColor(index: number): string {
  return MARKER_COLORS[index % MARKER_COLORS.length]!;
}

export interface CoordinateBoardState {
  markers: CoordinateMarker[];
  selected: number | null;
  saving: boolean;
  error: string | null;
  onMove: (actorIndex: number, center: { x: number; y: number } | null) => void;
  onSelect: (actorIndex: number) => void;
  onSave: () => void;
  onCancel: () => void;
}

export interface StageProps {
  url: string;
  alt: string;
  width: number;
  height: number;
  canStep: boolean;
  onStep: (delta: number) => void;
  compact?: boolean;
  onTap?: () => void;
  board?: CoordinateBoardState | null;
  /** Bottom area covered by mobile chrome (px). */
  bottomInset?: number;
  children?: ComponentChildren;
}

export function Stage({ url, alt, width, height, canStep, onStep, compact, onTap, board, bottomInset = 0, children }: StageProps) {
  const stage = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [rect, setRect] = useState<Rect | null>(null);
  const [stageHeight, setStageHeight] = useState(0);
  const natural = useRef({ w: width, h: height });

  useEffect(() => {
    setStatus(url ? "loading" : "error");
  }, [url]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    const update = () => {
      setStageHeight(el.clientHeight);
      setRect(containRect(el.clientWidth, el.clientHeight, natural.current.w || width, natural.current.h || height));
    };
    update();
    const Observer = (el.ownerDocument.defaultView as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
    if (!Observer) return undefined;
    const observer = new Observer(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [url, width, height, !!board]);

  return (
    <section
      ref={stage}
      class="group/stage relative min-h-0 min-w-0 overflow-hidden bg-background/28"
      data-ii-zoom-stage=""
      onClick={board ? undefined : onTap}
    >
      {url ? (
        <img
          key={url}
          src={url}
          alt={alt}
          class={cn("absolute inset-0 size-full object-contain transition-opacity duration-200", status === "ready" ? "opacity-100" : "opacity-0")}
          style={{ maxWidth: "none", height: "100%" }}
          draggable={false}
          onLoad={(event) => {
            const img = event.currentTarget as HTMLImageElement;
            natural.current = { w: img.naturalWidth || width, h: img.naturalHeight || height };
            setStatus("ready");
            const el = stage.current;
            if (el) setRect(containRect(el.clientWidth, el.clientHeight, natural.current.w, natural.current.h));
          }}
          onError={() => setStatus("error")}
        />
      ) : null}
      {status === "loading" && url ? (
        <div class="absolute inset-0 grid place-items-center text-muted-foreground" role="status" aria-label={ZOOM_LABELS.loadingImage}><LoaderIcon className="size-6" /></div>
      ) : null}
      {status === "error" ? (
        <div class="absolute inset-0 grid place-content-center justify-items-center gap-2 text-muted-foreground">
          <ImageOffIcon className="size-6" />
          <span class="text-xs">{ZOOM_LABELS.cannotLoad}</span>
        </div>
      ) : null}
      {canStep && !board ? (
        <>
          <StepZone side="left" compact={compact} onStep={() => onStep(-1)} />
          <StepZone side="right" compact={compact} onStep={() => onStep(1)} />
        </>
      ) : null}
      {board ? (
        <>
          <div class={cn("absolute right-3 z-40 flex items-center gap-1 rounded-lg bg-background/82 p-1 shadow-lg backdrop-blur-xl", compact ? "top-16" : "top-3")} data-ii-zoom-coordinate-toolbar="">
            <span class="whitespace-nowrap px-2 text-xs font-bold text-muted-foreground">{ZOOM_LABELS.setCoordinates}</span>
            <IconButton label={ZOOM_LABELS.cancelCoordinates} disabled={board.saving} onClick={board.onCancel}><UndoIcon /></IconButton>
            <IconButton label={ZOOM_LABELS.saveCoordinates} title={ZOOM_LABELS.saveCoordinatesTitle} variant="subtle" disabled={board.saving} onClick={board.onSave} data-ii-zoom-coordinate-save="">
              {board.saving ? <LoaderIcon /> : <SaveIcon />}
            </IconButton>
          </div>
          {board.error ? <span role="alert" class={cn("absolute left-3 z-40 max-w-64 rounded-md bg-destructive/18 px-2 py-1 text-2xs font-bold text-destructive", compact ? "top-30" : "top-15")}>{board.error}</span> : null}
          {rect ? (
            <CoordinateBoard rect={rect} zoneTop={aiChoiceZoneTop(rect, stageHeight, bottomInset)} compact={compact} board={board} />
          ) : (
            <div class={cn("absolute left-3 z-30 flex items-center gap-2 rounded-lg bg-background/82 p-2 shadow-lg", compact ? "top-30" : "top-16")} role="status">
              <LoaderIcon /><span class="text-xs font-bold">{ZOOM_LABELS.preparingCanvas}</span>
            </div>
          )}
        </>
      ) : null}
      {children}
    </section>
  );
}

function StepZone({ side, compact, onStep }: { side: "left" | "right"; compact?: boolean; onStep: () => void }) {
  const label = side === "left" ? ZOOM_LABELS.previousImage : ZOOM_LABELS.nextImage;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      class={cn(
        "group/step absolute inset-y-0 z-20 flex items-center outline-none",
        compact ? "w-14" : "w-1/3",
        side === "left" ? "left-0 justify-start pl-3" : "right-0 justify-end pr-3"
      )}
      onClick={(event) => {
        event.stopPropagation();
        onStep();
      }}
    >
      <span class={cn("grid size-9 place-items-center rounded-full bg-background/72 text-foreground shadow-lg backdrop-blur-xl transition-opacity", compact ? "size-11 opacity-80" : "opacity-0 group-hover/step:opacity-100 group-focus-visible/step:opacity-100")}>
        {side === "left" ? <ChevronLeftIcon className="size-5" /> : <ChevronRightIcon className="size-5" />}
      </span>
    </button>
  );
}

function CoordinateBoard({ rect, zoneTop, compact, board }: { rect: Rect; zoneTop: number; compact?: boolean; board: CoordinateBoardState }) {
  const element = useRef<HTMLDivElement>(null);
  const drag = useRef<{ actorIndex: number; startX: number; startY: number; moved: boolean; startedParked: boolean } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const size = compact ? 44 : 40;
  const parked = board.markers.filter((m) => !m.center);

  const local = (event: PointerEvent) => {
    const box = element.current!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const onPointerDown = (marker: CoordinateMarker) => (event: PointerEvent) => {
    if (board.saving) return;
    event.preventDefault();
    event.stopPropagation();
    board.onSelect(marker.actorIndex);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    drag.current = { actorIndex: marker.actorIndex, startX: event.clientX, startY: event.clientY, moved: false, startedParked: !marker.center };
  };
  const onPointerMove = (event: PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) <= 3) return;
    state.moved = true;
    const p = local(event);
    const inZone = p.y >= zoneTop;
    if (state.startedParked && inZone) return;
    if (isRemovalPoint(rect, p.y) || (inZone && !state.startedParked)) {
      setRemoving(state.actorIndex);
      return;
    }
    setRemoving(null);
    state.startedParked = false;
    board.onMove(state.actorIndex, pointToCenter(rect, p.x, p.y));
  };
  const onPointerUp = (event: PointerEvent) => {
    const state = drag.current;
    drag.current = null;
    if (state?.moved && removing === state.actorIndex) board.onMove(state.actorIndex, null);
    setRemoving(null);
    void event;
  };
  const onKeyDown = (marker: CoordinateMarker) => (event: KeyboardEvent) => {
    const delta: Record<string, [number, number]> = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] };
    const step = delta[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    const base = marker.center ?? { x: 0.5, y: 0.5 };
    board.onMove(marker.actorIndex, { x: clampCoordinate(base.x + step[0]), y: clampCoordinate(base.y + step[1]) });
  };

  return (
    <div
      ref={element}
      role="group"
      aria-label={ZOOM_LABELS.coordinateBoard}
      aria-disabled={board.saving ? "true" : undefined}
      data-ii-zoom-coordinate-board=""
      class="absolute z-30"
      style={{ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null; setRemoving(null); }}
      onClick={(event) => event.stopPropagation()}
    >
      <div class="pointer-events-none absolute inset-0 rounded-sm ring-1 ring-white/25" />
      <div
        class={cn("pointer-events-none absolute inset-x-0 grid place-items-center rounded-md text-2xs font-black uppercase tracking-wider text-white/80 backdrop-blur-md transition-colors", removing !== null ? "bg-destructive/45" : "bg-black/38")}
        style={{ top: `${zoneTop}px`, height: `${AI_CHOICE_ZONE}px` }}
        data-ii-zoom-ai-choice-zone=""
      >
        {ZOOM_LABELS.aiChoice}
      </div>
      {board.markers.map((marker) => {
        const parkedIndex = parked.indexOf(marker);
        const left = marker.center ? marker.center.x * rect.width : parkedX(parkedIndex, parked.length, rect.width) + size / 2;
        const top = marker.center ? marker.center.y * rect.height : zoneTop + AI_CHOICE_ZONE / 2;
        const selected = board.selected === marker.actorIndex;
        const aria = !marker.center
          ? fill(ZOOM_LABELS.markerUnassigned, { n: marker.ordinal, label: marker.label })
          : removing === marker.actorIndex
            ? fill(ZOOM_LABELS.markerToAiChoice, { n: marker.ordinal, label: marker.label })
            : fill(ZOOM_LABELS.markerAt, { n: marker.ordinal, label: marker.label, x: marker.center.x.toFixed(2), y: marker.center.y.toFixed(2) });
        const showLabel = !marker.center || selected;
        const labelBelow = top < 40;
        return (
          <div key={marker.actorIndex} class="absolute" style={{ left: `${left}px`, top: `${top}px` }}>
            {showLabel ? (
              <span class={cn("pointer-events-none absolute whitespace-nowrap rounded-full bg-background/86 px-2 py-0.5 text-2xs font-bold shadow-md", marker.center ? "left-1/2 -translate-x-1/2" : "-left-5", labelBelow ? "top-6" : "-top-12")}>
                {marker.label} · {formatCenter(marker.center, ZOOM_LABELS.aiChoice)}
              </span>
            ) : null}
            <button
              type="button"
              aria-label={aria}
              aria-pressed={selected}
              data-ii-zoom-marker={marker.ordinal}
              class={cn(
                "absolute grid -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full border-2 border-white text-xs font-black text-white shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
                markerColor(marker.colorIndex),
                selected && "ring-2 ring-white/70",
                removing === marker.actorIndex && "opacity-60"
              )}
              style={{ width: `${size}px`, height: `${size}px`, cursor: "grab" }}
              onPointerDown={onPointerDown(marker)}
              onKeyDown={onKeyDown(marker)}
            >
              {marker.ordinal}
            </button>
          </div>
        );
      })}
    </div>
  );
}
