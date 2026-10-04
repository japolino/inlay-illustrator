/**
 * SourcesService: Lumiverse characters / world books / personas / chats -> Asset Maid's Source / Member / LoreRecord
 * (spec/data.md §1.1; AM `hB` 86673 -> `Frt` 86510 -> `Krt` 86538 -> `Xue` 86360; lore `Bue` 86140, score `wrt` 86125).
 *
 * Lumiverse mapping (docs/CONTRACT.md §2, PORT-PLAN):
 * - Source = one Lumiverse character (group chats: one source per member character). Member key = the character id.
 * - AM character lorebook (`globalLore`) = the world books attached to the character (`world_book_ids`), sorted together.
 * - AM modules = extra world books connected to the character (`document.characterPrompt.activeModules[characterId]`);
 *   their records have `sourceType:"module"` and `sourceName` = book name. Port deviation: the title is NOT suffixed with
 *   AM's " · 모듈: <name>" (the roster row shows the book name separately).
 * - Lore record id = selection id = `<worldBookId>:<entryId>` (`loreSelectionId`). Disabled, empty and AM-owned entries are skipped.
 * - The character description becomes the pseudo lore `asset-maid:charx-description:v1` (AM `xrt` 86177).
 * - Character images: gallery (REST via the fetch bridge) + `extensions.expressions.mappings` + `extensions.risu_asset_map` +
 *   avatar (+ generated images owned by the character). AssetRef `key` = Lumiverse image id.
 */
import {
  assetIdentity,
  assetKindOfName,
  CHARACTER_DESCRIPTION_LORE_ID,
  CROP_ASSET_NAME_PREFIX,
  loreSelectionId,
  normalizeAssetRef,
  type AssetKind,
  type AssetRef,
  type CharacterDocument,
  type CharacterSummary,
  type RosterSource,
} from "../../shared/contract/index.js";
import { fail, RpcFailure } from "../rpc/errors.js";
import type {
  AmLoreRecord,
  AmMember,
  AmSource,
  CharacterImageAsset,
  CharacterImageOrigin,
  CharacterInfo,
  ChatInfo,
  ImageBytesService,
  PersonaInfo,
  RunLog,
  SourcesService,
  SpindleHost,
  StorageService,
  WorldBookEntryInfo,
  WorldBookInfo,
} from "./types.js";
import { asArray, asRecord, errorMessage, str, TtlCache } from "./util.js";

export const SOURCES_CACHE_TTL_MS = 30_000;
const PAGE = 200;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "avif"]);
const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

/* ------------------------------------------------------------------------------------------------
 * Pure Asset Maid helpers (exported for tests)
 * ---------------------------------------------------------------------------------------------- */

/** AM `zue` 85952 / `frt` 85965. */
const CHARACTER_WORDS = ["character", "profile", "identity", "persona", "appearance", "personality", "speech", "body", "face", "hair", "eyes"];
const WORLD_WORDS = ["world", "setting", "location", "school", "system", "rule", "rules", "scenario", "background", "plot"];

/** AM `fB` 86052. */
function lowerSpace(value: unknown): string {
  return str(value).toLocaleLowerCase().replace(/\s+/g, " ").trim();
}
/** AM `ff`. */
function uniqueTrimmed(values: unknown[]): string[] {
  return [...new Set(values.map(str).filter(Boolean))];
}

/** AM `uB` 86048: name, but UUID-looking names are replaced by the fallback. */
export function displayName(name: unknown, fallback: string): string {
  const n = str(name) || fallback;
  return UUID_RE.test(n) ? fallback : n;
}

/** AM `hrt` 86055: member aliases (name, nickname, id, tags + split parts; len >= 2; lower case). */
export function memberAliases(values: { name?: unknown; nickname?: unknown; id?: unknown; tags?: unknown }): string[] {
  const out = new Set<string>();
  for (const raw of [values.name, values.nickname, values.id, ...asArray(values.tags)]) {
    const v = lowerSpace(raw);
    if (!v) continue;
    out.add(v);
    v.split(/[\\/|,;:()[\]{}<>]+/g)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2)
      .forEach((p) => out.add(p));
  }
  return [...out].filter((a) => a.length >= 2);
}

/** AM `grt` 86073. */
export function sourceSummary(c: { description?: string; personality?: string; scenario?: string; creatorNotes?: string }): string {
  const d = str(c.description);
  return [
    d ? `Description:\n${d.slice(0, 1200)}` : "",
    c.personality ? `Personality:\n${str(c.personality).slice(0, 800)}` : "",
    c.scenario ? `Scenario:\n${str(c.scenario).slice(0, 800)}` : "",
    c.creatorNotes ? `Notes:\n${str(c.creatorNotes).slice(0, 800)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** AM `Fue` 86096: split on [,;\n|]. */
export function splitLoreKeys(values: unknown): string[] {
  const list = Array.isArray(values) ? values : [values];
  return uniqueTrimmed(list.flatMap((v) => str(v).split(/[,;\n|]+/g)));
}

/** AM `wrt` 86125 (folder mode does not exist in Lumiverse). */
export function loreScore(entry: { comment: string; keys: string[]; secondaryKeys: string[]; content: string }, aliases: string[]): number {
  const title = lowerSpace([entry.comment, entry.keys.join(","), entry.secondaryKeys.join(",")].filter(Boolean).join(" "));
  const content = lowerSpace(entry.content);
  const both = `${title} ${content}`;
  let score = 0;
  for (const alias of aliases) {
    if (title.includes(alias)) score += 5;
    else if (content.includes(alias)) score += 3;
  }
  if (CHARACTER_WORDS.some((w) => title.includes(w))) score += 2;
  if (CHARACTER_WORDS.some((w) => content.includes(w))) score += 1;
  if (WORLD_WORDS.some((w) => title.includes(w)) && !aliases.some((a) => both.includes(a))) score -= 3;
  if (!str(entry.content)) score -= 2;
  return score;
}

/** AM `Nx`/`UD` + comment check (Bue 86143-86145): entries owned by Asset Maid. */
function isAssetMaidOwned(entry: WorldBookEntryInfo): boolean {
  const comment = str(entry.comment);
  return comment === "__ASSET_MAID_DATA__" || comment === "__ASSET_MAID_BACKUP__" || entry.entryId === "asset-maid:data" || entry.entryId.startsWith("asset-maid:quarantine:");
}

/** AM `Bue` 86140 over Lumiverse entries (sorted by score desc, then title). */
export function loreRecordsOf(entries: WorldBookEntryInfo[], aliases: string[], source: { sourceType: "character" | "module"; sourceName?: string }): AmLoreRecord[] {
  return entries
    .flatMap((entry, index): AmLoreRecord[] => {
      if (entry.disabled || isAssetMaidOwned(entry)) return [];
      const content = str(entry.content);
      if (!content) return [];
      const primaryKeys = splitLoreKeys(entry.keys);
      const secondaryKeys = splitLoreKeys(entry.secondaryKeys);
      const id = loreSelectionId(entry.worldBookId, entry.entryId);
      return [
        {
          kind: "lorebook",
          id,
          selectionId: id,
          title: str(entry.comment) || primaryKeys.join(", ") || `Lore ${index + 1}`,
          keys: uniqueTrimmed([...primaryKeys, ...secondaryKeys]),
          primaryKeys,
          secondaryKeys,
          selective: entry.selective === true && secondaryKeys.length > 0,
          useRegex: entry.useRegex === true,
          content,
          score: loreScore({ comment: entry.comment, keys: primaryKeys, secondaryKeys, content }, aliases),
          alwaysActive: entry.constant === true,
          sourceType: source.sourceType,
          sourceName: source.sourceName ?? "",
          worldBookId: entry.worldBookId,
          entryId: entry.entryId,
        },
      ];
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

/** AM `xrt` 86177. */
export function descriptionLore(name: string, description: string): AmLoreRecord | null {
  const content = str(description);
  if (!content) return null;
  const keys = uniqueTrimmed([name]);
  return { kind: "character-description", id: CHARACTER_DESCRIPTION_LORE_ID, selectionId: CHARACTER_DESCRIPTION_LORE_ID, title: name, keys, primaryKeys: keys, secondaryKeys: [], selective: false, useRegex: false, content, score: 0, alwaysActive: false, sourceType: "character", sourceName: "" };
}

/** AM `hd`: dedupe by identity across lists. */
function dedupe(...lists: AssetRef[][]): AssetRef[] {
  const seen = new Set<string>();
  return lists.flat().filter((a) => {
    const id = assetIdentity(a);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** AM `mrt` 86007: FNV-1a signature of a source's assets and lore. */
export function assetGenerationSignature(sourceId: string, activeModuleIds: string[], shared: AssetRef[], members: AmMember[], chatAssets: AssetRef[]): string {
  let h = 2166136261;
  const feed = (value: unknown) => {
    const s = str(value);
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  let sh = 2166136261;
  for (const a of shared) {
    for (const s of [assetIdentity(a), a.name]) for (let i = 0; i < s.length; i += 1) {
      sh ^= s.charCodeAt(i);
      sh = Math.imul(sh, 16777619);
    }
  }
  feed(sourceId);
  activeModuleIds.forEach(feed);
  feed((sh >>> 0).toString(36));
  for (const m of members) {
    feed(m.key);
    for (const a of dedupe(m.originalAssets, m.outfitGeneratedAssets, m.chatGeneratedAssets)) {
      feed(assetIdentity(a));
      feed(a.name);
    }
    for (const l of m.lorebooks) {
      feed(l.kind);
      feed(l.id);
      feed(l.title);
      feed(l.content);
      l.keys.forEach(feed);
    }
  }
  for (const a of chatAssets) {
    feed(assetIdentity(a));
    feed(a.name);
  }
  return `${sourceId}:${(h >>> 0).toString(36)}`;
}

function extensionOf(name: string, mime?: string): string {
  const fromName = name.includes(".") ? name.split(".").at(-1)!.toLowerCase() : "";
  if (IMAGE_EXTENSIONS.has(fromName)) return fromName;
  const m = str(mime).toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("avif")) return "avif";
  return "png";
}

export function imageUrl(imageId: string, size?: "sm" | "lg"): string {
  return `/api/v1/images/${encodeURIComponent(imageId)}${size ? `?size=${size}` : ""}`;
}

/* ------------------------------------------------------------------------------------------------
 * Service
 * ---------------------------------------------------------------------------------------------- */

export interface SourcesServiceDeps {
  host: SpindleHost;
  userId: string | undefined;
  imageBytes?: Pick<ImageBytesService, "getJson">;
  storage?: Pick<StorageService, "hasCharacterDocument">;
  log?: RunLog;
  now?: () => number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export function createSourcesService(deps: SourcesServiceDeps): SourcesService {
  const { host, userId } = deps;
  const cache = new TtlCache<unknown>(SOURCES_CACHE_TTL_MS, 512, deps.now ?? Date.now);
  const log = (level: "debug" | "info" | "warn" | "error", message: string, details?: unknown) => deps.log?.append(level, "sources", message, details);

  async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit !== undefined) return hit as T;
    return cache.set(key, await load()) as T;
  }

  async function paged<T>(load: (offset: number) => Promise<{ data: T[]; total: number }>): Promise<T[]> {
    const out: T[] = [];
    for (let offset = 0; offset < 100_000; offset += PAGE) {
      const page = await load(offset);
      const data = asArray<T>(page?.data);
      out.push(...data);
      if (data.length < PAGE || out.length >= Number(page?.total ?? 0)) break;
    }
    return out;
  }

  function toCharacterInfo(dto: Record<string, unknown>): CharacterInfo {
    return {
      characterId: str(dto.id),
      name: str(dto.name),
      description: String(dto.description ?? ""),
      personality: String(dto.personality ?? ""),
      scenario: String(dto.scenario ?? ""),
      creatorNotes: String(dto.creator_notes ?? ""),
      tags: asArray(dto.tags).map(str).filter(Boolean),
      avatarImageId: str(dto.image_id) || null,
      worldBookIds: uniqueTrimmed(asArray(dto.world_book_ids)),
      extensions: asRecord(dto.extensions),
    };
  }

  function toChatInfo(dto: Record<string, unknown>): ChatInfo {
    const metadata = asRecord(dto.metadata);
    const group = metadata.group === true || metadata.group === 1;
    return {
      chatId: str(dto.id),
      characterId: str(dto.character_id),
      groupCharacterIds: group ? uniqueTrimmed(asArray(metadata.character_ids)) : [],
      personaId: str(metadata.persona_id) || null,
      metadata,
    };
  }

  function toPersonaInfo(dto: Record<string, unknown>): PersonaInfo {
    return {
      personaId: str(dto.id),
      name: str(dto.name),
      description: String(dto.description ?? ""),
      avatarImageId: str(dto.image_id) || null,
      isDefault: dto.is_default === true,
      attachedWorldBookId: str(dto.attached_world_book_id) || null,
      metadata: asRecord(dto.metadata),
    };
  }

  async function getCharacterDto(characterId: string): Promise<Record<string, unknown>> {
    return cached(`char:${characterId}`, async () => {
      let dto: unknown;
      try {
        dto = await host.characters.get(characterId, userId);
      } catch (error) {
        throw new RpcFailure({ code: "provider-error", message: `Could not read character ${characterId}: ${errorMessage(error)}`, retryable: true });
      }
      if (!dto) fail("not-found", `Character not found: ${characterId}`, { detailCode: "CHARACTER_NOT_FOUND" });
      return asRecord(dto);
    });
  }

  async function chatCountOf(characterId: string): Promise<number> {
    return cached(`chatcount:${characterId}`, async () => {
      try {
        return Number(asRecord(await host.chats.list({ characterId, limit: 1, ...(userId ? { userId } : {}) })).total) || 0;
      } catch {
        return 0;
      }
    });
  }

  async function worldBook(worldBookId: string): Promise<{ name: string; entries: WorldBookEntryInfo[] } | null> {
    return cached(`wb:${worldBookId}`, async () => {
      try {
        const dto = asRecord(await host.world_books.get(worldBookId, userId));
        if (!str(dto.id)) return null;
        const raw = await paged((offset) => host.world_books.entries.list(worldBookId, { limit: PAGE, offset, ...(userId ? { userId } : {}) }) as Promise<{ data: unknown[]; total: number }>);
        const entries = raw.map((e) => {
          const r = asRecord(e);
          return {
            worldBookId,
            entryId: str(r.id),
            comment: String(r.comment ?? ""),
            keys: asArray(r.key).map(str).filter(Boolean),
            secondaryKeys: asArray(r.keysecondary).map(str).filter(Boolean),
            content: String(r.content ?? ""),
            disabled: r.disabled === true,
            constant: r.constant === true,
            selective: r.selective === true,
            useRegex: r.use_regex === true,
            order: Number(r.order_value) || 0,
          } satisfies WorldBookEntryInfo;
        });
        return { name: str(dto.name) || worldBookId, entries: entries.filter((e) => e.entryId) };
      } catch (error) {
        log("warn", `World book ${worldBookId} unavailable.`, errorMessage(error));
        return null;
      }
    });
  }

  async function chatInfo(chatId: string): Promise<ChatInfo> {
    let dto: unknown;
    try {
      dto = await host.chats.get(chatId, userId);
    } catch (error) {
      throw new RpcFailure({ code: "provider-error", message: `Could not read chat ${chatId}: ${errorMessage(error)}`, retryable: true });
    }
    if (!dto) fail("not-found", `Chat not found: ${chatId}`, { detailCode: "CHAT_NOT_FOUND" });
    return toChatInfo(asRecord(dto));
  }

  async function activePersona(): Promise<PersonaInfo | null> {
    try {
      const active = await host.personas.getActive(userId);
      const dto = active ?? (await host.personas.getDefault(userId));
      return dto ? toPersonaInfo(asRecord(dto)) : null;
    } catch {
      return null;
    }
  }

  const service: SourcesService = {
    async listCharacters() {
      const list = await cached("characters", () => paged((offset) => host.characters.list({ limit: PAGE, offset, ...(userId ? { userId } : {}) }) as Promise<{ data: unknown[]; total: number }>));
      const rows = list.map((c) => asRecord(c));
      return mapLimit(rows, 8, async (dto, ): Promise<CharacterSummary> => {
        const characterId = str(dto.id);
        const [chatCount, hasDocument] = await Promise.all([chatCountOf(characterId), deps.storage ? deps.storage.hasCharacterDocument(characterId).catch(() => false) : Promise.resolve(false)]);
        return {
          characterId,
          name: displayName(dto.name, "Character"),
          avatarUrl: str(dto.image_id) ? `/api/v1/characters/${encodeURIComponent(characterId)}/avatar?size=sm` : null,
          hasDocument,
          chatCount,
          worldBookIds: uniqueTrimmed(asArray(dto.world_book_ids)),
        };
      });
    },

    async getCharacter(characterId) {
      return toCharacterInfo(await getCharacterDto(str(characterId)));
    },

    async getActiveChat() {
      try {
        const dto = await host.chats.getActive(userId);
        return dto ? toChatInfo(asRecord(dto)) : null;
      } catch {
        return null;
      }
    },

    getChat: (chatId) => chatInfo(str(chatId)),

    async loadWorldBooks(characterId, document, options = {}) {
      const character = await service.getCharacter(characterId);
      const order: Array<{ id: string; scope: RosterSource["scope"] }> = [];
      const push = (id: string, scope: RosterSource["scope"]) => {
        if (id && !order.some((o) => o.id === id)) order.push({ id, scope });
      };
      character.worldBookIds.forEach((id) => push(id, "character"));
      const persona = await activePersona();
      if (persona?.attachedWorldBookId) push(persona.attachedWorldBookId, "persona");
      let chat: ChatInfo | null = null;
      if (options.chatId) chat = await chatInfo(options.chatId).catch(() => null);
      else {
        const active = await service.getActiveChat();
        if (active && (active.characterId === characterId || active.groupCharacterIds.includes(characterId))) chat = active;
      }
      for (const id of asArray(chat?.metadata.chat_world_book_ids)) push(str(id), "chat");
      try {
        for (const id of asArray(await host.world_books.getGlobal(userId))) push(str(id), "global");
      } catch {
        /* no global books */
      }
      for (const id of document.characterPrompt.activeModules[characterId] ?? []) push(str(id), "extra");
      const books = await mapLimit(order, 6, async ({ id, scope }) => {
        const book = await worldBook(id);
        return book ? ({ worldBookId: id, name: book.name, scope, entries: book.entries } satisfies WorldBookInfo) : null;
      });
      return books.filter((b): b is WorldBookInfo => !!b);
    },

    async rosterSources(characterId, document, options = {}) {
      const books = await service.loadWorldBooks(characterId, document, options);
      const connected = new Set(document.characterPrompt.activeModules[characterId] ?? []);
      const out: RosterSource[] = books.map((b) => ({ worldBookId: b.worldBookId, name: b.name, attached: b.scope === "character", connected: b.scope === "character" || connected.has(b.worldBookId), entryCount: b.entries.length, scope: b.scope }));
      // Every other world book of the user can be connected as an extra source (AM module list).
      try {
        const all = await cached("worldbooks", () => paged((offset) => host.world_books.list({ limit: PAGE, offset, ...(userId ? { userId } : {}) }) as Promise<{ data: unknown[]; total: number }>));
        for (const raw of all) {
          const dto = asRecord(raw);
          const id = str(dto.id);
          if (!id || out.some((s) => s.worldBookId === id)) continue;
          const total = await cached(`wbcount:${id}`, async () => {
            try {
              return Number(asRecord(await host.world_books.entries.list(id, { limit: 1, ...(userId ? { userId } : {}) })).total) || 0;
            } catch {
              return 0;
            }
          });
          out.push({ worldBookId: id, name: str(dto.name) || id, attached: false, connected: connected.has(id), entryCount: total, scope: "extra" });
        }
      } catch (error) {
        log("warn", "World book list unavailable.", errorMessage(error));
      }
      return out;
    },

    async buildSource(characterId, document, options = {}) {
      const character = await service.getCharacter(characterId);
      const name = displayName(character.name, "Character Chat 1");
      const memberName = displayName(character.name, "Member 1");
      const aliases = memberAliases({ name: character.name, id: characterId, tags: character.tags });
      const books = await service.loadWorldBooks(characterId, document, options);
      const activeModuleIds = uniqueTrimmed(document.characterPrompt.activeModules[characterId] ?? []);
      const attached = books.filter((b) => b.scope === "character");
      const modules = books.filter((b) => b.scope !== "character" && activeModuleIds.includes(b.worldBookId));
      const characterLore = loreRecordsOf(attached.flatMap((b) => b.entries), aliases, { sourceType: "character" });
      const moduleLore = modules.flatMap((b) => loreRecordsOf(b.entries, aliases, { sourceType: "module", sourceName: b.name }));
      const desc = descriptionLore(memberName, character.description);
      const seen = new Set<string>();
      const lorebooks = [...characterLore, ...(desc ? [desc] : []), ...moduleLore].filter((l) => !(!l.id || seen.has(l.id)) && (seen.add(l.id), true));

      const images = await service.listCharacterImages(characterId, { includeGenerated: true });
      const target = { chaId: characterId, indexHint: 0 };
      const byKind = (kind: AssetKind) => dedupe(images.filter((i) => i.kind === kind).map((i) => ({ ...i.asset, characterIndex: 0, characterTarget: target })));
      const original = byKind("original");
      // AM Srt 86244: outfit reference assets stored in outfitPrompts count as outfit-generated assets.
      const outfitRefs: AssetRef[] = [];
      for (const [promptKey, outfits] of Object.entries(document.characterPrompt.outfitPrompts ?? {})) {
        if (promptKey !== characterId && !promptKey.startsWith(`${characterId}::lore::`)) continue;
        for (const outfit of asArray(outfits)) {
          const ref = normalizeAssetRef(asRecord(outfit).referenceAsset ?? asRecord(outfit).reference_asset);
          if (ref.name && ref.key && assetKindOfName(ref.name) === "outfit" && IMAGE_EXTENSIONS.has(ref.extension.toLowerCase())) outfitRefs.push({ ...ref, sourceType: "character", moduleId: "", moduleName: "" });
        }
      }
      const outfit = dedupe(byKind("outfit"), outfitRefs);
      const chat = byKind("chat");
      const avatar = images.find((i) => i.origin === "avatar");
      const preview = avatar ? { ...avatar.asset, characterIndex: 0, characterTarget: target } : (original[0] ?? null);
      const member: AmMember = {
        sourceId: characterId,
        id: characterId,
        key: characterId,
        name: memberName,
        aliases,
        sourceSummary: sourceSummary(character),
        lorebooks,
        originalAssets: preview ? dedupe([preview], original) : original,
        outfitGeneratedAssets: outfit,
        chatGeneratedAssets: chat,
        assetCount: 0,
        previewAsset: preview,
        characterIndex: 0,
        characterTarget: target,
      };
      member.assetCount = dedupe(member.originalAssets, member.outfitGeneratedAssets, member.chatGeneratedAssets).length;
      const source: AmSource = {
        id: characterId,
        index: 0,
        characterTarget: target,
        name,
        type: "character",
        chatCount: await chatCountOf(characterId),
        attachedModuleIds: [],
        activeModuleIds,
        sharedModuleAssets: [],
        chatGeneratedAssets: chat,
        previewAsset: preview,
        assetGeneration: "",
        members: [member],
      };
      source.assetGeneration = assetGenerationSignature(characterId, activeModuleIds, [], [member], chat);
      return source;
    },

    async listPersonas() {
      try {
        const list = await cached("personas", () => paged((offset) => host.personas.list({ limit: PAGE, offset, ...(userId ? { userId } : {}) }) as Promise<{ data: unknown[]; total: number }>));
        return list.map((p) => toPersonaInfo(asRecord(p)));
      } catch (error) {
        throw new RpcFailure({ code: "provider-error", message: `Could not list personas: ${errorMessage(error)}`, retryable: true });
      }
    },

    async getActivePersona(chatId) {
      if (chatId) {
        const chat = await chatInfo(chatId).catch(() => null);
        if (chat?.personaId) {
          const dto = await host.personas.get(chat.personaId, userId).catch(() => null);
          if (dto) return toPersonaInfo(asRecord(dto));
        }
      }
      return activePersona();
    },

    async listCharacterImages(characterId, options = {}) {
      const key = `images:${characterId}:${options.includeGenerated === false ? 0 : 1}`;
      return cached(key, async () => {
        const character = await service.getCharacter(characterId);
        const out: CharacterImageAsset[] = [];
        const seen = new Set<string>();
        const add = (origin: CharacterImageOrigin, imageId: string, name: string, extra: { mime?: string; width?: number | null; height?: number | null; generated?: boolean } = {}) => {
          if (!imageId || seen.has(imageId)) return;
          const cleanName = str(name) || imageId;
          if (cleanName.startsWith(CROP_ASSET_NAME_PREFIX)) return;
          seen.add(imageId);
          const asset: AssetRef = {
            name: cleanName,
            key: imageId,
            extension: extensionOf(cleanName, extra.mime),
            sourceType: extra.generated ? "generated" : "character",
            moduleId: "",
            moduleName: "",
            characterTarget: { chaId: characterId },
          };
          let kind = assetKindOfName(cleanName);
          if (extra.generated && kind === "original") kind = "outfit";
          out.push({ asset, kind, origin, imageId, name: cleanName, url: imageUrl(imageId), thumbnailUrl: imageUrl(imageId, "sm"), ...(extra.width ? { width: extra.width } : {}), ...(extra.height ? { height: extra.height } : {}) });
        };

        if (character.avatarImageId) add("avatar", character.avatarImageId, `${character.name || "avatar"}.png`);
        if (deps.imageBytes) {
          try {
            const gallery = asArray(await deps.imageBytes.getJson(`/api/v1/characters/${encodeURIComponent(characterId)}/gallery`, { timeoutMs: 15000 }));
            for (const raw of gallery) {
              const g = asRecord(raw);
              add("gallery", str(g.image_id), str(g.caption) || str(g.reference) || `gallery-${str(g.id)}`, { mime: str(g.mime_type), width: Number(g.width) || null, height: Number(g.height) || null });
            }
          } catch (error) {
            log("warn", `Gallery of ${characterId} unavailable (the overlay must be open to read it).`, errorMessage(error));
          }
        }
        const expressions = asRecord(asRecord(character.extensions.expressions).mappings);
        for (const [label, imageId] of Object.entries(expressions)) add("expression", str(imageId), label);
        const risu = asRecord(character.extensions.risu_asset_map);
        for (const [assetName, imageId] of Object.entries(risu)) add("risu-asset", str(imageId), assetName);
        if (options.includeGenerated !== false) {
          try {
            const generated = await paged((offset) => host.images.list({ characterId, onlyOwned: true, limit: PAGE, offset, ...(userId ? { userId } : {}) }) as Promise<{ data: unknown[]; total: number }>);
            for (const raw of generated) {
              const img = asRecord(raw);
              add("generated", str(img.id), str(img.original_filename) || str(img.id), { mime: str(img.mime_type), width: Number(img.width) || null, height: Number(img.height) || null, generated: true });
              const last = out.at(-1);
              if (last && last.imageId === str(img.id) && last.kind === "outfit" && str(img.owner_chat_id) && assetKindOfName(last.name) === "original") last.kind = "chat";
            }
          } catch (error) {
            log("warn", `Generated images of ${characterId} unavailable.`, errorMessage(error));
          }
        }
        return out;
      });
    },

    invalidate(characterId) {
      if (!characterId) {
        cache.clear();
        return;
      }
      for (const prefix of [`char:${characterId}`, `images:${characterId}:`, `chatcount:${characterId}`]) cache.clear(prefix);
      cache.delete("characters");
      // World books may be shared between characters: drop them all (cheap to reload).
      cache.clear("wb:");
      cache.clear("wbcount:");
      cache.delete("worldbooks");
    },
  };
  return service;
}
