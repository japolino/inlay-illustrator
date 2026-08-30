/**
 * Display-setting cache backed by the extension backend.
 *
 * Original scope is preserved:
 * - Card.Inlay.Display is stored per chat in states/<chatId>.json.
 * - toggle_Card.Display.Max is stored per user in config.json as raw text.
 *
 * The frontend cache makes display changes immediate. Backend state responses
 * remain authoritative across reloads and devices.
 */

const VALID_DISPLAY_MODES = new Set(["0", "1", "2", "3"]);

type DisplaySettingsListener = () => void;
type DisplayModeTransport = (payload: { chatId: string; displayMode: string }) => void;

const listeners = new Set<DisplaySettingsListener>();
const displayModes = new Map<string, string>();
let displayMaxRaw = "0";
let displayModeTransport: DisplayModeTransport | null = null;

export function normalizeDisplayMode(value: string | null | undefined): string {
  const raw = value ?? "0";
  if (raw === "null" || raw === "") return "0";
  return raw;
}

export function isValidDisplayMode(value: string): boolean {
  return VALID_DISPLAY_MODES.has(value);
}

export function getDisplayMode(chatId: string): string {
  return normalizeDisplayMode(displayModes.get(chatId || "") ?? null);
}

export function setDisplayMode(chatId: string, mode: string): void {
  const key = chatId || "";
  displayModes.set(key, mode);
  notify();
  if (chatId && displayModeTransport) displayModeTransport({ chatId, displayMode: mode });
}

/** Lua `tonumber(value) or 0` equivalent used only at display time. */
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

export function applyDisplaySettingsSnapshot(input: {
  chatId?: string;
  displayMode?: unknown;
  displayMax?: unknown;
}): void {
  let changed = false;
  if (typeof input.chatId === "string" && input.displayMode !== undefined) {
    const next = input.displayMode == null ? "0" : String(input.displayMode);
    if (displayModes.get(input.chatId) !== next) {
      displayModes.set(input.chatId, next);
      changed = true;
    }
  }
  if (input.displayMax !== undefined) {
    const next = input.displayMax == null ? "0" : String(input.displayMax);
    if (displayMaxRaw !== next) {
      displayMaxRaw = next;
      changed = true;
    }
  }
  if (changed) notify();
}

export function configureDisplayModeTransport(transport: DisplayModeTransport): () => void {
  displayModeTransport = transport;
  return () => {
    if (displayModeTransport === transport) displayModeTransport = null;
  };
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
  displayModes.clear();
  displayMaxRaw = "0";
  displayModeTransport = null;
}

/** Backwards-compatible test hook name. */
export const resetDisplaySettingsListeners = resetDisplaySettings;
