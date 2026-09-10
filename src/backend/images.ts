import { isNovelAiConnection, type Config } from "../shared/config.js";
import { logStage } from "./logging.js";
import { abortError, throwIfAborted } from "./operation-manager.js";
import type { ComfyUIConfig, ComfyUIMapping, ImageConnection, PreparedImageJob } from "./types.js";
import { keysOf } from "./utils.js";
import { normalizeCharacterPayload } from "./v376/provider.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const imageConnectionCache = new Map<string, { expiresAt: number; connection: ImageConnection | null }>();

const COMFY_KEYS_TO_DISCARD = [
  "workflow",
  "workflowFormat",
  "preserveImportedWorkflow",
  "comfyui_custom_fields",
  "field_mappings",
  "checkpoint",
  "ckpt_name",
  "scheduler",
  "sampler_name",
  "custom"
];

function cacheImageConnection(key: string, connection: ImageConnection | null): void {
  if (imageConnectionCache.size >= 32) {
    const oldest = imageConnectionCache.keys().next().value;
    if (typeof oldest === "string") imageConnectionCache.delete(oldest);
  }
  imageConnectionCache.set(key, { expiresAt: Date.now() + 5000, connection });
}

export async function resolveImageConnection(config: Config, userId?: string): Promise<ImageConnection | null> {
  logStage(config, "image_connection_resolve_start", { configuredConnectionId: config.imageConnectionId });
  const cacheKey = JSON.stringify([userId ?? null, config.imageConnectionId || "(default)"]);
  const cached = imageConnectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.connection;
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
      cacheImageConnection(cacheKey, configured);
      return configured;
    }
    throw new Error(`Image connection "${config.imageConnectionId}" not found. Select a valid image connection.`);
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
  cacheImageConnection(cacheKey, fallback);
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
  const source = workflow as Record<string, { inputs?: Record<string, unknown> }>;
  const patched = { ...source };
  const clonedNodes = new Set<string>();
  for (const mapping of mappings) {
    const originalNode = source[mapping.nodeId];
    if (originalNode && !clonedNodes.has(mapping.nodeId)) {
      patched[mapping.nodeId] = {
        ...originalNode,
        inputs: originalNode.inputs && typeof originalNode.inputs === "object" ? { ...originalNode.inputs } : originalNode.inputs
      };
      clonedNodes.add(mapping.nodeId);
    }
    const node = patched[mapping.nodeId];
    if (!node || !node.inputs || typeof node.inputs !== "object") continue;
    const value = mapping.mappedAs === "custom"
      ? (values.custom && typeof values.custom === "object" ? (values.custom as Record<string, unknown>)[`${mapping.nodeId}:${mapping.fieldName}`] : undefined)
      : values[mapping.mappedAs];
    if (value !== undefined) node.inputs[mapping.fieldName] = value;
  }
  return patched as Record<string, unknown>;
}

function freshSeed(previous: unknown[]): number {
  const prior = new Set(previous.map(numberParam).filter((value): value is number => value !== undefined));
  let seed = Math.floor(Math.random() * 2147483647);
  while (prior.has(seed)) seed = (seed + 1) % 2147483647;
  return seed;
}

/** Clones a provider request, refreshes its selected prompt layers, and changes its seed inputs. */
export function rerollImageParameters(
  parameters: Record<string, unknown>,
  connection: ImageConnection | null,
  prompt?: string,
  negative?: string
): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(parameters)) as Record<string, unknown>;

  // Preserve character channels across rerolls (NovelAI native multi-character channels)
  const charCandidates = (Array.isArray(cloned.characters) ? cloned.characters : undefined)
    ?? (Array.isArray(cloned.nativeCharacters) ? cloned.nativeCharacters : undefined);
  if (charCandidates) {
    const normalized = normalizeCharacterPayload(charCandidates);
    cloned.characters = normalized;
    cloned.nativeCharacters = normalized;
  }

  // Provider: NovelAI
  if (isNovelAiConnection(connection)) {
    for (const key of COMFY_KEYS_TO_DISCARD) {
      delete cloned[key];
    }
    let seed = freshSeed([cloned.seed]);
    if (seed <= 0) seed = Math.floor(Math.random() * 2147483646) + 1;
    cloned.seed = seed;

    const defaultParams = connection?.default_parameters || {};
    const rawSampler = stringParam(cloned.sampler)
      ?? stringParam(defaultParams.sampler)
      ?? "k_euler_ancestral";
    const rawSteps = numberParam(cloned.steps)
      ?? numberParam(defaultParams.steps)
      ?? 28;
    const rawScale = numberParam(cloned.scale)
      ?? numberParam(cloned.cfg)
      ?? numberParam(defaultParams.scale)
      ?? numberParam(defaultParams.cfg)
      ?? 5.0;
    const rawWidth = numberParam(cloned.width)
      ?? numberParam(defaultParams.width)
      ?? 832;
    const rawHeight = numberParam(cloned.height)
      ?? numberParam(defaultParams.height)
      ?? 1216;

    cloned.sampler = rawSampler;
    cloned.steps = Math.min(50, Math.max(1, Math.round(rawSteps)));
    const scale = Math.min(20, Math.max(1, Number(rawScale.toFixed(1))));
    cloned.scale = scale;
    cloned.cfg = scale;
    cloned.width = Math.min(1920, Math.max(512, Math.round(rawWidth / 64) * 64));
    cloned.height = Math.min(1920, Math.max(512, Math.round(rawHeight / 64) * 64));

    const smeaVal = cloned.smea !== undefined ? cloned.smea : defaultParams.smea;
    if (smeaVal !== undefined) cloned.smea = smeaVal === true || smeaVal === "true";
    const smeaDynVal = cloned.smea_dyn !== undefined ? cloned.smea_dyn : defaultParams.smea_dyn;
    if (smeaDynVal !== undefined) cloned.smea_dyn = smeaDynVal === true || smeaDynVal === "true";

    return cloned;
  }

  // Provider: ComfyUI or SwarmUI
  if (connection?.provider === "comfyui" || connection?.provider === "swarmui") {
    const workflow = cloned.workflow;
    if (workflow && typeof workflow === "object" && !Array.isArray(workflow)) {
      const comfy = readComfyConfig(connection?.metadata);
      const mappings = comfy?.field_mappings || [];
      const seedMappings = mappings.filter((mapping) => mapping.mappedAs === "seed");
      const priorSeeds: unknown[] = [cloned.seed];
      for (const mapping of seedMappings) {
        const node = (workflow as Record<string, { inputs?: Record<string, unknown> }>)[mapping.nodeId];
        priorSeeds.push(node?.inputs?.[mapping.fieldName]);
      }
      if (seedMappings.length === 0) {
        for (const node of Object.values(workflow as Record<string, { inputs?: Record<string, unknown> }>)) {
          if (!node?.inputs || typeof node.inputs !== "object") continue;
          for (const [key, value] of Object.entries(node.inputs)) {
            if (/^(?:seed|noise_seed)$/i.test(key)) priorSeeds.push(value);
          }
        }
      }
      const seed = freshSeed(priorSeeds);
      cloned.seed = seed;
      for (const mapping of mappings) {
        const value = mapping.mappedAs === "positive_prompt" ? prompt
          : mapping.mappedAs === "negative_prompt" ? negative
            : undefined;
        if (value !== undefined) {
          const node = (workflow as Record<string, { inputs?: Record<string, unknown> }>)[mapping.nodeId];
          if (node?.inputs && typeof node.inputs === "object") node.inputs[mapping.fieldName] = value;
        }
      }
      if (seedMappings.length > 0) {
        for (const mapping of seedMappings) {
          const node = (workflow as Record<string, { inputs?: Record<string, unknown> }>)[mapping.nodeId];
          if (node?.inputs && typeof node.inputs === "object") node.inputs[mapping.fieldName] = seed;
        }
      } else {
        for (const node of Object.values(workflow as Record<string, { inputs?: Record<string, unknown> }>)) {
          if (!node?.inputs || typeof node.inputs !== "object") continue;
          for (const key of Object.keys(node.inputs)) {
            if (/^(?:seed|noise_seed)$/i.test(key)) node.inputs[key] = seed;
          }
        }
      }
      return cloned;
    }

    // Cross-provider reroll to ComfyUI (no existing workflow on cloned): build from metadata
    const comfy = readComfyConfig(connection?.metadata);
    if (comfy) {
      const workflowTemplate = comfy.workflow_api_json || comfy.workflow_json;
      const mappings = comfy.field_mappings || [];
      const customValues = cloned.comfyui_custom_fields && typeof cloned.comfyui_custom_fields === "object"
        ? cloned.comfyui_custom_fields as Record<string, unknown>
        : cloned.custom && typeof cloned.custom === "object"
          ? cloned.custom as Record<string, unknown>
          : {};
      const seed = freshSeed([cloned.seed]);
      const defaultParams = connection.default_parameters || {};
      const values: Record<string, unknown> = {
        positive_prompt: prompt,
        negative_prompt: negative || (typeof cloned.negativePrompt === "string" ? cloned.negativePrompt : undefined),
        seed,
        steps: numberParam(cloned.steps) ?? numberParam(defaultParams.steps),
        cfg: numberParam(cloned.cfg) ?? numberParam(cloned.scale) ?? numberParam(defaultParams.cfg),
        sampler_name: stringParam(cloned.sampler_name) ?? stringParam(cloned.sampler) ?? stringParam(defaultParams.sampler_name),
        scheduler: stringParam(cloned.scheduler) ?? stringParam(defaultParams.scheduler),
        width: numberParam(cloned.width) ?? numberParam(defaultParams.width),
        height: numberParam(cloned.height) ?? numberParam(defaultParams.height),
        checkpoint: stringParam(cloned.checkpoint || cloned.ckpt_name || defaultParams.checkpoint),
        custom: customValues
      };
      const patched = patchComfyWorkflow(workflowTemplate as Record<string, unknown>, mappings, values);
      cloned.seed = seed;
      cloned.workflow = patched;
      cloned.workflowFormat = "api_prompt";
      cloned.preserveImportedWorkflow = true;
      return cloned;
    }

    // ComfyUI without workflow in metadata: just roll seed
    let seed = freshSeed([cloned.seed]);
    if (seed <= 0) seed = Math.floor(Math.random() * 2147483646) + 1;
    cloned.seed = seed;
    return cloned;
  }

  // Generic / other providers
  delete cloned.workflow;
  delete cloned.workflowFormat;
  delete cloned.preserveImportedWorkflow;
  delete cloned.comfyui_custom_fields;
  delete cloned.field_mappings;
  let seed = freshSeed([cloned.seed]);
  if (seed <= 0) seed = Math.floor(Math.random() * 2147483646) + 1;
  cloned.seed = seed;
  return cloned;
}

export async function buildImageParameters(
  config: Config,
  connection: ImageConnection | null,
  prompt: string,
  negative: string,
  characters?: Array<{ prompt: string; negative?: string }>
): Promise<Record<string, unknown>> {
  const parameters = { ...(connection?.default_parameters || {}), ...config.imageParameters };
  logStage(config, "image_parameters_start", {
    provider: connection?.provider || "(default)",
    connectionId: connection?.id || null,
    promptLength: prompt.length,
    negativeLength: negative.length,
    parameterKeys: keysOf(parameters)
  });

  // Extract character payload candidates
  const charCandidates = characters
    ?? (Array.isArray(parameters.characters) ? parameters.characters : undefined)
    ?? (Array.isArray(parameters.nativeCharacters) ? parameters.nativeCharacters : undefined);
  const normalizedChars = charCandidates ? normalizeCharacterPayload(charCandidates) : undefined;

  if (isNovelAiConnection(connection)) {
    const rawSeed = numberParam(parameters.seed);
    let seed = (rawSeed === undefined || rawSeed <= 0) ? freshSeed([]) : Math.floor(rawSeed);
    if (seed <= 0) seed = Math.floor(Math.random() * 2147483646) + 1;

    const defaultParams = connection?.default_parameters || {};
    const rawSteps = numberParam(parameters.steps)
      ?? numberParam(defaultParams.steps)
      ?? 28;
    const steps = Math.min(50, Math.max(1, Math.round(rawSteps)));

    const rawScale = numberParam(parameters.scale)
      ?? numberParam(parameters.cfg)
      ?? numberParam(defaultParams.scale)
      ?? numberParam(defaultParams.cfg)
      ?? 5.0;
    const scale = Math.min(20, Math.max(1, Number(rawScale.toFixed(1))));

    const sampler = stringParam(parameters.sampler)
      ?? stringParam(defaultParams.sampler)
      ?? stringParam(parameters.sampler_name)
      ?? "k_euler_ancestral";

    const rawWidth = numberParam(parameters.width)
      ?? numberParam(defaultParams.width)
      ?? 832;
    const rawHeight = numberParam(parameters.height)
      ?? numberParam(defaultParams.height)
      ?? 1216;
    const width = Math.min(1920, Math.max(512, Math.round(rawWidth / 64) * 64));
    const height = Math.min(1920, Math.max(512, Math.round(rawHeight / 64) * 64));

    const cleanParams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (!COMFY_KEYS_TO_DISCARD.includes(key)) {
        cleanParams[key] = value;
      }
    }

    const naiParams: Record<string, unknown> = {
      ...cleanParams,
      sampler,
      steps,
      scale,
      cfg: scale,
      seed,
      width,
      height
    };

    const smeaVal = parameters.smea !== undefined ? parameters.smea : defaultParams.smea;
    if (smeaVal !== undefined) naiParams.smea = smeaVal === true || smeaVal === "true";
    const smeaDynVal = parameters.smea_dyn !== undefined ? parameters.smea_dyn : defaultParams.smea_dyn;
    if (smeaDynVal !== undefined) naiParams.smea_dyn = smeaDynVal === true || smeaDynVal === "true";

    if (normalizedChars && normalizedChars.length > 0) {
      naiParams.characters = normalizedChars;
      naiParams.nativeCharacters = normalizedChars;
    }

    logStage(config, "image_parameters_ready", {
      provider: "novelai",
      sampler,
      steps,
      scale,
      width,
      height,
      seed,
      characterCount: normalizedChars?.length ?? 0
    });
    return naiParams;
  }

  // Non-NovelAI: attach characters if present so metadata is preserved
  if (normalizedChars && normalizedChars.length > 0) {
    parameters.characters = normalizedChars;
    parameters.nativeCharacters = normalizedChars;
  }

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
  generate: (job: PreparedImageJob) => Promise<TResult> | TResult,
  options: {
    signal?: AbortSignal;
    stopWaitingOnAbort?: boolean;
    onSettled?: (
      job: PreparedImageJob,
      result: PromiseSettledResult<TResult>
    ) => Promise<void> | void;
  } = {}
): Promise<{ jobs: PreparedImageJob[]; results: TResult[] }> {
  const jobs: PreparedImageJob[] = [];
  const requests: Promise<TResult>[] = [];
  let serialRequest: Promise<unknown> = Promise.resolve();
  let preparationFailure: unknown;
  let hasPreparationFailure = false;

  for (const [index, input] of inputs.entries()) {
    let job: PreparedImageJob;
    try {
      throwIfAborted(options.signal);
      job = await prepare(input, index);
      throwIfAborted(options.signal);
    } catch (error) {
      preparationFailure = error;
      hasPreparationFailure = true;
      break;
    }
    jobs.push(job);

    const invoke = (): Promise<TResult> => {
      try {
        throwIfAborted(options.signal);
        return Promise.resolve(generate(job));
      } catch (error) {
        return Promise.reject(error);
      }
    };
    const providerRequest = eager || requests.length === 0 ? invoke() : serialRequest.then(invoke);
    const request = options.onSettled
      ? providerRequest.then(async (result) => {
        await options.onSettled?.(job, { status: "fulfilled", value: result });
        return result;
      }, async (error) => {
        await options.onSettled?.(job, { status: "rejected", reason: error });
        throw error;
      })
      : providerRequest;
    void request.catch(() => undefined);
    requests.push(request);
    // A failed request must not prevent later serial jobs from being attempted.
    if (!eager) serialRequest = providerRequest.then(() => undefined, () => undefined);
  }

  const allSettled = Promise.allSettled(requests);
  const settled = options.stopWaitingOnAbort && options.signal
    ? await new Promise<PromiseSettledResult<TResult>[]>((resolve, reject) => {
      const cancel = () => {
        options.signal?.removeEventListener("abort", cancel);
        reject(abortError());
      };
      options.signal?.addEventListener("abort", cancel, { once: true });
      void allSettled.then((results) => {
        options.signal?.removeEventListener("abort", cancel);
        resolve(results);
      });
      if (options.signal?.aborted) cancel();
    })
    : await allSettled;
  const successfulJobs: PreparedImageJob[] = [];
  const successfulResults: TResult[] = [];
  for (const [index, result] of settled.entries()) {
    if (result.status !== "fulfilled") continue;
    successfulJobs.push(jobs[index]);
    successfulResults.push(result.value);
  }

  // Preserve partial batches. Only fail the generation when no submitted image
  // succeeded, matching the original inlay behavior.
  if (successfulResults.length === 0) {
    if (hasPreparationFailure) throw preparationFailure;
    const failure = settled.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
  return {
    jobs: successfulJobs,
    results: successfulResults
  };
}
