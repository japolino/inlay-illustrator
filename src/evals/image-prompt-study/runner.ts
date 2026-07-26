import { mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { collectSavedPromptCases } from "./corpus.js";
import { renderReviewHtml, reviewItems } from "./review.js";
import { expandPromptStrategies, PROMPT_STRATEGIES, type PromptStrategy } from "./strategies.js";
import type { ApiWorkflow, GeneratedStudyImage, ImageStudyManifest, PromptStudyCase } from "./types.js";
import {
  ComfyClient,
  comfyOutputPath,
  discoverWorkflowBindings,
  patchStudyWorkflow,
  safeOutputFilename
} from "./workflow.js";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function seedsFrom(value: string): number[] {
  const seeds = value.split(",").map((part) => Number(part.trim())).filter((seed) => Number.isSafeInteger(seed) && seed >= 0 && seed <= 0x7fffffff);
  return [...new Set(seeds.length ? seeds : [1103, 2909])];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function hash(value: string | ArrayBuffer): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(value);
  return hasher.digest("hex");
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, " ").slice(0, 1800);
}

const workflowPath = resolve(clean(args.get("workflow")) || "fixed_detailer_scheduler_workflow_EN_API_named_fields_renamed.json");
const sourceRoot = resolve(clean(args.get("source-root")) || "eval-results/raw");
const baselineRoot = clean(args.get("baseline-root")) ? resolve(clean(args.get("baseline-root"))) : "";
const includeFailedBaseline = args.get("include-failed-baseline") === "true";
const comfyUrl = clean(args.get("comfy-url")) || "http://127.0.0.1:8188";
const modelFilters = (clean(args.get("models")) || "deepseek,gemini,luna").split(",").map((value) => clean(value).toLowerCase()).filter(Boolean);
const strategies = (clean(args.get("strategies")) || "production").split(",").map((value) => clean(value).toLowerCase())
  .filter((value): value is PromptStrategy => PROMPT_STRATEGIES.includes(value as PromptStrategy));
if (strategies.length === 0) throw new Error(`--strategies must contain one or more of: ${PROMPT_STRATEGIES.join(", ")}`);
const scenarioFilter = clean(args.get("scenario"));
const excludedScenarioFilter = clean(args.get("exclude-scenario"));
const seeds = seedsFrom(clean(args.get("seeds")));
const maxImages = Math.min(500, positiveInteger(args.get("max-images"), 24));
const stepsArgument = clean(args.get("steps"));
const steps = stepsArgument ? Math.min(100, positiveInteger(stepsArgument, 25)) : undefined;
const generate = args.get("generate") === "true";
const positivePrefix = args.has("positive-prefix")
  ? clean(args.get("positive-prefix"))
  : "(masterpiece, best quality:1.6), score_8, score_7, highres, detailed, cinematic lighting, thin line, (@starshadowmagician:1.2), (@nishikujic:0.6), (@kuzuvine:1.2), (@ezu \\(e104mjd\\):1.8)";
const negativePrefix = args.has("negative-prefix")
  ? clean(args.get("negative-prefix"))
  : "(worst quality, low quality:1.4), score_1, score_2, score_3, artist name, blurry, jpeg artifacts, lowres, censor, bad anatomy, (bad hands:1.3), extra digits, (@bb \\(baalbuddy\\):1.6), @nel-zel formula, @konoshige \\(ryuun\\), @haganef, @saigalisk, @iesupa, @firolian, @foxicube, @cinnabus, @yukimaru ai, @mutsutake, shiny hair, eyelashes, long chin, (long jawline:1.4)";

function withPrefix(prefix: string, prompt: string, ordered: boolean): string {
  if (!prefix) return prompt.trim();
  if (!prompt.trim()) return prefix;
  return `${prefix}${ordered ? ",\n\n" : ", "}${prompt.trim()}`;
}

if (!(await Bun.file(workflowPath).exists())) throw new Error(`Workflow not found: ${workflowPath}`);
const workflowText = await Bun.file(workflowPath).text();
const workflow = JSON.parse(workflowText) as ApiWorkflow;
const bindings = discoverWorkflowBindings(workflow);
const originalSteps = bindings.stepsNodeId ? Number(workflow[bindings.stepsNodeId]?.inputs?.steps_total) : NaN;
const effectiveSteps = steps ?? (Number.isFinite(originalSteps) ? originalSteps : undefined);
const maxCases = Math.min(100, positiveInteger(args.get("max-cases"), 3));
function labeledCases(cases: PromptStudyCase[], label: string): PromptStudyCase[] {
  return cases.map((studyCase) => ({
    ...studyCase,
    candidates: studyCase.candidates.map((candidate) => ({
      ...candidate,
      id: `${slug(label)}--${candidate.id}`,
      model: `${label}: ${candidate.model}`
    }))
  }));
}

function mergeCases(groups: PromptStudyCase[][]): PromptStudyCase[] {
  const merged = new Map<string, PromptStudyCase>();
  for (const group of groups) {
    for (const studyCase of group) {
      const current = merged.get(studyCase.id);
      if (current) current.candidates.push(...studyCase.candidates);
      else merged.set(studyCase.id, { ...studyCase, candidates: [...studyCase.candidates] });
    }
  }
  return [...merged.values()].filter((studyCase) => studyCase.candidates.length >= 2);
}

const currentCases = await collectSavedPromptCases({
  sourceRoot,
  modelFilters,
  scenarioFilter,
  excludedScenarioFilter,
  minimumCandidates: baselineRoot || strategies.length > 1 ? 1 : 2
});
const sourceCases = baselineRoot
  ? mergeCases([
    labeledCases(await collectSavedPromptCases({
      sourceRoot: baselineRoot,
      modelFilters,
      scenarioFilter,
      excludedScenarioFilter,
      minimumCandidates: 1,
      includeFailed: includeFailedBaseline
    }), "frozen"),
    labeledCases(currentCases, "tuned")
  ])
  : currentCases;
const cases = expandPromptStrategies(
  sourceCases,
  strategies
).slice(0, maxCases);
if (cases.length === 0) throw new Error("No comparable passing prompt sets were found. Try a broader --scenario or --models=all.");

const planned = cases.flatMap((studyCase) => studyCase.candidates.flatMap((candidate) => seeds.map((seed) => ({ studyCase, candidate, seed }))));
if (planned.length > maxImages) {
  throw new Error(`Plan contains ${planned.length} images, above --max-images=${maxImages}. Narrow --scenario/--models, reduce --seeds, or raise the explicit cap.`);
}

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runRoot = resolve("eval-results/image-study/raw", runId);
const imageRoot = join(runRoot, "images");
const reviewPath = join(runRoot, "review.html");
const manifestPath = join(runRoot, "manifest.json");
const manifest: ImageStudyManifest = {
  schemaVersion: 1,
  runId,
  createdAt: new Date().toISOString(),
  comfyUrl,
  workflowPath: relative(process.cwd(), workflowPath),
  workflowHash: hash(workflowText),
  workflowSettings: {
    ...bindings,
    steps: effectiveSteps ?? null
  },
  promptAffixes: { positivePrefix, negativePrefix },
  sourceRoot: baselineRoot
    ? `frozen=${relative(process.cwd(), baselineRoot)}; tuned=${relative(process.cwd(), sourceRoot)}`
    : relative(process.cwd(), sourceRoot),
  modelFilters,
  seeds,
  cases,
  images: [],
  failures: []
};

function printPlan(): void {
  process.stdout.write([
    `Image prompt study: ${cases.length} comparable case(s), ${planned.length} image(s)`,
    `Models: ${modelFilters.join(", ")}`,
    `Prompt strategies: ${strategies.join(", ")}`,
    `Seeds: ${seeds.join(", ")}`,
    `Workflow: ${manifest.workflowPath} (${manifest.workflowHash.slice(0, 12)})`,
    `Steps: ${effectiveSteps ?? "workflow default"}`,
    `Positive prefix: ${positivePrefix || "(none)"}`,
    `Negative prefix: ${negativePrefix || "(none)"}`,
    `Comfy output prefix: InlayEval/${runId}/...`,
    generate ? "Generation enabled." : "Dry run only. Add --generate to queue images."
  ].join("\n") + "\n");
  for (const studyCase of cases) process.stdout.write(`- ${studyCase.id}: ${studyCase.candidates.map((candidate) => candidate.model).join(" | ")}\n`);
}

printPlan();
if (!generate) process.exit(0);

await mkdir(imageRoot, { recursive: true });
const client = new ComfyClient(comfyUrl);
await client.assertReachable();

async function persist(): Promise<void> {
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await Bun.write(reviewPath, renderReviewHtml(manifest, dirname(reviewPath)));
}

for (const [index, item] of planned.entries()) {
  const candidateId = item.candidate.id;
  const filenamePrefix = `InlayEval/${runId}/${slug(item.studyCase.id)}/${candidateId}-seed-${item.seed}`;
  process.stdout.write(`[${index + 1}/${planned.length}] ${item.studyCase.id} ${candidateId} seed=${item.seed}\n`);
  const started = Date.now();
  try {
    const effectivePositive = withPrefix(positivePrefix, item.candidate.positive, true);
    const effectiveNegative = withPrefix(negativePrefix, item.candidate.negative, false);
    const patched = patchStudyWorkflow(workflow, bindings, {
      positive: effectivePositive,
      negative: effectiveNegative,
      seed: item.seed,
      steps,
      filenamePrefix
    });
    const promptId = await client.queue(patched);
    const reference = await client.waitForImage(promptId, bindings.saveNodeId);
    const localPath = join(imageRoot, safeOutputFilename(item.studyCase.id, candidateId, item.seed, reference));
    await client.downloadImage(reference, localPath);
    const generated: GeneratedStudyImage = {
      caseId: item.studyCase.id,
      candidateId,
      model: item.candidate.model,
      seed: item.seed,
      positiveHash: hash(effectivePositive),
      negativeHash: hash(effectiveNegative),
      localPath,
      comfyPath: comfyOutputPath(reference),
      promptId,
      latencyMs: Date.now() - started,
      sourceFile: item.candidate.sourceFile
    };
    manifest.images.push(generated);
  } catch (error) {
    const message = safeError(error);
    manifest.failures.push({ caseId: item.studyCase.id, candidateId, seed: item.seed, error: message });
    process.stderr.write(`  failed: ${message}\n`);
  }
  await persist();
}

await persist();
const comparisons = reviewItems(manifest, dirname(reviewPath)).length;
process.stdout.write(`Completed ${manifest.images.length}/${planned.length} images with ${manifest.failures.length} failure(s).\nReview ${comparisons} blinded pair(s): ${reviewPath}\n`);
if (manifest.images.length === 0) process.exitCode = 1;
