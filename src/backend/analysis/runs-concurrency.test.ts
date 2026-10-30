import { describe, expect, test } from "bun:test";
import { formCollectionRevision } from "../../shared/contract/index.js";
import type { LlmCompleteRequest, LlmCompleteResult } from "../services/types.js";
import { AnalysisJobs } from "./jobs.js";
import { runAnalysis } from "./runs.js";
import { currentForms, saveForms, setRosterRegistered } from "./workspace.js";
import { ALICE, CHAR, NAI_PNG, asset, createAnalysisFixture } from "./testing/fixtures.js";
import { coreHandlers } from "../rpc/handlers/core.js";
import { TINY_PNG_BASE64 } from "../testing/fake-host.js";
import { buildAmConfig, loadAmConfigParts, persistAmConfigChange } from "./bridge/config-store.js";

const userJson = (r: LlmCompleteRequest) => {
  const user = r.messages.find((m) => m.role === "user")!;
  const text = typeof user.content === "string" ? user.content : (user.content.find((p) => p.type === "text") as { text: string }).text;
  return JSON.parse(text);
};

const resolveAllToDefault = (r: LlmCompleteRequest) => {
  const body = userJson(r);
  return {
    owners: body.owners.map((o: { owner_ref: string; existing_forms: { existing_form_ref: string }[]; observations: { observation_id: string }[] }) => ({
      owner_ref: o.owner_ref,
      assignments: o.observations.map((obs) => ({ observation_id: obs.observation_id, kind: "existing_form", existing_form_ref: o.existing_forms[0]!.existing_form_ref })),
      new_forms: [],
    })),
  };
};

const analyzeReply = (r: LlmCompleteRequest) => {
  const body = userJson(r);
  return {
    characters: [{
      analysis_id: body.characters[0].analysis_id, prompt_key: ALICE, analysis_profile: "asset",
      observations: [{
        observation_id: "o1", evidence_refs: ["alice_smile.png"], suggested_label: "", gender: "female",
        identity_groups: { "hair.color": ["red hair"] },
        negative_prompt: "", warnings: [],
        outfits: [],
      }],
    }],
  };
};

/** LLM fake whose handlers may be async (to hold a call open while the test edits the workspace). */
function scriptedLlm(handlers: Array<(r: LlmCompleteRequest, signal?: AbortSignal) => unknown>) {
  const requests: LlmCompleteRequest[] = [];
  return {
    requests,
    llm: {
      async complete(request: LlmCompleteRequest, opts?: { signal?: AbortSignal }): Promise<LlmCompleteResult> {
        requests.push(request);
        const handler = handlers.shift();
        const value = handler ? await handler(request, opts?.signal) : {};
        return { raw: JSON.stringify(value), parsed: value, connectionId: "fake", model: "fake", attempts: 1, usage: {}, finishReason: "stop", jsonMode: true, imagesDropped: false, latencyMs: 0 } as LlmCompleteResult;
      },
    },
  };
}

const FORMS = {
  defaultFormId: "form_default",
  forms: [{
    id: "form_default", label: "기본", description: "", humanlike: true, gender: "female", basePromptGroups: {}, negativePrompt: "", reference: null,
    defaultOutfitId: "outfit_default", outfits: [{ id: "outfit_default", label: "기본 의상", description: "", candidateEnabled: true, head: "", top: "", bottom: "", legs: "", feet: "" }],
  }],
};

async function setup(overrides: Parameters<typeof createAnalysisFixture>[0] = {}, withForms = false) {
  const fx = createAnalysisFixture(overrides);
  await setRosterRegistered(fx.services, CHAR, [{ memberKey: CHAR, selectionId: "wb1:e1" }], true);
  await fx.services.storage.updateCharacterDocument(CHAR, (d) => ({
    ...d,
    characterPrompt: {
      ...d.characterPrompt,
      ...(withForms ? { characterForms: { [ALICE]: FORMS } } : {}),
      assetSelections: { [ALICE]: { selectedAssetNames: ["alice_smile.png"], selectedAssets: [{ name: "alice_smile.png", key: "img-alice_smile.png", ext: "png", sourceType: "character" }] } },
    } as never,
  }));
  return fx;
}

describe("analysis runs: cancel and concurrent edits", () => {
  test("a cancel sent while the session opens stops the run before any LLM call or write", async () => {
    // A) character-prompts: AM controllers only cancel a run they already started.
    const fx = await setup();
    fx.llmReplies.push(analyzeReply, resolveAllToDefault);
    const jobs = new AnalysisJobs(fx.services);
    const started = jobs.start("character-prompts", CHAR, (ctx) => runAnalysis(ctx, { kind: "character-prompts", characterId: CHAR, evidenceMode: "image" }));
    // The user presses Cancel right away (the job is still loading its session: storage / source / supportsVision).
    expect(jobs.cancel({ jobId: started.jobId })).toBe(1);
    const outcome = await started.done;
    const prompts = { status: outcome.status, llmCalls: fx.llmRequests.length, written: !!fx.documents.get(CHAR)!.characterPrompt.characterForms[ALICE] };

    // B) reclassification: the abort happened before the listener was added.
    const fx2 = createAnalysisFixture();
    await fx2.services.storage.updateCharacterDocument(CHAR, (d) => ({ ...d, characterPrompt: { ...d.characterPrompt, characterForms: { [ALICE]: { ...FORMS, forms: [{ ...FORMS.forms[0]!, basePromptGroups: { "hair.color": ["red hair", "sailor shirt"] } }] } } as never } }));
    fx2.llmReplies.push((r: LlmCompleteRequest) => {
      const body = JSON.parse(r.messages[1]!.content as string);
      const part = body.partitions[0];
      const top = part.targets.find((t: { kind: string; field: string }) => t.kind === "new-outfit" && t.field === "top").targetRef;
      const hair = part.targets.find((t: { kind: string; field: string }) => t.kind === "base" && t.field === "hair.color").targetRef;
      return { partitions: [{ partitionRef: part.partitionRef, assignments: [{ fragmentId: "f0", targetRef: hair, confidence: "high", reason: "hair" }, { fragmentId: "f1", targetRef: top, confidence: "high", reason: "clothing" }], newOutfit: { sourceFragmentIds: ["f1"], name: "Sailor Uniform" } }] };
    });
    const jobs2 = new AnalysisJobs(fx2.services);
    const started2 = jobs2.start("reclassification", CHAR, (ctx) => runAnalysis(ctx, { kind: "reclassification", characterId: CHAR, promptKeys: [ALICE] }));
    jobs2.cancel({ jobId: started2.jobId });
    const outcome2 = await started2.done;
    const reclass = { status: outcome2.status, llmCalls: fx2.llmRequests.length, written: fx2.documents.get(CHAR)!.characterPrompt.characterForms[ALICE]!.forms[0]!.outfits.length > 1 };

    expect({ prompts, reclass }).toEqual({ prompts: { status: "cancelled", llmCalls: 0, written: false }, reclass: { status: "cancelled", llmCalls: 0, written: false } });
  });

  test("forms edited (prompts.saveForms) while a prompt analysis runs keep the user edit (three-way merge)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let formResolutionStarted!: () => void;
    const atFormResolution = new Promise<void>((r) => (formResolutionStarted = r));
    const llm = scriptedLlm([
      analyzeReply,
      async (r) => {
        formResolutionStarted();
        await gate;
        return resolveAllToDefault(r);
      },
    ]);
    const fx = await setup({ llm: llm.llm }, true);
    const jobs = new AnalysisJobs(fx.services);
    const started = jobs.start("character-prompts", CHAR, (ctx) => runAnalysis(ctx, { kind: "character-prompts", characterId: CHAR, evidenceMode: "image" }));
    await atFormResolution;
    // The user renames the form in the Prompts tab while the analysis waits for the model (non-conflicting edit).
    const doc = fx.documents.get(CHAR)!;
    const base = currentForms(doc, ALICE);
    await saveForms(fx.services, CHAR, ALICE, { ...base, forms: base.forms.map((f) => ({ ...f, label: "User label" })) } as never, formCollectionRevision(base));
    expect(fx.documents.get(CHAR)!.characterPrompt.characterForms[ALICE]!.forms[0]!.label).toBe("User label");
    release();
    const outcome = await started.done;
    expect(outcome.status).toBe("success");
    const form = fx.documents.get(CHAR)!.characterPrompt.characterForms[ALICE]!.forms[0]!;
    expect(form.basePromptGroups["hair.color"]).toEqual(["red hair"]); // analysis result applied
    // AM merges the analysis into the live forms (qwt -> qv three-way merge); the run writes its change over the stored value.
    expect(form.label).toBe("User label");
  });

  test("artists added while an artist extraction runs survive the run's write", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let inCall!: () => void;
    const calling = new Promise<void>((r) => (inCall = r));
    const llm = scriptedLlm([
      async () => {
        inCall();
        await gate;
        return { title: "Foo style", prompt: "artist:foo", negative_prompt: "" };
      },
    ]);
    const fx = createAnalysisFixture({ llm: llm.llm, imageBytes: { getAsset: async () => ({ data: NAI_PNG, mimeType: "image/png" }) } });
    const jobs = new AnalysisJobs(fx.services);
    const started = jobs.start("artist-extraction", CHAR, (ctx) => runAnalysis(ctx, { kind: "artist-extraction", characterId: CHAR, asset: asset("alice_smile.png") }));
    await calling;
    // Meanwhile the user adds an artist in the Artists tab (RPC artists.upsertNovelAI -> storage.updateConfig).
    await coreHandlers["artists.upsertNovelAI"]!({ entry: { title: "User artist", prompt: "artist:bar" } } as never, { ...fx.services, modules: {} } as never);
    expect(fx.config.value.characterPrompt.artistPrompts.some((a) => a.title === "User artist")).toBe(true);
    release();
    const outcome = await started.done;
    expect(outcome.status).toBe("success");
    const titles = fx.config.value.characterPrompt.artistPrompts.map((a) => a.title);
    expect(titles).toContain("Foo style");
    expect(titles).toContain("User artist");
  });

  test("another user's text-only connection analysing meanwhile does not switch off image analysis for a vision-capable run", async () => {
    let atMetadata!: () => void;
    const readingMetadata = new Promise<void>((r) => (atMetadata = r));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // B (vision-capable connection) pauses while reading image metadata; there is none, so it falls back to the image.
    const b = await setup({
      userId: "user-b",
      imageBytes: {
        async getAsset() {
          atMetadata();
          await gate;
          return { data: TINY_PNG_BASE64, mimeType: "image/png" };
        },
      },
    });
    b.llmReplies.push(analyzeReply, resolveAllToDefault);
    const runB = new AnalysisJobs(b.services).start("character-prompts", CHAR, (ctx) => runAnalysis(ctx, { kind: "character-prompts", characterId: CHAR, evidenceMode: "metadata" }));
    await readingMetadata;
    // A (another user, text-only connection) runs a whole image analysis meanwhile.
    const a = await setup({ userId: "user-a" });
    a.visionSupported.value = false;
    await new AnalysisJobs(a.services).start("character-prompts", CHAR, (ctx) => runAnalysis(ctx, { kind: "character-prompts", characterId: CHAR, evidenceMode: "image" })).done;
    release();
    const sentImage = (r: LlmCompleteRequest) => r.messages.some((m) => typeof m.content !== "string" && m.content.some((p) => p.type === "image"));
    expect({ status: (await runB.done).status, sentImage: b.llmRequests.some(sentImage) }).toEqual({ status: "success", sentImage: true });
  });

  test("a run's persona profile write keeps other personas' profiles saved meanwhile", async () => {
    const fx = createAnalysisFixture();
    const before = buildAmConfig(await loadAmConfigParts(fx.services, CHAR));
    const after = structuredClone(before);
    after.characterPrompt.personaSettings.profiles = { ...after.characterPrompt.personaSettings.profiles, p1: { mainPrompt: "from the run" } };
    // Another persona is saved (personas.saveForms) while the run is still working on its snapshot.
    await fx.services.storage.updateConfig((c) => ({
      ...c,
      characterPrompt: { ...c.characterPrompt, personaSettings: { ...c.characterPrompt.personaSettings, profiles: { ...c.characterPrompt.personaSettings.profiles, p2: { mainPrompt: "user" } as never } } },
    }));
    await persistAmConfigChange(fx.services, CHAR, before, after);
    const profiles = (await fx.services.storage.loadConfig()).characterPrompt.personaSettings.profiles as Record<string, { mainPrompt?: string }>;
    expect(profiles.p1?.mainPrompt).toBe("from the run");
    expect(profiles.p2?.mainPrompt).toBe("user");
  });
});
