import { beforeAll, beforeEach, describe, expect, test } from "bun:test";

const cleanupRequests: Array<{ tags: string[] }> = [];
const parserRequests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
type CleanupResponse = { status?: number; statusText?: string; body?: unknown };
let cleanupHandler: (request: { tags: string[] }) => CleanupResponse | Promise<CleanupResponse>;
let parserResponse = "";
let helpers: typeof import("./backend").__testables;

function defaultCleanupResponse(): CleanupResponse {
  return {
    status: 200,
    body: JSON.stringify({ suggestions: { garden: [{ tag: "outdoors", score: 0.95 }] } })
  };
}

beforeAll(async () => {
  (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle = {
    on: () => undefined,
    onFrontendMessage: () => undefined,
    cors: async (_endpoint: string, request: { body: string }) => {
      const parsed = JSON.parse(request.body) as { tags: string[] };
      cleanupRequests.push(parsed);
      return cleanupHandler(parsed);
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
  cleanupRequests.splice(0);
  parserRequests.splice(0);
  cleanupHandler = defaultCleanupResponse;
  parserResponse = "";
});

function promptWithSupplement(danbooruCleanup: boolean) {
  const config = {
    ...helpers.DEFAULT_CONFIG,
    promptStyle: "default" as const,
    promptSyntax: "nai" as const,
    customPositivePrefix: "quality",
    customPositiveSuffix: "masterpiece",
    danbooruCleanup,
    danbooruEndpoint: "http://cleanup.test/validate"
  };
  return {
    config,
    prompt: helpers.assemblePrompt({ place: "garden" }, {
      situation: "1girl",
      camera: "upper body",
      action: "smiling",
      characters: [{ label: "girl", appearance: "blonde hair" }],
      supplement: "A cinematic composition places her among softly lit flowers."
    }, config, 1, 1).prompt
  };
}

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

describe("Danbooru cleanup", () => {
  test("sends only tags to cleanup and appends the supplement verbatim", async () => {
    const { config, prompt } = promptWithSupplement(true);

    const finalPrompt = await helpers.cleanupPrompt(prompt, config);

    expect(cleanupRequests).toEqual([{
      tags: ["quality", "upper body", "1girl", "smiling", "garden", "girl", "blonde hair", "masterpiece"]
    }]);
    expect(finalPrompt).toBe(
      "quality, upper body, 1girl, smiling, outdoors, girl, blonde hair, A cinematic composition places her among softly lit flowers., masterpiece"
    );
  });

  test("keeps the existing prompt unchanged when cleanup is disabled", async () => {
    const { config, prompt } = promptWithSupplement(false);

    const finalPrompt = await helpers.cleanupPrompt(prompt, config);

    expect(cleanupRequests).toEqual([]);
    expect(finalPrompt).toBe(helpers.renderPrompt(prompt, config.promptSyntax));
  });

  test("splits large cleanup lists into ordered batches of at most 16 tags", async () => {
    const tags = Array.from({ length: 35 }, (_, index) => `tag ${index + 1}`);
    const config = { ...helpers.DEFAULT_CONFIG, danbooruCleanup: true, danbooruEndpoint: "http://cleanup.test/validate" };
    cleanupHandler = () => ({ status: 200, body: JSON.stringify({ valid: [] }) });

    await helpers.cleanupPrompt({ tagSections: [tags.join(", ")], supplement: "", supplementAfterTagSections: 1 }, config);

    expect(cleanupRequests.map((request) => request.tags)).toEqual([
      tags.slice(0, 16),
      tags.slice(16, 32),
      tags.slice(32)
    ]);
    expect(cleanupRequests.every((request) => request.tags.length <= 16)).toBe(true);
  });

  test("merges candidate validation and suggestions returned by different batches", async () => {
    const tags = [...Array.from({ length: 15 }, (_, index) => `tag ${index + 1}`), "exterior"];
    const config = {
      ...helpers.DEFAULT_CONFIG,
      promptSyntax: "nai" as const,
      danbooruCleanup: true,
      danbooruEndpoint: "http://cleanup.test/validate"
    };
    cleanupHandler = ({ tags: batch }) => batch[0] === "tag 1"
      ? {
          status: 200,
          body: JSON.stringify({ suggestions: { "tag 1": [{ tag: "first suggestion", score: 0.91 }] } })
        }
      : {
          status: 200,
          body: JSON.stringify({
            data: {
              valid: ["outdoors"],
              suggestions: { exterior: [{ tag: "second suggestion", score: 0.93 }] }
            }
          })
        };

    const finalPrompt = await helpers.cleanupPrompt({
      tagSections: [tags.join(", ")],
      supplement: "",
      supplementAfterTagSections: 1
    }, config);

    expect(cleanupRequests.map((request) => request.tags)).toEqual([tags, ["outdoors"]]);
    expect(finalPrompt).toStartWith("first suggestion, tag 2");
    expect(finalPrompt).toEndWith("tag 15, outdoors");
    expect(finalPrompt).not.toContain("tag 1,");
    expect(finalPrompt).not.toContain("exterior");
    expect(finalPrompt).not.toContain("second suggestion");
  });

  test("keeps valid originals and replaces invalid tags with only the best confident suggestion", async () => {
    const config = {
      ...helpers.DEFAULT_CONFIG,
      promptSyntax: "nai" as const,
      danbooruCleanup: true,
      danbooruEndpoint: "http://cleanup.test/validate"
    };
    cleanupHandler = () => ({
      status: 200,
      body: JSON.stringify({
        valid: ["valid original"],
        suggestions: {
          "valid original": [{ tag: "unwanted replacement", score: 0.99 }],
          "replace me": [
            { tag: "weaker replacement", score: 0.89 },
            { tag: "best replacement", score: 0.96 }
          ],
          "low confidence": [{ tag: "uncertain replacement", score: 0.879 }]
        }
      })
    });

    const finalPrompt = await helpers.cleanupPrompt({
      tagSections: ["valid original, replace me, low confidence, unmatched"],
      supplement: "",
      supplementAfterTagSections: 1
    }, config);

    expect(finalPrompt).toBe("valid original, best replacement, low confidence, unmatched");
  });

  test("uses the most specific validated descriptor plus validated hair length regardless of word order", async () => {
    const config = {
      ...helpers.DEFAULT_CONFIG,
      promptSyntax: "nai" as const,
      danbooruCleanup: true,
      danbooruEndpoint: "http://cleanup.test/validate"
    };
    cleanupHandler = () => ({
      status: 200,
      body: JSON.stringify({ valid: ["golden blonde hair", "blonde hair", "short hair"] })
    });

    const finalPrompt = await helpers.cleanupPrompt({
      tagSections: ["golden blonde short hair, short golden blonde hair"],
      supplement: "",
      supplementAfterTagSections: 1
    }, config);

    expect(cleanupRequests).toEqual([{ tags: [
      "golden blonde short hair", "golden blonde hair", "blonde hair", "short hair", "short golden blonde hair"
    ] }]);
    expect(finalPrompt).toBe("golden blonde hair, short hair");
  });

  test("replaces the reported compound samples and globally deduplicates their validated tags", async () => {
    const config = {
      ...helpers.DEFAULT_CONFIG,
      promptSyntax: "nai" as const,
      danbooruCleanup: true,
      danbooruEndpoint: "http://cleanup.test/validate"
    };
    cleanupHandler = () => ({
      status: 200,
      body: JSON.stringify({ valid: ["red eyes", "blonde hair", "short hair"] })
    });

    const finalPrompt = await helpers.cleanupPrompt({
      tagSections: ["red eyes, brilliant red eyes", "golden blonde short hair"],
      supplement: "",
      supplementAfterTagSections: 2
    }, config);

    expect(finalPrompt).toBe("red eyes, blonde hair, short hair");
    expect(finalPrompt).not.toContain("brilliant red eyes");
    expect(finalPrompt).not.toContain("golden blonde short hair");
  });

  test("waits for each cleanup batch before submitting the next", async () => {
    const first = deferred<CleanupResponse>();
    const second = deferred<CleanupResponse>();
    const tags = Array.from({ length: 17 }, (_, index) => `tag ${index + 1}`);
    const config = { ...helpers.DEFAULT_CONFIG, danbooruCleanup: true, danbooruEndpoint: "http://cleanup.test/validate" };
    cleanupHandler = ({ tags: batch }) => batch[0] === "tag 1" ? first.promise : second.promise;

    const completed = helpers.cleanupPrompt({ tagSections: [tags.join(", ")], supplement: "", supplementAfterTagSections: 1 }, config);
    expect(cleanupRequests).toEqual([{ tags: tags.slice(0, 16) }]);

    first.resolve({ status: 200, body: JSON.stringify({ valid: [] }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cleanupRequests).toEqual([{ tags: tags.slice(0, 16) }, { tags: tags.slice(16) }]);

    second.resolve({ status: 200, body: JSON.stringify({ valid: [] }) });
    await expect(completed).resolves.toBe(tags.join(", "));
  });

  test("discards partial cleanup results and returns the original prompt when a batch fails", async () => {
    const tags = Array.from({ length: 33 }, (_, index) => `tag ${index + 1}`);
    const prompt = { tagSections: [tags.join(", ")], supplement: "", supplementAfterTagSections: 1 };
    const config = {
      ...helpers.DEFAULT_CONFIG,
      promptSyntax: "nai" as const,
      danbooruCleanup: true,
      danbooruEndpoint: "http://cleanup.test/validate"
    };
    cleanupHandler = ({ tags: batch }) => batch[0] === "tag 17"
      ? { status: 502, statusText: "Bad Gateway", body: "proxy disconnected" }
      : {
          status: 200,
          body: JSON.stringify({ suggestions: { "tag 1": [{ tag: "partial result", score: 0.99 }] } })
        };

    const finalPrompt = await helpers.cleanupPrompt(prompt, config);

    expect(cleanupRequests.map((request) => request.tags)).toEqual([tags.slice(0, 16), tags.slice(16, 32)]);
    expect(finalPrompt).toBe(helpers.renderPrompt(prompt, config.promptSyntax));
    expect(finalPrompt).not.toContain("partial result");
  });
});

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
