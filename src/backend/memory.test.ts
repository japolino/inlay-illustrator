import { describe, expect, test } from "bun:test";
import { deleteCharacterTag, sanitizeMemoryTags, updateCache, upsertCharacterTag } from "./memory.js";
import type { State } from "./types.js";

function state(characterAppearance: Record<string, string>): State {
  return { characterAppearance: { ...characterAppearance }, generated: {} };
}

describe("character memory", () => {
  test("keeps durable baseline tags while removing pose, camera, expression, and transient-attire tags", () => {
    const tags = sanitizeMemoryTags([
      "1girl",
      "blonde_hair",
      "blue eyes",
      "sitting",
      "from_behind",
      "portrait",
      "smile",
      "torn-clothes",
      "open shirt",
      "BLONDE_HAIR"
    ].join(", "));

    expect(tags).toBe("1girl, blonde_hair, blue eyes");
  });

  test("updates named characters from durable scene fields and ignores transient or identity-only details", () => {
    const cache: Record<string, string> = { Existing: "green eyes" };

    updateCache(cache, {
      scenes: [{
        place: "station",
        shots: [{
          paragraph: "P2",
          characters: [{
            name: " Alice (Wonderland) ",
            label: "1girl",
            age: "adult",
            identity: "royal heir",
            appearance: "blonde hair, blue eyes",
            body: "slim",
            attire: "red coat, open shirt",
            expression: "smile",
            action: "sitting"
          }, {
            name: "No Baseline",
            appearance: "standing, portrait"
          }, {
            appearance: "black hair"
          }]
        }]
      }]
    });

    expect(cache).toEqual({
      Existing: "green eyes",
      Alice: "1girl, adult, blonde hair, blue eyes, slim, red coat"
    });
  });

  test("renames entries case-insensitively, sanitizes edited tags, and preserves unrelated memory", () => {
    const current = state({ Alice: "red hair", Bob: "black hair" });

    upsertCharacterTag(current, "alice", " Alicia (source) ", "blue hair, standing, open shirt, none");

    expect(current.characterAppearance).toEqual({ Bob: "black hair", Alicia: "blue hair" });
  });

  test("removes entries case-insensitively and treats blank names as a no-op", () => {
    const current = state({ Alice: "red hair", Bob: "black hair" });

    deleteCharacterTag(current, "ALICE");
    deleteCharacterTag(current, "   ");

    expect(current.characterAppearance).toEqual({ Bob: "black hair" });
  });
});
