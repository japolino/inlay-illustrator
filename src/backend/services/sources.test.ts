import { describe, expect, test } from "bun:test";
import { createEmptyCharacterDocument } from "../../shared/contract/index.js";
import { answerFetchBridge, createFakeHost } from "../testing/fake-host.js";
import { createImageBytesService } from "./image-bytes.js";
import { createSourcesService, loreRecordsOf, loreScore, memberAliases, splitLoreKeys } from "./sources.js";
import { createStorageService } from "./storage.js";

function setup() {
  const fake = createFakeHost();
  const storage = createStorageService(fake.host, fake.userId);
  const bytes = createImageBytesService({ host: fake.host, userId: fake.userId, storage, timeoutMs: 50 });
  fake.host.onFrontendMessage((p) => void bytes.acceptFrontendMessage(p as Record<string, unknown>));
  const sources = createSourcesService({ host: fake.host, userId: fake.userId, imageBytes: bytes, storage });
  fake.addCharacter({
    id: "c1",
    name: "Alice",
    description: "A tall girl.",
    tags: ["Heroine/Main"],
    image_id: "av1",
    world_book_ids: ["wb1"],
    extensions: { expressions: { mappings: { smile: "ex1" } }, risu_asset_map: { "alice_casual.png": "ra1", "dup": "ex1" } },
  });
  fake.addWorldBook({ id: "wb1", name: "Alice book" }, [
    { id: "e1", comment: "World setting", key: ["kingdom"], content: "The kingdom of X." },
    { id: "e2", comment: "Alice profile", key: ["Alice, ali|A"], keysecondary: ["girl"], selective: true, content: "Alice has red hair." },
    { id: "e3", comment: "Off", key: ["x"], content: "hidden", disabled: true },
    { id: "e4", comment: "Empty", key: ["y"], content: "  " },
    { id: "e5", comment: "__ASSET_MAID_DATA__", content: "{}" },
  ]);
  fake.addWorldBook({ id: "wb2", name: "Extra" }, [{ id: "m1", comment: "Bob", key: ["bob"], content: "Bob is a knight." }]);
  fake.addWorldBook({ id: "wbg", name: "Global" }, [{ id: "g1", comment: "G", key: ["g"], content: "global" }]);
  fake.globalWorldBookIds.push("wbg");
  fake.addChat({ id: "chat1", character_id: "c1" });
  fake.addChat({ id: "chat2", character_id: "c1", metadata: { group: true, character_ids: ["c1", "c2"], chat_world_book_ids: ["wb2"] } });
  fake.addPersona({ id: "p1", name: "Me", is_default: true });
  fake.addImage({ id: "gen1", original_filename: "x.png", owner_character_id: "c1", owner_extension_identifier: "inlay_illustrator", owner_chat_id: "chat1" });
  fake.addImage({ id: "gen2", original_filename: "Alice.__am__.outfit.12345678-1234-1234-1234-123456789abc", owner_character_id: "c1", owner_extension_identifier: "inlay_illustrator" });
  answerFetchBridge(fake, { "/api/v1/characters/c1/gallery": { json: [{ id: "g", image_id: "gal1", caption: "", reference: "beach.webp", mime_type: "image/webp", width: 10, height: 20 }] } });
  return { fake, sources };
}

describe("AM source helpers", () => {
  test("aliases, key split, score", () => {
    expect(memberAliases({ name: "Alice Liddell", id: "c1", tags: ["Heroine/Main"] })).toEqual(["alice liddell", "c1", "heroine/main", "heroine", "main"]);
    expect(splitLoreKeys(["a, b;c", "d|e\nf", "a"])).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(loreScore({ comment: "Alice profile", keys: ["alice"], secondaryKeys: [], content: "hair" }, ["alice"])).toBe(5 + 2 + 1);
    expect(loreScore({ comment: "World rules", keys: [], secondaryKeys: [], content: "" }, ["alice"])).toBe(-3 - 2);
  });

  test("lore records: skip disabled/empty/owned, ids, selective, sorted by score", () => {
    const entries = [
      { worldBookId: "w", entryId: "a", comment: "", keys: ["k1"], secondaryKeys: [], content: "x", disabled: false, constant: true, selective: true, useRegex: false, order: 0 },
      { worldBookId: "w", entryId: "b", comment: "Alice", keys: [], secondaryKeys: [], content: "y", disabled: false, constant: false, selective: false, useRegex: true, order: 1 },
      { worldBookId: "w", entryId: "c", comment: "z", keys: [], secondaryKeys: [], content: "", disabled: false, constant: false, selective: false, useRegex: false, order: 2 },
    ];
    const records = loreRecordsOf(entries, ["alice"], { sourceType: "module", sourceName: "Book" });
    expect(records.map((r) => [r.id, r.title, r.score])).toEqual([["w:b", "Alice", 5], ["w:a", "k1", 0]]);
    expect(records[1]).toMatchObject({ selective: false, alwaysActive: true, sourceType: "module", sourceName: "Book", selectionId: "w:a" });
  });
});

describe("sources service", () => {
  test("characters list with chat counts and avatar URLs", async () => {
    const { sources } = setup();
    expect(await sources.listCharacters()).toEqual([{ characterId: "c1", name: "Alice", avatarUrl: "/api/v1/characters/c1/avatar?size=sm", hasDocument: false, chatCount: 2, worldBookIds: ["wb1"] }]);
    await expect(sources.getCharacter("nope")).rejects.toMatchObject({ error: { code: "not-found" } });
  });

  test("world books: attached, persona, chat, global, extra connected; roster sources list every book", async () => {
    const { fake, sources } = setup();
    const doc = createEmptyCharacterDocument("c1");
    doc.characterPrompt.activeModules.c1 = ["wb2"];
    const books = await sources.loadWorldBooks("c1", doc, { chatId: "chat2" });
    expect(books.map((b) => [b.worldBookId, b.scope])).toEqual([["wb1", "character"], ["wb2", "chat"], ["wbg", "global"]]);
    fake.addWorldBook({ id: "wb3", name: "Other" }, [{ id: "o1", content: "o" }]);
    sources.invalidate();
    const roster = await sources.rosterSources("c1", doc, { chatId: "chat1" });
    expect(roster.map((r) => [r.worldBookId, r.scope, r.attached, r.connected, r.entryCount])).toEqual([
      ["wb1", "character", true, true, 5],
      ["wbg", "global", false, false, 1],
      ["wb2", "extra", false, true, 1],
      ["wb3", "extra", false, false, 1],
    ]);
  });

  test("buildSource: member, lore records (+ description, connected module), assets by origin and kind", async () => {
    const { sources } = setup();
    const doc = createEmptyCharacterDocument("c1");
    doc.characterPrompt.activeModules.c1 = ["wb2"];
    const source = await sources.buildSource("c1", doc, { chatId: "chat1" });
    expect(source).toMatchObject({ id: "c1", name: "Alice", type: "character", chatCount: 2, activeModuleIds: ["wb2"] });
    const member = source.members[0]!;
    expect(member).toMatchObject({ key: "c1", id: "c1", name: "Alice", sourceSummary: "Description:\nA tall girl." });
    expect(member.lorebooks.map((l) => [l.id, l.kind, l.sourceType])).toEqual([
      ["wb1:e2", "lorebook", "character"],
      ["wb1:e1", "lorebook", "character"],
      ["asset-maid:charx-description:v1", "character-description", "character"],
      ["wb2:m1", "lorebook", "module"],
    ]);
    expect(member.lorebooks[0]).toMatchObject({ primaryKeys: ["Alice", "ali", "A"], secondaryKeys: ["girl"], selective: true });
    expect(member.originalAssets.map((a) => a.key)).toEqual(["av1", "gal1", "ex1", "ra1"]);
    expect(member.outfitGeneratedAssets.map((a) => a.key)).toEqual(["gen2"]);
    expect(member.chatGeneratedAssets.map((a) => a.key)).toEqual(["gen1"]);
    expect(member.assetCount).toBe(6);
    expect(source.previewAsset?.key).toBe("av1");
    expect(source.assetGeneration).toMatch(/^c1:[0-9a-z]+$/);
    const again = await sources.buildSource("c1", doc, { chatId: "chat1" });
    expect(again.assetGeneration).toBe(source.assetGeneration);
  });

  test("character images carry AssetRefs; personas; chats", async () => {
    const { sources } = setup();
    const images = await sources.listCharacterImages("c1");
    expect(images.find((i) => i.imageId === "gal1")).toMatchObject({ origin: "gallery", name: "beach.webp", kind: "original", url: "/api/v1/images/gal1", thumbnailUrl: "/api/v1/images/gal1?size=sm", width: 10, asset: { key: "gal1", extension: "webp", sourceType: "character", characterTarget: { chaId: "c1" } } });
    expect(images.find((i) => i.imageId === "gen2")).toMatchObject({ origin: "generated", kind: "outfit", asset: { sourceType: "generated" } });
    expect((await sources.listPersonas()).map((p) => p.personaId)).toEqual(["p1"]);
    expect((await sources.getActivePersona())?.personaId).toBe("p1");
    expect(await sources.getChat("chat2")).toMatchObject({ characterId: "c1", groupCharacterIds: ["c1", "c2"] });
    expect(await sources.getActiveChat()).toBeNull();
  });
});
