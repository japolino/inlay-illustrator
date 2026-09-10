import { describe, expect, test } from "bun:test";
import {
  buildAppearanceReference,
  extractCharacterIdentityTags,
  loadV376Memory,
  parseMemoryEntryValue,
  saveV376Memory,
  serializeMemoryEntryValue,
  updateV376Memory,
  V376MemoryMap,
} from "./memory.js";
import { V376Character, V376Scene } from "./types.js";
import type { State } from "../types.js";

function makeState(characterAppearance: Record<string, string> = {}, manual: Record<string, string> = {}): State {
  return {
    characterAppearance,
    manualCharacterAppearance: manual,
  } as unknown as State;
}

describe("V3.7.6 character memory serialization & parsing", () => {
  test("parses 3-part, 2-part and legacy single tag entries", () => {
    const p3 = parseMemoryEntryValue("silver hair, blue dress|||lowres|||4");
    expect(p3.tags).toBe("silver hair, blue dress");
    expect(p3.negTags).toBe("lowres");
    expect(p3.depth).toBe(4);

    const p2 = parseMemoryEntryValue("golden armor|||2");
    expect(p2.tags).toBe("golden armor");
    expect(p2.negTags).toBe("");
    expect(p2.depth).toBe(2);

    const p1 = parseMemoryEntryValue("black coat", 5);
    expect(p1.tags).toBe("black coat");
    expect(p1.negTags).toBe("");
    expect(p1.depth).toBe(5);

    expect(serializeMemoryEntryValue(p3)).toBe("silver hair, blue dress|||lowres|||4");
  });

  test("extracts character identity tags excluding standalone gender words", () => {
    const char: V376Character = {
      name: "Hero",
      label: "tall knight",
      age: "20yo",
      appearance: "1boy, blonde hair, blue eyes, boy",
      attire: "steel armor",
    };
    const tags = extractCharacterIdentityTags(char);
    expect(tags).toContain("blonde hair");
    expect(tags).toContain("blue eyes");
    expect(tags).toContain("steel armor");
    // Standalone "1boy" and "boy" stripped from appearance
    expect(tags).not.toContain("1boy");
    expect(tags.split(", ").filter((t) => t === "boy").length).toBe(0);
  });
});

describe("V3.7.6 memory lifecycle & depth expiration", () => {
  test("depth decrements per turn and omits detailed tags at depth 0 while retaining name and record", () => {
    const memoryMap: V376MemoryMap = {
      Alice: { tags: "blonde hair, red dress", negTags: "", depth: 1 },
      Bob: { tags: "black hair, suit", negTags: "", depth: 0 },
    };

    // At depth 1 for Alice and depth 0 for Bob:
    const ref1 = buildAppearanceReference(memoryMap);
    expect(ref1).not.toBeNull();
    // Both Alice and Bob appear in the top list of Characters
    expect(ref1).toContain("Characters: Alice, Bob");
    // Alice has detailed tags because depth > 0
    expect(ref1).toContain("- Alice: blonde hair, red dress");
    // Bob's detailed tags are OMITTED because depth <= 0
    expect(ref1).not.toContain("- Bob: black hair, suit");

    // Now decrement Alice's depth (turn with no Alice)
    const state = makeState();
    saveV376Memory(state, memoryMap);

    const emptyScenes: V376Scene[] = [{ place: "Empty Room", shots: [] }];
    updateV376Memory(state, emptyScenes, { characterContextDepth: 5 });

    const updatedMap = loadV376Memory(state);
    // Alice's depth dropped from 1 to 0
    expect(updatedMap.Alice.depth).toBe(0);
    // Bob's depth stayed at 0
    expect(updatedMap.Bob.depth).toBe(0);

    // Records are RETAINED in storage (not deleted)
    expect(updatedMap.Alice).toBeDefined();
    expect(updatedMap.Bob).toBeDefined();

    // Now reference omits detailed tags for BOTH, but still lists their names
    const ref2 = buildAppearanceReference(updatedMap);
    expect(ref2).toContain("Characters: Alice, Bob");
    expect(ref2).not.toContain("- Alice:");
    expect(ref2).not.toContain("- Bob:");
  });

  test("returning character in current scenes resets depth to maxDepth and updates identity", () => {
    const state = makeState();
    const memoryMap: V376MemoryMap = {
      Alice: { tags: "blonde hair, casual dress", negTags: "", depth: 0 },
    };
    saveV376Memory(state, memoryMap);

    // Scene where Alice appears with an updated attire
    const scenes: V376Scene[] = [
      {
        place: "Ballroom",
        shots: [
          {
            paragraph: 1,
            characters: [
              {
                name: "Alice",
                label: "heroine",
                age: "18yo",
                appearance: "blonde hair, blue eyes",
                attire: "evening gown",
              },
            ],
          },
        ],
      },
    ];

    updateV376Memory(state, scenes, { characterContextDepth: 5 });
    const updated = loadV376Memory(state);

    expect(updated.Alice.depth).toBe(5);
    expect(updated.Alice.tags).toContain("evening gown");
    expect(updated.Alice.tags).toContain("blonde hair");
  });
});

describe("V3.7.6 manual character appearance preservation and migration", () => {
  test("preserves manual character appearance against automated updates while refreshing depth", () => {
    const state = makeState(
      { Alice: "custom manual tags, ruby brooch" },
      { Alice: "custom manual tags, ruby brooch" }
    );

    // Update with scenes containing conflicting tags for Alice
    const scenes: V376Scene[] = [
      {
        place: "Forest",
        shots: [
          {
            paragraph: 1,
            characters: [
              {
                name: "Alice",
                label: "girl",
                age: "18yo",
                appearance: "different tags that should not overwrite",
                attire: "leather jacket",
              },
            ],
          },
        ],
      },
    ];

    updateV376Memory(state, scenes, { characterContextDepth: 4 });
    const memory = loadV376Memory(state);

    // Manual tags must be preserved!
    expect(memory.Alice.tags).toBe("custom manual tags, ruby brooch");
    expect(memory.Alice.isManual).toBe(true);
    // But depth was refreshed to maxDepth
    expect(memory.Alice.depth).toBe(4);
  });

  test("migrates existing state.characterAppearance without dropping records", () => {
    const state = makeState({
      Eldrin: "white hair, staff, brown robe",
      Vesper: "black cloak, daggers",
    });

    const memory = loadV376Memory(state, 5);
    expect(memory.Eldrin.tags).toBe("white hair, staff, brown robe");
    expect(memory.Eldrin.depth).toBe(5);
    expect(memory.Vesper.tags).toBe("black cloak, daggers");
    expect(memory.Vesper.depth).toBe(5);

    // Synchronizes state.characterAppearance on save
    memory.Eldrin.depth = 3;
    saveV376Memory(state, memory);
    expect(state.characterAppearance.Eldrin).toBe("white hair, staff, brown robe");
  });
});

describe("V3.7.6 source memory expiration & shape preservation across turns", () => {
  test("preserves stored character data across multi-turn expiration down to 0 and recovers on reappearance", () => {
    const state = makeState();
    // Initial scene introduces Clara
    const introScene: V376Scene[] = [
      {
        place: "Library",
        shots: [
          {
            paragraph: 1,
            characters: [
              {
                name: "Clara",
                label: "scholar",
                age: "24yo",
                appearance: "long emerald hair, spectacles",
                attire: "scholar robe",
                negative: "blurry",
              },
            ],
          },
        ],
      },
    ];

    // Turn 1: Clara introduced, depth = 5
    const mem1 = updateV376Memory(state, introScene, { characterContextDepth: 5 });
    expect(mem1.Clara).toBeDefined();
    expect(mem1.Clara.depth).toBe(5);
    expect(mem1.Clara.tags).toContain("long emerald hair");
    // Per Lua lines 783-785: dynamic scene shot negative tags never overwrite persistent negTags
    expect(mem1.Clara.negTags).toBe("");

    // Turns 2 through 6: Empty scenes (Clara does not appear)
    const emptyScene: V376Scene[] = [{ place: "Empty Courtyard", shots: [] }];
    for (let turn = 2; turn <= 6; turn++) {
      updateV376Memory(state, emptyScene, { characterContextDepth: 5 });
    }

    // After 5 silent turns (turns 2, 3, 4, 5, 6), depth should be 0
    const memExpired = loadV376Memory(state);
    expect(memExpired.Clara).toBeDefined();
    expect(memExpired.Clara.depth).toBe(0);
    // Stored data is retained in state.characterAppearance and v376CharacterMemory!
    expect(state.characterAppearance.Clara).toContain("long emerald hair");

    // Prompt context omits detailed tags at depth 0, but retains Clara in name list
    const refExpired = buildAppearanceReference(memExpired);
    expect(refExpired).toContain("Characters: Clara");
    expect(refExpired).not.toContain("- Clara:");

    // Turn 7: Clara reappears! Depth resets to 5, tags refreshed
    const reappearScene: V376Scene[] = [
      {
        place: "Observatory",
        shots: [
          {
            paragraph: 1,
            characters: [
              {
                name: "Clara",
                label: "scholar",
                age: "24yo",
                appearance: "long emerald hair, spectacles",
                attire: "stargazer cloak",
              },
            ],
          },
        ],
      },
    ];

    const memRecovered = updateV376Memory(state, reappearScene, { characterContextDepth: 5 });
    expect(memRecovered.Clara.depth).toBe(5);
    expect(memRecovered.Clara.tags).toContain("stargazer cloak");
    // Detailed tags now reappear in reference context
    const refRecovered = buildAppearanceReference(memRecovered);
    expect(refRecovered).toContain("Characters: Clara");
    expect(refRecovered).toContain("- Clara: ");
  });

  test("returns expected V376MemoryMap shape with tags, negTags, depth, and preserves existing entries", () => {
    const state = makeState({
      ExistingHero: "short brown hair, sword",
    });

    const newScene: V376Scene[] = [
      {
        place: "Tavern",
        shots: [
          {
            paragraph: 1,
            characters: [
              {
                name: "NewMage",
                label: "mage",
                age: "22yo",
                appearance: "purple hair, staff",
                attire: "wizard robe",
                negative: "bad anatomy",
              },
            ],
          },
        ],
      },
    ];

    const resultMap = updateV376Memory(state, newScene, { characterContextDepth: 5 });

    // Result must have both NewMage and ExistingHero
    expect(resultMap.NewMage).toBeDefined();
    expect(typeof resultMap.NewMage.tags).toBe("string");
    expect(typeof resultMap.NewMage.negTags).toBe("string");
    expect(typeof resultMap.NewMage.depth).toBe("number");
    expect(resultMap.NewMage.depth).toBe(5);
    // Dynamic shot negatives never populate persistent negTags
    expect(resultMap.NewMage.negTags).toBe("");

    expect(resultMap.ExistingHero).toBeDefined();
    expect(resultMap.ExistingHero.tags).toBe("short brown hair, sword");
    expect(resultMap.ExistingHero.depth).toBe(4); // Decremented from 5 to 4
  });
});

