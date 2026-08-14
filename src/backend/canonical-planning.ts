import type { Config } from "../shared/config.js";
import type { ContinuityState, IllustrationPlan } from "./domain.js";
import { planFromParsedPayload } from "./plan-adapter.js";
import { compilePrompt, renderPrompt } from "./prompt.js";
import { selectShotDecisions } from "./scenes.js";
import { resolveIllustrationPlan } from "./shot-resolution.js";
import type {
  CreativeConcept,
  ParsedPayload,
  PreparedParagraph,
  PromptEntry,
  SelectedShotDecision
} from "./types.js";

export type CanonicalPromptSelection = {
  plan: IllustrationPlan;
  selected: PromptEntry[];
  decisions: SelectedShotDecision[];
};

function compileDecisions(
  payload: ParsedPayload,
  previousState: ContinuityState | undefined,
  paragraphs: PreparedParagraph[],
  config: Config,
  conceptSelections: Map<number, CreativeConcept>,
  decisions: SelectedShotDecision[]
): CanonicalPromptSelection {
  const plan = resolveIllustrationPlan(planFromParsedPayload(
    payload,
    previousState,
    paragraphs,
    config,
    conceptSelections,
    decisions
  ));
  const resolvedByParagraph = new Map(plan.shots.map((shot) => [shot.paragraph, shot]));
  const selected = decisions.map((decision) => {
    const resolved = resolvedByParagraph.get(decision.parserParagraph);
    if (!resolved) throw new Error(`Canonical plan omitted selected paragraph P${decision.parserParagraph}.`);
    return {
      ...compilePrompt(resolved, config),
      placement: "paragraph" as const,
      paragraph: decision.paragraph,
      parserParagraph: decision.parserParagraph,
      creativeCandidates: decision.creativeCandidates
    };
  });
  return { plan, selected, decisions };
}

/**
 * Selects numbered shots, resolves one canonical plan, and compiles each prompt
 * exactly once on the normal path. The legacy assembler remains available only
 * through selectPromptEntries for compatibility tests and external callers.
 */
export function planAndCompilePrompts(
  payload: ParsedPayload,
  previousState: ContinuityState | undefined,
  paragraphs: PreparedParagraph[],
  config: Config,
  conceptSelections: Map<number, CreativeConcept> = new Map(),
  creativeCandidates: CreativeConcept[] = []
): CanonicalPromptSelection {
  let decisions = selectShotDecisions(
    payload,
    paragraphs,
    config,
    conceptSelections,
    creativeCandidates
  );
  if (!config.adaptiveMode && config.perspectiveMode === "creative" && conceptSelections.size > 0) {
    decisions = decisions.filter((decision) => Boolean(decision.creativeConcept));
  }

  let compiled = compileDecisions(
    payload,
    previousState,
    paragraphs,
    config,
    conceptSelections,
    decisions
  );
  const usable = compiled.selected.map((entry) => Boolean(renderPrompt(entry.prompt, config.promptSyntax)));
  if (usable.every(Boolean)) return compiled;

  // Empty legacy prompts were historically excluded before planning. Preserve
  // that edge-case behavior by rebuilding only when a compiler returns empty.
  decisions = decisions.filter((_decision, index) => usable[index]);
  compiled = compileDecisions(
    payload,
    previousState,
    paragraphs,
    config,
    conceptSelections,
    decisions
  );
  return compiled;
}
