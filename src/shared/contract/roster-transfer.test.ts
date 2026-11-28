import { describe, expect, test } from "bun:test";
import { createEmptyCharacterDocument, normalizeFormCollection, type CharacterDocument } from "./character.js";
import {
  applyRosterImport,
  buildRosterExport,
  parseRosterExport,
  planRosterImport,
  rosterExportFileName,
  ROSTER_EXPORT_SCHEMA,
  type RosterExportFile,
  type RosterExportPerson,
} from "./roster-transfer.js";
import type { RosterItem } from "./rpc.js";

const SRC = "char-src";
const DST = "char-dst";

function row(partial: Partial<RosterItem> & Pick<RosterItem, "promptKey" | "kind" | "title">): RosterItem {
  return {
    memberKey: partial.kind === "custom" ? `virtual-character:${partial.promptKey}` : SRC,
    selectionId: partial.kind === "custom" ? partial.promptKey : "",
    keys: [], primaryKeys: [], secondaryKeys: [], recognitionKeys: [partial.title.toLowerCase()], content: "", score: 0,
    registered: false, workspaceEnabled: false, mainPrompt: "", analyzeEnabled: true, selectedAssetCount: 0,
    ...partial,
  };
}

const forms = (hair: string) => normalizeFormCollection({ forms: [{ id: "form_default", label: "기본", gender: "male", basePromptGroups: { "hair.color": [hair] } }] });

function sourceDocument(): CharacterDocument {
  const doc = createEmptyCharacterDocument(SRC);
  doc.characterPrompt.characterForms[`${SRC}::lore::wb1:e1`] = forms("black hair");
  doc.characterPrompt.seedSettings[`${SRC}::lore::wb1:e1`] = { seed: "42", fixed: true };
  doc.characterPrompt.customLorebookKeys[`${SRC}::lore::wb1:e1`] = { version: 1, mode: "replace", keys: ["mikey", "mike"] };
  doc.characterPrompt.lorebookPrompts[`${SRC}::lore::wb2:e9`] = "blond hair";
  doc.customCharacters.push({ id: "character_aaa", title: "Vic Havoc", recognitionKeys: ["vic"], appearanceDescription: "Tattooed drummer.", workspaceEnabled: false });
  return doc;
}

function sourceRoster(): RosterItem[] {
  return [
    row({ promptKey: `${SRC}::lore::wb1:e1`, kind: "lore", title: "Mikey", selectionId: "wb1:e1", worldBookId: "wb1", entryId: "e1", worldBookName: "Band", registered: true, workspaceEnabled: true, content: "Bassist." }),
    row({ promptKey: `${SRC}::lore::wb2:e9`, kind: "lore", title: "Zack Lee", selectionId: "wb2:e9", worldBookId: "wb2", entryId: "e9", registered: true, workspaceEnabled: true, content: "Drummer, blond." }),
    row({ promptKey: `${SRC}::lore::wb1:e2`, kind: "lore", title: "Not registered", selectionId: "wb1:e2", worldBookId: "wb1", entryId: "e2" }),
    row({ promptKey: "character_aaa", kind: "custom", title: "Vic Havoc", registered: true, workspaceEnabled: false, recognitionKeys: ["vic"] }),
  ];
}

const exported = (): RosterExportFile => buildRosterExport({ characterName: "Kellin", roster: sourceRoster(), document: sourceDocument() }, new Date("2026-11-27T00:00:00Z"));

describe("roster export", () => {
  test("only registered people, with forms, seed, keys and active state", () => {
    const file = exported();
    expect(file).toMatchObject({ schema: ROSTER_EXPORT_SCHEMA, version: 1, exportedAt: "2026-11-27T00:00:00.000Z", source: { characterName: "Kellin" } });
    expect(file.people.map((p) => p.title)).toEqual(["Mikey", "Zack Lee", "Vic Havoc"]);
    const [mikey, zack, vic] = file.people as [RosterExportPerson, RosterExportPerson, RosterExportPerson];
    expect(mikey).toMatchObject({ kind: "lore", active: true, worldBookId: "wb1", entryId: "e1", worldBookName: "Band", seed: { seed: "42", fixed: true }, customLorebookKeys: { version: 1, mode: "replace", keys: ["mikey", "mike"] }, appearanceDescription: "Bassist." });
    expect(mikey.forms!.forms[0]!.basePromptGroups["hair.color"]).toEqual(["black hair"]);
    // Legacy per-key prompt is exported as forms.
    expect(zack.forms!.forms[0]!.basePromptGroups.custom).toEqual(["blond hair"]);
    expect(vic).toMatchObject({ kind: "custom", active: false, appearanceDescription: "Tattooed drummer.", recognitionKeys: ["vic"] });
    expect(vic.forms).toBeUndefined();
  });

  test("file name", () => {
    expect(rosterExportFileName("Kellin Beckett | Sleeping")).toBe("Kellin Beckett _ Sleeping.roster.json");
    expect(rosterExportFileName("  ")).toBe("roster.roster.json");
  });
});

describe("roster file parse", () => {
  test("round trip through JSON text", () => {
    const file = exported();
    const parsed = parseRosterExport(JSON.stringify(file));
    expect(parsed).toEqual({ ok: true, file });
  });

  test("rejects other files, newer versions and broken people", () => {
    expect(parseRosterExport("{nope")).toEqual({ ok: false, error: "The file is not valid JSON." });
    expect(parseRosterExport({ schema: "inlay-illustrator.preset", version: 1, people: [] }).ok).toBe(false);
    expect(parseRosterExport({ ...exported(), version: 2 })).toEqual({ ok: false, error: "This roster file comes from a newer version of Inlay Illustrator." });
    expect(parseRosterExport({ ...exported(), people: [] })).toEqual({ ok: false, error: "The roster file has no people." });
    expect(parseRosterExport({ ...exported(), people: [{ title: "", kind: "lore" }] }).ok).toBe(false);
    expect(parseRosterExport({ ...exported(), people: [{ title: "X", kind: "persona" }] }).ok).toBe(false);
    expect(parseRosterExport({ ...exported(), people: [{ title: "X", kind: "custom", forms: "oops" }] }).ok).toBe(false);
  });
});

describe("roster import", () => {
  const targetRoster = (): RosterItem[] => [
    // Shares world book wb1 with the source: same entry -> matched even under another title.
    row({ promptKey: `${DST}::lore::wb1:e1`, kind: "lore", title: "Mikey Way", memberKey: DST, selectionId: "wb1:e1", worldBookId: "wb1", entryId: "e1" }),
    // Different book, same name.
    row({ promptKey: `${DST}::lore::wb7:z1`, kind: "lore", title: "zack lee", memberKey: DST, selectionId: "wb7:z1", worldBookId: "wb7", entryId: "z1" }),
    row({ promptKey: `${DST}::lore::asset-maid:charx-description:v1`, kind: "description", title: "Oliver", memberKey: DST, selectionId: "asset-maid:charx-description:v1" }),
  ];

  test("plan: entry, then name, else create", () => {
    const doc = createEmptyCharacterDocument(DST);
    doc.characterPrompt.characterForms[`${DST}::lore::wb7:z1`] = forms("red hair");
    const steps = planRosterImport(exported(), { roster: targetRoster(), document: doc });
    expect(steps.map((s) => [s.title, s.action, s.matchedBy ?? null, s.target?.promptKey ?? null, s.replacesForms])).toEqual([
      ["Mikey", "match", "entry", `${DST}::lore::wb1:e1`, false],
      ["Zack Lee", "match", "name", `${DST}::lore::wb7:z1`, true],
      ["Vic Havoc", "create", null, null, false],
    ]);
  });

  test("each target row is claimed once", () => {
    const file = exported();
    file.people = [file.people[1]!, { ...file.people[1]!, worldBookId: undefined, entryId: undefined }];
    const steps = planRosterImport(file, { roster: targetRoster(), document: createEmptyCharacterDocument(DST) });
    expect(steps.map((s) => s.action)).toEqual(["match", "create"]);
  });

  test("apply registers, copies appearance and creates custom people", () => {
    const doc = createEmptyCharacterDocument(DST);
    doc.characterPrompt.lorebookPrompts[`${DST}::lore::wb7:z1`] = "old legacy prompt";
    doc.characterPrompt.workspaceDisabledLorebooks[DST] = ["wb1:e1"];
    const { document, summary } = applyRosterImport(doc, targetRoster(), exported());
    expect(summary).toMatchObject({ matched: 2, created: 1, replacedForms: 1 });
    const cp = document.characterPrompt;
    expect(cp.selectedLorebooks[DST]!.sort()).toEqual(["wb1:e1", "wb7:z1"]);
    expect(cp.workspaceDisabledLorebooks[DST]).toEqual([]);
    expect(cp.characterForms[`${DST}::lore::wb1:e1`]!.forms[0]!.basePromptGroups["hair.color"]).toEqual(["black hair"]);
    expect(cp.seedSettings[`${DST}::lore::wb1:e1`]).toEqual({ seed: "42", fixed: true });
    expect(cp.customLorebookKeys[`${DST}::lore::wb1:e1`]).toEqual({ version: 1, mode: "replace", keys: ["mikey", "mike"] });
    // The imported forms replace the legacy per-key prompt.
    expect(cp.characterForms[`${DST}::lore::wb7:z1`]!.forms[0]!.basePromptGroups.custom).toEqual(["blond hair"]);
    expect(cp.lorebookPrompts[`${DST}::lore::wb7:z1`]).toBeUndefined();
    const vic = document.customCharacters.find((c) => c.title === "Vic Havoc")!;
    expect(vic).toMatchObject({ recognitionKeys: ["vic"], appearanceDescription: "Tattooed drummer.", workspaceEnabled: false });
    expect(vic.id).toStartWith("character_");
    expect(summary.people.find((p) => p.title === "Vic Havoc")).toEqual({ title: "Vic Havoc", action: "create", promptKey: vic.id });
    // The input document is not mutated.
    expect(doc.characterPrompt.selectedLorebooks).toEqual({});
    expect(doc.customCharacters).toEqual([]);
  });

  test("apply on an existing custom person re-registers it, keeps its id and takes the file's keys", () => {
    const doc = createEmptyCharacterDocument(DST);
    doc.customCharacters.push({ id: "character_bbb", title: "Vic Havoc", recognitionKeys: ["havoc"], appearanceDescription: "", rosterRegistered: false });
    const roster = [row({ promptKey: "character_bbb", kind: "custom", title: "Vic Havoc" })];
    const file = exported();
    file.people = [{ ...file.people[2]!, active: true, forms: forms("shaved head") }];
    const { document, summary } = applyRosterImport(doc, roster, file);
    expect(summary).toMatchObject({ matched: 1, created: 0 });
    expect(document.customCharacters).toEqual([{ id: "character_bbb", title: "Vic Havoc", recognitionKeys: ["vic"], appearanceDescription: "" }]);
    expect(document.characterPrompt.characterForms.character_bbb!.forms[0]!.basePromptGroups["hair.color"]).toEqual(["shaved head"]);
  });

  test("edited keys follow a person matched by name to another kind of row", () => {
    const doc = createEmptyCharacterDocument(DST);
    doc.customCharacters.push({ id: "character_ccc", title: "Mikey", recognitionKeys: ["mikey"], appearanceDescription: "" });
    const roster = [
      row({ promptKey: "character_ccc", kind: "custom", title: "Mikey" }),
      row({ promptKey: `${DST}::lore::wb5:v1`, kind: "lore", title: "Vic Havoc", memberKey: DST, selectionId: "wb5:v1", worldBookId: "wb5", entryId: "v1" }),
    ];
    const file = exported();
    // Lore Mikey (edited keys, other book) -> custom Mikey; custom Vic -> lore Vic.
    file.people = [{ ...file.people[0]!, worldBookId: "wb9", recognitionKeys: ["mikey", "mike"] }, file.people[2]!];
    const { document } = applyRosterImport(doc, roster, file);
    expect(document.customCharacters.find((c) => c.id === "character_ccc")!.recognitionKeys).toEqual(["mikey", "mike"]);
    expect(document.characterPrompt.customLorebookKeys[`${DST}::lore::wb5:v1`]).toEqual({ version: 1, mode: "replace", keys: ["vic"] });
  });

  test("lore keys that were never edited are left to the target's entry", () => {
    const file = exported();
    file.people = [{ ...file.people[1]!, recognitionKeys: ["zack"] }];
    const { document } = applyRosterImport(createEmptyCharacterDocument(DST), targetRoster(), file);
    expect(document.characterPrompt.customLorebookKeys).toEqual({});
  });

  test("a person without recognition keys becomes custom with its name as key", () => {
    const file = exported();
    file.people = [{ title: "Ben Lazarra", kind: "lore", active: true, recognitionKeys: [], appearanceDescription: "" }];
    const { document } = applyRosterImport(createEmptyCharacterDocument(DST), [], file);
    expect(document.customCharacters).toMatchObject([{ title: "Ben Lazarra", recognitionKeys: ["Ben Lazarra"] }]);
  });
});
