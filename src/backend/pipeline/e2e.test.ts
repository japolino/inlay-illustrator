/**
 * End to end over the REAL engine (src/engine) with fake services: GENERATION_ENDED -> analyzer (scripted LLM reply
 * built from the request's actor candidates) -> compose -> NovelAI adapter -> ImageService -> chat data + baked message
 * + deferred continuity commit.
 */
import { describe, expect, test } from "bun:test";
import { setEngineEnv } from "../../engine/index.js";
import { seededEnv } from "../../engine/testing/env.js";
import type { LlmCompleteRequest } from "../services/types.js";
import { cleanMessageContent } from "./markup.js";
import { createPipelineModule } from "./index.js";
import { CHAT_ID, createPipelineFixture, finished, STORY, waitFor } from "./testing/fixtures.js";

/** Scripted analyzer: one illustration for the first slot with the first actor candidate (AM v2 response schema). */
function scriptedAnalyzer(request: LlmCompleteRequest): string {
  const last = request.messages[request.messages.length - 1]!;
  const text = typeof last.content === "string" ? last.content : last.content.map((p) => (p.type === "text" ? p.text : "")).join("");
  const json = JSON.parse(text.slice(text.indexOf("{")));
  const candidate = json.actor_candidates[0];
  const slot = Number(/<slot_number: (\d+)>/u.exec(json.scene)![1]);
  const outfit = (json.outfit_candidates ?? []).find((o: { candidate_key: string }) => o.candidate_key === candidate.candidate_key);
  return JSON.stringify({
    schema: "asset_maid_analyzer_illustration_response_v2",
    illustrations: [
      {
        slot_number: slot,
        preset_id: candidate.gender === "female" ? "1girl_solo.general.free" : "1boy_solo.general.free",
        actors: [
          {
            candidate_key: candidate.candidate_key,
            form_ref: candidate.default_form_ref,
            ...(outfit ? { outfit_id: outfit.id } : {}),
            modifiers: { "expression.general": ["light_smile"], "gaze.direction": ["looking_at_viewer"] },
          },
        ],
        body_action: "He runs to the school gate.",
        modifiers: { "scene.environment": ["outdoors"], "scene.time": ["day"], "scene.location": ["school gate"] },
        reason: "교문 장면",
      },
    ],
  });
}

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

describe("pipeline end to end over the real engine", () => {
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

  test("GENERATION_ENDED -> analyzer -> NovelAI request -> History + baked message + continuity", async () => {
    setEngineEnv(seededEnv(7));
    try {
      const fx = createPipelineFixture({
        config: {
          image: { provider: "novelai", model: "nai-diffusion-4-5-full", connectionId: "img-1" },
          novelai: { analysisProfile: "v4-5" },
          runtime: { generationAutoRetryCount: 0 },
        },
      });
      fx.llmReplies.push((request: LlmCompleteRequest) => scriptedAnalyzer(request));
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
      expect(Object.keys((generation.continuity as { characters: object }).characters)).toEqual(["__persona__"]);
      expect(doc.actorState.revision).toBe(1);
      expect(Object.keys(doc.actorState.actors)).toEqual(["__persona__"]);
      // baked block in the first gap, strip restores the reply
      const content = fx.message("m1").content;
      expect(content).toContain('data-inlay-illustrator-image-id="fake-image-1"');
      expect(cleanMessageContent(content)).toBe(STORY);
      // zoom details from the stored generation record
      const details = await pipeline.getZoomDetails(CHAT_ID, entry.slotId);
      expect(details.generationProvider).toBe("novelai");
      expect(details.positivePrompt).toBe(img.prompt);
      expect(details.coordinateGrid).toBe("v4-5");

      // Next turn: the analyzer sees the committed visual continuity of the previous message.
      fx.llmReplies.push((request: LlmCompleteRequest) => scriptedAnalyzer(request));
      const list = fx.fakeHost!.messages.get(CHAT_ID)!;
      const base = list[list.length - 1]!;
      list.push({ ...base, id: "u2", index_in_chat: 2, is_user: true, content: "We walk inside.", swipes: ["We walk inside."], swipe_id: 0 });
      list.push({ ...base, id: "m2", index_in_chat: 3, is_user: false, content: "They enter the hall.\n\nThe bell rings.", swipes: ["They enter the hall.\n\nThe bell rings."], swipe_id: 0 });
      await pipeline.handleGenerationEnded({ chatId: CHAT_ID, messageId: "m2", generationType: "normal" });
      await waitFor(() => finished(fx).length > 1, 20000);
      expect(finished(fx)[1]!.result).toBe("completed");
      const second = JSON.stringify(fx.llmRequests[1]!.messages);
      expect(second).toContain("visual_continuity");
      expect(second).toContain("school gate");
      pipeline.dispose();
    } finally {
      setEngineEnv(null);
    }
  }, 30000);
});
