/**
 * Free character / free outfit generation for the chat pipeline (AM autoCharacter `gOt` 179282 + `prepare` 179298,
 * autoOutfit `a1t` 168426, initial outfit image `yOt` 179498; spec/data.md §1.6). The algorithms are the verbatim slice
 * in ./core/auto-core.ts; this file supplies the stores they expect:
 * - config store (AM `N`): the analysis module's `AmConfigStore` (merged runtime config of the primary character; writes
 *   go back to the character document / global config) + `getSavedSnapshot`, `commitExternalUpdate`, `commitUpdate`;
 * - custom character store (AM `A5e`, `createProfiles` 37691): entries in `CharacterDocument.customCharacters`,
 *   clash rule (NFKC title / recognition keys), forms in `characterPrompt.characterForms[id]`;
 * - outfit image generator (AM boot `Ee`): from the analysis module when it exposes one, else creation mode
 *   "tags-only" (AM's own mode for providers without references).
 */
import { normalizeFormCollection, type CharacterDocument, type CustomCharacter } from "../../shared/contract/index.js";
import { AmConfigStore, type AmConfig } from "../analysis/bridge/config-store.js";
import type { BackendModules } from "../rpc/types.js";
import type { BackendServices } from "../services/types.js";
import { a1t as createAutoOutfit, gOt as createAutoCharacter, yOt as createInitialOutfit } from "./core/auto-core";

type Rec = Record<string, unknown>;

/** AM outfit image generator (boot `Ee`): `generate(input)` then `save(ctx, generated)` -> asset ref. */
export interface AmOutfitGenerator {
  generate(input: Rec): Promise<unknown>;
  save(ctx: Rec, generated: unknown): Promise<unknown>;
}

export interface AutoOutfitApi {
  prepare(input: { routePlan: unknown; source: unknown; sourceId: string; signal?: AbortSignal; creationMode: string }): Promise<void>;
  prepareActors(input: { actors: unknown[]; source: unknown; sourceId: string; signal?: AbortSignal; creationMode: string; onOutfitAllocated?: (o: Rec) => void }): Promise<{ selectedOutfitIds: Record<string, string>; preparedOutfits?: Rec }>;
}
export interface AutoCharacterApi {
  prepare(input: Rec): Promise<Array<Rec & { candidateKey: string; identityKey: string; forms?: unknown }>>;
  settle(): Promise<void>;
}

export interface AutoGeneration {
  /** AM config store used by the late prompt callbacks (`getConfig`), so generated outfits / forms are visible. */
  store: AmConfigStore;
  autoOutfit: AutoOutfitApi;
  autoCharacter: AutoCharacterApi;
  /** False when no outfit image generator is available (creation mode is forced to "tags-only"). */
  imagesAvailable: boolean;
  dispose(): void;
}

const fold = (s: string) => s.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/gu, " ");

/** Store wrapper with the extra AM config-store methods the verbatim code calls. */
function amConfigStoreAdapter(store: AmConfigStore) {
  type Mutator = (config: AmConfig) => AmConfig;
  const adapter = Object.create(store) as AmConfigStore & {
    getSavedSnapshot(): AmConfig;
    commitExternalUpdate(fn: () => Promise<Mutator | void> | Mutator | void, options?: { domains?: string[] }): Promise<void>;
    commitUpdate(fn: (current: AmConfig, saved: AmConfig) => { persisted: AmConfig }, options?: { domains?: string[] }): Promise<void>;
  };
  adapter.getSavedSnapshot = () => store.getCurrentSnapshot();
  adapter.commitExternalUpdate = async (fn, options = {}) => {
    const mutate = await fn();
    if (typeof mutate === "function") store.update(mutate, options);
    await store.flushSave();
  };
  adapter.commitUpdate = async (fn, options = {}) => {
    const snapshot = store.getCurrentSnapshot();
    const result = fn(snapshot, snapshot);
    store.update(() => result.persisted, options);
    await store.flushSave();
  };
  // Methods of the prototype must run with the real store as `this`.
  for (const name of ["getCurrentSnapshot", "update", "flushSave", "settle", "getDomainRevision", "getPersistenceSnapshot", "subscribePersistence"] as const)
    (adapter as unknown as Rec)[name] = (store[name] as (...a: unknown[]) => unknown).bind(store);
  return adapter;
}

/** AM `A5e` custom character store over the character document (only what `gOt` uses). */
function customCharacterStore(services: BackendServices, characterId: string, initial: CharacterDocument) {
  let entries: CustomCharacter[] = [...initial.customCharacters];
  return {
    getSnapshot: () => ({ sourceId: characterId, entries }),
    /** AM `createProfiles` 37691: existing enabled entries are reused; new ones whose title/keys clash are skipped. */
    async createProfiles(sourceId: string, profiles: Array<{ entry: CustomCharacter; forms: unknown }>, check: () => void) {
      const created: Array<{ entry: CustomCharacter; forms: unknown }> = [];
      if (sourceId !== characterId) return created;
      const document = await services.storage.updateCharacterDocument(
        characterId,
        (doc) => {
          check();
          const list = [...doc.customCharacters];
          const forms = { ...doc.characterPrompt.characterForms };
          const out: Array<{ entry: CustomCharacter; forms: unknown }> = [];
          for (const p of profiles) {
            const existing = list.find((c) => c.id === p.entry.id);
            if (existing) {
              const f = forms[existing.id];
              if (f && existing.rosterRegistered !== false && existing.workspaceEnabled !== false) out.push({ entry: structuredClone(existing), forms: f });
              continue;
            }
            const keys = new Set([p.entry.title, ...p.entry.recognitionKeys].map(fold));
            if (list.some((c) => [c.title, ...c.recognitionKeys].some((k) => keys.has(fold(k))))) continue;
            const collection = normalizeFormCollection(p.forms);
            list.push(structuredClone(p.entry));
            if (!forms[p.entry.id]) forms[p.entry.id] = collection;
            out.push({ entry: structuredClone(p.entry), forms: collection });
          }
          created.splice(0, created.length, ...out);
          return { ...doc, customCharacters: list, characterPrompt: { ...doc.characterPrompt, characterForms: forms } };
        },
        { reason: "free-character-generation" },
      );
      entries = [...document.customCharacters];
      return created;
    },
  };
}

/** Optional AM outfit generator from the analysis module (`outfitImages.amGenerator(characterId)`). */
function outfitGeneratorFrom(getModules: (() => BackendModules) | undefined, characterId: string): AmOutfitGenerator | null {
  try {
    const images = (getModules?.() as { analysis?: { outfitImages?: { amGenerator?: (id: string) => AmOutfitGenerator } } } | undefined)?.analysis?.outfitImages;
    return images?.amGenerator ? images.amGenerator(characterId) : null;
  } catch {
    return null;
  }
}

export async function openAutoGeneration(services: BackendServices, getModules: (() => BackendModules) | undefined, characterId: string): Promise<AutoGeneration> {
  const store = await AmConfigStore.open(services, characterId, "chat-generation");
  const config = amConfigStoreAdapter(store);
  const document = await services.storage.loadCharacterDocument(characterId);
  const generator = outfitGeneratorFrom(getModules, characterId);
  const log = (message: string) => {
    try {
      services.log.append("info", "pipeline", message);
    } catch {
      /* ignore */
    }
  };
  const autoOutfit = createAutoOutfit({ config, generator, sourceCatalog: { refreshCharacter: async () => null }, activity: undefined, log }) as AutoOutfitApi;
  const autoCharacter = createAutoCharacter({
    config,
    characters: customCharacterStore(services, characterId, document),
    isCurrentSource: (id: string) => id === characterId,
    activity: undefined,
    ...(generator
      ? { prepareInitialOutfit: createInitialOutfit({ config, generator, resolveTarget: (id: string) => ({ chaId: id, indexHint: 0 }), refresh: async () => undefined, log }) }
      : {}),
  }) as AutoCharacterApi & { dispose(): void };
  return {
    store,
    autoOutfit,
    autoCharacter,
    imagesAvailable: !!generator,
    dispose: () => autoCharacter.dispose(),
  };
}
