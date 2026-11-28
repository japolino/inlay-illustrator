/**
 * Roster export / import (port addition, no Asset Maid original).
 *
 * A roster file carries the registered people of one character (lorebook actors, the description actor and custom
 * people) with their appearance forms, seed and recognition keys, so the same cast can be loaded on another character.
 * Each person is matched on the target character in this order: the same world book entry (shared lorebook), then
 * the same name (case-insensitive, any roster kind), else a new custom person is created. Matched people are
 * registered and get the imported active state, forms, seed and the recognition keys the user set on the source
 * (a custom person's keys, or edited lore keys), whatever the kind of the matched row.
 *
 * Asset refs inside the forms (reference / outfit images) are Lumiverse image ids or userStorage keys of the same
 * user: they keep working on the same Lumiverse instance. Asset selections and analysis caches are not exported.
 */
import { asArray, asRecord, hasOwn, isPlainObject, jsonClone, trimString } from "./common.js";
import {
  createCustomCharacter,
  normalizeFormCollection,
  parseCustomLorebookKeys,
  replaceRecognitionKeys,
  resolveCharacterForms,
  splitRecognitionKeys,
  type CharacterDocument,
  type CharacterScopedPrompt,
  type CustomCharacter,
  type CustomLorebookKeys,
  type FormCollection,
  type SeedSetting,
} from "./character.js";
import type { RosterItem } from "./rpc.js";

export const ROSTER_EXPORT_SCHEMA = "inlay-illustrator.roster";
export const ROSTER_EXPORT_VERSION = 1;
/** Largest accepted roster file (UTF-8 bytes). */
export const ROSTER_EXPORT_MAX_BYTES = 4 * 1024 * 1024;
/** Most people accepted from one file. */
export const ROSTER_EXPORT_MAX_PEOPLE = 500;

export interface RosterExportPerson {
  title: string;
  kind: RosterItem["kind"];
  /** Roster active state (registered people are always exported). */
  active: boolean;
  /** Effective recognition keys on the source character. */
  recognitionKeys: string[];
  /** Custom people: their appearance description; lore people: the entry text (used when the person becomes custom). */
  appearanceDescription: string;
  worldBookId?: string;
  entryId?: string;
  worldBookName?: string;
  /** Recognition keys edited by the user on a lore person (`characterPrompt.customLorebookKeys`). */
  customLorebookKeys?: CustomLorebookKeys;
  /** Stored appearance forms; absent when the person was never analysed or edited. */
  forms?: FormCollection;
  seed?: SeedSetting;
  origin?: "ai-auto";
}

export interface RosterExportFile {
  schema: typeof ROSTER_EXPORT_SCHEMA;
  version: typeof ROSTER_EXPORT_VERSION;
  exportedAt: string;
  source: { characterName: string };
  people: RosterExportPerson[];
}

export type RosterImportAction = "match" | "create";

export interface RosterImportStep {
  /** Index in `file.people`. */
  index: number;
  title: string;
  action: RosterImportAction;
  /** Target row (match only). */
  target?: { promptKey: string; kind: RosterItem["kind"]; memberKey: string; selectionId: string; title: string };
  /** How the match was found. */
  matchedBy?: "entry" | "name";
  /** The target already has stored forms that the imported ones replace. */
  replacesForms: boolean;
}

export interface RosterImportSummary {
  matched: number;
  created: number;
  replacedForms: number;
  people: { title: string; action: RosterImportAction; promptKey: string }[];
}

const LEGACY_FORM_MAPS = ["basePromptGroups", "lorebookPrompts", "lorebookNegativePrompts", "lorebookPromptGenders", "characterReferences", "outfitPrompts"] as const;

/** The prompt key has stored appearance data (forms or legacy per-key maps). */
export function hasStoredForms(cp: Partial<CharacterScopedPrompt>, promptKey: string): boolean {
  if (hasOwn(asRecord(cp.characterForms), promptKey)) return true;
  return LEGACY_FORM_MAPS.some((map) => hasOwn(asRecord(cp[map]), promptKey));
}

/* ------------------------------------------------------------------------------------------------
 * Export
 * ---------------------------------------------------------------------------------------------- */

/** Builds the roster file of a workspace (registered rows only). Pure. */
export function buildRosterExport(snapshot: { characterName: string; roster: readonly RosterItem[]; document: CharacterDocument }, now: Date = new Date()): RosterExportFile {
  const cp = snapshot.document.characterPrompt;
  const customs = new Map(snapshot.document.customCharacters.map((c) => [c.id, c]));
  const people: RosterExportPerson[] = [];
  for (const row of snapshot.roster) {
    if (!row.registered) continue;
    const custom = row.kind === "custom" ? customs.get(row.selectionId) : undefined;
    const person: RosterExportPerson = {
      title: row.title,
      kind: row.kind,
      active: row.workspaceEnabled,
      recognitionKeys: [...row.recognitionKeys],
      appearanceDescription: custom ? custom.appearanceDescription : row.content,
    };
    if (row.kind !== "custom") {
      if (row.worldBookId) person.worldBookId = row.worldBookId;
      if (row.entryId) person.entryId = row.entryId;
      if (row.worldBookName) person.worldBookName = row.worldBookName;
      if (hasOwn(cp.customLorebookKeys, row.promptKey)) person.customLorebookKeys = jsonClone(cp.customLorebookKeys[row.promptKey]!);
    }
    if (hasStoredForms(cp, row.promptKey)) person.forms = jsonClone(resolveCharacterForms(cp, row.promptKey));
    if (hasOwn(cp.seedSettings, row.promptKey)) person.seed = { ...cp.seedSettings[row.promptKey]! };
    if (row.origin === "ai-auto") person.origin = "ai-auto";
    people.push(person);
  }
  return { schema: ROSTER_EXPORT_SCHEMA, version: ROSTER_EXPORT_VERSION, exportedAt: now.toISOString(), source: { characterName: snapshot.characterName }, people };
}

/** Download file name: `<character>.roster.json` with path-unsafe characters replaced. */
export function rosterExportFileName(characterName: string): string {
  const base = trimString(characterName).replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_") || "roster";
  return `${base}.roster.json`;
}

/* ------------------------------------------------------------------------------------------------
 * Parse
 * ---------------------------------------------------------------------------------------------- */

export type RosterParseResult = { ok: true; file: RosterExportFile } | { ok: false; error: string };

const KINDS = new Set<RosterItem["kind"]>(["lore", "description", "custom"]);

function parseCustomKeys(value: unknown): CustomLorebookKeys | undefined {
  if (Array.isArray(value)) return splitRecognitionKeys(value);
  const r = asRecord(value);
  if (r.version === 1 && r.mode === "replace") return { version: 1, mode: "replace", keys: parseCustomLorebookKeys(value).keys };
  return undefined;
}

/** Strict-enough parse of a roster file (JSON text or value). Invalid people fail the whole file. */
export function parseRosterExport(input: unknown): RosterParseResult {
  let raw = input;
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).length > ROSTER_EXPORT_MAX_BYTES) return { ok: false, error: "The roster file is too large." };
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, error: "The file is not valid JSON." };
    }
  }
  if (!isPlainObject(raw) || raw.schema !== ROSTER_EXPORT_SCHEMA) return { ok: false, error: "This is not an Inlay Illustrator roster file." };
  if (typeof raw.version !== "number" || raw.version > ROSTER_EXPORT_VERSION) return { ok: false, error: "This roster file comes from a newer version of Inlay Illustrator." };
  if (raw.version !== ROSTER_EXPORT_VERSION) return { ok: false, error: "Unsupported roster file version." };
  const rawPeople = asArray(raw.people);
  if (!Array.isArray(raw.people) || rawPeople.length === 0) return { ok: false, error: "The roster file has no people." };
  if (rawPeople.length > ROSTER_EXPORT_MAX_PEOPLE) return { ok: false, error: `The roster file has more than ${ROSTER_EXPORT_MAX_PEOPLE} people.` };
  const people: RosterExportPerson[] = [];
  for (const [index, item] of rawPeople.entries()) {
    const p = asRecord(item);
    const title = trimString(p.title);
    const kind = p.kind as RosterItem["kind"];
    if (!title || !KINDS.has(kind)) return { ok: false, error: `Person ${index + 1} has no name or an unknown kind.` };
    const person: RosterExportPerson = {
      title,
      kind,
      active: p.active !== false,
      recognitionKeys: splitRecognitionKeys(p.recognitionKeys),
      appearanceDescription: trimString(p.appearanceDescription),
    };
    if (kind !== "custom") {
      const worldBookId = trimString(p.worldBookId);
      const entryId = trimString(p.entryId);
      if (worldBookId && entryId) Object.assign(person, { worldBookId, entryId });
      if (trimString(p.worldBookName)) person.worldBookName = trimString(p.worldBookName);
      const keys = parseCustomKeys(p.customLorebookKeys);
      if (keys) person.customLorebookKeys = keys;
    }
    if (p.forms !== undefined && p.forms !== null) {
      if (!isPlainObject(p.forms)) return { ok: false, error: `Person ${index + 1} (${title}) has invalid appearance forms.` };
      person.forms = normalizeFormCollection(p.forms);
    }
    if (isPlainObject(p.seed)) person.seed = { seed: trimString(p.seed.seed), fixed: p.seed.fixed === true };
    if (p.origin === "ai-auto") person.origin = "ai-auto";
    people.push(person);
  }
  const source = asRecord(raw.source);
  return {
    ok: true,
    file: { schema: ROSTER_EXPORT_SCHEMA, version: ROSTER_EXPORT_VERSION, exportedAt: trimString(raw.exportedAt), source: { characterName: trimString(source.characterName) }, people },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Plan + apply
 * ---------------------------------------------------------------------------------------------- */

const nameKey = (value: string): string => value.normalize("NFKC").trim().toLocaleLowerCase();

/** Matches each person of the file to a target roster row (each row at most once). Pure. */
export function planRosterImport(file: RosterExportFile, target: { roster: readonly RosterItem[]; document: Pick<CharacterDocument, "characterPrompt"> }): RosterImportStep[] {
  const claimed = new Set<string>();
  const byEntry = new Map<string, RosterItem>();
  for (const row of target.roster) if (row.kind !== "custom" && row.worldBookId && row.entryId) byEntry.set(`${row.worldBookId}\u0000${row.entryId}`, row);
  // Name candidates: lorebook / description rows first, then custom people.
  const byName = new Map<string, RosterItem[]>();
  for (const row of [...target.roster.filter((r) => r.kind !== "custom"), ...target.roster.filter((r) => r.kind === "custom")]) {
    const key = nameKey(row.title);
    if (key) byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  return file.people.map((person, index) => {
    let row: RosterItem | undefined;
    let matchedBy: RosterImportStep["matchedBy"];
    if (person.worldBookId && person.entryId) {
      const hit = byEntry.get(`${person.worldBookId}\u0000${person.entryId}`);
      if (hit && !claimed.has(hit.promptKey)) {
        row = hit;
        matchedBy = "entry";
      }
    }
    if (!row) {
      row = (byName.get(nameKey(person.title)) ?? []).find((r) => !claimed.has(r.promptKey));
      if (row) matchedBy = "name";
    }
    if (!row) return { index, title: person.title, action: "create" as const, replacesForms: false };
    claimed.add(row.promptKey);
    return {
      index,
      title: person.title,
      action: "match" as const,
      target: { promptKey: row.promptKey, kind: row.kind, memberKey: row.memberKey, selectionId: row.selectionId, title: row.title },
      matchedBy,
      replacesForms: !!person.forms && hasStoredForms(target.document.characterPrompt, row.promptKey),
    };
  });
}

const setList = (list: readonly string[] | undefined, id: string, present: boolean): string[] => {
  const next = (list ?? []).filter((x) => x !== id);
  return present ? [...next, id] : next;
};

/** The person's keys were set by the user on the source (custom person, or edited lore keys): they travel with it. */
const hasOwnKeys = (person: RosterExportPerson): boolean => person.recognitionKeys.length > 0 && (person.kind === "custom" || !!person.customLorebookKeys);

/** Lore keys to store on a lorebook / description target: the source's edit as is, else the person's keys (replace). */
function loreKeysFor(person: RosterExportPerson): CustomLorebookKeys | undefined {
  if (person.customLorebookKeys) return jsonClone(person.customLorebookKeys);
  return hasOwnKeys(person) ? replaceRecognitionKeys(person.recognitionKeys) : undefined;
}

function withPersonData(cp: CharacterScopedPrompt, promptKey: string, person: RosterExportPerson, loreKeys: boolean): CharacterScopedPrompt {
  let next = cp;
  if (person.forms) {
    const out: Record<string, unknown> = { ...next, characterForms: { ...next.characterForms, [promptKey]: normalizeFormCollection(person.forms) } };
    for (const map of LEGACY_FORM_MAPS) {
      const current = asRecord(out[map]);
      if (hasOwn(current, promptKey)) {
        const copy = { ...current };
        delete copy[promptKey];
        out[map] = copy;
      }
    }
    next = out as unknown as CharacterScopedPrompt;
  }
  if (person.seed) next = { ...next, seedSettings: { ...next.seedSettings, [promptKey]: { ...person.seed } } };
  const keys = loreKeys ? loreKeysFor(person) : undefined;
  if (keys) next = { ...next, customLorebookKeys: { ...next.customLorebookKeys, [promptKey]: keys } };
  return next;
}

/**
 * Applies a roster file to a character document. `roster` is the target's current roster projection (lore rows need
 * the host's world book entries). Pure: returns the new document and a summary.
 */
export function applyRosterImport(document: CharacterDocument, roster: readonly RosterItem[], file: RosterExportFile): { document: CharacterDocument; summary: RosterImportSummary } {
  const steps = planRosterImport(file, { roster, document });
  let cp: CharacterScopedPrompt = {
    ...document.characterPrompt,
    selectedLorebooks: { ...document.characterPrompt.selectedLorebooks },
    workspaceDisabledLorebooks: { ...document.characterPrompt.workspaceDisabledLorebooks },
  };
  let customs: CustomCharacter[] = [...document.customCharacters];
  const summary: RosterImportSummary = { matched: 0, created: 0, replacedForms: 0, people: [] };
  for (const step of steps) {
    const person = file.people[step.index]!;
    const existingCustom = step.target?.kind === "custom" ? customs.find((c) => c.id === step.target!.selectionId) : undefined;
    if (step.target && step.target.kind !== "custom") {
      const { memberKey, selectionId, promptKey } = step.target;
      cp.selectedLorebooks[memberKey] = setList(cp.selectedLorebooks[memberKey], selectionId, true);
      cp.workspaceDisabledLorebooks[memberKey] = setList(cp.workspaceDisabledLorebooks[memberKey], selectionId, !person.active);
      cp = withPersonData(cp, promptKey, person, true);
      summary.matched += 1;
      if (step.replacesForms) summary.replacedForms += 1;
      summary.people.push({ title: person.title, action: "match", promptKey });
      continue;
    }
    if (existingCustom) {
      const { rosterRegistered: _r, workspaceEnabled: _w, ...rest } = existingCustom;
      const keys = hasOwnKeys(person) ? { recognitionKeys: [...person.recognitionKeys] } : {};
      customs = customs.map((c) => (c.id === existingCustom.id ? { ...rest, ...keys, ...(person.active ? {} : { workspaceEnabled: false as const }) } : c));
      cp = withPersonData(cp, existingCustom.id, person, false);
      summary.matched += 1;
      if (step.replacesForms) summary.replacedForms += 1;
      summary.people.push({ title: person.title, action: "match", promptKey: existingCustom.id });
      continue;
    }
    const created = createCustomCharacter(
      { title: person.title, recognitionKeys: person.recognitionKeys.length ? person.recognitionKeys : [person.title], appearanceDescription: person.appearanceDescription },
      new Set(customs.map((c) => c.id)),
    );
    customs = [...customs, { ...created, ...(person.active ? {} : { workspaceEnabled: false as const }), ...(person.origin === "ai-auto" ? { origin: "ai-auto" as const } : {}) }];
    cp = withPersonData(cp, created.id, person, false);
    summary.created += 1;
    summary.people.push({ title: person.title, action: "create", promptKey: created.id });
  }
  return { document: { ...document, characterPrompt: cp, customCharacters: customs }, summary };
}
