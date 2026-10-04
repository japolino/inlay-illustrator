// Parity fixtures: src/engine/__fixtures__/v5/analyzer.{request.*,runs,recovery,split,misc}.json (+ inputs.json)
// Generator: cd C:/Users/eme4/asset-maid-port/scratch/engine/v5 && bun gen-inputs.mjs && bun gen-analyzer.mjs
import { afterEach, describe, expect, test } from "bun:test";
import inputs from "../__fixtures__/v5/inputs.json";
import misc from "../__fixtures__/v5/analyzer.misc.json";
import runs from "../__fixtures__/v5/analyzer.runs.json";
import recoveries from "../__fixtures__/v5/analyzer.recovery.json";
import split from "../__fixtures__/v5/analyzer.split.json";
import { setEngineEnv } from "../core/env";
import { seededEnv } from "../testing/env";
import { toPlain } from "../testing/plain";
import { fnv1a64V5 } from "./catalog";
import {
  V5_ANALYSIS_PRESETS,
  buildV5AnalyzerMessages,
  buildV5AnalyzerRequest,
  createDefaultV5DirectionSettings,
  createV5Analyzer,
  createV5SplitAnalysisRunner,
  planV5SplitBatches,
  recoverV5AnalyzerResponse,
  renderV5SplitPhaseSystemInstruction,
  resolveV5Directions,
  selectV5DirectionPreset,
  type V5AnalyzerContext,
  type V5AnalyzerRunInput,
  type V5DirectionSettings,
  type V5RevisionPromptChannel,
} from "./analyzer";
import type { V5RecoveryMode } from "./runtime";

const plain = (v: unknown) => JSON.parse(JSON.stringify(toPlain(v)));
const hash = (v: unknown) => fnv1a64V5(plain(v));
const fixtures = import.meta.dir + "/../__fixtures__/v5/";
const context = inputs.context as unknown as V5AnalyzerContext;
const settings = inputs.directionSettings as unknown as Record<string, V5DirectionSettings>;
const responses = inputs.responses as Record<string, unknown>;
const directions = (key: string) => resolveV5Directions(settings[key]);
const ctxWith = (patch?: Record<string, unknown> | null) => (patch ? ({ ...context, ...patch } as V5AnalyzerContext) : context);
const freecharPatch = { freeCharacterGenerationEnabled: true, knownCharacterIdentities: [{ name: "Alice", keys: ["Alice", "Ally"] }] };

afterEach(() => setEngineEnv(null));

describe("v5 directing modes", () => {
  test("default settings, presets and preset selection", () => {
    expect(plain(createDefaultV5DirectionSettings())).toEqual(misc.defaultDirectionSettings);
    expect(plain(createDefaultV5DirectionSettings())).toEqual(inputs.defaultDirectionSettings);
    expect(plain(V5_ANALYSIS_PRESETS)).toEqual(misc.analysisPresets);
    expect(plain(selectV5DirectionPreset(createDefaultV5DirectionSettings().scene, "scene-comic"))).toEqual(misc.td);
  });
});

const requestVariants = Object.keys(misc.index as Record<string, string>);
describe("v5 analyzer request", () => {
  for (const name of requestVariants) {
    test(`request: ${name}`, async () => {
      const f = await Bun.file(fixtures + (misc.index as Record<string, string>)[name]).json();
      const v = f.variant;
      const userDirections = directions(v.directions);
      expect(plain(userDirections)).toEqual(f.userDirections);
      const build = buildV5AnalyzerRequest({ context: ctxWith(v.contextPatch), continuitySnapshot: v.continuitySnapshot ?? null, config: v.config, userDirections });
      const messages = buildV5AnalyzerMessages(build.request, { revisionDirection: v.revisionDirection, revisionPromptChannels: v.revisionPromptChannels });
      expect(build.request.systemInstruction).toBe(f.systemInstruction);
      expect(plain(build.request.enabledModifierRefs)).toEqual(f.enabledModifierRefs);
      expect(plain(build.request.localRecovery)).toEqual(f.localRecovery);
      expect(plain(build.request.localProjection)).toEqual(f.localProjection);
      expect(plain(build.imageCount)).toEqual(f.imageCount);
      expect(build.scene.scene).toBe(f.scene);
      expect(plain(build.scene.slotHints ?? null)).toEqual(f.slotHints);
      expect(plain(build.candidates)).toEqual(f.candidates);
      if (f.payload) {
        expect(plain(build.requestContext)).toEqual(f.requestContext);
        expect(plain(build.request.instructionModules)).toEqual(f.instructionModules);
        expect(plain(build.request.payload)).toEqual(f.payload);
        expect(plain(build.structuredOutputSchema)).toEqual(f.schema);
        expect(plain(messages.messages)).toEqual(f.messages);
        expect(plain(messages.cachePartition)).toEqual(f.cachePartition);
      }
      expect({
        requestContext: hash(build.requestContext),
        instructionModules: hash(build.request.instructionModules),
        payload: hash(build.request.payload),
        schema: hash(build.structuredOutputSchema),
        messages: hash(messages.messages),
        cachePartition: hash(messages.cachePartition),
        wirePayload: hash(messages.wirePayload),
        messagePayload: hash(messages.payload),
      }).toEqual(f.hashes);
    });
  }
});

// Same table as gen-analyzer.mjs egtRun(...) calls.
const revisionChannels: V5RevisionPromptChannel[] = [{ id: "c1", kind: "character", label: "Alice", actorIndex: 0, positive: "1girl, silver hair", negative: "" }];
const runCases: Record<string, { response: string; directionsKey?: string; contextPatch?: Record<string, unknown>; config?: Record<string, unknown>; revision?: boolean; continuity?: boolean }> = {
  default: { response: "default" },
  pov: { response: "pov", directionsKey: "pov" },
  comic: { response: "comic", directionsKey: "comic" },
  ensemble: { response: "ensemble", directionsKey: "ensemble" },
  slotmap: { response: "broken.slotMap", config: { provider: "ollama_local" } },
  "fenced-text": { response: "broken.fencedText" },
  partial: { response: "broken.partial" },
  unusable: { response: "broken.unusable" },
  "invalid-json": { response: "broken.invalidJson" },
  freechar: { response: "generatedActor", contextPatch: freecharPatch },
  "freechar-disabled": { response: "generatedActor" },
  revision: { response: "default", revision: true },
  continuity: { response: "continuity", continuity: true },
};

describe("v5 analyzer run (Egt) with a fake LLM client", () => {
  for (const [name, rc] of Object.entries(runCases)) {
    test(`run: ${name}`, async () => {
      const expected = (runs as Record<string, any>)[name];
      setEngineEnv(seededEnv(expected.input.seed));
      const response = responses[rc.response];
      const sent: { config: unknown; messages: unknown; options: Record<string, unknown> }[] = [];
      const analyzer = createV5Analyzer({
        async complete(config, messages, options) {
          const { signal: _s, onRequestProgress: _p, beforeRequest: _b, ...rest } = options;
          sent.push({ config, messages, options: rest });
          return typeof response === "string" ? { raw: response, parsed: null } : { raw: JSON.stringify(response), parsed: response };
        },
      });
      const input: V5AnalyzerRunInput = {
        context: ctxWith(rc.contextPatch),
        config: rc.config ?? { provider: "openai" },
        continuitySnapshot: rc.continuity ? (misc.continuitySnapshot as Record<string, unknown>) : null,
        userDirections: directions(rc.directionsKey ?? "default"),
        checkpointContext: inputs.checkpointContext,
        checkpointPolicy: "restart-analysis",
        ...(rc.revision ? { revisionDirection: "Make her smile", revisionPromptChannels: revisionChannels } : {}),
      };
      let result: unknown = null;
      let error: unknown = null;
      try {
        result = await analyzer.run(input);
      } catch (e) {
        const err = e as Error & { code?: string; diagnostics?: unknown };
        error = { name: err.name, message: err.message, code: err.code ?? null, diagnostics: err.diagnostics ?? null };
      }
      expect(
        sent.map((s) => ({
          config: plain(s.config),
          options: plain({ ...s.options, structuredOutputSchema: undefined, cachePartition: undefined }),
          hashes: { messages: hash(s.messages), schema: hash(s.options.structuredOutputSchema), cachePartition: hash(s.options.cachePartition) },
        })),
      ).toEqual(expected.sent);
      const r = result as { requestPayload?: unknown } | null;
      expect(r && { ...plain(r), requestPayload: hash(r.requestPayload) }).toEqual(expected.result);
      expect(plain(error)).toEqual(expected.error);

      // The standalone request builder reproduces exactly what Egt sent.
      const build = buildV5AnalyzerRequest({ context: input.context, continuitySnapshot: input.continuitySnapshot, config: input.config, userDirections: input.userDirections });
      const messages = buildV5AnalyzerMessages(build.request, { revisionDirection: input.revisionDirection, revisionPromptChannels: input.revisionPromptChannels });
      expect({ messages: hash(messages.messages), schema: hash(build.structuredOutputSchema), cachePartition: hash(messages.cachePartition) }).toEqual(expected.sent[0].hashes);
    });
  }
});

describe("v5 analyzer response recovery", () => {
  for (const [name, rec] of Object.entries(recoveries as Record<string, { response: string; directions: string; mode: V5RecoveryMode; freeCharacterGenerationEnabled: boolean; recovered: unknown }>)) {
    test(`recover: ${name}`, () => {
      const build = buildV5AnalyzerRequest({ context: ctxWith(rec.freeCharacterGenerationEnabled ? freecharPatch : null), userDirections: directions(rec.directions) });
      const resp = responses[rec.response];
      const out = recoverV5AnalyzerResponse(typeof resp === "string" ? resp : JSON.stringify(resp), build, { mode: rec.mode, freeCharacterGenerationEnabled: rec.freeCharacterGenerationEnabled });
      expect(plain(out)).toEqual(rec.recovered);
    });
  }
});

describe("v5 split analysis", () => {
  test("batch planning", () => {
    for (const v of split.batchVectors) expect(planV5SplitBatches(v.total, v.batchSize)).toEqual(v.sizes);
    expect(() => planV5SplitBatches(0, 3)).toThrow();
  });

  test("phase system prompts", () => {
    const k0 = buildV5AnalyzerRequest({ context, userDirections: directions("default") }).request;
    const kc = buildV5AnalyzerRequest({ context, userDirections: directions("comic") }).request;
    expect(renderV5SplitPhaseSystemInstruction(k0, "initial")).toBe(split.prompts.initial);
    expect(renderV5SplitPhaseSystemInstruction(k0, "detail")).toBe(split.prompts.detail);
    expect(renderV5SplitPhaseSystemInstruction(kc, "initial")).toBe(split.prompts.comicInitial);
    expect(renderV5SplitPhaseSystemInstruction(kc, "detail")).toBe(split.prompts.comicDetail);
  });

  test("runner over a fake analyzer (initial + batched details)", async () => {
    setEngineEnv(seededEnv(9));
    const catalogFingerprint = buildV5AnalyzerRequest({ context }).runtime.catalogFingerprint;
    const calls: unknown[] = [];
    const stages: unknown[] = [];
    const progress: unknown[] = [];
    const fake = {
      runtime: { catalogFingerprint },
      captureSelectionSettings: () => undefined,
      async run(R: any): Promise<any> {
        calls.push({ phase: R.splitStage.phase, assignedSlots: R.splitStage.assignedSlots ?? null, targetImageCount: R.context.targetImageCount, imageCountConstraint: R.context.imageCountConstraint, slots: R.context.candidateSlots.map((s: any) => s.slot_number) });
        if (R.splitStage.phase === "initial")
          return { splitPlan: { illustrations: R.context.candidateSlots.map((s: any) => ({ slot_number: s.slot_number, actor_roster: [] })) }, response: { illustrations: [], diagnostics: [] }, localProjection: {}, catalogFingerprint: "x" };
        return { response: { illustrations: R.splitStage.assignedSlots.map((n: number) => ({ slotNumber: n, status: "recovered", diagnostics: [] })), diagnostics: [{ code: "batch", impact: "recovered", path: "$", message: String(R.splitStage.assignedSlots) }] } };
      },
    };
    const runner = createV5SplitAnalysisRunner(fake, (key, msg) => progress.push({ key, msg }));
    const slots = Array.from({ length: 5 }, (_, i) => ({ slot_id: "s" + i, slot_number: i, before: "b" + i, after: "a" + i }));
    const out = await runner.run(
      { context: { ...context, candidateSlots: slots, splitAnalysis: { totalCount: 4, batchSize: 3, retries: 2 } }, config: { provider: "openai" }, userDirections: {}, continuitySnapshot: null, checkpointContext: { chatKey: "chat-key", messageId: "msg-9", pendingKey: "resp-9" } },
      async (initial: any, prepare) => ({ prepared: await prepare("characters", async () => "prepared-characters"), initialSlots: initial.splitPlan.illustrations.map((i: any) => i.slot_number) }),
      (done, total, label) => stages.push({ done, total, label }),
      (p) => progress.push({ phase: p.phase, steps: p.steps.map((s: any) => ({ id: s.id, status: s.status, firstImage: s.firstImage, imageCount: s.imageCount })) }),
    );
    runner.dispose();
    expect(plain({ calls, stages, progress, result: out })).toEqual(split.runner);
  });
});
