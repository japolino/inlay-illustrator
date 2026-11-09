import { describe, expect, test } from "bun:test";
import { normalizeCharacterDocument, type CharacterDocument } from "../../shared/contract/index.js";
import { sharedCharacterChannel, sharedCharacterValue, shareCharacters } from "./shared-characters.js";
import type { WorldBookInfo } from "./types.js";

const ID = "0c4fd7e2-3b1a-4e6f-9a52-7d1e8b6c4a10";
const CORVIN = "character_7f3fec4e-47e7-414d-9821-e9fd6344034f";
const LORE = `${ID}::lore::book1:entry1`;
const DESC = `${ID}::lore::asset-maid:charx-description:v1`;

function form(label: string, groups: Record<string, string[]>, extra: Record<string, unknown> = {}) {
  return { defaultFormId: "form_default", forms: [{ id: "form_default", label, description: "", humanlike: true, gender: "male", basePromptGroups: groups, negativePrompt: "", reference: null, defaultOutfitId: "", outfits: [], ...extra }] };
}

function doc(): CharacterDocument {
  return normalizeCharacterDocument(
    {
      schema: "inlay-illustrator.character",
      version: 2,
      characterId: ID,
      updatedAt: "2026-11-06T16:23:31.100Z",
      characterPrompt: {
        characterForms: {
          [CORVIN]: form("Tall Grey Owl Knight", { "identity.character_tag": ["corvin (original)"], "eyes.color": ["red eyes"] }, {
            reference: { enabled: true, defaultAsset: { name: "robe", key: "img-robe", ext: "png", sourceType: "generated", moduleId: "", moduleName: "" } },
            defaultOutfitId: "robe",
            outfits: [
              { id: "robe", label: "Dark Red Robe", description: "", candidateEnabled: true, head: "small floating golden crown", top: "dark red silk robe", bottom: "", legs: "", feet: "", referenceAsset: { name: "robe", key: "img-robe", ext: "png", sourceType: "generated", moduleId: "", moduleName: "" } },
              { id: "coat", label: "Tailcoat", description: "", candidateEnabled: true, head: "", top: "dark purple tailcoat", bottom: "", legs: "", feet: "", referenceAsset: { name: "c", key: "storage:uploads/c.png", ext: "png", sourceType: "upload", moduleId: "", moduleName: "" } },
            ],
          }),
          [LORE]: form("Swan Lady", { "hair.color": ["white hair"] }),
          [DESC]: form("Card Lead", { "eyes.color": ["gold eyes"] }),
          "persona::p1": form("Me", { "eyes.color": ["blue eyes"] }),
          [`${ID}::lore::book1:missing`]: form("Ghost", { "eyes.color": ["grey eyes"] }),
        },
      },
      customCharacters: [{ id: CORVIN, title: "Corvin", recognitionKeys: ["Corvin", "Lord Corvin"], appearanceDescription: "", origin: "ai-auto" }],
    },
    ID,
  ).value;
}

const books: WorldBookInfo[] = [
  { worldBookId: "book1", name: "Manor", scope: "character", entries: [{ worldBookId: "book1", entryId: "entry1", comment: "Wren", keys: ["Wren", "Wren Ashby"], secondaryKeys: [], content: "", disabled: false, constant: false, selective: false, useRegex: false, order: 0 }] },
];

describe("shared character library", () => {
  test("one channel per user and character", () => {
    expect(sharedCharacterChannel(undefined, ID)).toBe(`characters.owner.${ID}`);
    expect(sharedCharacterChannel("U1", ID.toUpperCase())).toBe(`characters.u1.${ID}`);
    expect(sharedCharacterChannel("u1", "bad id")).toBeNull();
  });

  test("members carry names, aliases, compiled tags, outfits and shareable reference ids", () => {
    const value = sharedCharacterValue(doc(), { characterName: "Owl Manor", books });
    expect(value.members.map((m) => [m.kind, m.name])).toEqual([
      ["custom", "Corvin"],
      ["lore", "Wren"],
      ["description", "Owl Manor"],
    ]);
    const corvin = value.members[0]!;
    expect(corvin.aliases).toEqual(["Lord Corvin"]);
    const f = corvin.forms[0]!;
    expect(f.tags).toContain("corvin (original)");
    expect(f.tags).toContain("red eyes");
    expect(f.referenceImageId).toBe("img-robe");
    expect(f.defaultOutfitId).toBe("robe");
    expect(f.outfits).toEqual([
      { id: "robe", label: "Dark Red Robe", tags: "small floating golden crown, dark red silk robe", referenceImageId: "img-robe" },
      { id: "coat", label: "Tailcoat", tags: "dark purple tailcoat", referenceImageId: null },
    ]);
    expect(value.members[1]!.aliases).toEqual(["Wren Ashby"]);
  });

  test("registers stored documents and new ones once, gated on characters and images", async () => {
    const handlers = new Map<string, { handler: () => unknown; policy: unknown }>();
    const host = { rpcPool: { sync: () => "", read: async () => undefined, unregister: () => {}, handle: (e: string, h: () => unknown, p?: unknown) => { handlers.set(e, { handler: h, policy: p }); return e; } } };
    const shared = shareCharacters(host as never, "u1", {
      storage: { list: async () => [`characters/${ID}/asset-maid.json`, `characters/${ID}/metadata-cache.json`], hasCharacterDocument: async (id: string) => id === ID, loadCharacterDocument: async () => doc() },
      sources: { getCharacter: async () => ({ name: "Owl Manor" }) as never, loadWorldBooks: async () => books },
    });
    await shared.registerStored();
    shared.ensure(ID);
    shared.ensure("other-id");
    expect([...handlers.keys()]).toEqual([`characters.u1.${ID}`, "characters.u1.other-id"]);
    expect(handlers.get(`characters.u1.${ID}`)!.policy).toEqual({ requires: ["characters", "images", "world_books"] });
    const value = (await handlers.get(`characters.u1.${ID}`)!.handler()) as { members: unknown[] };
    expect(value.members).toHaveLength(3);
    expect(await handlers.get("characters.u1.other-id")!.handler()).toBeNull();
  });
});
