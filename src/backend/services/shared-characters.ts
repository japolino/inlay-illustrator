/**
 * The character library for other extensions (Gambit reads it to draw card characters on-model) over the Spindle shared RPC pool.
 *
 * - Endpoint `inlay_illustrator.characters.<user>.<characterId>`, one per character document. The pool passes no
 *   arguments, so each document gets its own endpoint: registered for every stored document when the user's services
 *   start, and for a new one when it is first saved (`document.changed`).
 * - On-demand handler: every read loads the current document, so edits show up without a resync.
 * - Members are the document's roster people (custom characters, lorebook entries, the card description) with their
 *   compiled appearance tags, forms, outfits, and reference image ids. Persona entries are left out.
 * - Image ids are Lumiverse image ids; references kept in extension storage are not shared (other extensions cannot read them).
 * - Readers need `characters` and `images`; nothing is delegated.
 */
import {
  CHARACTER_DESCRIPTION_LORE_ID,
  OUTFIT_PARTS,
  compileMainPrompt,
  parsePromptKey,
  type CharacterDocument,
  type Form,
  type FormCollection,
  type Outfit,
  type StoredAssetRef,
} from "../../shared/contract/index.js";
import { sharedArtistsChannel } from "./shared-artists.js";
import type { SpindleHost, StorageService, SourcesService, WorldBookInfo } from "./types.js";

export const SHARED_CHARACTERS_CHANNEL = "characters";
export const SHARED_CHARACTERS_VERSION = 1;
const STORAGE_KEY_PREFIX = "storage:";
const CHANNEL_SEGMENT = /^[a-z0-9][a-z0-9_-]*$/u;

export interface SharedOutfit {
  id: string;
  label: string;
  /** Head, top, bottom, legs, feet parts joined (", "). */
  tags: string;
  referenceImageId: string | null;
}
export interface SharedForm {
  id: string;
  label: string;
  gender: string;
  humanlike: boolean;
  /** Compiled appearance prompt (Inlay's main prompt for the form). */
  tags: string;
  negative: string;
  referenceImageId: string | null;
  defaultOutfitId: string;
  outfits: SharedOutfit[];
}
export interface SharedMember {
  /** Inlay prompt key of the member. */
  key: string;
  kind: "custom" | "lore" | "description";
  name: string;
  aliases: string[];
  defaultFormId: string;
  forms: SharedForm[];
}
export interface SharedCharacter {
  version: typeof SHARED_CHARACTERS_VERSION;
  characterId: string;
  updatedAt: string;
  members: SharedMember[];
}

/** Channel suffix for a user's character (`characters.<user>.<characterId>`); null when the id is not a valid segment. */
export function sharedCharacterChannel(userId: string | undefined, characterId: string): string | null {
  const id = characterId.trim().toLowerCase();
  if (!CHANNEL_SEGMENT.test(id)) return null;
  const user = sharedArtistsChannel(userId).slice("artists.".length);
  return `${SHARED_CHARACTERS_CHANNEL}.${user}.${id}`;
}

function imageIdOf(asset: StoredAssetRef | null | undefined): string | null {
  const key = typeof asset?.key === "string" ? asset.key.trim() : "";
  return key && !key.startsWith(STORAGE_KEY_PREFIX) ? key : null;
}

function uniqueText(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function outfitOf(outfit: Outfit): SharedOutfit {
  const tags = uniqueText(OUTFIT_PARTS.map((part) => outfit[part])).join(", ");
  return { id: outfit.id, label: outfit.label, tags, referenceImageId: outfit.referenceEnabled === false ? null : imageIdOf(outfit.referenceAsset) };
}

function formOf(form: Form, fallbackTags: string): SharedForm {
  const reference = form.reference && form.reference.enabled !== false ? imageIdOf(form.reference.defaultAsset) : null;
  return {
    id: form.id,
    label: form.label,
    gender: form.gender,
    humanlike: form.humanlike,
    tags: compileMainPrompt(form.basePromptGroups, form.gender) || fallbackTags,
    negative: form.negativePrompt ?? "",
    referenceImageId: reference,
    defaultOutfitId: form.defaultOutfitId,
    outfits: (form.outfits ?? []).map(outfitOf),
  };
}

export interface MemberNames {
  /** Card name for the description member. */
  characterName: string;
  books: WorldBookInfo[];
}

/** The shared view of one document. Members without a known name are dropped (nothing could match them). */
export function sharedCharacterValue(doc: CharacterDocument, names: MemberNames): SharedCharacter {
  const cp = doc.characterPrompt;
  const customs = new Map((doc.customCharacters ?? []).map((c) => [c.id, c]));
  const entries = new Map<string, WorldBookInfo["entries"][number]>(names.books.flatMap((book) => book.entries.map((e) => [`${e.worldBookId}:${e.entryId}`, e] as [string, typeof e])));
  const members: SharedMember[] = [];
  for (const [key, collection] of Object.entries(cp.characterForms ?? {}) as [string, FormCollection][]) {
    const parsed = parsePromptKey(key);
    let kind: SharedMember["kind"];
    let name = "";
    let aliases: string[] = [];
    if (parsed.kind === "custom") {
      const custom = customs.get(parsed.customId);
      if (!custom || custom.workspaceEnabled === false) continue;
      kind = "custom";
      name = custom.title;
      aliases = uniqueText(custom.recognitionKeys ?? []);
    } else if (parsed.kind === "description" && parsed.selectionId === CHARACTER_DESCRIPTION_LORE_ID) {
      kind = "description";
      name = names.characterName;
    } else if (parsed.kind === "lore") {
      const entry = entries.get(parsed.selectionId);
      if (!entry) continue;
      kind = "lore";
      name = entry.comment || entry.keys[0] || "";
      aliases = uniqueText(entry.keys);
    } else continue;
    name = name.trim();
    if (!name) continue;
    const fallbackTags = typeof cp.lorebookPrompts?.[key] === "string" ? String(cp.lorebookPrompts[key]).trim() : "";
    const forms = (collection?.forms ?? []).map((form) => formOf(form, fallbackTags));
    if (!forms.length) continue;
    members.push({ key, kind, name, aliases: uniqueText(aliases).filter((a) => a.toLowerCase() !== name.toLowerCase()), defaultFormId: collection.defaultFormId, forms });
  }
  return { version: SHARED_CHARACTERS_VERSION, characterId: doc.characterId, updatedAt: doc.updatedAt, members };
}

export interface SharedCharacters {
  /** Make sure the character has an endpoint (no-op when it has one). */
  ensure(characterId: string): void;
  /** Register every stored document. */
  registerStored(): Promise<void>;
  unregisterAll(): void;
}

/** A host without the pool (older Lumiverse, tests) gets a no-op. */
export function shareCharacters(
  host: Pick<SpindleHost, "rpcPool">,
  userId: string | undefined,
  deps: { storage: Pick<StorageService, "list" | "loadCharacterDocument" | "hasCharacterDocument">; sources: Pick<SourcesService, "getCharacter" | "loadWorldBooks"> },
): SharedCharacters {
  const pool = host.rpcPool as SpindleHost["rpcPool"] | undefined;
  const registered = new Set<string>();
  const load = async (characterId: string): Promise<SharedCharacter | null> => {
    if (!(await deps.storage.hasCharacterDocument(characterId))) return null;
    const doc = await deps.storage.loadCharacterDocument(characterId);
    const needsBooks = Object.keys(doc.characterPrompt.characterForms ?? {}).some((key) => parsePromptKey(key).kind === "lore");
    const character = await deps.sources.getCharacter(characterId).catch(() => null);
    const books = needsBooks ? await deps.sources.loadWorldBooks(characterId, doc).catch(() => [] as WorldBookInfo[]) : [];
    return sharedCharacterValue(doc, { characterName: character?.name ?? "", books });
  };
  const ensure = (characterId: string) => {
    if (!pool?.handle) return;
    const channel = sharedCharacterChannel(userId, characterId);
    if (!channel || registered.has(channel)) return;
    try {
      pool.handle(channel, () => load(characterId), { requires: ["characters", "images"] });
      registered.add(channel);
    } catch {
      /* the pool refused it; readers fall back */
    }
  };
  return {
    ensure,
    async registerStored() {
      if (!pool?.handle) return;
      const files = await deps.storage.list("characters/").catch(() => [] as string[]);
      for (const file of files) {
        const id = /^(?:characters\/)?([^/]+)\/asset-maid\.json$/u.exec(file)?.[1];
        if (id) ensure(id);
      }
    },
    unregisterAll() {
      for (const channel of registered) {
        try {
          pool?.unregister(channel);
        } catch {
          /* already gone */
        }
      }
      registered.clear();
    },
  };
}
