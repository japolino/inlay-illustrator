import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { InterceptorResultDTO, LlmMessageDTO } from "lumiverse-spindle-types";

type PromptInterceptor = (
  messages: LlmMessageDTO[],
  context: unknown
) => Promise<LlmMessageDTO[] | InterceptorResultDTO>;
type FrontendMessageHandler = (payload: unknown, userId?: string) => Promise<void>;
let promptInterceptor: PromptInterceptor;
let frontendMessageHandler: FrontendMessageHandler;
const storedFiles = new Map<string, string>();
const frontendMessages: unknown[] = [];
let generationEndedHandlers = 0;

function storageKey(path: string, userId?: string): string {
  return JSON.stringify([userId ?? null, path]);
}

beforeAll(async () => {
  (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle = {
    registerInterceptor: (handler: PromptInterceptor) => {
      promptInterceptor = handler;
    },
    on: (event: string) => {
      if (event === "GENERATION_ENDED") generationEndedHandlers += 1;
    },
    onFrontendMessage: (handler: FrontendMessageHandler) => {
      frontendMessageHandler = handler;
    },
    userStorage: {
      exists: async (path: string, userId?: string) => storedFiles.has(storageKey(path, userId)),
      read: async (path: string, userId?: string) => {
        const value = storedFiles.get(storageKey(path, userId));
        if (value === undefined) throw new Error(`Missing test file: ${path}`);
        return value;
      },
      getJson: async (path: string, options: { fallback?: unknown; userId?: string }) => {
        const key = storageKey(path, options?.userId);
        return storedFiles.has(key) ? JSON.parse(storedFiles.get(key)!) as unknown : options?.fallback;
      },
      setJson: async (path: string, value: unknown, options: { userId?: string }) => {
        storedFiles.set(storageKey(path, options?.userId), JSON.stringify(value));
      },
      list: async (prefix: string, userId?: string) => [...storedFiles.keys()]
        .map((key) => JSON.parse(key) as [string | null, string])
        .filter(([owner, path]) => owner === (userId ?? null) && path.startsWith(prefix))
        .map(([, path]) => path),
      mkdir: async () => undefined,
      write: async (path: string, value: string, userId?: string) => {
        storedFiles.set(storageKey(path, userId), value);
      }
    },
    connections: { list: async () => [{ id: "llm-1", name: "LLM", provider: "openai", model: "gpt" }] },
    imageGen: { listConnections: async () => [{ id: "img-1", name: "NAI", provider: "novelai", model: "nai" }] },
    chats: { get: async (id: string) => ({ id, name: `Chat ${id}` }) },
    characters: { get: async () => null },
    sendToFrontend: (message: unknown) => {
      frontendMessages.push(message);
    },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined }
  };
  await import("./backend");
});

beforeEach(() => {
  storedFiles.clear();
  frontendMessages.splice(0);
});

describe("backend wiring", () => {
  test("registers no automatic generation listener", () => {
    expect(generationEndedHandlers).toBe(0);
  });
});

describe("state and configuration messages", () => {
  test("sends config and connection lists", async () => {
    await frontendMessageHandler({ type: "get_state", chatId: "chat-1" }, "user-1");
    expect(frontendMessages).toHaveLength(1);
    expect(frontendMessages[0]).toMatchObject({
      type: "state",
      chatId: "chat-1",
      config: { enabled: true, fabCorner: "bottom-right" },
      parserConnections: [{ id: "llm-1" }],
      imageConnections: [{ id: "img-1" }]
    });
  });

  test("acknowledges a saved field with the normalized config", async () => {
    await frontendMessageHandler({ type: "set_config", chatId: "chat-1", patch: { fabCorner: "top-left", unknownKey: 1 } }, "user-1");
    expect(frontendMessages).toHaveLength(1);
    expect(frontendMessages[0]).toMatchObject({ type: "config_updated", chatId: "chat-1", config: { fabCorner: "top-left" } });
    expect((frontendMessages[0] as { config: Record<string, unknown> }).config.unknownKey).toBeUndefined();
    expect(JSON.parse(storedFiles.get(storageKey("config.json", "user-1"))!).fabCorner).toBe("top-left");
  });

  test("ignores unknown message types", async () => {
    await frontendMessageHandler({ type: "generate_latest", chatId: "chat-1" }, "user-1");
    expect(frontendMessages).toHaveLength(0);
  });
});

describe("legacy illustration lookups", () => {
  const legacyState = {
    characterAppearance: {},
    generated: {
      record: {
        chatId: "chat-1",
        messageId: "message-1",
        swipeId: 0,
        prompts: ["positive prompt"],
        negativePrompts: ["negative prompt"],
        perspectiveModes: ["creative"],
        perspectiveSources: ["adaptive"],
        creativeConcepts: [{ anchor: "shadow", concept: "shadow across the wall" }],
        paragraphs: [1],
        imageIds: ["image-1"],
        imageUrls: ["/api/v1/image-gen/results/image-1"],
        rawJson: { scenes: [] },
        createdAt: "2026-07-18T00:00:00.000Z"
      },
      reference: {
        storageVersion: 3,
        recordPath: "records/chat-1/ref.json",
        chatId: "chat-1",
        messageId: "message-2",
        swipeId: 1,
        slots: [{ paragraph: 2, imageId: "image-2", imageUrl: "/api/v1/image-gen/results/image-2" }],
        createdAt: "2026-07-18T00:00:00.000Z"
      }
    }
  };

  function seed(): void {
    storedFiles.set(storageKey("states/chat-1.json", "user-1"), JSON.stringify(legacyState));
    storedFiles.set(storageKey("records/chat-1/ref.json", "user-1"), JSON.stringify({
      schemaVersion: 3,
      chatId: "chat-1",
      messageId: "message-2",
      swipeId: 1,
      slots: [{ prompt: "second prompt", negativePrompt: "", paragraph: 2, imageId: "image-2", imageUrl: "/api/v1/image-gen/results/image-2" }],
      createdAt: "2026-07-18T00:00:00.000Z"
    }));
  }

  test("returns prompt metadata for an old parallel-array record", async () => {
    seed();
    await frontendMessageHandler({ type: "get_inlay_image_details", requestId: "details-1", chatId: "chat-1", imageId: "image-1" }, "user-1");
    expect(frontendMessages).toEqual([{
      type: "inlay_image_details_result",
      requestId: "details-1",
      ok: true,
      prompt: "positive prompt",
      negativePrompt: "negative prompt",
      perspectiveMode: "creative",
      perspectiveSource: "adaptive",
      creativeConcept: "shadow: shadow across the wall"
    }]);
  });

  test("hydrates compact references and reports missing images", async () => {
    seed();
    await frontendMessageHandler({ type: "get_inlay_image_details", requestId: "d2", chatId: "chat-1", messageId: "message-2", swipeId: 1, imageIndex: 0 }, "user-1");
    expect(frontendMessages[0]).toMatchObject({ ok: true, prompt: "second prompt" });
    await frontendMessageHandler({ type: "get_inlay_image_details", requestId: "d3", chatId: "chat-1", imageId: "nope" }, "user-1");
    expect(frontendMessages[1]).toMatchObject({ requestId: "d3", ok: false });
  });

  test("lists the gallery from legacy chat states", async () => {
    seed();
    await frontendMessageHandler({ type: "list_inlay_gallery", requestId: "g1", page: 1 }, "user-1");
    const result = frontendMessages[0] as Record<string, any>;
    expect(result).toMatchObject({ type: "inlay_gallery_result", requestId: "g1", ok: true, page: 1, totalChats: 1, chatIds: ["chat-1"] });
    expect(result.chats[0]).toMatchObject({ chatId: "chat-1", name: "Chat chat-1", messageCount: 2, branchCount: 1 });
    expect(result.chats[0].images.map((image: { imageId: string }) => image.imageId)).toEqual(["image-1", "image-2"]);
  });
});

describe("primary-model context interceptor", () => {
  test("runs for every generation flow and preserves non-content message data", async () => {
    const inlay = '<!-- inlay_illustrator -->\n<div data-inlay-illustrator="true"><img src="/generated.png" data-inlay-illustrator-prompt="secret"><pre class="inlay-illustrator-prompt" hidden>secret</pre></div>';
    const system: LlmMessageDTO = { role: "system", content: inlay };
    const user: LlmMessageDTO = { role: "user", content: inlay };
    const imagePart = { type: "image" as const, data: "image-data", mime_type: "image/png" };
    const toolResultPart = {
      type: "tool_result" as const,
      tool_use_id: "tool-1",
      content: inlay,
      is_error: false
    };
    const assistant: LlmMessageDTO = {
      role: "assistant",
      content: `${inlay}\n\nAssistant narrative.`,
      name: "narrator",
      reasoning_content: inlay,
      __isChatHistory: true,
      sourceMessageId: "assistant-1",
      sourceIndexInChat: 4
    };
    const multipart: LlmMessageDTO = {
      role: "assistant",
      content: [
        { type: "text", text: `Before.\n\n${inlay}\n\nAfter.` },
        imagePart,
        toolResultPart
      ],
      reasoning_content: "reasoning stays"
    };
    const messages = [system, user, assistant, multipart];
    const generationTypes = ["normal", "regenerate", "swipe", "continue", "impersonate"];

    expect(typeof promptInterceptor).toBe("function");
    for (const generationType of generationTypes) {
      const result = await promptInterceptor(messages, { generationType });
      expect(Array.isArray(result)).toBe(true);
      if (!Array.isArray(result)) throw new Error("Expected the interceptor to return messages.");

      expect(result[0]).toBe(system);
      expect(result[1]).toBe(user);
      expect(result[2]).toEqual({
        ...assistant,
        content: "Assistant narrative."
      });
      expect(result[2].reasoning_content).toBe(inlay);
      expect(result[2].sourceMessageId).toBe("assistant-1");
      expect(result[2].sourceIndexInChat).toBe(4);

      const parts = result[3].content;
      expect(Array.isArray(parts)).toBe(true);
      if (!Array.isArray(parts)) throw new Error("Expected multipart content.");
      expect(parts[0]).toEqual({ type: "text", text: "Before.\n\nAfter." });
      expect(parts[1]).toBe(imagePart);
      expect(parts[2]).toBe(toolResultPart);
    }

    expect(assistant.content).toContain("secret");
    expect(Array.isArray(multipart.content) && multipart.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("secret")
    });
  });
});
