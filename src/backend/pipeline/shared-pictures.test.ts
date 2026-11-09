import { describe, expect, test } from "bun:test";
import * as A from "../../engine/v5/atelier.js";
import { resolveArtistPromptSelection, type AssetMaidConfig } from "../../engine/context/context.js";
import { applyAtelierOverlay, buildRuntimeConfig, createDefaultConfig, normalizeConfig } from "../../shared/contract/index.js";
import { GAMBIT_CUTIN_NAME, GAMBIT_FIGURE_INSTRUCTION, GAMBIT_FIGURE_NAME, GAMBIT_INTIMATE_NAME, GAMBIT_PARLEY_NAME, GAMBIT_RATIO_NAME, GAMBIT_SCENE_NAME, GAMBIT_TALL_RATIO_NAME, PICTURE_END, parsePictureRequests, pictureSlot, picturesEndpoint, selectGambitGuideline, sharedPicturesChannel, withPictureStyle } from "./shared-pictures.js";

const runtime = () => buildRuntimeConfig(createDefaultConfig(), null) as unknown as Record<string, unknown> & { runtime: unknown };

describe("shared pictures", () => {
  test("channels follow the profiles shape", () => {
    expect(sharedPicturesChannel("u1")).toBe("pictures.u1");
    expect(picturesEndpoint("gambit", "u1")).toBe("gambit.inlay.pictures.u1");
  });

  test("requests are validated and capped", () => {
    const got = parsePictureRequests({
      version: 1,
      pictures: [
        { id: "moment:p1.3", chatId: "chat-1", direction: "parley", text: "  She catches the lie.  " },
        { id: "bad id!", chatId: "chat-1", direction: "parley", text: "x" },
        { id: "a", chatId: "chat-1", direction: "sideways", text: "x" },
        { id: "b", chatId: "chat-1", direction: "cutin", text: "" },
        { id: "moment:p1.3", chatId: "chat-1", direction: "parley", text: "duplicate" },
      ],
    });
    expect(got).toEqual([{ id: "moment:p1.3", chatId: "chat-1", direction: "parley", text: "She catches the lie." }]);
    expect(parsePictureRequests({ version: 2, pictures: [] })).toEqual([]);
  });

  test("a picture can name a base; a base that isn't an image id is left out", () => {
    const got = parsePictureRequests({
      version: 1,
      pictures: [
        { id: "scene:a.1", chatId: "chat-1", direction: "intimate", text: "x", base: "20667637-cb99-41b4-8ac4-00bfcd95cc60" },
        { id: "scene:a.2", chatId: "chat-1", direction: "intimate", text: "x", base: "../etc" },
      ],
    });
    expect(got.map((p) => p.base)).toEqual(["20667637-cb99-41b4-8ac4-00bfcd95cc60", undefined]);
  });

  test("a picture drawn on a base leaves the analyzer's place out, in the user's own guideline too", () => {
    type Rule = { condition: { direction: string }; effect: { action: string; path: string } };
    const placeRules = (runtime: Record<string, unknown>) => {
      const lib = A.resolveLibrary(runtime);
      const rules = ((lib.scene.items[lib.scene.selected] as { system?: { rules?: Rule[] } }).system?.rules ?? []).filter((r) => r.condition.direction === lib.scene.selected && r.effect.action === "remove");
      return rules.map((r) => r.effect.path).filter((p) => p.startsWith("scene."));
    };
    expect(placeRules(selectGambitGuideline(runtime(), "intimate"))).toEqual([]);
    expect(placeRules(selectGambitGuideline(runtime(), "intimate", true))).toEqual(["scene.free.location", "scene.text.location", "scene.free.object"]);
    const base = runtime();
    const lib = A.resolveStoredLibrary(base);
    lib.scene.items["mine"] = { name: GAMBIT_INTIMATE_NAME, instruction: "my scene", outputMode: "illustration" } as never;
    expect(placeRules(selectGambitGuideline(A.commitLibrary(base, lib), "intimate", true))).toEqual(["scene.free.location", "scene.text.location", "scene.free.object"]);
  });

  test("a requested style replaces the user's artist for the run: one of theirs by id, or the reader's tags", () => {
    const got = parsePictureRequests({
      version: 1,
      pictures: [
        { id: "a", chatId: "c", direction: "scene", text: "x", style: { artist: "artist_1" } },
        { id: "b", chatId: "c", direction: "scene", text: "x", style: { positive: "ink wash painting, sumi-e", negative: "3d" } },
        { id: "c", chatId: "c", direction: "scene", text: "x", style: { positive: "" } },
      ],
    });
    expect(got.map((p) => p.style)).toEqual([{ artist: "artist_1" }, { positive: "ink wash painting, sumi-e", negative: "3d" }, undefined]);
    const config = normalizeConfig({ characterPrompt: { artistPrompts: [{ id: "artist_1", title: "One", prompt: "artist:one" }, { id: "artist_2", title: "Two", prompt: "artist:two" }], defaultArtistId: "artist_2" } });
    const base = buildRuntimeConfig(config, null) as unknown as AssetMaidConfig;
    const artist = (r: object) => resolveArtistPromptSelection(r as AssetMaidConfig, { provider: "novelai" });
    expect(artist(base).id).toBe("artist_2");
    expect(artist(withPictureStyle(base, { artist: "artist_1" })).prompt).toBe("artist:one");
    expect(artist(withPictureStyle(base, { artist: "gone" })).id).toBe("artist_2");
    expect(artist(withPictureStyle(base, { positive: "ink wash painting", negative: "3d" }))).toMatchObject({ prompt: "ink wash painting", negativePrompt: "3d" });
    expect(artist(base).id).toBe("artist_2");
  });

  test("a run selects the Gambit guideline and ratio without touching the stored selection", () => {
    const base = runtime();
    const parley = selectGambitGuideline(base, "parley");
    const lib = A.resolveLibrary(parley);
    expect(lib.scene.items[lib.scene.selected]?.name).toBe(GAMBIT_PARLEY_NAME);
    // A POV camera bound to the new guideline, without requiring the persona (an unprofiled persona failed the run).
    const rules = (lib.scene.items[lib.scene.selected] as { system?: { rules?: Array<{ condition: { direction: string }; effect: { path: string } }> } }).system?.rules ?? [];
    expect(rules.some((r) => r.effect.path === "scene.group.camera.view" && r.condition.direction === lib.scene.selected)).toBe(true);
    expect(rules.some((r) => r.effect.path === "persona.required")).toBe(false);
    expect(lib.imageRatio.items[lib.imageRatio.selected]?.allowedSizeIds).toEqual([2]);
    const cut = A.resolveLibrary(selectGambitGuideline(runtime(), "cutin"));
    expect(cut.scene.items[cut.scene.selected]?.name).toBe(GAMBIT_CUTIN_NAME);
    expect(A.resolveStoredLibrary(base).scene.selected).toBe("default");
  });

  test("the user's own guideline of the same name wins", () => {
    const base = runtime();
    const lib = A.resolveStoredLibrary(base);
    lib.scene.items["mine"] = { name: GAMBIT_CUTIN_NAME, instruction: "my cut-in", outputMode: "illustration" } as never;
    const withMine = applyAtelierOverlay(A.commitLibrary(base, lib) as never, { catalog: { documents: [], activeId: "", revision: 0 } as never, instructionChanges: (A.commitLibrary(base, lib) as { runtime: { instructionChanges: never } }).runtime.instructionChanges, execution: { mode: "default", controls: {} } }, null);
    const eff = A.resolveLibrary(selectGambitGuideline(withMine, "cutin"));
    expect(eff.scene.selected).toBe("mine");
    expect(eff.scene.items.mine?.instruction).toBe("my cut-in");
  });

  test("a picture's one slot has the whole text before it, not just its last paragraph", () => {
    const text = "Rook and Tobin, at Hollowfang Wood.\n\nShe rides him into the moss.\n\n\"Hear that?\" she murmured. \"Fen and the girls are coming.\"";
    const { slots } = pictureSlot("gambit:scene.0", `${text}\n\n${PICTURE_END}`, []);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.beforeText).toBe(text);
    expect(slots[0]!.afterText).toBe(PICTURE_END);
  });

  test("a figure asks for one person in a tall frame, in the body their profile gives them", () => {
    const got = parsePictureRequests({ version: 1, pictures: [{ id: "figure:a", chatId: "chat-1", direction: "figure", text: "Wren alone." }, { id: "cg:b", chatId: "chat-1", direction: "scene", text: "They shake on it." }] });
    expect(got.map((p) => p.direction)).toEqual(["figure", "scene"]);
    expect(GAMBIT_FIGURE_INSTRUCTION).toContain("never give them human legs");
    const lib = A.resolveLibrary(selectGambitGuideline(runtime(), "figure"));
    expect(lib.scene.items[lib.scene.selected]?.name).toBe(GAMBIT_FIGURE_NAME);
    expect(lib.imageRatio.items[lib.imageRatio.selected]?.name).toBe(GAMBIT_TALL_RATIO_NAME);
    expect(lib.imageRatio.items[lib.imageRatio.selected]?.allowedSizeIds).toEqual([1]);
  });

  test("a scene stays wide", () => {
    const lib = A.resolveLibrary(selectGambitGuideline(runtime(), "scene"));
    expect(lib.scene.items[lib.scene.selected]?.name).toBe(GAMBIT_SCENE_NAME);
    expect(lib.imageRatio.items[lib.imageRatio.selected]?.name).toBe(GAMBIT_RATIO_NAME);
  });

  test("an intimate scene is wide and seen from the persona's eyes, without requiring the persona", () => {
    expect(parsePictureRequests({ version: 1, pictures: [{ id: "afterglow:a.0", chatId: "chat-1", direction: "intimate", text: "She pulls him down." }] })).toHaveLength(1);
    const lib = A.resolveLibrary(selectGambitGuideline(runtime(), "intimate"));
    const item = lib.scene.items[lib.scene.selected] as { name: string; system?: { rules?: Array<{ condition: { direction: string }; effect: { path: string } }> } };
    expect(item.name).toBe(GAMBIT_INTIMATE_NAME);
    expect(item.system?.rules?.some((r) => r.effect.path === "scene.group.camera.view" && r.condition.direction === lib.scene.selected)).toBe(true);
    expect(item.system?.rules?.some((r) => r.effect.path === "persona.required")).toBe(false);
    expect(lib.imageRatio.items[lib.imageRatio.selected]?.name).toBe(GAMBIT_RATIO_NAME);
  });
});
