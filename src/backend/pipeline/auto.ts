/**
 * Free character / free outfit generation for the chat pipeline (AM 0.9.89.5 autoCharacter `QOt` 180391,
 * autoOutfit `N1t` 169112, initial outfit image `ejt` 180598; spec/data.md §1.6). The algorithms are the verbatim slice
 * in ./core/auto-core.ts; this file supplies the stores they expect:
 * - config store (AM `N`): the analysis module's `AmConfigStore` (merged runtime config of the primary character; writes
 *   go back to the character document / global config) + `getSavedSnapshot`, `commitExternalUpdate`, `commitUpdate`,
 *   `subscribeDomain`;
 * - custom character store (AM `A5e`, `createProfiles` 37691): entries in `CharacterDocument.customCharacters`,
 *   clash rule (NFKC title / recognition keys), forms in `characterPrompt.characterForms[id]`;
 * - outfit image generator (AM boot `Ee`): from the analysis module when it exposes one, else creation mode
 *   "tags-only" (AM's own mode for providers without references).
 * Overlapping runs of one character share these stores and controllers, as AM has one of each for the open charx.
 */
import { normalizeFormCollection, type CharacterDocument, type CustomCharacter } from "../../shared/contract/index.js";
import { AmConfigStore, loadAmConfigParts, type AmConfig } from "../analysis/bridge/config-store.js";
import type { BackendModules } from "../rpc/types.js";
import type { BackendServices } from "../services/types.js";
import { N1t as createAutoOutfit, QOt as createAutoCharacter, ejt as createInitialOutfit } from "./core/auto-core";

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
  store: Pick<AmConfigStore, "getCurrentSnapshot" | "settle">;
  autoOutfit: AutoOutfitApi;
  autoCharacter: AutoCharacterApi;
  /** False when no outfit image generator is available (creation mode is forced to "tags-only"). */
  imagesAvailable: boolean;
  dispose(): void;
}

const fold = (s: string) => s.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/gu, " ");

/**
 * AM config store with the extra methods the verbatim code calls, over an `AmConfigStore` that `reload` replaces with a
 * fresh read. Reloads and commits run one at a time; each commit re-reads first, so a store shared by overlapping runs
 * also sees edits saved outside them (Prompts tab) before it reuses, counts or allocates outfits.
 */
function amConfigStoreAdapter(services: BackendServices, characterId: string, onReload: (document: CharacterDocument) => void) {
  type Mutator = (config: AmConfig) => AmConfig;
  let store: AmConfigStore | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };
  const reload = async () => {
    const parts = await loadAmConfigParts(services, characterId);
    store = new AmConfigStore(services, characterId, parts, "chat-generation");
    onReload(parts.document);
  };
  const commit = (apply: (store: AmConfigStore) => Promise<void> | void) =>
    serialize(async () => {
      await reload();
      await apply(store!);
      await store!.flushSave();
    });
  return {
    reload: () => serialize(reload),
    /** Waits for the commits queued so far. */
    settle: () => serialize(async () => {}),
    getCurrentSnapshot: () => store!.getCurrentSnapshot(),
    getSavedSnapshot: () => store!.getCurrentSnapshot(),
    commitExternalUpdate: (fn: () => Promise<Mutator | void> | Mutator | void, options: { domains?: string[] } = {}) =>
      commit(async (s) => {
        const mutate = await fn();
        if (typeof mutate === "function") s.update(mutate, options);
      }),
    // The port keeps one snapshot (current = saved), so AM's `rebase` of the current snapshot is the persisted value itself.
    commitUpdate: (fn: (current: AmConfig, saved: AmConfig) => { persisted: AmConfig } | null, options: { domains?: string[] } = {}) =>
      commit((s) => {
        const snapshot = s.getCurrentSnapshot();
        const result = fn(snapshot, snapshot);
        if (result) s.update(() => result.persisted, options);
      }),
    // AM re-checks running outfit tasks on "workspace" changes (source switch); a character's store never switches source.
    subscribeDomain: (_domain: string, _listener: () => void) => () => {},
  };
}

/** AM `A5e` custom character store over the character document (only what `gOt` uses). */
function customCharacterStore(services: BackendServices, characterId: string) {
  let entries: CustomCharacter[] = [];
  return {
    /** Entries of a fresh document read (config store reload). */
    reset: (next: CustomCharacter[]) => void (entries = [...next]),
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

/** Free-generation stores and controllers of one character, shared by its overlapping runs. */
interface SharedGeneration {
  refs: number;
  config: ReturnType<typeof amConfigStoreAdapter>;
  characters: ReturnType<typeof customCharacterStore>;
  /** autoOutfit / autoCharacter by outfit image availability. */
  controllers: Map<boolean, Pick<AutoGeneration, "autoOutfit" | "autoCharacter"> & { dispose(): void }>;
}

const sharedGenerations = new WeakMap<BackendServices, Map<string, SharedGeneration>>();

function sharedGeneration(services: BackendServices, characterId: string): SharedGeneration {
  const characters = customCharacterStore(services, characterId);
  const config = amConfigStoreAdapter(services, characterId, (document) => characters.reset(document.customCharacters));
  return { refs: 0, config, characters, controllers: new Map() };
}

/**
 * Opens the free-generation stores of a character for one run (chat message, webtoon strip). Overlapping runs of the
 * same character share them, so outfit reuse (`ane`), the 24-outfit cap and new outfit ids see the outfits of every run,
 * and an identical outfit proposal joins the running image task (N1t task map). The last run's `dispose` disposes them.
 */
export async function openAutoGeneration(services: BackendServices, getModules: (() => BackendModules) | undefined, characterId: string): Promise<AutoGeneration> {
  const open = sharedGenerations.get(services) ?? new Map<string, SharedGeneration>();
  sharedGenerations.set(services, open);
  const shared = open.get(characterId) ?? sharedGeneration(services, characterId);
  open.set(characterId, shared);
  shared.refs += 1;
  let released = false;
  const dispose = () => {
    if (released) return;
    released = true;
    if ((shared.refs -= 1) > 0) return;
    if (open.get(characterId) === shared) open.delete(characterId);
    for (const controllers of shared.controllers.values()) controllers.dispose();
  };
  try {
    // A run joining a shared store re-reads the stored config too, so it sees edits saved since the first run opened it.
    await shared.config.reload();
  } catch (error) {
    dispose();
    throw error;
  }
  const generator = outfitGeneratorFrom(getModules, characterId);
  let controllers = shared.controllers.get(!!generator);
  if (!controllers) {
    const { config, characters } = shared;
    const log = (message: string) => {
      try {
        services.log.append("info", "pipeline", message);
      } catch {
        /* ignore */
      }
    };
    const autoOutfit = createAutoOutfit({ config, generator, sourceCatalog: { refreshCharacter: async () => null }, activity: undefined, log }) as AutoOutfitApi & { dispose(): void };
    const autoCharacter = createAutoCharacter({
      config,
      characters,
      isCurrentSource: (id: string) => id === characterId,
      activity: undefined,
      ...(generator
        ? { prepareInitialOutfit: createInitialOutfit({ config, generator, resolveTarget: (id: string) => ({ chaId: id, indexHint: 0 }), refresh: async () => undefined, log }) }
        : {}),
    }) as AutoCharacterApi & { dispose(): void };
    controllers = {
      autoOutfit,
      autoCharacter,
      dispose: () => {
        autoOutfit.dispose();
        autoCharacter.dispose();
      },
    };
    shared.controllers.set(!!generator, controllers);
  }
  return {
    store: shared.config,
    autoOutfit: controllers.autoOutfit,
    autoCharacter: controllers.autoCharacter,
    imagesAvailable: !!generator,
    dispose,
  };
}
