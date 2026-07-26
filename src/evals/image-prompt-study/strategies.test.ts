import { describe, expect, test } from "bun:test";
import { applyPromptStrategy, expandPromptStrategies } from "./strategies.js";
import type { PromptStudyCase } from "./types.js";

const prompt = [
  "1girl, 1boy",
  "left, pointing right",
  "woman, white braid, navy coat",
  "right, recoiling",
  "man, black hair, gray jacket",
  "gripping sleeve, facing each other",
  "rainy train platform",
  "medium shot, eye level"
].join(",\n\n");

describe("prompt study strategies", () => {
  test("merges each character's composition and traits without changing other sections", () => {
    expect(applyPromptStrategy(prompt, 2, "merged-character-blocks")).toBe([
      "1girl, 1boy",
      "left, pointing right, woman, white braid, navy coat",
      "right, recoiling, man, black hair, gray jacket",
      "gripping sleeve, facing each other",
      "rainy train platform",
      "medium shot, eye level"
    ].join(",\n\n"));
  });

  test("can place identity tags before composition within each merged block", () => {
    const result = applyPromptStrategy(prompt, 2, "merged-tags-first");
    expect(result).toContain("woman, white braid, navy coat, left, pointing right");
    expect(result).toContain("man, black hair, gray jacket, right, recoiling");
  });

  test("can create explicit natural-language identity anchors", () => {
    const result = applyPromptStrategy(prompt, 2, "anchored-natural-language");
    expect(result).toContain("The first character has these visible traits: woman, white braid, navy coat.");
    expect(result).toContain("Her position, pose, action, and gaze are: left, pointing right.");
    expect(result).toContain("The second character has these visible traits: man, black hair, gray jacket.");
    expect(result).toContain("His position, pose, action, and gaze are: right, recoiling.");
  });

  test("can replace ambiguous action fragments with compact role-bound clauses", () => {
    const result = applyPromptStrategy(prompt, 2, "role-bound-actions", "rhea_platform_conflict");
    expect(result).toContain("left woman grips right man's sleeve with one hand");
    expect(result).toContain("right man recoils backward from left woman");
    expect(result).toContain("woman, white braid, navy coat");
    expect(result).toContain("tense non-romantic contact");
    expect(result).not.toContain("left, pointing right");
  });

  test("leaves unsupported scenarios unchanged instead of inventing action clauses", () => {
    expect(applyPromptStrategy(prompt, 2, "role-bound-actions", "unknown_fixture")).toBe(prompt);
  });

  test("reduces Dynamic rendering to one prioritized action block while preserving tag blocks", () => {
    const result = applyPromptStrategy(prompt, 2, "focused-dynamic", "rhea_platform_conflict");
    expect(result).toBe([
      "1girl, 1boy",
      "medium shot, eye level",
      "left woman grips right man's sleeve while confronting him, left woman points toward the departing train, right man recoils one step from the left woman",
      "woman, white braid, navy coat",
      "man, black hair, gray jacket",
      "rainy train platform"
    ].join(",\n\n"));
  });

  test("keeps unsupported focused Dynamic fixtures unchanged", () => {
    expect(applyPromptStrategy(prompt, 2, "focused-dynamic", "unknown_fixture")).toBe(prompt);
  });

  test("compares current production rendering with a legacy rendering from the same accepted payload", () => {
    const studyCase: PromptStudyCase = {
      id: "case",
      scenario: "case",
      paragraph: 1,
      description: "comparison",
      source: "source",
      expectations: [],
      characterCount: 2,
      candidates: [{
        id: "luna",
        model: "Luna",
        sourceFile: "result.json",
        sourceModifiedMs: 1,
        score: 100,
        savedPositive: "saved current prompt",
        positive: "hybrid current prompt",
        compactPositive: "compact frozen prompt",
        legacyPositive: "legacy full prompt",
        negative: "",
        perspective: "dynamic"
      }]
    };
    const [expanded] = expandPromptStrategies([studyCase], ["saved-production", "compact-production", "legacy-production", "production"]);
    expect(expanded.candidates.map((candidate) => candidate.positive)).toEqual([
      "saved current prompt",
      "compact frozen prompt",
      "legacy full prompt",
      "hybrid current prompt"
    ]);
  });
});
