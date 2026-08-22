/**
 * Unit tests for the Lumiverse HTTP client. fetch is fully mocked; no live
 * network calls are made. Credentials never appear in error messages.
 */

import { describe, expect, test } from "bun:test";
import { LumiverseClient, LumiverseError } from "./client.js";

type Call = { url: string; init: RequestInit };

function mockFetch(calls: Call[], handler: (url: string, init: RequestInit, index: number) => Response): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {}, calls.length - 1);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const SECRET = "super-secret-password-42";

function makeClient(calls: Call[], handler: (url: string, init: RequestInit, index: number) => Response): LumiverseClient {
  return new LumiverseClient({
    baseUrl: "http://lumiverse.test:7860",
    username: "tester",
    password: SECRET,
    fetchFn: mockFetch(calls, handler)
  });
}

describe("LumiverseClient authentication", () => {
  test("authenticates through the better-auth.session_token Set-Cookie", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url, _init, index) => {
      if (url.endsWith("/api/auth/sign-in/email")) {
        return jsonResponse({ user: { id: "u1" } }, 200, {
          "set-cookie": "better-auth.session_token=cookie-token-1; Path=/; HttpOnly"
        });
      }
      if (url.endsWith("/api/v1/settings")) return jsonResponse({ ok: true });
      return jsonResponse({}, 404);
    });

    await client.authenticate();
    await client.settings();

    const authCall = calls[0];
    expect(authCall.url).toBe("http://lumiverse.test:7860/api/auth/sign-in/email");
    const body = JSON.parse(String(authCall.init.body));
    expect(body.email).toBe("tester@lumiverse.local");
    expect(body.password).toBe(SECRET);

    const settingsCall = calls[1];
    expect(settingsCall.init.headers).toMatchObject({ Cookie: "better-auth.session_token=cookie-token-1" });
    expect(client.hasSession).toBe(true);
  });

  test("falls back to the username as-is and then to a body token", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url, init) => {
      if (url.endsWith("/api/auth/sign-in/email")) {
        const body = JSON.parse(String(init.body)) as { email: string };
        if (body.email === "tester@lumiverse.local") return jsonResponse({}, 401);
        return jsonResponse({ token: "body-token-9" });
      }
      return jsonResponse({}, 404);
    });

    await client.authenticate();
    const authBodies = calls
      .filter((entry) => entry.url.endsWith("/api/auth/sign-in/email"))
      .map((entry) => JSON.parse(String(entry.init.body)) as { email: string });
    expect(authBodies.map((entry) => entry.email)).toEqual(["tester@lumiverse.local", "tester"]);
    expect(client.hasSession).toBe(true);
  });

  test("sends the body token as cookie and bearer on subsequent requests", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url, _init, index) => {
      if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({ token: "body-token-9" });
      if (url.endsWith("/api/v1/settings") && index === 1) return jsonResponse({ ok: true });
      return jsonResponse({}, 404);
    });

    await client.authenticate();
    await client.settings();

    const settingsCall = calls[1];
    expect(settingsCall.init.headers).toMatchObject({
      Cookie: "better-auth.session_token=body-token-9",
      Authorization: "Bearer body-token-9"
    });
  });

  test("authentication failure never leaks the password", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, () => jsonResponse({ error: "invalid credentials" }, 401));

    await expect(client.authenticate()).rejects.toThrow(LumiverseError);
    try {
      await client.authenticate();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(SECRET);
      expect(message).toContain("tester@lumiverse.local");
      expect(message).toContain("tester");
    }
  });

  test("re-authenticates once after a stale session 401", async () => {
    const calls: Call[] = [];
    let settingsAttempts = 0;
    const client = makeClient(calls, (url, _init, index) => {
      if (url.endsWith("/api/auth/sign-in/email")) {
        return jsonResponse({ user: { id: "u1" } }, 200, {
          "set-cookie": "better-auth.session_token=first; Path=/; HttpOnly"
        });
      }
      if (url.endsWith("/api/v1/settings")) {
        settingsAttempts += 1;
        if (settingsAttempts === 1) return jsonResponse({}, 401);
        return jsonResponse({ ok: true });
      }
      return jsonResponse({}, 404);
    });

    await client.authenticate();
    await expect(client.settings()).resolves.toEqual({ ok: true });
    expect(settingsAttempts).toBe(2);
    const authCalls = calls.filter((entry) => entry.url.endsWith("/api/auth/sign-in/email"));
    expect(authCalls.length).toBe(2);
  });
});

describe("LumiverseClient API requests", () => {
  test("lists characters with search/limit/offset query parameters", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url) => {
      if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({ token: "t" });
      if (url.includes("/api/v1/characters/summary")) {
        return jsonResponse({ data: [{ id: "c1", name: "Mira", tags: ["sci-fi"], updated_at: 123, image_id: "img1" }], total: 1, limit: 10, offset: 0 });
      }
      return jsonResponse({}, 404);
    });

    const page = await client.listCharacters({ search: "mira", limit: 10, offset: 0 });
    expect(page.data[0]).toMatchObject({ id: "c1", name: "Mira" });
    const listCall = calls.find((entry) => entry.url.includes("/characters/summary"))!;
    const url = new URL(listCall.url);
    expect(url.searchParams.get("search")).toBe("mira");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("0");
  });

  test("creates a chat with character_id and optional name", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url) => {
      if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({ token: "t" });
      if (url.endsWith("/api/v1/chats")) return jsonResponse({ id: "chat1", character_id: "c1", name: "Test", metadata: {}, created_at: 1, updated_at: 2 });
      return jsonResponse({}, 404);
    });

    const chat = await client.createChat({ character_id: "c1", name: "Test chat" });
    expect(chat.id).toBe("chat1");
    const createCall = calls.find((entry) => entry.url.endsWith("/api/v1/chats"))!;
    expect(JSON.parse(String(createCall.init.body))).toEqual({ character_id: "c1", name: "Test chat" });
  });

  test("creates a production-shaped user message", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url) => {
      if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({ token: "t" });
      if (url.endsWith("/api/v1/chats/chat1/messages")) {
        return jsonResponse({ id: "m1", chat_id: "chat1", index_in_chat: 3, is_user: true, name: "Test User", content: "hi", send_date: 1, swipe_id: 0, swipes: ["hi"], swipe_dates: [1], extra: {}, parent_message_id: null, created_at: 1 });
      }
      return jsonResponse({}, 404);
    });

    const message = await client.createMessage("chat1", { is_user: true, name: "Test User", content: "hi" });
    expect(message.id).toBe("m1");
    const createCall = calls.find((entry) => entry.url.endsWith("/api/v1/chats/chat1/messages"))!;
    expect(JSON.parse(String(createCall.init.body))).toEqual({ is_user: true, name: "Test User", content: "hi" });
  });

  test("starts a normal generation with the expected body", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url) => {
      if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({ token: "t" });
      if (url.endsWith("/api/v1/generate")) return jsonResponse({ generationId: "g1" });
      return jsonResponse({}, 404);
    });

    const result = await client.startGeneration({ chat_id: "chat1", user_input: "Hello", generation_type: "normal" });
    expect(result.generationId).toBe("g1");
    const generateCall = calls.find((entry) => entry.url.endsWith("/api/v1/generate"))!;
    expect(JSON.parse(String(generateCall.init.body))).toEqual({ chat_id: "chat1", user_input: "Hello", generation_type: "normal" });
  });

  test("calls the dry-run endpoint without touching /generate", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url) => {
      if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({ token: "t" });
      if (url.endsWith("/api/v1/generate/dry-run")) return jsonResponse({ model: "m", provider: "p", messages: [], parameters: {} });
      return jsonResponse({}, 404);
    });

    const result = await client.dryRun({ chat_id: "chat1", user_input: "Hello", generation_type: "normal" });
    expect(result.model).toBe("m");
    expect(calls.some((entry) => entry.url.endsWith("/api/v1/generate") && !entry.url.endsWith("/dry-run"))).toBe(false);
  });

  test("polls generation status with known offsets", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url) => {
      if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({ token: "t" });
      if (url.includes("/api/v1/generate/status/chat1")) {
        return jsonResponse({ active: true, generationId: "g1", status: "streaming", content: "abc" });
      }
      return jsonResponse({}, 404);
    });

    const status = await client.generationStatus("chat1", { generationId: "g1", contentLen: 3, reasoningLen: 0 });
    expect(status.status).toBe("streaming");
    const statusCall = calls.find((entry) => entry.url.includes("/generate/status/chat1"))!;
    const url = new URL(statusCall.url);
    expect(url.searchParams.get("generationId")).toBe("g1");
    expect(url.searchParams.get("contentLen")).toBe("3");
    expect(url.searchParams.get("reasoningLen")).toBe("0");
  });

  test("falls back to the tail list when the single-message GET route is missing", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url) => {
      if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({ token: "t" });
      if (/\/messages\/[^?]+$/.test(url)) return new Response("", { status: 200 }); // empty body -> null
      if (url.includes("/api/v1/chats/chat1/messages")) {
        return jsonResponse({ data: [{ id: "m1", chat_id: "chat1", index_in_chat: 4, is_user: false, name: "Mira", content: "hi", send_date: 1, swipe_id: 0, swipes: ["hi"], swipe_dates: [1], extra: {}, parent_message_id: null, created_at: 1 }], total: 1, limit: 50, offset: 0 });
      }
      return jsonResponse({}, 404);
    });

    const message = await client.getMessage("chat1", "m1");
    expect(message.id).toBe("m1");
    expect(message.content).toBe("hi");
    expect(calls.some((entry) => entry.url.includes("/messages?limit=50"))).toBe(true);
  });

  test("throws a clear error when the message is absent from the tail list too", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url) => {
      if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({ token: "t" });
      if (/\/messages\/[^?]+$/.test(url)) return new Response("", { status: 200 });
      if (url.includes("/api/v1/chats/chat1/messages")) {
        return jsonResponse({ data: [], total: 0, limit: 50, offset: 0 });
      }
      return jsonResponse({}, 404);
    });

    await expect(client.getMessage("chat1", "ghost")).rejects.toThrow("not found");
  });

  test("surfaces HTTP errors with status and truncated detail", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url) => {
      if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({ token: "t" });
      if (url.includes("/api/v1/characters/c1")) return new Response("boom ".repeat(200), { status: 500 });
      return jsonResponse({}, 404);
    });

    try {
      await client.getCharacter("c1");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LumiverseError);
      const err = error as LumiverseError;
      expect(err.status).toBe(500);
      expect(err.path).toContain("/characters/c1");
      expect(err.message.length).toBeLessThan(500);
      expect(err.message).not.toContain(SECRET);
    }
  });
})


describe("LumiverseClient extension WebSocket bridge", () => {
  test("authenticates, sends a frontend message, and waits for the correlated response", async () => {
    const calls: Call[] = [];
    let socketHeaders: Record<string, string> = {};
    let sent: Record<string, unknown> | null = null;
    const client = new LumiverseClient({
      baseUrl: "http://lumiverse.test:7860",
      username: "tester",
      password: SECRET,
      fetchFn: mockFetch(calls, (url) => {
        if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({}, 200, { "set-cookie": "better-auth.session_token=ws-token; Path=/" });
        return jsonResponse({}, 404);
      }),
      webSocketFactory: (url, headers) => {
        expect(url).toBe("ws://lumiverse.test:7860/api/ws");
        socketHeaders = headers;
        const socket = {
          onopen: null as ((event: any) => unknown) | null,
          onmessage: null as ((event: any) => unknown) | null,
          onerror: null as ((event: any) => unknown) | null,
          onclose: null as ((event: any) => unknown) | null,
          send(data: string) {
            sent = JSON.parse(data) as Record<string, unknown>;
            queueMicrotask(() => {
              socket.onmessage?.({ data: JSON.stringify({
                event: "SPINDLE_FRONTEND_MSG",
                payload: { extensionId: "ext1", data: { type: "reply", requestId: "r1", value: 42 } }
              }) });
            });
          },
          close() {}
        };
        queueMicrotask(() => socket.onmessage?.({ data: JSON.stringify({ event: "CONNECTED", payload: {} }) }));
        return socket;
      }
    });

    const result = await client.extensionMessage<{ type: string; requestId: string; value: number }>(
      "ext1", { type: "query", requestId: "r1" }, { responseType: "reply", requestId: "r1" }
    );
    expect(socketHeaders.Cookie).toBe("better-auth.session_token=ws-token");
    expect(sent as Record<string, unknown> | null).toEqual({ type: "SPINDLE_BACKEND_MSG", extensionId: "ext1", payload: { type: "query", requestId: "r1" } });
    expect(result.value).toBe(42);
  });


  test("status monitor collects extension status events and closes cleanly", async () => {
    const calls: Call[] = [];
    const client = new LumiverseClient({
      baseUrl: "http://lumiverse.test:7860",
      username: "tester",
      password: SECRET,
      fetchFn: mockFetch(calls, (url) => {
        if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({}, 200, { "set-cookie": "better-auth.session_token=ws-token; Path=/" });
        return jsonResponse({}, 404);
      }),
      webSocketFactory: (url, headers) => {
        expect(url).toBe("ws://lumiverse.test:7860/api/ws");
        expect(headers.Cookie).toBe("better-auth.session_token=ws-token");
        const socket = {
          onopen: null as ((event: any) => unknown) | null,
          onmessage: null as ((event: any) => unknown) | null,
          onerror: null as ((event: any) => unknown) | null,
          onclose: null as ((event: any) => unknown) | null,
          closed: false,
          send() {},
          close() { this.closed = true; }
        };
        queueMicrotask(() => {
          socket.onmessage?.({ data: JSON.stringify({ event: "CONNECTED", payload: {} }) });
          socket.onmessage?.({ data: JSON.stringify({ event: "SPINDLE_FRONTEND_MSG", payload: { extensionId: "ext1", data: { type: "status", chatId: "chat1", status: "Generating..." } } }) });
          socket.onmessage?.({ data: JSON.stringify({ event: "SPINDLE_FRONTEND_MSG", payload: { extensionId: "ext1", data: { type: "status", chatId: "chat1", status: "Error", error: "Parser generation failed: truncated." } } }) });
          socket.onmessage?.({ data: JSON.stringify({ event: "SPINDLE_FRONTEND_MSG", payload: { extensionId: "other", data: { type: "status", chatId: "chat1", status: "Error", error: "ignored" } } }) });
        });
        return socket;
      }
    });

    const monitor = await client.openExtensionStatusMonitor("ext1", "chat1", 60_000);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const events = monitor.events();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ status: "Generating...", chatId: "chat1" });
    expect(events[1]).toMatchObject({ status: "Error", error: "Parser generation failed: truncated." });
    monitor.close();
  });
  test("resolves the running Inlay extension by identifier", async () => {
    const calls: Call[] = [];
    const client = makeClient(calls, (url) => {
      if (url.endsWith("/api/auth/sign-in/email")) return jsonResponse({}, 200, { "set-cookie": "better-auth.session_token=t; Path=/" });
      if (url.endsWith("/api/v1/spindle")) return jsonResponse({ extensions: [
        { id: "ext1", identifier: "other", status: "running" },
        { id: "ext2", identifier: "inlay-illustrator", name: "Inlay Illustrator", status: "running" }
      ] });
      return jsonResponse({}, 404);
    });
    expect(await client.resolveExtensionId()).toBe("ext2");
  });
});
