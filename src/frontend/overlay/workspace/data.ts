/**
 * Data access helpers of the workspace tabs: persona list cache, form collection savers (character /
 * persona) that keep the app's workspace snapshot and the persona cache in sync, asset selection writes.
 */
import { useEffect } from "preact/hooks";
import { personaPromptKey, toStoredAssetRef, type AssetRef, type FormCollection } from "../../../shared/contract/character.js";
import type { PersonaSummary } from "../../../shared/contract/rpc.js";
import type { AppController } from "../../state/app-state.js";
import { useAppState } from "../../state/app-state.js";
import { Store, useSelector } from "../../state/store.js";
import type { DraftSaver } from "./drafts.js";

interface PersonaCache { characterId: string | null; personas: PersonaSummary[] | null; loading: boolean; error: string | null; revision: number }
const personaStores = new WeakMap<object, { store: Store<PersonaCache>; request: number }>();
function personaStore(app: AppController) {
  let entry = personaStores.get(app);
  if (!entry) personaStores.set(app, (entry = { store: new Store<PersonaCache>({ characterId: null, personas: null, loading: false, error: null, revision: -1 }), request: 0 }));
  return entry;
}

export async function reloadPersonas(app: AppController, characterId: string | null, revision = 0): Promise<void> {
  const entry = personaStore(app);
  const id = ++entry.request;
  entry.store.patch({ characterId, loading: true, error: null, revision });
  try {
    const { personas } = await app.call("personas.list", characterId ? { characterId } : {});
    if (id === entry.request) entry.store.patch({ personas, loading: false });
  } catch (error) {
    if (id === entry.request) entry.store.patch({ loading: false, error: error instanceof Error ? error.message : String(error) });
  }
}

/** Persona list of the workspace character (shared cache; reloads on character / document changes). */
export function usePersonas(app: AppController, characterId: string | null): { personas: PersonaSummary[] | null; loading: boolean; error: string | null } {
  const entry = personaStore(app);
  const state = useSelector(entry.store, (s) => s);
  const revision = useAppState((s) => (characterId ? s.documentRevision[characterId] ?? 0 : 0));
  useEffect(() => {
    const s = entry.store.get();
    if (s.characterId !== characterId || s.revision !== revision || (!s.personas && !s.loading)) void reloadPersonas(app, characterId, revision);
  }, [characterId, revision]);
  return { personas: state.characterId === characterId ? state.personas : null, loading: state.loading, error: state.error };
}

export function patchPersonaCache(app: AppController, personaId: string, collection: FormCollection): void {
  const entry = personaStore(app);
  const s = entry.store.get();
  if (!s.personas) return;
  entry.store.patch({ personas: s.personas.map((p) => (p.personaId === personaId ? { ...p, forms: collection } : p)) });
}

/** Writes a saved character collection into the current workspace snapshot. */
export function applyCharacterCollection(app: AppController, characterId: string, promptKey: string, collection: FormCollection): void {
  const ws = app.state.workspace;
  if (!ws || ws.characterId !== characterId) return;
  const cp = ws.document.characterPrompt;
  app.applyWorkspace({ ...ws, document: { ...ws.document, characterPrompt: { ...cp, characterForms: { ...cp.characterForms, [promptKey]: collection } } } });
}

/** Saver for `char:<characterId>:<promptKey>` / `persona:<personaId>` draft keys. */
export function formSaver(app: AppController): DraftSaver {
  return async (key, collection, baseRevision) => {
    if (key.startsWith("persona:")) {
      const personaId = key.slice("persona:".length);
      const result = await app.call("personas.saveForms", { personaId, collection, baseRevision });
      patchPersonaCache(app, personaId, result.collection);
      return result;
    }
    const rest = key.slice("char:".length);
    const i = rest.indexOf(":");
    const characterId = rest.slice(0, i);
    const promptKey = rest.slice(i + 1);
    const result = await app.call("prompts.saveForms", { characterId, promptKey, collection, baseRevision });
    applyCharacterCollection(app, characterId, promptKey, result.collection);
    return result;
  };
}

/** Writes an asset selection (AM `Hy`, immediate) and patches the snapshot optimistically. */
export async function writeSelection(app: AppController, characterId: string, promptKey: string, assets: AssetRef[]): Promise<void> {
  const stored = assets.map((a) => toStoredAssetRef(a));
  const ws = app.state.workspace;
  if (ws && ws.characterId === characterId) {
    const cp = ws.document.characterPrompt;
    app.applyWorkspace({
      ...ws,
      roster: ws.roster.map((r) => (r.promptKey === promptKey ? { ...r, selectedAssetCount: stored.length } : r)),
      document: { ...ws.document, characterPrompt: { ...cp, assetSelections: { ...cp.assetSelections, [promptKey]: { selectedAssets: stored, selectedAssetNames: stored.map((a) => a.name) } } } }
    });
  }
  try {
    await app.call("assets.setSelection", { characterId, promptKey, assets: stored });
  } catch (error) {
    app.notifyError(error);
    void app.reloadWorkspace();
  }
}

export function personaSelectionKey(personaId: string): string {
  return personaPromptKey(personaId);
}

/** Applies a collection saved by another call (e.g. `outfitImage.save`) to the snapshot / persona cache. */
export function applySavedCollection(app: AppController, characterId: string | null, target: { kind: "character"; promptKey: string } | { kind: "persona"; personaId: string }, collection: FormCollection): void {
  if (target.kind === "persona") patchPersonaCache(app, target.personaId, collection);
  else if (characterId) applyCharacterCollection(app, characterId, target.promptKey, collection);
}
