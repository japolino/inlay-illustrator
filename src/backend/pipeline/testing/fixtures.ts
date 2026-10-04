/**
 * Test fixtures for the pipeline: fake services + fake host chat, a scripted fake EnginePort, and helpers.
 */
import type { InlayConfig } from "../../../shared/contract/index.js";
import { createFakeServices, type FakeServices } from "../../testing/fake-services.js";
import type { EnginePort, EngineRunContext } from "../engine-port.js";

export const CHAT_ID = "chat-1";
export const CHARACTER_ID = "char-1";
export const PERSONA_ID = "persona-1";

export const STORY = [
  "Alice waved at Shouta from the school gate, her silver hair catching the morning light.",
  '"You\'re late again!" she laughed, grabbing his sleeve.',
  "Mr. Bob watched them from the window of the staff room, sighing.",
].join("\n\n");

export interface PipelineFixture extends FakeServices {
  setMessages(messages: Array<{ id: string; content?: string; is_user?: boolean; swipes?: string[]; swipe_id?: number; name?: string }>): void;
  message(id: string): { content: string; swipes: string[]; swipe_id: number };
}

export function createPipelineFixture(options: { config?: unknown; messages?: Array<{ id: string; content?: string; is_user?: boolean; swipes?: string[]; swipe_id?: number }> } = {}): PipelineFixture {
  const fx = createFakeServices({ config: options.config ?? { image: { provider: "novelai", model: "nai-diffusion-4-5-full", connectionId: "img-1" } } }) as PipelineFixture;
  fx.characters.push({
    characterId: CHARACTER_ID,
    name: "Story Card",
    description: "A school slice-of-life story.",
    personality: "",
    scenario: "",
    creatorNotes: "",
    tags: [],
    avatarImageId: null,
    worldBookIds: [],
    extensions: {},
  });
  fx.chats.push({ chatId: CHAT_ID, characterId: CHARACTER_ID, groupCharacterIds: [], personaId: PERSONA_ID, metadata: {} });
  fx.activeChatId.value = CHAT_ID;
  fx.personas.push({ personaId: PERSONA_ID, name: "Shouta", description: "", avatarImageId: null, isDefault: true, attachedWorldBookId: null, metadata: {} });
  fx.activePersonaId.value = PERSONA_ID;
  fx.setMessages = (messages) => {
    fx.fakeHost!.addChat(
      { id: CHAT_ID, character_id: CHARACTER_ID },
      messages.map((m) => ({ ...m, swipes: m.swipes ?? [m.content ?? ""], content: m.swipes ? m.swipes[m.swipe_id ?? 0]! : (m.content ?? "") })),
    );
  };
  fx.message = (id) => {
    const m = fx.fakeHost!.messages.get(CHAT_ID)!.find((x) => x.id === id)!;
    return { content: m.content, swipes: [...m.swipes], swipe_id: m.swipe_id };
  };
  fx.setMessages(options.messages ?? [
    { id: "u1", content: "I run to the school gate.", is_user: true },
    { id: "m1", content: STORY },
  ]);
  return fx;
}

type Rec = Record<string, unknown>;

export interface FakeEngine extends EnginePort {
  runs: Array<{ input: Rec; context: EngineRunContext }>;
  dispatches: Array<{ request: Rec; context: EngineRunContext }>;
  /** Called per run (attempt number from 1); may throw. */
  beforeImages?: (run: number, input: Rec) => Promise<void> | void;
  /** Images per run (default: targetImageCount). */
  imageCount?: number;
}

/**
 * Scripted engine: emits the AM phases, then calls `persistGeneratedImage` for the first N candidate slots (minus
 * `skipSlotNumbers`) with a synthetic GeneratedImage whose provider metadata carries a fake image id.
 */
export function createFakeEngine(): FakeEngine {
  let image = 0;
  const engine: FakeEngine = {
    runs: [],
    dispatches: [],
    executionMode: () => "single-stage",
    async run(input, context) {
      const i = input as Rec;
      engine.runs.push({ input: i, context });
      const analyzer = i.analyzerInput as Rec;
      const ctx = analyzer.context as Rec;
      const slots = (ctx.candidateSlots as Array<{ slot_id: string; slot_number: number }>).filter((s) => !((i.skipSlotNumbers as number[]) ?? []).includes(s.slot_number));
      const count = engine.imageCount ?? Number(ctx.targetImageCount);
      const onEvent = i.onEvent as (e: Rec) => void;
      onEvent({ phase: "analyzing-preset", session: {} });
      await engine.beforeImages?.(engine.runs.length, i);
      onEvent({ phase: "planning", imageCount: count, session: {} });
      for (let n = 0; n < Math.min(count, slots.length); n += 1) {
        const slot = slots[n]!;
        onEvent({ phase: "generating", imageIndex: n, imageCount: count, session: {} });
        image += 1;
        await (i.persistGeneratedImage as (img: Rec) => Promise<void>)({
          sourceImageToken: `slot:${slot.slot_id}`,
          decision: { slot_number: slot.slot_number, preset_id: "1boy_solo.general.free", reason: "scene" },
          actors: [{ actorId: "actor_1", actorIndex: 0, kind: "persona", identityKey: `persona::${PERSONA_ID}`, identityName: "Shouta" }],
          promptPlan: { sizeId: 1, width: 832, height: 1216 },
          providerPrompt: { positivePrompt: `pos ${image}`, negativePrompt: "neg", characterPrompts: [{ prompt: "1boy", negativePrompt: "bad", actorIndex: 0 }] },
          generationRecord: { request: { positive: `pos ${image}`, negative: "neg", characters: [{ prompt: "1boy", negativePrompt: "bad", actorIndex: 0 }] } },
          novelAIConfig: { naiModel: "nai-diffusion-4-5-full", apiKey: "x", characterPrompts: [{ prompt: "1boy", uc: "bad", centerX: 0.5, centerY: 0.5, coordinateMode: "automatic" }] },
          seedFixed: false,
          generation: { providerMetadata: { imageId: `img-${image}`, sentParameters: { seed: 123 } }, width: 832, height: 1216, seed: "123", extension: "png" },
        });
      }
      onEvent({ phase: "complete", session: {} });
      return { session: {}, analyzer: {}, continuity: {}, images: [] };
    },
    async dispatch(request, context) {
      engine.dispatches.push({ request, context });
      image += 1;
      return { provider: request.provider, providerMetadata: { imageId: `regen-${image}`, sentParameters: {} }, width: request.width, height: request.height, seed: "999", extension: "png", effectivePrompt: request.prompt };
    },
    dispose() {},
  };
  return engine;
}

/** Resolve when `predicate` holds (polls the event loop). */
export async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

export function finished(fx: FakeServices, jobId?: string) {
  return fx.events.filter((e) => e.event === "generation.finished" && (!jobId || (e.payload as { jobId: string }).jobId === jobId)).map((e) => e.payload as { jobId: string; result: string; error?: { message: string; messageKo?: string } });
}

export type { InlayConfig };
