import { describe, expect, test } from "bun:test";
import { scoreJudgments } from "./report.js";
import type { ImageStudyManifest, StudyJudgmentExport } from "./types.js";

const manifest = {
  schemaVersion: 1,
  runId: "run",
  workflowHash: "hash",
  workflowPath: "workflow.json",
  workflowSettings: { positiveNodeId: "p", negativeNodeId: "n", seedNodeId: "s", saveNodeId: "o", steps: 25 },
  promptAffixes: { positivePrefix: "quality", negativePrefix: "bad quality" },
  images: [],
  cases: [{ id: "case", candidates: [{ id: "a", model: "Model A" }, { id: "b", model: "Model B" }] }]
} as unknown as ImageStudyManifest;

describe("image study judgment report", () => {
  test("scores blind left/right identities rather than display position", () => {
    const judgments: StudyJudgmentExport = {
      runId: "run",
      workflowHash: "hash",
      answers: {
        first: { vote: "right", caseId: "case", seed: 1, leftCandidate: "a", rightCandidate: "b" },
        second: {
          vote: "tie",
          caseId: "case",
          seed: 2,
          leftCandidate: "b",
          rightCandidate: "a",
          dimensions: { identityAttire: "right", actionOwnership: "not_applicable" }
        }
      }
    };
    const scores = scoreJudgments(manifest, judgments);
    expect(scores.map((score) => ({ model: score.model, points: score.points, wins: score.wins }))).toEqual([
      { model: "Model B", points: 1.5, wins: 1 },
      { model: "Model A", points: 0.5, wins: 0 }
    ]);
  });

  test("renders categorical matrices while ignoring not-applicable dimension votes", async () => {
    const { renderJudgmentReport } = await import("./report.js");
    const report = renderJudgmentReport(manifest, {
      runId: "run",
      workflowHash: "hash",
      answers: {
        one: {
          vote: "tie",
          caseId: "case",
          seed: 2,
          leftCandidate: "b",
          rightCandidate: "a",
          dimensions: { identityAttire: "right", actionOwnership: "not_applicable" }
        }
      }
    });
    expect(report).toContain("## Identity and attire");
    expect(report).toContain("## Action ownership");
    expect(report).toContain("| Model A | 1 | 1 | 0 | 0 | 0 | 100.0% |");
  });

  test("rejects judgments from another workflow", () => {
    expect(() => scoreJudgments(manifest, { runId: "run", workflowHash: "other", answers: {} })).toThrow("workflow hash");
  });
});
