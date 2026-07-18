import { describe, expect, test } from "bun:test";
import { compactLorebookNeedsFullRetry, locateGeneratedImage } from "./generation.js";
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

describe("stored image action lookup", () => {
  test("finds legacy inlays by result ID when message and image-index metadata are absent", () => {
    const record = {
      chatId: "chat-1",
      messageId: "message-1",
      swipeId: 0,
      prompts: ["first", "second"],
      negativePrompts: ["", "lowres"],
      perspectiveModes: ["dynamic", "creative"] as const,
      perspectiveSources: ["manual", "adaptive"] as const,
      paragraphs: [1, 2],
      imageIds: ["first-id", "folder/second id"],
      imageUrls: ["/api/v1/image-gen/results/first-id", "/api/v1/image-gen/results/folder%2Fsecond%20id"],
      rawJson: { scenes: [] },
      createdAt: "2026-07-18T00:00:00.000Z"
    };
    const located = locateGeneratedImage({ characterAppearance: {}, generated: { record } }, {
      chatId: "chat-1",
      imageId: "folder/second id"
    });

    expect(located).toMatchObject({ key: "record", index: 1 });
    expect(located.record.messageId).toBe("message-1");
  });
});
