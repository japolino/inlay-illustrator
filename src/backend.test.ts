/**
 * Entry wiring test: imports src/backend.ts over the fake Spindle host and checks the registrations, the RPC channel,
 * the interceptor and the legacy gallery messages. Feature behaviour is tested in the module suites.
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { InterceptorResultDTO, LlmMessageDTO } from "lumiverse-spindle-types";
import { createRequest, isRpcResponse, renderIllustrationBlock, RPC_METHODS } from "./shared/contract/index.js";
import { createFakeHost, type FakeHost } from "./backend/testing/fake-host.js";

type Interceptor = (messages: LlmMessageDTO[], context: unknown) => Promise<LlmMessageDTO[] | InterceptorResultDTO>;
let fake: FakeHost;

beforeAll(async () => {
  fake = createFakeHost({ userId: "user-1" });
  (globalThis as unknown as { spindle: unknown }).spindle = fake.host;
  await import("./backend");
});

beforeEach(() => {
  fake.sent.splice(0);
});

async function rpc(method: string, params: Record<string, unknown>): Promise<Record<string, any>> {
  const request = createRequest(method as never, params as never, `t:${Math.random()}`);
  fake.sendFromFrontend(request);
  for (let i = 0; i < 200; i += 1) {
    const response = fake.sent.map((s) => s.payload).find((p) => isRpcResponse(p) && p.requestId === request.requestId);
    if (response) return response as Record<string, any>;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`No response for ${method}`);
}

describe("backend wiring", () => {
  test("registers the interceptor and the host event listeners", () => {
    expect(fake.interceptors.length).toBe(1);
    for (const event of ["GENERATION_ENDED", "MESSAGE_SWIPED", "MESSAGE_DELETED", "CHARACTER_EDITED"]) {
      expect(fake.eventHandlers.get(event)?.size ?? 0).toBeGreaterThan(0);
    }
  });

  test("answers RPC requests with exactly one response", async () => {
    const hello = await rpc("session.hello", { protocol: 1, clientId: "test", surface: "overlay" });
    expect(hello.ok).toBe(true);
    expect(hello.result.protocol).toBe(1);
    const config = await rpc("config.get", {});
    expect(config.ok).toBe(true);
    expect(config.result.config.analysis).toBeDefined();
    const responses = fake.sent.map((s) => s.payload).filter((p) => isRpcResponse(p));
    expect(responses.length).toBe(2);
  });

  test("every contract method has a handler", async () => {
    const { allHandlers } = await import("./backend/rpc/handlers/index.js");
    const handlers = allHandlers();
    const missing = RPC_METHODS.filter((method) => typeof (handlers as Record<string, unknown>)[method] !== "function");
    expect(missing).toEqual([]);
  });

  test("ignores unknown legacy message types", async () => {
    fake.sendFromFrontend({ type: "generate_latest", chatId: "chat-1" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fake.sent.length).toBe(0);
  });
});

describe("legacy gallery messages", () => {
  test("lists an empty gallery", async () => {
    fake.sendFromFrontend({ type: "list_inlay_gallery", requestId: "g1", page: 1 });
    for (let i = 0; i < 100 && !fake.sentOfType("inlay_gallery_result").length; i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(fake.sentOfType("inlay_gallery_result")[0]).toMatchObject({ requestId: "g1", ok: true, totalChats: 0 });
  });
});

describe("primary-model context interceptor", () => {
  test("strips baked illustration blocks and keeps non-content data", async () => {
    const block = renderIllustrationBlock({
      chatId: "c", messageId: "m", swipeId: 0, messageKey: "illustration:m@0", revisionId: "r", slotId: "illustration:m@0:slot:0",
      slotIndex: 0, entryId: "e", assetName: "a", imageId: "i", entryIndex: 1, entryCount: 1, canRegenerate: true, imageIndex: 0,
    });
    const legacy = '<!-- inlay_illustrator -->\n<div data-inlay-illustrator="true"><img src="/generated.png"></div>';
    const imagePart = { type: "image" as const, data: "image-data", mime_type: "image/png" };
    const assistant: LlmMessageDTO = { role: "assistant", content: `First.\n\n${block}\n\nSecond.`, name: "narrator", sourceMessageId: "a-1" } as LlmMessageDTO;
    const multipart: LlmMessageDTO = { role: "assistant", content: [{ type: "text", text: `Before.\n\n${legacy}\n\nAfter.` }, imagePart] };
    const plain: LlmMessageDTO = { role: "user", content: "hello" };
    const interceptor = fake.interceptors[0]!.handler as Interceptor;
    const result = await interceptor([plain, assistant, multipart], { generationType: "normal" });
    if (!Array.isArray(result)) throw new Error("Expected messages.");
    expect(result[0]).toBe(plain);
    expect(result[1]).toMatchObject({ content: "First.\n\nSecond.", name: "narrator", sourceMessageId: "a-1" });
    const parts = result[2]!.content as Array<Record<string, unknown>>;
    expect(parts[0]).toEqual({ type: "text", text: "Before.\n\nAfter." });
    expect(parts[1]).toBe(imagePart);
    expect(String(assistant.content)).toContain("inlay_illustrator");
  });
});
