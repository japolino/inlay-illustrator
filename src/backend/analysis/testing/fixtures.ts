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
