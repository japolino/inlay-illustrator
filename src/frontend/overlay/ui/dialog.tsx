import type { ComponentChildren } from "preact";
import { useId, useRef } from "preact/hooks";
import { cn } from "./cn.js";
import { XIcon } from "./icons.js";
import { Portal, useFocusTrap, useLayer } from "./layers.js";

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ComponentChildren;
  description?: ComponentChildren;
  children?: ComponentChildren;
  /** Footer row (buttons), right-aligned. */
  footer?: ComponentChildren;
  showCloseButton?: boolean;
  /** Close on backdrop click (default true). */
  dismissible?: boolean;
  className?: string;
  role?: "dialog" | "alertdialog";
  initialFocus?: { current: HTMLElement | null };
  closeLabel?: string;
};

/**
 * Modal dialog styled like Asset Maid's `py` (backdrop black/68 + blur,
 * centred card max 480px). Focus is trapped and restored; Escape closes the
 * top-most dialog through the overlay layer stack.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, showCloseButton = true, dismissible = true, className, role = "dialog", initialFocus, closeLabel = "Close" }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useLayer(open, () => onOpenChange(false));
  useFocusTrap(panel, open, initialFocus);
  if (!open) return null;
  return (
    <Portal>
      <div class="fixed inset-0 z-100 bg-black/68 backdrop-blur-sm" aria-hidden="true" onClick={() => { if (dismissible) onOpenChange(false); }} />
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        class={cn("fixed left-1/2 top-1/2 z-110 grid max-h-[calc(100%-32px)] w-[min(480px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-lg bg-popover p-5 text-popover-foreground shadow-2xl outline-none backdrop-blur-2xl", className)}
      >
        <div class={cn("grid gap-1.5", showCloseButton && "pr-8")}>
          <h2 id={titleId} class="text-base font-extrabold">{title}</h2>
          {description ? <p id={descriptionId} class="text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>
        {children}
        {footer ? <div class="flex justify-end gap-2">{footer}</div> : null}
        {showCloseButton ? (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            class="absolute top-3 right-3 grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-md:size-11"
          >
            <XIcon className="size-4" />
            <span class="sr-only">{closeLabel}</span>
          </button>
        ) : null}
      </div>
    </Portal>
  );
}
