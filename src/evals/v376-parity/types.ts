/**
 * Types for V3.7.6 Source-Faithful Parity Evaluation & Replay Tooling.
 *
 * Provides typed contracts for deterministic test fixtures, golden expectations,
 * assertion outcomes, category metrics, and serialized CLI parity reports.
 */

import type {
  V376CompiledShot,
  V376Mode,
  V376Options,
  V376Payload,
  V376PromptSeparator,
  V376PromptSyntax,
  V376Shot,
  V376TextLanguage,
} from "../../backend/v376/types.js";

/**
 * Provenance reference tracing a test case or expectation to its original source.
 */
export interface SourceProvenance {
  /** Source artifact file name (e.g., "references/v376/trigger_runtime.lua") */
  file: string;
  /** Source line range in the original artifact */
  lines: string;
  /** Description of the source behavior being verified */
  description: string;
}

/**
 * A benign frozen test fixture representing an LLM payload or response.
 */
export interface GoldenSceneFixture {
  id: string;
  name: string;
  description: string;
  mode: V376Mode;
  options: Partial<V376Options>;
  /** Raw textual response from LLM (may include markdown, typos, trailing commas) */
  rawResponse?: string;
  /** Parsed / structured payload */
  payload?: V376Payload;
  /** Provenance tracing */
  provenance: SourceProvenance;
}

/**
 * Expected golden compiled shot outputs for a specific configuration.
 */
export interface GoldenPromptExpectation {
  fixtureId: string;
  options: {
    mode: V376Mode;
    separator: V376PromptSeparator;
    syntax: V376PromptSyntax;
    supplement: boolean;
    nsfw: boolean;
    text?: V376TextLanguage;
    quote?: boolean;
    originalReference?: boolean;
    customPos?: string;
    customNeg?: string;
    customNegative?: string;
  };
  expected: {
    prompt: string;
    negative: string;
    corePrompt?: string;
    nativeCharacters?: Array<{
      name?: string;
      prompt: string;
      negative?: string;
    }>;
  };
  provenance: SourceProvenance;
}

/**
 * Codec roundtrip test vector.
 */
export interface GoldenCodecVector {
  id: string;
  name: string;
  encodingMode: "plain" | "placeholder" | "atbash" | "base64";
  originalText: string;
  encodedText: string;
  decodedText: string;
  provenance: SourceProvenance;
}

/**
 * Assertion outcome for an individual parity check.
 */
export interface ParityAssertion {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  diff?: string;
  provenance?: SourceProvenance;
}

/**
 * Result of evaluating a specific parity test case.
 */
export interface ParityTestCaseResult {
  id: string;
  category: "schema" | "instructions" | "prompt" | "codec" | "memory" | "scenario";
  name: string;
  passed: boolean;
  assertions: ParityAssertion[];
  durationMs: number;
}

/**
 * Summary metrics for a category of parity checks.
 */
export interface ParityCategorySummary {
  category: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
}

/**
 * Full deterministic V3.7.6 parity evaluation report.
 */
export interface V376ParityReport {
  timestamp: string;
  version: "3.7.6";
  overallPassed: boolean;
  summary: {
    totalSuites: number;
    totalCases: number;
    passedCases: number;
    failedCases: number;
    totalAssertions: number;
    passedAssertions: number;
    failedAssertions: number;
    totalDurationMs: number;
  };
  categories: ParityCategorySummary[];
  cases: ParityTestCaseResult[];
}

/**
 * CLI options for parity evaluation.
 */
export interface ParityCliOptions {
  json?: boolean;
  verbose?: boolean;
  category?: string;
  filter?: string;
}
