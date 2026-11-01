/**
 * Engine image provider adapters (dispatcher contract of `createAssetMaidEngine`, AM `Iyt` 120220) over
 * `ImageService.generate` (Lumiverse image-gen connections, spec/novelai.md §9).
 *
 * The engine dispatcher retries (runtime.generationAutoRetryCount) and calls each attempt with `maxAttempts: 1`, so the
 * adapters call `ImageService.generate` with `retries: 0`; NovelAI requests use the ImageService queue (`queue: true`,
 * one at a time with the configured interval, like AM's `xAt` queue).
 *
 * Per-run context (connection, owner ids, fixed rating getter, progress sink) travels through `providerRef.queueScopeKey`:
 * the orchestrator input sets `generationProviderForImage` (AM `Eye` 114638) to `{providerId, queueScopeKey:
 * "inlay-run:<runId>"}` and the adapter looks the run up in the {@link ProviderRunRegistry}.
 *
 * NovelAI: what AM's client did when it built the HTTP body (0.9.90 rating wrapper `Mht` @158839 over the HTTP client;
 * 0.9.89.5 `kyt` 120226 -> `Cyt` 120380 -> `jut` 108897 -> `Cut` 108742): fixed rating tag (`request.forceRating ??
 * fixedRating getter`, `OG`; rating tags stripped from the character prompts), v4 captions from `config.characterPrompts`
 * (`pge`/`hge`/`gge` 108829-108878, coordinates + per-character negatives), the non-artist weight (`Cut`), seed (`Ii`/`c2`),
 * director references (V4.5 models only, `Out` 108882) and img2img.
 */
import type { AssetRef, ProgressInfo } from "../../shared/contract/index.js";
import { applyNonArtistWeightToRequest, type NovelAIRequestBody } from "../../engine/compose/weights.js";
import { prependRatingTag, stripPromptTags } from "../../engine/compose/rating.js";
import type { RatingTag } from "../../engine/compose/types.js";
import { toNovelAICharacterCaptions } from "../../engine/compose/coordinates.js";
import { normalizeSeed, randomSeed } from "../../engine/compose/size-count-seed.js";
import type { ImageProviderAdapter, ImageProviderId } from "../../engine/engine.js";
import { isAbortLike, RpcFailure } from "../rpc/errors.js";
import type { BackendServices, ImageBytes, ImageGenerateRequest, ImageGenerateResult, NovelAIImageOptions } from "../services/types.js";

/* ------------------------------------------------------------------------------------------------
 * Run registry
 * ---------------------------------------------------------------------------------------------- */

export interface ProviderRunContext {
  purpose: ImageGenerateRequest["purpose"];
  connectionId?: string;
  model?: string;
  ownerChatId?: string;
  ownerCharacterId?: string;
  comfyuiWorkflowId?: string;
  /**
   * AM 0.9.90 `Mht` `forceRating` getter: fixed rating of the source (`yS(settings)`: `fixedRating` when
   * `nsfwAlwaysEnabled`, else `false`). Used when the request carries no `forceRating`.
   */
  forceRating: () => RatingTag | false;
  /** Provider progress (queue / stages) for the job snapshot. */
  onProgress?: (progress: ProgressInfo) => void;
}

const SCOPE_PREFIX = "inlay-run:";

export class ProviderRunRegistry {
  private readonly runs = new Map<string, ProviderRunContext>();
  private counter = 0;

  /** Register a run; returns its id (use {@link queueScopeKey} for the orchestrator input). */
  register(context: ProviderRunContext): string {
    this.counter += 1;
    const runId = `${Date.now().toString(36)}-${this.counter.toString(36)}`;
    this.runs.set(runId, context);
    return runId;
  }
  release(runId: string): void {
    this.runs.delete(runId);
  }
  queueScopeKey(runId: string): string {
    return `${SCOPE_PREFIX}${runId}`;
  }
  /** Context of a request (by `providerRef.queueScopeKey`). */
  resolve(request: { providerRef?: { queueScopeKey?: unknown } }): ProviderRunContext | null {
    const key = typeof request.providerRef?.queueScopeKey === "string" ? request.providerRef.queueScopeKey : "";
    return key.startsWith(SCOPE_PREFIX) ? (this.runs.get(key.slice(SCOPE_PREFIX.length)) ?? null) : null;
  }
  get size(): number {
    return this.runs.size;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------------------------- */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
/** AM `mge`: clamp(round(v), 64, 2048) with a fallback. */
const dim = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(2048, Math.max(64, Math.round(n))) : fallback;
};

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
export function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Image input in any of the shapes the engine passes (base64 string, data URL, `{data|bytes, mimeType}`, bytes). */
export function toImageBytes(value: unknown, fallbackMime = "image/png"): ImageBytes | null {
  if (!value) return null;
  if (typeof value === "string") {
    const m = /^data:([^;,]+);base64,(.*)$/su.exec(value);
    return m ? { data: m[2]!, mimeType: m[1]! } : value.trim() ? { data: value.trim(), mimeType: fallbackMime } : null;
  }
  if (value instanceof Uint8Array) return value.length ? { data: bytesToBase64(value), mimeType: fallbackMime } : null;
  const r = rec(value);
  if (typeof r.data === "string" && r.data) return { data: r.data, mimeType: str(r.mimeType) || str(r.mime_type) || fallbackMime };
  if (r.bytes instanceof Uint8Array && r.bytes.length) return { data: bytesToBase64(r.bytes), mimeType: str(r.mimeType) || fallbackMime };
  if (r.image !== undefined) return toImageBytes(r.image, fallbackMime);
  return null;
}

/**
 * ImageService failures -> errors the engine dispatcher can classify (AM `byt` 120076 reads top-level `retryable`,
 * `status`/`httpStatus` and `code`). Aborts pass through unchanged.
 */
export function toProviderError(error: unknown): unknown {
  if (isAbortLike(error) || !(error instanceof RpcFailure)) return error;
  const e = error.error;
  const details = rec(e.details);
  const status = Number(details.status ?? details.httpStatus);
  return Object.assign(new Error(e.message, { cause: error }), {
    code: e.detailCode || (e.code === "timeout" ? "REQUEST_TIMEOUT" : e.code === "cancelled" ? "REQUEST_ABORTED" : e.code),
    ...(e.retryable !== undefined ? { retryable: e.retryable } : e.code === "timeout" ? { retryable: true } : {}),
    ...(Number.isFinite(status) && status > 0 ? { status } : {}),
    rpcError: e,
  });
}

async function generateImage(services: BackendServices, request: ImageGenerateRequest, options: Parameters<BackendServices["images"]["generate"]>[1]) {
  try {
    return await services.images.generate(request, options);
  } catch (error) {
    throw toProviderError(error);
  }
}

function extensionFor(mime: string): string {
  return mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
}

/** Engine provider event from an ImageService progress callback (queue -> `queue`, else a stage event). */
function emitProgress(provider: ImageProviderId, onEvent: ((e: Rec) => void) | undefined, ctx: ProviderRunContext | null, progress: ProgressInfo) {
  ctx?.onProgress?.(progress);
  if (!onEvent) return;
  if (progress.queue) onEvent({ type: "queue", provider, requestId: "", queuePosition: progress.queue.position, queueDepth: progress.queue.depth });
  else if (progress.total) onEvent({ type: "progress", provider, requestId: "", stage: "generating", value: progress.done ?? 0, max: progress.total, ratio: progress.fraction ?? 0 });
}

function engineResult(provider: ImageProviderId, result: ImageGenerateResult, extra: Rec = {}): Rec & { provider: ImageProviderId } {
  const mimeType = result.mimeType || "image/png";
  return {
    provider,
    bytes: result.dataBase64 ? base64ToBytes(result.dataBase64) : new Uint8Array(0),
    mimeType,
    extension: extensionFor(mimeType),
    seed: String(result.seed ?? ""),
    width: result.width,
    height: result.height,
    requestedSize: { width: result.width, height: result.height },
    actualSize: { width: result.width, height: result.height },
    requestId: result.imageId,
    ...extra,
    providerMetadata: {
      imageId: result.imageId,
      url: result.url,
      lumiverseProvider: result.lumiverseProvider,
      generationProvider: result.provider,
      model: result.model,
      attempts: result.attempts,
      sentParameters: result.sentParameters,
      ...(result.sampling ? { novelaiSampling: result.sampling } : {}),
      ...rec(extra.providerMetadata),
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * NovelAI request (AM jut/gge/Cut)
 * ---------------------------------------------------------------------------------------------- */

export interface NovelAIBuild {
  request: ImageGenerateRequest;
  body: NovelAIRequestBody;
  /** Positive prompt actually sent (after rating + weight). */
  effectivePrompt: string;
  finalizedPrompt: Rec;
}

/** AM `pge` 108829. */
function normalizeCharacterPrompts(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((raw) => {
      const r = rec(raw);
      return {
        prompt: str(r.prompt),
        uc: str(r.uc),
        centerX: num(r.centerX, 0.5, 0, 1),
        centerY: num(r.centerY, 0.5, 0, 1),
        actorSlot: str(r.actorSlot) || undefined,
        coordinateMode: r.coordinateMode === "automatic" ? ("automatic" as const) : ("fixed" as const),
      };
    })
    .filter((c) => c.prompt || c.uc);
}

/**
 * Build the NovelAI request from an engine `ImageRequest` (provider "novelai"). Pure except for the random seed.
 * `references` / `imageToImage` are resolved by the caller (bytes).
 */
export function buildNovelAIRequest(
  request: Rec,
  ctx: Pick<ProviderRunContext, "purpose" | "connectionId" | "model" | "ownerChatId" | "ownerCharacterId" | "forceRating">,
  extras: { characterReferences?: NovelAIImageOptions["characterReferences"]; imageToImage?: NovelAIImageOptions["imageToImage"] } = {},
): NovelAIBuild {
  const rawPrompt = typeof request.prompt === "string" ? request.prompt : "";
  // AM 0.9.90 `Mht` @158848: `o.forceRating ?? r.forceRating?.() ?? false`; the rating replaces any rating tag of the
  // prompt and is stripped from every character prompt.
  const rating = (request.forceRating as RatingTag | false | undefined) ?? ctx.forceRating() ?? false;
  const prompt = rating && rawPrompt.trim() ? prependRatingTag(rawPrompt, rating) : rawPrompt;
  const baseConfig = rec(request.config);
  const config: Rec = {
    ...baseConfig,
    ...(rating && Array.isArray(baseConfig.characterPrompts)
      ? { characterPrompts: baseConfig.characterPrompts.map((c) => ({ ...rec(c), prompt: stripPromptTags(str(rec(c).prompt)) })) }
      : {}),
    width: request.width,
    height: request.height,
    negativePrompt: request.negativePrompt,
    seed: request.seed,
  };
  const input = str(prompt);
  if (!input) throw Object.assign(new Error("NovelAI prompt is empty."), { code: "NOVELAI_PROMPT_EMPTY", retryable: false });
  const model = str(ctx.model) || str(config.naiModel) || "nai-diffusion-5-full";
  const v4 = /^nai-diffusion-(?:4|5)(?:-|$)/u.test(model);
  const v5Profile = config.analysisProfile === "v5-hybrid";
  // AM 138036: V5 analysis prompts need structured character captions (V4 or later models).
  if (v5Profile && !v4)
    throw Object.assign(new Error(`The NovelAI V5 analysis profile needs a V4 or later model (character captions); ${model} has none.`), { code: "NOVELAI_V5_PROFILE_MODEL", retryable: false });
  const forced = config.forceCharacterCoordinates === true;
  const characters = normalizeCharacterPrompts(config.characterPrompts);
  const anyFixed = characters.some((c) => c.coordinateMode !== "automatic");
  // AM gge 108876
  const useCoords = forced ? characters.length > 0 && anyFixed : v5Profile ? !!config.useCoords && characters.length > 0 && anyFixed : !!config.useCoords && characters.length > 1 && anyFixed;
  const negative = str(config.negativePrompt);
  const parameters: NovelAIRequestBody["parameters"] = { negative_prompt: negative };
  if (v4) {
    parameters.v4_prompt = { caption: { base_caption: input, char_captions: toNovelAICharacterCaptions(characters, "prompt", v5Profile || forced) }, use_coords: useCoords, use_order: config.useOrder !== false };
    parameters.v4_negative_prompt = { caption: { base_caption: negative, char_captions: toNovelAICharacterCaptions(characters, "uc", v5Profile || forced) }, legacy_uc: false };
  }
  const weighted = applyNonArtistWeightToRequest({ input, model, action: "generate", parameters }, config);
  const body = weighted.body;
  const seedText = normalizeSeed(config.seed);
  const seed = seedText ? Number(seedText) : randomSeed();
  const pos = body.parameters.v4_prompt?.caption.char_captions ?? [];
  const neg = body.parameters.v4_negative_prompt?.caption.char_captions ?? [];
  const novelai: NovelAIImageOptions = {
    sampler: str(config.sampler) || "k_euler_ancestral",
    noiseSchedule: str(config.noiseSchedule) || "karras",
    steps: Math.round(num(config.steps, 28, 1, 50)),
    scale: Number(config.scale) || 6,
    cfgRescale: Number.isFinite(Number(config.cfgRescale)) ? Number(config.cfgRescale) : 0.5,
    qualityToggle: config.qualityToggle !== false,
    // AM 0.9.90: V5 Full High / Medium (the run config carries `config.novelai.effort`; regenerate sets the recorded one).
    ...(config.effort === "medium" || config.effort === "high" ? { effort: config.effort } : {}),
    useCoords,
    useOrder: config.useOrder !== false,
    characters: v4
      ? pos.map((c, i) => ({
          prompt: c.char_caption,
          negativePrompt: neg[i]?.char_caption ?? "",
          ...(useCoords && c.centers[0] ? { center: { x: c.centers[0].x, y: c.centers[0].y } } : {}),
        }))
      : [],
  };
  // AM jut 108952: director references only on V4.5 models with characterReferenceEnabled !== false
  if (extras.characterReferences?.length && config.characterReferenceEnabled !== false && /^nai-diffusion-4-5/u.test(model)) novelai.characterReferences = extras.characterReferences;
  if (extras.imageToImage) novelai.imageToImage = extras.imageToImage;
  const generateRequest: ImageGenerateRequest = {
    purpose: ctx.purpose,
    prompt: body.input,
    negativePrompt: body.parameters.negative_prompt,
    width: dim(config.width, 832),
    height: dim(config.height, 1216),
    seed,
    novelai,
    ...(ctx.connectionId ? { connectionId: ctx.connectionId } : {}),
    model,
    ...(ctx.ownerChatId ? { ownerChatId: ctx.ownerChatId } : {}),
    ...(ctx.ownerCharacterId ? { ownerCharacterId: ctx.ownerCharacterId } : {}),
    retries: 0,
    queue: true,
  };
  return { request: generateRequest, body, effectivePrompt: body.input, finalizedPrompt: weighted.finalizedPrompt as unknown as Rec };
}

/* ------------------------------------------------------------------------------------------------
 * Adapters
 * ---------------------------------------------------------------------------------------------- */

const DEFAULT_CONTEXT: ProviderRunContext = { purpose: "chat", forceRating: () => false };

/** Engine reference `{asset, cropReference}` -> asset ref carrying the crop. */
function withCrop(reference: Record<string, unknown>): Record<string, unknown> {
  const asset = rec(reference.asset);
  return reference.cropReference === undefined ? asset : { ...asset, cropReference: reference.cropReference };
}

/** AM `SAt` 167314 / `Yut` 109240: reference bytes (failures collected, never fatal). */
async function prepareReferences(services: BackendServices, refs: unknown[], signal?: AbortSignal) {
  const references: NonNullable<NovelAIImageOptions["characterReferences"]> = [];
  const failures: Array<{ asset: string; error: string }> = [];
  for (const raw of refs) {
    const r = rec(raw);
    // The engine keeps the crop next to the asset (AM `Cq` 167886); the bytes service reads it from the asset ref.
    const asset = withCrop(r);
    try {
      const prepared = toImageBytes(r.image) ?? (await services.imageBytes.getAsset(asset as unknown as AssetRef, { signal }));
      const type = str(r.type);
      references.push({
        ...prepared,
        strength: num(r.strength, 0.6, 0, 1),
        fidelity: num(r.fidelity, 1, 0, 1),
        type: (type === "style" || type === "character&style" ? type : "character") as "character",
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push({ asset: str(asset.key) || str(asset.name), error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { references, failures };
}

export function createNovelAIAdapter(services: BackendServices, registry: ProviderRunRegistry): ImageProviderAdapter {
  return {
    provider: "novelai",
    serializesRequests: true,
    async generate(request, options = {}) {
      const ctx = registry.resolve(request as Rec) ?? DEFAULT_CONTEXT;
      const onEvent = options.onEvent;
      const signal = (request.signal as AbortSignal | undefined) ?? options.signal;
      onEvent?.({ type: "stage", provider: "novelai", requestId: "", stage: "queued" });
      const refs = Array.isArray(request.references) ? request.references : [];
      // AM `Hmt.prepare` 138491: references are only read when they will be sent (enabled, NovelAI 4.5).
      const refModel = str(ctx.model) || str(rec(request.config).naiModel);
      const sendsRefs = rec(request.config).characterReferenceEnabled !== false && /^nai-diffusion-4-5/u.test(refModel);
      const prepared = refs.length && sendsRefs ? await prepareReferences(services, refs, signal) : { references: [], failures: [] };
      const i2iRaw = rec(request.imageToImage);
      const i2iImage = request.imageToImage ? toImageBytes(i2iRaw.image) : null;
      // AM 138091
      if (request.imageToImage && !i2iImage) throw Object.assign(new Error("NovelAI img2img source image is empty."), { code: "NOVELAI_IMG2IMG_EMPTY", retryable: false });
      const build = buildNovelAIRequest(request, ctx, {
        characterReferences: prepared.references,
        ...(i2iImage ? { imageToImage: { ...i2iImage, strength: num(i2iRaw.strength, 0.4, 0.4, 1), noise: num(i2iRaw.noise, 0, 0, 1) } } : {}),
      });
      onEvent?.({ type: "stage", provider: "novelai", requestId: "", stage: "generating" });
      const result = await generateImage(services, build.request, { signal, onProgress: (p) => emitProgress("novelai", onEvent, ctx, p) });
      onEvent?.({ type: "stage", provider: "novelai", requestId: "", stage: "completed" });
      return engineResult("novelai", result, {
        effectivePrompt: build.effectivePrompt,
        finalizedPrompt: build.finalizedPrompt,
        providerMetadata: {
          nonArtistPromptWeight: rec(build.finalizedPrompt).weight,
          referenceFailures: prepared.failures,
          requestBody: build.body,
        },
      });
    },
  };
}

export function createComfyAdapter(services: BackendServices, registry: ProviderRunRegistry): ImageProviderAdapter {
  return {
    provider: "comfy-ui",
    async generate(request, options = {}) {
      const ctx = registry.resolve(request as Rec) ?? DEFAULT_CONTEXT;
      const signal = (request.signal as AbortSignal | undefined) ?? options.signal;
      options.onEvent?.({ type: "stage", provider: "comfy-ui", requestId: "", stage: "connecting" });
      // AM lht 114092: outfit / character reference bytes prepared by comfyUIReferences.prepare
      const source = toImageBytes(request.outfitReference) ?? toImageBytes(request.characterReference);
      const seedText = normalizeSeed(request.seed);
      const result = await generateImage(
        services,
        {
          purpose: ctx.purpose,
          prompt: str(request.prompt),
          negativePrompt: str(request.negativePrompt),
          width: Math.max(1, Math.round(Number(request.width) || 832)),
          height: Math.max(1, Math.round(Number(request.height) || 1216)),
          seed: seedText ? Number(seedText) : randomSeed(),
          comfy: { ...(ctx.comfyuiWorkflowId ? { workflowId: ctx.comfyuiWorkflowId } : {}), ...(source ? { sourceImage: source } : {}) },
          ...(ctx.connectionId ? { connectionId: ctx.connectionId } : {}),
          ...(ctx.model ? { model: ctx.model } : {}),
          ...(ctx.ownerChatId ? { ownerChatId: ctx.ownerChatId } : {}),
          ...(ctx.ownerCharacterId ? { ownerCharacterId: ctx.ownerCharacterId } : {}),
          retries: 0,
        },
        { signal, onProgress: (p) => emitProgress("comfy-ui", options.onEvent, ctx, p) },
      );
      options.onEvent?.({ type: "stage", provider: "comfy-ui", requestId: "", stage: "completed" });
      return engineResult("comfy-ui", result);
    },
  };
}

export function createImageProviderAdapters(services: BackendServices, registry: ProviderRunRegistry): Partial<Record<ImageProviderId, ImageProviderAdapter>> {
  return {
    novelai: createNovelAIAdapter(services, registry),
    "comfy-ui": createComfyAdapter(services, registry),
  };
}

/** ComfyUI reference preparation (AM `smt` 110583): bytes of the reference asset. */
export function createComfyReferencePreparer(services: BackendServices) {
  return {
    async prepare(reference: Record<string, unknown>, options: { signal?: AbortSignal } = {}) {
      const asset = withCrop(reference);
      const bytes = await services.imageBytes.getAsset(asset as unknown as AssetRef, { signal: options.signal });
      return { bytes: base64ToBytes(bytes.data), mimeType: bytes.mimeType, extension: extensionFor(bytes.mimeType) };
    },
  };
}
