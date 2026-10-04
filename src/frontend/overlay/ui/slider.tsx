import { cn } from "./cn.js";

export type SliderProps = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  /** Fires once when the user releases the thumb or leaves the control. */
  onValueCommit?: (value: number) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

/**
 * Single-thumb slider styled like Asset Maid's `k_` (track h-1.5, gold range,
 * 14px thumb). A native range input underneath keeps keyboard and screen
 * reader behaviour (arrows, Page Up/Down, Home/End).
 */
export function Slider({ value, min = 0, max = 100, step = 1, onValueChange, onValueCommit, disabled, className, ...aria }: SliderProps) {
  const span = max - min;
  const percent = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0;
  return (
    <div data-slot="slider" data-disabled={disabled ? "" : undefined} class={cn("relative flex h-5 w-full touch-none items-center select-none data-disabled:cursor-not-allowed data-disabled:opacity-45", className)}>
      <div aria-hidden="true" class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-input">
        <div class="absolute inset-y-0 left-0 bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <div aria-hidden="true" class="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-sm ring-2 ring-background" style={{ left: `${percent}%` }} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        class="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onInput={(event) => onValueChange(Number((event.currentTarget as HTMLInputElement).value))}
        onChange={(event) => onValueCommit?.(Number((event.currentTarget as HTMLInputElement).value))}
        {...aria}
      />
    </div>
  );
}
