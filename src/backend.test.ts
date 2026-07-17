import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { InterceptorResultDTO, LlmMessageDTO } from "lumiverse-spindle-types";

const parserRequests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
type PromptInterceptor = (
  messages: LlmMessageDTO[],
  context: unknown
) => Promise<LlmMessageDTO[] | InterceptorResultDTO>;
type FrontendMessageHandler = (payload: unknown, userId?: string) => Promise<void>;
let parserResponse = "";
let promptInterceptor: PromptInterceptor;
let frontendMessageHandler: FrontendMessageHandler;
let helpers: typeof import("./backend").__testables;
const storedFiles = new Map<string, string>();
const storageWrites: string[] = [];
const frontendMessages: unknown[] = [];
let rejectedWritePath = "";

function storageKey(path: string, userId?: string): string {
  return JSON.stringify([userId ?? null, path]);
}

beforeAll(async () => {
  (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle = {
    registerInterceptor: (handler: PromptInterceptor) => {
      promptInterceptor = handler;
    },
    on: () => undefined,
    onFrontendMessage: (handler: FrontendMessageHandler) => {
      frontendMessageHandler = handler;
    },
    userStorage: {
      exists: async (path: string, userId?: string) => storedFiles.has(storageKey(path, userId)),
      read: async (path: string, userId?: string) => {
        const value = storedFiles.get(storageKey(path, userId));
        if (value === undefined) throw new Error(`Missing test file: ${path}`);
        return value;
      },
      mkdir: async () => undefined,
      write: async (path: string, value: string, userId?: string) => {
        storageWrites.push(storageKey(path, userId));
        if (path === rejectedWritePath) throw new Error("Storage unavailable.");
        storedFiles.set(storageKey(path, userId), value);
      }
    },
    connections: { list: async () => [] },
    sendToFrontend: (message: unknown) => {
      frontendMessages.push(message);
    },
    generate: {
      raw: async (request: { messages: Array<{ role: string; content: string }> }) => {
        parserRequests.push(request);
        return { content: parserResponse };
      }
    },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined }
  };
  helpers = (await import("./backend")).__testables;
});
beforeEach(() => {
  parserRequests.splice(0);
  storedFiles.clear();
  storageWrites.splice(0);
  frontendMessages.splice(0);
  rejectedWritePath = "";
  parserResponse = "";
});

describe("character-memory frontend messages", () => {
  test("persists a sanitized rename and emits only a chat-scoped committed memory update", async () => {
    storedFiles.set(storageKey("states/chat-1.json", "user-1"), JSON.stringify({
      characterAppearance: { Alice: "red hair", Bob: "black hair" },
      generated: { existing: { imageIds: ["kept"] } }
    }));

    await frontendMessageHandler({
      type: "character_tags_update",
      chatId: "chat-1",
      oldName: "alice",
      name: " Alicia (source) ",
      tags: "blue hair, standing, open shirt, none"
    }, "user-1");

    expect(JSON.parse(storedFiles.get(storageKey("states/chat-1.json", "user-1")) || "{}")).toEqual({
      characterAppearance: { Bob: "black hair", Alicia: "blue hair" },
      generated: { existing: { imageIds: ["kept"] } }
    });
    expect(frontendMessages).toEqual([{
      type: "character_memory_updated",
      chatId: "chat-1",
      characterAppearance: { Bob: "black hair", Alicia: "blue hair" }
    }]);
  });

  test("persists Delete and emits its committed chat-scoped memory", async () => {
    storedFiles.set(storageKey("states/chat-1.json", "user-1"), JSON.stringify({
      characterAppearance: { Alice: "red hair", Bob: "black hair" },
      generated: {}
    }));

    await frontendMessageHandler({
      type: "character_tags_delete",
      chatId: "chat-1",
      name: "ALICE"
    }, "user-1");

    expect(frontendMessages).toEqual([{
      type: "character_memory_updated",
      chatId: "chat-1",
      characterAppearance: { Bob: "black hair" }
    }]);
  });

  test("reports validation and storage failures without replacing saved memory", async () => {
    const original = JSON.stringify({ characterAppearance: { Alice: "red hair" }, generated: {} });
    const path = storageKey("states/chat-1.json", "user-1");
    storedFiles.set(path, original);

    await frontendMessageHandler({
      type: "character_tags_update",
      chatId: "chat-1",
      oldName: "Alice",
      name: " ",
      tags: "blue hair"
    }, "user-1");

    expect(storedFiles.get(path)).toBe(original);
    expect(storageWrites).toEqual([]);
    expect(frontendMessages).toEqual([{
      type: "status",
      status: "Error",
      error: "Character name is required."
    }]);

    frontendMessages.splice(0);
    rejectedWritePath = "states/chat-1.json";
    await frontendMessageHandler({
      type: "character_tags_update",
      chatId: "chat-1",
      oldName: "Alice",
      name: "Alice",
      tags: "blue hair"
    }, "user-1");

    expect(storedFiles.get(path)).toBe(original);
    expect(frontendMessages).toEqual([{
      type: "status",
      status: "Error",
      error: "Storage unavailable."
    }]);
  });
});

describe("configuration frontend messages", () => {
  test("acknowledges a saved field without sending a full panel state", async () => {
    await frontendMessageHandler({
      type: "set_config",
      chatId: "chat-1",
      patch: { customParserInstructions: "keep typing" }
    }, "user-1");

    expect(frontendMessages).toHaveLength(1);
    expect(frontendMessages[0]).toMatchObject({
      type: "config_updated",
      chatId: "chat-1",
      config: { customParserInstructions: "keep typing" }
    });
  });
});

describe("primary-model context interceptor", () => {
  test("runs for every generation flow and preserves non-content message data", async () => {
    const inlay = '<!-- inlay_illustrator -->\n<div data-inlay-illustrator="true"><img src="/generated.png" data-inlay-illustrator-prompt="secret"><pre class="inlay-illustrator-prompt" hidden>secret</pre></div>';
    const system: LlmMessageDTO = { role: "system", content: inlay };
    const user: LlmMessageDTO = { role: "user", content: inlay };
    const imagePart = { type: "image" as const, data: "image-data", mime_type: "image/png" };
    const toolResultPart = {
      type: "tool_result" as const,
      tool_use_id: "tool-1",
      content: inlay,
      is_error: false
    };
    const assistant: LlmMessageDTO = {
      role: "assistant",
      content: `${inlay}\n\nAssistant narrative.`,
      name: "narrator",
      reasoning_content: inlay,
      __isChatHistory: true,
      sourceMessageId: "assistant-1",
      sourceIndexInChat: 4
    };
    const multipart: LlmMessageDTO = {
      role: "assistant",
      content: [
        { type: "text", text: `Before.\n\n${inlay}\n\nAfter.` },
        imagePart,
        toolResultPart
      ],
      reasoning_content: "reasoning stays"
    };
    const messages = [system, user, assistant, multipart];
    const generationTypes = ["normal", "regenerate", "swipe", "continue", "impersonate"];

    expect(typeof promptInterceptor).toBe("function");
    for (const generationType of generationTypes) {
      const result = await promptInterceptor(messages, { generationType });
      expect(Array.isArray(result)).toBe(true);
      if (!Array.isArray(result)) throw new Error("Expected the interceptor to return messages.");

      expect(result[0]).toBe(system);
      expect(result[1]).toBe(user);
      expect(result[2]).toEqual({
        ...assistant,
        content: "Assistant narrative."
      });
      expect(result[2].reasoning_content).toBe(inlay);
      expect(result[2].sourceMessageId).toBe("assistant-1");
      expect(result[2].sourceIndexInChat).toBe(4);

      const parts = result[3].content;
      expect(Array.isArray(parts)).toBe(true);
      if (!Array.isArray(parts)) throw new Error("Expected multipart content.");
      expect(parts[0]).toEqual({ type: "text", text: "Before.\n\nAfter." });
      expect(parts[1]).toBe(imagePart);
      expect(parts[2]).toBe(toolResultPart);
    }

    expect(assistant.content).toContain("secret");
    expect(Array.isArray(multipart.content) && multipart.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("secret")
    });
  });
});

function promptWithPreset() {
  const config = {
    ...helpers.DEFAULT_CONFIG,
    promptStyle: "default" as const,
    promptSyntax: "nai" as const,
    customPositivePrefix: "custom positive",
    customPositiveSuffix: "custom suffix",
    customNegative: "custom negative",
    promptPresets: [{
      id: "cinematic",
      name: "Cinematic",
      positivePrefix: "preset positive",
      negativePrefix: "preset negative"
    }],
    activePromptPresetId: "cinematic"
  };
  return {
    config,
    entry: helpers.assemblePrompt({ place: "garden" }, {
      situation: "1girl",
      camera: "upper body",
      action: "smiling",
      characters: [{ label: "girl", appearance: "blonde hair" }],
      negative: "shot negative"
    }, config, 1, 1)
  };
}

describe("prompt presets", () => {
  test("places active preset prefixes before custom and generated prompt fields", () => {
    const { config, entry } = promptWithPreset();

    expect(helpers.renderPrompt(entry.prompt, config.promptSyntax)).toBe(
      "preset positive, custom positive, upper body, 1girl, smiling, garden, girl, blonde hair, custom suffix"
    );
    expect(entry.negative).toBe("preset negative, custom negative, shot negative");
  });

  test("normalizes persisted presets and clears an invalid active selection", () => {
    const config = helpers.normalizeConfig({
      promptPresets: [
        { id: "cinematic", name: "Cinematic", positivePrefix: "quality", negativePrefix: "lowres" },
        { id: "cinematic", name: "Duplicate", positivePrefix: "", negativePrefix: "" },
        { id: "", name: "Missing ID", positivePrefix: "", negativePrefix: "" }
      ],
      activePromptPresetId: "missing"
    });

    expect(config.promptPresets).toEqual([{ id: "cinematic", name: "Cinematic", positivePrefix: "quality", negativePrefix: "lowres" }]);
    expect(config.activePromptPresetId).toBeNull();
    expect(helpers.activePromptPreset(config)).toBeNull();
  });
});

describe("illustration parser construction", () => {
  const paragraphs = [
    { parserIndex: 1, originalIndex: 1, text: "She enters the empty station." },
    { parserIndex: 2, originalIndex: 2, text: "A train bursts through the rain." },
    { parserIndex: 3, originalIndex: 3, text: "She reaches for the closing door." },
    { parserIndex: 4, originalIndex: 4, text: "Their hands meet through the glass." },
    { parserIndex: 5, originalIndex: 5, text: "The platform falls silent." }
  ];

  test("places schema guidance and continuity in system messages, current paragraphs in the user request, and overrides last", () => {
    const guidance = helpers.parserInstruction(helpers.DEFAULT_CONFIG);
    const reference = helpers.continuityReference("## Character baseline\nred coat", "assistant: earlier scene");
    const request = helpers.parserUserRequest(helpers.formatTargetParagraphs(paragraphs));
    const messages = helpers.parserMessages(guidance, reference, request, "Prefer the rain-soaked climax.");

    expect(messages.map((message) => message.role)).toEqual(["system", "system", "user", "user"]);
    expect(messages[0].content).toContain("# Image Tagging System");
    expect(messages[0].content).toContain('"scenes"');
    expect(messages[0].content).not.toContain("She enters the empty station.");
    expect(messages[1].content).toContain("# Continuity Reference Only");
    expect(messages[1].content).toContain("Never restore outdated scene facts");
    expect(messages[2].content).toContain("[P1]\nShe enters the empty station.");
    expect(messages.at(-1)?.content).toContain("Prefer the rain-soaked climax.");
  });

  test("requires batch-wide cinematic contrast without weakening visual continuity", () => {
    const guidance = helpers.parserInstruction(helpers.DEFAULT_CONFIG);

    expect(guidance).toContain("most visually consequential");
    expect(guidance).toContain("at least two of these dimensions");
    expect(guidance).toContain("alternate shots of the same paragraph");
    expect(guidance).toContain("stable appearance, attire, location, and persistent actions");
    expect(guidance).toContain("Continuity does not require repeating camera angle");
    expect(guidance).toContain("continuous pov only when the narrative establishes");
    expect(helpers.parserInstruction({ ...helpers.DEFAULT_CONFIG, mode: "asset" })).not.toContain("at least two of these dimensions");
    expect(helpers.parserInstruction({ ...helpers.DEFAULT_CONFIG, mode: "asset" })).not.toContain("Vary those deliberately");
  });

  test("asks preprocessing for significant visual beats and a camera/composition note", () => {
    const instruction = helpers.preprocessingInstruction(paragraphs, { ...helpers.DEFAULT_CONFIG, minImages: 3, maxImages: 4 });

    expect(instruction).toContain("Select between 3 and 4 unique paragraphs");
    expect(instruction).toContain("most significant visual changes");
    expect(instruction).toContain("Do not favor early paragraphs");
    expect(instruction).toContain("Camera/composition");
  });

  test("keeps lorebook prose out of the optional preprocessing request", async () => {
    const config = { ...helpers.DEFAULT_CONFIG, preprocessingEnabled: true, minImages: 1, maxImages: 2 };
    parserResponse = [
      "[Appearance: woman: black hair, red coat]",
      "[P2]: Visual beat: train entering station; Camera/composition: low wide shot"
    ].join("\n");

    await helpers.preprocessTargetParagraphs(
      { id: "parser", name: "Parser", provider: "openai", model: "model" },
      config,
      paragraphs,
      {
        systemContext: "BASELINE CONTEXT\n\nSECRET LOREBOOK PROSE",
        preprocessingSystemContext: "BASELINE CONTEXT",
        recentContext: "",
        override: "",
        diagnostics: {}
      }
    );

    const contextMessage = parserRequests[0].messages.find((message) => message.role === "system" && message.content.includes("Continuity Reference"));
    expect(contextMessage?.content).toContain("BASELINE CONTEXT");
    expect(contextMessage?.content).not.toContain("SECRET LOREBOOK PROSE");
  });

  test("accepts a valid selected subset and rejects missing, malformed, duplicate, unknown, or camera-less markers", () => {
    const config = { ...helpers.DEFAULT_CONFIG, minImages: 2, maxImages: 3 };
    const valid = [
      "[Appearance: woman: black hair, red coat]",
      "[P4]: Visual beat: hands against wet glass; Camera/composition: close-up through rain-streaked window",
      "[P2]: Visual beat: train entering station; Camera/composition: low wide shot with rails in foreground"
    ].join("\n");

    expect(helpers.validatePreprocessedTarget(valid, paragraphs, config)).toMatchObject({ selectedParagraphs: [4, 2] });
    expect(helpers.validatePreprocessedTarget(valid.split("\n").slice(0, 2).join("\n"), paragraphs, config)).toBeNull();
    expect(helpers.validatePreprocessedTarget(valid.replace("[P4]", "[Paragraph 4]"), paragraphs, config)).toBeNull();
    expect(helpers.validatePreprocessedTarget(valid.replace("[P2]", "[P4]"), paragraphs, config)).toBeNull();
    expect(helpers.validatePreprocessedTarget(valid.replace("[P4]", "[P9]"), paragraphs, config)).toBeNull();
    expect(helpers.validatePreprocessedTarget(valid.replace("Camera/composition:", "Composition:"), paragraphs, config)).toBeNull();
  });

  test("falls back to raw numbered paragraphs when preprocessing output is invalid", async () => {
    const config = { ...helpers.DEFAULT_CONFIG, preprocessingEnabled: true, minImages: 3, maxImages: 4 };
    parserResponse = [
      "[Appearance: woman: black hair, red coat]",
      "[P4]: Visual beat: hands meet; Camera/composition: close-up through glass"
    ].join("\n");

    const result = await helpers.preprocessTargetParagraphs(
      { id: "parser", name: "Parser", provider: "openai", model: "model" },
      config,
      paragraphs,
      { systemContext: "baseline", recentContext: "history", override: "focus on drama", diagnostics: {} }
    );

    expect(result).toBe(helpers.formatTargetParagraphs(paragraphs));
    expect(parserRequests[0].messages.map((message) => message.role)).toEqual(["system", "system", "user", "user"]);
    expect(parserRequests[0].messages[2].content).toContain("[P5]\nThe platform falls silent.");
  });
});

describe("illustration candidate selection", () => {
  test("keeps distinct same-paragraph shots, collapses exact duplicates, ignores invalid references, and caps before paragraph sorting", () => {
    const paragraphs = [
      { parserIndex: 1, originalIndex: 10, text: "First" },
      { parserIndex: 2, originalIndex: 20, text: "Second" },
      { parserIndex: 3, originalIndex: 30, text: "Third" }
    ];
    const firstThird = {
      paragraph: 3, camera: "from below, wide shot", situation: "1girl", action: "running",
      characters: [{ name: "A", label: "girl", appearance: "black hair", expression: "afraid", action: "looking back" }],
      supplement: "Deep platform perspective with rails in the foreground."
    };
    const payload = { scenes: [{ place: "exterior, station", shots: [
      firstThird,
      { paragraph: 1, camera: "close-up, from side", situation: "1girl", action: "reaching", characters: [{ expression: "determined", action: "arm outstretched" }], supplement: "Her hand dominates the foreground." },
      { ...firstThird, characters: [{ ...firstThird.characters[0], appearance: "black hair, red coat" }] },
      { paragraph: 3, camera: "from above, full body", situation: "1girl", action: "running", characters: [{ expression: "afraid", action: "looking back" }], supplement: "The lone figure is boxed in by converging platforms." },
      { paragraph: 9, camera: "portrait", situation: "1girl", action: "smiling", characters: [] },
      { paragraph: 2, camera: "straight-on", situation: "1girl", action: "waiting", characters: [] }
    ] }] };
    const config = { ...helpers.DEFAULT_CONFIG, maxImages: 3, promptStyle: "default" as const, promptSyntax: "nai" as const };

    const selected = helpers.selectPromptEntries(payload, paragraphs, config);

    expect(selected.map((entry) => entry.parserParagraph)).toEqual([1, 3, 3]);
    expect(selected.map((entry) => entry.paragraph)).toEqual([10, 30, 30]);
    expect(selected.map((entry) => helpers.renderPrompt(entry.prompt, config.promptSyntax))).toEqual([
      expect.stringContaining("close-up, from side"),
      expect.stringContaining("from below, wide shot"),
      expect.stringContaining("from above, full body")
    ]);
  });
});

describe("illustration defaults", () => {
  test("uses 3-5 only for missing values and preserves explicit stored values", () => {
    expect(helpers.normalizeConfig({})).toMatchObject({ minImages: 3, maxImages: 5 });
    expect(helpers.normalizeConfig({ minImages: 1, maxImages: 2 })).toMatchObject({ minImages: 1, maxImages: 2 });
    expect(helpers.normalizeConfig({ minImages: 6, maxImages: 4 })).toMatchObject({ minImages: 4, maxImages: 6 });
  });
});

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const imageJobs = [
  { index: 0, total: 3, prompt: "first prompt", negative: "", paragraph: 3, parameters: {} },
  { index: 1, total: 3, prompt: "second prompt", negative: "", paragraph: 1, parameters: {} },
  { index: 2, total: 3, prompt: "third prompt", negative: "", paragraph: 2, parameters: {} }
];

describe("image preparation and generation pipeline", () => {
  test("submits each ComfyUI image as soon as its sequential cleanup completes", async () => {
    const preparations = imageJobs.map(() => deferred<(typeof imageJobs)[number]>());
    const generations = imageJobs.map(() => deferred<{ imageId: string }>());
    const preparing: number[] = [];
    const submitted: number[] = [];
    const events: string[] = [];
    const completed = helpers.prepareAndDispatchImageJobs([0, 1, 2], true, (index) => {
      preparing.push(index);
      events.push(`cleanup ${index}`);
      return preparations[index].promise;
    }, (job) => {
      submitted.push(job.index);
      events.push(`generate ${job.index}`);
      return generations[job.index].promise;
    });

    expect(preparing).toEqual([0]);
    expect(submitted).toEqual([]);

    preparations[0].resolve(imageJobs[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0]);
    expect(preparing).toEqual([0, 1]);
    expect(events).toEqual(["cleanup 0", "generate 0", "cleanup 1"]);

    preparations[1].resolve(imageJobs[1]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0, 1]);
    expect(preparing).toEqual([0, 1, 2]);

    preparations[2].resolve(imageJobs[2]);
    generations[2].resolve({ imageId: "third" });
    generations[0].resolve({ imageId: "first" });
    generations[1].resolve({ imageId: "second" });

    const { jobs, results } = await completed;
    expect(jobs.map((job) => job.index)).toEqual([0, 1, 2]);
    expect(results.map((result) => result.imageId)).toEqual(["first", "second", "third"]);
  });

  test("overlaps later cleanup with generation while keeping non-ComfyUI requests serial", async () => {
    const preparations = imageJobs.map(() => deferred<(typeof imageJobs)[number]>());
    const generations = imageJobs.map(() => deferred<string>());
    const preparing: number[] = [];
    const submitted: number[] = [];
    const completed = helpers.prepareAndDispatchImageJobs([0, 1, 2], false, (index) => {
      preparing.push(index);
      return preparations[index].promise;
    }, (job) => {
      submitted.push(job.index);
      return generations[job.index].promise;
    });

    preparations[0].resolve(imageJobs[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0]);
    expect(preparing).toEqual([0, 1]);

    preparations[1].resolve(imageJobs[1]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0]);
    expect(preparing).toEqual([0, 1, 2]);

    preparations[2].resolve(imageJobs[2]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0]);

    generations[0].resolve("first");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0, 1]);
    generations[1].resolve("second");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0, 1, 2]);
    generations[2].resolve("third");

    await expect(completed).resolves.toEqual({ jobs: imageJobs, results: ["first", "second", "third"] });
  });

  test("waits for every eagerly submitted job before propagating a failure", async () => {
    const generations = imageJobs.map(() => deferred<string>());
    const submitted: number[] = [];
    const failure = new Error("first job failed");
    const completed = helpers.prepareAndDispatchImageJobs([0, 1, 2], true, (index) => imageJobs[index], (job) => {
      submitted.push(job.index);
      return generations[job.index].promise;
    });
    let settled = false;
    void completed.catch(() => { settled = true; });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submitted).toEqual([0, 1, 2]);
    generations[0].reject(failure);
    generations[1].resolve("second");
    await Promise.resolve();
    expect(settled).toBe(false);
    generations[2].resolve("third");

    await expect(completed).rejects.toBe(failure);
  });

  test("waits for submitted generation before propagating a later preparation failure", async () => {
    const generation = deferred<string>();
    const preparationFailure = new Error("second cleanup failed");
    const completed = helpers.prepareAndDispatchImageJobs([0, 1], true, (index) => {
      if (index === 1) throw preparationFailure;
      return imageJobs[index];
    }, () => generation.promise);
    let settled = false;
    void completed.catch(() => { settled = true; });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    generation.resolve("first");

    await expect(completed).rejects.toBe(preparationFailure);
  });
});
