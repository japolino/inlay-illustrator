import { beforeAll, beforeEach, describe, expect, test } from "bun:test";

const cleanupRequests: Array<{ tags: string[] }> = [];
type CleanupResponse = { status?: number; statusText?: string; body?: unknown };
let cleanupHandler: (request: { tags: string[] }) => CleanupResponse | Promise<CleanupResponse>;
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
    log: { info: () => undefined, warn: () => undefined, error: () => undefined }
  };
  helpers = (await import("./backend")).__testables;
});

beforeEach(() => {
  cleanupRequests.splice(0);
  cleanupHandler = defaultCleanupResponse;
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
      "quality, upper body, 1girl, smiling, garden, outdoors, girl, blonde hair, A cinematic composition places her among softly lit flowers., masterpiece"
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

  test("merges valid tags and suggestions returned by different batches", async () => {
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
    expect(finalPrompt).toContain("tag 1, first suggestion");
    expect(finalPrompt).toContain("exterior, outdoors, second suggestion");
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

describe("image job scheduling", () => {
  test("queues every ComfyUI request before the first result resolves and preserves prompt order", async () => {
    const requests = imageJobs.map(() => deferred<{ imageId: string }>());
    const invoked: number[] = [];
    const completed = helpers.dispatchPreparedImageJobs(imageJobs, true, (job) => {
      invoked.push(job.index);
      return requests[job.index].promise;
    });

    expect(invoked).toEqual([0, 1, 2]);
    requests[2].resolve({ imageId: "third" });
    requests[0].resolve({ imageId: "first" });
    requests[1].resolve({ imageId: "second" });

    const results = await completed;
    expect(results.map((result) => result.imageId)).toEqual(["first", "second", "third"]);
    expect(imageJobs.map((job) => job.paragraph)).toEqual([3, 1, 2]);
  });

  test("keeps non-ComfyUI requests strictly sequential", async () => {
    const requests = imageJobs.map(() => deferred<string>());
    const invoked: number[] = [];
    const completed = helpers.dispatchPreparedImageJobs(imageJobs, false, (job) => {
      invoked.push(job.index);
      return requests[job.index].promise;
    });

    expect(invoked).toEqual([0]);
    requests[0].resolve("first");
    await Promise.resolve();
    expect(invoked).toEqual([0, 1]);
    requests[1].resolve("second");
    await Promise.resolve();
    expect(invoked).toEqual([0, 1, 2]);
    requests[2].resolve("third");

    await expect(completed).resolves.toEqual(["first", "second", "third"]);
  });

  test("waits for all submitted ComfyUI jobs before propagating a failure", async () => {
    const requests = imageJobs.map(() => deferred<string>());
    const invoked: number[] = [];
    const completed = helpers.dispatchPreparedImageJobs(imageJobs, true, (job) => {
      invoked.push(job.index);
      return requests[job.index].promise;
    });
    const failure = new Error("first job failed");
    let settled = false;
    void completed.catch(() => { settled = true; });

    expect(invoked).toEqual([0, 1, 2]);
    requests[0].reject(failure);
    requests[1].resolve("second");
    await Promise.resolve();
    expect(settled).toBe(false);
    requests[2].resolve("third");

    await expect(completed).rejects.toBe(failure);
  });
});
