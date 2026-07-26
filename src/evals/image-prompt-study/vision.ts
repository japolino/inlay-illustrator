import type {
  ImageStudyManifest,
  StudyDimension,
  StudyDimensionVote,
  StudyJudgment,
  StudyJudgmentExport,
  StudyVote
} from "./types.js";

export const VISION_FAILURE_CODES = [
  "identity_drift",
  "attire_drift",
  "action_reversal",
  "missing_action",
  "extra_character",
  "environment_drift",
  "camera_mismatch",
  "tone_drift",
  "anatomy_failure",
  "prompt_overload"
] as const;

export type VisionFailureCode = typeof VISION_FAILURE_CODES[number];
export type VisionSide = "a" | "b";
export type VisionVote = VisionSide | "tie" | "both_fail";
export type VisionDimensionVote = VisionVote | "not_applicable";

export type VisionDimensionAssessment = {
  vote: VisionDimensionVote;
  confidence: number;
  evidence: string[];
};

export type VisionAssessment = {
  winner: VisionVote;
  confidence: number;
  dimensions: Record<StudyDimension, VisionDimensionAssessment>;
  imageAFailures: VisionFailureCode[];
  imageBFailures: VisionFailureCode[];
  summary: string;
  needsHumanReview: boolean;
  reviewReasons: string[];
};

export type VisionPair = {
  id: string;
  caseId: string;
  scenario: string;
  paragraph: number;
  description: string;
  source: string;
  expectations: string[];
  seed: number;
  leftCandidate: string;
  rightCandidate: string;
  leftImagePath: string;
  rightImagePath: string;
};

export type VisionPairResult = {
  pair: VisionPair;
  assessment?: VisionAssessment;
  latencyMs: number;
  error?: string;
};

export type VisionRun = {
  schemaVersion: 1;
  runId: string;
  workflowHash: string;
  model: string;
  createdAt: string;
  results: VisionPairResult[];
};

const DIMENSIONS: StudyDimension[] = [
  "identityAttire",
  "actionOwnership",
  "environmentCamera",
  "emotionalTone",
  "aesthetics"
];

function pairs<T>(values: T[]): Array<[T, T]> {
  const output: Array<[T, T]> = [];
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) output.push([values[left], values[right]]);
  }
  return output;
}

function stableFlip(value: string): boolean {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2 === 0;
}

export function buildVisionPairs(manifest: ImageStudyManifest): VisionPair[] {
  const images = new Map(manifest.images.map((image) => [
    `${image.caseId}\u0000${image.candidateId}\u0000${image.seed}`,
    image
  ]));
  return manifest.cases.flatMap((studyCase) => manifest.seeds.flatMap((seed) =>
    pairs(studyCase.candidates).flatMap(([first, second]) => {
      const firstImage = images.get(`${studyCase.id}\u0000${first.id}\u0000${seed}`);
      const secondImage = images.get(`${studyCase.id}\u0000${second.id}\u0000${seed}`);
      if (!firstImage || !secondImage) return [];
      const flip = stableFlip(`${manifest.runId}:${studyCase.id}:${seed}:${first.id}:${second.id}`);
      const left = flip ? secondImage : firstImage;
      const right = flip ? firstImage : secondImage;
      return [{
        id: `${studyCase.id}--${seed}--${first.id}--${second.id}`,
        caseId: studyCase.id,
        scenario: studyCase.scenario,
        paragraph: studyCase.paragraph,
        description: studyCase.description,
        source: studyCase.source,
        expectations: studyCase.expectations,
        seed,
        leftCandidate: left.candidateId,
        rightCandidate: right.candidateId,
        leftImagePath: left.localPath,
        rightImagePath: right.localPath
      }];
    })
  ));
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function boundedConfidence(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0;
}

function visionVote(value: unknown, allowNotApplicable = false): VisionDimensionVote {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "a" || normalized === "b" || normalized === "tie" || normalized === "both_fail") return normalized;
  if (allowNotApplicable && normalized === "not_applicable") return normalized;
  return "tie";
}

function failureCodes(value: unknown): VisionFailureCode[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(VISION_FAILURE_CODES);
  return [...new Set(value.map(cleanString).filter((entry): entry is VisionFailureCode => allowed.has(entry)))];
}

export function normalizeVisionAssessment(value: unknown): VisionAssessment {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawDimensions = record.dimensions && typeof record.dimensions === "object" && !Array.isArray(record.dimensions)
    ? record.dimensions as Record<string, unknown>
    : {};
  const dimensions = Object.fromEntries(DIMENSIONS.map((dimension) => {
    const raw = rawDimensions[dimension] && typeof rawDimensions[dimension] === "object"
      ? rawDimensions[dimension] as Record<string, unknown>
      : {};
    return [dimension, {
      vote: visionVote(raw.vote, true),
      confidence: boundedConfidence(raw.confidence),
      evidence: Array.isArray(raw.evidence) ? raw.evidence.map(cleanString).filter(Boolean).slice(0, 3) : []
    }];
  })) as Record<StudyDimension, VisionDimensionAssessment>;
  return {
    winner: visionVote(record.winner) as VisionVote,
    confidence: boundedConfidence(record.confidence),
    dimensions,
    imageAFailures: failureCodes(record.imageAFailures),
    imageBFailures: failureCodes(record.imageBFailures),
    summary: cleanString(record.summary).slice(0, 1000),
    needsHumanReview: record.needsHumanReview === true,
    reviewReasons: Array.isArray(record.reviewReasons)
      ? record.reviewReasons.map(cleanString).filter(Boolean).slice(0, 5)
      : []
  };
}

function studyVote(vote: VisionVote): StudyVote {
  if (vote === "a") return "left";
  if (vote === "b") return "right";
  return vote;
}

function dimensionVote(vote: VisionDimensionVote): StudyDimensionVote {
  if (vote === "a") return "left";
  if (vote === "b") return "right";
  return vote;
}

export function visionJudgments(run: VisionRun): StudyJudgmentExport {
  const answers: Record<string, StudyJudgment> = {};
  for (const result of run.results) {
    if (!result.assessment) continue;
    answers[result.pair.id] = {
      vote: studyVote(result.assessment.winner),
      caseId: result.pair.caseId,
      seed: result.pair.seed,
      leftCandidate: result.pair.leftCandidate,
      rightCandidate: result.pair.rightCandidate,
      dimensions: Object.fromEntries(DIMENSIONS.map((dimension) => [
        dimension,
        dimensionVote(result.assessment!.dimensions[dimension].vote)
      ])),
      recordedAt: run.createdAt
    };
  }
  return {
    runId: run.runId,
    workflowHash: run.workflowHash,
    exportedAt: new Date().toISOString(),
    answers
  };
}

export function visionAssessmentSchema(): Record<string, unknown> {
  const dimension = {
    type: "object",
    properties: {
      vote: { type: "string", enum: ["a", "b", "tie", "both_fail", "not_applicable"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      evidence: { type: "array", items: { type: "string" }, maxItems: 3 }
    },
    required: ["vote", "confidence", "evidence"],
    additionalProperties: false
  };
  return {
    type: "object",
    properties: {
      winner: { type: "string", enum: ["a", "b", "tie", "both_fail"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      dimensions: {
        type: "object",
        properties: Object.fromEntries(DIMENSIONS.map((name) => [name, dimension])),
        required: DIMENSIONS,
        additionalProperties: false
      },
      imageAFailures: { type: "array", items: { type: "string", enum: VISION_FAILURE_CODES }, uniqueItems: true },
      imageBFailures: { type: "array", items: { type: "string", enum: VISION_FAILURE_CODES }, uniqueItems: true },
      summary: { type: "string" },
      needsHumanReview: { type: "boolean" },
      reviewReasons: { type: "array", items: { type: "string" }, maxItems: 5 }
    },
    required: [
      "winner",
      "confidence",
      "dimensions",
      "imageAFailures",
      "imageBFailures",
      "summary",
      "needsHumanReview",
      "reviewReasons"
    ],
    additionalProperties: false
  };
}

export function visionPrompt(pair: VisionPair): string {
  return [
    "Compare two AI-generated illustrations against the same source. Judge visible evidence only.",
    "Source fidelity is more important than prettiness. Do not reward Image A or B by default.",
    "Check exact character identity and attire, action owner and target, movement direction, character count, environment, framing, emotional tone, and overall aesthetics.",
    "An omitted required action, reversed interaction, extra complete character, restored removed attire, or wrong location is a major failure.",
    "Use not_applicable only when a dimension genuinely cannot be assessed from the source.",
    "Set needsHumanReview when either image is ambiguous, censored, too cropped to verify a critical fact, or confidence is below 0.7.",
    `Scenario: ${pair.description}`,
    `Source paragraph:\n${pair.source}`,
    pair.expectations.length ? `Required/prohibited facts:\n- ${pair.expectations.join("\n- ")}` : "",
    "The first attached image is Image A. The second attached image is Image B.",
    "Return the requested JSON assessment."
  ].filter(Boolean).join("\n\n");
}

export function renderVisionSummary(manifest: ImageStudyManifest, run: VisionRun): string {
  const completed = run.results.filter((result) => result.assessment);
  const failed = run.results.filter((result) => !result.assessment);
  const review = completed.filter((result) =>
    result.assessment!.needsHumanReview || result.assessment!.confidence < 0.7
  );
  const candidateLabels = new Map(manifest.cases.flatMap((studyCase) =>
    studyCase.candidates.map((candidate) => [candidate.id, candidate.model] as const)
  ));
  const failureCounts = new Map<VisionFailureCode, number>();
  for (const result of completed) {
    for (const code of [...result.assessment!.imageAFailures, ...result.assessment!.imageBFailures]) {
      failureCounts.set(code, (failureCounts.get(code) || 0) + 1);
    }
  }
  const lines = [
    "# Vision-assisted image study",
    "",
    `Run: ${run.runId}`,
    `Vision model: ${run.model}`,
    `Completed comparisons: ${completed.length}/${run.results.length}`,
    `Needs human review: ${review.length}`,
    `Failed or blocked calls: ${failed.length}`,
    "",
    "## Failure patterns",
    "",
    "| Failure | Count |",
    "|---|---:|",
    ...[...failureCounts.entries()].sort((left, right) => right[1] - left[1])
      .map(([code, count]) => `| ${code} | ${count} |`),
    ...(failureCounts.size ? [] : ["| None reported | 0 |"]),
    "",
    "## Pair assessments",
    "",
    "| Case | Seed | Winner | Confidence | Human review | Summary |",
    "|---|---:|---|---:|---|---|"
  ];
  for (const result of run.results) {
    const assessment = result.assessment;
    const winner = !assessment
      ? "error"
      : assessment.winner === "a"
        ? candidateLabels.get(result.pair.leftCandidate) || result.pair.leftCandidate
        : assessment.winner === "b"
          ? candidateLabels.get(result.pair.rightCandidate) || result.pair.rightCandidate
          : assessment.winner;
    const summary = (assessment?.summary || result.error || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 300);
    const needsReview = !assessment || assessment.needsHumanReview || assessment.confidence < 0.7;
    lines.push(`| ${result.pair.caseId} | ${result.pair.seed} | ${winner} | ${assessment?.confidence.toFixed(2) || "-"} | ${needsReview ? "yes" : "no"} | ${summary} |`);
  }
  lines.push(
    "",
    "Vision judgments are triage evidence, not ground truth. Manually inspect blocked, low-confidence, and strategy-changing disagreements before changing production behavior.",
    ""
  );
  return lines.join("\n");
}
