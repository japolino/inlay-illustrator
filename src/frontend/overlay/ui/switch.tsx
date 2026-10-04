import { cn } from "./cn.js";

export type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

/** Asset Maid switch (`f1`): a 44px hit area with a 36x20 track. role=switch, Space/Enter toggle. */
export function Switch({ checked, onCheckedChange, disabled, className, ...aria }: SwitchProps) {
  const state = checked ? "checked" : "unchecked";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={state}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      class={cn("group inline-flex size-11 shrink-0 cursor-pointer items-center justify-end rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45", className)}
      {...aria}
    >
      <span aria-hidden="true" class="pointer-events-none h-5 w-9 rounded-full bg-input p-0.5 ring-1 ring-inset ring-white/10 transition-colors group-data-[state=checked]:bg-primary motion-reduce:transition-none">
        <span data-state={state} class="block size-4 translate-x-0 rounded-full bg-muted-foreground shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-primary-foreground motion-reduce:transition-none" />
      </span>
    </button>
  );
}
