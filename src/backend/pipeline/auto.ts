/**
 * Free character / free outfit generation for the chat pipeline (AM 0.9.90 autoCharacter `dyt` @169350 (was `QOt`),
 * autoOutfit `kyt` (was `N1t`), initial outfit image `F0t` (was `ejt`); spec/data.md §1.6). The algorithms are the verbatim slice
 * in ./core/auto-core.ts; this file supplies the stores they expect:
 * - config store (AM `N`): the analysis module's `AmConfigStore` (merged runtime config of the primary character; writes
 *   go back to the character document / global config) + `getSavedSnapshot`, `commitExternalUpdate`, `commitUpdate`,
 *   `subscribeDomain`;
 * - custom character store (AM `A5e`, 0.9.90 `createProfiles` N 30591): entries in `CharacterDocument.customCharacters`,
 *   retry-safe per-owner attempts (no name clash rule since 0.9.90), forms in `characterPrompt.characterForms[id]`;
 * - outfit image generator (AM boot `Ee`): from the analysis module when it exposes one, else creation mode
 *   "tags-only" (AM's own mode for providers without references).
 * Overlapping runs of one character share these stores and controllers, as AM has one of each for the open charx.
 */
import { normalizeFormCollection, parseCustomCharacter, type CharacterDocument, type CustomCharacter } from "../../shared/contract/index.js";
import { AmConfigStore, loadAmConfigParts, type AmConfig } from "../analysis/bridge/config-store.js";
import type { BackendModules } from "../rpc/types.js";
import type { BackendServices } from "../services/types.js";
import { kyt as createAutoOutfit, dyt as createAutoCharacter, F0t as createInitialOutfit } from "./core/auto-core";

type Rec = Record<string, unknown>;

/** AM outfit image generator (boot `Ee`): `generate(input)` then `save(ctx, generated)` -> asset ref. */
export interface AmOutfitGenerator {
  generate(input: Rec): Promise<unknown>;
  save(ctx: Rec, generated: unknown): Promise<unknown>;
}

/** autoOutfit (`kyt`): 0.9.90 dropped the V4.5 route-plan `prepare`; only the per-actor V5 path is left. */
export interface AutoOutfitApi {
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

/**
 * Stable signature of a saved profile (AM 0.9.90 `lte$990` N 30495): JSON of the normalized entry and forms with sorted
 * object keys, so a retry recognizes its own earlier (unconfirmed) save.
 */
export function profileSignature(profile: { entry: CustomCharacter; forms: unknown }): string {
  return JSON.stringify({ entry: parseCustomCharacter(profile.entry) ?? profile.entry, forms: normalizeFormCollection(profile.forms) }, (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Rec).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

/** Errors of {@link customCharacterStore} `createProfiles` (AM 0.9.90 N 30607-30614; Korean originals in `messageKo`). */
export const CREATE_PROFILE_ERRORS = {
  idCollision: { en: "Saving stopped because the new character's id collides with an existing character.", ko: "새 인물의 고유 ID가 기존 인물과 충돌하여 저장을 중단했습니다." },
  formsMissing: { en: "Retry stopped because the saved appearance of the generated character could not be found.", ko: "생성한 인물의 저장된 외형을 찾을 수 없어 재시도를 중단했습니다." },
  deleted: { en: "The generated character was deleted, so it is not saved again.", ko: "생성한 인물이 삭제되어 다시 저장하지 않습니다." },
} as const;
const profileError = (e: { en: string; ko: string }) => Object.assign(new Error(e.en), { messageKo: e.ko });

/**
 * AM `A5e` custom character store over the character document (only what the autoCharacter controller `dyt` uses).
 * `createProfiles(sourceId, profiles, check, owner)` is the 0.9.90 retry-safe save (N 30591-30632): no title / key clash
 * check (same-name free characters are kept), per-owner attempts keyed by entry id with a signature; an existing id is
 * reused only when it is this owner's earlier attempt, a confirmed attempt that was deleted is not saved again.
 */
export function customCharacterStore(services: BackendServices, characterId: string) {
  let entries: CustomCharacter[] = [];
  /** owner -> entry id -> attempt (AM `r` WeakMap-like map of `A`). */
  const attempts = new WeakMap<object, Map<string, { signature: string; confirmed: boolean }>>();
  return {
    /** Entries of a fresh document read (config store reload). */
    reset: (next: CustomCharacter[]) => void (entries = [...next]),
    getSnapshot: () => ({ sourceId: characterId, entries }),
    async createProfiles(sourceId: string, profiles: Array<{ entry: CustomCharacter; forms: unknown }>, check: () => void, owner: object) {
      if (sourceId !== characterId) throw new Error("The free character's source is not the open character.");
      const mine = attempts.get(owner) ?? new Map<string, { signature: string; confirmed: boolean }>();
      attempts.set(owner, mine);
      const result: Array<{ entry: CustomCharacter; forms: unknown }> = [];
      const document = await services.storage.updateCharacterDocument(
        characterId,
        (doc) => {
          check();
          const list = [...doc.customCharacters];
          const forms = { ...doc.characterPrompt.characterForms } as Record<string, unknown>;
          const out: Array<{ entry: CustomCharacter; forms: unknown }> = [];
          let added = false;
          for (const p of profiles) {
            const attempt = mine.get(p.entry.id);
            const existing = list.find((c) => c.id === p.entry.id);
            if (existing) {
              const saved = forms[existing.id];
              if (!attempt || (!attempt.confirmed && (!saved || profileSignature({ entry: existing, forms: saved }) !== attempt.signature)))
                throw profileError(CREATE_PROFILE_ERRORS.idCollision);
              if (!saved) throw profileError(CREATE_PROFILE_ERRORS.formsMissing);
              if (existing.rosterRegistered !== false && existing.workspaceEnabled !== false) out.push({ entry: structuredClone(existing), forms: saved });
              continue;
            }
            if (attempt?.confirmed) throw profileError(CREATE_PROFILE_ERRORS.deleted);
            const profile = { entry: structuredClone(p.entry), forms: normalizeFormCollection(p.forms) };
            mine.set(p.entry.id, { signature: profileSignature(profile), confirmed: false });
            list.push(profile.entry);
            // AM writes the forms of new entries (`Tne` with `before: {}`); an existing form collection of that id is kept.
            if (!forms[profile.entry.id]) forms[profile.entry.id] = profile.forms;
            out.push(profile);
            added = true;
          }
          result.splice(0, result.length, ...out);
          return added ? { ...doc, customCharacters: list, characterPrompt: { ...doc.characterPrompt, characterForms: forms as never } } : doc;
        },
        { reason: "free-character-generation" },
      );
      entries = [...document.customCharacters];
      for (const { entry } of result) mine.get(entry.id)!.confirmed = true;
      return result;
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
 * Opens the free-generation stores of a character for one run (a chat message). Overlapping runs of the
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
