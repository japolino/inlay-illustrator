import { describe, expect, test } from "bun:test";
import fixture from "../../engine/__fixtures__/v5/analyzer.request.default.json";
import type { AnalyzerClientLike } from "../services/types.js";
import { augmentPersonaIdentityMessages, PERSONA_IDENTITY_POLICY, withPersonaIdentity } from "./persona-identity.js";

type Message = Parameters<AnalyzerClientLike["complete"]>[1][number];
function payload(scene = "Arin stands beside Rook. She hands him a letter.") {
  const value = structuredClone(fixture.payload);
  value.scene = scene;
  value.actor_candidates[0]!.name = "Arin";
  return value;
}
function messages(value: unknown): Message[] {
  return [{ role: "system", content: "Keep the scene preset and response schema." }, { role: "user", content: JSON.stringify(value), cache_control: { type: "ephemeral" } }];
}
function augmented(value: unknown) {
  const result = augmentPersonaIdentityMessages(messages(value));
  expect(result).not.toBeNull();
  return JSON.parse(result![1]!.content as string) as ReturnType<typeof payload> & {
    response_contract: { analysis_policy: { actors: { active_persona_identity: typeof PERSONA_IDENTITY_POLICY } } };
  };
}

describe("V5 active persona identity guidance", () => {
  for (const scene of [
    "Arin stands beside Rook. She hands him a letter.",
    "Rook calls you Firefly. You hand him a letter.",
    "I hand Rook a letter. He calls me Firefly.",
  ]) test(`adds matching guidance without rewriting scene evidence: ${scene}`, () => {
    const input = payload(scene);
    const output = augmented(input);
    expect(output.response_contract.analysis_policy.actors.active_persona_identity).toEqual(PERSONA_IDENTITY_POLICY);
    expect(output.scene).toBe(scene);
    expect(output.active_persona_candidate_key).toBe(input.active_persona_candidate_key);
    expect(output.actor_candidates).toEqual(input.actor_candidates);
    expect(output.appearance_catalog).toEqual(input.appearance_catalog);
    expect(output.response_contract.analysis_policy.actors.protagonist_selection).toBe(input.response_contract.analysis_policy.actors.protagonist_selection);
    expect("active_persona_identity" in input.response_contract.analysis_policy.actors).toBe(false);
  });

  test("keeps the selected form, separate NPCs, schema and preset instructions unchanged", () => {
    const input = payload("Mira greets Arin and Rook.");
    const original = messages(input);
    const before = structuredClone(original);
    const output = augmentPersonaIdentityMessages(original)!;
    expect(original).toEqual(before);
    expect(output[0]).toBe(original[0]);
    expect(output[1]!.cache_control).toBe(original[1]!.cache_control);
    const decoded = JSON.parse(output[1]!.content as string);
    const { active_persona_identity: policy, ...actors } = decoded.response_contract.analysis_policy.actors;
    expect(policy.distinct_actors).toContain("Gender, pronouns or visual similarity alone do not prove");
    expect(actors).toEqual(input.response_contract.analysis_policy.actors);
    decoded.response_contract.analysis_policy.actors = actors;
    expect(decoded).toEqual(input);
  });

  test("supports active personas supplied in the candidate overlay", () => {
    const input = payload();
    const candidate = input.actor_candidates.shift()!;
    const output = augmented({ ...input, actor_candidate_overlay: [candidate] });
    expect(output.response_contract.analysis_policy.actors.active_persona_identity).toEqual(PERSONA_IDENTITY_POLICY);
  });

  test("preserves vision input and adds guidance only to the structured text part", () => {
    const image = { type: "image", data: "fixture-image", mime_type: "image/png" };
    const text = { type: "text", text: JSON.stringify(payload()) };
    const ordinary = { type: "text", text: "Reference image follows." };
    const input: Message[] = [{ role: "user", content: [ordinary, text, image] }];
    const output = augmentPersonaIdentityMessages(input)!;
    const parts = output[0]!.content as Array<Record<string, unknown>>;
    expect(parts[0]).toBe(ordinary);
    expect(parts[2]).toBe(image);
    expect(text.text).not.toContain("active_persona_identity");
    expect(JSON.parse(parts[1]!.text as string).response_contract.analysis_policy.actors.active_persona_identity).toEqual(PERSONA_IDENTITY_POLICY);
  });

  for (const variant of ["missing key", "unavailable candidate", "missing contract", "non-V5"] as const)
    test(`passes through ${variant}`, () => {
      const input: Record<string, unknown> = payload();
      if (variant === "missing key") delete input.active_persona_candidate_key;
      if (variant === "unavailable candidate") input.active_persona_candidate_key = "not-in-roster";
      if (variant === "missing contract") delete input.response_contract;
      if (variant === "non-V5") delete input.actor_candidates;
      expect(augmentPersonaIdentityMessages(messages(input))).toBeNull();
    });

  test("passes through malformed JSON and ordinary chat messages", () => {
    expect(augmentPersonaIdentityMessages([{ role: "user", content: "{invalid" }])).toBeNull();
    expect(augmentPersonaIdentityMessages([{ role: "user", content: "She waves." }])).toBeNull();
    expect(augmentPersonaIdentityMessages([{ role: "assistant", content: JSON.stringify(payload()) }])).toBeNull();
  });

  test("retains existing identity policy rather than replacing user or upstream rules", () => {
    const input = payload();
    const custom = { ...input, response_contract: { ...input.response_contract, analysis_policy: {
      ...input.response_contract.analysis_policy,
      actors: { ...input.response_contract.analysis_policy.actors, active_persona_identity: { custom: "Existing policy" } },
    } } };
    const output = augmented(custom);
    const policy: unknown = output.response_contract.analysis_policy.actors.active_persona_identity;
    expect(policy).toEqual({ custom: "Existing policy" });
    expect(augmentPersonaIdentityMessages(augmentPersonaIdentityMessages(messages(custom))!)).toEqual(augmentPersonaIdentityMessages(messages(custom)));
  });

  for (const response of [
    { illustrations: [{ actor_roster: [] }] },
    { illustrations: [{ actor_roster: [], camera: { modifiers: [{ id: "camera.view", options: ["pov"] }] } }] },
    { illustrations: [{ actor_roster: [{ actorId: "npc", candidateKey: "actor.g00nx3.1d3zc2v" }] }] },
    { generated_actor_proposals: [{ candidateKey: "free_1", label: "An unrelated courier" }], illustrations: [] },
  ]) test(`does not insert or relabel actors in analyzer responses: ${JSON.stringify(response)}`, async () => {
    const config = { provider: "fixture" }, options = { signal: new AbortController().signal };
    const expected = { raw: JSON.stringify(response), parsed: response, attempts: 1 };
    let calls = 0;
    const client: AnalyzerClientLike = { async complete(c, outbound, o) {
      calls++;
      expect(c).toBe(config);
      expect(o).toBe(options);
      const data = JSON.parse(outbound[1]!.content as string);
      expect(data.response_contract.analysis_policy.actors.active_persona_identity.presence).toContain("does not require an Actor");
      return expected;
    } };
    expect(await withPersonaIdentity(client).complete(config, messages(payload("Arin leaves. Mira remains.")), options)).toBe(expected);
    expect(calls).toBe(1);
  });
});
