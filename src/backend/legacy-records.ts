/**
 * Read-only access to illustrations produced by the retired Lightboard
 * pipeline (Inlay Illustrator <= 0.9.x).
 *
 * Old chats keep `states/<chatId>.json` with a `generated` map whose values
 * are full records (V3 `slots`, or pre-V3 parallel arrays) or compact
 * references (`recordPath` + slots / parallel arrays) pointing at
 * `records/<chat>/<key>.json`. This module reads those leniently so the
 * gallery and the lightbox details keep working for existing images. Nothing
 * here writes. The Asset Maid port stores new images in its own chat data.
 */
import { listPaths, readJson } from "./storage.js";
import { asRecord, cleanArray } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

export type LegacyImageSlot = {
  imageId: string;
  imageUrl: string;
  paragraph: number;
  prompt: string;
  negativePrompt: string;
  perspectiveMode: string | null;
  perspectiveSource: string | null;
  creativeConcept: string;
};

export type LegacyImageRecord = {
  key: string;
  chatId: string;
  messageId: string;
  swipeId: number;
  createdAt: string;
  slots: LegacyImageSlot[];
};

type LegacyState = { generated?: Record<string, unknown> };

const STATE_FALLBACK: LegacyState = { generated: {} };

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integer(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function conceptText(value: unknown): string {
  const concept = asRecord(value);
  const anchor = str(concept.anchor);
  const text = str(concept.concept);
  return anchor && text ? `${anchor}: ${text}` : text || anchor;
}

/** Converts one stored record or reference (any legacy version) into lenient slots. */
export function legacySlotsOf(value: unknown): LegacyImageSlot[] {
  const record = asRecord(value);
  if (Array.isArray(record.slots)) {
    return record.slots.map((entry, index) => {
      const slot = asRecord(entry);
      return {
        imageId: str(slot.imageId),
        imageUrl: str(slot.imageUrl),
        paragraph: integer(slot.paragraph, index + 1),
        prompt: str(slot.prompt),
        negativePrompt: str(slot.negativePrompt),
        perspectiveMode: str(slot.perspectiveMode) || null,
        perspectiveSource: str(slot.perspectiveSource) || null,
        creativeConcept: conceptText(slot.creativeConcept)
      };
    });
  }
  const urls = cleanArray<unknown>(record.imageUrls);
  const ids = cleanArray<unknown>(record.imageIds);
  const count = Math.max(urls.length, ids.length);
  return Array.from({ length: count }, (_value, index) => ({
    imageId: str(ids[index]),
    imageUrl: str(urls[index]),
    paragraph: integer(cleanArray<unknown>(record.paragraphs)[index], index + 1),
    prompt: str(cleanArray<unknown>(record.prompts)[index]),
    negativePrompt: str(cleanArray<unknown>(record.negativePrompts)[index]),
    perspectiveMode: str(cleanArray<unknown>(record.perspectiveModes)[index]) || null,
    perspectiveSource: str(cleanArray<unknown>(record.perspectiveSources)[index]) || null,
    creativeConcept: conceptText(cleanArray<unknown>(record.creativeConcepts)[index])
  }));
}

async function loadRecord(key: string, value: unknown, chatId: string, userId?: string): Promise<LegacyImageRecord | null> {
  let stored = asRecord(value);
  const recordPath = str(stored.recordPath);
  if (recordPath) {
    const full = asRecord(await readJson<unknown>(recordPath, null, userId));
    if (Object.keys(full).length > 0) stored = { ...stored, ...full };
  }
  const slots = legacySlotsOf(stored);
  if (slots.length === 0) return null;
  let messageId = str(stored.messageId);
  let swipeId = integer(stored.swipeId, 0);
  if (!messageId) {
    const parts = key.split(":");
    if (parts.length >= 3) {
      messageId = parts[1] || "";
      swipeId = integer(parts[2], 0);
    }
  }
  return {
    key,
    chatId: str(stored.chatId) || chatId,
    messageId,
    swipeId,
    createdAt: str(stored.createdAt),
    slots
  };
}

/** All legacy records of one chat (empty when the chat has no legacy state). */
export async function loadLegacyRecords(chatId: string, userId?: string): Promise<LegacyImageRecord[]> {
  const state = await readJson<LegacyState>(`states/${chatId}.json`, STATE_FALLBACK, userId);
  const generated = asRecord(state.generated);
  const records: LegacyImageRecord[] = [];
  const seenPaths = new Set<string>();
  for (const [key, value] of Object.entries(generated)) {
    const path = str(asRecord(value).recordPath);
    if (path) {
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);
    }
    try {
      const record = await loadRecord(key, value, chatId, userId);
      if (record) records.push(record);
    } catch {
      // A broken legacy record must not hide the others.
    }
  }
  return records;
}

export type LegacyImageLookup = {
  chatId: string;
  messageId?: string;
  swipeId?: number;
  imageIndex?: number;
  imageId?: string;
  imageUrl?: string;
};

/** Finds the stored slot for an inlay image (by id, then URL, then message + index). */
export async function findLegacyImage(
  lookup: LegacyImageLookup,
  userId?: string
): Promise<{ record: LegacyImageRecord; index: number } | null> {
  if (!lookup.chatId) return null;
  const records = await loadLegacyRecords(lookup.chatId, userId);
  for (const record of records) {
    const index = record.slots.findIndex((slot) =>
      (lookup.imageId && slot.imageId === lookup.imageId) || (lookup.imageUrl && slot.imageUrl === lookup.imageUrl));
    if (index >= 0) return { record, index };
  }
  if (lookup.messageId && lookup.imageIndex !== undefined) {
    const record = records.find((candidate) => candidate.messageId === lookup.messageId
      && (lookup.swipeId === undefined || candidate.swipeId === lookup.swipeId));
    if (record && record.slots[lookup.imageIndex]) return { record, index: lookup.imageIndex };
  }
  return null;
}

// --- Gallery listing ---

export type InlayGalleryImage = {
  chatId: string;
  messageId: string;
  swipeId: number;
  imageId: string;
  imageUrl: string;
  imageIndex: number;
  paragraph: number;
  prompt: string;
  negativePrompt: string;
  quote: string;
};

export type InlayGalleryChat = {
  chatId: string;
  name?: string;
  cardName?: string;
  messageCount: number;
  branchCount: number;
  images: InlayGalleryImage[];
};

export type InlayGalleryResult = {
  page: number;
  totalChats: number;
  totalPages: number;
  chatIds: string[];
  chats: InlayGalleryChat[];
  records?: InlayGalleryChat[];
};

export const GALLERY_CHATS_PER_PAGE = 5;

function compareIds(a: string, b: string): number {
  if (/^-?\d+$/.test(a) && /^-?\d+$/.test(b)) {
    const diff = Number(a) - Number(b);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b);
}

async function chatInfo(chatId: string, images: InlayGalleryImage[], userId?: string): Promise<InlayGalleryChat> {
  let name: string | undefined;
  let cardName: string | undefined;
  try {
    const host = spindle as unknown as {
      chats?: { get?: (id: string, user?: string) => Promise<{ name?: string; character_id?: string } | null> };
      characters?: { get?: (id: string, user?: string) => Promise<{ name?: string } | null> };
    };
    const meta = typeof host.chats?.get === "function" ? await host.chats.get(chatId, userId) : null;
    if (meta?.name) name = meta.name;
    if (meta?.character_id && typeof host.characters?.get === "function") {
      const character = await host.characters.get(meta.character_id, userId);
      if (character?.name) cardName = character.name;
    }
  } catch {
    // Chat metadata is optional.
  }
  const messages = new Set(images.map((image) => image.messageId).filter(Boolean));
  const branches = new Set(images.filter((image) => image.swipeId > 0).map((image) => `${image.messageId}:${image.swipeId}`));
  return { chatId, name, cardName, messageCount: messages.size, branchCount: branches.size, images };
}

/** Paginated gallery of legacy illustrations, 5 chats per page. */
export async function listInlayGallery(userId: string | undefined, page: number, selectedChatId?: string): Promise<InlayGalleryResult> {
  const selected = typeof selectedChatId === "string" && /^[a-zA-Z0-9_-]+$/.test(selectedChatId.trim()) ? selectedChatId.trim() : undefined;
  const chatIds = new Set<string>();
  for (const raw of await listPaths("states/", userId)) {
    const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    const path = normalized.startsWith("states/") ? normalized : `states/${normalized}`;
    if (!path.endsWith(".json")) continue;
    const chatId = path.slice(7, -5);
    if (chatId && !chatId.includes("/")) chatIds.add(chatId);
  }
  if (selected) chatIds.add(selected);
  const sorted = [...chatIds].sort(compareIds);
  const totalPages = Math.max(1, Math.ceil(sorted.length / GALLERY_CHATS_PER_PAGE));
  let requested = Math.floor(Number(page));
  if (!Number.isFinite(requested) || requested < 1) requested = 1;
  if (requested > totalPages) requested = totalPages;
  const targets = selected ? [selected] : sorted.slice((requested - 1) * GALLERY_CHATS_PER_PAGE, requested * GALLERY_CHATS_PER_PAGE);

  const chats = await Promise.all(targets.map(async (chatId) => {
    const images: InlayGalleryImage[] = [];
    for (const record of await loadLegacyRecords(chatId, userId)) {
      if (!record.messageId) continue;
      record.slots.forEach((slot, index) => {
        if (!slot.imageUrl) return;
        images.push({
          chatId: record.chatId,
          messageId: record.messageId,
          swipeId: record.swipeId,
          imageId: slot.imageId,
          imageUrl: slot.imageUrl,
          imageIndex: index,
          paragraph: slot.paragraph || index + 1,
          prompt: slot.prompt,
          negativePrompt: slot.negativePrompt,
          quote: ""
        });
      });
    }
    images.sort((a, b) => compareIds(a.messageId, b.messageId) || a.swipeId - b.swipeId
      || a.paragraph - b.paragraph || a.imageIndex - b.imageIndex || a.imageUrl.localeCompare(b.imageUrl));
    return chatInfo(chatId, images, userId);
  }));

  return { page: requested, totalChats: sorted.length, totalPages, chatIds: sorted, chats, records: chats };
}
