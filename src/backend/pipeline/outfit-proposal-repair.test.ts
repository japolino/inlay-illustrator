// Outfit proposals the core rejects: in split analysis one of them fails the whole initial step (AM `c0e`
// "초기 결정의 인물·폼·의상 검증 실패"). These tests run the REAL analyzer core on a split initial reply, first as the
// model sent it (fails) and then through the outfit awareness client (repaired, passes).
import { afterEach, describe, expect, test } from "bun:test";
import inputs from "../../engine/__fixtures__/v5/inputs.json";
import { buildV5AnalyzerMessages, buildV5AnalyzerRequest } from "../../engine/index.js";
import { setEngineEnv } from "../../engine/core/env.js";
import { seededEnv } from "../../engine/testing/env.js";
import { compileActiveAtelierPresetCatalog } from "../../engine/v5/catalog.js";
import { createV5RuleRuntime } from "../../engine/v5/runtime.js";
import { createV5Analyzer, resolveV5Directions } from "../../engine/v5/analyzer.js";
import type { AnalyzerClientLike } from "../services/types.js";
import { augmentV5AnalyzerMessages, createRunOutfitIndex, OutfitIndexRegistry, repairOutfitProposals, withOutfitAwareness, type OutfitProposalRepair } from "./outfit-awareness.js";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const I = inputs as Any;
const catalog = compileActiveAtelierPresetCatalog(null).catalog;
const proposal = { name: "Rain Coat", head: "", top: "yellow raincoat", bottom: "", legs: "", feet: "rain boots" };
const FAILURE = "초기 결정의 인물·폼·의상 검증 실패";

afterEach(() => setEngineEnv(null));

/** One split initial analysis over the real core; `mutate` edits the model's reply. */
async function runInitial(mutate: (reply: Any, payload: Any) => void, options: { repair: boolean; context?: Record<string, unknown> }) {
  setEngineEnv(seededEnv(1));
  const repairs: OutfitProposalRepair[] = [];
  let payload: Any = null;
  const model: AnalyzerClientLike = {
    async complete(_config, messages) {
      const user = messages.find((m) => m.role === "user")!;
      const text = typeof user.content === "string" ? user.content : (user.content as Any[]).map((p) => p.text ?? "").join("");
      payload = JSON.parse(text.slice(text.indexOf("{")));
      const reply = structuredClone(I.responses.splitInitial);
      mutate(reply, payload);
      return { raw: JSON.stringify(reply), parsed: reply };
    },
  };
  const client = options.repair ? withOutfitAwareness(model, new OutfitIndexRegistry(), undefined, (r) => repairs.push(...r)) : model;
  const analyzer = createV5Analyzer(client as never, createV5RuleRuntime({ catalog }));
  try {
    const result: Any = await analyzer.run({
      context: { ...I.context, targetImageCount: 1, imageCountConstraint: { mode: "fixed", min: 1, max: 1 }, ...(options.context ?? {}) },
      config: { provider: "openai" },
      continuitySnapshot: null,
      userDirections: resolveV5Directions(I.directionSettings.default),
      checkpointContext: I.checkpointContext,
      checkpointPolicy: "restart-analysis",
      splitStage: I.splitStages.initial,
    } as never);
    return { error: "", roster: result.splitPlan.illustrations[0].actor_roster as Any[], repairs, payload };
  } catch (error) {
    return { error: (error as Error).message, roster: [] as Any[], repairs, payload };
  }
}

describe("outfit proposals the core rejects (split initial analysis, real core)", () => {
  test("a proposal for nobody the request knows fails the step as sent, and is dropped by the repair", async () => {
    const stray = (reply: Any) => (reply.generated_outfit_proposals = [{ proposalKey: "outfit_1", candidateKey: "actor.unknown.zzz", proposal }]);
    const asSent = await runInitial(stray, { repair: false });
    expect(asSent.error).toContain(FAILURE);
    expect(asSent.error).toContain("$.generated_outfit_proposals[0]: Omitted a generated outfit proposal without one eligible registered Actor and exact appearance form.");
    const repaired = await runInitial(stray, { repair: true });
    expect(repaired.error).toBe("");
    expect(repaired.repairs).toEqual([{ proposalKey: "outfit_1", candidateKey: "actor.unknown.zzz", action: "dropped", reason: "this character may not get new outfits" }]);
    expect(repaired.roster.map((a) => a.outfit)).toEqual(I.responses.splitInitial.illustrations[0].actor_roster.map((a: Any) => a.outfit));
  });

  test("a second, stray proposal next to a valid one: the valid one is kept and worn", async () => {
    const mixed = (reply: Any) => {
      const wearer = reply.illustrations[0].actor_roster[0];
      reply.generated_outfit_proposals = [
        { proposalKey: "outfit_1", candidateKey: wearer.candidateKey, formRef: wearer.formRef, proposal },
        { proposalKey: "outfit_2", candidateKey: "actor.unknown.zzz", proposal },
      ];
      wearer.outfit = { proposalKey: "outfit_1" };
    };
    expect((await runInitial(mixed, { repair: false })).error).toContain("$.generated_outfit_proposals[1]");
    const repaired = await runInitial(mixed, { repair: true });
    expect(repaired.error).toBe("");
    expect(repaired.repairs.map((r) => [r.proposalKey, r.action])).toEqual([["outfit_2", "dropped"]]);
    expect(repaired.roster[0].outfit).toEqual({ proposalKey: "outfit_1" });
  });

  test("outfit creation off: a proposal the roster wears fails as sent; repaired, the Actor keeps an existing outfit", async () => {
    const context = { freeOutfitGenerationEnabled: false };
    const worn = (reply: Any) => {
      const wearer = reply.illustrations[0].actor_roster[0];
      reply.generated_outfit_proposals = [{ proposalKey: "outfit_1", candidateKey: wearer.candidateKey, formRef: wearer.formRef, proposal }];
      wearer.outfit = { proposalKey: "outfit_1" };
    };
    const asSent = await runInitial(worn, { repair: false, context });
    expect(asSent.error).toContain(FAILURE);
    expect(asSent.payload.outfit_creation_candidates).toBeUndefined();
    const repaired = await runInitial(worn, { repair: true, context });
    expect(repaired.error).toBe("");
    expect(repaired.repairs.map((r) => [r.action, r.reason])).toEqual([["dropped", "the request allows no new outfits"]]);
    expect(repaired.roster[0].outfit).toEqual(I.responses.splitInitial.illustrations[0].actor_roster[0].outfit);
  });

  test("an allowed owner with a form the request does not have: the form is corrected and the proposal survives", async () => {
    const wrongForm = (reply: Any) => {
      const wearer = reply.illustrations[0].actor_roster[0];
      reply.generated_outfit_proposals = [{ proposalKey: "outfit_1", candidateKey: wearer.candidateKey, formRef: "form_that_does_not_exist", proposal }];
      wearer.outfit = { proposalKey: "outfit_1" };
    };
    expect((await runInitial(wrongForm, { repair: false })).error).toContain(FAILURE);
    const repaired = await runInitial(wrongForm, { repair: true });
    expect(repaired.error).toBe("");
    expect(repaired.repairs.map((r) => [r.proposalKey, r.action])).toEqual([["outfit_1", "form-fixed"]]);
    expect(repaired.roster[0].outfit).toEqual({ proposalKey: "outfit_1" });
  });

  test("a reply without outfit problems passes through as the same object", async () => {
    const reply = structuredClone(I.responses.splitInitial);
    const result = { raw: JSON.stringify(reply), parsed: reply };
    const build = buildV5AnalyzerRequest({ context: I.context, continuitySnapshot: null, config: { provider: "openai" }, userDirections: {} } as never);
    const messages = buildV5AnalyzerMessages(build.request as never, {}).messages as never;
    let repairs = 0;
    const client = withOutfitAwareness({ complete: async () => result }, new OutfitIndexRegistry(), undefined, () => (repairs += 1));
    expect(await client.complete({}, messages, {})).toBe(result);
    expect(repairs).toBe(0);
  });
});

describe("repairOutfitProposals", () => {
  const payload = {
    outfit_creation_candidates: ["actor.a"],
    actor_candidates: [
      { candidateKey: "actor.a", forms: [{ formRef: "day" }, { formRef: "night" }] },
      { candidateKey: "actor.b", forms: [{ appearance: "only" }] },
    ],
  };

  test("a character declared in the same reply: its outfit proposal becomes the profile's default outfit", () => {
    const reply: Any = {
      generated_actor_proposals: [{ candidateKey: "free_1", label: "Hana", profile: { recognitionKeys: ["Hana"] } }],
      generated_outfit_proposals: [{ proposalKey: "outfit_1", candidateKey: "free_1", proposal: { ...proposal, reason: "new", confidence: 0.9 } }],
      illustrations: [{ slot_number: 0, actor_roster: [{ actorId: "actor_1", candidateKey: "free_1", outfit: { proposalKey: "outfit_1" } }] }],
    };
    expect(repairOutfitProposals(reply, payload)).toEqual([
      { proposalKey: "outfit_1", candidateKey: "free_1", action: "moved-to-profile", reason: "a character declared in this reply takes its clothes from its profile" },
    ]);
    expect(reply.generated_outfit_proposals).toBeUndefined();
    expect(reply.generated_actor_proposals[0].profile.defaultOutfit).toEqual(proposal);
    expect(reply.illustrations[0].actor_roster[0]).toEqual({ actorId: "actor_1", candidateKey: "free_1" });
  });

  test("a profile that already has a default outfit keeps it; the proposal is only dropped", () => {
    const own = { name: "Own", head: "", top: "shirt", bottom: "", legs: "", feet: "" };
    const reply: Any = {
      generated_actor_proposals: [{ candidateKey: "free_1", profile: { defaultOutfit: own } }],
      generated_outfit_proposals: [{ proposalKey: "outfit_1", candidateKey: "free_1", proposal }],
      illustrations: [],
    };
    expect(repairOutfitProposals(reply, payload).map((r) => r.action)).toEqual(["dropped"]);
    expect(reply.generated_actor_proposals[0].profile.defaultOutfit).toBe(own);
  });

  test("references: an outfit ID next to a dropped reference stays; occurrence outfits are found through the Actor's ID; inline proposals go", () => {
    const reply: Any = {
      generated_outfit_proposals: [{ proposalKey: "outfit_1", candidateKey: "actor.b", proposal }],
      illustrations: [
        {
          actor_roster: [
            { actorId: "actor_1", candidateKey: "actor.b", outfit: { id: "Uniform", proposalKey: "outfit_1" } },
            { actorId: "actor_2", candidateKey: "actor.a", formRef: "day", outfit: { proposal } },
          ],
          actor_detail: [
            { actorId: "actor_1", placementIndex: 0, outfit: { proposalKey: "OUTFIT_1" } },
            { actorId: "actor_1", placementIndex: 1, outfit: { proposal } },
            { actorId: "actor_1", placementIndex: 2, outfit: { id: "Uniform" } },
          ],
        },
      ],
    };
    const repairs = repairOutfitProposals(reply, payload);
    expect(repairs.map((r) => [r.proposalKey, r.candidateKey, r.action])).toEqual([
      ["outfit_1", "actor.b", "dropped"],
      ["", "actor.b", "dropped"],
    ]);
    const [illustration] = reply.illustrations;
    expect(illustration.actor_roster[0].outfit).toEqual({ id: "Uniform" });
    expect(illustration.actor_roster[1].outfit).toEqual({ proposal });
    expect(illustration.actor_detail.map((d: Any) => d.outfit)).toEqual([undefined, undefined, { id: "Uniform" }]);
  });

  test("forms: a missing or unknown form on a multi-form owner comes from the roster entry that wears the proposal; a valid one is left alone", () => {
    const make = (formRef?: string): Any => ({
      generated_outfit_proposals: [{ proposalKey: "outfit_1", candidateKey: "actor.a", ...(formRef ? { form_ref: formRef } : {}), proposal }],
      illustrations: [
        { actor_roster: [{ actorId: "actor_1", candidateKey: "actor.a", formRef: "day", outfit: { id: "Uniform" } }] },
        { actor_roster: [{ actorId: "actor_1", candidateKey: "actor.a", formRef: "night", outfit: { proposalKey: "outfit_1" } }] },
      ],
    });
    for (const sent of [undefined, "dusk"]) {
      const reply = make(sent);
      expect(repairOutfitProposals(reply, payload).map((r) => r.action)).toEqual(["form-fixed"]);
      expect(reply.generated_outfit_proposals[0]).toEqual({ proposalKey: "outfit_1", candidateKey: "actor.a", proposal, formRef: "night" });
    }
    const valid = make("day");
    expect(repairOutfitProposals(valid, payload)).toEqual([]);
    expect(valid.generated_outfit_proposals[0].form_ref).toBe("day");
    // Nothing in the roster to go by: left for the core to judge.
    const lost = { generated_outfit_proposals: [{ proposalKey: "outfit_1", candidateKey: "actor.a", formRef: "dusk", proposal }], illustrations: [] };
    expect(repairOutfitProposals(lost, payload)).toEqual([]);
  });
});

describe("outfit part rules and who may get a new outfit", () => {
  const index = createRunOutfitIndex(I.context);
  const policyFor = (context: Record<string, unknown>) => {
    const build = buildV5AnalyzerRequest({ context: { ...I.context, ...context }, continuitySnapshot: null, config: { provider: "openai" }, userDirections: {} } as never);
    const messages = buildV5AnalyzerMessages(build.request as never, {}).messages as unknown as Array<{ role: string; content: unknown }>;
    const augmented = augmentV5AnalyzerMessages(messages, (k, f, o) => index.wire(k, f, o))!;
    return JSON.parse(augmented.find((m) => m.role === "user")!.content as string).response_contract.analysis_policy.outfits;
  };

  test("creation on: the rules ask for a proposal only for Actors in outfit_creation_candidates", () => {
    const outfits = policyFor({ freeOutfitGenerationEnabled: true });
    for (const key of ["part_contradiction", "part_completion"]) {
      expect(outfits[key]).toContain("propose");
      expect(outfits[key]).toContain("Propose only for an Actor whose candidateKey is listed in outfit_creation_candidates");
    }
  });

  test("creation off: the rules ask for no proposal at all", () => {
    const outfits = policyFor({ freeOutfitGenerationEnabled: false });
    expect(outfits.creation_enabled).toBe(false);
    for (const key of ["part_contradiction", "part_completion"]) {
      expect(outfits[key]).toContain("Outfit creation is disabled");
      expect(outfits[key]).not.toContain("propose a new outfit");
      expect(outfits[key]).not.toContain("propose the completed outfit");
    }
    expect(outfits.registered_parts).toBeTruthy();
    expect(outfits.temporary_state).toBeTruthy();
  });
});
