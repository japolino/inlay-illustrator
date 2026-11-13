/**
 * End to end over the REAL engine (src/engine) with fake services: GENERATION_ENDED -> analyzer (scripted LLM reply
 * built from the request's actor candidates) -> compose -> NovelAI adapter -> ImageService -> chat data + baked message
 * + deferred continuity commit.
 */
import { describe, expect, test } from "bun:test";
import { setEngineEnv } from "../../engine/index.js";
import { seededEnv } from "../../engine/testing/env.js";
import type { LlmCompleteRequest } from "../services/types.js";
import { PRESET_FORMAT } from "../../shared/contract/index.js";
import { atelierServiceOf } from "../services/atelier.js";
import { cleanMessageContent } from "./markup.js";
import { createPipelineModule } from "./index.js";
import { CHAT_ID, createPipelineFixture, finished, STORY, waitFor } from "./testing/fixtures.js";

/** Scripted V5 analyzer (scene graph response) with the active persona as the only actor. */
function scriptedV5Analyzer(request: LlmCompleteRequest): string {
  const last = request.messages[request.messages.length - 1]!;
  const text = typeof last.content === "string" ? last.content : last.content.map((p) => (p.type === "text" ? p.text : "")).join("");
  const json = JSON.parse(text.slice(text.indexOf("{")));
  const slot = Number(/<slot_number: (\d+)>/u.exec(json.scene)![1]);
  return JSON.stringify({
    illustrations: [
      {
        slot_number: slot,
        actor_roster: [{ actorId: "actor_1", candidateKey: json.active_persona_candidate_key }],
        interaction: { items: [], modifiers: [], instructions: [] },
        frame_placement: {
          sizeId: 2,
          modifiers: [
            { id: "scene.rating", options: ["sfw"] },
            { id: "scene.environment", options: ["outdoors"] },
          ],
          freeTags: ["school gate"],
          instruction: "",
          items: [{ actorId: "actor_1", center: { x: 0.5, y: 0.5 } }],
        },
        actor_detail: [{ actorId: "actor_1", placementIndex: 0, actions: [], modifiers: [{ id: "expression.general", options: ["light_smile"] }], freeTags: [], poseInstruction: "", actionInstruction: "running", objectInstruction: "" }],
        camera: { modifiers: [], instruction: "" },
      },
    ],
  });
}

/** V5 analyzer that introduces an unregistered character (free character generation, AM generated_actor_proposals). */
function scriptedFreeCharacterAnalyzer(request: LlmCompleteRequest): string {
  const last = request.messages[request.messages.length - 1]!;
  const text = typeof last.content === "string" ? last.content : last.content.map((p) => (p.type === "text" ? p.text : "")).join("");
  const json = JSON.parse(text.slice(text.indexOf("{")));
  const slot = Number(/<slot_number: (\d+)>/u.exec(json.scene)![1]);
  return JSON.stringify({
    generated_actor_proposals: [
      {
        candidateKey: "free_1",
        label: "Hana",
        tags: "1girl, red hair",
        instruction: "",
        sex: "female",
        profile: {
          recognitionKeys: ["Hana"],
          formLabel: "red-haired young teacher",
          humanlike: true,
          basePromptGroups: { "hair.color": ["red hair"], "eyes.color": ["green eyes"] },
          defaultOutfit: { name: "Grey Blazer and Pencil Skirt", head: "", top: "grey blazer, white blouse", bottom: "grey pencil skirt", legs: "", feet: "black heels" },
        },
      },
    ],
    illustrations: [
      {
        slot_number: slot,
        actor_roster: [{ actorId: "actor_1", candidateKey: "free_1" }],
        interaction: { items: [], modifiers: [], instructions: [] },
        frame_placement: { sizeId: 1, modifiers: [{ id: "scene.rating", options: ["sfw"] }], freeTags: ["classroom"], instruction: "", items: [{ actorId: "actor_1", center: { x: 0.5, y: 0.5 } }] },
        actor_detail: [{ actorId: "actor_1", placementIndex: 0, actions: [], modifiers: [{ id: "expression.general", options: ["light_smile"] }], freeTags: [], poseInstruction: "", actionInstruction: "", objectInstruction: "" }],
        camera: { modifiers: [], instruction: "" },
      },
    ],
  });
}

describe("pipeline end to end over the real engine", () => {
  test("V5 free character generation persists the generated character into the character document", async () => {
    setEngineEnv(seededEnv(5));
    try {
      const fx = createPipelineFixture({
        config: {
          image: { provider: "novelai", model: "nai-diffusion-5-full", connectionId: "img-1" },
          novelai: { analysisProfile: "v5-hybrid" },
          runtime: { generationAutoRetryCount: 0 },
        },
      });
      fx.llmReplies.push((request: LlmCompleteRequest) => scriptedFreeCharacterAnalyzer(request));
      const { pipeline } = createPipelineModule(fx.services);
      await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
      await waitFor(() => finished(fx).length > 0, 20000);
      expect(finished(fx)[0]!.error).toBeUndefined();
      expect(finished(fx)[0]!.result).toBe("completed");
      expect(JSON.stringify(fx.llmRequests[0]!.messages)).toContain("generated_actor_proposals");
      const doc = fx.documents.get("char-1")!;
      expect(doc.customCharacters.map((c) => [c.title, c.origin])).toEqual([["Hana", "ai-auto"]]);
      const forms = doc.characterPrompt.characterForms[doc.customCharacters[0]!.id]!;
      expect(forms.forms[0]!.outfits[0]!.top).toBe("grey blazer, white blouse");
      expect(fx.imageRequests[0]!.novelai?.characters?.[0]?.prompt).toContain("red hair");
      expect(fx.events.some((e) => e.event === "document.changed")).toBe(true);
      pipeline.dispose();
    } finally {
      setEngineEnv(null);
    }
  }, 30000);

  test("chest other and the typed other-tags order reach the generated prompt through the engine compile", async () => {
    setEngineEnv(seededEnv(9));
    try {
      const basePromptGroups = {
        "hair.color": ["black hair"],
        "body.skin": ["dark skin"],
        "body.breast_size": ["large breasts"],
        "body.breast_other": ["cleavage"],
        "marks.distinctive": ["mole under eye"],
        custom: ["scar"],
        // Typed order of the "other" tags (AM 0.9.90 otherOrder): the custom tag first, then the skin and the mark.
        otherOrder: ["scar", "dark skin", "mole under eye"],
      };
      const form = { id: "form_default", label: "Default", gender: "female", humanlike: true, basePromptGroups, outfits: [] };
      const fx = createPipelineFixture({
        config: {
          image: { provider: "novelai", model: "nai-diffusion-5-full", connectionId: "img-1" },
          novelai: { analysisProfile: "v5-hybrid" },
          runtime: { generationAutoRetryCount: 0 },
          characterPrompt: { personaSettings: { selectedPersonaKey: "", sourceScopes: {}, profiles: { "persona-1": { forms: { defaultFormId: "form_default", forms: [form] } } } } },
        },
      });
      fx.llmReplies.push((request: LlmCompleteRequest) => scriptedV5Analyzer(request));
      const { pipeline } = createPipelineModule(fx.services);
      await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
      await waitFor(() => finished(fx).length > 0, 20000);
      expect(finished(fx)[0]!.error).toBeUndefined();
      const prompt = fx.imageRequests[0]!.novelai?.characters?.[0]?.prompt ?? "";
      // Same as the AM 0.9.90 compile (p120 `Mc` 20961, checked against the slice): the "other" tags fill their own slots in the typed order, the chest
      // size and chest other stay in place right after each other.
      expect(prompt).toContain("black hair, scar, large breasts, cleavage, dark skin, mole under eye");
      pipeline.dispose();
    } finally {
      setEngineEnv(null);
    }
  }, 30000);

  test("V5 profile: scene graph analyzer -> NovelAI V5 request -> History + V5 continuity", async () => {
    setEngineEnv(seededEnv(9));
    try {
      const fx = createPipelineFixture({
        config: {
          image: { provider: "novelai", model: "nai-diffusion-5-full", connectionId: "img-1" },
          novelai: { analysisProfile: "v5-hybrid" },
          runtime: { generationAutoRetryCount: 0 },
        },
      });
      fx.llmReplies.push((request: LlmCompleteRequest) => scriptedV5Analyzer(request));
      const { pipeline } = createPipelineModule(fx.services);
      await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
      await waitFor(() => finished(fx).length > 0, 20000);
      expect(finished(fx)[0]!.error).toBeUndefined();
      expect(finished(fx)[0]!.result).toBe("completed");
      expect(fx.imageRequests.length).toBe(1);
      expect(fx.imageRequests[0]!.width).toBe(1216);
      const doc = fx.chatData.get(CHAT_ID)!;
      expect(doc.plans["illustration:m1@0"]!.status).toBe("complete");
      expect(doc.store.messages["m1@0"]!.generations[0]!.continuity).toBeDefined();
      expect(fx.message("m1").content).toContain("fake-image-1");
      pipeline.dispose();
    } finally {
      setEngineEnv(null);
    }
  }, 30000);

  test("Gemini 4 Argon on a Vertex connection gets the compact response contract; any other target keeps the full one", async () => {
    const freeformOf = async (target: { provider: string; model: string } | Error) => {
      setEngineEnv(seededEnv(9));
      try {
        const fx = createPipelineFixture({
          config: { image: { provider: "novelai", model: "nai-diffusion-5-full", connectionId: "img-1" }, novelai: { analysisProfile: "v5-hybrid" }, runtime: { generationAutoRetryCount: 0 } },
        });
        fx.services.llm.analyzerTarget = async () => {
          if (target instanceof Error) throw target;
          return target;
        };
        fx.llmReplies.push((request: LlmCompleteRequest) => scriptedV5Analyzer(request));
        const { pipeline } = createPipelineModule(fx.services);
        await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
        await waitFor(() => finished(fx).length > 0, 20000);
        expect(finished(fx)[0]!.result).toBe("completed");
        const last = fx.llmRequests[0]!.messages[fx.llmRequests[0]!.messages.length - 1]!;
        const text = typeof last.content === "string" ? last.content : last.content.map((part) => (part.type === "text" ? part.text : "")).join("");
        pipeline.dispose();
        return JSON.parse(text.slice(text.indexOf("{"))).response_contract.analysis_policy.freeform as unknown;
      } finally {
        setEngineEnv(null);
      }
    };
    expect(typeof (await freeformOf({ provider: "google_vertex", model: "gemini-4-argon" }))).toBe("string");
    expect(typeof (await freeformOf({ provider: "google_vertex", model: "gemini-4-carbon" }))).toBe("object");
    expect(typeof (await freeformOf({ provider: "openrouter", model: "google/gemini-4-argon" }))).toBe("object");
    expect(typeof (await freeformOf(new Error("connection unreadable")))).toBe("object");
  }, 90000);

  test("Maid Atelier: a non-default active preset and a user directing guideline change the analyzer request; the AI selection history is kept", async () => {
    setEngineEnv(seededEnv(9));
    try {
      const fx = createPipelineFixture({
        config: {
          image: { provider: "novelai", model: "nai-diffusion-5-full", connectionId: "img-1" },
          novelai: { analysisProfile: "v5-hybrid" },
          runtime: { generationAutoRetryCount: 0 },
        },
      });
      const atelier = atelierServiceOf(fx.services);
      const preset = JSON.stringify({
        format: PRESET_FORMAT,
        title: "Weather pack",
        content: { definitions: [{ id: "custom.weather", description: "Zebra weather marker", scope: ["scene"], order: 900, options: [{ id: "drizzle", description: "light rain", prompt: "drizzle" }] }] },
      });
      const state = await atelier.getState();
      const imported = await atelier.importDocument({ baseRevision: state.revision, fileName: "weather.json", json: preset });
      const { id } = await atelier.createGuideline({ kind: "scene" });
      await atelier.saveGuidelines({ kind: "scene", edits: [
        { id, field: "name", before: "New guideline", value: "Rooftop" },
        { id, field: "instruction", before: "", value: "Quokka guideline: frame every scene from a rooftop." },
      ] });
      await atelier.selectGuideline({ kind: "scene", id });
      expect((await atelier.getState()).catalog.activeId).toBe(imported.id);

      const requests: string[] = [];
      fx.llmReplies.push((request: LlmCompleteRequest) => {
        requests.push(request.messages.map((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join(""))).join(" "));
        return scriptedV5Analyzer(request);
      });
      const { pipeline } = createPipelineModule(fx.services);
      await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
      await waitFor(() => finished(fx).length > 0, 20000);
      expect(finished(fx)[0]!.error).toBeUndefined();
      expect(finished(fx)[0]!.result).toBe("completed");
      expect(requests.length).toBe(1);
      // The preset's own tag group is offered in the analyzer catalog; the selected guideline is the custom instruction.
      expect(requests[0]).toMatch(/custom\.weather[\\"]*,[\\"]*options[\\"]*:\[[\\"]*drizzle/u);
      expect(requests[0]).toContain("Quokka guideline: frame every scene from a rooftop.");

      // AI selection history: stored with the generation record and summarized for the zoom viewer.
      const sidecar = fx.json.get("chats/chat-1/pipeline.json") as { records: Record<string, { analysis?: { profile: string; record: unknown } }> };
      const [entryId, record] = Object.entries(sidecar.records)[0]!;
      expect(record.analysis?.profile).toBe("v5-hybrid");
      expect(record.analysis?.record).toBeTruthy();
      const slotId = Object.values(fx.chatData.get(CHAT_ID)!.history.entriesById).find((e) => e.entryId === entryId)!.slotId;
      const zoom = await pipeline.getZoomDetails(CHAT_ID, slotId, entryId);
      expect(zoom.selectionSummary?.status).toBe("ready");
      expect(zoom.selectionSummary!.sections.map((s) => s.title)).toContain("Scene");
      expect(JSON.stringify(zoom.selectionSummary)).not.toMatch(/[가-힣]/u);
      pipeline.dispose();
    } finally {
      setEngineEnv(null);
    }
  }, 30000);

  test("V5 with JEV roster selection reports its progress on the job snapshot", async () => {
    setEngineEnv(seededEnv(9));
    try {
      const fx = createPipelineFixture({
        config: {
          image: { provider: "novelai", model: "nai-diffusion-5-full", connectionId: "img-1" },
          novelai: { analysisProfile: "v5-hybrid" },
          jevConnection: { connectionId: "dec-1", rosterSelectionDefault: true },
          runtime: { generationAutoRetryCount: 0 },
        },
      });
      (fx.services.host as any).decisions = {
        async evaluate(input: { model?: string; questions?: Record<string, unknown> }) {
          return { model: input.model ?? "jev-latest", answers: Object.fromEntries(Object.keys(input.questions ?? {}).map((k) => [k, { type: "noul", noul: 0.95 }])), latencyMs: 1 };
        },
      };
      fx.llmReplies.push((request: LlmCompleteRequest) => scriptedV5Analyzer(request));
      const { pipeline } = createPipelineModule(fx.services);
      await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
      await waitFor(() => finished(fx).length > 0, 20000);
      expect(finished(fx)[0]!.error).toBeUndefined();
      const statuses = fx.events
        .filter((e) => e.event === "generation.progress")
        .map((e) => (e.payload as { jevSelection?: { status: string } }).jevSelection?.status)
        .filter(Boolean);
      expect(statuses[0]).toBe("running");
      expect(statuses.at(-1)).toBe("completed");
      pipeline.dispose();
    } finally {
      setEngineEnv(null);
    }
  }, 30000);

  test("GENERATION_ENDED -> V5 analyzer -> NovelAI V4.5 model request -> History + baked message + continuity", async () => {
    setEngineEnv(seededEnv(7));
    try {
      const fx = createPipelineFixture({
        config: {
          image: { provider: "novelai", model: "nai-diffusion-4-5-full", connectionId: "img-1" },
          // A stored V4.5 analysis profile runs as V5 (AM 0.9.90); the NovelAI V4.5 image model stays usable.
          novelai: { analysisProfile: "v4-5" },
          runtime: { generationAutoRetryCount: 0 },
        },
      });
      fx.llmReplies.push((request: LlmCompleteRequest) => scriptedV5Analyzer(request));
      const { pipeline } = createPipelineModule(fx.services);
      await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m1", generationType: "normal" });
      await waitFor(() => finished(fx).length > 0, 20000);
      const result = finished(fx)[0]!;
      expect(result.error).toBeUndefined();
      expect(result.result).toBe("completed");

      // analyzer request went through LlmService (JSON mode) with the paragraph slots
      expect(fx.llmRequests.length).toBe(1);
      expect(fx.llmRequests[0]!.purpose).toBe("analyzer");
      // one NovelAI image request through ImageService (engine dispatcher retries -> retries: 0, queued)
      expect(fx.imageRequests.length).toBe(1);
      const img = fx.imageRequests[0]!;
      expect(img.retries).toBe(0);
      expect(img.queue).toBe(true);
      expect(img.purpose).toBe("chat");
      expect(img.ownerChatId).toBe(CHAT_ID);
      expect(img.model).toBe("nai-diffusion-4-5-full");
      expect(img.prompt.length).toBeGreaterThan(10);
      expect(img.novelai?.characters?.length).toBe(1);
      expect(typeof img.seed).toBe("number");

      const doc = fx.chatData.get(CHAT_ID)!;
      const plan = doc.plans["illustration:m1@0"]!;
      expect(plan.status).toBe("complete");
      const entry = Object.values(doc.history.entriesById)[0]!;
      expect(entry.savedPath).toBe("/api/v1/image-gen/results/fake-image-1");
      expect(entry.generationOrigin).toBe("initial");
      // deferred continuity was committed into the store generation of the revision
      const generation = doc.store.messages["m1@0"]!.generations[0]!;
      expect(generation.id).toBe(plan.activeRevisionId);
      expect(generation.continuity).toBeDefined();
      // 0.9.90 checkpoint (`rxt` compact form): scene + modifier refs + participants. The persona has no persistent
      // continuity groups (the 0.9.89 accumulation counters are gone), so the checkpoint stores no character state.
      const continuity = generation.continuity as { scene?: { backgroundTags: string[] }; characters?: object; participants?: { personaKeys?: string[] } };
      expect(continuity.scene?.backgroundTags).toEqual(["school_gate"]);
      expect(continuity.participants?.personaKeys).toEqual(["persona::persona-1"]);
      expect(continuity.characters).toBeUndefined();
      // AM 0.9.90: no accumulated actor state is kept next to the checkpoints.
      expect("actorState" in doc).toBe(false);
      // baked block in the first gap, strip restores the reply
      const content = fx.message("m1").content;
      expect(content).toContain('data-inlay-illustrator-image-id="fake-image-1"');
      expect(cleanMessageContent(content)).toBe(STORY);
      // zoom details from the stored generation record
      const details = await pipeline.getZoomDetails(CHAT_ID, entry.slotId);
      expect(details.generationProvider).toBe("novelai");
      expect(details.positivePrompt).toBe(img.prompt);
      expect(details.coordinateGrid).toBe("v5");

      // Next turn: the analyzer sees the committed visual continuity of the previous message.
      fx.llmReplies.push((request: LlmCompleteRequest) => scriptedV5Analyzer(request));
      const list = fx.fakeHost!.messages.get(CHAT_ID)!;
      const base = list[list.length - 1]!;
      list.push({ ...base, id: "u2", index_in_chat: 2, is_user: true, content: "We walk inside.", swipes: ["We walk inside."], swipe_id: 0 });
      list.push({ ...base, id: "m2", index_in_chat: 3, is_user: false, content: "They enter the hall.\n\nThe bell rings.", swipes: ["They enter the hall.\n\nThe bell rings."], swipe_id: 0 });
      await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m2", generationType: "normal" });
      await waitFor(() => finished(fx).length > 1, 20000);
      expect(finished(fx)[1]!.result).toBe("completed");
      const second = JSON.stringify(fx.llmRequests[1]!.messages);
      expect(second).toContain("scene_modifier_continuity");
      expect(second).toContain("school_gate");
      pipeline.dispose();
    } finally {
      setEngineEnv(null);
    }
  }, 30000);
});
