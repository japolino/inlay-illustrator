import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildLlmParameters,
  callLlm,
  extractFinishReason,
  extractText,
  extractUsage,
  resetLlmClientCaches,
  resolveLlmConnection
} from "./llm-client.js";
import type { LlmConnection } from "./types.js";

type RawRequest = Record<string, any>;
const root = globalThis as typeof globalThis & { spindle: unknown };
let requests: RawRequest[];
let respond: (request: RawRequest) => Promise<unknown>;
let connectionGets: number;

const openai: LlmConnection = { id: "c1", name: "OpenAI", provider: "openai", model: "gpt-x" };
const claude: LlmConnection = { id: "c2", name: "Claude", provider: "anthropic", model: "claude-x" };

beforeEach(() => {
  resetLlmClientCaches();
  requests = [];
  connectionGets = 0;
  respond = async () => ({ content: "ok", finish_reason: "stop", usage: { prompt_tokens: 3, completion_tokens: 1 } });
  root.spindle = {
    generate: { raw: async (request: RawRequest) => { requests.push(request); return respond(request); } },
    connections: {
      get: async (id: string) => { connectionGets += 1; return id === "c1" ? { ...openai, metadata: { a: 1 } } : null; },
      list: async () => [openai]
    },
    log: { info() {}, warn() {}, error() {} }
  };
});
afterEach(() => { resetLlmClientCaches(); });

describe("llm client", () => {
  test("sends raw requests with the explicit model, reasoning off and caller parameters", async () => {
    const result = await callLlm({ connection: claude, model: "claude-override", messages: [{ role: "user", content: "hi" }], parameters: { temperature: 0 } });
    expect(result).toEqual({ text: "ok", usage: { prompt_tokens: 3, completion_tokens: 1 }, finishReason: "stop", structuredOutput: false });
    expect(requests[0]).toMatchObject({
      type: "raw", provider: "anthropic", model: "claude-override", connection_id: "c2",
      parameters: { temperature: 0 }, reasoning: { source: "off" }
    });
    expect(requests[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  test("injects JSON mode only for supporting providers", () => {
    expect(buildLlmParameters(openai, "gpt-x", {}, true)).toEqual({ parameters: { response_format: { type: "json_object" } }, injectedStructuredOutput: true });
    expect(buildLlmParameters(claude, "claude-x", {}, true).injectedStructuredOutput).toBe(false);
    expect(buildLlmParameters(openai, "gpt-x", { response_format: { type: "text" } }, true).injectedStructuredOutput).toBe(false);
  });

  test("retries once without JSON mode on a 400 and remembers the capability", async () => {
    respond = async (request) => {
      if (request.parameters.response_format) throw new Error("400 invalid response_format");
      return { content: "{}" };
    };
    const result = await callLlm({ connection: openai, messages: [], json: true });
    expect(result.structuredOutput).toBe(false);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.parameters.response_format).toBeUndefined();
    await callLlm({ connection: openai, messages: [], json: true });
    expect(requests).toHaveLength(3);
    expect(requests[2]!.parameters.response_format).toBeUndefined();
  });

  test("wraps provider failures and maps caller aborts to AbortError", async () => {
    respond = async () => { throw new Error("boom"); };
    await expect(callLlm({ connection: claude, messages: [] })).rejects.toThrow("LLM generation failed: boom");
    const controller = new AbortController();
    respond = (request) => new Promise((_resolve, reject) => {
      (request.signal as AbortSignal).addEventListener("abort", () => reject(new Error("aborted")));
    });
    const pending = callLlm({ connection: claude, messages: [], signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  test("applies its own timeout", async () => {
    respond = (request) => new Promise((_resolve, reject) => {
      (request.signal as AbortSignal).addEventListener("abort", () => reject((request.signal as AbortSignal).reason));
    });
    await expect(callLlm({ connection: claude, messages: [], timeoutMs: 5 })).rejects.toThrow("timed out after 5 ms");
  });

  test("rejects an empty truncated response", async () => {
    respond = async () => ({ content: "", finish_reason: "length" });
    await expect(callLlm({ connection: claude, messages: [] })).rejects.toThrow("truncated");
  });

  test("resolves and caches connections", async () => {
    await expect(resolveLlmConnection("", "u")).rejects.toThrow("Select an LLM connection");
    expect(await resolveLlmConnection("c1", "u")).toMatchObject({ id: "c1", metadata: { a: 1 } });
    await resolveLlmConnection("c1", "u");
    expect(connectionGets).toBe(1);
    await expect(resolveLlmConnection("missing", "u")).rejects.toThrow("not found");
  });

  test("extracts text, usage and finish reason from host result shapes", () => {
    expect(extractText("plain")).toBe("plain");
    expect(extractText({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] })).toBe("a\nb");
    expect(extractText({ choices: [{ message: { content: "c" } }] })).toBe("c");
    expect(extractUsage({ usage: { total_tokens: 5, prompt_tokens_details: { cached_tokens: 2 } } })).toEqual({ total_tokens: 5, cached_tokens: 2 });
    expect(extractFinishReason({ choices: [{ finish_reason: "length" }] })).toBe("length");
  });
});
