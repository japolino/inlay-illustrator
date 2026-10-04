import { describe, expect, test } from "bun:test";
import { createFakeServices } from "../testing/fake-services.js";
import { openAutoGeneration } from "./auto.js";
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
});
