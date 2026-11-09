/**
 * Character profiles on request, for other extensions (Gambit asks for the card people it has to draw), over the
 * Spindle shared RPC pool.
 *
 * - Endpoint `inlay_illustrator.profiles.<user>`. The pool passes a handler no arguments, so the request is the
 *   reader's own endpoint `<readerExtensionId>.inlay.wanted.<user>`:
 *   `{ version: 1, characterId, people: [{ name, aliases?, description? }] }`.
 * - Reading the endpoint looks each wanted person up in the card's roster: a lorebook entry whose title or keys name
 *   them, else a custom character made for them (the description is its analysis text). They are registered, and
 *   Inlay's own character analysis (text evidence: the entry body or the description, plus the model's knowledge of
 *   a known character's Danbooru tag) runs for the ones without a profile yet.
 * - It answers at once with what it did; the profiles appear on `characters.<user>.<characterId>` when the analysis
 *   ends. A person analysed without a result is not retried for RETRY_MS.
 * - Readers need `characters` (they learn the card's roster names), `world_books` (the roster is read from the lorebooks
 *   while answering) and `generation` (reading may start an LLM analysis, which runs later with Inlay's own permissions,
 *   outside the request). A handler runs with exactly what its policy requires: without `world_books` every book reads as
 *   missing, and everyone in a lorebook looks like someone the card lacks.
 */
import type { AnalysisController } from "./index.js";
import type { RosterItem } from "../../shared/contract/index.js";
import type { BackendServices, SpindleHost } from "../services/types.js";
import { sharedArtistsChannel } from "../services/shared-artists.js";
import { createCustomCharacterEntry, loadWorkspaceSnapshot, removeCustomCharacterEntry, setCustomCharactersRegistered, setRosterRegistered } from "./workspace.js";

export const SHARED_PROFILES_CHANNEL = "profiles";
export const SHARED_PROFILES_VERSION = 1;
const RETRY_MS = 30 * 60_000;
const MAX_PEOPLE = 12;

export interface WantedPerson {
  name: string;
  aliases?: string[];
  description?: string;
}
export interface ProfileRequest {
  version: 1;
  characterId: string;
  people: WantedPerson[];
}
export interface ProfileAnswer {
  version: typeof SHARED_PROFILES_VERSION;
  status: "no-request" | "ready" | "running" | "started";
  characterId?: string;
  /** People already profiled. */
  ready?: string[];
  /** People whose analysis is running or was just started. */
  pending?: string[];
  /** People analysed recently without a result (not retried yet). */
  skipped?: string[];
  jobId?: string;
  /** How this card's last profile analysis ended (kept until the next one). */
  last?: { status: string; message: string; error?: string; at: number };
}

/** `profiles.<user>` (the bare suffix the owner registers). */
export function sharedProfilesChannel(userId: string | undefined): string {
  return `${SHARED_PROFILES_CHANNEL}.${sharedArtistsChannel(userId).slice("artists.".length)}`;
}

/** Where a reader publishes what it wants: `<reader>.inlay.wanted.<user>`. */
export function wantedEndpoint(readerExtensionId: string, userId: string | undefined): string {
  return `${readerExtensionId}.inlay.wanted.${sharedArtistsChannel(userId).slice("artists.".length)}`;
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function parseProfileRequest(raw: unknown): ProfileRequest | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o || o.version !== 1) return null;
  const characterId = text(o.characterId, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(characterId)) return null;
  const people = (Array.isArray(o.people) ? o.people : [])
    .map((p): WantedPerson | null => {
      const x = p && typeof p === "object" ? (p as Record<string, unknown>) : null;
      const name = text(x?.name, 80);
      if (!name) return null;
      const aliases = (Array.isArray(x?.aliases) ? x.aliases : []).map((a) => text(a, 80)).filter(Boolean).slice(0, 6);
      const description = text(x?.description, 1500);
      return { name, ...(aliases.length ? { aliases } : {}), ...(description ? { description } : {}) };
    })
    .filter((p): p is WantedPerson => !!p)
    .slice(0, MAX_PEOPLE);
  return people.length ? { version: 1, characterId: characterId.toLowerCase(), people } : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Custom characters a reader's request made for someone a lorebook does describe, from before those books could be read
 * here. Only one still holding exactly what the request wrote: a person's edits are theirs, and keep it.
 */
export function staleRequestMade<C extends { id: string; title: string; appearanceDescription?: string }>(custom: readonly C[], roster: readonly RosterItem[], people: readonly WantedPerson[]): C[] {
  const lore = roster.filter((row) => row.kind === "lore");
  return people.flatMap((person) => {
    if (!person.description || !rowFor(lore, person)) return [];
    return custom.filter((c) => norm(c.title) === norm(person.name) && (c.appearanceDescription ?? "").trim() === person.description!.trim());
  });
}

/** The roster row that is this person: their name or an alias as the row's title, a key, or the title's first words. */
export function rowFor(roster: readonly RosterItem[], person: WantedPerson): RosterItem | null {
  const names = [person.name, ...(person.aliases ?? [])].map(norm).filter(Boolean);
  const score = (row: RosterItem): number => {
    const title = norm(row.title);
    const keys = [...row.recognitionKeys, ...row.keys].map(norm);
    if (names.includes(title)) return 3;
    if (keys.some((k) => names.includes(k))) return 2;
    if (names.some((n) => title.startsWith(`${n} `))) return 1;
    return 0;
  };
  let best: RosterItem | null = null;
  let top = 0;
  for (const row of roster) {
    if (row.kind === "description") continue;
    const s = score(row);
    if (s > top || (s === top && s > 0 && best && !best.mainPrompt && row.mainPrompt)) {
      best = row;
      top = s;
    }
  }
  return top > 0 ? best : null;
}

export interface SharedProfiles {
  dispose(): void;
}

export function shareProfiles(services: BackendServices, analysis: () => AnalysisController): SharedProfiles {
  const host = services.host as Pick<SpindleHost, "rpcPool">;
  const pool = host.rpcPool as SpindleHost["rpcPool"] | undefined;
  if (!pool?.handle) return { dispose() {} };
  const tried = new Map<string, number>();
  const last = new Map<string, NonNullable<ProfileAnswer["last"]>>();
  const channel = sharedProfilesChannel(services.userId);
  // Work started from a pool request runs inside that request's permission scope (Lumiverse worker-runtime keeps it
  // in AsyncLocalStorage), and the host drops the scope when the handler answers: a job's later LLM calls were denied.
  // Jobs are queued instead and started by a timer made here, outside any request, so they run with Inlay's own
  // permissions.
  const outside: (() => void)[] = [];
  const drain = setInterval(() => {
    for (const run of outside.splice(0)) {
      try {
        run();
      } catch (err) {
        services.log.append("warn", "profiles", `profile analysis could not start: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, 500);
  (drain as { unref?: () => void }).unref?.();

  async function answer(reader: string): Promise<ProfileAnswer> {
    const raw = await pool!.read(wantedEndpoint(reader, services.userId)).catch(() => null);
    const req = parseProfileRequest(raw);
    if (!req) return { version: SHARED_PROFILES_VERSION, status: "no-request" };
    const { characterId } = req;
    const ended = last.get(characterId);
    const withLast = <T extends ProfileAnswer>(a: T): T => (ended ? { ...a, last: ended } : a);
    const running = analysis()
      .listActive()
      .find((j) => j.characterId === characterId && j.kind === "character-prompts" && (j.status === "running" || j.status === "queued"));
    let snap = await loadWorkspaceSnapshot(services, characterId);
    if (!running) {
      const stale = staleRequestMade((await services.storage.loadCharacterDocument(characterId)).customCharacters, snap.roster, req.people);
      for (const made of stale) {
        await removeCustomCharacterEntry(services, characterId, made.id);
        services.log.append("info", "profiles", `${made.title}: using their lorebook entry instead of a profile made without it`, { characterId });
      }
      if (stale.length) snap = await loadWorkspaceSnapshot(services, characterId);
    }
    const ready: string[] = [];
    const pending: string[] = [];
    const skipped: string[] = [];
    const targets: RosterItem[] = [];
    const made: WantedPerson[] = [];
    for (const person of req.people) {
      const row = rowFor(snap.roster, person);
      if (row?.mainPrompt) ready.push(person.name);
      else if (row) targets.push(row);
      else made.push(person);
    }
    if (running) return withLast({ version: SHARED_PROFILES_VERSION, status: "running", characterId, ready, pending: [...targets, ...made].map((r) => ("title" in r ? r.title : r.name)), jobId: running.jobId });
    // People the roster lacks become custom characters, their description the analysis text.
    for (const person of made) {
      await createCustomCharacterEntry(services, characterId, {
        title: person.name,
        recognitionKeys: [person.name, ...(person.aliases ?? [])].join(", "),
        appearanceDescription: person.description ?? "",
      });
    }
    if (made.length) {
      snap = await loadWorkspaceSnapshot(services, characterId);
      for (const person of made) {
        const row = rowFor(snap.roster, person);
        if (row) targets.push(row);
      }
    }
    const now = Date.now();
    const go = targets.filter((row) => {
      const at = tried.get(`${characterId}\u0000${row.promptKey}`);
      if (at && now - at < RETRY_MS) {
        skipped.push(row.title);
        return false;
      }
      return true;
    });
    if (!go.length) return withLast({ version: SHARED_PROFILES_VERSION, status: "ready", characterId, ready, ...(skipped.length ? { skipped } : {}) });
    const lore = go.filter((r) => r.kind === "lore" && !r.registered);
    if (lore.length) await setRosterRegistered(services, characterId, lore.map((r) => ({ memberKey: r.memberKey, selectionId: r.selectionId })), true);
    const customs = go.filter((r) => r.kind === "custom" && !r.registered).map((r) => r.selectionId);
    if (customs.length) await setCustomCharactersRegistered(services, characterId, customs, true);
    for (const row of go) tried.set(`${characterId}\u0000${row.promptKey}`, now);
    outside.push(() => {
      const { jobId } = analysis().start({ kind: "character-prompts", characterId, evidenceMode: "text", promptKeys: go.map((r) => r.promptKey), explicit: true });
      services.log.append("info", "profiles", `${reader} asked for ${go.map((r) => r.title).join(", ")}: analysing`, { characterId, jobId });
      void analysis()
        .outcome(jobId)
        ?.then((o) => {
          last.set(characterId, { status: o.status, message: o.message, ...(o.error ? { error: o.error.message } : {}), at: Date.now() });
          services.log.append(o.status === "error" ? "warn" : "info", "profiles", `profile analysis for ${reader}: ${o.status} (${o.error?.message ?? o.message})`, { characterId, jobId });
        })
        .catch(() => undefined);
    });
    for (const row of go) pending.push(row.title);
    return withLast({ version: SHARED_PROFILES_VERSION, status: "started", characterId, ready, pending, ...(skipped.length ? { skipped } : {}) });
  }

  try {
    // Readers that may make Inlay analyse (an LLM call) must hold generation themselves.
    pool.handle(channel, (ctx) => answer(ctx.requesterExtensionId), { requires: ["characters", "generation", "world_books"] });
  } catch {
    return { dispose() {} };
  }
  return {
    dispose() {
      clearInterval(drain);
      try {
        pool.unregister(channel);
      } catch {
        /* already gone */
      }
    },
  };
}
