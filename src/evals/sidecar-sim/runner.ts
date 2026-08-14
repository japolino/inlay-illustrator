import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  chooseCreativeConcepts,
  creativeConceptConstraint,
  creativeIdeationInstruction,
  creativeIdeationRequest,
  parseCreativeConcepts
} from "../../backend/creative.js";
import {
  continuityReference,
  formatTargetParagraphs,
  parserStageTokenBudget,
  parserMessages,
  parserUserRequest
} from "../../backend/parser.js";
import { buildCharacterTagReference } from "../../backend/prompt.js";
import { prepareParagraphs } from "../../backend/paragraphs.js";
import { normalizeScenePayload } from "../../backend/scenes.js";
import { parserInstruction } from "../../backend/instructions.js";
import { effectiveGenerationConfig } from "../../shared/config.js";
import { formatPreviousVisualState } from "../../backend/visual-state.js";
import type { CreativeConcept, ParsedPayload, PreparedParagraph } from "../../backend/types.js";
import { cleanString } from "../../backend/utils.js";
import { evaluateQuality, isCensoredEmptyResponse } from "./quality.js";
import { sidecarScenarios } from "./scenarios.js";
import { nsfwSidecarScenarios } from "./nsfw-scenarios.js";
import { expandedSidecarScenarios } from "./expanded-scenarios.js";
import { transformSidecarResponse } from "./transform.js";
import type { SidecarResult, SidecarScenario } from "./types.js";

const endpoint = cleanString(process.env.INLAY_SIDECAR_ENDPOINT);
const apiKey = cleanString(process.env.INLAY_SIDECAR_API_KEY);
if (!endpoint || !apiKey) {
  throw new Error("Set INLAY_SIDECAR_ENDPOINT and INLAY_SIDECAR_API_KEY before running sidecar evaluation.");
}

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));
const rounds = Math.max(1, Math.min(5, Number(args.get("rounds") || 1)));
const scenarioFilter = cleanString(args.get("scenario"));
const scenarioFilters = scenarioFilter.split(",").map((value) => cleanString(value)).filter(Boolean);
const modelFilter = cleanString(args.get("model")).toLowerCase();
const modelIdOverride = cleanString(args.get("model-id"));
const modelLabelOverride = cleanString(args.get("model-label"));
const reportLabel = cleanString(args.get("report-label")).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
const fastMode = args.get("fast") === "true";
const suite = cleanString(args.get("suite") || "general").toLowerCase();
if (suite !== "general" && suite !== "nsfw" && suite !== "expanded") throw new Error("--suite must be general, nsfw, or expanded.");
const maxRequests = Math.max(1, Math.min(200, Number(args.get("max-requests") || 120)));
let requestCount = 0;

type ModelTarget = { label: string; preferredIds: string[]; preferredPrefixes?: string[]; basename: string };
const TARGETS: ModelTarget[] = [
  { label: "DeepSeek V4 Pro", preferredIds: ["DeepSeek/deepseek-v4-pro", "ALIBABA/deepseek-v4-pro", "DeepSeek-A/deepseek-v4-pro"], basename: "deepseek-v4-pro" },
  { label: "Gemini 3.1 Pro Preview", preferredIds: ["Gemini/gcli-gemini-3.1-pro-preview"], basename: "gcli-gemini-3.1-pro-preview" },
  { label: "Claude Sonnet 5", preferredIds: ["AROMA/claude-sonnet-5"], basename: "claude-sonnet-5" },
  {
    label: "GPT-5.6 Luna",
    preferredIds: ["CODEX3/gpt-5.6-luna", "CODEX/gpt-5.6-luna"],
    preferredPrefixes: ["CODEX3-A/", "CODEX3-B/", "GPT/"],
    basename: "gpt-5.6-luna"
  }
];

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function modelsEndpoint(): string {
  return endpoint.replace(/\/chat\/completions\/?$/i, "/models");
}

function sanitized(value: string): string {
  return value.split(apiKey).join("[redacted]");
}

async function resolveModels(): Promise<Array<{ label: string; id: string }>> {
  let json: { data?: Array<{ id?: unknown }> } | null = null;
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(modelsEndpoint(), { headers: authHeaders() });
      if (!response.ok) {
        lastError = `Model discovery failed (${response.status}): ${sanitized((await response.text()).slice(0, 500))}`;
      } else {
        json = await response.json() as { data?: Array<{ id?: unknown }> };
        break;
      }
    } catch (error) {
      lastError = sanitized(error instanceof Error ? error.message : String(error));
    }
    if (attempt < 2) await Bun.sleep(1000 * (attempt + 1));
  }
  if (!json) throw new Error(lastError || "Model discovery failed.");
  const ids = (json.data || []).map((entry) => cleanString(entry.id)).filter(Boolean);
  if (modelIdOverride) {
    const id = ids.find((candidate) => candidate === modelIdOverride);
    if (!id) throw new Error(`Requested --model-id was not returned by /v1/models: ${modelIdOverride}`);
    return [{ label: modelLabelOverride || id.split("/").at(-1) || id, id }];
  }
  const targets = TARGETS.filter((target) => !modelFilter
    || target.label.toLowerCase().includes(modelFilter)
    || target.basename.includes(modelFilter));
  return targets.map((target) => {
    const candidates = ids.filter((id) => id.toLowerCase().split("/").at(-1) === target.basename);
    const preferred = target.preferredIds.find((preferredId) => ids.includes(preferredId))
      || target.preferredPrefixes?.flatMap((prefix) => candidates.filter((id) => id.startsWith(prefix)))[0];
    const id = preferred || (candidates.length === 1 ? candidates[0] : "");
    if (!id) throw new Error(`Could not unambiguously resolve ${target.label} from /v1/models.`);
    return { label: target.label, id };
  });
}

type Completion = {
  text: string;
  latencyMs: number;
  usage: Record<string, number>;
  diagnostics: NonNullable<SidecarResult["providerDiagnostics"]>;
};

function responseText(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = (choices[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : cleanString((part as Record<string, unknown>)?.text)).join("");
  return cleanString(payload.output_text) || cleanString(payload.text);
}

function usageRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, amount]) => Number.isFinite(Number(amount)))
    .map(([key, amount]) => [key, Number(amount)]));
}

async function complete(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens: number
): Promise<Completion> {
  const body = { model, messages, stream: false, response_format: { type: "json_object" }, max_tokens: maxTokens, reasoning: { source: "off" } };
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (requestCount >= maxRequests) throw new Error(`Request cap ${maxRequests} reached.`);
    requestCount += 1;
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000);
      let response: Response;
      let responseBody: string;
      try {
        response = await fetch(endpoint, { method: "POST", headers: authHeaders(), body: JSON.stringify(body), signal: controller.signal });
        responseBody = await response.text();
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${sanitized(responseBody.slice(0, 800))}`;
        if (response.status < 500 || attempt === 1) throw new Error(lastError);
        continue;
      }
      const payload = JSON.parse(responseBody) as Record<string, unknown>;
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const choice = (choices[0] || {}) as Record<string, unknown>;
      const message = (choice.message || {}) as Record<string, unknown>;
      const text = responseText(payload);
      return {
        text,
        latencyMs: Date.now() - started,
        usage: usageRecord(payload.usage),
        diagnostics: {
          finishReason: cleanString(choice.finish_reason),
          messageKeys: Object.keys(message).sort(),
          contentLength: text.length,
          reasoningLength: cleanString(message.reasoning_content).length
        }
      };
    } catch (error) {
      lastError = sanitized(error instanceof Error ? error.message : String(error));
      if (attempt === 1) throw new Error(lastError);
    }
  }
  throw new Error(lastError || "Completion failed.");
}

function strictJson(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw.trim());
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray((parsed as ParsedPayload).scenes));
  } catch {
    return false;
  }
}

function referenceContext(scenario: SidecarScenario): string {
  return [
    scenario.characterMemory ? `${buildCharacterTagReference(scenario.characterMemory)}\nUse these only as durable character baselines. The current numbered source always wins.` : "",
    scenario.previousVisualState ? formatPreviousVisualState(scenario.previousVisualState) : ""
  ].filter(Boolean).join("\n\n");
}

async function ideate(
  model: string,
  scenario: SidecarScenario,
  paragraphs: PreparedParagraph[],
  targetSource: string,
  reference: string
): Promise<{ concepts: CreativeConcept[]; detail: NonNullable<SidecarResult["ideation"]> }> {
  const completion = await complete(model, parserMessages(
    creativeIdeationInstruction(scenario.config),
    reference,
    creativeIdeationRequest(targetSource),
    ""
  ), parserStageTokenBudget(model, scenario.config, "ideation"));
  const concepts = parseCreativeConcepts(completion.text, paragraphs, scenario.config);
  return {
    concepts,
    detail: { raw: completion.text, candidateCount: concepts.length, latencyMs: completion.latencyMs, usage: completion.usage }
  };
}

async function runScenario(model: string, scenario: SidecarScenario): Promise<SidecarResult> {
  if (fastMode) {
    // Fast Mode runs the same scenario through the effective runtime config:
    // compact instruction, reduced budgets, no preprocessing/ideation/remote
    // camera repair, and the fast context policy.
    scenario = { ...scenario, config: effectiveGenerationConfig({ ...scenario.config, fastMode: true }) };
  }
  const paragraphs = prepareParagraphs(scenario.paragraphs.join("\n\n"), scenario.config);
  const targetSource = formatTargetParagraphs(paragraphs);
  const reference = continuityReference(referenceContext(scenario), scenario.recentContext || "");
  let concepts: CreativeConcept[] = [];
  let ideation: SidecarResult["ideation"];
  let completion: Completion | undefined;
  let requestMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  try {
    if (!scenario.config.fastMode && !scenario.config.adaptiveMode && scenario.config.perspectiveMode === "creative") {
      const generated = await ideate(model, scenario, paragraphs, targetSource, reference);
      concepts = generated.concepts;
      ideation = generated.detail;
    }
    const selectedConcepts = chooseCreativeConcepts(concepts, [], () => 0);
    requestMessages = parserMessages(
      parserInstruction(scenario.config, {
        hasPreviousVisualState: Boolean(scenario.config.previousVisualStateEnabled && scenario.previousVisualState)
      }),
      reference,
      parserUserRequest(targetSource, creativeConceptConstraint(selectedConcepts, false)),
      ""
    );
    const mainMaxTokens = parserStageTokenBudget(model, scenario.config, "main");
    completion = await complete(model, requestMessages, mainMaxTokens);
    const rawJson = strictJson(completion.text);
    let transformed = transformSidecarResponse(completion.text, scenario, paragraphs, concepts);
    if (scenario.config.adaptiveMode && !scenario.config.fastMode) {
      const creativeParagraphs = new Set(normalizeScenePayload(transformed.payload)
        .filter((entry) => cleanString(entry.shot.perspectiveMode).toLowerCase() === "creative")
        .map((entry) => entry.parserParagraph));
      if (creativeParagraphs.size > 0) {
        const creativeSourceParagraphs = paragraphs.filter((paragraph) => creativeParagraphs.has(paragraph.parserIndex));
        const generated = await ideate(model, scenario, creativeSourceParagraphs, formatTargetParagraphs(creativeSourceParagraphs), reference);
        concepts = generated.concepts;
        ideation = generated.detail;
        transformed = transformSidecarResponse(completion.text, scenario, paragraphs, concepts);
      }
    }
    const quality = evaluateQuality(
      transformed.payload,
      scenario,
      transformed.rendered.map((entry) => ({ paragraph: entry.paragraph, positive: entry.positive })),
      rawJson,
      { requireTerminalState: true }
    );
    return {
      scenario: scenario.id,
      model,
      raw: completion.text,
      rawJson,
      locallyRepaired: !rawJson,
      payload: transformed.payload,
      rendered: transformed.rendered,
      issues: quality.issues,
      score: quality.score,
      passed: quality.passed && transformed.rendered.length > 0,
      latencyMs: completion.latencyMs,
      usage: completion.usage,
      providerDiagnostics: completion.diagnostics,
      request: {
        endpoint,
        model,
        stream: false,
        responseFormat: "json_object",
        reasoning: "off",
        maxTokens: mainMaxTokens,
        messageLengths: requestMessages.map((message) => message.content.length)
      },
      ideation
    };
  } catch (error) {
    const censored = isCensoredEmptyResponse(model, completion?.text || "");
    return {
      scenario: scenario.id,
      model,
      raw: completion?.text || "",
      rawJson: completion ? strictJson(completion.text) : false,
      locallyRepaired: false,
      rendered: [],
      issues: [{
        category: "rendering",
        code: censored ? "model_censored" : "pipeline_error",
        message: censored ? "Gemini returned no output; classified as censorship for this suite." : sanitized(error instanceof Error ? error.message : String(error)),
        critical: true
      }],
      score: 0,
      passed: false,
      latencyMs: completion?.latencyMs || 0,
      usage: completion?.usage || {},
      providerDiagnostics: completion?.diagnostics,
      request: { endpoint, model, stream: false, responseFormat: "json_object", reasoning: "off", maxTokens: parserStageTokenBudget(model, scenario.config, "main"), messageLengths: requestMessages.map((message) => message.content.length) },
      ideation,
      censored,
      error: sanitized(error instanceof Error ? error.message : String(error))
    };
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function summary(results: SidecarResult[], models: Array<{ label: string; id: string }>, runId: string, includePromptPreviews: boolean): string {
  const lines = [
    "# Sidecar simulation summary",
    "",
    `Run: ${runId}`,
    `Requests: ${requestCount}`,
    `Scenarios: ${new Set(results.map((result) => result.scenario)).size}`,
    "",
    "## Model matrix",
    "",
    "| Model | Passed | Raw JSON | Censored | Average score | Critical issues | Tokens |",
    "|---|---:|---:|---:|---:|---:|---:|"
  ];
  for (const model of models) {
    const own = results.filter((result) => result.model === model.id);
    const passed = own.filter((result) => result.passed).length;
    const raw = own.filter((result) => result.rawJson).length;
    const censored = own.filter((result) => result.censored).length;
    const average = own.length ? own.reduce((sum, result) => sum + result.score, 0) / own.length : 0;
    const critical = own.flatMap((result) => result.issues).filter((entry) => entry.critical).length;
    const tokens = own.reduce((sum, result) => sum + (result.usage.total_tokens || 0) + (result.ideation?.usage.total_tokens || 0), 0);
    lines.push(`| ${model.label} (${model.id}) | ${passed}/${own.length} | ${raw}/${own.length} | ${censored} | ${average.toFixed(1)} | ${critical} | ${tokens} |`);
  }
  const grouped = new Map<string, number>();
  results.flatMap((result) => result.issues.map((entry) => ({ result, entry }))).forEach(({ entry }) => grouped.set(`${entry.category}.${entry.code}`, (grouped.get(`${entry.category}.${entry.code}`) || 0) + 1));
  lines.push("", "## Failure groups", "");
  if (grouped.size === 0) lines.push("None.");
  else [...grouped.entries()].sort((left, right) => right[1] - left[1]).forEach(([key, count]) => lines.push(`- ${key}: ${count}`));
  lines.push("", "## Case details", "");
  for (const result of results) {
    lines.push(`### ${result.scenario} - ${result.model}`, "", `${result.passed ? "PASS" : "FAIL"} | score ${result.score} | ${result.latencyMs} ms | raw JSON ${result.rawJson ? "yes" : "no"}`);
    if (result.issues.length) result.issues.forEach((entry) => lines.push(`- ${entry.critical ? "critical" : "note"} ${entry.category}.${entry.code}: ${entry.message}`));
    else lines.push("- No detected issues.");
    if (includePromptPreviews) result.rendered.forEach((entry) => lines.push(`- P${entry.paragraph} ${entry.perspective}: ${entry.positive.replace(/\s+/g, " ").slice(0, 420)}`));
    lines.push("");
  }
  return lines.join("\n");
}

const models = await resolveModels();
if (models.length === 0) throw new Error("No target models matched the requested filter.");
const scenarioSource = suite === "nsfw"
  ? nsfwSidecarScenarios
  : suite === "expanded"
    ? expandedSidecarScenarios
    : sidecarScenarios;
const scenarios = scenarioSource.filter((scenario) => scenarioFilters.length === 0 || scenarioFilters.some((filter) => scenario.id.includes(filter)));
if (scenarios.length === 0) throw new Error("No scenarios matched the requested filter.");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const rawRoot = join("eval-results", "raw", suite, runId);
await mkdir(rawRoot, { recursive: true });
const results: SidecarResult[] = [];
for (let round = 1; round <= rounds; round += 1) {
  for (const scenario of scenarios) {
    for (const model of models) {
      const result = await runScenario(model.id, scenario);
      results.push(result);
      const file = join(rawRoot, `${String(round).padStart(2, "0")}-${slug(scenario.id)}-${slug(model.id)}.json`);
      const replayConfig = fastMode
        ? effectiveGenerationConfig({ ...scenario.config, fastMode: true })
        : scenario.config;
      await Bun.write(file, `${JSON.stringify({
        round,
        ...result,
        replayContext: {
          config: replayConfig,
          paragraphs: scenario.paragraphs,
          previousVisualState: scenario.previousVisualState
        }
      }, null, 2)}\n`);
      process.stdout.write(`${result.passed ? "PASS" : "FAIL"} ${model.label} ${scenario.id} score=${result.score}\n`);
    }
  }
}
const report = summary(results, models, runId, suite === "general");
await mkdir("eval-results", { recursive: true });
const reportStem = suite === "nsfw"
  ? "latest-nsfw-summary"
  : suite === "expanded"
    ? "latest-expanded-summary"
    : "latest-sidecar-summary";
const effectiveReportLabel = [reportLabel, fastMode ? "fast" : ""].filter(Boolean).join("-");
const reportName = `${reportStem}${effectiveReportLabel ? `-${effectiveReportLabel}` : ""}.md`;
await Bun.write(join("eval-results", reportName), `${report}\n`);
process.stdout.write(`\n${report.split("## Case details", 1)[0]}\nRaw artifacts: ${rawRoot}\n`);
if (results.some((result) => !result.passed)) process.exitCode = 1;
