import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { compactLorebookNeedsFullRetry, locateGeneratedImage, parseAndSelectPrompts } from "./generation.js";
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

describe("Adaptive parser call sequencing", () => {
  const requests: Array<Record<string, unknown>> = [];
  const responses: unknown[] = [];
  const config = {
    ...DEFAULT_CONFIG,
    adaptiveMode: true,
    parserConnectionId: "adaptive-parser",
    includeCharacterInfo: false,
    includeUserInfo: false,
    includeLorebook: false,
    userInstructionsEnabled: false,
    previousVisualStateEnabled: false,
    preprocessingEnabled: false,
    parserRetries: 0,
    minImages: 1,
    maxImages: 1
  };
  const messages = [{ id: "message-1", role: "assistant", content: "A visual beat." }];
  const paragraphs = [{ parserIndex: 1, originalIndex: 1, text: "A visual beat." }];

  beforeEach(() => {
    requests.splice(0);
    responses.splice(0);
    (globalThis as typeof globalThis & { spindle: unknown }).spindle = {
      connections: {
        get: async () => ({ id: "adaptive-parser", name: "Adaptive", provider: "openai", model: "gpt-test" })
      },
      generate: {
        raw: async (request: Record<string, unknown>) => {
          requests.push(request);
          return responses.shift();
        }
      },
      log: { info: () => undefined, warn: () => undefined, error: () => undefined }
    };
  });

  test("uses one LLM call when Adaptive selects Dynamic", async () => {
    responses.push({ content: JSON.stringify({ scenes: [{
      place: "street",
      environment: { location: "street", timeWeather: "day" },
      shots: [{
        paragraph: 1,
        perspectiveMode: "dynamic",
        camera: { framing: "medium shot", angle: "eye level", perspective: "straight-on" },
        action: "walking",
        characters: [{ label: "girl", appearance: "black hair", attire: "coat", composition: { pose: "walking" } }]
      }]
    }] }) });

    const result = await parseAndSelectPrompts({
      chatId: "chat-1", messageId: "message-1", messages, paragraphs,
      state: { characterAppearance: {}, generated: {} }, config
    });

    expect(result.selected[0]?.perspectiveMode).toBe("dynamic");
    expect(requests).toHaveLength(1);
  });

  test("runs ideation only after Adaptive actually selects Creative", async () => {
    responses.push(
      { content: JSON.stringify({ scenes: [{
        place: "street",
        environment: { location: "street", timeWeather: "day" },
        shots: [{
          paragraph: 1,
          perspectiveMode: "creative",
          camera: { framing: "body-part focus", angle: "eye level", perspective: "from side" },
          action: "a shadow stretches across the pavement",
          characters: [],
          renderScope: "shadow and pavement",
          visibleTags: ["shadow", "pavement"]
        }]
      }] }) },
      { content: JSON.stringify({ candidates: [
        { paragraph: 1, subjectType: "shadow", anchor: "long shadow", concept: "a long shadow crosses the pavement", renderScope: "shadow and pavement only", camera: "low oblique detail", visibleCues: ["long shadow", "pavement"], score: 92 },
        { paragraph: 1, subjectType: "environment", anchor: "pavement seam", concept: "a pavement seam divides light and shade", renderScope: "pavement and divided light only", camera: "tight overhead detail", visibleCues: ["pavement seam", "divided light"], score: 86 }
      ] }) }
    );

    const result = await parseAndSelectPrompts({
      chatId: "chat-1", messageId: "message-1", messages, paragraphs,
      state: { characterAppearance: {}, generated: {} }, config
    });

    expect(result.selected[0]?.perspectiveMode).toBe("creative");
    expect(result.selected[0]?.creativeConcept).toBeDefined();
    expect(requests).toHaveLength(2);
    expect((requests[0].messages as Array<{ content: string }>)[0].content).toContain("# Image Tagging System");
    expect((requests[1].messages as Array<{ content: string }>)[0].content).toContain("Creative Illustration Concept Ideator");
  });
});
