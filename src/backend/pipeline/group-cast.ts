/**
 * Group chat cast (Inlay addition; Asset Maid has no group chats).
 *
 * A group chat analyzes the rosters of all member cards together. Cards of one group often register each other: every
 * card of a band lists the whole band in its own lorebook, and one card may hold custom copies of the others. The
 * analyzer then gets several candidates for one person, with different appearances; the name matches in the text point
 * at all of them, so it picks one at random or describes a new, unmatched person.
 *
 * `dedupeGroupCast` keeps one entry per group member: the member's own registered entries when its card registers
 * itself (its description, or an entry of its own world books named after it), otherwise the first copy, in member
 * order (the speaking card first), lore entries before custom characters. Only roster entries that are registered and
 * active count. People who are not members of the group, and entries whose name fits several members, are left as they
 * are. A person is matched to a member by name: the card name, the card name without decorations ("Alice Liddell || Wonderland"
 * -> "Alice Liddell"), its first word, or the Lumiverse display name ("Alice").
 */
import { customCharacterRosterState, type CharacterDocument, type CustomCharacter } from "../../shared/contract/index.js";
import { alternateCharacterName, plainCardName } from "../services/card-names.js";
import type { AmLoreRecord, AmSource, CharacterInfo } from "../services/types.js";

export interface GroupCastMember {
  /** Character id (member key of its source). */
  id: string;
  character: Pick<CharacterInfo, "name" | "extensions">;
  source: AmSource;
  document: CharacterDocument;
}

/** A copy left out of the cast, for the run log. */
export interface GroupCastDrop {
  /** Card the copy is registered on. */
  cardId: string;
  title: string;
  /** Group member it stands for. */
  memberId: string;
}

export interface GroupCast {
  /** Sources in member order, without the left-out lore entries. */
  sources: AmSource[];
  /** Custom characters of all member documents, without the left-out ones. */
  customCharacters: CustomCharacter[];
  dropped: GroupCastDrop[];
}

const norm = (value: string): string => value.toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** Lower case name forms a member card answers to. */
function memberForms(character: GroupCastMember["character"]): Set<string> {
  const plain = plainCardName(character.name);
  const first = plain.split(" ")[0] ?? "";
  return new Set([character.name, plain, first.length >= 3 ? first : "", alternateCharacterName(character.extensions)].map(norm).filter((f) => f.length >= 2));
}

/**
 * Group member a roster person stands for, or "" (no member, or several). The whole name is tried first, then the name
 * without decorations, then its parts ("[Cast] NPC [Alice]" -> "cast", "npc", "alice").
 */
function memberOf(title: string, forms: ReadonlyArray<{ id: string; forms: Set<string> }>): string {
  const whole = norm(title);
  const tiers = [[whole], [norm(plainCardName(title))], whole.split(/[\\/|,;:()[\]{}<>]+/g).map((p) => p.trim())];
  for (const names of tiers) {
    const wanted = names.filter((n) => n.length >= 2);
    if (!wanted.length) continue;
    const ids = new Set(forms.filter((f) => wanted.some((n) => f.forms.has(n))).map((f) => f.id));
    if (ids.size === 1) return [...ids][0]!;
    if (ids.size > 1) return "";
  }
  return "";
}

interface Person {
  cardId: string;
  title: string;
  memberId: string;
  drop: { lore: { memberKey: string; id: string } } | { custom: string };
}

export function dedupeGroupCast(members: readonly GroupCastMember[]): GroupCast {
  const customCharacters = members.flatMap((m) => m.document.customCharacters);
  if (members.length < 2) return { sources: members.map((m) => m.source), customCharacters, dropped: [] };

  // Roster maps as the run's merged config sees them: the first document (speaking card first) holding a member key wins.
  const rosterMap = (pick: (doc: CharacterDocument) => Record<string, string[]>, memberKey: string): Set<string> => {
    for (const m of members) {
      const map = pick(m.document) ?? {};
      if (Object.prototype.hasOwnProperty.call(map, memberKey)) return new Set(map[memberKey] ?? []);
    }
    return new Set();
  };
  /** Registered and active in the roster (workspace.ts `projectRoster`). */
  const activeLore = (lore: AmLoreRecord, selected: Set<string>, disabled: Set<string>): boolean => {
    const registered = lore.runtimeSelected === true || selected.has(lore.id) || selected.has(lore.selectionId);
    return registered && !(disabled.has(lore.id) || disabled.has(lore.selectionId));
  };

  const forms = members.map((m) => ({ id: m.id, forms: memberForms(m.character) }));
  const people: Person[] = [];
  for (const m of members) {
    for (const member of m.source.members) {
      const selected = rosterMap((d) => d.characterPrompt.selectedLorebooks, member.key);
      const disabled = rosterMap((d) => d.characterPrompt.workspaceDisabledLorebooks, member.key);
      for (const lore of member.lorebooks) {
        if (!activeLore(lore, selected, disabled)) continue;
        const memberId = memberOf(lore.title, forms);
        if (memberId) people.push({ cardId: m.id, title: lore.title, memberId, drop: { lore: { memberKey: member.key, id: lore.id } } });
      }
    }
  }
  for (const m of members)
    for (const custom of m.document.customCharacters) {
      if (!customCharacterRosterState(custom).workspaceEnabled) continue;
      const memberId = memberOf(custom.title, forms);
      if (memberId) people.push({ cardId: m.id, title: custom.title, memberId, drop: { custom: custom.id } });
    }

  const dropped: Person[] = [];
  for (const { id } of forms) {
    const copies = people.filter((p) => p.memberId === id);
    if (copies.length < 2) continue;
    const own = copies.filter((p) => p.cardId === id);
    const keep = new Set(own.length ? own : copies.slice(0, 1));
    dropped.push(...copies.filter((p) => !keep.has(p)));
  }
  if (!dropped.length) return { sources: members.map((m) => m.source), customCharacters, dropped: [] };

  const goneLore = new Set(dropped.flatMap((p) => ("lore" in p.drop ? [`${p.drop.lore.memberKey}\u0000${p.drop.lore.id}`] : [])));
  const goneCustom = new Set(dropped.flatMap((p) => ("custom" in p.drop ? [p.drop.custom] : [])));
  const sources = members.map((m) =>
    m.source.members.some((member) => member.lorebooks.some((l) => goneLore.has(`${member.key}\u0000${l.id}`)))
      ? { ...m.source, members: m.source.members.map((member) => ({ ...member, lorebooks: member.lorebooks.filter((l) => !goneLore.has(`${member.key}\u0000${l.id}`)) })) }
      : m.source,
  );
  return {
    sources,
    customCharacters: customCharacters.filter((c) => !goneCustom.has(c.id)),
    dropped: dropped.map((p) => ({ cardId: p.cardId, title: p.title, memberId: p.memberId })),
  };
}
