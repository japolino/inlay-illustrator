import type { ComponentChildren } from "preact";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cn } from "./cn.js";
import { Portal, useLayer } from "./layers.js";

export type Placement = { top: number; left: number; maxHeight: number; width?: number };

/**
 * Places floating content below the anchor (or above when there is more room
 * there), clamped to the viewport with an 8px margin.
 */
export function placeBelow(
  anchor: { top: number; bottom: number; left: number; width: number },
  content: { width: number; height: number },
  viewport: { width: number; height: number },
  options: { offset?: number; align?: "start" | "center" | "end"; matchWidth?: boolean } = {}
): Placement {
  const offset = options.offset ?? 6;
  const margin = 8;
  const width = options.matchWidth ? Math.max(anchor.width, content.width) : content.width;
  const spaceBelow = viewport.height - anchor.bottom - offset - margin;
  const spaceAbove = anchor.top - offset - margin;
  const openAbove = content.height > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = Math.max(80, openAbove ? spaceAbove : spaceBelow);
  const height = Math.min(content.height, maxHeight);
  const top = openAbove ? anchor.top - offset - height : anchor.bottom + offset;
  let left = options.align === "end"
    ? anchor.left + anchor.width - width
    : options.align === "center"
      ? anchor.left + anchor.width / 2 - width / 2
      : anchor.left;
  left = Math.min(Math.max(margin, left), Math.max(margin, viewport.width - width - margin));
  return { top: Math.max(margin, top), left, maxHeight, ...(options.matchWidth ? { width } : {}) };
}

export type FloatingProps = {
  open: boolean;
  anchor: { current: HTMLElement | null };
  onClose: () => void;
  align?: "start" | "center" | "end";
  matchWidth?: boolean;
  className?: string;
  role?: "dialog" | "listbox" | "menu";
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  children: ComponentChildren;
  /** Element to focus when opened. Defaults to the floating panel itself. */
  initialFocus?: { current: HTMLElement | null };
  restoreFocus?: boolean;
};

/** Floating panel anchored to an element; closes on Escape (layer) and outside pointer down. */
export function Floating({ open, anchor, onClose, align = "start", matchWidth, className, children, initialFocus, restoreFocus = true, ...rest }: FloatingProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  useLayer(open, () => {
    onClose();
    if (restoreFocus) anchor.current?.focus();
  });

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return undefined;
    }
    const update = () => {
      const anchorElement = anchor.current;
      const element = panel.current;
      if (!anchorElement || !element) return;
      const view = anchorElement.ownerDocument.defaultView || window;
      const rect = anchorElement.getBoundingClientRect();
      setPlacement(placeBelow(rect, { width: element.offsetWidth, height: element.scrollHeight }, { width: view.innerWidth, height: view.innerHeight }, { align, matchWidth }));
    };
    update();
    const view = anchor.current?.ownerDocument.defaultView || window;
    view.addEventListener("resize", update);
    view.addEventListener("scroll", update, true);
    return () => {
      view.removeEventListener("resize", update);
      view.removeEventListener("scroll", update, true);
    };
  }, [open, align, matchWidth]);

  useEffect(() => {
    if (!open) return undefined;
    (initialFocus?.current || panel.current)?.focus({ preventScroll: true });
    const doc = anchor.current?.ownerDocument || document;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (panel.current?.contains(target) || anchor.current?.contains(target))) return;
      onClose();
    };
    doc.addEventListener("pointerdown", onPointerDown, true);
    return () => doc.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  if (!open) return null;
  return (
    <Portal>
      <div
        ref={panel}
        tabIndex={-1}
        class={cn("fixed z-120 overflow-auto rounded-lg bg-popover text-popover-foreground shadow-2xl outline-none backdrop-blur-2xl", className)}
        style={placement
          ? { top: `${placement.top}px`, left: `${placement.left}px`, maxHeight: `${placement.maxHeight}px`, ...(placement.width ? { minWidth: `${placement.width}px` } : {}) }
          : { top: "0px", left: "0px", visibility: "hidden" }}
        {...rest}
      >
        {children}
      </div>
    </Portal>
  );
}

export type PopoverProps = {
  /** Renders the trigger; spread `triggerProps` on a focusable element. */
  trigger: (triggerProps: {
    ref: (element: HTMLElement | null) => void;
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "dialog";
    "aria-controls": string;
  }) => ComponentChildren;
  children: ComponentChildren;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  className?: string;
  "aria-label"?: string;
};

/** Asset Maid popover (`fce`: w-72, p-4) with click toggle, Escape and outside-click close. */
export function Popover({ trigger, children, open: controlledOpen, onOpenChange, align = "center", className, ...aria }: PopoverProps) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };
  const anchor = useRef<HTMLElement | null>(null);
  const id = useId();
  return (
    <>
      {trigger({
        ref: (element) => { anchor.current = element; },
        onClick: () => setOpen(!open),
        "aria-expanded": open,
        "aria-haspopup": "dialog",
        "aria-controls": id
      })}
      <Floating open={open} anchor={anchor} onClose={() => setOpen(false)} align={align} role="dialog" id={id} className={cn("w-72 p-4", className)} {...aria}>
        {children}
      </Floating>
    </>
  );
}
