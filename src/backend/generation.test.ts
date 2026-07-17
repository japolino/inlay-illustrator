import { describe, expect, test } from "bun:test";
import { compactLorebookNeedsFullRetry } from "./generation.js";
import type { LorebookContextSnapshot } from "./context.js";

const compactedVisualSnapshot: LorebookContextSnapshot = {
  compact: "## Lorebook\nlong silver hair, blue robe",
  full: "## Lorebook\nlong silver hair, violet eyes, pale skin, blue mage robe",
  compacted: true,
  hasCharacterVisualReference: true,
  diagnostics: {}
};

describe("compact lorebook quality fallback", () => {
  test("requests full lorebook context when visible characters have no durable tags", () => {
    expect(compactLorebookNeedsFullRetry({
      scenes: [{ shots: [{ paragraph: 1, characters: [{ name: "Elara", label: "girl", appearance: "", body: "", attire: "" }] }] }]
    }, compactedVisualSnapshot)).toBe(true);
  });

  test("accepts durable tags and does not retry non-character or uncompressed lorebook context", () => {
    expect(compactLorebookNeedsFullRetry({
      scenes: [{ shots: [{ paragraph: 1, characters: [{ name: "Elara", appearance: "silver hair" }] }] }]
    }, compactedVisualSnapshot)).toBe(false);
    expect(compactLorebookNeedsFullRetry({ scenes: [{ shots: [{ paragraph: 1, characters: [] }] }] }, compactedVisualSnapshot)).toBe(false);
    expect(compactLorebookNeedsFullRetry({
      scenes: [{ shots: [{ paragraph: 1, characters: [{ name: "Elara" }] }] }]
    }, { ...compactedVisualSnapshot, compacted: false })).toBe(false);
  });
});
