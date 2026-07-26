import { mkdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { GoogleGenAI } from "@google/genai";
import type { ImageStudyManifest } from "./types.js";
import {
  buildVisionPairs,
  normalizeVisionAssessment,
  renderVisionSummary,
  visionAssessmentSchema,
  visionJudgments,
  visionPrompt,
  type VisionPair,
  type VisionPairResult,
  type VisionRun
} from "./vision.js";

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.replace(/^--/, "").split("=");
  return [key, value.join("=") || "true"];
}));

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/AIza[0-9A-Za-z_-]+/g, "[redacted]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 1200);
}

function mimeType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

async function imagePart(path: string): Promise<{ inlineData: { mimeType: string; data: string } }> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`Image not found: ${path}`);
  return {
    inlineData: {
      mimeType: mimeType(path),
      data: Buffer.from(await file.arrayBuffer()).toString("base64")
    }
  };
}

const manifestPath = resolve(clean(args.get("manifest")));
if (!clean(args.get("manifest"))) throw new Error("Pass --manifest=<image-study manifest.json>.");
if (!(await Bun.file(manifestPath).exists())) throw new Error(`Manifest not found: ${manifestPath}`);
const apiKey = clean(process.env.INLAY_VISION_API_KEY) || clean(process.env.GEMINI_API_KEY);
if (!apiKey) throw new Error("Set INLAY_VISION_API_KEY or GEMINI_API_KEY before running vision evaluation.");

const manifest = JSON.parse(await Bun.file(manifestPath).text()) as ImageStudyManifest;
const model = clean(args.get("model")) || "gemini-flash-lite-latest";
const maxPairs = Math.min(500, positiveInteger(args.get("max-pairs"), 24));
const delayMs = Math.min(10_000, positiveInteger(args.get("delay-ms"), 250));
const pairs = buildVisionPairs(manifest).slice(0, maxPairs);
if (pairs.length === 0) throw new Error("Manifest contains no complete same-seed image pairs.");

const outputRoot = resolve(clean(args.get("output")) || `${dirname(manifestPath)}/vision`);
const rawRoot = resolve(outputRoot, "raw");
const runPath = resolve(outputRoot, "vision-run.json");
const judgmentsPath = resolve(outputRoot, "vision-judgments.json");
const summaryPath = resolve(outputRoot, "summary.md");
await mkdir(rawRoot, { recursive: true });

const ai = new GoogleGenAI({ apiKey });
const existingRun = await Bun.file(runPath).exists()
  ? JSON.parse(await Bun.file(runPath).text()) as VisionRun
  : undefined;
const canResume = existingRun?.runId === manifest.runId
  && existingRun.workflowHash === manifest.workflowHash
  && existingRun.model === model;
const completed = new Map((canResume ? existingRun.results : [])
  .filter((result) => result.assessment)
  .map((result) => [result.pair.id, result]));
const results: VisionPairResult[] = [];
const run: VisionRun = {
  schemaVersion: 1,
  runId: manifest.runId,
  workflowHash: manifest.workflowHash,
  model,
  createdAt: canResume ? existingRun.createdAt : new Date().toISOString(),
  results
};

async function persist(): Promise<void> {
  await Bun.write(runPath, `${JSON.stringify(run, null, 2)}\n`);
  await Bun.write(judgmentsPath, `${JSON.stringify(visionJudgments(run), null, 2)}\n`);
  await Bun.write(summaryPath, renderVisionSummary(manifest, run));
}

async function assess(pair: VisionPair): Promise<VisionPairResult> {
  const startedAt = Date.now();
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          visionPrompt(pair),
          "Image A",
          await imagePart(pair.leftImagePath),
          "Image B",
          await imagePart(pair.rightImagePath)
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: visionAssessmentSchema()
        }
      });
      const raw = clean(response.text);
      await Bun.write(resolve(rawRoot, `${pair.id}.json`), `${raw}\n`);
      if (!raw) throw new Error("Vision model returned no output.");
      return {
        pair,
        assessment: normalizeVisionAssessment(JSON.parse(raw)),
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      lastError = safeError(error);
      const retryable = /\b(?:429|500|502|503|504)\b|high demand|temporar|unavailable|resource exhausted/i.test(lastError);
      if (!retryable || attempt === 2) break;
      await Bun.sleep(1000 * (2 ** attempt));
    }
  }
  return { pair, latencyMs: Date.now() - startedAt, error: lastError || "Vision evaluation failed." };
}

process.stdout.write(`Vision evaluation: ${pairs.length} blinded pair(s) with ${model} (${completed.size} resumed)\n`);
for (const [index, pair] of pairs.entries()) {
  const previous = completed.get(pair.id);
  if (previous) {
    results.push(previous);
    process.stdout.write(`[${index + 1}/${pairs.length}] ${pair.caseId} seed=${pair.seed} resumed\n`);
    continue;
  }
  process.stdout.write(`[${index + 1}/${pairs.length}] ${pair.caseId} seed=${pair.seed}\n`);
  results.push(await assess(pair));
  await persist();
  if (delayMs && index < pairs.length - 1) await Bun.sleep(delayMs);
}
await persist();
process.stdout.write(`Summary: ${summaryPath}\nJudgments: ${judgmentsPath}\n`);
if (results.every((result) => !result.assessment)) process.exitCode = 1;
