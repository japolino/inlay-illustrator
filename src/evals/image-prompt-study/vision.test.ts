import { describe, expect, test } from "bun:test";
import type { ImageStudyManifest } from "./types.js";
import {
  buildVisionPairs,
  normalizeVisionAssessment,
  renderVisionSummary,
  visionJudgments,
  type VisionRun
} from "./vision.js";

const manifest: ImageStudyManifest = {
  schemaVersion: 1,
  runId: "run-1",
  createdAt: "2026-07-25T00:00:00.000Z",
  comfyUrl: "http://127.0.0.1:8188",
  workflowPath: "workflow.json",
  workflowHash: "abc",
  workflowSettings: {
    positiveNodeId: "1",
    negativeNodeId: "2",
    seedNodeId: "3",
    saveNodeId: "4",
    steps: 30
  },
  promptAffixes: { positivePrefix: "quality", negativePrefix: "bad" },
  sourceRoot: "eval-results/raw",
  modelFilters: ["luna"],
  seeds: [1103],
  cases: [{
    id: "case-p1",
    scenario: "case",
    paragraph: 1,
    description: "action ownership",
    source: "A woman pulls a man left.",
    expectations: ["woman must pull man"],
    characterCount: 2,
    candidates: [{
      id: "old",
      model: "old production",
      sourceFile: "old.json",
      sourceModifiedMs: 1,
      score: 100,
      savedPositive: "old",
      positive: "old",
      negative: "",
      perspective: "dynamic"
    }, {
      id: "focused",
      model: "focused Dynamic",
      sourceFile: "new.json",
      sourceModifiedMs: 2,
      score: 100,
      savedPositive: "new",
      positive: "new",
      negative: "",
      perspective: "dynamic"
    }]
  }],
  images: [{
    caseId: "case-p1",
    candidateId: "old",
    model: "old production",
    seed: 1103,
    positiveHash: "1",
    negativeHash: "2",
    localPath: "old.png",
    comfyPath: "old.png",
    promptId: "old",
    latencyMs: 1,
    sourceFile: "old.json"
  }, {
    caseId: "case-p1",
    candidateId: "focused",
    model: "focused Dynamic",
    seed: 1103,
    positiveHash: "3",
    negativeHash: "2",
    localPath: "focused.png",
    comfyPath: "focused.png",
    promptId: "focused",
    latencyMs: 1,
    sourceFile: "new.json"
  }],
  failures: []
};

describe("vision-assisted image study", () => {
  test("builds deterministic blinded same-seed pairs", () => {
    const first = buildVisionPairs(manifest);
    const second = buildVisionPairs(manifest);
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(new Set([first[0].leftCandidate, first[0].rightCandidate])).toEqual(new Set(["old", "focused"]));
  });

  test("normalizes bounded structured assessments and exports compatible judgments", () => {
    const pair = buildVisionPairs(manifest)[0];
    const assessment = normalizeVisionAssessment({
      winner: "a",
      confidence: 2,
      dimensions: {
        identityAttire: { vote: "tie", confidence: 0.8, evidence: ["both stable"] },
        actionOwnership: { vote: "a", confidence: 0.9, evidence: ["correct owner"] },
        environmentCamera: { vote: "b", confidence: 0.6, evidence: [] },
        emotionalTone: { vote: "not_applicable", confidence: 0.7, evidence: [] },
        aesthetics: { vote: "a", confidence: 0.8, evidence: [] }
      },
      imageAFailures: [],
      imageBFailures: ["action_reversal", "invalid"],
      summary: "A is more faithful.",
      needsHumanReview: false,
      reviewReasons: []
    });
    const run: VisionRun = {
      schemaVersion: 1,
      runId: manifest.runId,
      workflowHash: manifest.workflowHash,
      model: "gemini-flash-lite-latest",
      createdAt: manifest.createdAt,
      results: [{ pair, assessment, latencyMs: 1 }]
    };
    const judgments = visionJudgments(run);

    expect(assessment.confidence).toBe(1);
    expect(assessment.imageBFailures).toEqual(["action_reversal"]);
    expect(judgments.answers[pair.id].leftCandidate).toBe(pair.leftCandidate);
    expect(judgments.answers[pair.id].vote).toBe("left");
    expect(judgments.answers[pair.id].dimensions?.emotionalTone).toBe("not_applicable");
    expect(renderVisionSummary(manifest, run)).toContain("action_reversal");
  });
});
