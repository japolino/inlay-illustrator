import type { Config, PerspectiveMode } from "../../shared/config.js";
import type { ParsedPayload, PreviousVisualState } from "../../backend/types.js";

export type ScenarioExpectation = {
  paragraph: number;
  character?: string;
  field: "payload" | "location" | "appearance" | "body" | "attire" | "expression" | "action" | "prompt";
  anyOf?: string[];
  noneOf?: string[];
  critical?: boolean;
};

export type SidecarScenario = {
  id: string;
  description: string;
  config: Config;
  paragraphs: string[];
  characterMemory?: Record<string, string>;
  previousVisualState?: PreviousVisualState;
  recentContext?: string;
  expectations: ScenarioExpectation[];
  expectedParagraphs: number[];
  expectedCharacters: Record<number, string[]>;
};

export type QualityIssue = {
  category: "raw" | "schema" | "continuity" | "semantics" | "rendering";
  code: string;
  message: string;
  critical: boolean;
};

export type SidecarResult = {
  scenario: string;
  model: string;
  raw: string;
  rawJson: boolean;
  locallyRepaired: boolean;
  payload?: ParsedPayload;
  rendered: Array<{ paragraph: number; perspective: PerspectiveMode; positive: string; negative: string }>;
  issues: QualityIssue[];
  score: number;
  passed: boolean;
  latencyMs: number;
  usage: Record<string, number>;
  providerDiagnostics?: { finishReason: string; messageKeys: string[]; contentLength: number; reasoningLength: number };
  request: {
    endpoint: string;
    model: string;
    stream: false;
    responseFormat: "json_object";
    reasoning: "off";
    maxTokens: number;
    messageLengths: number[];
  };
  ideation?: { raw: string; candidateCount: number; latencyMs: number; usage: Record<string, number> };
  censored?: boolean;
  error?: string;
};
