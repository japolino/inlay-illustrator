import { describe, expect, test } from "bun:test";
import type { LlmCompleteRequest } from "../services/types.js";
import { AnalysisJobs } from "./jobs.js";
import { runAnalysis } from "./runs.js";
import { setRosterRegistered } from "./workspace.js";
import { ALICE, CHAR, createAnalysisFixture } from "./testing/fixtures.js";
import { readFileSync } from "node:fs";

const userJson = (r: LlmCompleteRequest) => {
  const user = r.messages.find((m) => m.role === "user")!;
  const text = typeof user.content === "string" ? user.content : (user.content.find((p) => p.type === "text") as { text: string }).text;
  return JSON.parse(text);
};

/** Form resolution reply: every observation goes to the first existing form of its owner. */
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

async function setup(overrides: Parameters<typeof createAnalysisFixture>[0] = {}) {
  const fx = createAnalysisFixture(overrides);
  await setRosterRegistered(fx.services, CHAR, [{ memberKey: CHAR, selectionId: "wb1:e1" }], true);
  await fx.services.storage.updateCharacterDocument(CHAR, (d) => ({
    ...d,
    characterPrompt: { ...d.characterPrompt, assetSelections: { [ALICE]: { selectedAssetNames: ["alice_smile.png"], selectedAssets: [{ name: "alice_smile.png", key: "img-alice_smile.png", ext: "png", sourceType: "character" }] } } },
  }));
  return fx;
}

describe("character-prompts analysis (AM iwt)", () => {
  test("image batch -> form resolution -> forms written", async () => {
    const fx = await setup();
    fx.llmReplies.push(
      (r: LlmCompleteRequest) => {
        const body = userJson(r);
        expect(body.characters).toHaveLength(1);
        expect(body.characters[0]).toMatchObject({ prompt_key: ALICE, analysis_profile: "asset", evidence_mode: "image" });
        return {
          characters: [{
            analysis_id: body.characters[0].analysis_id, prompt_key: ALICE, analysis_profile: "asset",
            observations: [{
              observation_id: "o1", evidence_refs: ["alice_smile.png"], suggested_label: "", gender: "female",
              identity_groups: { "hair.color": ["red hair"], "hair.length": ["long_hair"], "eyes.color": ["green eyes"], "body.breast_size": ["medium_breasts"] },
              negative_prompt: "", warnings: [],
              outfits: [{ outfit_id: "school", source_asset_name: "alice_smile.png", label: "School", keywords: "school", head: "", top: "sailor shirt", bottom: "pleated skirt", legs: "", feet: "loafers" }],
            }],
          }],
        };
      },
      resolveAllToDefault,
    );
    const jobs = new AnalysisJobs(fx.services);
    const { done } = jobs.start("character-prompts", CHAR, (ctx) => runAnalysis(ctx, { kind: "character-prompts", characterId: CHAR, evidenceMode: "image" }));
    const outcome = await done;
    expect(outcome).toMatchObject({ status: "success" });
    expect(outcome.message).toMatch(/^Prompt analysis complete · 1 characters/);
    // system prompt byte-identical to the extract
    const system = fx.llmRequests[0]!.messages[0]!.content as string;
    expect(system).toBe(readFileSync(new URL("./data/analysis-prompt-character-analysis-image.system.txt", import.meta.url), "utf8"));
    const image = (fx.llmRequests[0]!.messages[1]!.content as { type: string }[]).find((p) => p.type === "image");
    expect(image).toMatchObject({ type: "image", mime_type: "image/png" });
    expect(fx.llmRequests[0]!.visionFallback).toBe("fail");
    const forms = fx.documents.get(CHAR)!.characterPrompt.characterForms[ALICE]!;
    const form = forms.forms[0]!;
    expect(form.gender).toBe("female");
    expect(form.basePromptGroups["hair.color"]).toEqual(["red hair"]);
    expect(form.basePromptGroups["hair.length"]).toEqual(["long hair"]);
    expect(form.outfits.some((o) => o.top === "sailor shirt" && o.feet === "loafers")).toBe(true);
    expect(form.reference?.enabled).toBe(true);
    expect(fx.documents.get(CHAR)!.characterPrompt.assetMetadata[ALICE]!.aiAnalysis).toMatchObject({ status: "done", outfitCount: 1 });
    const progress = fx.events.filter((e) => e.event === "analysis.progress");
    expect(progress.some((e) => JSON.stringify(e.payload).includes("labelKo"))).toBe(true);
    const rows = progress.flatMap((e) => ((e.payload as { rows?: { promptKey: string; status: string }[] }).rows ?? []));
    expect(rows.some((r) => r.promptKey === ALICE && r.status === "success")).toBe(true);
    const finished = fx.events.find((e) => e.event === "analysis.finished")!.payload as { status: string };
    expect(finished.status).toBe("success");
  });

  test("image unsupported -> metadata fallback -> text fallback", async () => {
    const fx = await setup();
    fx.llmReplies.push(
      Object.assign(new Error("vision"), {}) as Error,
    );
    const { RpcFailure } = await import("../rpc/errors.js");
    fx.llmReplies.length = 0;
    fx.llmReplies.push(
      new RpcFailure({ code: "unsupported", message: "The model cannot read images." }),
      (r: LlmCompleteRequest) => {
        const body = userJson(r);
        expect(body.characters[0]).toMatchObject({ evidence_mode: "text", lorebook_body: "Alice has long red hair and green eyes." });
        return { characters: [{ analysis_id: body.characters[0].analysis_id, prompt_key: ALICE, analysis_profile: "asset", gender: "female", identity_groups: { "hair.color": ["red hair"], "eyes.color": ["green eyes"], "hair.length": ["long hair"] }, outfits: [] }] };
      },
      resolveAllToDefault,
    );
    const jobs = new AnalysisJobs(fx.services);
    const outcome = await jobs.start("character-prompts", CHAR, (ctx) => runAnalysis(ctx, { kind: "character-prompts", characterId: CHAR })).done;
    expect(outcome.status).toBe("success");
    expect(fx.documents.get(CHAR)!.characterPrompt.characterForms[ALICE]!.forms[0]!.basePromptGroups["eyes.color"]).toEqual(["green eyes"]);
  });

  test("nothing selected -> no-evidence; busy guard; cancel", async () => {
    const fx = createAnalysisFixture();
    const jobs = new AnalysisJobs(fx.services);
    const a = jobs.start("character-prompts", CHAR, (ctx) => runAnalysis(ctx, { kind: "character-prompts", characterId: CHAR }));
    expect(() => jobs.start("character-prompts", CHAR, async () => ({ status: "success", message: "" }))).toThrow();
    expect((await a.done).status).toBe("no-evidence");
    const fx2 = await setup({
      llm: {
        complete: (_req, opts) =>
          new Promise((_resolve, reject) => opts?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })),
      },
    });
    const jobs2 = new AnalysisJobs(fx2.services);
    const b = jobs2.start("character-prompts", CHAR, (ctx) => runAnalysis(ctx, { kind: "character-prompts", characterId: CHAR }));
    await new Promise((r) => setTimeout(r, 30));
    jobs2.cancel({ jobId: b.jobId });
    const out = await b.done;
    expect(out.status).toBe("cancelled");
  });
});
