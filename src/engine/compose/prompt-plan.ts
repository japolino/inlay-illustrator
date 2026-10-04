/**
 * Prompt compilation (spec/pipeline.md §3.5). Facade over the verbatim core.
 */
import {
  createPromptCompiler as corePromptCompiler,
  buildRuleIRPromptPlan as coreBuildRuleIRPromptPlan,
  buildV45PromptPlan as coreBuildV45PromptPlan,
  buildV45ImageActors as coreBuildV45ImageActors,
  buildPromptSegments as coreBuildPromptSegments,
  resolveV45FramesAndVariants as coreResolveFrames,
  createV45RuleRuntime,
  NOVELAI_DEFAULTS,
  qlt as createRuleProjector,
} from "../core/asset-maid-core";
import type { ImageActor, ImageProviderId, PromptBuildSpec, PromptInputs, PromptPlan, PromptSegments } from "./types";

/** The compiler object returned by `pyt`. */
export interface PromptCompiler {
  /** "rule-IR" for the built-in catalog (default), "legacy" for a custom V4.5 raw catalog. */
  source: "rule-ir" | "legacy";
  legacyCatalog: unknown;
  ruleRuntime: unknown;
  /** Compile one image. Throws `GenerationPromptInvariantError` when no participant matches an identity. */
  build(spec: PromptBuildSpec, inputs: PromptInputs): PromptPlan;
}

/**
 * Create the prompt compiler. `source` is the rule-IR runtime (`createV45RuleRuntime()`, `DLe`) or a legacy
 * catalog (`compileCustomV45Catalog(raw)`, `n$e`). `defaults` = `NOVELAI_DEFAULTS` (`Ns`).
 * Original: `pyt` @119794 (`Ne = pyt(ke.source === "default" ? ke.ruleRuntime : ke.catalog, Ns)` @180732).
 */
export function createPromptCompiler(source: unknown, defaults: unknown = NOVELAI_DEFAULTS): PromptCompiler {
  return corePromptCompiler(source, defaults) as PromptCompiler;
}

/** Convenience: the default rule-IR compiler (`pyt(DLe(), Ns)`). */
export function createDefaultPromptCompiler(): PromptCompiler {
  return createPromptCompiler(createV45RuleRuntime(), NOVELAI_DEFAULTS);
}

/**
 * Rule-IR build (the default path): resolve participants, external entries (fixed positive / continuity / artist /
 * base groups / outfit parts), project through the rule projector and sort by layer.
 * Original: `myt` @119667. `ruleRuntime` = `createV45RuleRuntime()`, `projector` = `qlt(ruleRuntime.catalog)`.
 */
export function buildRuleIRPromptPlan(spec: PromptBuildSpec, inputs: PromptInputs, ruleRuntime: { catalog: unknown }, projector?: unknown): PromptPlan {
  return coreBuildRuleIRPromptPlan(spec, inputs, ruleRuntime, projector ?? createRuleProjector(ruleRuntime.catalog)) as PromptPlan;
}

/**
 * Build the spec from an analyzer decision and call `compiler.build` (spec/pipeline.md §3.5).
 * `run.promptInputs` is a `PromptInputs` object or `(decision) => PromptInputs`.
 * `localContinuitySelections` = `applyVisualContinuityToPlan(...).imagePromptSelections[i]`.
 * Original: `Eht` @114786.
 */
export function buildV45PromptPlan(
  compiler: PromptCompiler,
  decision: Record<string, unknown>,
  run: { promptInputs: PromptInputs | ((decision: Record<string, unknown>) => PromptInputs) },
  localContinuitySelections: unknown,
  providerId: ImageProviderId,
): PromptPlan {
  return coreBuildV45PromptPlan(compiler, decision, run, localContinuitySelections, providerId) as PromptPlan;
}

/** Ordered image actors (`actor_1`, ...) of a decision + prompt plan. Original: `wht` @114609. */
export function buildV45ImageActors(decision: Record<string, unknown>, plan: PromptPlan): readonly ImageActor[] {
  return coreBuildV45ImageActors(decision, plan) as readonly ImageActor[];
}

/**
 * Artist span offsets in the global positive (from the ledger) and in the negative (suffix match).
 * Original: `Nht` @114811.
 */
export function buildPromptSegments(plan: PromptPlan, artistNegativePrompt: string): PromptSegments | undefined {
  return coreBuildPromptSegments(plan, artistNegativePrompt) as PromptSegments | undefined;
}

/**
 * Resolve frame / variant / frame size per image with the catalog chance resolver (seed = source_image_token,
 * keyed by messageId); sets `camera.framing.crop` on the primary actor. Original: `kht` @114683.
 */
export function resolveV45FramesAndVariants(
  plan: { images: Array<Record<string, unknown>>; [key: string]: unknown },
  ruleRuntime: unknown,
  options: { messageId: string; random?: () => number },
): { plan: { images: Array<Record<string, unknown>>; [key: string]: unknown }; selections: readonly unknown[] } {
  return coreResolveFrames(plan, ruleRuntime, options) as ReturnType<typeof resolveV45FramesAndVariants>;
}
