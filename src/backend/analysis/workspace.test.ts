import { describe, expect, test } from "bun:test";
import { formCollectionRevision, normalizeFormCollection } from "../../shared/contract/index.js";
import { RpcFailure } from "../rpc/errors.js";
import {
  applyUniqueTags,
  createCustomCharacterEntry,
  loadWorkspaceSnapshot,
  promoteCustomCharacters,
  removeCustomCharacterEntry,
  saveForms,
  setAnalyzeEnabled,
  setCustomCharactersWorkspaceEnabled,
  setRecognitionKeys,
  setRosterActive,
  setRosterRegistered,
  setSeed,
  setSourceConnected,
} from "./workspace.js";
import { ALICE, BOB, CHAR, HERO, createAnalysisFixture } from "./testing/fixtures.js";

async function snapshot(fx: ReturnType<typeof createAnalysisFixture>) {
  return loadWorkspaceSnapshot(fx.services, CHAR);
}

describe("workspace projection", () => {
  test("lore, description and custom rows with roster state", async () => {
    const fx = createAnalysisFixture();
    await setRosterRegistered(fx.services, CHAR, [{ memberKey: CHAR, selectionId: "wb1:e1" }, { memberKey: CHAR, selectionId: "wb1:e2" }], true);
    await setRosterActive(fx.services, CHAR, [{ memberKey: CHAR, selectionId: "wb1:e2" }], false);
    const custom = await createCustomCharacterEntry(fx.services, CHAR, { title: "Carol", recognitionKeys: "carol, cc" });
    const s = await snapshot(fx);
    expect(s.characterName).toBe("Hero");
    const byKey = Object.fromEntries(s.roster.map((r) => [r.promptKey, r]));
    expect(byKey[ALICE]).toMatchObject({ kind: "lore", registered: true, workspaceEnabled: true, worldBookId: "wb1", entryId: "e1", recognitionKeys: ["alice"], analyzeEnabled: true, mainPrompt: "" });
    expect(byKey[BOB]).toMatchObject({ registered: true, workspaceEnabled: false });
    expect(byKey[HERO]).toMatchObject({ kind: "description", registered: false, workspaceEnabled: false });
    expect(byKey[custom.id]).toMatchObject({ kind: "custom", memberKey: `virtual-character:${custom.id}`, registered: true, workspaceEnabled: true, recognitionKeys: ["carol", "cc"] });
    expect(s.sources.map((x) => x.worldBookId)).toEqual(["wb1", "wb2"]);
    expect(s.charxSettings).toBeTruthy();
  });

  test("thumbnail = first selected asset, else best filename candidate", async () => {
    const fx = createAnalysisFixture();
    await setRosterRegistered(fx.services, CHAR, [{ memberKey: CHAR, selectionId: "wb1:e1" }, { memberKey: CHAR, selectionId: "wb1:e2" }], true);
    let s = await snapshot(fx);
    const alice = s.roster.find((r) => r.promptKey === ALICE)!;
    expect(alice.thumbnailUrl).toMatch(/alice_/);
    expect(s.roster.find((r) => r.promptKey === BOB)!.thumbnailUrl).toBe("/thumb/img-bob_default.png");
    await fx.services.storage.updateCharacterDocument(CHAR, (d) => ({ ...d, characterPrompt: { ...d.characterPrompt, assetSelections: { [ALICE]: { selectedAssetNames: ["scenery.png"], selectedAssets: [{ name: "scenery.png", key: "img-scenery.png", ext: "png" }] } } } }));
    s = await snapshot(fx);
    expect(s.roster.find((r) => r.promptKey === ALICE)).toMatchObject({ thumbnailUrl: "/thumb/img-scenery.png", selectedAssetCount: 1 });
  });

  test("main prompt and analyze flag come from the document", async () => {
    const fx = createAnalysisFixture();
    const collection = normalizeFormCollection({ forms: [{ id: "form_default", label: "기본", gender: "female", basePromptGroups: { "hair.color": ["red hair"], "eyes.color": ["green eyes"] } }] });
    await saveForms(fx.services, CHAR, ALICE, collection, formCollectionRevision((await snapshot(fx)).roster && normalizeFormCollection({})));
    await setAnalyzeEnabled(fx.services, CHAR, [ALICE], false);
    const row = (await snapshot(fx)).roster.find((r) => r.promptKey === ALICE)!;
    expect(row.mainPrompt).toBe("red hair, green eyes");
    expect(row.analyzeEnabled).toBe(false);
  });
});

describe("roster writes", () => {
  test("unregister clears the inactive mark", async () => {
    const fx = createAnalysisFixture();
    const item = { memberKey: CHAR, selectionId: "wb1:e1" };
    await setRosterRegistered(fx.services, CHAR, [item], true);
    await setRosterActive(fx.services, CHAR, [item], false);
    expect(fx.documents.get(CHAR)!.characterPrompt.workspaceDisabledLorebooks[CHAR]).toEqual(["wb1:e1"]);
    await setRosterRegistered(fx.services, CHAR, [item], false);
    const cp = fx.documents.get(CHAR)!.characterPrompt;
    expect(cp.selectedLorebooks[CHAR]).toEqual([]);
    expect(cp.workspaceDisabledLorebooks[CHAR]).toEqual([]);
  });

  test("source connect starts from the attached books", async () => {
    const fx = createAnalysisFixture();
    await setSourceConnected(fx.services, CHAR, "wb2", true);
    expect(fx.documents.get(CHAR)!.characterPrompt.activeModules[CHAR]).toEqual(["wb1", "wb2"]);
    await setSourceConnected(fx.services, CHAR, "wb1", false);
    expect(fx.documents.get(CHAR)!.characterPrompt.activeModules[CHAR]).toEqual(["wb2"]);
  });

  test("recognition keys: replace form and the classification profile is cleared (AM Ife)", async () => {
    const fx = createAnalysisFixture();
    await fx.services.storage.updateCharacterDocument(CHAR, (d) => ({
      ...d,
      characterPrompt: { ...d.characterPrompt, lorebookImageFilters: { [CHAR]: { status: "done", sourceId: CHAR, assetSignature: "s", promptSignatures: { [ALICE]: "x", [BOB]: "y" }, emptyPromptKeys: [ALICE], profiles: [{ promptKey: ALICE, identityAliases: ["al"], confidence: 1, inputSignature: "x" }, { promptKey: BOB, identityAliases: ["bo"], confidence: 1, inputSignature: "y" }] } } },
    }));
    await setRecognitionKeys(fx.services, CHAR, ALICE, ["Ally", "Alice"]);
    const cp = fx.documents.get(CHAR)!.characterPrompt;
    expect(cp.customLorebookKeys[ALICE]).toEqual({ version: 1, mode: "replace", keys: ["Ally", "Alice"] });
    expect(cp.lorebookImageFilters[CHAR]!.profiles.map((p) => p.promptKey)).toEqual([BOB]);
    expect(cp.lorebookImageFilters[CHAR]!.promptSignatures).toEqual({ [BOB]: "y" });
    expect(cp.lorebookImageFilters[CHAR]!.emptyPromptKeys).toEqual([]);
    const row = (await snapshot(fx)).roster.find((r) => r.promptKey === ALICE)!;
    expect(row.recognitionKeys).toEqual(["Ally", "Alice"]);
  });
});

describe("custom characters", () => {
  test("validation errors keep the Korean original", async () => {
    const fx = createAnalysisFixture();
    const error = await createCustomCharacterEntry(fx.services, CHAR, { title: " ", recognitionKeys: "a" }).catch((e) => e);
    expect(error).toBeInstanceOf(RpcFailure);
    expect((error as RpcFailure).error).toMatchObject({ code: "bad-request", messageKo: "캐릭터 이름을 입력해주세요." });
    const error2 = await createCustomCharacterEntry(fx.services, CHAR, { title: "A", recognitionKeys: "" }).catch((e) => e);
    expect((error2 as RpcFailure).error.messageKo).toBe("인식 키를 하나 이상 입력해주세요.");
  });

  test("revision guard on create", async () => {
    const fx = createAnalysisFixture();
    await createCustomCharacterEntry(fx.services, CHAR, { title: "A", recognitionKeys: "a" });
    const error = await createCustomCharacterEntry(fx.services, CHAR, { title: "B", recognitionKeys: "b" }, "1970-01-01T00:00:00.000Z").catch((e) => e);
    expect((error as RpcFailure).error.code).toBe("conflict");
  });

  test("remove strips per-key data; workspace toggle needs registration; promote drops ai-auto", async () => {
    const fx = createAnalysisFixture();
    const c = await createCustomCharacterEntry(fx.services, CHAR, { title: "Carol", recognitionKeys: "carol" });
    await setSeed(fx.services, CHAR, c.id, "123", true);
    await fx.services.storage.updateCharacterDocument(CHAR, (d) => ({ ...d, customCharacters: d.customCharacters.map((x) => ({ ...x, origin: "ai-auto" as const, rosterRegistered: false as const })) }));
    const err = await setCustomCharactersWorkspaceEnabled(fx.services, CHAR, [c.id], true).catch((e) => e);
    expect((err as RpcFailure).error.messageKo).toBe("로스터에 등록되지 않은 커스텀 캐릭터입니다.");
    await promoteCustomCharacters(fx.services, CHAR, "all");
    expect(fx.documents.get(CHAR)!.customCharacters[0]!.origin).toBeUndefined();
    expect(fx.documents.get(CHAR)!.characterPrompt.seedSettings[c.id]).toEqual({ seed: "123", fixed: true });
    await removeCustomCharacterEntry(fx.services, CHAR, c.id);
    const doc = fx.documents.get(CHAR)!;
    expect(doc.customCharacters).toEqual([]);
    expect(doc.characterPrompt.seedSettings[c.id]).toBeUndefined();
  });
});

describe("prompts tab", () => {
  test("saveForms guards the base revision and drops legacy maps", async () => {
    const fx = createAnalysisFixture();
    await fx.services.storage.updateCharacterDocument(CHAR, (d) => ({ ...d, characterPrompt: { ...d.characterPrompt, lorebookPrompts: { [ALICE]: "red hair" } } }));
    const base = (await loadWorkspaceSnapshot(fx.services, CHAR)).document;
    const { resolveCharacterForms } = await import("../../shared/contract/index.js");
    const current = resolveCharacterForms(base.characterPrompt, ALICE);
    const edited = { ...current, forms: current.forms.map((f) => ({ ...f, label: "Main" })) };
    const result = await saveForms(fx.services, CHAR, ALICE, edited, formCollectionRevision(current));
    expect(result.collection.forms[0]!.label).toBe("Main");
    expect(fx.documents.get(CHAR)!.characterPrompt.lorebookPrompts[ALICE]).toBeUndefined();
    const conflict = await saveForms(fx.services, CHAR, ALICE, edited, formCollectionRevision(current)).catch((e) => e);
    expect((conflict as RpcFailure).error).toMatchObject({ code: "conflict", detailCode: "FORM_COLLECTION_CHANGED" });
  });

  test("unique tag apply writes identity.character_tag", async () => {
    const fx = createAnalysisFixture();
    await applyUniqueTags(fx.services, CHAR, [{ promptKey: ALICE, formId: "form_default", tag: "alice_(wonderland)" }]);
    expect(fx.documents.get(CHAR)!.characterPrompt.characterForms[ALICE]!.forms[0]!.basePromptGroups["identity.character_tag"]).toEqual(["alice (wonderland)"]);
  });
});
