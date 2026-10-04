/**
 * Per-batch request assembly (spec/pipeline.md §3.6) and the dispatcher boundary (§3.9).
 * The batch executor is used through the v4-5 / v5 orchestrators (see ../engine.ts); this module types it.
 */
import {
  createGenerationBatchExecutor as coreCreateExecutor,
  resolveImageProviderRef as coreResolveProviderRef,
  resolveGenerationProvider as coreResolveProvider,
  assertNovelAIApiKey as coreAssertApiKey,
} from "../core/asset-maid-core";
import type { ImageActor, ImageProviderId, ImageProviderRef, NovelAIRunConfig, PromptPlan, PromptSegments, ProviderPrompt } from "./types";

/** One item handed to `execute` (built by Tht 114973 / Ygt). */
export interface BatchItem {
  sourceImageToken: string;
  providerRef: ImageProviderRef;
  actors: readonly ImageActor[];
  decision: Record<string, unknown>;
  promptPlan: PromptPlan;
  promptSegments?: PromptSegments;
  analyzerContinuity?: unknown;
  continuityState?: unknown;
  continuityActorStates?: unknown;
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

/** `{generate(request, options), providerRef(id, scope?)}` = `createImageGenerationDispatcher` (`Iyt`). */
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
 * Batch executor: size override (`requestedSize ?? sht(requestedSizeId)`), one seed per batch (`Pye`), resume cache,
 * ComfyUI references, `C7` + `cht` on the provider prompt, `k7` dispatch, `Age` prompt finalisation, persistence.
 * Original: `lht` @113992. `comfyUIReferences` = `{prepare(ref, {signal})}` (`smt`).
 */
export function createGenerationBatchExecutor(
  dispatcher: ImageDispatcherLike,
  sessions: unknown,
  comfyUIReferences: { prepare(reference: unknown, options?: { signal?: AbortSignal }): Promise<unknown> },
): GenerationBatchExecutor {
  return coreCreateExecutor(dispatcher, sessions, comfyUIReferences) as GenerationBatchExecutor;
}

/** `generationProvider` → "novelai" | "chan-server" | "comfy-ui" (unknown → "novelai"). Original: `Aht` @114721. */
export function resolveGenerationProvider(input: { generationProvider?: unknown }): ImageProviderId {
  return coreResolveProvider(input) as ImageProviderId;
}

/** Provider ref per image (`generationProviderForImage` override or default). Original: `Eye` @114638. */
export function resolveImageProviderRef(
  input: { generationProviderForImage?: (context: Record<string, unknown>) => ImageProviderId | ImageProviderRef | undefined },
  executor: Pick<GenerationBatchExecutor, "providerRef">,
  context: { decision: unknown; index: number; imageCount: number; defaultProvider: ImageProviderId },
): ImageProviderRef {
  return coreResolveProviderRef(input, executor, context) as ImageProviderRef;
}

/** Throws `NOVELAI_API_KEY_REQUIRED` (retryable:false) when `config.apiKey` is blank. Original: `Rye` @114714. */
export function assertNovelAIApiKey(config: { apiKey?: unknown }): void {
  coreAssertApiKey(config);
}
