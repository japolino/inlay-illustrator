// Inlay form layer: a registered character whose body lastingly changes in the story gets a new appearance form.
// The end to end tests run the REAL engine: the first analyzer reply declares the change, the run stops before any
// image, the form is saved on its owner and the second analysis selects it.
import { afterEach, describe, expect, test } from "bun:test";
import { setEngineEnv } from "../../engine/index.js";
import { seededEnv } from "../../engine/testing/env.js";
import { normalizeFormCollection, normalizePersonaSettings, resolvePersonaForms, type Form } from "../../shared/contract/index.js";
import type { AnalyzerClientLike, LlmCompleteRequest } from "../services/types.js";
import { createPipelineModule } from "./index.js";
import {
  addProposedForm,
  applyFormPolicy,
  createdFormsNote,
  FORM_CHANGE_POLICY,
  FormWatchRegistry,
  MAX_FORMS_PER_OWNER,
  readFormProposals,
  withFormAwareness,
  type FormProposal,
  type RunFormOwner,
  type RunFormWatch,
} from "./form-awareness.js";
import { saveProposedForms } from "./form-save.js";
import { CHARACTER_ID, CHAT_ID, createPipelineFixture, finished, PERSONA_ID, waitFor } from "./testing/fixtures.js";

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

afterEach(() => setEngineEnv(null));

const SHEEP = {
  formLabel: "anthro sheep, curled black horns",
  humanlike: false,
  sex: "male",
  basePromptGroups: { "nonhuman.features": ["sheep ears", "curled horns", "white wool"], "eyes.color": ["yellow eyes"] },
  defaultOutfit: { name: "Black Corset Coat", head: "", top: "black corset coat", bottom: "black trousers", legs: "", feet: "black boots" },
  evidence: "his body reshaped itself for good into a horned sheep-man",
};

const owner = (candidateKey: string, identityKey: string, forms: RunFormOwner["forms"] = [{ formId: "form_default", formRef: "black_hair", label: "black hair" }]): RunFormOwner => ({ candidateKey, identityKey, forms });
const watchOf = (owners: RunFormOwner[], extra: Partial<RunFormWatch> = {}): RunFormWatch => ({
  owners: new Map(owners.map((o) => [o.candidateKey.toLowerCase(), o])),
  created: [],
  allowProposals: true,
  proposals: [],
  rejected: [],
  stopped: false,
  stop: () => undefined,
  ...extra,
});
const decidingPayload = (keys: string[], stage?: string): Any => ({
  ...(stage ? { analysis_stage: stage } : {}),
  actor_candidates: keys.map((candidateKey) => ({ candidateKey, forms: [{ appearance: "black_hair" }] })),
  response_contract: { root: { itemFields: stage === "detail" ? ["illustrations", "conflict"] : ["generated_actor_proposals", "illustrations"] }, analysis_policy: { actors: { include: "visibly_present_actors" } } },
});

describe("form rule in the analyzer request", () => {
  test("a deciding request gets the rule and the root field; the detail step and other runs' requests do not", async () => {
    const watch = watchOf([owner("actor.a", "char-a")]);
    const payload = decidingPayload(["actor.a"]);
    expect(applyFormPolicy(payload, watch)).toBe(true);
    expect(payload.response_contract.analysis_policy.actors.form_changes).toBe(FORM_CHANGE_POLICY);
    expect(payload.response_contract.root.itemFields[0]).toBe("form_proposals");
    expect(payload.response_contract.root.form_proposals.itemFields).toContain("copyFrom");

    const registry = new FormWatchRegistry();
    registry.register(watch);
    const sent: Any[] = [];
    const client: AnalyzerClientLike = {
      async complete(_config, messages) {
        sent.push(JSON.parse(messages[messages.length - 1]!.content as string));
        return { raw: "{}", parsed: { illustrations: [] } } as never;
      },
    };
    const wrapped = withFormAwareness(client, registry);
    const ask = (p: Any) => wrapped.complete({} as never, [{ role: "user", content: JSON.stringify(p) }] as never, undefined as never);
    await ask(decidingPayload(["actor.a"], "initial"));
    await ask(decidingPayload(["actor.a"], "detail"));
    await ask(decidingPayload(["actor.other"]));
    expect(sent.map((p) => !!p.response_contract.analysis_policy.actors.form_changes)).toEqual([true, false, false]);
  });

  test("after a restart the request names the created form and no longer asks for proposals", () => {
    const forms = [
      { formId: "form_default", formRef: "black_hair", label: "black hair" },
      { formId: "anthro_sheep", formRef: "anthro_sheep,_curled_black_horns", label: SHEEP.formLabel },
    ];
    const watch = watchOf([owner("actor.a", "char-a", forms)], { allowProposals: false, created: [{ candidateKey: "actor.a", label: SHEEP.formLabel }] });
    expect(createdFormsNote(watch)).toContain('actor.a: formRef "anthro_sheep,_curled_black_horns"');
    const payload = decidingPayload(["actor.a"]);
    expect(applyFormPolicy(payload, watch)).toBe(true);
    expect(payload.response_contract.analysis_policy.actors.form_changes).toBeUndefined();
    expect(payload.response_contract.analysis_policy.actors.created_forms).toContain("anthro_sheep,_curled_black_horns");
    expect(payload.response_contract.root.itemFields).not.toContain("form_proposals");
  });
});

describe("form proposals in the reply", () => {
  const watch = watchOf([owner("actor.a", "char-a"), owner("actor.b", "char-b", [{ formId: "form_default", formRef: "silver_hair", label: "silver hair" }])]);

  test("usable proposals are read; unknown owners, generic labels, empty bodies and duplicates are refused with a reason", () => {
    const rejected: string[] = [];
    const proposals = readFormProposals(
      {
        form_proposals: [
          { candidateKey: "ACTOR.A", ...SHEEP },
          { candidateKey: "actor.a", ...SHEEP, formLabel: "second" },
          { candidateKey: "actor.zzz", ...SHEEP },
          { candidateKey: "actor.b", ...SHEEP, formLabel: "Form 2" },
          { candidateKey: "actor.b", formLabel: "empty body", basePromptGroups: {} },
        ],
      },
      watch,
      rejected,
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ candidateKey: "actor.a", label: SHEEP.formLabel, humanlike: false, sex: "male", defaultOutfit: { name: "Black Corset Coat", top: "black corset coat", feet: "black boots" } });
    expect(proposals[0]!.defaultOutfit).not.toHaveProperty("head");
    expect(rejected).toHaveLength(4);
    expect(rejected.join("\n")).toMatch(/second proposal[\s\S]*not a registered character[\s\S]*no usable form label[\s\S]*neither body tags nor a character to copy/u);
  });

  test("copyFrom needs another registered character; it may stand in for the body tags", () => {
    const rejected: string[] = [];
    const [copy] = readFormProposals({ form_proposals: [{ candidateKey: "actor.a", formLabel: "body of the silver-haired girl", copyFrom: { candidateKey: "actor.b", formRef: "silver_hair" } }] }, watch, rejected);
    expect(copy).toMatchObject({ candidateKey: "actor.a", copyFrom: { candidateKey: "actor.b", formRef: "silver_hair" }, basePromptGroups: {} });
    expect(readFormProposals({ form_proposals: [{ candidateKey: "actor.a", formLabel: "own copy", copyFrom: { candidateKey: "actor.a", formRef: "black_hair" } }] }, watch, rejected)).toEqual([]);
  });

  test("a reply with proposals stops the run; without permission the field is only removed", async () => {
    const reply = { form_proposals: [{ candidateKey: "actor.a", ...SHEEP }], illustrations: [] };
    const client: AnalyzerClientLike = { complete: async () => ({ raw: JSON.stringify(reply), parsed: structuredClone(reply) }) as never };
    const ask = (w: RunFormWatch) => {
      const registry = new FormWatchRegistry();
      registry.register(w);
      return withFormAwareness(client, registry).complete({} as never, [{ role: "user", content: JSON.stringify(decidingPayload(["actor.a", "actor.b"])) }] as never, undefined as never);
    };
    let stops = 0;
    const allowed = watchOf([...watch.owners.values()], { stop: () => void (stops += 1) });
    await expect(ask(allowed)).rejects.toMatchObject({ name: "AbortError" });
    expect([stops, allowed.stopped, allowed.proposals.map((p) => p.label)]).toEqual([1, true, [SHEEP.formLabel]]);

    const after = watchOf([...watch.owners.values()], { allowProposals: false, created: [{ candidateKey: "actor.a", label: "black hair" }], stop: () => void (stops += 1) });
    const result: Any = await ask(after);
    expect(result.parsed).toEqual({ illustrations: [] });
    expect(JSON.parse(result.raw)).toEqual({ illustrations: [] });
    expect([stops, after.stopped]).toEqual([1, false]);
  });
});

describe("the new form", () => {
  const proposal: FormProposal = { candidateKey: "actor.a", label: SHEEP.formLabel, humanlike: false, sex: "male", basePromptGroups: SHEEP.basePromptGroups, defaultOutfit: { name: "Black Corset Coat", top: "black corset coat" }, evidence: SHEEP.evidence };
  const base = normalizeFormCollection({ defaultFormId: "form_default", forms: [{ id: "form_default", label: "black hair", humanlike: true, gender: "male", basePromptGroups: { "hair.color": ["black hair"] } }] });

  test("is appended with its body tags and default outfit; the old form and the default stay", () => {
    const added = addProposedForm(base, proposal)!;
    expect(added.added).toBe(true);
    expect(added.collection.defaultFormId).toBe("form_default");
    expect(added.collection.forms.map((f) => f.label)).toEqual(["black hair", SHEEP.formLabel]);
    const form = added.collection.forms[1]!;
    expect(form).toMatchObject({ id: added.formId, humanlike: false, gender: "male" });
    expect(form.basePromptGroups["nonhuman.features"]).toEqual(["sheep ears", "curled horns", "white wool"]);
    expect(form.description).toContain(SHEEP.evidence);
    expect(form.outfits.find((o) => o.id === form.defaultOutfitId)).toMatchObject({ label: "Black Corset Coat", top: "black corset coat", candidateEnabled: true });
  });

  test("a form of the same label is reused, and an owner at the limit gets none", () => {
    const once = addProposedForm(base, proposal)!;
    const twice = addProposedForm(once.collection, { ...proposal, label: SHEEP.formLabel.toUpperCase() })!;
    expect([twice.added, twice.formId, twice.collection.forms.length]).toEqual([false, once.formId, 2]);
    let full = base;
    for (let i = 1; i < MAX_FORMS_PER_OWNER; i += 1) full = addProposedForm(full, { ...proposal, label: `beast body ${i}` })!.collection;
    expect(full.forms).toHaveLength(MAX_FORMS_PER_OWNER);
    expect(addProposedForm(full, proposal)).toBeNull();
  });

  test("copyFrom takes the other character's body, sex and default outfit unless the proposal gives its own", () => {
    const other = normalizeFormCollection({
      defaultFormId: "form_default",
      forms: [{ id: "form_default", label: "silver hair", humanlike: true, gender: "female", basePromptGroups: { "hair.color": ["silver hair"], "eyes.color": ["blue eyes"] }, negativePrompt: "freckles", outfits: [{ id: "o1", label: "Navy Sailor Uniform", top: "navy sailor uniform" }] }],
    }).forms[0] as Form;
    const copy = addProposedForm(base, { candidateKey: "actor.a", label: "body of Alice", humanlike: true, sex: "unknown", basePromptGroups: {}, copyFrom: { candidateKey: "actor.b", formRef: "silver_hair" }, evidence: "" }, other)!;
    const form = copy.collection.forms[1]!;
    expect(form).toMatchObject({ label: "body of Alice", gender: "female", negativePrompt: "freckles" });
    expect(form.basePromptGroups).toEqual(other.basePromptGroups);
    expect(form.outfits.find((o) => o.id === form.defaultOutfitId)).toMatchObject({ label: "Navy Sailor Uniform", top: "navy sailor uniform" });
  });
});

describe("saving the form on its owner", () => {
  test("a card character's form goes into the document that holds its prompt key", async () => {
    const fx = createPipelineFixture();
    const key = "lore-character-1";
    await fx.services.storage.updateCharacterDocument(CHARACTER_ID, (doc) => ({
      ...doc,
      characterPrompt: { ...doc.characterPrompt, characterForms: { ...doc.characterPrompt.characterForms, [key]: normalizeFormCollection({ forms: [{ id: "form_default", label: "black hair", gender: "male", basePromptGroups: { "hair.color": ["black hair"] } }] }) } },
    }));
    const owners = new Map([["actor.a", owner("actor.a", key)]]);
    const proposals = readFormProposals({ form_proposals: [{ candidateKey: "actor.a", ...SHEEP }] }, { owners });
    const { created, skipped } = await saveProposedForms(fx.services, { proposals, rejected: [], owners, documentOf: () => CHARACTER_ID, nameOf: () => "Ren" });
    expect(skipped).toEqual([]);
    expect(created).toEqual([{ candidateKey: "actor.a", label: SHEEP.formLabel, identityKey: key, ownerName: "Ren", added: true, persona: false }]);
    const saved = (await fx.services.storage.loadCharacterDocument(CHARACTER_ID)).characterPrompt.characterForms[key] as Any;
    expect(saved.forms.map((f: Any) => f.label)).toEqual(["black hair", SHEEP.formLabel]);
    expect(saved.defaultFormId).toBe("form_default");
  });
});

/** Scripted analyzer: the first request (with the form rule) declares the change; the next one selects the created form. */
function transformingAnalyzer(log: Any[]) {
  return (request: LlmCompleteRequest): string => {
    const last = request.messages[request.messages.length - 1]!;
    const text = typeof last.content === "string" ? last.content : last.content.map((p) => (p.type === "text" ? p.text : "")).join("");
    const json = JSON.parse(text.slice(text.indexOf("{")));
    const persona = json.active_persona_candidate_key as string;
    const forms = (json.actor_candidates as Any[]).find((c) => c.candidateKey === persona).forms as Any[];
    const policy = json.response_contract.analysis_policy.actors;
    log.push({ rule: !!policy.form_changes, note: policy.created_forms ?? "", forms: forms.map((f) => f.formRef ?? f.appearance) });
    log[log.length - 1].stage = json.analysis_stage ?? "single";
    if (policy.form_changes) return JSON.stringify({ form_proposals: [{ candidateKey: persona, ...SHEEP }], illustrations: [] });
    const slot = Number(/<slot_number: (\d+)>/u.exec(text)?.[1] ?? json.slot_context?.assigned_slots?.[0] ?? 0);
    const roster = [{ actorId: "actor_1", candidateKey: persona, ...(forms.length > 1 ? { formRef: forms[forms.length - 1].formRef } : {}) }];
    if (json.analysis_stage === "initial")
      return JSON.stringify({ illustrations: [{ slot_number: slot, actor_roster: roster, scene_intent: "He runs to the gate in his new body.", temporal_state: "Morning.", state_constraints: [], occurrences: [{ actorId: "actor_1", placementIndex: 0 }] }] });
    return JSON.stringify({
      illustrations: [
        {
          slot_number: slot,
          actor_roster: roster,
          interaction: { items: [], modifiers: [], instructions: [] },
          frame_placement: { sizeId: 2, modifiers: [{ id: "scene.rating", options: ["sfw"] }], freeTags: ["school gate"], instruction: "", items: [{ actorId: "actor_1", center: { x: 0.5, y: 0.5 } }] },
          actor_detail: [{ actorId: "actor_1", placementIndex: 0, actions: [], modifiers: [{ id: "expression.general", options: ["light_smile"] }], freeTags: [], poseInstruction: "", actionInstruction: "running", objectInstruction: "" }],
          camera: { modifiers: [], instruction: "" },
        },
      ],
    });
  };
}

const personaForms = async (fx: ReturnType<typeof createPipelineFixture>) => {
  const config = await fx.services.storage.loadConfig();
  return resolvePersonaForms(normalizePersonaSettings(config.characterPrompt.personaSettings), config.characterPrompt.personaGender, PERSONA_ID);
};

describe("end to end over the real engine", () => {
  const config = { image: { provider: "novelai", model: "nai-diffusion-5-full", connectionId: "img-1" }, novelai: { analysisProfile: "v5-hybrid" }, runtime: { generationAutoRetryCount: 0 } };

  test("a persona that turns into a beast gets the new form, and the image is drawn with it", async () => {
    setEngineEnv(seededEnv(9));
    const fx = createPipelineFixture({ config });
    const log: Any[] = [];
    const analyzer = transformingAnalyzer(log);
    fx.llmReplies.push(analyzer, analyzer);
    const { pipeline } = createPipelineModule(fx.services);
    await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
    await waitFor(() => finished(fx).length > 0, 20000);
    expect(finished(fx)[0]!.error).toBeUndefined();
    expect(finished(fx)[0]!.result).toBe("completed");

    // Two analyses: the first declared the change, the second saw the form and was told to use it.
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ rule: true, note: "" });
    expect(log[0].forms).toHaveLength(1);
    expect(log[1].rule).toBe(false);
    expect(log[1].forms).toHaveLength(2);
    expect(log[1].note).toContain(log[1].forms[1]);

    const forms = await personaForms(fx);
    expect(forms.forms.map((f) => f.label)).toEqual([forms.forms[0]!.label, SHEEP.formLabel]);
    expect(forms.defaultFormId).toBe(forms.forms[0]!.id);

    expect(fx.imageRequests.length).toBe(1);
    expect(JSON.stringify(fx.imageRequests[0])).toContain("sheep ears");
    // The saved image records the new form as the one the persona was drawn in.
    const records = Object.values((fx.json.get("chats/chat-1/pipeline.json") as Any).records) as Any[];
    expect(records.map((r) => r.actors.map((a: Any) => [a.identityKey, a.kind, a.selectedFormId]))).toEqual([[[`persona::${PERSONA_ID}`, "persona", forms.forms[1]!.id]]]);
    expect(fx.events.filter((e) => e.event === "notice").map((e) => (e.payload as Any).message)).toEqual([`New form for Shouta: ${SHEEP.formLabel}`]);
    pipeline.dispose();
  }, 30000);

  test("split analysis: the initial step declares the change, and the restarted run plans and details with the new form", async () => {
    setEngineEnv(seededEnv(9));
    const fx = createPipelineFixture({ config });
    const settings = await fx.services.storage.loadChatImageGenerationSettings();
    await fx.services.storage.saveChatImageGenerationSettings({ ...settings, analysisMode: "split", splitAnalysis: { totalCount: 1, batchSize: 1 } });
    const log: Any[] = [];
    const analyzer = transformingAnalyzer(log);
    fx.llmReplies.push(analyzer, analyzer, analyzer);
    const { pipeline } = createPipelineModule(fx.services);
    await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
    await waitFor(() => finished(fx).length > 0, 20000);
    expect(finished(fx)[0]!.error).toBeUndefined();
    expect(finished(fx)[0]!.result).toBe("completed");
    expect(log.map((l) => [l.stage, l.rule, l.forms.length])).toEqual([
      ["initial", true, 1],
      ["initial", false, 2],
      ["detail", false, 1],
    ]);
    // The detail step is shown only the form the plan selected: the new one.
    expect(log[2].forms).toEqual([log[1].forms[1]]);
    const forms = await personaForms(fx);
    expect(forms.forms.map((f) => f.label)).toEqual([forms.forms[0]!.label, SHEEP.formLabel]);
    expect(fx.imageRequests.length).toBe(1);
    expect(JSON.stringify(fx.imageRequests[0])).toContain("sheep ears");
    pipeline.dispose();
  }, 30000);

  test("with the switch off the request carries no form rule and nothing is added", async () => {
    setEngineEnv(seededEnv(9));
    const fx = createPipelineFixture({ config: { ...config, runtime: { ...config.runtime, formDetectionDisabled: true } } });
    const log: Any[] = [];
    fx.llmReplies.push(transformingAnalyzer(log));
    const { pipeline } = createPipelineModule(fx.services);
    await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
    await waitFor(() => finished(fx).length > 0, 20000);
    expect(finished(fx)[0]!.result).toBe("completed");
    expect(log).toEqual([{ rule: false, note: "", forms: log[0].forms, stage: "single" }]);
    expect((await personaForms(fx)).forms).toHaveLength(1);
    pipeline.dispose();
  }, 30000);
});
