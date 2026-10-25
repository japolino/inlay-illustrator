import { afterEach, expect, test } from "bun:test";
import { setEngineEnv } from "../../engine/index.js";
import { seededEnv } from "../../engine/testing/env.js";
import type { LlmCompleteRequest } from "../services/types.js";
import { createEmptyChatData } from "../../shared/contract/index.js";
import { createPipelineModule } from "./index.js";
import { CHAT_ID, PERSONA_ID, finished, waitFor } from "./testing/fixtures.js";
import { personaFormFixture } from "./testing/persona-form-fixture.js";
import contextFixture from "../../engine/__fixtures__/v5/inputs.json";
import type { AnalyzerContextInputs, IdentityCandidate } from "../../engine/context/index.js";
import { applyPersonaFormSelection } from "./persona-form-selection.js";

type Payload = { scene: string; active_persona_candidate_key: string; actor_candidates: Array<{ candidateKey: string; forms: Array<{ formRef?: string; appearance?: string }> }>; appearance_catalog: Array<{ candidateKey: string; forms: Array<{ formRef?: string; appearance?: string; outfits: string[] }> }> };
function payload(request: LlmCompleteRequest): Payload {
  const content = request.messages.at(-1)!.content;
  const text = typeof content === "string" ? content : content.filter((p) => p.type === "text").map((p) => p.text).join("");
  return JSON.parse(text.slice(text.indexOf("{")));
}
function reply(request: LlmCompleteRequest, options: { formRef?: string; outfit?: string; absent?: boolean; pov?: boolean } = {}) {
  const p = payload(request);
  const slot = Number(/<slot_number: (\d+)>/u.exec(p.scene)![1]);
  return JSON.stringify({ illustrations: [{
    slot_number: slot,
    actor_roster: options.absent ? [] : [{ actorId: "a1", candidateKey: p.active_persona_candidate_key, ...(options.formRef ? { formRef: options.formRef } : {}), ...(options.outfit ? { outfit: { id: options.outfit } } : {}) }],
    interaction: { items: [], modifiers: [], instructions: [] },
    frame_placement: { sizeId: 2, items: options.absent ? [] : [{ actorId: "a1", center: { x: .5, y: .5 } }], modifiers: [{ id: "scene.rating", options: ["sfw"] }], freeTags: ["school gate"], instruction: "" },
    actor_detail: options.absent ? [] : [{ actorId: "a1", placementIndex: 0, actions: [], modifiers: [], freeTags: [], poseInstruction: "standing", actionInstruction: "", objectInstruction: "" }],
    camera: { modifiers: options.pov ? [{ id: "camera.view", options: ["pov"] }] : [], instruction: "" },
  }] });
}
const disposers: Array<() => void> = [];
test("locking one persona preserves group actors, other personas, callbacks and original inputs", () => {
  const c = structuredClone(contextFixture.context);
  const persona = c.personaCandidates[0]! as IdentityCandidate;
  const wolf = { ...persona.appearanceForms[0]!, formId: "form_wolf", label: "Wolf omega" };
  const active = { ...persona, appearanceForms: [...persona.appearanceForms, wolf] };
  const other = { ...active, key: "persona::other" };
  const callback = () => null;
  const inputs = {
    analyzerIdentityCandidates: c.actorCandidates,
    analyzerPersonaCandidates: [active, other], v5PersonaCatalogCandidates: [active, other],
    analyzerOutfitCandidates: c.outfitCandidates, v5OutfitCatalogCandidates: c.v5OutfitCatalogCandidates,
    analyzerPersonaPromptKey: persona.key, analyzerPersonaDefaultOutfitId: "old",
    visualContinuity: c.visualContinuity, promptInputs: callback, references: callback,
  } as unknown as AnalyzerContextInputs;
  const before = JSON.stringify(inputs);
  const result = applyPersonaFormSelection(inputs, "p1", "form_wolf");
  expect(result.analyzerIdentityCandidates).toBe(inputs.analyzerIdentityCandidates);
  expect(result.analyzerPersonaCandidates[1]).toBe(other);
  expect(result.v5PersonaCatalogCandidates[1]).toBe(other);
  expect(result.analyzerPersonaCandidates[0]!.appearanceForms).toEqual([wolf]);
  expect(result.visualContinuity).toBe(inputs.visualContinuity);
  expect(result.promptInputs).toBe(inputs.promptInputs); expect(result.references).toBe(inputs.references);
  expect(JSON.stringify(inputs)).toBe(before);
});
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); setEngineEnv(null); });
function setup(formId: string | null = "form_wolf") {
  setEngineEnv(seededEnv(37));
  const fx = personaFormFixture();
  if (formId) fx.chatData.set(CHAT_ID, { ...createEmptyChatData(CHAT_ID), personaFormSelections: { [PERSONA_ID]: formId } });
  const { pipeline } = createPipelineModule(fx.services);
  disposers.push(() => pipeline.dispose());
  const run = async (options: Parameters<typeof reply>[1] = {}) => {
    fx.llmReplies.push((r: LlmCompleteRequest) => reply(r, options));
    const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0, attemptKind: "reroll" });
    await waitFor(() => finished(fx, jobId).length > 0, 20000);
    expect(finished(fx, jobId)[0]!.error).toBeUndefined();
    expect(finished(fx, jobId)[0]!.result).toBe("completed");
    return fx.imageRequests.at(-1)!;
  };
  return { fx, pipeline, run };
}
test("manual Wolf sends only that form/outfits and compiles its real physical traits", async () => {
  const { fx, run } = setup();
  const request = await run();
  const p = payload(fx.llmRequests[0]!);
  expect(p.actor_candidates[0]!.forms.map((f) => f.formRef ?? f.appearance)).toEqual(["Wolf_omega"]);
  expect(p.appearance_catalog[0]!.forms).toHaveLength(1);
  expect([...p.appearance_catalog[0]!.forms[0]!.outfits].sort()).toEqual(["Costume", "Wolf clothes"]);
  const prompt = request.novelai!.characters![0]!.prompt;
  expect(prompt).toContain("wolf ears"); expect(prompt).toContain("wolf tail"); expect(prompt).toContain("red cloak");
  expect(prompt).not.toContain("brown hair"); expect(prompt).not.toContain("blue shirt");
  expect(fx.chatData.get(CHAT_ID)!.personaFormSelections).toEqual({ [PERSONA_ID]: "form_wolf" });
});
test("a costume from the chosen form remains selectable", async () => {
  const { run } = setup();
  const request = await run({ outfit: "Costume" });
  expect(request.novelai!.characters![0]!.prompt).toContain("green jacket");
  expect(request.novelai!.characters![0]!.prompt).toContain("wolf ears");
  expect(request.novelai!.characters![0]!.prompt).not.toContain("red cloak");
});
test("the outfit layer uses the selected form's garments when both forms share an outfit name", async () => {
  const { fx, run } = setup();
  const forms = fx.config.value.characterPrompt.personaSettings.profiles[PERSONA_ID]!.forms as {
    forms: Array<{ id: string; outfits: Array<{ label: string; legs?: string; feet?: string }> }>;
  };
  Object.assign(forms.forms.find((f) => f.id === "form_default")!.outfits[0]!, { label: "Shared uniform", legs: "white socks", feet: "brown loafers" });
  Object.assign(forms.forms.find((f) => f.id === "form_wolf")!.outfits[0]!, { label: "Shared uniform", legs: "black stockings", feet: "black boots" });
  const request = await run({ outfit: "Shared uniform" });
  const p = payload(fx.llmRequests[0]!) as unknown as {
    active_persona_candidate_key: string;
    appearance_catalog: Array<{ candidateKey: string; forms: Array<{ outfit_parts: Record<string, Record<string, string>> }> }>;
  };
  const selected = p.appearance_catalog.find((c) => c.candidateKey === p.active_persona_candidate_key)!;
  expect(selected.forms).toHaveLength(1);
  expect(selected.forms[0]!.outfit_parts["Shared uniform"]).toEqual({ top: "red cloak", bottom: "black trousers", legs: "black stockings", feet: "black boots" });
  const prompt = request.novelai!.characters![0]!.prompt;
  expect(prompt).toContain("wolf ears"); expect(prompt).toContain("red cloak");
  for (const regular of ["blue shirt", "white socks", "brown loafers"]) expect(prompt).not.toContain(regular);
});
test("regular-form outfit requests cannot bleed into the locked Wolf form", async () => {
  const { run } = setup();
  const request = await run({ outfit: "Casual" });
  expect(request.novelai!.characters![0]!.prompt).toContain("wolf ears");
  expect(request.novelai!.characters![0]!.prompt).not.toContain("blue shirt");
});
test("a hallucinated regular form cannot override the explicit lock", async () => {
  const { run } = setup();
  const request = await run({ formRef: "Regular" });
  expect(request.novelai!.characters![0]!.prompt).toContain("wolf ears");
  expect(request.novelai!.characters![0]!.prompt).not.toContain("brown hair");
});
test("a manual Regular choice overrides a different global default", async () => {
  const { fx, run } = setup("form_default");
  (fx.config.value.characterPrompt.personaSettings.profiles[PERSONA_ID]!.forms as { defaultFormId: string }).defaultFormId = "form_wolf";
  const request = await run();
  expect(request.novelai!.characters![0]!.prompt).toContain("brown hair");
  expect(request.novelai!.characters![0]!.prompt).not.toContain("wolf ears");
});
test("changing selection supersedes old regular-form continuity; Auto restores both candidates", async () => {
  const { fx, run } = setup(null);
  expect((await run()).novelai!.characters![0]!.prompt).toContain("brown hair");
  await fx.services.storage.updateChatData(CHAT_ID, (d) => ({ ...d, personaFormSelections: { [PERSONA_ID]: "form_wolf" } }));
  expect((await run()).novelai!.characters![0]!.prompt).toContain("wolf ears");
  await fx.services.storage.updateChatData(CHAT_ID, (d) => { delete d.personaFormSelections; return d; });
  await run();
  expect(payload(fx.llmRequests.at(-1)!).actor_candidates[0]!.forms).toHaveLength(2);
});
test("an unavailable saved form stops generation instead of silently using Regular", async () => {
  const { fx, pipeline } = setup("form_deleted");
  const { jobId } = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
  await waitFor(() => finished(fx, jobId).length > 0);
  expect(finished(fx, jobId)[0]!.error!.message).toContain("selected persona form is unavailable");
  expect(fx.imageRequests).toHaveLength(0); expect(fx.llmRequests).toHaveLength(0);
});
for (const situation of ["actorless", "departed", "POV without visible body"]) {
  test(`selection does not add an absent persona: ${situation}`, async () => {
    const { fx, run } = setup();
    fx.setMessages([{ id: "u1", content: "I left the courtyard.", is_user: true }, { id: "m1", content: "The empty school gate is seen from the road.\n\nWind blows through the trees.\n\nClouds drift overhead." }]);
    const request = await run({ absent: true, pov: situation.startsWith("POV") });
    expect(request.novelai?.characters ?? []).toHaveLength(0);
    expect(JSON.stringify(request)).not.toContain("wolf ears");
  });
}
test("image-only regeneration preserves the saved prompt after a later form change", async () => {
  const { fx, pipeline, run } = setup(null);
  const original = await run();
  const doc = fx.chatData.get(CHAT_ID)!;
  const slot = Object.values(doc.history.slotsById)[0]!;
  await fx.services.storage.updateChatData(CHAT_ID, (d) => ({ ...d, personaFormSelections: { [PERSONA_ID]: "form_wolf" } }));
  const { jobId } = await pipeline.regenerateSlot({ chatId: CHAT_ID, messageKey: slot.messageKey, slotId: slot.slotId });
  await waitFor(() => finished(fx, jobId).length > 0, 20000);
  expect(finished(fx, jobId)[0]!.error).toBeUndefined();
  expect(fx.imageRequests.at(-1)!.novelai!.characters![0]!.prompt).toBe(original.novelai!.characters![0]!.prompt);
  expect(fx.llmRequests).toHaveLength(1);
});
test("retry after a form change invalidates the old analyzer checkpoint", async () => {
  const { fx, pipeline } = setup(null);
  fx.imageReplies.push(new Error("synthetic image failure"));
  fx.llmReplies.push((r: LlmCompleteRequest) => reply(r));
  const first = await pipeline.start({ chatId: CHAT_ID, messageId: "m1", swipeIndex: 0 });
  await waitFor(() => finished(fx, first.jobId).length > 0, 20000);
  expect(finished(fx, first.jobId)[0]!.result).toBe("failed");
  await fx.services.storage.updateChatData(CHAT_ID, (d) => ({ ...d, personaFormSelections: { [PERSONA_ID]: "form_wolf" } }));
  fx.llmReplies.push((r: LlmCompleteRequest) => reply(r));
  const retry = await pipeline.retry(first.jobId);
  await waitFor(() => finished(fx, retry.jobId).length > 0, 20000);
  expect(finished(fx, retry.jobId)[0]!.error).toBeUndefined();
  expect(fx.llmRequests).toHaveLength(2);
  expect(fx.imageRequests.at(-1)!.novelai!.characters![0]!.prompt).toContain("wolf ears");
});
