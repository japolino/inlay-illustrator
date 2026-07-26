import { basename, dirname, join } from "node:path";
import type { ApiWorkflow, ComfyImageReference, WorkflowBindings } from "./types.js";

function titleOf(workflow: ApiWorkflow, id: string): string {
  return String(workflow[id]?._meta?.title || "");
}

function findOne(workflow: ApiWorkflow, predicate: (id: string) => boolean, label: string): string {
  const matches = Object.keys(workflow).filter(predicate);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${label} node, found ${matches.length}.`);
  return matches[0];
}

export function discoverWorkflowBindings(workflow: ApiWorkflow): WorkflowBindings {
  const positiveNodeId = findOne(workflow, (id) => /API INPUT\s*-\s*Positive Prompt/i.test(titleOf(workflow, id)), "positive API input");
  const negativeNodeId = findOne(workflow, (id) => /API INPUT\s*-\s*Negative Prompt/i.test(titleOf(workflow, id)), "negative API input");
  const seedNodeId = findOne(workflow, (id) => Boolean(workflow[id]?.inputs && Object.prototype.hasOwnProperty.call(workflow[id].inputs, "seed")
    && (/seed/i.test(titleOf(workflow, id)) || /seed/i.test(String(workflow[id]?.class_type || "")))), "seed input");
  const stepMatches = Object.keys(workflow).filter((id) => workflow[id]?.inputs && Object.prototype.hasOwnProperty.call(workflow[id].inputs, "steps_total"));
  if (stepMatches.length > 1) throw new Error(`Expected at most one sampler settings node, found ${stepMatches.length}.`);
  const saveNodeId = findOne(workflow, (id) => Boolean(workflow[id]?.class_type === "SaveImage" && workflow[id]?.inputs
    && Object.prototype.hasOwnProperty.call(workflow[id].inputs, "filename_prefix")), "SaveImage output");
  return { positiveNodeId, negativeNodeId, seedNodeId, stepsNodeId: stepMatches[0], saveNodeId };
}

export function patchStudyWorkflow(
  source: ApiWorkflow,
  bindings: WorkflowBindings,
  values: { positive: string; negative: string; seed: number; steps?: number; filenamePrefix: string }
): ApiWorkflow {
  const workflow = structuredClone(source);
  const set = (id: string, field: string, value: unknown): void => {
    const inputs = workflow[id]?.inputs;
    if (!inputs || !Object.prototype.hasOwnProperty.call(inputs, field)) throw new Error(`Workflow node ${id} has no ${field} input.`);
    inputs[field] = value;
  };
  set(bindings.positiveNodeId, "value", values.positive);
  set(bindings.negativeNodeId, "value", values.negative);
  set(bindings.seedNodeId, "seed", values.seed);
  if (values.steps !== undefined) {
    if (!bindings.stepsNodeId) throw new Error("The workflow has no steps_total input to override.");
    set(bindings.stepsNodeId, "steps_total", values.steps);
  }
  set(bindings.saveNodeId, "filename_prefix", values.filenamePrefix);
  return workflow;
}

function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

async function responseError(response: Response): Promise<Error> {
  const body = (await response.text()).slice(0, 1200);
  return new Error(`ComfyUI ${response.status}: ${body}`);
}

export class ComfyClient {
  readonly baseUrl: string;
  readonly clientId: string;

  constructor(baseUrl: string, clientId = crypto.randomUUID()) {
    this.baseUrl = cleanBaseUrl(baseUrl);
    this.clientId = clientId;
  }

  async assertReachable(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/system_stats`);
    if (!response.ok) throw await responseError(response);
  }

  async queue(workflow: ApiWorkflow): Promise<string> {
    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: this.clientId })
    });
    if (!response.ok) throw await responseError(response);
    const payload = await response.json() as { prompt_id?: unknown; error?: unknown; node_errors?: unknown };
    const promptId = String(payload.prompt_id || "");
    if (!promptId) throw new Error(`ComfyUI returned no prompt_id: ${JSON.stringify(payload).slice(0, 1200)}`);
    return promptId;
  }

  async waitForImage(promptId: string, saveNodeId: string, timeoutMs = 300_000): Promise<ComfyImageReference> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const response = await fetch(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`);
      if (!response.ok) throw await responseError(response);
      const history = await response.json() as Record<string, {
        outputs?: Record<string, { images?: ComfyImageReference[] }>;
        status?: { status_str?: string; messages?: unknown[] };
      }>;
      const record = history[promptId];
      const images = record?.outputs?.[saveNodeId]?.images || Object.values(record?.outputs || {}).flatMap((output) => output.images || []);
      if (images.length > 0) return images[0];
      if (record?.status?.status_str === "error") throw new Error(`ComfyUI execution failed: ${JSON.stringify(record.status.messages || []).slice(0, 1600)}`);
      await Bun.sleep(300);
    }
    throw new Error(`Timed out waiting for ComfyUI prompt ${promptId}.`);
  }

  async downloadImage(reference: ComfyImageReference, outputPath: string): Promise<void> {
    const query = new URLSearchParams({ filename: reference.filename, subfolder: reference.subfolder || "", type: reference.type || "output" });
    const response = await fetch(`${this.baseUrl}/view?${query}`);
    if (!response.ok) throw await responseError(response);
    await Bun.write(outputPath, await response.arrayBuffer());
  }
}

export function comfyOutputPath(reference: ComfyImageReference): string {
  return join(reference.subfolder || "", reference.filename).replace(/\\/g, "/");
}

export function safeOutputFilename(caseId: string, candidateId: string, seed: number, reference: ComfyImageReference): string {
  const extension = basename(reference.filename).match(/\.[a-z0-9]+$/i)?.[0] || ".png";
  return `${caseId}--${candidateId}--seed-${seed}${extension}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function parentDirectory(path: string): string {
  return dirname(path);
}
