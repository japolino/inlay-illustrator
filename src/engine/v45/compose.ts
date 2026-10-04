/**
 * V4.5 compose: from a validated analyzer plan to provider-ready prompts (pure parts of AM `Tht`
 * createV45Orchestrator @114878 + the per-item steps of the batch executor `lht` @113992).
 *
 * The real orchestrator runs with an injected analyzer that returns the given plan, so skip
 * filtering, requested size (`zye`), continuity (`z9e`), frame/variant resolution (`kht`),
 * prompt compilation (`pyt` / `myt`), actors (`wht`) and segments (`Nht`) are all verbatim.
 *
 * Three entry points:
 *  - `planV45Images`: capturing executor stub -> the batch items Asset Maid would execute.
 *  - `composeV45Images`: items + NovelAI config for a seed + provider prompts for novelai,
 *    comfy-ui and chan-server (anima-flat), exactly as the executor prepares them (`g2` -> `C7` -> `cht`).
 *  - `executeV45Images`: the real executor `lht` with a caller-supplied image dispatcher
 *    (`generate(request)`); returns the orchestrator result and the generated-image records.
 *
 * Every function takes an optional `core` (dependency injection) so the fixture generator can run
 * the same glue against the ORIGINAL bundle. Production callers omit it.
 */
import * as portCore from "../core/asset-maid-core";
import type { V45AnalyzerRunResult, V45Plan, V45PlanImage, V45RoutePlan } from "./analyzer";
import type { V45RuleRuntime } from "./catalog";
import type { AnalyzerContext } from "../context/types";
import type { CharacterReference, ImageActorLike, PromptInputs } from "../context/context";

type AnyFn = (...args: any[]) => any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Core functions used by compose (port by default; the generator injects the original bundle's). */
export interface V45ComposeCore {
  createV45Orchestrator: AnyFn; // Tht
  createGenerationSessions: AnyFn; // nht
  createGenerationBatchExecutor: AnyFn; // lht
  createPromptCompiler: AnyFn; // pyt
  createV45RuleRuntime: AnyFn; // DLe
  NOVELAI_DEFAULTS: unknown; // Ns
  applyNsfwPrefixPolicy: AnyFn; // C7
  attachActorIdsToCharacterPrompts: AnyFn; // cht
  resolveComfyWorkflowProfile: AnyFn; // t7
  isOutfitRestylerProfile: AnyFn; // r2
  providerRef: AnyFn; // _be
}

export const PORT_COMPOSE_CORE: V45ComposeCore = {
  createV45Orchestrator: portCore.createV45Orchestrator,
  createGenerationSessions: portCore.createGenerationSessions,
  createGenerationBatchExecutor: portCore.createGenerationBatchExecutor,
  createPromptCompiler: portCore.createPromptCompiler,
  createV45RuleRuntime: portCore.createV45RuleRuntime,
  NOVELAI_DEFAULTS: portCore.NOVELAI_DEFAULTS,
  applyNsfwPrefixPolicy: portCore.applyNsfwPrefixPolicy,
  attachActorIdsToCharacterPrompts: portCore.attachActorIdsToCharacterPrompts,
  resolveComfyWorkflowProfile: portCore.t7,
  isOutfitRestylerProfile: portCore.r2,
  providerRef: portCore._be,
};

export type ImageProviderId = "novelai" | "comfy-ui" | "chan-server";

export interface ProviderRef {
  providerId: ImageProviderId;
  queueScopeKey: string;
}

/** Image actor (AM `wht` @114609). */
export interface V45ImageActor {
  actorId: string;
  actorIndex: number;
  kind: "character" | "persona";
  gender: string;
  identityKey: string;
  identityName: string;
  selectedFormId: string;
  selectedOutfitId: string;
  identitySuppressed: boolean;
  prompt: string;
  negativePrompt: string;
}

/** Prompt plan (AM `kmt` @111219). */
export interface V45PromptPlan {
  globalPositive: string;
  negativePrompt: string;
  characters: { actorSlot: string; prompt: string; uc: string; [extra: string]: unknown }[];
  removeTags: string[];
  promptLedger?: unknown[];
  bodyAction: string;
  artistId: string;
  artistName: string;
  width: number;
  height: number;
  sizeId: number;
  selectedFraming: string;
  selectedVariantId?: string;
  matchedIdentityKeys: Record<string, string>;
  selectedOutfitIds: Record<string, string>;
  selectedFormIds?: Record<string, string>;
  actorIdentities: Record<string, unknown>;
  identitySuppressedActorSlots: string[];
  [extra: string]: unknown;
}

/** Provider prompt after `g2` + `C7` + `cht` (AM @114096-114108). */
export interface V45ProviderPrompt {
  requestFormat: "novelai" | "anima" | string;
  positivePrompt: string;
  negativePrompt: string;
  globalPositivePrompt?: string;
  globalNegativePrompt?: string;
  characterPrompts: { actorId?: string; actorIndex?: number; actorSlot?: string; prompt: string; negativePrompt: string; [extra: string]: unknown }[];
  diagnostics?: unknown[];
  [extra: string]: unknown;
}

/** Continuity result of `z9e` (passed to `applyContinuity`). */
export interface V45ContinuityResult {
  plan: V45Plan;
  characterStates: Record<string, Record<string, unknown>>;
  imageStates: Record<string, Record<string, unknown>>;
  imageActorStates: Record<string, unknown>;
  imagePromptSelections: unknown[];
  nsfwSourceImageTokens: string[];
  [extra: string]: unknown;
}

export interface V45ComfyUIOptions {
  transport?: string;
  chanServerRequestUrl?: string;
  chanServerApiKey?: string;
  endpoint?: string;
  workflowProfileId?: string;
  completionTimeoutMs?: number;
  /** `resolveSourceGenerationSettings(...).animaPositivePrompt` */
  animaPositivePrefix?: string;
  /** `resolveSourceGenerationSettings(...).animaNegativePrompt` */
  animaNegativePrefix?: string;
}

/** Orchestrator input minus the analyzer (spec/pipeline.md §3.2 `OrchestratorRunInput`). */
export interface V45ComposeInput {
  /** Analyzer result (or just a plan) the injected analyzer returns. */
  analyzerResult: V45AnalyzerRunResult | { plan: V45Plan; routePlan?: V45RoutePlan };
  /** `analyzerInput.context` (only `visualContinuity` is used after analysis; TA strips it when accumulation is off). */
  analyzerContext: AnalyzerContext;
  analyzerInputExtras?: Record<string, unknown>;
  sessionContext: {
    chatKey: string;
    responseKey?: string;
    messageIndex: number;
    messageId: string;
    displayName?: string;
    slotIds: string[];
    targetImageCount: number;
    matchedAssetCount?: number;
    totalAssetCount?: number;
  };
  generationType?: string;
  /** `resolveNovelAIRunConfig(config, {sourceId})` (needs `apiKey` when the provider is novelai). */
  novelAIConfig: Record<string, unknown>;
  generationProvider: ImageProviderId | string;
  requestedSizeId?: number;
  requestedSize?: { id: number; width: number; height: number };
  forceAiChoiceCoordinates?: boolean;
  forceNsfwPrefix?: boolean;
  stateAccumulationEnabled?: boolean;
  comfyUI?: V45ComfyUIOptions;
  /** `buildAnalyzerContextInputs(...).promptInputs` */
  promptInputs: ((decision: V45PlanImage) => PromptInputs) | PromptInputs;
  references?: (actors: ImageActorLike[]) => CharacterReference[];
  outfitReference?: (actors: ImageActorLike[]) => CharacterReference | null;
  characterReference?: (actors: ImageActorLike[]) => CharacterReference | null;
  seedSetting?: (actors: ImageActorLike[]) => { seed: string; fixed: boolean; key?: string };
  previousCharacterStateMap?: Record<string, Record<string, unknown>>;
  previousGlobalModifierRefs?: Record<string, string[]>;
  advanceContinuityTurn?: boolean;
  skipSlotNumbers?: number[];
  skipSourceImageTokens?: string[];
  automaticRetryManaged?: boolean;
  imageRetryCount?: number;
  analysisConfig?: Record<string, unknown>;
  novelAIImageToImage?: () => Promise<unknown>;
  novelAIImageToImageStrength?: number;
  novelAIImageToImageNoise?: number;
  onEvent?: (event: { phase: string; [extra: string]: unknown }) => void;
}

/** One executor item (AM Tht @114967-114990). */
export interface V45ComposeItem {
  sourceImageToken: string;
  providerRef: ProviderRef;
  actors: V45ImageActor[];
  decision: V45PlanImage;
  promptPlan: V45PromptPlan;
  promptSegments?: { artistPositive?: { start: number; end: number }; artistNegative?: { start: number; end: number }; outfits: Record<string, unknown> };
  analyzerContinuity: unknown;
  continuityState: unknown;
  continuityActorStates: unknown;
  queueSource: "novelai-v4-5";
  createNovelAIConfig(seed: string | number): Record<string, unknown>;
  prepareProviderPrompt(args: { provider: ImageProviderId; novelAIConfig: Record<string, unknown>; comfyUIProfile?: unknown; outfitReferenceEnabled?: boolean }): V45ProviderPrompt;
}

export interface V45PlanResult {
  items: V45ComposeItem[];
  continuity: V45ContinuityResult | null;
  /** What the orchestrator passed to the analyzer (maxAttempts, TA-stripped context, diagnostic ...). */
  analyzerInput: Record<string, unknown>;
  session: Record<string, unknown>;
  events: { phase: string; [extra: string]: unknown }[];
}

export interface V45ComposeRuntime {
  ruleRuntime: V45RuleRuntime;
  promptCompiler: unknown;
  sessions: unknown;
  core: V45ComposeCore;
}

/** Rule runtime + prompt compiler `pyt(ruleRuntime, NOVELAI_DEFAULTS)` + sessions `nht()`. */
export function createV45ComposeRuntime(core: V45ComposeCore = PORT_COMPOSE_CORE): V45ComposeRuntime {
  const ruleRuntime = core.createV45RuleRuntime() as V45RuleRuntime;
  return {
    ruleRuntime,
    promptCompiler: core.createPromptCompiler(ruleRuntime, core.NOVELAI_DEFAULTS),
    sessions: core.createGenerationSessions(),
    core,
  };
}

function fakeAnalyzer(input: V45ComposeInput, seen: { input?: Record<string, unknown> }) {
  return {
    async run(analyzerInput: Record<string, unknown>) {
      seen.input = analyzerInput;
      const r = structuredClone(input.analyzerResult) as Record<string, unknown>;
      return {
        routePlan: { images: [], outfit_proposals: [], diagnostics: [] },
        resumedFromCheckpoint: false,
        attempts: { preset: 0, modifiers: 0, unified: 1, repair: 0 },
        executionMode: "single-stage",
        ...r,
      };
    },
  };
}

function orchestratorInput(input: V45ComposeInput, events: V45PlanResult["events"], continuity: { value: V45ContinuityResult | null }): Record<string, unknown> {
  return {
    automaticRetryManaged: input.automaticRetryManaged ?? true,
    imageRetryCount: input.imageRetryCount ?? 5,
    generationType: input.generationType ?? "chat-auto",
    sessionContext: input.sessionContext,
    analysisConfig: input.analysisConfig ?? {},
    novelAIConfig: input.novelAIConfig,
    generationProvider: input.generationProvider,
    requestedSizeId: input.requestedSizeId,
    requestedSize: input.requestedSize,
    forceAiChoiceCoordinates: input.forceAiChoiceCoordinates ?? true,
    forceNsfwPrefix: input.forceNsfwPrefix ?? false,
    stateAccumulationEnabled: input.stateAccumulationEnabled ?? false,
    comfyUI: input.comfyUI ?? {},
    novelAIImageToImage: input.novelAIImageToImage,
    novelAIImageToImageStrength: input.novelAIImageToImageStrength,
    novelAIImageToImageNoise: input.novelAIImageToImageNoise,
    analyzerInput: {
      executionMode: "single-stage",
      checkpointPolicy: "resume",
      ...input.analyzerInputExtras,
      context: input.analyzerContext,
      checkpointContext: {
        chatKey: input.sessionContext.chatKey,
        messageIndex: input.sessionContext.messageIndex,
        messageId: input.sessionContext.messageId,
        generationProvider: input.generationProvider,
      },
    },
    promptInputs: input.promptInputs,
    references: input.references,
    outfitReference: input.outfitReference,
    characterReference: input.characterReference,
    seedSetting: input.seedSetting ?? (() => ({ key: "", seed: "", fixed: false })),
    previousCharacterStateMap: input.previousCharacterStateMap ?? {},
    previousGlobalModifierRefs: input.previousGlobalModifierRefs ?? {},
    advanceContinuityTurn: input.advanceContinuityTurn ?? true,
    applyContinuity: async (c: V45ContinuityResult) => {
      continuity.value = c;
    },
    skipSlotNumbers: input.skipSlotNumbers ?? [],
    skipSourceImageTokens: input.skipSourceImageTokens,
    cancelPrevious: true,
    onEvent: (e: { phase: string }) => {
      events.push(e);
      input.onEvent?.(e);
    },
  };
}

/**
 * Run the real V4.5 orchestrator (AM `Tht`) on a given plan with a capturing executor stub.
 * @returns the executor items (with their `createNovelAIConfig` / `prepareProviderPrompt` closures),
 *   the continuity result (`z9e`), the analyzer input the orchestrator built, and the onEvent phases.
 */
export async function planV45Images(input: V45ComposeInput, runtime: V45ComposeRuntime = createV45ComposeRuntime()): Promise<V45PlanResult> {
  const core = runtime.core;
  const events: V45PlanResult["events"] = [];
  const continuity: { value: V45ContinuityResult | null } = { value: null };
  const seen: { input?: Record<string, unknown> } = {};
  let items: V45ComposeItem[] = [];
  const executor = {
    providerRef: (id: string, scope?: string) => core.providerRef(id, scope),
    reserve: () => ({
      release() {},
      async execute(_input: unknown, batch: V45ComposeItem[]) {
        items = batch;
        return [];
      },
    }),
  };
  const orchestrator = core.createV45Orchestrator(fakeAnalyzer(input, seen), runtime.promptCompiler, runtime.sessions, executor);
  const result = await orchestrator.run(orchestratorInput(input, events, continuity));
  return { items, continuity: continuity.value, analyzerInput: seen.input ?? {}, session: result.session, events };
}

export interface V45ComposedImage {
  sourceImageToken: string;
  providerRef: ProviderRef;
  decision: V45PlanImage;
  actors: V45ImageActor[];
  promptPlan: V45PromptPlan;
  promptSegments?: V45ComposeItem["promptSegments"];
  continuityState: unknown;
  continuityActorStates: unknown;
  /** `createNovelAIConfig(seed)` (AM `Mht` @114829 + `c7` coordinates). */
  novelAIConfig: Record<string, unknown>;
  /** Provider prompts as the executor would send them (NSFW prefix policy + actor ids applied). */
  providerPrompts: Partial<Record<ImageProviderId, V45ProviderPrompt>>;
}

export interface V45ComposeOptions {
  /** Seed for `createNovelAIConfig` (Asset Maid draws one random u32 per batch). */
  seed: string | number;
  /** Providers to format; default all three. comfy-ui uses `resolveComfyWorkflowProfile(comfyUI.workflowProfileId)`. */
  providers?: ImageProviderId[];
}

/**
 * Plan + per-image NovelAI config and provider prompts (spec/pipeline.md §3.5c-e). Mirrors the executor
 * per item (AM @114064-114108) without the size override: pass `requestedSize` handling to the caller.
 */
export async function composeV45Images(
  input: V45ComposeInput,
  options: V45ComposeOptions,
  runtime: V45ComposeRuntime = createV45ComposeRuntime(),
): Promise<{ plan: V45PlanResult; images: V45ComposedImage[] }> {
  const core = runtime.core;
  const plan = await planV45Images(input, runtime);
  const providers = options.providers ?? ["novelai", "comfy-ui", "chan-server"];
  const size = input.requestedSize;
  const images = plan.items.map((item): V45ComposedImage => {
    const baseConfig = item.createNovelAIConfig(String(options.seed));
    const novelAIConfig = size ? { ...baseConfig, width: size.width, height: size.height } : baseConfig;
    const providerPrompts: V45ComposedImage["providerPrompts"] = {};
    for (const provider of providers) {
      const profile = provider === "comfy-ui" ? core.resolveComfyWorkflowProfile(input.comfyUI?.workflowProfileId) : null;
      const outfitReference = provider === "comfy-ui" ? (input.outfitReference?.(item.actors as unknown as ImageActorLike[]) ?? null) : null;
      providerPrompts[provider] = core.attachActorIdsToCharacterPrompts(
        core.applyNsfwPrefixPolicy(
          item.prepareProviderPrompt({
            provider,
            novelAIConfig,
            comfyUIProfile: profile,
            outfitReferenceEnabled: !!(outfitReference && core.isOutfitRestylerProfile(profile)),
          }),
          input.forceNsfwPrefix === true,
          item.actors.length,
        ),
        item.actors,
      ) as V45ProviderPrompt;
    }
    return {
      sourceImageToken: item.sourceImageToken,
      providerRef: item.providerRef,
      decision: item.decision,
      actors: item.actors,
      promptPlan: size ? { ...item.promptPlan, sizeId: size.id, width: size.width, height: size.height } : item.promptPlan,
      ...(item.promptSegments ? { promptSegments: item.promptSegments } : {}),
      continuityState: item.continuityState,
      continuityActorStates: item.continuityActorStates,
      novelAIConfig,
      providerPrompts,
    };
  });
  return { plan, images };
}

/** Image request handed to the dispatcher (AM `dmt` @110676 union). */
export type V45ImageRequest = Record<string, unknown> & {
  provider: ImageProviderId;
  providerRef: ProviderRef;
  prompt: string;
  negativePrompt: string;
  seed: string;
  width: number;
  height: number;
};

/** Dispatcher result (spec/pipeline.md §3.9.6). */
export interface V45ImageGenerationResult {
  provider: ImageProviderId;
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
  seed: string | number;
  width: number;
  height: number;
  actualSize?: { width: number; height: number };
  effectivePrompt?: string;
  finalizedPrompt?: unknown;
  requestId?: string;
  providerMetadata?: unknown;
  providerRef: ProviderRef;
}

/** Image dispatcher contract used by the executor (`ye` in AM; `providerRef` defaults to `_be`). */
export interface V45ImageDispatcher {
  generate(request: V45ImageRequest, options: Record<string, unknown>): Promise<V45ImageGenerationResult>;
  providerRef?(providerId: string, queueScopeKey?: string): ProviderRef;
}

/**
 * Run orchestrator + REAL batch executor (AM `lht`) with the given dispatcher (one global FIFO lock,
 * batch seed via `crypto.getRandomValues`, resume cache, NSFW prefix, non-artist weight, generation records).
 * @param referencePreparer ComfyUI reference preparer (`prepare(ref, {signal})`); default identity.
 * @returns orchestrator result `{session, analyzer, continuity, images}` + events.
 */
export async function executeV45Images(
  input: V45ComposeInput & { persistGeneratedImage?: (image: unknown, index: number, count: number, session: unknown) => Promise<void> },
  dispatcher: V45ImageDispatcher,
  referencePreparer: { prepare(ref: unknown, options: { signal?: AbortSignal }): Promise<unknown> } = { prepare: async (ref) => ref },
  runtime: V45ComposeRuntime = createV45ComposeRuntime(),
): Promise<{ result: Record<string, unknown> & { images: unknown[] }; continuity: V45ContinuityResult | null; events: V45PlanResult["events"] }> {
  const core = runtime.core;
  const events: V45PlanResult["events"] = [];
  const continuity: { value: V45ContinuityResult | null } = { value: null };
  const seen: { input?: Record<string, unknown> } = {};
  const ye = {
    providerRef: (id: string, scope?: string) => (dispatcher.providerRef ? dispatcher.providerRef(id, scope) : core.providerRef(id, scope)),
    generate: (request: V45ImageRequest, options: Record<string, unknown>) => dispatcher.generate(request, options),
  };
  const executor = core.createGenerationBatchExecutor(ye, runtime.sessions, referencePreparer);
  const orchestrator = core.createV45Orchestrator(fakeAnalyzer(input, seen), runtime.promptCompiler, runtime.sessions, executor);
  const runInput = orchestratorInput(input, events, continuity);
  if (input.persistGeneratedImage) runInput.persistGeneratedImage = input.persistGeneratedImage;
  const result = await orchestrator.run(runInput);
  return { result, continuity: continuity.value, events };
}
