import type { ParsedPayload } from "../../backend/types.js";

export type SavedRenderedPrompt = {
  paragraph: number;
  perspective: string;
  positive: string;
  negative: string;
};

export type SavedSidecarResult = {
  scenario: string;
  model: string;
  passed: boolean;
  score: number;
  rawJson?: boolean;
  payload?: ParsedPayload;
  ideation?: { raw?: string };
  rendered: SavedRenderedPrompt[];
};

export type PromptCandidate = {
  id: string;
  model: string;
  sourceFile: string;
  sourceModifiedMs: number;
  score: number;
  /** Immutable prompt text captured by the source sidecar run before later renderer changes. */
  savedPositive: string;
  positive: string;
  /** Same accepted payload rendered through the frozen pre-hybrid Dynamic projection. */
  compactPositive?: string;
  /** Same accepted payload rendered through the pre-shotPlan Dynamic layout. */
  legacyPositive?: string;
  negative: string;
  perspective: string;
};

export type PromptStudyCase = {
  id: string;
  scenario: string;
  paragraph: number;
  description: string;
  source: string;
  expectations: string[];
  characterCount: number;
  candidates: PromptCandidate[];
};

export type ComfyImageReference = {
  filename: string;
  subfolder: string;
  type: string;
};

export type GeneratedStudyImage = {
  caseId: string;
  candidateId: string;
  model: string;
  seed: number;
  positiveHash: string;
  negativeHash: string;
  localPath: string;
  comfyPath: string;
  promptId: string;
  latencyMs: number;
  sourceFile: string;
};

export type ImageStudyManifest = {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  comfyUrl: string;
  workflowPath: string;
  workflowHash: string;
  workflowSettings: {
    positiveNodeId: string;
    negativeNodeId: string;
    seedNodeId: string;
    stepsNodeId?: string;
    saveNodeId: string;
    steps: number | null;
  };
  promptAffixes: {
    positivePrefix: string;
    negativePrefix: string;
  };
  sourceRoot: string;
  modelFilters: string[];
  seeds: number[];
  cases: PromptStudyCase[];
  images: GeneratedStudyImage[];
  failures: Array<{ caseId: string; candidateId: string; seed: number; error: string }>;
};

export type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

export type ApiWorkflow = Record<string, WorkflowNode>;

export type WorkflowBindings = {
  positiveNodeId: string;
  negativeNodeId: string;
  seedNodeId: string;
  stepsNodeId?: string;
  saveNodeId: string;
};

export type StudyVote = "left" | "right" | "tie" | "both_fail";
export type StudyDimension = "identityAttire" | "actionOwnership" | "environmentCamera" | "emotionalTone" | "aesthetics";
export type StudyDimensionVote = StudyVote | "not_applicable";

export type StudyJudgment = {
  vote: StudyVote;
  caseId: string;
  seed: number;
  leftCandidate: string;
  rightCandidate: string;
  dimensions?: Partial<Record<StudyDimension, StudyDimensionVote>>;
  recordedAt?: string;
};

export type StudyJudgmentExport = {
  runId: string;
  workflowHash: string;
  exportedAt?: string;
  answers: Record<string, StudyJudgment>;
};
