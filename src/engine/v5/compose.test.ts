// Parity fixtures: src/engine/__fixtures__/v5/compose.*.json (+ inputs.json)
// Generator: cd C:/Users/eme4/asset-maid-port/scratch/engine/v5 && bun gen-inputs.mjs && bun gen-compose.mjs
// (gen-compose.mjs drives the ORIGINAL Ygt with the same fake LLM client / capturing dispatcher as composeV5Images.)
import { afterEach, describe, expect, test } from "bun:test";
import inputs from "../__fixtures__/v5/inputs.json";
import index from "../__fixtures__/v5/compose.index.json";
import { setEngineEnv } from "../core/env";
import { seededEnv } from "../testing/env";
import { toPlain } from "../testing/plain";
import { fnv1a64V5 } from "./catalog";
import type { V5AnalyzerClient, V5AnalyzerContext, V5DirectionSettings } from "./analyzer";
import {
  V5_BUNDLED_COMFY_PROFILE,
  composeV5Images,
  createV5NovelAIConfig,
  finalizeV5ProviderPrompt,
  type ComposeV5ImagesResult,
  type V5ComposeRunInput,
  type V5PromptContextSource,
} from "./compose";
import type { V5ImageProviderId } from "./types";

const plain = (v: unknown) => JSON.parse(JSON.stringify(toPlain(v)));
const hash = (v: unknown) => fnv1a64V5(plain(v));
const fixtures = import.meta.dir + "/../__fixtures__/v5/";
const context = inputs.context as unknown as V5AnalyzerContext;
const responses = inputs.responses as Record<string, unknown>;
const freecharPatch = { freeCharacterGenerationEnabled: true, knownCharacterIdentities: [{ name: "Alice", keys: ["Alice", "Ally"] }] };

interface Scenario {
  response: string;
  provider: V5ImageProviderId;
  seed: number;
  full?: boolean;
  directions?: string;
  forceAiChoiceCoordinates?: boolean;
  forceNsfwPrefix?: boolean;
  previous?: string;
  stateAccumulationEnabled?: boolean;
  revisionDirection?: string;
  skipSlotNumbers?: number[];
  requestedSizeId?: number;
  freechar?: boolean;
}

/** Same run input as compose-lib.mjs runCompose(). */
function runInput(s: Scenario, previousContinuitySnapshot?: Record<string, unknown>): V5ComposeRunInput {
  const ctx = s.freechar ? ({ ...context, ...freecharPatch } as V5AnalyzerContext) : context;
  const directionSettings = s.directions ? (inputs.directionSettings as unknown as Record<string, V5DirectionSettings>)[s.directions] : undefined;
  return {
    automaticRetryManaged: true,
    imageRetryCount: 0,
    generationType: "chat-auto",
    sessionContext: { chatKey: "chat-key", responseKey: "resp-1", messageIndex: 3, messageId: "msg-1", displayName: "Story Card", slotIds: ctx.candidateSlots.map((x) => x.slot_id), targetImageCount: 1, matchedAssetCount: 1, totalAssetCount: 2 },
    analysisConfig: { provider: "openai" },
    novelAIConfig: { ...inputs.novelAIConfig, ...(directionSettings ? { v5UserDirections: directionSettings } : {}) },
    generationProvider: s.provider,
    ...(s.requestedSizeId ? { requestedSizeId: s.requestedSizeId } : {}),
    forceAiChoiceCoordinates: s.forceAiChoiceCoordinates ?? true,
    forceNsfwPrefix: s.forceNsfwPrefix ?? false,
    stateAccumulationEnabled: s.stateAccumulationEnabled ?? false,
    comfyUI: { workflowProfileId: V5_BUNDLED_COMFY_PROFILE.id, endpoint: "http://127.0.0.1:8188", chanServerRequestUrl: "http://chan.local/api", chanServerApiKey: "chan-key", completionTimeoutMs: 120000 },
    ...(s.revisionDirection ? { revisionDirection: s.revisionDirection, revisionPromptChannels: [] } : {}),
    analyzerInput: { checkpointPolicy: "restart-analysis", context: ctx, checkpointContext: inputs.checkpointContext },
    v5PromptContext: () => JSON.parse(JSON.stringify(inputs.promptContext)) as V5PromptContextSource,
    seedSetting: () => ({ key: "", seed: "1234567", fixed: true }),
    previousCharacterStateMap: {},
    previousContinuitySnapshot,
    advanceContinuityTurn: true,
    skipSlotNumbers: s.skipSlotNumbers ?? [],
    cancelPrevious: true,
  };
}

const fakeClient = (response: unknown): V5AnalyzerClient => ({
  async complete() {
    return typeof response === "string" ? { raw: response, parsed: null } : { raw: JSON.stringify(response), parsed: response };
  },
});

const HEAVY = ["decision", "generationRecord", "analysisMetadata"];
function project(out: ComposeV5ImagesResult, full: boolean) {
  return {
    analysis: { ...plain(out.analysis), requestPayload: hash(out.analysis.requestPayload) },
    plans: plain(out.executedPromptPlans),
    requests: plain(out.requests),
    images: out.images.map(({ image }) => {
      const p = plain(image);
      if (!full) for (const k of HEAVY) p[k] = { hash: hash((image as Record<string, unknown>)[k]) };
      return p;
    }),
    continuity: plain(out.continuity ?? null),
    snapshot: plain(out.continuitySnapshot ?? null),
    events: plain(out.events),
  };
}

afterEach(() => setEngineEnv(null));

const scenarios = index.scenarios as Record<string, Scenario>;
describe("v5 compose (orchestrator without host calls)", () => {
  test("bundled ComfyUI profile id", () => {
    expect(V5_BUNDLED_COMFY_PROFILE.id).toBe(index.comfyProfileId);
  });

  for (const [name, s] of Object.entries(scenarios)) {
    test(`compose: ${name}`, async () => {
      const expected = await Bun.file(fixtures + `compose.${name}.json`).json();
      const previous = s.previous ? (await Bun.file(fixtures + `compose.${s.previous}.json`).json()).snapshot : undefined;
      setEngineEnv(seededEnv(s.seed));
      const out = await composeV5Images({ run: runInput(s, previous), client: fakeClient(responses[s.response]) });
      const got = project(out, !!s.full);
      expect(got.analysis).toEqual(expected.analysis);
      expect(got.plans).toEqual(expected.plans);
      expect(got.requests).toEqual(expected.requests);
      expect(got.images).toEqual(expected.images);
      expect(got.continuity).toEqual(expected.continuity);
      expect(got.snapshot).toEqual(expected.snapshot);
      expect(got.events).toEqual(expected.events);
      // each composed image carries its executed plan and captured request
      out.images.forEach((img, i) => {
        expect(img.executedPromptPlan).toBe(out.executedPromptPlans[i]!);
        expect(img.request).toBe(out.requests[i]!);
      });
    });
  }

  test("individual builders reproduce the composed NovelAI config and provider prompt", async () => {
    const expected = await Bun.file(fixtures + "compose.default.novelai.json").json();
    const s = scenarios["default.novelai"]!;
    setEngineEnv(seededEnv(s.seed));
    const out = await composeV5Images({ run: runInput(s), client: fakeClient(responses[s.response]) });
    out.images.forEach(({ image, executedPromptPlan }, i) => {
      const config = createV5NovelAIConfig(
        { novelAIConfig: inputs.novelAIConfig, forceAiChoiceCoordinates: true },
        executedPromptPlan,
        "1234567",
        out.analysis.localProjection.characterCoordinates,
        out.analysis.requestPayload.active_persona_candidate_key as string | undefined,
      );
      expect(plain(config)).toEqual(expected.images[i].novelAIConfig);
      const prompt = finalizeV5ProviderPrompt({ plan: executedPromptPlan, provider: "novelai", config, actors: image.actors });
      expect(prompt.positivePrompt).toBe(expected.requests[i].prompt);
      expect(prompt.negativePrompt).toBe(expected.requests[i].negativePrompt);
    });
  });

  test("analysis injection mode gives the same plans and requests", async () => {
    const expected = await Bun.file(fixtures + "compose.default.novelai.json").json();
    const s = scenarios["default.novelai"]!;
    setEngineEnv(seededEnv(s.seed));
    const first = await composeV5Images({ run: runInput(s), client: fakeClient(responses[s.response]) });
    setEngineEnv(seededEnv(s.seed));
    const injected = await composeV5Images({ run: runInput(s), analysis: JSON.parse(JSON.stringify(first.analysis)) });
    expect(plain(injected.executedPromptPlans)).toEqual(expected.plans);
    expect(plain(injected.requests)).toEqual(expected.requests);
  });
});
