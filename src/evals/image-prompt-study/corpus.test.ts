import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectSavedPromptCases } from "./corpus.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function result(root: string, name: string, model: string, positive: string, passed = true): Promise<void> {
  await Bun.write(join(root, name), JSON.stringify({
    scenario: "rhea_platform_conflict",
    model,
    passed,
    score: 100,
    rendered: [{ paragraph: 1, perspective: "dynamic", positive, negative: "negative" }]
  }));
}

describe("saved prompt corpus", () => {
  test("groups the newest passing prompt per model and attaches canonical context", async () => {
    const root = await mkdtemp(join(tmpdir(), "inlay-image-corpus-"));
    temporary.push(root);
    await result(root, "deepseek.json", "DeepSeek-A/deepseek-v4-pro", "deepseek prompt");
    await result(root, "gemini.json", "Gemini/gcli-gemini-3.1-pro-preview", "gemini prompt");
    await result(root, "failed.json", "CODEX/gpt-5.6-luna", "failed prompt", false);

    const cases = await collectSavedPromptCases({ sourceRoot: root, modelFilters: ["deepseek", "gemini", "luna"] });
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe("rhea_platform_conflict-p1");
    expect(cases[0].source).toContain("exterior train platform");
    expect(cases[0].expectations.some((value) => value.includes("must not show: romantic"))).toBeTrue();
    expect(cases[0].candidates.map((candidate) => candidate.positive)).toEqual(["deepseek prompt", "gemini prompt"]);
    expect(cases[0].candidates.map((candidate) => candidate.savedPositive)).toEqual(["deepseek prompt", "gemini prompt"]);
  });

  test("revalidates saved payloads against the current quality rubric", async () => {
    const root = await mkdtemp(join(tmpdir(), "inlay-image-corpus-"));
    temporary.push(root);
    await Bun.write(join(root, "stale-pass.json"), JSON.stringify({
      scenario: "nsfw_oral_action_ownership",
      model: "DeepSeek-A/deepseek-v4-pro",
      passed: true,
      score: 100,
      rawJson: true,
      payload: { scenes: [{ environment: {}, shots: [{ paragraph: 1, characters: [
        { name: "Mara Quill", label: "girl", age: "" },
        { name: "Ivo Renn", label: "boy", age: "" }
      ] }] }] },
      rendered: [{ paragraph: 1, perspective: "dynamic", positive: "1girl, 1boy, nsfw", negative: "" }]
    }));

    const cases = await collectSavedPromptCases({ sourceRoot: root, minimumCandidates: 1 });
    expect(cases).toEqual([]);
  });
});
