import { describe, expect, test } from "bun:test";
import { createFakeServices } from "../testing/fake-services.js";
import { openAutoGeneration, type AutoGeneration } from "./auto.js";
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
