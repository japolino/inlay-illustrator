import { describe, expect, test } from "bun:test";
import {
  createEmptyCharacterDocument,
  LEGACY_BUILTIN_ARTIST_PRESETS,
  listNovelAIArtists,
  migrateLegacyBuiltinArtists,
  resolveNovelAIArtistSelection,
  STORAGE_PATHS,
} from "../../shared/contract/index.js";
import { createFakeHost } from "../testing/fake-host.js";
import { createRunLog } from "./run-log.js";
import { createStorageService } from "./storage.js";

/** AM 0.9.90 removed the 2 built-in art styles; the port keeps stored / referenced ones as user styles (PORT-MAP.md). */
const DETAIL = LEGACY_BUILTIN_ARTIST_PRESETS.find((p) => p.id === "detail_anime_illustration_style")!;
const COMIC = LEGACY_BUILTIN_ARTIST_PRESETS.find((p) => p.id === "comic_page_illustration_style")!;

function setup(files: Record<string, unknown>) {
  const fake = createFakeHost();
  for (const [path, value] of Object.entries(files)) fake.files.set(path, JSON.stringify(value));
  const log = createRunLog();
  const storage = createStorageService(fake.host, fake.userId, { log });
  const stored = () => JSON.parse(fake.files.get(STORAGE_PATHS.artistsGlobal) as string);
  return { fake, storage, log, stored };
}

describe("built-in art style migration (AM 0.9.90 removal, port keeps the look)", () => {
  test("a stored built-in entry (0.9.89 port: body + overrides) becomes a user style with the same prompt, negative and overrides", async () => {
    // Realistic 0.9.89 port data: the built-in was edited (overrides) and is the global default.
    const { storage, stored } = setup({
      [STORAGE_PATHS.configSettings]: { version: 1, ui: { language: "en" } },
      [STORAGE_PATHS.artistsGlobal]: {
        version: 1,
        characterPrompt: {
          artistPrompts: [
            { id: DETAIL.id, title: DETAIL.title, prompt: DETAIL.prompt, novelAIOverrides: { steps: 30, sampler: "k_euler" }, nonArtistPromptWeight: { enabled: true, multiplier: 0.8 } },
            { id: "artist_6f1", title: "Mine", prompt: "artist:me", negativePrompt: "bad hands" },
          ],
          defaultArtistId: DETAIL.id,
        },
      },
    });
    const config = await storage.loadConfig();
    const list = listNovelAIArtists(config.characterPrompt.artistPrompts);
    expect(list.map((a) => [a.id, a.userDefined])).toEqual([["none", false], [DETAIL.id, true], ["artist_6f1", true]]);
    expect(list.find((a) => a.id === DETAIL.id)).toMatchObject({ title: "v5 verified style", prompt: DETAIL.prompt, negativePrompt: DETAIL.negativePrompt, novelAIOverrides: { steps: 30, sampler: "k_euler" }, nonArtistPromptWeight: { enabled: true, multiplier: 0.8 } });
    expect(resolveNovelAIArtistSelection(config.characterPrompt, "").id).toBe(DETAIL.id);
    // Written back once, at the new version; the user style is untouched.
    expect(stored().version).toBe(2);
    expect(stored().characterPrompt.artistPrompts[1]).toEqual({ id: "artist_6f1", title: "Mine", prompt: "artist:me", negativePrompt: "bad hands" });
  });

  test("a default and a character's own selection naming removed built-ins without stored entries are recreated", async () => {
    const doc = createEmptyCharacterDocument("hero");
    const { storage, stored, log } = setup({
      [STORAGE_PATHS.configModel]: { version: 1, analysis: { temperature: 0.3 } },
      [STORAGE_PATHS.artistsGlobal]: { version: 1, characterPrompt: { artistPrompts: [], defaultArtistId: COMIC.id } },
      [STORAGE_PATHS.characterDocument("hero")]: { ...doc, characterPrompt: { ...doc.characterPrompt, selectedArtistId: DETAIL.id } },
      [STORAGE_PATHS.characterDocument("plain")]: createEmptyCharacterDocument("plain"),
    });
    const config = await storage.loadConfig();
    const ids = listNovelAIArtists(config.characterPrompt.artistPrompts).map((a) => a.id);
    expect(ids).toEqual(["none", COMIC.id, DETAIL.id]);
    expect(resolveNovelAIArtistSelection(config.characterPrompt, "").id).toBe(COMIC.id);
    expect(resolveNovelAIArtistSelection(config.characterPrompt, DETAIL.id)).toMatchObject({ id: DETAIL.id, followsGlobal: false });
    expect(stored().characterPrompt.artistPrompts.find((e: { id: string }) => e.id === DETAIL.id)).toMatchObject({ prompt: DETAIL.prompt, negativePrompt: DETAIL.negativePrompt });
    expect(log.list().some((e) => e.message.includes("built-in art styles"))).toBe(true);
  });

  test("an install that never saved the artist list kept the old default style", async () => {
    const { storage, stored } = setup({ [STORAGE_PATHS.configSettings]: { version: 1, enabled: true } });
    const config = await storage.loadConfig();
    expect(config.characterPrompt.defaultArtistId).toBe(DETAIL.id);
    expect(resolveNovelAIArtistSelection(config.characterPrompt, "").id).toBe(DETAIL.id);
    expect(stored().characterPrompt.artistPrompts.map((e: { id: string }) => e.id)).toEqual([DETAIL.id]);
  });

  test("a fresh install has only 'none' and writes nothing", async () => {
    const { storage, fake } = setup({});
    const config = await storage.loadConfig();
    expect(config.characterPrompt.defaultArtistId).toBe("none");
    expect(listNovelAIArtists(config.characterPrompt.artistPrompts).map((a) => a.id)).toEqual(["none"]);
    expect(fake.files.has(STORAGE_PATHS.artistsGlobal)).toBe(false);
  });

  test("idempotent: migrated data and user edits of a migrated style survive later loads", async () => {
    const once = migrateLegacyBuiltinArtists({ characterPrompt: { artistPrompts: [{ id: DETAIL.id }], defaultArtistId: "none" } });
    expect(once.characterPrompt.artistPrompts).toEqual([{ id: DETAIL.id, title: "v5 verified style", prompt: DETAIL.prompt, negativePrompt: DETAIL.negativePrompt, description: expect.any(String) }]);
    const edited = { ...once, characterPrompt: { ...once.characterPrompt, artistPrompts: [{ ...once.characterPrompt.artistPrompts[0]!, title: "Renamed", prompt: "artist:edited" }] } };
    expect(migrateLegacyBuiltinArtists(edited)).toEqual(edited);

    const { storage, stored, fake } = setup({ [STORAGE_PATHS.artistsGlobal]: edited });
    await storage.loadConfig();
    expect(stored()).toEqual(edited);
    expect(fake.files.get(STORAGE_PATHS.artistsGlobal)).toBe(JSON.stringify(edited));
  });
});
