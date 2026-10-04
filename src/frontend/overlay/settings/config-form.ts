/**
 * Settings form state (Asset Maid `axt` 143157): selects/toggles save at once (`ne`, optimistic through
 * `app.updateConfig`), text/number fields only change a local draft (`Ue`) that the header button
 * "Save setting changes" saves (`ot`). Drafts are dropped on unmount (no guard, like Asset Maid).
 */
import { useCallback, useMemo, useState } from "preact/hooks";
import type { DeepPartial } from "../../../shared/contract/rpc.js";
import type { InlayConfig } from "../../../shared/contract/config.js";
import { mergePatch, useApp, useAppState } from "../../state/app-state.js";
import { toRpcError } from "../../rpc/client.js";

export type ConfigPatch = DeepPartial<InlayConfig>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Removes leaves of `patch` that already equal `base` (so typing the saved value back clears the dirty flag). */
export function prunePatch<T>(patch: T, base: unknown): T | undefined {
  if (!isPlainObject(patch)) return JSON.stringify(patch) === JSON.stringify(base) ? undefined : patch;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const pruned = prunePatch(value, isPlainObject(base) ? base[key] : undefined);
    if (pruned !== undefined) out[key] = pruned;
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

/** Deep-merges two patches (arrays replace). */
export function mergePatches(a: ConfigPatch, b: ConfigPatch): ConfigPatch {
  return mergePatch(a, b);
}

export interface ConfigForm {
  /** Saved config with the local draft on top (what the page shows). */
  config: InlayConfig | null;
  saved: InlayConfig | null;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  /** Draft-only change (text/number fields). */
  draft: (patch: ConfigPatch) => void;
  /** Immediate save (selects/toggles). Errors become toasts (AppController) and roll back. */
  apply: (patch: ConfigPatch) => Promise<InlayConfig | null>;
  /** Immediate save that throws instead of toasting (inline error texts, e.g. the direction editors). */
  applyStrict: (patch: ConfigPatch) => Promise<InlayConfig>;
  /** Saves the draft ("Save setting changes"). */
  save: () => Promise<boolean>;
  reset: () => void;
}

export function useConfigForm(): ConfigForm {
  const app = useApp();
  const saved = useAppState((state) => state.config);
  const [draftPatch, setDraftPatch] = useState<ConfigPatch>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = useMemo(() => (saved ? prunePatch(draftPatch, saved) ?? {} : draftPatch), [draftPatch, saved]);
  const config = useMemo(() => (saved ? mergePatch(saved, pending) : null), [saved, pending]);
  const dirty = Object.keys(pending).length > 0;

  const draft = useCallback((patch: ConfigPatch) => {
    setDraftPatch((previous) => mergePatch(previous, patch));
    setError(null);
  }, []);

  const apply = useCallback((patch: ConfigPatch) => app.updateConfig(patch), [app]);

  const applyStrict = useCallback(async (patch: ConfigPatch) => {
    const before = app.state.config;
    if (before) app.store.patch({ config: mergePatch(before, patch) });
    try {
      const result = await app.call("config.update", { patch });
      app.store.patch({ config: result.config });
      return result.config;
    } catch (caught) {
      if (before) app.store.patch({ config: before });
      throw new Error(toRpcError(caught).message);
    }
  }, [app]);

  const save = useCallback(async () => {
    if (!dirty || saving) return false;
    setSaving(true);
    setError(null);
    try {
      const result = await app.call("config.update", { patch: pending });
      app.store.patch({ config: result.config });
      setDraftPatch({});
      return true;
    } catch (caught) {
      setError(toRpcError(caught).message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [app, dirty, saving, pending]);

  const reset = useCallback(() => {
    setDraftPatch({});
    setError(null);
  }, []);

  return { config, saved, dirty, saving, error, draft, apply, applyStrict, save, reset };
}
