import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, effectiveGenerationConfig } from "../shared/config.js";
import {
  compactLorebookNeedsFullRetry,
  generateForMessage,
  locateGeneratedImage,
  matchesGenerationSource,
  parseAndSelectPrompts,
  rerunStoredImage,
  sourceContentFingerprint
} from "./generation.js";
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
        shotPlan: {
          primaryAction: "center girl walks toward the viewer",
          secondaryCue: "",
          staging: "center girl occupies the street foreground"
        },
        characters: [{
          label: "girl",
          appearance: "black hair",
          attire: "coat",
          renderScope: "full figure at center",
          visibleTags: "black hair, coat",
          composition: {
            position: "center frame",
            pose: "walking stance",
            actions: ["walking toward the viewer"],
            gaze: "looking forward"
          }
        }]
      }]
    }],
    terminalState: {
      paragraph: 1,
      environment: { location: "street", timeWeather: "day", lightingMood: [], backgroundElements: [] },
      environmentChanges: [],
      characters: []
    } }) });

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
      }],
      terminalState: {
        paragraph: 1,
        environment: { location: "street", timeWeather: "day", lightingMood: [], backgroundElements: [] },
        environmentChanges: [],
        characters: []
      } }) },
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

describe("progressive generation stale-result guard", () => {
  test("accepts the captured assistant swipe and rejects edits, swipes, and other roles", () => {
    const fingerprint = sourceContentFingerprint("Original narrative.");
    expect(matchesGenerationSource({ id: "m", role: "assistant", content: "Original narrative.", swipe_id: 2 }, 2, fingerprint)).toBe(true);
    expect(matchesGenerationSource({ id: "m", role: "assistant", content: "Edited narrative.", swipe_id: 2 }, 2, fingerprint)).toBe(false);
    expect(matchesGenerationSource({ id: "m", role: "assistant", content: "Original narrative.", swipe_id: 3 }, 2, fingerprint)).toBe(false);
    expect(matchesGenerationSource({ id: "m", role: "user", content: "Original narrative.", swipe_id: 2 }, 2, fingerprint)).toBe(false);
  });
});

describe("progressive ComfyUI delivery", () => {
  test("submits eagerly and inserts out-of-order completions into stable narrative slots", async () => {
    const files = new Map<string, unknown>();
    const updates: string[] = [];
    const events: string[] = [];
    const frontend: Array<Record<string, unknown>> = [];
    const imageResolvers: Array<(value: Record<string, unknown>) => void> = [];
    const message = {
      id: "progress-message",
      role: "assistant",
      content: "First visual beat.\n\nSecond visual beat.",
      metadata: {},
      swipe_id: 0
    };
    const generationConfig = {
      ...DEFAULT_CONFIG,
      parserConnectionId: "progress-parser",
      imageConnectionId: "progress-comfy",
      includeCharacterInfo: false,
      includeUserInfo: false,
      includeLorebook: false,
      userInstructionsEnabled: false,
      previousVisualStateEnabled: false,
      preprocessingEnabled: false,
      parserRetries: 0,
      adaptiveMode: false,
      perspectiveMode: "dynamic" as const,
      minImages: 2,
      maxImages: 2
    };
    (globalThis as typeof globalThis & { spindle: unknown }).spindle = {
      connections: {
        get: async () => ({ id: "progress-parser", name: "Parser", provider: "openai", model: "test" })
      },
      generate: {
        raw: async () => ({ content: JSON.stringify({
          scenes: [{
            place: "street",
            environment: { location: "street", timeWeather: "day", lightingMood: [], backgroundElements: ["shops", "pavement"] },
            shots: [
              {
                paragraph: 1,
                action: "first beat",
                shotPlan: { primaryAction: "wind moves paper", secondaryCue: "", staging: "paper crosses foreground" },
                characters: [],
                camera: { framing: "wide shot", angle: "eye level", perspective: "straight-on" }
              },
              {
                paragraph: 2,
                action: "second beat",
                shotPlan: { primaryAction: "rain darkens pavement", secondaryCue: "", staging: "pavement fills foreground" },
                characters: [],
                camera: { framing: "close-up", angle: "low angle", perspective: "from side" }
              }
            ]
          }],
          terminalState: {
            paragraph: 2,
            place: "street",
            environment: { location: "street", timeWeather: "day", lightingMood: [], backgroundElements: ["shops", "pavement"] },
            environmentChanges: [],
            characters: []
          }
        }) })
      },
      imageGen: {
        getConnection: async () => ({ id: "progress-comfy", name: "Comfy", provider: "comfyui", model: "workflow" }),
        generate: () => {
          const index = imageResolvers.length;
          events.push(`generate-${index}`);
          return new Promise((resolve) => { imageResolvers.push(resolve); });
        }
      },
      userStorage: {
        getJson: async <T>(path: string, options: { fallback: T }) => (files.has(path) ? files.get(path) : options.fallback) as T,
        setJson: async (path: string, value: unknown) => { files.set(path, structuredClone(value)); },
        exists: async (path: string) => files.has(path),
        read: async (path: string) => JSON.stringify(files.get(path)),
        write: async (path: string, value: string) => { files.set(path, JSON.parse(value)); },
        mkdir: async () => undefined
      },
      chat: {
        getMessages: async () => [message],
        updateMessage: async (_chatId: string, _messageId: string, patch: { content?: string; metadata?: Record<string, unknown> }) => {
          if (patch.content) message.content = patch.content;
          if (patch.metadata) message.metadata = patch.metadata;
          updates.push(message.content);
          events.push(message.content.includes("Generating illustration") ? "placeholder" : "image-update");
        }
      },
      sendToFrontend: (payload: Record<string, unknown>) => frontend.push(payload),
      log: { info: () => undefined, warn: () => undefined, error: () => undefined }
    };

    const generation = generateForMessage("progress-chat", message.id, message.content, "progress-user", {
      config: generationConfig,
      messages: [message]
    });
    for (let attempt = 0; attempt < 20 && imageResolvers.length < 2; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    expect(imageResolvers).toHaveLength(2);
    expect(events.indexOf("generate-0")).toBeLessThan(events.indexOf("placeholder"));

    imageResolvers[1]({ imageId: "second-id", imageUrl: "/second.png", imageDataUrl: "", model: "workflow", provider: "comfyui" });
    for (let attempt = 0; attempt < 20 && !message.content.includes("/second.png"); attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    expect(message.content).toContain("Generating illustration 1");
    expect(message.content).toContain("/second.png");

    imageResolvers[0]({ imageId: "first-id", imageUrl: "/first.png", imageDataUrl: "", model: "workflow", provider: "comfyui" });
    await generation;
    expect(message.content).not.toContain("Generating illustration");
    expect(message.content.indexOf("/first.png")).toBeLessThan(message.content.indexOf("First visual beat."));
    expect(message.content.indexOf("/second.png")).toBeLessThan(message.content.indexOf("Second visual beat."));
    expect(frontend.some((payload) => payload.type === "generation_progress" && payload.stage === "completed")).toBe(true);
    expect(updates.length).toBeGreaterThanOrEqual(3);
  });
});


describe("optional cover image generation", () => {
  test("generates one extra key visual and renders it above the message", async () => {
    const files = new Map<string, unknown>();
    const updates: string[] = [];
    const frontend: Array<Record<string, unknown>> = [];
    const prompts: string[] = [];
    const message = {
      id: "cover-message",
      role: "assistant",
      content: "First visual beat.\n\nSecond visual beat.",
      metadata: {},
      swipe_id: 0
    };
    const generationConfig = {
      ...DEFAULT_CONFIG,
      coverImageEnabled: true,
      parserConnectionId: "cover-parser",
      imageConnectionId: "cover-comfy",
      includeCharacterInfo: false,
      includeUserInfo: false,
      includeLorebook: false,
      userInstructionsEnabled: false,
      previousVisualStateEnabled: false,
      preprocessingEnabled: false,
      parserRetries: 0,
      adaptiveMode: false,
      perspectiveMode: "dynamic" as const,
      minImages: 1,
      maxImages: 1
    };
    (globalThis as typeof globalThis & { spindle: unknown }).spindle = {
      connections: {
        get: async () => ({ id: "cover-parser", name: "Parser", provider: "openai", model: "test" })
      },
      generate: {
        raw: async () => ({ content: JSON.stringify({
          cover: {
            environment: {
              location: "abstract mirrored void",
              timeWeather: "timeless darkness",
              lightingMood: ["dramatic rim light"],
              backgroundElements: ["fractured mirror", "floating paper"]
            },
            camera: { framing: "wide shot", angle: "dutch angle", perspective: "from below", focus: ["deep focus"] },
            shotPlan: {
              primaryAction: "solitary girl faces her fractured reflection",
              secondaryCue: "floating paper surrounds her",
              staging: "girl and reflection divide the frame"
            },
            situation: "1girl, symbolic fractured reflection",
            characters: [{
              name: "girl A",
              label: "girl",
              age: "adolescent",
              identity: "",
              appearance: "long black hair, blue eyes",
              body: "pale skin",
              attire: "red coat",
              attireInferred: false,
              visualChanges: [],
              expression: "determined",
              renderScope: "full figure",
              visibleTags: "long black hair, blue eyes, pale skin, red coat",
              composition: {
                position: "left of center",
                pose: "upright stance",
                actions: ["facing her fractured reflection"],
                gaze: "looking at reflection"
              }
            }],
            sharedComposition: { interaction: [], spatialRelation: "reflection fills the right half" },
            negative: ""
          },
          scenes: [{
            environment: { location: "street", timeWeather: "day", lightingMood: [], backgroundElements: [] },
            shots: [{
              paragraph: 2,
              situation: "windblown paper",
              shotPlan: { primaryAction: "wind moves paper", secondaryCue: "", staging: "paper crosses foreground" },
              characters: [],
              camera: { framing: "close-up", angle: "low angle", perspective: "from side", focus: [] }
            }]
          }],
          terminalState: {
            paragraph: 2,
            environment: { location: "street", timeWeather: "day", lightingMood: [], backgroundElements: [] },
            environmentChanges: [],
            characters: []
          }
        }) })
      },
      imageGen: {
        getConnection: async () => ({ id: "cover-comfy", name: "Comfy", provider: "comfyui", model: "workflow" }),
        generate: async (request: { prompt: string }) => {
          const index = prompts.length;
          prompts.push(request.prompt);
          return { imageId: `image-${index}`, imageUrl: index === 0 ? "/cover.png" : "/scene.png", model: "workflow", provider: "comfyui" };
        }
      },
      userStorage: {
        getJson: async <T>(storagePath: string, options: { fallback: T }) => (files.has(storagePath) ? files.get(storagePath) : options.fallback) as T,
        setJson: async (storagePath: string, value: unknown) => { files.set(storagePath, structuredClone(value)); },
        exists: async (storagePath: string) => files.has(storagePath),
        read: async (storagePath: string) => JSON.stringify(files.get(storagePath)),
        write: async (storagePath: string, value: string) => { files.set(storagePath, JSON.parse(value)); },
        mkdir: async () => undefined
      },
      chat: {
        getMessages: async () => [message],
        updateMessage: async (_chatId: string, _messageId: string, patch: { content?: string; metadata?: Record<string, unknown> }) => {
          if (patch.content) message.content = patch.content;
          if (patch.metadata) message.metadata = patch.metadata;
          updates.push(message.content);
        }
      },
      sendToFrontend: (payload: Record<string, unknown>) => frontend.push(payload),
      log: { info: () => undefined, warn: () => undefined, error: () => undefined }
    };

    await generateForMessage("cover-chat", message.id, message.content, "cover-user", {
      config: generationConfig,
      messages: [message]
    });

    expect(prompts).toHaveLength(2);
    expect(updates.some((content) => content.includes("Generating cover image"))).toBe(true);
    expect(message.content.indexOf("/cover.png")).toBeLessThan(message.content.indexOf("First visual beat."));
    expect(message.content.indexOf("First visual beat.")).toBeLessThan(message.content.indexOf("/scene.png"));
    expect(message.content.indexOf("/scene.png")).toBeLessThan(message.content.indexOf("Second visual beat."));
    const completed = frontend.find((payload) => payload.type === "status" && payload.status === "Generated");
    expect((completed?.record as { slots?: Array<{ placement?: string }> })?.slots?.map((slot) => slot.placement))
      .toEqual(["cover", "paragraph"]);
    // The canonical typed boundary must be exercised end-to-end and persisted.
    const persistedPlan = (completed?.record as { illustrationPlan?: unknown })?.illustrationPlan;
    expect(persistedPlan).toBeDefined();
    expect((persistedPlan as { shots?: unknown[] } | undefined)?.shots).toHaveLength(1);
  });
});

describe("Fast Mode parser call sequencing", () => {
  const requests: Array<Record<string, unknown>> = [];
  const responses: unknown[] = [];
  const baseConfig = effectiveGenerationConfig({
    ...DEFAULT_CONFIG,
    fastMode: true,
    parserConnectionId: "fast-parser",
    includeCharacterInfo: true,
    includeUserInfo: true,
    includeLorebook: true,
    userInstructionsEnabled: true,
    previousVisualStateEnabled: false,
    preprocessingEnabled: true,
    parserRetries: 1,
    minImages: 1,
    maxImages: 1
  });
  const messages = [{ id: "message-1", role: "assistant", content: "A creative beat." }];
  const paragraphs = [{ parserIndex: 1, originalIndex: 1, text: "A creative beat." }];
  const state = { characterAppearance: { Elara: "silver hair" }, generated: {} };

  beforeEach(() => {
    requests.splice(0);
    responses.splice(0);
    (globalThis as typeof globalThis & { spindle: unknown }).spindle = {
      connections: {
        get: async () => ({ id: "fast-parser", name: "Fast", provider: "openai", model: "gpt-test" })
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

  const creativePayload = (perspectiveMode: string): Record<string, unknown> => ({
    scenes: [{
      place: "street",
      environment: { location: "street", timeWeather: "day" },
      shots: [{
        paragraph: 1,
        perspectiveMode,
        camera: { framing: "body-part focus", angle: "eye level", perspective: "from side" },
        ...(perspectiveMode === "creative" ? { renderScope: "shadow and pavement", visibleTags: ["shadow", "pavement"] } : {}),
        ...(perspectiveMode === "dynamic" ? {
          shotPlan: { primaryAction: "wind moves paper across the street", secondaryCue: "", staging: "paper crosses the foreground" }
        } : {}),
        characters: []
      }]
    }],
    terminalState: {
      paragraph: 1,
      place: "street",
      environment: { location: "street", timeWeather: "day", lightingMood: [], backgroundElements: [] },
      environmentChanges: [],
      characters: []
    }
  });

  test("manual Creative Fast Mode uses one compact main call and skips ideation and preprocessing", async () => {
    const config = effectiveGenerationConfig({
      ...baseConfig,
      adaptiveMode: false,
      perspectiveMode: "creative" as const
    });
    responses.push({ content: JSON.stringify(creativePayload("creative")) });

    const result = await parseAndSelectPrompts({
      chatId: "chat-1", messageId: "message-1", messages, paragraphs,
      state, config
    });

    expect(requests).toHaveLength(1);
    expect(result.selected[0]?.perspectiveMode).toBe("creative");
    expect(result.selected[0]?.creativeConcept).toBeUndefined();
    expect((requests[0].messages as Array<{ content: string }>)[0].content).toContain("# Image Tagging System");
    expect((requests[0].messages as Array<{ content: string }>)[0].content).not.toContain("Creative Illustration Concept Ideator");
  });

  test("manual Creative Fast Mode ignores stored concept candidates instead of filtering parsed shots", async () => {
    const config = effectiveGenerationConfig({
      ...baseConfig,
      adaptiveMode: false,
      perspectiveMode: "creative" as const
    });
    responses.push({ content: JSON.stringify(creativePayload("creative")) });

    const result = await parseAndSelectPrompts({
      chatId: "chat-1", messageId: "message-1", messages, paragraphs,
      state, config,
      creativeCandidates: [{
        id: "candidate-1",
        paragraph: 1,
        subjectType: "shadow",
        anchor: "long shadow",
        concept: "a long shadow crosses the pavement",
        renderScope: "shadow and pavement only",
        camera: "low oblique detail",
        visibleCues: ["long shadow", "pavement"],
        score: 92
      }]
    });

    expect(requests).toHaveLength(1);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.perspectiveMode).toBe("creative");
    expect(result.selected[0]?.creativeConcept).toBeUndefined();
  });

  test("Adaptive Fast Mode keeps a Creative shot without an ideation call instead of downgrading it", async () => {
    const config = effectiveGenerationConfig({ ...baseConfig, adaptiveMode: true });
    responses.push({ content: JSON.stringify(creativePayload("creative")) });

    const result = await parseAndSelectPrompts({
      chatId: "chat-1", messageId: "message-1", messages, paragraphs,
      state, config
    });

    expect(requests).toHaveLength(1);
    expect(result.selected[0]?.perspectiveMode).toBe("creative");
    expect(result.selected[0]?.creativeConcept).toBeUndefined();
  });

  test("Adaptive Fast Mode parses a Dynamic shot with a single call", async () => {
    const config = effectiveGenerationConfig({ ...baseConfig, adaptiveMode: true });
    responses.push({ content: JSON.stringify(creativePayload("dynamic")) });

    const result = await parseAndSelectPrompts({
      chatId: "chat-1", messageId: "message-1", messages, paragraphs,
      state, config
    });

    expect(requests).toHaveLength(1);
    expect(result.selected[0]?.perspectiveMode).toBe("dynamic");
  });
});


describe("Fast Mode sidecar rerun", () => {
  test("reruns a stored Creative image end-to-end with one compact call, no ideation, and persisted replacement", async () => {
    const files = new Map<string, unknown>();
    const requests: Array<Record<string, unknown>> = [];
    const message: { id: string; role: string; content: string; metadata: Record<string, unknown>; swipe_id: number } = {
      id: "message-1",
      role: "assistant",
      content: "A creative beat.",
      metadata: {
        inlayIllustratorImageIds: ["old-id"],
        inlayIllustratorParagraphs: [1],
        inlayIllustratorGeneratedAt: "2026-07-18T00:00:00.000Z",
        inlayIllustratorOperationId: "op-1",
        inlayIllustratorGenerationStatus: "completed"
      },
      swipe_id: 0
    };
    const storedCandidate = {
      id: "candidate-1",
      paragraph: 1,
      subjectType: "shadow",
      anchor: "long shadow",
      concept: "a long shadow crosses the pavement",
      renderScope: "shadow and pavement only",
      camera: "low oblique detail",
      visibleCues: ["long shadow", "pavement"],
      score: 92
    };
    const record = {
      chatId: "fast-chat",
      messageId: "message-1",
      swipeId: 0,
      prompts: ["a long shadow crosses the pavement"],
      negativePrompts: [""],
      perspectiveModes: ["creative"],
      perspectiveSources: ["manual"],
      imageParameters: [{}],
      corePrompts: ["a long shadow crosses the pavement"],
      shotNegatives: [""],
      promptFormats: ["ordered"],
      creativeConcepts: [storedCandidate],
      creativeConceptCandidates: [[storedCandidate]],
      creativeConceptHistory: [[]],
      paragraphs: [1],
      imageIds: ["old-id"],
      imageUrls: ["/old.png"],
      slotStatuses: ["completed"],
      slotErrors: [""],
      operationId: "op-1",
      generationStatus: "completed",
      sourceFingerprint: "abc",
      rawJson: { scenes: [] },
      createdAt: "2026-07-18T00:00:00.000Z"
    };
    files.set("states/fast-chat.json", {
      characterAppearance: { Elara: "silver hair" },
      generated: { "fast-chat:message-1:0": record }
    });

    const generationConfig = {
      ...DEFAULT_CONFIG,
      fastMode: true,
      parserConnectionId: "fast-parser",
      imageConnectionId: "fast-comfy",
      includeCharacterInfo: false,
      includeUserInfo: false,
      includeLorebook: false,
      userInstructionsEnabled: false,
      previousVisualStateEnabled: false,
      adaptiveMode: false,
      perspectiveMode: "creative" as const,
      minImages: 1,
      maxImages: 1
    };
    (globalThis as typeof globalThis & { spindle: unknown }).spindle = {
      connections: {
        get: async () => ({ id: "fast-parser", name: "Fast", provider: "openai", model: "gpt-test" })
      },
      generate: {
        raw: async (request: Record<string, unknown>) => {
          requests.push(request);
          return { content: JSON.stringify({
            scenes: [{
              place: "street",
              environment: { location: "street", timeWeather: "day" },
              shots: [{
                paragraph: 1,
                perspectiveMode: "creative",
                camera: { framing: "body-part focus", angle: "eye level", perspective: "from side" },
                renderScope: "shadow and pavement",
                visibleTags: ["shadow", "pavement"],
                characters: []
              }]
            }],
            terminalState: {
              paragraph: 1,
              place: "street",
              environment: { location: "street", timeWeather: "day", lightingMood: [], backgroundElements: [] },
              environmentChanges: [],
              characters: []
            }
          }) }
        }
      },
      imageGen: {
        getConnection: async () => ({ id: "fast-comfy", name: "Comfy", provider: "comfyui", model: "workflow" }),
        generate: async () => ({ imageId: "rerun-id", imageUrl: "/rerun.png", imageDataUrl: "", model: "workflow", provider: "comfyui" })
      },
      userStorage: {
        getJson: async <T>(path: string, options: { fallback: T }) => (files.has(path) ? files.get(path) : options.fallback) as T,
        setJson: async (path: string, value: unknown) => { files.set(path, structuredClone(value)); },
        exists: async (path: string) => files.has(path),
        read: async (path: string) => JSON.stringify(files.get(path)),
        write: async (path: string, value: string) => { files.set(path, JSON.parse(value)); },
        mkdir: async () => undefined
      },
      chat: {
        getMessages: async () => [message],
        updateMessage: async (_chatId: string, _messageId: string, patch: { content?: string; metadata?: Record<string, unknown> }) => {
          if (patch.content) message.content = patch.content;
          if (patch.metadata) message.metadata = patch.metadata;
        }
      },
      sendToFrontend: () => undefined,
      log: { info: () => undefined, warn: () => undefined, error: () => undefined }
    };

    const committed = await rerunStoredImage(
      { chatId: "fast-chat", messageId: "message-1", swipeId: 0, imageIndex: 0, imageId: "old-id" },
      true,
      "fast-user",
      generationConfig
    );

    expect(requests).toHaveLength(1);
    expect((requests[0].messages as Array<{ content: string }>)[0].content).toContain("# Image Tagging System");
    expect((requests[0].messages as Array<{ content: string }>)[0].content).not.toContain("Creative Illustration Concept Ideator");
    expect(committed.index).toBe(0);
    expect(committed.record.slots[0]?.imageUrl).toBe("/rerun.png");
    expect(committed.record.slots[0]?.imageId).toBe("rerun-id");
    expect(committed.record.slots[0]?.perspectiveMode).toBe("creative");
    expect(committed.record.slots[0]?.creativeConcept).toBeNull();
    expect(message.metadata.inlayIllustratorImageIds).toEqual(["rerun-id"]);
    // The replacement must be persisted through the record file, not just in memory.
    const storedState = files.get("states/fast-chat.json") as { generated: Record<string, unknown> };
    expect(storedState.generated["fast-chat:message-1:0"]).toMatchObject({ storageVersion: 3 });
  });
});
