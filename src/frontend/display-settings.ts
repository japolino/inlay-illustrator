/**
 * Display-setting cache backed by the extension backend.
 *
 * Original scope preserved for `toggle_Card.Display.Max` (per-user raw text).
 * The per-chat `Card.Inlay.Display` button-mode variable is no longer ported:
 * the per-inlay buttons it styled never rendered in Lumiverse, and reroll
 * actions moved to the floating action button + lightbox.
 *
 * The frontend cache makes display changes immediate. Backend state responses
 * remain authoritative across reloads and devices.
 */

type DisplaySettingsListener = () => void;

const listeners = new Set<DisplaySettingsListener>();
let displayMaxRaw = "0";

export function parseDisplayMax(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getDisplayMax(): number {
  return parseDisplayMax(displayMaxRaw);
}

export function getDisplayMaxRaw(): string {
  return displayMaxRaw;
}

/** Keep raw text exactly; the original settings field is a text input. */
export function setDisplayMax(value: string | number): void {
  displayMaxRaw = String(value);
  notify();
}

export function applyDisplaySettingsSnapshot(input: { displayMax?: unknown }): void {
  if (input.displayMax !== undefined) {
    const next = input.displayMax == null ? "0" : String(input.displayMax);
    if (displayMaxRaw !== next) {
      displayMaxRaw = next;
      notify();
    }
  }
}

export function subscribeDisplaySettings(listener: DisplaySettingsListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Test/lifecycle hook. */
export function resetDisplaySettings(): void {
  listeners.clear();
  displayMaxRaw = "0";
}

/** Backwards-compatible test hook name. */
export const resetDisplaySettingsListeners = resetDisplaySettings;
