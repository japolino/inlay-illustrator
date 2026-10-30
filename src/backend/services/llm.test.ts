import { describe, expect, test } from "bun:test";
import { normalizeConfig, type InlayConfig } from "../../shared/contract/index.js";
import { createFakeHost } from "../testing/fake-host.js";
import { createLlmService, declaredVisionSupport, extractText, httpStatusOf, omitsTemperature, supportsJsonMode, unsupportedVisionError } from "./llm.js";

function setup(configPatch: Record<string, unknown> = {}) {
  const fake = createFakeHost();
  fake.llmConnections.push(
    { id: "oa", name: "OpenAI", provider: "openai", api_url: "", model: "gpt-x", preset_id: null, is_default: true, has_api_key: true, metadata: {}, reasoning_bindings: null, created_at: 0, updated_at: 0 },
    { id: "cl", name: "Claude", provider: "anthropic", api_url: "", model: "claude-x", preset_id: null, is_default: false, has_api_key: true, metadata: { vision: false }, reasoning_bindings: null, created_at: 0, updated_at: 0 },
  );
  let config: InlayConfig = normalizeConfig(configPatch);
  const sleeps: number[] = [];
  const llm = createLlmService({ host: fake.host, userId: fake.userId, loadConfig: async () => config, sleep: async (ms) => void sleeps.push(ms) });
  return { fake, llm, sleeps, setConfig: (c: Record<string, unknown>) => (config = normalizeConfig(c)) };
}

describe("llm helpers", () => {
  test("json mode support, http status, vision metadata and errors, text extraction", () => {
    expect(supportsJsonMode("openai", "gpt-4o")).toBe(true);
    expect(supportsJsonMode("anthropic", "claude-3")).toBe(false);
    expect(supportsJsonMode("custom", "deepseek-chat")).toBe(true);
    expect(supportsJsonMode("custom", "qwen3-32b")).toBe(true);
    expect(omitsTemperature("claude-opus-5")).toBe(true);
    expect(omitsTemperature("anthropic/claude-sonnet-5-20261001")).toBe(true);
    expect(omitsTemperature("gemini-3.5-flash")).toBe(true);
    expect(omitsTemperature("gemini-2.5-flash")).toBe(false);
    expect(omitsTemperature("gpt-5.6-luna")).toBe(false);
    expect(httpStatusOf(new Error("OpenAI generate failed (429): slow down"))).toBe(429);
    expect(httpStatusOf({ status: 503 })).toBe(503);
    expect(httpStatusOf(new Error("nothing here"))).toBe(0);
    expect(declaredVisionSupport({ capabilities: { vision: true } })).toBe(true);
    expect(declaredVisionSupport({ input_modalities: ["text"] })).toBe(false);
    expect(declaredVisionSupport({})).toBeNull();
    expect(unsupportedVisionError(new Error("OpenAI generate failed (400): This model does not support image input"))).toBe(true);
    expect(unsupportedVisionError(new Error("This model does not support image input"))).toBe(false);
    expect(unsupportedVisionError(new Error("failed (400): Invalid image data: invalid base64"))).toBe(false);
    expect(unsupportedVisionError(new Error("failed (404): No endpoints found that support image input"))).toBe(true);
    expect(unsupportedVisionError(new Error("rate limited"))).toBe(false);
    expect(extractText({ choices: [{ message: { content: [{ type: "text", text: "a" }] } }] })).toBe("a");
    expect(extractText({ content: "b" })).toBe("b");
  });
});

describe("llm service", () => {
  test("raw request: explicit model, connection, reasoning, temperature, JSON mode and lenient parse", async () => {
    const { fake, llm } = setup({ analysis: { reasoning: { mode: "custom", effort: "high" }, temperature: 0.5, maxTokens: 900 } });
    fake.scriptLlm({ content: 'Sure:\n```json\n{"a":1}\n```', finish_reason: "stop", usage: { prompt_tokens: 3 } });
    const result = await llm.complete({ purpose: "t", messages: [{ role: "user", content: "hi" }], responseMode: "json" });
    expect(result).toMatchObject({ parsed: { a: 1 }, connectionId: "oa", model: "gpt-x", attempts: 1, jsonMode: true, usage: { prompt_tokens: 3 } });
    const input = fake.generateCalls[0]!.input;
    expect(fake.generateCalls[0]!.kind).toBe("raw");
    expect(input).toMatchObject({ type: "raw", provider: "openai", model: "gpt-x", connection_id: "oa", reasoning: { source: "custom", apiReasoning: true, effort: "high" }, parameters: { temperature: 0.5, max_tokens: 900, response_format: { type: "json_object" } } });
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  test("JSON mode rejection: resent without response_format, remembered, not a retry", async () => {
    const { fake, llm } = setup({ analysis: { connectionId: "oa", model: "gpt-y" } });
    fake.scriptLlm(new Error("OpenAI generate failed (400): invalid response_format"), { content: "{}" }, { content: "{}" });
    const r1 = await llm.complete({ purpose: "t", messages: [], responseMode: "json", retries: 0 });
    expect(r1.jsonMode).toBe(false);
    expect(r1.attempts).toBe(1);
    await llm.complete({ purpose: "t", messages: [], responseMode: "json" });
    expect((fake.generateCalls[2]!.input.parameters as Record<string, unknown>).response_format).toBeUndefined();
  });

  test("a 400 that doesn't name JSON mode is resent without it once but not remembered; image errors are not JSON mode", async () => {
    const { fake, llm } = setup();
    const responseFormat = (i: number) => (fake.generateCalls[i]!.input.parameters as Record<string, unknown>).response_format;
    fake.scriptLlm(new Error("Google generate failed (400): Request contains an invalid argument."), { content: "{}" }, { content: "{}" });
    expect((await llm.complete({ purpose: "t", messages: [], responseMode: "json", retries: 0 })).jsonMode).toBe(false);
    expect((await llm.complete({ purpose: "t", messages: [], responseMode: "json", retries: 0 })).jsonMode).toBe(true);
    expect(responseFormat(2)).toEqual({ type: "json_object" });

    const messages = [{ role: "user" as const, content: [{ type: "text" as const, text: "look" }, { type: "image" as const, data: "AAAA", mime_type: "image/avif" }] }];
    fake.scriptLlm(new Error("OpenAI generate failed (400): You uploaded an unsupported image. Please make sure your image has of one the following formats: ['png', 'jpeg']."), { content: "{}" });
    const r = await llm.complete({ purpose: "t", messages, responseMode: "json", retries: 0 });
    expect(r).toMatchObject({ imagesDropped: true, jsonMode: true });
    expect(responseFormat(4)).toEqual({ type: "json_object" });
  });

  test("retries retryable errors with a fixed 100 ms delay, stops on non-retryable", async () => {
    const { fake, llm, sleeps } = setup({ runtime: { generationAutoRetryCount: 2 } });
    fake.scriptLlm(new Error("failed (503): overloaded"), { content: "" }, { content: "not json" });
    const retries: number[] = [];
    await expect(llm.complete({ purpose: "t", messages: [], responseMode: "json" }, { onRetry: (i) => retries.push(i.attempt) })).rejects.toMatchObject({ error: { code: "provider-error", detailCode: "ANALYZER_JSON_PARSE" } });
    expect(fake.generateCalls).toHaveLength(3);
    expect(sleeps).toEqual([100, 100]);
    expect(retries).toEqual([1, 2]);
    fake.scriptLlm(new Error("failed (401): bad key"));
    await expect(llm.complete({ purpose: "t", messages: [], responseMode: "json" })).rejects.toMatchObject({ error: { code: "permission-denied", detailCode: "ANALYZER_HTTP" } });
    expect(fake.generateCalls).toHaveLength(4);
  });

  test("an empty reply cut off by length is an empty response and is retried (AM checks the finish reason only for DeepSeek)", async () => {
    const { fake, llm } = setup({ runtime: { generationAutoRetryCount: 1 } });
    fake.scriptLlm({ content: "", finish_reason: "length" }, { content: '{"ok":1}' });
    expect(await llm.complete({ purpose: "t", messages: [], responseMode: "json" })).toMatchObject({ parsed: { ok: 1 }, attempts: 2 });
  });

  test("own timeout -> ANALYZER_TIMEOUT; caller abort -> AbortError without retry", async () => {
    const { fake, llm } = setup({ analysis: { timeoutMs: 1000 }, runtime: { generationAutoRetryCount: 0 } });
    fake.scriptLlm(() => new Promise(() => undefined));
    await expect(llm.complete({ purpose: "t", messages: [], responseMode: "text" })).rejects.toMatchObject({ error: { code: "timeout", detailCode: "ANALYZER_TIMEOUT" } });
    const controller = new AbortController();
    fake.scriptLlm(() => new Promise(() => undefined));
    const pending = llm.complete({ purpose: "t", messages: [], responseMode: "text", retries: 3 }, { signal: controller.signal });
    await new Promise((r) => setTimeout(r, 5));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.generateCalls).toHaveLength(2);
  }, 5000);

  test("vision: declared unsupported drops images up front; image error falls back to text-only", async () => {
    const { fake, llm } = setup({ analysis: { connectionId: "cl" } });
    const messages = [{ role: "user" as const, content: [{ type: "text" as const, text: "look" }, { type: "image" as const, data: "AAAA", mime_type: "image/png" }] }];
    fake.scriptLlm({ content: "{}" });
    const r = await llm.complete({ purpose: "t", messages, responseMode: "json" });
    expect(r.imagesDropped).toBe(true);
    expect((fake.generateCalls[0]!.input.messages as Array<{ content: unknown }>)[0]!.content).toBe("look");
    expect(await llm.supportsVision()).toBe(false);
    await expect(llm.complete({ purpose: "t", messages, responseMode: "json", visionFallback: "fail" })).rejects.toMatchObject({ error: { code: "unsupported" } });

    const s2 = setup();
    s2.fake.scriptLlm(new Error("failed (400): image input is not supported for this model"), { content: "{}" });
    const r2 = await s2.llm.complete({ purpose: "t", messages, responseMode: "json" });
    expect(r2.imagesDropped).toBe(true);
    expect(s2.fake.generateCalls).toHaveLength(2);
    expect(await s2.llm.supportsVision()).toBe(false);
  });

  test("supportsVision rejects with the connection error instead of answering 'no vision'", async () => {
    await expect(setup({ analysis: { connectionId: "zz" } }).llm.supportsVision()).rejects.toMatchObject({ error: { code: "bad-request", detailCode: "ANALYZER_CONNECTION_MISSING" } });
    const { fake, llm } = setup({ analysis: { connectionId: "oa" } });
    const get = fake.host.connections.get;
    fake.host.connections.get = (async () => {
      throw new Error("host socket reset");
    }) as typeof get;
    await expect(llm.supportsVision()).rejects.toMatchObject({ error: { code: "provider-error" } });
    fake.host.connections.get = get;
    expect(await llm.supportsVision()).toBe(true);
  });

  test("analyzerClient throws engine AnalyzerClientError with code and does not retry by default", async () => {
    const { fake, llm } = setup();
    fake.scriptLlm({ content: "nope" });
    const client = llm.analyzerClient({ purpose: "chat-analyzer" });
    const error = await client.complete({}, [{ role: "user", content: [{ type: "text", text: "x" }, { type: "image", data: "data:image/png;base64,QQ==", mimeType: "image/png" }] }]).catch((e) => e);
    expect(error).toMatchObject({ name: "AnalyzerClientError", code: "ANALYZER_JSON_PARSE", analyzerRaw: "nope" });
    expect(fake.generateCalls).toHaveLength(1);
    const sent = (fake.generateCalls[0]!.input.messages as Array<{ content: Array<Record<string, unknown>> }>)[0]!.content;
    expect(sent[1]).toEqual({ type: "image", data: "QQ==", mime_type: "image/png" });
    fake.scriptLlm({ content: "plain" });
    expect(await client.complete({}, [{ role: "user", content: "x" }], { responseMode: "text" })).toMatchObject({ raw: "plain", parsed: "plain" });
  });

  test("analyzerClient raises network failures as a TypeError (AM nativeFetch), which the engine retry checks retry", async () => {
    const { fake, llm } = setup();
    fake.scriptLlm(new TypeError("fetch failed"));
    const error = await llm.analyzerClient({ purpose: "chat-analyzer" }).complete({}, [{ role: "user", content: "x" }]).catch((e) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toBe("fetch failed");
    expect(error.cause).toMatchObject({ code: "ANALYZER_NETWORK" });
  });

  test("connections, models, message test", async () => {
    const { fake, llm } = setup();
    expect((await llm.listConnections()).map((c) => [c.id, c.isDefault])).toEqual([["oa", true], ["cl", false]]);
    expect(await llm.listModels("cl")).toEqual([{ id: "claude-x", label: "claude-x" }]);
    fake.scriptLlm({ content: "Hello!" });
    expect(await llm.testMessage()).toMatchObject({ ok: true, reply: "Hello!" });
    expect((fake.generateCalls[0]!.input.messages as Array<{ content: string }>)[0]!.content).toBe("Hello. Please greet me briefly.");
    fake.scriptLlm(new Error("failed (500): down"));
    expect(await llm.testMessage("hi")).toMatchObject({ ok: false, error: { code: "provider-error" } });
    const missing = setup({ analysis: { connectionId: "zz" } });
    await expect(missing.llm.complete({ purpose: "t", messages: [], responseMode: "text" })).rejects.toMatchObject({ error: { code: "bad-request", detailCode: "ANALYZER_CONNECTION_MISSING" } });
  });

  test("model list comes from connections.getModels without the fetch bridge; errors keep the connection model", async () => {
    const { fake } = setup();
    fake.llmModels.oa = [{ id: "gpt-x", label: "GPT X" }, { id: "gpt-y", label: "GPT Y" }];
    const bridged: string[] = [];
    const llm = createLlmService({ host: fake.host, userId: fake.userId, loadConfig: async () => normalizeConfig({}), getJson: async (url) => {
      bridged.push(url);
      throw new Error("bridge used");
    } });
    expect(await llm.listModels("oa")).toEqual([{ id: "gpt-x", label: "gpt-x" }, { id: "gpt-y", label: "GPT Y" }]);
    fake.llmModels.oa = new Error("Connection not found");
    expect(await llm.listModels("oa")).toEqual([{ id: "gpt-x", label: "gpt-x" }]);
    expect(bridged).toEqual([]);
  });

  test("model list falls back to the fetch bridge on hosts without connections.getModels", async () => {
    const { fake } = setup();
    delete fake.host.connections.getModels;
    const bridged: string[] = [];
    const getJson = async <T,>(url: string) => {
      bridged.push(url);
      return { models: ["gpt-x", "gpt-y"], model_labels: { "gpt-y": "GPT Y" } } as T;
    };
    const llm = createLlmService({ host: fake.host, userId: fake.userId, loadConfig: async () => normalizeConfig({}), getJson });
    expect(await llm.listModels("oa")).toEqual([{ id: "gpt-x", label: "gpt-x" }, { id: "gpt-y", label: "GPT Y" }]);
    expect(bridged).toEqual(["/api/v1/connections/oa/models"]);
  });
});
