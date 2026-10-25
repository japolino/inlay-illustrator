/**
 * Art styles for other extensions (Cue reads them for its own image prompts) over the Spindle shared RPC pool.
 *
 * - Endpoint `inlay_illustrator.artists.<user>`: the pool has no user scope, so each user gets a channel of their own
 *   (`owner` for a user-scoped install, whose host events carry no userId).
 * - On-demand handler: every read loads the current config, so edits show up without a resync.
 * - Readers need `image_gen` (the owner has it too); nothing else is delegated.
 */
import { listNovelAIArtists, NO_ARTIST_ID, type InlayConfig, type NovelAIArtistOverrides } from "../../shared/contract/index.js";
import type { SpindleHost } from "./types.js";

export const SHARED_ARTISTS_CHANNEL = "artists";
export const SHARED_ARTISTS_VERSION = 1;
const OWNER_CHANNEL = "owner";
const CHANNEL_SEGMENT = /^[a-z0-9][a-z0-9_-]*$/u;

export interface SharedNovelAIArtist {
  id: string;
  title: string;
  prompt: string;
  negativePrompt: string;
  novelAIOverrides?: NovelAIArtistOverrides;
  builtIn: boolean;
}
export interface SharedAnimaArtist { id: string; title: string; text: string }
export interface SharedArtists {
  version: typeof SHARED_ARTISTS_VERSION;
  /** Global NovelAI preset (`none` when unset or deleted). */
  defaultArtistId: string;
  novelai: SharedNovelAIArtist[];
  anima: SharedAnimaArtist[];
}

/** Channel suffix for a user (`artists.<user>`). User ids outside the pool's segment syntax fall back to `owner`. */
export function sharedArtistsChannel(userId: string | undefined): string {
  const key = (userId ?? "").trim().toLowerCase();
  return `${SHARED_ARTISTS_CHANNEL}.${key && CHANNEL_SEGMENT.test(key) ? key : OWNER_CHANNEL}`;
}

export function sharedArtistsValue(config: Pick<InlayConfig, "characterPrompt" | "animaArtists">): SharedArtists {
  const novelai = listNovelAIArtists(config.characterPrompt.artistPrompts)
    .filter((artist) => artist.id !== NO_ARTIST_ID)
    .map((artist): SharedNovelAIArtist => ({
      id: artist.id,
      title: artist.displayTitle || artist.title,
      prompt: artist.prompt,
      negativePrompt: artist.negativePrompt,
      ...(artist.novelAIOverrides ? { novelAIOverrides: { ...artist.novelAIOverrides } } : {}),
      builtIn: !artist.userDefined,
    }));
  const ids = new Set(novelai.map((artist) => artist.id));
  const defaultArtistId = ids.has(config.characterPrompt.defaultArtistId) ? config.characterPrompt.defaultArtistId : NO_ARTIST_ID;
  const anima = config.animaArtists.entries.map((entry) => ({ id: entry.id, title: entry.title, text: entry.text }));
  return { version: SHARED_ARTISTS_VERSION, defaultArtistId, novelai, anima };
}

/** Registers the user's endpoint; a host without the pool (older Lumiverse, tests) skips it. Returns the unregister call. */
export function shareArtists(host: Pick<SpindleHost, "rpcPool">, userId: string | undefined, loadConfig: () => Promise<InlayConfig>): () => void {
  const pool = host.rpcPool as SpindleHost["rpcPool"] | undefined;
  if (!pool?.handle) return () => {};
  const channel = sharedArtistsChannel(userId);
  try {
    pool.handle(channel, async () => sharedArtistsValue(await loadConfig()), { requires: ["image_gen"] });
  } catch {
    return () => {};
  }
  return () => {
    try {
      pool.unregister(channel);
    } catch {
      /* already gone */
    }
  };
}
