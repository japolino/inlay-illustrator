import { describe, expect, test } from "bun:test";
import type { LlmCompleteRequest } from "../services/types.js";
import { inspectMetadata } from "./assets.js";
import { AnalysisJobs } from "./jobs.js";
import { runAnalysis } from "./runs.js";
import { setRosterRegistered } from "./workspace.js";
import { ALICE, CHAR, NAI_PNG, asset, createAnalysisFixture } from "./testing/fixtures.js";
import { readFileSync } from "node:fs";

const data = (f: string) => readFileSync(new URL(`./data/${f}`, import.meta.url), "utf8");

function fixture() {
  return createAnalysisFixture({ imageBytes: { getAsset: async () => ({ data: NAI_PNG, mimeType: "image/png" }) } });
}

describe("metadata + artist + matching (AM Int / Mvt / $vt / Uwt)", () => {
  test("inspectMetadata parses the NovelAI Comment chunk", async () => {
    const fx = fixture();
    const r = await inspectMetadata(fx.services, CHAR, asset("alice_smile.png"));
    expect(r.hasMetadata).toBe(true);
    expect(r.summary).toMatchObject({ prompt: "artist:foo, 1girl, red hair", uc: "lowres, bad anatomy", seed: "7", software: "NovelAI" });
  });

  test("artist extraction saves a global artist entry and selects it for the character", async () => {
    const fx = fixture();
    let system = "";
    fx.llmReplies.push((r: LlmCompleteRequest) => {
      system = r.messages[0]!.content as string;
      return { title: "Foo style", prompt: "artist:foo", negative_prompt: "" };
    });
    const jobs = new AnalysisJobs(fx.services);
    const out = await jobs.start("artist-extraction", CHAR, (ctx) => runAnalysis(ctx, { kind: "artist-extraction", characterId: CHAR, asset: asset("alice_smile.png") })).done;
    expect(out).toMatchObject({ status: "success", message: "Artist prompt extracted · Foo style", messageKo: "작가 프롬프트 추출 완료 · Foo style" });
    expect(system).toBe(data("analysis-prompt-artist-metadata-extraction.system.txt"));
    const entry = fx.config.value.characterPrompt.artistPrompts.find((a) => a.title === "Foo style")!;
    expect(entry).toMatchObject({ prompt: "artist:foo", sourceId: CHAR, sourceAssetName: "alice_smile.png" });
    const doc = fx.documents.get(CHAR)!;
    expect(doc.characterPrompt.selectedArtistId).toBe(entry.id);
    expect(doc.characterPrompt.artistExtractionAssetBySourceId[CHAR]?.name).toBe("alice_smile.png");
  });

  test("metadata check writes the per-character metadata cache", async () => {
    const fx = fixture();
    const jobs = new AnalysisJobs(fx.services);
    const out = await jobs.start("metadata-check", CHAR, (ctx) => runAnalysis(ctx, { kind: "metadata-check", characterId: CHAR })).done;
    expect(out).toMatchObject({ status: "success", message: "Metadata check complete · 4/4" });
    expect(fx.json.get(`characters/${CHAR}/metadata-cache.json`)).toEqual({ [CHAR]: { "img-alice_smile.png": true, "img-alice_angry.png": true, "img-bob_default.png": true, "img-scenery.png": true } });
  });

  test("asset matching stores identity profiles (lorebookImageFilters) from the alias reply", async () => {
    const fx = fixture();
    await setRosterRegistered(fx.services, CHAR, [{ memberKey: CHAR, selectionId: "wb1:e1" }], true);
    let system = "";
    fx.llmReplies.push((r: LlmCompleteRequest) => {
      system = r.messages[0]!.content as string;
      const body = JSON.parse(r.messages[1]!.content as string);
      return { lorebooks: body.lorebooks.map((l: { analysis_id: string }) => ({ analysis_id: l.analysis_id, identity_aliases: ["alice", "ally"], confidence: 0.9 })) };
    });
    const jobs = new AnalysisJobs(fx.services);
    const out = await jobs.start("asset-matching", CHAR, (ctx) => runAnalysis(ctx, { kind: "asset-matching", characterId: CHAR, force: true })).done;
    expect(out.status).toBe("success");
    expect(out.message).toMatch(/^Asset classification complete/);
    expect(system).toBe(data("analysis-prompt-lorebook-identity-aliases.system.txt"));
    const filter = fx.documents.get(CHAR)!.characterPrompt.lorebookImageFilters[CHAR]!;
    expect(filter.status).toBe("done");
    expect(filter.profiles.find((p) => p.promptKey === ALICE)?.identityAliases).toContain("ally");
  });

  test("reference analysis (AM Awt) runs on form references", async () => {
    const fx = fixture();
    await fx.services.storage.updateCharacterDocument(CHAR, (d) => ({
      ...d,
      characterPrompt: {
        ...d.characterPrompt,
        characterForms: { [ALICE]: { defaultFormId: "form_default", forms: [{ id: "form_default", label: "기본", description: "", humanlike: true, gender: "female", basePromptGroups: {}, negativePrompt: "", reference: { enabled: true, defaultAsset: { name: "alice_smile.png", key: "img-alice_smile.png", ext: "png" } }, defaultOutfitId: "outfit_default", outfits: [{ id: "outfit_default", label: "기본 의상", description: "", candidateEnabled: true, head: "", top: "", bottom: "", legs: "", feet: "" }] }] } },
      },
    }));
    await setRosterRegistered(fx.services, CHAR, [{ memberKey: CHAR, selectionId: "wb1:e1" }], true);
    fx.llmReplies.push((r: LlmCompleteRequest) => {
      const user = r.messages[1]!.content as { type: string; text?: string }[];
      const body = JSON.parse(user.find((p) => p.type === "text")!.text!);
      return {
        characters: body.characters.map((c: { analysis_id: string; prompt_key: string; analysis_profile: string }) => ({
          analysis_id: c.analysis_id, prompt_key: c.prompt_key, analysis_profile: c.analysis_profile, gender: "female",
          identity_groups: { "hair.color": ["red hair"], "hair.length": ["long hair"], "eyes.color": ["green eyes"], "body.breast_size": ["medium breasts"] }, suggested_label: "", outfits: [],
        })),
      };
    });
    const jobs = new AnalysisJobs(fx.services);
    const out = await jobs.start("references", CHAR, (ctx) => runAnalysis(ctx, { kind: "references", characterId: CHAR, evidenceMode: "image", promptKeys: [ALICE] })).done;
    expect(["success", "partial"]).toContain(out.status);
    expect(fx.documents.get(CHAR)!.characterPrompt.characterForms[ALICE]!.forms[0]!.basePromptGroups["hair.color"]).toEqual(["red hair"]);
  });
});

describe("persona analysis (AM bwt)", () => {
  test("text mode writes personaSettings.profiles[personaId].forms", async () => {
    const fx = fixture();
    fx.personas.push({ personaId: "p1", name: "Me", description: "A short man with black hair and blue eyes.", avatarImageId: null, isDefault: true, attachedWorldBookId: null, metadata: {} });
    fx.activePersonaId.value = "p1";
    fx.llmReplies.push(
      (r: LlmCompleteRequest) => {
        const user = r.messages[1]!.content;
        const text = typeof user === "string" ? user : (user.find((p) => p.type === "text") as { text: string }).text;
        const body = JSON.parse(text);
        return { characters: body.characters.map((c: { analysis_id: string; prompt_key: string; analysis_profile: string }) => ({ analysis_id: c.analysis_id, prompt_key: c.prompt_key, analysis_profile: c.analysis_profile, gender: "male", identity_groups: { "hair.color": ["black hair"], "eyes.color": ["blue eyes"], "hair.length": ["short hair"] }, outfits: [] })) };
      },
      (r: LlmCompleteRequest) => {
        const body = JSON.parse(typeof r.messages[1]!.content === "string" ? r.messages[1]!.content : "{}");
        return { owners: body.owners.map((o: { owner_ref: string; existing_forms: { existing_form_ref: string }[]; observations: { observation_id: string }[] }) => ({ owner_ref: o.owner_ref, assignments: o.observations.map((x) => ({ observation_id: x.observation_id, kind: "existing_form", existing_form_ref: o.existing_forms[0]!.existing_form_ref })), new_forms: [] })) };
      },
    );
    const jobs = new AnalysisJobs(fx.services);
    const out = await jobs.start("persona", CHAR, (ctx) => runAnalysis(ctx, { kind: "persona", characterId: CHAR, evidenceMode: "text", personaIds: ["p1"] })).done;
    expect(out.status).toBe("success");
    const forms = fx.config.value.characterPrompt.personaSettings.profiles.p1?.forms as { forms: { gender: string; basePromptGroups: Record<string, string[]> }[] };
    expect(forms.forms[0]!.gender).toBe("male");
    expect(forms.forms[0]!.basePromptGroups["hair.color"]).toEqual(["black hair"]);
  });
});

describe("reclassification (AM ope)", () => {
  test("moves clothing from base groups into a new outfit", async () => {
    const fx = fixture();
    await fx.services.storage.updateCharacterDocument(CHAR, (d) => ({ ...d, characterPrompt: { ...d.characterPrompt, characterForms: { [ALICE]: { defaultFormId: "form_default", forms: [{ id: "form_default", label: "기본", description: "", humanlike: true, gender: "female", basePromptGroups: { "hair.color": ["red hair", "sailor shirt"] }, negativePrompt: "", reference: null, defaultOutfitId: "outfit_default", outfits: [{ id: "outfit_default", label: "기본 의상", description: "", candidateEnabled: true, head: "", top: "", bottom: "", legs: "", feet: "" }] }] } } } }));
    let system = "";
    fx.llmReplies.push((r: LlmCompleteRequest) => {
      system = r.messages[0]!.content as string;
      const body = JSON.parse(r.messages[1]!.content as string);
      const part = body.partitions[0];
      const top = part.targets.find((t: { kind: string; field: string }) => t.kind === "new-outfit" && t.field === "top").targetRef;
      const hair = part.targets.find((t: { kind: string; field: string }) => t.kind === "base" && t.field === "hair.color").targetRef;
      return { partitions: [{ partitionRef: part.partitionRef, assignments: [{ fragmentId: "f0", targetRef: hair, confidence: "high", reason: "hair" }, { fragmentId: "f1", targetRef: top, confidence: "high", reason: "clothing" }], newOutfit: { sourceFragmentIds: ["f1"], name: "Sailor Uniform" } }] };
    });
    const jobs = new AnalysisJobs(fx.services);
    const out = await jobs.start("reclassification", CHAR, (ctx) => runAnalysis(ctx, { kind: "reclassification", characterId: CHAR, promptKeys: [ALICE] })).done;
    expect(out).toMatchObject({ status: "success", message: "AI reclassification complete · 1/1" });
    expect(system).toBe(data("analysis-prompt-prompt-reclassification-batch.system.txt"));
    const form = fx.documents.get(CHAR)!.characterPrompt.characterForms[ALICE]!.forms[0]!;
    expect(form.basePromptGroups["hair.color"]).toEqual(["red hair"]);
    expect(form.outfits.some((o) => o.top === "sailor shirt" && o.label === "Sailor Uniform")).toBe(true);
  });
});

describe("charx regex analysis (AM Owt)", () => {
  test("card regex scripts -> AI detectors stored; manual detectors validated", async () => {
    const fx = fixture();
    fx.characters[0]!.extensions = { regex_scripts: [{ scriptName: "img", findRegex: "/<img=(.+?)>/g", replaceString: "{{img::$1}}", placement: [2], markdownOnly: true }] };
    let system = "";
    fx.llmReplies.push((r: LlmCompleteRequest) => {
      system = r.messages[0]!.content as string;
      const body = JSON.parse(r.messages[1]!.content as string);
      expect(body.characters[0]).toMatchObject({ charx_id: CHAR, character_name: "Hero" });
      expect(body.characters[0].customscript[0]).toMatchObject({ in: "<img=(.+?)>", flag: "g", type: "editdisplay" });
      return { characters: [{ charx_id: CHAR, status: "done", detectors: [{ script_index: 0, in: "<img=(.+?)>" }], reason: "image token" }] };
    });
    const jobs = new AnalysisJobs(fx.services);
    const out = await jobs.start("charx-regex", CHAR, (ctx) => runAnalysis(ctx, { kind: "charx-regex", characterId: CHAR })).done;
    expect(out.status).toBe("success");
    expect(out.message).toMatch(/^Character regex analysis complete · detectable 1/);
    expect(system).toBe(data("analysis-prompt-charx-customscript-detector.system.txt"));
    const stored = fx.documents.get(CHAR)!.characterPrompt.charxAssetRegexAnalysis[CHAR] as { status: string; detectors: { in: string; source: string }[] };
    expect(stored.status).toBe("done");
    expect(stored.detectors[0]).toMatchObject({ in: "<img=(.+?)>", source: "script" });
    const { setCharxRegexDetectors } = await import("./charx-regex.js");
    const bad = await setCharxRegexDetectors(fx.services, CHAR, [{ in: "(" }]).catch((e) => e);
    expect(bad.error.code).toBe("bad-request");
    const ok = await setCharxRegexDetectors(fx.services, CHAR, [{ in: "\\[pic:(\\w+)\\]", flags: "g" }]);
    expect(ok.analysis).toMatchObject({ status: "done", detectors: [{ in: "\\[pic:(\\w+)\\]", source: "manual", flags: "g" }] });
  });

  test("no scripts -> not_applicable, job no-evidence, no LLM call", async () => {
    const fx = fixture();
    const jobs = new AnalysisJobs(fx.services);
    const out = await jobs.start("charx-regex", CHAR, (ctx) => runAnalysis(ctx, { kind: "charx-regex", characterId: CHAR })).done;
    expect(out.status).toBe("no-evidence");
    expect(fx.llmRequests).toHaveLength(0);
    expect((fx.documents.get(CHAR)!.characterPrompt.charxAssetRegexAnalysis[CHAR] as { status: string }).status).toBe("not_applicable");
  });
});
