import { describe, expect, test } from "bun:test";
import parity from "./fixtures/character-parity.json" with { type: "json" };
import {
  addForm,
  addOutfit,
  APPEARANCE_CATALOG,
  assetIdentity,
  buildLegacyFormCollection,
  compactFormCollectionForStorage,
  compileMainPrompt,
  createCustomCharacter,
  createEmptyCharacterDocument,
  customCharacterRosterState,
  dedupeAssetRefs,
  deleteForm,
  deleteOutfit,
  descriptionPromptKey,
  effectiveRecognitionKeys,
  FILENAME_TAG_TABLE,
  findDuplicateRecognitionKeys,
  formCollectionRevision,
  isFormTargetCurrent,
  isOutfitCandidate,
  isOutfitEmpty,
  listNovelAIArtists,
  lorePromptKey,
  mergeAnalyzedBasePromptGroups,
  moveOutfit,
  normalizeAssetRef,
  normalizeBasePromptGroups,
  normalizeCharacterDocument,
  normalizeFormCollection,
  normalizeNonArtistPromptWeight,
  normalizeNovelAIArtistOverrides,
  normalizeWeightedPromptSpacing,
  parseCustomCharacter,
  parseCustomLorebookKeys,
  parsePromptKey,
  patchForm,
  patchOutfit,
  personaPromptKey,
  promoteCustomCharacter,
  promoteOutfitToDefault,
  referenceBindingKey,
  removePromptKeyData,
  replaceEmptyDefaultOutfit,
  resolveFormOutfit,
  resolveFormOutfitByOutfit,
  resolvePersonaForms,
  setDefaultForm,
  splitRecognitionKeys,
  updateCustomCharacter,
  validateCustomCharacterInput,
  type FormCollection,
} from "./character.js";

type AnyRec = Record<string, any>;
const P = parity as AnyRec;

describe("prompt keys (Lumiverse mapping)", () => {
  test("formats and parsing", () => {
    expect(lorePromptKey("char-1", "wb-1", "e-1")).toBe("char-1::lore::wb-1:e-1");
    expect(parsePromptKey("char-1::lore::wb-1:e-1")).toEqual({ kind: "lore", characterId: "char-1", worldBookId: "wb-1", entryId: "e-1", selectionId: "wb-1:e-1" });
    expect(parsePromptKey(descriptionPromptKey("c"))).toMatchObject({ kind: "description", characterId: "c" });
    expect(parsePromptKey(personaPromptKey("p1"))).toEqual({ kind: "persona", personaId: "p1" });
    expect(parsePromptKey("character_abc")).toEqual({ kind: "custom", customId: "character_abc" });
    expect(parsePromptKey("weird").kind).toBe("unknown");
    expect(referenceBindingKey("c::lore::w:e", "form:form_default:character-reference")).toBe("asset-maid:c%3A%3Alore%3A%3Aw%3Ae:form%3Aform_default%3Acharacter-reference");
  });
});

describe("appearance catalog parity (Qs / Si / bW)", () => {
  test("catalog has 13 groups", () => expect(APPEARANCE_CATALOG.groups.length).toBe(13));
  for (const [i, c] of P.Qs.entries()) test(`Qs ${i}`, () => expect(normalizeBasePromptGroups(c.input, c.options)).toEqual(c.output));
  for (const [i, c] of P.Si.entries()) test(`Si ${i}`, () => expect(compileMainPrompt(c.input, c.gender ?? undefined)).toBe(c.output));
  for (const [i, c] of P.bW.entries()) test(`bW ${i}`, () => expect(mergeAnalyzedBasePromptGroups(c.current, c.analyzed, c.gender)).toEqual(c.output));
});

describe("FormCollection parity (go / LY / ds / ops)", () => {
  for (const [i, c] of P.go.entries()) {
    test(`go ${i}`, () => {
      const out = normalizeFormCollection(c.input ?? undefined, c.fallbackGender ? { fallbackGender: c.fallbackGender } : {});
      expect(out).toEqual(c.output);
      expect(normalizeFormCollection(out, c.fallbackGender ? { fallbackGender: c.fallbackGender } : {})).toEqual(out);
      expect(formCollectionRevision(c.input ?? undefined)).toBe(c.revision);
    });
  }
  for (const [i, c] of P.LY.entries()) test(`LY ${i}`, () => expect(buildLegacyFormCollection(c.input)).toEqual(c.output));
  const base = P.formOps.base as FormCollection;
  const run = (name: string, args: any[]): unknown => {
    const b = JSON.parse(JSON.stringify(base));
    switch (name) {
      case "addForm": return addForm(b, args[0]);
      case "patchForm": return patchForm(b, args[0], args[1]);
      case "deleteForm": return deleteForm(b, args[0]);
      case "setDefaultForm": return setDefaultForm(b, args[0]);
      case "patchOutfit": return patchOutfit(b, args[0], args[1], args[2]);
      case "addOutfit": return addOutfit(b, args[0], args[1]);
      case "replaceEmptyDefaultOutfit": return replaceEmptyDefaultOutfit(b, args[0], args[1]);
      case "deleteOutfit": return deleteOutfit(b, args[0], args[1]);
      case "promoteOutfitToDefault": return promoteOutfitToDefault(b, args[0], args[1]);
      case "moveOutfit": return moveOutfit(b, args[0], args[1], args[2]);
      case "resolveFormOutfit": return resolveFormOutfit(b, args[0], args[1]);
      case "resolveFormOutfitByOutfit": return resolveFormOutfitByOutfit(b, args[0], args[1]);
      case "isFormTargetCurrent": return isFormTargetCurrent(b, args[0]);
    }
    throw new Error(name);
  };
  for (const [i, c] of (P.formOps.ops as AnyRec[]).entries()) test(`op ${i} ${c.name}`, () => expect(JSON.parse(JSON.stringify(run(c.name, c.args)))).toEqual(c.output));
  for (const [i, c] of P.outfitEmpty.entries()) test(`outfit empty ${i}`, () => {
    expect(isOutfitEmpty(c.input)).toBe(c.empty);
    expect(isOutfitCandidate(c.input)).toBe(c.candidate);
  });
  test("compact for storage round-trips through normalize", () => {
    const c = normalizeFormCollection({ forms: [{ id: "form_default", outfits: [{ label: "A", top: "x", decisionReason: "r", referenceAnalysisEnabled: true, keywords: [] }], reference: { enabled: true, referenceAnalysisEnabled: true } }] });
    const compact = compactFormCollectionForStorage(c) as AnyRec;
    expect(compact.forms[0].outfits[0]).not.toHaveProperty("decisionReason");
    expect(compact.forms[0].outfits[0]).not.toHaveProperty("head");
    expect(compact.forms[0].reference).toEqual({ enabled: true });
    const back = normalizeFormCollection(compact);
    expect(back.forms[0]!.outfits[0]!.top).toBe("x");
  });
});

describe("custom characters parity (wTe / _x / gD)", () => {
  for (const [i, c] of P.customCharacters.entries()) test(`wTe ${i}`, () => expect(parseCustomCharacter(c.input)).toEqual(c.output));
  for (const [i, c] of P.splitKeys.entries()) test(`_x ${i}`, () => expect(splitRecognitionKeys(c.input)).toEqual(c.output));
  for (const [i, c] of P.gD.entries()) test(`gD ${i}`, () => expect(validateCustomCharacterInput(c.input).map((e) => ({ field: e.field, message: e.messageKo }))).toEqual(c.output));
  test("create / update / promote / roster", () => {
    expect(() => createCustomCharacter({ title: "", recognitionKeys: "a" })).toThrow("Enter a character name.");
    const c = createCustomCharacter({ title: " Ann ", recognitionKeys: "ann, a" });
    expect(c.id).toMatch(/^character_[0-9a-f-]{36}$/);
    const u = updateCustomCharacter({ ...c, origin: "ai-auto", workspaceEnabled: false }, { title: "Ann2", recognitionKeys: ["x"] });
    expect(u).toMatchObject({ title: "Ann2", recognitionKeys: ["x"], origin: "ai-auto", workspaceEnabled: false });
    expect(promoteCustomCharacter(u)).not.toHaveProperty("origin");
    expect(customCharacterRosterState(u)).toEqual({ registered: true, workspaceEnabled: false });
    expect(findDuplicateRecognitionKeys([c], "a, z")).toEqual(["a"]);
    expect(findDuplicateRecognitionKeys([c], "a", c.id)).toEqual([]);
  });
});

describe("recognition keys / artists / assets parity", () => {
  for (const [i, c] of P.loreKeys.entries()) test(`kP/vw ${i}`, () => {
    expect(parseCustomLorebookKeys(c.value)).toEqual(c.parsed);
    expect(effectiveRecognitionKeys(c.base, c.value, ["Title"])).toEqual(c.effective);
  });
  for (const [i, c] of P.Ja.entries()) test(`Ja ${i}`, () => expect(normalizeNovelAIArtistOverrides(c.input) ?? null).toEqual(c.output));
  for (const [i, c] of P.Aa.entries()) test(`Aa ${i}`, () => expect(normalizeNonArtistPromptWeight(c.input) ?? null).toEqual(c.output));
  for (const [i, c] of P.Mu.entries()) test(`Mu ${i}`, () => expect(normalizeWeightedPromptSpacing(c.input)).toBe(c.output));
  test("FP", () => expect(listNovelAIArtists(P.FP.artistPrompts)).toEqual(P.FP.output));
  for (const [i, c] of P.assetRefs.entries()) test(`pn ${i}`, () => {
    expect(normalizeAssetRef(c.input)).toEqual(c.output);
    expect(assetIdentity(c.input)).toBe(c.identity);
  });
  test("Ai", () => expect(dedupeAssetRefs([["a", "k1", "png"], ["b", "k1", "png"], ["c", ""], { name: "d", key: "k2" }, { name: "d", key: "k2" }])).toEqual(P.Ai));
});

describe("character document", () => {
  test("empty document round-trips", () => {
    const doc = createEmptyCharacterDocument("c1", new Date(0));
    const { value, issues } = normalizeCharacterDocument(JSON.parse(JSON.stringify(doc)), "c1");
    expect(issues).toEqual([]);
    expect(value).toEqual(doc);
    expect(value.characterPrompt.selectedArtistId).toBe("detail_anime_illustration_style");
    expect(value.characterPrompt.outfitPartFramingWeights.feet["full body"]).toBe(1);
  });
  test("normalizes maps, drops invalid custom characters, idempotent", () => {
    const raw = {
      schema: "inlay-illustrator.character",
      version: 1,
      characterId: "c1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      animaArtistId: "  ",
      characterPrompt: {
        selectedLorebooks: { c1: ["w:e", "w:e", ""], bad: "x" },
        characterForms: { "c1::lore::w:e": { forms: [{ label: "A", gender: "male" }] } },
        lorebookPromptGenders: { k: "weird" },
        seedSettings: { k: { seed: 5, fixed: "yes" } },
        customLorebookKeys: { k: "a, b", r: { version: 1, mode: "replace", keys: ["x"] } },
        outfitPartFramingWeights: { head: { portrait: 0.5 } },
        charxSettings: { overrides: { c1: { negativePrompt: "n", revisionByField: { negativePrompt: 1 } } } },
      },
      customCharacters: [{ id: "character_1", title: "A", recognitionKeys: ["a"] }, { id: "character_1", title: "B", recognitionKeys: ["b"] }, { id: "nope" }],
    };
    const { value, issues } = normalizeCharacterDocument(raw, "c1");
    expect(issues.map((i) => i.code)).toEqual(["duplicate-custom-character", "invalid-custom-character"]);
    expect(value.characterPrompt.selectedLorebooks).toEqual({ c1: ["w:e"] });
    expect(value.characterPrompt.lorebookPromptGenders.k).toBe("female");
    expect(value.characterPrompt.seedSettings.k).toEqual({ seed: "5", fixed: false });
    expect(value.characterPrompt.customLorebookKeys).toEqual({ k: ["a", "b"], r: { version: 1, mode: "replace", keys: ["x"] } });
    expect(value.characterPrompt.outfitPartFramingWeights.head.portrait).toBe(0.5);
    const fc = value.characterPrompt.characterForms["c1::lore::w:e"]!;
    expect(fc.defaultFormId).toBe(fc.forms[0]!.id);
    expect(fc.forms[0]!.gender).toBe("male");
    expect(value.animaArtistId).toBeNull();
    expect(normalizeCharacterDocument(JSON.parse(JSON.stringify(value)), "c1").value).toEqual(value);
  });
  test("removePromptKeyData strips one key", () => {
    const doc = createEmptyCharacterDocument("c1");
    doc.characterPrompt.lorebookPrompts = { a: "x", b: "y" };
    doc.characterPrompt.seedSettings = { a: { seed: "1", fixed: true } };
    const cp = removePromptKeyData(doc.characterPrompt, "a");
    expect(cp.lorebookPrompts).toEqual({ b: "y" });
    expect(cp.seedSettings).toEqual({});
  });
  test("persona forms fall back to legacy fields", () => {
    const forms = resolvePersonaForms({ selectedPersonaKey: "", profiles: { p: { mainPrompt: "kazehaya shouta" } }, sourceScopes: {} }, "male", "p");
    expect(forms.forms[0]!.gender).toBe("male");
    expect(forms.forms[0]!.basePromptGroups.custom).toEqual(["kazehaya shouta"]);
  });
  test("tag table expands 929 rows", () => {
    expect(FILENAME_TAG_TABLE.length).toBe(929);
    expect(FILENAME_TAG_TABLE.find((r) => r.tag === "angry")?.aliases).toContain("분노");
  });
});
