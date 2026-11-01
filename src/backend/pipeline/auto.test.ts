import { describe, expect, test } from "bun:test";
import { createFakeServices } from "../testing/fake-services.js";
import { CREATE_PROFILE_ERRORS, customCharacterStore, openAutoGeneration, type AutoGeneration } from "./auto.js";
import { createPipelineModule } from "./index.js";
import { CHARACTER_ID, CHAT_ID, createFakeEngine, createPipelineFixture, finished, waitFor } from "./testing/fixtures.js";
import type { BackendModules } from "../rpc/types.js";

describe("free generation stores", () => {
  test("outfit images come from the analysis module when it exposes an AM generator", async () => {
    const fx = createFakeServices();
    const without = await openAutoGeneration(fx.services, undefined, "char-1");
    expect(without.imagesAvailable).toBe(false);
    const generator = { generate: async () => ({}), save: async () => ({}) };
    const modules = { analysis: { outfitImages: { amGenerator: (id: string) => (id === "char-1" ? generator : null) } } } as unknown as BackendModules;
    const withGen = await openAutoGeneration(fx.services, () => modules, "char-1");
    expect(withGen.imagesAvailable).toBe(true);
    expect(typeof withGen.autoOutfit.prepareActors).toBe("function");
    expect(typeof withGen.autoCharacter.prepare).toBe("function");
    withGen.dispose();
    without.dispose();
  });

  test("overlapping runs of one character share free outfits: a second 'Swimsuit' gets its own id", async () => {
    const fx = createFakeServices();
    const form = { id: "form_default", label: "Default", gender: "female", humanlike: true, outfits: [] };
    await fx.services.storage.updateCharacterDocument("char-1", (d) => ({ ...d, characterPrompt: { ...d.characterPrompt, characterForms: { "char-1": { defaultFormId: "form_default", forms: [form] } } as never } }));
    const source = { id: "char-1", members: [{ key: "char-1", name: "Alice", characterTarget: { chaId: "char-1" }, characterIndex: 0, lorebooks: [] }] };
    const propose = (run: AutoGeneration, requestKey: string, top: string) =>
      run.autoOutfit.prepareActors({
        actors: [{ requestKey, kind: "lorebook", identityKey: "char-1", formId: "form_default", selectedOutfitId: "", proposal: { name: "Swimsuit", top, reason: "beach", confidence: 0.9 } }],
        source,
        sourceId: "char-1",
        creationMode: "tags-only",
      });
    const run1 = await openAutoGeneration(fx.services, undefined, "char-1");
    const run2 = await openAutoGeneration(fx.services, undefined, "char-1");
    expect((await propose(run1, "a", "red bikini")).selectedOutfitIds.a).toBe("swimsuit");
    expect((await propose(run2, "b", "white one-piece")).selectedOutfitIds.b).toBe("swimsuit_2");
    const outfits = fx.documents.get("char-1")!.characterPrompt.characterForms["char-1"]!.forms[0]!.outfits;
    expect(outfits.filter((o) => o.top).map((o) => [o.id, o.top])).toEqual([["swimsuit", "red bikini"], ["swimsuit_2", "white one-piece"]]);
    run1.dispose();
    run2.dispose();
  });

  test("a chat run that fails before the engine still releases the character's shared stores", async () => {
    const fx = createPipelineFixture();
    fx.services.sources.listPersonas = async () => {
      throw new Error("Personas are unavailable.");
    };
    const { pipeline } = createPipelineModule(fx.services, undefined, { engine: createFakeEngine() });
    const held = await openAutoGeneration(fx.services, undefined, CHARACTER_ID);
    await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
    await waitFor(() => finished(fx).length > 0);
    held.dispose();
    // No run holds the stores any more, so the next run starts fresh controllers.
    const next = await openAutoGeneration(fx.services, undefined, CHARACTER_ID);
    expect(next.autoOutfit).not.toBe(held.autoOutfit);
    next.dispose();
  });
});

describe("free character profiles (AM 0.9.90 createProfiles, B4)", () => {
  const form = { id: "form_default", label: "Default", gender: "female", humanlike: true, outfits: [] };
  const profile = (id: string, title = "Mira") => ({
    entry: { id, title, recognitionKeys: [title], appearanceDescription: "", origin: "ai-auto" as const },
    forms: { defaultFormId: "form_default", forms: [form] },
  });
  const setup = async () => {
    const fx = createFakeServices();
    const mira = { id: "character_roster", title: "Mira", recognitionKeys: ["Mira"], appearanceDescription: "" };
    await fx.services.storage.updateCharacterDocument("char-1", (d) => ({ ...d, customCharacters: [mira] }));
    const store = customCharacterStore(fx.services, "char-1");
    return { fx, store, ids: () => fx.documents.get("char-1")!.customCharacters.map((c) => c.id) };
  };

  test("a free character with the name of an existing roster character is saved as its own entry", async () => {
    const { fx, store, ids } = await setup();
    const saved = await store.createProfiles("char-1", [profile("character_free")], () => {}, {});
    expect(saved.map((p) => p.entry.id)).toEqual(["character_free"]);
    expect(ids()).toEqual(["character_roster", "character_free"]);
    expect(fx.documents.get("char-1")!.customCharacters.map((c) => c.title)).toEqual(["Mira", "Mira"]);
    expect(fx.documents.get("char-1")!.characterPrompt.characterForms.character_free).toBeDefined();
  });

  test("a retry by the same owner reuses its own save instead of adding a second entry", async () => {
    const { store, ids } = await setup();
    const owner = {};
    await store.createProfiles("char-1", [profile("character_free")], () => {}, owner);
    const again = await store.createProfiles("char-1", [profile("character_free")], () => {}, owner);
    expect(again.map((p) => p.entry.id)).toEqual(["character_free"]);
    expect(ids()).toEqual(["character_roster", "character_free"]);
  });

  test("an unconfirmed save (the write landed but its reply was lost) is recognized by its signature on retry", async () => {
    const { fx, store, ids } = await setup();
    const owner = {};
    const storage = fx.services.storage;
    const write = storage.updateCharacterDocument.bind(storage);
    storage.updateCharacterDocument = (async (...args: Parameters<typeof write>) => {
      await write(...args);
      throw new Error("lost reply");
    }) as typeof write;
    await expect(store.createProfiles("char-1", [profile("character_free")], () => {}, owner)).rejects.toThrow("lost reply");
    storage.updateCharacterDocument = write;
    expect(ids()).toEqual(["character_roster", "character_free"]);
    // Same owner: the unconfirmed attempt's signature matches the stored entry and forms, so nothing is added.
    expect((await store.createProfiles("char-1", [profile("character_free")], () => {}, owner)).map((p) => p.entry.id)).toEqual(["character_free"]);
    expect(ids()).toEqual(["character_roster", "character_free"]);
  });

  test("an unconfirmed save whose stored entry changed since is a collision, not a reuse", async () => {
    const { fx, store } = await setup();
    const owner = {};
    const storage = fx.services.storage;
    const write = storage.updateCharacterDocument.bind(storage);
    storage.updateCharacterDocument = (async (...args: Parameters<typeof write>) => {
      await write(...args);
      throw new Error("lost reply");
    }) as typeof write;
    await expect(store.createProfiles("char-1", [profile("character_free")], () => {}, owner)).rejects.toThrow("lost reply");
    storage.updateCharacterDocument = write;
    await write("char-1", (d) => ({ ...d, customCharacters: d.customCharacters.map((c) => (c.id === "character_free" ? { ...c, title: "Renamed" } : c)) }));
    await expect(store.createProfiles("char-1", [profile("character_free")], () => {}, owner)).rejects.toThrow(CREATE_PROFILE_ERRORS.idCollision.en);
  });

  test("an id that belongs to an entry this owner did not create stops the save", async () => {
    const { store, ids } = await setup();
    await expect(store.createProfiles("char-1", [profile("character_roster")], () => {}, {})).rejects.toThrow(CREATE_PROFILE_ERRORS.idCollision.en);
    // Another owner cannot claim this owner's save either.
    await store.createProfiles("char-1", [profile("character_free")], () => {}, {});
    await expect(store.createProfiles("char-1", [profile("character_free")], () => {}, {})).rejects.toThrow(CREATE_PROFILE_ERRORS.idCollision.en);
    expect(ids()).toEqual(["character_roster", "character_free"]);
  });

  test("a confirmed save the user deleted is not saved again on retry", async () => {
    const { fx, store, ids } = await setup();
    const owner = {};
    await store.createProfiles("char-1", [profile("character_free")], () => {}, owner);
    await fx.services.storage.updateCharacterDocument("char-1", (d) => ({ ...d, customCharacters: d.customCharacters.filter((c) => c.id !== "character_free") }));
    const error = await store.createProfiles("char-1", [profile("character_free")], () => {}, owner).catch((e: Error & { messageKo?: string }) => e);
    expect((error as Error).message).toBe(CREATE_PROFILE_ERRORS.deleted.en);
    expect((error as { messageKo?: string }).messageKo).toBe(CREATE_PROFILE_ERRORS.deleted.ko);
    expect(ids()).toEqual(["character_roster"]);
  });
});
