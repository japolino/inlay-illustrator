/**
 * Unit tests for the tool logic. No live network calls: the client is stubbed
 * (or, for marker detection, the production renderInlaidMessage helper builds
 * realistic Inlay markup). The last test spawns the real MCP server process
 * and verifies stdout carries only JSON-RPC protocol data.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../../shared/config.js";
import { renderInlaidMessage } from "../../backend/rendering.js";
import type { LumiverseClient, MessageRecord, Paginated } from "./client.js";
import { LumiverseError } from "./client.js";
import { cleanNarrative, extractInlayBlocks, hasInlayMarkup } from "./inlay-markers.js";
import {
  inlayDescribeConfig,
  inlayGetCharacterTags,
  inlayGetImageDetails,
  inlayGetResult,
  inlayMetadata,
  inlayPatchConfig,
  inlayResetConfig,
  inlaySendTestTurn,
  lumiverseCreateTestChat,
  lumiverseDryRun,
  lumiverseGetCharacter,
  lumiverseListCharacters,
  lumiverseSelectCharacter,
  lumiverseStatus,
  pollGeneration,
  pollInlayResult,
  truncate,
  type DriverState,
  type ToolContext
} from "./tools.js";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function message(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: "m1",
    chat_id: "chat1",
    index_in_chat: 2,
    is_user: false,
    name: "Mira",
    content: "Hello there.",
    send_date: 1000,
    swipe_id: 0,
    swipes: ["Hello there."],
    extra: {},
    parent_message_id: null,
    created_at: 1000,
    ...overrides
  };
}

type StubHandlers = {
  probe?: () => Promise<boolean>;
  settings?: () => Promise<unknown>;
  listCharacters?: (options: { search?: string; limit?: number; offset?: number }) => Promise<Paginated<{ id: string; name: string; tags: string[]; updated_at: number; image_id: string | null }>>;
  getCharacter?: (id: string) => Promise<Record<string, unknown>>;
  createChat?: (input: { character_id: string; name?: string }) => Promise<{ id: string; character_id: string | null; name: string; metadata: Record<string, unknown>; created_at: number; updated_at: number }>;
  listMessages?: (chatId: string, options: { limit?: number; offset?: number; tail?: boolean }) => Promise<Paginated<MessageRecord>>;
  getMessage?: (chatId: string, messageId: string) => Promise<MessageRecord>;
  createMessage?: (chatId: string, input: { is_user: boolean; name: string; content: string }) => Promise<MessageRecord>;
  startGeneration?: (input: Record<string, unknown>) => Promise<{ generationId: string }>;
  dryRun?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  generationStatus?: (chatId: string, known?: { generationId?: string; contentLen?: number; reasoningLen?: number }) => Promise<{ active: boolean; status?: string; error?: string; completedMessageId?: string; targetMessageId?: string }>;
  resolveExtensionId?: (identifier?: string) => Promise<string>;
  extensionMessage?: (extensionId: string, payload: Record<string, unknown>, options: { responseType: string; requestId?: string; timeoutMs?: number }) => Promise<Record<string, unknown>>;
  openExtensionStatusMonitor?: (extensionId: string, chatId: string, timeoutMs?: number) => Promise<{ close(): void; events(): Array<{ status: string; error?: string; chatId: string; at: number }> }>;
};

function stubClient(handlers: StubHandlers): LumiverseClient {
  const base = {
    baseUrl: "http://lumiverse.test:7860",
    probe: async () => true,
    settings: async () => ({ ok: true }),
    listCharacters: async () => ({ data: [], total: 0, limit: 50, offset: 0 }),
    getCharacter: async (id: string) => ({ id, name: "Character" }),
    createChat: async (input: { character_id: string; name?: string }) => ({
      id: "chat1",
      character_id: input.character_id,
      name: input.name ?? "Chat",
      metadata: {},
      created_at: 1,
      updated_at: 2
    }),
    listMessages: async () => ({ data: [], total: 0, limit: 20, offset: 0 }),
    getMessage: async (_chatId: string, messageId: string) => message({ id: messageId }),
    createMessage: async (_chatId: string, input: { is_user: boolean; name: string; content: string }) =>
      message({ is_user: true, name: input.name, content: input.content, index_in_chat: 3, id: "user1" }),
    startGeneration: async () => ({ generationId: "g1" }),
    dryRun: async () => ({ model: "model-x", provider: "provider-y", messages: [], parameters: {} }),
    generationStatus: async () => ({ active: false, status: "completed", completedMessageId: "a1" }),
    resolveExtensionId: async () => "ext-inlay",
    extensionMessage: async (_extensionId: string, payload: Record<string, unknown>) => {
      if (payload.type === "get_state") return { type: "state", config: DEFAULT_CONFIG, parserConnections: [], chatId: payload.chatId || "", characterAppearance: {} };
      if (payload.type === "set_config") return { type: "config_updated", config: { ...DEFAULT_CONFIG, ...(payload.patch as object) } };
      return {};
    },
    openExtensionStatusMonitor: async () => ({ close() {}, events: () => [] }),
    ...handlers
  };
  return base as unknown as LumiverseClient;
}

function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms: number) => { time += ms; }
  };
}

function context(client: LumiverseClient, clock: ReturnType<typeof fakeClock>, state: DriverState = { characterId: null, chatId: null }): ToolContext {
  return { client, state, debug: () => undefined, now: clock.now, sleep: clock.sleep };
}

function inlayRenderedContent(): string {
  const original = "First paragraph of the reply.\n\nSecond paragraph of the reply.";
  return renderInlaidMessage(original, {
    chatId: "chat1",
    messageId: "a1",
    swipeId: 0,
    imageIds: ["img1", ""],
    imageUrls: ["/api/v1/image-gen/results/img1", ""],
    prompts: ["prompt one", "prompt two"],
    negativePrompts: ["neg one", "neg two"],
    perspectiveModes: ["dynamic", "dynamic"],
    perspectiveSources: ["adaptive", "adaptive"],
    paragraphs: [1, 2],
    slotStatuses: ["completed", "pending"]
  }, DEFAULT_CONFIG);
}

// ---------------------------------------------------------------------------
// Inlay marker detection (production markup)
// ---------------------------------------------------------------------------

describe("inlay marker detection against production renderer output", () => {
  const content = inlayRenderedContent();

  test("detects markup and extracts image blocks with ids and urls", () => {
    expect(hasInlayMarkup(content)).toBe(true);
    const blocks = extractInlayBlocks(content);
    expect(blocks.length).toBe(2);
    const images = blocks.filter((block) => block.kind === "image");
    expect(images.map((block) => block.imageId)).toEqual(["img1"]);
    expect(images.map((block) => block.imageUrl)).toEqual(["/api/v1/image-gen/results/img1"]);
    const placeholders = blocks.filter((block) => block.kind === "placeholder");
    expect(placeholders.length).toBe(1);
    expect(placeholders[0].status).toBe("pending");
  });

  test("cleanNarrative restores the original text without Inlay markup", () => {
    const clean = cleanNarrative(content);
    expect(clean).toBe("First paragraph of the reply.\n\nSecond paragraph of the reply.");
    expect(hasInlayMarkup(clean)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tool logic
// ---------------------------------------------------------------------------

describe("lumiverse_status", () => {
  test("reports reachability, authentication and selected ids without secrets", async () => {
    const client = stubClient({});
    const result = await lumiverseStatus(context(client, fakeClock()));
    expect(result).toMatchObject({
      reachable: true,
      authenticated: true,
      base_url: "http://lumiverse.test:7860",
      character_id: null,
      chat_id: null
    });
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("session");
  });

  test("reports unreachable instances", async () => {
    const client = stubClient({ probe: async () => false });
    const result = await lumiverseStatus(context(client, fakeClock()));
    expect(result.reachable).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.auth_error).toContain("not reachable");
  });
});

describe("Inlay extension state and stored image details", () => {
  test("describes config fields with current/default values and enums", async () => {
    const client = stubClient({
      extensionMessage: async (_id, payload) => ({
        type: "state",
        config: { ...DEFAULT_CONFIG, perspectiveMode: "asset", autoGenerate: true },
        parserConnections: [{ id: "parser1", name: "Deepseek V4 Flash" }],
        chatId: payload.chatId || "",
        characterAppearance: {}
      })
    });
    const result = await inlayDescribeConfig(context(client, fakeClock()));
    expect((result.config as Record<string, unknown>).perspectiveMode).toBe("asset");
    const perspective = (result.fields as Array<Record<string, unknown>>).find((field) => field.name === "perspectiveMode");
    expect(perspective?.allowed_values).toEqual(["creative", "static", "dynamic", "asset"]);
    expect(result.parser_connections).toEqual([{ id: "parser1", name: "Deepseek V4 Flash" }]);
  });

  test("previews normalized config patches without persisting", async () => {
    let setCalls = 0;
    const client = stubClient({
      extensionMessage: async (_id, payload) => {
        if (payload.type === "set_config") setCalls += 1;
        return { type: "state", config: DEFAULT_CONFIG, parserConnections: [], characterAppearance: {} };
      }
    });
    const result = await inlayPatchConfig(context(client, fakeClock()), { patch: { perspectiveMode: "asset", maxImages: 99 }, dry_run: true });
    expect(setCalls).toBe(0);
    expect((result.after as Record<string, unknown>).perspectiveMode).toBe("asset");
    expect((result.after as Record<string, unknown>).maxImages).toBe(12);
    expect(result.changed_fields).toEqual(["perspectiveMode", "maxImages"]);
  });

  test("patches and resets allowlisted config fields", async () => {
    let current = { ...DEFAULT_CONFIG, autoGenerate: true };
    const client = stubClient({
      extensionMessage: async (_id, payload) => {
        if (payload.type === "get_state") return { type: "state", config: current, parserConnections: [], characterAppearance: {} };
        current = { ...current, ...(payload.patch as object) };
        return { type: "config_updated", config: current };
      }
    });
    const patched = await inlayPatchConfig(context(client, fakeClock()), { patch: { autoGenerate: false } });
    expect((patched.after as Record<string, unknown>).autoGenerate).toBe(false);
    const reset = await inlayResetConfig(context(client, fakeClock()), { fields: ["autoGenerate"] });
    expect((reset.after as Record<string, unknown>).autoGenerate).toBe(DEFAULT_CONFIG.autoGenerate);
    await expect(inlayResetConfig(context(client, fakeClock()), { all: true })).rejects.toThrow("confirm_all=true");
  });

  test("returns generated character memory tags for a chat", async () => {
    const client = stubClient({
      extensionMessage: async (_id, payload) => ({
        type: "state", config: DEFAULT_CONFIG, parserConnections: [], chatId: payload.chatId,
        characterAppearance: { Miyoko: "young woman, black hair, red eyes" }
      })
    });
    const state: DriverState = { characterId: "c1", chatId: "chat1" };
    const result = await inlayGetCharacterTags(context(client, fakeClock(), state), {});
    expect(result.character_tags).toEqual({ Miyoko: "young woman, black hair, red eyes" });
  });

  test("returns the exact stored prompt shown by the image lightbox", async () => {
    const client = stubClient({
      extensionMessage: async (_id, payload) => ({
        type: "inlay_image_details_result", requestId: payload.requestId, ok: true,
        prompt: "1girl, black hair, red eyes", negativePrompt: "low quality",
        perspectiveMode: "asset", perspectiveSource: "manual", creativeConcept: ""
      })
    });
    const state: DriverState = { characterId: "c1", chatId: "chat1" };
    const result = await inlayGetImageDetails(context(client, fakeClock(), state), { image_id: "img1", message_id: "m1" });
    expect(result.prompt).toBe("1girl, black hair, red eyes");
    expect(result.perspective_mode).toBe("asset");
    expect(result.negative_prompt).toBe("low quality");
  });
});

describe("character selection and chat creation", () => {
  test("selects and validates a character", async () => {
    const state: DriverState = { characterId: null, chatId: null };
    const client = stubClient({ getCharacter: async (id) => ({ id, name: "Mira" }) });
    const result = await lumiverseSelectCharacter(context(client, fakeClock(), state), { character_id: "c1" });
    expect(result).toEqual({ character_id: "c1", name: "Mira" });
    expect(state.characterId).toBe("c1");
  });

  test("returns the full character record with bounded text fields", async () => {
    const long = "x".repeat(12_000);
    const client = stubClient({
      getCharacter: async (id) => ({
        id,
        name: "Sayu Himari",
        description: "Full Name: Sayu Himari\nEpithet: The White Comet",
        system_prompt: "",
        personality: "",
        scenario: "",
        first_mes: "The courtyard is quiet.",
        mes_example: "",
        creator_notes: "A world much like our own.",
        post_history_instructions: "Keep it going.",
        alternate_greetings: [],
        tags: ["Female", "Romance"],
        image_id: "img1",
        avatar_path: "/img/avatar.png",
        folder: null,
        creator: "japolino5",
        created_at: 123,
        updated_at: 456,
        user_id: "u1",
        description_extra: long
      })
    });
    const result = await lumiverseGetCharacter(context(client, fakeClock()), { character_id: "c1" });
    expect(result.character.id).toBe("c1");
    expect(result.character.name).toBe("Sayu Himari");
    expect(result.character.description).toBe("Full Name: Sayu Himari\nEpithet: The White Comet");
    expect(result.character.system_prompt).toBe("");
    expect(result.character.tags).toEqual(["Female", "Romance"]);
    expect(result.character.description_extra).toContain("[truncated]");
    expect(result.truncated_fields).toEqual(["description_extra"]);
  });

  test("caps array fields and reports them as truncated", async () => {
    const manyTags = Array.from({ length: 120 }, (_, i) => `tag${i}`);
    const client = stubClient({
      getCharacter: async (id) => ({ id, name: "N", tags: manyTags })
    });
    const result = await lumiverseGetCharacter(context(client, fakeClock()), { character_id: "c1" });
    expect(result.character.tags).toHaveLength(50);
    expect(result.truncated_fields).toEqual(["tags"]);
  });

  test("propagates character validation failures", async () => {
    const client = stubClient({
      getCharacter: async () => { throw new LumiverseError("Lumiverse GET /api/v1/characters/nope returned 404: not found", "/api/v1/characters/nope", 404); }
    });
    await expect(lumiverseSelectCharacter(context(client, fakeClock()), { character_id: "nope" })).rejects.toThrow("404");
  });

  test("creates a test chat and stores it as the selected chat", async () => {
    const state: DriverState = { characterId: "c1", chatId: null };
    const greeting = message({ id: "g1", is_user: false, index_in_chat: 0, content: "Greetings!" });
    const client = stubClient({
      createChat: async (input) => ({ id: "chat9", character_id: input.character_id, name: "Test chat", metadata: {}, created_at: 1, updated_at: 2 }),
      listMessages: async () => ({ data: [greeting], total: 1, limit: 20, offset: 0 })
    });
    const result = await lumiverseCreateTestChat(context(client, fakeClock(), state), { name: "Test chat" });
    expect(result.chat_id).toBe("chat9");
    expect(state.chatId).toBe("chat9");
    expect(result.greeting_messages).toHaveLength(1);
    expect((result.greeting_messages as Array<Record<string, unknown>>)[0]).toMatchObject({ id: "g1", content: "Greetings!" });
  });

  test("fails when no character is selected", async () => {
    const client = stubClient({});
    await expect(lumiverseCreateTestChat(context(client, fakeClock()), {})).rejects.toThrow("lumiverse_select_character");
  });

  test("fails when no chat is selected", async () => {
    const client = stubClient({});
    await expect(inlaySendTestTurn(context(client, fakeClock()), { content: "hi" })).rejects.toThrow("lumiverse_create_test_chat");
    await expect(lumiverseDryRun(context(client, fakeClock()), {})).rejects.toThrow("lumiverse_create_test_chat");
  });
});

describe("lumiverse_list_characters", () => {
  test("clamps the limit and keeps compact records", async () => {
    let requestedLimit = 0;
    const client = stubClient({
      listCharacters: async (options) => {
        requestedLimit = options.limit ?? 0;
        return { data: [{ id: "c1", name: "Mira", tags: ["sci-fi"], updated_at: 10, image_id: "img1" }], total: 1, limit: options.limit ?? 50, offset: options.offset ?? 0 };
      }
    });
    const result = await lumiverseListCharacters(context(client, fakeClock()), { limit: 5000 });
    expect(requestedLimit).toBe(200);
    expect(result.characters).toEqual([{ id: "c1", name: "Mira", tags: ["sci-fi"], updated_at: 10, image_id: "img1" }]);
  });
});

describe("lumiverse_dry_run", () => {
  test("builds the dry-run request and documents the GENERATION_ENDED limitation", async () => {
    const state: DriverState = { characterId: null, chatId: "chat1" };
    let received: Record<string, unknown> | null = null;
    const client = stubClient({
      dryRun: async (input) => {
        received = input;
        return {
          model: "model-x",
          provider: "provider-y",
          messages: [{ role: "user", content: "x".repeat(10_000) }],
          breakdown: [{ name: "system" }],
          parameters: { temperature: 0.7 },
          usage: { total_tokens: 123 },
          tokenCount: { total_tokens: 123 }
        };
      }
    });
    const result = await lumiverseDryRun(context(client, fakeClock(), state), { user_input: "Hello" });
    expect(received).toMatchObject({ chat_id: "chat1", user_input: "Hello", generation_type: "normal" });
    expect(result.model).toBe("model-x");
    expect(result.note).toContain("GENERATION_ENDED");
    expect(result.note).toContain("does not execute");
    // Bounded: the 10k-char message is truncated.
    const messages = result.messages as Array<Record<string, unknown>>;
    expect(messages[0].content_truncated).toBe(true);
    expect(String(messages[0].content).length).toBeLessThan(10_000);
  });
});

describe("inlay_send_test_turn", () => {
  test("creates the message, starts generation, polls to completion, then polls Inlay output", async () => {
    const state: DriverState = { characterId: null, chatId: "chat1" };
    const clock = fakeClock();
    let statusCalls = 0;
    const client = stubClient({
      createMessage: async (chatId, input) =>
        message({ id: "user1", chat_id: chatId, is_user: true, name: input.name, content: input.content, index_in_chat: 3 }),
      startGeneration: async (input) => {
        expect(input).toMatchObject({ chat_id: "chat1", user_input: "Hello", generation_type: "normal" });
        return { generationId: "g1" };
      },
      generationStatus: async () => {
        statusCalls += 1;
        if (statusCalls < 3) return { active: true, status: "streaming" };
        return { active: false, status: "completed", completedMessageId: "a1" };
      },
      getMessage: async (_chatId, messageId) => {
        if (messageId === "a1") return message({ id: "a1", content: inlayRenderedContent() });
        return message({ id: messageId });
      }
    });

    const result = await inlaySendTestTurn(context(client, clock, state), {
      content: "Hello",
      user_name: "Test User"
    });

    expect(result.user_message_id).toBe("user1");
    expect(result.generation_id).toBe("g1");
    expect(result.assistant_message_id).toBe("a1");
    expect(result.terminal_status).toBe("completed");
    expect(result.inlay_detected).toBe(true);
    expect(result.inlay_status).toBe("pending");
    expect(result.image_ids).toEqual(["img1"]);
    expect(result.image_urls).toEqual(["/api/v1/image-gen/results/img1"]);
    expect(result.assistant_text).toContain("First paragraph");
    expect(result.assistant_text).not.toContain("inlay-illustrator");
    expect(result.elapsed_generation_ms).toBeGreaterThan(0);
    // Detection happens on the first inlay poll here, so the elapsed inlay
    // time may legitimately be 0 with the fake clock.
    expect(result.elapsed_inlay_ms).toBeGreaterThanOrEqual(0);
  });

  test("reports a generation timeout instead of waiting forever", async () => {
    const state: DriverState = { characterId: null, chatId: "chat1" };
    const clock = fakeClock();
    const client = stubClient({
      generationStatus: async () => ({ active: true })
    });
    const outcome = await pollGeneration(context(client, clock, state), "chat1", "g1", 3_000);
    expect(outcome.terminal_status).toBe("timeout");
    expect(outcome.error).toContain("within 3000 ms");
    expect(outcome.elapsed_ms).toBe(3_000);
  });

  test("reports a stopped generation", async () => {
    const client = stubClient({ generationStatus: async () => ({ active: false, status: "stopped" }) });
    const outcome = await pollGeneration(context(client, fakeClock()), "chat1", "g1", 10_000);
    expect(outcome.terminal_status).toBe("stopped");
  });

  test("waits for Inlay output and reports a timeout when it never appears", async () => {
    const client = stubClient({
      getMessage: async () => message({ id: "a1", content: "Plain assistant text without any inlay markup." })
    });
    const clock = fakeClock();
    const outcome = await pollInlayResult(context(client, clock), "chat1", "a1", 2_000);
    expect(outcome.detected).toBe(false);
    expect(outcome.status).toBe("none");
    expect(outcome.explanation).toContain("No Inlay output detected");
    expect(outcome.elapsed_ms).toBe(2_000);
  });

  test("detects Inlay output from stored metadata before markup appears", async () => {
    const client = stubClient({
      getMessage: async () => message({
        id: "a1",
        content: "Plain text.",
        extra: { spindle_metadata: { inlayIllustratorImageIds: ["img1"], inlayIllustratorGenerationStatus: "completed" } }
      })
    });
    const outcome = await pollInlayResult(context(client, fakeClock()), "chat1", "a1", 10_000);
    expect(outcome.detected).toBe(true);
    expect(outcome.status).toBe("completed");
  });

  test("generation polling surfaces a provider error", async () => {
    const client = stubClient({
      generationStatus: async () => ({ active: false, status: "error", error: "model overloaded" })
    });
    const outcome = await pollGeneration(context(client, fakeClock()), "chat1", "g1", 10_000);
    expect(outcome.terminal_status).toBe("error");
    expect(outcome.error).toBe("model overloaded");
  });

  test("short-circuits when generation stops instead of polling for an assistant message", async () => {
    const state: DriverState = { characterId: null, chatId: "chat1" };
    const client = stubClient({
      startGeneration: async () => ({ generationId: "g1" }),
      generationStatus: async () => ({ active: false, status: "stopped" }),
      listMessages: async () => { throw new Error("must not be called"); },
      getMessage: async () => { throw new Error("must not be called"); }
    });
    const result = await inlaySendTestTurn(context(client, fakeClock(), state), { content: "Hello" });
    expect(result.terminal_status).toBe("stopped");
    expect(result.assistant_message_id).toBeNull();
    expect(result.inlay_detected).toBe(false);
    expect(result.explanation).toContain("GENERATION_ENDED pipeline was not reached");
  });
});

describe("inlay_get_result", () => {
  test("returns clean narrative, blocks, ids/urls and compact metadata, bounded", async () => {
    const state: DriverState = { characterId: null, chatId: "chat1" };
    const huge = "word ".repeat(30_000);
    const client = stubClient({
      listMessages: async () => ({ data: [message({ id: "a1", index_in_chat: 5 })], total: 1, limit: 20, offset: 0 }),
      getMessage: async () => message({
        id: "a1",
        content: `${inlayRenderedContent()}\n\n${huge}`,
        extra: {
          spindle_metadata: {
            inlayIllustratorImageIds: ["img1", "img2"],
            inlayIllustratorParagraphs: [1, 2],
            inlayIllustratorGenerationStatus: "pending"
          }
        }
      })
    });
    const result = await inlayGetResult(context(client, fakeClock(), state), {});
    expect(result.message_id).toBe("a1");
    expect(result.inlay_markup).toBe(true);
    expect(result.inlay_status).toBe("pending");
    expect(result.image_ids).toEqual(["img1"]);
    expect(result.image_urls).toHaveLength(1);
    expect(result.inlay_blocks).toHaveLength(2);
    expect(result.inlay_metadata).toMatchObject({ inlayIllustratorImageIds: ["img1", "img2"] });
    expect(result.clean_narrative_truncated).toBe(true);
    expect(result.clean_narrative.length).toBeLessThan(60_000);
    expect(JSON.stringify(result)).not.toContain("spindle_metadata");
  });

  test("maps extension metadata from extra.spindle_metadata", () => {
    const record = message({
      extra: { spindle_metadata: { inlayIllustratorImageIds: ["i1"], inlayIllustratorGenerationStatus: "completed" }, other: "x" }
    });
    expect(inlayMetadata(record)).toEqual({ inlayIllustratorImageIds: ["i1"], inlayIllustratorGenerationStatus: "completed" });
  });
});

describe("Inlay extension error surfacing", () => {
  test("pollInlayResult fails fast when the extension reports a status error", async () => {
    const client = stubClient({});
    const state: DriverState = { characterId: "c1", chatId: "chat1" };
    const statusEvents = () => [{ status: "Error", error: "Parser response was truncated before producing JSON.", chatId: "chat1", at: 1 }];
    const outcome = await pollInlayResult(context(client, fakeClock(), state), "chat1", "a1", 300_000, statusEvents);
    expect(outcome.detected).toBe(false);
    expect(outcome.status).toBe("error");
    expect(outcome.explanation).toContain("truncated");
    expect(outcome.elapsed_ms).toBe(0);
  });

  test("pollInlayResult ignores status errors for other chats", async () => {
    const client = stubClient({ getMessage: async () => message({ id: "a1", content: "plain" }) });
    const state: DriverState = { characterId: "c1", chatId: "chat1" };
    const statusEvents = () => [{ status: "Error", error: "other chat failure", chatId: "chat9", at: 1 }];
    const outcome = await pollInlayResult(context(client, fakeClock(), state), "chat1", "a1", 5_000, statusEvents);
    expect(outcome.detected).toBe(false);
    expect(outcome.status).toBe("none");
  });

  test("inlaySendTestTurn surfaces the extension error instead of timing out", async () => {
    const events = [
      { status: "Generating...", chatId: "chat1", at: 1 },
      { status: "Error", error: "Parser generation failed: Parser response was truncated before producing JSON.", chatId: "chat1", at: 2 }
    ];
    const client = stubClient({
      openExtensionStatusMonitor: async () => ({ close() {}, events: () => events })
    });
    const state: DriverState = { characterId: "c1", chatId: "chat1" };
    const result = await inlaySendTestTurn(context(client, fakeClock(), state), { content: "Hi" });
    expect(result.terminal_status).toBe("completed");
    expect(result.inlay_detected).toBe(false);
    expect(result.inlay_status).toBe("error");
    expect(result.explanation).toContain("Parser generation failed");
  });
});

describe("bounded outputs", () => {
  test("truncate caps text and flags truncation", () => {
    const bounded = truncate("a".repeat(100), 10);
    expect(bounded.truncated).toBe(true);
    expect(bounded.text.length).toBeLessThan(100);
    const short = truncate("abc", 10);
    expect(short.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MCP stdout isolation (spawns the real server process)
// ---------------------------------------------------------------------------

const spawned: ReturnType<typeof Bun.spawn>[] = [];

afterAll(() => {
  for (const proc of spawned) proc.kill();
});

describe("MCP server process", () => {
  test("writes only JSON-RPC protocol data to stdout and diagnostics to stderr", async () => {
    const proc = Bun.spawn(["bun", "run", "src/dev/lumiverse-mcp/server.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, LUMIVERSE_MCP_DEBUG: "1" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe"
    });
    spawned.push(proc);

    const decoder = new TextDecoder();
    const readUntil = async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      predicate: (text: string) => boolean,
      timeoutMs: number
    ): Promise<string> => {
      const deadline = Date.now() + timeoutMs;
      let buffer = "";
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (predicate(buffer)) return buffer;
      }
      return buffer;
    };

    const stdoutReader = proc.stdout!.getReader();
    const stderrReader = proc.stderr!.getReader();

    const send = (payload: unknown) => {
      proc.stdin!.write(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
    };

    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "spawn-test", version: "1.0" } }
    });

    const initBuffer = await readUntil(stdoutReader, (text) => text.includes('"id":1') && text.includes('"result"'), 15_000);
    expect(initBuffer).toContain('"result"');

    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });

    const toolsBuffer = await readUntil(stdoutReader, (text) => text.includes('"id":2'), 15_000);

    // Every stdout line must be a complete, parseable JSON-RPC message.
    const lines = toolsBuffer.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const parsed = JSON.parse(line) as { jsonrpc?: string };
      expect(parsed.jsonrpc).toBe("2.0");
    }

    const toolList = JSON.parse(lines.find((line) => line.includes('"id":2'))!) as { result: { tools: Array<{ name: string }> } };
    const names = toolList.result.tools.map((tool) => tool.name);
    for (const expected of [
      "lumiverse_status",
      "lumiverse_list_characters",
      "lumiverse_select_character",
      "lumiverse_create_test_chat",
      "lumiverse_dry_run",
      "inlay_send_test_turn",
      "inlay_get_result"
    ]) {
      expect(names).toContain(expected);
    }

    // Diagnostics land on stderr, never stdout.
    const stderrText = await readUntil(stderrReader, (text) => text.includes("[lumiverse-mcp]"), 5_000);
    expect(stderrText).toContain("[lumiverse-mcp]");

    stdoutReader.releaseLock();
    stderrReader.releaseLock();
    proc.kill();
  }, 30_000);
});
