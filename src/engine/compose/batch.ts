/**
 * Per-batch request assembly (spec/pipeline.md §3.6) and the dispatcher boundary (§3.9).
 * The batch executor is used through the V5 orchestrator (see ../engine.ts); this module types it.
 *
 * 0.9.90 changes: the executor passes `forceRating` (fixed rating, `yS`) instead of `forceNsfwPrefix`, applies the
 * rating policy `XG`, and dispatches through `HG` (provider generation snapshot + record; the non-artist weight source
 * is resolved before dispatch). The V4.5 helpers `resolveGenerationProvider` / `assertNovelAIApiKey` are gone.
 */
import {
  createGenerationBatchExecutor as coreCreateExecutor,
  resolveImageProviderRef as coreResolveProviderRef,
  retryErrorRecord as coreRetryErrorRecord,
  appendRetryError as coreAppendRetryError,
} from "../core/asset-maid-core";
import type { ImageActor, ImageProviderId, ImageProviderRef, NovelAIRunConfig, PromptPlan, PromptSegments, ProviderPrompt } from "./types";

/** One item handed to `execute` (built by the V5 orchestrator `Ubt`). */
export interface BatchItem {
  sourceImageToken: string;
  providerRef: ImageProviderRef;
  actors: readonly ImageActor[];
  decision: Record<string, unknown>;
  promptPlan: PromptPlan;
  promptSegments?: PromptSegments;
  analyzerContinuity?: unknown;
  continuityState?: unknown;
  analysisMetadata?: unknown;
  queueSource: string;
  createNovelAIConfig(seed: string): NovelAIRunConfig;
  prepareProviderPrompt(context: {
    provider: ImageProviderId;
    novelAIConfig: NovelAIRunConfig;
    comfyUIProfile: unknown;
    outfitReferenceEnabled: boolean;
  }): ProviderPrompt;
  finalizePromptPlan?(plan: PromptPlan, effectivePrompt: string | undefined): PromptPlan;
}

/** `{generate(request, options), providerRef(id, scope?)}` = `createImageGenerationDispatcher` (`Oht` @158679). */
export interface ImageDispatcherLike {
  providerRef(providerId: ImageProviderId, queueScopeKey?: string): ImageProviderRef;
  generate(request: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface BatchReservation {
  release(): void;
  /** Runs items in order under the global FIFO lock; one seed per execute call. Returns GeneratedImage[]. */
  execute(input: Record<string, unknown>, items: BatchItem[], resume?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
}

export interface GenerationBatchExecutor {
  providerRef(providerId: ImageProviderId, queueScopeKey?: string): ImageProviderRef;
  reserve(session: { signal: AbortSignal; [key: string]: unknown }): BatchReservation;
}

/**
 * Batch executor: size override (`requestedSize ?? hht(requestedSizeId)`), one seed per batch (`Oxe`), resume cache,
 * ComfyUI references, `XG` (rating policy) + `bht` on the provider prompt, `HG` dispatch, prompt finalisation,
 * persistence. Original: `vht` @158121. `comfyUIReferences` = `{prepare(ref, {signal})}`.
 */
export function createGenerationBatchExecutor(
  dispatcher: ImageDispatcherLike,
  sessions: unknown,
  comfyUIReferences: { prepare(reference: unknown, options?: { signal?: AbortSignal }): Promise<unknown> } | undefined,
): GenerationBatchExecutor {
  return coreCreateExecutor(dispatcher, sessions, comfyUIReferences) as GenerationBatchExecutor;
}

/**
 * Provider ref per image (`generationProviderForImage` override or default; only "novelai" / "comfy-ui" are accepted,
 * anything else falls back to the default provider). Original: `Ebt` @161989.
 */
export function resolveImageProviderRef(
  input: { generationProviderForImage?: (context: Record<string, unknown>) => ImageProviderId | ImageProviderRef | undefined },
  executor: Pick<GenerationBatchExecutor, "providerRef">,
  context: { decision: unknown; index: number; imageCount: number; defaultProvider: ImageProviderId },
): ImageProviderRef {
  return coreResolveProviderRef(input, executor, context) as ImageProviderRef;
}

/** One entry of a job's retry error list (`dj`). */
export interface RetryErrorRecord {
  readonly attempt: number;
  readonly stage: string;
  readonly occurredAt: number;
  readonly message: string;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly requestId?: string;
}

/**
 * Retry error record of an error (walks up to 5 `cause` levels and their `context` for httpStatus/code/provider/
 * model/requestId; message falls back to "알 수 없는 오류가 발생했습니다."). Original: `dj` @156988 (0.9.89 `FC`).
 */
export function retryErrorRecord(error: unknown, attempt: number, stage: string): RetryErrorRecord {
  return coreRetryErrorRecord(error, attempt, stage) as RetryErrorRecord;
}

/** Append a retry error, skipping an exact repeat of the last one; keeps the last 20. Original: `JG` @157013 (0.9.89 `LH`). */
export function appendRetryError(list: readonly RetryErrorRecord[] | undefined, record: RetryErrorRecord): readonly RetryErrorRecord[] {
  return coreAppendRetryError(list as never, record) as readonly RetryErrorRecord[];
}
