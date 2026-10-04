/** Test fixtures for the analysis module: a character with two world-book actors, a description actor and images. */
import { createFakeServices, type FakeServices, type FakeServicesOverrides } from "../../testing/fake-services.js";
import type { AmLoreRecord, AmSource, CharacterImageAsset } from "../../services/types.js";
import type { AssetRef, CharacterDocument } from "../../../shared/contract/index.js";

export const CHAR = "char-1";

export function asset(name: string, key = `img-${name}`): AssetRef {
  const ext = name.split(".").pop() ?? "png";
  return { name, key, extension: ext, sourceType: "character", moduleId: "", moduleName: "", characterTarget: { chaId: CHAR } };
}

export function lore(entryId: string, title: string, keys: string[], content: string, extra: Partial<AmLoreRecord> = {}): AmLoreRecord {
  const id = `wb1:${entryId}`;
  return {
    kind: "lorebook", id, selectionId: id, title, keys, primaryKeys: keys, secondaryKeys: [], selective: false, useRegex: false,
    content, score: 5, alwaysActive: false, sourceType: "character", sourceName: "Book One", worldBookId: "wb1", entryId, ...extra,
  };
}

export const ORIGINALS = [asset("alice_smile.png"), asset("alice_angry.png"), asset("bob_default.png"), asset("scenery.png")];

export function buildTestSource(document?: CharacterDocument): AmSource {
  void document;
  const lorebooks: AmLoreRecord[] = [
    lore("e1", "Alice", ["alice"], "Alice has long red hair and green eyes."),
    lore("e2", "Bob", ["bob"], "Bob is a tall man."),
    { ...lore("x", "Hero", ["Hero"], "A hero of the story."), id: "asset-maid:charx-description:v1", selectionId: "asset-maid:charx-description:v1", kind: "character-description", worldBookId: undefined, entryId: undefined },
  ];
  return {
    id: CHAR, index: 0, characterTarget: { chaId: CHAR }, name: "Hero", type: "character", chatCount: 1,
    attachedModuleIds: ["wb1"], activeModuleIds: ["wb1"], sharedModuleAssets: [], chatGeneratedAssets: [], previewAsset: null,
    assetGeneration: "gen-1",
    members: [{
      sourceId: CHAR, id: CHAR, key: CHAR, name: "Hero", aliases: ["hero"], sourceSummary: "", lorebooks,
      originalAssets: ORIGINALS, outfitGeneratedAssets: [], chatGeneratedAssets: [], assetCount: ORIGINALS.length, previewAsset: null,
      characterIndex: 0, characterTarget: { chaId: CHAR },
    }],
  };
}

export function testImages(): CharacterImageAsset[] {
  return ORIGINALS.map((a) => ({ asset: a, kind: "original", origin: "gallery", imageId: a.key, name: a.name, url: `/img/${a.key}`, thumbnailUrl: `/thumb/${a.key}` }));
}

export function createAnalysisFixture(overrides: FakeServicesOverrides = {}): FakeServices {
  let fx: FakeServices;
  fx = createFakeServices({
    ...overrides,
    sources: {
      buildSource: async () => buildTestSource(),
      ...overrides.sources,
    },
  });
  fx.characters.push({ characterId: CHAR, name: "Hero", description: "Hero desc", personality: "", scenario: "", creatorNotes: "", tags: [], avatarImageId: null, worldBookIds: ["wb1"], extensions: {} });
  fx.worldBooks[CHAR] = [{ worldBookId: "wb1", name: "Book One", scope: "character", entries: [] }, { worldBookId: "wb2", name: "Extra", scope: "global", entries: [] }];
  fx.characterImages[CHAR] = testImages();
  return fx;
}

export const ALICE = `${CHAR}::lore::wb1:e1`;
export const BOB = `${CHAR}::lore::wb1:e2`;
export const HERO = `${CHAR}::lore::asset-maid:charx-description:v1`;

/** Minimal PNG (1x1) with tEXt chunks, base64 (for metadata tests). */
export function pngWithText(chunks: Record<string, string>): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const enc = new TextEncoder();
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(enc.encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const idat = new Uint8Array([0x78, 0x9c, 0x63, 0x60, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01]);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
  for (const [k, v] of Object.entries(chunks)) parts.push(chunk("tEXt", new Uint8Array([...enc.encode(k), 0, ...new TextEncoder().encode(v)])));
  parts.push(chunk("IDAT", idat), chunk("IEND", new Uint8Array()));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const all = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  let s = "";
  for (const b of all) s += String.fromCharCode(b);
  return btoa(s);
}

export const NAI_PNG = pngWithText({
  Software: "NovelAI",
  Comment: JSON.stringify({ prompt: "artist:foo, 1girl, red hair", uc: "lowres, bad anatomy", seed: 7, width: 832, height: 1216, sampler: "k_euler", steps: 28, scale: 5 }),
});
