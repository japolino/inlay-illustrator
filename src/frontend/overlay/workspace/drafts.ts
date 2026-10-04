/**
 * Form collection drafts (AM prompt draft store `bf`/`j6` and persona draft store `Gy`/`VT`).
 * Forms and outfits are edited client-side with the pure form ops and saved as a whole collection
 * (`prompts.saveForms` / `personas.saveForms` with `baseRevision = formCollectionRevision(base)`).
 * One store per AppController; keys: `char:<characterId>:<promptKey>` and `persona:<personaId>`.
 * Immediate toggles (reference / analysis / active flags) are applied to the base AND the draft and
 * saved at once, so a later "Save" keeps a matching base revision.
 */
import { useMemo } from "preact/hooks";
import { formCollectionRevision, type FormCollection } from "../../../shared/contract/character.js";
import { Store, useSelector } from "../../state/store.js";

export interface DraftEntry {
  base: FormCollection;
  value: FormCollection;
  saving: boolean;
  error: string | null;
  /** The last save failed with `conflict`; the next save overwrites. */
  conflict: boolean;
}

export type DraftSaver = (key: string, collection: FormCollection, baseRevision: string) => Promise<{ collection: FormCollection; revision: string }>;

function same(a: FormCollection, b: FormCollection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function draftKeyForCharacter(characterId: string, promptKey: string): string {
  return `char:${characterId}:${promptKey}`;
}
export function draftKeyForPersona(personaId: string): string {
  return `persona:${personaId}`;
}

export class FormDraftStore {
  readonly store = new Store<Record<string, DraftEntry>>({});

  entry(key: string): DraftEntry | undefined {
    return this.store.get()[key];
  }

  isDirty(key: string): boolean {
    const e = this.entry(key);
    return !!e && !same(e.base, e.value);
  }

  dirtyKeys(prefix = ""): string[] {
    return Object.keys(this.store.get()).filter((key) => key.startsWith(prefix) && this.isDirty(key));
  }

  /** Follows the server value while the draft is clean; keeps edits (and rebases) while dirty. */
  sync(key: string, source: FormCollection): void {
    const e = this.entry(key);
    if (!e) {
      this.put(key, { base: source, value: source, saving: false, error: null, conflict: false });
      return;
    }
    if (same(e.base, source)) return;
    if (same(e.base, e.value)) this.put(key, { ...e, base: source, value: source, conflict: false });
    else if (e.conflict) this.put(key, { ...e, base: source });
  }

  /** Current value (draft) for a key, syncing first. */
  read(key: string, source: FormCollection): FormCollection {
    this.sync(key, source);
    return this.entry(key)!.value;
  }

  edit(key: string, source: FormCollection, fn: (value: FormCollection) => FormCollection): void {
    this.sync(key, source);
    const e = this.entry(key)!;
    const next = fn(e.value);
    if (next === e.value) return;
    this.put(key, { ...e, value: next, error: null });
  }

  discard(key: string): void {
    const e = this.entry(key);
    if (e) this.put(key, { ...e, value: e.base, error: null, conflict: false });
  }

  /** Saves one draft. Returns false on error (kept in `error`). */
  async save(key: string, saver: DraftSaver): Promise<boolean> {
    const e = this.entry(key);
    if (!e || e.saving) return false;
    if (same(e.base, e.value) && !e.error) return true;
    const value = e.value;
    this.put(key, { ...e, saving: true, error: null });
    try {
      const result = await saver(key, value, formCollectionRevision(e.base));
      const now = this.entry(key)!;
      // Edits made while saving stay in the draft.
      this.put(key, { base: result.collection, value: same(now.value, value) ? result.collection : now.value, saving: false, error: null, conflict: false });
      return true;
    } catch (error) {
      const now = this.entry(key)!;
      const code = (error as { error?: { code?: string } })?.error?.code;
      this.put(key, { ...now, saving: false, error: error instanceof Error ? error.message : String(error), conflict: code === "conflict" });
      return false;
    }
  }

  /**
   * Immediate change (AM debounced row toggles): applied to base and draft, then saved at once.
   * When the draft is clean only the base path is used.
   */
  async commit(key: string, source: FormCollection, fn: (value: FormCollection) => FormCollection, saver: DraftSaver): Promise<boolean> {
    this.sync(key, source);
    const e = this.entry(key)!;
    const dirty = !same(e.base, e.value);
    const nextBase = fn(e.base);
    const nextValue = dirty ? fn(e.value) : nextBase;
    this.put(key, { ...e, value: nextValue });
    try {
      const result = await saver(key, nextBase, formCollectionRevision(e.base));
      const now = this.entry(key)!;
      this.put(key, { ...now, base: result.collection, value: same(now.value, nextBase) ? result.collection : now.value, conflict: false });
      return true;
    } catch (error) {
      const now = this.entry(key)!;
      this.put(key, { ...now, value: dirty ? now.value : now.base, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  private put(key: string, entry: DraftEntry): void {
    this.store.set({ ...this.store.get(), [key]: entry });
  }
}

const stores = new WeakMap<object, FormDraftStore>();
/** One draft store per owner (the AppController). */
export function draftStoreFor(owner: object): FormDraftStore {
  let store = stores.get(owner);
  if (!store) {
    store = new FormDraftStore();
    stores.set(owner, store);
  }
  return store;
}

export interface DraftView {
  value: FormCollection;
  dirty: boolean;
  saving: boolean;
  error: string | null;
}

/** Subscribes to one draft; `source` is the server collection. */
export function useFormDraftView(drafts: FormDraftStore, key: string, source: FormCollection): DraftView {
  const entry = useSelector(drafts.store, (all) => all[key]);
  const sourceJson = JSON.stringify(source);
  return useMemo(() => {
    const synced = (() => {
      if (!entry) return { base: source, value: source, saving: false, error: null };
      if (!same(entry.base, source) && same(entry.base, entry.value)) return { ...entry, base: source, value: source };
      return entry;
    })();
    return { value: synced.value, dirty: !same(synced.base, synced.value), saving: synced.saving, error: synced.error };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, sourceJson]);
}

/** Aggregate state of all drafts with a prefix (dock save button). */
export function useDraftsSummary(drafts: FormDraftStore, prefix: string): { dirty: boolean; saving: boolean; error: string | null; keys: string[] } {
  const all = useSelector(drafts.store, (s) => s);
  return useMemo(() => {
    const keys = Object.keys(all).filter((k) => k.startsWith(prefix));
    const dirtyKeys = keys.filter((k) => !same(all[k]!.base, all[k]!.value));
    return {
      dirty: dirtyKeys.length > 0,
      saving: keys.some((k) => all[k]!.saving),
      error: keys.map((k) => all[k]!.error).find((e) => !!e) ?? null,
      keys: dirtyKeys
    };
  }, [all, prefix]);
}
