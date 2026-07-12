import type { Config } from "../shared/config.js";
import { logStage } from "./logging.js";
import type { ComfyUIConfig, ComfyUIMapping, ImageConnection, PreparedImageJob } from "./types.js";
import { keysOf } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

export async function resolveImageConnection(config: Config, userId?: string): Promise<ImageConnection | null> {
  logStage(config, "image_connection_resolve_start", { configuredConnectionId: config.imageConnectionId });
  if (config.imageConnectionId) {
    const configured = await spindle.imageGen.getConnection(config.imageConnectionId, userId) as ImageConnection | null;
    if (configured) {
      logStage(config, "image_connection_resolved", {
        id: configured.id,
        name: configured.name,
        provider: configured.provider,
        model: configured.model,
        source: "configured"
      });
      return configured;
    }
    logStage(config, "image_connection_missing", { configuredConnectionId: config.imageConnectionId }, "warn");
  }
  const connections = await spindle.imageGen.listConnections(userId) as ImageConnection[];
  const fallback = connections.find((connection) => connection.is_default) || connections[0] || null;
  logStage(config, "image_connection_resolved", fallback ? {
    id: fallback.id,
    name: fallback.name,
    provider: fallback.provider,
    model: fallback.model,
    source: fallback.is_default ? "default" : "first_available"
  } : { source: "none", availableConnections: 0 }, fallback ? "info" : "warn");
  return fallback;
}

function readComfyConfig(metadata: unknown): ComfyUIConfig | null {
  if (!metadata || typeof metadata !== "object") return null;
  const comfy = (metadata as Record<string, unknown>).comfyui;
  if (!comfy || typeof comfy !== "object") return null;
  const config = comfy as ComfyUIConfig;
  const workflow = config.workflow_api_json || config.workflow_json;
  if (!workflow || typeof workflow !== "object" || !Array.isArray(config.field_mappings)) return null;
  return config;
}

function numberParam(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function patchComfyWorkflow(
  workflow: Record<string, unknown>,
  mappings: ComfyUIMapping[],
  values: Record<string, unknown>
): Record<string, unknown> {
  const patched = JSON.parse(JSON.stringify(workflow)) as Record<string, { inputs?: Record<string, unknown> }>;
  for (const mapping of mappings) {
    const node = patched[mapping.nodeId];
    if (!node || !node.inputs || typeof node.inputs !== "object") continue;
    const value = mapping.mappedAs === "custom"
      ? (values.custom && typeof values.custom === "object" ? (values.custom as Record<string, unknown>)[`${mapping.nodeId}:${mapping.fieldName}`] : undefined)
      : values[mapping.mappedAs];
    if (value !== undefined) node.inputs[mapping.fieldName] = value;
  }
  return patched as Record<string, unknown>;
}

export async function buildImageParameters(
  config: Config,
  connection: ImageConnection | null,
  prompt: string,
  negative: string
): Promise<Record<string, unknown>> {
  const parameters = { ...(connection?.default_parameters || {}), ...config.imageParameters };
  logStage(config, "image_parameters_start", {
    provider: connection?.provider || "(default)",
    connectionId: connection?.id || null,
    promptLength: prompt.length,
    negativeLength: negative.length,
    parameterKeys: keysOf(parameters)
  });
  if (connection?.provider !== "comfyui" && connection?.provider !== "swarmui") {
    logStage(config, "image_parameters_ready", { provider: connection?.provider || "(default)", workflowPresent: Boolean(parameters.workflow) });
    return parameters;
  }
  if (parameters.workflow && typeof parameters.workflow === "object") {
    logStage(config, "comfy_workflow_existing", { parameterKeys: keysOf(parameters) });
    return parameters;
  }

  const comfy = readComfyConfig(connection.metadata);
  if (!comfy) {
    logStage(config, "comfy_workflow_missing", { metadataKeys: keysOf(connection.metadata) }, "warn");
    return parameters;
  }
  const workflow = comfy.workflow_api_json || comfy.workflow_json;
  const mappings = comfy.field_mappings || [];
  logStage(config, "comfy_workflow_config_found", {
    workflowSource: comfy.workflow_api_json ? "api" : "json",
    mappingCount: mappings.length,
    mappedAs: mappings.map((mapping) => mapping.mappedAs)
  });
  if (!mappings.some((mapping) => mapping.mappedAs === "positive_prompt")) {
    throw new Error("Imported ComfyUI workflow must map at least one positive prompt field");
  }

  const customValues = parameters.comfyui_custom_fields && typeof parameters.comfyui_custom_fields === "object"
    ? parameters.comfyui_custom_fields as Record<string, unknown>
    : parameters.custom && typeof parameters.custom === "object"
      ? parameters.custom as Record<string, unknown>
      : {};
  const values: Record<string, unknown> = {
    positive_prompt: prompt,
    negative_prompt: negative || parameters.negativePrompt,
    seed: numberParam(parameters.seed) ?? Math.floor(Math.random() * 2147483647),
    steps: numberParam(parameters.steps),
    cfg: numberParam(parameters.cfg),
    sampler_name: stringParam(parameters.sampler_name),
    scheduler: stringParam(parameters.scheduler),
    width: numberParam(parameters.width),
    height: numberParam(parameters.height),
    checkpoint: stringParam(parameters.checkpoint || parameters.ckpt_name),
    custom: customValues
  };
  const patched = patchComfyWorkflow(workflow as Record<string, unknown>, mappings, values);
  logStage(config, "comfy_workflow_patched", {
    workflowPresent: true,
    workflowFormat: "api_prompt",
    parameterKeys: keysOf({ ...parameters, workflow: patched, workflowFormat: "api_prompt", preserveImportedWorkflow: true })
  });
  return { ...parameters, workflow: patched, workflowFormat: "api_prompt", preserveImportedWorkflow: true };
}

/**
 * Prepares prompts one at a time and submits each image as soon as its prompt is
 * ready. ComfyUI submissions are eager; other providers use a promise chain so
 * preparation of later prompts can overlap the currently running image without
 * allowing two provider requests to run at once.
 */
export async function prepareAndDispatchImageJobs<TInput, TResult>(
  inputs: TInput[],
  eager: boolean,
  prepare: (input: TInput, index: number) => Promise<PreparedImageJob> | PreparedImageJob,
  generate: (job: PreparedImageJob) => Promise<TResult> | TResult
): Promise<{ jobs: PreparedImageJob[]; results: TResult[] }> {
  const jobs: PreparedImageJob[] = [];
  const requests: Promise<TResult>[] = [];
  let serialRequest: Promise<unknown> = Promise.resolve();
  let preparationFailure: unknown;
  let hasPreparationFailure = false;

  for (const [index, input] of inputs.entries()) {
    let job: PreparedImageJob;
    try {
      job = await prepare(input, index);
    } catch (error) {
      preparationFailure = error;
      hasPreparationFailure = true;
      break;
    }
    jobs.push(job);

    const invoke = (): Promise<TResult> => {
      try {
        return Promise.resolve(generate(job));
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const request = eager || requests.length === 0 ? invoke() : serialRequest.then(invoke);
    void request.catch(() => undefined);
    requests.push(request);
    if (!eager) serialRequest = request;
  }

  const settled = await Promise.allSettled(requests);
  if (hasPreparationFailure) throw preparationFailure;
  const failure = settled.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return {
    jobs,
    results: settled.map((result) => (result as PromiseFulfilledResult<TResult>).value)
  };
}
