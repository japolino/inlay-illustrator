import type { ComponentChildren } from "preact";
import { SHELL_LABELS } from "./labels.js";

/** Card used by screens that the port has not implemented yet. */
export function Placeholder({ children }: { children?: ComponentChildren }) {
  return (
    <div class="grid gap-1.5 rounded-lg bg-card p-4">
      {children ? <p class="text-xs font-bold">{children}</p> : null}
      <p class="text-xs leading-relaxed text-muted-foreground">{SHELL_LABELS.placeholderNote}</p>
    </div>
  );
}
