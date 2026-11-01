// Fixture generator: S/engine-build/gen/context.mjs (S = the am990 scratch dir)
// (runs the same scenarios through the ORIGINAL 0.9.90 bundle with src/engine/context/testing/context-replay.ts)
import { afterEach, describe, expect, test } from "bun:test";
import { setEngineEnv } from "../core/env";
import { seededEnv } from "../testing/env";
import inputs from "../__fixtures__/context/context-inputs.json";
import * as ctx from "./context";
import { replayContextScenario, type ContextKit, type ContextScenario } from "./testing/context-replay";

const kit: ContextKit = {
  buildAnalyzerContextInputs: ctx.buildAnalyzerContextInputs as never,
  buildOutfitCandidates: ctx.buildOutfitCandidates as never,
  buildVisualContinuityContext: ctx.buildVisualContinuityContext as never,
  buildChatContext: ctx.buildChatContext as never,
  resolveSourceGenerationSettings: ctx.resolveSourceGenerationSettings as never,
  getDefaultSourceGenerationSettings: ctx.getDefaultSourceGenerationSettings as never,
  resolveNovelAIRunConfig: ctx.resolveNovelAIRunConfig as never,
  resolveArtistPromptSelection: ctx.resolveArtistPromptSelection as never,
  resolvePersonaProfile: ctx.resolvePersonaProfile as never,
  isFreeOutfitGenerationEnabled: ctx.isFreeOutfitGenerationEnabled as never,
  hasStoredContinuity: ctx.hasStoredContinuity as never,
  resolveOutfitCreationMode: ctx.resolveOutfitCreationMode as never,
  resolveSourceFixedRating: ctx.resolveSourceFixedRating as never,
  resolveIdentityEvidence: ctx.resolveIdentityEvidence as never,
};

afterEach(() => {
  setEngineEnv(null);
});

const scenarios = inputs.scenarios as unknown as ContextScenario[];

describe("analyzer context building parity (AM gxt + helpers)", () => {
  for (const sc of scenarios) {
    test(sc.name, async () => {
      const expected = require(`../__fixtures__/context/context-expected.${sc.name}.json`) as Record<string, unknown>;
      setEngineEnv(seededEnv(7));
      const got = await replayContextScenario(kit, sc);
      for (const key of Object.keys(expected)) expect({ [key]: got[key] }).toEqual({ [key]: expected[key] });
      expect(Object.keys(got).sort()).toEqual(Object.keys(expected).sort());
    });
  }
});

describe("assembleAnalyzerInput / buildCandidateSlots", () => {
  test("assembles the 0.9.90 Vxt analyzerInput shape from gxt output", async () => {
    const sc = scenarios[0]!;
    const input = structuredClone(sc.input) as unknown as ctx.AnalyzerContextSourceInput;
    const m = ctx.buildAnalyzerContextInputs(input);
    const evidence = await ctx.resolveIdentityEvidence({
      candidates: m.analyzerIdentityCandidates,
      slots: sc.slots as ctx.ParagraphSlotLike[],
      originalAssetTokens: sc.assetTokens as never,
      source: input.source,
      previousMessageParticipantKeys: [],
    });
    const slots = ctx.buildCandidateSlots(sc.slots as ctx.ParagraphSlotLike[], evidence);
    const expected = require(`../__fixtures__/context/context-expected.${sc.name}.json`) as { identityEvidence: { actorHintsBySlot: { __map__: [string, string[]][] } } };
    for (const [slotId, hints] of expected.identityEvidence.actorHintsBySlot.__map__) {
      const slot = slots.find((x) => x.slot_id === slotId)!;
      expect(slot.actor_hints ?? []).toEqual(hints);
    }
    const a = ctx.assembleAnalyzerInput({
      config: input.config,
      sourceId: sc.sourceId,
      inputs: m,
      candidateSlots: slots,
      targetImageCount: 2,
      imageCountConstraint: { mode: "range", min: 1, max: 2 },
      checkpoint: { chatKey: input.chatKey, messageIndex: 5, messageId: "id:msg-5" },
      modelType: " gpt ",
    });
    expect(a.context.presetScope).toBe("all");
    expect(a.context.freeCharacterGenerationEnabled).toBe(ctx.resolveSourceGenerationSettings(input.config, sc.sourceId).freeCharacterGenerationEnabled);
    expect(a.context.modelType).toBe("gpt");
    expect(a.checkpointContext).toEqual({ chatKey: input.chatKey, messageId: "msg-5" });
    expect(Object.keys(a).sort()).toEqual(["checkpointContext", "context"]);
    expect(ctx.previousGlobalModifierRefs(m.visualContinuity)).toEqual(m.visualContinuity.previous_modifiers.global as Record<string, string[]>);
  });
});
