/**
 * RPC handlers owned by the `services` module: session/status, settings, chat image settings, ui state, connections and
 * tests, characters list, charx settings (AM `ki`/`xE`/`ONe`/`jNe`/`NNe`, AssetMaid.pretty.js 24584-24900), character reset,
 * logs, artists, personas. See ./index.ts for the method split.
 *
 * Events: `config.changed`, `chatImageGeneration.changed` and `document.changed` are emitted by the storage service; handlers
 * only add `status.changed` where the status itself changes.
 */
import {
  CHARX_SETTING_FIELDS,
  charxScopeFor,
  clearCharxOverrides,
  createDefaultConfig,
  DEFAULT_SELECTED_ARTIST_ID,
  DEFAULT_ARTIST_PRESETS,
  formCollectionRevision,
  listNovelAIArtists,
  NO_ARTIST_ID,
  normalizeAnimaArtists,
  normalizeFormCollection,
  normalizePersonaSettings,
  prefixedId,
  recomputeCharxDirtyFields,
  resetAllCharxOverrides,
  refreshCharxDirtyFields,
  resolveAllCharxSettings,
  resolveEffectiveCharxSettings,
  resolvePersonaForms,
  RPC_PROTOCOL_VERSION,
  setCharxDefaults,
  setCharxOverride,
  type AnalyzerSettings,
  type AnimaArtistEntry,
  type ArtistEntry,
  type BackendStatus,
  type CharacterDocument,
  type CharxScopeConfig,
  type CharxSettingField,
  type InlayConfig,
  type PersonaSummary,
} from "../../../shared/contract/index.js";
import { fail } from "../errors.js";
import type { HandlerGroup, RpcContext } from "../types.js";
import { asRecord, deepMergePatch, jsonClone, str } from "../../services/util.js";

export const EXTENSION_VERSION = "0.10.0";
/** Spindle permissions the backend features need (spindle.json). `app_manipulation` is the overlay mount (frontend). */
export const REQUIRED_PERMISSIONS = ["generation", "image_gen", "chat_mutation", "chats", "characters", "personas", "world_books", "images", "interceptor", "app_manipulation"] as const;

/* ------------------------------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------------------------- */

function requireId(value: unknown, name: string): string {
  const id = str(value);
  if (!id) fail("bad-request", `${name} is required.`);
  return id;
}

function requireConfirm(params: { confirm?: unknown }): void {
  if (params.confirm !== true) fail("bad-request", "This action needs an explicit confirmation (confirm: true).");
}

/** Contract `config.update`: a `null` in the patch resets that field to its default (the normalizer alone would coerce it). */
export function nullsToDefaults(value: unknown, defaults: unknown): unknown {
  if (value === null) return defaults === undefined ? undefined : jsonClone(defaults);
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const d = asRecord(defaults);
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const next = nullsToDefaults(v, d[key]);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

/** Write the global half of a charx scope back into the config. */
function applyScopeToConfig(config: InlayConfig, scope: CharxScopeConfig): InlayConfig {
  return {
    ...config,
    runtime: { ...config.runtime, ...(typeof scope.runtime.nsfwAlwaysEnabled === "boolean" ? { nsfwAlwaysEnabled: scope.runtime.nsfwAlwaysEnabled } : {}) },
    novelai: { ...config.novelai, ...(typeof scope.novelai.negativePrompt === "string" ? { negativePrompt: scope.novelai.negativePrompt } : {}) },
    characterPrompt: {
      ...config.characterPrompt,
      ...(typeof scope.characterPrompt.fixedPositivePrompt === "string" ? { fixedPositivePrompt: scope.characterPrompt.fixedPositivePrompt } : {}),
      charxGenerationDefaults: scope.characterPrompt.charxGenerationDefaults as InlayConfig["characterPrompt"]["charxGenerationDefaults"],
    },
  };
}

/** Write the per-character half (overrides) back into the document. */
function applyScopeToDocument(doc: CharacterDocument, scope: CharxScopeConfig): CharacterDocument {
  return { ...doc, characterPrompt: { ...doc.characterPrompt, charxSettings: { overrides: scope.characterPrompt.charxSettings.overrides as CharacterDocument["characterPrompt"]["charxSettings"]["overrides"] } } };
}

function dirtyFieldsOf(scope: CharxScopeConfig, characterId: string): CharxSettingField[] {
  const dirty = asRecord(asRecord(scope.characterPrompt.charxGenerationDefaults).dirtyFieldsBySourceId)[characterId];
  return (Array.isArray(dirty) ? dirty : []).filter((f): f is CharxSettingField => (CHARX_SETTING_FIELDS as readonly string[]).includes(f));
}

/** Apply a per-character charx operation: overrides go to the document, dirty bookkeeping to the global defaults. */
async function updateCharx(ctx: RpcContext, characterId: string, op: (scope: CharxScopeConfig) => CharxScopeConfig, reason: string) {
  const config = await ctx.storage.loadConfig();
  const doc = await ctx.storage.updateCharacterDocument(characterId, (d) => applyScopeToDocument(d, op(charxScopeFor(config, d))), { reason });
  const next = await ctx.storage.updateConfig((c) => applyScopeToConfig(c, recomputeCharxDirtyFields(charxScopeFor(c, doc), characterId)));
  return charxScopeFor(next, doc);
}

async function backendStatus(ctx: RpcContext): Promise<BackendStatus> {
  const [config, chat] = await Promise.all([ctx.storage.loadConfig(), ctx.sources.getActiveChat()]);
  let missingPermissions: string[] = [];
  try {
    const perms = ctx.host.permissions;
    if (perms && typeof perms.getGranted === "function") {
      const granted = new Set(await perms.getGranted());
      missingPermissions = REQUIRED_PERMISSIONS.filter((p) => !granted.has(p));
    } else if (perms && typeof perms.has === "function") {
      missingPermissions = REQUIRED_PERMISSIONS.filter((p) => !perms.has(p));
    }
  } catch {
    missingPermissions = [];
  }
  return {
    ready: true,
    extensionVersion: EXTENSION_VERSION,
    activeChatId: chat?.chatId ?? null,
    activeCharacterId: chat?.characterId || null,
    activeGroupCharacterIds: chat?.groupCharacterIds ?? [],
    missingPermissions,
    generationProvider: config.runtime.generationProvider,
  };
}

function personaAvatarUrl(imageId: string | null): string | null {
  return imageId ? `/api/v1/images/${encodeURIComponent(imageId)}?size=sm` : null;
}

/* ------------------------------------------------------------------------------------------------
 * Handlers
 * ---------------------------------------------------------------------------------------------- */

export const coreHandlers: HandlerGroup = {
  /* session / status */
  async "session.hello"(params, ctx) {
    if (params.protocol !== RPC_PROTOCOL_VERSION) {
      fail("protocol-mismatch", `The page speaks protocol ${String(params.protocol)}, the backend ${RPC_PROTOCOL_VERSION}. Reload the page.`, { details: { backend: RPC_PROTOCOL_VERSION, frontend: params.protocol } });
    }
    return { protocol: RPC_PROTOCOL_VERSION, status: await backendStatus(ctx) };
  },
  "session.getStatus": (_params, ctx) => backendStatus(ctx),

  /* settings */
  async "config.get"(_params, ctx) {
    const [config, chatImageGeneration, uiState] = await Promise.all([ctx.storage.loadConfig(), ctx.storage.loadChatImageGenerationSettings(), ctx.storage.loadUiState()]);
    return { config, chatImageGeneration, uiState };
  },
  async "config.update"(params, ctx) {
    const patch = asRecord(params.patch);
    // Port addition: an image connection change refreshes `image.provider` (drives the codec / provider kind).
    let providerHint: string | null = null;
    const imagePatch = asRecord(patch.image);
    if (typeof imagePatch.connectionId === "string" && typeof imagePatch.provider !== "string") {
      const id = imagePatch.connectionId;
      const list = await ctx.images.listConnections().catch(() => []);
      const found = id ? list.find((c) => c.id === id) : (list.find((c) => c.isDefault) ?? list[0]);
      if (found) providerHint = found.provider;
    }
    const before = (await ctx.storage.loadConfig()).runtime.generationProvider;
    const config = await ctx.storage.updateConfig((current) => {
      const merged = nullsToDefaults(deepMergePatch(current, patch), createDefaultConfig()) as InlayConfig;
      return providerHint !== null ? { ...merged, image: { ...merged.image, provider: providerHint } } : merged;
    });
    if (config.runtime.generationProvider !== before) ctx.events.emit("status.changed", await backendStatus(ctx));
    return { config };
  },
  async "config.factoryReset"(params, ctx) {
    requireConfirm(params);
    await ctx.storage.factoryReset();
    ctx.sources.invalidate();
    ctx.log.clear();
    return { ok: true };
  },
  "chatImageGeneration.set": (params, ctx) => ctx.storage.saveChatImageGenerationSettings(params.settings),
  async "uiState.set"(params, ctx) {
    await ctx.storage.saveUiState(params.uiState);
    return { ok: true };
  },

  /* connections and tests */
  "connections.listLlm": async (_p, ctx) => ({ connections: await ctx.llm.listConnections() }),
  "connections.listImage": async (_p, ctx) => ({ connections: await ctx.images.listConnections() }),
  "connections.listImageModels": async (params, ctx) => ({ models: await ctx.images.listModels(requireId(params.connectionId, "connectionId")) }),
  "connections.listLlmModels": async (params, ctx) => ({ models: await ctx.llm.listModels(requireId(params.connectionId, "connectionId")) }),
  "analyzer.testMessage": (params, ctx) => ctx.llm.testMessage(params.text, params.analysis ? (asRecord(params.analysis) as Partial<AnalyzerSettings>) : undefined),
  "image.testConnection": (params, ctx) => ctx.images.testConnection(params.connectionId),

  /* characters */
  "workspace.listCharacters": async (_p, ctx) => ({ characters: await ctx.sources.listCharacters() }),

  /* charx settings */
  async "charxSettings.get"(params, ctx) {
    const characterId = requireId(params.characterId, "characterId");
    const [config, doc] = await Promise.all([ctx.storage.loadConfig(), ctx.storage.loadCharacterDocument(characterId)]);
    let scope = charxScopeFor(config, doc);
    // AM RNe: recompute the dirty fields when the page opens; persist only when they changed.
    const refreshed = refreshCharxDirtyFields(scope, characterId);
    if (refreshed !== scope) {
      const next = await ctx.storage.updateConfig((c) => applyScopeToConfig(c, refreshCharxDirtyFields(charxScopeFor(c, doc), characterId)));
      scope = charxScopeFor(next, doc);
    }
    return { effective: resolveEffectiveCharxSettings(scope, characterId), all: resolveAllCharxSettings(scope), dirtyFields: dirtyFieldsOf(scope, characterId) };
  },
  async "charxSettings.setOverride"(params, ctx) {
    const characterId = requireId(params.characterId, "characterId");
    const scope = await updateCharx(ctx, characterId, (s) => setCharxOverride(s, characterId, asRecord(params.patch)), "charx-settings");
    return { effective: resolveEffectiveCharxSettings(scope, characterId), dirtyFields: dirtyFieldsOf(scope, characterId) };
  },
  async "charxSettings.setDefaults"(params, ctx) {
    const config = await ctx.storage.updateConfig((c) => applyScopeToConfig(c, setCharxDefaults(charxScopeFor(c, null), asRecord(params.patch))));
    return { all: resolveAllCharxSettings(charxScopeFor(config, null)) };
  },
  async "charxSettings.resetAll"(_params, ctx) {
    // AM ENe 24861: bump every all-charx revision and clear the dirty lists, so every per-character override loses.
    const config = await ctx.storage.updateConfig((c) => applyScopeToConfig(c, resetAllCharxOverrides(charxScopeFor(c, null))));
    return { all: resolveAllCharxSettings(charxScopeFor(config, null)) };
  },
  async "charxSettings.clearOverrides"(params, ctx) {
    const characterId = requireId(params.characterId, "characterId");
    const scope = await updateCharx(ctx, characterId, (s) => clearCharxOverrides(s, characterId), "charx-settings-reset");
    return { effective: resolveEffectiveCharxSettings(scope, characterId) };
  },
  async "character.reset"(params, ctx) {
    requireConfirm(params);
    const characterId = requireId(params.characterId, "characterId");
    await ctx.storage.resetCharacter(characterId);
    // The overrides are gone with the document: drop this character's dirty bookkeeping too.
    await ctx.storage.updateConfig((c) => applyScopeToConfig(c, recomputeCharxDirtyFields(charxScopeFor(c, null), characterId)));
    ctx.sources.invalidate(characterId);
    return { ok: true };
  },

  /* logs */
  "logs.list": (params, ctx) => ({ entries: ctx.log.list({ sinceSeq: params.sinceSeq, limit: params.limit }) }),
  "logs.clear"(_p, ctx) {
    ctx.log.clear();
    return { ok: true };
  },

  /* artists */
  async "artists.list"(params, ctx) {
    const config = await ctx.storage.loadConfig();
    const characterId = str(params.characterId);
    const doc = characterId ? await ctx.storage.loadCharacterDocument(characterId) : null;
    const anima = normalizeAnimaArtists(config.animaArtists);
    if (characterId && doc?.animaArtistId) anima.selection.bySourceId[characterId] = doc.animaArtistId;
    const novelai = listNovelAIArtists(config.characterPrompt.artistPrompts);
    const selectedNovelAIId = doc?.characterPrompt.selectedArtistId || DEFAULT_SELECTED_ARTIST_ID;
    return {
      novelai,
      anima,
      selectedNovelAIId: novelai.some((a) => a.id === selectedNovelAIId) ? selectedNovelAIId : DEFAULT_SELECTED_ARTIST_ID,
      selectedAnimaId: (doc?.animaArtistId ?? anima.selection.defaultId) || NO_ARTIST_ID,
    };
  },
  async "artists.upsertNovelAI"(params, ctx) {
    const input = asRecord(params.entry) as ArtistEntry;
    let saved!: ArtistEntry;
    await ctx.storage.updateConfig((config) => {
      const list = [...config.characterPrompt.artistPrompts];
      const preset = DEFAULT_ARTIST_PRESETS.find((p) => p.id === str(input.id));
      if (preset?.id === NO_ARTIST_ID) fail("bad-request", "The 'no artist' entry cannot be edited.");
      const taken = new Set(list.map((e) => str(e.id)).concat(DEFAULT_ARTIST_PRESETS.map((p) => p.id)));
      const id = str(input.id) || prefixedId("artist", taken);
      if (preset) {
        // Built-in presets only store their overrides (listNovelAIArtists reads nothing else).
        saved = { id, title: preset.title, prompt: preset.prompt, ...(input.novelAIOverrides ? { novelAIOverrides: input.novelAIOverrides } : {}), ...(input.nonArtistPromptWeight ? { nonArtistPromptWeight: input.nonArtistPromptWeight } : {}) };
      } else {
        const title = str(input.title);
        if (!title) fail("bad-request", "The artist title is required.", { messageKo: "작가 이름을 입력해주세요." });
        saved = { ...input, id, title, prompt: str(input.prompt), ...(input.negativePrompt !== undefined ? { negativePrompt: str(input.negativePrompt) } : {}) };
      }
      const index = list.findIndex((e) => str(e.id) === id);
      if (index >= 0) list[index] = saved;
      else list.push(saved);
      return { ...config, characterPrompt: { ...config.characterPrompt, artistPrompts: list } };
    });
    return { entry: saved };
  },
  async "artists.deleteNovelAI"(params, ctx) {
    const id = requireId(params.id, "id");
    await ctx.storage.updateConfig((config) => ({ ...config, characterPrompt: { ...config.characterPrompt, artistPrompts: config.characterPrompt.artistPrompts.filter((e) => str(e.id) !== id) } }));
    return { ok: true };
  },
  async "artists.upsertAnima"(params, ctx) {
    const input = asRecord(params.entry);
    const text = str(input.text);
    if (!text) fail("bad-request", "The artist prompt text is required.");
    let saved!: AnimaArtistEntry;
    await ctx.storage.updateConfig((config) => {
      const entries = [...config.animaArtists.entries];
      const id = str(input.id) && str(input.id) !== NO_ARTIST_ID ? str(input.id) : prefixedId("anima", new Set(entries.map((e) => e.id)));
      saved = { id, title: str(input.title) || id, text, ...(str(input.portableOrigin) ? { portableOrigin: str(input.portableOrigin) } : {}) };
      const index = entries.findIndex((e) => e.id === id);
      if (index >= 0) entries[index] = saved;
      else entries.push(saved);
      return { ...config, animaArtists: { ...config.animaArtists, entries } };
    });
    return { entry: saved };
  },
  async "artists.deleteAnima"(params, ctx) {
    const id = requireId(params.id, "id");
    // The global default falls back to "none" in normalizeAnimaArtists; per-character selections fall back on read.
    await ctx.storage.updateConfig((config) => ({ ...config, animaArtists: { ...config.animaArtists, entries: config.animaArtists.entries.filter((e) => e.id !== id) } }));
    return { ok: true };
  },
  async "artists.select"(params, ctx) {
    const artistId = str(params.artistId);
    const characterId = str(params.characterId);
    const config = await ctx.storage.loadConfig();
    if (params.list === "novelai") {
      if (!characterId) fail("bad-request", "Select a NovelAI artist for a character (characterId is required).");
      if (!listNovelAIArtists(config.characterPrompt.artistPrompts).some((a) => a.id === artistId)) fail("not-found", `Unknown artist: ${artistId}`);
      await ctx.storage.updateCharacterDocument(characterId, (d) => ({ ...d, characterPrompt: { ...d.characterPrompt, selectedArtistId: artistId } }), { reason: "artists" });
      return { ok: true };
    }
    if (params.list !== "anima") fail("bad-request", `Unknown artist list: ${String(params.list)}`);
    const id = artistId || NO_ARTIST_ID;
    if (id !== NO_ARTIST_ID && !config.animaArtists.entries.some((e) => e.id === id)) fail("not-found", `Unknown artist: ${id}`);
    if (characterId) await ctx.storage.updateCharacterDocument(characterId, (d) => ({ ...d, animaArtistId: id }), { reason: "artists" });
    else await ctx.storage.updateConfig((c) => ({ ...c, animaArtists: { ...c.animaArtists, selection: { ...c.animaArtists.selection, defaultId: id } } }));
    return { ok: true };
  },

  /* personas */
  async "personas.list"(params, ctx) {
    const [config, personas, active, chat] = await Promise.all([ctx.storage.loadConfig(), ctx.sources.listPersonas(), ctx.sources.getActivePersona(), ctx.sources.getActiveChat()]);
    const settings = normalizePersonaSettings(config.characterPrompt.personaSettings);
    const characterId = str(params.characterId);
    const boundId = chat && (!characterId || chat.characterId === characterId || chat.groupCharacterIds.includes(characterId)) ? chat.personaId : null;
    return {
      personas: personas.map(
        (p): PersonaSummary => ({
          personaId: p.personaId,
          name: p.name,
          avatarUrl: personaAvatarUrl(p.avatarImageId),
          description: p.description,
          isActive: active?.personaId === p.personaId,
          isBound: boundId === p.personaId,
          profile: settings.profiles[p.personaId] ?? null,
          forms: resolvePersonaForms(settings, config.characterPrompt.personaGender, p.personaId),
        }),
      ),
    };
  },
  async "personas.saveForms"(params, ctx) {
    const personaId = requireId(params.personaId, "personaId");
    let collection!: ReturnType<typeof normalizeFormCollection>;
    await ctx.storage.updateConfig((config) => {
      const settings = normalizePersonaSettings(config.characterPrompt.personaSettings);
      const current = resolvePersonaForms(settings, config.characterPrompt.personaGender, personaId);
      if (formCollectionRevision(current) !== str(params.baseRevision)) {
        fail("conflict", "The persona appearance was changed elsewhere. Reload it, then apply your edit again.", { detailCode: "FORM_COLLECTION_BASE_CHANGED", details: { expected: params.baseRevision, actual: formCollectionRevision(current) } });
      }
      collection = normalizeFormCollection(params.collection, { fallbackGender: config.characterPrompt.personaGender === "female" ? "female" : "male" });
      const profile = { ...(settings.profiles[personaId] ?? {}), forms: collection };
      return { ...config, characterPrompt: { ...config.characterPrompt, personaSettings: { ...settings, profiles: { ...settings.profiles, [personaId]: profile } } } };
    });
    return { collection, revision: formCollectionRevision(collection) };
  },
  async "personas.setSettings"(params, ctx) {
    await ctx.storage.updateConfig((config) => {
      const cp = { ...config.characterPrompt };
      if (params.personaGender === "male" || params.personaGender === "female") cp.personaGender = params.personaGender;
      if (typeof params.malePersonaPrompt === "string") cp.malePersonaPrompt = params.malePersonaPrompt;
      if (typeof params.malePersonaNegativePrompt === "string") cp.malePersonaNegativePrompt = params.malePersonaNegativePrompt;
      if (typeof params.selectedPersonaKey === "string") cp.personaSettings = { ...normalizePersonaSettings(cp.personaSettings), selectedPersonaKey: params.selectedPersonaKey.trim() };
      return { ...config, characterPrompt: cp };
    });
    return { ok: true };
  },
};
