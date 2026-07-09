import { beforeAll, beforeEach, describe, expect, test } from "bun:test";

const cleanupRequests: Array<{ tags: string[] }> = [];
let helpers: typeof import("./backend").__testables;

beforeAll(async () => {
  (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle = {
    on: () => undefined,
    onFrontendMessage: () => undefined,
    cors: async (_endpoint: string, request: { body: string }) => {
      cleanupRequests.push(JSON.parse(request.body) as { tags: string[] });
      return {
        status: 200,
        body: JSON.stringify({ suggestions: { garden: [{ tag: "outdoors", score: 0.95 }] } })
      };
    },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined }
  };
  helpers = (await import("./backend")).__testables;
});

beforeEach(() => cleanupRequests.splice(0));

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
