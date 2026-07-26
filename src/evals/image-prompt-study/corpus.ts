import { readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { nsfwSidecarScenarios } from "../sidecar-sim/nsfw-scenarios.js";
import { expandedSidecarScenarios } from "../sidecar-sim/expanded-scenarios.js";
import { evaluateQuality } from "../sidecar-sim/quality.js";
import { sidecarScenarios } from "../sidecar-sim/scenarios.js";
import type { SidecarScenario } from "../sidecar-sim/types.js";
import { renderPrompt } from "../../backend/prompt.js";
import { assemblePrompt } from "../../backend/prompt.js";
import { chooseCreativeConcepts, parseCreativeConcepts } from "../../backend/creative.js";
import { prepareParagraphs } from "../../backend/paragraphs.js";
import { normalizeScenePayload } from "../../backend/scenes.js";
import type { PromptCandidate, PromptStudyCase, SavedSidecarResult } from "./types.js";

async function jsonFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(path: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) output.push(child);
    }
  }
  await visit(resolve(root));
  return output;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function matchesModel(model: string, filters: string[]): boolean {
  if (filters.length === 0 || filters.includes("all")) return true;
  const lower = model.toLowerCase();
  return filters.some((filter) => lower.includes(filter.toLowerCase()));
}

function expectationText(scenario: SidecarScenario, paragraph: number): string[] {
  return scenario.expectations
    .filter((expectation) => expectation.paragraph === paragraph)
    .map((expectation) => {
      const subject = expectation.character ? `${expectation.character} ${expectation.field}` : expectation.field;
      const required = expectation.anyOf?.length ? `must show one of: ${expectation.anyOf.join(" | ")}` : "";
      const prohibited = expectation.noneOf?.length ? `must not show: ${expectation.noneOf.join(" | ")}` : "";
      return [subject, required, prohibited].filter(Boolean).join("; ");
    });
}

function scenarioIndex(): Map<string, SidecarScenario> {
  return new Map([...sidecarScenarios, ...nsfwSidecarScenarios, ...expandedSidecarScenarios].map((scenario) => [scenario.id, scenario]));
}

export async function collectSavedPromptCases(options: {
  sourceRoot: string;
  modelFilters?: string[];
  scenarioFilter?: string;
  excludedScenarioFilter?: string;
  minimumCandidates?: number;
  /** Explicitly permits rejected historical prompts as frozen image-study comparators. */
  includeFailed?: boolean;
}): Promise<PromptStudyCase[]> {
  const modelFilters = options.modelFilters || [];
  const scenarioFilter = (options.scenarioFilter || "").toLowerCase();
  const excludedScenarioFilter = (options.excludedScenarioFilter || "").toLowerCase();
  const latest = new Map<string, PromptCandidate>();
  const scenarios = scenarioIndex();
  for (const path of await jsonFiles(options.sourceRoot)) {
    let result: SavedSidecarResult;
    try {
      result = JSON.parse(await Bun.file(path).text()) as SavedSidecarResult;
    } catch {
      continue;
    }
    if ((!result?.passed && !options.includeFailed) || !result?.scenario || !result.model || !Array.isArray(result.rendered)) continue;
    const currentScenario = scenarios.get(result.scenario);
    const preparedParagraphs = currentScenario
      ? prepareParagraphs(currentScenario.paragraphs.join("\n\n"), currentScenario.config)
      : [];
    const creativeConcepts = currentScenario && result.ideation?.raw
      ? chooseCreativeConcepts(
        parseCreativeConcepts(result.ideation.raw, preparedParagraphs, currentScenario.config),
        [],
        () => 0
      )
      : new Map();
    if (currentScenario && result.payload) {
      const currentQuality = evaluateQuality(
        result.payload,
        currentScenario,
        result.rendered,
        result.rawJson !== false,
        { requireModeProjection: false }
      );
      if (!currentQuality.passed && !options.includeFailed) continue;
    }
    if (scenarioFilter && !result.scenario.toLowerCase().includes(scenarioFilter)) continue;
    if (excludedScenarioFilter && result.scenario.toLowerCase().includes(excludedScenarioFilter)) continue;
    if (!matchesModel(result.model, modelFilters)) continue;
    const modifiedMs = (await stat(path)).mtimeMs;
    for (const rendered of result.rendered) {
      if (!rendered?.positive?.trim() || !Number.isFinite(Number(rendered.paragraph))) continue;
      const paragraph = Number(rendered.paragraph);
      const normalized = result.payload
        ? normalizeScenePayload(result.payload).find((entry) => entry.parserParagraph === paragraph)
        : undefined;
      const renderAcceptedPayload = (layout: "hybrid" | "compact" | "legacy"): string =>
        currentScenario && normalized
          ? renderPrompt(
            assemblePrompt(
              normalized.scene,
              layout === "legacy" && rendered.perspective === "dynamic"
                ? { ...normalized.shot, shotPlan: undefined }
                : normalized.shot,
              currentScenario.config,
              normalized.parserParagraph,
              normalized.parserParagraph,
              creativeConcepts.get(normalized.parserParagraph),
              layout === "compact" && rendered.perspective === "dynamic"
                ? { dynamicLayout: "compact" }
                : undefined
            ).prompt,
            currentScenario.config.promptSyntax
          )
          : "";
      const currentPositive = renderAcceptedPayload("hybrid");
      const compactPositive = renderAcceptedPayload("compact");
      const legacyPositive = renderAcceptedPayload("legacy");
      const key = `${result.scenario}\u0000${paragraph}\u0000${result.model}`;
      const existing = latest.get(key);
      if (existing && existing.sourceModifiedMs >= modifiedMs) continue;
      latest.set(key, {
        id: slug(result.model),
        model: result.model,
        sourceFile: relative(process.cwd(), path),
        sourceModifiedMs: modifiedMs,
        score: Number(result.score) || 0,
        savedPositive: rendered.positive.trim(),
        positive: currentPositive || rendered.positive.trim(),
        compactPositive: compactPositive || undefined,
        legacyPositive: legacyPositive || undefined,
        negative: rendered.negative?.trim() || "",
        perspective: rendered.perspective || "unknown"
      });
    }
  }

  const grouped = new Map<string, PromptStudyCase>();
  for (const [key, candidate] of latest) {
    const [scenarioId, paragraphText] = key.split("\u0000");
    const paragraph = Number(paragraphText);
    const scenario = scenarios.get(scenarioId);
    const caseId = `${scenarioId}-p${paragraph}`;
    const entry = grouped.get(caseId) || {
      id: caseId,
      scenario: scenarioId,
      paragraph,
      description: scenario?.description || scenarioId,
      source: scenario?.paragraphs[paragraph - 1] || scenario?.paragraphs.join("\n\n") || "",
      expectations: scenario ? expectationText(scenario, paragraph) : [],
      characterCount: scenario?.expectedCharacters[paragraph]?.length || 0,
      candidates: []
    };
    entry.candidates.push(candidate);
    grouped.set(caseId, entry);
  }

  const minimum = Math.max(1, options.minimumCandidates || 2);
  return [...grouped.values()]
    .map((entry) => ({ ...entry, candidates: entry.candidates.sort((a, b) => a.model.localeCompare(b.model)) }))
    .filter((entry) => entry.candidates.length >= minimum)
    .sort((a, b) => a.id.localeCompare(b.id));
}
