/**
 * ImageService over Lumiverse image-gen connections (`spindle.imageGen.generate`; spec/novelai.md §9, spec/lumiverse-host.md §3).
 *
 * NovelAI (host provider LV/src/image-gen/providers/novelai.ts):
 * - Host parameters: `resolution "WxH"` (width/height are ignored by the host), `sampler`, `steps`, `guidance` (-> scale),
 *   `seed` (non-negative safe integer; random uint32 when empty, AM `Ii`/`c2` @108822), `negativePrompt` (the ONLY negative the
 *   host reads), `characterTags [{tags}]`, `resolvedReferenceImages` + `referenceFidelity` (director reference, V4.5 only; never V5,
 *   AM `yge` / `Out` @108882-108896).
 * - Everything the host does not expose goes through `parameters.rawRequestOverride` (a JSON string deep-merged into the OUTER body
 *   `{input, model, action, parameters}`; arrays replace): `noise_schedule`, `cfg_rescale`, `qualityToggle`, `add_original_image`,
 *   `extra_noise_seed`, `skip_cfg_above_sigma`, per-character `characterPrompts[].{center,uc}` and `v4_prompt` /
 *   `v4_negative_prompt` char captions with centers + `use_coords` / `use_order` (AM body `jut` @108897-108966), and img2img
 *   (`action:"img2img"`, `parameters.{image,strength,noise}`, AM `CSt`/`exe` @158090-158104). A connection-level
 *   `rawRequestOverride` default is kept underneath ours.
 * ComfyUI: host workflow mapping (`parameters.workflow_id`), img2img through `resolvedSourceImages` + `denoise` (also mirrored into
 *   `comfyui_field_values`) when the workflow maps `init_image`.
 * Other providers: prompt / negative / size / seed only.
 *
 * Queue: one serial queue per provider kind and user (AM NovelAI job queue `xAt` @166738 / provider queue `Sbe` @120002) with
 * `runtime.novelaiParallelIntervalSec` between the end of one request and the start of the next.
 * Retries: AM dispatcher `_yt.generate` @120130-120173 / `byt` @120076: `generationAutoRetryCount` (0..10) extra attempts, fixed
 * 100 ms, on transient errors; exhausted -> IMAGE_REQUEST_RETRY_EXHAUSTED. `retries: 0` when an outer dispatcher retries.
 * Abort: `imageGen.generate` has no signal, so an abort stops waiting (queue / retry / request) and discards a late result
 * (the persisted host image is deleted best effort).
 */
import {
  generationProviderFromLumiverse,
  isNovelAIV5Model,
  normalizeConfig,
  promptCodecForProvider,
  type ImageConnectionSummary,
  type InlayConfig,
  type ModelOption,
  type RpcError,
} from "../../shared/contract/index.js";
import { fail, isAbortLike, RpcFailure, toRpcError } from "../rpc/errors.js";
import type { ImageGenerateRequest, ImageGenerateResult, ImageService, ResolvedImageTarget, RunLog, SpindleHost } from "./types.js";
import { abortError, asArray, asRecord, errorMessage, raceAbort, sleep, str, TtlCache } from "./util.js";

export const IMAGE_RETRY_DELAY_MS = 100;
/** AM `skip_cfg_above_sigma` for 4.5 models with the quality toggle (jut @108897). */
export const NOVELAI_SKIP_CFG_ABOVE_SIGMA = 59.04722600415217;

/** Canonical NovelAI sampler ids the host provider accepts. */
export const NOVELAI_SAMPLER_IDS: readonly string[] = Object.freeze(["k_euler_ancestral", "k_euler", "k_dpmpp_2m", "k_dpmpp_2s_ancestral", "k_dpmpp_sde", "ddim_v3"]);

/** Reads a sampler value that may be a plain string or a structured object (host profiles are not consistent). */
export function samplerCandidateFrom(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  const record = asRecord(value);
  for (const key of ["id", "value", "sampler", "sampler_name", "name", "slug"]) {
    const found = record[key];
    if (typeof found === "string" && found.trim()) return found.trim();
  }
  return undefined;
}

/** Map sampler spellings (ComfyUI names, labels) onto NovelAI ids; undefined when unknown. */
export function normalizeNovelAiSampler(candidate: unknown): string | undefined {
  const raw = samplerCandidateFrom(candidate);
  if (!raw) return undefined;
  const clean = raw.trim().toLowerCase();
  if (clean === "euler") return "k_euler";
  if (clean === "euler_ancestral" || clean === "euler a" || clean === "euler_a" || clean === "euler ancestral") return "k_euler_ancestral";
  if (clean === "dpmpp_2m" || clean === "dpm_2m" || clean === "dpm++ 2m") return "k_dpmpp_2m";
  if (clean === "dpmpp_2s_ancestral" || clean === "dpm_2s_ancestral" || clean === "dpm++ 2s ancestral") return "k_dpmpp_2s_ancestral";
  if (clean === "dpmpp_sde" || clean === "dpm++ sde") return "k_dpmpp_sde";
  if (clean === "ddim" || clean === "ddim_v3") return "ddim_v3";
  if (NOVELAI_SAMPLER_IDS.includes(clean)) return clean;
  if (clean.startsWith("k_")) return clean;
  return undefined;
}

/** Random uint32 (AM `c2`). */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]!;
}

/** AM `Ii`: digits only, 0..4294967295; anything else -> null (= random). */
export function parseSeed(value: unknown): number | null {
  const s = typeof value === "number" ? (Number.isSafeInteger(value) ? String(value) : "") : str(value);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 0 && n <= 4294967295 ? n : null;
}

/* ------------------------------------------------------------------------------------------------
 * ComfyUI workflow mapping (host connection metadata)
 * ---------------------------------------------------------------------------------------------- */

export interface ComfyMapping { nodeId: string; fieldName: string; mappedAs: string }
export interface ComfyWorkflowConfig { workflow_json?: Record<string, unknown>; workflow_api_json?: Record<string, unknown>; field_mappings?: ComfyMapping[] }

/** The selected (or active) saved workflow of a ComfyUI connection. */
export function readComfyConfig(metadata: unknown, workflowId?: unknown): ComfyWorkflowConfig | null {
  const record = asRecord(metadata);
  const library = asArray<{ id?: unknown; config?: unknown }>(record.comfyui_workflows);
  const selected = str(workflowId) || str(record.comfyui_active_workflow_id);
  const comfy = (selected ? library.find((entry) => str(entry?.id) === selected)?.config : undefined) ?? record.comfyui;
  const config = asRecord(comfy) as ComfyWorkflowConfig;
  const workflow = config.workflow_api_json || config.workflow_json;
  if (!workflow || typeof workflow !== "object" || !Array.isArray(config.field_mappings)) return null;
  return config;
}

export function comfyWorkflowMaps(metadata: unknown, workflowId: unknown, field: string): boolean {
  return readComfyConfig(metadata, workflowId)?.field_mappings?.some((m) => m.mappedAs === field) === true;
}

/* ------------------------------------------------------------------------------------------------
 * Parameter building (pure, exported for tests)
 * ---------------------------------------------------------------------------------------------- */

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}
function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (source === undefined) return target;
  if (source === null || typeof source !== "object" || Array.isArray(source)) return source;
  if (!target || typeof target !== "object" || Array.isArray(target)) return source;
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    out[key] = deepMerge(out[key], value);
  }
  return out;
}

function parseOverride(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

export interface BuiltImageRequest {
  parameters: Record<string, unknown>;
  seed: number | null;
  width: number;
  height: number;
  notes: string[];
}

/** NovelAI request parameters for the host provider (+ rawRequestOverride). */
export function buildNovelAIParameters(
  request: ImageGenerateRequest,
  config: InlayConfig,
  target: Pick<ResolvedImageTarget, "model" | "isNovelAIV5">,
  connectionDefaults: Record<string, unknown> = {},
  seedSource: () => number = randomSeed,
): BuiltImageRequest {
  const nai = config.novelai;
  const o = request.novelai ?? {};
  const notes: string[] = [];
  // AM jut: clamp(round(width), 64, 2048).
  const width = clampInt(request.width, 64, 2048, 832);
  const height = clampInt(request.height, 64, 2048, 1216);
  const seed = parseSeed(request.seed) ?? seedSource();
  const steps = clampInt(o.steps ?? nai.steps, 1, 50, 28);
  const scale = Number.isFinite(Number(o.scale ?? nai.scale)) ? Number(o.scale ?? nai.scale) || 6 : 6;
  const cfgRescale = clampNum(o.cfgRescale ?? nai.cfgRescale, 0, 1, 0.5);
  const sampler = normalizeNovelAiSampler(o.sampler ?? nai.sampler) ?? "k_euler_ancestral";
  const noiseSchedule = str(o.noiseSchedule ?? nai.noiseSchedule) || "karras";
  const qualityToggle = (o.qualityToggle ?? nai.qualityToggle) !== false;
  const useOrder = (o.useOrder ?? nai.useOrder) !== false;
  const useCoords = o.useCoords === true;
  const negative = String(request.negativePrompt ?? "").trim();
  const prompt = String(request.prompt ?? "").trim();
  const structured = /^nai-diffusion-(?:4|5)(?:-|$)/.test(target.model);
  const is45 = /^nai-diffusion-4-5/.test(target.model);
  const characters = (o.characters ?? [])
    .map((c) => ({ prompt: String(c.prompt ?? "").trim(), uc: String(c.negativePrompt ?? "").trim(), center: c.center && Number.isFinite(c.center.x) && Number.isFinite(c.center.y) ? { x: c.center.x, y: c.center.y } : { x: 0, y: 0 } }))
    .filter((c) => c.prompt || c.uc);

  const parameters: Record<string, unknown> = {
    ...config.image.parameters,
    resolution: `${width}x${height}`,
    sampler,
    steps,
    guidance: scale,
    seed,
    negativePrompt: negative,
  };
  for (const key of ["workflow", "workflowFormat", "preserveImportedWorkflow", "workflow_id", "resolvedSourceImages", "denoise", "comfyui_field_values"]) delete parameters[key];
  if (characters.length) parameters.characterTags = characters.map((c) => ({ tags: c.prompt }));

  // Director (character) reference: V4.5 only (AM yge / Out), never V5 (host skips it too).
  const refs = o.characterReferences ?? [];
  let directorRefs = false;
  if (refs.length) {
    if (!is45 || target.isNovelAIV5) notes.push(`Character reference skipped: ${target.model} has no director reference.`);
    else {
      parameters.resolvedReferenceImages = refs.map((r) => ({ data: r.data.replace(/^data:[^;,]+;base64,/, ""), strength: clampNum(r.strength, 0, 1, 0.6), infoExtracted: 1, refType: r.type || "character" }));
      // Host: referenceFidelity is global; secondary strength = 1 - fidelity.
      parameters.referenceFidelity = clampNum(refs[0]!.fidelity, 0, 1, 1);
      directorRefs = true;
    }
  }

  const inner: Record<string, unknown> = {
    params_version: target.isNovelAIV5 ? 4 : 3,
    qualityToggle,
    noise_schedule: noiseSchedule,
    cfg_rescale: cfgRescale,
    add_original_image: false,
    extra_noise_seed: seedSource(),
    use_coords: false,
  };
  if (structured) {
    const charCaptions = characters.map((c) => ({ char_caption: c.prompt, centers: [c.center] }));
    inner.characterPrompts = characters.map((c) => ({ prompt: c.prompt, uc: c.uc, center: c.center, enabled: true }));
    inner.v4_prompt = { caption: { base_caption: prompt, char_captions: charCaptions }, use_coords: useCoords && characters.length > 0, use_order: useOrder };
    inner.v4_negative_prompt = { caption: { base_caption: negative, char_captions: characters.map((c) => ({ char_caption: c.uc, centers: [c.center] })) }, legacy_uc: false };
  }
  inner.skip_cfg_above_sigma = is45 && qualityToggle && !directorRefs ? NOVELAI_SKIP_CFG_ABOVE_SIGMA : null;

  let override: Record<string, unknown> = { parameters: inner };
  if (o.imageToImage) {
    override.action = "img2img";
    inner.image = o.imageToImage.data.replace(/^data:[^;,]+;base64,/, "");
    // AM aC/iC @108807: strength 0.4..1 (default 0.4), noise 0..1 (default 0).
    inner.strength = clampNum(o.imageToImage.strength, 0.4, 1, 0.4);
    inner.noise = clampNum(o.imageToImage.noise, 0, 1, 0);
  }
  if (o.rawOverride) override = deepMerge(override, o.rawOverride) as Record<string, unknown>;
  const base = deepMerge(parseOverride(connectionDefaults.rawRequestOverride), parseOverride(config.image.parameters.rawRequestOverride));
  parameters.rawRequestOverride = JSON.stringify(deepMerge(base, override));
  return { parameters, seed, width, height, notes };
}

/** ComfyUI parameters (host workflow mapping). Throws `unsupported` when img2img needs an unmapped `init_image`. */
export function buildComfyParameters(
  request: ImageGenerateRequest,
  config: InlayConfig,
  target: Pick<ResolvedImageTarget, "comfyuiWorkflowId">,
  connectionMetadata: Record<string, unknown>,
  seedSource: () => number = randomSeed,
): BuiltImageRequest {
  const width = clampInt(request.width, 64, 4096, 832);
  const height = clampInt(request.height, 64, 4096, 1216);
  const seed = parseSeed(request.seed) ?? seedSource();
  const workflowId = str(request.comfy?.workflowId) || target.comfyuiWorkflowId;
  const parameters: Record<string, unknown> = { ...config.image.parameters, width, height, seed, negativePrompt: String(request.negativePrompt ?? "") };
  delete parameters.rawRequestOverride;
  if (workflowId) parameters.workflow_id = workflowId;
  const source = request.comfy?.sourceImage;
  if (source) {
    if (!comfyWorkflowMaps(connectionMetadata, workflowId, "init_image")) {
      fail("unsupported", "Reference images need a ComfyUI workflow with an init_image mapping.", { detailCode: "COMFYUI_INIT_IMAGE_UNMAPPED" });
    }
    const denoise = clampNum(request.comfy?.denoise, 0, 1, 0.6);
    parameters.resolvedSourceImages = [{ data: source.data.replace(/^data:[^;,]+;base64,/, ""), mimeType: source.mimeType }];
    parameters.resolvedReferenceImages = [];
    parameters.denoise = denoise;
    parameters.comfyui_field_values = { ...asRecord(parameters.comfyui_field_values), denoise };
  }
  return { parameters, seed, width, height, notes: [] };
}

export function buildGenericParameters(request: ImageGenerateRequest, config: InlayConfig): BuiltImageRequest {
  const width = clampInt(request.width, 64, 4096, 1024);
  const height = clampInt(request.height, 64, 4096, 1024);
  const seed = parseSeed(request.seed);
  const parameters: Record<string, unknown> = { ...config.image.parameters, width, height, negativePrompt: String(request.negativePrompt ?? "") };
  if (seed !== null) parameters.seed = seed;
  return { parameters, seed, width, height, notes: [] };
}

/** AM `byt` @120076 (+ host transport phrasing): is this image error transient? */
export function isRetryableImageError(error: unknown): boolean {
  if (isAbortLike(error)) return false;
  const r = asRecord(error);
  if (r.retryable === false) return false;
  if (r.retryable === true) return true;
  if (error instanceof RpcFailure) return error.error.retryable === true;
  if (error instanceof TypeError) return true;
  const message = errorMessage(error);
  const status = Number(r.status) || Number(/\((\d{3})\)|\bHTTP\s*(\d{3})\b/i.exec(message)?.slice(1).find(Boolean));
  if (status === 408 || status === 425 || status === 429 || status >= 500) return true;
  return /concurrent generation is locked|timed? ?out|fetch failed|network error|econnreset|socket hang up|terminated|temporarily unavailable/i.test(message);
}

function stripBase64ForRecord(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 2000 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 200))) return `[base64 ${value.length} chars]`;
    if (value.startsWith("{") && value.length > 2000) {
      try {
        return JSON.stringify(stripBase64ForRecord(JSON.parse(value)));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(stripBase64ForRecord);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripBase64ForRecord(v)]));
  return value;
}

function mimeOfDataUrl(dataUrl: unknown): { mimeType: string; data: string } | null {
  const m = typeof dataUrl === "string" ? /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl) : null;
  return m ? { mimeType: m[1]!, data: m[2]! } : null;
}

/* ------------------------------------------------------------------------------------------------
 * Service
 * ---------------------------------------------------------------------------------------------- */

export interface ImageServiceDeps {
  host: SpindleHost;
  userId: string | undefined;
  loadConfig: () => Promise<InlayConfig>;
  log?: RunLog;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  seedSource?: () => number;
}

interface ConnectionInfo {
  id: string;
  name: string;
  provider: string;
  model: string;
  isDefault: boolean;
  defaultParameters: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/** Serial queue with a minimum gap between the end of one task and the start of the next. */
class GapQueue {
  private tail: Promise<void> = Promise.resolve();
  private lastFinishedAt = 0;
  private depth = 0;
  constructor(
    private readonly now: () => number,
    private readonly wait: (ms: number, signal?: AbortSignal) => Promise<void>,
  ) {}
  async run<T>(gapMs: () => number, task: () => Promise<T>, signal?: AbortSignal, onQueue?: (position: number, depth: number) => void): Promise<T> {
    this.depth += 1;
    const position = this.depth;
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => (release = resolve));
    let ran = false;
    try {
      if (position > 1) onQueue?.(position - 1, this.depth);
      await raceAbort(previous, signal);
      const gap = Math.max(0, Math.min(30000, gapMs()) - (this.now() - this.lastFinishedAt));
      if (this.lastFinishedAt && gap > 0) await this.wait(gap, signal);
      ran = true;
      return await task();
    } finally {
      if (ran) this.lastFinishedAt = this.now();
      this.depth -= 1;
      // Release only after the previous task settled (an aborted waiter must not let the next one overtake).
      void previous.then(release, release);
    }
  }
}

export function createImageService(deps: ImageServiceDeps): ImageService {
  const { host, userId } = deps;
  const now = deps.now ?? Date.now;
  const wait = deps.sleep ?? sleep;
  const seedSource = deps.seedSource ?? randomSeed;
  const cache = new TtlCache<ConnectionInfo>(5000, 32, now);
  const queues = new Map<string, GapQueue>();
  const log = (level: "debug" | "info" | "warn" | "error", message: string, details?: unknown) => deps.log?.append(level, "image", message, details);

  function toInfo(dto: unknown): ConnectionInfo {
    const r = asRecord(dto);
    return { id: str(r.id), name: str(r.name), provider: str(r.provider), model: str(r.model), isDefault: r.is_default === true, defaultParameters: asRecord(r.default_parameters), metadata: asRecord(r.metadata) };
  }

  async function connection(connectionId: string): Promise<ConnectionInfo> {
    const key = connectionId || "\u0000default";
    const hit = cache.get(key);
    if (hit) return hit;
    let info: ConnectionInfo | null = null;
    try {
      if (connectionId) {
        const dto = await host.imageGen.getConnection(connectionId, userId);
        info = dto ? toInfo(dto) : null;
      } else {
        const list = asArray(await host.imageGen.listConnections(userId)).map(toInfo);
        info = list.find((c) => c.isDefault) ?? list[0] ?? null;
      }
    } catch (error) {
      throw new RpcFailure({ code: "provider-error", message: `Could not read the image connection: ${errorMessage(error)}`, retryable: true });
    }
    if (!info || !info.id) {
      fail("bad-request", connectionId ? "The selected image connection no longer exists. Select another one in the image model settings." : "No image generation connection is configured. Add one in Lumiverse and select it in the image model settings.", { detailCode: "IMAGE_CONNECTION_MISSING" });
    }
    return cache.set(key, info);
  }

  function targetOf(config: InlayConfig, info: ConnectionInfo, modelOverride?: string): ResolvedImageTarget {
    const generationProvider = generationProviderFromLumiverse(info.provider);
    const model = str(modelOverride) || config.image.model || info.model;
    return {
      connectionId: info.id,
      connectionName: info.name,
      lumiverseProvider: info.provider,
      generationProvider,
      promptCodec: promptCodecForProvider(generationProvider),
      model,
      isNovelAIV5: generationProvider === "novelai" && isNovelAIV5Model(model),
      comfyuiWorkflowId: config.image.comfyuiWorkflowId,
    };
  }

  function queueFor(kind: string): GapQueue {
    let q = queues.get(kind);
    if (!q) queues.set(kind, (q = new GapQueue(now, wait)));
    return q;
  }

  const service: ImageService = {
    async resolveTarget(overrides = {}) {
      const config = await deps.loadConfig();
      const info = await connection(str(overrides.connectionId) || config.image.connectionId);
      return targetOf(config, info, overrides.model);
    },

    async generate(request, options = {}) {
      const { signal, onProgress } = options;
      if (signal?.aborted) throw abortError(signal.reason);
      const config = normalizeConfig(await deps.loadConfig());
      const info = await connection(str(request.connectionId) || config.image.connectionId);
      const target = targetOf(config, info, request.model);
      const prompt = String(request.prompt ?? "").trim();
      if (!prompt) fail("bad-request", "The image prompt is empty.", { detailCode: "IMAGE_PROMPT_EMPTY" });

      const built =
        target.generationProvider === "novelai"
          ? buildNovelAIParameters(request, config, target, info.defaultParameters, seedSource)
          : target.generationProvider === "comfy-ui"
            ? buildComfyParameters(request, config, target, info.metadata, seedSource)
            : buildGenericParameters(request, config);
      for (const note of built.notes) log("info", note);

      const input: Record<string, unknown> = {
        connection_id: target.connectionId,
        prompt,
        negativePrompt: String(request.negativePrompt ?? ""),
        model: target.model,
        parameters: built.parameters,
        includeDataUrl: request.includeData === true,
        ...(request.ownerCharacterId ? { owner_character_id: request.ownerCharacterId } : {}),
        ...(request.ownerChatId ? { owner_chat_id: request.ownerChatId } : {}),
        ...(userId ? { userId } : {}),
      };

      const retries = request.retries !== undefined ? clampInt(request.retries, 0, 10, 0) : clampInt(config.runtime.generationAutoRetryCount, 0, 10, 5);
      const gapMs = () => clampInt(config.runtime.novelaiParallelIntervalSec, 0, 30, 0) * 1000;
      const timeoutMs = target.generationProvider === "comfy-ui" ? clampInt(config.runtime.comfyuiCompletionTimeoutMs, 1000, 3600000, 600000) : 0;

      const callOnce = async (): Promise<Record<string, unknown>> => {
        const pending = host.imageGen.generate(input as unknown as Parameters<SpindleHost["imageGen"]["generate"]>[0]) as Promise<unknown>;
        // A result that arrives after an abort / our timeout is discarded: delete the persisted image.
        let abandoned = false;
        pending.then(
          (late) => {
            const id = str(asRecord(late).imageId);
            if (abandoned && id) void host.images.delete(id, userId).catch(() => undefined);
          },
          () => undefined,
        );
        try {
          let race: Promise<unknown> = raceAbort(pending, signal);
          if (timeoutMs) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            race = Promise.race([
              race,
              new Promise((_, reject) => {
                timer = setTimeout(() => reject(new RpcFailure({ code: "timeout", message: `Image generation timed out after ${Math.round(timeoutMs / 1000)} s.`, retryable: true, detailCode: "REQUEST_TIMEOUT" })), timeoutMs);
              }),
            ]).finally(() => clearTimeout(timer));
          }
          return asRecord(await race);
        } catch (error) {
          abandoned = true;
          throw error;
        }
      };

      const attemptLoop = async (): Promise<{ result: Record<string, unknown>; attempts: number }> => {
        for (let attempt = 1; ; attempt += 1) {
          if (signal?.aborted) throw abortError(signal.reason);
          onProgress?.({ label: attempt === 1 ? "Generating image" : `Generating image (retry ${attempt - 1}/${retries})`, labelKo: "이미지 생성 중", ...(attempt > 1 ? { retry: { attempt: attempt - 1, total: retries } } : {}) });
          try {
            const result = await callOnce();
            if (!str(result.imageId) && !str(result.imageDataUrl)) throw new RpcFailure({ code: "provider-error", message: "The image provider returned no image.", retryable: true, detailCode: "IMAGE_EMPTY_RESULT" });
            return { result, attempts: attempt };
          } catch (error) {
            if (isAbortLike(error) || signal?.aborted) throw abortError(signal?.reason);
            if (attempt > retries || !isRetryableImageError(error)) {
              const base = toRpcError(error);
              const rpc: RpcError =
                retries > 0 && attempt > retries
                  ? { code: base.code === "internal" ? "provider-error" : base.code, message: `Image generation failed after ${attempt} attempts: ${base.message}`, detailCode: "IMAGE_REQUEST_RETRY_EXHAUSTED", retryable: false, details: { cause: base } }
                  : { ...base, code: base.code === "internal" ? "provider-error" : base.code, retryable: base.retryable ?? isRetryableImageError(error) };
              log("error", `Image generation failed (${target.lumiverseProvider}/${target.model}).`, rpc);
              throw new RpcFailure(rpc, { cause: error });
            }
            log("warn", `Image generation retry ${attempt}/${retries}: ${errorMessage(error)}`);
            await wait(IMAGE_RETRY_DELAY_MS, signal);
          }
        }
      };

      const { result, attempts } =
        request.queue === false
          ? await attemptLoop()
          : await queueFor(target.generationProvider).run(gapMs, attemptLoop, signal, (position, depth) => onProgress?.({ label: "Waiting for the image queue", labelKo: "이미지 생성 대기 중", queue: { position, depth } }));

      const imageId = str(result.imageId);
      const data = mimeOfDataUrl(result.imageDataUrl);
      const out: ImageGenerateResult = {
        imageId,
        url: str(result.imageUrl) || (imageId ? `/api/v1/image-gen/results/${imageId}` : ""),
        width: built.width,
        height: built.height,
        seed: built.seed === null ? "" : String(built.seed),
        provider: target.generationProvider,
        lumiverseProvider: str(result.provider) || target.lumiverseProvider,
        model: str(result.model) || target.model,
        mimeType: data?.mimeType ?? "image/png",
        sentParameters: stripBase64ForRecord(built.parameters) as Record<string, unknown>,
        attempts,
      };
      if (request.includeData && data) out.dataBase64 = data.data;
      return out;
    },

    async deleteImages(imageIds) {
      const out: Array<{ imageId: string; status: "removed" | "unknown" | "failed" }> = [];
      for (const imageId of imageIds) {
        if (!str(imageId)) continue;
        try {
          out.push({ imageId, status: (await host.images.delete(imageId, userId)) ? "removed" : "unknown" });
        } catch (error) {
          log("warn", `Could not delete image ${imageId}.`, errorMessage(error));
          out.push({ imageId, status: "failed" });
        }
      }
      return out;
    },

    async listConnections() {
      try {
        return asArray(await host.imageGen.listConnections(userId))
          .map(toInfo)
          .map((c): ImageConnectionSummary => {
            const generationProvider = generationProviderFromLumiverse(c.provider);
            return { id: c.id, name: c.name, provider: c.provider, model: c.model, isDefault: c.isDefault, generationProvider, promptCodec: promptCodecForProvider(generationProvider) };
          });
      } catch (error) {
        throw new RpcFailure({ code: "provider-error", message: `Could not list image connections: ${errorMessage(error)}` });
      }
    },

    async listModels(connectionId) {
      const info = await connection(str(connectionId));
      try {
        const list = asArray<Record<string, unknown>>(await host.imageGen.getModels(info.id, userId));
        const models: ModelOption[] = list.map((m) => ({ id: str(m.id), label: str(m.label) || str(m.id) })).filter((m) => m.id);
        if (info.model && !models.some((m) => m.id === info.model)) models.unshift({ id: info.model, label: info.model });
        return models;
      } catch (error) {
        throw new RpcFailure({ code: "provider-error", message: `Could not list models: ${errorMessage(error)}`, retryable: true });
      }
    },

    async testConnection(connectionId) {
      const started = now();
      try {
        const config = await deps.loadConfig();
        cache.clear();
        const info = await connection(str(connectionId) || config.image.connectionId);
        await host.imageGen.getModels(info.id, userId);
        return { ok: true, latencyMs: now() - started };
      } catch (error) {
        return { ok: false, latencyMs: now() - started, error: toRpcError(error) };
      }
    },
  };
  return service;
}
