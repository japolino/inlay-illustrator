/**
 * Workspace (에셋분석 / 프롬프트 tabs) projection and roster / custom-character / prompts-tab writes.
 * AM sources: roster projection `FT` L100652 + `R6` L100686, roster writer L103459-103497, module connect `Crt` L86294,
 * recognition keys `Ife` L88575, custom character store `A5e` L37607-37900 (+ `JJ` L33099 on remove), forms revision `ds`/`GY` L25348.
 */
import {
  compileMainPrompt,
  createCustomCharacter,
  customCharacterRosterState,
  effectiveRecognitionKeys,
  formCollectionRevision,
  normalizeFormCollection,
  promoteCustomCharacter,
  removePromptKeyData,
  resolveCharacterForms,
  resolveEffectiveConfig,
  updateCustomCharacter,
  validateCustomCharacterInput,
  type AssetRef,
  type CharacterDocument,
  type CustomCharacter,
  type CustomCharacterInput,
  type FormCollection,
  type MetadataAvailability,
  type RosterItem,
  type WorkspaceSnapshot,
} from "../../shared/contract/index.js";
import { fail } from "../rpc/errors.js";
import type { AmSource, BackendServices, CharacterImageAsset } from "../services/types.js";
import { amFn } from "./core/index.js";
import { AmConfigStore, loadAmConfigParts, metadataCachePath, mutateAmConfig } from "./bridge/config-store.js";
import { createAmPriorityAssets } from "./bridge/asset-index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const VIRTUAL_MEMBER_PREFIX = "virtual-character:";
const LEGACY_PROMPT_MAPS = ["basePromptGroups", "lorebookPrompts", "lorebookNegativePrompts", "lorebookPromptGenders", "characterReferences", "outfitPrompts"] as const;

/** AM error with the Korean original kept in `messageKo`. */
function amFail(code: "bad-request" | "not-found" | "conflict", message: string, messageKo: string, detailCode?: string): never {
  fail(code, message, { messageKo, ...(detailCode ? { detailCode } : {}) });
}

/** URL lookup for asset refs (Lumiverse image id = AssetRef.key). */
export function imageUrlIndex(images: CharacterImageAsset[]): (asset: Pick<AssetRef, "key" | "name"> | null | undefined) => string | null {
  const byKey = new Map<string, CharacterImageAsset>();
  const byName = new Map<string, CharacterImageAsset>();
  for (const image of images) {
    if (image.imageId) byKey.set(image.imageId, image);
    if (image.asset?.key) byKey.set(image.asset.key, image);
    if (image.asset?.name && !byName.has(image.asset.name)) byName.set(image.asset.name, image);
  }
  return (asset) => {
    if (!asset) return null;
    const hit = (asset.key && byKey.get(asset.key)) || (asset.name && byName.get(asset.name));
    return hit ? hit.thumbnailUrl || hit.url : null;
  };
}

/** Roster rows (AM `FT` + `R6`) of a runtime source (custom characters already projected by `rI`). */
export function projectRoster(source: AmSource, document: CharacterDocument, options: { thumbnail?: (promptKey: string, row: Omit<RosterItem, "thumbnailUrl">) => string | null } = {}): RosterItem[] {
  const Fs = amFn("Fs");
  const cp = document.characterPrompt;
  const customs = new Map(document.customCharacters.map((c) => [c.id, c]));
  const rows: RosterItem[] = [];
  const seen = new Set<string>();
  for (const member of source.members) {
    for (const lore of member.lorebooks) {
      const promptKey: string = Fs(member, lore);
      if (!promptKey || seen.has(promptKey)) continue;
      seen.add(promptKey);
      const custom = lore.runtimeOrigin?.kind === "custom-character" ? customs.get(lore.runtimeOrigin.id) : undefined;
      const state = custom
        ? customCharacterRosterState(custom)
        : (() => {
            const selected = new Set(cp.selectedLorebooks[member.key] ?? []);
            const disabled = new Set(cp.workspaceDisabledLorebooks[member.key] ?? []);
            const registered = lore.runtimeSelected === true || selected.has(lore.id) || selected.has(lore.selectionId);
            return { registered, workspaceEnabled: registered && !(disabled.has(lore.id) || disabled.has(lore.selectionId)) };
          })();
      const forms = resolveCharacterForms(cp, promptKey, { fallbackPrompt: lore.runtimeBasePrompt || undefined, fallbackGender: cp.lorebookPromptGenders[member.key] });
      const defaultForm = forms.forms.find((f) => f.id === forms.defaultFormId) ?? forms.forms[0];
      const row: Omit<RosterItem, "thumbnailUrl"> = {
        promptKey,
        kind: custom ? "custom" : lore.kind === "character-description" ? "description" : "lore",
        memberKey: member.key,
        selectionId: custom ? custom.id : lore.selectionId,
        title: lore.title,
        ...(lore.worldBookId ? { worldBookId: lore.worldBookId } : {}),
        ...(lore.worldBookId && lore.sourceName ? { worldBookName: lore.sourceName } : {}),
        ...(lore.entryId ? { entryId: lore.entryId } : {}),
        keys: [...lore.keys],
        primaryKeys: [...lore.primaryKeys],
        secondaryKeys: [...lore.secondaryKeys],
        recognitionKeys: custom ? [...custom.recognitionKeys] : effectiveRecognitionKeys([...lore.primaryKeys, ...lore.secondaryKeys], cp.customLorebookKeys[promptKey]),
        content: lore.content,
        score: lore.score,
        registered: state.registered,
        workspaceEnabled: state.workspaceEnabled,
        ...(custom?.origin === "ai-auto" ? { origin: "ai-auto" as const } : {}),
        mainPrompt: defaultForm ? compileMainPrompt(defaultForm.basePromptGroups, defaultForm.gender) : "",
        analyzeEnabled: cp.assetMetadata[promptKey]?.analyzeEnabled !== false,
        selectedAssetCount: (cp.assetSelections[promptKey]?.selectedAssets ?? []).length,
      };
      rows.push({ ...row, thumbnailUrl: options.thumbnail ? options.thumbnail(promptKey, row) : null });
    }
  }
  return rows;
}

/** Per-record summary of the AM metadata cache (`assetMetadataAvailability`) for the UI badge. */
export function summarizeMetadataAvailability(raw: Record<string, unknown>): Record<string, MetadataAvailability> {
  const out: Record<string, MetadataAvailability> = {};
  for (const [key, value] of Object.entries(raw)) {
    const record = value as Any;
    const assets: Any[] = Array.isArray(record?.assets) ? record.assets : record && typeof record === "object" ? Object.values(record).map((v) => ({ hasMetadata: v === true })) : [];
    const available = assets.filter((a) => a?.hasMetadata === true).length;
    out[key] = !assets.length || available === 0 ? "none" : available === assets.length ? "available" : "partial";
  }
  return out;
}

/** Per-asset metadata check results by asset name (a positive result wins when an asset appears in several records). */
export function summarizeAssetMetadata(raw: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const value of Object.values(raw)) {
    const assets: Any[] = Array.isArray((value as Any)?.assets) ? (value as Any).assets : [];
    for (const a of assets) {
      const name = typeof a?.name === "string" ? a.name : "";
      if (name) out[name] = out[name] === true || a.hasMetadata === true;
    }
  }
  return out;
}

export async function loadWorkspaceSnapshot(services: BackendServices, characterId: string, options: { reload?: boolean; chatId?: string } = {}): Promise<WorkspaceSnapshot> {
  if (options.reload) services.sources.invalidate(characterId);
  const [character, parts, images] = await Promise.all([
    services.sources.getCharacter(characterId),
    loadAmConfigParts(services, characterId),
    services.sources.listCharacterImages(characterId).catch(() => [] as CharacterImageAsset[]),
  ]);
  const document = parts.document;
  const rawSource = await services.sources.buildSource(characterId, document, options.chatId ? { chatId: options.chatId } : {});
  const source = (amFn("rI")(rawSource, document.customCharacters, "all") ?? rawSource) as AmSource;
  const sources = await services.sources.rosterSources(characterId, document, options.chatId ? { chatId: options.chatId } : {});
  const store = new AmConfigStore(services, characterId, parts, "workspace");
  const assets = createAmPriorityAssets(store, (id) => (id === source.id ? source : null));
  const urlOf = imageUrlIndex(images);
  const roster = projectRoster(source, document, {
    thumbnail: (promptKey, row) => {
      if (row.kind === "custom") {
        // Custom characters: the default form's default outfit reference, else the form reference.
        const forms = resolveCharacterForms(document.characterPrompt, promptKey);
        const form = forms.forms.find((f) => f.id === forms.defaultFormId) ?? forms.forms[0];
        const outfit = form?.outfits.find((o) => o.id === form.defaultOutfitId) ?? form?.outfits[0];
        return urlOf((outfit?.referenceAsset ?? form?.reference?.defaultAsset ?? null) as Any);
      }
      try {
        return urlOf(assets.getLorebookThumbnailAsset(source.id, promptKey));
      } catch {
        return null;
      }
    },
  });
  return {
    characterId,
    characterName: character.name,
    document,
    roster,
    sources,
    charxSettings: resolveEffectiveConfig(parts.global, { characterId, document }),
    metadataAvailability: summarizeMetadataAvailability(parts.metadata),
    assetMetadata: summarizeAssetMetadata(parts.metadata),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Roster writes
 * ---------------------------------------------------------------------------------------------- */

type RosterRef = { memberKey: string; selectionId: string };

function customIdOf(item: RosterRef): string | null {
  if (item.memberKey.startsWith(VIRTUAL_MEMBER_PREFIX)) return item.memberKey.slice(VIRTUAL_MEMBER_PREFIX.length) || item.selectionId;
  return null;
}

const setList = (list: readonly string[] | undefined, id: string, present: boolean): string[] => {
  const next = (list ?? []).filter((x) => x !== id);
  return present ? [...next, id] : next;
};

/** AM writer L103459: register/unregister lorebook actors (unregister also clears the inactive mark). */
export async function setRosterRegistered(services: BackendServices, characterId: string, items: RosterRef[], registered: boolean): Promise<void> {
  const customIds = items.map(customIdOf).filter((x): x is string => !!x);
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => {
      const cp = { ...doc.characterPrompt, selectedLorebooks: { ...doc.characterPrompt.selectedLorebooks }, workspaceDisabledLorebooks: { ...doc.characterPrompt.workspaceDisabledLorebooks } };
      for (const item of items) {
        if (customIdOf(item)) continue;
        cp.selectedLorebooks[item.memberKey] = setList(cp.selectedLorebooks[item.memberKey], item.selectionId, registered);
        if (!registered) cp.workspaceDisabledLorebooks[item.memberKey] = setList(cp.workspaceDisabledLorebooks[item.memberKey], item.selectionId, false);
      }
      const customCharacters = customIds.length ? setCustomRegistered(doc.customCharacters, customIds, registered) : doc.customCharacters;
      return { ...doc, characterPrompt: cp, customCharacters };
    },
    { reason: "roster" },
  );
}

/** AM roster active toggle L103821: inactive = registered but listed in `workspaceDisabledLorebooks`. */
export async function setRosterActive(services: BackendServices, characterId: string, items: RosterRef[], active: boolean): Promise<void> {
  const customIds = items.map(customIdOf).filter((x): x is string => !!x);
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => {
      const cp = { ...doc.characterPrompt, workspaceDisabledLorebooks: { ...doc.characterPrompt.workspaceDisabledLorebooks } };
      for (const item of items) {
        if (customIdOf(item)) continue;
        const registered = (cp.selectedLorebooks[item.memberKey] ?? []).includes(item.selectionId);
        if (!active && !registered) continue;
        cp.workspaceDisabledLorebooks[item.memberKey] = setList(cp.workspaceDisabledLorebooks[item.memberKey], item.selectionId, !active);
      }
      const customCharacters = customIds.length ? setCustomWorkspaceEnabled(doc.customCharacters, customIds, active, false) : doc.customCharacters;
      return { ...doc, characterPrompt: cp, customCharacters };
    },
    { reason: "roster" },
  );
}

/** AM module connect (`Crt` L86294: no entry = the attached books are active). */
export async function setSourceConnected(services: BackendServices, characterId: string, worldBookId: string, connected: boolean): Promise<void> {
  const document = await services.storage.loadCharacterDocument(characterId);
  const sources = await services.sources.rosterSources(characterId, document);
  const attached = sources.filter((s) => s.attached).map((s) => s.worldBookId);
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => {
      const modules = { ...doc.characterPrompt.activeModules };
      const base = Object.hasOwn(modules, characterId) ? (modules[characterId] ?? []) : attached;
      modules[characterId] = setList(base, worldBookId, connected);
      return { ...doc, characterPrompt: { ...doc.characterPrompt, activeModules: modules } };
    },
    { reason: "roster-source" },
  );
  services.sources.invalidate(characterId);
}

/** AM `Ife` L88575 (replace form + reset the prompt's asset-classification profile); custom characters edit their keys. */
export async function setRecognitionKeys(services: BackendServices, characterId: string, promptKey: string, keys: string[]): Promise<void> {
  const document = await services.storage.loadCharacterDocument(characterId);
  const custom = document.customCharacters.find((c) => c.id === promptKey);
  if (custom) {
    await updateCustomCharacterEntry(services, characterId, custom.id, { title: custom.title, recognitionKeys: keys, appearanceDescription: custom.appearanceDescription });
    return;
  }
  await mutateAmConfig(services, characterId, (config) => amFn("Ife")(config, { id: characterId }, promptKey, keys), { reason: "recognition-keys" });
}

/* ------------------------------------------------------------------------------------------------
 * Custom characters (AM `A5e` store)
 * ---------------------------------------------------------------------------------------------- */

function stripFlags(c: CustomCharacter): CustomCharacter {
  return { id: c.id, title: c.title, recognitionKeys: [...c.recognitionKeys], appearanceDescription: c.appearanceDescription, ...(c.origin === "ai-auto" ? { origin: "ai-auto" as const } : {}) };
}

/** AM `setRosterRegistered` L37763 / `setAllRosterRegistered` L37787 (both drop the workspace flag). */
function setCustomRegistered(list: CustomCharacter[], ids: string[] | "all", registered: boolean): CustomCharacter[] {
  const wanted = ids === "all" ? null : new Set(ids);
  if (wanted) for (const id of wanted) if (!list.some((c) => c.id === id)) amFail("not-found", "The custom character to select was not found.", "선택할 커스텀 캐릭터를 찾을 수 없습니다.");
  return list.map((c) => (wanted && !wanted.has(c.id) ? c : { ...stripFlags(c), ...(registered ? {} : { rosterRegistered: false as const }) }));
}

/** AM `setWorkspaceEnabled` L37818 (strict) / `setAllWorkspaceEnabled` L37835 (skips unregistered). */
function setCustomWorkspaceEnabled(list: CustomCharacter[], ids: string[] | "all", enabled: boolean, strict: boolean): CustomCharacter[] {
  const wanted = ids === "all" ? null : new Set(ids);
  if (wanted) {
    for (const id of wanted) {
      const c = list.find((x) => x.id === id);
      if (!c) amFail("not-found", "The custom character to select was not found.", "선택할 커스텀 캐릭터를 찾을 수 없습니다.");
      if (strict && c.rosterRegistered === false) amFail("bad-request", "This custom character is not registered in the roster.", "로스터에 등록되지 않은 커스텀 캐릭터입니다.");
    }
  }
  return list.map((c) =>
    (wanted && !wanted.has(c.id)) || c.rosterRegistered === false ? c : { ...stripFlags(c), ...(enabled ? {} : { workspaceEnabled: false as const }) },
  );
}

function assertCustomInput(input: CustomCharacterInput): void {
  const [error] = validateCustomCharacterInput(input);
  if (error) fail("bad-request", error.message, { messageKo: error.messageKo, details: { field: error.field } });
}

/** AM `create` (`MJ` L31810). `expectedUpdatedAt` = optional document revision guard. */
export async function createCustomCharacterEntry(services: BackendServices, characterId: string, input: CustomCharacterInput, expectedUpdatedAt?: string): Promise<CustomCharacter> {
  assertCustomInput(input);
  let created: CustomCharacter | null = null;
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => {
      const taken = new Set(doc.customCharacters.map((c) => c.id));
      const entry = createCustomCharacter(input, taken);
      if (taken.has(entry.id)) amFail("conflict", "A custom character with this ID already exists.", "추가할 커스텀 캐릭터 ID가 이미 존재합니다.");
      created = entry;
      return { ...doc, customCharacters: [...doc.customCharacters, entry] };
    },
    { reason: "custom-character", ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) },
  );
  return created!;
}

/** AM `update` (`xTe` L31820). */
export async function updateCustomCharacterEntry(services: BackendServices, characterId: string, customId: string, input: CustomCharacterInput, expectedUpdatedAt?: string): Promise<CustomCharacter> {
  assertCustomInput(input);
  let updated: CustomCharacter | null = null;
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => {
      const index = doc.customCharacters.findIndex((c) => c.id === customId);
      if (index < 0) amFail("not-found", "The custom character to edit was not found.", "수정할 커스텀 캐릭터를 찾을 수 없습니다.");
      const list = [...doc.customCharacters];
      updated = updateCustomCharacter(list[index]!, input);
      list[index] = updated;
      return { ...doc, customCharacters: list };
    },
    { reason: "custom-character", ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) },
  );
  return updated!;
}

/** AM `remove` + `JJ` L33099: drop the entry and every per-key trace (forms, seeds, selections, matching profile). */
export async function removeCustomCharacterEntry(services: BackendServices, characterId: string, customId: string, expectedUpdatedAt?: string): Promise<void> {
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => {
      if (!doc.customCharacters.some((c) => c.id === customId)) amFail("not-found", "The custom character to delete was not found.", "삭제할 커스텀 캐릭터를 찾을 수 없습니다.");
      const cp = removePromptKeyData(doc.characterPrompt, customId);
      const filters = { ...cp.lorebookImageFilters };
      const own = filters[characterId];
      if (own) {
        const signatures = { ...(own.promptSignatures ?? {}) };
        delete signatures[customId];
        filters[characterId] = { ...own, promptSignatures: signatures, emptyPromptKeys: (own.emptyPromptKeys ?? []).filter((k) => k !== customId), profiles: (own.profiles ?? []).filter((p) => p.promptKey !== customId) };
      }
      return { ...doc, characterPrompt: { ...cp, lorebookImageFilters: filters }, customCharacters: doc.customCharacters.filter((c) => c.id !== customId) };
    },
    { reason: "custom-character", ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) },
  );
}

export async function setCustomCharactersRegistered(services: BackendServices, characterId: string, ids: string[] | "all", registered: boolean): Promise<void> {
  if (Array.isArray(ids) && !ids.length) return;
  await services.storage.updateCharacterDocument(characterId, (doc) => ({ ...doc, customCharacters: setCustomRegistered(doc.customCharacters, ids, registered) }), { reason: "custom-character" });
}

export async function setCustomCharactersWorkspaceEnabled(services: BackendServices, characterId: string, ids: string[] | "all", enabled: boolean): Promise<void> {
  if (Array.isArray(ids) && !ids.length) return;
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => ({ ...doc, customCharacters: setCustomWorkspaceEnabled(doc.customCharacters, ids, enabled, Array.isArray(ids) && ids.length === 1) }),
    { reason: "custom-character" },
  );
}

/** AM `promoteGenerated` L37858 / `promoteAllGenerated` L37869. */
export async function promoteCustomCharacters(services: BackendServices, characterId: string, ids: string[] | "all"): Promise<void> {
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => {
      const wanted = ids === "all" ? null : new Set(ids);
      if (wanted) for (const id of wanted) if (!doc.customCharacters.some((c) => c.id === id)) amFail("not-found", "The custom character to promote was not found.", "승격할 커스텀 캐릭터를 찾을 수 없습니다.");
      return { ...doc, customCharacters: doc.customCharacters.map((c) => (!wanted || wanted.has(c.id) ? promoteCustomCharacter(c) : c)) };
    },
    { reason: "custom-character" },
  );
}

/* ------------------------------------------------------------------------------------------------
 * Prompts tab
 * ---------------------------------------------------------------------------------------------- */

/** Current form collection of a prompt key (forms map, else the legacy per-key maps, AM `vn` L93684). */
export function currentForms(document: CharacterDocument, promptKey: string): FormCollection {
  return resolveCharacterForms(document.characterPrompt, promptKey);
}

/**
 * Save a whole collection edited with the pure form ops. Guard = AM optimistic check `GY` L25348 (`ds` revision of the base).
 * The legacy per-key maps are dropped like AM's commit (`awt` L135268).
 */
export async function saveForms(services: BackendServices, characterId: string, promptKey: string, collection: FormCollection, baseRevision: string): Promise<{ collection: FormCollection; revision: string }> {
  let saved: FormCollection | null = null;
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => {
      const current = currentForms(doc, promptKey);
      if (formCollectionRevision(current) !== baseRevision) {
        fail("conflict", "The appearance forms were changed elsewhere. Reload and apply your edit again.", { detailCode: "FORM_COLLECTION_CHANGED", details: { promptKey, revision: formCollectionRevision(current) } });
      }
      saved = normalizeFormCollection(collection, { fallbackGender: current.forms[0]?.gender });
      const cp = { ...doc.characterPrompt, characterForms: { ...doc.characterPrompt.characterForms, [promptKey]: saved } } as Any;
      for (const map of LEGACY_PROMPT_MAPS) {
        if (cp[map] && Object.hasOwn(cp[map], promptKey)) {
          cp[map] = { ...cp[map] };
          delete cp[map][promptKey];
        }
      }
      return { ...doc, characterPrompt: cp };
    },
    { reason: "prompts" },
  );
  return { collection: saved!, revision: formCollectionRevision(saved!) };
}

function withForms(doc: CharacterDocument, promptKey: string, edit: (c: FormCollection) => FormCollection): CharacterDocument {
  const next = edit(currentForms(doc, promptKey));
  const cp = { ...doc.characterPrompt, characterForms: { ...doc.characterPrompt.characterForms, [promptKey]: normalizeFormCollection(next) } } as Any;
  for (const map of LEGACY_PROMPT_MAPS) {
    if (cp[map] && Object.hasOwn(cp[map], promptKey)) {
      cp[map] = { ...cp[map] };
      delete cp[map][promptKey];
    }
  }
  return { ...doc, characterPrompt: cp };
}

/** Prompts tab "use reference" toggle (form.reference.enabled; all forms when no formId). */
export async function setReferenceEnabled(services: BackendServices, characterId: string, promptKeys: string[], enabled: boolean, formId?: string): Promise<void> {
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) =>
      promptKeys.reduce(
        (d, pk) =>
          withForms(d, pk, (c) => ({
            ...c,
            forms: c.forms.map((f) => (formId && f.id !== formId ? f : { ...f, reference: { ...(f.reference ?? {}), enabled } })),
          })),
        doc,
      ),
    { reason: "prompts" },
  );
}

/** Row "analyze" check (`assetMetadata[pk].analyzeEnabled`, AM topic `asset-analysis:enabled:<pk>`). */
export async function setAnalyzeEnabled(services: BackendServices, characterId: string, promptKeys: string[], enabled: boolean): Promise<void> {
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => {
      const assetMetadata = { ...doc.characterPrompt.assetMetadata };
      for (const pk of promptKeys) assetMetadata[pk] = { ...(assetMetadata[pk] ?? {}), analyzeEnabled: enabled };
      return { ...doc, characterPrompt: { ...doc.characterPrompt, assetMetadata } };
    },
    { reason: "asset-analysis" },
  );
}

export async function setSeed(services: BackendServices, characterId: string, promptKey: string, seed: string, fixed: boolean): Promise<void> {
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => ({ ...doc, characterPrompt: { ...doc.characterPrompt, seedSettings: { ...doc.characterPrompt.seedSettings, [promptKey]: { seed: String(seed ?? "").trim(), fixed: fixed === true } } } }),
    { reason: "prompts" },
  );
}

export async function setFramingWeights(services: BackendServices, characterId: string, weights: Record<string, Record<string, number>>): Promise<void> {
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) => ({ ...doc, characterPrompt: { ...doc.characterPrompt, outfitPartFramingWeights: weights as CharacterDocument["characterPrompt"]["outfitPartFramingWeights"] } }),
    { reason: "prompts" },
  );
}

/** Unique tag search apply (AM `Oct` L104459): `identity.character_tag` = [tag] on the chosen form. */
export async function applyUniqueTags(services: BackendServices, characterId: string, choices: { promptKey: string; formId: string; tag: string }[]): Promise<void> {
  await services.storage.updateCharacterDocument(
    characterId,
    (doc) =>
      choices.reduce(
        (d, choice) =>
          withForms(d, choice.promptKey, (c) => ({
            ...c,
            forms: c.forms.map((f) =>
              f.id !== choice.formId ? f : { ...f, basePromptGroups: { ...f.basePromptGroups, "identity.character_tag": choice.tag.trim() ? [choice.tag.trim().replace(/_/gu, " ")] : [] } },
            ),
          })),
        doc,
      ),
    { reason: "unique-tags" },
  );
}

export { metadataCachePath };
