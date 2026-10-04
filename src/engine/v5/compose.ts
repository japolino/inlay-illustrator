/**
 * NovelAI V5 post-analysis composition: prompt context (identity/outfit/artist/fixed entries), executed prompt
 * plans, NovelAI config, provider prompts, and a host-free run of the real V5 orchestrator.
 *
 * `composeV5Images` runs the verbatim `createV5Orchestrator` (`Ygt.run` 118774-119386) with
 *   - the real generation sessions (`nht`) and the real batch executor (`lht`),
 *   - an analyzer that is either the real V5 analyzer (`Egt`) over a caller-supplied LLM client, or a stub that
 *     returns a precomputed analyzer result,
 *   - a capturing image dispatcher (`ye.generate`) that records every image request and returns an empty image.
 * So everything between the analyzer response and the host image call is the original code.
 */
import {
  buildV5PromptContext as coreBuildV5PromptContext,
  buildV5IdentityEntries as coreBuildV5IdentityEntries,
  createV5NovelAIConfig as coreCreateV5NovelAIConfig,
  prepareV5ProviderPrompt as corePrepareV5ProviderPrompt,
  formatV5NovelAIPrompt as coreFormatV5NovelAIPrompt,
  buildV5PromptView as coreBuildV5PromptView,
  buildV5PromptSegments as coreBuildV5PromptSegments,
  buildV5ImageActors as coreBuildV5ImageActors,
  buildV5HistoryDecision as coreBuildV5HistoryDecision,
  buildV5ExecutedPromptPlan,
  createV5Orchestrator,
  createGenerationSessions,
  createGenerationBatchExecutor,
  applyNsfwPrefixPolicy,
  attachActorIdsToCharacterPrompts,
  n2 as BUNDLED_COMFY_PROFILE,
  _be as makeProviderRef,
} from "../core/asset-maid-core";
import { createV5Analyzer, type V5AnalyzerClient, type V5AnalyzerResult } from "./analyzer";
import { createV5RuleRuntime, toV5ContinuitySnapshot, type V5ContinuitySnapshot, type V5ContinuityState, type V5RuleRuntime } from "./runtime";
import type { V5ExternalEntry, V5ImageProviderId, V5PromptPlan, V5SceneGraph } from "./types";

/** Outfit as projected for V5 (`M5` 167212): parts with non-empty prompts only. */
export interface V5PromptOutfit {
  readonly id: string;
  readonly parts: readonly { readonly part: "head" | "top" | "bottom" | "legs" | "feet"; readonly prompt: string }[];
}

/** Appearance form in the V5 prompt context (`MAt.v5PromptContext` 167651). */
export interface V5PromptForm {
  readonly id: string;
  readonly prompt?: string;
  readonly humanlike?: boolean;
  readonly basePromptGroups?: Readonly<Record<string, readonly string[]>>;
  readonly negativePrompt?: string;
  readonly outfits?: readonly V5PromptOutfit[];
  readonly defaultOutfitId?: string;
}

/** Identity (lorebook character or persona) in the V5 prompt context. `key` = identity key (e.g. `lore:alice`, `persona::p1`). */
export interface V5PromptIdentity {
  readonly key: string;
  readonly prompt?: string;
  readonly basePromptGroups?: Readonly<Record<string, readonly string[]>>;
  readonly negativePrompt?: string;
  readonly outfits?: readonly V5PromptOutfit[];
  readonly defaultOutfitId?: string;
  readonly forms?: readonly V5PromptForm[];
  readonly defaultFormId?: string;
}

/**
 * V5 prompt context returned by the run input's `v5PromptContext(identityKeys)` (`MAt` 167636-167690).
 * Anima providers blank `fixedPositivePrompt` and `globalNegativePrompt` (host side, `Nc(provider)`).
 */
export interface V5PromptContextSource {
  readonly identities: readonly V5PromptIdentity[];
  readonly persona?: V5PromptIdentity;
  readonly artistId?: string;
  readonly artistName?: string;
  readonly artistPrompt?: string;
  readonly artistNegativePrompt?: string;
  readonly fixedPositivePrompt?: string;
  readonly globalNegativePrompt?: string;
}

/** Input of `buildV5PromptContext` (`Rgt` 117760). */
export interface V5PromptContextInput {
  readonly graph: V5SceneGraph;
  /** candidateKey → identity key (analyzer `candidateSourceKeys`). */
  readonly candidateSourceKeys: Readonly<Record<string, string>>;
  readonly context: V5PromptContextSource;
  readonly scenePresetId?: string;
  readonly selectedOutfitIds?: Readonly<Record<string, string>>;
  readonly preparedOutfits?: Readonly<Record<string, V5PromptOutfit & { readonly formId?: string }>>;
  readonly selectedOutfitIdsByOccurrence?: Readonly<Record<string, string>>;
  readonly preparedOutfitsByOccurrence?: Readonly<Record<string, V5PromptOutfit & { readonly formId?: string }>>;
}

/** Projected prompt context (`Rgt` result). */
export interface V5PromptContext {
  readonly externalEntries: readonly V5ExternalEntry[];
  readonly globalNegativePrompt: string;
  readonly artistNegativePrompt: string;
  readonly actorNegativePrompts: Readonly<Record<string, string>>;
  readonly identityKeyByActorId: Readonly<Record<string, string>>;
  readonly selectedOutfitIds: Readonly<Record<string, string>>;
  readonly selectedOutfitIdsByOccurrence: Readonly<Record<string, string>>;
  readonly selectedFormIds?: Readonly<Record<string, string>>;
  readonly outfitDescriptionsByActorId: Readonly<Record<string, string>>;
  readonly completelyNudeActorIds: readonly string[];
  readonly actorHumanlike: Readonly<Record<string, boolean>>;
  readonly artistId: string;
  readonly artistName: string;
}

/**
 * Project identities, forms, outfits, artist and fixed prompts of one graph into external ledger entries and
 * negatives. Comic dialogue/page mode removes the tag `text` from negatives.
 * Reads `context.identities[].{key,prompt,basePromptGroups,negativePrompt,outfits,defaultOutfitId,forms,defaultFormId}`,
 * `context.persona`, `artistId/artistName/artistPrompt/artistNegativePrompt`, `fixedPositivePrompt`, `globalNegativePrompt`.
 * Original: `Rgt` (buildV5PromptContext) @117760.
 */
export function buildV5PromptContext(input: V5PromptContextInput): V5PromptContext {
  return coreBuildV5PromptContext(input) as V5PromptContext;
}

/**
 * Identity entries of one actor: `basePromptGroups` per appearance group (order `V0` + `custom`), tags
 * `base.<group>`, order `9000 + groupIndex*100 + i`, with `bodyParts` for mapped groups; fallback `prompt` → `base.custom`.
 * Original: `Ngt` (buildV5IdentityEntries) @117721.
 */
export function buildV5IdentityEntries(identity: V5PromptIdentity, actorId: string): readonly V5ExternalEntry[] {
  return coreBuildV5IdentityEntries(identity, actorId) as readonly V5ExternalEntry[];
}

/** NovelAI character prompt inside the request config. */
export interface V5NovelAICharacterPrompt {
  readonly actorSlot: string;
  readonly prompt: string;
  readonly uc: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly coordinateMode?: "automatic";
}

/** NovelAI request config produced for a V5 plan (`Wgt`): the run's `novelAIConfig` plus V5 fields. */
export type V5NovelAIConfig = Record<string, unknown> & {
  readonly analysisProfile: "v5-hybrid";
  readonly seed: string;
  readonly width: number;
  readonly height: number;
  readonly negativePrompt: string;
  readonly useCoords: boolean;
  readonly characterPrompts: readonly V5NovelAICharacterPrompt[];
};

/**
 * Build the NovelAI config for one executed plan.
 * @param run `{novelAIConfig, forceAiChoiceCoordinates}` of the orchestrator input.
 * @param plan Executed prompt plan.
 * @param seed Resolved seed string.
 * @param characterCoordinates `localProjection.characterCoordinates` ("fixed" | "automatic" | "persona-automatic").
 * @param activePersonaCandidateKey `requestPayload.active_persona_candidate_key` (persona-automatic coordinates).
 * Original: `Wgt` (createV5NovelAIConfig) @118751 (uses `c7` applyAiChoiceCoordinates).
 */
export function createV5NovelAIConfig(
  run: { readonly novelAIConfig: Readonly<Record<string, unknown>>; readonly forceAiChoiceCoordinates?: boolean },
  plan: V5PromptPlan,
  seed: string,
  characterCoordinates?: string,
  activePersonaCandidateKey?: string,
): V5NovelAIConfig {
  return coreCreateV5NovelAIConfig(run, plan, seed, characterCoordinates, activePersonaCandidateKey) as V5NovelAIConfig;
}

/** Provider prompt (`novelai-structured` for NovelAI, `anima` for Chan Server / ComfyUI). */
export interface V5ProviderPrompt {
  readonly provider: V5ImageProviderId;
  readonly profileId: string;
  readonly profileRevision: number;
  readonly sourceFormat: string;
  readonly requestFormat: string;
  readonly formatterRevision: number;
  readonly globalPositivePrompt: string;
  readonly globalNegativePrompt: string;
  readonly positivePrompt: string;
  readonly negativePrompt: string;
  readonly characterPrompts: readonly Record<string, unknown>[];
  readonly diagnostics: readonly unknown[];
}

/** Input of `prepareV5ProviderPrompt` (`sbe`). */
export interface V5ProviderPromptInput {
  readonly plan: V5PromptPlan;
  readonly provider: V5ImageProviderId;
  /** NovelAI config of the request (`naiModel` is read). */
  readonly config: Readonly<Record<string, unknown>>;
  /** ComfyUI workflow profile (required for "comfy-ui"); see `V5_BUNDLED_COMFY_PROFILE`. */
  readonly comfyUIProfile?: unknown;
  readonly outfitReferenceEnabled?: boolean;
  readonly animaPositivePrefix?: string;
  readonly animaNegativePrefix?: string;
}

/**
 * Provider prompt for one plan: NovelAI → `zgt` (novelai-v5-hybrid request format); others → `g2` anima-flat.
 * Original: `sbe` (prepareV5ProviderPrompt) @118034.
 */
export function prepareV5ProviderPrompt(input: V5ProviderPromptInput): V5ProviderPrompt {
  return corePrepareV5ProviderPrompt(input) as V5ProviderPrompt;
}

/** NovelAI V5 provider prompt (`zgt` formatV5NovelAIPrompt @118007). */
export function formatV5NovelAIPrompt(input: { readonly plan: V5PromptPlan; readonly config: Readonly<Record<string, unknown>> }): V5ProviderPrompt {
  return coreFormatV5NovelAIPrompt(input) as V5ProviderPrompt;
}

/**
 * Provider prompt exactly as the batch executor sends it (`lht` 114091-114105): `prepareV5ProviderPrompt`, then the
 * NSFW prefix policy (`C7`: strips rating tags when there are 0 actors, prepends `nsfw` when forced), then actor ids
 * attached to character prompts (`cht`).
 */
export function finalizeV5ProviderPrompt(
  input: V5ProviderPromptInput & { readonly forceNsfwPrefix?: boolean; readonly actors: readonly { readonly actorId: string; readonly actorIndex: number }[] },
): V5ProviderPrompt {
  return attachActorIdsToCharacterPrompts(
    applyNsfwPrefixPolicy(prepareV5ProviderPrompt(input), input.forceNsfwPrefix === true, input.actors.length),
    input.actors,
  ) as V5ProviderPrompt;
}

/** v4-5-shaped prompt view of an executed plan (`ibe` buildV5PromptView @117943). */
export function buildV5PromptView(plan: V5PromptPlan, context: V5PromptContext): Record<string, unknown> {
  return coreBuildV5PromptView(plan, context) as Record<string, unknown>;
}

/** Artist / outfit prompt segment offsets (`Lgt` buildV5PromptSegments @118081); `undefined` when empty. */
export function buildV5PromptSegments(plan: V5PromptPlan, artistNegativePrompt = ""): Record<string, unknown> | undefined {
  return coreBuildV5PromptSegments(plan, artistNegativePrompt) as Record<string, unknown> | undefined;
}

/** Image actors of a prompt view (`Mgt` buildV5ImageActors @117921). */
export function buildV5ImageActors(promptView: Record<string, unknown>): readonly V5ImageActor[] {
  return coreBuildV5ImageActors(promptView) as readonly V5ImageActor[];
}

/** Image actor record (`Mgt`). */
export interface V5ImageActor {
  readonly actorId: string;
  readonly actorIndex: number;
  readonly kind: string;
  readonly gender: string;
  readonly identityKey: string;
  readonly identityName: string;
  readonly selectedFormId: string;
  readonly selectedOutfitId: string;
  readonly identitySuppressed: boolean;
  readonly prompt: string;
  readonly negativePrompt: string;
}

/** History decision with `v5_interaction_led` payload (`Bht` buildV5HistoryDecision @115128). */
export function buildV5HistoryDecision(input: { baseDecision?: Record<string, unknown>; history: unknown; continuitySnapshot?: unknown }): Record<string, unknown> {
  return coreBuildV5HistoryDecision(input) as Record<string, unknown>;
}

/** ComfyUI workflow profile bundled with Asset Maid (`n2` @107747); `t7(id)` only accepts this id. */
export const V5_BUNDLED_COMFY_PROFILE = BUNDLED_COMFY_PROFILE as { readonly id: string; readonly revision: number; readonly [key: string]: unknown };

/** Image request captured from the batch executor (`dmt` 110676) without `signal` / `session`. */
export type V5ImageRequest = Record<string, unknown> & { readonly provider: V5ImageProviderId };

/** Generated image record built by the batch executor (`lht` 114148-114166). */
export type V5GeneratedImage = Record<string, unknown> & {
  readonly sourceImageToken: string;
  readonly actors: readonly V5ImageActor[];
  readonly decision: Record<string, unknown>;
  readonly promptPlan: Record<string, unknown>;
  readonly novelAIConfig: V5NovelAIConfig;
  readonly providerPrompt: V5ProviderPrompt;
};

/** One composed image. */
export interface ComposedV5Image {
  /** Batch executor output (decision, actors, promptPlan view, novelAIConfig, providerPrompt, promptSegments, generationRecord, ...). */
  readonly image: V5GeneratedImage;
  /** Executed prompt plan (`Dht.build`) that produced this image. */
  readonly executedPromptPlan: V5PromptPlan;
  /** Request handed to the image dispatcher (`ye.generate`). */
  readonly request: V5ImageRequest;
}

/** Orchestrator run input fields read by `Ygt.run` (pipeline spec §3.2). Unknown extra fields pass through. */
export interface V5ComposeRunInput {
  readonly generationType?: string;
  readonly sessionContext: Readonly<Record<string, unknown>> & { readonly chatKey: string; readonly messageId?: string; readonly responseKey?: string };
  readonly analysisConfig: Readonly<Record<string, unknown>>;
  /** `config.novelai` (+ artist overrides); `v5UserDirections` selects the directing mode, `apiKey` is required for NovelAI. */
  readonly novelAIConfig: Readonly<Record<string, unknown>>;
  readonly generationProvider?: V5ImageProviderId;
  readonly generationProviderForImage?: (input: unknown) => V5ImageProviderId | { providerId: V5ImageProviderId; queueScopeKey?: string };
  readonly requestedSizeId?: number;
  readonly requestedSize?: { readonly id: number; readonly width: number; readonly height: number };
  readonly forceAiChoiceCoordinates?: boolean;
  readonly forceNsfwPrefix?: boolean;
  readonly stateAccumulationEnabled?: boolean;
  readonly comfyUI?: Readonly<Record<string, unknown>>;
  readonly revisionDirection?: string;
  readonly revisionPromptChannels?: readonly unknown[];
  readonly revisionEvidenceKey?: string;
  readonly analyzerInput: {
    readonly checkpointPolicy?: string;
    readonly context: Record<string, any>;
    readonly checkpointContext: { readonly chatKey: string; readonly messageId: string; readonly [key: string]: unknown };
    readonly imageParts?: readonly unknown[];
    readonly [key: string]: unknown;
  };
  /** Prompt context source per identity key list (`MAt.v5PromptContext`). Required. */
  readonly v5PromptContext: (identityKeys: readonly string[]) => V5PromptContextSource;
  readonly seedSetting?: (actors: readonly V5ImageActor[]) => { readonly key?: string; readonly seed: string; readonly fixed: boolean };
  readonly previousCharacterStateMap?: Readonly<Record<string, unknown>>;
  readonly previousContinuitySnapshot?: V5ContinuitySnapshot;
  readonly advanceContinuityTurn?: boolean;
  readonly skipSlotNumbers?: readonly number[];
  readonly skipSourceImageTokens?: readonly string[];
  readonly prepareCharacters?: (input: unknown) => Promise<readonly unknown[]>;
  readonly prepareOutfits?: (input: unknown) => Promise<{ selectedOutfitIds: Record<string, string>; preparedOutfits?: Record<string, unknown> }>;
  readonly references?: (actors: readonly V5ImageActor[]) => readonly unknown[];
  readonly outfitReference?: (actors: readonly V5ImageActor[]) => unknown;
  readonly characterReference?: (actors: readonly V5ImageActor[]) => unknown;
  readonly onEvent?: (event: Record<string, unknown>) => void;
  readonly [key: string]: unknown;
}

/** Input of `composeV5Images`. Give either `client` (real analyzer over a fake/real LLM client) or `analysis`. */
export interface ComposeV5ImagesInput {
  readonly run: V5ComposeRunInput;
  readonly client?: V5AnalyzerClient;
  readonly analysis?: V5AnalyzerResult;
  readonly runtime?: V5RuleRuntime;
  /** Result returned by the capturing dispatcher for each request (default: empty PNG with request size/seed). */
  readonly fakeResult?: (request: V5ImageRequest, index: number) => Record<string, unknown>;
}

/** Output of `composeV5Images`. */
export interface ComposeV5ImagesResult {
  readonly images: readonly ComposedV5Image[];
  readonly analysis: V5AnalyzerResult;
  /** Continuity state passed to `applyV5Continuity`, and its persisted snapshot form. */
  readonly continuity?: V5ContinuityState;
  readonly continuitySnapshot?: V5ContinuitySnapshot;
  /** All executed prompt plans in build order (one per planned graph). */
  readonly executedPromptPlans: readonly V5PromptPlan[];
  readonly requests: readonly V5ImageRequest[];
  /** `onEvent` progress events (session object removed). */
  readonly events: readonly Record<string, unknown>[];
}

/**
 * Run the V5 orchestrator (`Ygt.run`) without host calls and return per-image decision, actors, prompt plans,
 * NovelAI config, provider prompt and the captured image request.
 * `run.applyV5Continuity` is supplied internally (captures the continuity state); a caller value is ignored.
 * Original: `Ygt` (createV5Orchestrator) @118774 with `nht` @113736 and `lht` @113992.
 */
export async function composeV5Images(input: ComposeV5ImagesInput): Promise<ComposeV5ImagesResult> {
  const runtime = input.runtime ?? createV5RuleRuntime();
  let analysis: V5AnalyzerResult | undefined = input.analysis;
  const analyzer = input.client
    ? createV5Analyzer(input.client, runtime)
    : {
        runtime,
        captureSelectionSettings: () => undefined,
        async run(): Promise<V5AnalyzerResult> {
          if (!analysis) throw new Error("composeV5Images requires `client` or `analysis`.");
          return analysis;
        },
      };
  const sessions = createGenerationSessions();
  const requests: V5ImageRequest[] = [];
  const dispatcher = {
    providerRef: (providerId: string, queueScopeKey?: string) => makeProviderRef(providerId, queueScopeKey),
    async generate(request: Record<string, unknown>) {
      const { signal: _signal, session: _session, ...rest } = request;
      requests.push(rest as V5ImageRequest);
      return (
        input.fakeResult?.(rest as V5ImageRequest, requests.length - 1) ?? {
          provider: request.provider,
          bytes: new Uint8Array(0),
          mimeType: "image/png",
          extension: "png",
          seed: request.seed,
          width: request.width,
          height: request.height,
          requestId: `fake-${requests.length}`,
          providerMetadata: {},
          providerRef: request.providerRef,
        }
      );
    },
  };
  const executor = createGenerationBatchExecutor(dispatcher, sessions, { prepare: async () => undefined });
  const plans: V5PromptPlan[] = [];
  const orchestrator = createV5Orchestrator(analyzer, sessions, executor, {
    build: (x: unknown) => {
      const plan = buildV5ExecutedPromptPlan(x) as V5PromptPlan;
      plans.push(plan);
      return plan;
    },
  });
  const events: Record<string, unknown>[] = [];
  let continuity: V5ContinuityState | undefined;
  const userOnEvent = input.run.onEvent;
  const result = (await orchestrator.run({
    ...input.run,
    applyV5Continuity: async (state: V5ContinuityState) => {
      continuity = state;
    },
    onEvent: (event: Record<string, unknown>) => {
      const { session: _session, ...rest } = event;
      events.push(rest);
      userOnEvent?.(event);
    },
  })) as { analyzer: V5AnalyzerResult; images: V5GeneratedImage[] };
  analysis = result.analyzer;
  orchestrator.dispose();
  const images = result.images.map((image, index) => ({
    image,
    executedPromptPlan: plans[index]!,
    request: requests[index]!,
  }));
  return {
    images,
    analysis,
    ...(continuity ? { continuity, continuitySnapshot: toV5ContinuitySnapshot(continuity) } : {}),
    executedPromptPlans: plans,
    requests,
    events,
  };
}
