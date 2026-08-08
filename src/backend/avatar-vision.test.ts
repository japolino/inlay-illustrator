import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import {
  applyAvatarVisualSupplements,
  declaredVisionSupport,
  ensureAvatarVisualSupplement,
  parseAvatarVisualSupplement,
  unsupportedVisionError
} from "./avatar-vision.js";
import { acceptAvatarImageResponse } from "./avatar-image-bridge.js";
import { updateCache } from "./memory.js";
import { assemblePrompt, renderPrompt } from "./prompt.js";
import type { AvatarVisualSupplement, ParsedPayload } from "./types.js";

const supplement: AvatarVisualSupplement = {
  characterId: "char-1",
  imageId: "image-1",
  characterName: "Soraya al-Din",
  appearance: "long white hair, gold facial markings",
  body: "furry forearms",
  attire: "indigo head covering",
  provider: "test",
  model: "vision",
  createdAt: "2026-01-01T00:00:00.000Z"
};

function payload(character: Record<string, unknown>): ParsedPayload {
  return { scenes: [{ shots: [{ paragraph: 1, characters: [character] }] }] };
}

describe("one-time avatar vision enrichment", () => {
  test("recognizes explicit capability metadata without guessing when absent", () => {
    expect(declaredVisionSupport({ supportsVision: true })).toBe(true);
    expect(declaredVisionSupport({ input_modalities: ["text"] })).toBe(false);
    expect(declaredVisionSupport({ capabilities: { inputModalities: ["text", "image"] } })).toBe(true);
    expect(declaredVisionSupport({ providerQuirk: true })).toBeNull();
    expect(unsupportedVisionError(new Error("This model does not support image input"))).toBe(true);
  });

  test("parses and sanitizes complement-only vision tags", () => {
    const result = parseAvatarVisualSupplement(
      '```json\n{"appearance":"girl, long white hair, smiling","body":"standing, furry forearms","attire":"indigo head covering"}\n```',
      { characterId: "c", imageId: "i", characterName: "Soraya", provider: "p", model: "m" },
      "now"
    );
    expect(result.appearance).toBe("long white hair");
    expect(result.body).toBe("furry forearms");
    expect(result.attire).toBe("indigo head covering");
  });

  test("adds avatar fields for rendering without making them canonical memory", () => {
    const parsed = payload({
      name: "Soraya al-Din",
      appearance: "bronze skin, chartreuse eyes",
      body: "heavy curves",
      attire: "teal behlah",
      sources: { appearance: "card_explicit", body: "card_explicit", attire: "card_explicit" }
    });
    applyAvatarVisualSupplements(parsed, { "char-1": supplement });
    const character = parsed.scenes?.[0]?.shots?.[0]?.characters?.[0];
    expect(character?.avatarAppearance).toBe("long white hair, gold facial markings");
    expect(character?.avatarBody).toBe("furry forearms");
    expect(character?.avatarAttire).toBe("indigo head covering");

    const memory: Record<string, string> = {};
    updateCache(memory, parsed);
    expect(memory["Soraya al-Din"]).toBe("bronze skin, chartreuse eyes, heavy curves, teal behlah");
    expect(memory["Soraya al-Din"]).not.toContain("white hair");
  });

  test("current narrative changes suppress the corresponding avatar baseline field", () => {
    const parsed = payload({
      name: "Soraya al-Din",
      appearance: "temporarily dyed black hair",
      body: "heavy curves",
      attire: "borrowed red coat",
      visualChanges: ["appearance", "attire"],
      sources: { appearance: "narrative_explicit", body: "card_explicit", attire: "narrative_explicit" }
    });
    applyAvatarVisualSupplements(parsed, { "char-1": supplement });
    const character = parsed.scenes?.[0]?.shots?.[0]?.characters?.[0];
    expect(character?.avatarAppearance).toBeUndefined();
    expect(character?.avatarBody).toBe("furry forearms");
    expect(character?.avatarAttire).toBeUndefined();
  });

  test("uses the selected parser connection once and caches its multimodal complement", async () => {
    const previousSpindle = (globalThis as typeof globalThis & { spindle?: unknown }).spindle;
    let generateCalls = 0;
    let storedState: unknown = null;
    (globalThis as typeof globalThis & { spindle: unknown }).spindle = {
      images: {
        get: async () => ({ url: "/api/v1/images/image-1?size=lg" })
      },
      sendToFrontend: (message: Record<string, unknown>) => {
        acceptAvatarImageResponse({
          type: "avatar_image_response",
          requestId: message.requestId,
          data: "AQID",
          mimeType: "image/png"
        });
      },
      generate: {
        raw: async (request: Record<string, unknown>) => {
          generateCalls += 1;
          expect(request.connection_id).toBe("parser-1");
          const messages = request.messages as Array<{ content: Array<Record<string, unknown>> }>;
          expect(messages[0]?.content.some((part) => part.type === "image" && part.data === "AQID")).toBe(true);
          return { content: '{"appearance":"long white hair","body":"","attire":"indigo scarf"}' };
        }
      },
      userStorage: {
        getJson: async (_path: string, options: { fallback: unknown }) => options.fallback,
        setJson: async (_path: string, value: unknown) => { storedState = value; }
      },
      log: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }
    };
    try {
      const state = { characterAppearance: { Soraya: "bronze skin" }, generated: {} };
      const input = {
        chatId: "chat-1",
        character: { id: "char-1", image_id: "image-1", name: "Soraya", description: "Bronze skin." },
        canonicalTags: state.characterAppearance,
        connection: { id: "parser-1", name: "Vision", provider: "openai", model: "vision-model" },
        config: DEFAULT_CONFIG,
        state
      };
      const first = await ensureAvatarVisualSupplement(input);
      expect(first?.appearance).toBe("long white hair");
      expect(first?.attire).toBe("indigo scarf");
      expect(generateCalls).toBe(1);
      expect(storedState).toBeTruthy();
      const second = await ensureAvatarVisualSupplement(input);
      expect(second?.appearance).toBe("long white hair");
      expect(generateCalls).toBe(1);
    } finally {
      (globalThis as typeof globalThis & { spindle?: unknown }).spindle = previousSpindle;
    }
  });

  test("keeps scene-inferred or unprovenanced attire without avatar defaults", () => {
    const parsed = payload({
      name: "Soraya al-Din",
      appearance: "bronze skin",
      body: "heavy curves",
      attire: "borrowed red coat"
    });
    applyAvatarVisualSupplements(parsed, { "char-1": supplement });
    const character = parsed.scenes?.[0]?.shots?.[0]?.characters?.[0];
    expect(character?.avatarAppearance).toBe("long white hair, gold facial markings");
    expect(character?.avatarAttire).toBeUndefined();
  });

  test("renders avatar complements in ordinary character prompts", () => {
    const parsed = payload({
      name: "Soraya al-Din",
      label: "girl",
      appearance: "bronze skin, chartreuse eyes",
      body: "heavy curves",
      attire: "teal behlah",
      sources: { attire: "card_explicit" },
      expression: "calm"
    });
    applyAvatarVisualSupplements(parsed, { "char-1": supplement });
    const shot = parsed.scenes?.[0]?.shots?.[0] || {};
    const entry = assemblePrompt(
      { place: "palace", shots: [shot] },
      shot,
      { ...DEFAULT_CONFIG, perspectiveMode: "asset" },
      1,
      1
    );
    const rendered = renderPrompt(entry.prompt, "comfyui");
    expect(rendered).toContain("long white hair");
    expect(rendered).toContain("furry forearms");
    expect(rendered).toContain("indigo head covering");
  });
});
