import type { LayerStack } from "./ui/layers.js";

export type EscapeEventLike = {
  key: string;
  isComposing?: boolean;
  target: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation?(): void;
};

/**
 * Capture-phase Escape policy for the overlay:
 * - only while the overlay is open and the key event comes from inside the
 *   overlay root (or from the page body when nothing is focused),
 * - closes only the top-most layer (dialog, popover, drawer), or the overlay
 *   itself when no layer is open,
 * - stops propagation so the host does not also react (Lumiverse uses Escape
 *   to stop an in-progress generation).
 * Returns true when the event was handled.
 */
export function handleOverlayEscape(
  event: EscapeEventLike,
  state: { open: boolean; root: Node | null; layers: LayerStack; closeOverlay: () => void }
): boolean {
  if (event.key !== "Escape" || event.isComposing || !state.open || !state.root) return false;
  const target = event.target as Node | null;
  const doc = state.root.ownerDocument;
  const fromPage = !target || target === doc || target === doc?.body || target === doc?.documentElement;
  if (!fromPage && !(typeof state.root.contains === "function" && state.root.contains(target))) return false;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (!state.layers.closeTop()) state.closeOverlay();
  return true;
}
