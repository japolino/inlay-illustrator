import type { ImageStudyManifest, StudyDimension, StudyJudgmentExport } from "./types.js";

export type CandidateScore = {
  candidateId: string;
  model: string;
  comparisons: number;
  wins: number;
  losses: number;
  ties: number;
  bothFailed: number;
  points: number;
};

const DIMENSIONS: Array<[StudyDimension, string]> = [
  ["identityAttire", "Identity and attire"],
  ["actionOwnership", "Action ownership"],
  ["environmentCamera", "Environment and camera"],
  ["emotionalTone", "Emotional tone"],
  ["aesthetics", "Aesthetics"]
];

function validate(manifest: ImageStudyManifest, judgments: StudyJudgmentExport): void {
  if (judgments.runId !== manifest.runId) throw new Error(`Judgment run ${judgments.runId} does not match manifest run ${manifest.runId}.`);
  if (judgments.workflowHash !== manifest.workflowHash) throw new Error("Judgment workflow hash does not match the manifest.");
}

function scoreVotes(manifest: ImageStudyManifest, judgments: StudyJudgmentExport, dimension?: StudyDimension): CandidateScore[] {
  const models = new Map(manifest.cases.flatMap((studyCase) => studyCase.candidates.map((candidate) => [candidate.id, candidate.model] as const)));
  const scores = new Map<string, CandidateScore>();
  const get = (candidateId: string): CandidateScore => {
    const existing = scores.get(candidateId);
    if (existing) return existing;
    const created = { candidateId, model: models.get(candidateId) || candidateId, comparisons: 0, wins: 0, losses: 0, ties: 0, bothFailed: 0, points: 0 };
    scores.set(candidateId, created);
    return created;
  };
  for (const judgment of Object.values(judgments.answers || {})) {
    if (!models.has(judgment.leftCandidate) || !models.has(judgment.rightCandidate)) continue;
    const vote = dimension ? judgment.dimensions?.[dimension] : judgment.vote;
    if (!vote || vote === "not_applicable") continue;
    const left = get(judgment.leftCandidate);
    const right = get(judgment.rightCandidate);
    left.comparisons += 1;
    right.comparisons += 1;
    if (vote === "left") {
      left.wins += 1; left.points += 1; right.losses += 1;
    } else if (vote === "right") {
      right.wins += 1; right.points += 1; left.losses += 1;
    } else if (vote === "tie") {
      left.ties += 1; right.ties += 1; left.points += 0.5; right.points += 0.5;
    } else if (vote === "both_fail") {
      left.bothFailed += 1; right.bothFailed += 1;
    }
  }
  return [...scores.values()].sort((a, b) => (b.comparisons ? b.points / b.comparisons : 0) - (a.comparisons ? a.points / a.comparisons : 0)
    || b.wins - a.wins || a.model.localeCompare(b.model));
}

export function scoreJudgments(manifest: ImageStudyManifest, judgments: StudyJudgmentExport): CandidateScore[] {
  validate(manifest, judgments);
  return scoreVotes(manifest, judgments);
}

function appendMatrix(lines: string[], title: string, scores: CandidateScore[]): void {
  lines.push(`## ${title}`, "", "| Prompt source | Comparisons | Wins | Losses | Ties | Both failed | Pairwise points |", "|---|---:|---:|---:|---:|---:|---:|");
  for (const score of scores) {
    const rate = score.comparisons ? score.points / score.comparisons * 100 : 0;
    lines.push(`| ${score.model} | ${score.comparisons} | ${score.wins} | ${score.losses} | ${score.ties} | ${score.bothFailed} | ${rate.toFixed(1)}% |`);
  }
  if (scores.length === 0) lines.push("| No judgments | 0 | 0 | 0 | 0 | 0 | 0.0% |");
  lines.push("");
}

export function renderJudgmentReport(manifest: ImageStudyManifest, judgments: StudyJudgmentExport): string {
  validate(manifest, judgments);
  const lines = [
    "# Image prompt study report",
    "",
    `Run: ${manifest.runId}`,
    `Workflow: ${manifest.workflowPath} (${manifest.workflowHash.slice(0, 12)})`,
    `Steps: ${manifest.workflowSettings.steps ?? "workflow default"}`,
    `Positive prefix: ${manifest.promptAffixes.positivePrefix || "(none)"}`,
    `Negative prefix: ${manifest.promptAffixes.negativePrefix || "(none)"}`,
    `Images: ${manifest.images.length}`,
    `Answered pairwise comparisons: ${Object.keys(judgments.answers || {}).length}`,
    ""
  ];
  appendMatrix(lines, "Overall candidate matrix", scoreVotes(manifest, judgments));
  for (const [dimension, label] of DIMENSIONS) appendMatrix(lines, label, scoreVotes(manifest, judgments, dimension));
  lines.push("Pairwise points award 1 for a win, 0.5 for a tie, and 0 when both images fail. Treat small-seed rankings as directional only.", "");
  return lines.join("\n");
}
