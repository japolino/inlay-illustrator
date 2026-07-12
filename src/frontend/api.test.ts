import { afterEach, describe, expect, test } from "bun:test";
import { fetchImageGenerationSettings, fetchParserConnections } from "./api.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubJsonResponse(body: unknown, status = 200): void {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

function stubThrownRequest(): void {
  globalThis.fetch = (async () => {
    throw new Error("request failed");
  }) as unknown as typeof fetch;
}

describe("frontend API fallbacks", () => {
  test("unwraps the image-generation settings envelope", async () => {
    let requestedUrl = "";
    let requestedHeaders: HeadersInit | undefined;
    const settings = {
      promptParserConnectionId: "parser",
      promptParserModel: "parser-model",
      promptParserParameters: { temperature: 0.4 },
      activeImageGenConnectionId: "image",
      model: "image-model",
      parameters: { steps: 24 }
    };
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input);
      requestedHeaders = init?.headers;
      return new Response(JSON.stringify({ value: settings }));
    }) as typeof fetch;

    await expect(fetchImageGenerationSettings()).resolves.toEqual(settings);
    expect(requestedUrl).toBe("/api/v1/settings/imageGeneration");
    expect(requestedHeaders).toEqual({ Accept: "application/json" });
  });

  test("uses an empty settings record when the successful envelope has no value", async () => {
    stubJsonResponse({});

    await expect(fetchImageGenerationSettings()).resolves.toEqual({});
  });

  test("normalizes a direct parser connection array and filters empty IDs", async () => {
    stubJsonResponse([
      { id: 42, name: null, provider: "local", model: undefined },
      { id: "", name: "Empty", provider: "local", model: "ignored" },
      { name: "Missing", provider: "local", model: "ignored" },
      { id: null, name: "Null", provider: "local", model: "ignored" }
    ]);

    await expect(fetchParserConnections()).resolves.toEqual([{
      id: "42",
      name: "",
      provider: "local",
      model: ""
    }]);
  });

  test("normalizes parser connections from a data envelope", async () => {
    stubJsonResponse({
      data: [
        { id: "remote", name: "Remote parser", provider: "openai", model: "parser-model" },
        { id: 0, name: "Invalid", provider: "", model: "" }
      ]
    });

    await expect(fetchParserConnections()).resolves.toEqual([{
      id: "remote",
      name: "Remote parser",
      provider: "openai",
      model: "parser-model"
    }]);
  });

  test("returns null or an empty list for unsuccessful HTTP responses", async () => {
    stubJsonResponse({ error: "unavailable" }, 503);
    await expect(fetchImageGenerationSettings()).resolves.toBeNull();

    stubJsonResponse({ error: "unavailable" }, 503);
    await expect(fetchParserConnections()).resolves.toEqual([]);
  });

  test("returns null or an empty list when requests throw", async () => {
    stubThrownRequest();
    await expect(fetchImageGenerationSettings()).resolves.toBeNull();

    stubThrownRequest();
    await expect(fetchParserConnections()).resolves.toEqual([]);
  });
});
