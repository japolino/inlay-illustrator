import { describe, expect, test } from "bun:test";
import * as A from "../../engine/v5/atelier.js";
import { applyAtelierOverlay, buildRuntimeConfig, createDefaultConfig } from "../../shared/contract/index.js";
import { GAMBIT_CUTIN_NAME, GAMBIT_PARLEY_NAME, parsePictureRequests, picturesEndpoint, selectGambitGuideline, sharedPicturesChannel } from "./shared-pictures.js";

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
});
