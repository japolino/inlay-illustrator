/**
 * Three-way merge of config saves (AM 0.9.90 `Bs`, was `Mc` before the re-slice): B2 (old data missing selection
 * fields) and B3 (default outfit added to a collection without outfits).
 */
import { describe, expect, test } from "bun:test";
import { amFn } from "../core/index.js";
import { ALICE, CHAR, createAnalysisFixture } from "../testing/fixtures.js";
import { AmConfigStore, buildAmConfig, loadAmConfigParts, persistAmConfigChange } from "./config-store.js";

const itemId = (value: unknown) => (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" ? (value as { id: string }).id : undefined);
const merge = (before: unknown, after: unknown, stored: unknown) => amFn("Bs")(before, after, stored, itemId) as Record<string, unknown>;

/** Keys whose value is `undefined`, at any depth. */
function undefinedKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => undefinedKeys(v, `${path}[${i}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => (v === undefined ? [`${path}.${k}`] : undefinedKeys(v, `${path}.${k}`)));
}

describe("B2: saving over old data that lacks the normalized selection fields", () => {
  test("the merge applies the edit, keeps stored-only keys and writes no undefined keys", () => {
    const before = { label: "Default", outfits: [{ id: "o1", top: "a" }] };
    const after = { label: "Default", outfits: [{ id: "o1", top: "b", candidateEnabled: true }] };
    const stored = { outfits: [{ id: "o1", top: "a" }], extra: 1 };
    const merged = merge(before, after, stored);
    expect(merged).toEqual({ outfits: [{ id: "o1", top: "b", candidateEnabled: true }], extra: 1 });
    expect(undefinedKeys(merged)).toEqual([]);
    // `label` is equal in base and mine and absent in stored: it stays absent rather than becoming an explicit undefined.
    expect(Object.keys(merged)).not.toContain("label");
  });

  test("an outfit edit is saved over a stored collection written before the selection fields existed", async () => {
    const fx = createAnalysisFixture();
    // Raw stored data (bypassing the storage normalization): no description / candidateEnabled / empty parts.
    const old = { defaultFormId: "form_default", forms: [{ id: "form_default", label: "Default", gender: "female", humanlike: true, outfits: [{ id: "o1", label: "Casual", top: "shirt" }] }] };
    await fx.services.storage.updateCharacterDocument(CHAR, (d) => d);
    (fx.documents.get(CHAR)!.characterPrompt as { characterForms: unknown }).characterForms = { [ALICE]: structuredClone(old) };
    const before = buildAmConfig(await loadAmConfigParts(fx.services, CHAR));
    const after = structuredClone(before);
    const forms = after.characterPrompt.characterForms[ALICE];
    forms.forms[0].outfits[0].top = "hoodie";
    const { document } = await persistAmConfigChange(fx.services, CHAR, before, after);
    const saved = (document!.characterPrompt.characterForms as Record<string, typeof old>)[ALICE]!;
    expect(saved.forms[0]!.outfits[0]!.top).toBe("hoodie");
    expect(saved.forms[0]!.outfits[0]!.label).toBe("Casual");
    expect(undefinedKeys(saved)).toEqual([]);
  });
});

describe("B3: analysis result adding the default outfit to a character without outfits", () => {
  test("the outfit is saved, nothing else is touched", async () => {
    const fx = createAnalysisFixture();
    const empty = { defaultFormId: "form_default", forms: [{ id: "form_default", label: "Default", gender: "female", humanlike: true, outfits: [] as unknown[] }] };
    await fx.services.storage.updateCharacterDocument(CHAR, (d) => d);
    (fx.documents.get(CHAR)!.characterPrompt as { characterForms: unknown }).characterForms = { [ALICE]: structuredClone(empty) };
    const before = buildAmConfig(await loadAmConfigParts(fx.services, CHAR));
    const after = structuredClone(before);
    const outfit = { id: "outfit_default", label: "Default", description: "", candidateEnabled: true, head: "", top: "school uniform", bottom: "", legs: "", feet: "" };
    after.characterPrompt.characterForms[ALICE].forms[0].outfits = [outfit];
    after.characterPrompt.characterForms[ALICE].forms[0].defaultOutfitId = "outfit_default";
    const { document } = await persistAmConfigChange(fx.services, CHAR, before, after);
    const saved = (document!.characterPrompt.characterForms as Record<string, typeof empty>)[ALICE]!;
    expect(saved.forms[0]!.outfits).toEqual([outfit]);
    expect((saved.forms[0] as { defaultOutfitId?: string }).defaultOutfitId).toBe("outfit_default");
    expect(saved.forms[0]!.label).toBe("Default");
    expect(undefinedKeys(saved)).toEqual([]);
  });

  test("the merge of an empty base with an added default outfit keeps sibling keys as stored", () => {
    const merged = merge({ outfits: [] }, { outfits: [{ id: "outfit_default", top: "t" }] }, { outfits: [], note: "kept" });
    expect(merged).toEqual({ outfits: [{ id: "outfit_default", top: "t" }], note: "kept" });
    expect(merge(undefined, { outfits: [{ id: "outfit_default" }] }, { other: 1 })).toEqual({ outfits: [{ id: "outfit_default" }], other: 1 });
  });
});

describe("AmConfigStore persistence snapshot", () => {
  test("pending while an update is being saved, then false; listeners hear the end", async () => {
    const fx = createAnalysisFixture();
    const store = await AmConfigStore.open(fx.services, CHAR);
    let heard = 0;
    store.subscribePersistence(() => (heard += 1));
    expect(store.getPersistenceSnapshot().pending).toBe(false);
    store.update((c) => ({ ...c, characterPrompt: { ...c.characterPrompt, selectedCharacters: ["x"] } }), { domains: ["prompts"] });
    expect(store.getPersistenceSnapshot().pending).toBe(true);
    await store.flushSave();
    expect(store.getPersistenceSnapshot()).toEqual({ error: "", pending: false });
    expect(heard).toBe(1);
  });
});
